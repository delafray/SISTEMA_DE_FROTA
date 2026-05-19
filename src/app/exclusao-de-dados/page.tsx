export const metadata = {
  title: 'Exclusão de Dados | Sistema Frota',
  description: 'Instruções para exclusão de dados pessoais - Sistema Frota',
};

export default function ExclusaoDeDados() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#e0e0e0', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 24, color: '#fff' }}>Exclusão de Dados Pessoais</h1>
      <p style={{ color: '#999', marginBottom: 32 }}>Última atualização: 19 de maio de 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>Como solicitar a exclusão dos seus dados</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Em conformidade com a Lei Geral de Proteção de Dados (LGPD), você tem o direito de solicitar 
          a exclusão de todos os seus dados pessoais armazenados em nosso sistema.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>Passo a passo</h2>
        <ol style={{ lineHeight: 2.2, color: '#bbb', paddingLeft: 24 }}>
          <li>Envie um e-mail para <a href="mailto:ronaldo@ronaldoborba.com.br" style={{ color: '#60a5fa' }}>ronaldo@ronaldoborba.com.br</a></li>
          <li>No assunto, escreva: <strong style={{ color: '#fff' }}>&quot;Solicitação de Exclusão de Dados&quot;</strong></li>
          <li>No corpo do e-mail, informe seu nome completo e número de telefone cadastrado</li>
          <li>Você receberá uma confirmação em até 48 horas</li>
          <li>A exclusão será concluída em até 15 dias úteis</li>
        </ol>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>Dados que serão excluídos</h2>
        <ul style={{ lineHeight: 2, color: '#bbb', paddingLeft: 24 }}>
          <li>Informações pessoais (nome, telefone, e-mail)</li>
          <li>Histórico de mensagens do WhatsApp</li>
          <li>Registros de viagens e operações vinculadas ao usuário</li>
          <li>Fotografias e documentos enviados</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>Dados retidos por obrigação legal</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Alguns dados poderão ser retidos por obrigação legal ou regulatória, como registros fiscais 
          e contábeis, pelo prazo determinado pela legislação aplicável.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>Contato</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          E-mail: <a href="mailto:ronaldo@ronaldoborba.com.br" style={{ color: '#60a5fa' }}>ronaldo@ronaldoborba.com.br</a><br />
          RBARROS Engenharia
        </p>
      </section>
    </main>
  );
}
