from __future__ import annotations

import uuid
from functools import lru_cache
from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate

from app.core.errors import AppError
from app.schemas.chat import AnswerReply
from app.services.llm.client import get_chat_model
from app.services.rag.retriever import ChunkMatch, retrieve
from app.services.safety.guardrails import ensure_citations, is_grounded

PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "rag_answer.md"

NOT_COVERED = (
    "I couldn't find this in your uploaded material. "
    "Try uploading the lecture or notes that cover this topic."
)


@lru_cache
def _prompt() -> ChatPromptTemplate:
    system = PROMPT_PATH.read_text(encoding="utf-8").strip()
    return ChatPromptTemplate.from_messages(
        [
            ("system", system),
            ("human", "Excerpts:\n{context}\n\nQuestion: {question}"),
        ]
    )


def _format_context(chunks: list[ChunkMatch]) -> str:
    return "\n\n".join(
        f"[{index}] {chunk.filename} (page {chunk.page})\n{chunk.text}"
        for index, chunk in enumerate(chunks, start=1)
    )


def _compose_answer(context: str, question: str) -> str:
    message = (_prompt() | get_chat_model()).invoke(
        {"context": context, "question": question}
    )
    content = message.content
    if isinstance(content, list):
        text = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    else:
        text = str(content)
    return text.strip()


def answer(user_id: uuid.UUID, question: str) -> AnswerReply:
    chunks = retrieve(user_id, question)
    if not is_grounded(chunk.score for chunk in chunks):
        return AnswerReply(text=NOT_COVERED, grounded=False, citations=[])

    try:
        text = _compose_answer(_format_context(chunks), question)
    except AppError:
        raise
    except Exception as exc:
        raise AppError(
            "llm_unavailable",
            "The language model could not answer right now. Please try again.",
            503,
        ) from exc

    if not text:
        raise AppError(
            "llm_unavailable",
            "The language model returned an empty answer. Please try again.",
            503,
        )

    return AnswerReply(
        text=text,
        grounded=True,
        citations=ensure_citations(text, chunks),
    )
