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
  automations: [],
  pending: [],
  webhooks: [],
};

function predicateMatches(pred, op) {
  if (pred.kind === "libelle_contains" && pred.text) {
    return pred.case_sensitive
      ? op.libelle.includes(pred.text)
      : op.libelle.toLowerCase().includes(pred.text.toLowerCase());
  }
  if (pred.kind === "montant_compare") {
    const v = Math.abs(op.montant_cents);
    const t = Math.abs(pred.value_cents);
    if (pred.operator === ">") return v > t;
    if (pred.operator === "<") return v < t;
    if (pred.operator === "==") return v === t;
  }
  return false;
}

function enqueueAutomationsForOp(op) {
  const m = window.__mock;
  for (const a of m.automations) {
    if (!a.enabled) continue;
    if (a.event_type !== "operation.created") continue;
    if (!predicateMatches(a.predicate, op)) continue;
    const exists = m.pending.some(
      (p) =>
        p.automation_id === a.id &&
        p.operation_id === op.id &&
        p.status === "pending",
    );
    if (exists) continue;
    m.pending.push({
      id: nextId(),
      automation_id: a.id,
      automation_name: a.name,
      callback_url: a.callback_url,
      event_type: a.event_type,
      operation_id: op.id,
      payload: { id: op.id, account_id: op.account_id },
      status: "pending",
      error: null,
      created_at: now(),
      resolved_at: null,
    });
  }
}

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
        const newOp = {
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
        };
        m.operations.push(newOp);
        enqueueAutomationsForOp(newOp);
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

    case "automations.list":
      return m.automations;

    case "automations.create": {
      const a = {
        id: nextId(),
        name: params.name,
        event_type: params.event_type,
        predicate: params.predicate,
        callback_url: params.callback_url,
        enabled: params.enabled ?? true,
        created_at: now(),
      };
      m.automations.push(a);
      return a;
    }

    case "automations.toggle": {
      const a = m.automations.find((x) => x.id === params.id);
      if (a) a.enabled = params.enabled;
      return a;
    }

    case "automations.delete":
      m.automations = m.automations.filter((x) => x.id !== params.id);
      return null;

    case "automations.pending.list":
      return m.pending.filter((p) => p.status === "pending");

    case "automations.pending.confirm": {
      const item = m.pending.find((p) => p.id === params.id);
      if (!item) return null;
      m.webhooks.push({
        url: item.callback_url,
        body: {
          automation: { id: item.automation_id, name: item.automation_name },
          event: { type: item.event_type, payload: item.payload },
          pending_id: item.id,
          confirmed_at: null,
        },
      });
      item.status = "sent";
      item.resolved_at = now();
      return { ...item };
    }

    case "automations.pending.refuse": {
      const item = m.pending.find((p) => p.id === params.id);
      if (!item) return null;
      item.status = "refused";
      item.resolved_at = now();
      return { ...item };
    }

    case "automations.history.list": {
      let rows = m.pending.filter((p) => p.status !== "pending");
      if (params.status && params.status !== "all") {
        rows = rows.filter((p) => p.status === params.status);
      }
      rows = [...rows].sort((a, b) =>
        (b.resolved_at ?? "").localeCompare(a.resolved_at ?? ""),
      );
      return rows.slice(0, params.limit ?? 20);
    }

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
