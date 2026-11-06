import uuid
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

from app.schemas.performance import RecommendationOut

QuizKind = Literal["quiz", "flashcards"]
Difficulty = Literal["easy", "medium", "hard"]


class SourceOut(BaseModel):
    filename: str
    page: int | None = None


class QuizQuestionOut(BaseModel):
    id: str
    topic_id: uuid.UUID
    question: str
    options: list[str]
    source: SourceOut


class FlashcardOut(BaseModel):
    id: str
    topic_id: uuid.UUID
    front: str
    back: str
    source: SourceOut


QuizItemOut = QuizQuestionOut | FlashcardOut


class QuizCreateIn(BaseModel):
    kind: QuizKind = "quiz"
    topic_ids: list[uuid.UUID] = Field(default_factory=list)
    difficulty: Difficulty = "medium"
    num_items: int = Field(default=5, ge=1, le=20)


class QuizOut(BaseModel):
    id: uuid.UUID
    kind: QuizKind
    difficulty: Difficulty
    topic_ids: list[uuid.UUID]
    items: list[QuizItemOut]


class AnswerIn(BaseModel):
    item_id: str
    selected_index: int = Field(ge=0, le=3)


class RatingIn(BaseModel):
    item_id: str
    known: bool


class AttemptIn(BaseModel):
    answers: list[AnswerIn] | None = None
    ratings: list[RatingIn] | None = None

    @model_validator(mode="after")
    def exactly_one_mode(self) -> Self:
        if (self.answers is None) == (self.ratings is None):
            raise ValueError("provide either answers or ratings")
        return self


class AttemptResultOut(BaseModel):
    item_id: str
    correct: bool
    correct_index: int | None = None
    explanation: str | None = None
    topic_id: uuid.UUID


class MasteryUpdateOut(BaseModel):
    topic_id: uuid.UUID
    old: float
    new: float


class AttemptOut(BaseModel):
    attempt_id: uuid.UUID
    score_percent: float
    correct_count: int
    total: int
    results: list[AttemptResultOut]
    mastery_updates: list[MasteryUpdateOut] = Field(default_factory=list)
    recommendations: list[RecommendationOut] = Field(default_factory=list)
