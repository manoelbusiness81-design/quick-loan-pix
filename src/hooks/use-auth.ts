import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "master_admin" | "supervisor" | "user" | "admin";

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  isMasterAdmin: boolean;
  isSupervisor: boolean;
  isVendor: boolean;
  /** Backward-compat: true for master_admin OR supervisor (i.e. "manager"). */
  isAdmin: boolean;
  teamId: string | null;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setRole(null); setTeamId(null); return; }
    const uid = session.user.id;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      const rs = (roles ?? []).map((r) => r.role as AppRole);
      const resolved: AppRole = rs.includes("master_admin")
        ? "master_admin"
        : rs.includes("admin")
        ? "master_admin"
        : rs.includes("supervisor")
        ? "supervisor"
        : "user";
      setRole(resolved);

      // resolve team_id: supervisor of a team, or member of one
      const { data: teamAsSup } = await (supabase.from("teams") as any)
        .select("id").eq("supervisor_id", uid).maybeSingle();
      if (teamAsSup?.id) { setTeamId(teamAsSup.id); return; }
      const { data: tm } = await (supabase.from("team_members") as any)
        .select("team_id").eq("user_id", uid).maybeSingle();
      setTeamId(tm?.team_id ?? null);
    })();
  }, [session?.user?.id]);

  const isMasterAdmin = role === "master_admin";
  const isSupervisor = role === "supervisor";
  const isVendor = role === "user";

  return {
    session,
    user: session?.user ?? null,
    loading,
    role,
    isMasterAdmin,
    isSupervisor,
    isVendor,
    isAdmin: isMasterAdmin || isSupervisor,
    teamId,
  };
}
