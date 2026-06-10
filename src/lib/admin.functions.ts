import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type UserRole = "master_admin" | "supervisor" | "user";

async function getRole(userId: string): Promise<UserRole | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const rs = (data ?? []).map((r) => r.role as string);
  if (rs.includes("master_admin") || rs.includes("admin")) return "master_admin";
  if (rs.includes("supervisor")) return "supervisor";
  return "user";
}

async function assertMasterAdmin(userId: string) {
  const r = await getRole(userId);
  if (r !== "master_admin") throw new Error("Acesso negado: apenas Master Admin.");
}

async function getTeamOf(userId: string): Promise<string | null> {
  const { data: t } = await supabaseAdmin.from("teams").select("id").eq("supervisor_id", userId).maybeSingle();
  if (t?.id) return t.id;
  const { data: m } = await supabaseAdmin.from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  return (m?.team_id as string | undefined) ?? null;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const callerRole = await getRole(context.userId);
    if (callerRole === "user") throw new Error("Acesso negado.");

    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);

    const ids = users.users.map((u) => u.id);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids);
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
    const { data: teams } = await supabaseAdmin.from("teams").select("id, name, supervisor_id");
    const { data: members } = await supabaseAdmin.from("team_members").select("user_id, team_id").in("user_id", ids);

    const now = Date.now();
    const all = users.users.map((u) => {
      const bannedUntil = (u as any).banned_until as string | null | undefined;
      const banned = !!bannedUntil && new Date(bannedUntil).getTime() > now;
      const userRoles = (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as string);
      let resolvedRole: UserRole = "user";
      if (userRoles.includes("master_admin") || userRoles.includes("admin")) resolvedRole = "master_admin";
      else if (userRoles.includes("supervisor")) resolvedRole = "supervisor";

      const supervisedTeam = teams?.find((t) => t.supervisor_id === u.id) ?? null;
      const memberTeamId = members?.find((m) => m.user_id === u.id)?.team_id ?? null;
      const teamId = supervisedTeam?.id ?? memberTeamId ?? null;
      const teamName = teamId ? (teams?.find((t) => t.id === teamId)?.name ?? null) : null;

      return {
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        full_name: profiles?.find((p) => p.id === u.id)?.full_name ?? null,
        role: resolvedRole,
        roles: userRoles,
        active: !banned,
        team_id: teamId,
        team_name: teamName,
      };
    });

    if (callerRole === "master_admin") return all;

    // Supervisor: only their team's users (themselves + vendors in their team)
    const myTeam = await getTeamOf(context.userId);
    if (!myTeam) return all.filter((u) => u.id === context.userId);
    const teamUserIds = new Set<string>([context.userId]);
    (members ?? []).filter((m) => m.team_id === myTeam).forEach((m) => teamUserIds.add(m.user_id));
    return all.filter((u) => teamUserIds.has(u.id));
  });

export const listTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const callerRole = await getRole(context.userId);
    if (callerRole === "user") throw new Error("Acesso negado.");
    const { data, error } = await supabaseAdmin
      .from("teams")
      .select("id, name, supervisor_id, created_at")
      .order("name");
    if (error) throw new Error(error.message);
    if (callerRole === "master_admin") return data ?? [];
    return (data ?? []).filter((t) => t.supervisor_id === context.userId);
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      email: z.string().email().max(255),
      password: z.string().min(8).max(72),
      full_name: z.string().trim().min(1).max(120),
      role: z.enum(["supervisor", "user"]).default("user"),
      team_id: z.string().uuid().optional().nullable(),
      team_name: z.string().trim().min(1).max(120).optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Falha ao criar usuário.");

    // Remove default 'user' role only if assigning a different one
    if (data.role !== "user") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newId).eq("role", "user");
      await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });
    }

    if (data.role === "supervisor") {
      const name = (data.team_name ?? "").trim();
      if (!name) throw new Error("Informe o nome da equipe para o supervisor.");
      const { error: tErr } = await supabaseAdmin.from("teams").insert({ name, supervisor_id: newId });
      if (tErr) throw new Error(tErr.message);
    } else if (data.role === "user" && data.team_id) {
      const { error: mErr } = await supabaseAdmin.from("team_members").insert({ user_id: newId, team_id: data.team_id });
      if (mErr) throw new Error(mErr.message);
    }

    return { id: newId };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("Você não pode excluir sua própria conta.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(["master_admin", "supervisor", "user"]),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    if (data.user_id === context.userId && data.role !== "master_admin") {
      throw new Error("Você não pode rebaixar seu próprio papel.");
    }
    // Wipe role-defining rows, keep nothing else
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).in("role", ["master_admin", "admin", "supervisor", "user"]);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
    return { ok: true };
  });

/** Backward-compatible alias for older callers. */
export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid(), is_admin: z.boolean() }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    if (data.user_id === context.userId && !data.is_admin) {
      throw new Error("Você não pode remover seu próprio acesso de Master Admin.");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).in("role", ["master_admin", "admin", "supervisor", "user"]);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.is_admin ? "master_admin" : "user" });
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid(), active: z.boolean() }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    if (!data.active && data.user_id === context.userId) {
      throw new Error("Você não pode desativar sua própria conta.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      supervisor_id: z.string().uuid().optional().nullable(),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("teams")
      .insert({ name: data.name, supervisor_id: data.supervisor_id ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(120).optional(),
      supervisor_id: z.string().uuid().nullable().optional(),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.supervisor_id !== undefined) patch.supervisor_id = data.supervisor_id;
    const { error } = await supabaseAdmin.from("teams").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    const { error } = await supabaseAdmin.from("teams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      user_id: z.string().uuid(),
      team_id: z.string().uuid().nullable(),
    }).parse(input)
  )
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    // Remove any existing membership; if team_id provided, set new
    await supabaseAdmin.from("team_members").delete().eq("user_id", data.user_id);
    if (data.team_id) {
      const { error } = await supabaseAdmin.from("team_members").insert({ user_id: data.user_id, team_id: data.team_id });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
