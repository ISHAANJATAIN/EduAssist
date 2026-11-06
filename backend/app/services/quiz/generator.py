from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.course import Course
from app.models.quiz import Quiz
from app.models.topic import Topic
from app.models.user import User
from app.prompts import load_prompt
from app.schemas.quiz import (
    FlashcardOut,
    QuizCreateIn,
    QuizOut,
    QuizQuestionOut,
    SourceOut,
)
from app.services.ingestion.vector_store import ChunkMatch, query
from app.services.llm.client import get_chat_model

CHUNKS_PER_TOPIC = 3
MAX_EXCERPTS = 40
OPTION_PREFIX = re.compile(r"^[A-Da-d][).:]\s+")
NEGATIVE_QUESTION = re.compile(r"\b(not|except|false|incorrect)\b", re.IGNORECASE)

LLM_ERROR = "The language model could not build the quiz right now. Please try again."
NO_MATERIAL = (
    "Upload study material and wait for it to finish processing, "
    "then add or extract topics first."
)


class _Draft(BaseModel):
    topic_index: int | None = None
    excerpt: int | None = None
    question: str | None = None
    options: list[str] | None = None
    correct_index: int | None = None
    explanation: str | None = None
    front: str | None = None
    back: str | None = None


@dataclass(frozen=True)
class _Excerpt:
    topic_index: int
    chunk: ChunkMatch


def _extract_json(raw: str) -> list:
    text = re.sub(r"<think(?:ing)?>.*?</think(?:ing)?>", "", raw, flags=re.DOTALL)
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1)

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end <= start:
        raise ValueError("The model did not return a JSON list.")
    payload = json.loads(text[start : end + 1])
    if not isinstance(payload, list):
        raise ValueError("The model did not return a JSON list.")
    return payload


def _model_text(response) -> str:
    content = response.content
    if isinstance(content, list):
        return "".join(
            part.get("text", "") if isinstance(part, dict) else str(part)
            for part in content
        ).strip()
    return str(content).strip()


def _invoke(system: str, human: str) -> str:
    try:
        response = get_chat_model().invoke(
            [SystemMessage(content=system), HumanMessage(content=human)]
        )
    except AppError:
        raise
    except Exception as exc:
        raise AppError("llm_unavailable", LLM_ERROR, 503) from exc
    return _model_text(response)


def _topic_query(topic: Topic) -> str:
    return " ".join(part for part in (topic.name, topic.description or "") if part)


def _collect(user_id: uuid.UUID, topics: list[Topic]) -> tuple[list[Topic], list[_Excerpt]]:
    active: list[Topic] = []
    excerpts: list[_Excerpt] = []

    for topic in topics:
        remaining = MAX_EXCERPTS - len(excerpts)
        if remaining <= 0:
            break
        matches = query(user_id, _topic_query(topic), k=min(CHUNKS_PER_TOPIC, remaining))
        if not matches:
            continue
        active.append(topic)
        topic_index = len(active)
        excerpts.extend(_Excerpt(topic_index, match) for match in matches)

    return active, excerpts


def _format_topics(topics: list[Topic]) -> str:
    lines = []
    for index, topic in enumerate(topics, start=1):
        description = f" — {topic.description}" if topic.description else ""
        lines.append(f"{index}. {topic.name}{description}")
    return "\n".join(lines)


def _format_excerpts(excerpts: list[_Excerpt]) -> str:
    blocks = []
    for number, excerpt in enumerate(excerpts, start=1):
        chunk = excerpt.chunk
        blocks.append(
            f"[{number}] (topic {excerpt.topic_index}) "
            f"{chunk.filename}, page {chunk.page}\n{chunk.text}"
        )
    return "\n\n".join(blocks)


def _human_message(
    payload: QuizCreateIn, topics: list[Topic], excerpts: list[_Excerpt]
) -> str:
    return (
        f"Difficulty: {payload.difficulty}\n"
        f"Item count: {payload.num_items}\n\n"
        f"Topics:\n{_format_topics(topics)}\n\n"
        f"Excerpts:\n{_format_excerpts(excerpts)}"
    )


def _text(value: str | None, limit: int) -> str:
    return (value or "").strip()[:limit]


def _normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.casefold()))


def _build_quiz_item(
    entry: object, topics: list[Topic], excerpts: list[_Excerpt]
) -> dict:
    if not isinstance(entry, dict):
        raise ValueError("Every item must be a JSON object.")
    draft = _Draft.model_validate(entry)

    question = _text(draft.question, 500)
    options = [
        OPTION_PREFIX.sub("", _text(option, 200))
        for option in (draft.options or [])
    ]
    if not question:
        raise ValueError("An item is missing its question.")
    if NEGATIVE_QUESTION.search(question):
        raise ValueError(
            "Questions must be phrased positively without not, except, or false."
        )
    if len(options) != 4 or any(not option for option in options):
        raise ValueError("Every question needs exactly four non-empty options.")
    if len(set(options)) != 4:
        raise ValueError("Options within a question must be distinct.")
    if draft.correct_index is None or not 0 <= draft.correct_index < 4:
        raise ValueError("correct_index must be between 0 and 3.")

    topic, chunk = _source(draft, topics, excerpts)
    explanation = _text(draft.explanation, 500) or (
        f"The correct answer is {options[draft.correct_index]}."
    )

    return {
        "id": uuid.uuid4().hex,
        "topic_id": str(topic.id),
        "question": question,
        "options": options,
        "correct_index": draft.correct_index,
        "explanation": explanation,
        "source": {"filename": chunk.filename, "page": chunk.page},
    }


def _build_flashcard_item(
    entry: object, topics: list[Topic], excerpts: list[_Excerpt]
) -> dict:
    if not isinstance(entry, dict):
        raise ValueError("Every item must be a JSON object.")
    draft = _Draft.model_validate(entry)

    front = _text(draft.front, 300)
    back = _text(draft.back, 800)
    if not front or not back:
        raise ValueError("Every flashcard needs a front and a back.")

    topic, chunk = _source(draft, topics, excerpts)
    return {
        "id": uuid.uuid4().hex,
        "topic_id": str(topic.id),
        "front": front,
        "back": back,
        "source": {"filename": chunk.filename, "page": chunk.page},
    }


def _source(
    draft: _Draft, topics: list[Topic], excerpts: list[_Excerpt]
) -> tuple[Topic, ChunkMatch]:
    if draft.topic_index is None or not 1 <= draft.topic_index <= len(topics):
        raise ValueError("topic_index is missing or out of range.")
    if draft.excerpt is None or not 1 <= draft.excerpt <= len(excerpts):
        raise ValueError("excerpt is missing or out of range.")

    excerpt = excerpts[draft.excerpt - 1]
    if excerpt.topic_index != draft.topic_index:
        raise ValueError("The excerpt does not belong to the stated topic.")

    return topics[draft.topic_index - 1], excerpt.chunk


def _collect_items(raw: str, build) -> tuple[list[dict], str | None]:
    items: list[dict] = []
    last_error: str | None = None

    for entry in _extract_json(raw):
        try:
            items.append(build(entry))
        except ValueError as exc:
            last_error = str(exc)

    return items, last_error


def _retry_message(
    human: str, last_error: str, items: list[dict], missing: int, label: str
) -> str:
    written = "; ".join(_text(item[label], 200) for item in items)
    avoid = f" Do not repeat these: {written}." if written else ""
    return (
        f"{human}\n\nYour previous reply was invalid: {last_error} "
        f"Write exactly {missing} new item(s).{avoid} "
        "Reply again with JSON only, following the output shape exactly."
    )


def _generate_items(
    payload: QuizCreateIn, topics: list[Topic], excerpts: list[_Excerpt]
) -> list[dict]:
    prompt_name = (
        "quiz_generation" if payload.kind == "quiz" else "flashcard_generation"
    )
    system = load_prompt(prompt_name)
    human = _human_message(payload, topics, excerpts)

    if payload.kind == "quiz":
        label = "question"

        def build(entry: object) -> dict:
            return _build_quiz_item(entry, topics, excerpts)

    else:
        label = "front"

        def build(entry: object) -> dict:
            return _build_flashcard_item(entry, topics, excerpts)

    items: list[dict] = []
    seen: set[str] = set()
    last_error = "No usable items were returned."

    for attempt in range(2):
        if attempt:
            human = _retry_message(
                human, last_error, items, payload.num_items - len(items), label
            )

        raw = _invoke(system, human)
        try:
            batch, error = _collect_items(raw, build)
        except ValueError as exc:
            batch, error = [], str(exc)

        for item in batch:
            key = _normalize(item[label])
            if key and key not in seen:
                seen.add(key)
                items.append(item)

        if len(items) >= payload.num_items:
            return items[: payload.num_items]
        last_error = error or "No usable items were returned."

    if items:
        return items[: payload.num_items]
    raise AppError("llm_unavailable", LLM_ERROR, 503)


def _select_topics(
    user: User, payload: QuizCreateIn, db: Session
) -> list[Topic]:
    course = db.scalar(select(Course).where(Course.user_id == user.id))
    if course is None:
        raise AppError("no_material", NO_MATERIAL, 409)

    if payload.topic_ids:
        topics: list[Topic] = []
        for topic_id in dict.fromkeys(payload.topic_ids):
            topic = db.get(Topic, topic_id)
            if topic is None or topic.course_id != course.id:
                raise AppError(
                    "validation_error",
                    "topic_ids: every topic must belong to this course.",
                    422,
                )
            topics.append(topic)
        return topics

    return list(
        db.scalars(
            select(Topic).where(Topic.course_id == course.id).order_by(Topic.name)
        ).all()
    )


def create_quiz(user: User, payload: QuizCreateIn, db: Session) -> QuizOut:
    topics = _select_topics(user, payload, db)
    if not topics:
        raise AppError("no_material", NO_MATERIAL, 409)

    active, excerpts = _collect(user.id, topics)
    if not active:
        raise AppError("no_material", NO_MATERIAL, 409)

    items = _generate_items(payload, active, excerpts)

    quiz = Quiz(
        user_id=user.id,
        kind=payload.kind,
        difficulty=payload.difficulty,
        topic_ids=[str(topic.id) for topic in active],
        items=items,
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz_to_out(quiz)


def _source_out(item: dict) -> SourceOut:
    source = item.get("source") or {}
    return SourceOut(
        filename=str(source.get("filename", "")),
        page=source.get("page"),
    )


def quiz_to_out(quiz: Quiz) -> QuizOut:
    items = []
    for item in quiz.items or []:
        topic_id = uuid.UUID(str(item["topic_id"]))
        if quiz.kind == "quiz":
            items.append(
                QuizQuestionOut(
                    id=item["id"],
                    topic_id=topic_id,
                    question=item["question"],
                    options=item["options"],
                    source=_source_out(item),
                )
            )
        else:
            items.append(
                FlashcardOut(
                    id=item["id"],
                    topic_id=topic_id,
                    front=item["front"],
                    back=item["back"],
                    source=_source_out(item),
                )
            )

    return QuizOut(
        id=quiz.id,
        kind=quiz.kind,
        difficulty=quiz.difficulty,
        topic_ids=[uuid.UUID(str(value)) for value in quiz.topic_ids or []],
        items=items,
    )


def get_quiz(user: User, quiz_id: uuid.UUID, db: Session) -> Quiz:
    quiz = db.get(Quiz, quiz_id)
    if quiz is None or quiz.user_id != user.id:
        raise AppError("not_found", "Quiz not found.", 404)
    return quiz
