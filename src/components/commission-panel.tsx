import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { brl, pct } from "@/lib/format";

interface Comm { id: string; percentual: number; modalidade: string; carencia: number | null; taxa: number | null; }
interface SellerComm { id: string; user_id: string; percentual: number; modalidade: string; carencia: number | null; taxa: number | null; }

interface Props {
  modalidade: "novo_emprestimo" | "novo_normal";
  carencia?: number | null;
  valorBruto: number;
}

/** Card "MINHA COMISSÃO" — mesmo padrão visual do Refinanciamento. */
export function CommissionPanel({ modalidade, carencia = null, valorBruto }: Props) {
  const { user, isAdmin } = useAuth();
  const [comms, setComms] = useState<Comm[]>([]);
  const [sellerComms, setSellerComms] = useState<SellerComm[]>([]);

  useEffect(() => {
    if (!user) return;
    if (isAdmin) {
      (supabase.from("commissions") as any)
        .select("*")
        .eq("modalidade", modalidade)
        .then(({ data }: any) => setComms((data as Comm[]) ?? []));
    }
    (supabase.from as any)("seller_commissions")
      .select("*")
      .eq("user_id", user.id)
      .eq("modalidade", modalidade)
      .then(({ data }: any) => setSellerComms((data as SellerComm[]) ?? []));
  }, [user, isAdmin, modalidade]);

  const matchCarencia = (c: Comm | SellerComm) =>
    modalidade === "novo_normal" ? Number(c.carencia ?? -1) === Number(carencia ?? -1) : true;

  const commCfg = useMemo(() => comms.find(matchCarencia), [comms, carencia, modalidade]);
  const sellerCfg = useMemo(() => sellerComms.find(matchCarencia), [sellerComms, carencia, modalidade]);

  const comissaoPct = commCfg ? Number(commCfg.percentual) : 0;
  const comissaoValor = (valorBruto * comissaoPct) / 100;
  const sellerPct = sellerCfg ? Number(sellerCfg.percentual) : 0;
  const sellerValor = (valorBruto * sellerPct) / 100;
  const lucroEmpresa = comissaoValor - sellerValor;

  if (valorBruto <= 0) return null;

  return (
    <>
      {isAdmin && (
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
    </>
  );
}
