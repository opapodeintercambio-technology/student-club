import { X } from 'lucide-react';

interface PrivacyModalProps {
  onClose: () => void;
}

export function PrivacyModal({ onClose }: PrivacyModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div
          className="text-white px-6 py-4 rounded-t-3xl flex items-center justify-between flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)' }}
        >
          <h2 className="text-lg font-bold" style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.06em' }}>
            Política de Privacidade — Student Club
          </h2>
          <button onClick={onClose} aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 text-sm text-stone-700 space-y-5 flex-1">
          <p className="text-xs text-stone-400">
            <strong>Última atualização:</strong> 13 de maio de 2026
          </p>

          <p className="text-sm">
            O <strong>Student Club</strong> é a comunidade digital do <strong>Papo de Intercâmbio</strong>, voltada para
            estudantes que estão se preparando, vivendo ou voltando de um programa de intercâmbio no exterior.
            Esta Política de Privacidade explica, em linguagem clara, quais dados coletamos, por que coletamos,
            como protegemos e com quem eventualmente compartilhamos — sempre respeitando a Lei Geral de Proteção
            de Dados (LGPD, Lei nº 13.709/2018).
          </p>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>1. Quem é o Controlador</h3>
            <p>
              O Student Club é operado pela equipe do <strong>O Papo de Intercâmbio</strong>, consultoria educacional
              especializada em intercâmbio na Irlanda e em outros destinos.
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-stone-600">
              <li><strong>WhatsApp / Suporte:</strong> (47) 99638-2238</li>
              <li><strong>E-mail:</strong> suporte@opapodeintercambio.com.br</li>
              <li><strong>Instagram:</strong> @opapodeintercambio</li>
              <li><strong>Site institucional:</strong> opapodeintercambio.com.br</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>2. Dados que coletamos</h3>
            <p>Para o app funcionar, coletamos apenas o necessário:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-stone-600">
              <li><strong>Cadastro:</strong> nome, e-mail, senha (criptografada), telefone/WhatsApp.</li>
              <li><strong>Perfil:</strong> foto de perfil, país de origem, país de destino, cidade.</li>
              <li><strong>Documentos do intercâmbio:</strong> checklist de progresso (passaporte, seguro, escola, voo). Esses dados ficam só no seu navegador, na sua conta.</li>
              <li><strong>Conteúdo público:</strong> stories, posts no Feed News, comentários, curtidas, meets agendados.</li>
              <li><strong>Verificação (opcional):</strong> selfie ao vivo para liberar recursos completos.</li>
              <li><strong>Localização aproximada (opcional):</strong> usada apenas para sugerir conteúdo regional. Pode ser recusada e o app continua funcionando.</li>
              <li><strong>Dados técnicos:</strong> IP, modelo do dispositivo, navegador, idioma — anônimos, para detectar falhas e proteger contra fraude.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>3. Para que usamos</h3>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li>Manter a sua conta, sua jornada de documentos e seus stories funcionando.</li>
              <li>Permitir interações sociais: feed, comentários, respostas, meets, chat.</li>
              <li>Mostrar conteúdo relevante de acordo com seu país de destino.</li>
              <li>Quando você clica em <strong>Comprar</strong> na Papo Store, o app abre o WhatsApp oficial da equipe — você decide o que enviar.</li>
              <li>Enviar atualizações sobre a sua jornada e novidades da plataforma (sempre opcional, você desativa quando quiser).</li>
              <li>Prevenir fraude, spam e proteger os outros alunos.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>4. Base legal (LGPD)</h3>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li><strong>Execução de contrato</strong> — quando você se cadastra para usar o app.</li>
              <li><strong>Consentimento</strong> — para localização, selfie de verificação e notificações.</li>
              <li><strong>Legítimo interesse</strong> — para segurança e melhoria do produto.</li>
              <li><strong>Obrigação legal</strong> — quando uma autoridade competente exigir.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>5. Conteúdo que você publica</h3>
            <p>
              Stories, posts no Feed News e comentários são <strong>públicos para outros alunos da plataforma</strong>.
              Não vendemos esse conteúdo para terceiros. Você pode editar ou apagar qualquer post ou story
              que publicou. Stories expiram automaticamente em 24h, igual ao Instagram.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>6. Compartilhamento</h3>
            <p>Compartilhamos seus dados <strong>apenas</strong> com:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-stone-600">
              <li><strong>Outros alunos</strong>: nome, foto e conteúdo público — para você interagir na comunidade.</li>
              <li><strong>Fornecedores essenciais</strong>: Supabase (banco e autenticação) e Vercel (hospedagem do site), ambos com cláusulas de proteção de dados.</li>
              <li><strong>Equipe do Papo de Intercâmbio</strong>: quando você inicia uma compra ou pede suporte, abrimos uma conversa no WhatsApp oficial.</li>
              <li><strong>Autoridades</strong>: somente sob ordem judicial ou exigência legal.</li>
            </ul>
            <p className="mt-2"><strong>Nunca vendemos seus dados.</strong></p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>7. Verificação por selfie (opcional)</h3>
            <p>
              Para liberar funções completas (postar, mandar mensagem, ver perfis), oferecemos uma verificação
              rápida com selfie ao vivo. A selfie fica armazenada em servidor seguro, é vista apenas pela nossa
              equipe e <strong>não é usada</strong> para reconhecimento facial automatizado, nem compartilhada.
              Você pode pedir a exclusão dela a qualquer momento pelo nosso e-mail.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>8. Onde os dados ficam</h3>
            <p>
              Os dados ficam em servidores na nuvem (Supabase / Vercel) com criptografia em trânsito e em repouso.
              Esses provedores podem ter servidores fora do Brasil, mas mantêm padrões de proteção
              compatíveis com a LGPD e GDPR.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>9. Seus direitos</h3>
            <p>Você pode, a qualquer momento:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-stone-600">
              <li>Acessar e baixar seus dados.</li>
              <li>Corrigir informações imprecisas.</li>
              <li>Excluir sua conta (Menu → Configurações → Excluir conta).</li>
              <li>Pedir a portabilidade ou anonimização.</li>
              <li>Revogar o consentimento para localização, selfie ou notificações.</li>
            </ul>
            <p className="mt-2">É só falar com a gente pelo WhatsApp (47) 99638-2238 ou e-mail.</p>
          </section>

          <section className="rounded-2xl p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <h3 className="font-bold text-base mb-2 text-red-700">10. Convivência — tolerância zero</h3>
            <p className="text-stone-700">
              Student Club é uma comunidade de estudantes. Ao publicar conteúdo (stories, posts, comentários, meets),
              você se compromete a <strong>não compartilhar</strong>:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-stone-700">
              <li>Discurso de ódio, racismo, xenofobia, lgbtfobia ou misoginia.</li>
              <li>Conteúdo sexualmente explícito, pornográfico ou inadequado para menores.</li>
              <li>Spam, golpes, falsa identidade ou produtos ilegais.</li>
              <li>Assédio, ameaças, perseguição ou doxxing.</li>
              <li>Violação de direitos autorais ou propriedade intelectual.</li>
            </ul>
            <p className="mt-3 text-stone-700"><strong>O que fazemos:</strong></p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-stone-700">
              <li>Todo conteúdo pode ser denunciado dentro do app.</li>
              <li>Denúncias são analisadas em até <strong>24 horas</strong>.</li>
              <li>Conteúdo abusivo é removido e o usuário banido.</li>
              <li>Casos graves são reportados às autoridades.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>11. Cookies e armazenamento local</h3>
            <p>
              Usamos cookies essenciais e armazenamento local (localStorage / IndexedDB) para manter sua sessão,
              guardar rascunhos de stories e fazer o app abrir rápido. Não usamos cookies de rastreamento publicitário
              de terceiros.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>12. Crianças e adolescentes</h3>
            <p>
              O Student Club é destinado a maiores de <strong>16 anos</strong>. Quem tiver entre 16 e 18 deve
              usar com autorização dos responsáveis. Não coletamos conscientemente dados de menores de 16.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>13. Mudanças nesta política</h3>
            <p>
              Esta política pode ser atualizada. Mudanças relevantes serão avisadas dentro do app. Manter o uso
              após a atualização significa aceitar a nova versão.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>14. Contato</h3>
            <p>
              Dúvidas, pedidos de exclusão ou suporte:
              <br />📱 <strong>WhatsApp</strong>: (47) 99638-2238
              <br />✉️ <strong>E-mail</strong>: suporte@opapodeintercambio.com.br
              <br />📷 <strong>Instagram</strong>: @opapodeintercambio
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-white font-bold transition-all"
            style={{
              background: 'linear-gradient(135deg, #5a7a52 0%, #b8896a 100%)',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              letterSpacing: '0.14em',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
