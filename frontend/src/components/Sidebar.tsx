import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { automationsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

type Item = { to: string; label: string; badge?: number };

function useAutomationPendingCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const items = await automationsApi.pending.list();
        if (!cancelled) setCount(items.length);
      } catch {
        // Sidebar is best-effort; failures are surfaced by the page itself.
      }
    }
    fetchCount();
    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(fetchCount, 30_000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, []);

  return count;
}

function NavItem({ to, label, badge }: Item) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
          "hover:bg-sidebar-accent/60",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        )
      }
    >
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs rounded-full bg-primary text-primary-foreground">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const pendingCount = useAutomationPendingCount();

  const primary: Item[] = [
    { to: "/bilan", label: t.nav.bilan },
    { to: "/operations", label: t.nav.operations },
    { to: "/automatisations", label: t.nav.automatisations, badge: pendingCount },
  ];
  const secondary: Item[] = [
    { to: "/categories", label: t.nav.categories },
    { to: "/regles", label: t.nav.regles },
    { to: "/comptes", label: t.nav.comptes },
  ];

  return (
    <nav className="flex flex-col gap-0.5 p-2 text-sidebar-foreground">
      {primary.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
      <div className="my-2 mx-3 h-px bg-sidebar-border" />
      {secondary.map((item) => (
        <NavItem key={item.to} {...item} />
      ))}
    </nav>
  );
}
