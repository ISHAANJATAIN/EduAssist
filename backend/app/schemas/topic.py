from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Annotated

from pydantic import BaseModel, Field, StringConstraints

if TYPE_CHECKING:
    from app.models.topic import Topic

TopicName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)
]


class TopicIn(BaseModel):
    name: TopicName
    description: str | None = None
    prerequisite_ids: list[uuid.UUID] = Field(default_factory=list)


class TopicOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    prerequisite_ids: list[uuid.UUID] = Field(default_factory=list)

    @classmethod
    def from_topic(cls, topic: Topic) -> TopicOut:
        return cls(
            id=topic.id,
            name=topic.name,
            description=topic.description,
            prerequisite_ids=[p.id for p in topic.prerequisites],
        )
