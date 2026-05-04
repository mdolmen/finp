# Finances Personnelles

Local-first personal finance GUI. No subscription, no cloud. See [NOTES.md](NOTES.md) for product spec.

## Language conventions

- **Code, comments, commits, discussion**: English.
- **UI strings**: French (default and only locale for now).
- Keep these strictly separated — never mix French into identifiers, log messages, or error types.

## Stack

- **Backend**: Python (managed with `uv`), SQLite for storage, Meilisearch for `libellé` search on operations.
- **Frontend**: Tauri shell + Vite + React + TypeScript + Tailwind CSS + shadcn/ui.
- **IPC**: Tauri commands bridge React ↔ Python. Decide per feature whether the Python backend runs as a sidecar process (Tauri sidecar) or via Rust glue calling into Python — pick one and stay consistent.

## Repository layout (target)

```
src-tauri/        Rust shell, Tauri commands, sidecar wiring
backend/          Python package (uv project)
  pyproject.toml
  src/finp/
frontend/         React app (Vite)
  src/
    pages/        Bilan, Operations, Categories, Regles, Comptes
    components/   Reusable UI (shadcn-based)
    lib/          Tauri invoke wrappers, formatters
NOTES.md
CLAUDE.md
```

Treat this as the intended shape; create directories only when the first file in them is needed.

## Python

- **Packaging**: `uv`. Use `uv add <pkg>`, `uv run <cmd>`, `uv sync`. Never edit `uv.lock` by hand. Don't fall back to `pip`/`poetry`.
- **Style**: Google Python Style Guide. Type hints on every public function. Docstrings in Google format (`Args:`, `Returns:`, `Raises:`) — but only when the function's purpose isn't obvious from its name and signature.
- **Lint/format**: `ruff` for both (`uv run ruff check`, `uv run ruff format`). Configure in `pyproject.toml`, not separate files.
- **Layout**: src-layout (`backend/src/finp/...`). Domain modules (`operations`, `categories`, `rules`, `accounts`, `bilan`) separated from infrastructure (`db`, `search`, `events`).
- **Errors**: raise specific exceptions at boundaries; don't swallow. No bare `except`.
- **SQLite**: prefer plain `sqlite3` + small query helpers over a heavy ORM unless the schema grows enough to need one. Migrations live in `backend/src/finp/db/migrations/` as numbered SQL files.

## Frontend

- **TypeScript strict mode**. No `any` without a comment justifying it.
- **shadcn/ui**: copy components into `frontend/src/components/ui/` via the CLI; don't import from a package. Customize freely.
- **Tailwind**: utility-first. Pull repeated combinations into components, not into `@apply`. Use the design tokens (CSS variables from shadcn) — don't hardcode hex colors.
- **State**: local state by default. Reach for a store (Zustand) only when prop-drilling actually hurts. Server state goes through Tauri invoke wrappers in `frontend/src/lib/api/`.
- **Forms**: react-hook-form + zod for anything beyond a single input.
- **i18n**: UI text in French. If we ever add a second locale, route everything through a single `t()` helper — until then, plain French strings inline are fine.

### Design quality

The product is a personal tool, but it should feel crafted, not generic. When building UI:

- Distinctive, restrained aesthetic — no default-Bootstrap-looking pages, no emoji decoration.
- Visual cues from NOTES.md must be honored exactly: alternating red shades for stacked expenses, alternating green for revenus, subtle red/green border or shadow to distinguish débit/crédit operation rows, "delicate" separators between Débits/Crédits sections.
- Density matters — finance UIs live or die by how much information fits on one screen without feeling cramped. Prefer compact rows and tight typography over spacious cards.
- Invoke the `frontend-design` skill when designing a new page or non-trivial component; skip it for small tweaks.

## Architecture principles

- **Events as extension seam**: per NOTES.md, define a single in-process event bus in the backend (`operation.updated`, `category.assigned`, `rule.matched`, etc.). All side-effectful integrations (future n8n / "Automatisations") subscribe there. One central place answers "do we trigger anything?". If no subscriber, emitting is free.
- **Rules engine**: small, composable predicates (`libellé contains`, `montant >/</==`). Adding a new predicate type should mean one new class implementing a `Predicate` protocol and one entry in a registry — nothing else.
- **Local-first**: nothing leaves the machine unless the user explicitly connects an external service (Tink, n8n). No telemetry. No "phone home".
- **CSV import and Tink open-banking import** must converge on the same internal `Operation` ingestion path. Don't fork the pipeline per source.

## Coding discipline (Karpathy guidelines)

- Make surgical changes. Don't refactor surrounding code while fixing a bug.
- Don't add abstractions for hypothetical future needs. Three similar things, then maybe abstract.
- Don't add error handling for cases that can't happen. Validate at boundaries (Tauri command inputs, CSV parsing, API responses), trust internal calls.
- State assumptions out loud when they're load-bearing. If a function assumes operations are already deduped, say so once at the top — don't re-assert it everywhere.
- Define what "done" looks like before writing code: which user action produces which observable outcome.
- No comments that restate the code. Comments explain *why*, never *what*.

## Git

- Commit often. Each commit is self-contained: it builds, it makes sense on its own, and it does one thing. A feature spanning backend + frontend can still be one commit if the pieces only make sense together — but unrelated cleanups go in their own commit.
- Commit messages in English.
- **Subject**: single line, imperative mood, no trailing period. Keep it tight.
- **Body** (only when needed): blank line after subject, then a short paragraph explaining the *why*. If there are multiple distinct points, use one bullet (`- `) per point instead of prose.
- No `Co-Authored-By` trailers unless explicitly requested.

## Development commands

(Fill in as the project takes shape — placeholders to keep consistent across future sessions.)

```bash
# Backend
uv sync                          # install deps
uv run ruff check && uv run ruff format --check
uv run pytest                    # tests (when they exist)

# Frontend
cd frontend && pnpm install
pnpm dev                         # vite dev server
pnpm build

# Tauri (full app)
pnpm tauri dev
pnpm tauri build
```

## Out of scope (for now)

- Multi-user / sync / cloud backup.
- Mobile.
- The "Automatisations" page in the sidebar — build the event bus, but don't build the page yet.
