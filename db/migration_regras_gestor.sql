-- ════════════════════════════════════════════════════════════════════════
-- Regras essenciais de GESTOR + contexto da IA (decisão do dono, 05/06/2026).
-- Inclui a coluna `acoes` (caso ainda não exista). Idempotente.
-- Cole TUDO no SQL Editor do Supabase.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE regras ADD COLUMN IF NOT EXISTS acoes TEXT[] NOT NULL DEFAULT '{}';
UPDATE regras SET acoes = ARRAY['consultar','alterar'] WHERE nome IN ('KM Motorista','KM Gestor') AND acoes = '{}';

-- ─── Regras de gestor (idempotentes por nome) ───────────────────────────
INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Consultar Veículos','consultar',ARRAY['consultar'],
  ARRAY['quantos caminhões','quais veículos','minha frota','lista de caminhões','qual a placa do'],
  ARRAY['quantos caminhões eu tenho','quais são meus veículos','qual a placa do leão'],
  '{"escopo":"todos","tabela":"veiculos","acoes":["consultar"]}'::jsonb,false,40,ARRAY['qualquer'],
  'Lista a frota: placa, apelido, marca, modelo. Só leitura.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Consultar Veículos');

INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Consultar Motoristas','consultar',ARRAY['consultar'],
  ARRAY['quantos motoristas','quais motoristas','quem são os motoristas','lista de motoristas'],
  ARRAY['quantos motoristas eu tenho','quem são meus motoristas'],
  '{"escopo":"todos","tabela":"motoristas","acoes":["consultar"]}'::jsonb,false,40,ARRAY['qualquer'],
  'Lista os motoristas ativos da frota. Só leitura.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Consultar Motoristas');

INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Status da Frota','consultar',ARRAY['consultar'],
  ARRAY['caminhão parado','em manutenção','status da frota','quais caminhões parados','quem está com'],
  ARRAY['quais caminhões estão parados','tem caminhão em manutenção','quem está com o leão'],
  '{"escopo":"todos","tabela":"alocacoes","acoes":["consultar"]}'::jsonb,false,45,ARRAY['qualquer'],
  'Quem é o responsável de cada caminhão e quais estão parados/manutenção/operacional.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Status da Frota');

INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Consultar Abastecimentos','consultar',ARRAY['consultar'],
  ARRAY['abastecimento','combustível','gasto com diesel','quanto abasteci'],
  ARRAY['quanto gastei de combustível esse mês','últimos abastecimentos do leão'],
  '{"escopo":"todos","tabela":"abastecimentos","acoes":["consultar"]}'::jsonb,false,30,ARRAY['qualquer'],
  'Consulta abastecimentos: litros, valor, posto, por veículo/período. Só leitura.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Consultar Abastecimentos');

INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Consultar Manutenções','consultar',ARRAY['consultar'],
  ARRAY['manutenção','próxima revisão','manutenção pendente','revisão do'],
  ARRAY['qual a próxima manutenção do leão','quais manutenções pendentes'],
  '{"escopo":"todos","tabela":"manutencoes","acoes":["consultar"]}'::jsonb,false,30,ARRAY['qualquer'],
  'Manutenções pendentes/agendadas e próxima revisão por veículo. Só leitura.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Consultar Manutenções');

INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Consultar Avarias','consultar',ARRAY['consultar'],
  ARRAY['avaria','defeito','problema no caminhão','quebrou'],
  ARRAY['tem avaria aberta','algum caminhão com defeito'],
  '{"escopo":"todos","tabela":"avarias","acoes":["consultar"]}'::jsonb,false,30,ARRAY['qualquer'],
  'Avarias abertas/registradas por veículo. Só leitura.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Consultar Avarias');

INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Consultar Financeiro','consultar',ARRAY['consultar'],
  ARRAY['saldo','caixa','contas a pagar','financeiro','quanto a receber'],
  ARRAY['qual o saldo do caixa','quanto eu tenho a pagar'],
  '{"escopo":"todos","tabela":"financeiro","acoes":["consultar"],"sensivel":true}'::jsonb,false,35,ARRAY['qualquer'],
  'Saldo, contas a pagar/receber. Dado SENSÍVEL — libere só pra quem deve ver (na matriz).'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Consultar Financeiro');

INSERT INTO regras (nome,tipo,acoes,gatilhos,frases_exemplo,escopo_dados,exige_confirmacao,prioridade,quem_pode_disparar,observacao)
SELECT 'Mudar Status do Veículo','registrar',ARRAY['alterar'],
  ARRAY['põe em manutenção','deixa parado','coloca o','manda pra oficina','tira de circulação'],
  ARRAY['coloca o leão em manutenção','deixa o touro parado'],
  '{"escopo":"todos","tabela":"alocacoes","acoes":["alterar"],"validacao":{"confirmar":true}}'::jsonb,true,40,ARRAY['qualquer'],
  'Muda o status do veículo (manutenção/parado/operacional). GRAVA — exige confirmação.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE nome='Mudar Status do Veículo');

-- ─── Contexto global da IA (config dentro do sistema) ───────────────────
CREATE TABLE IF NOT EXISTS contexto_ia (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo     TEXT NOT NULL,
  conteudo   TEXT NOT NULL,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  ordem      INTEGER NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE contexto_ia DISABLE ROW LEVEL SECURITY;
GRANT ALL ON contexto_ia TO anon, authenticated, service_role;

INSERT INTO contexto_ia (titulo, conteudo, ordem)
SELECT 'Identidade', 'Você é o assistente da frota DELAFRAY TRANSPORTES. Responda em português, direto e curto.', 1
WHERE NOT EXISTS (SELECT 1 FROM contexto_ia WHERE titulo='Identidade');
INSERT INTO contexto_ia (titulo, conteudo, ordem)
SELECT 'Apelidos dos caminhões', 'Os caminhões têm apelido (ex: leão, touro) E placa. O usuário pode citar qualquer um — use o apelido ou a placa pra identificar o veículo.', 2
WHERE NOT EXISTS (SELECT 1 FROM contexto_ia WHERE titulo='Apelidos dos caminhões');
