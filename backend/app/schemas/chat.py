import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.performance import PerformanceOut, RecommendationOut
from app.schemas.planner import PlanOut
from app.schemas.quiz import QuizOut

Intent = Literal["rag", "quiz", "tracker", "planner"]
ReplyIntent = Literal["rag", "quiz", "tracker", "planner", "clarify"]


class CitationOut(BaseModel):
    document_id: uuid.UUID
    filename: str
    page: int | None = None
    snippet: str


class AnswerReply(BaseModel):
    type: Literal["answer"] = "answer"
    text: str
    grounded: bool
    citations: list[CitationOut] = Field(default_factory=list)


class QuizReply(BaseModel):
    type: Literal["quiz"] = "quiz"
    quiz: QuizOut


class PerformanceReply(BaseModel):
    type: Literal["performance"] = "performance"
    summary: PerformanceOut
    recommendations: list[RecommendationOut]


class PlanReply(BaseModel):
    type: Literal["plan"] = "plan"
    plan: PlanOut


class ClarifyReply(BaseModel):
    type: Literal["clarify"] = "clarify"
    text: str
    missing: list[str]


ChatReply = Annotated[
    AnswerReply | QuizReply | PerformanceReply | PlanReply | ClarifyReply,
    Field(discriminator="type"),
]


class ChatIn(BaseModel):
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
    ]
    intent: Intent | None = None


class ChatOut(BaseModel):
    message_id: uuid.UUID
    intent: ReplyIntent
    reply: ChatReply


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    role: Literal["user", "assistant"]
    intent: ReplyIntent | None = None
    created_at: datetime
    text: str | None = None
    reply: ChatReply | None = None
