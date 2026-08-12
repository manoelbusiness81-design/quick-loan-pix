ALTER TABLE public.coefficients DROP CONSTRAINT IF EXISTS coefficients_modalidade_check;
ALTER TABLE public.coefficients ADD CONSTRAINT coefficients_modalidade_check CHECK (modalidade = ANY (ARRAY['refinanciamento','novo_emprestimo','novo_normal','portabilidade','gov_sp','gov_ma']));

ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS prazo integer;
ALTER TABLE public.seller_commissions ADD COLUMN IF NOT EXISTS prazo integer;

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_owner_id_taxa_key;
ALTER TABLE public.seller_commissions DROP CONSTRAINT IF EXISTS seller_commissions_user_id_taxa_key;

INSERT INTO public.coefficients (owner_id, team_id, modalidade, bank, prazo, taxa, coeficiente) VALUES
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 117, 2.9,  0.0404869475841648),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 117, 3.25, 0.0449172110089976),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 117, 3.3,  0.0521910879344688),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 117, 2.9,  0.0404869475841648),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 117, 3.25, 0.0455107986784606),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 117, 3.3,  0.0521910879344688),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 117, 2.9,  0.0404869475841648),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 117, 3.25, 0.0455107986784606),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 117, 3.3,  0.0521910879344688),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 96, 2.9,  0.0411738143404302),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 96, 3.15, 0.0442559498674855),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 96, 3.25, 0.0455107986784606),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 96, 3.3,  0.0521910879344688),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito', 96, 3.4,  0.0474153553203375),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 96, 2.9,  0.0411738143404302),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 96, 3.15, 0.0411738143404302),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 96, 3.25, 0.0455107986784606),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 96, 3.3,  0.0521910879344688),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Crédito (demais prazos)', 96, 3.4,  0.0474153553203375),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 96, 2.9,  0.0411738143404302),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 96, 3.15, 0.0411738143404302),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 96, 3.25, 0.0455107986784606),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 96, 3.3,  0.0521910879344688),
('765b1083-192a-4250-b6ef-6e07cbfba2fd', NULL, 'gov_ma', 'Cartão Benefício', 96, 3.4,  0.0474153553203375);