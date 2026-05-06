import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bilanApi, RpcError } from "@/lib/api";
import type { BilanFilterOptions, BilanSummary } from "@/lib/api";
import { MultiSelect } from "@/components/MultiSelect";
import { fr } from "@/i18n/fr";

const NO_CATEGORY_SENTINEL = -1 as const;

export function BilanPage() {
  const [options, setOptions] = useState<BilanFilterOptions | null>(null);
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [debitIds, setDebitIds] = useState<number[]>([]);
  const [creditIds, setCreditIds] = useState<number[]>([]);
  const [summary, setSummary] = useState<BilanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load filter options once.
  useEffect(() => {
    bilanApi
      .filterOptions()
      .then(setOptions)
      .catch((e) => setError(formatError(e)));
  }, []);

  // Refetch the summary whenever filters change.
  useEffect(() => {
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
  }, [accountIds, debitIds, creditIds]);

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

      <BilanChart summary={summary} />
    </div>
  );
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
};

function BilanChart({ summary }: { summary: BilanSummary | null }) {
  const shaped = useMemo(() => shapeChartData(summary), [summary]);

  if (summary === null) {
    return <p className="text-sm text-muted-foreground">{fr.common.loading}</p>;
  }
  if (shaped.series.length === 0) {
    return <p className="text-sm text-muted-foreground">{fr.bilan.empty}</p>;
  }

  return (
    <div className="border border-border rounded-md p-3">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={shaped.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              tickFormatter={(v) => formatEuros(v as number, { compact: true })}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ fill: "var(--accent)", opacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-popover border border-border rounded-md px-3 py-2 text-xs shadow-md">
                    <p className="font-medium mb-1">{formatMonth(String(label))}</p>
                    <ul className="space-y-0.5">
                      {payload.map((p) => {
                        const series = shaped.series.find((s) => s.key === p.dataKey);
                        if (!series) return null;
                        return (
                          <li key={String(p.dataKey)} className="flex items-center gap-2">
                            <span
                              className="size-2 rounded-sm"
                              style={{ background: p.color }}
                            />
                            <span className="text-muted-foreground">
                              {series.categoryName}
                            </span>
                            <span className="ml-auto tabular-nums">
                              {formatEuros(p.value as number)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              }}
            />
            {shaped.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId={s.type}
                fill={
                  s.type === "debit"
                    ? i % 2 === 0
                      ? "var(--debit)"
                      : "var(--debit-soft)"
                    : i % 2 === 0
                      ? "var(--credit)"
                      : "var(--credit-soft)"
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function shapeChartData(summary: BilanSummary | null): {
  data: ChartRow[];
  series: BarSeries[];
} {
  if (!summary) return { data: [], series: [] };
  const rows: ChartRow[] = summary.months.map((m) => ({ month: m }));
  const byMonth = new Map(rows.map((r) => [r.month, r]));

  // Track unique series per type, ordered alphabetically (Sans catégorie last).
  const debitSeen = new Map<string, BarSeries>();
  const creditSeen = new Map<string, BarSeries>();

  for (const row of summary.rows) {
    const idKey = row.category_id ?? "none";
    const key = `${row.type}_${idKey}`;
    const map = row.type === "debit" ? debitSeen : creditSeen;
    if (!map.has(key)) {
      map.set(key, {
        key,
        categoryName: row.category_name ?? fr.common.noCategory,
        type: row.type,
      });
    }
    const target = byMonth.get(row.month);
    if (target) target[key] = Math.abs(row.total_cents) / 100;
  }

  const sortSeries = (m: Map<string, BarSeries>) =>
    [...m.values()].sort((a, b) => {
      const aIsNone = a.categoryName === fr.common.noCategory;
      const bIsNone = b.categoryName === fr.common.noCategory;
      if (aIsNone !== bIsNone) return aIsNone ? 1 : -1;
      return a.categoryName.localeCompare(b.categoryName, "fr");
    });

  return {
    data: rows,
    series: [...sortSeries(debitSeen), ...sortSeries(creditSeen)],
  };
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

function formatEuros(value: number, opts?: { compact?: boolean }): string {
  return opts?.compact ? EUR_FMT.format(value) : EUR_FMT_FULL.format(value);
}

function formatError(e: unknown): string {
  return e instanceof RpcError ? e.message : String(e);
}
