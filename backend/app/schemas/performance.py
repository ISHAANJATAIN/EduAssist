import uuid
from typing import Literal

from pydantic import BaseModel

TopicStatus = Literal["untested", "weak", "developing", "strong"]
RecommendationAction = Literal["revise", "prerequisite_first", "take_quiz", "maintain"]


class TopicPerformanceOut(BaseModel):
    topic_id: uuid.UUID
    topic_name: str
    mastery: float
    attempts: int
    last_score: float | None
    status: TopicStatus


class PerformanceOut(BaseModel):
    topics: list[TopicPerformanceOut]
    weak_topic_ids: list[uuid.UUID]
    strong_topic_ids: list[uuid.UUID]


class RecommendationOut(BaseModel):
    topic_id: uuid.UUID
    topic_name: str
    action: RecommendationAction
    reason: str
    rule_id: str
