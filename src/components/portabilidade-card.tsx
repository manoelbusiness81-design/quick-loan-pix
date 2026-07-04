import { forwardRef } from "react";
import { brl, pct } from "@/lib/format";
import { TrendingDown, PiggyBank, Wallet } from "lucide-react";
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
      style={{ width: 780, fontFamily: "Inter, system-ui, sans-serif" }}
      className="overflow-hidden rounded-[28px] bg-white"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-9 pb-6 pt-8">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
            <img src={logoDrs} alt="DRS" className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
              Simulação de Portabilidade
            </div>
            <div className="mt-0.5 font-display text-[22px] font-bold leading-tight text-slate-900">
              {data.cliente || "Cliente"}
            </div>
          </div>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
          {data.banco}
        </div>
      </div>

      {/* Cards principais: Parcela Atual vs Parcela Reduzida */}
      <div className="grid grid-cols-2 gap-4 px-9 pt-7">
        {/* Parcela Atual — azul */}
        <div
          className="relative overflow-hidden rounded-2xl p-6"
          style={{
            background: "linear-gradient(135deg, #EEF4FF 0%, #DCE7FB 100%)",
            border: "1px solid #C7D8F5",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-[#1E3A8A]/10">
              <Wallet className="h-4 w-4 text-[#1E3A8A]" strokeWidth={2.5} />
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#1E3A8A]/80">
              Parcela Atual
            </div>
          </div>
          <div
            className="mt-3 font-display font-extrabold leading-none tabular-nums text-[#1E3A8A]"
            style={{ fontSize: 44, letterSpacing: "-0.03em" }}
          >
            {brl(data.totalParcelaAtual)}
          </div>
          <div className="mt-2 text-[11px] font-medium text-[#1E3A8A]/70">
            Você paga hoje / mês
          </div>
        </div>

        {/* Parcela Reduzida — verde, com mais destaque */}
        <div
          className="relative overflow-hidden rounded-2xl p-6 text-white"
          style={{
            background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
            boxShadow: "0 20px 40px -20px rgba(5, 150, 105, 0.55)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/15">
              <TrendingDown className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/85">
              Parcela Reduzida
            </div>
          </div>
          <div
            className="mt-3 font-display font-extrabold leading-none tabular-nums"
            style={{ fontSize: 48, letterSpacing: "-0.035em" }}
          >
            {brl(data.totalParcelaReduzida)}
          </div>
          <div className="mt-2 text-[11px] font-semibold text-white/90">
            Você passa a pagar / mês
          </div>
        </div>
      </div>

      {/* Faixa de Economia */}
      <div className="mx-9 mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <div className="grid grid-cols-2 divide-x divide-slate-200">
          <div className="p-5">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                Economia Mensal
              </div>
            </div>
            <div
              className="mt-1.5 font-display font-bold leading-none tabular-nums text-emerald-700"
              style={{ fontSize: 30, letterSpacing: "-0.02em" }}
            >
              {brl(data.economiaMensal)}
            </div>
          </div>
          <div className="p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Economia Total do Contrato
            </div>
            <div
              className="mt-1.5 font-display font-bold leading-none tabular-nums text-slate-700"
              style={{ fontSize: 24, letterSpacing: "-0.02em" }}
            >
              {brl(data.economiaTotal)}
            </div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">{data.banco}</div>
          </div>
        </div>
      </div>

      {/* Tabela resumo */}
      <div className="px-9 pb-8 pt-5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Contratos portados ({data.contratos.length})
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5">Prazo</th>
                <th className="px-3 py-2.5">Taxa Atual</th>
                <th className="px-3 py-2.5 text-right">Parcela Atual</th>
                <th className="px-3 py-2.5 text-right bg-emerald-50/60 text-emerald-800">Parcela Reduzida</th>
                <th className="px-3 py-2.5 text-right bg-emerald-50/60 text-emerald-800">Economia Mensal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.contratos.map((c, i) => (
                <tr key={i} className="tabular-nums">
                  <td className="px-3 py-2.5 font-semibold text-slate-700">{c.prazo}m</td>
                  <td className="px-3 py-2.5 text-slate-700">{pct(c.taxaAtual * 100)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-700">{brl(c.parcelaAtual)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/40">
                    {brl(c.parcelaReduzida)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-700 bg-emerald-50/40">
                    {brl(c.reducao)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-[11px] font-medium text-slate-500">
            Simulação sem compromisso · sujeita à análise
          </div>
          <div className="text-[11px] font-semibold text-slate-600">
            {new Date().toLocaleDateString("pt-BR")} · DRS Consultoria
          </div>
        </div>
      </div>
    </div>
  );
});
PortabilidadeCard.displayName = "PortabilidadeCard";
