// Parsing helpers for CSV ingestion.
//
// Banks export amounts and dates in inconsistent formats; the user picks the
// right pattern in the mapping UI and these helpers normalize each row to
// what the backend expects: date as ISO YYYY-MM-DD, montant as integer cents.

export type DateFormat = "iso" | "dmy_slash" | "mdy_slash";
export type DecimalSeparator = "." | ",";
export type Charset =
  | "utf-8"
  | "windows-1252"
  | "iso-8859-1"
  | "iso-8859-15"
  | "iso-8859-3";

export type MontantMode = "single" | "split";

type BaseMapping = {
  charset: Charset;
  delimiter: "," | ";" | "\t";
  has_header: true;
  date_column: string;
  date_format: DateFormat;
  montant_decimal: DecimalSeparator;
  libelle_column: string;
  balance_column?: string;
};

export type CsvMapping =
  | (BaseMapping & { montant_mode: "single"; montant_column: string })
  | (BaseMapping & {
      montant_mode: "split";
      debit_column: string;
      credit_column: string;
    });

export function decodeBuffer(buffer: ArrayBuffer, charset: Charset): string {
  return new TextDecoder(charset, { fatal: false }).decode(buffer);
}

export function parseDate(input: string, format: DateFormat): string {
  const s = input.trim();
  let y: string, m: string, d: string;

  if (format === "iso") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!match) throw new Error(`date "${input}" ne correspond pas à AAAA-MM-JJ`);
    [, y, m, d] = match;
  } else {
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
    if (!match) throw new Error(`date "${input}" attendue au format JJ/MM/AAAA`);
    if (format === "dmy_slash") {
      [, d, m, y] = match;
    } else {
      [, m, d, y] = match;
    }
  }

  const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`date "${input}" invalide`);
  }
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseMontantCents(input: string, decimal: DecimalSeparator): number {
  // Strip ASCII spaces, NBSP (U+00A0), narrow NBSP (U+202F), thin space (U+2009).
  // eslint-disable-next-line no-irregular-whitespace
  const cleaned = input.replace(/[    ]/g, "");
  if (!cleaned) throw new Error("montant vide");

  const thousands = decimal === "," ? "." : ",";
  const normalized = cleaned.split(thousands).join("").replace(decimal, ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`montant "${input}" invalide`);
  }
  return Math.round(value * 100);
}

export type RawRow = Record<string, string>;

export type NormalizedRow = {
  date: string;
  montant_cents: number;
  libelle: string;
  balance_cents?: number;
};

export type RowConversion =
  | { ok: true; row: NormalizedRow }
  | { ok: false; index: number; reason: string };

function montantFromRow(raw: RawRow, mapping: CsvMapping): number {
  if (mapping.montant_mode === "single") {
    return parseMontantCents(raw[mapping.montant_column] ?? "", mapping.montant_decimal);
  }
  const debit = (raw[mapping.debit_column] ?? "").trim();
  const credit = (raw[mapping.credit_column] ?? "").trim();
  if (debit && credit) throw new Error("débit et crédit tous deux renseignés");
  if (!debit && !credit) throw new Error("débit et crédit tous deux vides");
  if (debit) return -Math.abs(parseMontantCents(debit, mapping.montant_decimal));
  return Math.abs(parseMontantCents(credit, mapping.montant_decimal));
}

export function convertRows(rows: RawRow[], mapping: CsvMapping): RowConversion[] {
  return rows.map((raw, index) => {
    try {
      const date = parseDate(raw[mapping.date_column] ?? "", mapping.date_format);
      const montant_cents = montantFromRow(raw, mapping);
      const libelle = (raw[mapping.libelle_column] ?? "").trim();
      if (!libelle) throw new Error("libellé vide");
      const balance_cents =
        mapping.balance_column
          ? parseMontantCents(raw[mapping.balance_column] ?? "", mapping.montant_decimal)
          : undefined;
      return { ok: true as const, row: { date, montant_cents, libelle, balance_cents } };
    } catch (e) {
      return {
        ok: false as const,
        index,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
  });
}
