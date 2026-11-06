from __future__ import annotations

import uuid

from app.services.ingestion.vector_store import ChunkMatch, query


def retrieve(user_id: uuid.UUID, question: str) -> list[ChunkMatch]:
    return query(user_id, question)


__all__ = ["ChunkMatch", "retrieve"]
