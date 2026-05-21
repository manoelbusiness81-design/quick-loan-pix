import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Send, Sparkles, Loader2, Copy, Download, RefreshCw, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimulationCard, type SimulationData } from "@/components/simulation-card";
import { brl, formatPhoneBR, onlyDigits, pct } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: SimulatorPage,
});

interface Coef { id: string; bank: string; prazo: number; taxa: number; coeficiente: number; }
interface Comm { id: string; taxa: number; percentual: number; }

const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

/** PV de uma série uniforme: SD = ((1-(1+i)^-n)/i) * PMT  (i em decimal por mês) */
function calcSaldoDevedor(parcela: number, prazo: number, taxaPctMes: number): number {
  const i = taxaPctMes / 100;
  if (!parcela || !prazo || i <= 0) return 0;
  return ((1 - Math.pow(1 + i, -prazo)) / i) * parcela;
}

function SimulatorPage() {
  const { user } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [selectedCoefId, setSelectedCoefId] = useState<string>("");

  // Inputs do operador
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [parcela, setParcela] = useState("");
  const [prazoRestante, setPrazoRestante] = useState("");
  const [taxaAtual, setTaxaAtual] = useState("");

  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("coefficients").select("*").order("taxa").then(({ data }) => setCoefs((data as Coef[]) ?? []));
    supabase.from("commissions").select("*").order("taxa").then(({ data }) => setComms((data as Comm[]) ?? []));
  }, [user]);

  // Cálculos
  const nParcela = toNum(parcela);
  const nPrazo = parseInt(prazoRestante) || 0;
  const nTaxa = toNum(taxaAtual);
  const saldoDevedor = useMemo(() => calcSaldoDevedor(nParcela, nPrazo, nTaxa), [nParcela, nPrazo, nTaxa]);

  const coefSelecionado = coefs.find((c) => c.id === selectedCoefId);
  const novoValorFinanciado = coefSelecionado && nParcela > 0 ? nParcela / Number(coefSelecionado.coeficiente) : 0;
  const troco = novoValorFinanciado - saldoDevedor;
  const valorBruto = saldoDevedor + troco; // = novoValorFinanciado

  const commCfg = useMemo(
    () => (coefSelecionado ? comms.find((c) => Math.abs(Number(c.taxa) - Number(coefSelecionado.taxa)) < 0.0001) : undefined),
    [comms, coefSelecionado]
  );
  const comissaoPct = commCfg ? Number(commCfg.percentual) : 0;
  const comissaoValor = (valorBruto * comissaoPct) / 100;

  const data: SimulationData = {
    cliente,
    parcela: nParcela,
    prazoRestante: nPrazo,
    taxaAtual: nTaxa,
    saldoDevedor,
    taxaNova: coefSelecionado ? Number(coefSelecionado.taxa) : 0,
    prazoNovo: coefSelecionado ? Number(coefSelecionado.prazo) : 0,
    novoValorFinanciado,
    troco,
    banco: coefSelecionado?.bank,
  };

  const canSimular = cliente && nParcela > 0 && nPrazo > 0 && nTaxa > 0 && !!coefSelecionado && troco > 0;

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!cliente) return toast.error("Informe o nome do cliente.");
    if (nParcela <= 0 || nPrazo <= 0 || nTaxa <= 0) return toast.error("Preencha parcela, prazo restante e taxa atual.");
    if (!coefSelecionado) return toast.error("Selecione uma nova taxa / coeficiente.");
    if (troco <= 0) return toast.error("Operação sem troco positivo. Ajuste a nova taxa.");
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
      const msg = encodeURIComponent(`Olá ${cliente.split(" ")[0]}, segue sua simulação de refinanciamento.`);
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
    setCliente(""); setTelefone(""); setParcela(""); setPrazoRestante(""); setTaxaAtual("");
    setSelectedCoefId(""); setShowPreview(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">Simulador de Refinanciamento</h1>
          <p className="mt-1 text-sm text-muted-foreground">Saldo devedor calculado automaticamente. Simule e envie em segundos.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Limpar
        </Button>
      </div>

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
            <h2 className="font-display text-lg font-bold text-foreground">Contrato atual</h2>
            <p className="mt-1 text-xs text-muted-foreground">O saldo devedor é calculado automaticamente.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Valor da parcela"><Input value={parcela} onChange={(e) => setParcela(e.target.value)} className="h-11" placeholder="450,00" inputMode="decimal" /></Field>
              <Field label="Prazo restante (meses)"><Input value={prazoRestante} onChange={(e) => setPrazoRestante(onlyDigits(e.target.value))} className="h-11" placeholder="60" inputMode="numeric" /></Field>
              <Field label="Taxa atual (% a.m.)"><Input value={taxaAtual} onChange={(e) => setTaxaAtual(e.target.value)} className="h-11" placeholder="1,99" inputMode="decimal" /></Field>
            </div>

            {saldoDevedor > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary/50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Calculator className="h-3.5 w-3.5" /> Saldo devedor calculado
                </div>
                <div className="font-display text-2xl font-extrabold tabular-nums text-foreground">{brl(saldoDevedor)}</div>
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
            <h2 className="font-display text-lg font-bold text-foreground">Nova operação</h2>
            <p className="mt-1 text-xs text-muted-foreground">Selecione a nova taxa / coeficiente.</p>
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

            {coefSelecionado && nParcela > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Mini label="Novo valor financiado" value={brl(novoValorFinanciado)} />
                <Mini label="Troco liberado" value={brl(troco)} accent={troco > 0} negative={troco <= 0} />
              </div>
            )}

            {/* Comissão interna */}
            {coefSelecionado && valorBruto > 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-brand/40 bg-brand/5 p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-brand">
                  <Sparkles className="h-3.5 w-3.5" /> Comissão interna · não enviada ao cliente
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Valor bruto da operação</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">{brl(valorBruto)}</div>
                  <div className="text-muted-foreground">% comissão ({commCfg ? "configurada" : "sem cadastro"})</div>
                  <div className="text-right font-semibold tabular-nums text-foreground">{pct(comissaoPct, 3)}</div>
                </div>
                <div className="mt-3 flex items-baseline justify-between border-t border-brand/20 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comissão</div>
                  <div className="font-display text-2xl font-extrabold tabular-nums text-brand">{brl(comissaoValor)}</div>
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
              <div className="origin-top-left scale-[0.55] sm:scale-[0.6]" style={{ width: 720, height: 980 }}>
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
