from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.schemas.chat import AnswerReply, CitationOut
from app.schemas.quiz import QuizOut, QuizQuestionOut, SourceOut
from app.services.agent import dispatcher

PASSWORD = "study-buddy-1"


def _auth(client: TestClient, email: str = "chat@bmu.edu.in") -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Chatter", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_chat_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": "Hello"})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_grounded_answer_is_saved_and_returned_in_history(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client)
    document_id = uuid.uuid4()
    reply = AnswerReply(
        text="A deadlock is a circular wait (notes.pdf, p.2).",
        grounded=True,
        citations=[
            CitationOut(
                document_id=document_id,
                filename="notes.pdf",
                page=2,
                snippet="A deadlock is a circular wait between processes.",
            )
        ],
    )

    monkeypatch.setattr(dispatcher, "answer", lambda user_id, question: reply)

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "What is a deadlock?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "rag"
    assert body["reply"]["type"] == "answer"
    assert body["reply"]["citations"][0]["filename"] == "notes.pdf"
    assert body["message_id"]

    history = client.get("/api/chat/history", headers=headers)
    assert history.status_code == 200
    rows = history.json()
    assert [row["role"] for row in rows] == ["user", "assistant"]
    assert rows[0]["text"] == "What is a deadlock?"
    assert rows[0]["intent"] == "rag"
    assert rows[1]["text"] is None
    assert rows[1]["intent"] is None
    assert rows[1]["reply"] == body["reply"]
    assert rows[1]["id"] == body["message_id"]


def test_ungrounded_question_returns_a_general_answer_without_citations(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "ungrounded@bmu.edu.in")
    monkeypatch.setattr("app.services.rag.chain.retrieve", lambda *_: [])
    monkeypatch.setattr(
        "app.services.rag.chain._compose_general_answer",
        lambda question: "Argentina won the 2022 FIFA World Cup.",
    )

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "Who won the 2022 FIFA World Cup?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reply"]["type"] == "answer"
    assert body["reply"]["grounded"] is False
    assert body["reply"]["citations"] == []
    assert body["reply"]["text"].startswith("Argentina")


def test_app_question_returns_the_feature_answer(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "app-question@bmu.edu.in")
    monkeypatch.setattr(
        "app.services.rag.chain._compose_general_answer",
        lambda question: "The library stores and parses your uploaded course files.",
    )

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "What is the library for?"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "rag"
    assert body["reply"]["grounded"] is False
    assert body["reply"]["citations"] == []
    assert body["reply"]["text"].startswith("The library")


def test_tracker_intent_returns_performance_and_recommendations(
    client: TestClient,
) -> None:
    headers = _auth(client, "tracker@bmu.edu.in")
    topic = client.post(
        "/api/topics",
        headers=headers,
        json={"name": "Deadlock", "prerequisite_ids": []},
    )
    assert topic.status_code == 200
    topic_id = topic.json()["id"]

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "How am I doing?", "intent": "tracker"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "tracker"
    assert body["reply"]["type"] == "performance"
    assert body["reply"]["summary"]["topics"][0]["topic_id"] == topic_id
    assert body["reply"]["summary"]["topics"][0]["status"] == "untested"
    assert body["reply"]["recommendations"][0]["action"] == "take_quiz"

    rows = client.get("/api/chat/history", headers=headers).json()
    assert [row["role"] for row in rows] == ["user", "assistant"]
    assert rows[0]["intent"] == "tracker"
    assert rows[1]["reply"] == body["reply"]


def test_planner_intent_asks_for_an_exam_date(
    client: TestClient,
) -> None:
    headers = _auth(client, "planner@bmu.edu.in")

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "Plan my revision", "intent": "planner"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "clarify"
    assert body["reply"]["type"] == "clarify"
    assert body["reply"]["missing"] == ["exam_date"]
    assert "exam date" in body["reply"]["text"].casefold()

    rows = client.get("/api/chat/history", headers=headers).json()
    assert [row["intent"] for row in rows] == ["clarify", None]


def test_quiz_intent_returns_a_quiz_and_saves_it(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "quizchat@bmu.edu.in")
    topic_id = uuid.uuid4()
    quiz = QuizOut(
        id=uuid.uuid4(),
        kind="quiz",
        difficulty="medium",
        topic_ids=[topic_id],
        items=[
            QuizQuestionOut(
                id="q1",
                topic_id=topic_id,
                question="What does deadlock require?",
                options=["A", "B", "C", "D"],
                source=SourceOut(filename="os.pdf", page=1),
            )
        ],
    )
    monkeypatch.setattr(dispatcher, "create_quiz", lambda user, payload, db: quiz)

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "Quiz me", "intent": "quiz"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "quiz"
    assert body["reply"]["type"] == "quiz"
    assert body["reply"]["quiz"]["items"][0]["question"].startswith("What does")
    assert "correct_index" not in body["reply"]["quiz"]["items"][0]

    rows = client.get("/api/chat/history", headers=headers).json()
    assert [row["role"] for row in rows] == ["user", "assistant"]
    assert rows[0]["intent"] == "quiz"
    assert rows[1]["reply"] == body["reply"]


def test_history_limit_must_be_positive(client: TestClient) -> None:
    headers = _auth(client, "limit@bmu.edu.in")

    response = client.get("/api/chat/history?limit=0", headers=headers)

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_history_is_scoped_to_the_current_user(
    client: TestClient, monkeypatch
) -> None:
    first = _auth(client, "first@bmu.edu.in")
    second = _auth(client, "second@bmu.edu.in")
    monkeypatch.setattr(
        dispatcher,
        "answer",
        lambda user_id, question: AnswerReply(text="ok", grounded=True, citations=[]),
    )

    client.post("/api/chat", headers=first, json={"message": "What is mine?"})

    assert client.get("/api/chat/history", headers=second).json() == []
    assert len(client.get("/api/chat/history", headers=first).json()) == 2
