from __future__ import annotations

import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import event, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.api.routes import quizzes, topics
from app.core.errors import AppError
from app.models.chat import ChatMessage
from app.models.course import Course
from app.models.document import Document
from app.models.plan import StudyPlan
from app.models.mastery import TopicMastery
from app.models.quiz import Quiz, QuizAttempt
from app.models.topic import Topic
from app.models.user import User
from app.schemas.chat import AnswerReply, ChatIn
from app.schemas.planner import PlanIn
from app.schemas.quiz import AttemptIn, QuizCreateIn
from app.services.agent import dispatcher
from app.services.planner import csp
from app.services.quiz import generator
from app.schemas.topic import TopicIn
from app.services.quiz.scorer import score_attempt


def _seed(db):
    user = User(email="transactions@bmu.edu.in", name="Learner", password_hash="unused")
    db.add(user)
    db.flush()
    course = Course(user_id=user.id)
    db.add(course)
    db.flush()
    first = Topic(course_id=course.id, name="A")
    second = Topic(course_id=course.id, name="B")
    db.add_all([first, second])
    db.flush()
    quiz = Quiz(
        user_id=user.id, kind="quiz", difficulty="medium", topic_ids=[str(first.id)],
        items=[{"id": "one", "topic_id": str(first.id), "correct_index": 0}],
    )
    db.add(quiz)
    db.commit()
    return user, course, first, second, quiz


def _answers():
    return AttemptIn(answers=[{"item_id": "one", "selected_index": 0}])


def test_scoring_is_not_committed_until_caller_commits(db):
    user, _, _, _, quiz = _seed(db)
    result = score_attempt(user, quiz, _answers(), db)
    db.rollback()
    assert db.get(QuizAttempt, result.attempt_id) is None


@pytest.mark.parametrize("stage", ["mastery", "recommendations"])
@pytest.mark.parametrize("existing", [False, True])
def test_failed_submission_rolls_back_attempt_and_mastery(db, monkeypatch, stage, existing):
    user, _, first, _, quiz = _seed(db)
    if existing:
        db.add(TopicMastery(user_id=user.id, topic_id=first.id, mastery=40, attempts=1, last_score=40))
        db.commit()
    user_id, topic_id = user.id, first.id
    real_apply = quizzes.apply_attempt

    def fail_mastery(db, user, results):
        real_apply(db, user, results)
        raise AppError("injected_failure", "Mastery failed", 503)

    def fail_recommendations(db, user):
        raise AppError("injected_failure", "Recommendations failed", 503)

    monkeypatch.setattr(
        quizzes, "apply_attempt" if stage == "mastery" else "recommendations_for",
        fail_mastery if stage == "mastery" else fail_recommendations,
    )
    with pytest.raises(AppError, match="failed"):
        quizzes.submit_attempt(quiz.id, _answers(), db, user)

    # Inspect immediately: the route itself must rollback, not just session teardown.
    assert db.scalars(select(QuizAttempt)).all() == []
    row = db.get(TopicMastery, (user_id, topic_id))
    if existing:
        assert (row.mastery, row.attempts, row.last_score) == (40, 1, 40)
    else:
        assert row is None


def test_successful_submission_commits_attempt_and_mastery_once(db):
    user, _, first, _, quiz = _seed(db)
    commits = []
    event.listen(db, "after_commit", lambda session: commits.append(True))
    result = quizzes.submit_attempt(quiz.id, _answers(), db, user)
    db.rollback()

    assert len(commits) == 1
    assert db.get(QuizAttempt, result.attempt_id) is not None
    row = db.get(TopicMastery, (user.id, first.id))
    assert (row.mastery, row.attempts, row.last_score) == (100, 1, 100)


def _trace(db):
    statements = []
    event.listen(
        db, "do_orm_execute",
        lambda state: statements.append(str(state.statement.compile(dialect=postgresql.dialect()))),
    )
    return statements


def test_submission_locks_user_before_reading_quiz(db):
    user, _, _, _, quiz = _seed(db)
    quiz_id = quiz.id
    db.expunge(quiz)
    statements = _trace(db)
    quizzes.submit_attempt(quiz_id, _answers(), db, user)

    lock = next((i for i, sql in enumerate(statements) if "FROM users" in sql and "FOR UPDATE" in sql), None)
    quiz_read = next(i for i, sql in enumerate(statements) if "FROM quizzes" in sql)
    assert lock is not None and lock < quiz_read


@pytest.mark.parametrize("operation", ["create", "update", "delete"])
def test_topic_writers_lock_user_then_course_before_validation_reads(db, operation):
    user, _, first, _, _ = _seed(db)
    statements = _trace(db)
    if operation == "create":
        topics.create_topic(TopicIn(name="C"), db, user)
    elif operation == "update":
        topics.update_topic(first.id, TopicIn(name="Renamed"), db, user)
    else:
        topics.delete_topic(first.id, db, user)

    locked = [(i, sql) for i, sql in enumerate(statements) if "FOR UPDATE" in sql]
    assert len(locked) >= 2
    assert "FROM users" in locked[0][1]
    assert "FROM courses" in locked[1][1]
    assert all(i > locked[1][0] for i, sql in enumerate(statements) if "FROM topics" in sql)


def test_topic_update_checks_fresh_prerequisite_graph(db):
    user, _, first, second, _ = _seed(db)
    assert first.prerequisites == []
    assert second.prerequisites == []
    with Session(db.get_bind()) as peer:
        peer.get(Topic, second.id).prerequisites = [peer.get(Topic, first.id)]
        peer.commit()

    with pytest.raises(AppError) as error:
        topics.update_topic(first.id, TopicIn(name="A", prerequisite_ids=[second.id]), db, user)
    assert error.value.status_code == 422
    db.rollback()
    assert db.get(Topic, first.id).prerequisites == []


@pytest.mark.parametrize("invalid_reference", ["missing_item", "foreign_item", "missing_selected"])
def test_outdated_or_foreign_quiz_topics_are_rejected_before_scoring(db, invalid_reference):
    user, _, first, _, quiz = _seed(db)
    if invalid_reference == "foreign_item":
        other = User(email="other@bmu.edu.in", name="Other", password_hash="unused")
        db.add(other)
        db.flush()
        other_course = Course(user_id=other.id)
        db.add(other_course)
        db.flush()
        foreign = Topic(course_id=other_course.id, name="Foreign")
        db.add(foreign)
        db.flush()
        invalid_id = foreign.id
    else:
        invalid_id = uuid.uuid4()
    if invalid_reference == "missing_selected":
        quiz.topic_ids = [str(first.id), str(invalid_id)]
    else:
        quiz.items = [{"id": "one", "topic_id": str(invalid_id), "correct_index": 0}]
    db.commit()

    with pytest.raises(AppError) as error:
        quizzes.submit_attempt(quiz.id, _answers(), db, user)
    assert error.value.status_code == 422
    assert db.scalars(select(QuizAttempt)).all() == []


def _patch_quiz_generation(monkeypatch, topic):
    monkeypatch.setattr(generator, "_collect", lambda user_id, topics: ([topic], []))
    monkeypatch.setattr(generator, "_generate_items", lambda *args: [{
        "id": "generated", "topic_id": str(topic.id), "question": "What is A?",
        "options": ["A", "B", "C", "D"], "correct_index": 0,
    }])


def test_chat_locks_owner_before_reading_material(db, monkeypatch):
    user, _, _, _, _ = _seed(db)
    statements = _trace(db)

    def answer(user_id, message):
        assert any("FROM users" in sql and "FOR UPDATE" in sql for sql in statements)
        return AnswerReply(text="Captured material", grounded=True)

    monkeypatch.setattr(dispatcher, "answer", answer)
    dispatcher.dispatch(user, ChatIn(message="Explain A", intent="rag"), db)
    user_lock = next(i for i, sql in enumerate(statements) if "FROM users" in sql and "FOR UPDATE" in sql)
    course_read = next(i for i, sql in enumerate(statements) if "FROM courses" in sql)
    assert user_lock < course_read


def test_quiz_generation_locks_owner_before_retrieval_and_defers_commit(db, monkeypatch):
    user, _, first, _, _ = _seed(db)
    _patch_quiz_generation(monkeypatch, first)
    statements = _trace(db)
    result = generator.create_quiz(user, QuizCreateIn(), db)
    db.rollback()

    assert db.get(Quiz, result.id) is None
    owner_lock = next((i for i, sql in enumerate(statements) if "FROM users" in sql and "FOR UPDATE" in sql), None)
    topic_read = next(i for i, sql in enumerate(statements) if "FROM topics" in sql)
    assert owner_lock is not None and owner_lock < topic_read


def test_plan_generation_locks_owner_and_defers_commit(db):
    user, _, _, _, _ = _seed(db)
    statements = _trace(db)
    result = csp.create_plan(db, user, PlanIn(exam_date=date.today() + timedelta(days=2)))
    db.rollback()

    assert db.get(StudyPlan, result.id) is None
    owner_lock = next((i for i, sql in enumerate(statements) if "FROM users" in sql and "FOR UPDATE" in sql), None)
    topic_read = next(i for i, sql in enumerate(statements) if "FROM topics" in sql)
    assert owner_lock is not None and owner_lock < topic_read


@pytest.mark.parametrize("intent", ["quiz", "planner"])
def test_generated_chat_reply_has_one_publication_commit(db, monkeypatch, intent):
    user, course, first, _, _ = _seed(db)
    course.exam_date = date.today() + timedelta(days=2)
    db.commit()
    _patch_quiz_generation(monkeypatch, first)
    commits = []
    event.listen(db, "after_commit", lambda session: commits.append(True))

    dispatcher.dispatch(user, ChatIn(message="Create my revision", intent=intent), db)

    assert len(commits) == 1
    assert len(db.scalars(select(ChatMessage)).all()) == 2


def test_manual_extraction_locks_owner_and_course_before_reading_handouts(db, monkeypatch):
    user, course, _, _, _ = _seed(db)
    db.add(Document(user_id=user.id, course_id=course.id, filename="handout.txt", doc_type="handout", status="ready"))
    db.commit()
    statements = _trace(db)
    monkeypatch.setattr(topics, "parse_document", lambda path: [SimpleNamespace(text="Extractable handout")])
    monkeypatch.setattr(topics, "extract_topics", lambda text: [])

    topics.extract_from_handouts(db, user)

    locked = [(i, sql) for i, sql in enumerate(statements) if "FOR UPDATE" in sql]
    assert len(locked) >= 2
    assert "FROM users" in locked[0][1]
    assert "FROM courses" in locked[1][1]
    document_read = next(i for i, sql in enumerate(statements) if "FROM documents" in sql)
    assert locked[1][0] < document_read
