export default function PrivacidadePage() {
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-gray-400 mb-10 text-sm">Última atualização: maio de 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. Introdução</h2>
          <p className="text-gray-300 leading-relaxed">
            O LiderWeb é uma plataforma de gestão de ministério de louvor desenvolvida pela Multitrack Gospel.
            Esta Política de Privacidade descreve como coletamos, usamos e protegemos suas informações pessoais.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. Informações que Coletamos</h2>
          <ul className="text-gray-300 leading-relaxed space-y-2 list-disc list-inside">
            <li><strong>Dados de conta:</strong> nome, endereço de e-mail e foto de perfil</li>
            <li><strong>Dados de uso:</strong> escalas, ensaios, comunicados e mensagens dentro do app</li>
            <li><strong>Token de dispositivo:</strong> para envio de notificações push</li>
            <li><strong>Dados de sessão:</strong> informações de acesso para segurança da conta</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. Como Usamos suas Informações</h2>
          <ul className="text-gray-300 leading-relaxed space-y-2 list-disc list-inside">
            <li>Autenticação e acesso seguro à plataforma</li>
            <li>Exibição de escalas, ensaios e comunicados do ministério</li>
            <li>Envio de notificações push sobre atividades do ministério</li>
            <li>Comunicação entre membros do grupo</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Compartilhamento de Informações</h2>
          <p className="text-gray-300 leading-relaxed">
            Não vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros, exceto:
          </p>
          <ul className="text-gray-300 leading-relaxed space-y-2 list-disc list-inside mt-2">
            <li><strong>Provedores de serviço:</strong> Google Firebase (autenticação e notificações push)</li>
            <li><strong>Obrigação legal:</strong> quando exigido por lei</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. Segurança</h2>
          <p className="text-gray-300 leading-relaxed">
            Utilizamos medidas técnicas e organizacionais para proteger seus dados, incluindo
            criptografia em trânsito (HTTPS) e controle de acesso por sessão autenticada.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">6. Retenção de Dados</h2>
          <p className="text-gray-300 leading-relaxed">
            Seus dados são mantidos enquanto sua conta estiver ativa. Você pode solicitar a exclusão
            da sua conta e dados a qualquer momento pelo e-mail de suporte.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">7. Direitos do Usuário</h2>
          <ul className="text-gray-300 leading-relaxed space-y-2 list-disc list-inside">
            <li>Acessar seus dados pessoais</li>
            <li>Corrigir informações incorretas</li>
            <li>Solicitar a exclusão de seus dados</li>
            <li>Revogar o consentimento para notificações push</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">8. Notificações Push</h2>
          <p className="text-gray-300 leading-relaxed">
            O app solicita permissão para enviar notificações push. Você pode desativar as notificações
            a qualquer momento nas configurações do seu dispositivo Android.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">9. Contato</h2>
          <p className="text-gray-300 leading-relaxed">
            Para dúvidas sobre esta política ou para exercer seus direitos, entre em contato:
          </p>
          <p className="text-gray-300 mt-2">
            <strong>E-mail:</strong> contato@multitrackgospel.com<br />
            <strong>Site:</strong>{" "}
            <a href="https://liderweb.multitrackgospel.com" className="text-indigo-400 hover:underline">
              liderweb.multitrackgospel.com
            </a>
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">10. Alterações nesta Política</h2>
          <p className="text-gray-300 leading-relaxed">
            Podemos atualizar esta política periodicamente. Notificaremos sobre mudanças significativas
            pelo app ou por e-mail.
          </p>
        </section>

        <div className="border-t border-white/10 pt-8 mt-8">
          <p className="text-gray-500 text-sm text-center">
            © {new Date().getFullYear()} LiderWeb by Multitrack Gospel. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
