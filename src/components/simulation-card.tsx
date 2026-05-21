import { forwardRef } from "react";
import { brl, pct } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";

export interface ParcelaResumo {
  parcela: number;
  prazoRestante: number;
  taxaAtual: number;
  saldoDevedor: number;
  novoValorFinanciado: number;
  troco: number;
}

export interface SimulationData {
  cliente: string;
  parcelas: ParcelaResumo[];
  totalParcela: number;
  totalSaldoDevedor: number;
  totalNovoValorFinanciado: number;
  totalTroco: number;
  taxaNova: number;
  prazoNovo: number;
  banco?: string;
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
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Simulação de Refinanciamento</div>
            <div className="mt-1 font-display text-2xl font-bold leading-tight">
              {data.cliente || "Cliente"}
            </div>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 backdrop-blur">
            <CheckCircle2 className="h-7 w-7 text-brand" strokeWidth={2.5} />
          </div>
        </div>

        {/* Hero troco total */}
        <div className="mt-7 rounded-2xl bg-gradient-brand p-6 shadow-brand">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-foreground/80">
            Total Liberado
          </div>
          <div
            className="mt-1 font-display font-extrabold leading-none text-brand-foreground tabular-nums"
            style={{ fontSize: 64, letterSpacing: "-0.04em" }}
          >
            {brl(data.totalTroco)}
          </div>
          <div className="mt-2 text-sm font-medium text-brand-foreground/85">
            Suas parcelas continuam em {brl(data.totalParcela)} no total
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

        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Nova operação</div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Parcela total" value={brl(data.totalParcela)} highlight />
          <Stat label="Novo Prazo" value={`${data.prazoNovo} meses`} highlight />
          <Stat label="Nova Taxa" value={pct(data.taxaNova)} highlight />
        </div>

        {data.parcelas.length > 1 && (
          <>
            <div className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Detalhamento por contrato ({data.parcelas.length})
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary">
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Parcela</th>
                    <th className="px-3 py-2">Prazo</th>
                    <th className="px-3 py-2 text-right">Troco</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.parcelas.map((p, i) => (
                    <tr key={i} className="tabular-nums">
                      <td className="px-3 py-2 font-semibold text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-semibold text-foreground">{brl(p.parcela)}</td>
                      <td className="px-3 py-2 text-foreground">{p.prazoRestante}m</td>
                      <td className="px-3 py-2 text-right font-bold text-brand">{brl(p.troco)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Contratos quitados</div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Saldo Devedor Total" value={brl(data.totalSaldoDevedor)} />
          <Stat label="Valor Financiado" value={brl(data.totalNovoValorFinanciado)} />
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
      <div className={`mt-1 font-display font-bold tabular-nums text-foreground ${highlight ? "text-lg" : "text-base"}`}>
        {value}
      </div>
    </div>
  );
}
