from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import TypeAdapter
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models.chat import ChatMessage
from app.schemas.chat import ChatIn, ChatMessageOut, ChatOut, ChatReply
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


@router.post("", response_model=ChatOut)
def send_message(payload: ChatIn, db: DbSession, user: CurrentUser) -> ChatOut:
    return dispatch(user, payload, db)


@router.get("/history", response_model=list[ChatMessageOut])
def chat_history(
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[ChatMessageOut]:
    rows = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.user_id == user.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    ).all()
    return [_message_out(row) for row in reversed(rows)]
