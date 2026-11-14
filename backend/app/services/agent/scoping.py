from __future__ import annotations

import re
from collections.abc import Sequence

_MODULE_NUMBER = re.compile(r"\bmodules?\s*#?\s*(\d{1,2})\b", re.IGNORECASE)
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize(value: str) -> str:
    spaced = re.sub(r"(?<=[a-z])(?=\d)", " ", value.casefold())
    return _NON_ALNUM.sub(" ", spaced).strip()


def module_numbers(value: str) -> set[int]:
    return {int(number) for number in _MODULE_NUMBER.findall(normalize(value))}


def match_documents(
    message: str, modules: Sequence[int], documents: Sequence
) -> list:
    """Documents named in the message either by filename or by module number."""
    text = f" {normalize(message)} "
    wanted = set(modules)
    selected = []
    for document in documents:
        name = normalize(document.filename)
        stem = name.rsplit(" ", 1)[0] if " " in name else name
        if stem and f" {stem} " in text:
            selected.append(document)
        elif wanted and module_numbers(document.filename) & wanted:
            selected.append(document)
    return selected
