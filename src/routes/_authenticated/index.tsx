import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Send, Sparkles, Loader2, Copy, Download, RefreshCw } from "lucide-react";
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

interface Coef {
  id: string; bank: string; prazo: number; taxa: number; coeficiente: number;
}
interface Comm { id: string; taxa: number; percentual: number; }

function SimulatorPage() {
  const { user } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [selectedCoefId, setSelectedCoefId] = useState<string>("");

  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [prazoInicial, setPrazoInicial] = useState("");
  const [prazoAtual, setPrazoAtual] = useState("");
  const [parcela, setParcela] = useState("");
  const [taxa, setTaxa] = useState("");
  const [saldoDevedor, setSaldoDevedor] = useState("");
  const [troco, setTroco] = useState("");
  const [banco, setBanco] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const [novaParcela, setNovaParcela] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("coefficients").select("*").order("bank").then(({ data }) => setCoefs((data as Coef[]) ?? []));
    supabase.from("commissions").select("*").order("taxa").then(({ data }) => setComms((data as Comm[]) ?? []));
  }, [user]);

  const onSelectCoef = (id: string) => {
    setSelectedCoefId(id);
    const c = coefs.find((x) => x.id === id);
    if (!c) return;
    setBanco(c.bank);
    setNovoPrazo(String(c.prazo));
    setTaxa(String(c.taxa).replace(".", ","));
    // sugere nova parcela = saldoDevedor liberado total * coef
  };

  const numTaxa = parseFloat(taxa.replace(",", ".")) || 0;
  const comissaoCfg = useMemo(() => comms.find((c) => Math.abs(Number(c.taxa) - numTaxa) < 0.0001), [comms, numTaxa]);
  const numTroco = parseFloat(troco.replace(/\./g, "").replace(",", ".")) || 0;
  const numParcela = parseFloat(parcela.replace(/\./g, "").replace(",", ".")) || 0;
  const comissaoPct = comissaoCfg ? Number(comissaoCfg.percentual) : 0;
  const comissaoValor = (numTroco * comissaoPct) / 100;

  const data: SimulationData = {
    cliente,
    prazoInicial: parseInt(prazoInicial) || 0,
    prazoAtual: parseInt(prazoAtual) || 0,
    parcela: numParcela,
    taxa: numTaxa,
    saldoDevedor: parseFloat(saldoDevedor.replace(/\./g, "").replace(",", ".")) || 0,
    troco: numTroco,
    banco: banco || undefined,
    novoPrazo: novoPrazo ? parseInt(novoPrazo) : undefined,
    novaParcela: novaParcela ? parseFloat(novaParcela.replace(/\./g, "").replace(",", ".")) : undefined,
  };

  const canSimular = cliente && numTroco > 0 && numParcela > 0;

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!canSimular) {
      toast.error("Preencha cliente, parcela e valor de troco para simular.");
      return;
    }
    setShowPreview(true);
    setTimeout(() => {
      document.getElementById("preview-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSend = async () => {
    if (!canSimular) { toast.error("Preencha os dados primeiro."); return; }
    const phone = onlyDigits(telefone);
    if (phone.length < 10) { toast.error("Informe um WhatsApp válido."); return; }
    setSending(true);
    try {
      const blob = await generatePng();
      // copia imagem para área de transferência
      let copied = false;
      try {
        if (navigator.clipboard && "write" in navigator.clipboard) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          copied = true;
        }
      } catch { copied = false; }

      if (!copied) {
        // fallback download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `simulacao-${cliente.replace(/\s+/g, "-").toLowerCase() || "cliente"}.png`;
        a.click(); URL.revokeObjectURL(url);
        toast.info("Imagem baixada", { description: "Anexe a imagem no WhatsApp que acabou de abrir." });
      } else {
        toast.success("Imagem copiada!", { description: "Cole no WhatsApp que acabou de abrir (Ctrl+V)." });
      }
      const ddi = phone.length === 11 || phone.length === 10 ? `55${phone}` : phone;
      const msg = encodeURIComponent("Olá, segue sua simulação atualizada.");
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
      toast.success("Imagem copiada para a área de transferência");
    } catch { toast.error("Seu navegador não permitiu copiar a imagem"); }
  };

  const reset = () => {
    setCliente(""); setTelefone(""); setPrazoInicial(""); setPrazoAtual("");
    setParcela(""); setTaxa(""); setSaldoDevedor(""); setTroco(""); setBanco("");
    setNovoPrazo(""); setNovaParcela(""); setSelectedCoefId(""); setShowPreview(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">Simulador</h1>
          <p className="mt-1 text-sm text-muted-foreground">Preencha os dados, simule e envie para o WhatsApp em segundos.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Limpar
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Dados da operação</h2>

          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nome do cliente">
                <Input value={cliente} onChange={(e) => setCliente(e.target.value)} className="h-11" placeholder="João da Silva" />
              </Field>
              <Field label="WhatsApp">
                <Input value={telefone} onChange={(e) => setTelefone(formatPhoneBR(e.target.value))} className="h-11" placeholder="(11) 99999-9999" inputMode="numeric" />
              </Field>
            </div>

            {coefs.length > 0 && (
              <Field label="Carregar coeficiente (opcional)">
                <Select value={selectedCoefId} onValueChange={onSelectCoef}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione um coeficiente" /></SelectTrigger>
                  <SelectContent>
                    {coefs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.bank} · {c.prazo}m · {pct(Number(c.taxa))} · coef {Number(c.coeficiente).toFixed(6)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prazo inicial"><Input value={prazoInicial} onChange={(e) => setPrazoInicial(onlyDigits(e.target.value))} className="h-11" placeholder="96" inputMode="numeric" /></Field>
              <Field label="Prazo atual"><Input value={prazoAtual} onChange={(e) => setPrazoAtual(onlyDigits(e.target.value))} className="h-11" placeholder="60" inputMode="numeric" /></Field>
              <Field label="Valor da parcela"><Input value={parcela} onChange={(e) => setParcela(e.target.value)} className="h-11" placeholder="450,00" inputMode="decimal" /></Field>
              <Field label="Taxa de juros (%)"><Input value={taxa} onChange={(e) => setTaxa(e.target.value)} className="h-11" placeholder="1,79" inputMode="decimal" /></Field>
              <Field label="Saldo devedor"><Input value={saldoDevedor} onChange={(e) => setSaldoDevedor(e.target.value)} className="h-11" placeholder="12000,00" inputMode="decimal" /></Field>
              <Field label="Valor de troco" emphasis><Input value={troco} onChange={(e) => setTroco(e.target.value)} className="h-11 border-brand/40 bg-accent font-semibold" placeholder="8500,00" inputMode="decimal" /></Field>
            </div>

            <details className="rounded-xl border border-border bg-secondary/40 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">Campos opcionais (banco / novo prazo / nova parcela)</summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Banco"><Input value={banco} onChange={(e) => setBanco(e.target.value)} className="h-11" placeholder="Banco X" /></Field>
                <Field label="Novo prazo"><Input value={novoPrazo} onChange={(e) => setNovoPrazo(onlyDigits(e.target.value))} className="h-11" placeholder="84" inputMode="numeric" /></Field>
                <Field label="Nova parcela"><Input value={novaParcela} onChange={(e) => setNovaParcela(e.target.value)} className="h-11" placeholder="380,00" inputMode="decimal" /></Field>
              </div>
            </details>

            {/* Comissão interna */}
            {numTroco > 0 && (
              <div className="rounded-xl border border-dashed border-brand/40 bg-brand/5 p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand">
                  <Sparkles className="h-3.5 w-3.5" /> Comissão interna (não enviada ao cliente)
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    {comissaoCfg ? <>Taxa {pct(numTaxa)} → <span className="font-semibold text-foreground">{pct(comissaoPct, 3)}</span></> : <>Sem comissão cadastrada para taxa {pct(numTaxa)}</>}
                  </div>
                  <div className="font-display text-2xl font-extrabold tabular-nums text-brand">{brl(comissaoValor)}</div>
                </div>
              </div>
            )}

            <Button onClick={handleSimular} disabled={!canSimular} className="h-14 w-full bg-primary text-base font-semibold text-primary-foreground shadow-elevated hover:bg-primary/90">
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
              <div className="origin-top-left scale-[0.55] sm:scale-[0.6]" style={{ width: 720, height: 920 }}>
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

function Field({ label, children, emphasis }: { label: string; children: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-xs font-semibold ${emphasis ? "text-brand" : "text-muted-foreground"}`}>{label}{emphasis && " ★"}</Label>
      {children}
    </div>
  );
}
