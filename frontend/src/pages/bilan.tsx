import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { bilanApi, plannedApi, RpcError } from "@/lib/api";
import type {
  BilanFilterOptions,
  BilanSummary,
  PlannedOperation,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import { fr } from "@/i18n/fr";

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
  const [planned, setPlanned] = useState<PlannedOperation[]>([]);
  const [addPlannedOpen, setAddPlannedOpen] = useState(false);
  const [deletingPlanned, setDeletingPlanned] = useState<PlannedOperation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshPlanned = useCallback(async () => {
    try {
      setPlanned(await plannedApi.list());
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  // Load filter options + the unfiltered summary (for the y-scale lock).
  useEffect(() => {
    bilanApi
      .filterOptions()
      .then(setOptions)
      .catch((e) => setError(formatError(e)));
    bilanApi
      .summary({})
      .then((s) => setYMaxEuros(computeYMaxEuros(s)))
      .catch((e) => setError(formatError(e)));
    refreshPlanned();
  }, [refreshPlanned]);

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
    setAccountIds(options.accounts.map((a) => a.id));
    const debitAll = options.debit_categories.map((c) => c.id);
    if (options.debit_has_uncategorized) debitAll.push(NO_CATEGORY_SENTINEL);
    setDebitIds(debitAll);
    const creditAll = options.credit_categories.map((c) => c.id);
    if (options.credit_has_uncategorized) creditAll.push(NO_CATEGORY_SENTINEL);
    setCreditIds(creditAll);
  }, [options]);

  // Refetch the summary whenever filters change.
  useEffect(() => {
    if (!options) return; // wait until the initial defaults are applied
    const includeNoCatDebit = debitIds.includes(NO_CATEGORY_SENTINEL);
    const includeNoCatCredit = creditIds.includes(NO_CATEGORY_SENTINEL);
    bilanApi
      .summary({
        account_ids: accountIds.length ? accountIds : null,
        debit_category_ids: realIds(debitIds),
        credit_category_ids: realIds(creditIds),
        include_no_category_debit: includeNoCatDebit,
        include_no_category_credit: includeNoCatCredit,
      })
      .then(setSummary)
      .catch((e) => setError(formatError(e)));
  }, [accountIds, debitIds, creditIds, options]);

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold tracking-tight">{fr.bilan.title}</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <MultiSelect
          label={fr.bilan.filterAccounts}
          options={
            options?.accounts.map((a) => ({ value: a.id, label: a.name })) ?? []
          }
          selected={accountIds}
          onChange={setAccountIds}
        />
        <MultiSelect
          label={fr.bilan.filterDebits}
          options={categoryOptions(options?.debit_categories, options?.debit_has_uncategorized)}
          selected={debitIds}
          onChange={setDebitIds}
        />
        <MultiSelect
          label={fr.bilan.filterCredits}
          options={categoryOptions(options?.credit_categories, options?.credit_has_uncategorized)}
          selected={creditIds}
          onChange={setCreditIds}
        />
      </div>

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      <BilanChart summary={summary} yMaxEuros={yMaxEuros} />

      <div className="grid grid-cols-2 gap-4 mt-4">
        <KpiPanel summary={summary} />
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
            ? fr.bilan.plannedConfirmDelete.replace("{name}", deletingPlanned.libelle)
            : ""
        }
        confirmLabel={fr.common.delete}
        destructive
        onConfirm={handleDeletePlanned}
      />
    </div>
  );
}

function KpiPanel({ summary }: { summary: BilanSummary | null }) {
  const kpis = useMemo(() => computeKpis(summary), [summary]);
  const rows: { label: string; value: number; signed?: boolean }[] = [
    { label: fr.bilan.kpiSolde, value: kpis.soldeCents, signed: true },
    { label: fr.bilan.kpiAvgCredits, value: kpis.avgCreditCents },
    { label: fr.bilan.kpiAvgDebits, value: kpis.avgDebitCents },
    { label: fr.bilan.kpiTotalCredits, value: kpis.totalCreditCents },
    { label: fr.bilan.kpiTotalDebits, value: kpis.totalDebitCents },
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
        {(signed && value > 0 ? "+" : "") + formatEurosFromCents(value)}
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
          {fr.bilan.plannedTitle}
        </h2>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="size-3.5" />
          {fr.common.add}
        </Button>
      </div>
      {planned.length === 0 ? (
        <p className="text-sm text-muted-foreground">{fr.bilan.plannedEmpty}</p>
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
                {formatEurosFromCents(p.montant_cents)}
              </span>
              <span className="flex-1 truncate" title={p.libelle}>
                {p.libelle}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(p)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={fr.common.delete}
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fr.bilan.plannedAddTitle}</DialogTitle>
          <DialogDescription>{fr.bilan.plannedAddDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{fr.bilan.plannedFieldDate}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{fr.bilan.plannedFieldMontant}</Label>
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
            <Label className="text-xs">{fr.bilan.plannedFieldLibelle}</Label>
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
              {fr.common.cancel}
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {fr.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function computeKpis(summary: BilanSummary | null): {
  soldeCents: number;
  totalCreditCents: number;
  totalDebitCents: number;
  avgCreditCents: number;
  avgDebitCents: number;
} {
  if (!summary) {
    return {
      soldeCents: 0,
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
    soldeCents: totalCreditCents - totalDebitCents,
    totalCreditCents,
    totalDebitCents,
    avgCreditCents: Math.round(totalCreditCents / months),
    avgDebitCents: Math.round(totalDebitCents / months),
  };
}

const EUR_FMT_CENTS = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

function formatEurosFromCents(cents: number): string {
  return EUR_FMT_CENTS.format(cents / 100);
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
  if (hasUncategorized) list.push({ value: NO_CATEGORY_SENTINEL, label: fr.common.noCategory });
  return list;
}

function realIds(ids: number[]): number[] | null {
  const filtered = ids.filter((id) => id !== NO_CATEGORY_SENTINEL);
  return filtered.length ? filtered : null;
}

type ChartRow = { month: string; [key: string]: number | string };

type BarSeries = {
  key: string;
  categoryName: string;
  type: "debit" | "credit";
  totalCents: number; // total over the whole window — used for sort + shade rank
  isPlanned: boolean;
};

function BilanChart({
  summary,
  yMaxEuros,
}: {
  summary: BilanSummary | null;
  yMaxEuros: number | null;
}) {
  const [hoveredStack, setHoveredStack] = useState<"debit" | "credit" | null>(null);
  const shaped = useMemo(() => shapeChartData(summary), [summary]);

  if (summary === null) {
    return <p className="text-sm text-muted-foreground">{fr.common.loading}</p>;
  }
  if (shaped.series.length === 0) {
    return <p className="text-sm text-muted-foreground">{fr.bilan.empty}</p>;
  }

  const debitCount = shaped.series.filter((s) => s.type === "debit").length;
  const creditCount = shaped.series.filter((s) => s.type === "credit").length;

  return (
    <div className="border border-border rounded-md p-3">
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={shaped.data}
            margin={{ top: 8, right: 12, left: 0, bottom: 24 }}
            barGap={0}
            barCategoryGap="14%"
          >
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={
                <MonthDiffTick diffByMonth={shaped.diffByMonth} />
              }
              height={48}
            />
            <YAxis
              tickFormatter={(v) => formatEuros(v as number, { compact: true })}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={yMaxEuros !== null ? [0, yMaxEuros] : [0, "auto"]}
              allowDataOverflow
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.25 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || hoveredStack === null) return null;
                const items = payload
                  .map((p) => {
                    const series = shaped.series.find((s) => s.key === p.dataKey);
                    return series && series.type === hoveredStack
                      ? { series, value: p.value as number, color: p.color }
                      : null;
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null && x.value > 0)
                  .sort((a, b) => a.value - b.value);
                if (items.length === 0) return null;
                return (
                  <div className="bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-md">
                    <p className="font-medium mb-1">
                      {formatMonth(String(label))}
                      {" — "}
                      <span
                        style={{
                          color:
                            hoveredStack === "credit"
                              ? "var(--credit)"
                              : "var(--debit)",
                        }}
                      >
                        {hoveredStack === "credit" ? fr.bilan.credits : fr.bilan.debits}
                      </span>
                    </p>
                    <ul className="space-y-0.5">
                      {items.map((it) => (
                        <li key={it.series.key} className="flex items-center gap-2">
                          <span
                            className="size-2 rounded-sm"
                            style={{ background: it.color }}
                          />
                          <span className="text-muted-foreground">
                            {it.series.categoryName}
                          </span>
                          <span className="ml-auto tabular-nums">
                            {formatEuros(it.value)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              }}
            />
            {/* Render credit bars FIRST so they appear on the LEFT of each
                month group; debits FIRST inside each stack so the largest
                magnitudes (sorted desc) anchor the bottom of the column. */}
            {shaped.series.map((s) => {
              const rank = s.type === "debit"
                ? shaped.series
                    .filter((x) => x.type === "debit")
                    .findIndex((x) => x.key === s.key)
                : shaped.series
                    .filter((x) => x.type === "credit")
                    .findIndex((x) => x.key === s.key);
              const total = s.type === "debit" ? debitCount : creditCount;
              const fill = s.isPlanned ? "transparent" : stackShade(s.type, rank, total);
              const dimmed = hoveredStack !== null && hoveredStack !== s.type;
              const accentStroke =
                s.type === "debit" ? "var(--debit)" : "var(--credit)";
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId={s.type}
                  fill={fill}
                  fillOpacity={dimmed ? 0.3 : 1}
                  stroke={s.isPlanned ? accentStroke : hoveredStack === s.type ? "var(--foreground)" : undefined}
                  strokeOpacity={s.isPlanned ? 0.7 : hoveredStack === s.type ? 0.25 : 0}
                  strokeWidth={s.isPlanned ? 1.5 : hoveredStack === s.type ? 1 : 0}
                  strokeDasharray={s.isPlanned ? "4 3" : undefined}
                  onMouseEnter={() => setHoveredStack(s.type)}
                  onMouseLeave={() => setHoveredStack(null)}
                  isAnimationActive={false}
                />
              );
            })}
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
          dy={28}
          fill={diff >= 0 ? "var(--credit)" : "var(--debit)"}
          style={{ fontSize: 10, fontWeight: 500 }}
        >
          {(diff >= 0 ? "+" : "") + formatEuros(diff, { compact: true })}
        </text>
      )}
    </g>
  );
}

function shapeChartData(summary: BilanSummary | null): {
  data: ChartRow[];
  series: BarSeries[];
  diffByMonth: Map<string, number>;
} {
  if (!summary) return { data: [], series: [], diffByMonth: new Map() };
  const rows: ChartRow[] = summary.months.map((m) => ({ month: m }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));

  const debitSeen = new Map<string, BarSeries>();
  const creditSeen = new Map<string, BarSeries>();
  // For the per-month diff line under each tick.
  const debitTotalByMonth = new Map<string, number>();
  const creditTotalByMonth = new Map<string, number>();

  for (const row of summary.rows) {
    // Planned ops collapse into a single 'planned' series per side; real
    // categories key off (type, category_id) as before.
    const idKey = row.is_planned ? "planned" : (row.category_id ?? "none");
    const key = `${row.type}_${idKey}`;
    const map = row.type === "debit" ? debitSeen : creditSeen;
    let series = map.get(key);
    if (!series) {
      series = {
        key,
        categoryName: row.category_name ?? fr.common.noCategory,
        type: row.type,
        totalCents: 0,
        isPlanned: row.is_planned,
      };
      map.set(key, series);
    }
    const abs = Math.abs(row.total_cents);
    series.totalCents += abs;
    const target = byMonth.get(row.month);
    if (target) target[key] = abs / 100;
    if (row.type === "debit") {
      debitTotalByMonth.set(row.month, (debitTotalByMonth.get(row.month) ?? 0) + abs);
    } else {
      creditTotalByMonth.set(row.month, (creditTotalByMonth.get(row.month) ?? 0) + abs);
    }
  }

  // Sort each side by total magnitude DESC. With recharts, the first <Bar>
  // declared lands at the bottom of the stack — so the biggest categories
  // anchor the bottom (and get the darkest shade via stackShade()).
  const sortByMagnitude = (m: Map<string, BarSeries>) =>
    [...m.values()].sort((a, b) => b.totalCents - a.totalCents);

  const diffByMonth = new Map<string, number>();
  for (const m of summary.months) {
    const d = debitTotalByMonth.get(m) ?? 0;
    const c = creditTotalByMonth.get(m) ?? 0;
    diffByMonth.set(m, (c - d) / 100);
  }

  return {
    data: rows,
    // Credits first → rendered on the LEFT side of each month group.
    series: [...sortByMagnitude(creditSeen), ...sortByMagnitude(debitSeen)],
    diffByMonth,
  };
}

// Programmatic shade: rank 0 (largest magnitude → bottom of stack) is darkest;
// the lightest shade is reserved for the smallest. Returns an oklch CSS color.
function stackShade(type: "debit" | "credit", rank: number, total: number): string {
  const hue = type === "debit" ? 25 : 150;
  const chroma = type === "debit" ? 0.2 : 0.16;
  const lightnessLow = 0.42; // darkest
  const lightnessHigh = 0.78; // lightest
  const t = total > 1 ? rank / (total - 1) : 0;
  const L = lightnessLow + (lightnessHigh - lightnessLow) * t;
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

const MONTH_NAMES_FR = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES_FR[idx] ?? m} ${y.slice(2)}`;
}

const EUR_FMT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const EUR_FMT_FULL = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

// Local helper — values inside BilanChart are euros, not cents.
function formatEuros(value: number, opts?: { compact?: boolean }): string {
  return opts?.compact ? EUR_FMT.format(value) : EUR_FMT_FULL.format(value);
}

function formatError(e: unknown): string {
  return e instanceof RpcError ? e.message : String(e);
}
