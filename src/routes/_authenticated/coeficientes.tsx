import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/coeficientes")({
  component: CoefficientsPage,
});

type Modalidade = "refinanciamento" | "novo_emprestimo";
interface Coef { id: string; bank: string; prazo: number; taxa: number; coeficiente: number; modalidade: Modalidade; }

const MOD_LABEL: Record<Modalidade, string> = {
  refinanciamento: "Refinanciamento",
  novo_emprestimo: "Novo Empréstimo",
};

function CoefficientsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Modalidade>("refinanciamento");
  const [list, setList] = useState<Coef[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coef | null>(null);
  const [form, setForm] = useState({ bank: "", prazo: "", taxa: "", coeficiente: "", modalidade: "refinanciamento" as Modalidade });
  const [saving, setSaving] = useState(false);

  const load = () =>
    (supabase.from("coefficients") as any)
      .select("*")
      .eq("modalidade", filter)
      .order("bank")
      .order("prazo")
      .then(({ data }: any) => setList((data as Coef[]) ?? []));

  useEffect(() => { if (user) load(); }, [user, filter]);

  const openNew = () => {
    setEditing(null);
    setForm({ bank: "", prazo: "", taxa: "", coeficiente: "", modalidade: filter });
    setOpen(true);
  };
  const openEdit = (c: Coef) => {
    setEditing(c);
    setForm({
      bank: c.bank,
      prazo: String(c.prazo),
      taxa: String(c.taxa).replace(".", ","),
      coeficiente: String(c.coeficiente).replace(".", ","),
      modalidade: c.modalidade ?? "refinanciamento",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!form.bank || !form.prazo || !form.taxa || !form.coeficiente) { toast.error("Preencha todos os campos."); return; }
    setSaving(true);
    const payload: any = {
      bank: form.bank.trim(),
      prazo: parseInt(form.prazo),
      taxa: parseFloat(form.taxa.replace(",", ".")),
      coeficiente: parseFloat(form.coeficiente.replace(",", ".")),
      modalidade: form.modalidade,
      owner_id: user.id,
    };
    const { error } = editing
      ? await (supabase.from("coefficients") as any).update(payload).eq("id", editing.id)
      : await (supabase.from("coefficients") as any).insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Coeficiente atualizado" : "Coeficiente criado");
    setOpen(false); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este coeficiente?")) return;
    const { error } = await supabase.from("coefficients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluído"); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Coeficientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre tabelas por modalidade, banco, prazo e taxa.</p>
        </div>
        <Button onClick={openNew} className="h-11 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95">
          <Plus className="mr-2 h-4 w-4" /> Novo coeficiente
        </Button>
      </div>

      {/* Tabs modalidade */}
      <div className="inline-flex rounded-xl bg-secondary p-1">
        {(["refinanciamento", "novo_emprestimo"] as Modalidade[]).map((m) => (
          <button
            key={m}
            onClick={() => setFilter(m)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              filter === m ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {MOD_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-card shadow-soft">
        {list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhum coeficiente cadastrado para <strong>{MOD_LABEL[filter]}</strong>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-left">Banco</th>
                  <th className="px-5 py-3 text-left">Prazo</th>
                  <th className="px-5 py-3 text-left">Taxa</th>
                  <th className="px-5 py-3 text-left">Coeficiente</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">{c.bank}</td>
                    <td className="px-5 py-3 tabular-nums">{c.prazo} meses</td>
                    <td className="px-5 py-3 tabular-nums">{pct(Number(c.taxa))}</td>
                    <td className="px-5 py-3 font-display font-semibold tabular-nums text-brand">{Number(c.coeficiente).toFixed(8)}</td>
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
          <DialogHeader><DialogTitle>{editing ? "Editar coeficiente" : "Novo coeficiente"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Modalidade</Label>
              <Select value={form.modalidade} onValueChange={(v) => setForm({ ...form, modalidade: v as Modalidade })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="refinanciamento">Refinanciamento</SelectItem>
                  <SelectItem value="novo_emprestimo">Novo Empréstimo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Banco</Label><Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} className="h-11" placeholder="Banco X" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Prazo</Label><Input value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value.replace(/\D/g, "") })} className="h-11" placeholder="84" inputMode="numeric" /></div>
              <div><Label>Taxa (%)</Label><Input value={form.taxa} onChange={(e) => setForm({ ...form, taxa: e.target.value })} className="h-11" placeholder="1,79" inputMode="decimal" /></div>
              <div><Label>Coeficiente</Label><Input value={form.coeficiente} onChange={(e) => setForm({ ...form, coeficiente: e.target.value })} className="h-11" placeholder="0,02298190" inputMode="decimal" /></div>
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
