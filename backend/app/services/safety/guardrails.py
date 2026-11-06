from __future__ import annotations

import re
import uuid
from collections.abc import Iterable

from app.core.config import get_settings
from app.schemas.chat import CitationOut
from app.services.rag.retriever import ChunkMatch

SNIPPET_CHARS = 240
FALLBACK_CITATIONS = 2


def is_grounded(scores: Iterable[float], min_score: float | None = None) -> bool:
    threshold = (
        min_score if min_score is not None else get_settings().retrieval_min_score
    )
    top_score = max(scores, default=0.0)
    return top_score >= threshold


def _is_cited(answer: str, chunk: ChunkMatch) -> bool:
    lowered = answer.lower()
    if chunk.filename.lower() not in lowered:
        return False
    return bool(re.search(rf"\b(?:p\.?\s*|page\s*){chunk.page}\b", lowered))


def ensure_citations(answer: str, chunks: list[ChunkMatch]) -> list[CitationOut]:
    selected = [chunk for chunk in chunks if _is_cited(answer, chunk)]
    if not selected:
        selected = chunks[:FALLBACK_CITATIONS]

    citations: list[CitationOut] = []
    seen: set[tuple[str, int]] = set()

    for chunk in selected:
        key = (chunk.document_id, chunk.page)
        if key in seen:
            continue
        seen.add(key)
        snippet = " ".join(chunk.text.split())
        if len(snippet) > SNIPPET_CHARS:
            snippet = snippet[:SNIPPET_CHARS].rstrip() + "…"
        citations.append(
            CitationOut(
                document_id=uuid.UUID(chunk.document_id),
                filename=chunk.filename,
                page=chunk.page,
                snippet=snippet,
            )
        )

    return citations
