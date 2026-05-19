import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

// Carregar variáveis de ambiente manualmente para o teste
const envPath = path.resolve('.env.local');
const envFile = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
  if (line && !line.startsWith('#') && line.includes('=')) {
    const [key, ...valueParts] = line.split('=');
    env[key.trim()] = valueParts.join('=').trim();
  }
});

async function testR2() {
  console.log('🔄 Iniciando teste de conexão com o Cloudflare R2...');

  const accountId = env['R2_ACCOUNT_ID'];
  const accessKeyId = env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = env['R2_SECRET_ACCESS_KEY'];
  const bucketName = env['R2_BUCKET_NAME'];

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error('❌ Faltam credenciais no .env.local');
    return;
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  try {
    console.log('📦 Fazendo upload de um arquivo de teste...');
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: 'teste-conexao.txt',
      Body: 'Se você está lendo isso, o sistema está conseguindo salvar arquivos no R2 com sucesso!',
      ContentType: 'text/plain',
    });

    await s3.send(command);
    console.log(`✅ Upload realizado com sucesso no bucket: ${bucketName}!`);
    console.log(`🌍 Tente acessar o arquivo: ${env['R2_PUBLIC_URL']}/teste-conexao.txt`);
  } catch (error) {
    console.error('❌ Erro ao conectar ou fazer upload no R2:');
    console.error(error);
  }
}

testR2();
