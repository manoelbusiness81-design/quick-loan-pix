import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Send, Sparkles, Loader2, Copy, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { brl, formatPhoneBR, onlyDigits } from "@/lib/format";
import { toast } from "sonner";
import { GovMaCard, type GovMaOpcao } from "./gov-ma-card";
import { fetchWhatsappTemplate, renderWhatsappMessage } from "@/lib/whatsapp";
import { recordSimulation } from "@/lib/simulations";
import { supabase } from "@/integrations/supabase/client";
import { CommissionPanel } from "./commission-panel";

/**
 * GOV MA — réplica exata da planilha "Simulador GOV MA".
 *
 * Bloco 117x (C3 = Cartão Crédito, C5 = Taxa, C6 = 117):
 *   E7  = C3 / coefPrincipal(taxa)
 *   F7  = C3                                                     (prazo 117)
 *   E9..E15 = C3 / coefDemais(taxa)
 *   F(n) = ((C3*(1-(1+i)^-117)/i) * i / (1-(1+i)^-prazo)) * (1-desc)
 *          prazos 58 (5%), 39 (6%), 29 (6%), 13 (8%)
 *
 * Bloco 96x (J3, J5, J6 = 96): mesma estrutura, prazos 60 (5%), 48 (6%), 24 (6%), 12 (8%).
 */

type Bloco = "117" | "96";

const COEF: Record<Bloco, { taxa: number; principal: number; demais: number }[]> = {
  "117": [
    { taxa: 2.9, principal: 0.0404869475841648, demais: 0.0404869475841648 },
    { taxa: 3.25, principal: 0.0449172110089976, demais: 0.0455107986784606 },
    { taxa: 3.3, principal: 0.0521910879344688, demais: 0.0521910879344688 },
  ],
  "96": [
    { taxa: 2.9, principal: 0.0411738143404302, demais: 0.0411738143404302 },
    { taxa: 3.15, principal: 0.0442559498674855, demais: 0.0411738143404302 },
    { taxa: 3.25, principal: 0.0455107986784606, demais: 0.0455107986784606 },
    { taxa: 3.3, principal: 0.0521910879344688, demais: 0.0521910879344688 },
    { taxa: 3.4, principal: 0.0474153553203375, demais: 0.0474153553203375 },
  ],
};

/** Coeficientes próprios do Cartão Benefício (planilha) — independentes do Cartão Crédito. */
const COEF_BENEF: Record<Bloco, { taxa: number; coef: number }[]> = {
  "117": [
    { taxa: 2.9, coef: 0.0404869475841648 },
    { taxa: 3.25, coef: 0.0455107986784606 },
    { taxa: 3.3, coef: 0.0521910879344688 },
  ],
  "96": [
    { taxa: 2.9, coef: 0.0411738143404302 },
    { taxa: 3.15, coef: 0.0411738143404302 },
    { taxa: 3.25, coef: 0.0455107986784606 },
    { taxa: 3.3, coef: 0.0521910879344688 },
    { taxa: 3.4, coef: 0.0474153553203375 },
  ],
};

/** prazo + desconto aplicado (planilha: (1-5%), (1-6%), (1-8%)) */
const LINHAS: Record<Bloco, { prazo: number; desc: number }[]> = {
  "117": [
    { prazo: 58, desc: 0.05 },
    { prazo: 39, desc: 0.06 },
    { prazo: 29, desc: 0.06 },
    { prazo: 13, desc: 0.08 },
  ],
  "96": [
    { prazo: 60, desc: 0.05 },
    { prazo: 48, desc: 0.06 },
    { prazo: 24, desc: 0.06 },
    { prazo: 12, desc: 0.08 },
  ],
};

const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

export function GovMa() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bloco, setBloco] = useState<Bloco>("117");
  const [taxa, setTaxa] = useState<number>(3.3);
  const [cartao, setCartao] = useState("600,00");
  const [beneficio, setBeneficio] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const baseCredito = toNum(cartao);
  const baseBeneficio = toNum(beneficio);
  const base = baseCredito + baseBeneficio;
  const prazoBase = bloco === "117" ? 117 : 96;
  const taxasDisponiveis = COEF[bloco];
  const coefRow = taxasDisponiveis.find((t) => t.taxa === taxa);
  const coefBenef = COEF_BENEF[bloco].find((t) => t.taxa === taxa);

  const opcoes: GovMaOpcao[] = useMemo(() => {
    if (!coefRow || base <= 0) return [];
    const i = taxa / 100;

    /** Mesma lógica/antecipação já existente, aplicada a cada produto isoladamente. */
    const calc = (valorParcela: number, coefPrincipal: number, coefDemais: number): GovMaOpcao[] => {
      if (valorParcela <= 0) return [];
      const pv = (valorParcela * (1 - Math.pow(1 + i, -prazoBase))) / i;
      return [
        { prazo: prazoBase, parcela: valorParcela, valorLiberado: valorParcela / coefPrincipal },
        ...LINHAS[bloco].map(({ prazo, desc }) => ({
          prazo,
          parcela: ((pv * i) / (1 - Math.pow(1 + i, -prazo))) * (1 - desc),
          valorLiberado: valorParcela / coefDemais,
        })),
      ];
    };

    const credito = calc(baseCredito, coefRow.principal, coefRow.demais);
    const benef = coefBenef ? calc(baseBeneficio, coefBenef.coef, coefBenef.coef) : [];

    if (benef.length === 0) return credito;
    if (credito.length === 0) return benef;
    return credito.map((c, idx) => ({
      prazo: c.prazo,
      parcela: c.parcela + (benef[idx]?.parcela ?? 0),
      valorLiberado: c.valorLiberado + (benef[idx]?.valorLiberado ?? 0),
    }));
  }, [base, baseCredito, baseBeneficio, bloco, coefRow, coefBenef, prazoBase, taxa]);

  const valorLiberado = opcoes[0]?.valorLiberado ?? 0;
  const canSimular = !!cliente && base > 0 && !!coefRow && valorLiberado > 0;

  const data = { cliente, taxa, base, opcoes };

  const onBloco = (b: Bloco) => {
    setBloco(b);
    if (!COEF[b].some((t) => t.taxa === taxa)) setTaxa(COEF[b][0].taxa);
  };

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!cliente) return toast.error("Informe o nome do cliente.");
    if (base <= 0) return toast.error("Informe o valor do Cartão Crédito e/ou do Cartão Benefício.");
    if (!coefRow) return toast.error("Selecione uma taxa válida.");
    setShowPreview(true);
    setTimeout(() => document.getElementById("govma-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSend = async () => {
    if (!canSimular) return toast.error("Preencha os dados da simulação.");
    const phone = onlyDigits(telefone);
    if (phone.length < 10) return toast.error("Informe um WhatsApp válido.");
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
      const template = await fetchWhatsappTemplate("gov_ma");
      const msg = encodeURIComponent(
        renderWhatsappMessage(template, valorLiberado, { nome: cliente, parcela: opcoes[0]?.parcela ?? 0, prazo: prazoBase })
      );
      await recordSimulation({
        cliente,
        telefone: phone,
        modalidade: "gov_ma",
        valor_liberado: valorLiberado,
        parcela: opcoes[0]?.parcela ?? null,
        prazo: prazoBase,
      });
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

  return (
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

          <div className="mt-4">
            <Label className="text-xs font-semibold text-muted-foreground">Cálculo</Label>
            <div className="mt-1.5 inline-flex rounded-xl bg-secondary p-1">
              {(["117", "96"] as Bloco[]).map((b) => (
                <button
                  key={b}
                  onClick={() => onBloco(b)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    bloco === b ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b}x
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-3">
              <Field label="Cartão Crédito">
                <Input value={cartao} onChange={(e) => setCartao(e.target.value)} className="h-11" placeholder="600,00" inputMode="decimal" />
              </Field>
              <Field label="Cartão Benefício">
                <Input value={beneficio} onChange={(e) => setBeneficio(e.target.value)} className="h-11" placeholder="0,00" inputMode="decimal" />
              </Field>
            </div>
            <Field label="Taxa">
              <div className="flex flex-wrap gap-1.5">
                {taxasDisponiveis.map((t) => (
                  <button
                    key={t.taxa}
                    onClick={() => setTaxa(t.taxa)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      taxa === t.taxa ? "border-brand bg-brand/10 text-brand" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {valorLiberado > 0 && (
            <>
              <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor liberado</div>
                <div className="mt-1 font-display text-2xl font-extrabold tabular-nums text-brand">{brl(valorLiberado)}</div>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {opcoes.map((o) => (
                  <div key={o.prazo} className="rounded-xl border border-border bg-card p-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{o.prazo}x</div>
                    <div className="mt-1 font-display text-sm font-extrabold tabular-nums text-foreground">{brl(o.parcela)}</div>
                    <div className="text-[10px] text-muted-foreground">/mês</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <Button onClick={handleSimular} disabled={!canSimular} className="mt-5 h-14 w-full bg-primary text-base font-semibold text-primary-foreground shadow-elevated hover:bg-primary/90">
            <Sparkles className="mr-2 h-5 w-5" /> Simular
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div id="govma-preview" className="space-y-4">
        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Pré-visualização</h2>
          <p className="mt-1 text-xs text-muted-foreground">É exatamente isso que o cliente vai receber.</p>

          <div className="mt-4 overflow-x-auto rounded-xl bg-secondary/40 p-3">
            <div className="origin-top-left scale-[0.55] sm:scale-[0.6]" style={{ width: 720, height: 900 }}>
              <GovMaCard ref={cardRef} data={data} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleDownload} disabled={!showPreview} className="h-11"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
            <Button variant="outline" onClick={handleCopy} disabled={!showPreview} className="h-11"><Copy className="mr-2 h-4 w-4" /> Copiar</Button>
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || !canSimular || onlyDigits(telefone).length < 10}
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
