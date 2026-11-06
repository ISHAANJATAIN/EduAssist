from __future__ import annotations

import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, DbSession
from app.schemas.quiz import AttemptIn, AttemptOut, QuizCreateIn, QuizOut
from app.services.quiz.generator import create_quiz, get_quiz, quiz_to_out
from app.services.quiz.scorer import score_attempt
from app.services.recommender.rules import recommendations_for
from app.services.tracking.mastery import apply_attempt

router = APIRouter(prefix="/quizzes", tags=["quizzes"])


@router.post("", response_model=QuizOut, status_code=status.HTTP_201_CREATED)
def create_new_quiz(
    payload: QuizCreateIn, db: DbSession, user: CurrentUser
) -> QuizOut:
    return create_quiz(user, payload, db)


@router.get("/{quiz_id}", response_model=QuizOut)
def read_quiz(quiz_id: uuid.UUID, db: DbSession, user: CurrentUser) -> QuizOut:
    return quiz_to_out(get_quiz(user, quiz_id, db))


@router.post(
    "/{quiz_id}/attempts",
    response_model=AttemptOut,
    status_code=status.HTTP_201_CREATED,
)
def submit_attempt(
    quiz_id: uuid.UUID, payload: AttemptIn, db: DbSession, user: CurrentUser
) -> AttemptOut:
    attempt = score_attempt(user, get_quiz(user, quiz_id, db), payload, db)
    return attempt.model_copy(
        update={
            "mastery_updates": apply_attempt(db, user, attempt.results),
            "recommendations": recommendations_for(db, user),
        }
    )
