from __future__ import annotations

import re
import uuid
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.course import Course
from app.models.document import Document
from app.services.agent.scoping import match_documents
from app.services.agent.slots import extract_slots
from app.services.quiz import generator
from tests.test_quiz import _auth, _chunk, _patch_chunks, _patch_llm, _question, _quiz_reply, _topic


def _documents(*filenames: str) -> list[SimpleNamespace]:
    return [SimpleNamespace(id=uuid.uuid4(), filename=name) for name in filenames]


def test_slots_read_module_numbers_and_count() -> None:
    slots = extract_slots("make a quiz of 20 questions from module 1 and module 2", [])

    assert slots.num_items == 20
    assert slots.modules == (1, 2)


def test_module_scope_selects_only_named_modules() -> None:
    docs = _documents(
        "COA_Module1.pptx",
        "COA_Module2.pptx",
        "COA_Module3.ppt.pdf",
        "COA-Processing Unit.pptx",
    )

    matched = match_documents(
        "make a quiz of 20 questions from module 1 and module 2", (1, 2), docs
    )

    assert [doc.filename for doc in matched] == ["COA_Module1.pptx", "COA_Module2.pptx"]


def test_filename_scope_matches_document() -> None:
    docs = _documents("COA_Module1.pptx", "COA-Processing Unit.pptx")

    matched = match_documents("quiz me on COA-Processing Unit", (), docs)

    assert [doc.filename for doc in matched] == ["COA-Processing Unit.pptx"]


def _batch(start: int) -> str:
    return _quiz_reply(
        [_question(f"Batch question {number}?", number % 4) for number in range(start, start + 6)]
    )


def test_quiz_generates_in_batches_until_requested_count(client: TestClient, monkeypatch) -> None:
    headers = _auth(client)
    _topic(client, headers)
    model = _patch_llm(monkeypatch, [_batch(0), _batch(6), _batch(12), _batch(18)])
    _patch_chunks(monkeypatch)

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "num_items": 20},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["items"]) == 20
    assert body["warning"] is None
    assert model.calls == 4


def test_short_generation_returns_honest_warning(client: TestClient, monkeypatch) -> None:
    headers = _auth(client)
    _topic(client, headers)
    _patch_llm(
        monkeypatch,
        [_quiz_reply([_question(f"Only question {number}?", 0) for number in range(5)])],
    )
    _patch_chunks(monkeypatch)

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "num_items": 20},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["items"]) == 5
    assert "5 of the 20" in body["warning"]


def _seed_documents() -> tuple[list[uuid.UUID], uuid.UUID]:
    with SessionLocal() as session:
        course = session.scalar(select(Course))
        assert course is not None
        documents = [
            Document(
                course_id=course.id,
                user_id=course.user_id,
                filename=name,
                doc_type="slides",
                status="ready",
            )
            for name in (
                "COA_Module1.pptx",
                "COA_Module2.pptx",
                "COA_Module3.ppt.pdf",
            )
        ]
        session.add_all(documents)
        session.commit()
        return [document.id for document in documents], course.user_id


def test_chat_quiz_scopes_retrieval_to_named_modules(client: TestClient, monkeypatch) -> None:
    headers = _auth(client, "scope@bmu.edu.in")
    _topic(client, headers)
    document_ids, _ = _seed_documents()

    captured: list[dict] = []

    def fake_query(*args, **kwargs):
        captured.append(kwargs)
        return [_chunk()]

    monkeypatch.setattr(generator, "query", fake_query)
    _patch_llm(monkeypatch, [_quiz_reply([_question("Scoped question?", 0)])])

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "make a quiz of 1 question from module 1 and module 2"},
    )

    assert response.status_code == 200, response.text
    assert captured
    assert pinned_ids(captured[0]) == {document_ids[0], document_ids[1]}


def pinned_ids(call: dict) -> set[uuid.UUID]:
    return {uuid.UUID(str(value)) for value in call["document_ids"]}


def test_unknown_module_asks_for_clarification(client: TestClient, monkeypatch) -> None:
    headers = _auth(client, "missing@bmu.edu.in")
    _topic(client, headers)
    _seed_documents()
    _patch_chunks(monkeypatch)

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "make a quiz of 1 question from module 9"},
    )

    assert response.status_code == 200, response.text
    reply = response.json()["reply"]
    assert reply["type"] == "clarify"
    assert "COA_Module1.pptx" in reply["text"]


def test_batches_draw_from_separate_excerpt_slices(client: TestClient, monkeypatch) -> None:
    headers = _auth(client, "slices@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch, [_chunk(index=index, page=index + 1) for index in range(8)])
    prompts: list[str] = []

    class RecordingModel:
        def __init__(self) -> None:
            self.replies = [
                _quiz_reply([_question(f"First {index}?", 0) for index in range(6)]),
                _quiz_reply([_question("Second?", 0)]),
            ]
            self.calls = 0

        def invoke(self, messages):
            prompts.append(messages[1].content)
            reply = self.replies[min(self.calls, len(self.replies) - 1)]
            self.calls += 1
            return SimpleNamespace(content=reply)

    model = RecordingModel()
    monkeypatch.setattr(generator, "get_chat_model", lambda: model)

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "num_items": 7},
    )

    assert response.status_code == 201, response.text
    assert len(response.json()["items"]) == 7
    assert _excerpt_numbers(prompts[0]) == {1, 2, 3, 4}
    assert _excerpt_numbers(prompts[1]) == {5, 6, 7, 8}


def _excerpt_numbers(prompt: str) -> set[int]:
    return {
        int(number)
        for number in re.findall(r"^\[(\d+)\]", prompt, flags=re.MULTILINE)
    }


def test_chat_quiz_warning_is_kept_in_history(client: TestClient, monkeypatch) -> None:
    headers = _auth(client, "warning@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch)
    _patch_llm(monkeypatch, [_quiz_reply([_question("Only one?", 0)])])

    response = client.post(
        "/api/chat",
        headers=headers,
        json={"message": "make a quiz of 5 questions"},
    )

    assert response.status_code == 200, response.text
    warning = response.json()["reply"]["quiz"]["warning"]
    assert "1 of the 5" in warning

    history = client.get("/api/chat/history", headers=headers).json()
    assistant = next(row for row in history if row["role"] == "assistant")
    assert assistant["reply"]["quiz"]["warning"] == warning
