import { supabase } from "@/integrations/supabase/client";

/** Chave legada (mensagem única para todas as modalidades). Mantida como fallback. */
export const WHATSAPP_MESSAGE_KEY = "whatsapp_message";

export type WhatsappModalidade =
  | "refinanciamento"
  | "novo_emprestimo"
  | "novo_normal"
  | "portabilidade"
  | "gov_sp";

export const WHATSAPP_MODALIDADES: { value: WhatsappModalidade; label: string }[] = [
  { value: "refinanciamento", label: "Refinanciamento" },
  { value: "novo_emprestimo", label: "Novo LOAS" },
  { value: "novo_normal", label: "Novo Normal" },
  { value: "portabilidade", label: "Portabilidade" },
  { value: "gov_sp", label: "Gov SP" },
];

/** Chave de configuração por modalidade. */
export const whatsappKeyFor = (m: WhatsappModalidade) => `whatsapp_message_${m}`;

export const DEFAULT_WHATSAPP_MESSAGE =
  "Te mandei a simulação, o valor do troco aproximado é de *R$ {VALOR_LIBERADO}*, lembrando que o valor da parcela não aumenta.";

export const DEFAULT_PORTABILIDADE_MESSAGE =
  "Olá, {NOME}!\n\nAqui é o Manoel. Conforme conversamos por telefone, segue a sua simulação.\n\n💳 Parcela atual: R$ {PARCELA_ATUAL}\n\n✅ Nova parcela: R$ {PARCELA_NOVA}\n\n🎁 Além da redução da parcela, você ainda ganha 1 mês de carência para começar a pagar.\n\nVamos reduzir sua parcela hoje?";

export const DEFAULT_WHATSAPP_MESSAGE_BY_MODALIDADE: Record<WhatsappModalidade, string> = {
  refinanciamento: DEFAULT_WHATSAPP_MESSAGE,
  novo_emprestimo: DEFAULT_WHATSAPP_MESSAGE,
  novo_normal: DEFAULT_WHATSAPP_MESSAGE,
  portabilidade: DEFAULT_PORTABILIDADE_MESSAGE,
  gov_sp: DEFAULT_WHATSAPP_MESSAGE,
};

/** Formata um número como BRL sem o prefixo "R$ " (ex.: 8542.33 -> "8.542,33"). */
export function formatValorLiberadoBR(n: number): string {
  const v = isFinite(n) ? n : 0;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export interface WhatsappVars {
  nome?: string;
  parcelaAtual?: number;
  parcelaNova?: number;
  parcela?: number;
  prazo?: number | null;
}

/** Substitui as variáveis da mensagem (case-insensitive). */
export function renderWhatsappMessage(
  template: string,
  valorLiberado: number,
  vars: WhatsappVars = {}
): string {
  return (template ?? "")
    .replace(/\{VALOR_LIBERADO\}/gi, formatValorLiberadoBR(valorLiberado))
    .replace(/\{NOME\}/gi, vars.nome ?? "")
    .replace(/\{PARCELA_ATUAL\}/gi, formatValorLiberadoBR(vars.parcelaAtual ?? 0))
    .replace(/\{PARCELA_NOVA\}/gi, formatValorLiberadoBR(vars.parcelaNova ?? 0))
    .replace(/\{PARCELA\}/gi, formatValorLiberadoBR(vars.parcela ?? 0))
    .replace(/\{PRAZO\}/gi, String(vars.prazo ?? ""));
}

async function readSetting(table: "user_settings" | "app_settings", key: string, uid?: string) {
  let q = (supabase.from(table) as any).select("value").eq("key", key);
  if (table === "user_settings") q = q.eq("user_id", uid);
  const { data } = await q.maybeSingle();
  return (data?.value as string) || null;
}

/**
 * Busca a mensagem da modalidade: config do usuário → global → legado (usuário/global) → default.
 */
export async function fetchWhatsappTemplate(
  modalidade: WhatsappModalidade = "refinanciamento"
): Promise<string> {
  const key = whatsappKeyFor(modalidade);
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (uid) {
      const own = await readSetting("user_settings", key, uid);
      if (own) return own;
    }
    const global = await readSetting("app_settings", key);
    if (global) return global;

    // Fallback para a mensagem única legada (compatibilidade)
    if (uid) {
      const legacyOwn = await readSetting("user_settings", WHATSAPP_MESSAGE_KEY, uid);
      if (legacyOwn) return legacyOwn;
    }
    const legacyGlobal = await readSetting("app_settings", WHATSAPP_MESSAGE_KEY);
    if (legacyGlobal) return legacyGlobal;

    return DEFAULT_WHATSAPP_MESSAGE_BY_MODALIDADE[modalidade];
  } catch {
    return DEFAULT_WHATSAPP_MESSAGE_BY_MODALIDADE[modalidade];
  }
}
