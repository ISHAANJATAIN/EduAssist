from __future__ import annotations

import logging
import uuid
from pathlib import Path

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.document import Document
from app.models.topic import Topic
from app.services.ingestion.chunker import chunk_pages
from app.services.ingestion.parsers import parse_document
from app.services.ingestion.topic_extractor import TopicDraft, extract_topics
from app.services.ingestion.vector_store import add_chunks

logger = logging.getLogger(__name__)
MAX_ERROR_CHARS = 500


def document_path(user_id: uuid.UUID, document_id: uuid.UUID, filename: str) -> Path:
    suffix = Path(filename).suffix.lower()
    return get_settings().upload_dir / str(user_id) / f"{document_id}{suffix}"


def insert_topics(db, course_id: uuid.UUID, drafts: list[TopicDraft]) -> int:
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
        if document is None:
            return

        try:
            path = document_path(document.user_id, document.id, document.filename)
            pages = parse_document(path)
            chunks = chunk_pages(pages)
            if not chunks:
                raise ValueError("No extractable text found in the document.")

            add_chunks(document.user_id, document, chunks)

            document.page_count = len(pages)
            document.chunk_count = len(chunks)

            if document.doc_type == "handout":
                text = "\n".join(page.text for page in pages)
                drafts = extract_topics(text)
                insert_topics(db, document.course_id, drafts)

            document.status = "ready"
            document.error = None
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.exception("Ingestion failed for document %s", document_id)

            failed = db.get(Document, document_id)
            if failed is None:
                return
            failed.status = "failed"
            failed.error = str(exc)[:MAX_ERROR_CHARS] or exc.__class__.__name__
            db.commit()
