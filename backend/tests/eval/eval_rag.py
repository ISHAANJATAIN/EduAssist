"""Retrieval and citation evaluation for the RAG pipeline.

Run from backend/ after the eval material has been ingested for a user:

    ./.venv/Scripts/python tests/eval/eval_rag.py --email eval@bmu.edu.in
    ./.venv/Scripts/python tests/eval/eval_rag.py --email eval@bmu.edu.in --answers
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.errors import AppError  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.rag.chain import answer  # noqa: E402
from app.services.rag.retriever import retrieve  # noqa: E402

DATASET = Path(__file__).with_name("eval_questions.json")


def load_questions(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))["questions"]


def find_source(matches, filename: str, page: int) -> tuple[bool, int | None]:
    for rank, match in enumerate(matches, start=1):
        if match.filename == filename and match.page == page:
            return True, rank
    return False, None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--email",
        required=True,
        help="Email of the user whose library is evaluated.",
    )
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument(
        "--answers",
        action="store_true",
        help="Also run the full RAG chain (requires the configured LLM).",
    )
    args = parser.parse_args()

    questions = load_questions(args.dataset)

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email))
        if user is None:
            print(f"No user with email {args.email}. Ingest the eval material first.")
            return 2
        user_id = user.id

    top_k = get_settings().retrieval_top_k
    rows: list[dict[str, Any]] = []

    for item in questions:
        matches = retrieve(user_id, item["question"])
        hit, rank = find_source(matches, item["expected_filename"], item["expected_page"])
        context = " ".join(match.text.lower() for match in matches)
        terms_ok = all(
            term.lower() in context for term in item.get("expected_terms", [])
        )
        reply = None
        cited = None
        error = None
        if args.answers:
            try:
                reply = answer(user_id, item["question"])
                cited = any(
                    citation.filename == item["expected_filename"]
                    and citation.page == item["expected_page"]
                    for citation in reply.citations
                )
            except AppError as exc:
                error = exc.detail

        rows.append(
            {
                "id": item["id"],
                "hit": hit,
                "rank": rank,
                "top": matches[0].score if matches else 0.0,
                "terms": terms_ok,
                "grounded": None if reply is None else reply.grounded,
                "cited": cited,
                "error": error,
            }
        )

    print(f"{'id':<5} {'hit':<4} {'rank':<5} {'top':<6} {'terms':<6}", end="")
    if args.answers:
        print(f" {'grounded':<9} {'cited':<6} error", end="")
    print()

    for row in rows:
        print(
            f"{row['id']:<5} {'yes' if row['hit'] else 'no':<4} "
            f"{row['rank'] or '-':<5} {row['top']:.2f}   "
            f"{'yes' if row['terms'] else 'no':<6}",
            end="",
        )
        if args.answers:
            print(
                f" {str(row['grounded']):<9} "
                f"{str(row['cited'] if row['cited'] is not None else '-'):<6} "
                f"{row['error'] or ''}",
                end="",
            )
        print()

    hits = sum(row["hit"] for row in rows)
    mrr = sum(1 / row["rank"] for row in rows if row["rank"]) / len(rows)
    print(f"\nRetrieval hit@{top_k}: {hits}/{len(rows)} ({hits / len(rows):.0%})")
    print(f"MRR: {mrr:.2f}")

    if args.answers:
        answered = [row for row in rows if row["error"] is None]
        grounded = sum(row["grounded"] for row in answered)
        cited = sum(bool(row["cited"]) for row in answered)
        print(f"Grounded answers: {grounded}/{len(answered)}")
        print(f"Citations matching the expected page: {cited}/{len(answered)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
