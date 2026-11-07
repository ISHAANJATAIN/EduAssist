from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_or_create_course
from app.core.config import get_settings
from app.models.mastery import TopicMastery
from app.models.user import User
from app.schemas.performance import (
    PerformanceOut,
    TopicPerformanceOut,
    TopicStatus,
)
from app.schemas.quiz import AttemptResultOut, MasteryUpdateOut


def status_for(mastery: float, attempts: int) -> TopicStatus:
    if attempts == 0:
        return "untested"

    settings = get_settings()
    if mastery < settings.weak_threshold:
        return "weak"
    if mastery >= settings.strong_threshold and attempts >= 2:
        return "strong"
    return "developing"


def topic_scores(results: list[AttemptResultOut]) -> dict[uuid.UUID, float]:
    buckets: dict[uuid.UUID, list[bool]] = defaultdict(list)
    for result in results:
        buckets[result.topic_id].append(result.correct)
    return {
        topic_id: round(sum(hits) * 100 / len(hits), 1)
        for topic_id, hits in buckets.items()
    }


def apply_attempt(
    db: Session, user: User, results: list[AttemptResultOut]
) -> list[MasteryUpdateOut]:
    updates: list[MasteryUpdateOut] = []

    for topic_id, score in topic_scores(results).items():
        row = db.get(TopicMastery, (user.id, topic_id))
        old = row.mastery if row is not None else 0.0
        first_attempt = row is None or row.attempts == 0
        new = score if first_attempt else round(0.6 * score + 0.4 * old, 1)

        if row is None:
            row = TopicMastery(
                user_id=user.id,
                topic_id=topic_id,
                mastery=0.0,
                attempts=0,
            )
            db.add(row)
        row.mastery = new
        row.attempts += 1
        row.last_score = score

        updates.append(MasteryUpdateOut(topic_id=topic_id, old=old, new=new))

    db.flush()
    return updates


def performance_for(db: Session, user: User) -> PerformanceOut:
    course = get_or_create_course(db, user)
    rows = {
        row.topic_id: row
        for row in db.scalars(
            select(TopicMastery).where(TopicMastery.user_id == user.id)
        )
    }

    topics: list[TopicPerformanceOut] = []
    for topic in course.topics:
        row = rows.get(topic.id)
        mastery = row.mastery if row is not None else 0.0
        attempts = row.attempts if row is not None else 0
        last_score = row.last_score if row is not None else None
        topics.append(
            TopicPerformanceOut(
                topic_id=topic.id,
                topic_name=topic.name,
                mastery=round(mastery, 1),
                attempts=attempts,
                last_score=round(last_score, 1) if last_score is not None else None,
                status=status_for(mastery, attempts),
            )
        )

    return PerformanceOut(
        topics=topics,
        weak_topic_ids=[topic.topic_id for topic in topics if topic.status == "weak"],
        strong_topic_ids=[
            topic.topic_id for topic in topics if topic.status == "strong"
        ],
    )
