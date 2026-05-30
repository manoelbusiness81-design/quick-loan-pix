import { useEffect, useMemo, useState } from "react";
import { Calculator, Sparkles, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, pct } from "@/lib/format";

interface Coef { id: string; bank: string; prazo: number; taxa: number; coeficiente: number; modalidade?: string; }

const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

/** VP (valor presente) de N parcelas iguais à taxa i (decimal/mês). */
function vp(parcela: number, n: number, i: number) {
  if (!parcela || !n) return 0;
  if (i <= 0) return parcela * n;
  return parcela * (1 - Math.pow(1 + i, -n)) / i;
}

export function NovoEmprestimo() {
  const { user, isAdmin } = useAuth();
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [margem, setMargem] = useState("");
  const [comissaoPct, setComissaoPct] = useState("");
  const [prazoSelecionado, setPrazoSelecionado] = useState<string>("");
  const [antecipadas, setAntecipadas] = useState<{ id: string; qtd: string; pago: boolean }[]>([
    { id: "a1", qtd: "", pago: false },
  ]);

  useEffect(() => {
    if (!user) return;
    (supabase.from("coefficients") as any)
      .select("*")
      .eq("modalidade", "novo_emprestimo")
      .order("prazo", { ascending: false })
      .then(({ data }: any) => setCoefs((data as Coef[]) ?? []));
  }, [user]);

  const margemN = toNum(margem);
  const comissaoN = toNum(comissaoPct);

  // grade automática: todos os prazos cadastrados
  const grade = useMemo(() => {
    return coefs.map((c) => {
      const valorLiberado = c.coeficiente > 0 ? margemN / Number(c.coeficiente) : 0;
      return {
        id: c.id,
        prazo: c.prazo,
        taxa: Number(c.taxa),
        coef: Number(c.coeficiente),
        parcela: margemN,
        valorLiberado,
        comissao: (valorLiberado * comissaoN) / 100,
      };
    });
  }, [coefs, margemN, comissaoN]);

  const coefSel = coefs.find((c) => c.id === prazoSelecionado);
  const valorLiberadoSel = coefSel && coefSel.coeficiente > 0 ? margemN / Number(coefSel.coeficiente) : 0;
  const comissaoSel = (valorLiberadoSel * comissaoN) / 100;
  const taxaSelDec = coefSel ? Number(coefSel.taxa) / 100 : 0;

  // antecipadas: cada linha = quantidade de parcelas a antecipar
  const linhasAntecip = antecipadas.map((a) => {
    const qtd = parseInt(a.qtd) || 0;
    const vpVal = vp(margemN, qtd, taxaSelDec);
    return { ...a, qtd, vp: vpVal, mensal: margemN };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Form */}
      <div className="space-y-4">
        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Novo Empréstimo</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Informe a margem disponível. O valor liberado é calculado por coeficiente.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Margem disponível (parcela mensal)">
              <Input value={margem} onChange={(e) => setMargem(e.target.value)} className="h-11" placeholder="567,35" inputMode="decimal" />
            </Field>
            <Field label="Comissão (%)">
              <Input value={comissaoPct} onChange={(e) => setComissaoPct(e.target.value)} className="h-11" placeholder="3,00" inputMode="decimal" />
            </Field>
          </div>

          <div className="mt-4">
            <Label className="text-xs font-semibold text-muted-foreground">Prazo / Coeficiente</Label>
            {coefs.length === 0 ? (
              <div className="mt-1 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhum coeficiente de <strong>Novo Empréstimo</strong> cadastrado. Cadastre na aba <strong>Coeficientes</strong>.
              </div>
            ) : (
              <Select value={prazoSelecionado} onValueChange={setPrazoSelecionado}>
                <SelectTrigger className="h-11 mt-1"><SelectValue placeholder="Selecione um prazo" /></SelectTrigger>
                <SelectContent>
                  {coefs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.prazo} parcelas · {pct(Number(c.taxa))} · coef {Number(c.coeficiente).toFixed(8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {coefSel && margemN > 0 && (
            <div className="mt-4 rounded-xl bg-gradient-brand p-5 text-brand-foreground shadow-brand">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">Valor liberado</div>
              <div className="font-display text-4xl font-extrabold tabular-nums" style={{ letterSpacing: "-0.03em" }}>
                {brl(valorLiberadoSel)}
              </div>
              <div className="mt-1 text-sm font-medium opacity-90">
                {coefSel.prazo}× de {brl(margemN)} · taxa {pct(Number(coefSel.taxa))}
              </div>
            </div>
          )}

          {coefSel && margemN > 0 && comissaoN > 0 && (
            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5" /> {isAdmin ? "Comissão (interno)" : "Minha comissão"}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">Base (valor liberado)</div>
                <div className="text-right font-semibold tabular-nums text-foreground">{brl(valorLiberadoSel)}</div>
                <div className="text-muted-foreground">% comissão</div>
                <div className="text-right font-semibold tabular-nums text-foreground">{pct(comissaoN, 3)}</div>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-primary/20 pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comissão</div>
                <div className="font-display text-2xl font-extrabold tabular-nums text-primary">{brl(comissaoSel)}</div>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Comissão é interna — não é exibida em comprovantes ou imagens enviadas ao cliente.
              </p>
            </div>
          )}
        </div>

        {/* Parcelas antecipadas */}
        {coefSel && margemN > 0 && (
          <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Parcelas antecipadas</h2>
                <p className="mt-1 text-xs text-muted-foreground">Valor presente (VP) trazido pela taxa do contrato.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAntecipadas((a) => [...a, { id: Math.random().toString(36).slice(2, 8), qtd: "", pago: false }])} className="gap-1">
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Qtd. parcelas</th>
                    <th className="px-3 py-2 text-right">Parcela real</th>
                    <th className="px-3 py-2 text-right">VP (antecipado)</th>
                    <th className="px-3 py-2 text-right">Mensal</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {linhasAntecip.map((l, idx) => (
                    <tr key={l.id} className="tabular-nums">
                      <td className="px-3 py-2">
                        <Input
                          value={antecipadas[idx].qtd}
                          onChange={(e) => setAntecipadas((arr) => arr.map((x, i) => i === idx ? { ...x, qtd: e.target.value.replace(/\D/g, "") } : x))}
                          className="h-9 w-20"
                          placeholder="6"
                          inputMode="numeric"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{brl(margemN)}</td>
                      <td className="px-3 py-2 text-right font-bold text-brand">{brl(l.vp)}</td>
                      <td className="px-3 py-2 text-right">{brl(l.mensal)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => setAntecipadas((arr) => arr.map((x, i) => i === idx ? { ...x, pago: !x.pago } : x))}
                          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${l.pago ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"}`}
                        >
                          {l.pago ? "Pago" : "Não pago"}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {antecipadas.length > 1 && (
                          <button onClick={() => setAntecipadas((arr) => arr.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Grade de simulações automática */}
      <div className="space-y-4">
        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-brand" />
            <h2 className="font-display text-lg font-bold text-foreground">Simulações automáticas</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Gerada para todos os prazos cadastrados a partir da margem informada.
          </p>

          {margemN <= 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Informe a margem para visualizar as opções.
            </div>
          ) : grade.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum coeficiente cadastrado para Novo Empréstimo.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Prazo</th>
                    <th className="px-3 py-2 text-right">Parcela</th>
                    <th className="px-3 py-2 text-right">Valor liberado</th>
                    {isAdmin && <th className="px-3 py-2 text-right">Comissão</th>}
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {grade.map((g) => {
                    const ativa = g.id === prazoSelecionado;
                    return (
                      <tr key={g.id} className={`tabular-nums transition ${ativa ? "bg-brand/10" : ""}`}>
                        <td className="px-3 py-2 font-semibold text-foreground">{g.prazo}m</td>
                        <td className="px-3 py-2 text-right">{brl(g.parcela)}</td>
                        <td className="px-3 py-2 text-right font-bold text-brand">{brl(g.valorLiberado)}</td>
                        {isAdmin && <td className="px-3 py-2 text-right text-muted-foreground">{brl(g.comissao)}</td>}
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant={ativa ? "default" : "outline"} className="h-8" onClick={() => setPrazoSelecionado(g.id)}>
                            {ativa ? "Selecionado" : "Selecionar"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
