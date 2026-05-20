-- =============================================================================
-- SEED: tipos_manutencao (catálogo padrão para caminhão diesel)
-- =============================================================================
-- Tipos globais (empresa_id = NULL) → todas as empresas enxergam.
-- Cada empresa pode criar tipos próprios depois (empresa_id preenchido).
--
-- Categorias usadas: motor, filtros, freios, suspensao, transmissao,
--                    arrefecimento, eletrica, pneus, documentacao, geral
-- Criticidade:       alta | media | baixa
--
-- Intervalos baseados em prática de mercado para caminhões pesados (Diesel).
-- O usuário pode sobrescrever o intervalo por veículo em plano_manutencao_veiculo.
-- =============================================================================

INSERT INTO tipos_manutencao
  (codigo, nome, descricao, categoria, criticidade, intervalo_km, intervalo_meses, custo_estimado_min, custo_estimado_max, empresa_id, ativo)
VALUES
  -- ─── MOTOR ────────────────────────────────────────────────────────────────
  ('OLEO_MOTOR',        'Troca de óleo do motor',         'Óleo sintético/semi 15W40 ou conforme manual',                 'motor',         'alta',  20000,  6,    400,  1200, NULL, true),
  ('FILTRO_OLEO',       'Troca do filtro de óleo',        'Substituir junto com o óleo do motor',                          'filtros',       'alta',  20000,  6,    50,   200,  NULL, true),
  ('FILTRO_COMBUSTIVEL','Troca do filtro de combustível', 'Filtro separador de água/diesel',                               'filtros',       'alta',  20000,  6,    80,   300,  NULL, true),
  ('FILTRO_AR',         'Troca do filtro de ar',          'Verificar antes em uso severo (estrada de terra)',              'filtros',       'media', 30000,  12,   60,   250,  NULL, true),
  ('FILTRO_CABINE',     'Troca do filtro de ar da cabine','Filtro de pólen / ar condicionado',                             'filtros',       'baixa', 20000,  12,   40,   150,  NULL, true),

  -- ─── ARREFECIMENTO ────────────────────────────────────────────────────────
  ('LIQUIDO_ARREF',     'Troca do líquido de arrefecimento','Aditivo + água destilada conforme manual',                   'arrefecimento', 'media', 60000,  24,   80,   300,  NULL, true),
  ('CORREIA_DENT',      'Troca da correia dentada',       'Substituição preventiva (depende do motor)',                    'motor',         'alta',  80000,  60,   600,  2500, NULL, true),
  ('CORREIA_ACES',      'Troca da correia de acessórios', 'Alternador / bomba dágua / direção',                            'motor',         'media', 60000,  36,   150,  500,  NULL, true),

  -- ─── FREIOS ───────────────────────────────────────────────────────────────
  ('PASTILHA_FREIO',    'Troca das pastilhas de freio',   'Verificar a cada 10.000 km — trocar quando desgastadas',        'freios',        'alta',  40000,  12,   300,  1500, NULL, true),
  ('LONA_FREIO',        'Troca das lonas de freio',       'Sistema a tambor — verificar conforme uso',                     'freios',        'alta',  60000,  18,   400,  1800, NULL, true),
  ('FLUIDO_FREIO',      'Troca do fluido de freio',       'Higroscópico — perde performance com umidade',                  'freios',        'alta',  NULL,   24,   80,   250,  NULL, true),
  ('DISCO_FREIO',       'Troca de disco de freio',        'Substituição quando atingir limite mínimo',                     'freios',        'media', 120000, 60,   800,  3500, NULL, true),

  -- ─── SUSPENSÃO / DIREÇÃO ──────────────────────────────────────────────────
  ('ALINHAMENTO',       'Alinhamento e balanceamento',    'Após qualquer impacto ou troca de pneu',                        'suspensao',     'media', 20000,  6,    80,   300,  NULL, true),
  ('AMORTECEDOR',       'Troca de amortecedores',         'Verificar vazamento / eficiência',                              'suspensao',     'media', 80000,  36,   600,  2500, NULL, true),
  ('FEIXE_MOLAS',       'Inspeção do feixe de molas',     'Conferir trincas / parafusos',                                  'suspensao',     'media', 40000,  12,   200,  1500, NULL, true),
  ('TERMINAL_DIRECAO',  'Troca dos terminais de direção', 'Verificar folga',                                               'suspensao',     'media', 60000,  24,   200,  800,  NULL, true),

  -- ─── PNEUS ────────────────────────────────────────────────────────────────
  ('RODIZIO_PNEUS',     'Rodízio de pneus',               'Equaliza desgaste',                                             'pneus',         'baixa', 20000,  6,    50,   200,  NULL, true),
  ('TROCA_PNEUS',       'Troca de pneus',                 'Quando atingir TWI (1,6 mm) ou idade',                          'pneus',         'alta',  80000,  36,   1500, 8000, NULL, true),

  -- ─── TRANSMISSÃO ──────────────────────────────────────────────────────────
  ('OLEO_CAMBIO',       'Troca do óleo da caixa de câmbio','Câmbio manual ou automático conforme manual',                  'transmissao',   'media', 80000,  24,   400,  1500, NULL, true),
  ('OLEO_DIFERENCIAL',  'Troca do óleo do diferencial',   'Verificar nível a cada revisão',                                'transmissao',   'media', 80000,  24,   300,  1200, NULL, true),
  ('EMBREAGEM',         'Troca do kit de embreagem',      'Disco + platô + rolamento',                                     'transmissao',   'alta',  150000, NULL, 1500, 6000, NULL, true),

  -- ─── ELÉTRICA ─────────────────────────────────────────────────────────────
  ('BATERIA',           'Troca da bateria',               'Vida útil média 2-3 anos',                                      'eletrica',      'media', NULL,   30,   400,  1500, NULL, true),
  ('LAMPADAS',          'Inspeção / troca de lâmpadas',   'Faróis, lanternas, setas',                                      'eletrica',      'baixa', NULL,   6,    20,   200,  NULL, true),

  -- ─── DOCUMENTAÇÃO / OBRIGATÓRIOS ──────────────────────────────────────────
  ('TACOGRAFO',         'Aferição do tacógrafo',          'Obrigatório a cada 2 anos (INMETRO)',                           'documentacao',  'alta',  NULL,   24,   200,  600,  NULL, true),
  ('EXTINTOR',          'Recarga / troca do extintor',    'Verificar validade',                                            'documentacao',  'media', NULL,   12,   50,   200,  NULL, true),
  ('CRONOTACOGRAFO',    'Lacre cronotacógrafo',           'Conforme legislação',                                           'documentacao',  'alta',  NULL,   24,   150,  400,  NULL, true),

  -- ─── REVISÃO GERAL ────────────────────────────────────────────────────────
  ('REVISAO_GERAL',     'Revisão geral preventiva',       'Check-list completo do veículo',                                'geral',         'media', 40000,  12,   500,  2500, NULL, true)
ON CONFLICT (codigo) DO NOTHING;

-- Confirmação
SELECT COUNT(*) AS total_tipos_inseridos FROM tipos_manutencao WHERE empresa_id IS NULL;
