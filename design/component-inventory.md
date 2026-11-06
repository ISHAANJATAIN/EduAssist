# Component Inventory

Props listed are the contract used by Phase 1+ code. States: **D**efault, **L**oading, **E**mpty, **Er**ror.

## Glass surfaces
All cards, the sidebar, the top bar and chat panels are frosted glass (`glass.*` in `design-tokens.json`) over the fixed `glass.backdrop` gradient. Recipe: `bg-white/62 backdrop-blur-[20px] backdrop-saturate-150 border border-white/90 shadow-glass`. Inner tiles and inputs step up to `bg-white/72`; dialogs and popovers use `bg-white/90` so dense text keeps 4.5:1. Fallback via `@supports not (backdrop-filter: blur(20px))` → `bg-white/94` and no blur. Only two glass layers may stack in one column; a third layer becomes solid.

## ui/
| Component | Props | States |
|---|---|---|
| Button | `variant: primary\|secondary\|danger\|ghost`, `loading?`, `disabled?`, `onClick`, `children` | D, L, disabled |
| Card | `title?`, `children`, `className?` — glass surface by default | D |
| Spinner | `size?: sm\|md` | L |
| EmptyState | `icon`, `title`, `description`, `action?: {label,onClick}` | E |
| ErrorBanner | `error: {detail,code}\|string`, `onRetry?` | Er |
| ConfirmDialog | `open`, `title`, `description?`, `confirmLabel`, `confirmText?` (text the user must type, e.g. `DELETE`), `loading?`, `onConfirm`, `onCancel` | D, L — confirm disabled until `confirmText` matches; focus trapped; Esc cancels |

## layout/
| Component | Props | Notes |
|---|---|---|
| AppShell | — | Sidebar + top bar + `<Outlet/>` |
| Sidebar | — | 5 nav items, user + logout |
| ProtectedRoute | `children` | No token → `/login`; validates via `GET /auth/me` |

## chat/
| Component | Props |
|---|---|
| ChatWindow | `messages`, `pending` |
| MessageInput | `onSend(message, intent?)`, `disabled` — includes chips Quiz me / Flashcards / My progress / Plan my revision |
| MessageRenderer | `message` → switches on `reply.type` |
| UserMessage | `text` |
| AnswerMessage | `reply: AnswerReply` |
| CitationList | `citations` |
| QuizMessage | `quiz` |
| PerformanceMessage | `summary`, `recommendations` |
| PlanMessage | `plan` |
| ClarifyMessage | `text`, `missing`, `onSubmit(values)` |

## quiz/
| Component | Props |
|---|---|
| QuizCard | `quiz`, `onSubmitted?` |
| QuestionItem | `item`, `selected?`, `onSelect(index)` |
| FlashcardDeck | `quiz`, `onSubmitted?` |
| QuizResult | `attempt: AttemptOut`, `quiz` |

## library/
| Component | Props |
|---|---|
| UploadDropzone | `onUpload(file, docType)`, `uploading` — validates ext + 25 MB |
| DocumentList | `documents`, `onDelete(id)` — status badge processing/ready/failed |
| TopicEditor | `topics`, `onCreate`, `onUpdate`, `onDelete`, `onExtract` |

## dashboard/
| Component | Props |
|---|---|
| MasteryChart | `topics: TopicPerformance[]` — bar per topic, colour by status + text label |
| TopicTable | `topics` — name, mastery, attempts, last score, status |
| RecommendationList | `items: RecommendationOut[]` — action + reason |

## planner/
| Component | Props |
|---|---|
| PlanForm | `defaults`, `onSubmit(PlanIn)`, `loading` |
| PlanCalendar | `plan: PlanOut` |
| DayCard | `day: PlanDay` — slots as chips (study = brand, revision = amber) |

## pages/
LoginPage · RegisterPage · ChatPage · LibraryPage · DashboardPage · PlannerPage · SettingsPage (compose the components above; no business logic beyond hooks).
