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

const PRAZOS_FIXOS = [108, 54, 36] as const;
const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

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
      .order("prazo", { ascending: false })
      .then(({ data }: any) => setCoefs((data as Coef[]) ?? []));
  }, [user]);

  const parcelaN = toNum(parcela);

  // Para cada prazo fixo, pega o MENOR coeficiente cadastrado (melhor opção para o cliente).
  const opcoes: NovoEmprestimoOpcao[] = useMemo(() => {
    return PRAZOS_FIXOS.map((prazo) => {
      const candidatos = coefs.filter((c) => Number(c.prazo) === prazo && Number(c.coeficiente) > 0);
      if (candidatos.length === 0 || parcelaN <= 0) {
        return { prazo, parcela: parcelaN, valorLiberado: 0 };
      }
      const melhor = candidatos.reduce((a, b) => (Number(a.coeficiente) < Number(b.coeficiente) ? a : b));
      const vl = parcelaN / Number(melhor.coeficiente);
      return { prazo, parcela: parcelaN, valorLiberado: vl };
    });
  }, [coefs, parcelaN]);

  const opcaoDestaque = opcoes.reduce((a, b) => (a.valorLiberado > b.valorLiberado ? a : b), opcoes[0]);
  const valorLiberadoDestaque = opcaoDestaque?.valorLiberado ?? 0;

  const coefsFaltando = PRAZOS_FIXOS.filter((p) => !coefs.some((c) => Number(c.prazo) === p));
  const canSimular = !!cliente && parcelaN > 0 && opcoes.every((o) => o.valorLiberado > 0);

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!cliente) return toast.error("Informe o nome do cliente.");
    if (parcelaN <= 0) return toast.error("Informe o valor da parcela.");
    if (coefsFaltando.length > 0) {
      return toast.error(`Cadastre coeficientes para os prazos: ${coefsFaltando.join(", ")}`);
    }
    setShowPreview(true);
    setTimeout(() => document.getElementById("ne-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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
      const valorFmt = brl(valorLiberadoDestaque);
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

          {coefsFaltando.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-amber/60 bg-amber/10 p-3 text-xs text-foreground">
              Cadastre coeficientes de <strong>Novo Empréstimo</strong> para os prazos: <strong>{coefsFaltando.join(", ")}</strong>.
            </div>
          )}

          {parcelaN > 0 && opcoes.some((o) => o.valorLiberado > 0) && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              {opcoes.map((o) => (
                <div key={o.prazo} className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{o.prazo}x</div>
                  <div className="mt-1 font-display text-base font-extrabold tabular-nums text-brand">{brl(o.valorLiberado)}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">{brl(o.parcela)} /mês</div>
                </div>
              ))}
            </div>
          )}

          {isAdmin && parcelaN > 0 && (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Cálculo: Valor Liberado = Parcela ÷ Coeficiente cadastrado por prazo.
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
