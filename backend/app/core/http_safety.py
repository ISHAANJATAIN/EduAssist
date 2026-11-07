from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class HttpSafetyMiddleware:
    def __init__(self, app: ASGIApp, upload_path: str, max_bytes: int):
        self.app = app
        self.upload_path = upload_path
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)

        async def safe_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Content-Type-Options"] = "nosniff"
                response_headers["X-Frame-Options"] = "DENY"
                response_headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
                response_headers["Cache-Control"] = "no-store"
            await send(message)

        async def reject() -> None:
            response = JSONResponse(
                {"code": "file_too_large", "detail": "Upload request is too large."},
                status_code=413,
            )
            await response(scope, receive, safe_send)

        if scope["method"] == "POST" and scope["path"].rstrip("/") == self.upload_path:
            length = headers.get("content-length")
            if length and length.isdecimal() and int(length) > self.max_bytes:
                await reject()
                return

            messages: list[Message] = []
            size = 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                size += len(message.get("body", b""))
                if size > self.max_bytes:
                    await reject()
                    return
                messages.append(message)
                if not message.get("more_body", False):
                    break

            buffered = iter(messages)

            async def replay() -> Message:
                return next(buffered, {"type": "http.disconnect"})

            await self.app(scope, replay, safe_send)
            return

        await self.app(scope, receive, safe_send)
