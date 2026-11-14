from __future__ import annotations

import uuid

from fastapi import APIRouter, status
from pydantic import TypeAdapter
from sqlalchemy import case, delete, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.models.chat import ChatMessage, ChatSession
from app.models.user import User
from app.schemas.chat import (
    ChatIn,
    ChatMessageOut,
    ChatOut,
    ChatReply,
    ChatSessionLatestOut,
    ChatSessionOut,
)
from app.services.agent.dispatcher import dispatch

router = APIRouter(prefix="/chat", tags=["chat"])

_reply_adapter = TypeAdapter(ChatReply)


def _message_out(row: ChatMessage) -> ChatMessageOut:
    if row.role == "user":
        return ChatMessageOut(
            id=row.id,
            role="user",
            intent=row.intent,
            created_at=row.created_at,
            text=str(row.payload.get("text", "")),
            reply=None,
        )
    return ChatMessageOut(
        id=row.id,
        role="assistant",
        intent=None,
        created_at=row.created_at,
        text=None,
        reply=_reply_adapter.validate_python(row.payload),
    )


def _session_out(session: ChatSession) -> ChatSessionOut:
    return ChatSessionOut(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _own_session(db: Session, user: User, session_id: uuid.UUID) -> ChatSession:
    session = db.scalar(
        select(ChatSession).where(
            ChatSession.id == session_id, ChatSession.user_id == user.id
        )
    )
    if session is None:
        raise AppError("not_found", "Conversation not found.", 404)
    return session


def _messages(db: Session, session_id: uuid.UUID) -> list[ChatMessageOut]:
    rows = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(
            ChatMessage.created_at,
            case((ChatMessage.role == "assistant", 1), else_=0),
            ChatMessage.id,
        )
    ).all()
    return [_message_out(row) for row in rows]


@router.post("", response_model=ChatOut)
def send_message(payload: ChatIn, db: DbSession, user: CurrentUser) -> ChatOut:
    return dispatch(user, payload, db)


@router.post(
    "/sessions",
    response_model=ChatSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_session(db: DbSession, user: CurrentUser) -> ChatSessionOut:
    session = ChatSession(user_id=user.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_out(session)


@router.get("/sessions", response_model=list[ChatSessionOut])
def list_sessions(db: DbSession, user: CurrentUser) -> list[ChatSessionOut]:
    rows = db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc(), ChatSession.created_at.desc())
    ).all()
    return [_session_out(row) for row in rows]


@router.get("/sessions/latest", response_model=ChatSessionLatestOut)
def latest_session(db: DbSession, user: CurrentUser) -> ChatSessionLatestOut:
    session = db.scalar(
        select(ChatSession)
        .where(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc(), ChatSession.created_at.desc())
        .limit(1)
    )
    if session is None:
        return ChatSessionLatestOut()
    return ChatSessionLatestOut(
        session=_session_out(session), messages=_messages(db, session.id)
    )


@router.get(
    "/sessions/{session_id}/messages", response_model=list[ChatMessageOut]
)
def session_messages(
    session_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> list[ChatMessageOut]:
    session = _own_session(db, user, session_id)
    return _messages(db, session.id)


@router.delete(
    "/sessions/{session_id}/messages",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def clear_session(
    session_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> None:
    session = _own_session(db, user, session_id)
    db.execute(delete(ChatMessage).where(ChatMessage.session_id == session.id))
    db.commit()
