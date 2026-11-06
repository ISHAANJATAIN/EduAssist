from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from functools import lru_cache

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import get_settings
from app.services.ingestion.chunker import Chunk
from app.services.llm.client import get_embeddings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ChunkMatch:
    text: str
    document_id: str
    filename: str
    page: int
    doc_type: str
    chunk_index: int
    score: float


@lru_cache
def _client() -> chromadb.ClientAPI:
    settings = get_settings()
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(
        path=str(settings.chroma_dir),
        settings=ChromaSettings(anonymized_telemetry=False),
    )


def _collection_name(user_id: uuid.UUID) -> str:
    return f"user_{user_id}"


def _collection(user_id: uuid.UUID):
    return _client().get_or_create_collection(
        name=_collection_name(user_id),
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks(user_id: uuid.UUID, document, chunks: list[Chunk]) -> None:
    if not chunks:
        return

    document_id = str(document.id)
    collection = _collection(user_id)
    collection.delete(where={"document_id": document_id})

    texts = [chunk.text for chunk in chunks]
    collection.add(
        ids=[f"{document_id}:{chunk.chunk_index}" for chunk in chunks],
        embeddings=get_embeddings().embed_documents(texts),
        documents=texts,
        metadatas=[
            {
                "document_id": document_id,
                "filename": document.filename,
                "page": chunk.page,
                "doc_type": document.doc_type,
                "chunk_index": chunk.chunk_index,
            }
            for chunk in chunks
        ],
    )


def query(user_id: uuid.UUID, text: str, k: int | None = None) -> list[ChunkMatch]:
    collection = _collection(user_id)
    if collection.count() == 0:
        return []

    limit = k or get_settings().retrieval_top_k
    result = collection.query(
        query_embeddings=[get_embeddings().embed_query(text)],
        n_results=min(limit, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    matches: list[ChunkMatch] = []
    documents = result.get("documents") or [[]]
    metadatas = result.get("metadatas") or [[]]
    distances = result.get("distances") or [[]]
    for content, metadata, distance in zip(
        documents[0], metadatas[0], distances[0], strict=False
    ):
        if content is None or metadata is None:
            continue
        matches.append(
            ChunkMatch(
                text=content,
                document_id=str(metadata["document_id"]),
                filename=str(metadata["filename"]),
                page=int(metadata["page"]),
                doc_type=str(metadata["doc_type"]),
                chunk_index=int(metadata["chunk_index"]),
                score=1.0 - float(distance),
            )
        )
    return matches


def delete_by_document(user_id: uuid.UUID, document_id: uuid.UUID) -> None:
    _collection(user_id).delete(where={"document_id": str(document_id)})


def delete_all(user_id: uuid.UUID) -> None:
    try:
        _client().delete_collection(_collection_name(user_id))
    except Exception:
        logger.warning(
            "Could not delete vector collection for user %s", user_id, exc_info=True
        )
