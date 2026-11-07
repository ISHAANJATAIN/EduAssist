from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from functools import lru_cache

import chromadb
from chromadb.config import Settings as ChromaSettings
from chromadb.errors import NotFoundError
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.document import Document
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
    candidate_ids = set()
    for metadata in metadatas[0]:
        if metadata is not None:
            try:
                candidate_ids.add(uuid.UUID(str(metadata.get("document_id"))))
            except (ValueError, TypeError, AttributeError):
                continue
    # Chroma can retain partial/stale publication after a cross-store failure.
    # SQL is the authority for readiness and ownership, not vector metadata.
    with SessionLocal() as db:
        ready = {
            str(document.id): (document.filename, document.doc_type)
            for document in db.scalars(
                select(Document).where(
                    Document.id.in_(candidate_ids),
                    Document.user_id == user_id,
                    Document.status == "ready",
                )
            )
        }
    for content, metadata, distance in zip(
        documents[0], metadatas[0], distances[0], strict=False
    ):
        if content is None or metadata is None:
            continue
        document_id = str(metadata.get("document_id"))
        if document_id not in ready:
            continue
        filename, doc_type = ready[document_id]
        matches.append(
            ChunkMatch(
                text=content,
                document_id=document_id,
                filename=filename,
                page=int(metadata["page"]),
                doc_type=doc_type,
                chunk_index=int(metadata["chunk_index"]),
                score=1.0 - float(distance),
            )
        )
    return matches


def delete_by_document(user_id: uuid.UUID, document_id: uuid.UUID) -> None:
    try:
        collection = _client().get_collection(name=_collection_name(user_id))
    except NotFoundError:
        return
    except Exception as exc:
        logger.warning("Could not open vector collection for cleanup", exc_info=True)
        raise AppError("cleanup_failed", "Vector cleanup failed. Please retry.", 503) from exc
    try:
        collection.delete(where={"document_id": str(document_id)})
    except Exception as exc:
        logger.warning("Could not delete document vectors", exc_info=True)
        raise AppError("cleanup_failed", "Vector cleanup failed. Please retry.", 503) from exc


def delete_all(user_id: uuid.UUID) -> None:
    try:
        _client().delete_collection(_collection_name(user_id))
    except NotFoundError:
        return
    except Exception as exc:
        logger.warning(
            "Could not delete vector collection for user %s", user_id, exc_info=True
        )
        raise AppError("cleanup_failed", "Vector cleanup failed. Please retry.", 503) from exc
