from __future__ import annotations

import json
import re
from collections.abc import Iterable

from langchain_core.messages import HumanMessage, SystemMessage

from app.prompts import load_prompt
from app.services.llm.client import get_chat_model

RAG = "rag"
QUIZ = "quiz"
TRACKER = "tracker"
PLANNER = "planner"
CLARIFY = "clarify"

INTENTS = (RAG, QUIZ, TRACKER, PLANNER, CLARIFY)

_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        PLANNER,
        ("plan", "planning", "schedule", "timetable", "study calendar", "study plan"),
    ),
    (
        QUIZ,
        (
            "quiz",
            "flashcard",
            "flashcards",
            "test me",
            "practice question",
            "practice questions",
            "mcq",
            "mcqs",
            "multiple choice",
        ),
    ),
    (
        TRACKER,
        (
            "progress",
            "mastery",
            "weak",
            "strong topics",
            "how am i doing",
            "where do i stand",
            "what should i study",
            "recommendation",
            "recommendations",
        ),
    ),
)

_QUESTION = re.compile(
    r"\?|^(what|why|how|when|where|who|which|explain|define|describe|"
    r"compare|summari[sz]e|tell me)\b",
    re.IGNORECASE,
)
_ISO_DATE = re.compile(r"\b20\d{2}-\d{1,2}-\d{1,2}\b")
_NUMERIC_DATE = re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]20\d{2}\b")


def _matches(text: str, keywords: Iterable[str]) -> bool:
    return any(
        re.search(rf"\b{re.escape(keyword)}\b", text) is not None
        for keyword in keywords
    )


def _model_text(response) -> str:
    content = response.content
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        ).strip()
    return str(content).strip()


def _parse_intent(raw: str) -> str:
    text = re.sub(r"<think(?:ing)?>.*?</think(?:ing)?>", "", raw, flags=re.DOTALL)
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("The model did not return a JSON object.")
    payload = json.loads(text[start : end + 1])
    intent = payload.get("intent") if isinstance(payload, dict) else None
    return intent if intent in INTENTS else RAG


def classify(message: str) -> str:
    response = get_chat_model().invoke(
        [
            SystemMessage(content=load_prompt("intent_classification")),
            HumanMessage(content=message),
        ]
    )
    return _parse_intent(_model_text(response))


def detect_intent(message: str) -> str:
    text = message.casefold()
    for intent, keywords in _KEYWORDS:
        if _matches(text, keywords):
            return intent
    if _QUESTION.search(message.strip()):
        return RAG
    if _ISO_DATE.search(message) or _NUMERIC_DATE.search(message):
        return PLANNER
    try:
        return classify(message)
    except Exception:
        return RAG
