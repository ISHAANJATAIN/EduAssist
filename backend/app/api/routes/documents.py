from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, get_or_create_course
from app.core.config import get_settings
from app.core.errors import AppError
from app.models.document import Document
from app.schemas.document import DocType, DocumentOut
from app.services.ingestion.parsers import SUPPORTED_EXTENSIONS
from app.services.ingestion.pipeline import document_path, ingest_document
from app.services.ingestion.vector_store import delete_by_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

READ_CHUNK_BYTES = 1024 * 1024


def _document_for(db, user, document_id: uuid.UUID) -> Document:
    document = db.get(Document, document_id)
    if document is None or document.user_id != user.id:
        raise AppError("not_found", "Document not found.", 404)
    return document


def _save_upload(file: UploadFile, destination: Path) -> None:
    settings = get_settings()
    limit = settings.max_upload_mb * 1024 * 1024
    written = 0

    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open("wb") as output:
            while chunk := file.file.read(READ_CHUNK_BYTES):
                written += len(chunk)
                if written > limit:
                    raise AppError(
                        "file_too_large",
                        f"Files must be {settings.max_upload_mb} MB or smaller.",
                        413,
                    )
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    if written == 0:
        destination.unlink(missing_ok=True)
        raise AppError("validation_error", "The uploaded file is empty.", 422)


@router.post("", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
def upload_document(
    background: BackgroundTasks,
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
    doc_type: DocType = Form(...),
) -> Document:
    filename = Path(file.filename or "").name.strip()
    suffix = Path(filename).suffix.lower()
    if not filename or suffix not in SUPPORTED_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise AppError(
            "unsupported_file_type",
            f"Unsupported file type. Allowed: {allowed}.",
            415,
        )

    course = get_or_create_course(db, user)
    document = Document(
        user_id=user.id,
        course_id=course.id,
        filename=filename,
        doc_type=doc_type,
        status="processing",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    try:
        _save_upload(
            file,
            document_path(document.user_id, document.id, document.filename),
        )
    except Exception:
        db.delete(document)
        db.commit()
        raise

    background.add_task(ingest_document, document.id)
    return document


@router.get("", response_model=list[DocumentOut])
def list_documents(db: DbSession, user: CurrentUser) -> list[Document]:
    return list(
        db.scalars(
            select(Document)
            .where(Document.user_id == user.id)
            .order_by(Document.uploaded_at.desc())
        ).all()
    )


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Document:
    return _document_for(db, user, document_id)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_document(document_id: uuid.UUID, db: DbSession, user: CurrentUser) -> None:
    document = _document_for(db, user, document_id)

    try:
        delete_by_document(user.id, document.id)
    except Exception:
        logger.warning("Could not remove vectors for document %s", document.id, exc_info=True)

    document_path(document.user_id, document.id, document.filename).unlink(
        missing_ok=True
    )
    db.delete(document)
    db.commit()
