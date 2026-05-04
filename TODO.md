# TODO — Finances Personnelles

Build order is roughly top-to-bottom. Each milestone should leave the app in a runnable, demoable state. See [NOTES.md](NOTES.md) for product spec and [CLAUDE.md](CLAUDE.md) for conventions.

---

## M0 — Scaffolding

- [x] Initialize git repo, add `.gitignore` (Python, Node, Tauri, SQLite, OS).
- [x] Create `backend/` Python project with `uv init`, src-layout, package name `finp`.
    - [x] Configure `ruff` (lint + format) in `pyproject.toml`.
    - [x] Add `pytest` + a smoke test.
- [x] Create `frontend/` Vite + React + TypeScript project with `pnpm`.
    - [x] Install Tailwind, configure with shadcn design tokens.
    - [x] `pnpm dlx shadcn@latest init` and add: `button`, `input`, `select`, `checkbox`, `dialog`, `dropdown-menu`, `separator`, `tooltip`.
    - [x] Strict TS config.
- [x] Bootstrap Tauri (`pnpm tauri init`) wrapping the Vite app.
- [x] Decide & implement Python ↔ Tauri bridge: **Tauri sidecar** binary (Python packaged with `pyinstaller` or `uv tool`) exposing a small JSON-RPC over stdin/stdout, invoked via Tauri commands. Document the choice in CLAUDE.md.
- [x] Verify end-to-end: `pnpm tauri dev` opens a window that calls one Python function and renders the result.

## M1 — Storage & domain core (backend, headless)

- [ ] SQLite connection layer: open DB at OS-appropriate user data dir, WAL mode, foreign keys on.
- [ ] Migration runner (numbered `.sql` files in `finp/db/migrations/`).
- [ ] Schema v1:
    - `accounts(id, name, csv_mapping_json, created_at)`
    - `categories(id, name UNIQUE, is_builtin, display_order)` — seed `Virement interne` with `is_builtin=1`.
    - `operations(id, account_id, date, montant_cents INTEGER, libelle, type CHECK in ('debit','credit','internal'), category_id NULL, dedup_hash UNIQUE, created_at)`
    - `rules(id, name, category_id, priority INTEGER, predicate_json, enabled, created_at)`
    - FTS5 virtual table `operations_fts(libelle, content='operations', content_rowid='id')` + triggers.
- [ ] Domain modules (pure Python, no Tauri):
    - `finp.accounts` — CRUD.
    - `finp.categories` — CRUD, prevent delete/rename of built-in, prevent delete if referenced (require reassign).
    - `finp.operations` — insert with dedup, list with filters (date range, accounts, categories, types, "sans catégorie"), search (FTS5).
    - `finp.rules` — CRUD + reorder (priority).
- [ ] Predicate registry: `Predicate` protocol with `matches(op) -> bool`. Implement `LibelleContains` and `MontantCompare` (>, <, ==). Serialize/deserialize via `predicate_json` with a `kind` discriminator.
- [ ] Rules engine: `apply_rules(op)` walks rules in priority order, first match wins, never overwrites an existing category. `apply_rules_bulk()` over uncategorized ops.
- [ ] Type derivation: on insert, set `type='debit'` if `montant<0` else `'credit'`. Flip to `'internal'` (and back) when the assigned category is/isn't `Virement interne`.
- [ ] Event bus: in-process pub/sub (`finp.events`). Define events: `operation.created`, `operation.updated`, `operation.category_assigned`, `rule.matched`. No external subscribers yet — bus exists with no-op default.
- [ ] Unit tests for: dedup, type derivation, rule first-match-wins, "no overwrite" guarantee, internal-flip via Virement interne.

## M2 — IPC layer

- [ ] Define a typed command surface (one Python function per Tauri command). Group: `accounts`, `categories`, `operations`, `rules`, `import`.
- [ ] Schema validation at the boundary with `pydantic`.
- [ ] Generate or hand-write matching TypeScript types in `frontend/src/lib/api/types.ts`.
- [ ] Thin `invoke()` wrappers in `frontend/src/lib/api/*.ts` returning typed promises.
- [ ] Error contract: backend errors → structured `{code, message}` → toast on the frontend.

## M3 — Frontend shell

- [ ] App layout: collapsible left sidebar with hamburger toggle, content area.
- [ ] Routing (React Router): `/bilan`, `/operations`, `/categories`, `/regles`, `/comptes`. Default route `/bilan`.
- [ ] Sidebar items + visual separator between (`Bilan`, `Opérations`) and (`Catégories`, `Règles`, `Comptes`).
- [ ] Theme tokens: red/green/blue accent variables for op types; two shades each of red/green for stacking.
- [ ] French copy file `frontend/src/i18n/fr.ts` (single export, plain object) — every UI string goes through it from day one.

## M4 — Page "Comptes" + CSV import

(Comptes first: nothing else is testable without operations.)

- [ ] List accounts with: name, [Connecter] (disabled, "bientôt"), [Importer], [Supprimer].
- [ ] "Add account" modal: name only.
- [ ] Import flow:
    - [ ] File picker → parse first CSV rows → mapping UI (pick which column = date, montant, libellé; date format).
    - [ ] On confirm, save mapping on the account and ingest. Show count: imported / skipped (dedup) / failed.
    - [ ] Re-import uses saved mapping without prompting.
- [ ] Edit mapping action (per account).
- [ ] After ingest: emit `operation.created` events; trigger rules engine on new ops.

## M5 — Page "Catégories"

- [ ] Flat alphabetical list.
- [ ] [Ajouter] button top-right → modal (name only).
- [ ] Inline rename, delete (with confirm + reassign-or-block when referenced).
- [ ] Built-in `Virement interne` is shown but not editable / deletable.

## M6 — Page "Opérations"

- [ ] Search bar (debounced 200ms) → FTS5 query.
- [ ] Filter row: `[Tout sélectionner]` `[Sans catégorie]` `[Débits ✓]` `[Crédits ✓]` `[Internal]` (default: débits + crédits checked).
- [ ] List rows: date | montant (right-aligned, signed, EUR) | libellé | category select.
    - [ ] Subtle border or shadow per type (red / green / blue).
    - [ ] Per-row checkbox for bulk select.
- [ ] Bulk actions bar appears when rows selected: "Assigner catégorie", "Effacer catégorie".
- [ ] Category assignment uses a single flat select listing all categories (alphabetical).
- [ ] Pagination or virtualized list — pick virtualization (`@tanstack/react-virtual`) since exports can be large.
- [ ] [Appliquer les règles] button (runs `apply_rules_bulk` on uncategorized).

## M7 — Page "Règles"

- [ ] Grouped by target category (alphabetical), within group ordered by priority.
- [ ] Drag-to-reorder within a category (persists `priority`).
- [ ] [Ajouter une règle] modal: target category, predicate builder (kind: libellé contains | montant compare; with operator + value), enabled toggle.
- [ ] Edit / delete per rule.
- [ ] [Appliquer maintenant] button (re-runs against currently uncategorized ops).

## M8 — Page "Bilan"

- [ ] Filter bar (horizontal, multi-select): `Débits` (categories used by debit ops only), `Crédits` (categories used by credit ops only), `Comptes`. Use shadcn Combobox-style multi-selects.
- [ ] Aggregation query: by month × category × type, over the rolling 12 plain months ending at the current month, EUR sums in cents.
- [ ] Chart: grouped bar with two bars per month (expenses left, revenus right), stacked by category.
    - [ ] Pick a chart lib — start with `recharts`; fall back to a small custom SVG if styling fights us.
    - [ ] Alternating two shades of red (expenses) / green (revenus).
    - [ ] Tooltip: category name + amount on segment hover.
- [ ] Internal operations excluded.

## M9 — Polish pass

- [ ] First-run experience: empty DB → friendly "Créez un compte pour commencer" on Bilan/Opérations.
- [ ] Keyboard shortcuts: `⌘K` focus search on Opérations; `Esc` closes modals.
- [ ] Number/date formatting via `Intl` (fr-FR locale).
- [ ] Error boundary at app root.
- [ ] App icon, window title.

## M10 — Packaging

- [ ] `pnpm tauri build` produces a signed `.dmg` (and at least one Linux target).
- [ ] CI workflow (lint + tests) — GitHub Actions or local `make` script.
- [ ] README for end users (FR), distinct from CLAUDE.md.

---

## Later (planned, not v1)

### Tink open-banking integration

- [ ] Per-account Tink connection: OAuth flow, token storage in OS keychain (Tauri secure storage).
- [ ] [Connecter] button on Comptes activates.
- [ ] Sync flow that pulls new operations through the same ingestion path as CSV (shared dedup).
- [ ] Settings for sandbox vs production credentials.

### Page "Automatisations" (n8n)

- [ ] Surface the existing event bus over an outbound HTTP webhook adapter, configured per event type.
- [ ] UI to list configured workflows, last-trigger status.
- [ ] Add a sidebar entry once functional.

### Misc later

- [ ] Multi-currency (would require a currency column on accounts/operations and an FX rate table).
- [ ] Export (CSV/JSON) of operations.
- [ ] Backup / restore of the SQLite file from the gear menu.
- [ ] Budget targets per category.
