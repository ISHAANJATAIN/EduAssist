from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, String, Table, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.course import Course

topic_prerequisites = Table(
    "topic_prerequisites",
    Base.metadata,
    Column("topic_id", Uuid, ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "prerequisite_id",
        Uuid,
        ForeignKey("topics.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    course: Mapped[Course] = relationship(back_populates="topics")
    prerequisites: Mapped[list[Topic]] = relationship(
        secondary=topic_prerequisites,
        primaryjoin="Topic.id == topic_prerequisites.c.topic_id",
        secondaryjoin="Topic.id == topic_prerequisites.c.prerequisite_id",
        lazy="selectin",
    )
