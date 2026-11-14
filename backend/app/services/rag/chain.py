from __future__ import annotations

import re
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
GENERAL_PROMPT_PATH = (
    Path(__file__).resolve().parents[2] / "prompts" / "general_answer.md"
)

LLM_DOWN = "The language model could not answer right now. Please try again."
LLM_EMPTY = "The language model returned an empty answer. Please try again."
NOT_FOUND_MARKER = "couldn't find this in your uploaded material"

_APP_MARKERS = re.compile(
    r"\b(?:eduassist|this app|the app|this product|the product|this site|"
    r"the site|this tool|the tool|the chat|the library|your library|my library|"
    r"library page|the dashboard|dashboard page|the planner|planner page|"
    r"settings page|delete my data|what can you do|what do you do)\b",
    re.IGNORECASE,
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


@lru_cache
def _general_prompt() -> ChatPromptTemplate:
    system = GENERAL_PROMPT_PATH.read_text(encoding="utf-8").strip()
    return ChatPromptTemplate.from_messages(
        [
            ("system", system),
            ("human", "{question}"),
        ]
    )


def _format_context(chunks: list[ChunkMatch]) -> str:
    return "\n\n".join(
        f"[{index}] {chunk.filename} (page {chunk.page})\n{chunk.text}"
        for index, chunk in enumerate(chunks, start=1)
    )


def _model_text(message) -> str:
    content = message.content
    if isinstance(content, list):
        text = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        )
    else:
        text = str(content)
    return text.strip()


def _compose_answer(context: str, question: str) -> str:
    return _model_text((_prompt() | get_chat_model()).invoke(
        {"context": context, "question": question}
    ))


def _compose_general_answer(question: str) -> str:
    return _model_text((_general_prompt() | get_chat_model()).invoke(
        {"question": question}
    ))


def _generate(compose, *args) -> str:
    try:
        text = compose(*args)
    except AppError:
        raise
    except Exception as exc:
        raise AppError("llm_unavailable", LLM_DOWN, 503) from exc

    if not text:
        raise AppError("llm_unavailable", LLM_EMPTY, 503)
    return text


def _is_app_question(message: str) -> bool:
    return _APP_MARKERS.search(message) is not None


def _general_reply(question: str) -> AnswerReply:
    return AnswerReply(
        text=_generate(_compose_general_answer, question),
        grounded=False,
        citations=[],
    )


def answer(user_id: uuid.UUID, question: str) -> AnswerReply:
    if _is_app_question(question):
        return _general_reply(question)

    chunks = retrieve(user_id, question)
    if not is_grounded(chunk.score for chunk in chunks):
        return _general_reply(question)

    text = _generate(_compose_answer, _format_context(chunks), question)
    if NOT_FOUND_MARKER in text.casefold():
        return _general_reply(question)

    return AnswerReply(
        text=text,
        grounded=True,
        citations=ensure_citations(text, chunks),
    )
