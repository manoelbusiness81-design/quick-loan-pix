
-- 1) Compartilhar coefficients e commissions (admin escreve, todos autenticados leem)
DROP POLICY IF EXISTS "coef select own" ON public.coefficients;
DROP POLICY IF EXISTS "coef insert own" ON public.coefficients;
DROP POLICY IF EXISTS "coef update own" ON public.coefficients;
DROP POLICY IF EXISTS "coef delete own" ON public.coefficients;

CREATE POLICY "coef select all auth" ON public.coefficients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "coef insert admin" ON public.coefficients
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "coef update admin" ON public.coefficients
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "coef delete admin" ON public.coefficients
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "comm select own" ON public.commissions;
DROP POLICY IF EXISTS "comm insert own" ON public.commissions;
DROP POLICY IF EXISTS "comm update own" ON public.commissions;
DROP POLICY IF EXISTS "comm delete own" ON public.commissions;

CREATE POLICY "comm select admin" ON public.commissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "comm insert admin" ON public.commissions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "comm update admin" ON public.commissions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "comm delete admin" ON public.commissions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2) Nova tabela: comissão individual por vendedor x taxa
CREATE TABLE public.seller_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  taxa NUMERIC NOT NULL,
  percentual NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, taxa)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_commissions TO authenticated;
GRANT ALL ON public.seller_commissions TO service_role;

ALTER TABLE public.seller_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sc select own or admin" ON public.seller_commissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sc insert admin" ON public.seller_commissions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sc update admin" ON public.seller_commissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sc delete admin" ON public.seller_commissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_seller_commissions_updated_at
  BEFORE UPDATE ON public.seller_commissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_seller_commissions_user ON public.seller_commissions(user_id);
