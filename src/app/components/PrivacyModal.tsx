import { X } from 'lucide-react';

interface PrivacyModalProps {
  onClose: () => void;
}

export function PrivacyModal({ onClose }: PrivacyModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-purple-700 text-white px-6 py-4 rounded-t-3xl flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold">Política de Privacidade – TROKVIBE</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto px-6 py-5 text-sm text-gray-700 space-y-5 flex-1">
          <p className="text-xs text-gray-400"><strong>Última atualização:</strong> 23 de abril de 2026</p>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">1. Controlador dos Dados</h3>
            <p>Esta Política de Privacidade descreve como os dados pessoais são coletados, utilizados e protegidos pelo Trokvibe.</p>
            <p className="mt-1"><strong>Responsável:</strong> Guilherme Lima</p>
            <p><strong>E-mail:</strong> suporte@trokvibe.com</p>
            <p><strong>Localização:</strong> Curitiba - PR, Brasil</p>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">2. Dados Coletados</h3>
            <p>O Trokvibe poderá coletar os seguintes dados pessoais:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-gray-600">
              <li>Nome completo</li>
              <li>E-mail</li>
              <li>Número de telefone</li>
              <li>Endereço e localização aproximada (para facilitar trocas próximas)</li>
              <li>Informações inseridas em anúncios</li>
              <li>Dados de navegação (IP, dispositivo, navegador, páginas acessadas)</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">3. Finalidade do Tratamento</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Permitir o funcionamento da plataforma</li>
              <li>Conectar usuários próximos geograficamente</li>
              <li>Melhorar a experiência do usuário</li>
              <li>Prevenir fraudes e garantir segurança</li>
              <li>Cumprir obrigações legais</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">4. Base Legal</h3>
            <p>O tratamento de dados é realizado conforme a <strong>Lei nº 13.709/2018 (LGPD)</strong>, com base em:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-gray-600">
              <li>Execução de contrato</li>
              <li>Legítimo interesse</li>
              <li>Cumprimento de obrigação legal</li>
              <li>Consentimento do usuário, quando aplicável</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">5. Compartilhamento de Dados</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Outros usuários (quando necessário para viabilizar trocas)</li>
              <li>Parceiros tecnológicos e prestadores de serviço</li>
              <li>Autoridades públicas, mediante obrigação legal</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">6. Armazenamento e Retenção</h3>
            <p>Os dados serão armazenados pelo tempo necessário para cumprir as finalidades desta Política e obrigações legais.</p>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">7. Direitos do Usuário</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Confirmar a existência de tratamento de dados</li>
              <li>Acessar seus dados</li>
              <li>Corrigir dados incompletos ou desatualizados</li>
              <li>Solicitar anonimização ou exclusão</li>
              <li>Revogar consentimento</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">8. Segurança</h3>
            <p>O Trokvibe adota medidas técnicas e administrativas para proteger os dados pessoais contra acessos não autorizados, vazamentos e usos indevidos. No entanto, não é possível garantir segurança absoluta em ambientes digitais.</p>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">9. Cookies e Tecnologias</h3>
            <p>O Trokvibe poderá utilizar cookies e tecnologias semelhantes para melhorar a navegação e personalizar a experiência do usuário.</p>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">10. Transferência Internacional</h3>
            <p>Os dados poderão ser armazenados em servidores localizados fora do Brasil, garantindo níveis adequados de proteção conforme a legislação aplicável.</p>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">11. Alterações desta Política</h3>
            <p>Esta Política poderá ser atualizada a qualquer momento. O uso contínuo da plataforma implica aceitação das alterações.</p>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">12. Verificação de Identidade e Dados Biométricos</h3>
            <p>Para garantir a segurança das trocas entre usuários, o TrokVibe poderá solicitar:</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-gray-600">
              <li><strong>Selfie (foto do rosto):</strong> captura da imagem facial do usuário para fins de verificação de identidade.</li>
              <li><strong>Documento com foto:</strong> fotografia de documento oficial (RG, CNH ou passaporte) para confirmação dos dados cadastrais.</li>
            </ul>
            <p className="mt-2">Esses dados são tratados com base no <strong>consentimento expresso</strong> do usuário, nos termos da LGPD (art. 11, inciso I). As imagens são armazenadas de forma segura e utilizadas exclusivamente para verificação manual pela equipe TrokVibe, não sendo compartilhadas com terceiros nem utilizadas para reconhecimento facial automatizado. O usuário poderá solicitar a exclusão dessas informações a qualquer momento pelo e-mail <strong>suporte@trokvibe.com</strong>.</p>
          </section>

          <section className="bg-red-50 border-2 border-red-200 rounded-2xl p-4">
            <h3 className="font-bold text-red-700 text-base mb-2">13. Tolerância Zero a Conteúdo Abusivo (EULA)</h3>
            <p className="text-gray-700">Ao usar o TrokVibe, você concorda em <strong>não publicar, enviar ou compartilhar</strong> qualquer conteúdo que seja:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-gray-700">
              <li>Ofensivo, discriminatório, racista, de ódio ou que incite violência</li>
              <li>Sexualmente explícito, pornográfico ou inadequado para menores</li>
              <li>Fraudulento, enganoso ou referente a produtos ilegais ou falsificados</li>
              <li>Que viole direitos autorais, marcas ou propriedade intelectual de terceiros</li>
              <li>Que envolva spam, assédio, perseguição (stalking) ou bullying</li>
            </ul>
            <p className="mt-3"><strong>Compromisso TrokVibe:</strong></p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-gray-700">
              <li>Disponibilizamos botões para <strong>denunciar</strong> e <strong>bloquear</strong> qualquer usuário ou anúncio.</li>
              <li>Toda denúncia é analisada por nossa equipe em até <strong>24 horas</strong>.</li>
              <li>Conteúdo abusivo é removido imediatamente e o usuário responsável é banido permanentemente.</li>
              <li>Casos graves serão reportados às autoridades competentes.</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">14. Exclusão de Conta</h3>
            <p>Você pode <strong>excluir sua conta a qualquer momento</strong> diretamente no app, no menu Configurações &rarr; Excluir conta. Todos os seus dados pessoais, anúncios, mensagens e fotos serão removidos permanentemente em até 7 dias.</p>
          </section>

          <section>
            <h3 className="font-bold text-purple-700 text-base mb-2">15. Contato</h3>
            <p>Para dúvidas ou solicitações: <strong>suporte@trokvibe.com</strong></p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
