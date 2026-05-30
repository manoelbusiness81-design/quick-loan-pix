-- Add modalidade column to coefficients to support both Refinanciamento and Novo Empréstimo
ALTER TABLE public.coefficients
  ADD COLUMN IF NOT EXISTS modalidade TEXT NOT NULL DEFAULT 'refinanciamento';

-- Ensure existing rows are explicitly tagged as refinanciamento
UPDATE public.coefficients SET modalidade = 'refinanciamento' WHERE modalidade IS NULL OR modalidade = '';

-- Allow only the two known values
ALTER TABLE public.coefficients DROP CONSTRAINT IF EXISTS coefficients_modalidade_check;
ALTER TABLE public.coefficients
  ADD CONSTRAINT coefficients_modalidade_check
  CHECK (modalidade IN ('refinanciamento','novo_emprestimo'));

CREATE INDEX IF NOT EXISTS coefficients_modalidade_idx ON public.coefficients (modalidade);