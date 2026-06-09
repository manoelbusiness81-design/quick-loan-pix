import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Loader2, Key, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listUsers, createUser, deleteUser, setUserPassword, setUserAdmin, setUserActive } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: role } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", data.session.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw redirect({ to: "/" });
  },
  component: AdminPage,
});

interface AdminUser { id: string; email: string; full_name: string | null; roles: string[]; created_at: string; active: boolean; }

function AdminPage() {
  const { user: me } = useAuth();
  const fnList = useServerFn(listUsers);
  const fnCreate = useServerFn(createUser);
  const fnDelete = useServerFn(deleteUser);
  const fnPwd = useServerFn(setUserPassword);
  const fnAdmin = useServerFn(setUserAdmin);
  const fnActive = useServerFn(setUserActive);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", is_admin: false });
  const [saving, setSaving] = useState(false);
  const [pwdFor, setPwdFor] = useState<AdminUser | null>(null);
  const [newPwd, setNewPwd] = useState("");

  const load = async () => {
    setLoading(true);
    try { const data = await fnList(); setUsers(data as AdminUser[]); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.email || !form.password || !form.full_name) { toast.error("Preencha todos os campos."); return; }
    if (form.password.length < 8) { toast.error("Senha deve ter no mínimo 8 caracteres."); return; }
    setSaving(true);
    try {
      await fnCreate({ data: form });
      toast.success("Usuário criado");
      setOpenNew(false); setForm({ email: "", password: "", full_name: "", is_admin: false });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const del = async (u: AdminUser) => {
    if (!confirm(`Excluir ${u.email}?`)) return;
    try { await fnDelete({ data: { user_id: u.id } }); toast.success("Excluído"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const toggleAdmin = async (u: AdminUser, val: boolean) => {
    try { await fnAdmin({ data: { user_id: u.id, is_admin: val } }); toast.success("Permissão atualizada"); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const toggleActive = async (u: AdminUser) => {
    const action = u.active ? "Desativar" : "Reativar";
    if (!confirm(`${action} ${u.email}? Os dados serão preservados.`)) return;
    try { await fnActive({ data: { user_id: u.id, active: !u.active } }); toast.success(`${action.replace("ar", "ado")}`); load(); }
    catch (e: any) { toast.error(e.message); }
  };

  const savePwd = async () => {
    if (!pwdFor || newPwd.length < 8) { toast.error("Senha mínima 8 caracteres."); return; }
    try { await fnPwd({ data: { user_id: pwdFor.id, password: newPwd } }); toast.success("Senha alterada"); setPwdFor(null); setNewPwd(""); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Usuários</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crie, gerencie e defina permissões de acesso.</p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="h-11 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <div className="rounded-2xl bg-card shadow-soft">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left">Nome</th>
                  <th className="px-5 py-3 text-left">E-mail</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Admin</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isAdmin = u.roles.includes("admin");
                  const isMe = u.id === me?.id;
                  return (
                    <tr key={u.id} className={`border-b border-border/60 last:border-0 ${!u.active ? "opacity-60" : ""}`}>
                      <td className="px-5 py-3 font-medium text-foreground">{u.full_name || "—"} {isMe && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}</td>
                      <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-5 py-3">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                            <span className="h-2 w-2 rounded-full bg-red-500" /> Inativo
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Switch checked={isAdmin} disabled={(isMe && isAdmin) || !u.active} onCheckedChange={(v) => toggleAdmin(u, v)} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex gap-1">
                          {!isMe && (
                            u.active ? (
                              <Button size="icon" variant="ghost" onClick={() => toggleActive(u)} title="Desativar usuário" className="text-red-600 hover:text-red-600"><UserX className="h-4 w-4" /></Button>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => toggleActive(u)} title="Reativar usuário" className="text-emerald-600 hover:text-emerald-600"><UserCheck className="h-4 w-4" /></Button>
                            )
                          )}
                          <Button size="icon" variant="ghost" onClick={() => { setPwdFor(u); setNewPwd(""); }} title="Alterar senha"><Key className="h-4 w-4" /></Button>
                          {!isMe && <Button size="icon" variant="ghost" onClick={() => del(u)} title="Excluir permanentemente" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="h-11" /></div>
            <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11" /></div>
            <div><Label>Senha (mín. 8)</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-11" /></div>
            <label className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium">Administrador</span>
              <Switch checked={form.is_admin} onCheckedChange={(v) => setForm({ ...form, is_admin: v })} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving} className="bg-primary text-primary-foreground">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdFor} onOpenChange={(o) => !o && setPwdFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alterar senha — {pwdFor?.email}</DialogTitle></DialogHeader>
          <div><Label>Nova senha (mín. 8)</Label><Input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="h-11" /></div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwdFor(null)}>Cancelar</Button>
            <Button onClick={savePwd} className="bg-primary text-primary-foreground">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
