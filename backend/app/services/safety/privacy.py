from __future__ import annotations

import logging

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, object_session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models.chat import ChatMessage
from app.models.course import Course
from app.models.document import Document
from app.models.mastery import TopicMastery
from app.models.plan import StudyPlan
from app.models.quiz import Quiz, QuizAttempt
from app.models.topic import Topic, topic_prerequisites
from app.models.user import User
from app.services.ingestion.pipeline import document_path, lock_user
from app.services.ingestion.vector_store import delete_all

logger = logging.getLogger(__name__)


def _delete_uploaded_files(paths) -> None:
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("Could not remove uploaded file %s", path, exc_info=True)
            raise AppError("cleanup_failed", "File cleanup failed. Please retry.", 503) from exc


def delete_all_user_data(user: User) -> None:
    """Remove a user's study data while keeping the login and course settings."""
    db: Session | None = object_session(user)
    if db is None:
        raise ValueError("User must be attached to a session.")

    user_id = user.id
    if lock_user(db, user_id) is None:
        raise AppError("not_found", "User not found.", 404)
    course = db.scalar(select(Course).where(Course.user_id == user_id).with_for_update())
    paths = [
        document_path(document.user_id, document.id, document.filename)
        for document in db.scalars(
            select(Document).where(Document.user_id == user_id)
        )
    ]

    # Keep SQL metadata until cross-store cleanup succeeds so failures remain retryable.
    try:
        delete_all(user_id)
        upload_directory = get_settings().upload_dir / str(user_id)
        try:
            # Owner locking excludes uploads, including ones left by an uncertain SQL commit.
            paths.extend(upload_directory.iterdir())
        except FileNotFoundError:
            pass
        _delete_uploaded_files(set(paths))
        try:
            upload_directory.rmdir()
        except FileNotFoundError:
            pass
    except Exception as exc:
        db.rollback()
        logger.warning("Could not clean study data for user %s", user_id, exc_info=True)
        raise AppError("cleanup_failed", "Data cleanup failed. Please retry.", 503) from exc

    try:
        db.execute(delete(TopicMastery).where(TopicMastery.user_id == user_id))

        if course is not None:
            topic_ids = list(
                db.scalars(select(Topic.id).where(Topic.course_id == course.id))
            )
            if topic_ids:
                db.execute(
                    delete(topic_prerequisites).where(
                        topic_prerequisites.c.topic_id.in_(topic_ids)
                        | topic_prerequisites.c.prerequisite_id.in_(topic_ids)
                    )
                )

        db.execute(delete(QuizAttempt).where(QuizAttempt.user_id == user_id))
        db.execute(delete(Quiz).where(Quiz.user_id == user_id))
        db.execute(delete(StudyPlan).where(StudyPlan.user_id == user_id))
        db.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id))
        db.execute(delete(Document).where(Document.user_id == user_id))
        if course is not None:
            db.execute(delete(Topic).where(Topic.course_id == course.id))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Could not delete study metadata for user %s", user_id, exc_info=True)
        raise AppError("cleanup_failed", "Data cleanup failed. Please retry.", 503) from exc
