import { useCallback, useEffect, useState } from "react";
import { Check, ChevronRight, Pencil, Plus, RotateCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { automationsApi } from "@/lib/api";
import type {
  Automation,
  AutomationEventType,
  AutomationPending,
  HistoryStatusFilter,
  Predicate,
} from "@/lib/api";
import { toastError, toast } from "@/lib/toast";
import { formatEuros } from "@/lib/format";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const EVENT_TYPES: AutomationEventType[] = [
  "operation.created",
  "operation.updated",
  "operation.category_assigned",
  "rule.matched",
];

export function AutomatisationsPage() {
  const [pending, setPending] = useState<AutomationPending[] | null>(null);
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [history, setHistory] = useState<AutomationPending[] | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [detailsOf, setDetailsOf] = useState<AutomationPending | null>(null);

  const refresh = useCallback(async (status: HistoryStatusFilter = historyFilter) => {
    try {
      const [p, a, h] = await Promise.all([
        automationsApi.pending.list(),
        automationsApi.list(),
        automationsApi.history.list(status, 20),
      ]);
      setPending(p);
      setAutomations(a);
      setHistory(h);
    } catch (e) {
      toastError(e);
    }
  }, [historyFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(historyFilter);
    // Poll-on-focus: catch new pending rows enqueued by background ingests.
    const onFocus = () => refresh(historyFilter);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, historyFilter]);

  async function handleConfirm(item: AutomationPending) {
    try {
      const result = await automationsApi.pending.confirm(item.id);
      if (result.status === "failed") {
        toast.error(t.automatisations.confirmFailed);
      } else {
        toast.success(t.automatisations.confirmOk);
      }
      await refresh();
    } catch (e) {
      toastError(e);
    }
  }

  async function handleRefuse(item: AutomationPending) {
    try {
      await automationsApi.pending.refuse(item.id);
      await refresh();
    } catch (e) {
      toastError(e);
    }
  }

  async function handleToggle(a: Automation, enabled: boolean) {
    try {
      await automationsApi.toggle(a.id, enabled);
      setAutomations((prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, enabled } : x)) ?? null,
      );
    } catch (e) {
      toastError(e);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    try {
      await automationsApi.delete(deleting.id);
      await refresh();
    } catch (e) {
      toastError(e);
    }
  }

  const pendingCount = pending?.length ?? 0;

  return (
    <div className="px-6 py-5 max-w-3xl">
      <h1 className="sr-only">{t.automatisations.title}</h1>

      <Section
        title={t.automatisations.sectionPending}
        count={pendingCount}
        defaultOpen={pendingCount > 0}
      >
        {pending === null ? (
          <p className="text-sm text-muted-foreground px-2">{t.common.loading}</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2">{t.automatisations.pendingEmpty}</p>
        ) : (
          <ul className="border border-border rounded-md divide-y divide-border">
            {pending.map((item) => (
              <PendingRow
                key={item.id}
                item={item}
                onConfirm={() => handleConfirm(item)}
                onRefuse={() => handleRefuse(item)}
                onDetails={() => setDetailsOf(item)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t.automatisations.sectionRules}
        count={automations?.length ?? 0}
        defaultOpen
        action={
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setCreating(true);
            }}
          >
            <Plus className="size-3.5" />
            {t.common.add}
          </Button>
        }
      >
        {automations === null ? (
          <p className="text-sm text-muted-foreground px-2">{t.common.loading}</p>
        ) : automations.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2">{t.automatisations.rulesEmpty}</p>
        ) : (
          <ul className="border border-border rounded-md divide-y divide-border">
            {automations.map((a) => (
              <AutomationRow
                key={a.id}
                automation={a}
                onToggle={(en) => handleToggle(a, en)}
                onEdit={() => setEditing(a)}
                onDelete={() => setDeleting(a)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title={t.automatisations.sectionHistory} count={history?.length ?? 0}>
        <div className="mb-2 flex gap-1 px-1">
          {(["all", "sent", "failed", "refused"] as HistoryStatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setHistoryFilter(s)}
              className={cn(
                "text-xs px-2 py-1 rounded-md border",
                historyFilter === s
                  ? "bg-accent text-accent-foreground border-accent"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.automatisations.historyFilter[s]}
            </button>
          ))}
        </div>
        {history === null ? (
          <p className="text-sm text-muted-foreground px-2">{t.common.loading}</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2">{t.automatisations.historyEmpty}</p>
        ) : (
          <ul className="border border-border rounded-md divide-y divide-border">
            {history.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                onDetails={() => setDetailsOf(item)}
                onRetry={item.status === "failed" ? () => handleConfirm(item) : undefined}
              />
            ))}
          </ul>
        )}
      </Section>

      {(creating || editing) && (
        <AutomationFormDialog
          automation={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={
          deleting
            ? t.automatisations.confirmDelete.replace("{name}", deleting.name)
            : ""
        }
        confirmLabel={t.common.delete}
        destructive
        onConfirm={handleConfirmDelete}
      />

      {detailsOf && (
        <DetailsDialog item={detailsOf} onClose={() => setDetailsOf(null)} />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group mb-4" open={defaultOpen}>
      <summary className="list-none flex items-center gap-2 cursor-pointer select-none px-1 py-2 border-b border-border">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        <h2 className="text-sm font-medium flex-1">
          {title}
          <span className="ml-2 text-xs text-muted-foreground">({count})</span>
        </h2>
        {action}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

function PendingRow({
  item,
  onConfirm,
  onRefuse,
  onDetails,
}: {
  item: AutomationPending;
  onConfirm: () => void;
  onRefuse: () => void;
  onDetails: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.automation_name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {describeEvent(item)}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDetails}
        className="text-muted-foreground hover:text-foreground"
      >
        {t.automatisations.details}
      </Button>
      <SplitPill onRefuse={onRefuse} onConfirm={onConfirm} />
    </li>
  );
}

function SplitPill({
  onRefuse,
  onConfirm,
}: {
  onRefuse: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="inline-flex rounded-full overflow-hidden border border-border">
      <button
        type="button"
        onClick={onRefuse}
        aria-label={t.automatisations.refuse}
        title={t.automatisations.refuse}
        className="px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
      >
        <X className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onConfirm}
        aria-label={t.automatisations.confirm}
        title={t.automatisations.confirm}
        className="px-2.5 py-1 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300 dark:hover:bg-green-950/60"
      >
        <Check className="size-3.5" />
      </button>
    </div>
  );
}

function AutomationRow({
  automation,
  onToggle,
  onEdit,
  onDelete,
}: {
  automation: Automation;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <Checkbox
        checked={automation.enabled}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={t.automatisations.enabled}
      />
      <div className="flex-1 min-w-0">
        <div
          className={
            automation.enabled ? "font-medium" : "font-medium text-muted-foreground"
          }
        >
          {automation.name}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {t.automatisations.eventLabel[automation.event_type]} · {describePredicate(automation.predicate)}
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {automation.callback_url}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onEdit}
        className="text-muted-foreground hover:text-foreground"
        aria-label={t.common.edit}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDelete}
        className="text-muted-foreground hover:text-destructive"
        aria-label={t.common.delete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

function HistoryRow({
  item,
  onDetails,
  onRetry,
}: {
  item: AutomationPending;
  onDetails: () => void;
  onRetry?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <StatusPill status={item.status} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{item.automation_name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {describeEvent(item)}
          {item.resolved_at ? ` · ${formatTimestamp(item.resolved_at)}` : ""}
        </div>
        {item.error && (
          <div className="text-xs text-red-700 dark:text-red-400 truncate">
            {item.error}
          </div>
        )}
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRetry}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t.automatisations.retry}
          title={t.automatisations.retry}
        >
          <RotateCw className="size-3.5" />
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={onDetails}
        className="text-muted-foreground hover:text-foreground"
      >
        {t.automatisations.details}
      </Button>
    </li>
  );
}

function StatusPill({ status }: { status: AutomationPending["status"] }) {
  const styles: Record<AutomationPending["status"], string> = {
    pending: "bg-muted text-muted-foreground",
    sent: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300",
    refused: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs",
        styles[status],
      )}
    >
      {t.automatisations.statusLabel[status]}
    </span>
  );
}

function DetailsDialog({
  item,
  onClose,
}: {
  item: AutomationPending;
  onClose: () => void;
}) {
  const body = {
    automation: { id: item.automation_id, name: item.automation_name },
    event: { type: item.event_type, payload: item.payload },
    pending_id: item.id,
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.automatisations.detailsTitle}</DialogTitle>
          <DialogDescription>
            {t.automatisations.detailsDescription.replace(
              "{url}",
              item.callback_url,
            )}
          </DialogDescription>
        </DialogHeader>
        <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-80 font-mono">
          {JSON.stringify(body, null, 2)}
        </pre>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutomationFormDialog({
  automation,
  onClose,
  onSaved,
}: {
  automation: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(automation?.name ?? "");
  const [eventType, setEventType] = useState<AutomationEventType>(
    automation?.event_type ?? "operation.created",
  );
  const [url, setUrl] = useState(automation?.callback_url ?? "");
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  const [kind, setKind] = useState<"libelle_contains" | "montant_compare">(
    automation?.predicate.kind ?? "libelle_contains",
  );
  const [text, setText] = useState(
    automation?.predicate.kind === "libelle_contains"
      ? automation.predicate.text
      : "",
  );
  const [op, setOp] = useState<">" | "<" | "==">(
    automation?.predicate.kind === "montant_compare"
      ? automation.predicate.operator
      : ">",
  );
  const [amountText, setAmountText] = useState(
    automation?.predicate.kind === "montant_compare"
      ? (automation.predicate.value_cents / 100).toString().replace(".", ",")
      : "",
  );
  const [submitting, setSubmitting] = useState(false);

  const isEdit = automation !== null;

  function buildPredicate(): Predicate | null {
    if (kind === "libelle_contains") {
      if (!text.trim()) return null;
      return { kind: "libelle_contains", text: text.trim(), case_sensitive: false };
    }
    const cents = parseEurosToCents(amountText);
    if (cents === null) return null;
    return { kind: "montant_compare", operator: op, value_cents: cents };
  }

  const predicate = buildPredicate();
  const validUrl = /^https?:\/\/.+/i.test(url.trim());
  const valid = name.trim() && validUrl && predicate !== null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || submitting || predicate === null) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await automationsApi.update({
          id: automation.id,
          name: name.trim(),
          event_type: eventType,
          predicate,
          callback_url: url.trim(),
          enabled,
        });
      } else {
        await automationsApi.create({
          name: name.trim(),
          event_type: eventType,
          predicate,
          callback_url: url.trim(),
          enabled,
        });
      }
      onSaved();
    } catch (err) {
      toastError(err);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t.automatisations.editTitle : t.automatisations.addTitle}
          </DialogTitle>
          <DialogDescription>{t.automatisations.formHint}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t.automatisations.fieldName}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.automatisations.namePlaceholder}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t.automatisations.fieldEvent}</Label>
            <Select
              value={eventType}
              onValueChange={(v) => setEventType(v as AutomationEventType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {t.automatisations.eventLabel[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t.automatisations.fieldPredicate}</Label>
            <div className="flex gap-2">
              <Select
                value={kind}
                onValueChange={(v) =>
                  setKind(v as "libelle_contains" | "montant_compare")
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="libelle_contains">
                    {t.regles.predicateLibelleContains}
                  </SelectItem>
                  <SelectItem value="montant_compare">
                    {t.regles.predicateMontantCompare}
                  </SelectItem>
                </SelectContent>
              </Select>
              {kind === "libelle_contains" ? (
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="café"
                  className="flex-1"
                  disabled={submitting}
                />
              ) : (
                <>
                  <Select
                    value={op}
                    onValueChange={(v) => setOp(v as ">" | "<" | "==")}
                  >
                    <SelectTrigger className="w-14">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">{">"}</SelectItem>
                      <SelectItem value="<">{"<"}</SelectItem>
                      <SelectItem value="==">{"="}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    placeholder="100"
                    inputMode="decimal"
                    className="flex-1 tabular-nums"
                    disabled={submitting}
                  />
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t.automatisations.fieldUrl}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://n8n.example.com/webhook/abc"
              disabled={submitting}
              type="url"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
              disabled={submitting}
            />
            <span>{t.automatisations.enabled}</span>
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {isEdit ? t.automatisations.save : t.automatisations.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function describeEvent(item: AutomationPending): string {
  const eventName = t.automatisations.eventLabel[item.event_type];
  const opId = item.operation_id;
  if (opId !== null) {
    return `${eventName} · op #${opId}`;
  }
  return eventName;
}

function describePredicate(p: Predicate): string {
  if (p.kind === "libelle_contains") {
    return t.regles.predicateLibelleSummary.replace("{text}", p.text);
  }
  return t.regles.predicateMontantSummary
    .replace("{op}", p.operator === "==" ? "=" : p.operator)
    .replace("{amount}", formatEuros(p.value_cents));
}

function parseEurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s   ]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
