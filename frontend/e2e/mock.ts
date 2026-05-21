/**
 * Browser-side stateful RPC mock.
 * Injected via page.addInitScript before every test.
 *
 * Tests control state via:
 *   page.evaluate(() => Object.assign(window.__mock, { ... }))
 *
 * The mock is intentionally minimal: it covers only the methods exercised by
 * the five golden-path tests, forwarding everything else to a console warning.
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__: {
      invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
      transformCallback: () => number;
      unregisterCallback: () => void;
    };
    __mock: MockState;
  }
}

type MockOp = {
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
type MockCat = { id: number; name: string; is_builtin: boolean; display_order: number };
type MockAcc = {
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
type MockRule = {
  id: number;
  name: string;
  category_id: number;
  priority: number;
  predicate: { kind: string; text?: string; case_sensitive?: boolean };
  enabled: boolean;
  created_at: string;
};

type MockAutomation = {
  id: number;
  name: string;
  event_type: string;
  predicate: { kind: string; text?: string; case_sensitive?: boolean; operator?: string; value_cents?: number };
  callback_url: string;
  enabled: boolean;
  created_at: string;
};

type MockPending = {
  id: number;
  automation_id: number;
  automation_name: string;
  callback_url: string;
  event_type: string;
  operation_id: number | null;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed" | "refused";
  error: string | null;
  created_at: string;
  resolved_at: string | null;
};

type MockWebhookCall = { url: string; body: Record<string, unknown> };

type MockState = {
  nextId: number;
  accounts: MockAcc[];
  categories: MockCat[];
  operations: MockOp[];
  rules: MockRule[];
  automations: MockAutomation[];
  pending: MockPending[];
  webhooks: MockWebhookCall[];
};

window.__mock = {
  nextId: 100,
  accounts: [],
  categories: [{ id: 1, name: "Virement interne", is_builtin: true, display_order: 0 }],
  operations: [],
  rules: [],
  automations: [],
  pending: [],
  webhooks: [],
};

function now() {
  return new Date().toISOString();
}
function nextId() {
  return window.__mock.nextId++;
}

function dispatch(method: string, params: Record<string, unknown>): unknown {
  const m = window.__mock;

  switch (method) {
    case "accounts.list":
      return m.accounts;

    case "accounts.create": {
      const acc: MockAcc = {
        id: nextId(),
        name: params.name as string,
        csv_mapping: null,
        created_at: now(),
        last_import_at: null,
        initial_balance_cents: 0,
        initial_balance_date: null,
        current_balance_cents: 0,
        tink_account_id: null,
        tink_last_sync_at: null,
      };
      m.accounts.push(acc);
      return acc;
    }

    case "accounts.set_csv_mapping": {
      const acc = m.accounts.find((a) => a.id === params.account_id);
      if (acc) acc.csv_mapping = params.mapping;
      return acc;
    }

    case "categories.list":
      return m.categories;

    case "categories.create": {
      const cat: MockCat = {
        id: nextId(),
        name: params.name as string,
        is_builtin: false,
        display_order: m.categories.length,
      };
      m.categories.push(cat);
      return cat;
    }

    case "operations.list": {
      const p = params as {
        types?: string[];
        search?: string;
        search_terms?: string[];
        search_combinator?: "AND" | "OR";
        include_no_category?: boolean;
        category_ids?: number[];
        limit?: number;
        offset?: number;
        date_from?: string;
        date_to?: string;
        montant_op?: string;
        montant_value_cents?: number;
        recurring_only?: boolean;
      };
      let ops = [...m.operations];
      if (p.types?.length) ops = ops.filter((o) => p.types!.includes(o.type));
      const terms = p.search_terms ?? (p.search ? [p.search] : null);
      if (terms?.length) {
        const lower = terms.map((t) => t.toLowerCase());
        const combinator = p.search_combinator ?? "OR";
        ops = ops.filter((o) => {
          const lib = o.libelle.toLowerCase();
          return combinator === "AND"
            ? lower.every((q) => lib.includes(q))
            : lower.some((q) => lib.includes(q));
        });
      }
      if (p.include_no_category && !p.category_ids?.length) {
        ops = ops.filter((o) => o.category_id === null);
      } else if (p.category_ids?.length) {
        ops = ops.filter(
          (o) =>
            (p.category_ids!.includes(o.category_id as number)) ||
            (p.include_no_category && o.category_id === null),
        );
      }
      if (p.date_from) ops = ops.filter((o) => o.date >= p.date_from!);
      if (p.date_to) ops = ops.filter((o) => o.date <= p.date_to!);
      ops.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const limit = p.limit ?? 200;
      const offset = p.offset ?? 0;
      return { items: ops.slice(offset, offset + limit), has_more: offset + limit < ops.length };
    }

    case "operations.assign_category": {
      const op = m.operations.find((o) => o.id === params.id);
      if (!op) throw { code: -32000, message: "not found", data: { code: "operation.not_found" } };
      op.category_id = params.category_id as number | null;
      op.type =
        op.category_id === 1 ? "internal" : op.montant_cents < 0 ? "debit" : "credit";
      return { ...op };
    }

    case "operations.bulk_assign_category": {
      for (const id of params.ids as number[]) {
        const op = m.operations.find((o) => o.id === id);
        if (op) {
          op.category_id = params.category_id as number | null;
          op.type =
            op.category_id === 1 ? "internal" : op.montant_cents < 0 ? "debit" : "credit";
        }
      }
      return { updated: (params.ids as number[]).length };
    }

    case "operations.set_recurring": {
      const op = m.operations.find((o) => o.id === params.id);
      if (op) op.recurring = params.recurring as string;
      return op ? { ...op } : null;
    }

    case "rules.list":
      return m.rules;

    case "rules.create": {
      const rule: MockRule = {
        id: nextId(),
        name: params.name as string,
        category_id: params.category_id as number,
        priority: (m.rules.length + 1) * 10,
        predicate: params.predicate as MockRule["predicate"],
        enabled: (params.enabled as boolean) ?? true,
        created_at: now(),
      };
      m.rules.push(rule);
      return { ...rule };
    }

    case "rules.apply_now": {
      let assigned = 0;
      for (const op of m.operations) {
        if (op.category_id !== null) continue;
        for (const rule of m.rules) {
          if (!rule.enabled) continue;
          const pred = rule.predicate;
          let match = false;
          if (pred.kind === "libelle_contains" && pred.text) {
            match = pred.case_sensitive
              ? op.libelle.includes(pred.text)
              : op.libelle.toLowerCase().includes(pred.text.toLowerCase());
          }
          if (match) {
            op.category_id = rule.category_id;
            op.type =
              op.category_id === 1 ? "internal" : op.montant_cents < 0 ? "debit" : "credit";
            assigned++;
            break;
          }
        }
      }
      return { assigned };
    }

    case "import.ingest": {
      const accountId = params.account_id as number;
      const rows = params.rows as Array<{
        date: string;
        montant_cents: number;
        libelle: string;
      }>;
      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const exists = m.operations.some(
          (o) =>
            o.account_id === accountId &&
            o.date === row.date &&
            o.montant_cents === row.montant_cents &&
            o.libelle === row.libelle,
        );
        if (exists) {
          skipped++;
          continue;
        }
        const id = nextId();
        m.operations.push({
          id,
          account_id: accountId,
          date: row.date,
          montant_cents: row.montant_cents,
          libelle: row.libelle,
          type: row.montant_cents < 0 ? "debit" : "credit",
          category_id: null,
          dedup_hash: `h${id}`,
          created_at: now(),
          recurring: "none",
        });
        imported++;
      }
      const acc = m.accounts.find((a) => a.id === accountId);
      if (acc) acc.last_import_at = now().slice(0, 10);
      return { imported, skipped, rule_assigned: 0, skipped_existing: [] };
    }

    case "bilan.filter_options": {
      const debitCatIds = [
        ...new Set(
          m.operations
            .filter((o) => o.type === "debit" && o.category_id !== null)
            .map((o) => o.category_id as number),
        ),
      ];
      const creditCatIds = [
        ...new Set(
          m.operations
            .filter((o) => o.type === "credit" && o.category_id !== null)
            .map((o) => o.category_id as number),
        ),
      ];
      return {
        accounts: m.accounts,
        debit_categories: debitCatIds
          .map((id) => m.categories.find((c) => c.id === id))
          .filter(Boolean),
        credit_categories: creditCatIds
          .map((id) => m.categories.find((c) => c.id === id))
          .filter(Boolean),
        debit_has_uncategorized: m.operations.some(
          (o) => o.type === "debit" && o.category_id === null,
        ),
        credit_has_uncategorized: m.operations.some(
          (o) => o.type === "credit" && o.category_id === null,
        ),
      };
    }

    case "bilan.summary": {
      type Slice = {
        month: string;
        type: string;
        category_id: number | null;
        category_name: string | null;
        total_cents: number;
        is_planned: boolean;
        libelle: string | null;
      };
      const byKey: Record<string, Slice> = {};
      const months = new Set<string>();
      for (const op of m.operations) {
        if (op.type === "internal") continue;
        const month = op.date.slice(0, 7);
        months.add(month);
        const key = `${month}__${op.type}__${op.category_id ?? "null"}`;
        if (!byKey[key]) {
          const cat = op.category_id !== null
            ? m.categories.find((c) => c.id === op.category_id)
            : null;
          byKey[key] = {
            month,
            type: op.type,
            category_id: op.category_id,
            category_name: cat?.name ?? null,
            total_cents: 0,
            is_planned: false,
            libelle: null,
          };
        }
        byKey[key].total_cents += op.montant_cents;
      }
      return {
        months: [...months].sort(),
        rows: Object.values(byKey),
      };
    }

    case "planned.list":
      return [];

    case "tink.has_connection":
      return { connected: false };

    default:
      console.warn(`[mock] unhandled: ${method}`, params);
      return null;
  }
}

window.__TAURI_INTERNALS__ = {
  invoke: (_cmd, args) => {
    const { method, params } = args as { method: string; params: Record<string, unknown> };
    return Promise.resolve().then(() => dispatch(method, params ?? {}));
  },
  transformCallback: () => 0,
  unregisterCallback: () => {},
};
