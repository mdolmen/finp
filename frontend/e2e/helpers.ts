/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// Read once at startup using cwd (always the frontend/ directory when running pnpm e2e).
const MOCK_CONTENT = fs.readFileSync(path.resolve("e2e/mock.js"), "utf-8");

export type MockAccount = {
  id: number;
  name: string;
  csv_mapping: unknown;
  created_at: string;
  last_import_at: string | null;
  initial_balance_cents: number;
  initial_balance_date: string | null;
  current_balance_cents: number;
  tink_account_id: null;
  tink_last_sync_at: null;
};

export type MockCategory = {
  id: number;
  name: string;
  is_builtin: boolean;
  display_order: number;
};

export type MockOperation = {
  id: number;
  account_id: number;
  date: string;
  montant_cents: number;
  libelle: string;
  type: string;
  category_id: number | null;
  dedup_hash: string;
  created_at: string;
  recurring: string;
};

export type MockRule = {
  id: number;
  name: string;
  category_id: number;
  priority: number;
  predicate: { kind: string; text?: string; case_sensitive?: boolean };
  enabled: boolean;
  created_at: string;
};

export type MockSeed = {
  nextId?: number;
  accounts?: MockAccount[];
  categories?: MockCategory[];
  operations?: MockOperation[];
  rules?: MockRule[];
};

export function account(id: number, name: string): MockAccount {
  return {
    id,
    name,
    csv_mapping: null,
    created_at: "2025-01-01T00:00:00.000Z",
    last_import_at: null,
    initial_balance_cents: 0,
    initial_balance_date: null,
    current_balance_cents: 0,
    tink_account_id: null,
    tink_last_sync_at: null,
  };
}

export function category(id: number, name: string, display_order = 1): MockCategory {
  return { id, name, is_builtin: false, display_order };
}

export function operation(
  id: number,
  account_id: number,
  date: string,
  montant_cents: number,
  libelle: string,
  category_id: number | null = null,
): MockOperation {
  return {
    id,
    account_id,
    date,
    montant_cents,
    libelle,
    type: category_id === 1 ? "internal" : montant_cents < 0 ? "debit" : "credit",
    category_id,
    dedup_hash: `h${id}`,
    created_at: "2025-01-01T00:00:00.000Z",
    recurring: "none",
  };
}

export const test = base.extend<{ seed: (state: MockSeed) => Promise<void> }>({
  page: async ({ page }, use) => {
    await page.addInitScript(MOCK_CONTENT);
    await use(page);
  },

  seed: async ({ page }, use) => {
    await use(async (state: MockSeed) => {
      await page.addInitScript((s) => {
        // Runs in browser after mock.js has initialised window.__mock
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = (window as any).__mock;
        if (s.nextId !== undefined) m.nextId = s.nextId;
        if (s.accounts) m.accounts = s.accounts;
        if (s.categories) {
          m.categories = [
            { id: 1, name: "Virement interne", is_builtin: true, display_order: 0 },
            ...s.categories,
          ];
        }
        if (s.operations) m.operations = s.operations;
        if (s.rules) m.rules = s.rules;
      }, state);
    });
  },
});

export { expect };
