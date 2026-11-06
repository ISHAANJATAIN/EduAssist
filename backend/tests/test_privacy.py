from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.chat import ChatMessage
from app.models.course import Course
from app.models.document import Document
from app.models.mastery import TopicMastery
from app.models.plan import StudyPlan
from app.models.quiz import Quiz, QuizAttempt
from app.models.topic import Topic, topic_prerequisites
from app.models.user import User
from app.services.ingestion.pipeline import document_path
from app.services.safety import privacy

PASSWORD = "study-buddy-1"


@pytest.fixture(autouse=True)
def temp_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_dir", tmp_path)
    return tmp_path


def _register(client: TestClient, email: str = "owner@bmu.edu.in") -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Owner", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _user_id(email: str) -> uuid.UUID:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        return user.id


def _seed(email: str, *, filename: str = "notes.txt") -> uuid.UUID:
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        assert user is not None
        course = db.scalar(select(Course).where(Course.user_id == user.id))
        assert course is not None

        prerequisite = Topic(course_id=course.id, name="Processes")
        dependent = Topic(course_id=course.id, name="Deadlocks")
        db.add_all([prerequisite, dependent])
        db.flush()
        db.execute(
            topic_prerequisites.insert().values(
                topic_id=dependent.id, prerequisite_id=prerequisite.id
            )
        )

        document = Document(
            id=uuid.uuid4(),
            user_id=user.id,
            course_id=course.id,
            filename=filename,
            doc_type="notes",
            status="ready",
        )
        db.add(document)

        db.add(
            TopicMastery(
                user_id=user.id,
                topic_id=dependent.id,
                mastery=72.0,
                attempts=2,
                last_score=80.0,
            )
        )

        quiz = Quiz(
            user_id=user.id,
            kind="quiz",
            difficulty="medium",
            topic_ids=[str(dependent.id)],
            items=[],
        )
        db.add(quiz)
        db.flush()
        db.add(
            QuizAttempt(
                quiz_id=quiz.id,
                user_id=user.id,
                score_percent=80.0,
                results=[],
            )
        )

        db.add(
            StudyPlan(
                user_id=user.id,
                exam_date=date(2026, 12, 1),
                free_hours_per_day=3.0,
                plan={},
            )
        )
        db.add(
            ChatMessage(
                user_id=user.id,
                role="user",
                intent="rag",
                payload={"message": "What is a deadlock?"},
            )
        )
        db.commit()

        path = document_path(user.id, document.id, document.filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("Deadlocks need mutual exclusion.", encoding="utf-8")
        return path


def test_delete_my_data_wipes_rows_files_and_vectors(
    client: TestClient, monkeypatch
) -> None:
    headers = _register(client)
    user_id = _user_id("owner@bmu.edu.in")
    path = _seed("owner@bmu.edu.in")
    deleted_vectors: list[uuid.UUID] = []
    monkeypatch.setattr(privacy, "delete_all", deleted_vectors.append)

    response = client.delete("/api/me/data", headers=headers)

    assert response.status_code == 204
    assert deleted_vectors == [user_id]
    assert not path.exists()

    with SessionLocal() as db:
        for model in (Document, TopicMastery, Quiz, QuizAttempt, StudyPlan, ChatMessage):
            count = db.scalar(
                select(func.count()).select_from(model).where(model.user_id == user_id)
            )
            assert count == 0, model.__name__
        course = db.scalar(select(Course).where(Course.user_id == user_id))
        assert course is not None
        assert db.scalar(
            select(func.count()).select_from(Topic).where(Topic.course_id == course.id)
        ) == 0
        assert db.scalar(
            select(func.count()).select_from(topic_prerequisites)
        ) == 0


def test_delete_my_data_keeps_login_and_course_settings(client: TestClient, monkeypatch) -> None:
    headers = _register(client)
    _seed("owner@bmu.edu.in")
    monkeypatch.setattr(privacy, "delete_all", lambda user_id: None)

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "owner@bmu.edu.in"))
        assert user is not None
        course = db.scalar(select(Course).where(Course.user_id == user.id))
        assert course is not None
        course.name = "Operating Systems"
        course.exam_date = date(2026, 12, 1)
        course.free_hours_per_day = 3.5
        db.commit()

    assert client.delete("/api/me/data", headers=headers).status_code == 204

    login = client.post(
        "/api/auth/login",
        json={"email": "owner@bmu.edu.in", "password": PASSWORD},
    )
    assert login.status_code == 200

    course = client.get("/api/course", headers=headers)
    assert course.status_code == 200
    assert course.json()["name"] == "Operating Systems"
    assert course.json()["exam_date"] == "2026-12-01"
    assert course.json()["free_hours_per_day"] == 3.5


def test_delete_my_data_leaves_other_users_untouched(client: TestClient, monkeypatch) -> None:
    headers = _register(client)
    _register(client, email="friend@bmu.edu.in")
    friend_id = _user_id("friend@bmu.edu.in")
    friend_path = _seed("friend@bmu.edu.in", filename="friend-notes.txt")
    monkeypatch.setattr(privacy, "delete_all", lambda user_id: None)

    assert client.delete("/api/me/data", headers=headers).status_code == 204

    with SessionLocal() as db:
        assert db.scalar(
            select(func.count()).select_from(Document).where(Document.user_id == friend_id)
        ) == 1
        friend_course = db.scalar(select(Course).where(Course.user_id == friend_id))
        assert friend_course is not None
        assert db.scalar(
            select(func.count())
            .select_from(Topic)
            .where(Topic.course_id == friend_course.id)
        ) == 2
        assert db.scalar(
            select(func.count())
            .select_from(ChatMessage)
            .where(ChatMessage.user_id == friend_id)
        ) == 1
    assert friend_path.exists()


def test_delete_my_data_requires_authentication(client: TestClient) -> None:
    response = client.delete("/api/me/data")

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_delete_my_data_removes_empty_upload_directory(client: TestClient, monkeypatch) -> None:
    headers = _register(client)
    user_id = _user_id("owner@bmu.edu.in")
    _seed("owner@bmu.edu.in")
    monkeypatch.setattr(privacy, "delete_all", lambda user_id: None)

    assert client.delete("/api/me/data", headers=headers).status_code == 204

    assert not (get_settings().upload_dir / str(user_id)).exists()
