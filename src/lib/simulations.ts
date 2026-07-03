import { supabase } from "@/integrations/supabase/client";
import { formatValorLiberadoBR } from "@/lib/whatsapp";

export const REACTIVATION_MESSAGE_KEY = "reactivation_message";
export const DEFAULT_REACTIVATION_MESSAGE =
  "Olá {NOME}, tudo bem?\n\nVi que você recebeu uma simulação conosco recentemente no valor aproximado de R$ {VALOR_LIBERADO}.\n\nGostaria de saber se ainda tem interesse em dar continuidade.";

export const SIMULATION_SENT_EVENT = "simulation-sent";

export interface SimulationRecord {
  id: string;
  user_id: string;
  cliente: string;
  telefone: string;
  modalidade: string;
  valor_liberado: number;
  parcela: number | null;
  prazo: number | null;
  carencia: number | null;
  sent_at: string;
  reactivated_at: string | null;
}

export interface RecordSimulationInput {
  cliente: string;
  telefone: string;
  modalidade: "refinanciamento" | "novo_emprestimo" | "novo_normal" | "portabilidade";
  valor_liberado: number;
  parcela?: number | null;
  prazo?: number | null;
  carencia?: number | null;
}

export async function recordSimulation(input: RecordSimulationInput): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  const { error } = await (supabase.from("simulations") as any).insert({
    user_id: uid,
    cliente: input.cliente.trim(),
    telefone: input.telefone,
    modalidade: input.modalidade,
    valor_liberado: Number(input.valor_liberado || 0),
    parcela: input.parcela ?? null,
    prazo: input.prazo ?? null,
    carencia: input.carencia ?? null,
  });
  if (error) {
    console.error("recordSimulation", error);
    return;
  }
  try {
    window.dispatchEvent(new CustomEvent(SIMULATION_SENT_EVENT));
  } catch {}
}

export const MODALIDADE_LABEL: Record<string, string> = {
  refinanciamento: "Refinanciamento",
  novo_emprestimo: "Novo LOAS",
  novo_normal: "Novo Normal",
};

export async function fetchReactivationTemplate(): Promise<string> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (uid) {
      const { data: own } = await (supabase.from("user_settings") as any)
        .select("value")
        .eq("user_id", uid)
        .eq("key", REACTIVATION_MESSAGE_KEY)
        .maybeSingle();
      if (own?.value) return own.value as string;
    }
    const { data } = await (supabase.from("app_settings") as any)
      .select("value")
      .eq("key", REACTIVATION_MESSAGE_KEY)
      .maybeSingle();
    return (data?.value as string) || DEFAULT_REACTIVATION_MESSAGE;
  } catch {
    return DEFAULT_REACTIVATION_MESSAGE;
  }
}

export function renderReactivationMessage(
  template: string,
  vars: { nome: string; valorLiberado: number }
): string {
  const valor = formatValorLiberadoBR(vars.valorLiberado);
  return (template ?? "")
    .replace(/\{NOME\}/gi, vars.nome || "")
    .replace(/\{VALOR_LIBERADO\}/gi, valor);
}
