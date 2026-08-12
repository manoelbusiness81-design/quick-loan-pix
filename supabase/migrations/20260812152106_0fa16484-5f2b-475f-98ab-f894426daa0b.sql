ALTER TABLE public.coefficients ALTER COLUMN coeficiente TYPE numeric(20,16);

UPDATE public.coefficients SET coeficiente = v.c
FROM (VALUES
  ('Cartão Crédito',117,2.90,0.0404869475841648),
  ('Cartão Crédito',117,3.25,0.0449172110089976),
  ('Cartão Crédito',117,3.30,0.0521910879344688),
  ('Cartão Crédito (demais prazos)',117,2.90,0.0404869475841648),
  ('Cartão Crédito (demais prazos)',117,3.25,0.0455107986784606),
  ('Cartão Crédito (demais prazos)',117,3.30,0.0521910879344688),
  ('Cartão Benefício',117,2.90,0.0404869475841648),
  ('Cartão Benefício',117,3.25,0.0455107986784606),
  ('Cartão Benefício',117,3.30,0.0521910879344688),
  ('Cartão Crédito',96,2.90,0.0411738143404302),
  ('Cartão Crédito',96,3.15,0.0442559498674855),
  ('Cartão Crédito',96,3.25,0.0455107986784606),
  ('Cartão Crédito',96,3.30,0.0521910879344688),
  ('Cartão Crédito',96,3.40,0.0474153553203375),
  ('Cartão Crédito (demais prazos)',96,2.90,0.0411738143404302),
  ('Cartão Crédito (demais prazos)',96,3.15,0.0411738143404302),
  ('Cartão Crédito (demais prazos)',96,3.25,0.0455107986784606),
  ('Cartão Crédito (demais prazos)',96,3.30,0.0521910879344688),
  ('Cartão Crédito (demais prazos)',96,3.40,0.0474153553203375),
  ('Cartão Benefício',96,2.90,0.0411738143404302),
  ('Cartão Benefício',96,3.15,0.0411738143404302),
  ('Cartão Benefício',96,3.25,0.0455107986784606),
  ('Cartão Benefício',96,3.30,0.0521910879344688),
  ('Cartão Benefício',96,3.40,0.0474153553203375)
) AS v(bank,prazo,taxa,c)
WHERE public.coefficients.modalidade = 'gov_ma'
  AND public.coefficients.bank = v.bank
  AND public.coefficients.prazo = v.prazo
  AND public.coefficients.taxa = v.taxa;