import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  categoriesApi,
  operationsApi,
  rulesApi,
  RpcError,
} from "@/lib/api";
import type { Category, Operation, OperationType } from "@/lib/api";
import { formatDate, formatEuros } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { fr } from "@/i18n/fr";
import { cn } from "@/lib/utils";

const NO_CATEGORY = "__none__";
const FETCH_LIMIT = 1000;

type Filters = {
  debit: boolean;
  credit: boolean;
  internal: boolean;
  uncategorizedOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  debit: true,
  credit: true,
  internal: false,
  uncategorizedOnly: false,
};

export function OperationsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 200);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const [ops, setOps] = useState<Operation[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const types = useMemo<OperationType[]>(() => {
    const t: OperationType[] = [];
    if (filters.debit) t.push("debit");
    if (filters.credit) t.push("credit");
    if (filters.internal) t.push("internal");
    return t;
  }, [filters]);

  const refresh = useCallback(async () => {
    if (types.length === 0) {
      setOps([]);
      return;
    }
    try {
      // When uncategorizedOnly is true, include_no_category alone (with no
      // category_ids) restricts to category IS NULL on the backend. When
      // false, no category dimension is filtered.
      const rows = await operationsApi.list({
        types,
        search: debouncedSearch.trim() || null,
        include_no_category: filters.uncategorizedOnly,
        limit: FETCH_LIMIT,
      });
      setOps(rows);
    } catch (e) {
      setError(formatError(e));
    }
  }, [types, debouncedSearch, filters.uncategorizedOnly]);

  useEffect(() => {
    categoriesApi.list().then(setCats).catch((e) => setError(formatError(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAssign(opId: number, value: string) {
    setInfo(null);
    setError(null);
    try {
      const newCatId = value === NO_CATEGORY ? null : Number(value);
      await operationsApi.assignCategory(opId, newCatId);
      // Update locally to avoid a full refetch on every assign. If the
      // 'Sans catégorie' filter is on and the row just got a category,
      // it no longer belongs in the list — drop it.
      setOps((prev) =>
        prev
          ?.map((o) =>
            o.id === opId
              ? { ...o, category_id: newCatId, type: deriveType(o, newCatId, cats) }
              : o,
          )
          .filter(
            (o) => !filters.uncategorizedOnly || o.category_id === null,
          ) ?? null,
      );
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function handleApplyRules() {
    setError(null);
    setInfo(null);
    try {
      const r = await rulesApi.applyNow();
      setInfo(fr.operations.appliedRules.replace("{n}", String(r.assigned)));
      await refresh();
    } catch (e) {
      setError(formatError(e));
    }
  }

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold tracking-tight">{fr.operations.title}</h1>
        <Button size="sm" variant="outline" onClick={handleApplyRules}>
          <Sparkles className="size-3.5" />
          {fr.operations.applyRules}
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={fr.operations.searchPlaceholder}
          className="max-w-sm h-8"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm">
        <FilterCheckbox
          label={fr.operations.filterSansCategorie}
          checked={filters.uncategorizedOnly}
          onChange={(v) => setFilters((f) => ({ ...f, uncategorizedOnly: v }))}
        />
        <FilterCheckbox
          label={fr.operations.filterDebits}
          checked={filters.debit}
          onChange={(v) => setFilters((f) => ({ ...f, debit: v }))}
        />
        <FilterCheckbox
          label={fr.operations.filterCredits}
          checked={filters.credit}
          onChange={(v) => setFilters((f) => ({ ...f, credit: v }))}
        />
        <FilterCheckbox
          label={fr.operations.filterInternal}
          checked={filters.internal}
          onChange={(v) => setFilters((f) => ({ ...f, internal: v }))}
        />
      </div>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      {info && <p className="text-sm text-muted-foreground mb-2">{info}</p>}

      <OperationsList ops={ops} cats={cats} onAssign={handleAssign} />
    </div>
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <span>{label}</span>
    </label>
  );
}

function OperationsList({
  ops,
  cats,
  onAssign,
}: {
  ops: Operation[] | null;
  cats: Category[];
  onAssign: (opId: number, value: string) => void;
}) {
  if (ops === null) {
    return <p className="text-sm text-muted-foreground">{fr.common.loading}</p>;
  }
  if (ops.length === 0) {
    return <p className="text-sm text-muted-foreground">{fr.operations.empty}</p>;
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="grid grid-cols-[100px_120px_1fr_220px] gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border">
        <div>{fr.operations.columnDate}</div>
        <div className="text-right">{fr.operations.columnMontant}</div>
        <div>{fr.operations.columnLibelle}</div>
        <div>{fr.operations.columnCategory}</div>
      </div>
      <ul className="divide-y divide-border">
        {ops.map((op) => (
          <OperationRow key={op.id} op={op} cats={cats} onAssign={onAssign} />
        ))}
      </ul>
    </div>
  );
}

function OperationRow({
  op,
  cats,
  onAssign,
}: {
  op: Operation;
  cats: Category[];
  onAssign: (opId: number, value: string) => void;
}) {
  const value = op.category_id != null ? String(op.category_id) : NO_CATEGORY;
  return (
    <li
      className={cn(
        "grid grid-cols-[100px_120px_1fr_220px] gap-3 px-3 py-1.5 items-center text-sm border-l-2",
        op.type === "debit" && "border-l-debit/40",
        op.type === "credit" && "border-l-credit/40",
        op.type === "internal" && "border-l-internal/40",
      )}
    >
      <div className="text-muted-foreground tabular-nums">{formatDate(op.date)}</div>
      <div
        className={cn(
          "text-right tabular-nums font-medium",
          op.type === "debit" && "text-debit",
          op.type === "credit" && "text-credit",
          op.type === "internal" && "text-internal",
        )}
      >
        {formatEuros(op.montant_cents)}
      </div>
      <div className="truncate" title={op.libelle}>
        {op.libelle}
      </div>
      <div>
        <Select value={value} onValueChange={(v) => onAssign(op.id, v)}>
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>{fr.operations.categoryNone}</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </li>
  );
}

// Local mirror of the backend's type-derivation logic, used so the UI
// reflects the new type without a refetch. The backend remains the source
// of truth — we refresh on the next list query.
function deriveType(op: Operation, newCatId: number | null, cats: Category[]): OperationType {
  const internal = cats.find((c) => c.is_builtin);
  if (newCatId != null && internal && newCatId === internal.id) return "internal";
  return op.montant_cents < 0 ? "debit" : "credit";
}

function formatError(e: unknown): string {
  return e instanceof RpcError ? e.message : String(e);
}
