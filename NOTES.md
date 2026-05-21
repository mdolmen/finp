# Finances Personnelles

## Idea

A GUI tool to manage personal finance. Local first. No subscription. No online platform to trust.

Discussions and code in english. UI in french by default.

## Stack

- Backend: python.
- Storage: sqlite. Search via SQLite FTS5 (libellé full-text index).
- Frontend: tauri + vite + react + tailwaindcss + shadcn.

## Data model & decisions

- **Operation types** (enum, English in code): `debit`, `credit`, `internal`.
    - `debit` / `credit` derived from the sign of `montant` (− = debit, + = credit).
    - `internal` is set when the operation is classified under the built-in category **"Virement interne"** (transfers between own accounts). Internal operations are excluded from Bilan totals. Rendered in **blue** in the UI.
- **Categories**: a single flat list, user-defined. No sub-categories. Categories are not typed — any category can be applied to any operation. The op type comes from the operation, not the category. The only built-in category is **"Virement interne"** (assigning it flips the operation to type `internal`).
- **Filter select lists** only show categories that actually have at least one matching operation in the relevant scope (e.g. the "Crédits" filter on Bilan lists only categories used by at least one credit operation).
- **"Sans catégorie"** = an operation with no category yet (not a category itself).
- **Currency**: EUR only. (A gear icon top-right can host future global settings — not needed now.)
- **Search**: SQLite FTS5 on `libellé`, responsive (debounced).
- **Bilan window**: rolling 12 plain months ending at the current month (based on today).

### CSV import

- User-defined **column mapping per account** (which CSV column is date, montant, libellé). Mapping is saved on the account so re-imports don't reconfigure.
- Deduplication: hash `(date, montant, libellé, account_id)` → reject duplicates silently on re-import.

### Rules

- Run automatically **on import** over newly inserted operations.
- Also runnable **on-demand** ("Apply rules now" button) on operations currently without a category.
- **Never overwrite** an operation that already has a category (manual or rule-assigned). Manual classification wins.
- **Conflict resolution**: first match wins, by the rule's display order in the Règles page (drag to reorder).

## Features

Sidebar on the left. Hamburger logo to show/hide the sidebar.

In the sidabar:
- "Bilan"
- "Opérations"
- separator
- "Catégories"
- "Règles"
- "Comptes"

#### Page "Bilan"

- A filter bar.
    - Multiple select field "Débits", "Crédits", "Comptes". Aligned horizontally.
    - Each select field mentionned above allow for multiple choices.
    - "Comptes": filled with configured accounts.
    - "Débits": filled with expense categories.
    - "Crédits": filled with revenu categories.
- A stacked-bar histogram.
    - Two columns (grouped). Monthly aggregation.
    - Left column represents expenses. Every selected expenses stacked. Two shades of red alternated.
    - Right column represents revenus. Every selected revenu sources stacked.
    Two shades of green alternated.
    - Sliding window on 12 months.
    - When hovering the mouse on a bar, appears a tooltip with the name of the category and the amount.

#### Pages "Opérations"

In order of alignment.

1. A text input bar to research an operation based on the "libelle". Ideally with responsive search (results change dynamically as we type).
2. A filter bar with checkboxes: "Tout sélectionner", aligned to the left. Checkbox on the left of each operation to select it too. "Sans catégorie", "Débits", "Crédits". "Crédits" and "Débits" checked by default.
3. The list of operations. Each item contains: "Date", "Montant", "Libellé". And to the right a select list to assign a category (single flat list of all categories).

A visual clue to identify the operation type: a very slight border color or shadow — green for `credit`, red for `debit`, blue for `internal`.

#### Page "Règles"

The list of rules. Can add a rule to automatically classify operations. Very simple logic. Code architecture should make it easy to add classification logics.

At first very simple, "libellé" contains or "montant" >,<,==. An option to set the operation as recurrent.

Rules are listed grouped by their target category, categories ordered alphabetically. Within a category, rules are ordered by priority (drag to reorder) — first match wins.

#### Page "Catégories"

Allows to define categories. Single flat list, alphabetical.

A single button on top right to add a category. Modal opens with very few options (just the name). Categories are not typed.

The built-in **"Virement interne"** category is created on first launch, cannot be deleted or renamed (its assignment is what marks an operation as `internal`).

#### Page "Comptes"

Import operations from CSV. Associate the import to an account.

Connection to the bank with the Tink open banking API. Connection for a given acccount.

The UI is minimalist:
- The list of account.
- A button per account to connect to the bank if not already established.
- A button to import.
- Aligned horizontally: the account, connect button, import button
- A button to add an account. It opens up a modal.

#### Page "Automatisations"

Bridges the in-process event bus to outbound HTTP webhooks (n8n primary target, but the URL is free-form). Every dispatch is **human-validated**: a match is queued as a pending row and the POST only fires when the user clicks the green ✓. Refused entries are kept in history; no event leaves the machine without an explicit click.

The page is split into three collapsible sections:
1. **À valider** — pending rows, each with a red ✕ / green ✓ split pill plus a Détails button that shows the JSON payload that would be sent.
2. **Règles d'automatisation** — the configured automations (event type + predicate + callback URL + enabled flag).
3. **Historique** — the last 20 resolved rows (sent / failed / refused), filterable. Failed rows have a Retry button that re-fires the same webhook.

V1 only matches events that carry an operation: `operation.created`, `operation.updated`, `operation.category_assigned`, `rule.matched`. The predicate vocabulary is shared with the Règles page (`libellé contient`, `montant >|<|=`).

**Webhook payload contract** — what `automations.pending.confirm` POSTs to the callback URL:

```json
{
  "automation": { "id": 7, "name": "Notify Slack on large purchases" },
  "event": {
    "type": "operation.created",
    "payload": { "id": 1234, "account_id": 1 }
  },
  "pending_id": 42,
  "confirmed_at": null
}
```

The `event.payload` is the exact dict published on the in-process bus, unmodified. Receivers should treat `pending_id` as the idempotency key.

#### Page "Previsions"

Progam a planned expense.

Anticipated expenses should be visible in the "Bilan" histogram, visually different: dash borders, transparent colors.

Are considered anticipated expenses: these programmed ones + the reccurent operations.