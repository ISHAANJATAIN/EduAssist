from __future__ import annotations

import json
import re
from typing import Annotated

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, StringConstraints, field_validator

from app.prompts import load_prompt
from app.services.llm.client import get_chat_model

MAX_TOPICS = 30
MAX_INPUT_CHARS = 12_000

TopicName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]


class TopicDraft(BaseModel):
    name: TopicName
    description: str | None = None

    @field_validator("description")
    @classmethod
    def _trim_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value[:240] or None


def _extract_json(raw: str) -> dict:
    text = re.sub(r"<think(?:ing)?>.*?</think(?:ing)?>", "", raw, flags=re.DOTALL)
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1)

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("The model did not return JSON.")

    payload = json.loads(text[start : end + 1])
    if not isinstance(payload, dict):
        raise ValueError("The model did not return a JSON object.")
    return payload


def extract_topics(text: str) -> list[TopicDraft]:
    payload = text.strip()[:MAX_INPUT_CHARS]
    if not payload:
        return []

    response = get_chat_model().invoke(
        [
            SystemMessage(content=load_prompt("topic_extraction")),
            HumanMessage(content=payload),
        ]
    )
    content = response.content
    if not isinstance(content, str):
        content = str(content)

    raw_topics = _extract_json(content).get("topics", [])
    if not isinstance(raw_topics, list):
        raise ValueError("The model returned an unexpected topic list.")

    drafts: list[TopicDraft] = []
    seen: set[str] = set()
    for item in raw_topics:
        if not isinstance(item, dict):
            continue
        try:
            draft = TopicDraft.model_validate(item)
        except ValueError:
            continue
        key = draft.name.casefold()
        if key in seen:
            continue
        seen.add(key)
        drafts.append(draft)
        if len(drafts) >= MAX_TOPICS:
            break

    if not drafts:
        raise ValueError("The model did not return any usable topics.")
    return drafts
