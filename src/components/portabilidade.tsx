import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Send, Sparkles, Loader2, Copy, Download, Plus, Trash2, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, formatPhoneBR, onlyDigits } from "@/lib/format";
import { toast } from "sonner";
import { PortabilidadeCard, type PortabilidadeContrato } from "./portabilidade-card";
import { fetchWhatsappTemplate, renderWhatsappMessage } from "@/lib/whatsapp";
import { recordSimulation } from "@/lib/simulations";

/**
 * PORTABILIDADE — replica exata da aba "PROPOSTA PORT PURA" da planilha DRS.
 *
 * Fórmulas (idênticas ao Excel):
 *   SaldoDevedor  = ((1 - (1 + i)^-n) / i) * PMT
 *                   i = taxa atual do contrato (decimal/mês); n = prazo restante; PMT = parcela.
 *   ParcelaReduz. = SaldoDevedor * VLOOKUP(prazo, tabelaFinantoSelecionada, coef, TRUE)
 *                   VLOOKUP com TRUE = maior prazo <= prazo procurado.
 *   Redução       = ParcelaAtual - ParcelaReduzida
 *   EconomiaCont. = prazo * Redução
 *   Economia Tot. = SUM(EconomiaCont.)
 *   Validade      = "VALIDO" se Redução > 0; "NÃO PORTAR" se Redução < 0.
 *
 * Cada taxa "Finanto X,XX%" tem sua PRÓPRIA tabela de coeficientes.
 */

interface Coef {
  id: string;
  bank: string;
  prazo: number;
  taxa: number;
  coeficiente: number;
  modalidade?: string;
}

interface ContratoInput {
  id: string;
  prazo: string;
  parcela: string;
  taxaAtual: string; // % ao mês, digitado como "2,00"
}

const MAX_CONTRATOS = 6;
const uid = () => Math.random().toString(36).slice(2, 9);
const toNum = (s: string) => parseFloat((s || "").replace(/\./g, "").replace(",", ".")) || 0;

/** VLOOKUP(prazo, tabelaAscendentePorPrazo, TRUE) — retorna o coef do MAIOR prazo <= alvo. */
function lookupCoef(coefsBanco: Coef[], prazo: number): number {
  if (prazo <= 0 || coefsBanco.length === 0) return 0;
  const sorted = [...coefsBanco].sort((a, b) => a.prazo - b.prazo);
  let hit = 0;
  for (const c of sorted) {
    if (c.prazo <= prazo) hit = Number(c.coeficiente);
    else break;
  }
  return hit;
}

/** SD = ((1-(1+i)^-n)/i) * PMT — i em decimal ao mês. */
function calcSaldoDevedor(parcela: number, prazo: number, taxaDecimal: number): number {
  if (!parcela || !prazo || taxaDecimal <= 0) return 0;
  return ((1 - Math.pow(1 + taxaDecimal, -prazo)) / taxaDecimal) * parcela;
}

export function Portabilidade() {
  const { user } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const [allCoefs, setAllCoefs] = useState<Coef[]>([]);
  const [banco, setBanco] = useState<string>("");
  const [cliente, setCliente] = useState("");
  const [telefone, setTelefone] = useState("");
  const [contratos, setContratos] = useState<ContratoInput[]>([
    { id: uid(), prazo: "", parcela: "", taxaAtual: "" },
  ]);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    (supabase.from("coefficients") as any)
      .select("*")
      .eq("modalidade", "portabilidade")
      .order("bank")
      .order("prazo")
      .then(({ data }: any) => setAllCoefs((data as Coef[]) ?? []));
  }, [user]);

  const bancos = useMemo(() => {
    const s = new Set<string>();
    allCoefs.forEach((c) => s.add(c.bank));
    return Array.from(s).sort();
  }, [allCoefs]);

  useEffect(() => {
    if (!banco && bancos.length > 0) setBanco(bancos[0]);
  }, [bancos, banco]);

  const coefsBanco = useMemo(
    () => allCoefs.filter((c) => c.bank === banco),
    [allCoefs, banco]
  );

  const linhas: PortabilidadeContrato[] = useMemo(() => {
    return contratos.map((c) => {
      const prazo = parseInt(c.prazo) || 0;
      const parcela = toNum(c.parcela);
      const taxaPct = toNum(c.taxaAtual);
      const taxaDecimal = taxaPct / 100;
      const saldoDevedor = calcSaldoDevedor(parcela, prazo, taxaDecimal);
      const coef = lookupCoef(coefsBanco, prazo);
      const parcelaReduzida = saldoDevedor * coef;
      const reducao = parcela - parcelaReduzida;
      const economiaContrato = prazo * reducao;
      return { prazo, parcelaAtual: parcela, taxaAtual: taxaDecimal, saldoDevedor, parcelaReduzida, reducao, economiaContrato };
    });
  }, [contratos, coefsBanco]);

  const linhasValidas = linhas.filter((l) => l.prazo > 0 && l.parcelaAtual > 0 && l.taxaAtual > 0 && l.saldoDevedor > 0);
  const totalParcelaAtual = linhasValidas.reduce((s, l) => s + l.parcelaAtual, 0);
  const totalParcelaReduzida = linhasValidas.reduce((s, l) => s + l.parcelaReduzida, 0);
  const economiaMensal = linhasValidas.reduce((s, l) => s + l.reducao, 0);
  const economiaTotal = linhasValidas.reduce((s, l) => s + l.economiaContrato, 0);

  const bancoTaxa = coefsBanco[0] ? Number(coefsBanco[0].taxa) : 0;

  const data = {
    cliente,
    banco,
    contratos: linhasValidas,
    totalParcelaAtual,
    totalParcelaReduzida,
    economiaMensal,
    economiaTotal,
  };

  const canSimular = !!cliente && !!banco && linhasValidas.length > 0 && economiaMensal > 0;

  const update = (id: string, patch: Partial<ContratoInput>) =>
    setContratos((arr) => arr.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const add = () => {
    if (contratos.length >= MAX_CONTRATOS) return;
    setContratos((arr) => [...arr, { id: uid(), prazo: "", parcela: "", taxaAtual: "" }]);
  };
  const remove = (id: string) =>
    setContratos((arr) => (arr.length === 1 ? arr : arr.filter((c) => c.id !== id)));

  const generatePng = async (): Promise<Blob> => {
    if (!cardRef.current) throw new Error("Cartão não encontrado");
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const handleSimular = () => {
    if (!cliente) return toast.error("Informe o nome do cliente.");
    if (!banco) return toast.error("Selecione o banco / taxa.");
    if (linhasValidas.length === 0) return toast.error("Preencha ao menos um contrato (prazo, parcela e taxa atual).");
    if (economiaMensal <= 0) return toast.error("Sem redução com esta taxa. Selecione outra taxa Finanto.");
    setShowPreview(true);
    setTimeout(() => document.getElementById("port-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSend = async () => {
    if (!canSimular) return toast.error("Preencha os dados e verifique a taxa.");
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
      const template = await fetchWhatsappTemplate("portabilidade");
      // Na portabilidade, o "valor liberado" da mensagem é a economia total.
      const msg = encodeURIComponent(renderWhatsappMessage(template, economiaTotal, { nome: cliente, parcelaAtual: totalParcelaAtual, parcelaNova: totalParcelaReduzida }));
      await recordSimulation({
        cliente,
        telefone: phone,
        modalidade: "portabilidade" as any,
        valor_liberado: economiaTotal,
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
            <Field label="Banco / Taxa Finanto">
              {bancos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Nenhuma tabela cadastrada. Cadastre em <strong>Coeficientes → Portabilidade</strong>.
                </div>
              ) : (
                <Select value={banco} onValueChange={setBanco}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                  <SelectContent>
                    {bancos.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            {banco && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tabela ativa: <strong>{banco}</strong> · {coefsBanco.length} prazos cadastrados
                {bancoTaxa > 0 && <> · taxa alvo {(bancoTaxa * 100).toFixed(2).replace(".", ",")}%</>}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Contratos a portar</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Até {MAX_CONTRATOS} contratos. Saldo devedor e parcela reduzida calculados automaticamente.
              </p>
            </div>
            <Button
              size="sm" variant="outline" onClick={add}
              disabled={contratos.length >= MAX_CONTRATOS}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {contratos.map((c, idx) => {
              const l = linhas[idx];
              const statusValido = l && l.reducao > 0;
              const statusRuim = l && l.parcelaAtual > 0 && l.reducao < 0;
              return (
                <div key={c.id} className="rounded-xl border border-border bg-secondary/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Contrato {idx + 1}
                    </div>
                    {contratos.length > 1 && (
                      <button
                        onClick={() => remove(c.id)}
                        className="text-muted-foreground transition hover:text-destructive"
                        aria-label="Remover contrato"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Prazo (m)">
                      <Input value={c.prazo} onChange={(e) => update(c.id, { prazo: onlyDigits(e.target.value) })} className="h-10" placeholder="96" inputMode="numeric" />
                    </Field>
                    <Field label="Vlr. parcela">
                      <Input value={c.parcela} onChange={(e) => update(c.id, { parcela: e.target.value })} className="h-10" placeholder="1247,98" inputMode="decimal" />
                    </Field>
                    <Field label="Taxa atual %">
                      <Input value={c.taxaAtual} onChange={(e) => update(c.id, { taxaAtual: e.target.value })} className="h-10" placeholder="2,00" inputMode="decimal" />
                    </Field>
                  </div>
                  {l && l.saldoDevedor > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Saldo devedor</span><span className="font-bold tabular-nums text-foreground">{brl(l.saldoDevedor)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Parcela reduz.</span><span className="font-bold tabular-nums text-foreground">{brl(l.parcelaReduzida)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Redução</span><span className={`font-bold tabular-nums ${statusValido ? "text-brand" : statusRuim ? "text-destructive" : "text-foreground"}`}>{brl(l.reducao)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Economia</span><span className={`font-bold tabular-nums ${statusValido ? "text-brand" : "text-foreground"}`}>{brl(l.economiaContrato)}</span></div>
                      <div className="col-span-2 mt-1 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusValido ? "bg-brand/10 text-brand" : statusRuim ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                          {statusValido ? "Válido" : statusRuim ? "Não portar" : "—"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {economiaTotal > 0 && (
            <>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-secondary p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Calculator className="h-3.5 w-3.5" /> Economia mensal total
                </div>
                <div className="font-display text-xl font-extrabold tabular-nums text-foreground">{brl(economiaMensal)}</div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl border border-brand/40 bg-brand/5 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
                  <Sparkles className="h-3.5 w-3.5" /> Economia total (soma dos prazos)
                </div>
                <div className="font-display text-2xl font-extrabold tabular-nums text-brand">{brl(economiaTotal)}</div>
              </div>
            </>
          )}

          <Button onClick={handleSimular} disabled={!canSimular} className="mt-5 h-14 w-full bg-primary text-base font-semibold text-primary-foreground shadow-elevated hover:bg-primary/90">
            <Sparkles className="mr-2 h-5 w-5" /> Simular
          </Button>
        </div>
      </div>

      <div id="port-preview" className="space-y-4">
        <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
          <h2 className="font-display text-lg font-bold text-foreground">Pré-visualização</h2>
          <p className="mt-1 text-xs text-muted-foreground">É exatamente isso que o cliente vai receber.</p>

          <div className="mt-4 overflow-x-auto rounded-xl bg-secondary/40 p-3">
            <div className="origin-top-left scale-[0.55] sm:scale-[0.6]" style={{ width: 720, height: 900 }}>
              <PortabilidadeCard ref={cardRef} data={data} />
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
