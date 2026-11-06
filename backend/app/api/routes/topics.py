from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, get_or_create_course
from app.core.errors import AppError
from app.models.document import Document
from app.models.topic import Topic
from app.schemas.topic import TopicIn, TopicOut
from app.services.ingestion.parsers import parse_document
from app.services.ingestion.pipeline import document_path, insert_topics
from app.services.ingestion.topic_extractor import extract_topics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/topics", tags=["topics"])


def _topic_for(db, course, topic_id: uuid.UUID) -> Topic:
    topic = db.get(Topic, topic_id)
    if topic is None or topic.course_id != course.id:
        raise AppError("not_found", "Topic not found.", 404)
    return topic


def _ensure_unique_name(
    db, course, name: str, exclude_id: uuid.UUID | None = None
) -> None:
    query = select(Topic.id).where(
        Topic.course_id == course.id,
        func.lower(Topic.name) == name.lower(),
    )
    if exclude_id is not None:
        query = query.where(Topic.id != exclude_id)
    if db.scalar(query) is not None:
        raise AppError(
            "validation_error",
            "A topic with this name already exists.",
            422,
        )


def _resolve_prerequisites(db, course, ids: list[uuid.UUID]) -> list[Topic]:
    resolved: list[Topic] = []
    for prerequisite_id in dict.fromkeys(ids):
        prerequisite = db.get(Topic, prerequisite_id)
        if prerequisite is None or prerequisite.course_id != course.id:
            raise AppError(
                "validation_error",
                "Prerequisite topics must belong to this course.",
                422,
            )
        resolved.append(prerequisite)
    return resolved


def _ensure_acyclic(topic: Topic, prerequisites: list[Topic]) -> None:
    stack = list(prerequisites)
    seen: set[uuid.UUID] = set()
    while stack:
        current = stack.pop()
        if current.id == topic.id:
            raise AppError(
                "validation_error",
                "That prerequisite chain would create a cycle.",
                422,
            )
        if current.id in seen:
            continue
        seen.add(current.id)
        stack.extend(current.prerequisites)


def _list_topics(db, course_id: uuid.UUID) -> list[TopicOut]:
    topics = db.scalars(
        select(Topic).where(Topic.course_id == course_id).order_by(Topic.name)
    ).all()
    return [TopicOut.from_topic(topic) for topic in topics]


@router.get("", response_model=list[TopicOut])
def list_topics(db: DbSession, user: CurrentUser) -> list[TopicOut]:
    course = get_or_create_course(db, user)
    return _list_topics(db, course.id)


@router.post("", response_model=TopicOut)
def create_topic(payload: TopicIn, db: DbSession, user: CurrentUser) -> TopicOut:
    course = get_or_create_course(db, user)
    _ensure_unique_name(db, course, payload.name)
    topic = Topic(
        course_id=course.id,
        name=payload.name,
        description=payload.description,
    )
    db.add(topic)
    db.flush()

    topic.prerequisites = _resolve_prerequisites(db, course, payload.prerequisite_ids)
    db.commit()
    db.refresh(topic)
    return TopicOut.from_topic(topic)


@router.put("/{topic_id}", response_model=TopicOut)
def update_topic(
    topic_id: uuid.UUID, payload: TopicIn, db: DbSession, user: CurrentUser
) -> TopicOut:
    course = get_or_create_course(db, user)
    topic = _topic_for(db, course, topic_id)
    _ensure_unique_name(db, course, payload.name, exclude_id=topic.id)

    prerequisites = _resolve_prerequisites(db, course, payload.prerequisite_ids)
    if any(prerequisite.id == topic.id for prerequisite in prerequisites):
        raise AppError(
            "validation_error",
            "A topic cannot be its own prerequisite.",
            422,
        )
    _ensure_acyclic(topic, prerequisites)

    topic.name = payload.name
    topic.description = payload.description
    topic.prerequisites = prerequisites
    db.commit()
    db.refresh(topic)
    return TopicOut.from_topic(topic)


@router.delete(
    "/{topic_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_topic(topic_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    course = get_or_create_course(db, user)
    topic = _topic_for(db, course, topic_id)
    db.delete(topic)
    db.commit()


@router.post("/extract", response_model=list[TopicOut])
def extract_from_handouts(db: DbSession, user: CurrentUser) -> list[TopicOut]:
    course = get_or_create_course(db, user)
    handouts = db.scalars(
        select(Document).where(
            Document.user_id == user.id,
            Document.doc_type == "handout",
            Document.status == "ready",
        )
    ).all()

    if not handouts:
        raise AppError(
            "no_material",
            "Upload a handout and wait for it to finish processing first.",
            409,
        )

    texts: list[str] = []
    for handout in handouts:
        try:
            pages = parse_document(
                document_path(handout.user_id, handout.id, handout.filename)
            )
        except Exception:
            logger.warning("Could not read handout %s", handout.id, exc_info=True)
            continue
        texts.append("\n".join(page.text for page in pages))

    if not texts:
        raise AppError(
            "no_material",
            "The uploaded handouts have no extractable text.",
            409,
        )

    drafts = extract_topics("\n\n".join(texts))
    insert_topics(db, course.id, drafts)
    db.commit()
    return _list_topics(db, course.id)
