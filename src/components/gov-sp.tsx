import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Send, Sparkles, Loader2, Copy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { brl, formatPhoneBR, onlyDigits } from "@/lib/format";
import { toast } from "sonner";
import { GovSpCard, type GovSpOpcao } from "./gov-sp-card";
import { fetchWhatsappTemplate, renderWhatsappMessage } from "@/lib/whatsapp";
import { recordSimulation } from "@/lib/simulations";

/**
 * GOV SP — replica exata da planilha "Novo GOV SP".
 *
 * Entradas:
 *   - margemCartao (C2), margemNovo (C3).
 *
 * Coeficientes cadastrados em Coeficientes → Gov SP, com 2 bancos:
 *   "Gov SP - Cartão"  → prazos 96, 60, 48, 24, 12
 *   "Gov SP - Novo"    → prazos 96, 60, 48, 24, 12
 *   coeficiente = parcela por R$1 de valor liberado (equivalente ao PMT unitário).
 *
 * Cálculo (idêntico ao Excel):
 *   valorLiberadoCartao = margemCartao / coefCartao(96)
 *   valorLiberadoNovo   = margemNovo   / coefNovo(96)
 *   valorLiberado       = valorLiberadoCartao + valorLiberadoNovo   (mesmo para todos os prazos)
 *   parcela(prazo)      = valorLiberadoCartao * coefCartao(prazo) + valorLiberadoNovo * coefNovo(prazo)
 *
 * Antecipada (bloco C17/C18 da planilha):
 *   antecipada          = margemCartao * 80,05%
 *   parcelaAntecipada   = margemCartao - antecipada
 */

interface Coef {
  id: string;
  bank: string;
  prazo: number;
  taxa: number;
  coeficiente: number;
  modalidade?: string;
}

const PRAZOS = [96, 60, 48, 24, 12];
const ANTECIPADA_PCT = 0.8005;
const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

function findCoef(list: Coef[], bank: string, prazo: number): number {
  const hit = list.find((c) => c.bank === bank && Number(c.prazo) === prazo);
  return hit ? Number(hit.coeficiente) : 0;
}

export function GovSp() {
  const { user } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [margemCartao, setMargemCartao] = useState("200,00");
  const [margemNovo, setMargemNovo] = useState("400,00");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase.from("coefficients") as any)
      .select("*")
      .eq("modalidade", "gov_sp")
      .order("bank")
      .order("prazo")
      .then(({ data }: any) => setCoefs((data as Coef[]) ?? []));
  }, [user]);

  const mCartao = toNum(margemCartao);
  const mNovo = toNum(margemNovo);

  const coefCartao96 = findCoef(coefs, "Gov SP - Cartão", 96);
  const coefNovo96 = findCoef(coefs, "Gov SP - Novo", 96);

  const vlCartao = coefCartao96 > 0 ? mCartao / coefCartao96 : 0;
  const vlNovo = coefNovo96 > 0 ? mNovo / coefNovo96 : 0;
  const valorLiberado = vlCartao + vlNovo;

  const opcoes: GovSpOpcao[] = useMemo(() => {
    return PRAZOS.map((p) => {
      const cc = findCoef(coefs, "Gov SP - Cartão", p);
      const cn = findCoef(coefs, "Gov SP - Novo", p);
      const parcela = vlCartao * cc + vlNovo * cn;
      return { prazo: p, parcela, valorLiberado };
    });
  }, [coefs, vlCartao, vlNovo, valorLiberado]);

  const antecipada = mCartao * ANTECIPADA_PCT;
  const parcelaAntecipada = mCartao - antecipada;

  const faltaCoef = coefs.length < 10 || coefCartao96 <= 0 || coefNovo96 <= 0;
  const canSimular = !!cliente && (mCartao > 0 || mNovo > 0) && !faltaCoef && valorLiberado > 0;

  const data = {
    cliente,
    margemCartao: mCartao,
    margemNovo: mNovo,
    opcoes,
    antecipada,
    parcelaAntecipada,
  };

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!cliente) return toast.error("Informe o nome do cliente.");
    if (mCartao <= 0 && mNovo <= 0) return toast.error("Informe ao menos uma margem.");
    if (faltaCoef) return toast.error("Cadastre todos os coeficientes de Gov SP (Cartão e Novo).");
    setShowPreview(true);
    setTimeout(() => document.getElementById("govsp-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSend = async () => {
    if (!canSimular) return toast.error("Preencha os dados e verifique os coeficientes.");
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
      const template = await fetchWhatsappTemplate("gov_sp");
      const msg = encodeURIComponent(renderWhatsappMessage(template, valorLiberado, { nome: cliente, parcela: opcoes[0]?.parcela ?? 0 }));
      await recordSimulation({
        cliente,
        telefone: phone,
        modalidade: "gov_sp" as any,
        valor_liberado: valorLiberado,
        parcela: opcoes[0]?.parcela ?? null,
        prazo: 96,
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
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Margem Cartão">
              <Input value={margemCartao} onChange={(e) => setMargemCartao(e.target.value)} className="h-11" placeholder="200,00" inputMode="decimal" />
            </Field>
            <Field label="Margem Novo">
              <Input value={margemNovo} onChange={(e) => setMargemNovo(e.target.value)} className="h-11" placeholder="400,00" inputMode="decimal" />
            </Field>
          </div>

          {faltaCoef && (
            <div className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber/10 p-3 text-xs text-foreground">
              Cadastre os coeficientes de <strong>Gov SP</strong> (bancos <em>Gov SP - Cartão</em> e <em>Gov SP - Novo</em>, prazos 96, 60, 48, 24 e 12).
            </div>
          )}

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
              {mCartao > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Antecipada</div>
                    <div className="mt-1 font-display text-base font-extrabold tabular-nums text-foreground">{brl(antecipada)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Parcela cartão</div>
                    <div className="mt-1 font-display text-base font-extrabold tabular-nums text-foreground">{brl(parcelaAntecipada)}</div>
                  </div>
                </div>
              )}
            </>
          )}

          <Button onClick={handleSimular} disabled={!canSimular} className="mt-5 h-14 w-full bg-primary text-base font-semibold text-primary-foreground shadow-elevated hover:bg-primary/90">
            <Sparkles className="mr-2 h-5 w-5" /> Simular
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div id="govsp-preview" className="space-y-4">
        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Pré-visualização</h2>
          <p className="mt-1 text-xs text-muted-foreground">É exatamente isso que o cliente vai receber.</p>

          <div className="mt-4 overflow-x-auto rounded-xl bg-secondary/40 p-3">
            <div className="origin-top-left scale-[0.55] sm:scale-[0.6]" style={{ width: 720, height: 900 }}>
              <GovSpCard ref={cardRef} data={data} />
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
