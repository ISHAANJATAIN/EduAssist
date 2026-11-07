from __future__ import annotations

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.chat import ChatMessage
from app.models.course import Course
from app.models.topic import Topic
from app.models.user import User
from app.schemas.chat import (
    ChatIn,
    ChatOut,
    ClarifyReply,
    PerformanceReply,
    PlanReply,
    QuizReply,
)
from app.schemas.planner import PlanIn
from app.schemas.quiz import QuizCreateIn
from app.services.agent.intent import CLARIFY, detect_intent
from app.services.agent.slots import extract_slots
from app.services.planner.csp import create_plan
from app.services.quiz.generator import create_quiz
from app.services.rag.chain import answer
from app.services.recommender.rules import recommendations_for
from app.services.tracking.mastery import performance_for

CLARIFY_INTENT = (
    "I can answer questions from your material, make a quiz or flashcards, "
    "show your progress, or build a study plan. Which one would you like?"
)
CLARIFY_EXAM_DATE = (
    "I need your exam date before I can build a study plan. Tell me the date "
    'with your request, for example "Plan my revision for 2026-12-01".'
)


def _course(db: Session, user: User) -> Course | None:
    return db.scalar(select(Course).where(Course.user_id == user.id))


def _topics(db: Session, course: Course | None) -> list[Topic]:
    if course is None:
        return []
    return list(
        db.scalars(
            select(Topic).where(Topic.course_id == course.id).order_by(Topic.name)
        )
    )


def _quiz_reply(
    user: User, message: str, topics: list[Topic], db: Session
) -> QuizReply:
    slots = extract_slots(message, topics)
    payload = QuizCreateIn(
        kind=slots.kind or "quiz",
        difficulty=slots.difficulty or "medium",
        num_items=slots.num_items or 5,
        topic_ids=list(slots.topic_ids),
    )
    return QuizReply(quiz=create_quiz(user, payload, db))


def _planner_reply(
    user: User,
    message: str,
    course: Course | None,
    topics: list[Topic],
    db: Session,
) -> tuple[str, PlanReply | ClarifyReply]:
    slots = extract_slots(message, topics)
    exam_date = slots.exam_date or (course.exam_date if course else None)
    if exam_date is None:
        return CLARIFY, ClarifyReply(text=CLARIFY_EXAM_DATE, missing=["exam_date"])

    try:
        payload = PlanIn(
            exam_date=exam_date,
            free_hours_per_day=slots.free_hours_per_day,
            topic_ids=list(slots.topic_ids) or None,
        )
    except ValidationError as exc:
        raise AppError("validation_error", exc.errors()[0]["msg"], 422) from exc
    return "planner", PlanReply(plan=create_plan(db, user, payload))


def dispatch(user: User, payload: ChatIn, db: Session) -> ChatOut:
    user_id = user.id
    db.scalar(select(User).where(User.id == user_id).with_for_update())
    db.expire_all()
    requested = payload.intent or detect_intent(payload.message)
    course = _course(db, user)
    topics = _topics(db, course)

    if requested == "rag":
        intent = "rag"
        reply = answer(user.id, payload.message)
    elif requested == "quiz":
        intent = "quiz"
        reply = _quiz_reply(user, payload.message, topics, db)
    elif requested == "tracker":
        intent = "tracker"
        reply = PerformanceReply(
            summary=performance_for(db, user),
            recommendations=recommendations_for(db, user),
        )
    elif requested == "planner":
        intent, reply = _planner_reply(user, payload.message, course, topics, db)
    else:
        intent = CLARIFY
        reply = ClarifyReply(text=CLARIFY_INTENT, missing=[])

    user_row = ChatMessage(
        user_id=user.id,
        role="user",
        intent=intent,
        payload={"text": payload.message},
    )
    db.add(user_row)
    db.flush()

    assistant_row = ChatMessage(
        user_id=user.id,
        role="assistant",
        intent=None,
        payload=reply.model_dump(mode="json"),
    )
    db.add(assistant_row)
    db.commit()
    db.refresh(assistant_row)

    return ChatOut(message_id=assistant_row.id, intent=intent, reply=reply)
