from datetime import date

import pytest
from fastapi.testclient import TestClient
from passlib.hash import bcrypt
from sqlalchemy import event
from sqlalchemy.dialects import postgresql

from app.core.security import hash_password, verify_password
from app.db.session import SessionLocal
from app.models.user import User

VALID_USER = {
    "name": "  Ishan Jatain  ",
    "email": "  Ishan@BMU.edu.in ",
    "password": "study-buddy-1",
}


def register(client: TestClient, **overrides):
    payload = {**VALID_USER, **overrides}
    return client.post("/api/auth/register", json=payload)


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_register_returns_token_and_user(client: TestClient):
    response = register(client)

    assert response.status_code == 201
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["name"] == "Ishan Jatain"
    assert body["user"]["email"] == "ishan@bmu.edu.in"


def test_register_rejects_duplicate_email(client: TestClient):
    register(client)
    response = register(client)

    assert response.status_code == 409
    assert response.json()["code"] == "email_taken"


def test_register_rejects_short_password(client: TestClient):
    response = register(client, password="short")

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_login_is_case_insensitive_for_email(client: TestClient):
    register(client)
    response = client.post(
        "/api/auth/login",
        json={"email": "ISHAN@bmu.EDU.IN", "password": VALID_USER["password"]},
    )

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_rejects_wrong_password(client: TestClient):
    register(client)
    response = client.post(
        "/api/auth/login",
        json={"email": VALID_USER["email"].strip(), "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"


def test_me_requires_a_valid_token(client: TestClient):
    missing = client.get("/api/auth/me")
    invalid = client.get("/api/auth/me", headers=auth_header("not-a-jwt"))

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert invalid.json()["code"] == "invalid_credentials"


def test_me_returns_the_signed_in_user(client: TestClient):
    token = register(client).json()["access_token"]
    response = client.get("/api/auth/me", headers=auth_header(token))

    assert response.status_code == 200
    assert response.json()["email"] == "ishan@bmu.edu.in"


def test_course_defaults_then_updates_and_persists(client: TestClient):
    token = register(client).json()["access_token"]
    headers = auth_header(token)

    created = client.get("/api/course", headers=headers)
    assert created.status_code == 200
    assert created.json()["free_hours_per_day"] == 2

    updated = client.put(
        "/api/course",
        headers=headers,
        json={"name": "Compiler Design", "exam_date": "2026-12-01", "free_hours_per_day": 3.5},
    )
    assert updated.status_code == 200

    fetched = client.get("/api/course", headers=headers)
    body = fetched.json()
    assert body["name"] == "Compiler Design"
    assert body["exam_date"] == date(2026, 12, 1).isoformat()
    assert body["free_hours_per_day"] == 3.5


@pytest.mark.parametrize("prefix", ["a" * 72, "é" * 36])
def test_long_registered_passwords_do_not_share_a_bcrypt_prefix(client: TestClient, prefix):
    password = prefix + "first-password"
    assert register(client, password=password).status_code == 201

    legitimate = client.post(
        "/api/auth/login", json={"email": "ishan@bmu.edu.in", "password": password}
    )
    alternate = client.post(
        "/api/auth/login", json={"email": "ishan@bmu.edu.in", "password": prefix + "other-password"}
    )

    assert legitimate.status_code == 200
    assert alternate.status_code == 401


@pytest.mark.parametrize("prefix", ["a" * 72, "é" * 36, "a" * 71 + "é"])
def test_legacy_long_password_login_upgrades_full_password(client: TestClient, prefix):
    password = prefix + "original-password"
    legacy_hash = bcrypt.hash(password)
    with SessionLocal() as db:
        user = User(email="legacy@bmu.edu.in", name="Legacy User", password_hash=legacy_hash)
        db.add(user)
        db.commit()
        user_id = user.id

    response = client.post(
        "/api/auth/login", json={"email": "LEGACY@bmu.edu.in", "password": password}
    )
    assert response.status_code == 200
    assert response.json()["access_token"]
    with SessionLocal() as db:
        upgraded_hash = db.get(User, user_id).password_hash
    assert upgraded_hash != legacy_hash
    assert upgraded_hash.startswith("$bcrypt-sha256$")
    assert verify_password(password, upgraded_hash)

    truncated_prefix = password.encode("utf-8")[:72].decode("utf-8", errors="ignore")
    for candidate in (prefix + "alternate-password", truncated_prefix):
        rejected = client.post(
            "/api/auth/login", json={"email": "legacy@bmu.edu.in", "password": candidate}
        )
        assert rejected.status_code == 401
        assert rejected.json()["code"] == "invalid_credentials"

    repeated = client.post(
        "/api/auth/login", json={"email": "legacy@bmu.edu.in", "password": password}
    )
    assert repeated.status_code == 200
    with SessionLocal() as db:
        assert db.get(User, user_id).password_hash == upgraded_hash


@pytest.mark.parametrize("password", ["study-buddy-1", "a" * 80, "é" * 40])
def test_failed_legacy_login_leaves_hash_unchanged(client: TestClient, password):
    legacy_hash = bcrypt.hash(password)
    with SessionLocal() as db:
        user = User(email="legacy@bmu.edu.in", name="Legacy User", password_hash=legacy_hash)
        db.add(user)
        db.commit()
        user_id = user.id

    response = client.post(
        "/api/auth/login",
        json={"email": "legacy@bmu.edu.in", "password": "wrong-" + password},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_credentials"
    with SessionLocal() as db:
        assert db.get(User, user_id).password_hash == legacy_hash


def test_legacy_login_selects_user_for_update(client: TestClient):
    with SessionLocal() as db:
        user = User(
            email="ishan@bmu.edu.in",
            name="Legacy User",
            password_hash=bcrypt.hash(VALID_USER["password"]),
        )
        db.add(user)
        db.commit()
        user_id = user.id
    statements = []

    def capture_select(execute_state):
        if execute_state.is_select:
            statements.append(execute_state.statement)

    event.listen(SessionLocal, "do_orm_execute", capture_select)
    try:
        response = client.post(
            "/api/auth/login",
            json={"email": "ishan@bmu.edu.in", "password": VALID_USER["password"]},
        )
    finally:
        event.remove(SessionLocal, "do_orm_execute", capture_select)

    assert response.status_code == 200
    # SQLite cannot enforce row locks; check the query emitted for PostgreSQL.
    sql = str(statements[0].compile(dialect=postgresql.dialect()))
    assert "WHERE users.email =" in sql
    assert sql.endswith("FOR UPDATE")
    with SessionLocal() as db:
        assert db.get(User, user_id).password_hash.startswith("$bcrypt-sha256$")


def test_legacy_login_upgrade_rolls_back_if_commit_fails(client: TestClient):
    legacy_hash = bcrypt.hash(VALID_USER["password"])
    with SessionLocal() as db:
        user = User(email="legacy@bmu.edu.in", name="Legacy User", password_hash=legacy_hash)
        db.add(user)
        db.commit()
        user_id = user.id

    def fail_commit(db):
        db.flush()
        raise RuntimeError("migration commit failed")

    event.listen(SessionLocal, "before_commit", fail_commit)
    try:
        with pytest.raises(RuntimeError, match="migration commit failed"):
            client.post(
                "/api/auth/login",
                json={"email": "legacy@bmu.edu.in", "password": VALID_USER["password"]},
            )
    finally:
        event.remove(SessionLocal, "before_commit", fail_commit)

    with SessionLocal() as db:
        assert db.get(User, user_id).password_hash == legacy_hash


@pytest.mark.parametrize("password", ["a" * 128, "é" * 128])
def test_new_hashes_verify_the_full_registration_password_limit(password):
    hashed = hash_password(password)
    assert verify_password(password, hashed)
    assert not verify_password(password[:-1] + "b", hashed)


def test_course_requires_authentication(client: TestClient):
    response = client.get("/api/course")

    assert response.status_code == 401
