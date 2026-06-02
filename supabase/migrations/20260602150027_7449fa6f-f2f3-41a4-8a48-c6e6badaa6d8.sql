ALTER TABLE public.coefficients DROP CONSTRAINT IF EXISTS coefficients_modalidade_check;
ALTER TABLE public.coefficients ADD CONSTRAINT coefficients_modalidade_check
  CHECK (modalidade IN ('refinanciamento','novo_emprestimo','novo_normal'));