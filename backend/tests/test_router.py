from __future__ import annotations

import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.schemas.quiz import QuizOut
from app.services.agent import dispatcher, intent, slots

PASSWORD = "study-buddy-1"


class FakeModel:
    def __init__(self, replies: list[str]) -> None:
        self.replies = list(replies)
        self.calls: list[object] = []

    def invoke(self, messages):
        self.calls.append(messages)
        return SimpleNamespace(content=self.replies.pop(0))


def _auth(client: TestClient, email: str = "router@bmu.edu.in") -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Router", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _topic(client: TestClient, headers: dict[str, str], name: str) -> dict:
    response = client.post(
        "/api/topics",
        headers=headers,
        json={"name": name, "prerequisite_ids": []},
    )
    assert response.status_code == 200
    return response.json()


def _set_course(
    client: TestClient,
    headers: dict[str, str],
    exam_date: date,
    free_hours: float = 2.0,
) -> None:
    response = client.put(
        "/api/course",
        headers=headers,
        json={
            "name": "Operating Systems",
            "exam_date": exam_date.isoformat(),
            "free_hours_per_day": free_hours,
        },
    )
    assert response.status_code == 200


def _sample_topics() -> list[SimpleNamespace]:
    return [
        SimpleNamespace(id=uuid.uuid4(), name="Deadlocks"),
        SimpleNamespace(id=uuid.uuid4(), name="Paging"),
    ]


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Quiz me", "quiz"),
        ("Flashcards for deadlocks", "quiz"),
        ("Test me on paging", "quiz"),
        ("How am I doing?", "tracker"),
        ("What are my strong topics?", "tracker"),
        ("Plan my revision", "planner"),
        ("Make a schedule for this week", "planner"),
        ("2026-12-01", "planner"),
        ("What is a deadlock?", "rag"),
        ("Explain paging", "rag"),
    ],
)
def test_keyword_rules_pick_the_intent(message: str, expected: str) -> None:
    assert intent.detect_intent(message) == expected


def test_ambiguous_message_uses_the_llm_classifier(monkeypatch) -> None:
    model = FakeModel(['{"intent": "planner"}'])
    monkeypatch.setattr(intent, "get_chat_model", lambda: model)

    assert intent.detect_intent("I need to get organised") == "planner"
    assert model.calls


def test_unknown_classifier_output_falls_back_to_rag(monkeypatch) -> None:
    monkeypatch.setattr(
        intent, "get_chat_model", lambda: FakeModel(['{"intent": "dance"}'])
    )

    assert intent.detect_intent("Sort me out") == "rag"


def test_classifier_error_falls_back_to_rag(monkeypatch) -> None:
    class Broken:
        def invoke(self, messages):
            raise RuntimeError("model unavailable")

    monkeypatch.setattr(intent, "get_chat_model", lambda: Broken())

    assert intent.detect_intent("Sort me out") == "rag"


def test_slots_extract_quiz_details() -> None:
    topics = _sample_topics()

    result = slots.extract_slots(
        "Quiz me on 3 hard questions about Deadlocks", topics
    )

    assert result.kind == "quiz"
    assert result.difficulty == "hard"
    assert result.num_items == 3
    assert result.topic_ids == (topics[0].id,)


def test_slots_extract_plan_details() -> None:
    result = slots.extract_slots(
        "Plan my revision for 2 hours a day on 2026-12-20", []
    )

    assert result.exam_date == date(2026, 12, 20)
    assert result.free_hours_per_day == 2.0


def test_slots_read_a_written_out_date() -> None:
    result = slots.extract_slots("Plan my revision until 20 December 2026", [])

    assert result.exam_date == date(2026, 12, 20)


def test_llm_fills_slots_when_rules_find_nothing(monkeypatch) -> None:
    topics = _sample_topics()
    model = FakeModel(
        [
            '{"kind": "quiz", "difficulty": "easy", "num_items": 4, '
            '"topic_names": ["Deadlocks"], "exam_date": null, '
            '"free_hours_per_day": null}'
        ]
    )
    monkeypatch.setattr(slots, "get_chat_model", lambda: model)

    result = slots.extract_slots("Give me something gentle to practise", topics)

    assert result.kind == "quiz"
    assert result.difficulty == "easy"
    assert result.num_items == 4
    assert result.topic_ids == (topics[0].id,)


def test_llm_slot_values_are_sanitised(monkeypatch) -> None:
    model = FakeModel(
        [
            '{"kind": "essay", "difficulty": "extreme", "num_items": 99, '
            '"topic_names": ["Unknown"], "exam_date": "not-a-date", '
            '"free_hours_per_day": 50}'
        ]
    )
    monkeypatch.setattr(slots, "get_chat_model", lambda: model)

    result = slots.extract_slots("Give me something gentle to practise", [])

    assert result == slots.Slots()


def test_chat_detects_tracker_without_an_intent(client: TestClient) -> None:
    headers = _auth(client, "router-tracker@bmu.edu.in")
    topic = _topic(client, headers, "Deadlocks")

    response = client.post(
        "/api/chat", headers=headers, json={"message": "How am I doing?"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "tracker"
    assert body["reply"]["type"] == "performance"
    assert body["reply"]["summary"]["topics"][0]["topic_id"] == topic["id"]


def test_chat_planner_uses_course_settings(client: TestClient) -> None:
    headers = _auth(client, "router-plan@bmu.edu.in")
    exam = date.today() + timedelta(days=5)
    _set_course(client, headers, exam)
    _topic(client, headers, "Processes")

    response = client.post(
        "/api/chat", headers=headers, json={"message": "Plan my revision"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "planner"
    assert body["reply"]["type"] == "plan"
    assert body["reply"]["plan"]["exam_date"] == exam.isoformat()
    assert body["reply"]["plan"]["feasible"] is True


@pytest.mark.parametrize("date_in_message", [True, False])
def test_chat_planner_returns_validation_error_for_excessive_horizon(client, date_in_message):
    headers = _auth(client, "router-horizon@bmu.edu.in")
    exam = date.today() + timedelta(days=366)
    _set_course(client, headers, exam)
    _topic(client, headers, "Processes")

    response = client.post(
        "/api/chat", headers=headers,
        json={"message": f"Plan my revision for {exam.isoformat()}" if date_in_message else "Plan my revision"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert client.get("/api/chat/history", headers=headers).json() == []


@pytest.mark.parametrize("selected_only", [True, False])
def test_chat_planner_preserves_topic_selection(client: TestClient, selected_only) -> None:
    headers = _auth(client, "router-selection@bmu.edu.in")
    _set_course(client, headers, date.today() + timedelta(days=5))
    deadlocks = _topic(client, headers, "Deadlocks")
    paging = _topic(client, headers, "Paging")

    response = client.post(
        "/api/chat", headers=headers,
        json={"message": "Plan my revision for Deadlocks" if selected_only else "Plan my revision"},
    )

    assert response.status_code == 200
    scheduled = {
        slot["topic_id"]
        for day in response.json()["reply"]["plan"]["days"]
        for slot in day["slots"]
    }
    assert scheduled == ({deadlocks["id"]} if selected_only else {deadlocks["id"], paging["id"]})


def test_chat_planner_reads_the_date_and_hours_from_the_message(
    client: TestClient,
) -> None:
    headers = _auth(client, "router-plan-message@bmu.edu.in")
    _topic(client, headers, "Processes")
    exam = date.today() + timedelta(days=10)

    response = client.post(
        "/api/chat",
        headers=headers,
        json={
            "message": (
                f"Plan my revision for 2 hours a day on {exam.isoformat()}"
            )
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "planner"
    plan = body["reply"]["plan"]
    assert plan["exam_date"] == exam.isoformat()
    assert plan["feasible"] is True
    assert all(day["total_minutes"] <= 120 for day in plan["days"])
    assert sum(day["total_minutes"] for day in plan["days"]) > 0


def test_chat_quiz_uses_the_extracted_topic_and_difficulty(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "router-quiz@bmu.edu.in")
    deadlocks = _topic(client, headers, "Deadlocks")
    _topic(client, headers, "Paging")
    quiz = QuizOut(
        id=uuid.uuid4(),
        kind="quiz",
        difficulty="hard",
        topic_ids=[uuid.UUID(deadlocks["id"])],
        items=[],
    )
    captured: dict = {}

    def fake_create_quiz(user, payload, db):
        captured["payload"] = payload
        return quiz

    monkeypatch.setattr(dispatcher, "create_quiz", fake_create_quiz)

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "Quiz me on 3 hard questions about Deadlocks"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "quiz"
    assert body["reply"]["type"] == "quiz"
    payload = captured["payload"]
    assert payload.difficulty == "hard"
    assert payload.num_items == 3
    assert payload.topic_ids == [uuid.UUID(deadlocks["id"])]


def test_explicit_intent_overrides_detection(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "router-explicit@bmu.edu.in")
    exam = date.today() + timedelta(days=4)
    _set_course(client, headers, exam)
    _topic(client, headers, "Paging")
    quiz = QuizOut(
        id=uuid.uuid4(), kind="quiz", difficulty="medium", topic_ids=[], items=[]
    )
    monkeypatch.setattr(
        dispatcher, "create_quiz", lambda user, payload, db: quiz
    )

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "Explain paging", "intent": "quiz"},
    )

    assert response.status_code == 200
    assert response.json()["intent"] == "quiz"
    assert response.json()["reply"]["type"] == "quiz"


def test_vague_message_returns_a_clarify_reply(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "router-clarify@bmu.edu.in")
    monkeypatch.setattr(
        intent,
        "get_chat_model",
        lambda: FakeModel(['{"intent": "clarify"}']),
    )

    response = client.post(
        "/api/chat", headers=headers, json={"message": "Sort me out"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "clarify"
    assert body["reply"]["type"] == "clarify"
    assert body["reply"]["missing"] == []
    assert "quiz" in body["reply"]["text"].casefold()
