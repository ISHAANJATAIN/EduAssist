# EduAssist — Information Architecture

## Route map
| Route | Page component | Access | Purpose |
|---|---|---|---|
| `/login` | LoginPage | public | Sign in |
| `/register` | RegisterPage | public | Create account |
| `/` | ChatPage | private | Home. Single entry point: Q&A, quiz, progress, plan via chat |
| `/library` | LibraryPage | private | Upload material, manage documents and topics |
| `/dashboard` | DashboardPage | private | Mastery, weak/strong topics, recommendations |
| `/planner` | PlannerPage | private | Build and view the study plan |
| `/settings` | SettingsPage | private | Course settings, privacy notice, delete my data |
| `*` | redirect to `/` | — | Unknown path |

Private routes are wrapped in `ProtectedRoute` and render inside `AppShell`.

## Navigation
Sidebar (desktop, 240 px) / top bar + drawer (below 768 px):
1. Chat (`/`)
2. Library (`/library`)
3. Dashboard (`/dashboard`)
4. Planner (`/planner`)
5. Settings (`/settings`)

Footer: user name, Log out.

## Content hierarchy per page
- **Chat**: message list → quick-action chips → input.
- **Library**: upload dropzone → document list → topic editor.
- **Dashboard**: summary tiles → mastery chart → topic table → recommendations.
- **Planner**: plan form → plan notes/banner → calendar of day cards.
- **Settings**: course settings → privacy notice → danger zone.

## Reply types (chat) — fixed by the API contract
`answer` · `quiz` · `performance` · `plan` · `clarify`. Each has one card design (see `chat-reply-cards.md`).

## Responsive rules
- ≥ 1024 px: sidebar + content (max 960 px; chat max 760 px).
- 768–1023 px: collapsed icon sidebar.
- < 768 px: top bar with menu drawer; tables become stacked rows; calendar becomes a vertical day list.

## Accessibility baseline
Keyboard reachable controls, visible focus ring (brand-500), contrast ≥ 4.5:1, status never conveyed by colour alone (label + icon), `aria-live="polite"` on the chat list, form errors tied to inputs.
