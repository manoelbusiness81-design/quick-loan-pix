-- Add modalidade + carencia to commissions tables to support Novo LOAS and Novo Normal
ALTER TABLE public.commissions ALTER COLUMN taxa DROP NOT NULL;
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS modalidade text NOT NULL DEFAULT 'refinanciamento';
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS carencia integer;
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_modalidade_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_modalidade_check
  CHECK (modalidade IN ('refinanciamento','novo_emprestimo','novo_normal'));

ALTER TABLE public.seller_commissions ALTER COLUMN taxa DROP NOT NULL;
ALTER TABLE public.seller_commissions ADD COLUMN IF NOT EXISTS modalidade text NOT NULL DEFAULT 'refinanciamento';
ALTER TABLE public.seller_commissions ADD COLUMN IF NOT EXISTS carencia integer;
ALTER TABLE public.seller_commissions DROP CONSTRAINT IF EXISTS seller_commissions_modalidade_check;
ALTER TABLE public.seller_commissions ADD CONSTRAINT seller_commissions_modalidade_check
  CHECK (modalidade IN ('refinanciamento','novo_emprestimo','novo_normal'));
