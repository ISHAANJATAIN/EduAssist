from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_token
from app.db.session import get_db
from app.models.course import Course
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise AppError("invalid_credentials", "Not authenticated", 401)
    user = db.get(User, decode_token(credentials.credentials))
    if user is None:
        raise AppError("invalid_credentials", "User no longer exists", 401)
    return user


def get_or_create_course(db: Session, user: User) -> Course:
    course = db.scalar(select(Course).where(Course.user_id == user.id))
    if course is None:
        course = Course(user_id=user.id)
        db.add(course)
        db.commit()
        db.refresh(course)
    return course


DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
