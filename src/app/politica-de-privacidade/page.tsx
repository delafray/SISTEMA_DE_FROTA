export const metadata = {
  title: 'Política de Privacidade | Sistema Frota',
  description: 'Política de privacidade do Sistema Frota - RBARROS Engenharia',
};

export default function PoliticaDePrivacidade() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#e0e0e0', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 24, color: '#fff' }}>Política de Privacidade</h1>
      <p style={{ color: '#999', marginBottom: 32 }}>Última atualização: 19 de maio de 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>1. Introdução</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          A RBARROS Engenharia (&quot;nós&quot;, &quot;nosso&quot;) opera o Sistema Frota, uma plataforma de gestão de frotas de veículos. 
          Esta política descreve como coletamos, usamos e protegemos as informações pessoais dos nossos usuários.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>2. Dados Coletados</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>Coletamos os seguintes tipos de dados:</p>
        <ul style={{ lineHeight: 2, color: '#bbb', paddingLeft: 24 }}>
          <li>Nome completo e informações de contato (telefone, e-mail)</li>
          <li>Dados de identificação profissional (CNH, matrícula)</li>
          <li>Dados de localização e quilometragem de veículos</li>
          <li>Registros de abastecimento, viagens e manutenção</li>
          <li>Mensagens trocadas via WhatsApp para fins operacionais</li>
          <li>Fotografias de veículos e comprovantes</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>3. Uso dos Dados</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>Os dados coletados são utilizados exclusivamente para:</p>
        <ul style={{ lineHeight: 2, color: '#bbb', paddingLeft: 24 }}>
          <li>Gestão operacional da frota de veículos</li>
          <li>Comunicação com motoristas via WhatsApp</li>
          <li>Geração de relatórios operacionais</li>
          <li>Controle de custos e manutenção preventiva</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>4. Compartilhamento de Dados</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Não vendemos, alugamos ou compartilhamos dados pessoais com terceiros, exceto quando necessário para 
          o funcionamento do sistema (provedores de infraestrutura como Supabase e Vercel) ou quando exigido por lei.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>5. Segurança</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Implementamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia em 
          trânsito (HTTPS/TLS), controle de acesso baseado em papéis (RLS) e armazenamento seguro em servidores certificados.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>6. Seus Direitos</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Conforme a Lei Geral de Proteção de Dados (LGPD), você tem direito a acessar, corrigir, excluir ou 
          portar seus dados pessoais. Para exercer esses direitos, entre em contato conosco pelo e-mail abaixo.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>7. Contato</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Para questões sobre privacidade, entre em contato:<br />
          E-mail: <a href="mailto:ronaldo@ronaldoborba.com.br" style={{ color: '#60a5fa' }}>ronaldo@ronaldoborba.com.br</a><br />
          RBARROS Engenharia
        </p>
      </section>
    </main>
  );
}
