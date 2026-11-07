# EduAssist

**A study assistant that answers only from the student's own course material.**
BMU CSE · Group 10

## The problem

Students already have the material: lecture slides, handouts, notes. General-purpose chatbots answer from the whole internet, so they sound confident even when they are wrong, and they cannot show which page of which lecture an answer came from. They also know nothing about the exam date or how many hours a student has left.

## What EduAssist does

- **Ingests the real material** — PDF, PPTX, DOCX, TXT or MD, up to 25 MB. Text is extracted per page, chunked, embedded and indexed.
- **Answers with citations** — every answer is built from the five excerpts retrieved for the question and cites the file and page, for example `os-sample.pptx · p.4`.
- **Refuses when the material does not cover it** — a similarity threshold plus a strict prompt, instead of guessing.
- **Turns material into practice** — multiple-choice quizzes and flashcards generated from the same excerpts.
- **Tracks mastery per topic** — updated after each attempt; recommendations target the weakest topics.
- **Plans revision** — a constraint solver fits study and revision slots into the days and hours before the exam, respecting topic prerequisites.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Data | PostgreSQL (app data), Chroma (vectors) |
| AI | Ollama `qwen3:8b` locally; all-MiniLM-L6-v2 embeddings |
| Deployment | Docker Compose, `dev.sh` for one-command local start |

Request path: React → FastAPI → retrieval over Chroma → prompt built only from retrieved excerpts → answer + citations. Quizzes, flashcards, mastery and the planner reuse the same retrieval, so every feature stays tied to the uploaded material.

## Grounding and evaluation

Chunks are about 1,000 characters with 150-character overlap. Chat retrieves the top 5 chunks and refuses when the best similarity score is below 0.30. Citations are produced from the retrieved chunks, not written by the model.

Evaluation on 14 questions written against the five-slide Operating Systems deck (`backend/tests/eval`), local `qwen3:8b`, `top_k=5`:

| Metric | Result |
|---|---|
| Retrieval hit@5 | 14 / 14 (100%) |
| Mean reciprocal rank | 1.00 |
| Grounded answers | 14 / 14 |
| Citations matching the expected page | 13 / 14 |

The evaluation is reproducible with `eval_rag.py`. The frontend test suite (12 files, 32 tests) covers the upload, chat rendering, quiz and planner UI; the backend suite covers ingestion, retrieval, quiz scoring, mastery, the planner, privacy deletion and API contracts.

## Privacy

Documents, vectors, quizzes, progress, plans and chat stay on the machine: local Postgres, a local vector store and a local model. No paid API key is required. Settings → **Delete my data** removes uploads, vectors, topics, quizzes, attempts, mastery, plans and chat, and keeps the login.

## Known limitations

- One course per account; English material only.
- No OCR: scanned PDFs and photos of notes are not supported.
- The 8B local model needs roughly 8 GB of free RAM and answers in a few seconds on a laptop.
- A citation can occasionally point at a second retrieved source instead of the primary slide.
- Quizzes and flashcards draw on all extracted topics; per-topic selection is not exposed in the chat UI.
- No real-time collaboration, mobile app or hosted multi-user deployment.

## Demonstration

The `demo/` folder contains a six-slide Operating Systems deck, a matching course handout, a 10-minute run of show with exact prompts, and this evaluation summary. Setup: Docker Desktop, Ollama with `qwen3:8b`, then `./dev.sh`.
