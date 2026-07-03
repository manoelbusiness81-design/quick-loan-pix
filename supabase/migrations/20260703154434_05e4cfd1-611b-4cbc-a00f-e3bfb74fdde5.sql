
ALTER TABLE public.coefficients DROP CONSTRAINT IF EXISTS coefficients_modalidade_check;
ALTER TABLE public.coefficients ADD CONSTRAINT coefficients_modalidade_check
  CHECK (modalidade = ANY (ARRAY['refinanciamento'::text, 'novo_emprestimo'::text, 'novo_normal'::text, 'portabilidade'::text]));

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_modalidade_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_modalidade_check
  CHECK (modalidade = ANY (ARRAY['refinanciamento'::text, 'novo_emprestimo'::text, 'novo_normal'::text, 'portabilidade'::text]));

ALTER TABLE public.seller_commissions DROP CONSTRAINT IF EXISTS seller_commissions_modalidade_check;
ALTER TABLE public.seller_commissions ADD CONSTRAINT seller_commissions_modalidade_check
  CHECK (modalidade = ANY (ARRAY['refinanciamento'::text, 'novo_emprestimo'::text, 'novo_normal'::text, 'portabilidade'::text]));
