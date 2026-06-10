import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Save, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  WHATSAPP_MESSAGE_KEY,
  DEFAULT_WHATSAPP_MESSAGE,
  renderWhatsappMessage,
} from "@/lib/whatsapp";
import {
  REACTIVATION_MESSAGE_KEY,
  DEFAULT_REACTIVATION_MESSAGE,
  renderReactivationMessage,
} from "@/lib/simulations";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { user, isMasterAdmin } = useAuth();
  const isAdmin = isMasterAdmin;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingReact, setSavingReact] = useState(false);
  const [message, setMessage] = useState<string>(DEFAULT_WHATSAPP_MESSAGE);
  const [reactMsg, setReactMsg] = useState<string>(DEFAULT_REACTIVATION_MESSAGE);
  const [alsoGlobalWa, setAlsoGlobalWa] = useState(false);
  const [alsoGlobalRx, setAlsoGlobalRx] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const [{ data: waOwn }, { data: rxOwn }, { data: waGlobal }, { data: rxGlobal }] = await Promise.all([
        (supabase.from("user_settings") as any).select("value").eq("user_id", user.id).eq("key", WHATSAPP_MESSAGE_KEY).maybeSingle(),
        (supabase.from("user_settings") as any).select("value").eq("user_id", user.id).eq("key", REACTIVATION_MESSAGE_KEY).maybeSingle(),
        (supabase.from("app_settings") as any).select("value").eq("key", WHATSAPP_MESSAGE_KEY).maybeSingle(),
        (supabase.from("app_settings") as any).select("value").eq("key", REACTIVATION_MESSAGE_KEY).maybeSingle(),
      ]);
      setMessage((waOwn?.value as string) || (waGlobal?.value as string) || DEFAULT_WHATSAPP_MESSAGE);
      setReactMsg((rxOwn?.value as string) || (rxGlobal?.value as string) || DEFAULT_REACTIVATION_MESSAGE);
      setLoading(false);
    })();
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    if (!message.trim()) { toast.error("A mensagem não pode ficar em branco."); return; }
    setSaving(true);
    const { error } = await (supabase.from("user_settings") as any).upsert(
      { user_id: user.id, key: WHATSAPP_MESSAGE_KEY, value: message, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
    if (!error && isAdmin && alsoGlobalWa) {
      await (supabase.from("app_settings") as any).upsert(
        { key: WHATSAPP_MESSAGE_KEY, value: message, updated_at: new Date().toISOString(), updated_by: user.id },
        { onConflict: "key" }
      );
    }
    setSaving(false);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success("Mensagem salva com sucesso");
  };

  const saveReact = async () => {
    if (!user?.id) return;
    if (!reactMsg.trim()) { toast.error("A mensagem de reativação não pode ficar em branco."); return; }
    setSavingReact(true);
    const { error } = await (supabase.from("user_settings") as any).upsert(
      { user_id: user.id, key: REACTIVATION_MESSAGE_KEY, value: reactMsg, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    );
    if (!error && isAdmin && alsoGlobalRx) {
      await (supabase.from("app_settings") as any).upsert(
        { key: REACTIVATION_MESSAGE_KEY, value: reactMsg, updated_at: new Date().toISOString(), updated_by: user.id },
        { onConflict: "key" }
      );
    }
    setSavingReact(false);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success("Mensagem de reativação salva");
  };

  const resetWa = async () => {
    if (!user?.id) return;
    await (supabase.from("user_settings") as any).delete().eq("user_id", user.id).eq("key", WHATSAPP_MESSAGE_KEY);
    const { data: g } = await (supabase.from("app_settings") as any).select("value").eq("key", WHATSAPP_MESSAGE_KEY).maybeSingle();
    setMessage((g?.value as string) || DEFAULT_WHATSAPP_MESSAGE);
    toast.success("Mensagem redefinida para o padrão");
  };

  const resetRx = async () => {
    if (!user?.id) return;
    await (supabase.from("user_settings") as any).delete().eq("user_id", user.id).eq("key", REACTIVATION_MESSAGE_KEY);
    const { data: g } = await (supabase.from("app_settings") as any).select("value").eq("key", REACTIVATION_MESSAGE_KEY).maybeSingle();
    setReactMsg((g?.value as string) || DEFAULT_REACTIVATION_MESSAGE);
    toast.success("Mensagem redefinida para o padrão");
  };

  const preview = renderWhatsappMessage(message, 8542.33);
  const reactPreview = renderReactivationMessage(reactMsg, { nome: "João da Silva", valorLiberado: 8542.33 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Minhas Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize suas próprias mensagens enviadas aos clientes. As alterações afetam apenas a sua conta.
        </p>
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold text-foreground">Mensagem Padrão do WhatsApp</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Utilizada em todas as simulações que você envia pelo WhatsApp.</p>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Mensagem</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className="mt-1.5 font-mono text-sm" />
            </div>

            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Variáveis disponíveis</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <code className="rounded-md bg-card px-2 py-1 font-mono text-primary">{"{VALOR_LIBERADO}"}</code>
                <span className="text-muted-foreground">→ substituído pelo valor liberado da simulação (ex.: 8.542,33).</span>
              </div>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Pré-visualização (exemplo R$ 8.542,33)</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{preview}</p>
            </div>

            {isAdmin && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={alsoGlobalWa} onCheckedChange={(v) => setAlsoGlobalWa(!!v)} />
                Salvar também como padrão global do sistema (admin)
              </label>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetWa} className="h-11">Redefinir para padrão</Button>
              <Button onClick={save} disabled={saving} className="h-11 bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar mensagem</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold text-foreground">Mensagem de Reativação</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Utilizada quando você dispara reativação/follow-up para clientes.</p>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Mensagem</Label>
              <Textarea value={reactMsg} onChange={(e) => setReactMsg(e.target.value)} rows={6} className="mt-1.5 font-mono text-sm" />
            </div>

            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Variáveis disponíveis</div>
              <div className="mt-2 grid gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <code className="rounded-md bg-card px-2 py-1 font-mono text-primary">{"{NOME}"}</code>
                  <span className="text-muted-foreground">→ nome do cliente.</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded-md bg-card px-2 py-1 font-mono text-primary">{"{VALOR_LIBERADO}"}</code>
                  <span className="text-muted-foreground">→ valor liberado da simulação enviada anteriormente.</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Pré-visualização</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{reactPreview}</p>
            </div>

            {isAdmin && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={alsoGlobalRx} onCheckedChange={(v) => setAlsoGlobalRx(!!v)} />
                Salvar também como padrão global do sistema (admin)
              </label>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetRx} className="h-11">Redefinir para padrão</Button>
              <Button onClick={saveReact} disabled={savingReact} className="h-11 bg-primary text-primary-foreground hover:bg-primary/90">
                {savingReact ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar mensagem</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
