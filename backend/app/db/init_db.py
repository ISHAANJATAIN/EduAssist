from __future__ import annotations

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.db.base import Base, utcnow
from app.db.session import SessionLocal, engine
from app.models.chat import ChatMessage, ChatSession


def ensure_session_column() -> None:
    """Add the session_id column to databases created before conversations existed."""
    inspector = inspect(engine)
    if "chat_messages" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("chat_messages")}
    if "session_id" in columns:
        return
    column_type = "UUID" if engine.dialect.name == "postgresql" else "CHAR(32)"
    with engine.begin() as connection:
        connection.execute(
            text(f"ALTER TABLE chat_messages ADD COLUMN session_id {column_type}")
        )


def backfill_chat_sessions(db: Session) -> None:
    """Group messages saved before conversations existed into an 'Earlier chat'."""
    user_ids = db.scalars(
        select(ChatMessage.user_id)
        .where(ChatMessage.session_id.is_(None))
        .distinct()
    ).all()

    for user_id in user_ids:
        rows = list(
            db.scalars(
                select(ChatMessage).where(
                    ChatMessage.user_id == user_id,
                    ChatMessage.session_id.is_(None),
                )
            )
        )
        if not rows:
            continue
        last_activity = max(
            (row.created_at for row in rows if row.created_at is not None),
            default=utcnow(),
        )
        session = ChatSession(
            user_id=user_id, title="Earlier chat", updated_at=last_activity
        )
        db.add(session)
        db.flush()
        for row in rows:
            row.session_id = session.id

    db.commit()


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_session_column()
    with SessionLocal() as db:
        backfill_chat_sessions(db)
