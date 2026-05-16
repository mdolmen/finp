import { useCallback, useEffect, useState } from "react";
import { Plus, Settings, Trash2, Upload } from "lucide-react";
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
import { ImportDialog } from "@/components/ImportDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { accountsApi, RpcError } from "@/lib/api";
import type { Account } from "@/lib/api";
import { formatEuros as formatEurosFromCents } from "@/lib/format";
import { t } from "@/i18n";

const DATE_TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatLastImport(iso: string | null): string {
  if (!iso) return t.comptes.neverImported;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_TIME_FMT.format(d);
}

export function ComptesPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importing, setImporting] = useState<Account | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Account | null>(null);
  const [settingsFor, setSettingsFor] = useState<Account | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAccounts(await accountsApi.list());
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function performDelete(account: Account) {
    try {
      await accountsApi.delete(account.id);
      await refresh();
    } catch (e) {
      setError(formatError(e));
    }
  }

  return (
    <div className="px-6 py-5 max-w-3xl">
      <div className="flex items-center justify-end gap-2 mb-5">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />
          {t.common.add}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {accounts === null ? (
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.comptes.empty}</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="font-medium">{acc.name}</span>
              <span
                className={`text-sm tabular-nums ${
                  acc.current_balance_cents < 0 ? "text-debit" : "text-credit"
                }`}
                title={t.comptes.currentBalance}
              >
                {formatEurosFromCents(acc.current_balance_cents)}
              </span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {formatLastImport(acc.last_import_at)}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setImporting(acc)}>
                <Upload className="size-3.5" />
                {t.comptes.import}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSettingsFor(acc)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={t.comptes.settings}
                title={t.comptes.settings}
              >
                <Settings className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteConfirm(acc)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddAccountDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => refresh()}
      />

      {importing && (
        <ImportDialog
          account={importing}
          open={!!importing}
          onOpenChange={(v) => !v && setImporting(null)}
          onImported={refresh}
        />
      )}

      {settingsFor && (
        <AccountSettingsDialog
          account={settingsFor}
          onClose={() => setSettingsFor(null)}
          onSaved={async () => {
            setSettingsFor(null);
            await refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(v) => !v && setDeleteConfirm(null)}
        title={
          deleteConfirm
            ? t.comptes.confirmDelete.replace("{name}", deleteConfirm.name)
            : ""
        }
        description={t.comptes.confirmDeleteBody}
        confirmLabel={t.common.delete}
        destructive
        onConfirm={() => deleteConfirm && performDelete(deleteConfirm)}
      />
    </div>
  );
}

function AddAccountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await accountsApi.create(name.trim());
      onCreated();
      onOpenChange(false);
    } catch (e) {
      setError(formatError(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.comptes.addTitle}</DialogTitle>
          <DialogDescription>{t.comptes.addDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.comptes.namePlaceholder}
            disabled={submitting}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!name.trim() || submitting}>
              {t.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccountSettingsDialog({
  account,
  onClose,
  onSaved,
}: {
  account: Account;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [balanceText, setBalanceText] = useState(
    account.initial_balance_cents !== 0
      ? (account.initial_balance_cents / 100).toString().replace(".", ",")
      : "",
  );
  const [date, setDate] = useState(account.initial_balance_date ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseEurosToCents(balanceText);
  // An empty value clears the balance back to 0; the date is optional too.
  const valid = cents !== null || balanceText.trim() === "";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await accountsApi.setInitialBalance(
        account.id,
        cents ?? 0,
        date.trim() === "" ? null : date,
      );
      onSaved();
    } catch (e) {
      setError(formatError(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t.comptes.settingsTitle.replace("{name}", account.name)}
          </DialogTitle>
          <DialogDescription>{t.comptes.settingsDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.comptes.fieldInitialBalance}</Label>
              <Input
                value={balanceText}
                onChange={(e) => setBalanceText(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="tabular-nums"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.comptes.fieldInitialBalanceDate}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.comptes.initialBalanceHint}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {t.comptes.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function parseEurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s   ]/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function formatError(e: unknown): string {
  if (e instanceof RpcError) {
    if (e.appCode === "conflict") return t.comptes.errorDuplicate;
    return e.message;
  }
  return String(e);
}
