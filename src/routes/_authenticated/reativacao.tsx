import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, MessageCircle, RefreshCw, Download, Chrome, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  fetchReactivationTemplate,
  renderReactivationMessage,
  MODALIDADE_LABEL,
  type SimulationRecord,
} from "@/lib/simulations";
import { brl, onlyDigits } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/reativacao")({
  component: ReativacaoPage,
});

type Preset = "hoje" | "ontem" | "7" | "15" | "30" | "custom";

function startOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOf(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function isoDate(d: Date): string {
  const tz = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function rangeFor(preset: Preset, fromStr: string, toStr: string): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "hoje") return { from: startOf(now), to: endOf(now) };
  if (preset === "ontem") {
    const y = new Date(now); y.setDate(now.getDate() - 1);
    return { from: startOf(y), to: endOf(y) };
  }
  if (preset === "7" || preset === "15" || preset === "30") {
    const days = Number(preset);
    const f = new Date(now); f.setDate(now.getDate() - (days - 1));
    return { from: startOf(f), to: endOf(now) };
  }
  const from = fromStr ? startOf(new Date(fromStr + "T00:00:00")) : startOf(now);
  const to = toStr ? endOf(new Date(toStr + "T00:00:00")) : endOf(now);
  return { from, to };
}

function ReativacaoPage() {
  const { user, isAdmin } = useAuth();

  const [preset, setPreset] = useState<Preset>("7");
  const [from, setFrom] = useState<string>(isoDate(new Date()));
  const [to, setTo] = useState<string>(isoDate(new Date()));

  const [rows, setRows] = useState<SimulationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [today, setToday] = useState(0);
  const [month, setMonth] = useState(0);
  const [totalReativaveis, setTotalReativaveis] = useState(0);

  const [template, setTemplate] = useState<string>("");

  useEffect(() => {
    fetchReactivationTemplate().then(setTemplate);
  }, []);

  // Dashboard counters
  useEffect(() => {
    if (!user) return;
    (async () => {
      const startToday = startOf(new Date()).toISOString();
      const startMonth = new Date();
      startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);

      const base = () => {
        let q = (supabase.from("simulations") as any).select("id", { count: "exact", head: true });
        if (!isAdmin) q = q.eq("user_id", user.id);
        return q;
      };
      const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all([
        base().gte("sent_at", startToday),
        base().gte("sent_at", startMonth.toISOString()),
        base(),
      ]);
      setToday(c1 ?? 0);
      setMonth(c2 ?? 0);
      setTotalReativaveis(c3 ?? 0);
    })();
  }, [user, isAdmin, rows]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { from: f, to: t } = rangeFor(preset, from, to);
    let q = (supabase.from("simulations") as any)
      .select("*")
      .gte("sent_at", f.toISOString())
      .lte("sent_at", t.toISOString())
      .order("sent_at", { ascending: false })
      .limit(500);
    if (!isAdmin) q = q.eq("user_id", user.id);
    const { data, error } = await q;
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar", { description: error.message });
      return;
    }
    setRows((data as SimulationRecord[]) ?? []);
    setSelected({});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, from, to, user, isAdmin]);

  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);
  const selectedRows = useMemo(() => rows.filter((r) => selected[r.id]), [rows, selected]);

  const toggleAll = () => {
    if (allSelected) setSelected({});
    else setSelected(Object.fromEntries(rows.map((r) => [r.id, true])));
  };

  const enviarReativacao = async () => {
    if (selectedRows.length === 0) {
      toast.error("Selecione ao menos um cliente.");
      return;
    }
    if (selectedRows.length > 1) {
      toast.info(`Abrindo ${selectedRows.length} conversas no WhatsApp`, {
        description: "Permita pop-ups se necessário.",
      });
    }
    const tpl = template || (await fetchReactivationTemplate());
    const ids: string[] = [];
    for (const r of selectedRows) {
      const phone = onlyDigits(r.telefone);
      if (phone.length < 10) continue;
      const ddi = phone.length <= 11 ? `55${phone}` : phone;
      const msg = encodeURIComponent(
        renderReactivationMessage(tpl, {
          nome: r.cliente,
          valorLiberado: Number(r.valor_liberado),
        })
      );
      window.open(`https://wa.me/${ddi}?text=${msg}`, "_blank");
      ids.push(r.id);
      // small stagger
      await new Promise((res) => setTimeout(res, 250));
    }
    if (ids.length > 0) {
      await (supabase.from("simulations") as any)
        .update({ reactivated_at: new Date().toISOString() })
        .in("id", ids);
      toast.success(`${ids.length} reativação(ões) enviada(s)`);
      load();
    }
  };

  const exportarParaExtensao = async () => {
    if (selectedRows.length === 0) {
      toast.error("Selecione ao menos um cliente.");
      return;
    }
    const tpl = template || (await fetchReactivationTemplate());
    const payload = selectedRows
      .map((r) => {
        const phone = onlyDigits(r.telefone);
        if (phone.length < 10) return null;
        const ddi = phone.length <= 11 ? `55${phone}` : phone;
        return {
          nome: r.cliente,
          telefone: ddi,
          mensagem: renderReactivationMessage(tpl, {
            nome: r.cliente,
            valorLiberado: Number(r.valor_liberado),
          }),
        };
      })
      .filter(Boolean);
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      toast.success(`${payload.length} cliente(s) copiados`, {
        description: "Abra a extensão OCTA no WhatsApp Web e clique em 'Colar área de transferência'.",
      });
    } catch {
      // Fallback: download as file
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `octa-disparo-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("JSON baixado", { description: "Importe na extensão OCTA." });
    }
  };

  const baixarExtensao = () => {
    fetch("/octa-whatsapp-sender.zip")
      .then((res) => {
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "octa-whatsapp-sender.zip";
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success("Extensão baixada", {
          description: "Descompacte e instale em chrome://extensions (modo desenvolvedor).",
        });
      })
      .catch((err) => toast.error("Erro ao baixar", { description: err.message }));
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const presets: { v: Preset; label: string }[] = [
    { v: "hoje", label: "Hoje" },
    { v: "ontem", label: "Ontem" },
    { v: "7", label: "Últimos 7 dias" },
    { v: "15", label: "Últimos 15 dias" },
    { v: "30", label: "Últimos 30 dias" },
    { v: "custom", label: "Personalizado" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Reativação de Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow-up dos clientes que já receberam uma simulação.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Dashboard */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Enviadas hoje" value={today} />
        <Stat label="Enviadas no mês" value={month} />
        <Stat label="Clientes reativáveis" value={totalReativaveis} accent />
      </div>

      {/* Filtros */}
      <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
        <h2 className="font-display text-lg font-bold text-foreground">Filtros</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.v}
              onClick={() => setPreset(p.v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                preset === p.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1.5 h-11" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1.5 h-11" />
            </div>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-2xl bg-card p-5 shadow-soft md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-foreground">
            Clientes do período <span className="text-muted-foreground">({rows.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={rows.length === 0}>
              {allSelected ? "Desmarcar todos" : "Selecionar todos"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportarParaExtensao}
              disabled={selectedRows.length === 0}
              className="gap-2"
            >
              <Copy className="h-4 w-4" /> Exportar para Extensão ({selectedRows.length})
            </Button>
            <Button
              onClick={enviarReativacao}
              disabled={selectedRows.length === 0}
              className="gap-2 bg-gradient-brand text-brand-foreground shadow-brand hover:opacity-95"
            >
              <Send className="h-4 w-4" /> Enviar Reativação ({selectedRows.length})
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhuma simulação encontrada no período selecionado.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-2 py-2"></th>
                  <th className="px-2 py-2">Cliente</th>
                  <th className="px-2 py-2">Telefone</th>
                  <th className="px-2 py-2">Produto</th>
                  <th className="px-2 py-2 text-right">Valor liberado</th>
                  <th className="px-2 py-2">Enviado em</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={!!selected[r.id]}
                        onCheckedChange={(v) =>
                          setSelected((s) => ({ ...s, [r.id]: !!v }))
                        }
                      />
                    </td>
                    <td className="px-2 py-2 font-medium text-foreground">{r.cliente}</td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{r.telefone}</td>
                    <td className="px-2 py-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {MODALIDADE_LABEL[r.modalidade] ?? r.modalidade}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums text-foreground">
                      {brl(Number(r.valor_liberado))}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{fmtDate(r.sent_at)}</td>
                    <td className="px-2 py-2">
                      {r.reactivated_at ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <MessageCircle className="h-3 w-3" /> Reativado
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-soft ${
        accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
