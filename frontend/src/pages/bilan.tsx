import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MultiSelect } from "@/components/MultiSelect";
import { accountsApi, bilanApi, operationsApi, plannedApi, RpcError } from "@/lib/api";
import type {
  Account,
  BilanFilterOptions,
  BilanSummary,
  Operation,
  PlannedOperation,
} from "@/lib/api";
import { formatDate, formatEuros, formatMonth } from "@/lib/format";
import { t } from "@/i18n";

const NO_CATEGORY_SENTINEL = -1 as const;

export function BilanPage() {
  const [options, setOptions] = useState<BilanFilterOptions | null>(null);
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [debitIds, setDebitIds] = useState<number[]>([]);
  const [creditIds, setCreditIds] = useState<number[]>([]);
  const [summary, setSummary] = useState<BilanSummary | null>(null);
  // The y-axis upper bound is locked to the max stack height in the unfiltered
  // data so applying filters never rescales the chart (just empties it).
  const [yMaxEuros, setYMaxEuros] = useState<number | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [accountsList, setAccountsList] = useState<Account[]>([]);
  const [planned, setPlanned] = useState<PlannedOperation[]>([]);
  const [addPlannedOpen, setAddPlannedOpen] = useState(false);
  const [deletingPlanned, setDeletingPlanned] = useState<PlannedOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<{ month: string; type: "debit" | "credit" } | null>(null);

  const refreshPlanned = useCallback(async () => {
    try {
      setPlanned(await plannedApi.list());
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  // Filter options + planned ops + accounts (for the Solde KPI) are
  // independent of the time window.
  useEffect(() => {
    bilanApi
      .filterOptions()
      .then(setOptions)
      .catch((e) => setError(formatError(e)));
    accountsApi
      .list()
      .then(setAccountsList)
      .catch((e) => setError(formatError(e)));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPlanned();
  }, [refreshPlanned]);

  // Y-axis upper bound is locked to the max stack height of the *unfiltered*
  // window for the current month offset. Recomputed whenever the offset
  // changes so the scale fits the current view.
  useEffect(() => {
    bilanApi
      .summary({ today: shiftedTodayIso(monthOffset) })
      .then((s) => setYMaxEuros(computeYMaxEuros(s)))
      .catch((e) => setError(formatError(e)));
  }, [monthOffset]);

  async function handleDeletePlanned() {
    if (!deletingPlanned) return;
    try {
      await plannedApi.delete(deletingPlanned.id);
      await refreshPlanned();
      // Force the next summary fetch by bumping a filter dep — simpler: just
      // refetch the current filtered summary inline.
      const includeNoCatDebit = debitIds.includes(NO_CATEGORY_SENTINEL);
      const includeNoCatCredit = creditIds.includes(NO_CATEGORY_SENTINEL);
      const s = await bilanApi.summary({
        today: shiftedTodayIso(monthOffset),
        account_ids: accountIds.length ? accountIds : null,
        debit_category_ids: realIds(debitIds),
        credit_category_ids: realIds(creditIds),
        include_no_category_debit: includeNoCatDebit,
        include_no_category_credit: includeNoCatCredit,
      });
      setSummary(s);
    } catch (e) {
      setError(formatError(e));
    }
  }

  // Once options arrive, default every filter to "all selected" so the
  // checkboxes show ticked. Empty selection means "show all" semantically,
  // but visually checking everything makes the implicit-default explicit.
  useEffect(() => {
    if (!options) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccountIds(options.accounts.map((a) => a.id));
    const debitAll = options.debit_categories.map((c) => c.id);
    if (options.debit_has_uncategorized) debitAll.push(NO_CATEGORY_SENTINEL);
    setDebitIds(debitAll);
    const creditAll = options.credit_categories.map((c) => c.id);
    if (options.credit_has_uncategorized) creditAll.push(NO_CATEGORY_SENTINEL);
    setCreditIds(creditAll);
  }, [options]);

  // Refetch the summary whenever filters or the month offset change.
  useEffect(() => {
    if (!options) return; // wait until the initial defaults are applied
    const includeNoCatDebit = debitIds.includes(NO_CATEGORY_SENTINEL);
    const includeNoCatCredit = creditIds.includes(NO_CATEGORY_SENTINEL);
    bilanApi
      .summary({
        today: shiftedTodayIso(monthOffset),
        account_ids: accountIds.length ? accountIds : null,
        debit_category_ids: realIds(debitIds),
        credit_category_ids: realIds(creditIds),
        include_no_category_debit: includeNoCatDebit,
        include_no_category_credit: includeNoCatCredit,
      })
      .then(setSummary)
      .catch((e) => setError(formatError(e)));
  }, [accountIds, debitIds, creditIds, options, monthOffset]);

  if (accountsList.length === 0 && options !== null) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm text-muted-foreground">{t.emptyState.bilan}</p>
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
    <div className="px-6 py-5">
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <MultiSelect
          label={t.bilan.filterAccounts}
          options={
            options?.accounts.map((a) => ({ value: a.id, label: a.name })) ?? []
          }
          selected={accountIds}
          onChange={setAccountIds}
        />
        <MultiSelect
          label={t.bilan.filterDebits}
          options={categoryOptions(options?.debit_categories, options?.debit_has_uncategorized)}
          selected={debitIds}
          onChange={setDebitIds}
        />
        <MultiSelect
          label={t.bilan.filterCredits}
          options={categoryOptions(options?.credit_categories, options?.credit_has_uncategorized)}
          selected={creditIds}
          onChange={setCreditIds}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMonthOffset((o) => o - 1)}
            aria-label={t.bilan.shiftEarlier}
            title={t.bilan.shiftEarlier}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMonthOffset((o) => o + 1)}
            aria-label={t.bilan.shiftLater}
            title={t.bilan.shiftLater}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      <BilanChart summary={summary} yMaxEuros={yMaxEuros} onBarClick={setDrilldown} />

      <div className="grid grid-cols-2 gap-4 mt-4">
        <KpiPanel
          summary={summary}
          soldeCents={selectedAccountsSoldeCents(accountsList, accountIds)}
        />
        <PlannedPanel
          planned={planned}
          onAdd={() => setAddPlannedOpen(true)}
          onDelete={(p) => setDeletingPlanned(p)}
        />
      </div>

      {addPlannedOpen && (
        <AddPlannedDialog
          onClose={() => setAddPlannedOpen(false)}
          onCreated={async () => {
            setAddPlannedOpen(false);
            await refreshPlanned();
            // Surface the new op in the chart by refetching the summary.
            const includeNoCatDebit = debitIds.includes(NO_CATEGORY_SENTINEL);
            const includeNoCatCredit = creditIds.includes(NO_CATEGORY_SENTINEL);
            const s = await bilanApi.summary({
              account_ids: accountIds.length ? accountIds : null,
              debit_category_ids: realIds(debitIds),
              credit_category_ids: realIds(creditIds),
              include_no_category_debit: includeNoCatDebit,
              include_no_category_credit: includeNoCatCredit,
            });
            setSummary(s);
          }}
        />
      )}

      <ConfirmDialog
        open={deletingPlanned !== null}
        onOpenChange={(v) => !v && setDeletingPlanned(null)}
        title={
          deletingPlanned
            ? t.bilan.plannedConfirmDelete.replace("{name}", deletingPlanned.libelle)
            : ""
        }
        confirmLabel={t.common.delete}
        destructive
        onConfirm={handleDeletePlanned}
      />

      {drilldown && (
        <DrilldownModal
          month={drilldown.month}
          type={drilldown.type}
          summary={summary}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}

function KpiPanel({
  summary,
  soldeCents,
}: {
  summary: BilanSummary | null;
  soldeCents: number;
}) {
  const kpis = useMemo(() => computeKpis(summary, soldeCents), [summary, soldeCents]);
  const rows: { label: string; value: number; signed?: boolean }[] = [
    { label: t.bilan.kpiSolde, value: kpis.soldeCents, signed: true },
    { label: t.bilan.kpiAvgCredits, value: kpis.avgCreditCents },
    { label: t.bilan.kpiAvgDebits, value: kpis.avgDebitCents },
    { label: t.bilan.kpiTotalCredits, value: kpis.totalCreditCents },
    { label: t.bilan.kpiTotalDebits, value: kpis.totalDebitCents },
  ];
  return (
    <div className="border border-border rounded-md p-4">
      <h2 className="text-sm font-bold text-foreground mb-3">KPIs</h2>
      <ul>
        {rows.map((r, i) => (
          <KpiRow key={r.label} {...r} zebra={i % 2 === 1} />
        ))}
      </ul>
    </div>
  );
}

function KpiRow({
  label,
  value,
  signed,
  zebra,
}: {
  label: string;
  value: number;
  signed?: boolean;
  zebra?: boolean;
}) {
  const cls = signed ? (value >= 0 ? "text-credit" : "text-debit") : "";
  return (
    <li
      className={`flex items-baseline justify-between text-sm px-2 py-1.5 rounded-sm ${
        zebra ? "bg-muted" : ""
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${cls}`}>
        {(signed && value > 0 ? "+" : "") + formatEuros(value)}
      </span>
    </li>
  );
}

function PlannedPanel({
  planned,
  onAdd,
  onDelete,
}: {
  planned: PlannedOperation[];
  onAdd: () => void;
  onDelete: (p: PlannedOperation) => void;
}) {
  return (
    <div className="border border-border rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">
          {t.bilan.plannedTitle}
        </h2>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="size-3.5" />
          {t.common.add}
        </Button>
      </div>
      {planned.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.bilan.plannedEmpty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {planned.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="text-muted-foreground tabular-nums w-20 shrink-0">
                {formatDate(p.date)}
              </span>
              <span
                className={`tabular-nums w-24 text-right shrink-0 ${
                  p.montant_cents < 0 ? "text-debit" : "text-credit"
                }`}
              >
                {formatEuros(p.montant_cents)}
              </span>
              <span className="flex-1 truncate" title={p.libelle}>
                {p.libelle}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(p)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={t.common.delete}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddPlannedDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [montantText, setMontantText] = useState("");
  const [libelle, setLibelle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseEurosToCents(montantText);
  const valid = !!date && cents !== null && libelle.trim();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || cents === null || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await plannedApi.create({
        date,
        montant_cents: cents,
        libelle: libelle.trim(),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof RpcError ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.bilan.plannedAddTitle}</DialogTitle>
          <DialogDescription>{t.bilan.plannedAddDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.bilan.plannedFieldDate}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.bilan.plannedFieldMontant}</Label>
              <Input
                value={montantText}
                onChange={(e) => setMontantText(e.target.value)}
                inputMode="decimal"
                placeholder="-100,00"
                className="tabular-nums"
                disabled={submitting}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.bilan.plannedFieldLibelle}</Label>
            <Input
              value={libelle}
              onChange={(e) => setLibelle(e.target.value)}
              placeholder="Ex. Impôts T2"
              disabled={submitting}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {t.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DrilldownModal({
  month,
  type,
  summary,
  onClose,
}: {
  month: string;
  type: "debit" | "credit";
  summary: BilanSummary | null;
  onClose: () => void;
}) {
  const [ops, setOps] = useState<Operation[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [year, mon] = month.split("-").map(Number);
  const dateFrom = `${month}-01`;
  const dateTo = new Date(year, mon, 0).toISOString().slice(0, 10);

  useEffect(() => {
    operationsApi
      .list({ types: [type], date_from: dateFrom, date_to: dateTo, limit: 500 })
      .then((r) => setOps(r.items))
      .catch((e) => setFetchError(e instanceof RpcError ? e.message : String(e)));
  }, [month, type, dateFrom, dateTo]);

  // Group real ops by category, sorted ascending by group total.
  const groups = useMemo(() => {
    if (!ops) return null;
    const byKey = new Map<
      string,
      { name: string | null; id: number | null; ops: Operation[] }
    >();
    for (const op of ops) {
      const key = op.category_id != null ? String(op.category_id) : "__none__";
      if (!byKey.has(key)) byKey.set(key, { name: null, id: op.category_id, ops: [] });
      byKey.get(key)!.ops.push(op);
    }
    // Resolve category names from already-fetched summary rows.
    if (summary) {
      for (const row of summary.rows) {
        if (row.month !== month || row.type !== type || row.is_planned) continue;
        const key = row.category_id != null ? String(row.category_id) : "__none__";
        const g = byKey.get(key);
        if (g && g.name === null) g.name = row.category_name;
      }
    }
    return [...byKey.values()].sort((a, b) => {
      const sumA = a.ops.reduce((s, o) => s + Math.abs(o.montant_cents), 0);
      const sumB = b.ops.reduce((s, o) => s + Math.abs(o.montant_cents), 0);
      return sumA - sumB;
    });
  }, [ops, summary, month, type]);

  // Planned rows for this month/type from the summary (recurring + manual planned ops).
  const plannedRows = useMemo(
    () =>
      (summary?.rows ?? [])
        .filter((r) => r.month === month && r.type === type && r.is_planned)
        .sort((a, b) => a.total_cents - b.total_cents),
    [summary, month, type],
  );

  const title = `${formatMonth(month)} — ${type === "credit" ? t.bilan.credits : t.bilan.debits}`;
  const hasReal = groups !== null && groups.length > 0;
  const hasPlanned = plannedRows.length > 0;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle
            style={{ color: type === "credit" ? "var(--credit)" : "var(--debit)" }}
          >
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
          {fetchError && <p className="text-sm text-destructive mb-2">{fetchError}</p>}
          {groups === null ? (
            <p className="text-sm text-muted-foreground">{t.common.loading}</p>
          ) : (
            <>
              {hasReal && (
                <div className="space-y-3">
                  {groups.map((g) => (
                    <div key={g.id ?? "__none__"}>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 border-b border-border mb-0.5">
                        {g.name ?? t.common.noCategory}
                      </div>
                      <ul>
                        {g.ops.map((op) => (
                          <li
                            key={op.id}
                            className="flex items-baseline gap-3 px-1 py-1 text-sm"
                          >
                            <span className="text-muted-foreground tabular-nums w-20 shrink-0">
                              {formatDate(op.date)}
                            </span>
                            <span
                              className={`tabular-nums w-24 text-right shrink-0 font-medium ${
                                type === "debit" ? "text-debit" : "text-credit"
                              }`}
                            >
                              {formatEuros(op.montant_cents)}
                            </span>
                            <span className="flex-1 truncate" title={op.libelle}>
                              {op.libelle}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {hasPlanned && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1 border-b border-border mb-0.5">
                    {t.bilan.attendues}
                  </div>
                  <ul>
                    {plannedRows.map((r, i) => (
                      <li key={i} className="flex items-baseline gap-3 px-1 py-1 text-sm">
                        <span className="text-muted-foreground w-20 shrink-0" />
                        <span
                          className={`tabular-nums w-24 text-right shrink-0 font-medium ${
                            type === "debit" ? "text-debit" : "text-credit"
                          }`}
                        >
                          {formatEuros(r.total_cents)}
                        </span>
                        <span className="flex-1 truncate text-muted-foreground" title={r.libelle ?? undefined}>
                          {r.libelle ?? r.category_name ?? t.common.noCategory}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!hasReal && !hasPlanned && (
                <p className="text-sm text-muted-foreground">{t.operations.empty}</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function computeKpis(
  summary: BilanSummary | null,
  soldeCents: number,
): {
  soldeCents: number;
  totalCreditCents: number;
  totalDebitCents: number;
  avgCreditCents: number;
  avgDebitCents: number;
} {
  if (!summary) {
    return {
      soldeCents,
      totalCreditCents: 0,
      totalDebitCents: 0,
      avgCreditCents: 0,
      avgDebitCents: 0,
    };
  }
  let totalCreditCents = 0;
  let totalDebitCents = 0;
  for (const r of summary.rows) {
    if (r.is_planned) continue; // KPIs reflect realized data only.
    if (r.type === "credit") totalCreditCents += r.total_cents;
    else totalDebitCents += Math.abs(r.total_cents);
  }
  const months = Math.max(1, summary.months.length);
  return {
    // Solde is the running balance across selected accounts; it does NOT
    // depend on the summary window (a true balance, not an avg).
    soldeCents,
    totalCreditCents,
    totalDebitCents,
    avgCreditCents: Math.round(totalCreditCents / months),
    avgDebitCents: Math.round(totalDebitCents / months),
  };
}

function selectedAccountsSoldeCents(accounts: Account[], selectedIds: number[]): number {
  // Empty selection means "all accounts" semantically (matches MultiSelect's
  // 'Tous' default), so we sum across the whole list in that case.
  const pool =
    selectedIds.length === 0
      ? accounts
      : accounts.filter((a) => selectedIds.includes(a.id));
  return pool.reduce((sum, a) => sum + a.current_balance_cents, 0);
}

function parseEurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s   ]/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function categoryOptions(
  cats: BilanFilterOptions["debit_categories"] | undefined,
  hasUncategorized: boolean | undefined,
): { value: number; label: string }[] {
  const list = cats?.map((c) => ({ value: c.id, label: c.name })) ?? [];
  if (hasUncategorized) list.push({ value: NO_CATEGORY_SENTINEL, label: t.common.noCategory });
  return list;
}

function shiftedTodayIso(monthOffset: number): string {
  // Current date with the month shifted by ``monthOffset``. Only the
  // year+month is meaningful for the bilan window; setMonth handles
  // year rollover automatically.
  const d = new Date();
  d.setMonth(d.getMonth() + monthOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function realIds(ids: number[]): number[] | null {
  const filtered = ids.filter((id) => id !== NO_CATEGORY_SENTINEL);
  return filtered.length ? filtered : null;
}

type ChartRow = { month: string; [key: string]: number | string };

type SlotMeta = {
  categoryName: string;
  valueEuros: number;
  isPlanned: boolean;
  fill: string;
};

type SlotSeries = {
  dataKey: string;
  type: "debit" | "credit";
  slot: number;
};

function BilanChart({
  summary,
  yMaxEuros,
  onBarClick,
}: {
  summary: BilanSummary | null;
  yMaxEuros: number | null;
  onBarClick: (target: { month: string; type: "debit" | "credit" }) => void;
}) {
  const [hovered, setHovered] = useState<{ month: string; type: "debit" | "credit" } | null>(
    null,
  );
  const hoveredStack = hovered?.type ?? null;
  const shaped = useMemo(() => shapeChartData(summary), [summary]);

  if (summary === null) {
    return <p className="text-sm text-muted-foreground">{t.common.loading}</p>;
  }
  if (shaped.series.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.bilan.empty}</p>;
  }

  return (
    <div
      className="border border-border rounded-md p-3"
    >
      <div className="h-[399px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={shaped.data}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
            barGap={0}
            barCategoryGap="14%"
            onMouseLeave={() => setHovered(null)}
          >
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={<MonthDiffTick diffByMonth={shaped.diffByMonth} />}
              height={40}
            />
            <YAxis
              tickFormatter={(v) => fmtEuros(v as number, { compact: true })}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={yMaxEuros !== null ? [0, yMaxEuros] : [0, "auto"]}
              allowDataOverflow
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.25, pointerEvents: "none" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || hoveredStack === null) return null;
                const month = String(label);
                const items = payload
                  .map((p) => {
                    const dk = String(p.dataKey);
                    const m = dk.match(/^s(\d+)_(debit|credit)$/);
                    if (!m || m[2] !== hoveredStack) return null;
                    const slot = parseInt(m[1], 10);
                    const meta = shaped.metaByMonthSlot.get(`${month}|${m[2]}|${slot}`);
                    const value = (p.value as number | undefined) ?? 0;
                    if (!meta || value <= 0) return null;
                    return {
                      meta,
                      value,
                      color: meta.fill,
                      key: `${month}|${m[2]}|${slot}`,
                    };
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null)
                  .sort((a, b) => a.value - b.value);
                if (items.length === 0) return null;
                return (
                  <div className="bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-md">
                    <p className="font-medium mb-1">
                      {formatMonth(month)}
                      {" — "}
                      <span
                        style={{
                          color:
                            hoveredStack === "credit"
                              ? "var(--credit)"
                              : "var(--debit)",
                        }}
                      >
                        {hoveredStack === "credit" ? t.bilan.credits : t.bilan.debits}
                      </span>
                    </p>
                    <ul className="space-y-0.5">
                      {items.map((it) => (
                        <li key={it.key} className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-sm"
                            style={{ background: it.color }}
                          />
                          <span className="text-muted-foreground">
                            {it.meta.categoryName}
                          </span>
                          <span className="ml-auto tabular-nums">
                            {fmtEuros(it.value)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }}
            />
            {/* One Bar per (slot, side). Credits first → LEFT of each
                month group; within a side, slot 0 sits at the bottom and
                holds that month's largest share. */}
            {shaped.series.map((s) => (
              <Bar
                key={s.dataKey}
                dataKey={s.dataKey}
                stackId={s.type}
                isAnimationActive={false}
              >
                {shaped.data.map((row, i) => {
                  const meta = shaped.metaByMonthSlot.get(
                    `${row.month}|${s.type}|${s.slot}`,
                  );
                  if (!meta) {
                    return <Cell key={i} fill="transparent" />;
                  }
                  const accent = s.type === "debit" ? "var(--debit)" : "var(--credit)";
                  const isHovered =
                    hovered !== null &&
                    hovered.month === row.month &&
                    hovered.type === s.type;
                  const stroke = isHovered
                    ? "var(--foreground)"
                    : meta.isPlanned
                      ? accent
                      : undefined;
                  const strokeWidth = isHovered ? 1.5 : meta.isPlanned ? 1.5 : 0;
                  const strokeOpacity = isHovered ? 0.85 : meta.isPlanned ? 0.7 : 0;
                  const strokeDasharray = isHovered
                    ? undefined
                    : meta.isPlanned
                      ? "4 3"
                      : undefined;
                  return (
                    <Cell
                      key={i}
                      fill={meta.fill}
                      stroke={stroke}
                      strokeOpacity={strokeOpacity}
                      strokeWidth={strokeWidth}
                      strokeDasharray={strokeDasharray}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() =>
                        setHovered({ month: row.month, type: s.type })
                      }
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => onBarClick({ month: row.month, type: s.type })}
                      onMouseDown={() => onBarClick({ month: row.month, type: s.type })}
                    />
                  );
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MonthDiffTick({
  diffByMonth,
  ...props
}: {
  diffByMonth: Map<string, number>;
  // recharts injects these; we don't model the full type.
  x?: number;
  y?: number;
  payload?: { value: string };
}) {
  const { x = 0, y = 0, payload } = props;
  const month = payload?.value ?? "";
  const diff = diffByMonth.get(month);
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        textAnchor="middle"
        dy={12}
        fill="var(--muted-foreground)"
        style={{ fontSize: 11 }}
      >
        {formatMonth(month)}
      </text>
      {diff !== undefined && (
        <text
          textAnchor="middle"
          dy={26}
          fill={diff >= 0 ? "var(--credit)" : "var(--debit)"}
          style={{ fontSize: 10, fontWeight: 500 }}
        >
          {(diff >= 0 ? "+" : "") + fmtEuros(diff, { compact: true })}
        </text>
      )}
    </g>
  );
}

function shapeChartData(summary: BilanSummary | null): {
  data: ChartRow[];
  series: SlotSeries[];
  metaByMonthSlot: Map<string, SlotMeta>;
  diffByMonth: Map<string, number>;
  monthTotals: Map<string, { debitEuros: number; creditEuros: number }>;
} {
  if (!summary) {
    return {
      data: [],
      series: [],
      metaByMonthSlot: new Map(),
      diffByMonth: new Map(),
      monthTotals: new Map(),
    };
  }

  type Entry = { name: string; valueEuros: number; isPlanned: boolean };
  const perMonth = new Map<string, { debit: Entry[]; credit: Entry[] }>();
  for (const m of summary.months) perMonth.set(m, { debit: [], credit: [] });

  // Planned rows are consolidated into a single "Attendues" block per month/type.
  const plannedTotals = new Map<string, number>(); // key: `${month}|${type}`
  for (const row of summary.rows) {
    const bucket = perMonth.get(row.month);
    if (!bucket) continue;
    if (row.is_planned) {
      const key = `${row.month}|${row.type}`;
      plannedTotals.set(key, (plannedTotals.get(key) ?? 0) + Math.abs(row.total_cents) / 100);
    } else {
      const list = row.type === "debit" ? bucket.debit : bucket.credit;
      list.push({
        name: row.category_name ?? t.common.noCategory,
        valueEuros: Math.abs(row.total_cents) / 100,
        isPlanned: false,
      });
    }
  }
  for (const [key, valueEuros] of plannedTotals) {
    const [month, type] = key.split("|") as [string, "debit" | "credit"];
    const bucket = perMonth.get(month);
    if (!bucket) continue;
    (type === "debit" ? bucket.debit : bucket.credit).push({
      name: t.bilan.attendues,
      valueEuros,
      isPlanned: true,
    });
  }

  let maxSlots = 0;
  for (const { debit, credit } of perMonth.values()) {
    maxSlots = Math.max(maxSlots, debit.length, credit.length);
  }

  const data: ChartRow[] = [];
  const metaByMonthSlot = new Map<string, SlotMeta>();
  const diffByMonth = new Map<string, number>();
  const monthTotals = new Map<string, { debitEuros: number; creditEuros: number }>();

  for (const month of summary.months) {
    const bucket = perMonth.get(month);
    const row: ChartRow = { month };
    let debitTotal = 0;
    let creditTotal = 0;

    if (bucket) {
      for (const side of ["debit", "credit"] as const) {
        // Sort each month's stack DESC so slot 0 (= bottom) holds the
        // biggest share for THAT month — order changes month over month.
        const entries = [...bucket[side]].sort((a, b) => b.valueEuros - a.valueEuros);
        const total = entries.length;
        entries.forEach((entry, slot) => {
          const dataKey = `s${slot}_${side}`;
          (row as Record<string, number | string>)[dataKey] = entry.valueEuros;
          metaByMonthSlot.set(`${month}|${side}|${slot}`, {
            categoryName: entry.name,
            valueEuros: entry.valueEuros,
            isPlanned: entry.isPlanned,
            fill: entry.isPlanned ? "transparent" : stackShade(side, slot, total),
          });
          if (side === "debit") debitTotal += entry.valueEuros;
          else creditTotal += entry.valueEuros;
        });
      }
    }

    data.push(row);
    diffByMonth.set(month, creditTotal - debitTotal);
    monthTotals.set(month, { debitEuros: debitTotal, creditEuros: creditTotal });
  }

  const series: SlotSeries[] = [];
  // CREDIT bars declared first → rendered on the LEFT of each month group.
  for (let s = 0; s < maxSlots; s++) {
    series.push({ dataKey: `s${s}_credit`, type: "credit", slot: s });
  }
  for (let s = 0; s < maxSlots; s++) {
    series.push({ dataKey: `s${s}_debit`, type: "debit", slot: s });
  }

  return { data, series, metaByMonthSlot, diffByMonth, monthTotals };
}

// Per-month slot shade. Slot 0 (bottom = largest share) is the LIGHTEST;
// the smallest slice on top is the DARKEST. Returns an oklch CSS color.
function stackShade(type: "debit" | "credit", slot: number, total: number): string {
  const hue = type === "debit" ? 25 : 150;
  const chroma = type === "debit" ? 0.2 : 0.16;
  const lightnessLow = 0.45; // darkest
  const lightnessHigh = 0.82; // lightest
  const t = total > 1 ? slot / (total - 1) : 0;
  // Slot 0 → high lightness; slot total-1 → low lightness.
  const L = lightnessHigh - (lightnessHigh - lightnessLow) * t;
  return `oklch(${L.toFixed(3)} ${chroma} ${hue})`;
}

function computeYMaxEuros(s: BilanSummary): number {
  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const r of s.rows) {
    const m = r.type === "debit" ? debit : credit;
    m.set(r.month, (m.get(r.month) ?? 0) + Math.abs(r.total_cents));
  }
  let max = 0;
  for (const v of debit.values()) max = Math.max(max, v);
  for (const v of credit.values()) max = Math.max(max, v);
  // Round up to a sensible multiple of 100€ for clean axis ticks.
  return Math.max(100, Math.ceil(max / 100 / 100) * 100);
}

// Chart values are euros (not cents) — multiply by 100 to use the shared helper.
function fmtEuros(value: number, opts?: { compact?: boolean }): string {
  return formatEuros(Math.round(value * 100), opts);
}

function formatError(e: unknown): string {
  return e instanceof RpcError ? e.message : String(e);
}
