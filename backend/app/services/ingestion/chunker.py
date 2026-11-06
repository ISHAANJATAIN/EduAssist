from __future__ import annotations

from dataclasses import dataclass

from app.services.ingestion.parsers import ParsedPage

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 150


@dataclass(frozen=True)
class Chunk:
    text: str
    page: int
    chunk_index: int


def chunk_pages(
    pages: list[ParsedPage],
    size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[Chunk]:
    if size <= 0:
        raise ValueError("Chunk size must be positive.")
    if not 0 <= overlap < size:
        raise ValueError("Overlap must be between 0 and the chunk size.")

    step = size - overlap
    chunks: list[Chunk] = []

    for page in pages:
        text = " ".join(page.text.split())
        start = 0
        while start < len(text):
            end = min(start + size, len(text))
            if end < len(text):
                window = text[start:end]
                cut = max(window.rfind(". "), window.rfind(" "))
                if cut >= size * 0.6:
                    end = start + cut + 1

            piece = text[start:end].strip()
            if piece:
                chunks.append(
                    Chunk(text=piece, page=page.number, chunk_index=len(chunks))
                )

            if end >= len(text):
                break
            start = max(end - overlap, start + 1)

    return chunks
