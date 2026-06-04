/**
 * Catálogo dos serviços externos (APIs pagas em cota grátis + infra).
 *
 * Dado estático pra página /uso-apis do gestor. Os limites/links foram
 * levantados em jun/2026 — edite aqui se mudar. As 3 APIs com `medicao` puxam
 * o número de uso ao vivo do banco (ver usoApis.ts); as demais só linkam pro
 * console do provedor (onde o uso real aparece).
 */

export type MedicaoApi = 'google_geocoding' | 'gemini' | 'deepgram';

export interface ApiCatalogo {
  id: string;
  nomeOficial: string;
  apelido: string;
  descricao: string;
  /** Como funciona o nível grátis (texto curto pro gestor). */
  cota: string;
  /** Quando zera (se aplicável). */
  reset?: string;
  /** Link pra página de cobrança/billing do provedor. */
  urlCobranca?: string;
  /** Link pro painel onde se vê o uso/métricas. */
  urlUso?: string;
  /** Se medimos o uso internamente, qual métrica. */
  medicao?: MedicaoApi;
  /** Serviço público acessado direto (sem conta/email). Quando true, a UI mostra
   *  "não precisou de cadastro" em vez do campo de email/cartão. */
  semCadastro?: boolean;
}

export const CATALOGO_APIS: ApiCatalogo[] = [
  {
    id: 'google_geocoding',
    nomeOficial: 'Google Maps Platform — Geocoding API',
    apelido: 'Endereços / CEP / pino',
    descricao: 'Converte endereço em coordenada (e acha o CEP) na captura de NFs.',
    cota: '10.000 req/mês grátis · depois US$ 5 por mil',
    reset: 'Reseta dia 1º',
    urlCobranca: 'https://console.cloud.google.com/billing',
    urlUso: 'https://console.cloud.google.com/google/maps-apis/metrics',
    medicao: 'google_geocoding',
  },
  {
    id: 'gemini',
    nomeOficial: 'Google Gemini API',
    apelido: 'Cérebro do bot WhatsApp',
    descricao: 'IA que entende e responde as mensagens do motorista no WhatsApp.',
    cota: 'Grátis por DIA (~250 req/dia no Flash)',
    reset: 'Reseta diariamente',
    urlCobranca: 'https://aistudio.google.com/api-keys',
    urlUso: 'https://aistudio.google.com/rate-limit',
    medicao: 'gemini',
  },
  {
    id: 'deepgram',
    nomeOficial: 'Deepgram (nova-3)',
    apelido: 'Transcrição de áudio',
    descricao: 'Transforma o áudio de voz do motorista em texto pro bot entender.',
    cota: 'US$ 200 de crédito único (≈694h de áudio)',
    urlCobranca: 'https://console.deepgram.com/',
    urlUso: 'https://console.deepgram.com/',
    medicao: 'deepgram',
  },
  {
    id: 'openai',
    nomeOficial: 'OpenAI API',
    apelido: 'IA auxiliar',
    descricao: 'Modelos GPT usados em apoio (parser/serviço de IA).',
    cota: 'Sem free tier p/ novos — depósito ≥ US$ 5',
    urlCobranca: 'https://platform.openai.com/settings/organization/billing',
    urlUso: 'https://platform.openai.com/usage',
  },
  {
    id: 'supabase',
    nomeOficial: 'Supabase',
    apelido: 'Banco de dados + login',
    descricao: 'Postgres, autenticação e storage — o coração de dados do sistema.',
    cota: 'Always free (500 MB, 50k usuários) · pausa após 7d inativo',
    urlCobranca: 'https://supabase.com/dashboard',
    urlUso: 'https://supabase.com/dashboard',
  },
  {
    id: 'railway',
    nomeOficial: 'Railway',
    apelido: 'Hospeda o WhatsApp (Evolution)',
    descricao: 'Roda o container da Evolution API (gateway do WhatsApp).',
    cota: '~US$ 5/mês (plano Hobby)',
    urlCobranca: 'https://railway.com/account/billing',
    urlUso: 'https://railway.com/dashboard',
  },
  {
    id: 'oracle',
    nomeOficial: 'Oracle Cloud Infrastructure',
    apelido: 'Servidor das rotas',
    descricao: 'VM grátis que roda OSRM, VROOM e Overpass (cálculo de rota).',
    cota: 'Always free vitalício (4 ARM + 24 GB)',
    urlCobranca: 'https://cloud.oracle.com/invoices-and-orders/invoices',
    urlUso: 'https://cloud.oracle.com/usage-reports',
  },
  {
    id: 'vercel',
    nomeOficial: 'Vercel',
    apelido: 'Hospeda o site',
    descricao: 'Onde o app web roda (deploy do Next.js).',
    cota: 'Hobby grátis (uso não-comercial pelos termos)',
    urlCobranca: 'https://vercel.com/dashboard',
    urlUso: 'https://vercel.com/dashboard',
  },
  {
    id: 'cloudflare_r2',
    nomeOficial: 'Cloudflare R2',
    apelido: 'Arquivos / fotos',
    descricao: 'Armazena arquivos (storage S3-compatível, sem custo de saída).',
    cota: '10 GB grátis/mês',
    urlCobranca: 'https://dash.cloudflare.com/',
    urlUso: 'https://dash.cloudflare.com/',
  },
  {
    id: 'nominatim',
    nomeOficial: 'Nominatim (OpenStreetMap)',
    apelido: 'Geocoding grátis (OSM)',
    descricao: 'Geocoding público de fallback quando o Google está fora/sem cota.',
    cota: 'Público grátis · máx. 1 req/s',
    urlUso: 'https://operations.osmfoundation.org/policies/nominatim/',
    semCadastro: true,
  },
  {
    id: 'viacep',
    nomeOficial: 'ViaCEP',
    apelido: 'Consulta de CEP',
    descricao: 'Busca logradouro/bairro/cidade a partir do CEP brasileiro.',
    cota: 'Público grátis (sem SLA)',
    urlUso: 'https://viacep.com.br/',
    semCadastro: true,
  },
];
