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
import { convertRows } from "@/lib/csv";
import type { CsvMapping, DateFormat, DecimalSeparator, RawRow } from "@/lib/csv";
import { fr } from "@/i18n/fr";

type Step =
  | { kind: "pick" }
  | {
      kind: "mapping";
      filename: string;
      rows: RawRow[];
      columns: string[];
      mapping: Partial<CsvMapping>;
    }
  | { kind: "running" }
  | { kind: "done"; result: IngestResult; failed: number; failedReasons: string[] };

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "iso", label: "AAAA-MM-JJ" },
  { value: "dmy_slash", label: "JJ/MM/AAAA" },
  { value: "mdy_slash", label: "MM/JJ/AAAA" },
];

const DECIMAL_OPTIONS: { value: DecimalSeparator; label: string }[] = [
  { value: ",", label: ", (virgule)" },
  { value: ".", label: ". (point)" },
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
      setStep({ kind: "pick" });
      setError(null);
    }
  }, [open]);

  async function handleFile(file: File) {
    setError(null);
    const text = await file.text();
    const saved = (account.csv_mapping ?? {}) as Partial<CsvMapping>;
    const delimiter = (saved.delimiter as "," | ";" | undefined) ?? guessDelimiter(text);

    const result = Papa.parse<RawRow>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    });
    if (result.errors.length) {
      setError(`Erreur de lecture CSV : ${result.errors[0]?.message ?? "inconnue"}`);
      return;
    }
    const rows = result.data;
    const columns = result.meta.fields ?? [];
    if (rows.length === 0 || columns.length === 0) {
      setError("Fichier vide ou sans en-tête.");
      return;
    }
    setStep({
      kind: "mapping",
      filename: file.name,
      rows,
      columns,
      mapping: { ...saved, delimiter, has_header: true },
    });
  }

  async function handleIngest(mapping: CsvMapping, rows: RawRow[]) {
    setError(null);
    setStep({ kind: "running" });

    const conversions = convertRows(rows, mapping);
    const ok = conversions.flatMap((c) => (c.ok ? [c.row] : []));
    const failedReasons = conversions
      .flatMap((c) => (c.ok ? [] : [`L${c.index + 2} : ${c.reason}`]))
      .slice(0, 5);

    if (ok.length === 0) {
      setError("Aucune ligne valide à importer.");
      setStep((prev) => prev); // stay; user will adjust mapping
      return;
    }

    try {
      const result = await importsApi.ingest({
        account_id: account.id,
        rows: ok,
      });
      await accountsApi.setCsvMapping(account.id, mapping as Record<string, unknown>);
      setStep({
        kind: "done",
        result,
        failed: conversions.length - ok.length,
        failedReasons,
      });
      onImported();
    } catch (e) {
      setError(e instanceof RpcError ? e.message : String(e));
      setStep({ kind: "pick" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fr.import.title.replace("{name}", account.name)}</DialogTitle>
          <DialogDescription>{fr.import.description}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {step.kind === "pick" && <PickStep onFile={handleFile} />}

        {step.kind === "mapping" && (
          <MappingStep
            filename={step.filename}
            rows={step.rows}
            columns={step.columns}
            initial={step.mapping}
            onCancel={() => setStep({ kind: "pick" })}
            onConfirm={(m) => handleIngest(m, step.rows)}
          />
        )}

        {step.kind === "running" && (
          <p className="text-sm text-muted-foreground py-4">{fr.common.loading}</p>
        )}

        {step.kind === "done" && (
          <DoneStep
            result={step.result}
            failed={step.failed}
            failedReasons={step.failedReasons}
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
      <span className="text-sm">{fr.import.pickFile}</span>
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
  rows,
  columns,
  initial,
  onCancel,
  onConfirm,
}: {
  filename: string;
  rows: RawRow[];
  columns: string[];
  initial: Partial<CsvMapping>;
  onCancel: () => void;
  onConfirm: (m: CsvMapping) => void;
}) {
  const [dateColumn, setDateColumn] = useState(initial.date_column ?? columns[0]);
  const [montantColumn, setMontantColumn] = useState(
    initial.montant_column ?? columns[1] ?? columns[0],
  );
  const [libelleColumn, setLibelleColumn] = useState(
    initial.libelle_column ?? columns[2] ?? columns[0],
  );
  const [dateFormat, setDateFormat] = useState<DateFormat>(initial.date_format ?? "dmy_slash");
  const [decimal, setDecimal] = useState<DecimalSeparator>(initial.montant_decimal ?? ",");
  const delimiter = initial.delimiter ?? ",";

  const preview = useMemo(() => rows.slice(0, 5), [rows]);
  const valid = dateColumn && montantColumn && libelleColumn;

  function submit() {
    if (!valid) return;
    onConfirm({
      delimiter,
      has_header: true,
      date_column: dateColumn,
      date_format: dateFormat,
      montant_column: montantColumn,
      montant_decimal: decimal,
      libelle_column: libelleColumn,
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {fr.import.fileLabel}: <span className="font-mono">{filename}</span>
        {" · "}
        {rows.length} {fr.import.rowsCount}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <ColumnPicker
          label={fr.import.fieldDate}
          value={dateColumn}
          columns={columns}
          onChange={setDateColumn}
        />
        <SelectField
          label={fr.import.fieldDateFormat}
          value={dateFormat}
          options={DATE_FORMATS}
          onChange={(v) => setDateFormat(v as DateFormat)}
        />
        <ColumnPicker
          label={fr.import.fieldMontant}
          value={montantColumn}
          columns={columns}
          onChange={setMontantColumn}
        />
        <SelectField
          label={fr.import.fieldDecimal}
          value={decimal}
          options={DECIMAL_OPTIONS}
          onChange={(v) => setDecimal(v as DecimalSeparator)}
        />
        <ColumnPicker
          label={fr.import.fieldLibelle}
          value={libelleColumn}
          columns={columns}
          onChange={setLibelleColumn}
        />
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/40 border-b border-border">
          {fr.import.preview}
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-border">
                {columns.map((c) => (
                  <th key={c} className="text-left font-medium px-3 py-1.5 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-1 whitespace-nowrap text-muted-foreground">
                      {row[c]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {fr.common.cancel}
        </Button>
        <Button type="button" onClick={submit} disabled={!valid}>
          {fr.import.run}
        </Button>
      </DialogFooter>
    </div>
  );
}

function DoneStep({
  result,
  failed,
  failedReasons,
  onClose,
}: {
  result: IngestResult;
  failed: number;
  failedReasons: string[];
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <ul className="text-sm space-y-1">
        <li>
          <span className="text-muted-foreground">{fr.import.imported}</span>{" "}
          <span className="font-semibold">{result.imported}</span>
        </li>
        <li>
          <span className="text-muted-foreground">{fr.import.skipped}</span>{" "}
          <span className="font-semibold">{result.skipped}</span>
        </li>
        {failed > 0 && (
          <li className="text-destructive">
            {fr.import.failed}: <span className="font-semibold">{failed}</span>
          </li>
        )}
        <li>
          <span className="text-muted-foreground">{fr.import.ruleAssigned}</span>{" "}
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
      <DialogFooter>
        <Button onClick={onClose}>{fr.common.close}</Button>
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
    <div className="space-y-1.5">
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
    <div className="space-y-1.5">
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

function guessDelimiter(text: string): "," | ";" {
  const sample = text.slice(0, 1000);
  return (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ";" : ",";
}
