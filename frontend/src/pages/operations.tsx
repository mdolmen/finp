import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Repeat, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accountsApi,
  categoriesApi,
  operationsApi,
  rulesApi,
  RpcError,
} from "@/lib/api";
import type { Account, Category, Operation, OperationType } from "@/lib/api";
import { formatDate, formatEuros } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const NO_CATEGORY = "__none__";
const ALL_CATEGORIES = "__all__";
const PAGE_SIZE = 200;

type Filters = {
  debit: boolean;
  credit: boolean;
  internal: boolean;
  uncategorizedOnly: boolean;
  recurringOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  debit: true,
  credit: true,
  internal: false,
  uncategorizedOnly: false,
  recurringOnly: false,
};

export function OperationsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 200);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [montantOp, setMontantOp] = useState<">" | "<" | "==">(">");
  const [montantText, setMontantText] = useState("");
  const debouncedMontant = useDebounced(montantText, 200);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const [ops, setOps] = useState<Operation[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const loadedCount = useRef(0);
  const [cats, setCats] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const types = useMemo<OperationType[]>(() => {
    const t: OperationType[] = [];
    if (filters.debit) t.push("debit");
    if (filters.credit) t.push("credit");
    if (filters.internal) t.push("internal");
    return t;
  }, [filters]);

  const montantCents = useMemo(() => parseEurosToCents(debouncedMontant), [debouncedMontant]);

  const buildFilters = useCallback(
    (offset: number) => ({
      types,
      search: debouncedSearch.trim() || null,
      include_no_category: filters.uncategorizedOnly,
      recurring_only: filters.recurringOnly,
      category_ids: categoryId !== null ? [categoryId] : null,
      montant_op: montantCents !== null ? montantOp : null,
      montant_value_cents: montantCents,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      limit: PAGE_SIZE,
      offset,
    }),
    [types, debouncedSearch, filters.uncategorizedOnly, filters.recurringOnly, categoryId, montantOp, montantCents, dateFrom, dateTo],
  );

  const refresh = useCallback(async () => {
    if (types.length === 0) {
      setOps([]);
      setHasMore(false);
      loadedCount.current = 0;
      return;
    }
    try {
      const result = await operationsApi.list(buildFilters(0));
      setOps(result.items);
      setHasMore(result.has_more);
      loadedCount.current = result.items.length;
    } catch (e) {
      setError(formatError(e));
    }
  }, [buildFilters, types.length]);

  const loadMore = useCallback(async () => {
    try {
      const result = await operationsApi.list(buildFilters(loadedCount.current));
      setOps((prev) => [...(prev ?? []), ...result.items]);
      setHasMore(result.has_more);
      loadedCount.current += result.items.length;
    } catch (e) {
      setError(formatError(e));
    }
  }, [buildFilters]);

  useEffect(() => {
    categoriesApi.list().then(setCats).catch((e) => setError(formatError(e)));
    accountsApi.list().then(setAccounts).catch((e) => setError(formatError(e)));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "f" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Drop selection whenever the visible row set changes — selecting rows you
  // can't see anymore would be confusing.
  // Filter / search changes invalidate the visible row set; clearing is
  // wired into each onChange below rather than via a useEffect, because
  // useMemo'd dep arrays can change reference even when values haven't,
  // which would re-fire the effect and clobber a fresh selection.

  function setSearchAndClear(v: string) {
    setSearch(v);
    setSelected(new Set());
  }

  function setFiltersAndClear(updater: (f: Filters) => Filters) {
    setFilters(updater);
    setSelected(new Set());
  }

  function setMontantTextAndClear(v: string) {
    setMontantText(v);
    setSelected(new Set());
  }

  function setMontantOpAndClear(v: ">" | "<" | "==") {
    setMontantOp(v);
    setSelected(new Set());
  }

  function setDateFromAndClear(v: string) {
    setDateFrom(v);
    setSelected(new Set());
  }

  function setDateToAndClear(v: string) {
    setDateTo(v);
    setSelected(new Set());
  }

  function setCategoryIdAndClear(v: number | null) {
    setCategoryId(v);
    setSelected(new Set());
  }

  function clearDatesAndClear() {
    setDateFrom("");
    setDateTo("");
    setSelected(new Set());
  }

  function toggleSelect(opId: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(opId);
      else next.delete(opId);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (!ops) return;
    setSelected(checked ? new Set(ops.map((o) => o.id)) : new Set());
  }

  async function handleBulkAssign(categoryId: number | null) {
    if (selected.size === 0) return;
    setError(null);
    setInfo(null);
    try {
      const ids = [...selected];
      await operationsApi.bulkAssignCategory(ids, categoryId);
      setSelected(new Set());
      await refresh();
    } catch (e) {
      setError(formatError(e));
    }
  }

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

  async function handleCycleRecurring(opId: number, current: "none" | "monthly" | "yearly") {
    const next = current === "none" ? "monthly" : current === "monthly" ? "yearly" : "none";
    setError(null);
    try {
      const updated = await operationsApi.setRecurring(opId, next);
      setOps((prev) => prev?.map((o) => (o.id === opId ? updated : o)) ?? null);
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function handleApplyRules() {
    setError(null);
    setInfo(null);
    try {
      const r = await rulesApi.applyNow();
      setInfo(t.operations.appliedRules.replace("{n}", String(r.assigned)));
      await refresh();
    } catch (e) {
      setError(formatError(e));
    }
  }

  if (accounts !== null && accounts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm text-muted-foreground">{t.emptyState.operations}</p>
        <Link
          to="/comptes"
          className="text-sm font-medium underline underline-offset-4 hover:text-foreground text-muted-foreground"
        >
          {t.emptyState.createAccount}
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 flex flex-col h-full">
      <div className="flex items-center justify-end mb-4">
        <Button size="sm" variant="outline" onClick={handleApplyRules}>
          <Sparkles className="size-3.5" />
          {t.operations.applyRules}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative max-w-sm">
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearchAndClear(e.target.value)}
            placeholder={t.operations.searchPlaceholder}
            className="h-8 pr-7"
            spellCheck={false}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearchAndClear("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Effacer la recherche"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select
          value={montantOp}
          onValueChange={(v) => setMontantOpAndClear(v as ">" | "<" | "==")}
        >
          <SelectTrigger className="h-8 w-14">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value=">" title={t.operations.montantOpGt}>
              {">"}
            </SelectItem>
            <SelectItem value="<" title={t.operations.montantOpLt}>
              {"<"}
            </SelectItem>
            <SelectItem value="==" title={t.operations.montantOpEq}>
              {"="}
            </SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={montantText}
          onChange={(e) => setMontantTextAndClear(e.target.value)}
          placeholder={t.operations.montantPlaceholder}
          inputMode="decimal"
          className="w-32 h-8 tabular-nums"
        />
        <span className="text-sm text-muted-foreground">{t.operations.filterDateFrom}</span>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFromAndClear(e.target.value)}
          placeholder={t.operations.filterDateFrom}
          className="w-36 h-8"
        />
        <span className="text-sm text-muted-foreground">–</span>
        <span className="text-sm text-muted-foreground">{t.operations.filterDateTo}</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateToAndClear(e.target.value)}
          placeholder={t.operations.filterDateTo}
          className="w-36 h-8"
        />
        {(dateFrom || dateTo) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={clearDatesAndClear}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Effacer les filtres de date"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-sm">
        <FilterCheckbox
          label={t.operations.filterSansCategorie}
          checked={filters.uncategorizedOnly}
          onChange={(v) => setFiltersAndClear((f) => ({ ...f, uncategorizedOnly: v }))}
        />
        <FilterCheckbox
          label={t.operations.filterDebits}
          checked={filters.debit}
          onChange={(v) => setFiltersAndClear((f) => ({ ...f, debit: v }))}
        />
        <FilterCheckbox
          label={t.operations.filterCredits}
          checked={filters.credit}
          onChange={(v) => setFiltersAndClear((f) => ({ ...f, credit: v }))}
        />
        <FilterCheckbox
          label={t.operations.filterInternal}
          checked={filters.internal}
          onChange={(v) => setFiltersAndClear((f) => ({ ...f, internal: v }))}
        />
        <FilterCheckbox
          label={t.operations.filterRecurring}
          checked={filters.recurringOnly}
          onChange={(v) => setFiltersAndClear((f) => ({ ...f, recurringOnly: v }))}
        />
        <Select
          value={categoryId !== null ? String(categoryId) : ALL_CATEGORIES}
          onValueChange={(v) => setCategoryIdAndClear(v === ALL_CATEGORIES ? null : Number(v))}
        >
          <SelectTrigger className="h-7 text-xs w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>{t.common.all}</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      {info && <p className="text-sm text-muted-foreground mb-2">{info}</p>}

      {ops !== null && (
        <div className="flex justify-end mb-1.5 px-1 text-xs text-muted-foreground tabular-nums">
          {t.operations.count.replace("{n}", String(ops.length))}
          {hasMore && "+"}
        </div>
      )}

      <OperationsList
        ops={ops}
        cats={cats}
        onAssign={handleAssign}
        onToggleRecurring={handleCycleRecurring}
        selected={selected}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        bottomBarVisible={selected.size > 0}
      />

      {hasMore && (
        <div className="flex justify-center py-2">
          <Button size="sm" variant="outline" onClick={loadMore}>
            {t.operations.loadMore}
          </Button>
        </div>
      )}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          cats={cats}
          onAssign={handleBulkAssign}
          onDeselect={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}

function BulkBar({
  count,
  cats,
  onAssign,
  onDeselect,
}: {
  count: number;
  cats: Category[];
  onAssign: (categoryId: number | null) => void;
  onDeselect: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 bg-popover border border-border rounded-md shadow-lg text-sm">
      <span className="text-muted-foreground pr-1">
        {t.operations.selectedCount.replace("{n}", String(count))}
      </span>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            {t.operations.bulkAssign}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-1" align="center">
          <ul className="max-h-72 overflow-y-auto">
            {cats.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAssign(c.id);
                    setPickerOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent cursor-pointer"
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      <Button size="sm" variant="ghost" onClick={() => onAssign(null)}>
        {t.operations.bulkClear}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDeselect}
        className="text-muted-foreground"
        aria-label={t.operations.bulkDeselect}
      >
        <X className="size-3.5" />
      </Button>
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

const GRID_COLS = "grid-cols-[28px_100px_120px_1fr_28px_220px]";

function OperationsList({
  ops,
  cats,
  onAssign,
  onToggleRecurring,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  bottomBarVisible,
}: {
  ops: Operation[] | null;
  cats: Category[];
  onAssign: (opId: number, value: string) => void;
  onToggleRecurring: (opId: number, current: "none" | "monthly" | "yearly") => void;
  selected: Set<number>;
  onToggleSelect: (opId: number, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  bottomBarVisible: boolean;
}) {
  if (ops === null) {
    return <p className="text-sm text-muted-foreground">{t.common.loading}</p>;
  }
  if (ops.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.operations.empty}</p>;
  }

  const allSelected = ops.length > 0 && ops.every((o) => selected.has(o.id));
  const someSelected = !allSelected && ops.some((o) => selected.has(o.id));

  return (
    <VirtualizedList
      ops={ops}
      cats={cats}
      onAssign={onAssign}
      onToggleRecurring={onToggleRecurring}
      selected={selected}
      onToggleSelect={onToggleSelect}
      bottomBarVisible={bottomBarVisible}
      header={
        <div
          className={cn(
            "grid gap-3 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border items-center",
            GRID_COLS,
          )}
        >
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) => onToggleSelectAll(v === true)}
            aria-label={t.operations.selectAll}
          />
          <div>{t.operations.columnDate}</div>
          <div className="text-right">{t.operations.columnMontant}</div>
          <div>{t.operations.columnLibelle}</div>
          <div />
          <div>{t.operations.columnCategory}</div>
        </div>
      }
    />
  );
}

function VirtualizedList({
  ops,
  cats,
  onAssign,
  onToggleRecurring,
  selected,
  onToggleSelect,
  bottomBarVisible,
  header,
}: {
  ops: Operation[];
  cats: Category[];
  onAssign: (opId: number, value: string) => void;
  onToggleRecurring: (opId: number, current: "none" | "monthly" | "yearly") => void;
  selected: Set<number>;
  onToggleSelect: (opId: number, checked: boolean) => void;
  bottomBarVisible: boolean;
  header: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: ops.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  return (
    <div
      className={cn(
        "border border-border rounded-md flex-1 min-h-0 flex flex-col overflow-hidden",
        bottomBarVisible ? "mb-16" : "mb-2",
      )}
    >
      {header}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const op = ops[vRow.index];
            return (
              <div
                key={op.id}
                data-index={vRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                <OperationRow
                  op={op}
                  cats={cats}
                  onAssign={onAssign}
                  onToggleRecurring={onToggleRecurring}
                  selected={selected.has(op.id)}
                  onToggle={(checked) => onToggleSelect(op.id, checked)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OperationRow({
  op,
  cats,
  onAssign,
  onToggleRecurring,
  selected,
  onToggle,
}: {
  op: Operation;
  cats: Category[];
  onAssign: (opId: number, value: string) => void;
  onToggleRecurring: (opId: number, current: "none" | "monthly" | "yearly") => void;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const value = op.category_id != null ? String(op.category_id) : NO_CATEGORY;
  return (
    <div
      className={cn(
        "grid gap-3 px-3 py-1.5 items-center text-sm border-l-2 border-b border-b-border",
        GRID_COLS,
        op.type === "debit" && "border-l-debit/40",
        op.type === "credit" && "border-l-credit/40",
        op.type === "internal" && "border-l-internal/40",
        selected && "bg-accent/40",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={`Sélectionner ${op.libelle}`}
      />
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
      <button
        type="button"
        onClick={() => onToggleRecurring(op.id, op.recurring)}
        className={cn(
          "relative flex items-center justify-center size-6 rounded-sm transition-colors",
          op.recurring !== "none"
            ? "text-credit"
            : "text-muted-foreground/40 hover:text-muted-foreground",
        )}
        aria-label={
          op.recurring === "monthly"
            ? t.operations.recurringMonthly
            : op.recurring === "yearly"
              ? t.operations.recurringYearly
              : t.operations.recurringOff
        }
        title={
          op.recurring === "monthly"
            ? t.operations.recurringMonthly
            : op.recurring === "yearly"
              ? t.operations.recurringYearly
              : t.operations.recurringOff
        }
      >
        <Repeat className="size-3.5" />
        {op.recurring !== "none" && (
          <span className="absolute -top-1 -right-1 text-[7px] font-bold leading-none bg-credit text-white rounded-full w-3 h-3 flex items-center justify-center">
            {op.recurring === "monthly" ? "M" : "Y"}
          </span>
        )}
      </button>
      <div>
        <Select value={value} onValueChange={(v) => onAssign(op.id, v)}>
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>{t.operations.categoryNone}</SelectItem>
            {cats.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
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

// Accepts "1234,56", "1234.56", or "1 234,56". Returns null when the input
// can't be parsed — including the empty string, which means "no filter".
function parseEurosToCents(input: string): number | null {
  // eslint-disable-next-line no-irregular-whitespace
  const cleaned = input.replace(/[\s   ]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
