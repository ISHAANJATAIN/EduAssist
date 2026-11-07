from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_or_create_course
from app.core.errors import AppError
from app.models.mastery import TopicMastery
from app.models.topic import Topic
from app.models.user import User
from app.schemas.planner import MAX_PLANNER_DAYS, MAX_PLANNER_TOPICS, PlanIn
from app.services.tracking.mastery import status_for

BLOCK_MINUTES = 30
MIN_SESSION_MINUTES = BLOCK_MINUTES
REVISION_WINDOW_DAYS = 3
BASE_MINUTES_PER_WEIGHT = 60
WEIGHTS = {"weak": 3, "untested": 2, "developing": 2, "strong": 1}


@dataclass(frozen=True)
class DaySpec:
    day: date
    minutes: int


@dataclass(frozen=True)
class TopicRequirement:
    topic_id: uuid.UUID
    topic_name: str
    weight: int
    study_minutes: int
    revision_required: bool
    prerequisite_ids: tuple[uuid.UUID, ...]
    order: int


@dataclass(frozen=True)
class PlanSpec:
    exam_date: date
    free_hours_per_day: float
    days: list[DaySpec]
    requirements: list[TopicRequirement]
    revision_day_indices: list[int]


def _depth(topic: Topic, by_id: dict[uuid.UUID, Topic], memo, trail) -> int:
    if topic.id in memo:
        return memo[topic.id]
    if topic.id in trail:
        return 0
    prerequisites = [
        prerequisite
        for prerequisite in topic.prerequisites
        if prerequisite.id in by_id
    ]
    value = (
        0
        if not prerequisites
        else 1
        + max(
            _depth(prerequisite, by_id, memo, trail | {topic.id})
            for prerequisite in prerequisites
        )
    )
    memo[topic.id] = value
    return value


def _selected_topics(course, topic_ids: list[uuid.UUID] | None) -> list[Topic]:
    topics = list(course.topics)
    if topic_ids is None:
        selected = topics
    else:
        unique_ids = list(dict.fromkeys(topic_ids))
        if not unique_ids:
            raise AppError(
                "validation_error",
                "Select at least one topic for the plan.",
                422,
            )
        by_id = {topic.id: topic for topic in topics}
        selected = []
        for topic_id in unique_ids:
            topic = by_id.get(topic_id)
            if topic is None:
                raise AppError(
                    "validation_error",
                    "Topics in the plan must belong to this course.",
                    422,
                )
            selected.append(topic)

    if not selected:
        raise AppError(
            "no_material",
            "Add at least one topic before building a plan.",
            409,
        )
    if len(selected) > MAX_PLANNER_TOPICS:
        raise AppError(
            "validation_error",
            f"Select at most {MAX_PLANNER_TOPICS} topics for the plan.",
            422,
        )
    return selected


def build_spec(db: Session, user: User, payload: PlanIn) -> PlanSpec:
    course = get_or_create_course(db, user)
    exam_date = payload.exam_date or course.exam_date
    if exam_date is None:
        raise AppError(
            "validation_error",
            "An exam date is required to build a plan.",
            422,
        )
    today = date.today()
    if exam_date < today:
        raise AppError(
            "validation_error",
            "The exam date cannot be in the past.",
            422,
        )

    if (exam_date - today).days > MAX_PLANNER_DAYS:
        raise AppError(
            "validation_error",
            f"Plan at most {MAX_PLANNER_DAYS} days ahead.",
            422,
        )
    selected = _selected_topics(course, payload.topic_ids)

    free_hours = (
        payload.free_hours_per_day
        if payload.free_hours_per_day is not None
        else course.free_hours_per_day
    )
    overrides = payload.overrides or {}
    for override_day in overrides:
        if override_day < today:
            raise AppError(
                "validation_error",
                "Overrides cannot be in the past.",
                422,
            )
        if override_day >= exam_date:
            raise AppError(
                "validation_error",
                "Overrides must be before the exam date.",
                422,
            )

    days: list[DaySpec] = []
    cursor = today
    while cursor < exam_date:
        hours = overrides.get(cursor, free_hours)
        days.append(DaySpec(day=cursor, minutes=max(0, int(round(hours * 60)))))
        cursor += timedelta(days=1)

    by_id = {topic.id: topic for topic in selected}
    memo: dict[uuid.UUID, int] = {}
    mastery_rows = {
        row.topic_id: row
        for row in db.scalars(
            select(TopicMastery).where(TopicMastery.user_id == user.id)
        )
    }

    requirements: list[TopicRequirement] = []
    for topic in selected:
        row = mastery_rows.get(topic.id)
        mastery = row.mastery if row is not None else 0.0
        attempts = row.attempts if row is not None else 0
        weight = WEIGHTS[status_for(mastery, attempts)]
        requirements.append(
            TopicRequirement(
                topic_id=topic.id,
                topic_name=topic.name,
                weight=weight,
                study_minutes=BASE_MINUTES_PER_WEIGHT * weight,
                revision_required=True,
                prerequisite_ids=tuple(
                    prerequisite.id
                    for prerequisite in topic.prerequisites
                    if prerequisite.id in by_id
                ),
                order=_depth(topic, by_id, memo, set()),
            )
        )

    requirements.sort(
        key=lambda item: (-item.weight, item.order, item.topic_name.casefold())
    )

    window_start = exam_date - timedelta(days=REVISION_WINDOW_DAYS)
    revision_day_indices = [
        index for index, day in enumerate(days) if day.day >= window_start
    ]

    return PlanSpec(
        exam_date=exam_date,
        free_hours_per_day=free_hours,
        days=days,
        requirements=requirements,
        revision_day_indices=revision_day_indices,
    )
