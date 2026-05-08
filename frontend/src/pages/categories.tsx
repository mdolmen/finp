import { useCallback, useEffect, useState } from "react";
import { Check, Lock, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoriesApi, RpcError } from "@/lib/api";
import type { Category } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fr } from "@/i18n/fr";

export function CategoriesPage() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [reassigning, setReassigning] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Category | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCats(await categoriesApi.list());
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function performDelete(cat: Category) {
    try {
      await categoriesApi.delete(cat.id);
      await refresh();
    } catch (e) {
      if (e instanceof RpcError && e.appCode === "category.in_use") {
        setReassigning(cat);
      } else {
        setError(formatError(e));
      }
    }
  }

  return (
    <div className="px-6 py-5 max-w-3xl">
      <div className="flex items-center justify-end mb-5">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />
          {fr.common.add}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {cats === null ? (
        <p className="text-sm text-muted-foreground">{fr.common.loading}</p>
      ) : cats.length === 0 ? (
        <p className="text-sm text-muted-foreground">{fr.categories.empty}</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {cats.map((cat) => (
            <li key={cat.id}>
              {editing?.id === cat.id ? (
                <RenameRow
                  cat={cat}
                  onCancel={() => setEditing(null)}
                  onSaved={async () => {
                    setEditing(null);
                    await refresh();
                  }}
                />
              ) : (
                <CategoryRow
                  cat={cat}
                  onEdit={() => setEditing(cat)}
                  onDelete={() => setDeleteConfirm(cat)}
                  onToggleRecurring={async () => {
                    try {
                      await categoriesApi.setRecurring(cat.id, !cat.is_recurring);
                      await refresh();
                    } catch (e) {
                      setError(formatError(e));
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <AddCategoryDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refresh} />

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(v) => !v && setDeleteConfirm(null)}
        title={
          deleteConfirm
            ? fr.categories.confirmDelete.replace("{name}", deleteConfirm.name)
            : ""
        }
        confirmLabel={fr.common.delete}
        destructive
        onConfirm={() => deleteConfirm && performDelete(deleteConfirm)}
      />

      {reassigning && cats && (
        <ReassignDialog
          source={reassigning}
          others={cats.filter((c) => c.id !== reassigning.id)}
          onClose={() => setReassigning(null)}
          onDone={async () => {
            setReassigning(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function CategoryRow({
  cat,
  onEdit,
  onDelete,
  onToggleRecurring,
}: {
  cat: Category;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRecurring: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className="flex-1 font-medium truncate">{cat.name}</span>
      {cat.is_builtin ? (
        <span
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          title={fr.categories.builtinHint}
        >
          <Lock className="size-3" />
        </span>
      ) : (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleRecurring}
            className={
              cat.is_recurring
                ? "text-credit hover:text-credit"
                : "text-muted-foreground hover:text-foreground"
            }
            aria-label={
              cat.is_recurring ? fr.categories.recurringOn : fr.categories.recurringOff
            }
            title={
              cat.is_recurring ? fr.categories.recurringOn : fr.categories.recurringOff
            }
          >
            <Repeat className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="text-muted-foreground hover:text-foreground"
            aria-label={fr.common.edit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            aria-label={fr.common.delete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}

function RenameRow({
  cat,
  onCancel,
  onSaved,
}: {
  cat: Category;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cat.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || submitting) return;
    if (name.trim() === cat.name) {
      onCancel();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await categoriesApi.rename(cat.id, name.trim());
      onSaved();
    } catch (e) {
      setError(formatError(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          else if (e.key === "Escape") onCancel();
        }}
        className="h-7 flex-1"
        disabled={submitting}
      />
      <Button size="sm" variant="ghost" onClick={save} disabled={submitting}>
        <Check className="size-3.5" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
        <X className="size-3.5" />
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

function AddCategoryDialog({
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
      await categoriesApi.create(name.trim());
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
          <DialogTitle>{fr.categories.addTitle}</DialogTitle>
          <DialogDescription>{fr.categories.addDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={fr.categories.namePlaceholder}
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

const NONE_VALUE = "__none__";

function ReassignDialog({
  source,
  others,
  onClose,
  onDone,
}: {
  source: Category;
  others: Category[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<string>(NONE_VALUE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const toId = target === NONE_VALUE ? null : Number(target);
      await categoriesApi.reassignOperations(source.id, toId);
      await categoriesApi.delete(source.id);
      onDone();
    } catch (e) {
      setError(formatError(e));
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fr.categories.reassignTitle}</DialogTitle>
          <DialogDescription>{fr.categories.reassignBody}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={fr.categories.reassignSelect} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>{fr.categories.reassignNone}</SelectItem>
              {others.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {fr.common.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {fr.categories.reassignConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatError(e: unknown): string {
  if (e instanceof RpcError) {
    if (e.appCode === "conflict") return fr.categories.errorDuplicate;
    return e.message;
  }
  return String(e);
}
