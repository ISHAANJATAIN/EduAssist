from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.code = code
        self.detail = detail
        self.status_code = status_code
        super().__init__(detail)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            {"detail": exc.detail, "code": exc.code},
            status_code=exc.status_code,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first = errors[0] if errors else {"msg": "Invalid request", "loc": ()}
        loc = [str(part) for part in first.get("loc", ()) if part not in ("body", "query", "path")]
        detail = f"{'.'.join(loc)}: {first['msg']}" if loc else str(first["msg"])
        return JSONResponse(
            {"detail": detail, "code": "validation_error"},
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
