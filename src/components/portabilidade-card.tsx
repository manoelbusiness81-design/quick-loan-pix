import { forwardRef } from "react";
import { brl, pct } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";
import logoDrs from "@/assets/logo-drs.jpg";

export interface PortabilidadeContrato {
  prazo: number;
  parcelaAtual: number;
  taxaAtual: number; // decimal (0.02 = 2% a.m.)
  saldoDevedor: number;
  parcelaReduzida: number;
  reducao: number;
  economiaContrato: number;
}

export interface PortabilidadeCardData {
  cliente: string;
  banco: string; // ex.: "Finanto 1,72%"
  contratos: PortabilidadeContrato[];
  totalParcelaAtual: number;
  totalParcelaReduzida: number;
  economiaMensal: number;
  economiaTotal: number;
}

export const PortabilidadeCard = forwardRef<HTMLDivElement, { data: PortabilidadeCardData }>(({ data }, ref) => {
  return (
    <div
      ref={ref}
      style={{ width: 720, fontFamily: "Inter, system-ui, sans-serif" }}
      className="overflow-hidden rounded-3xl bg-white"
    >
      {/* Header */}
      <div className="bg-gradient-navy px-10 pb-8 pt-10 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-white">
              <img src={logoDrs} alt="DRS" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Simulação Portabilidade</div>
              <div className="mt-0.5 font-display text-xl font-bold leading-tight">
                {data.cliente || "Cliente"}
              </div>
            </div>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 backdrop-blur">
            <CheckCircle2 className="h-7 w-7 text-brand" strokeWidth={2.5} />
          </div>
        </div>

        <div className="mt-7 rounded-2xl bg-gradient-brand p-6 shadow-brand">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-foreground/80">
            Economia Total
          </div>
          <div
            className="mt-1 font-display font-extrabold leading-none text-brand-foreground tabular-nums"
            style={{ fontSize: 56, letterSpacing: "-0.04em" }}
          >
            {brl(data.economiaTotal)}
          </div>
          <div className="mt-2 text-sm font-medium text-brand-foreground/85">
            Economia mensal de {brl(data.economiaMensal)} · {data.banco}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-10 pb-10 pt-7">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Resumo</div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Parcela atual" value={brl(data.totalParcelaAtual)} />
          <Stat label="Parcela reduzida" value={brl(data.totalParcelaReduzida)} highlight />
        </div>

        <div className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Contratos portados ({data.contratos.length})
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Taxa atual</th>
                <th className="px-3 py-2 text-right">Parcela</th>
                <th className="px-3 py-2 text-right">Reduzida</th>
                <th className="px-3 py-2 text-right">Redução</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.contratos.map((c, i) => (
                <tr key={i} className="tabular-nums">
                  <td className="px-3 py-2 font-semibold text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 text-foreground">{c.prazo}m</td>
                  <td className="px-3 py-2 text-foreground">{pct(c.taxaAtual * 100)}</td>
                  <td className="px-3 py-2 text-right text-foreground">{brl(c.parcelaAtual)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{brl(c.parcelaReduzida)}</td>
                  <td className="px-3 py-2 text-right font-bold text-brand">{brl(c.reducao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-7 border-t border-border pt-5 text-center">
          <div className="font-display text-sm font-semibold text-foreground">
            Simulação sem compromisso · sujeita à análise.
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Gerado em {new Date().toLocaleDateString("pt-BR")} · DRS Consultoria
          </div>
        </div>
      </div>
    </div>
  );
});
PortabilidadeCard.displayName = "PortabilidadeCard";

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
