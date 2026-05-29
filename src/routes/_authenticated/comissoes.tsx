import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Building2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { pct } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { listUsers } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/comissoes")({
  component: CommissionsPage,
});

interface Comm { id: string; taxa: number; percentual: number; }
interface SellerComm { id: string; user_id: string; taxa: number; percentual: number; }
interface SimpleUser { id: string; email: string; full_name: string | null; roles: string[] }

function CommissionsPage() {
  const { user, isAdmin } = useAuth();

  if (!isAdmin) return <VendorView userId={user?.id ?? ""} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Comissões</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure a comissão total da empresa e o repasse individual de cada vendedor.</p>
      </div>
      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa" className="gap-2"><Building2 className="h-4 w-4" /> Empresa</TabsTrigger>
          <TabsTrigger value="vendedores" className="gap-2"><Users className="h-4 w-4" /> Vendedores</TabsTrigger>
        </TabsList>
        <TabsContent value="empresa" className="mt-5"><CompanyCommissions /></TabsContent>
        <TabsContent value="vendedores" className="mt-5"><SellerCommissions /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ EMPRESA ============================ */
function CompanyCommissions() {
  const { user } = useAuth();
  const [list, setList] = useState<Comm[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Comm | null>(null);
  const [form, setForm] = useState({ taxa: "", percentual: "" });
  const [saving, setSaving] = useState(false);

  const load = () => supabase.from("commissions").select("*").order("taxa").then(({ data }) => setList((data as Comm[]) ?? []));
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ taxa: "", percentual: "" }); setOpen(true); };
  const openEdit = (c: Comm) => {
    setEditing(c);
    setForm({ taxa: String(c.taxa).replace(".", ","), percentual: String(c.percentual).replace(".", ",") });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.taxa || !form.percentual) { toast.error("Preencha todos os campos."); return; }
    setSaving(true);
    const payload = {
      taxa: parseFloat(form.taxa.replace(",", ".")),
      percentual: parseFloat(form.percentual.replace(",", ".")),
      owner_id: user.id,
    };
    const { error } = editing
      ? await supabase.from("commissions").update(payload).eq("id", editing.id)
      : await supabase.from("commissions").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Comissão atualizada" : "Comissão criada");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta comissão?")) return;
    const { error } = await supabase.from("commissions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído"); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">Comissão total recebida pela empresa, por taxa.</p>
        <Button onClick={openNew} className="h-10 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> Nova comissão
        </Button>
      </div>
      <div className="rounded-2xl bg-card shadow-soft">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma comissão cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3 text-left">Taxa</th><th className="px-5 py-3 text-left">Comissão empresa</th><th className="px-5 py-3 text-right">Ações</th></tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium tabular-nums">{pct(Number(c.taxa))}</td>
                    <td className="px-5 py-3 font-display font-semibold tabular-nums text-brand">{pct(Number(c.percentual), 3)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(c.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar comissão" : "Nova comissão"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Taxa (%)</Label><Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} className="h-11" placeholder="1,79" inputMode="decimal" /></div>
            <div><Label>Comissão (%)</Label><Input value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} className="h-11" placeholder="8,000" inputMode="decimal" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ VENDEDORES ============================ */
function SellerCommissions() {
  const fnList = useServerFn(listUsers);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [list, setList] = useState<SellerComm[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SellerComm | null>(null);
  const [form, setForm] = useState({ user_id: "", taxa: "", percentual: "" });
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    try { setUsers((await fnList()) as SimpleUser[]); } catch (e: any) { toast.error(e.message); }
    const { data } = await (supabase.from as any)("seller_commissions").select("*").order("taxa");
    setList((data as SellerComm[]) ?? []);
  };
  useEffect(() => { loadAll(); }, []);

  const userName = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? (u.full_name || u.email) : id.slice(0, 8);
  };

  const openNew = () => { setEditing(null); setForm({ user_id: "", taxa: "", percentual: "" }); setOpen(true); };
  const openEdit = (s: SellerComm) => {
    setEditing(s);
    setForm({ user_id: s.user_id, taxa: String(s.taxa).replace(".", ","), percentual: String(s.percentual).replace(".", ",") });
    setOpen(true);
  };

  const save = async () => {
    if (!form.user_id || !form.taxa || !form.percentual) { toast.error("Preencha todos os campos."); return; }
    setSaving(true);
    const payload = {
      user_id: form.user_id,
      taxa: parseFloat(form.taxa.replace(",", ".")),
      percentual: parseFloat(form.percentual.replace(",", ".")),
    };
    const tbl = (supabase.from as any)("seller_commissions");
    const { error } = editing
      ? await tbl.update(payload).eq("id", editing.id)
      : await tbl.insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false); loadAll();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta comissão?")) return;
    const { error } = await (supabase.from as any)("seller_commissions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído"); loadAll();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">Repasse individual por vendedor e por taxa. Aplica-se sobre o valor bruto do contrato.</p>
        <Button onClick={openNew} className="h-10 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> Nova
        </Button>
      </div>
      <div className="rounded-2xl bg-card shadow-soft">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma comissão de vendedor cadastrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3 text-left">Vendedor</th><th className="px-5 py-3 text-left">Taxa</th><th className="px-5 py-3 text-left">% Vendedor</th><th className="px-5 py-3 text-right">Ações</th></tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{userName(s.user_id)}</td>
                    <td className="px-5 py-3 tabular-nums">{pct(Number(s.taxa))}</td>
                    <td className="px-5 py-3 font-display font-semibold tabular-nums text-brand">{pct(Number(s.percentual), 3)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(s.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar comissão do vendedor" : "Nova comissão do vendedor"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Vendedor</Label>
              <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })} disabled={!!editing}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o vendedor" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Taxa (%)</Label><Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} className="h-11" placeholder="1,79" inputMode="decimal" /></div>
              <div><Label>% Vendedor</Label><Input value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} className="h-11" placeholder="3,000" inputMode="decimal" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ VISÃO VENDEDOR ============================ */
function VendorView({ userId }: { userId: string }) {
  const [list, setList] = useState<SellerComm[]>([]);
  useEffect(() => {
    if (!userId) return;
    (supabase.from as any)("seller_commissions").select("*").eq("user_id", userId).order("taxa")
      .then(({ data }: any) => setList((data as SellerComm[]) ?? []));
  }, [userId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Minhas comissões</h1>
        <p className="mt-1 text-sm text-muted-foreground">Percentual que você recebe sobre o valor bruto do contrato.</p>
      </div>
      <div className="rounded-2xl bg-card shadow-soft">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma comissão definida. Fale com o administrador.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-5 py-3 text-left">Taxa</th><th className="px-5 py-3 text-left">Minha comissão</th></tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 tabular-nums">{pct(Number(s.taxa))}</td>
                    <td className="px-5 py-3 font-display font-semibold tabular-nums text-brand">{pct(Number(s.percentual), 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
