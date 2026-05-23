# Finp — Personal Finances

A local-first personal finance app. No subscription, no cloud, no telemetry.

## Requirements

- macOS 12 or later
- No internet connection required

## Installation

1. Download the `.dmg` from the releases page.
2. Open the `.dmg` and drag **Finp** into your Applications folder.
3. On first launch, **right-click → Open** (macOS blocks unsigned apps by default).

## Getting started

1. Open **Comptes** (Accounts) and create a bank account.
2. Import a CSV statement with the **Importer** button.
3. Assign categories to operations from the **Opérations** page.
4. Set up auto-categorisation in **Règles** (Rules).
5. Wire up outbound webhooks in **Automatisations** to notify external systems.
6. Check the **Bilan** (Overview) to visualise monthly expenses and income.

## Features

- CSV import with column auto-detection and per-account mapping memory.
- Manual or rule-based categorisation.
- **Rules** — match operations by label substring or amount comparison, and auto-assign a target category. Rules run on import and can be re-applied on demand.
- **Automations** — bridge the internal event bus to outbound HTTP webhooks (e.g. n8n). Every match is **human-validated**: nothing leaves your machine without an explicit click. The Historique tab records the HTTP response code and a short body excerpt for each delivery so failures stay diagnosable.
- Monthly overview with a stacked bar chart per category, expenses on one side, income on the other.
- Projection of planned operations onto the chart.
- Current balance per account (initial balance + every operation).
- Full-text search on labels (SQLite FTS5).
- Nothing leaves your machine.

## Data

All data lives in a single SQLite file inside the application's data directory:

```
~/Library/Application Support/io.github.mathieudolmen.finp/finp.db
```

To back up your data, copy this file.

## Bank synchronisation

Direct bank-sync integrations (Tink, then GoCardless Bank Account Data) were both prototyped and **parked**: their developer onboarding paths assume a company providing financial services to its own users, not an individual accessing their own accounts. The backend code is preserved but the UI entry points are disabled.

CSV import is the supported ingestion path. Every French bank lets you export transaction history as CSV from its online portal.

## Development

See [CLAUDE.md](CLAUDE.md) for code conventions, the tech stack, and dev commands. The product spec lives in [NOTES.md](NOTES.md).
