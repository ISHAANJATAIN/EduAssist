from __future__ import annotations

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import AppError
from app.models.course import Course
from app.models.document import Document
from app.schemas.document import DocType, DocumentOut
from app.services.ingestion.parsers import SUPPORTED_EXTENSIONS
from app.services.ingestion.pipeline import document_path, ingest_document, lock_user
from app.services.ingestion.vector_store import delete_by_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

READ_CHUNK_BYTES = 1024 * 1024


def _document_for(db, user, document_id: uuid.UUID) -> Document:
    document = db.get(Document, document_id, populate_existing=True)
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
        if written == 0:
            raise AppError("validation_error", "The uploaded file is empty.", 422)
    except Exception:
        try:
            destination.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Could not clean failed upload %s", destination, exc_info=True)
            raise AppError("cleanup_failed", "Upload cleanup failed. Please retry deletion.", 503) from exc
        raise


def _rollback_upload(db, user_id, destination, metadata, *, retain_file: bool) -> bool:
    """Compensate only after rollback and a locked check of the commit outcome."""
    try:
        db.rollback()
        if destination is None:
            return False
        if lock_user(db, user_id) is None:
            raise AppError("cleanup_failed", "Upload recovery could not complete. Please retry.", 503)
        persisted = db.get(Document, metadata["id"], populate_existing=True)
        if persisted is not None:
            # A failed acknowledgement does not prove that the commit failed.
            return False

        if not retain_file:
            try:
                destination.unlink(missing_ok=True)
                return False
            except OSError:
                logger.warning("Could not clean rolled-back upload %s", destination, exc_info=True)

        # Preserve the exact ID, owner and filename for deletion/privacy retry.
        # The original course may have been inserted in the rolled-back tx.
        course = db.scalar(select(Course).where(Course.user_id == user_id))
        if course is None:
            course = Course(user_id=user_id)
            db.add(course)
            db.flush()
        db.add(Document(
            **metadata,
            course_id=course.id,
            status="failed",
            error="Upload failed. Please retry deletion.",
        ))
        db.commit()
        return True
    except Exception as exc:
        # If SQL is unavailable we cannot prove non-persistence or guarantee
        # retry metadata. Keep the file rather than risk deleting committed data.
        logger.warning("Could not recover failed upload for user %s", user_id, exc_info=True)
        try:
            db.rollback()
        except Exception:
            logger.warning("Could not roll back upload recovery", exc_info=True)
        raise AppError("cleanup_failed", "Upload recovery could not complete. Please retry.", 503) from exc


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

    user_id = user.id
    destination = None
    metadata = {}
    save_error = None
    try:
        if lock_user(db, user_id) is None:
            raise AppError("not_found", "User not found.", 404)
        course = db.scalar(select(Course).where(Course.user_id == user_id))
        if course is None:
            course = Course(user_id=user_id)
            db.add(course)
            db.flush()
        document = Document(
            user_id=user_id,
            course_id=course.id,
            filename=filename,
            doc_type=doc_type,
            status="processing",
        )
        db.add(document)
        db.flush()
        # Snapshot before rollback can expire/detach the ORM objects.
        metadata = dict(id=document.id, user_id=user_id, filename=filename, doc_type=doc_type)
        destination = document_path(user_id, document.id, filename)
        try:
            _save_upload(file, destination)
        except AppError as exc:
            if exc.code != "cleanup_failed":
                raise
            save_error = exc
            document.status = "failed"
            document.error = "Upload failed. Please retry deletion."
        # Both successful uploads and partial-file retry metadata must commit
        # inside compensation, not after the file-save exception handlers.
        db.commit()
    except Exception as exc:
        retained = _rollback_upload(
            db, user_id, destination, metadata, retain_file=save_error is not None,
        )
        if retained or save_error is not None:
            raise AppError("cleanup_failed", "Upload cleanup failed. Please retry deletion.", 503) from exc
        if isinstance(exc, AppError):
            raise
        logger.warning("Could not persist upload for user %s", user_id, exc_info=True)
        raise AppError("upload_failed", "Upload failed. Please try again.", 503) from exc

    if save_error is not None:
        raise save_error
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
    if lock_user(db, user.id) is None:
        raise AppError("not_found", "User not found.", 404)
    document = _document_for(db, user, document_id)

    try:
        # Retain SQL metadata until both stores have completed cleanup.
        delete_by_document(user.id, document.id)
        document_path(document.user_id, document.id, document.filename).unlink(
            missing_ok=True
        )
        db.delete(document)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Could not clean document %s", document_id, exc_info=True)
        raise AppError("cleanup_failed", "Document cleanup failed. Please retry.", 503) from exc
