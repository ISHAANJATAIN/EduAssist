from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.course import Course
from app.models.mastery import TopicMastery
from app.models.topic import Topic
from app.models.user import User
from app.services.recommender.rules import recommendations_for


def _seed(db: Session) -> tuple[User, Topic, Topic, Topic]:
    user = User(email="rules@bmu.edu.in", name="Rules", password_hash="x")
    db.add(user)
    db.flush()
    course = Course(user_id=user.id, name="Machine Learning")
    db.add(course)
    db.flush()

    calculus = Topic(course_id=course.id, name="Calculus")
    backprop = Topic(course_id=course.id, name="Backpropagation")
    metrics = Topic(course_id=course.id, name="Evaluation metrics")
    db.add_all([calculus, backprop, metrics])
    db.flush()
    backprop.prerequisites = [calculus]
    db.commit()
    return user, calculus, backprop, metrics


def _mastery(
    db: Session,
    user: User,
    topic: Topic,
    mastery: float,
    attempts: int,
    last_score: float,
) -> None:
    db.add(
        TopicMastery(
            user_id=user.id,
            topic_id=topic.id,
            mastery=mastery,
            attempts=attempts,
            last_score=last_score,
        )
    )
    db.commit()


def _by_name(recommendations) -> dict[str, object]:
    return {item.topic_name: item for item in recommendations}


def test_untested_topics_ask_for_a_first_quiz(db: Session) -> None:
    user, *_ = _seed(db)

    recommendations = recommendations_for(db, user)

    assert [item.topic_name for item in recommendations] == [
        "Backpropagation",
        "Calculus",
        "Evaluation metrics",
    ]
    assert {item.action for item in recommendations} == {"take_quiz"}
    assert {item.rule_id for item in recommendations} == {"R2"}


def test_weak_topic_after_two_attempts_is_revised(db: Session) -> None:
    user, calculus, _, _ = _seed(db)
    _mastery(db, user, calculus, mastery=30.0, attempts=2, last_score=30.0)

    recommendations = recommendations_for(db, user)
    calculus_recommendation = _by_name(recommendations)["Calculus"]

    assert calculus_recommendation.action == "revise"
    assert calculus_recommendation.rule_id == "R1"
    assert calculus_recommendation.reason == (
        "Last score was 30% after 2 attempts. Re-read the material and try again."
    )


def test_weak_prerequisite_takes_precedence(db: Session) -> None:
    user, calculus, backprop, _ = _seed(db)
    _mastery(db, user, calculus, mastery=30.0, attempts=2, last_score=30.0)
    _mastery(db, user, backprop, mastery=90.0, attempts=3, last_score=90.0)

    recommendations = recommendations_for(db, user)
    by_name = _by_name(recommendations)

    assert [item.action for item in recommendations] == [
        "prerequisite_first",
        "revise",
        "take_quiz",
    ]
    assert by_name["Backpropagation"].rule_id == "R3"
    assert by_name["Backpropagation"].reason == (
        "Calculus is still weak — revise it before Backpropagation."
    )
    assert by_name["Calculus"].rule_id == "R1"


def test_strong_topic_is_maintained(db: Session) -> None:
    user, _, backprop, _ = _seed(db)
    _mastery(db, user, backprop, mastery=90.0, attempts=3, last_score=90.0)

    recommendations = recommendations_for(db, user)
    backprop_recommendation = _by_name(recommendations)["Backpropagation"]

    assert backprop_recommendation.action == "maintain"
    assert backprop_recommendation.rule_id == "R4"


def test_developing_topic_gets_no_recommendation(db: Session) -> None:
    user, calculus, _, _ = _seed(db)
    _mastery(db, user, calculus, mastery=40.0, attempts=2, last_score=40.0)

    recommendations = recommendations_for(db, user)

    assert "Calculus" not in _by_name(recommendations)


def test_each_topic_gets_at_most_one_recommendation(db: Session) -> None:
    user, calculus, backprop, _ = _seed(db)
    _mastery(db, user, calculus, mastery=20.0, attempts=4, last_score=20.0)
    _mastery(db, user, backprop, mastery=90.0, attempts=3, last_score=90.0)

    recommendations = recommendations_for(db, user)

    topic_ids = [item.topic_id for item in recommendations]
    assert len(topic_ids) == len(set(topic_ids)) == 3
