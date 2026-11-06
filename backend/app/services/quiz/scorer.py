from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models.quiz import Quiz, QuizAttempt
from app.models.user import User
from app.schemas.quiz import AttemptIn, AttemptOut, AttemptResultOut


def _answer_map(payload: AttemptIn, quiz: Quiz) -> dict[str, int]:
    if payload.answers is None:
        raise AppError(
            "validation_error",
            "answers: provide one answer per question.",
            422,
        )
    if payload.ratings is not None:
        raise AppError(
            "validation_error",
            "ratings: this is a quiz, not a flashcard deck.",
            422,
        )

    provided = [answer.item_id for answer in payload.answers]
    expected = {item["id"] for item in quiz.items or []}
    if (
        len(provided) != len(set(provided))
        or set(provided) != expected
        or len(provided) != len(expected)
    ):
        raise AppError(
            "validation_error",
            "answers: answer every question exactly once.",
            422,
        )
    return {answer.item_id: answer.selected_index for answer in payload.answers}


def _rating_map(payload: AttemptIn, quiz: Quiz) -> dict[str, bool]:
    if payload.ratings is None:
        raise AppError(
            "validation_error",
            "ratings: provide one rating per flashcard.",
            422,
        )
    if payload.answers is not None:
        raise AppError(
            "validation_error",
            "answers: this is a flashcard deck, not a quiz.",
            422,
        )

    provided = [rating.item_id for rating in payload.ratings]
    expected = {item["id"] for item in quiz.items or []}
    if (
        len(provided) != len(set(provided))
        or set(provided) != expected
        or len(provided) != len(expected)
    ):
        raise AppError(
            "validation_error",
            "ratings: rate every flashcard exactly once.",
            422,
        )
    return {rating.item_id: rating.known for rating in payload.ratings}


def _uuid(value) -> uuid.UUID:
    return uuid.UUID(str(value))


def score_attempt(
    user: User, quiz: Quiz, payload: AttemptIn, db: Session
) -> AttemptOut:
    items = quiz.items or []
    if not items:
        raise AppError("validation_error", "This quiz has no items.", 422)

    results: list[AttemptResultOut] = []

    if quiz.kind == "quiz":
        answers = _answer_map(payload, quiz)
        for item in items:
            correct = answers[item["id"]] == item["correct_index"]
            results.append(
                AttemptResultOut(
                    item_id=item["id"],
                    correct=correct,
                    correct_index=item["correct_index"],
                    explanation=item.get("explanation"),
                    topic_id=_uuid(item["topic_id"]),
                )
            )
    else:
        ratings = _rating_map(payload, quiz)
        for item in items:
            results.append(
                AttemptResultOut(
                    item_id=item["id"],
                    correct=ratings[item["id"]],
                    explanation=item.get("back"),
                    topic_id=_uuid(item["topic_id"]),
                )
            )

    correct_count = sum(1 for result in results if result.correct)
    total = len(results)
    score_percent = round(correct_count * 100 / total, 1)

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user.id,
        score_percent=score_percent,
        results=[result.model_dump(mode="json") for result in results],
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return AttemptOut(
        attempt_id=attempt.id,
        score_percent=score_percent,
        correct_count=correct_count,
        total=total,
        results=results,
    )
