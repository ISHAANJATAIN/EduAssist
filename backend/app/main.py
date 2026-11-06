from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    account,
    auth,
    chat,
    course,
    documents,
    performance,
    planner,
    quizzes,
    topics,
)
from app.core.config import get_settings
from app.core.errors import register_error_handlers
from app.db.init_db import init_db

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_error_handlers(app)

api_router = APIRouter(prefix=settings.api_prefix)


@api_router.get("/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}


api_router.include_router(auth.router)
api_router.include_router(course.router)
api_router.include_router(documents.router)
api_router.include_router(topics.router)
api_router.include_router(quizzes.router)
api_router.include_router(performance.router)
api_router.include_router(planner.router)
api_router.include_router(chat.router)
api_router.include_router(account.router)
app.include_router(api_router)
