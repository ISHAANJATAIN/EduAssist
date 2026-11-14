from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.init_db import backfill_chat_sessions
from app.db.session import SessionLocal
from app.models.chat import ChatMessage, ChatSession
from app.models.user import User
from app.schemas.chat import AnswerReply
from app.services.agent import dispatcher

PASSWORD = "study-buddy-1"


def _auth(
    client: TestClient, email: str = "sessions@bmu.edu.in"
) -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Sessions", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _stub_answer(monkeypatch) -> None:
    monkeypatch.setattr(
        dispatcher,
        "answer",
        lambda user_id, question: AnswerReply(
            text="An answer.", grounded=True, citations=[]
        ),
    )


def _send(
    client: TestClient, headers: dict[str, str], message: str, session_id=None
):
    payload: dict = {"message": message}
    if session_id:
        payload["session_id"] = session_id
    return client.post("/api/chat", headers=headers, json=payload)


def test_first_message_creates_a_titled_session(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client)
    _stub_answer(monkeypatch)

    response = _send(client, headers, "What is a deadlock?")

    assert response.status_code == 200
    body = response.json()
    session_id = body["session_id"]

    sessions = client.get("/api/chat/sessions", headers=headers).json()
    assert [session["id"] for session in sessions] == [session_id]
    assert sessions[0]["title"] == "What is a deadlock?"

    messages = client.get(
        f"/api/chat/sessions/{session_id}/messages", headers=headers
    ).json()
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert messages[0]["text"] == "What is a deadlock?"
    assert messages[0]["intent"] == "rag"


def test_messages_with_a_session_id_append_to_it(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client)
    _stub_answer(monkeypatch)
    first = _send(client, headers, "What is paging?").json()

    second = _send(client, headers, "And deadlock?", first["session_id"])

    assert second.status_code == 200
    assert second.json()["session_id"] == first["session_id"]
    sessions = client.get("/api/chat/sessions", headers=headers).json()
    assert len(sessions) == 1
    assert sessions[0]["title"] == "What is paging?"
    messages = client.get(
        f"/api/chat/sessions/{first['session_id']}/messages", headers=headers
    ).json()
    assert len(messages) == 4


def test_new_session_keeps_previous_conversation_and_latest_returns_newest(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client)
    _stub_answer(monkeypatch)
    first = _send(client, headers, "First conversation").json()

    created = client.post("/api/chat/sessions", headers=headers)
    assert created.status_code == 201
    second_id = created.json()["id"]
    assert created.json()["title"] is None

    sent = _send(client, headers, "Second conversation", second_id)
    assert sent.status_code == 200

    sessions = client.get("/api/chat/sessions", headers=headers).json()
    assert [session["id"] for session in sessions] == [
        second_id,
        first["session_id"],
    ]
    assert sessions[0]["title"] == "Second conversation"

    latest = client.get("/api/chat/sessions/latest", headers=headers).json()
    assert latest["session"]["id"] == second_id
    assert [message["role"] for message in latest["messages"]] == [
        "user",
        "assistant",
    ]

    old = client.get(
        f"/api/chat/sessions/{first['session_id']}/messages", headers=headers
    ).json()
    assert [message["text"] for message in old if message["role"] == "user"] == [
        "First conversation"
    ]


def test_slash_commands_get_numbered_titles(client: TestClient, monkeypatch) -> None:
    headers = _auth(client, "slash@bmu.edu.in")
    _stub_answer(monkeypatch)

    first = _send(client, headers, "/help").json()
    second = _send(client, headers, "/status").json()

    sessions = client.get("/api/chat/sessions", headers=headers).json()
    titles = {session["id"]: session["title"] for session in sessions}
    assert titles[first["session_id"]] == "Conversation 1"
    assert titles[second["session_id"]] == "Conversation 2"


def test_latest_is_empty_without_conversations(client: TestClient) -> None:
    headers = _auth(client, "empty@bmu.edu.in")

    latest = client.get("/api/chat/sessions/latest", headers=headers)

    assert latest.status_code == 200
    assert latest.json() == {"session": None, "messages": []}


def test_sessions_are_private(client: TestClient, monkeypatch) -> None:
    owner = _auth(client, "owner-sessions@bmu.edu.in")
    stranger = _auth(client, "stranger-sessions@bmu.edu.in")
    _stub_answer(monkeypatch)
    session_id = _send(client, owner, "Owner secret").json()["session_id"]

    assert client.get("/api/chat/sessions", headers=stranger).json() == []
    assert (
        client.get(
            f"/api/chat/sessions/{session_id}/messages", headers=stranger
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/chat/sessions/{session_id}/messages", headers=stranger
        ).status_code
        == 404
    )
    assert _send(client, stranger, "Hijack", session_id).status_code == 404


def test_clear_removes_only_that_sessions_messages(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client)
    _stub_answer(monkeypatch)
    first = _send(client, headers, "First conversation").json()
    created = client.post("/api/chat/sessions", headers=headers).json()
    _send(client, headers, "Second conversation", created["id"])

    cleared = client.delete(
        f"/api/chat/sessions/{first['session_id']}/messages", headers=headers
    )

    assert cleared.status_code == 204
    assert (
        client.get(
            f"/api/chat/sessions/{first['session_id']}/messages", headers=headers
        ).json()
        == []
    )
    kept = client.get(
        f"/api/chat/sessions/{created['id']}/messages", headers=headers
    ).json()
    assert len(kept) == 2
    sessions = client.get("/api/chat/sessions", headers=headers).json()
    assert {session["id"] for session in sessions} == {
        first["session_id"],
        created["id"],
    }


def test_legacy_messages_are_grouped_into_one_session(client: TestClient) -> None:
    _auth(client, "legacy@bmu.edu.in")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "legacy@bmu.edu.in"))
        assert user is not None
        for text in ("Old question", "Old answer"):
            db.add(
                ChatMessage(user_id=user.id, role="user", payload={"text": text})
            )
        db.commit()

        backfill_chat_sessions(db)

        sessions = db.scalars(
            select(ChatSession).where(ChatSession.user_id == user.id)
        ).all()
        assert len(sessions) == 1
        assert sessions[0].title == "Earlier chat"
        linked = db.scalars(
            select(ChatMessage).where(ChatMessage.user_id == user.id)
        ).all()
        assert {message.session_id for message in linked} == {sessions[0].id}
