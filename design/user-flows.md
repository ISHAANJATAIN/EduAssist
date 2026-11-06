# EduAssist — User Flows

Single user type: a student studying one course. One chat-style home page; four supporting pages.

## F1. Onboarding
1. Open app → `/login`.
2. New user → `/register` (name, email, password ≥ 8) → `POST /auth/register` returns `TokenOut` → session stored (auto-login) → `/` (chat, empty state).
3. Empty state shows 3 steps: **Upload material → Ask questions → Practise**. CTA "Upload material" → `/library`.
4. Optional: `/settings` → set course name, exam date, free hours per day.

## F2. Upload material and build topics
1. `/library` → drag/drop or choose file; pick type (lecture, slides, notes, textbook, handout).
2. Client validates extension (.pdf .pptx .docx .txt .md) and size ≤ 25 MB. Invalid → inline error, nothing sent.
3. Upload → row appears with status **processing** (list polls every 2 s).
4. Status → **ready** (or **failed** with reason + retry by re-upload).
5. If type = handout → topics are auto-extracted; Topic Editor shows them. Student may rename, add, delete, set prerequisites.

## F3. Ask a question (RAG)
1. `/` → type question → send.
2. Typing indicator → **Answer card** with citations (file, page).
3. If the material does not cover it → Answer card in "not covered" state, no citations.
4. Click a citation chip → tooltip with the source snippet.

## F4. Quiz or flashcards
1. Chip "Quiz me" / "Flashcards" or typing "quiz me on <topic>, hard".
2. Missing detail (e.g., no material) → **Clarify card**.
3. **Quiz card** appears in chat. Student answers all questions → Submit.
4. **Result view**: score, per-question correct/incorrect with explanation, mastery change per topic, recommendations.
5. Flashcards: flip → "Known" / "Not known" per card → Finish → same result view.

## F5. Progress and recommendations
1. Chip "My progress" or sidebar → `/dashboard`.
2. Mastery bar chart + topic table (status: untested / weak / developing / strong) + recommendation list, each with a plain-language reason.
3. Chat variant returns a compact **Performance card** with link to `/dashboard`.

## F6. Study plan
1. Chip "Plan my revision" or `/planner`.
2. Form: exam date, free hours/day, optional per-day overrides (defaults come from course settings).
3. Submit → day-by-day calendar of study and revision slots.
4. If infeasible → banner explaining what was relaxed.
5. Chat variant returns a compact **Plan card** with link to `/planner`.

## F7. Delete my data
`/settings` → "Delete my data" → confirm dialog (type DELETE) → all documents, vectors, topics, quizzes, progress, plans, chat removed → return to empty chat. Login kept.

## F8. Session expiry
Any 401 → clear session → `/login` with notice "Session expired".

## Global states every screen handles
Loading (spinner/skeleton) · Empty (EmptyState + CTA) · Error (ErrorBanner with message from API `detail`) · Offline/LLM unavailable (503 → "The assistant is unavailable, try again").
