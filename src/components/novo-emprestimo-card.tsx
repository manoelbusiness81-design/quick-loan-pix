import { forwardRef } from "react";
import { brl } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";
import logoDrs from "@/assets/logo-drs.jpg";

export interface NovoEmprestimoOpcao {
  prazo: number;
  parcela: number;
  valorLiberado: number;
}

export interface NovoEmprestimoCardData {
  cliente: string;
  opcoes: NovoEmprestimoOpcao[]; // 108, 54, 36
}

export const NovoEmprestimoCard = forwardRef<HTMLDivElement, { data: NovoEmprestimoCardData }>(({ data }, ref) => {
  const valorLiberado = data.opcoes[0]?.valorLiberado ?? 0;
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Simulação Empréstimo</div>
              <div className="mt-0.5 font-display text-xl font-bold leading-tight">
                {data.cliente || "Cliente"}
              </div>
            </div>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 backdrop-blur">
            <CheckCircle2 className="h-7 w-7 text-brand" strokeWidth={2.5} />
          </div>
        </div>

        {/* Hero — valor liberado único */}
        <div className="mt-7 rounded-2xl bg-gradient-brand p-6 shadow-brand">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-foreground/80">
            Valor Liberado
          </div>
          <div
            className="mt-1 font-display font-extrabold leading-none text-brand-foreground tabular-nums"
            style={{ fontSize: 64, letterSpacing: "-0.04em" }}
          >
            {brl(valorLiberado)}
          </div>
          <div className="mt-2 text-sm font-medium text-brand-foreground/85">
            Escolha o prazo que melhor se ajusta à sua parcela
          </div>
        </div>
      </div>

      {/* Body — três cenários */}
      <div className="px-10 pb-10 pt-7">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Opções de prazo
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">Prazo</th>
                <th className="px-4 py-2.5 text-right">Parcela</th>
                <th className="px-4 py-2.5 text-right">Valor Liberado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.opcoes.map((o) => (
                <tr key={o.prazo} className="tabular-nums">
                  <td className="px-4 py-3 font-semibold text-foreground">{o.prazo}x</td>
                  <td className="px-4 py-3 text-right text-foreground">{brl(o.parcela)}</td>
                  <td className="px-4 py-3 text-right font-display text-base font-extrabold text-brand">{brl(o.valorLiberado)}</td>
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
NovoEmprestimoCard.displayName = "NovoEmprestimoCard";
