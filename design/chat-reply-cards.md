# Chat Reply Cards — Visual Spec

One card per `reply.type` returned by `POST /chat`. All sit in the assistant bubble (left, neutral-50 background, radius-lg, max width 760 px). User bubbles are right-aligned, brand-600 background, white text.

## 1. answer — `{type:"answer", text, grounded, citations[]}`
- Body: paragraph text (`text`).
- Footer: "Sources" label + citation chips `filename · p.N` (neutral-100 background, neutral-700 text, radius-full). Hover/focus shows snippet tooltip.
- `grounded=false`: info-banner (infoBg, infoText) at top: "This isn't covered in your uploaded material." No chips.

## 2. quiz — `{type:"quiz", quiz}`
- Header: "Quiz · Medium · 5 questions" (or "Flashcards · 5 cards") + topic tags.
- Quiz: one question at a time, 4 radio options, progress "2 / 5", Back/Next, Submit on last question (disabled until all answered).
- Flashcards: card flips on click/Space; below it "Not known" / "Known".
- After submit: Result view replaces the body (score ring, per-question list with ✓/✗ + explanation, mastery changes "Topic: 35 → 52", recommendation list).

## 3. performance — `{type:"performance", summary, recommendations[]}`
- Weak topics (dangerText label + icon) and strong topics (successText label + icon) as two short lists (max 3 each).
- Up to 3 recommendations, each with its reason.
- Link button "Open dashboard".

## 4. plan — `{type:"plan", plan}`
- Header: "Study plan · exam in N days", feasibility badge (OK / Adjusted).
- Preview: next 3 days as mini rows (date, slots as chips, total minutes).
- Link button "Open planner".

## 5. clarify — `{type:"clarify", text, missing[]}`
- Question text + warning-tinted card (warningBg, warningText).
- Inline mini-form, one control per supported `missing` key:

| Key | Control |
|---|---|
| `exam_date` | Date picker (today or later) |
| `free_hours_per_day` | Number input, 0.5–16, step 0.5 |
| `difficulty` | Segmented control: easy / medium / hard |
| `topic` | Select from the course's topics |

- Unknown keys render as text only (no control).
- Submitting re-sends the original request with the extra details.

## Shared states
- Pending: three-dot typing indicator in assistant bubble.
- Error: ErrorBanner inside bubble with "Retry".
