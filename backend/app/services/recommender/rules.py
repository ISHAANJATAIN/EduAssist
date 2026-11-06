from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.deps import get_or_create_course
from app.core.config import get_settings
from app.models.topic import Topic
from app.models.user import User
from app.schemas.performance import RecommendationOut, TopicPerformanceOut
from app.services.tracking.mastery import performance_for

_ACTION_ORDER = {"prerequisite_first": 0, "revise": 0, "take_quiz": 1, "maintain": 2}


def _reason(
    action: str,
    topic: Topic,
    performance: TopicPerformanceOut,
    weak_names: list[str],
) -> str:
    if action == "prerequisite_first":
        if len(weak_names) == 1:
            return (
                f"{weak_names[0]} is still weak — revise it before {topic.name}."
            )
        return (
            f"{', '.join(weak_names[:-1])} and {weak_names[-1]} are still weak "
            f"— revise them before {topic.name}."
        )
    if action == "revise":
        return (
            f"Last score was {performance.last_score:.0f}% after "
            f"{performance.attempts} attempts. Re-read the material and try again."
        )
    if action == "take_quiz":
        return "No attempts yet. Take a quiz to set a baseline."
    return (
        f"Mastery is {performance.mastery:.0f}% across {performance.attempts} "
        "attempts. A short refresher keeps it fresh."
    )


def recommendations_for(db: Session, user: User) -> list[RecommendationOut]:
    course = get_or_create_course(db, user)
    performance = performance_for(db, user)
    weak_ids = set(performance.weak_topic_ids)
    by_topic = {topic.topic_id: topic for topic in performance.topics}
    threshold = get_settings().weak_threshold

    recommendations: list[RecommendationOut] = []
    for topic in course.topics:
        current = by_topic[topic.id]
        weak_prerequisites = [
            prerequisite
            for prerequisite in topic.prerequisites
            if prerequisite.id in weak_ids
        ]

        if weak_prerequisites:
            action, rule_id = "prerequisite_first", "R3"
            weak_names = [prerequisite.name for prerequisite in weak_prerequisites]
        elif (
            current.attempts >= 2
            and current.last_score is not None
            and current.last_score < threshold
        ):
            action, rule_id, weak_names = "revise", "R1", []
        elif current.attempts == 0:
            action, rule_id, weak_names = "take_quiz", "R2", []
        elif current.status == "strong":
            action, rule_id, weak_names = "maintain", "R4", []
        else:
            continue

        recommendations.append(
            RecommendationOut(
                topic_id=topic.id,
                topic_name=topic.name,
                action=action,
                reason=_reason(action, topic, current, weak_names),
                rule_id=rule_id,
            )
        )

    return sorted(
        recommendations,
        key=lambda item: (
            _ACTION_ORDER[item.action],
            item.topic_name.casefold(),
        ),
    )
