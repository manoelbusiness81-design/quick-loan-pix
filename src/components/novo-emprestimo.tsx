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
import { NovoEmprestimoCard, type NovoEmprestimoOpcao } from "./novo-emprestimo-card";

interface Coef { id: string; bank: string; prazo: number; taxa: number; coeficiente: number; modalidade?: string; }

const TAXA_MENSAL = 0.02; // C1 na planilha Ex1
const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

/**
 * Reproduz a lógica da aba Ex1 da planilha de referência.
 * - Valor Liberado: parcela / coef_108 (único — mesmo valor para todos os cenários).
 * - 108x: parcela informada.
 * - 36x: média mensal = (36·P + Σ pv(k), k=1..108) / 36  →  P + Σ/36  (bloco Ex1 linhas 59–94).
 * - 54x: média mensal = (54·P + Σ pv(k), k=55..108) / 40             (bloco Ex1 linhas 98–151, M98 = J152/40).
 *   onde pv(k) = P / (1 + 0,02)^k.
 */
function calcularCenarios(parcela: number, coef108: number) {
  const pv = (k: number) => parcela / Math.pow(1 + TAXA_MENSAL, k);
  const valorLiberado = coef108 > 0 ? parcela / coef108 : 0;

  let soma108 = 0;
  for (let k = 1; k <= 108; k++) soma108 += pv(k);
  const parcela36 = parcela + soma108 / 36;

  let soma54 = 0;
  for (let k = 55; k <= 108; k++) soma54 += pv(k);
  const parcela54 = (54 * parcela + soma54) / 40;

  return [
    { prazo: 108, parcela, valorLiberado },
    { prazo: 54, parcela: parcela54, valorLiberado },
    { prazo: 36, parcela: parcela36, valorLiberado },
  ] as NovoEmprestimoOpcao[];
}

export function NovoEmprestimo() {
  const { user, isAdmin } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [parcela, setParcela] = useState("");
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase.from("coefficients") as any)
      .select("*")
      .eq("modalidade", "novo_emprestimo")
      .eq("prazo", 108)
      .then(({ data }: any) => setCoefs((data as Coef[]) ?? []));
  }, [user]);

  const parcelaN = toNum(parcela);

  // Melhor coeficiente de 108x cadastrado (menor = maior valor liberado).
  const coef108 = useMemo(() => {
    const v = coefs.filter((c) => Number(c.coeficiente) > 0);
    if (v.length === 0) return 0;
    return v.reduce((a, b) => (Number(a.coeficiente) < Number(b.coeficiente) ? a : b)).coeficiente;
  }, [coefs]);

  const opcoes = useMemo(() => calcularCenarios(parcelaN, Number(coef108)), [parcelaN, coef108]);

  const valorLiberado = opcoes[0]?.valorLiberado ?? 0;
  const faltaCoef = coef108 <= 0;
  const canSimular = !!cliente && parcelaN > 0 && !faltaCoef;

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!cliente) return toast.error("Informe o nome do cliente.");
    if (parcelaN <= 0) return toast.error("Informe o valor da parcela.");
    if (faltaCoef) return toast.error("Cadastre o coeficiente de 108x para Novo Empréstimo.");
    setShowPreview(true);
    setTimeout(() => document.getElementById("ne-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSend = async () => {
    if (!canSimular) return toast.error("Preencha os dados e verifique o coeficiente de 108x.");
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
      const valorFmt = brl(valorLiberado);
      const msg = encodeURIComponent(
        `Simulação sem compromisso, com valor liberado de ${valorFmt}, e fazendo conosco você ganha 3 meses de carência.`
      );
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
          <div className="mt-3">
            <Field label="Valor da parcela (margem disponível)">
              <Input value={parcela} onChange={(e) => setParcela(e.target.value)} className="h-11" placeholder="567,35" inputMode="decimal" />
            </Field>
          </div>

          {faltaCoef && (
            <div className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber/10 p-3 text-xs text-foreground">
              Cadastre o coeficiente de <strong>108x</strong> em Novo Empréstimo. Os cenários de 54x e 36x são calculados pela lógica de antecipação (Ex1).
            </div>
          )}

          {parcelaN > 0 && valorLiberado > 0 && (
            <>
              <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Valor liberado</div>
                <div className="mt-1 font-display text-2xl font-extrabold tabular-nums text-brand">{brl(valorLiberado)}</div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {opcoes.map((o) => (
                  <div key={o.prazo} className="rounded-xl border border-border bg-card p-3 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{o.prazo}x</div>
                    <div className="mt-1 font-display text-base font-extrabold tabular-nums text-foreground">{brl(o.parcela)}</div>
                    <div className="text-[10px] text-muted-foreground">/mês</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {isAdmin && parcelaN > 0 && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Cálculo (Ex1): VL = Parcela ÷ Coef108. Parcela 36x = P + Σ pv(1..108)/36. Parcela 54x = (54·P + Σ pv(55..108))/40. pv(k)=P/1,02ᵏ.
            </p>
          )}

          <Button onClick={handleSimular} disabled={!canSimular} className="mt-5 h-14 w-full bg-primary text-base font-semibold text-primary-foreground shadow-elevated hover:bg-primary/90">
            <Sparkles className="mr-2 h-5 w-5" /> Simular
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div id="ne-preview" className="space-y-4">
        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Pré-visualização</h2>
          <p className="mt-1 text-xs text-muted-foreground">É exatamente isso que o cliente vai receber.</p>

          <div className="mt-4 overflow-x-auto rounded-xl bg-secondary/40 p-3">
            <div className="origin-top-left scale-[0.55] sm:scale-[0.6]" style={{ width: 720, height: 820 }}>
              <NovoEmprestimoCard ref={cardRef} data={{ cliente, opcoes }} />
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
