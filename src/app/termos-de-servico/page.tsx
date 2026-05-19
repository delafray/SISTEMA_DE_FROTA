export const metadata = {
  title: 'Termos de Serviço | Sistema Frota',
  description: 'Termos de serviço do Sistema Frota - RBARROS Engenharia',
};

export default function TermosDeServico() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', color: '#e0e0e0', backgroundColor: '#0a0a0a', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: 24, color: '#fff' }}>Termos de Serviço</h1>
      <p style={{ color: '#999', marginBottom: 32 }}>Última atualização: 19 de maio de 2026</p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>1. Aceitação dos Termos</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Ao utilizar o Sistema Frota, você concorda com estes termos de serviço. O sistema é uma plataforma 
          de gestão de frotas operada pela RBARROS Engenharia, destinada ao uso interno e por parceiros autorizados.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>2. Descrição do Serviço</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>O Sistema Frota oferece:</p>
        <ul style={{ lineHeight: 2, color: '#bbb', paddingLeft: 24 }}>
          <li>Gestão completa de frota de veículos</li>
          <li>Controle de viagens, abastecimentos e manutenção</li>
          <li>Comunicação automatizada via WhatsApp com motoristas</li>
          <li>Relatórios operacionais e financeiros</li>
          <li>Galeria de fotos e documentação de veículos</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>3. Responsabilidades do Usuário</h2>
        <ul style={{ lineHeight: 2, color: '#bbb', paddingLeft: 24 }}>
          <li>Manter suas credenciais de acesso em sigilo</li>
          <li>Fornecer informações precisas e atualizadas</li>
          <li>Utilizar o sistema apenas para fins operacionais autorizados</li>
          <li>Não compartilhar acesso com terceiros não autorizados</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>4. Propriedade Intelectual</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Todo o conteúdo, código-fonte, design e funcionalidades do Sistema Frota são propriedade da RBARROS 
          Engenharia. É proibida a reprodução, distribuição ou modificação sem autorização prévia.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>5. Limitação de Responsabilidade</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          O sistema é fornecido &quot;como está&quot;. A RBARROS Engenharia não se responsabiliza por 
          perdas ou danos resultantes do uso do sistema, incluindo falhas técnicas, indisponibilidade 
          temporária ou perda de dados.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>6. Comunicação via WhatsApp</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Ao utilizar o sistema, você consente em receber mensagens operacionais via WhatsApp, incluindo 
          notificações sobre viagens, abastecimentos, checklists e outras comunicações relacionadas às 
          operações da frota.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>7. Modificações</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          Reservamo-nos o direito de modificar estes termos a qualquer momento. As alterações serão 
          comunicadas através do sistema.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: 12, color: '#ccc' }}>8. Contato</h2>
        <p style={{ lineHeight: 1.7, color: '#bbb' }}>
          E-mail: <a href="mailto:ronaldo@ronaldoborba.com.br" style={{ color: '#60a5fa' }}>ronaldo@ronaldoborba.com.br</a><br />
          RBARROS Engenharia
        </p>
      </section>
    </main>
  );
}
