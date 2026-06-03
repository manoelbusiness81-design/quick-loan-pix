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
import { CommissionPanel } from "./commission-panel";

interface Coef { id: string; bank: string; prazo: number; taxa: number; coeficiente: number; modalidade?: string; }

const TAXA_MENSAL = 0.02;
const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

const CARENCIAS = [
  { dias: 90, label: "90 dias" },
  { dias: 60, label: "60 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 0, label: "Sem carência" },
] as const;

/** Mesma lógica Ex1 do Novo LOAS: VL = P / coef; 36x = P + Σpv(1..108)/36; 54x = (54·P + Σpv(55..108))/40 */
function calcularCenarios(parcela: number, coef: number) {
  const pv = (k: number) => parcela / Math.pow(1 + TAXA_MENSAL, k);
  const valorLiberado = coef > 0 ? parcela / coef : 0;
  let s108 = 0; for (let k = 1; k <= 108; k++) s108 += pv(k);
  const p36 = parcela + s108 / 36;
  let s54 = 0; for (let k = 55; k <= 108; k++) s54 += pv(k);
  const p54 = (54 * parcela + s54) / 40;
  return [
    { prazo: 108, parcela, valorLiberado },
    { prazo: 54, parcela: p54, valorLiberado },
    { prazo: 36, parcela: p36, valorLiberado },
  ] as NovoEmprestimoOpcao[];
}

export function NovoNormal() {
  const { user, isAdmin } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [parcela, setParcela] = useState("");
  const [carencia, setCarencia] = useState<number>(90);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase.from("coefficients") as any)
      .select("*")
      .eq("modalidade", "novo_normal")
      .then(({ data }: any) => setCoefs((data as Coef[]) ?? []));
  }, [user]);

  const parcelaN = toNum(parcela);

  const coefAtual = useMemo(() => {
    const v = coefs.filter((c) => Number(c.prazo) === carencia && Number(c.coeficiente) > 0);
    if (v.length === 0) return 0;
    return Number(v.reduce((a, b) => (Number(a.coeficiente) < Number(b.coeficiente) ? a : b)).coeficiente);
  }, [coefs, carencia]);

  const opcoes = useMemo(() => calcularCenarios(parcelaN, coefAtual), [parcelaN, coefAtual]);
  const valorLiberado = opcoes[0]?.valorLiberado ?? 0;
  const faltaCoef = coefAtual <= 0;
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
    if (faltaCoef) return toast.error(`Cadastre o coeficiente da carência ${CARENCIAS.find(c=>c.dias===carencia)?.label} em Novo Normal.`);
    setShowPreview(true);
    setTimeout(() => document.getElementById("nn-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSend = async () => {
    if (!canSimular) return toast.error("Preencha os dados e verifique o coeficiente.");
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
      const msg = encodeURIComponent(
        `Simulação sem compromisso, com valor liberado de ${brl(valorLiberado)}, e fazendo conosco você ganha 3 meses de carência.`
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

          <div className="mt-4">
            <Label className="text-xs font-semibold text-muted-foreground">Carência</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CARENCIAS.map((c) => {
                const ativo = carencia === c.dias;
                const cadastrado = coefs.some((x) => Number(x.prazo) === c.dias && Number(x.coeficiente) > 0);
                return (
                  <button
                    key={c.dias}
                    type="button"
                    onClick={() => setCarencia(c.dias)}
                    className={`rounded-xl border p-3 text-center transition ${
                      ativo
                        ? "border-brand bg-gradient-brand text-brand-foreground shadow-brand"
                        : "border-border bg-card hover:border-brand/50"
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Carência</div>
                    <div className="font-display text-sm font-extrabold">{c.label}</div>
                    {!cadastrado && !ativo && (
                      <div className="mt-1 text-[9px] text-amber">sem coef.</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {faltaCoef && (
            <div className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber/10 p-3 text-xs text-foreground">
              Cadastre o coeficiente em <strong>Coeficientes → Novo Normal</strong> com prazo igual aos dias de carência ({carencia}).
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
              Cálculo: VL = Parcela ÷ Coef({carencia}d). Parcelas 54x e 36x via lógica Ex1 (mesma do Novo LOAS).
            </p>
          )}

          <Button onClick={handleSimular} disabled={!canSimular} className="mt-5 h-14 w-full bg-primary text-base font-semibold text-primary-foreground shadow-elevated hover:bg-primary/90">
            <Sparkles className="mr-2 h-5 w-5" /> Simular
          </Button>
        </div>
      </div>

      <div id="nn-preview" className="space-y-4">
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
