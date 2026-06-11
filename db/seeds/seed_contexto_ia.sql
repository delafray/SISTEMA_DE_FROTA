-- SEED: contexto_ia — contexto global injetado no classificador
-- Gerado da produção em 2026-06-11 (2 linhas).
-- Idempotente: ON CONFLICT (id) DO NOTHING — rode quantas vezes quiser.

INSERT INTO public.contexto_ia
SELECT * FROM json_populate_recordset(null::public.contexto_ia, $json$
[
 {
  "id": "235d28a8-e750-4cad-b83f-d85d565049f6",
  "titulo": "Identidade",
  "conteudo": "Você é o assistente da frota DELAFRAY TRANSPORTES. Responda em português, direto e curto.",
  "ativo": true,
  "ordem": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00"
 },
 {
  "id": "85e7834a-a9f3-4c66-978b-a570c7964385",
  "titulo": "Apelidos dos caminhões",
  "conteudo": "Os caminhões têm apelido (ex: leão, touro) E placa. O usuário pode citar qualquer um — use o apelido ou a placa pra identificar o veículo.",
  "ativo": true,
  "ordem": 2,
  "criado_em": "2026-06-05T19:49:56.939646+00:00"
 }
]
$json$::json)
ON CONFLICT (id) DO NOTHING;
