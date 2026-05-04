import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { fr } from "@/i18n/fr";

type Item = { to: string; label: string };

const primary: Item[] = [
  { to: "/bilan", label: fr.nav.bilan },
  { to: "/operations", label: fr.nav.operations },
];

const secondary: Item[] = [
  { to: "/categories", label: fr.nav.categories },
  { to: "/regles", label: fr.nav.regles },
  { to: "/comptes", label: fr.nav.comptes },
];

function NavItem({ to, label }: Item) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center px-3 py-1.5 text-sm rounded-md transition-colors",
          "hover:bg-sidebar-accent/60",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        )
      }
    >
      {label}
    </NavLink>
  );
}

export function Sidebar() {
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
