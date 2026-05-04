import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { fr } from "@/i18n/fr";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
            aria-label={fr.nav.toggleSidebar}
            className="p-1.5 -ml-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <Menu className="size-4" />
          </button>
          <span className="text-sm font-medium tracking-tight">
            {fr.app.title}
          </span>
        </header>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
