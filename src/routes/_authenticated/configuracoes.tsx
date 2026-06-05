import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  WHATSAPP_MESSAGE_KEY,
  DEFAULT_WHATSAPP_MESSAGE,
  renderWhatsappMessage,
} from "@/lib/whatsapp";

export const Route = createFileRoute("/_authenticated/configuracoes")({
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
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>(DEFAULT_WHATSAPP_MESSAGE);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase.from("app_settings") as any)
        .select("value")
        .eq("key", WHATSAPP_MESSAGE_KEY)
        .maybeSingle();
      setMessage((data?.value as string) || DEFAULT_WHATSAPP_MESSAGE);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!message.trim()) {
      toast.error("A mensagem não pode ficar em branco.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase.from("app_settings") as any).upsert(
      {
        key: WHATSAPP_MESSAGE_KEY,
        value: message,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "key" }
    );
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success("Mensagem salva com sucesso");
  };

  const preview = renderWhatsappMessage(message, 8542.33);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize a comunicação enviada aos clientes.
        </p>
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-bold text-foreground">
            Mensagem Padrão do WhatsApp
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Esta mensagem será utilizada em todas as simulações enviadas pelo WhatsApp.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Mensagem</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="mt-1.5 font-mono text-sm"
                placeholder="Digite a mensagem..."
              />
            </div>

            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Variáveis disponíveis
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <code className="rounded-md bg-card px-2 py-1 font-mono text-primary">
                  {"{VALOR_LIBERADO}"}
                </code>
                <span className="text-muted-foreground">
                  → substituído pelo valor liberado da simulação (ex.: 8.542,33).
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                Pré-visualização (exemplo R$ 8.542,33)
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{preview}</p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={save}
                disabled={saving}
                className="h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" /> Salvar mensagem
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
