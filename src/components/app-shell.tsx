import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Calculator, ListTree, Percent, Users, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Simulador", icon: Calculator },
  { to: "/coeficientes", label: "Coeficientes", icon: ListTree },
  { to: "/comissoes", label: "Comissões", icon: Percent },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  const items = [...navItems, ...(isAdmin ? [{ to: "/admin", label: "Usuários", icon: Users }] : [])];

  return (
    <div className="min-h-screen bg-gradient-surface">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-brand shadow-brand">
              <Calculator className="h-5 w-5 text-brand-foreground" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-bold text-foreground">ConsigFlow</div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Simulador</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {items.map((it) => {
              const active = pathname === it.to;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <it.icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <div className="text-right leading-tight">
              <div className="text-xs font-medium text-foreground">{user?.user_metadata?.full_name || user?.email}</div>
              {isAdmin && <div className="text-[10px] font-semibold uppercase text-brand">Admin</div>}
            </div>
            <button onClick={handleLogout} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <button className="grid h-9 w-9 place-items-center rounded-lg text-foreground md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-border/60 bg-background md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 p-3">
              {items.map((it) => {
                const active = pathname === it.to;
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium",
                      active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                    )}
                  >
                    <it.icon className="h-5 w-5" />
                    {it.label}
                  </Link>
                );
              })}
              <button onClick={handleLogout} className="mt-1 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-destructive hover:bg-muted">
                <LogOut className="h-5 w-5" />
                Sair ({user?.email})
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 md:py-10">{children}</main>
    </div>
  );
}
