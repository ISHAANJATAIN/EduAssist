from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.routes import documents as documents_route
from app.api.routes import topics as topics_route
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.document import Document
from app.models.topic import Topic
from app.services.ingestion import pipeline
from app.services.ingestion.chunker import chunk_pages
from app.services.ingestion.parsers import ParsedPage, parse_document
from app.services.ingestion.topic_extractor import TopicDraft

PASSWORD = "study-buddy-1"


def _auth(client: TestClient, email: str = "reader@bmu.edu.in"):
    response = client.post(
        "/api/auth/register",
        json={"name": "Reader", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    course = client.get("/api/course", headers=headers)
    assert course.status_code == 200
    return headers, uuid.UUID(course.json()["id"])


def _upload(client, headers, name="notes.txt", content=b"Deadlocks need mutual exclusion.", doc_type="notes"):
    return client.post(
        "/api/documents",
        headers=headers,
        files={"file": (name, content, "text/plain")},
        data={"doc_type": doc_type},
    )


@pytest.fixture()
def no_ingest(monkeypatch):
    monkeypatch.setattr(documents_route, "ingest_document", lambda document_id: None)
    monkeypatch.setattr(documents_route, "delete_by_document", lambda *args: None)


@pytest.fixture()
def temp_uploads(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_dir", tmp_path)
    return tmp_path


def test_parses_text_document(tmp_path):
    path = tmp_path / "week1.txt"
    path.write_text("Processes and threads\nDeadlock avoidance", encoding="utf-8")

    pages = parse_document(path)

    assert len(pages) == 1
    assert pages[0].number == 1
    assert "Deadlock avoidance" in pages[0].text


def test_rejects_unsupported_extension(tmp_path):
    path = tmp_path / "archive.zip"
    path.write_bytes(b"PK\x03\x04")

    with pytest.raises(AppError) as error:
        parse_document(path)

    assert error.value.code == "unsupported_file_type"
    assert error.value.status_code == 415


def test_chunker_respects_size_overlap_and_indices():
    text = " ".join(f"word{i}" for i in range(500))
    chunks = chunk_pages([ParsedPage(number=1, text=text)])

    assert len(chunks) > 1
    assert all(len(chunk.text) <= 1000 for chunk in chunks)
    assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))
    assert chunks[1].text[:80] in chunks[0].text


def test_chunker_keeps_page_metadata():
    chunks = chunk_pages(
        [
            ParsedPage(number=1, text="Alpha " * 300),
            ParsedPage(number=2, text="Beta " * 300),
        ]
    )

    assert {chunk.page for chunk in chunks} == {1, 2}


def test_upload_creates_processing_document(client, no_ingest, temp_uploads):
    headers, _ = _auth(client, "upload@bmu.edu.in")

    response = _upload(client, headers)

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "processing"
    assert body["filename"] == "notes.txt"
    assert body["doc_type"] == "notes"

    stored = list(temp_uploads.rglob("*.txt"))
    assert len(stored) == 1
    assert stored[0].name == f"{body['id']}.txt"


def test_upload_rejects_unsupported_file_type(client, no_ingest, temp_uploads):
    headers, _ = _auth(client, "types@bmu.edu.in")

    response = _upload(client, headers, name="virus.exe", content=b"MZ")

    assert response.status_code == 415
    assert response.json()["code"] == "unsupported_file_type"


def test_upload_rejects_oversized_file(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "big@bmu.edu.in")
    monkeypatch.setattr(get_settings(), "max_upload_mb", 1)

    response = _upload(client, headers, content=b"x" * (1024 * 1024 + 1))

    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"
    assert client.get("/api/documents", headers=headers).json() == []


def test_upload_rejects_empty_file(client, no_ingest, temp_uploads):
    headers, _ = _auth(client, "empty@bmu.edu.in")

    response = _upload(client, headers, content=b"")

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_documents_are_scoped_to_the_owner(client, no_ingest, temp_uploads):
    owner_headers, _ = _auth(client, "owner@bmu.edu.in")
    document_id = _upload(client, owner_headers).json()["id"]
    other_headers, _ = _auth(client, "other@bmu.edu.in")

    assert client.get("/api/documents", headers=other_headers).json() == []
    assert client.get(f"/api/documents/{document_id}", headers=other_headers).status_code == 404


def test_delete_removes_document_and_file(client, no_ingest, temp_uploads):
    headers, _ = _auth(client, "delete@bmu.edu.in")
    document_id = _upload(client, headers).json()["id"]

    stored = next(temp_uploads.rglob("*.txt"))
    assert stored.exists()

    response = client.delete(f"/api/documents/{document_id}", headers=headers)

    assert response.status_code == 204
    assert not stored.exists()
    assert client.get("/api/documents", headers=headers).json() == []


def test_pipeline_marks_document_ready(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "ready@bmu.edu.in")
    monkeypatch.setattr(pipeline, "add_chunks", lambda *args, **kwargs: None)
    document_id = uuid.UUID(_upload(client, headers).json()["id"])

    pipeline.ingest_document(document_id)

    with SessionLocal() as db:
        document = db.get(Document, document_id)
        assert document is not None
        assert document.status == "ready"
        assert document.page_count == 1
        assert document.chunk_count >= 1
        assert document.error is None


def test_pipeline_marks_document_failed_when_file_is_missing(
    client, no_ingest, temp_uploads, monkeypatch
):
    headers, _ = _auth(client, "broken@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers).json()["id"])
    next(temp_uploads.rglob("*.txt")).unlink()

    pipeline.ingest_document(document_id)

    with SessionLocal() as db:
        document = db.get(Document, document_id)
        assert document is not None
        assert document.status == "failed"
        assert document.error


def test_handout_ingestion_inserts_deduplicated_topics(
    client, no_ingest, temp_uploads, monkeypatch
):
    headers, course_id = _auth(client, "handout@bmu.edu.in")
    monkeypatch.setattr(pipeline, "add_chunks", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        pipeline,
        "extract_topics",
        lambda text: [
            TopicDraft(name="Deadlock", description="Deadlock basics."),
            TopicDraft(name="deadlock", description="Duplicate."),
            TopicDraft(name="Scheduling", description="CPU scheduling."),
        ],
    )
    document_id = uuid.UUID(
        _upload(client, headers, name="syllabus.txt", doc_type="handout").json()["id"]
    )

    pipeline.ingest_document(document_id)

    with SessionLocal() as db:
        names = sorted(
            db.scalars(select(Topic.name).where(Topic.course_id == course_id)).all()
        )
    assert names == ["Deadlock", "Scheduling"]


def test_non_handout_ingestion_skips_topic_extraction(
    client, no_ingest, temp_uploads, monkeypatch
):
    headers, course_id = _auth(client, "notes@bmu.edu.in")
    monkeypatch.setattr(pipeline, "add_chunks", lambda *args, **kwargs: None)

    def explode(_text):
        raise AssertionError("topic extraction should not run for notes")

    monkeypatch.setattr(pipeline, "extract_topics", explode)
    document_id = uuid.UUID(_upload(client, headers).json()["id"])

    pipeline.ingest_document(document_id)

    with SessionLocal() as db:
        assert db.scalars(select(Topic).where(Topic.course_id == course_id)).all() == []


def test_topic_crud_and_prerequisites(client):
    headers, _ = _auth(client, "topics@bmu.edu.in")
    first = client.post(
        "/api/topics", headers=headers, json={"name": "Processes"}
    ).json()
    second = client.post(
        "/api/topics",
        headers=headers,
        json={"name": "Deadlocks", "prerequisite_ids": [first["id"]]},
    )

    assert second.status_code == 200
    body = second.json()
    assert body["prerequisite_ids"] == [first["id"]]

    updated = client.put(
        f"/api/topics/{body['id']}",
        headers=headers,
        json={"name": "Deadlock handling", "prerequisite_ids": []},
    )
    assert updated.status_code == 200
    assert updated.json()["prerequisite_ids"] == []

    assert client.delete(f"/api/topics/{first['id']}", headers=headers).status_code == 204
    remaining = client.get("/api/topics", headers=headers).json()
    assert [topic["name"] for topic in remaining] == ["Deadlock handling"]


def test_topic_rejects_self_and_cross_course_prerequisites(client):
    headers, _ = _auth(client, "cycles@bmu.edu.in")
    topic = client.post("/api/topics", headers=headers, json={"name": "Memory"}).json()

    self_reference = client.put(
        f"/api/topics/{topic['id']}",
        headers=headers,
        json={"name": "Memory", "prerequisite_ids": [topic["id"]]},
    )
    assert self_reference.status_code == 422

    other_headers, _ = _auth(client, "cycles2@bmu.edu.in")
    foreign = client.post(
        "/api/topics", headers=other_headers, json={"name": "Foreign"}
    ).json()
    cross_course = client.post(
        "/api/topics",
        headers=headers,
        json={"name": "Paging", "prerequisite_ids": [foreign["id"]]},
    )
    assert cross_course.status_code == 422


def test_topic_cycle_is_rejected(client):
    headers, _ = _auth(client, "loop@bmu.edu.in")
    a = client.post("/api/topics", headers=headers, json={"name": "A"}).json()
    b = client.post(
        "/api/topics", headers=headers, json={"name": "B", "prerequisite_ids": [a["id"]]}
    ).json()

    response = client.put(
        f"/api/topics/{a['id']}",
        headers=headers,
        json={"name": "A", "prerequisite_ids": [b["id"]]},
    )

    assert response.status_code == 422


def test_topic_names_are_unique_case_insensitively(client):
    headers, _ = _auth(client, "dupes@bmu.edu.in")
    first = client.post(
        "/api/topics", headers=headers, json={"name": "Deadlock prevention"}
    )
    assert first.status_code == 200

    duplicate = client.post(
        "/api/topics", headers=headers, json={"name": "  Deadlock Prevention "}
    )
    assert duplicate.status_code == 422
    assert duplicate.json() == {
        "detail": "A topic with this name already exists.",
        "code": "validation_error",
    }

    other = client.post(
        "/api/topics", headers=headers, json={"name": "Deadlock avoidance"}
    ).json()
    rename = client.put(
        f"/api/topics/{other['id']}",
        headers=headers,
        json={"name": "DEADLOCK PREVENTION"},
    )
    assert rename.status_code == 422

    same = client.put(
        f"/api/topics/{first.json()['id']}",
        headers=headers,
        json={"name": "Deadlock prevention"},
    )
    assert same.status_code == 200


def test_extract_topics_requires_ready_handout(client):
    headers, _ = _auth(client, "extract@bmu.edu.in")

    response = client.post("/api/topics/extract", headers=headers)

    assert response.status_code == 409
    assert response.json()["code"] == "no_material"


def test_extract_topics_from_ready_handout(
    client, no_ingest, temp_uploads, monkeypatch
):
    headers, _ = _auth(client, "extract-ok@bmu.edu.in")
    document_id = uuid.UUID(
        _upload(client, headers, name="syllabus.txt", doc_type="handout").json()["id"]
    )
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        document.status = "ready"
        db.commit()

    monkeypatch.setattr(
        topics_route,
        "extract_topics",
        lambda text: [TopicDraft(name="Scheduling", description="CPU scheduling.")],
    )

    response = client.post("/api/topics/extract", headers=headers)

    assert response.status_code == 200
    assert [topic["name"] for topic in response.json()] == ["Scheduling"]
