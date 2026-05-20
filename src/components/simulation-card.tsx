import { forwardRef } from "react";
import { brl, pct } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";

export interface SimulationData {
  cliente: string;
  prazoInicial: number;
  prazoAtual: number;
  parcela: number;
  taxa: number;
  saldoDevedor: number;
  troco: number;
  banco?: string;
  novoPrazo?: number;
  novaParcela?: number;
}

export const SimulationCard = forwardRef<HTMLDivElement, { data: SimulationData }>(({ data }, ref) => {
  return (
    <div
      ref={ref}
      style={{ width: 720, fontFamily: "Inter, system-ui, sans-serif" }}
      className="overflow-hidden rounded-3xl bg-white"
    >
      {/* Header */}
      <div className="bg-gradient-navy px-10 pb-8 pt-10 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Simulação de Consignado</div>
            <div className="mt-1 font-display text-2xl font-bold leading-tight">
              {data.cliente || "Cliente"}
            </div>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 backdrop-blur">
            <CheckCircle2 className="h-7 w-7 text-brand" strokeWidth={2.5} />
          </div>
        </div>

        {/* Hero troco */}
        <div className="mt-7 rounded-2xl bg-gradient-brand p-6 shadow-brand">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-foreground/80">
            Valor Liberado
          </div>
          <div
            className="mt-1 font-display font-extrabold leading-none text-brand-foreground tabular-nums"
            style={{ fontSize: 64, letterSpacing: "-0.04em" }}
          >
            {brl(data.troco)}
          </div>
          <div className="mt-2 text-sm font-medium text-brand-foreground/85">
            Aprovado para crédito imediato
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-10 pb-10 pt-7">
        {data.banco && (
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            {data.banco}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Parcela" value={brl(data.parcela)} highlight />
          <Stat label="Prazo" value={`${data.prazoAtual} meses`} highlight />
          <Stat label="Taxa de Juros" value={pct(data.taxa)} />
          <Stat label="Saldo Devedor" value={brl(data.saldoDevedor)} />
          {data.novoPrazo != null && <Stat label="Novo Prazo" value={`${data.novoPrazo} meses`} />}
          {data.novaParcela != null && <Stat label="Nova Parcela" value={brl(data.novaParcela)} />}
          <Stat label="Prazo Inicial" value={`${data.prazoInicial} meses`} />
        </div>

        <div className="mt-7 border-t border-border pt-5 text-center">
          <div className="font-display text-sm font-semibold text-foreground">
            Simulação válida sujeita à análise.
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Gerado em {new Date().toLocaleDateString("pt-BR")} · ConsigFlow
          </div>
        </div>
      </div>
    </div>
  );
});
SimulationCard.displayName = "SimulationCard";

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border border-border p-4 ${highlight ? "bg-accent" : "bg-card"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display font-bold tabular-nums text-foreground ${highlight ? "text-xl" : "text-base"}`}>
        {value}
      </div>
    </div>
  );
}
