from __future__ import annotations

import uuid

import pytest

from app.core.errors import AppError
from app.services.ingestion.vector_store import ChunkMatch
from app.services.rag import chain
from app.services.safety.guardrails import ensure_citations, is_grounded


def _match(
    *,
    document_id: uuid.UUID | None = None,
    page: int = 3,
    score: float = 0.9,
    text: str = "A deadlock is a circular wait between processes.",
    filename: str = "notes.pdf",
) -> ChunkMatch:
    return ChunkMatch(
        text=text,
        document_id=str(document_id or uuid.uuid4()),
        filename=filename,
        page=page,
        doc_type="notes",
        chunk_index=0,
        score=score,
    )


def test_grounded_gate_uses_the_top_score() -> None:
    assert is_grounded([]) is False
    assert is_grounded([0.1, 0.29]) is False
    assert is_grounded([0.1, 0.30]) is True


def test_ensure_citations_keeps_referenced_pages_and_truncates_snippets() -> None:
    document_id = uuid.uuid4()
    chunks = [
        _match(document_id=document_id, page=2, text="word " * 200, score=0.9),
        _match(document_id=document_id, page=2, score=0.8),
        _match(document_id=document_id, page=4, score=0.7),
    ]

    citations = ensure_citations("As notes.pdf p.2 explains, and also notes.pdf p.4.", chunks)

    assert [(citation.filename, citation.page) for citation in citations] == [
        ("notes.pdf", 2),
        ("notes.pdf", 4),
    ]
    assert citations[0].document_id == document_id
    assert citations[0].snippet.endswith("…")
    assert len(citations[0].snippet) <= 241


def test_ensure_citations_drops_pages_the_answer_did_not_use() -> None:
    chunks = [_match(page=2, score=0.9), _match(page=4, score=0.7)]

    citations = ensure_citations("Only notes.pdf p.2 is relevant.", chunks)

    assert [citation.page for citation in citations] == [2]


def test_ensure_citations_falls_back_to_top_chunks() -> None:
    chunks = [_match(page=2, score=0.9), _match(page=4, score=0.7)]

    citations = ensure_citations("An answer that names no source.", chunks)

    assert [citation.page for citation in citations] == [2, 4]


def test_ungrounded_question_skips_the_llm(monkeypatch) -> None:
    monkeypatch.setattr(chain, "retrieve", lambda *_: [_match(score=0.1)])

    def fail(*_args, **_kwargs):
        raise AssertionError("The LLM must not be called below the score gate.")

    monkeypatch.setattr(chain, "get_chat_model", fail)

    reply = chain.answer(uuid.uuid4(), "What is a deadlock?")

    assert reply.grounded is False
    assert reply.citations == []
    assert "couldn't find" in reply.text


def test_grounded_answer_builds_citations(monkeypatch) -> None:
    document_id = uuid.uuid4()
    monkeypatch.setattr(
        chain, "retrieve", lambda *_: [_match(document_id=document_id, page=12)]
    )
    monkeypatch.setattr(
        chain,
        "_compose_answer",
        lambda context, question: "Deadlocks need mutual exclusion (notes.pdf, p.12).",
    )

    reply = chain.answer(uuid.uuid4(), "What is a deadlock?")

    assert reply.grounded is True
    assert [citation.page for citation in reply.citations] == [12]
    assert reply.citations[0].document_id == document_id


def test_llm_failure_maps_to_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(chain, "retrieve", lambda *_: [_match(score=0.8)])

    def fail(*_args, **_kwargs):
        raise RuntimeError("model down")

    monkeypatch.setattr(chain, "_compose_answer", fail)

    with pytest.raises(AppError) as excinfo:
        chain.answer(uuid.uuid4(), "What is a deadlock?")

    assert excinfo.value.code == "llm_unavailable"
    assert excinfo.value.status_code == 503
