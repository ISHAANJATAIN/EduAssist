from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt
from fastapi import status
from passlib.context import CryptContext

from app.core.config import get_settings
from app.core.errors import AppError

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(plain_password, password_hash)
    except (TypeError, ValueError):
        return False


def create_access_token(user_id: UUID, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + (expires_delta or timedelta(minutes=settings.jwt_expire_minutes)),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> UUID:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub"]},
        )
        return UUID(str(payload["sub"]))
    except (jwt.InvalidTokenError, KeyError, ValueError) as exc:
        raise AppError(
            "invalid_credentials",
            "Invalid or expired token.",
            status.HTTP_401_UNAUTHORIZED,
        ) from exc
