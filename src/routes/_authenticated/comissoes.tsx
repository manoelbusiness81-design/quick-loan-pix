import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comissoes")({
  component: CommissionsPage,
});

interface Comm { id: string; taxa: number; percentual: number; }

function CommissionsPage() {
  const { user } = useAuth();
  const [list, setList] = useState<Comm[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Comm | null>(null);
  const [form, setForm] = useState({ taxa: "", percentual: "" });
  const [saving, setSaving] = useState(false);

  const load = () => supabase.from("commissions").select("*").order("taxa").then(({ data }) => setList((data as Comm[]) ?? []));
  useEffect(() => { if (user) load(); }, [user]);

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Comissões</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure o percentual de comissão para cada taxa. Aparece apenas internamente.</p>
        </div>
        <Button onClick={openNew} className="h-11 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95">
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
                <tr><th className="px-5 py-3 text-left">Taxa</th><th className="px-5 py-3 text-left">Comissão</th><th className="px-5 py-3 text-right">Ações</th></tr>
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
            <div><Label>Comissão (%)</Label><Input value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} className="h-11" placeholder="3,500" inputMode="decimal" /></div>
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
