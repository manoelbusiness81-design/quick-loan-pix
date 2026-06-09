import { supabase } from "@/integrations/supabase/client";

export const WHATSAPP_MESSAGE_KEY = "whatsapp_message";
export const DEFAULT_WHATSAPP_MESSAGE =
  "Te mandei a simulação, o valor do troco aproximado é de *R$ {VALOR_LIBERADO}*, lembrando que o valor da parcela não aumenta.";

/** Formata um número como BRL sem o prefixo "R$ " (ex.: 8542.33 -> "8.542,33"). */
export function formatValorLiberadoBR(n: number): string {
  const v = isFinite(n) ? n : 0;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

/** Substitui {VALOR_LIBERADO} (case-insensitive) na mensagem pelo valor formatado. */
export function renderWhatsappMessage(template: string, valorLiberado: number): string {
  const valor = formatValorLiberadoBR(valorLiberado);
  return (template ?? "").replace(/\{VALOR_LIBERADO\}/gi, valor);
}

/** Busca a mensagem do usuário atual; fallback: padrão global (app_settings) e depois o default. */
export async function fetchWhatsappTemplate(): Promise<string> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (uid) {
      const { data: own } = await (supabase.from("user_settings") as any)
        .select("value")
        .eq("user_id", uid)
        .eq("key", WHATSAPP_MESSAGE_KEY)
        .maybeSingle();
      if (own?.value) return own.value as string;
    }
    const { data } = await (supabase.from("app_settings") as any)
      .select("value")
      .eq("key", WHATSAPP_MESSAGE_KEY)
      .maybeSingle();
    return (data?.value as string) || DEFAULT_WHATSAPP_MESSAGE;
  } catch {
    return DEFAULT_WHATSAPP_MESSAGE;
  }
}
