from __future__ import annotations

import logging
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.course import Course
from app.models.document import Document
from app.models.topic import Topic
from app.models.user import User
from app.services.ingestion.chunker import chunk_pages
from app.services.ingestion.parsers import parse_document
from app.services.ingestion.topic_extractor import TopicDraft, extract_topics
from app.services.ingestion.vector_store import add_chunks, delete_by_document

logger = logging.getLogger(__name__)
MAX_DOCUMENT_CHUNKS = 5000
PUBLIC_INGESTION_ERROR = (
    "Document processing failed. Please delete the document and upload it again."
)


def lock_user(db, user_id: uuid.UUID) -> User | None:
    """Serialize publication and cleanup on the same PostgreSQL owner row."""
    return db.scalar(select(User).where(User.id == user_id).with_for_update())


def _current_document(db, document_id: uuid.UUID) -> Document | None:
    return db.scalar(
        select(Document)
        .where(Document.id == document_id)
        .execution_options(populate_existing=True)
    )


def document_path(user_id: uuid.UUID, document_id: uuid.UUID, filename: str) -> Path:
    suffix = Path(filename).suffix.lower()
    return get_settings().upload_dir / str(user_id) / f"{document_id}{suffix}"


def insert_topics(db, course_id: uuid.UUID, drafts: list[TopicDraft]) -> int:
    # All topic writers share this lock. Owner lock, when needed, comes first.
    course = db.scalar(select(Course).where(Course.id == course_id).with_for_update())
    if course is None:
        raise AppError("not_found", "Course not found.", 404)
    existing = {
        name.casefold()
        for name in db.scalars(
            select(Topic.name).where(Topic.course_id == course_id)
        ).all()
    }

    added = 0
    for draft in drafts:
        key = draft.name.casefold()
        if key in existing:
            continue
        db.add(
            Topic(
                course_id=course_id,
                name=draft.name,
                description=draft.description,
            )
        )
        existing.add(key)
        added += 1
    return added


def ingest_document(document_id: uuid.UUID) -> None:
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        if document is None or document.status != "processing":
            return
        user_id = document.user_id
        filename = document.filename
        doc_type = document.doc_type
        # Parsing/LLM calls must not hold the owner lock or a stale transaction.
        db.rollback()
        publication_attempted = False
        try:
            pages = parse_document(document_path(user_id, document_id, filename))
            chunks = chunk_pages(pages)
            if not chunks:
                raise ValueError("No extractable text found in the document.")
            if len(chunks) > MAX_DOCUMENT_CHUNKS:
                raise AppError("document_too_complex", "Document exceeds processing limits.", 413)
            drafts = []
            if doc_type == "handout":
                drafts = extract_topics("\n".join(page.text for page in pages))

            if lock_user(db, user_id) is None:
                return
            document = _current_document(db, document_id)
            if document is None or document.status != "processing":
                return

            publication_attempted = True
            add_chunks(user_id, document, chunks)
            if doc_type == "handout":
                insert_topics(db, document.course_id, drafts)
            document.page_count = len(pages)
            document.chunk_count = len(chunks)
            document.status = "ready"
            document.error = None
            db.commit()
        except Exception:
            logger.exception("Ingestion failed for document %s", document_id)
            # A failed SQL transaction cannot keep a row lock. Reacquire it
            # before cleanup; an intervening deletion/publication must win.
            db.rollback()
            if lock_user(db, user_id) is None:
                return
            failed = _current_document(db, document_id)
            if failed is None or failed.status != "processing":
                return
            if publication_attempted:
                try:
                    delete_by_document(user_id, document_id)
                except Exception as exc:
                    logger.exception("Ingestion vector cleanup failed for document %s", document_id)
                    # Keep processing metadata for a retry. Retrieval excludes
                    # non-ready rows even if Chroma cleanup is unavailable.
                    raise AppError("cleanup_failed", "Document cleanup failed. Please retry deletion.", 503) from exc
            failed.status = "failed"
            failed.error = PUBLIC_INGESTION_ERROR
            db.commit()
