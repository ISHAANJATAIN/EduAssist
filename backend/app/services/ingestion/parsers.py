from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from app.core.errors import AppError

SUPPORTED_EXTENSIONS = {".pdf", ".pptx", ".docx", ".txt", ".md"}


@dataclass(frozen=True)
class ParsedPage:
    number: int
    text: str


def _parse_pdf(path: Path) -> Iterable[tuple[int, str]]:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    for number, page in enumerate(reader.pages, start=1):
        yield number, page.extract_text() or ""


def _parse_pptx(path: Path) -> Iterable[tuple[int, str]]:
    from pptx import Presentation

    presentation = Presentation(str(path))
    for number, slide in enumerate(presentation.slides, start=1):
        parts: list[str] = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                parts.append(shape.text_frame.text)
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    parts.append(" | ".join(cell.text for cell in row.cells))
        yield number, "\n".join(part for part in parts if part.strip())


def _parse_docx(path: Path) -> Iterable[tuple[int, str]]:
    from docx import Document as DocxDocument

    document = DocxDocument(str(path))
    parts = [paragraph.text for paragraph in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text for cell in row.cells))
    yield 1, "\n".join(part for part in parts if part.strip())


def _parse_text(path: Path) -> Iterable[tuple[int, str]]:
    yield 1, path.read_text(encoding="utf-8", errors="replace")


_PARSERS = {
    ".pdf": _parse_pdf,
    ".pptx": _parse_pptx,
    ".docx": _parse_docx,
    ".txt": _parse_text,
    ".md": _parse_text,
}


def parse_document(path: Path) -> list[ParsedPage]:
    suffix = path.suffix.lower()
    parser = _PARSERS.get(suffix)
    if parser is None:
        allowed = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise AppError(
            "unsupported_file_type",
            f"Unsupported file type '{suffix or 'unknown'}'. Allowed: {allowed}.",
            415,
        )

    pages = [
        ParsedPage(number=number, text=text.strip())
        for number, text in parser(path)
        if text and text.strip()
    ]
    if not pages:
        raise ValueError("No extractable text found in the document.")
    return pages
