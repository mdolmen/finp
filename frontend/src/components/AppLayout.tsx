import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { Sidebar } from "./Sidebar";

const PAGE_TITLES: Record<string, string> = {
  "/bilan": t.bilan.title,
  "/operations": t.operations.title,
  "/categories": t.categories.title,
  "/regles": t.regles.title,
  "/comptes": t.comptes.title,
};

function LanguageToggle() {
  const current = localStorage.getItem("finp-locale") ?? "fr";
  const next = current === "fr" ? "en" : "fr";

  function switchTo() {
    localStorage.setItem("finp-locale", next);
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      className="text-[11px] font-medium tracking-wide uppercase px-2 py-0.5 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title={t.language.label}
    >
      {current === "fr" ? "FR" : "EN"}
    </button>
  );
}

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? "";

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        className={cn(
          "border-r border-sidebar-border bg-sidebar overflow-hidden",
          "transition-[width] duration-200 ease-out",
          sidebarOpen ? "w-56" : "w-0",
        )}
      >
        <div className="w-56 h-full">
          <Sidebar />
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-11 border-b border-border flex items-center gap-3 px-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={t.nav.toggleSidebar}
            className="p-1.5 -ml-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <Menu className="size-4" />
          </button>
          {title && (
            <h1 className="text-sm font-semibold tracking-wide uppercase">
              {title}
            </h1>
          )}
          <div className="ml-auto">
            <LanguageToggle />
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}