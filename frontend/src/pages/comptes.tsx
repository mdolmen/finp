import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Upload, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { fr } from "@/i18n/fr";

export function ComptesPage() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importing, setImporting] = useState<Account | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Account | null>(null);

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
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold tracking-tight">{fr.comptes.title}</h1>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />
          {fr.common.add}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {accounts === null ? (
        <p className="text-sm text-muted-foreground">{fr.common.loading}</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{fr.comptes.empty}</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="flex-1 font-medium">{acc.name}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled
                title={fr.comptes.connectSoon}
                className="text-muted-foreground"
              >
                <Wifi className="size-3.5" />
                {fr.comptes.connect}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setImporting(acc)}>
                <Upload className="size-3.5" />
                {fr.comptes.import}
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

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(v) => !v && setDeleteConfirm(null)}
        title={
          deleteConfirm
            ? fr.comptes.confirmDelete.replace("{name}", deleteConfirm.name)
            : ""
        }
        description={fr.comptes.confirmDeleteBody}
        confirmLabel={fr.common.delete}
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fr.comptes.addTitle}</DialogTitle>
          <DialogDescription>{fr.comptes.addDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={fr.comptes.namePlaceholder}
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
              {fr.common.cancel}
            </Button>
            <Button type="submit" disabled={!name.trim() || submitting}>
              {fr.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatError(e: unknown): string {
  if (e instanceof RpcError) {
    if (e.appCode === "conflict") return fr.comptes.errorDuplicate;
    return e.message;
  }
  return String(e);
}
