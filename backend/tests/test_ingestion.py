from __future__ import annotations

import uuid
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from fastapi import BackgroundTasks, UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.api.routes import documents as documents_route
from app.api.routes import topics as topics_route
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.course import Course
from app.models.document import Document
from app.models.topic import Topic
from app.models.user import User
from app.services.ingestion import parsers, pipeline, vector_store
from app.services.ingestion.chunker import chunk_pages
from app.services.ingestion.parsers import ParsedPage, parse_document
from app.services.ingestion.topic_extractor import TopicDraft
from app.services.safety import privacy

PASSWORD = "study-buddy-1"


@pytest.fixture(autouse=True)
def no_real_vectors(monkeypatch):
    def forbidden():
        raise AssertionError("Tests must not instantiate Chroma")
    monkeypatch.setattr(vector_store, "_client", forbidden)
    monkeypatch.setattr(pipeline, "delete_by_document", lambda *args: None)


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


@pytest.fixture()
def upload_owner(db):
    # No course yet: its first insertion must also survive recovery if needed.
    owner = User(name="Synthetic Owner", email="rollback@bmu.edu.in", password_hash="fake")
    db.add(owner)
    db.commit()
    return owner


@pytest.fixture()
def fail_upload_commit(db, temp_uploads):
    attempted_paths = []

    def fail_once(session):
        if not attempted_paths:
            paths = list(temp_uploads.rglob("*.txt"))
            assert len(paths) == 1, "Inject failure only after the actual file was saved"
            attempted_paths.append(paths[0])
            raise OperationalError("synthetic commit", {}, Exception("private-upload-db-error"))

    event.listen(db, "before_commit", fail_once)
    try:
        yield attempted_paths
    finally:
        event.remove(db, "before_commit", fail_once)


def test_upload_commit_failure_removes_orphan_and_allows_privacy_reset(
    db, upload_owner, temp_uploads, fail_upload_commit, monkeypatch
):
    background = BackgroundTasks()
    user_id = upload_owner.id
    order = []

    def rolled_back(session):
        order.append("rollback")

    def record(state):
        sql = str(state.statement.compile(dialect=postgresql.dialect()))
        if "FROM users" in sql and "FOR UPDATE" in sql:
            order.append("owner_lock")
        if "FROM documents" in sql:
            order.append("metadata_check")

    original_unlink = Path.unlink

    def unlink(path, *args, **kwargs):
        if path.suffix == ".txt" and path.is_relative_to(temp_uploads):
            assert order[-3:] == ["rollback", "owner_lock", "metadata_check"]
            order.append("unlink")
        return original_unlink(path, *args, **kwargs)

    event.listen(db, "after_rollback", rolled_back)
    event.listen(db, "do_orm_execute", record)
    with monkeypatch.context() as patches:
        patches.setattr(Path, "unlink", unlink)
        try:
            with pytest.raises(Exception) as error:
                documents_route.upload_document(
                    background, db, upload_owner,
                    UploadFile(filename="notes.txt", file=BytesIO(b"Synthetic upload")), "notes",
                )
        finally:
            event.remove(db, "after_rollback", rolled_back)
            event.remove(db, "do_orm_execute", record)

    assert list(temp_uploads.rglob("*.txt")) == [], "Failed commit left an orphan upload"
    with SessionLocal() as observer:
        assert observer.scalars(select(Document)).all() == []
    assert isinstance(error.value, AppError)
    assert error.value.code == "upload_failed"
    assert error.value.status_code == 503
    assert "private-upload-db-error" not in str(error.value)
    assert background.tasks == []
    assert fail_upload_commit[0].parent == temp_uploads / str(user_id)
    monkeypatch.setattr(privacy, "delete_all", lambda uid: None)
    privacy.delete_all_user_data(upload_owner)
    assert not (temp_uploads / str(user_id)).exists()


@pytest.mark.parametrize("partial_upload", [False, True])
def test_upload_commit_cleanup_failure_recovers_owner_scoped_retry_metadata(
    db, upload_owner, no_ingest, temp_uploads, fail_upload_commit, monkeypatch, partial_upload
):
    background = BackgroundTasks()
    user_id = upload_owner.id
    if partial_upload:
        monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    original_unlink = Path.unlink

    def unlink(path, *args, **kwargs):
        if path.suffix == ".txt" and path.is_relative_to(temp_uploads):
            raise OSError("private-upload-unlink-error")
        return original_unlink(path, *args, **kwargs)

    with monkeypatch.context() as patches:
        patches.setattr(Path, "unlink", unlink)
        with pytest.raises(Exception) as error:
            documents_route.upload_document(
                background, db, upload_owner,
                UploadFile(filename="notes.txt", file=BytesIO(b"Synthetic upload")), "notes",
            )

    with SessionLocal() as observer:
        retained = observer.scalars(select(Document)).all()
        assert len(retained) == 1, "Unlink failure lost deletion-retry metadata"
        document = retained[0]
        assert document.user_id == user_id
        assert document.filename == "notes.txt"
        assert document.doc_type == "notes"
        assert document.status == "failed"
        assert "private-upload" not in document.error
        assert observer.get(Course, document.course_id).user_id == user_id
        document_id = document.id
    assert fail_upload_commit == [temp_uploads / str(user_id) / f"{document_id}.txt"]
    assert fail_upload_commit[0].exists()
    assert isinstance(error.value, AppError)
    assert error.value.code == "cleanup_failed"
    assert error.value.status_code == 503
    assert "private-upload" not in str(error.value)
    assert background.tasks == []

    other = User(name="Other", email="rollback-other@bmu.edu.in", password_hash="fake")
    db.add(other)
    db.commit()
    with pytest.raises(AppError) as forbidden:
        documents_route.delete_document(document_id, db, other)
    assert forbidden.value.status_code == 404
    db.rollback()
    documents_route.delete_document(document_id, db, upload_owner)
    assert not fail_upload_commit[0].exists()
    monkeypatch.setattr(privacy, "delete_all", lambda uid: None)
    privacy.delete_all_user_data(upload_owner)
    assert not (temp_uploads / str(user_id)).exists()


@pytest.mark.parametrize("persisted_status", ["processing", "ready"])
def test_upload_commit_error_after_persistence_preserves_document_and_file(
    db, upload_owner, temp_uploads, monkeypatch, persisted_status
):
    background = BackgroundTasks()
    original_commit = db.commit
    paths = []

    def uncertain_commit():
        original_commit()
        path = next(temp_uploads.rglob("*.txt"))
        paths.append(path)
        if persisted_status == "ready":
            with SessionLocal() as observer:
                document = observer.scalar(select(Document))
                document.status = "ready"
                observer.commit()
        raise OperationalError("synthetic acknowledgement", {}, Exception("private-commit-outcome"))

    with monkeypatch.context() as patches:
        patches.setattr(db, "commit", uncertain_commit)
        with pytest.raises(Exception) as error:
            documents_route.upload_document(
                background, db, upload_owner,
                UploadFile(filename="notes.txt", file=BytesIO(b"Synthetic upload")), "notes",
            )

    assert isinstance(error.value, AppError)
    assert error.value.status_code == 503
    assert "private-commit-outcome" not in str(error.value)
    assert background.tasks == []
    assert paths[0].read_bytes() == b"Synthetic upload"
    with SessionLocal() as observer:
        document = observer.scalar(select(Document))
        assert document.user_id == upload_owner.id
        assert document.status == persisted_status
        assert document.error is None


@pytest.mark.parametrize("unavailable_step", ["rollback", "owner_lock", "metadata_check", "retry_commit"])
def test_upload_commit_failure_with_unavailable_db_is_safe_and_keeps_file(
    db, upload_owner, temp_uploads, fail_upload_commit, monkeypatch, unavailable_step
):
    background = BackgroundTasks()
    original_lock = documents_route.lock_user
    original_unlink = Path.unlink

    def unavailable(*args, **kwargs):
        raise OperationalError("synthetic unavailable", {}, Exception("private-unavailable-db"))

    def lock(session, uid):
        if fail_upload_commit and unavailable_step == "owner_lock":
            unavailable()
        return original_lock(session, uid)

    def fail_metadata(state):
        if fail_upload_commit and "FROM documents" in str(state.statement):
            unavailable()

    def unlink(path, *args, **kwargs):
        if path.suffix == ".txt" and path.is_relative_to(temp_uploads):
            raise OSError("synthetic blocked unlink")
        return original_unlink(path, *args, **kwargs)

    def fail_retry_commit(session):
        if fail_upload_commit:
            unavailable()

    with monkeypatch.context() as patches:
        if unavailable_step == "rollback":
            patches.setattr(db, "rollback", unavailable)
        elif unavailable_step == "owner_lock":
            patches.setattr(documents_route, "lock_user", lock)
        elif unavailable_step == "metadata_check":
            event.listen(db, "do_orm_execute", fail_metadata)
        else:
            patches.setattr(Path, "unlink", unlink)
            event.listen(db, "before_commit", fail_retry_commit)
        try:
            with pytest.raises(Exception) as error:
                documents_route.upload_document(
                    background, db, upload_owner,
                    UploadFile(filename="notes.txt", file=BytesIO(b"Synthetic upload")), "notes",
                )
        finally:
            if unavailable_step == "metadata_check":
                event.remove(db, "do_orm_execute", fail_metadata)
            if unavailable_step == "retry_commit":
                event.remove(db, "before_commit", fail_retry_commit)

    assert isinstance(error.value, AppError)
    assert error.value.code == "cleanup_failed"
    assert error.value.status_code == 503
    assert "private-" not in str(error.value)
    assert background.tasks == []
    assert fail_upload_commit[0].read_bytes() == b"Synthetic upload"
    db.rollback()
    monkeypatch.setattr(privacy, "delete_all", lambda uid: None)
    privacy.delete_all_user_data(upload_owner)
    assert not fail_upload_commit[0].exists()
    assert not (temp_uploads / str(upload_owner.id)).exists()
    privacy.delete_all_user_data(upload_owner)


def test_upload_commit_compensation_removes_only_its_saved_destination(
    db, upload_owner, no_ingest, temp_uploads, monkeypatch
):
    kept = documents_route.upload_document(
        BackgroundTasks(), db, upload_owner,
        UploadFile(filename="existing.txt", file=BytesIO(b"Existing synthetic upload")), "notes",
    )
    kept_id = kept.id
    owner_id = upload_owner.id
    other_dir = temp_uploads / str(uuid.uuid4())
    other_dir.mkdir()
    other_path = other_dir / "other.txt"
    other_path.write_bytes(b"Other synthetic owner")

    def fail_commit(session):
        raise OperationalError("synthetic commit", {}, Exception("synthetic failure"))

    event.listen(db, "before_commit", fail_commit)
    try:
        with pytest.raises(Exception) as error:
            documents_route.upload_document(
                BackgroundTasks(), db, upload_owner,
                UploadFile(filename="notes.txt", file=BytesIO(b"Rejected synthetic upload")), "notes",
            )
    finally:
        event.remove(db, "before_commit", fail_commit)

    assert isinstance(error.value, AppError)
    kept_path = temp_uploads / str(owner_id) / f"{kept_id}.txt"
    assert set(temp_uploads.rglob("*.txt")) == {kept_path, other_path}
    assert kept_path.read_bytes() == b"Existing synthetic upload"
    assert other_path.read_bytes() == b"Other synthetic owner"
    with SessionLocal() as observer:
        assert [document.id for document in observer.scalars(select(Document))] == [kept_id]


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


@pytest.mark.parametrize("failure", ["vectors", "file"])
def test_document_cleanup_failure_retains_retry_metadata(client, no_ingest, temp_uploads, monkeypatch, failure):
    headers, _ = _auth(client, "cleanup@bmu.edu.in")
    document_id = _upload(client, headers).json()["id"]
    path = next(temp_uploads.rglob("*.txt"))
    diagnostic = "private-vector-path-and-credential"
    def broken(*args, **kwargs):
        raise OSError(diagnostic)
    with monkeypatch.context() as patches:
        if failure == "vectors":
            patches.setattr(documents_route, "delete_by_document", broken)
        else:
            original = Path.unlink
            def unlink(self, *args, **kwargs):
                if self == path:
                    broken()
                return original(self, *args, **kwargs)
            patches.setattr(Path, "unlink", unlink)
        response = client.delete(f"/api/documents/{document_id}", headers=headers)
    assert response.status_code == 503
    assert response.json()["code"] == "cleanup_failed"
    assert diagnostic not in response.text
    assert client.get(f"/api/documents/{document_id}", headers=headers).status_code == 200
    assert client.delete(f"/api/documents/{document_id}", headers=headers).status_code == 204
    assert not path.exists()


def test_upload_cleanup_failure_retains_failed_metadata(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "upload-cleanup@bmu.edu.in")
    monkeypatch.setattr(get_settings(), "max_upload_mb", 0)
    original = Path.unlink
    with monkeypatch.context() as patches:
        def unlink(self, *args, **kwargs):
            if self.suffix == ".txt" and self.is_relative_to(temp_uploads):
                raise OSError("private-upload-cleanup-diagnostic")
            return original(self, *args, **kwargs)
        patches.setattr(Path, "unlink", unlink)
        response = _upload(client, headers)
    assert response.status_code == 503
    assert response.json()["code"] == "cleanup_failed"
    assert "private-upload-cleanup-diagnostic" not in response.text
    documents = client.get("/api/documents", headers=headers).json()
    assert len(documents) == 1
    assert documents[0]["status"] == "failed"
    assert client.delete(f"/api/documents/{documents[0]['id']}", headers=headers).status_code == 204
    assert list(temp_uploads.rglob("*.txt")) == []


def test_extraction_failure_never_publishes_vectors(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "extract-failure@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers, doc_type="handout").json()["id"])
    published = []
    monkeypatch.setattr(pipeline, "add_chunks", lambda *args: published.append(args))
    def fail(text):
        raise RuntimeError("secret-provider-error")
    monkeypatch.setattr(pipeline, "extract_topics", fail)
    pipeline.ingest_document(document_id)
    assert published == []
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        assert document.status == "failed"
        assert "secret-provider-error" not in document.error


def test_partial_vector_publication_is_cleaned_before_failed_status(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "partial@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers).json()["id"])
    vectors = set()
    def publish(uid, document, chunks):
        vectors.add(document.id)
        raise RuntimeError("secret-embedding-diagnostic")
    def cleanup(uid, did):
        with SessionLocal() as db:
            assert db.get(Document, did).status == "processing"
        vectors.discard(did)
    monkeypatch.setattr(pipeline, "add_chunks", publish)
    monkeypatch.setattr(pipeline, "delete_by_document", cleanup)
    pipeline.ingest_document(document_id)
    assert vectors == set()
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        assert document.status == "failed"
        assert "secret-embedding-diagnostic" not in document.error


def test_sql_publication_failure_cleans_vectors_and_rolls_back_topics(client, no_ingest, temp_uploads, monkeypatch):
    headers, course_id = _auth(client, "sql-publication@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers, doc_type="handout").json()["id"])
    vectors = set()
    monkeypatch.setattr(pipeline, "add_chunks", lambda uid, doc, chunks: vectors.add(doc.id))
    monkeypatch.setattr(pipeline, "delete_by_document", lambda uid, did: vectors.discard(did))
    monkeypatch.setattr(pipeline, "extract_topics", lambda text: [TopicDraft(name="Locks")])
    attempts = []
    def fail_once(session):
        attempts.append(True)
        if len(attempts) == 1:
            raise RuntimeError("private-sql-publication-diagnostic")
    event.listen(Session, "before_commit", fail_once)
    try:
        pipeline.ingest_document(document_id)
    finally:
        event.remove(Session, "before_commit", fail_once)
    assert vectors == set()
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        assert document.status == "failed"
        assert "private-sql-publication-diagnostic" not in document.error
        assert db.scalars(select(Topic).where(Topic.course_id == course_id)).all() == []


def test_vector_cleanup_failure_is_reported_without_losing_metadata(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "cleanup-publication@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers).json()["id"])
    def fail(*args):
        raise RuntimeError("secret-cleanup-diagnostic")
    monkeypatch.setattr(pipeline, "add_chunks", fail)
    monkeypatch.setattr(pipeline, "delete_by_document", fail)
    with pytest.raises(AppError) as error:
        pipeline.ingest_document(document_id)
    assert error.value.code == "cleanup_failed"
    assert "secret-cleanup-diagnostic" not in str(error.value)
    with SessionLocal() as db:
        assert db.get(Document, document_id).status == "processing"


@pytest.mark.parametrize("action", ["delete", "ready"])
def test_document_changed_during_parsing_is_not_republished(client, no_ingest, temp_uploads, monkeypatch, action):
    headers, _ = _auth(client, "parse-race@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers).json()["id"])
    published = []
    def parse(path):
        with SessionLocal() as db:
            document = db.get(Document, document_id)
            if action == "delete":
                db.delete(document)
            else:
                document.status = "ready"
            db.commit()
        return [ParsedPage(1, "Deadlocks")]
    monkeypatch.setattr(pipeline, "parse_document", parse)
    monkeypatch.setattr(pipeline, "add_chunks", lambda *args: published.append(args))
    pipeline.ingest_document(document_id)
    assert published == []
    with SessionLocal() as db:
        document = db.get(Document, document_id)
        assert document is None if action == "delete" else document.status == "ready"


def test_publication_locks_user_then_course_before_topic_names(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "publish-lock@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers, doc_type="handout").json()["id"])
    statements = []
    def record(state):
        statements.append(str(state.statement.compile(dialect=postgresql.dialect())))
    def publish(*args):
        assert any("FROM users" in sql and "FOR UPDATE" in sql for sql in statements)
    monkeypatch.setattr(pipeline, "add_chunks", publish)
    monkeypatch.setattr(pipeline, "extract_topics", lambda text: [TopicDraft(name="Locks")])
    event.listen(Session, "do_orm_execute", record)
    try:
        pipeline.ingest_document(document_id)
    finally:
        event.remove(Session, "do_orm_execute", record)
    locks = [sql for sql in statements if "FOR UPDATE" in sql]
    assert len(locks) >= 2
    assert "FROM users" in locks[0]
    assert "FROM courses" in locks[1]
    names_read = next(i for i, sql in enumerate(statements) if "SELECT topics.name" in sql)
    course_lock = next(i for i, sql in enumerate(statements) if "FROM courses" in sql and "FOR UPDATE" in sql)
    assert course_lock < names_read


@pytest.mark.parametrize("operation", ["upload", "delete"])
def test_document_writes_hold_user_lock_until_files_are_changed(client, no_ingest, temp_uploads, monkeypatch, operation):
    headers, _ = _auth(client, "file-lock@bmu.edu.in")
    document_id = _upload(client, headers).json()["id"] if operation == "delete" else None
    locked = []
    def record(state):
        sql = str(state.statement.compile(dialect=postgresql.dialect()))
        if "FROM users" in sql and "FOR UPDATE" in sql:
            locked.append(True)
    def released(session):
        locked.clear()
    event.listen(Session, "do_orm_execute", record)
    event.listen(Session, "after_commit", released)
    try:
        if operation == "upload":
            original = documents_route._save_upload
            def save(file, path):
                assert locked, "Upload released its user lock before saving the file"
                return original(file, path)
            monkeypatch.setattr(documents_route, "_save_upload", save)
            assert _upload(client, headers).status_code == 202
        else:
            cleanup_locks = []
            def cleanup(*args):
                cleanup_locks.append(bool(locked))
            monkeypatch.setattr(documents_route, "delete_by_document", cleanup)
            assert client.delete(f"/api/documents/{document_id}", headers=headers).status_code == 204
            assert cleanup_locks == [True], "Document cleanup needs the publication lock"
    finally:
        event.remove(Session, "do_orm_execute", record)
        event.remove(Session, "after_commit", released)


@pytest.mark.parametrize("suffix", [".docx", ".pptx"])
@pytest.mark.parametrize("budget", ["expanded", "entries"])
def test_office_archive_limits_reject_before_library_constructor(tmp_path, monkeypatch, suffix, budget):
    path = tmp_path / f"tiny{suffix}"
    with ZipFile(path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("one.xml", b"x" * 32)
        archive.writestr("two.xml", b"y" * 32)
    monkeypatch.setattr(parsers, "MAX_ARCHIVE_EXPANDED_BYTES", 40 if budget == "expanded" else 100, raising=False)
    monkeypatch.setattr(parsers, "MAX_ARCHIVE_ENTRIES", 1 if budget == "entries" else 10, raising=False)
    module = __import__("docx" if suffix == ".docx" else "pptx")
    def forbidden(*args, **kwargs):
        pytest.fail("Over-budget archive reached the Office constructor")
    monkeypatch.setattr(module, "Document" if suffix == ".docx" else "Presentation", forbidden)
    with pytest.raises(AppError) as error:
        parse_document(path)
    assert error.value.code == "document_too_complex"
    assert error.value.status_code == 413


@pytest.mark.parametrize("budget", ["pages", "text"])
def test_parser_stops_at_page_or_text_budget(tmp_path, monkeypatch, budget):
    monkeypatch.setattr(parsers, "MAX_DOCUMENT_PAGES", 2, raising=False)
    monkeypatch.setattr(parsers, "MAX_DOCUMENT_TEXT_CHARS", 5 if budget == "text" else 100, raising=False)
    visited = []
    def parse(path):
        for number, text in enumerate(["abc", "def", "", "must-not-read"], 1):
            visited.append(number)
            yield number, text
    monkeypatch.setitem(parsers._PARSERS, ".txt", parse)
    with pytest.raises(AppError) as error:
        parse_document(tmp_path / "tiny.txt")
    assert error.value.code == "document_too_complex"
    assert visited == ([1, 2] if budget == "text" else [1, 2, 3])


def test_text_parser_bounds_read_before_rejecting_resource_limit(tmp_path, monkeypatch):
    from io import StringIO
    monkeypatch.setattr(parsers, "MAX_DOCUMENT_TEXT_CHARS", 5)
    consumed = []
    class TrackingText(StringIO):
        def read(self, size=-1):
            text = super().read(size)
            consumed.append(len(text))
            return text
    monkeypatch.setattr(Path, "open", lambda *args, **kwargs: TrackingText("abcdefmore"))
    with pytest.raises(AppError) as error:
        parse_document(tmp_path / "tiny.txt")
    assert error.value.code == "document_too_complex"
    assert consumed == [6]


def test_pipeline_rejects_chunk_budget_before_embeddings(client, no_ingest, temp_uploads, monkeypatch):
    headers, _ = _auth(client, "chunk-budget@bmu.edu.in")
    document_id = uuid.UUID(_upload(client, headers, content=b"a " * 600).json()["id"])
    monkeypatch.setattr(pipeline, "MAX_DOCUMENT_CHUNKS", 1, raising=False)
    published = []
    monkeypatch.setattr(pipeline, "add_chunks", lambda *args: published.append(args))
    pipeline.ingest_document(document_id)
    assert published == []
    with SessionLocal() as db:
        assert db.get(Document, document_id).status == "failed"


@pytest.mark.parametrize("operation", ["all", "document"])
@pytest.mark.parametrize("failure_type", [OSError, ValueError])
def test_vector_cleanup_treats_only_missing_collection_as_success(monkeypatch, operation, failure_type):
    from chromadb.errors import NotFoundError
    uid, did = uuid.uuid4(), uuid.uuid4()
    def missing(*args, **kwargs):
        raise NotFoundError("collection does not exist")
    monkeypatch.setattr(vector_store, "_client", lambda: SimpleNamespace(delete_collection=missing, get_collection=missing, get_or_create_collection=lambda **kwargs: SimpleNamespace(delete=missing)))
    if operation == "all":
        vector_store.delete_all(uid)
    else:
        vector_store.delete_by_document(uid, did)
    def broken(*args, **kwargs):
        raise failure_type("private-chroma-path")
    monkeypatch.setattr(vector_store, "_client", lambda: SimpleNamespace(delete_collection=broken, get_collection=broken, get_or_create_collection=lambda **kwargs: SimpleNamespace(delete=broken)))
    with pytest.raises(AppError) as error:
        vector_store.delete_all(uid) if operation == "all" else vector_store.delete_by_document(uid, did)
    assert error.value.code == "cleanup_failed"
    assert "private-chroma-path" not in str(error.value)


@pytest.mark.parametrize("operation", ["all", "document"])
def test_vector_cleanup_rejects_legacy_shaped_value_error(monkeypatch, operation):
    uid, did = uuid.uuid4(), uuid.uuid4()

    def broken(*args, **kwargs):
        raise ValueError(f"Collection user_{uid} does not exist.")

    monkeypatch.setattr(
        vector_store,
        "_client",
        lambda: SimpleNamespace(delete_collection=broken, get_collection=broken),
    )
    with pytest.raises(AppError) as error:
        if operation == "all":
            vector_store.delete_all(uid)
        else:
            vector_store.delete_by_document(uid, did)
    assert error.value.code == "cleanup_failed"
    assert error.value.status_code == 503
    assert str(uid) not in str(error.value)


def test_native_vector_cleanup_preserves_other_documents_and_users(tmp_path, monkeypatch):
    import chromadb
    from chromadb.config import Settings
    from chromadb.errors import NotFoundError

    native = chromadb.PersistentClient(
        path=str(tmp_path / "chroma"),
        settings=Settings(anonymized_telemetry=False),
    )
    monkeypatch.setattr(vector_store, "_client", lambda: native)
    owner, other = uuid.uuid4(), uuid.uuid4()
    removed, retained = uuid.uuid4(), uuid.uuid4()
    try:
        collection = native.get_or_create_collection(
            vector_store._collection_name(owner), embedding_function=None
        )
        collection.add(
            ids=["removed", "retained"],
            embeddings=[[1.0, 0.0], [0.0, 1.0]],
            metadatas=[{"document_id": str(removed)}, {"document_id": str(retained)}],
        )
        other_collection = native.get_or_create_collection(
            vector_store._collection_name(other), embedding_function=None
        )
        other_collection.add(ids=["other"], embeddings=[[1.0, 0.0]])

        vector_store.delete_by_document(owner, removed)
        vector_store.delete_by_document(owner, removed)
        assert collection.get()["ids"] == ["retained"]
        assert other_collection.get()["ids"] == ["other"]

        vector_store.delete_all(owner)
        vector_store.delete_all(owner)
        vector_store.delete_by_document(owner, retained)
        with pytest.raises(NotFoundError):
            native.get_collection(vector_store._collection_name(owner))
        assert other_collection.get()["ids"] == ["other"]
    finally:
        native.close()


def test_vector_query_excludes_failed_deleted_processing_and_foreign_documents(db, monkeypatch):
    owner, other = User(name="Owner", email="vectors@bmu.edu.in", password_hash="fake"), User(name="Other", email="vectors-other@bmu.edu.in", password_hash="fake")
    db.add_all([owner, other])
    db.flush()
    course, foreign_course = Course(user_id=owner.id), Course(user_id=other.id)
    db.add_all([course, foreign_course])
    db.flush()
    docs = [Document(user_id=owner.id, course_id=course.id, filename="ready.txt", doc_type="notes", status=status) for status in ["ready", "failed", "processing"]]
    foreign = Document(user_id=other.id, course_id=foreign_course.id, filename="foreign.txt", doc_type="notes", status="ready")
    db.add_all([*docs, foreign])
    db.commit()
    ids = [docs[1].id, uuid.uuid4(), docs[2].id, foreign.id, docs[0].id]
    def search(**kwargs):
        return {"ids": [[f"{did}:0" for did in ids]], "documents": [["chunk"] * 5], "metadatas": [[{"document_id": str(did), "filename": "stale-name.txt", "page": 1, "doc_type": "notes", "chunk_index": 0} for did in ids]], "distances": [[0.1] * 5]}
    monkeypatch.setattr(vector_store, "_collection", lambda uid: SimpleNamespace(count=lambda: 5, query=search))
    monkeypatch.setattr(vector_store, "get_embeddings", lambda: SimpleNamespace(embed_query=lambda text: [0.0]))
    matches = vector_store.query(owner.id, "deadlocks", k=5)
    assert [match.document_id for match in matches] == [str(docs[0].id)]
    assert matches[0].filename == "ready.txt"
    docs[0].status = "failed"
    db.commit()
    assert vector_store.query(owner.id, "deadlocks", k=5) == []
