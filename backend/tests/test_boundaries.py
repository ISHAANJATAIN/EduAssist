import asyncio

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.session import engine


def test_sqlite_enforces_foreign_keys():
    with engine.connect() as connection:
        assert connection.scalar(text("PRAGMA foreign_keys")) == 1


def test_upload_rejects_oversized_declared_body_before_authentication(client: TestClient):
    response = client.post(
        "/api/documents",
        content=b"small",
        headers={"Content-Length": str(27 * 1024 * 1024)},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"


def test_health_includes_security_headers(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["x-frame-options"] == "DENY"


def test_health_does_not_cache_authenticated_responses(client: TestClient):
    response = client.get("/api/health", headers={"Authorization": "Bearer synthetic"})
    assert response.headers["cache-control"] == "no-store"


def test_chunked_upload_rejects_before_downstream_parsing():
    from app.core.http_safety import HttpSafetyMiddleware

    invoked = False
    received = []
    body = iter([
        {"type": "http.request", "body": b"1234", "more_body": True},
        {"type": "http.request", "body": b"5678", "more_body": False},
    ])

    async def downstream(scope, receive, send):
        nonlocal invoked
        invoked = True

    async def receive():
        return next(body)

    async def send(message):
        received.append(message)

    middleware = HttpSafetyMiddleware(downstream, "/api/documents", max_bytes=6)
    scope = {"type": "http", "method": "POST", "path": "/api/documents", "headers": []}
    asyncio.run(middleware(scope, receive, send))
    assert not invoked
    assert received[0]["status"] == 413


def test_small_chunked_upload_preserves_body():
    from app.core.http_safety import HttpSafetyMiddleware

    received = []
    body = iter([
        {"type": "http.request", "body": b"12", "more_body": True},
        {"type": "http.request", "body": b"34", "more_body": False},
    ])

    async def downstream(scope, receive, send):
        received.append((await receive())["body"])
        received.append((await receive())["body"])

    async def receive():
        return next(body)

    async def send(message):
        pass

    middleware = HttpSafetyMiddleware(downstream, "/api/documents", max_bytes=6)
    scope = {"type": "http", "method": "POST", "path": "/api/documents", "headers": []}
    asyncio.run(middleware(scope, receive, send))
    assert received == [b"12", b"34"]
