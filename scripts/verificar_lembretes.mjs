// Verificação direta da persistência de lembretes contra o Supabase real.
// Uso: node scripts/verificar_lembretes.mjs
// Lê credenciais de env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
import { createClient } from '@supabase/supabase-js';

const url = process.env.SB_URL;
const key = process.env.SB_KEY;
if (!url || !key) {
  console.error('Faltou SB_URL / SB_KEY no ambiente.');
  process.exit(1);
}
const sb = createClient(url, key);

async function main() {
  // 1. Estrutura: pega 1 linha pra ver as colunas reais.
  const { data: amostra, error: e1 } = await sb.from('lembretes').select('*').limit(1);
  if (e1) { console.error('ERRO select lembretes:', e1); process.exit(1); }
  console.log('--- COLUNAS da tabela lembretes ---');
  console.log(amostra && amostra[0] ? Object.keys(amostra[0]) : '(tabela vazia — vou inferir no insert)');

  // 2. Pega uma empresa_id válida (da própria tabela ou de empresas).
  let empresaId = amostra && amostra[0] ? amostra[0].empresa_id : null;
  if (!empresaId) {
    const { data: emp } = await sb.from('empresas').select('id').limit(1);
    empresaId = emp && emp[0] ? emp[0].id : null;
  }
  console.log('empresa_id usada no teste:', empresaId);
  if (!empresaId) { console.error('Sem empresa_id pra testar.'); process.exit(1); }

  // 3. INSERT de teste (igual ao que criarLembrete faz).
  const payload = {
    empresa_id: empresaId,
    usuario_id: null,
    texto: '[TESTE Claude] verificacao de persistencia ' + new Date().toISOString(),
    origem: 'whatsapp',
    criado_por_nome: 'Teste Claude',
    criado_por_telefone: '5531999999999',
  };
  const { data: ins, error: e2 } = await sb.from('lembretes').insert(payload).select();
  if (e2) {
    console.error('--- INSERT FALHOU ---');
    console.error('code:', e2.code, '| message:', e2.message, '| details:', e2.details, '| hint:', e2.hint);
    process.exit(1);
  }
  console.log('--- INSERT OK --- id:', ins[0].id);

  // 4. Confirma leitura de volta.
  const { data: lido } = await sb.from('lembretes').select('id, texto, empresa_id, criado_por_nome').eq('id', ins[0].id).single();
  console.log('--- LIDO DE VOLTA ---', lido);

  // 5. Limpa o teste.
  const { error: e3 } = await sb.from('lembretes').delete().eq('id', ins[0].id);
  console.log(e3 ? '--- DELETE falhou (deixei a linha) ---' : '--- DELETE OK (linha de teste removida) ---');

  console.log('\nRESULTADO: persistencia de lembrete FUNCIONA fim-a-fim no Supabase.');
}
main().catch((e) => { console.error('EXCEPTION:', e); process.exit(1); });
