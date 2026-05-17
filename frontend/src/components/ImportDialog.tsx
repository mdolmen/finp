import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountsApi, importsApi, RpcError } from "@/lib/api";
import type { Account, IngestResult } from "@/lib/api";
import { convertRows, decodeBuffer } from "@/lib/csv";
import type {
  Charset,
  CsvMapping,
  DateFormat,
  DecimalSeparator,
  MontantMode,
  RawRow,
} from "@/lib/csv";
import { t } from "@/i18n";

type Step =
  | { kind: "pick" }
  | {
      kind: "mapping";
      filename: string;
      buffer: ArrayBuffer;
      saved: Partial<CsvMapping>;
    }
  | {
      // Conversion has run; the user reviews counts and failures before any
      // database write.
      kind: "preview";
      filename: string;
      buffer: ArrayBuffer;
      mapping: CsvMapping;
      validRows: { date: string; montant_cents: number; libelle: string }[];
      failedReasons: string[];
      failedTotal: number;
    }
  | {
      kind: "done";
      result: IngestResult;
      failed: number;
      failedReasons: string[];
      // Preserved so the Retour button can re-enter the mapping step with
      // the same file already loaded — useful when some rows failed.
      filename: string;
      buffer: ArrayBuffer;
      saved: Partial<CsvMapping>;
    };

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "iso", label: "AAAA-MM-JJ" },
  { value: "dmy_slash", label: "JJ/MM/AAAA" },
  { value: "mdy_slash", label: "MM/JJ/AAAA" },
];

const DECIMAL_OPTIONS: { value: DecimalSeparator; label: string }[] = [
  { value: ",", label: ", (virgule)" },
  { value: ".", label: ". (point)" },
];

const CHARSET_OPTIONS: { value: Charset; label: string }[] = [
  { value: "utf-8", label: "UTF-8" },
  { value: "windows-1252", label: "Windows-1252" },
  { value: "iso-8859-1", label: "ISO-8859-1 (Latin-1)" },
  { value: "iso-8859-15", label: "ISO-8859-15 (Latin-9)" },
  { value: "iso-8859-3", label: "ISO-8859-3 (Latin-3)" },
];

const DELIMITER_OPTIONS: { value: "," | ";" | "\t"; label: string }[] = [
  { value: ",", label: ", (virgule)" },
  { value: ";", label: "; (point-virgule)" },
  { value: "\t", label: "↹ (tabulation)" },
];

const MONTANT_MODE_OPTIONS: { value: MontantMode; label: string }[] = [
  { value: "single", label: "Une colonne signée" },
  { value: "split", label: "Deux colonnes (débit / crédit)" },
];

export function ImportDialog({
  account,
  open,
  onOpenChange,
  onImported,
}: {
  account: Account;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep({ kind: "pick" });
      setError(null);
    }
  }, [open]);

  async function handleFile(file: File) {
    setError(null);
    const buffer = await file.arrayBuffer();
    const saved = (account.csv_mapping ?? {}) as Partial<CsvMapping>;
    setStep({ kind: "mapping", filename: file.name, buffer, saved });
  }

  function handleValidate(mapping: CsvMapping, rows: RawRow[]): string | null {
    if (step.kind !== "mapping") return null;
    setError(null);
    const conversions = convertRows(rows, mapping);
    const ok = conversions.flatMap((c) => (c.ok ? [c.row] : []));
    const failedReasons = conversions
      .flatMap((c) => (c.ok ? [] : [`L${c.index + 2} : ${c.reason}`]))
      .slice(0, 5);

    if (ok.length === 0) {
      return "Aucune ligne valide à importer. Vérifiez le mappage.";
    }

    setStep({
      kind: "preview",
      filename: step.filename,
      buffer: step.buffer,
      mapping,
      validRows: ok,
      failedReasons,
      failedTotal: conversions.length - ok.length,
    });
    return null;
  }

  async function handleConfirmIngest(): Promise<string | null> {
    if (step.kind !== "preview") return null;
    try {
      const result = await importsApi.ingest({
        account_id: account.id,
        rows: step.validRows,
      });
      await accountsApi.setCsvMapping(
        account.id,
        step.mapping as Record<string, unknown>,
      );
      setStep({
        kind: "done",
        result,
        failed: step.failedTotal,
        failedReasons: step.failedReasons,
        filename: step.filename,
        buffer: step.buffer,
        // Preserve the just-used mapping so the Retour path opens with it
        // pre-filled rather than reverting to the older saved mapping.
        saved: step.mapping,
      });
      onImported();
      return null;
    } catch (e) {
      return e instanceof RpcError ? e.message : String(e);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{t.import.title.replace("{name}", account.name)}</DialogTitle>
          <DialogDescription>{t.import.description}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {step.kind === "pick" && <PickStep onFile={handleFile} />}

        {step.kind === "mapping" && (
          <MappingStep
            filename={step.filename}
            buffer={step.buffer}
            saved={step.saved}
            onCancel={() => setStep({ kind: "pick" })}
            onValidate={handleValidate}
          />
        )}

        {step.kind === "preview" && (
          <PreviewStep
            filename={step.filename}
            validCount={step.validRows.length}
            failedTotal={step.failedTotal}
            failedReasons={step.failedReasons}
            onBack={() =>
              setStep({
                kind: "mapping",
                filename: step.filename,
                buffer: step.buffer,
                saved: step.mapping,
              })
            }
            onConfirm={handleConfirmIngest}
          />
        )}

        {step.kind === "done" && (
          <DoneStep
            result={step.result}
            failed={step.failed}
            failedReasons={step.failedReasons}
            onBack={() =>
              setStep({
                kind: "mapping",
                filename: step.filename,
                buffer: step.buffer,
                saved: step.saved,
              })
            }
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickStep({ onFile }: { onFile: (f: File) => void }) {
  return (
    <label className="flex flex-col items-center gap-2 py-8 border-2 border-dashed border-border rounded-md cursor-pointer hover:bg-accent/40">
      <Upload className="size-5 text-muted-foreground" />
      <span className="text-sm">{t.import.pickFile}</span>
      <input
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function MappingStep({
  filename,
  buffer,
  saved,
  onCancel,
  onValidate,
}: {
  filename: string;
  buffer: ArrayBuffer;
  saved: Partial<CsvMapping>;
  onCancel: () => void;
  onValidate: (mapping: CsvMapping, rows: RawRow[]) => string | null;
}) {
  // The discriminated union lets the rest of the app reason about modes
  // safely; for initialisation here we read whichever branch the saved blob
  // happens to be on (older mappings predate the mode flag — default to single).
  const savedAny = saved as Partial<{
    charset: Charset;
    delimiter: "," | ";" | "\t";
    date_column: string;
    date_format: DateFormat;
    montant_decimal: DecimalSeparator;
    libelle_column: string;
    montant_mode: MontantMode;
    montant_column: string;
    debit_column: string;
    credit_column: string;
  }>;

  const [charset, setCharset] = useState<Charset>(savedAny.charset ?? "utf-8");
  const [delimiter, setDelimiter] = useState<"," | ";" | "\t">(savedAny.delimiter ?? ",");
  const [dateFormat, setDateFormat] = useState<DateFormat>(savedAny.date_format ?? "dmy_slash");
  const [decimal, setDecimal] = useState<DecimalSeparator>(savedAny.montant_decimal ?? ",");
  const [dateColumn, setDateColumn] = useState(savedAny.date_column ?? "");
  const [libelleColumn, setLibelleColumn] = useState(savedAny.libelle_column ?? "");
  const [montantMode, setMontantMode] = useState<MontantMode>(savedAny.montant_mode ?? "single");
  const [montantColumn, setMontantColumn] = useState(savedAny.montant_column ?? "");
  const [debitColumn, setDebitColumn] = useState(savedAny.debit_column ?? "");
  const [creditColumn, setCreditColumn] = useState(savedAny.credit_column ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Re-decode + re-parse whenever the buffer, charset, or delimiter changes.
  // Auto-detect delimiter on first load if not pre-saved.
  const parsed = useMemo(() => {
    const text = decodeBuffer(buffer, charset);
    const effective = saved.delimiter ? delimiter : guessDelimiter(text);
    const result = Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: effective,
    });
    return {
      rows: result.data,
      columns: result.meta.fields ?? [],
      effectiveDelimiter: effective,
      errors: result.errors,
    };
  }, [buffer, charset, delimiter, saved.delimiter]);

  // Sync the auto-guessed delimiter into local state on first parse.
  useEffect(() => {
    if (!saved.delimiter && parsed.effectiveDelimiter !== delimiter) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDelimiter(parsed.effectiveDelimiter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.effectiveDelimiter]);

  // Initialize column picks from the first columns once they appear,
  // unless the user already chose (or a saved mapping exists).
  useEffect(() => {
    const cols = parsed.columns;
    if (cols.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!dateColumn || !cols.includes(dateColumn)) setDateColumn(cols[0] ?? "");
    if (!libelleColumn || !cols.includes(libelleColumn)) {
      setLibelleColumn(cols[2] ?? cols[0] ?? "");
    }
    if (montantMode === "single") {
      if (!montantColumn || !cols.includes(montantColumn)) {
        setMontantColumn(cols[1] ?? cols[0] ?? "");
      }
    } else {
      if (!debitColumn || !cols.includes(debitColumn)) setDebitColumn(cols[1] ?? "");
      if (!creditColumn || !cols.includes(creditColumn)) setCreditColumn(cols[2] ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.columns, montantMode]);

  const preview = useMemo(() => parsed.rows.slice(0, 5), [parsed.rows]);

  const montantValid =
    montantMode === "single"
      ? !!montantColumn && parsed.columns.includes(montantColumn)
      : !!debitColumn &&
        !!creditColumn &&
        debitColumn !== creditColumn &&
        parsed.columns.includes(debitColumn) &&
        parsed.columns.includes(creditColumn);

  const valid =
    !!dateColumn &&
    !!libelleColumn &&
    parsed.columns.includes(dateColumn) &&
    parsed.columns.includes(libelleColumn) &&
    montantValid;

  function buildMapping(): CsvMapping {
    const base = {
      charset,
      delimiter,
      has_header: true as const,
      date_column: dateColumn,
      date_format: dateFormat,
      montant_decimal: decimal,
      libelle_column: libelleColumn,
    };
    return montantMode === "single"
      ? { ...base, montant_mode: "single", montant_column: montantColumn }
      : {
          ...base,
          montant_mode: "split",
          debit_column: debitColumn,
          credit_column: creditColumn,
        };
  }

  function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setLocalError(null);
    const err = onValidate(buildMapping(), parsed.rows);
    setSubmitting(false);
    if (err) setLocalError(err);
  }

  return (
    <div className="space-y-4 min-w-0">
      <p className="text-xs text-muted-foreground">
        {t.import.fileLabel}: <span className="font-mono">{filename}</span>
        {" · "}
        {parsed.rows.length} {t.import.rowsCount}
        {parsed.errors.length > 0 && (
          <>
            {" · "}
            <span className="text-destructive">
              {parsed.errors.length} erreur(s) de lecture
            </span>
          </>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label={t.import.fieldCharset}
          value={charset}
          options={CHARSET_OPTIONS}
          onChange={(v) => setCharset(v as Charset)}
        />
        <SelectField
          label={t.import.fieldDelimiter}
          value={delimiter}
          options={DELIMITER_OPTIONS}
          onChange={(v) => setDelimiter(v as "," | ";" | "\t")}
        />
        <ColumnPicker
          label={t.import.fieldDate}
          value={dateColumn}
          columns={parsed.columns}
          onChange={setDateColumn}
        />
        <SelectField
          label={t.import.fieldDateFormat}
          value={dateFormat}
          options={DATE_FORMATS}
          onChange={(v) => setDateFormat(v as DateFormat)}
        />
        <SelectField
          label={t.import.fieldMontantMode}
          value={montantMode}
          options={MONTANT_MODE_OPTIONS}
          onChange={(v) => setMontantMode(v as MontantMode)}
        />
        <SelectField
          label={t.import.fieldDecimal}
          value={decimal}
          options={DECIMAL_OPTIONS}
          onChange={(v) => setDecimal(v as DecimalSeparator)}
        />
        {montantMode === "single" ? (
          <ColumnPicker
            label={t.import.fieldMontant}
            value={montantColumn}
            columns={parsed.columns}
            onChange={setMontantColumn}
          />
        ) : (
          <>
            <ColumnPicker
              label={t.import.fieldDebit}
              value={debitColumn}
              columns={parsed.columns}
              onChange={setDebitColumn}
            />
            <ColumnPicker
              label={t.import.fieldCredit}
              value={creditColumn}
              columns={parsed.columns}
              onChange={setCreditColumn}
            />
          </>
        )}
        <ColumnPicker
          label={t.import.fieldLibelle}
          value={libelleColumn}
          columns={parsed.columns}
          onChange={setLibelleColumn}
        />
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/40 border-b border-border">
          {t.import.preview}
        </div>
        <div className="overflow-x-auto max-w-full">
          <table className="text-xs">
            <thead>
              <tr className="border-b border-border">
                {parsed.columns.map((c) => (
                  <th
                    key={c}
                    className="text-left font-medium px-3 py-1.5 whitespace-nowrap"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {parsed.columns.map((c) => (
                    <td
                      key={c}
                      className="px-3 py-1 whitespace-nowrap text-muted-foreground"
                    >
                      {row[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {localError && <p className="text-sm text-destructive">{localError}</p>}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          {t.common.cancel}
        </Button>
        <Button type="button" onClick={submit} disabled={!valid || submitting}>
          {t.import.validate}
        </Button>
      </DialogFooter>
    </div>
  );
}

function DoneStep({
  result,
  failed,
  failedReasons,
  onBack,
  onClose,
}: {
  result: IngestResult;
  failed: number;
  failedReasons: string[];
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <ul className="text-sm space-y-1">
        <li>
          <span className="text-muted-foreground">{t.import.imported}</span>{" "}
          <span className="font-semibold">{result.imported}</span>
        </li>
        <li>
          <span className="text-muted-foreground">{t.import.skipped}</span>{" "}
          <span className="font-semibold">{result.skipped}</span>
        </li>
        {failed > 0 && (
          <li className="text-destructive">
            {t.import.failed}: <span className="font-semibold">{failed}</span>
          </li>
        )}
        <li>
          <span className="text-muted-foreground">{t.import.ruleAssigned}</span>{" "}
          <span className="font-semibold">{result.rule_assigned}</span>
        </li>
      </ul>
      {failedReasons.length > 0 && (
        <ul className="text-xs text-muted-foreground border-l-2 border-destructive/40 pl-3 space-y-0.5">
          {failedReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {(result.skipped_existing ?? []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {t.import.skippedExistingHeader}
          </p>
          <div className="border border-border rounded-md overflow-hidden">
            <div className="overflow-x-auto max-w-full">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left font-medium px-3 py-1.5 whitespace-nowrap">
                      Date
                    </th>
                    <th className="text-right font-medium px-3 py-1.5 whitespace-nowrap">
                      Montant
                    </th>
                    <th className="text-left font-medium px-3 py-1.5">Libellé</th>
                  </tr>
                </thead>
                <tbody>
                  {(result.skipped_existing ?? []).map((op) => (
                    <tr key={op.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-1 whitespace-nowrap text-muted-foreground">
                        {op.date}
                      </td>
                      <td className="px-3 py-1 whitespace-nowrap text-muted-foreground text-right tabular-nums">
                        {(op.montant_cents / 100).toFixed(2)}
                      </td>
                      <td className="px-3 py-1 text-muted-foreground">
                        {op.libelle}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <DialogFooter>
        {failed > 0 && (
          <Button type="button" variant="ghost" onClick={onBack}>
            {t.common.back}
          </Button>
        )}
        <Button onClick={onClose}>{t.common.close}</Button>
      </DialogFooter>
    </div>
  );
}

function PreviewStep({
  filename,
  validCount,
  failedTotal,
  failedReasons,
  onBack,
  onConfirm,
}: {
  filename: string;
  validCount: number;
  failedTotal: number;
  failedReasons: string[];
  onBack: () => void;
  onConfirm: () => Promise<string | null>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const err = await onConfirm();
    if (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t.import.fileLabel}: <span className="font-mono">{filename}</span>
      </p>
      <div className="text-sm">
        <p>
          <span className="font-semibold">{validCount}</span>{" "}
          <span className="text-muted-foreground">{t.import.confirmCount}</span>
        </p>
        {failedTotal > 0 && (
          <p className="mt-1 text-destructive">
            <span className="font-semibold">{failedTotal}</span>{" "}
            {t.import.confirmFailedHeader}
          </p>
        )}
      </div>
      {failedReasons.length > 0 && (
        <ul className="text-xs text-muted-foreground border-l-2 border-destructive/40 pl-3 space-y-0.5">
          {failedReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          {t.common.back}
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={submitting}>
          {submitting ? t.common.loading : t.import.run}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ColumnPicker({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function guessDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.slice(0, 1000);
  const counts = {
    "\t": sample.match(/\t/g)?.length ?? 0,
    ";": sample.match(/;/g)?.length ?? 0,
    ",": sample.match(/,/g)?.length ?? 0,
  };
  return (Object.entries(counts) as [("," | ";" | "\t"), number][]).reduce((a, b) =>
    b[1] > a[1] ? b : a,
  )[0];
}