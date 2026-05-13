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

- [x] SQLite connection layer: open DB at OS-appropriate user data dir, WAL mode, foreign keys on.
- [x] Migration runner (numbered `.sql` files in `finp/db/migrations/`).
- [x] Schema v1:
    - `accounts(id, name, csv_mapping_json, created_at)`
    - `categories(id, name UNIQUE, is_builtin, display_order)` — seed `Virement interne` with `is_builtin=1`.
    - `operations(id, account_id, date, montant_cents INTEGER, libelle, type CHECK in ('debit','credit','internal'), category_id NULL, dedup_hash UNIQUE, created_at)`
    - `rules(id, name, category_id, priority INTEGER, predicate_json, enabled, created_at)`
    - FTS5 virtual table `operations_fts(libelle, content='operations', content_rowid='id')` + triggers.
- [x] Domain modules (pure Python, no Tauri):
    - `finp.accounts` — CRUD.
    - `finp.categories` — CRUD, prevent delete/rename of built-in, prevent delete if referenced (require reassign).
    - `finp.operations` — insert with dedup, list with filters (date range, accounts, categories, types, "sans catégorie"), search (FTS5).
    - `finp.rules` — CRUD + reorder (priority).
- [x] Predicate registry: `Predicate` protocol with `matches(op) -> bool`. Implement `LibelleContains` and `MontantCompare` (>, <, ==). Serialize/deserialize via `predicate_json` with a `kind` discriminator.
- [x] Rules engine: `apply_rules(op)` walks rules in priority order, first match wins, never overwrites an existing category. `apply_rules_bulk()` over uncategorized ops.
- [x] Type derivation: on insert, set `type='debit'` if `montant<0` else `'credit'`. Flip to `'internal'` (and back) when the assigned category is/isn't `Virement interne`.
- [x] Event bus: in-process pub/sub (`finp.events`). Define events: `operation.created`, `operation.updated`, `operation.category_assigned`, `rule.matched`. No external subscribers yet — bus exists with no-op default.
- [x] Unit tests for: dedup, type derivation, rule first-match-wins, "no overwrite" guarantee, internal-flip via Virement interne.

## M2 — IPC layer

- [x] Define a typed command surface (one Python function per Tauri command). Group: `accounts`, `categories`, `operations`, `rules`, `import`.
- [x] Schema validation at the boundary with `pydantic`.
- [x] Generate or hand-write matching TypeScript types in `frontend/src/lib/api/types.ts`.
- [x] Thin `invoke()` wrappers in `frontend/src/lib/api/*.ts` returning typed promises.
- [x] Error contract: backend errors → structured `{code, message}` → toast on the frontend.

## M3 — Frontend shell

- [x] App layout: collapsible left sidebar with hamburger toggle, content area.
- [x] Routing (React Router): `/bilan`, `/operations`, `/categories`, `/regles`, `/comptes`. Default route `/bilan`.
- [x] Sidebar items + visual separator between (`Bilan`, `Opérations`) and (`Catégories`, `Règles`, `Comptes`).
- [x] Theme tokens: red/green/blue accent variables for op types; two shades each of red/green for stacking.
- [x] French copy file `frontend/src/i18n/fr.ts` (single export, plain object) — every UI string goes through it from day one.

## M4 — Page "Comptes" + CSV import

(Comptes first: nothing else is testable without operations.)

- [x] List accounts with: name, [Connecter] (disabled, "bientôt"), [Importer], [Supprimer].
- [x] "Add account" modal: name only.
- [x] Import flow:
    - [x] File picker → parse first CSV rows → mapping UI (pick which column = date, montant, libellé; date format).
    - [x] On confirm, save mapping on the account and ingest. Show count: imported / skipped (dedup) / failed.
    - [ ] Re-import uses saved mapping without prompting (currently shown pre-filled).
- [ ] Edit mapping action (per account).
- [x] After ingest: emit `operation.created` events; trigger rules engine on new ops.

## M5 — Page "Catégories"

- [x] Flat alphabetical list.
- [x] [Ajouter] button top-right → modal (name only).
- [x] Inline rename, delete (with confirm + reassign-or-block when referenced).
- [x] Built-in `Virement interne` is shown but not editable / deletable.

## M6 — Page "Opérations"

- [x] Search bar (debounced 200ms) → FTS5 query.
- [x] Filter row: `[Tout sélectionner]` `[Sans catégorie]` `[Débits ✓]` `[Crédits ✓]` `[Internal]` (default: débits + crédits checked).
- [x] List rows: date | montant (right-aligned, signed, EUR) | libellé | category select.
    - [x] Subtle border or shadow per type (red / green / blue).
    - [x] Per-row checkbox for bulk select.
- [x] Bulk actions bar appears when rows selected: "Assigner catégorie", "Effacer catégorie".
- [x] Category assignment uses a single flat select listing all categories (alphabetical).
- [x] Pagination or virtualized list — pick virtualization (`@tanstack/react-virtual`) since exports can be large.
- [x] [Appliquer les règles] button (runs `apply_rules_bulk` on uncategorized).
- [x] "Montant" filter beside the search bar (greater, lesser, equal)

## M7 — Page "Règles"

- [x] Grouped by target category (alphabetical), within group ordered by priority.
- [x] Drag-to-reorder within a category (persists `priority`).
- [x] [Ajouter une règle] modal: target category, predicate builder (kind: libellé contains | montant compare; with operator + value), enabled toggle.
- [x] Edit / delete per rule.
- [x] [Appliquer maintenant] button (re-runs against currently uncategorized ops).

## M8 — Page "Bilan"

- [x] Filter bar (horizontal, multi-select): `Débits` (categories used by debit ops only), `Crédits` (categories used by credit ops only), `Comptes`. Use shadcn Combobox-style multi-selects.
- [x] Aggregation query: by month × category × type, over the rolling 12 plain months ending at the current month, EUR sums in cents.
- [x] Chart: grouped bar with two bars per month (expenses left, revenus right), stacked by category.
    - [x] Pick a chart lib — start with `recharts`; fall back to a small custom SVG if styling fights us.
    - [x] Alternating two shades of red (expenses) / green (revenus).
    - [x] Tooltip: category name + amount on segment hover.
- [x] Internal operations excluded.
- [x] Remove space between expense and revenu bars.
- [x] Revenus to the left and Expenses to the right
- [x] Shades of a color, the darker the more important the montant is
    - Revenu: as many shades of green as categories, the darker (greater abs(montant)) at the bottom
    - Expense: as many shades of red as categories, the darker (greater abs(montant)) at the bottom
- [x] The tooltip on hover shows is on a single bar, not on a tuple, the style of the hover bar changes with a visual cue indicating the focus.
- [x] The tooltp content shows categories in ascending order of montant.
- [x] Diff of a tuple of stacked bar at the bottom it (green font color if positive, red otherwise)
- [x] The y-scale of the histogram does not change when changing the filters
- [x] All boxes ticked by default in the filter
- [x] Two-columns layout below the histogram
    - [x] Column 1 - KPIs: Solde, Revenus/Dépenses mensuel attendu, Total crédits/débits. Aligned vertically.
    - [x] Column 2 - Opérations prévues: A list of planned operations (date, montant, libellé). This category is added to the histogram, the corresponding bloc borders are dashed. An "Ajouter" button to open a modal to add such an operation.

## M9 — Polish pass

- [x] First-run experience: empty DB → friendly "Créez un compte pour commencer" on Bilan/Opérations.
- [x] Keyboard shortcuts: `⌘F` focus search on Opérations; `Esc` closes modals.
- [x] Number/date formatting via `Intl` (fr-FR locale).
- [x] Error boundary at app root.
- [x] Add english language
- [x] App icon, window title.

## M10 — Packaging

- [x] CI workflow (lint + tests) — GitHub Actions or local `make` script.
- [x] README for end users (FR), distinct from CLAUDE.md.

---

## M11 — Tink open-banking integration

### M11.1 — Credentials & schema

- [ ] Migration: `tink_credentials(client_id, client_secret, environment CHECK('sandbox','production'))`; add `tink_account_id TEXT`, `tink_last_sync_at TEXT` to `accounts`; add `tink_tokens(tink_user_id, access_token, refresh_token, expires_at)`.
- [ ] `finp.tink` module: `credentials.py` (read/write), `client.py` (httpx wrapper).
- [ ] IPC commands: `tink.get_credentials`, `tink.save_credentials`.
- [ ] Settings modal on Comptes (gear icon, app-wide): `client_id`, `client_secret`, sandbox/production toggle.

### M11.2 — OAuth flow

- [ ] Tauri: `tauri-plugin-shell` to open browser; temporary local HTTP server (random port) to receive the OAuth redirect callback; forward full URL to Python via `tink.handle_oauth_callback(url)`.
- [ ] Backend `finp.tink.auth`: `authorization_url(redirect_uri)` → Tink OAuth URL.
- [ ] Backend `finp.tink.auth`: `exchange_code(code, state, redirect_uri)` → fetch tokens, store in `tink_tokens`.
- [ ] Backend `finp.tink.auth`: `refresh_token_if_needed()` — called transparently before any API request.
- [ ] Frontend: [Connecter] button opens browser → local server catches callback → calls `tink.handle_oauth_callback` → updates connection state per account.

### M11.3 — Account linking

- [ ] Backend `finp.tink.client`: `list_accounts()` using Tink Data API.
- [ ] IPC commands: `tink.list_tink_accounts`, `tink.link_account(finp_account_id, tink_account_id)`.
- [ ] Frontend: post-OAuth link dialog — maps Tink accounts to finp accounts; [Connecter] button disabled until credentials saved, becomes [Lier] after OAuth.

### M11.4 — Sync

- [ ] Backend `finp.tink.sync`: `sync_account(account_id)` — fetch transactions since `tink_last_sync_at` (full history on first sync), normalise to `Operation`, run through existing ingestion path (dedup + rules). Use Tink transaction `id` as `dedup_hash` for Tink-sourced ops.
- [ ] Update `tink_last_sync_at` on success.
- [ ] IPC command: `tink.sync_account(account_id)` → `{imported, skipped, failed}`.
- [ ] Frontend: [Synchroniser] button per connected account, last-sync timestamp, spinner, result toast.

---

## Later (planned, not v1)

### Page "Automatisations" (n8n)

- [ ] Surface the existing event bus over an outbound HTTP webhook adapter, configured per event type.
- [ ] UI to list configured workflows, last-trigger status.
- [ ] Add a sidebar entry once functional.

### Page "Immobilier"

- [ ] List real estate properties with key figures: total cost, loan reimbursment, taxes, rent

### Page "Projets"

- [ ] Define buckets for a project. A project has a name and a description. We can define a goal. Adding money to the bucket removes it to the available "solde".

### Misc later

- [ ] Multi-currency (would require a currency column on accounts/operations and an FX rate table).
- [ ] Export (CSV/JSON) of operations.
- [ ] Backup / restore of the SQLite file from the gear menu.
