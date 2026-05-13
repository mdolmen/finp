import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Settings, Trash2, Upload, Wifi } from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { accountsApi, tinkApi, RpcError } from "@/lib/api";
import type { Account, TinkEnvironment } from "@/lib/api";
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
  return t.comptes.lastImport.replace("{date}", DATE_TIME_FMT.format(d));
}

export function ComptesPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tinkSettingsOpen, setTinkSettingsOpen] = useState(false);
  const [importing, setImporting] = useState<Account | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Account | null>(null);
  const [settingsFor, setSettingsFor] = useState<Account | null>(null);
  const [tinkConnected, setTinkConnected] = useState(false);
  const [linkFor, setLinkFor] = useState<Account | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAccounts(await accountsApi.list());
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  const refreshTinkStatus = useCallback(() => {
    tinkApi.hasConnection().then((r) => setTinkConnected(r.connected)).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    refreshTinkStatus();
  }, [refresh, refreshTinkStatus]);

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
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setTinkSettingsOpen(true)}
          title={t.tink.settingsTitle}
          className={tinkConnected ? "text-credit hover:text-credit/80" : "text-muted-foreground hover:text-foreground"}
        >
          <Wifi className="size-3.5" />
          {t.tink.settingsTitle}
        </Button>
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
              {acc.tink_account_id ? (
                <span
                  className="flex items-center gap-1 text-xs text-credit px-2"
                  title={acc.tink_account_id}
                >
                  <Wifi className="size-3.5" />
                  {t.tink.linked}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!tinkConnected}
                  title={tinkConnected ? undefined : t.tink.connectDisabledHint}
                  className="text-muted-foreground"
                  onClick={() => setLinkFor(acc)}
                >
                  <Wifi className="size-3.5" />
                  {t.tink.link}
                </Button>
              )}
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

      <TinkSettingsDialog
        open={tinkSettingsOpen}
        onOpenChange={setTinkSettingsOpen}
        onConnected={() => { setTinkSettingsOpen(false); refreshTinkStatus(); setError(null); }}
      />

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

      {linkFor && (
        <LinkAccountDialog
          account={linkFor}
          onClose={() => setLinkFor(null)}
          onLinked={async () => {
            setLinkFor(null);
            await refresh();
          }}
          onReauthRequired={() => {
            setLinkFor(null);
            setTinkConnected(false);
            setError(t.tink.reauthRequired);
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

function TinkSettingsDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConnected: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [environment, setEnvironment] = useState<TinkEnvironment>("sandbox");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setConnecting(false);
      setError(null);
      return;
    }
    tinkApi.getCredentials().then((creds) => {
      if (creds) {
        setClientId(creds.client_id);
        setClientSecret(creds.client_secret);
        setEnvironment(creds.environment);
      }
    }).catch(() => {});
    tinkApi.hasConnection().then((r) => setConnected(r.connected)).catch(() => {});
  }, [open]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId.trim() || !clientSecret.trim() || connecting) return;
    setError(null);
    try {
      await tinkApi.saveCredentials({ client_id: clientId.trim(), client_secret: clientSecret.trim(), environment });
      const { auth_url, state } = await tinkApi.startOAuth();
      await openUrl(auth_url);
      setConnecting(true);

      pollRef.current = setInterval(async () => {
        try {
          const result = await tinkApi.getOAuthStatus(state);
          if (result.status === "pending") return;
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setConnecting(false);
          if (result.status === "complete") {
            setConnected(true);
            onConnected();
          } else {
            setError(result.error ?? t.tink.connectPollError);
          }
        } catch {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          setConnecting(false);
          setError(t.tink.connectPollError);
        }
      }, 2000);
    } catch (e) {
      setConnecting(false);
      setError(e instanceof RpcError ? e.message : String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.tink.settingsTitle}</DialogTitle>
          <span className={`text-xs flex items-center gap-1.5 ${connected ? "text-credit" : "text-muted-foreground"}`}>
            <span className={`inline-block size-1.5 rounded-full ${connected ? "bg-credit" : "bg-muted-foreground"}`} />
            {connected ? t.tink.statusConnected : t.tink.statusDisconnected}
          </span>
          <DialogDescription>{t.tink.settingsDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t.tink.fieldClientId}</Label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="your-client-id"
              disabled={connecting}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.tink.fieldClientSecret}</Label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••"
              disabled={connecting}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.tink.fieldEnvironment}</Label>
            <Select
              value={environment}
              onValueChange={(v) => setEnvironment(v as TinkEnvironment)}
              disabled={connecting}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">{t.tink.sandbox}</SelectItem>
                <SelectItem value="production">{t.tink.production}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t.tink.redirectUriLabel}</Label>
            <code className="block rounded bg-muted px-2 py-1 text-xs select-all font-mono">
              http://localhost:17890/callback
            </code>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={connecting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!clientId.trim() || !clientSecret.trim() || connecting}>
              {connecting ? t.tink.connectingBrowser : t.comptes.connect}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
      <DialogContent>
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
      <DialogContent>
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

function LinkAccountDialog({
  account,
  onClose,
  onLinked,
  onReauthRequired,
}: {
  account: Account;
  onClose: () => void;
  onLinked: () => void;
  onReauthRequired: () => void;
}) {
  const [tinkAccounts, setTinkAccounts] = useState<import("@/lib/api").TinkAccount[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tinkApi.listTinkAccounts()
      .then((list) => {
        setTinkAccounts(list);
        const pre = list.find((a) => a.id === account.tink_account_id);
        if (pre) setSelected(pre.id);
      })
      .catch((e) => {
        if (e instanceof RpcError && (e.appCode === "tink.reauth_required" || e.appCode === "tink.no_tokens")) {
          onReauthRequired();
        } else {
          setError(t.tink.linkError);
        }
      });
  }, [account.tink_account_id, onReauthRequired]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await tinkApi.linkAccount(account.id, selected);
      onLinked();
    } catch (e) {
      setError(formatError(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.tink.linkTitle.replace("{name}", account.name)}</DialogTitle>
          <DialogDescription>{t.tink.linkDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t.tink.linkFieldTinkAccount}</Label>
            {tinkAccounts === null && !error ? (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            ) : (
              <Select value={selected} onValueChange={setSelected} disabled={submitting}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder={t.tink.linkNone} />
                </SelectTrigger>
                <SelectContent>
                  {(tinkAccounts ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.iban ? ` — ${a.iban}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!selected || submitting}>
              {t.tink.linkSave}
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
