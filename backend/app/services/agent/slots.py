from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, replace
from datetime import date, datetime

from langchain_core.messages import HumanMessage, SystemMessage

from app.models.topic import Topic
from app.prompts import load_prompt
from app.services.llm.client import get_chat_model

DIFFICULTIES = ("easy", "medium", "hard")
KINDS = ("quiz", "flashcards")

_DIFFICULTY = re.compile(r"\b(easy|medium|hard)\b", re.IGNORECASE)
_COUNT = re.compile(
    r"\b(\d{1,2})\s+(?:(?:easy|medium|hard)\s+)?"
    r"(?:questions?|items?|cards?|flashcards?|mcqs?)\b",
    re.IGNORECASE,
)
_HOURS = re.compile(r"\b(\d{1,2}(?:\.\d)?)\s*(?:hours?|hrs?|h)\b", re.IGNORECASE)
_KIND = re.compile(
    r"\b(quiz|test me|practice questions?|mcqs?|multiple choice)\b", re.IGNORECASE
)
_MODULE = re.compile(r"\bmodules?\s*#?\s*(\d{1,2})\b", re.IGNORECASE)
_ISO_DATE = re.compile(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b")
_DAY_MONTH_YEAR = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b")
_DAY_MONTH_NAME = re.compile(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\b")
_MONTH_DAY_NAME = re.compile(r"\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(20\d{2})\b")


@dataclass(frozen=True)
class Slots:
    kind: str | None = None
    difficulty: str | None = None
    num_items: int | None = None
    topic_ids: tuple[uuid.UUID, ...] = ()
    modules: tuple[int, ...] = ()
    exam_date: date | None = None
    free_hours_per_day: float | None = None


def _parse_date(text: str) -> date | None:
    match = _ISO_DATE.search(text)
    if match:
        try:
            return date(int(match[1]), int(match[2]), int(match[3]))
        except ValueError:
            return None

    match = _DAY_MONTH_YEAR.search(text)
    if match:
        try:
            return date(int(match[3]), int(match[2]), int(match[1]))
        except ValueError:
            return None

    match = _DAY_MONTH_NAME.search(text)
    if match:
        candidate = f"{match[1]} {match[2]} {match[3]}"
    else:
        match = _MONTH_DAY_NAME.search(text)
        candidate = f"{match[2]} {match[1]} {match[3]}" if match else None

    if candidate:
        for fmt in ("%d %B %Y", "%d %b %Y"):
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
    return None


def _model_text(response) -> str:
    content = response.content
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        ).strip()
    return str(content).strip()


def _rules(message: str, topics: list[Topic]) -> Slots:
    text = message.casefold()
    difficulty = _DIFFICULTY.search(message)
    count = _COUNT.search(message)
    hours = _HOURS.search(message)

    if "flashcard" in text:
        kind = "flashcards"
    elif _KIND.search(message):
        kind = "quiz"
    else:
        kind = None

    topic_ids = tuple(topic.id for topic in topics if topic.name.casefold() in text)
    modules = tuple(sorted({int(number) for number in _MODULE.findall(message)}))
    return Slots(
        kind=kind,
        difficulty=difficulty[1].casefold() if difficulty else None,
        num_items=max(1, min(20, int(count[1]))) if count else None,
        topic_ids=topic_ids,
        modules=modules,
        exam_date=_parse_date(message),
        free_hours_per_day=(
            max(0.0, min(24.0, float(hours[1]))) if hours else None
        ),
    )


def _has_signal(slots: Slots) -> bool:
    return any(
        value not in (None, ())
        for value in (
            slots.kind,
            slots.difficulty,
            slots.num_items,
            slots.topic_ids,
            slots.exam_date,
            slots.free_hours_per_day,
        )
    )


def _parse_payload(raw: str) -> dict:
    text = re.sub(r"<think(?:ing)?>.*?</think(?:ing)?>", "", raw, flags=re.DOTALL)
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("The model did not return a JSON object.")
    payload = json.loads(text[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("The model did not return a JSON object.")
    return payload


def _llm_slots(message: str, topics: list[Topic], today: date) -> Slots:
    names = ", ".join(topic.name for topic in topics) or "(none)"
    response = get_chat_model().invoke(
        [
            SystemMessage(content=load_prompt("slot_extraction")),
            HumanMessage(
                content=(
                    f"Today: {today.isoformat()}\n"
                    f"Available topics: {names}\n"
                    f"Message: {message}"
                )
            ),
        ]
    )
    payload = _parse_payload(_model_text(response))

    kind = payload.get("kind")
    difficulty = payload.get("difficulty")
    count = payload.get("num_items")
    hours = payload.get("free_hours_per_day")
    exam = payload.get("exam_date")
    names = payload.get("topic_names")

    exam_date = None
    if isinstance(exam, str):
        try:
            exam_date = date.fromisoformat(exam)
        except ValueError:
            exam_date = None

    by_name = {topic.name.casefold(): topic.id for topic in topics}
    topic_ids: list[uuid.UUID] = []
    if isinstance(names, list):
        for name in names:
            topic_id = by_name.get(str(name).strip().casefold())
            if topic_id is not None and topic_id not in topic_ids:
                topic_ids.append(topic_id)

    return Slots(
        kind=kind if kind in KINDS else None,
        difficulty=difficulty if difficulty in DIFFICULTIES else None,
        num_items=(
            int(count)
            if isinstance(count, (int, float)) and 1 <= int(count) <= 20
            else None
        ),
        topic_ids=tuple(topic_ids),
        exam_date=exam_date,
        free_hours_per_day=(
            float(hours)
            if isinstance(hours, (int, float)) and 0 <= float(hours) <= 24
            else None
        ),
    )


def extract_slots(message: str, topics: list[Topic]) -> Slots:
    rules = _rules(message, topics)
    if _has_signal(rules) or len(message.split()) < 4:
        return rules
    try:
        slots = _llm_slots(message, topics, date.today())
    except Exception:
        # Slot hints only refine defaults; deterministic rules stay valid.
        return rules
    return replace(slots, modules=rules.modules) if rules.modules else slots
