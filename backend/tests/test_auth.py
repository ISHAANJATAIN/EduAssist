from datetime import date

from fastapi.testclient import TestClient

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


def test_course_requires_authentication(client: TestClient):
    response = client.get("/api/course")

    assert response.status_code == 401
