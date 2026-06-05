
CREATE TABLE public.simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente TEXT NOT NULL,
  telefone TEXT NOT NULL,
  modalidade TEXT NOT NULL,
  valor_liberado NUMERIC(14,2) NOT NULL DEFAULT 0,
  parcela NUMERIC(14,2),
  prazo INTEGER,
  carencia INTEGER,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX simulations_user_sent_at_idx ON public.simulations(user_id, sent_at DESC);
CREATE INDEX simulations_sent_at_idx ON public.simulations(sent_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulations TO authenticated;
GRANT ALL ON public.simulations TO service_role;

ALTER TABLE public.simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own simulations or admin all"
  ON public.simulations FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users insert own simulations"
  ON public.simulations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own simulations"
  ON public.simulations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users delete own simulations"
  ON public.simulations FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value)
VALUES (
  'reactivation_message',
  'Olá {NOME}, tudo bem?

Vi que você recebeu uma simulação conosco recentemente no valor aproximado de R$ {VALOR_LIBERADO}.

Gostaria de saber se ainda tem interesse em dar continuidade.'
)
ON CONFLICT (key) DO NOTHING;
