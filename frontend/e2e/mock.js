/**
 * Browser-side stateful RPC mock — plain JS, injected via page.addInitScript.
 * TypeScript source with type annotations lives in mock.ts.
 */

window.__mock = {
  nextId: 100,
  accounts: [],
  categories: [{ id: 1, name: "Virement interne", is_builtin: true, display_order: 0 }],
  operations: [],
  rules: [],
};

function now() {
  return new Date().toISOString();
}
function nextId() {
  return window.__mock.nextId++;
}

function dispatch(method, params) {
  const m = window.__mock;

  switch (method) {
    case "accounts.list":
      return m.accounts;

    case "accounts.create": {
      const acc = {
        id: nextId(),
        name: params.name,
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
      const cat = {
        id: nextId(),
        name: params.name,
        is_builtin: false,
        display_order: m.categories.length,
      };
      m.categories.push(cat);
      return cat;
    }

    case "operations.list": {
      const p = params;
      let ops = [...m.operations];
      if (p.types?.length) ops = ops.filter((o) => p.types.includes(o.type));
      if (p.search) {
        const q = p.search.toLowerCase();
        ops = ops.filter((o) => o.libelle.toLowerCase().includes(q));
      }
      if (p.include_no_category && !p.category_ids?.length) {
        ops = ops.filter((o) => o.category_id === null);
      } else if (p.category_ids?.length) {
        ops = ops.filter(
          (o) =>
            p.category_ids.includes(o.category_id) ||
            (p.include_no_category && o.category_id === null),
        );
      }
      if (p.date_from) ops = ops.filter((o) => o.date >= p.date_from);
      if (p.date_to) ops = ops.filter((o) => o.date <= p.date_to);
      ops.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      const limit = p.limit ?? 200;
      const offset = p.offset ?? 0;
      return { items: ops.slice(offset, offset + limit), has_more: offset + limit < ops.length };
    }

    case "operations.assign_category": {
      const op = m.operations.find((o) => o.id === params.id);
      if (!op) throw { code: -32000, message: "not found", data: { code: "operation.not_found" } };
      op.category_id = params.category_id;
      op.type = op.category_id === 1 ? "internal" : op.montant_cents < 0 ? "debit" : "credit";
      return { ...op };
    }

    case "operations.bulk_assign_category": {
      for (const id of params.ids) {
        const op = m.operations.find((o) => o.id === id);
        if (op) {
          op.category_id = params.category_id;
          op.type = op.category_id === 1 ? "internal" : op.montant_cents < 0 ? "debit" : "credit";
        }
      }
      return { updated: params.ids.length };
    }

    case "operations.set_recurring": {
      const op = m.operations.find((o) => o.id === params.id);
      if (op) op.recurring = params.recurring;
      return op ? { ...op } : null;
    }

    case "rules.list":
      return m.rules;

    case "rules.create": {
      const rule = {
        id: nextId(),
        name: params.name,
        category_id: params.category_id,
        priority: (m.rules.length + 1) * 10,
        predicate: params.predicate,
        enabled: params.enabled ?? true,
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
            op.type = op.category_id === 1 ? "internal" : op.montant_cents < 0 ? "debit" : "credit";
            assigned++;
            break;
          }
        }
      }
      return { assigned };
    }

    case "import.ingest": {
      const accountId = params.account_id;
      const rows = params.rows;
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
            .map((o) => o.category_id),
        ),
      ];
      const creditCatIds = [
        ...new Set(
          m.operations
            .filter((o) => o.type === "credit" && o.category_id !== null)
            .map((o) => o.category_id),
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
      const byKey = {};
      const months = new Set();
      for (const op of m.operations) {
        if (op.type === "internal") continue;
        const month = op.date.slice(0, 7);
        months.add(month);
        const key = `${month}__${op.type}__${op.category_id ?? "null"}`;
        if (!byKey[key]) {
          const cat =
            op.category_id !== null ? m.categories.find((c) => c.id === op.category_id) : null;
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
    const { method, params } = args;
    return Promise.resolve().then(() => dispatch(method, params ?? {}));
  },
  transformCallback: () => 0,
  unregisterCallback: () => {},
};
