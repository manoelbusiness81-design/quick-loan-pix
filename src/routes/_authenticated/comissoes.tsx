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

type Modalidade = "refinanciamento" | "novo_emprestimo" | "novo_normal";
const MOD_LABEL: Record<Modalidade, string> = {
  refinanciamento: "Refinanciamento",
  novo_emprestimo: "Novo LOAS",
  novo_normal: "Novo Normal",
};
const CARENCIAS = [
  { dias: 0, label: "Sem carência" },
  { dias: 30, label: "30 dias" },
  { dias: 60, label: "60 dias" },
  { dias: 90, label: "90 dias" },
] as const;

interface Comm { id: string; taxa: number | null; percentual: number; modalidade: Modalidade; carencia: number | null; }
interface SellerComm { id: string; user_id: string; taxa: number | null; percentual: number; modalidade: Modalidade; carencia: number | null; }
interface SimpleUser { id: string; email: string; full_name: string | null; roles: string[] }

function CommissionsPage() {
  const { user, isAdmin } = useAuth();
  const [mod, setMod] = useState<Modalidade>("refinanciamento");

  if (!isAdmin) return <VendorView userId={user?.id ?? ""} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Comissões</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure a comissão da empresa e o repasse do vendedor por produto.</p>
      </div>

      <div className="inline-flex rounded-xl bg-secondary p-1">
        {(["refinanciamento", "novo_emprestimo", "novo_normal"] as Modalidade[]).map((m) => (
          <button
            key={m}
            onClick={() => setMod(m)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              mod === m ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {MOD_LABEL[m]}
          </button>
        ))}
      </div>

      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa" className="gap-2"><Building2 className="h-4 w-4" /> Empresa</TabsTrigger>
          <TabsTrigger value="vendedores" className="gap-2"><Users className="h-4 w-4" /> Vendedores</TabsTrigger>
        </TabsList>
        <TabsContent value="empresa" className="mt-5"><CompanyCommissions mod={mod} /></TabsContent>
        <TabsContent value="vendedores" className="mt-5"><SellerCommissions mod={mod} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================ EMPRESA ============================ */
function CompanyCommissions({ mod }: { mod: Modalidade }) {
  const { user, isMasterAdmin, teamId } = useAuth();
  const [list, setList] = useState<Comm[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Comm | null>(null);
  const [form, setForm] = useState({ taxa: "", percentual: "", carencia: "0" });
  const [saving, setSaving] = useState(false);

  const load = () =>
    (supabase.from("commissions") as any)
      .select("*")
      .eq("modalidade", mod)
      .order("taxa", { nullsFirst: true })
      .order("carencia", { nullsFirst: true })
      .then(({ data }: any) => setList((data as Comm[]) ?? []));
  useEffect(() => { load(); }, [mod]);

  const openNew = () => { setEditing(null); setForm({ taxa: "", percentual: "", carencia: "0" }); setOpen(true); };
  const openEdit = (c: Comm) => {
    setEditing(c);
    setForm({
      taxa: c.taxa != null ? String(c.taxa).replace(".", ",") : "",
      percentual: String(c.percentual).replace(".", ","),
      carencia: c.carencia != null ? String(c.carencia) : "0",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.percentual) { toast.error("Informe o percentual."); return; }
    if (mod === "refinanciamento" && !form.taxa) { toast.error("Informe a taxa."); return; }
    setSaving(true);
    const payload: any = {
      taxa: mod === "refinanciamento" ? parseFloat(form.taxa.replace(",", ".")) : null,
      percentual: parseFloat(form.percentual.replace(",", ".")),
      modalidade: mod,
      carencia: mod === "novo_normal" ? parseInt(form.carencia) : null,
      owner_id: user.id,
      // Master Admin saves as global (NULL); supervisor saves under their team.
      team_id: isMasterAdmin ? null : (teamId ?? null),
    };
    const { error } = editing
      ? await (supabase.from("commissions") as any).update(payload).eq("id", editing.id)
      : await (supabase.from("commissions") as any).insert(payload);
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

  const showTaxa = mod === "refinanciamento";
  const showCarencia = mod === "novo_normal";

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          {mod === "refinanciamento" && "Comissão total da empresa, por taxa."}
          {mod === "novo_emprestimo" && "Comissão fixa da empresa para Novo LOAS."}
          {mod === "novo_normal" && "Comissão da empresa por tabela de carência (Sem carência, 30, 60 e 90 dias)."}
        </p>
        <Button onClick={openNew} className="h-10 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> Nova comissão
        </Button>
      </div>
      <div className="rounded-2xl bg-card shadow-soft">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma comissão cadastrada para <strong>{MOD_LABEL[mod]}</strong>.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  {showTaxa && <th className="px-5 py-3 text-left">Taxa</th>}
                  {showCarencia && <th className="px-5 py-3 text-left">Tabela</th>}
                  <th className="px-5 py-3 text-left">Comissão empresa</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    {showTaxa && <td className="px-5 py-3 font-medium tabular-nums">{c.taxa != null ? pct(Number(c.taxa)) : "—"}</td>}
                    {showCarencia && <td className="px-5 py-3 font-medium">{CARENCIAS.find(x => x.dias === c.carencia)?.label ?? "—"}</td>}
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
          <DialogHeader><DialogTitle>{editing ? "Editar comissão" : "Nova comissão"} — {MOD_LABEL[mod]}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {showTaxa && (
              <div><Label>Taxa (%)</Label><Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} className="h-11" placeholder="1,79" inputMode="decimal" /></div>
            )}
            {showCarencia && (
              <div>
                <Label>Tabela de carência</Label>
                <Select value={form.carencia} onValueChange={(v) => setForm({ ...form, carencia: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARENCIAS.map((c) => <SelectItem key={c.dias} value={String(c.dias)}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={showTaxa || showCarencia ? "" : "col-span-2"}>
              <Label>Comissão empresa (%)</Label>
              <Input value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} className="h-11" placeholder="8,000" inputMode="decimal" />
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

/* ============================ VENDEDORES ============================ */
function SellerCommissions({ mod }: { mod: Modalidade }) {
  const fnList = useServerFn(listUsers);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [list, setList] = useState<SellerComm[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SellerComm | null>(null);
  const [form, setForm] = useState({ user_id: "", taxa: "", percentual: "", carencia: "0" });
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    try { setUsers((await fnList()) as SimpleUser[]); } catch (e: any) { toast.error(e.message); }
    const { data } = await (supabase.from as any)("seller_commissions")
      .select("*")
      .eq("modalidade", mod)
      .order("taxa", { nullsFirst: true })
      .order("carencia", { nullsFirst: true });
    setList((data as SellerComm[]) ?? []);
  };
  useEffect(() => { loadAll(); }, [mod]);

  const userName = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? (u.full_name || u.email) : id.slice(0, 8);
  };

  const openNew = () => { setEditing(null); setForm({ user_id: "", taxa: "", percentual: "", carencia: "0" }); setOpen(true); };
  const openEdit = (s: SellerComm) => {
    setEditing(s);
    setForm({
      user_id: s.user_id,
      taxa: s.taxa != null ? String(s.taxa).replace(".", ",") : "",
      percentual: String(s.percentual).replace(".", ","),
      carencia: s.carencia != null ? String(s.carencia) : "0",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.user_id || !form.percentual) { toast.error("Preencha todos os campos."); return; }
    if (mod === "refinanciamento" && !form.taxa) { toast.error("Informe a taxa."); return; }
    setSaving(true);
    const payload: any = {
      user_id: form.user_id,
      taxa: mod === "refinanciamento" ? parseFloat(form.taxa.replace(",", ".")) : null,
      percentual: parseFloat(form.percentual.replace(",", ".")),
      modalidade: mod,
      carencia: mod === "novo_normal" ? parseInt(form.carencia) : null,
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

  const showTaxa = mod === "refinanciamento";
  const showCarencia = mod === "novo_normal";

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          Repasse individual por vendedor — {MOD_LABEL[mod]}. Aplica-se sobre o valor bruto do contrato.
        </p>
        <Button onClick={openNew} className="h-10 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> Nova
        </Button>
      </div>
      <div className="rounded-2xl bg-card shadow-soft">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma comissão de vendedor cadastrada para <strong>{MOD_LABEL[mod]}</strong>.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left">Vendedor</th>
                  {showTaxa && <th className="px-5 py-3 text-left">Taxa</th>}
                  {showCarencia && <th className="px-5 py-3 text-left">Tabela</th>}
                  <th className="px-5 py-3 text-left">% Vendedor</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{userName(s.user_id)}</td>
                    {showTaxa && <td className="px-5 py-3 tabular-nums">{s.taxa != null ? pct(Number(s.taxa)) : "—"}</td>}
                    {showCarencia && <td className="px-5 py-3">{CARENCIAS.find(x => x.dias === s.carencia)?.label ?? "—"}</td>}
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
          <DialogHeader><DialogTitle>{editing ? "Editar comissão do vendedor" : "Nova comissão do vendedor"} — {MOD_LABEL[mod]}</DialogTitle></DialogHeader>
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
              {showTaxa && (
                <div><Label>Taxa (%)</Label><Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} className="h-11" placeholder="1,79" inputMode="decimal" /></div>
              )}
              {showCarencia && (
                <div>
                  <Label>Tabela de carência</Label>
                  <Select value={form.carencia} onValueChange={(v) => setForm({ ...form, carencia: v })}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CARENCIAS.map((c) => <SelectItem key={c.dias} value={String(c.dias)}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={showTaxa || showCarencia ? "" : "col-span-2"}>
                <Label>% Vendedor</Label>
                <Input value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} className="h-11" placeholder="3,000" inputMode="decimal" />
              </div>
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
    (supabase.from as any)("seller_commissions")
      .select("*")
      .eq("user_id", userId)
      .order("modalidade")
      .order("taxa", { nullsFirst: true })
      .order("carencia", { nullsFirst: true })
      .then(({ data }: any) => setList((data as SellerComm[]) ?? []));
  }, [userId]);

  const grouped: Record<Modalidade, SellerComm[]> = {
    refinanciamento: list.filter(s => s.modalidade === "refinanciamento"),
    novo_emprestimo: list.filter(s => s.modalidade === "novo_emprestimo"),
    novo_normal: list.filter(s => s.modalidade === "novo_normal"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Minhas comissões</h1>
        <p className="mt-1 text-sm text-muted-foreground">Percentual que você recebe sobre o valor bruto do contrato.</p>
      </div>

      {list.length === 0 && (
        <div className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">
          Nenhuma comissão definida. Fale com o administrador.
        </div>
      )}

      {(["refinanciamento", "novo_emprestimo", "novo_normal"] as Modalidade[]).map((m) => {
        const rows = grouped[m];
        if (rows.length === 0) return null;
        const showTaxa = m === "refinanciamento";
        const showCarencia = m === "novo_normal";
        return (
          <div key={m} className="rounded-2xl bg-card shadow-soft">
            <div className="border-b border-border px-5 py-3 font-display text-sm font-bold text-foreground">{MOD_LABEL[m]}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {showTaxa && <th className="px-5 py-3 text-left">Taxa</th>}
                    {showCarencia && <th className="px-5 py-3 text-left">Tabela</th>}
                    {!showTaxa && !showCarencia && <th className="px-5 py-3 text-left">Produto</th>}
                    <th className="px-5 py-3 text-left">Minha comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b border-border/60 last:border-0">
                      {showTaxa && <td className="px-5 py-3 tabular-nums">{s.taxa != null ? pct(Number(s.taxa)) : "—"}</td>}
                      {showCarencia && <td className="px-5 py-3">{CARENCIAS.find(x => x.dias === s.carencia)?.label ?? "—"}</td>}
                      {!showTaxa && !showCarencia && <td className="px-5 py-3">{MOD_LABEL[m]}</td>}
                      <td className="px-5 py-3 font-display font-semibold tabular-nums text-brand">{pct(Number(s.percentual), 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
