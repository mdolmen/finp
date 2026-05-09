// Locale-aware formatters. Keep them isolated so the rest of the app
// passes raw cents/ISO dates and never re-implements formatting.

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const EUR_COMPACT = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEuros(cents: number, opts?: { compact?: boolean }): string {
  const value = cents / 100;
  return opts?.compact ? EUR_COMPACT.format(value) : EUR.format(value);
}

const DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(iso: string): string {
  // ISO YYYY-MM-DD → use UTC midnight to avoid TZ rollover.
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE.format(d);
}

const MONTH = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  year: "2-digit",
});

/** Accepts "YYYY-MM" and returns e.g. "janv. 25" (fr-FR) or "Jan 25" (en). */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || Number.isNaN(idx)) return ym;
  // Month is 1-based; construct a date in UTC to avoid timezone shifts.
  const d = new Date(Date.UTC(parseInt(y, 10), idx, 1));
  return MONTH.format(d);
}