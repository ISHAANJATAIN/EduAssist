from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.course import Course
from app.models.mastery import TopicMastery
from app.models.topic import Topic
from app.models.user import User
from app.schemas.quiz import AttemptResultOut
from app.services.tracking.mastery import (
    apply_attempt,
    performance_for,
    status_for,
    topic_scores,
)

PASSWORD = "study-buddy-1"


def _seed(db: Session, names: tuple[str, ...] = ("Deadlock",)) -> tuple[User, Course, list[Topic]]:
    user = User(email="track@bmu.edu.in", name="Tracker", password_hash="x")
    db.add(user)
    db.flush()
    course = Course(user_id=user.id, name="Operating Systems")
    db.add(course)
    db.flush()
    topics = [Topic(course_id=course.id, name=name) for name in names]
    db.add_all(topics)
    db.commit()
    return user, course, topics


def _result(item_id: str, correct: bool, topic_id: uuid.UUID) -> AttemptResultOut:
    return AttemptResultOut(item_id=item_id, correct=correct, topic_id=topic_id)


def test_first_attempt_sets_mastery_to_topic_score(db: Session) -> None:
    user, _, (topic,) = _seed(db)

    updates = apply_attempt(
        db,
        user,
        [_result("1", True, topic.id), _result("2", False, topic.id)],
    )

    assert [update.model_dump() for update in updates] == [
        {"topic_id": topic.id, "old": 0.0, "new": 50.0}
    ]
    row = db.get(TopicMastery, (user.id, topic.id))
    assert (row.mastery, row.attempts, row.last_score) == (50.0, 1, 50.0)


def test_later_attempt_blends_new_and_old_scores(db: Session) -> None:
    user, _, (topic,) = _seed(db)
    db.add(
        TopicMastery(
            user_id=user.id,
            topic_id=topic.id,
            mastery=80.0,
            attempts=1,
            last_score=80.0,
        )
    )
    db.commit()

    updates = apply_attempt(
        db,
        user,
        [_result("1", True, topic.id), _result("2", True, topic.id)],
    )

    assert updates[0].old == 80.0
    assert updates[0].new == 92.0
    row = db.get(TopicMastery, (user.id, topic.id))
    assert (row.mastery, row.attempts, row.last_score) == (92.0, 2, 100.0)


@pytest.mark.parametrize(
    ("mastery", "attempts", "expected"),
    [
        (0.0, 0, "untested"),
        (39.9, 2, "weak"),
        (40.0, 2, "developing"),
        (75.0, 1, "developing"),
        (75.0, 2, "strong"),
        (74.9, 5, "developing"),
    ],
)
def test_status_thresholds(mastery: float, attempts: int, expected: str) -> None:
    assert status_for(mastery, attempts) == expected


def test_topic_scores_average_each_topics_items(db: Session) -> None:
    _, _, topics = _seed(db, ("A topic", "B topic"))
    first, second = topics

    scores = topic_scores(
        [
            _result("1", True, first.id),
            _result("2", False, first.id),
            _result("3", True, first.id),
            _result("4", False, second.id),
        ]
    )

    assert scores == {first.id: 66.7, second.id: 0.0}


def test_performance_lists_every_course_topic(db: Session) -> None:
    user, _, topics = _seed(db, ("Statistics", "Calculus"))
    statistics, calculus = topics
    db.add_all(
        [
            TopicMastery(
                user_id=user.id,
                topic_id=calculus.id,
                mastery=30.0,
                attempts=2,
                last_score=30.0,
            ),
            TopicMastery(
                user_id=user.id,
                topic_id=statistics.id,
                mastery=80.0,
                attempts=2,
                last_score=80.0,
            ),
        ]
    )
    db.commit()

    performance = performance_for(db, user)

    assert [topic.topic_name for topic in performance.topics] == [
        "Calculus",
        "Statistics",
    ]
    assert [topic.status for topic in performance.topics] == ["weak", "strong"]
    assert performance.weak_topic_ids == [calculus.id]
    assert performance.strong_topic_ids == [statistics.id]


def test_performance_includes_never_tested_topics(db: Session) -> None:
    user, _, (topic,) = _seed(db, ("Databases",))

    performance = performance_for(db, user)

    assert performance.topics[0].model_dump() == {
        "topic_id": topic.id,
        "topic_name": "Databases",
        "mastery": 0.0,
        "attempts": 0,
        "last_score": None,
        "status": "untested",
    }
    assert performance.weak_topic_ids == []
    assert performance.strong_topic_ids == []


def _auth(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Tracker", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_performance_and_recommendation_endpoints(client: TestClient) -> None:
    headers = _auth(client, "endpoint@bmu.edu.in")
    created = client.post(
        "/api/topics",
        headers=headers,
        json={"name": "Deadlock", "prerequisite_ids": []},
    )
    assert created.status_code == 200
    topic_id = created.json()["id"]

    performance = client.get("/api/performance", headers=headers)
    recommendations = client.get("/api/recommendations", headers=headers)

    assert performance.status_code == 200
    assert performance.json() == {
        "topics": [
            {
                "topic_id": topic_id,
                "topic_name": "Deadlock",
                "mastery": 0.0,
                "attempts": 0,
                "last_score": None,
                "status": "untested",
            }
        ],
        "weak_topic_ids": [],
        "strong_topic_ids": [],
    }
    assert recommendations.status_code == 200
    assert recommendations.json() == [
        {
            "topic_id": topic_id,
            "topic_name": "Deadlock",
            "action": "take_quiz",
            "reason": "No attempts yet. Take a quiz to set a baseline.",
            "rule_id": "R2",
        }
    ]
