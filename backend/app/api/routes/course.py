import uuid

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.models.course import Course
from app.schemas.course import CourseOut, CourseUpdate

router = APIRouter(prefix="/course", tags=["course"])


def _course_for(db: Session, user_id: uuid.UUID) -> Course:
    course = db.scalar(select(Course).where(Course.user_id == user_id))
    if course is None:
        raise AppError("not_found", "Course not found", 404)
    return course


@router.get("", response_model=CourseOut)
def get_course(current_user: CurrentUser, db: DbSession) -> CourseOut:
    return CourseOut.model_validate(_course_for(db, current_user.id))


@router.put("", response_model=CourseOut)
def update_course(
    payload: CourseUpdate, current_user: CurrentUser, db: DbSession
) -> CourseOut:
    course = _course_for(db, current_user.id)
    course.name = payload.name
    course.exam_date = payload.exam_date
    course.free_hours_per_day = payload.free_hours_per_day
    db.commit()
    db.refresh(course)
    return CourseOut.model_validate(course)
