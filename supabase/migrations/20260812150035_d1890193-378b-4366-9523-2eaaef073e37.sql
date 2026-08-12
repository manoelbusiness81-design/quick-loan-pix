DELETE FROM public.commissions WHERE modalidade = 'novo_emprestimo';
DELETE FROM public.seller_commissions WHERE modalidade = 'novo_emprestimo';

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_modalidade_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_modalidade_check
  CHECK (modalidade = ANY (ARRAY['refinanciamento','novo_normal','portabilidade','gov_sp','gov_ma']));

ALTER TABLE public.seller_commissions DROP CONSTRAINT IF EXISTS seller_commissions_modalidade_check;
ALTER TABLE public.seller_commissions ADD CONSTRAINT seller_commissions_modalidade_check
  CHECK (modalidade = ANY (ARRAY['refinanciamento','novo_normal','portabilidade','gov_sp','gov_ma']));