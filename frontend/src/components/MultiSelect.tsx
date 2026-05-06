import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fr } from "@/i18n/fr";
import { cn } from "@/lib/utils";

type Option<T extends string | number> = { value: T; label: string };

export function MultiSelect<T extends string | number>({
  label,
  options,
  selected,
  onChange,
  className,
}: {
  label: string;
  options: Option<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
  className?: string;
}) {
  const summary =
    selected.length === 0
      ? fr.common.all
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? `${selected.length}`
        : `${selected.length} ${fr.common.selected}`;

  function toggle(v: T) {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v]);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("justify-between min-w-32", className)}
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="truncate">{summary}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="start">
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-1.5">{fr.common.empty}</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <li key={String(opt.value)}>
                  <button
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent"
                  >
                    <Checkbox checked={checked} />
                    <span className="flex-1 text-left truncate">{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selected.length > 0 && (
          <div className="border-t border-border mt-1 pt-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent text-left cursor-pointer"
            >
              {fr.common.clearSelection}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
