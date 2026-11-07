# EduAssist — 10-minute demonstration

Everything you need to show the project end to end. Run it once alone before the real thing.

## What is in this folder

| File | What it is for |
|---|---|
| `os-sample.pptx` | Upload as **Slides**. Six slides: kernel, processes, threads and scheduling, virtual memory, deadlock, summary. You can also open it directly to show the source. |
| `course-handout.md` | Upload as **Handout / syllabus**. The app extracts the six course topics from it. |
| `QUESTION-BANK.md` | The exact prompts to type, the answer to expect and the slide each citation should point to. |
| `ONE-PAGER.md` | Printable summary to hand to the professor. |

Do not rename `os-sample.pptx`: the evaluation script in `backend/tests/eval` matches that filename.

## 15 minutes before

1. Start **Docker Desktop** and wait until it says *running*.
2. Check the local model:

   ```
   ollama list
   ```

   `qwen3:8b` must be listed. If it is missing: `ollama pull qwen3:8b` (about 5 GB).
3. Start the stack from the project folder (Git Bash):

   ```
   cd /c/Users/ISHAAN/OneDrive/Desktop/eduassist/eduassist
   ./dev.sh
   ```

   Wait for both URLs: frontend `http://localhost:5173`, backend `http://localhost:8000`.
4. Open `http://localhost:5173`, sign up with a fresh demo account:
   - Name: `Demo Student`
   - Email: `demo.os1@bmu.edu.in`
   - Password: `eduassist-demo` (minimum 8 characters)
5. Settings → **Course settings**: name `Operating Systems`, exam date `2026-11-20`, free hours per day `2` → **Save settings**.
6. Warm the model so the first live answer is fast: Library → upload the deck and wait for **Ready**, then upload the handout and wait for **Ready**, then ask one question in Chat. When it answers, go to Settings → **Delete my data** → **Delete everything**. You now have a clean account with the model loaded.
7. Leave the folder open in File Explorer so you can drag the two files during the demo.

> Upload one file at a time and wait for **Ready** before starting the next. Two background ingestions started at the same moment can collide (one file fails with a "collection already exists" error). If that happens, delete the failed file and upload it again alone.

## Run of show

| Time | Screen | What you do | What you say |
|---|---|---|---|
| 0:00 | Landing | Scroll once | "A student uploads their own course material. Answers cite the page they came from, and practice and planning are generated from the same material." |
| 0:30 | Sign in → Settings | Sign in with the demo account; show the course name, exam date and daily hours | "Everything is scoped to one course: the exam date and the hours available each day drive the planner." |
| 1:15 | Library | Type **Slides** → drag `os-sample.pptx` → wait for **Ready**. Then **Handout / syllabus** + `course-handout.md` → wait for **Ready** | "Ingestion parses each page, splits it into chunks, embeds the chunks locally and stores them. The deck shows its page and chunk counts here." |
| 2:30 | Library → Topics | Point at the six extracted topics | "The handout was also scanned for topics. Topics connect the material to quizzes, mastery and the plan." |
| 3:00 | Chat | Ask the three questions from `QUESTION-BANK.md` (kernel, page fault, Coffman) | "The answer is built only from the five excerpts retrieved for the question; each citation is a real retrieved page, not text the model invented." |
| 4:30 | Chat | Ask the off-topic question | "If the material does not cover it, the system refuses instead of guessing. That is the main defence against hallucination." |
| 5:00 | Chat | Type `Quiz me with 5 medium questions` | "Quiz items are generated from the same excerpts, so they stay on syllabus." |
| 5:45 | Quiz | Answer all questions, deliberately get one wrong, press **Submit answers** | "Four or five questions usually come back, with per-question feedback and a short explanation for each answer." |
| 7:00 | Dashboard | Open **Dashboard** | "Mastery updates after every attempt: 0.6 × the latest score + 0.4 × the previous mastery. Recommendations point at the weakest topics." |
| 8:00 | Planner | Open **Planner** → **Build plan** | "The planner is a constraint solver. It orders topics by prerequisite and mastery and schedules backwards from the exam, so study and revision land in the final week and your two-hour limit is never exceeded." |
| 9:15 | Settings | Point at **Delete my data**, do not confirm | "Uploads, vectors, chats, quizzes, progress and plans are all removable. The model runs locally through Ollama, so no material leaves this machine." |
| 9:40 | Close | Show the evaluation table in `ONE-PAGER.md` | "We evaluated the pipeline on 14 questions written against this exact deck: retrieval hit@5 was 14/14, grounded answers 14/14, and 13 of 14 citations matched the expected page." |

## If something goes wrong

| Symptom | Fix |
|---|---|
| File stuck on **Processing** | Wait 30–60 s and refresh. Check the backend log in `.dev-logs/`. A failed file shows its error in the list. |
| A file fails with "collection already exists" | Two files were ingested at the same moment. Delete the failed file and upload it again alone. |
| Quiz or flashcards mention other topics | Generation draws on all extracted topics, not just the one named in the sentence. That is normal; the header chips list the topics used. |
| "The language model could not answer right now" | Ollama is not reachable: run `ollama list`; start it from the Start menu or `ollama serve`; retry the question. |
| Answer takes 20–40 s | The 8B model is running on the CPU/GPU of this laptop. Say so; it is a feature (no API cost, no data leaves the machine), and the second answer is faster. |
| Quiz generation fails | Retry once with an easier request: `3 easy questions on deadlock`. |
| Port 5173 or 8000 already in use | `./dev.sh stop`, then `./dev.sh`. |
| Registration rejected | Use a real-looking domain such as `bmu.edu.in`; the `.test` TLD is deliberately rejected by the email validator. |
| Planner says the plan is not feasible | Reduce the daily hours or move the exam date in Settings; the notes under the plan explain what did not fit. |

## Questions the professor may ask

| Question | Short answer |
|---|---|
| How do you stop the model from inventing answers? | Answers come only from the top five retrieved excerpts; a similarity threshold refuses questions the material does not cover; citations are taken from the retrieved chunks, not generated. On this deck the model refused every off-topic question in our checks. |
| How was it evaluated? | 14 questions written against this deck. Retrieval hit@5 14/14, MRR 1.00, grounded answers 14/14, 13/14 citations matched the expected page. Run `backend/tests/eval/eval_rag.py` to reproduce. |
| Why run the model locally? | Privacy (material never leaves the laptop), no API cost and offline use. Groq is an optional provider if speed matters more. |
| What is the architecture? | React + TypeScript frontend → FastAPI backend → Postgres for app data and Chroma for vectors. Ingestion parses PDF/PPTX/DOCX/TXT/MD, chunks at about 1,000 characters with 150 overlap, embeds with all-MiniLM-L6-v2. Chat retrieves top-5 and answers with citations; quizzes, flashcards, mastery and the planner reuse the same retrieval. |
| What are the limitations? | One course per account, English only, no OCR (scanned PDFs fail), 25 MB upload cap, an 8B local model needs roughly 8 GB of free RAM, and a citation can occasionally point at a second retrieved source rather than the primary one. |
| What would you do next? | OCR for scanned notes, per-document filtering in chat, spaced-repetition scheduling for flashcards, multi-course support, and a hosted demo using Groq. |
| Who is the team? | BMU CSE · Group 10. |

## Reproduce the evaluation (optional, 3–5 minutes)

With the stack running and the deck uploaded to the demo account:

```
cd backend
./.venv/Scripts/python tests/eval/eval_rag.py --email demo.os1@bmu.edu.in --answers
```

If it stops with `httpx.InvalidURL: Invalid port: ':1]'`, your shell's `NO_PROXY` contains `[::1]` and httpx rejects it. Prefix the command with `NO_PROXY=localhost,127.0.0.1`.

## After the demo

```
./dev.sh stop
```

To wipe the demo account's material: Settings → **Delete my data** → **Delete everything**.
