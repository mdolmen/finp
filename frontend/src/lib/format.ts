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
