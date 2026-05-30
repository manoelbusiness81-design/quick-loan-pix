import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Send, Sparkles, Loader2, Copy, Download, RefreshCw, Calculator, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimulationCard, type SimulationData, type ParcelaResumo } from "@/components/simulation-card";
import { NovoEmprestimo } from "@/components/novo-emprestimo";
import { brl, formatPhoneBR, onlyDigits, pct } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: SimulatorPage,
});

interface Coef { id: string; bank: string; prazo: number; taxa: number; coeficiente: number; }
interface Comm { id: string; taxa: number; percentual: number; }
interface SellerComm { id: string; user_id: string; taxa: number; percentual: number; }

interface ParcelaInput { id: string; parcela: string; prazoRestante: string; taxaAtual: string; }

const MAX_PARCELAS = 5;
const WA_MESSAGE = "Opa, aqui é o Manoel conversamos por ligação";

const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;
const uid = () => Math.random().toString(36).slice(2, 9);

/** PV de uma série uniforme: SD = ((1-(1+i)^-n)/i) * PMT  (i em decimal por mês) */
function calcSaldoDevedor(parcela: number, prazo: number, taxaPctMes: number): number {
  const i = taxaPctMes / 100;
  if (!parcela || !prazo || i <= 0) return 0;
  return ((1 - Math.pow(1 + i, -prazo)) / i) * parcela;
}

function SimulatorPage() {
  const { user, isAdmin } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [sellerComms, setSellerComms] = useState<SellerComm[]>([]);
  const [selectedCoefId, setSelectedCoefId] = useState<string>("");

  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [parcelas, setParcelas] = useState<ParcelaInput[]>([
    { id: uid(), parcela: "", prazoRestante: "", taxaAtual: "" },
  ]);

  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [modalidade, setModalidade] = useState<"refinanciamento" | "novo_emprestimo">("refinanciamento");

  useEffect(() => {
    if (!user) return;
    (supabase.from("coefficients") as any)
      .select("*")
      .eq("modalidade", "refinanciamento")
      .order("taxa")
      .then(({ data }: any) => setCoefs((data as Coef[]) ?? []));
    if (isAdmin) {
      supabase.from("commissions").select("*").order("taxa").then(({ data }) => setComms((data as Comm[]) ?? []));
    }
    (supabase.from as any)("seller_commissions").select("*").eq("user_id", user.id).order("taxa")
      .then(({ data }: any) => setSellerComms((data as SellerComm[]) ?? []));
  }, [user, isAdmin]);

  const coefSelecionado = coefs.find((c) => c.id === selectedCoefId);
  const coefValor = coefSelecionado ? Number(coefSelecionado.coeficiente) : 0;

  const linhas: ParcelaResumo[] = useMemo(() => {
    return parcelas.map((p) => {
      const nParcela = toNum(p.parcela);
      const nPrazo = parseInt(p.prazoRestante) || 0;
      const nTaxa = toNum(p.taxaAtual);
      const saldoDevedor = calcSaldoDevedor(nParcela, nPrazo, nTaxa);
      const novoValorFinanciado = coefValor > 0 && nParcela > 0 ? nParcela / coefValor : 0;
      const troco = novoValorFinanciado - saldoDevedor;
      return {
        parcela: nParcela,
        prazoRestante: nPrazo,
        taxaAtual: nTaxa,
        saldoDevedor,
        novoValorFinanciado,
        troco,
      };
    });
  }, [parcelas, coefValor]);

  const linhasValidas = linhas.filter((l) => l.parcela > 0 && l.prazoRestante > 0 && l.taxaAtual > 0);
  const totalParcela = linhasValidas.reduce((s, l) => s + l.parcela, 0);
  const totalSaldoDevedor = linhasValidas.reduce((s, l) => s + l.saldoDevedor, 0);
  const totalNovoValorFinanciado = linhasValidas.reduce((s, l) => s + l.novoValorFinanciado, 0);
  const totalTroco = linhasValidas.reduce((s, l) => s + l.troco, 0);
  const valorBruto = totalNovoValorFinanciado;

  const commCfg = useMemo(
    () => (coefSelecionado ? comms.find((c) => Math.abs(Number(c.taxa) - Number(coefSelecionado.taxa)) < 0.0001) : undefined),
    [comms, coefSelecionado]
  );
  const sellerCfg = useMemo(
    () => (coefSelecionado ? sellerComms.find((c) => Math.abs(Number(c.taxa) - Number(coefSelecionado.taxa)) < 0.0001) : undefined),
    [sellerComms, coefSelecionado]
  );
  const comissaoPct = commCfg ? Number(commCfg.percentual) : 0;
  const comissaoValor = (valorBruto * comissaoPct) / 100;
  const sellerPct = sellerCfg ? Number(sellerCfg.percentual) : 0;
  const sellerValor = (valorBruto * sellerPct) / 100;
  const lucroEmpresa = comissaoValor - sellerValor;

  const data: SimulationData = {
    cliente,
    parcelas: linhasValidas,
    totalParcela,
    totalSaldoDevedor,
    totalNovoValorFinanciado,
    totalTroco,
    taxaNova: coefSelecionado ? Number(coefSelecionado.taxa) : 0,
    prazoNovo: coefSelecionado ? Number(coefSelecionado.prazo) : 0,
    banco: coefSelecionado?.bank,
  };

  const canSimular = !!cliente && linhasValidas.length > 0 && !!coefSelecionado && totalTroco > 0;

  const updateParcela = (id: string, patch: Partial<ParcelaInput>) =>
    setParcelas((arr) => arr.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addParcela = () => {
    if (parcelas.length >= MAX_PARCELAS) return;
    setParcelas((arr) => [...arr, { id: uid(), parcela: "", prazoRestante: "", taxaAtual: "" }]);
  };
  const removeParcela = (id: string) =>
    setParcelas((arr) => (arr.length === 1 ? arr : arr.filter((p) => p.id !== id)));

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!cliente) return toast.error("Informe o nome do cliente.");
    if (linhasValidas.length === 0) return toast.error("Preencha ao menos uma parcela completa.");
    if (!coefSelecionado) return toast.error("Selecione uma nova taxa / coeficiente.");
    if (totalTroco <= 0) return toast.error("Operação sem troco positivo. Ajuste a nova taxa.");
    setShowPreview(true);
    setTimeout(() => document.getElementById("preview-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSend = async () => {
    if (!canSimular) { toast.error("Preencha os dados e selecione a nova taxa."); return; }
    const phone = onlyDigits(telefone);
    if (phone.length < 10) { toast.error("Informe um WhatsApp válido."); return; }
    setSending(true);
    try {
      const blob = await generatePng();
      let copied = false;
      try {
        if (navigator.clipboard && "write" in navigator.clipboard) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          copied = true;
        }
      } catch { copied = false; }

      if (!copied) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `simulacao-${cliente.replace(/\s+/g, "-").toLowerCase()}.png`;
        a.click(); URL.revokeObjectURL(url);
        toast.info("Imagem baixada", { description: "Anexe no WhatsApp que acabou de abrir." });
      } else {
        toast.success("Imagem copiada!", { description: "Cole no WhatsApp (Ctrl+V)." });
      }
      const ddi = phone.length <= 11 ? `55${phone}` : phone;
      const msg = encodeURIComponent(WA_MESSAGE);
      window.open(`https://wa.me/${ddi}?text=${msg}`, "_blank");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar imagem");
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await generatePng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `simulacao-${cliente.replace(/\s+/g, "-").toLowerCase() || "cliente"}.png`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Imagem baixada");
    } catch { toast.error("Erro ao baixar"); }
  };

  const handleCopy = async () => {
    try {
      const blob = await generatePng();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagem copiada");
    } catch { toast.error("Seu navegador não permitiu copiar a imagem"); }
  };

  const reset = () => {
    setCliente(""); setTelefone("");
    setParcelas([{ id: uid(), parcela: "", prazoRestante: "", taxaAtual: "" }]);
    setSelectedCoefId(""); setShowPreview(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {modalidade === "refinanciamento" ? "Simulador de Refinanciamento" : "Simulador de Novo Empréstimo"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {modalidade === "refinanciamento"
              ? `Combine até ${MAX_PARCELAS} contratos. Saldo devedor calculado automaticamente.`
              : "Calcule valor liberado a partir da margem disponível."}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Limpar
        </Button>
      </div>

      {/* Seletor de modalidade */}
      <div className="inline-flex rounded-xl bg-secondary p-1">
        {([
          { v: "refinanciamento", label: "Refinanciamento" },
          { v: "novo_emprestimo", label: "Novo Empréstimo" },
        ] as const).map((m) => (
          <button
            key={m.v}
            onClick={() => setModalidade(m.v)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              modalidade === m.v ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {modalidade === "novo_emprestimo" ? <NovoEmprestimo /> : null}
      {modalidade === "refinanciamento" && (

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
            <h2 className="font-display text-lg font-bold text-foreground">Dados do cliente</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome do cliente">
                <Input value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-11" placeholder="João da Silva" />
              </Field>
              <Field label="WhatsApp">
                <Input value={telefone} onChange={(e) => setTelefone(formatPhoneBR(e.target.value))} className="h-11" placeholder="(11) 99999-9999" inputMode="numeric" />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Contratos atuais</h2>
                <p className="mt-1 text-xs text-muted-foreground">Até {MAX_PARCELAS} parcelas. Saldo devedor calculado automaticamente.</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addParcela}
                disabled={parcelas.length >= MAX_PARCELAS}
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {parcelas.map((p, idx) => {
                const linha = linhas[idx];
                return (
                  <div key={p.id} className="rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Parcela {idx + 1}
                      </div>
                      {parcelas.length > 1 && (
                        <button
                          onClick={() => removeParcela(p.id)}
                          className="text-muted-foreground transition hover:text-destructive"
                          aria-label="Remover parcela"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Valor">
                        <Input value={p.parcela} onChange={(e) => updateParcela(p.id, { parcela: e.target.value })} className="h-10" placeholder="450,00" inputMode="decimal" />
                      </Field>
                      <Field label="Prazo (m)">
                        <Input value={p.prazoRestante} onChange={(e) => updateParcela(p.id, { prazoRestante: onlyDigits(e.target.value) })} className="h-10" placeholder="60" inputMode="numeric" />
                      </Field>
                      <Field label="Taxa %">
                        <Input value={p.taxaAtual} onChange={(e) => updateParcela(p.id, { taxaAtual: e.target.value })} className="h-10" placeholder="1,99" inputMode="decimal" />
                      </Field>
                    </div>
                    {linha && linha.saldoDevedor > 0 && (
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Saldo devedor</span>
                        <span className="font-bold tabular-nums text-foreground">{brl(linha.saldoDevedor)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totalSaldoDevedor > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Calculator className="h-3.5 w-3.5" /> Saldo devedor total
                </div>
                <div className="font-display text-2xl font-extrabold tabular-nums text-foreground">{brl(totalSaldoDevedor)}</div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
            <h2 className="font-display text-lg font-bold text-foreground">Nova operação</h2>
            <p className="mt-1 text-xs text-muted-foreground">Selecione a nova taxa / coeficiente (aplicado a todas as parcelas).</p>
            <div className="mt-4">
              {coefs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nenhum coeficiente cadastrado. Cadastre em <strong>Coeficientes</strong>.
                </div>
              ) : (
                <Select value={selectedCoefId} onValueChange={setSelectedCoefId}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione taxa / coeficiente" /></SelectTrigger>
                  <SelectContent>
                    {coefs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {pct(Number(c.taxa))} · {c.prazo}m · coef {Number(c.coeficiente).toFixed(8)} {c.bank ? `· ${c.bank}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {coefSelecionado && totalParcela > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Mini label="Novo valor financiado" value={brl(totalNovoValorFinanciado)} />
                <Mini label="Total liberado" value={brl(totalTroco)} accent={totalTroco > 0} negative={totalTroco <= 0} />
              </div>
            )}

            {/* Comissão da empresa — apenas admin */}
            {isAdmin && coefSelecionado && valorBruto > 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-brand/40 bg-brand/5 p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-brand">
                  <Sparkles className="h-3.5 w-3.5" /> Empresa · interno admin
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Valor bruto</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">{brl(valorBruto)}</div>
                  <div className="text-muted-foreground">% comissão empresa {commCfg ? "" : "(sem cadastro)"}</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">{pct(comissaoPct, 3)}</div>
                  <div className="text-muted-foreground">Comissão total empresa</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">{brl(comissaoValor)}</div>
                  <div className="text-muted-foreground">Repasse vendedor</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">- {brl(sellerValor)}</div>
                </div>
                <div className="mt-3 flex items-baseline justify-between border-t border-brand/20 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lucro líquido</div>
                  <div className="font-display text-2xl font-extrabold tabular-nums text-brand">{brl(lucroEmpresa)}</div>
                </div>
              </div>
            )}

            {/* Comissão do vendedor — visível para todos */}
            {coefSelecionado && valorBruto > 0 && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> {isAdmin ? "Comissão do vendedor (você)" : "Minha comissão"}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Valor bruto</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">{brl(valorBruto)}</div>
                  <div className="text-muted-foreground">% comissão {sellerCfg ? "" : "(sem cadastro)"}</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">{pct(sellerPct, 3)}</div>
                </div>
                <div className="mt-3 flex items-baseline justify-between border-t border-primary/20 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isAdmin ? "Comissão vendedor" : "Você recebe"}</div>
                  <div className="font-display text-2xl font-extrabold tabular-nums text-primary">{brl(sellerValor)}</div>
                </div>
              </div>
            )}

            <Button onClick={handleSimular} disabled={!canSimular} className="mt-5 h-14 w-full bg-primary text-base font-semibold text-primary-foreground shadow-elevated hover:bg-primary/90">
              <Sparkles className="mr-2 h-5 w-5" /> Simular
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div id="preview-section" className="space-y-4">
          <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
            <h2 className="font-display text-lg font-bold text-foreground">Pré-visualização</h2>
            <p className="mt-1 text-xs text-muted-foreground">É exatamente isso que o cliente vai receber.</p>

            <div className="mt-4 overflow-x-auto rounded-xl bg-secondary/40 p-3">
              <div className="origin-top-left scale-[0.55] sm:scale-[0.6]" style={{ width: 720, height: 1080 }}>
                <SimulationCard ref={cardRef} data={data} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleDownload} disabled={!showPreview} className="h-11"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
              <Button variant="outline" onClick={handleCopy} disabled={!showPreview} className="h-11"><Copy className="mr-2 h-4 w-4" /> Copiar</Button>
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || !canSimular}
              className="mt-3 h-14 w-full bg-gradient-brand text-base font-semibold text-brand-foreground shadow-brand hover:opacity-95"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Send className="mr-2 h-5 w-5" /> Enviar Simulação</>}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              A imagem é copiada e o WhatsApp abre — basta colar no chat (Ctrl+V).
            </p>
          </div>
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

function Mini({ label, value, accent, negative }: { label: string; value: string; accent?: boolean; negative?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${negative ? "border-destructive/40 bg-destructive/5" : accent ? "border-brand/40 bg-brand/5" : "border-border bg-secondary/40"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg font-extrabold tabular-nums ${negative ? "text-destructive" : accent ? "text-brand" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
