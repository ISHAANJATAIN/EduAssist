# EduAssist

An intelligent, personalized learning and study assistant for a single college course. It answers
questions only from the material you upload, generates quizzes and flashcards, tracks topic mastery,
and builds a day-by-day study plan around your exam date.

## Features
- Grounded answers — every reply cites document and page, or says the material does not cover it
- Quizzes and flashcards — generated from your own material at easy / medium / hard
- Mastery tracking — topic-wise scores, weak and strong areas, plain-language reasons
- Study planner — a CSP solver fits topics into your free hours with revision slots
- One chat entry point — an intent router sends each request to the right module and asks for a
  missing exam date instead of failing
- Private by default — data stays on this machine, and Settings → Delete my data wipes it
- Public landing page — a product overview at `/`; the signed-in app lives at `/chat`

## Stack
| Layer | Choice |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, PostgreSQL 16 |
| AI | LangChain, Chroma, all-MiniLM-L6-v2, Ollama `qwen3:8b` (local, no cost) |
| Planning | python-constraint |
| Frontend | React 18, TypeScript, Vite, Tailwind, TanStack Query, Zustand, Recharts |
| Deploy | Docker Compose, nginx |

No paid API is required. `LLM_PROVIDER=groq` with a free Groq key is an optional fallback.

## Layout
    backend/   FastAPI app, AI services, tests
    frontend/  React app
    shared/    generated openapi.json
    design/    flows, wireframes, tokens, logo, icons

## Prerequisites
Node.js 20.12+, Python 3.11, Docker Desktop, Ollama.

## Run locally (one command)
From the repo root in Git Bash:
```bash
./dev.sh        # Postgres -> backend -> frontend, with health checks
./dev.sh stop   # stop all three
```
The script waits for Postgres to be healthy and for both servers to answer, then prints the URLs.
If a port is already held by a stale process it stops immediately and asks you to run `./dev.sh stop`.
Logs go to `.dev-logs/` (git-ignored). Ctrl+C stops everything.

## Run locally (manual)
1. `ollama pull qwen3:8b`
2. `cp .env.example .env`, then set a real `JWT_SECRET`
   (`python -c "import secrets; print(secrets.token_urlsafe(48))"`). Never commit `.env`.
3. `docker compose up -d db`
4. `cd backend && python -m venv .venv && source .venv/Scripts/activate && pip install -r requirements.txt`
5. `uvicorn app.main:app --reload --port 8000`
6. `cd frontend && npm install && npm run dev`
7. After API changes: `python backend/scripts/export_openapi.py && cd frontend && npm run gen:types`

Landing: http://localhost:5173 · App: http://localhost:5173/chat · API docs: http://localhost:8000/docs

## Run with Docker
1. `ollama pull qwen3:8b` on the host (Ollama keeps running).
2. `cp .env.example .env`, then set a real `JWT_SECRET`.
3. `docker compose up --build`

Landing: http://localhost:8080 · App: http://localhost:8080/chat · API docs: http://localhost:8000/docs

Compose starts Postgres, the FastAPI backend and an nginx frontend. nginx serves the SPA and proxies
`/api` to the backend. Uploaded files, Chroma vectors and the embedding-model cache live in the
`backend_data` volume; Postgres data lives in `pgdata`. The backend reaches host Ollama through
`host.docker.internal:11434`. Changing the model or the Ollama URL requires only `.env` changes and a
restart.

## Tests
```
cd backend && ./.venv/Scripts/python -m pytest -q     # 116 tests
cd frontend && npm test                               # 28 tests
cd frontend && npm run lint && npm run build
```

## Evaluation
The RAG evaluation uses `os-sample.pptx`, the five-slide Operating Systems deck used throughout the
build. Upload it as `slides` to a dedicated account, then run:

```
cd backend
./.venv/Scripts/python tests/eval/eval_rag.py --email eval@bmu.edu.in --answers
```

Latest run (14 questions, `top_k=5`, local `qwen3:8b`):

| Metric | Result |
|---|---|
| Retrieval hit@5 | 14 / 14 (100%) |
| MRR | 1.00 |
| Grounded answers | 14 / 14 |
| Citations matching the expected page | 13 / 14 |

The deck produces one chunk per slide, so hit@5 returns every slide. MRR and citation accuracy are
the discriminating metrics here; a larger deck gives hit@5 more headroom. Replace
`tests/eval/eval_questions.json` when the group uploads a different course deck.

## Status
Phases 0–8 complete: design, auth and upload, grounded RAG, quizzes and flashcards, mastery and
recommendations, CSP planner, intent router, privacy controls, Docker deployment and evaluation.

## Privacy
Documents, vectors, quizzes, progress, plans and chat stay on this machine (`backend/data` and local
Postgres). By default all generation runs locally through Ollama; enabling the optional Groq provider
sends question text and retrieved excerpts to Groq. Settings → Delete my data removes uploads,
vectors, topics, quizzes and attempts, mastery, plans and chat, and keeps your login and course
settings.
