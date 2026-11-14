from __future__ import annotations

import json
import uuid
from dataclasses import replace
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings

from app.services.ingestion.vector_store import ChunkMatch
from app.services.quiz import generator

PASSWORD = "study-buddy-1"


def _auth(client: TestClient, email: str = "quiz@bmu.edu.in") -> dict[str, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Quizzer", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _topic(client: TestClient, headers: dict[str, str], name: str = "Deadlock") -> str:
    response = client.post(
        "/api/topics",
        headers=headers,
        json={"name": name, "description": "Deadlock conditions", "prerequisite_ids": []},
    )
    assert response.status_code == 200
    return response.json()["id"]


def _chunk(index: int = 0, page: int = 5) -> ChunkMatch:
    return ChunkMatch(
        text="A deadlock needs mutual exclusion, hold and wait, no preemption and circular wait.",
        document_id=str(uuid.uuid4()),
        filename="os-sample.pptx",
        page=page,
        doc_type="slides",
        chunk_index=index,
        score=0.82,
    )


def _patch_chunks(monkeypatch, chunks: list[ChunkMatch] | None = None) -> None:
    monkeypatch.setattr(
        generator,
        "query",
        lambda *args, **kwargs: list(chunks if chunks is not None else [_chunk()]),
    )


class FakeModel:
    def __init__(self, replies: list[str]) -> None:
        self.replies = replies
        self.calls = 0

    def invoke(self, messages):
        reply = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        return SimpleNamespace(content=reply)


def _patch_llm(monkeypatch, replies: list[str]) -> FakeModel:
    model = FakeModel(replies)
    monkeypatch.setattr(generator, "get_chat_model", lambda: model)
    return model


def _question(
    question: str,
    correct_index: int,
    topic_index: int = 1,
    excerpt: int = 1,
) -> dict:
    return {
        "topic_index": topic_index,
        "excerpt": excerpt,
        "question": question,
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_index": correct_index,
        "explanation": f"Explanation for {question}",
    }


def _quiz_reply(questions: list[dict]) -> str:
    return json.dumps({"items": questions})


def _make_quiz(
    client: TestClient,
    headers: dict[str, str],
    monkeypatch,
    questions: int = 2,
) -> dict:
    topic_id = _topic(client, headers)
    items = [
        _question(f"Question {index}?", index % 4) for index in range(questions)
    ]
    _patch_llm(monkeypatch, [_quiz_reply(items)])
    _patch_chunks(monkeypatch)
    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "difficulty": "medium", "num_items": questions},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_quiz_returns_public_items_without_answers(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client)
    topic_id = _topic(client, headers)
    _patch_chunks(monkeypatch)
    model = _patch_llm(
        monkeypatch,
        [
            _quiz_reply(
                [
                    _question("What does deadlock require?", 1),
                    _question("Which condition is absent when resources are preempted?", 0),
                ]
            )
        ],
    )

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "difficulty": "hard", "num_items": 2},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["kind"] == "quiz"
    assert body["difficulty"] == "hard"
    assert body["topic_ids"] == [topic_id]
    assert len(body["items"]) == 2
    assert body["items"][0]["options"] == [
        "Option A",
        "Option B",
        "Option C",
        "Option D",
    ]
    assert body["items"][0]["source"] == {"filename": "os-sample.pptx", "page": 5}
    assert "correct_index" not in body["items"][0]
    assert "explanation" not in body["items"][0]
    assert model.calls == 1

    fetched = client.get(f"/api/quizzes/{body['id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json() == body


def test_option_letter_prefixes_are_removed(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "prefix@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch)
    _patch_llm(
        monkeypatch,
        [
            _quiz_reply(
                [
                    {
                        "topic_index": 1,
                        "excerpt": 1,
                        "question": "Which condition is required?",
                        "options": [
                            "A) Mutual exclusion",
                            "B) Preemption",
                            "C) Starvation",
                            "D) Thrashing",
                        ],
                        "correct_index": 0,
                        "explanation": "Mutual exclusion is required.",
                    }
                ]
            )
        ],
    )

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "num_items": 1},
    )

    assert response.status_code == 201
    assert response.json()["items"][0]["options"] == [
        "Mutual exclusion",
        "Preemption",
        "Starvation",
        "Thrashing",
    ]


def test_create_quiz_requires_topics(client: TestClient) -> None:
    headers = _auth(client, "empty@bmu.edu.in")

    response = client.post(
        "/api/quizzes", headers=headers, json={"kind": "quiz"}
    )

    assert response.status_code == 409
    assert response.json()["code"] == "no_material"


def test_create_quiz_requires_ready_material(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "nomaterial@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch, [])

    response = client.post(
        "/api/quizzes", headers=headers, json={"kind": "quiz"}
    )

    assert response.status_code == 409
    assert response.json()["code"] == "no_material"


def test_invalid_model_output_returns_unavailable(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "badllm@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch)
    model = _patch_llm(monkeypatch, ["I cannot do that", "Still not JSON"])

    response = client.post(
        "/api/quizzes", headers=headers, json={"kind": "quiz"}
    )

    assert response.status_code == 503
    assert response.json()["code"] == "llm_unavailable"
    assert model.calls == 2


def test_invalid_output_is_repaired_once(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "repair@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch)
    model = _patch_llm(
        monkeypatch,
        ["nope", _quiz_reply([_question("What does deadlock require?", 1)])],
    )

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "num_items": 1},
    )

    assert response.status_code == 201
    assert len(response.json()["items"]) == 1
    assert model.calls == 2


def test_negative_question_is_repaired(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "negative@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch)
    model = _patch_llm(
        monkeypatch,
        [
            _quiz_reply([_question("Which is NOT a Coffman condition?", 0)]),
            _quiz_reply([_question("Which is a Coffman condition?", 0)]),
        ],
    )

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "num_items": 1},
    )

    assert response.status_code == 201
    assert response.json()["items"][0]["question"] == "Which is a Coffman condition?"
    assert model.calls == 2


def test_invalid_item_is_replaced_without_losing_valid_ones(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "partial@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch)
    model = _patch_llm(
        monkeypatch,
        [
            _quiz_reply(
                [
                    _question("Which is NOT a Coffman condition?", 0),
                    _question("What does deadlock require?", 1),
                ]
            ),
            _quiz_reply([_question("Which algorithm avoids deadlock?", 0)]),
        ],
    )

    response = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "quiz", "num_items": 2},
    )

    assert response.status_code == 201
    assert [item["question"] for item in response.json()["items"]] == [
        "What does deadlock require?",
        "Which algorithm avoids deadlock?",
    ]
    assert model.calls == 2


def test_scoring_counts_answers_and_persists_attempt(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "score@bmu.edu.in")
    quiz = _make_quiz(client, headers, monkeypatch, questions=2)

    response = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={
            "answers": [
                {"item_id": quiz["items"][0]["id"], "selected_index": 0},
                {"item_id": quiz["items"][1]["id"], "selected_index": 2},
            ]
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["score_percent"] == 50.0
    assert body["correct_count"] == 1
    assert body["total"] == 2
    assert body["attempt_id"]
    assert body["mastery_updates"] == [
        {"topic_id": quiz["topic_ids"][0], "old": 0.0, "new": 50.0}
    ]
    assert body["recommendations"] == []
    assert body["results"][0]["correct"] is True
    assert body["results"][0]["correct_index"] == 0
    assert body["results"][0]["explanation"] == "Explanation for Question 0?"
    assert body["results"][1]["correct"] is False
    assert body["results"][1]["correct_index"] == 1


def test_second_low_score_recommends_revision(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "revise@bmu.edu.in")
    quiz = _make_quiz(client, headers, monkeypatch, questions=2)
    answers = [
        {"item_id": quiz["items"][0]["id"], "selected_index": 1},
        {"item_id": quiz["items"][1]["id"], "selected_index": 0},
    ]

    first = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={"answers": answers},
    )
    second = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={"answers": answers},
    )

    assert first.status_code == 201
    assert first.json()["mastery_updates"][0]["new"] == 0.0
    assert first.json()["recommendations"] == []
    assert second.status_code == 201
    assert second.json()["mastery_updates"] == [
        {"topic_id": quiz["topic_ids"][0], "old": 0.0, "new": 0.0}
    ]
    assert second.json()["recommendations"] == [
        {
            "topic_id": quiz["topic_ids"][0],
            "topic_name": "Deadlock",
            "action": "revise",
            "reason": (
                "Last score was 0% after 2 attempts. "
                "Re-read the material and try again."
            ),
            "rule_id": "R1",
        }
    ]


def test_attempt_must_answer_every_item_exactly_once(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "incomplete@bmu.edu.in")
    quiz = _make_quiz(client, headers, monkeypatch, questions=2)
    first = {"item_id": quiz["items"][0]["id"], "selected_index": 0}

    missing = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={"answers": [first]},
    )
    duplicate = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={"answers": [first, first]},
    )
    unknown = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={
            "answers": [
                first,
                {"item_id": "does-not-exist", "selected_index": 1},
            ]
        },
    )

    for response in (missing, duplicate, unknown):
        assert response.status_code == 422
        assert response.json()["code"] == "validation_error"


def test_flashcards_use_ratings(client: TestClient, monkeypatch) -> None:
    headers = _auth(client, "cards@bmu.edu.in")
    _topic(client, headers)
    _patch_chunks(monkeypatch)
    _patch_llm(
        monkeypatch,
        [
            _quiz_reply(
                [
                    {
                        "topic_index": 1,
                        "excerpt": 1,
                        "front": "What is mutual exclusion?",
                        "back": "Only one process uses a resource at a time.",
                    },
                    {
                        "topic_index": 1,
                        "excerpt": 1,
                        "front": "What is circular wait?",
                        "back": "Each process waits for a resource held by the next.",
                    },
                ]
            )
        ],
    )

    created = client.post(
        "/api/quizzes",
        headers=headers,
        json={"kind": "flashcards", "num_items": 2},
    )
    assert created.status_code == 201
    quiz = created.json()
    assert quiz["items"][0]["front"] == "What is mutual exclusion?"
    assert quiz["items"][0]["back"].startswith("Only one process")

    response = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={
            "ratings": [
                {"item_id": quiz["items"][0]["id"], "known": True},
                {"item_id": quiz["items"][1]["id"], "known": False},
            ]
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["score_percent"] == 50.0
    assert body["results"][0]["explanation"].startswith("Only one process")
    assert body["results"][0]["correct_index"] is None


def test_attempt_mode_must_match_quiz_kind(
    client: TestClient, monkeypatch
) -> None:
    headers = _auth(client, "mode@bmu.edu.in")
    quiz = _make_quiz(client, headers, monkeypatch, questions=1)

    response = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=headers,
        json={"ratings": [{"item_id": quiz["items"][0]["id"], "known": True}]},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


def test_quiz_is_private_to_its_owner(client: TestClient, monkeypatch) -> None:
    owner = _auth(client, "owner@bmu.edu.in")
    other = _auth(client, "other@bmu.edu.in")
    quiz = _make_quiz(client, owner, monkeypatch, questions=1)

    read = client.get(f"/api/quizzes/{quiz['id']}", headers=other)
    submit = client.post(
        f"/api/quizzes/{quiz['id']}/attempts",
        headers=other,
        json={
            "answers": [{"item_id": quiz["items"][0]["id"], "selected_index": 0}]
        },
    )

    assert read.status_code == 404
    assert submit.status_code == 404
    assert read.json()["code"] == "not_found"


@pytest.mark.parametrize("kind", ["quiz", "flashcards"])
@pytest.mark.parametrize(
    ("minimum", "score", "expected"),
    [(0.30, 0.01, 409), (0.30, 0.299, 409), (0.30, 0.30, 201),
     (0.30, 0.301, 201), (0.60, 0.599, 409), (0.60, 0.60, 201)],
)
def test_quiz_generation_requires_retrieval_score_threshold(
    client, monkeypatch, kind, minimum, score, expected
):
    headers = _auth(client)
    _topic(client, headers)
    monkeypatch.setattr(get_settings(), "retrieval_min_score", minimum)
    _patch_chunks(monkeypatch, [replace(_chunk(), score=score)])
    draft = _question("What does deadlock require?", 0) if kind == "quiz" else {
        "topic_index": 1, "excerpt": 1, "front": "What is deadlock?", "back": "Circular waiting.",
    }
    model = _patch_llm(monkeypatch, [_quiz_reply([draft])])

    response = client.post("/api/quizzes", headers=headers, json={"kind": kind, "num_items": 1})

    assert response.status_code == expected
    if expected == 409:
        assert response.json()["code"] == "no_material"
        assert model.calls == 0
    else:
        assert len(response.json()["items"]) == 1


def test_low_score_excerpts_are_not_available_as_quiz_sources(client, monkeypatch):
    headers = _auth(client)
    _topic(client, headers)
    monkeypatch.setattr(get_settings(), "retrieval_min_score", 0.30)
    _patch_chunks(monkeypatch, [replace(_chunk(), score=0.01, filename="irrelevant.pdf"), _chunk()])
    _patch_llm(monkeypatch, [_quiz_reply([_question("What does deadlock require?", 0)])])

    response = client.post("/api/quizzes", headers=headers, json={"kind": "quiz", "num_items": 1})

    assert response.status_code == 201
    assert response.json()["items"][0]["source"]["filename"] == "os-sample.pptx"


def test_topics_without_relevant_chunks_are_not_activated(client, monkeypatch):
    headers = _auth(client)
    _topic(client, headers, "Deadlock")
    paging = _topic(client, headers, "Paging")
    monkeypatch.setattr(get_settings(), "retrieval_min_score", 0.30)
    monkeypatch.setattr(generator, "query", lambda user_id, text, k, document_ids=None: [
        replace(_chunk(), score=0.01 if text.startswith("Deadlock") else 0.82)
    ])
    _patch_llm(monkeypatch, [_quiz_reply([_question("What is paging?", 0)])])

    response = client.post("/api/quizzes", headers=headers, json={"kind": "quiz", "num_items": 1})

    assert response.status_code == 201
    assert response.json()["topic_ids"] == [paging]
    assert response.json()["items"][0]["topic_id"] == paging


def test_quizzes_require_authentication(client: TestClient) -> None:
    response = client.post("/api/quizzes", json={"kind": "quiz"})

    assert response.status_code == 401
