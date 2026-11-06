import uuid
from datetime import datetime
from typing import Literal

from app.schemas.common import ORMModel

DocType = Literal["lecture", "slides", "notes", "textbook", "handout"]
DocStatus = Literal["processing", "ready", "failed"]


class DocumentOut(ORMModel):
    id: uuid.UUID
    filename: str
    doc_type: DocType
    status: DocStatus
    page_count: int
    chunk_count: int
    error: str | None
    uploaded_at: datetime
