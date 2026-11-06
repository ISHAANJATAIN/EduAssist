from functools import lru_cache
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "EduAssist"
    api_prefix: str = "/api"

    database_url: str = "postgresql+psycopg://eduassist:eduassist@localhost:5432/eduassist"

    jwt_secret: str = Field(min_length=16)
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    llm_provider: Literal["ollama", "groq"] = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    llm_model: str = "qwen3:8b"
    llm_num_ctx: int = 8192
    llm_num_predict: int = 2048
    groq_api_key: str | None = None

    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chroma_dir: Path = Path("backend/data/chroma")

    upload_dir: Path = Path("backend/data/uploads")
    max_upload_mb: int = 25

    retrieval_top_k: int = 5
    retrieval_min_score: float = 0.30
    weak_threshold: float = 40.0
    strong_threshold: float = 75.0

    @model_validator(mode="after")
    def resolve_paths(self) -> Self:
        for name in ("chroma_dir", "upload_dir"):
            path = getattr(self, name)
            if not path.is_absolute():
                setattr(self, name, (REPO_ROOT / path).resolve())
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
