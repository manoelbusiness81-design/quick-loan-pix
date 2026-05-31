import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import logoDrs from "@/assets/logo-drs.jpg";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.navigate({ to: "/" });
    });
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error("Credenciais inválidas", { description: error.message });
      return;
    }
    toast.success("Bem-vindo!");
    router.navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-gradient-navy">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-white p-2 shadow-elevated">
              <img src={logoDrs} alt="DRS Consultoria" className="h-full w-full object-contain" />
            </div>
            <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight text-white">OCTA</h1>
            <p className="mt-1 text-sm text-white/60">Plataforma de Crédito e Gestão Comercial - DRS Consultoria</p>
          </div>

          <div className="rounded-2xl bg-card p-7 shadow-elevated">
            <h2 className="font-display text-xl font-bold text-foreground">Entrar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use suas credenciais para acessar</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" placeholder="voce@empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" placeholder="••••••••" />
              </div>
              <Button type="submit" disabled={loading} className="h-12 w-full bg-gradient-octa text-base font-semibold text-octa-foreground shadow-octa hover:opacity-95">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              Acesso restrito. Apenas o administrador pode criar novos usuários.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
