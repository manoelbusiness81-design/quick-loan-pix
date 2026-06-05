import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SIMULATION_SENT_EVENT } from "@/lib/simulations";

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function SimulationsCounter() {
  const { user, isAdmin } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      let q = (supabase.from("simulations") as any)
        .select("id", { count: "exact", head: true })
        .gte("sent_at", startOfToday());
      if (!isAdmin) q = q.eq("user_id", user.id);
      const { count: c } = await q;
      if (!cancelled) setCount(c ?? 0);
    };
    load();
    const onSent = () => load();
    window.addEventListener(SIMULATION_SENT_EVENT, onSent);
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.removeEventListener(SIMULATION_SENT_EVENT, onSent);
      clearInterval(t);
    };
  }, [user, isAdmin]);

  if (!user) return null;

  return (
    <div className="hidden items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary lg:flex">
      <Send className="h-3.5 w-3.5" />
      <span className="text-muted-foreground">Hoje:</span>
      <span className="font-display text-sm font-extrabold tabular-nums">{count}</span>
      <span className="text-muted-foreground">{count === 1 ? "simulação" : "simulações"}</span>
    </div>
  );
}
