import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { Building2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
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
import { gocardlessApi } from "@/lib/api";
import type { Account, GcAccount, Institution } from "@/lib/api";
import { t } from "@/i18n";
import { toast, toastError } from "@/lib/toast";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export function GoCardlessSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [secretId, setSecretId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([gocardlessApi.getCredentials(), gocardlessApi.hasConnection()])
      .then(([creds, conn]) => {
        if (cancelled) return;
        setSecretId(creds?.secret_id ?? "");
        setSecretKey(creds?.secret_key ?? "");
        setConnected(conn.connected);
        setLoaded(true);
      })
      .catch((e) => {
        if (!cancelled) toastError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!secretId.trim() || !secretKey.trim()) return;
    setSubmitting(true);
    try {
      await gocardlessApi.saveCredentials({
        secret_id: secretId.trim(),
        secret_key: secretKey.trim(),
      });
      toast.success(t.gocardless.credentialsSaved);
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.gocardless.settingsTitle}</DialogTitle>
          <DialogDescription>{t.gocardless.settingsDescription}</DialogDescription>
        </DialogHeader>
        {loaded ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.gocardless.fieldSecretId}</Label>
              <Input
                value={secretId}
                onChange={(e) => setSecretId(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.gocardless.fieldSecretKey}</Label>
              <Input
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                type="password"
                disabled={submitting}
              />
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                <span className="font-medium">
                  {connected ? t.gocardless.statusConnected : t.gocardless.statusDisconnected}
                </span>
              </div>
              <div>
                {t.gocardless.redirectUriLabel}{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  http://localhost:17891/callback
                </code>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={!secretId.trim() || !secretKey.trim() || submitting}>
                {t.comptes.save}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t.common.loading}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

type LinkStep = "choose-institution" | "waiting-callback" | "choose-account" | "linked";

export function GoCardlessLinkDialog({
  account,
  open,
  onOpenChange,
  onLinked,
}: {
  account: Account;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLinked: () => void;
}) {
  const initialStep: LinkStep = account.gocardless_account_id ? "linked" : "choose-institution";
  const [step, setStep] = useState<LinkStep>(initialStep);
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [search, setSearch] = useState("");
  const [requisitionId, setRequisitionId] = useState<string | null>(
    account.gocardless_requisition_id,
  );
  const [gcAccounts, setGcAccounts] = useState<GcAccount[] | null>(null);
  const [selectedGcId, setSelectedGcId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  // Reset internal state whenever the dialog opens or the account changes.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(account.gocardless_account_id ? "linked" : "choose-institution");
     
    setInstitutions(null);
     
    setSearch("");
     
    setRequisitionId(account.gocardless_requisition_id);
     
    setGcAccounts(null);
     
    setSelectedGcId("");
  }, [open, account.gocardless_account_id, account.gocardless_requisition_id]);

  // Stop polling on close / unmount.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const loadInstitutions = useCallback(async () => {
    try {
      setInstitutions(await gocardlessApi.listInstitutions());
    } catch (e) {
      toastError(e);
      onOpenChange(false);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (open && step === "choose-institution" && institutions === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadInstitutions();
    }
  }, [open, step, institutions, loadInstitutions]);

  const filteredInstitutions = useMemo(() => {
    if (!institutions) return [];
    const q = search.trim().toLowerCase();
    if (!q) return institutions;
    return institutions.filter((i) => i.name.toLowerCase().includes(q));
  }, [institutions, search]);

  function stopPolling() {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function startPolling(state: string, reqId: string) {
    stopPolling();
    let startedAt = 0;
    pollTimerRef.current = window.setInterval(async () => {
      if (startedAt === 0) startedAt = Date.now();
      try {
        const status = await gocardlessApi.getRequisitionStatus(state);
        if (status.status === "complete") {
          stopPolling();
          setRequisitionId(reqId);
          await loadRequisitionAccounts(reqId);
        } else if (status.status === "error") {
          stopPolling();
          toast.error(status.error ?? t.gocardless.connectPollError);
          setStep("choose-institution");
        } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopPolling();
          toast.error(t.gocardless.connectPollError);
          setStep("choose-institution");
        }
      } catch (e) {
        stopPolling();
        toastError(e);
        setStep("choose-institution");
      }
    }, POLL_INTERVAL_MS);
  }

  async function loadRequisitionAccounts(reqId: string) {
    try {
      const accounts = await gocardlessApi.listRequisitionAccounts(reqId);
      setGcAccounts(accounts);
      setStep("choose-account");
    } catch (e) {
      toastError(e);
      setStep("choose-institution");
    }
  }

  async function handleConnect(institution: Institution) {
    setBusy(true);
    try {
      const res = await gocardlessApi.createRequisition(institution.id);
      setRequisitionId(res.requisition_id);
      setStep("waiting-callback");
      await openExternal(res.link);
      startPolling(res.state, res.requisition_id);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleLink() {
    if (!selectedGcId || !requisitionId) return;
    setBusy(true);
    try {
      await gocardlessApi.linkAccount(account.id, selectedGcId, requisitionId);
      toast.success(t.gocardless.connectSuccess);
      onLinked();
      onOpenChange(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    try {
      const result = await gocardlessApi.syncAccount(account.id);
      toast.success(
        t.gocardless.syncResult
          .replace("{imported}", String(result.imported))
          .replace("{skipped}", String(result.skipped)),
      );
      onLinked();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "linked"
              ? t.gocardless.linkTitle.replace("{name}", account.name)
              : step === "choose-account"
                ? t.gocardless.linkTitle.replace("{name}", account.name)
                : t.gocardless.institutionPickerTitle}
          </DialogTitle>
          <DialogDescription>
            {step === "choose-institution"
              ? t.gocardless.institutionPickerDescription
              : step === "choose-account"
                ? t.gocardless.linkDescription
                : null}
          </DialogDescription>
        </DialogHeader>

        {step === "choose-institution" && (
          <div className="space-y-3">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.gocardless.institutionSearchPlaceholder}
            />
            {institutions === null ? (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            ) : filteredInstitutions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.gocardless.institutionEmpty}</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-border border border-border rounded-md">
                {filteredInstitutions.map((inst) => (
                  <li key={inst.id}>
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
                      onClick={() => handleConnect(inst)}
                      disabled={busy}
                    >
                      {inst.logo ? (
                        <img src={inst.logo} alt="" className="size-5 rounded" />
                      ) : (
                        <Building2 className="size-4 text-muted-foreground" />
                      )}
                      <span>{inst.name}</span>
                      {inst.bic && (
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {inst.bic}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === "waiting-callback" && (
          <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>{t.gocardless.connectingBrowser}</span>
          </div>
        )}

        {step === "choose-account" && (
          <div className="space-y-3">
            {gcAccounts === null ? (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            ) : gcAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.gocardless.linkError}</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md">
                {gcAccounts.map((gc) => (
                  <li key={gc.id}>
                    <button
                      type="button"
                      className={`flex flex-col items-start w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                        selectedGcId === gc.id ? "bg-accent" : ""
                      }`}
                      onClick={() => setSelectedGcId(gc.id)}
                    >
                      <span className="font-medium tabular-nums">{gc.iban ?? gc.id}</span>
                      {gc.owner_name && (
                        <span className="text-xs text-muted-foreground">{gc.owner_name}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {t.common.cancel}
              </Button>
              <Button onClick={handleLink} disabled={!selectedGcId || busy}>
                {t.gocardless.linkSave}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "linked" && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{t.gocardless.linked}</span>
              <code className="bg-muted px-1 py-0.5 rounded text-xs tabular-nums">
                {account.gocardless_account_id}
              </code>
            </div>
            <div className="text-xs text-muted-foreground">
              {account.gocardless_last_sync_at
                ? t.gocardless.lastSync.replace("{date}", account.gocardless_last_sync_at)
                : t.gocardless.neverSynced}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {t.common.close}
              </Button>
              <Button onClick={handleSync} disabled={busy}>
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {busy ? t.gocardless.syncing : t.gocardless.sync}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "waiting-callback" && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <ExternalLink className="size-3" />
            <span>{t.gocardless.connectingBrowser}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
