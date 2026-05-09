import { useCallback, useEffect, useState } from "react";
import { GripVertical, Pencil, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { categoriesApi, rulesApi, RpcError } from "@/lib/api";
import type { Category, Predicate, Rule } from "@/lib/api";
import { formatEuros } from "@/lib/format";
import { t } from "@/i18n";

export function ReglesPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Rule | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rs, cs] = await Promise.all([rulesApi.list(), categoriesApi.list()]);
      setRules(rs);
      setCats(cs);
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleApplyNow() {
    setError(null);
    setInfo(null);
    try {
      const r = await rulesApi.applyNow();
      setInfo(t.regles.appliedNow.replace("{n}", String(r.assigned)));
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    try {
      await rulesApi.delete(deleting.id);
      await refresh();
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function handleRun(rule: Rule) {
    setError(null);
    setInfo(null);
    try {
      const r = await rulesApi.run(rule.id);
      setInfo(
        t.regles.ranRule.replace("{name}", rule.name).replace("{n}", String(r.assigned)),
      );
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function handleToggleEnabled(rule: Rule, enabled: boolean) {
    try {
      await rulesApi.update({ id: rule.id, enabled });
      // Optimistic local update — avoids the brief flicker of a full refetch.
      setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, enabled } : r)) ?? null);
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function handleReorder(categoryId: number, orderedIds: number[]) {
    // Optimistic: reorder locally first, then persist. On failure, roll back
    // by refetching from the server.
    setRules((prev) => {
      if (!prev) return prev;
      const inGroup = prev.filter((r) => r.category_id === categoryId);
      const others = prev.filter((r) => r.category_id !== categoryId);
      const byId = new Map(inGroup.map((r) => [r.id, r]));
      const reordered = orderedIds.map((id, idx) => {
        const r = byId.get(id);
        return r ? { ...r, priority: idx } : null;
      });
      const cleaned = reordered.filter((r): r is Rule => r !== null);
      return [...others, ...cleaned];
    });
    try {
      await rulesApi.reorderInCategory(categoryId, orderedIds);
    } catch (e) {
      setError(formatError(e));
      await refresh();
    }
  }

  const groups = groupByCategory(rules ?? [], cats);

  return (
    <div className="px-6 py-5 max-w-3xl">
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleApplyNow}>
            <Sparkles className="size-3.5" />
            {t.regles.applyNow}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            {t.common.add}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      {info && <p className="text-sm text-muted-foreground mb-2">{info}</p>}

      {rules === null ? (
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.regles.empty}</p>
      ) : (
        <div className="space-y-5">
          {groups.map(({ category, rules: groupRules }) => (
            <SortableGroup
              key={category.id}
              category={category}
              rules={groupRules}
              onToggleEnabled={handleToggleEnabled}
              onEdit={setEditing}
              onDelete={setDeleting}
              onRun={handleRun}
              onReorder={handleReorder}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <RuleFormDialog
          rule={editing}
          cats={cats}
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
          deleting ? t.regles.confirmDelete.replace("{name}", deleting.name) : ""
        }
        confirmLabel={t.common.delete}
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function SortableGroup({
  category,
  rules,
  onToggleEnabled,
  onEdit,
  onDelete,
  onRun,
  onReorder,
}: {
  category: Category;
  rules: Rule[];
  onToggleEnabled: (rule: Rule, enabled: boolean) => void;
  onEdit: (rule: Rule) => void;
  onDelete: (rule: Rule) => void;
  onRun: (rule: Rule) => void;
  onReorder: (categoryId: number, orderedIds: number[]) => void;
}) {
  // 8px activation distance: clicks on the row's buttons (edit/delete/checkbox)
  // don't get hijacked by drag detection.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const items = rules.map((r) => r.id);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(active.id as number);
    const newIndex = items.indexOf(over.id as number);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    onReorder(category.id, next);
  }

  return (
    <section>
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
        {category.name}
      </h2>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <ul className="border border-border rounded-md divide-y divide-border">
            {rules.map((r) => (
              <SortableRuleRow
                key={r.id}
                rule={r}
                onToggle={(en) => onToggleEnabled(r, en)}
                onEdit={() => onEdit(r)}
                onDelete={() => onDelete(r)}
                onRun={() => onRun(r)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortableRuleRow({
  rule,
  onToggle,
  onEdit,
  onDelete,
  onRun,
}: {
  rule: Rule;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onRun: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rule.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    zIndex: isDragging ? 10 : undefined,
    background: isDragging ? "var(--accent)" : undefined,
  };

  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 px-2 py-2 text-sm">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1 -my-1"
        aria-label="Réordonner"
      >
        <GripVertical className="size-3.5" />
      </button>
      <Checkbox
        checked={rule.enabled}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={t.regles.enabled}
      />
      <div className="flex-1 min-w-0">
        <div className={rule.enabled ? "font-medium" : "font-medium text-muted-foreground"}>
          {rule.name}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {describePredicate(rule.predicate)}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onRun}
        disabled={!rule.enabled}
        className="text-muted-foreground hover:text-foreground"
        aria-label={t.regles.runRule}
        title={t.regles.runRule}
      >
        <Play className="size-3.5" />
      </Button>
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

type PredicateKind = "libelle_contains" | "montant_compare";

function RuleFormDialog({
  rule,
  cats,
  onClose,
  onSaved,
}: {
  rule: Rule | null;
  cats: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    rule ? String(rule.category_id) : cats[0] ? String(cats[0].id) : "",
  );
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [kind, setKind] = useState<PredicateKind>(rule?.predicate.kind ?? "libelle_contains");
  const [text, setText] = useState(
    rule?.predicate.kind === "libelle_contains" ? rule.predicate.text : "",
  );
  const [op, setOp] = useState<">" | "<" | "==">(
    rule?.predicate.kind === "montant_compare" ? rule.predicate.operator : ">",
  );
  const [amountText, setAmountText] = useState(
    rule?.predicate.kind === "montant_compare"
      ? (rule.predicate.value_cents / 100).toString().replace(".", ",")
      : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = rule !== null;

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
  const valid = name.trim() && categoryId && predicate !== null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || submitting || predicate === null) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await rulesApi.update({
          id: rule.id,
          name: name.trim(),
          category_id: Number(categoryId),
          predicate,
          enabled,
        });
      } else {
        await rulesApi.create({
          name: name.trim(),
          category_id: Number(categoryId),
          predicate,
          enabled,
        });
      }
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
          <DialogTitle>{isEdit ? t.regles.editTitle : t.regles.addTitle}</DialogTitle>
          <DialogDescription>
            {t.regles.predicateLibelleHint}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t.regles.fieldName}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.regles.namePlaceholder}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t.regles.fieldCategory}</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t.regles.fieldPredicate}</Label>
            <div className="flex gap-2">
              <Select value={kind} onValueChange={(v) => setKind(v as PredicateKind)}>
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
                  <Select value={op} onValueChange={(v) => setOp(v as ">" | "<" | "==")}>
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

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={enabled}
              onCheckedChange={(v) => setEnabled(v === true)}
              disabled={submitting}
            />
            <span>{t.regles.enabled}</span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {isEdit ? t.regles.save : t.regles.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function describePredicate(p: Predicate): string {
  if (p.kind === "libelle_contains") {
    return t.regles.predicateLibelleSummary.replace("{text}", p.text);
  }
  return t.regles.predicateMontantSummary
    .replace("{op}", p.operator === "==" ? "=" : p.operator)
    .replace("{amount}", formatEuros(p.value_cents));
}

function groupByCategory(
  rules: Rule[],
  cats: Category[],
): { category: Category; rules: Rule[] }[] {
  const byId = new Map<number, Category>(cats.map((c) => [c.id, c]));
  const groups = new Map<number, { category: Category; rules: Rule[] }>();
  for (const r of rules) {
    const cat = byId.get(r.category_id);
    if (!cat) continue;
    const existing = groups.get(cat.id);
    if (existing) existing.rules.push(r);
    else groups.set(cat.id, { category: cat, rules: [r] });
  }
  // rules.list_all already orders by category name then priority — preserve.
  return [...groups.values()].sort((a, b) =>
    a.category.name.localeCompare(b.category.name, "fr", { sensitivity: "base" }),
  );
}

function parseEurosToCents(input: string): number | null {
  const cleaned = input.replace(/[\s   ]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function formatError(e: unknown): string {
  return e instanceof RpcError ? e.message : String(e);
}
