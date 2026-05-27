import { X } from 'lucide-react';

interface PrivacyModalProps {
  onClose: () => void;
}

// ════════════════════════════════════════════════════════════════════
// Politica de Privacidade Student Club — v2.0 (2026-05-27)
//
// Atende:
//   - LGPD (Lei 13.709/2018) — Brasil
//   - GDPR (UE) + UK GDPR
//   - CCPA / CPRA — Califórnia
//   - Apple App Privacy (App Store)
//   - Google Data Safety (Play Store)
//   - Children's Privacy (16+ — COPPA US, GDPR-K UE, LGPD BR)
//
// Cobre TODAS as integracoes 3rd-party do app + categorias de dados
// que Apple e Google exigem declarar nas suas plataformas.
// ════════════════════════════════════════════════════════════════════

export function PrivacyModal({ onClose }: PrivacyModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[10000] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div
          className="text-white px-6 py-4 rounded-t-3xl flex items-center justify-between flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)' }}
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
            <strong>Última atualização:</strong> 27 de maio de 2026 · <strong>Versão:</strong> 2.0
          </p>

          <p className="text-sm">
            Bem-vindo ao <strong>Student Club</strong>, rede social criada exclusivamente para intercambistas brasileiros.
            Esta Política de Privacidade explica de forma clara <strong>quais dados coletamos, por que coletamos, como protegemos
            e com quem compartilhamos</strong>. Lemos a sério — você é nosso ativo mais importante.
          </p>

          <p className="text-sm">
            Esta política cumpre a <strong>Lei Geral de Proteção de Dados (LGPD)</strong> brasileira, o <strong>GDPR</strong> europeu,
            o <strong>CCPA/CPRA</strong> da Califórnia, e as exigências de <strong>privacidade da Apple App Store</strong> e
            <strong> Google Play Store</strong>.
          </p>

          {/* ─── 1. CONTROLADOR ────────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>1. Quem somos (Controlador dos dados)</h3>
            <p>
              O Student Club é operado pela <strong>O PAPO DE INTERCAMBIO LTDA</strong>, consultoria educacional
              especializada em intercâmbio na Irlanda e outros destinos.
            </p>
            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <p className="font-semibold text-stone-800 mb-1">Dados de identificação do Controlador (LGPD Art. 9°):</p>
              <ul className="space-y-0.5 text-stone-600">
                <li><strong>Razão Social:</strong> O PAPO DE INTERCAMBIO LTDA</li>
                <li><strong>CNPJ:</strong> 44.692.725/0001-63</li>
                <li><strong>Endereço:</strong> Estrada Geral Queimada Grande, KM 2 — Bairro Queimada Grande</li>
                <li>Rancho Queimado/SC — CEP 88.470-000 — Brasil</li>
              </ul>
            </div>
            <ul className="list-disc list-inside mt-3 space-y-1 text-stone-600">
              <li><strong>App:</strong> Student Club (studentclub.app)</li>
              <li><strong>Suporte / Encarregado de Proteção de Dados (DPO):</strong> suporte@studentclub.app</li>
              <li><strong>WhatsApp:</strong> +55 (47) 99638-2238</li>
              <li><strong>Site institucional:</strong> opapodeintercambio.com.br</li>
            </ul>
            <p className="mt-2 text-xs text-stone-500">
              Para qualquer solicitação relacionada aos seus dados pessoais (acesso, correção, exclusão, portabilidade,
              revogação de consentimento), entre em contato pelo email do DPO acima. Resposta em até 5 dias úteis.
            </p>
          </section>

          {/* ─── 2. DADOS COLETADOS ────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>2. Dados que coletamos</h3>

            <p className="mb-2 font-semibold text-stone-800">2.1 Dados de cadastro e perfil</p>
            <ul className="list-disc list-inside space-y-1 text-stone-600 mb-3">
              <li><strong>Email</strong> e <strong>senha</strong> (hash criptografado, nunca em texto puro)</li>
              <li><strong>Nome</strong> e <strong>nome de usuário</strong> (público no app)</li>
              <li><strong>Foto de perfil</strong> (pública, opcional)</li>
              <li><strong>País de origem</strong>, <strong>destino do intercâmbio</strong>, <strong>cidade</strong></li>
              <li><strong>Data de início do intercâmbio</strong> (opcional)</li>
              <li><strong>Telefone/WhatsApp</strong> (opcional)</li>
            </ul>

            <p className="mb-2 font-semibold text-stone-800">2.2 Conteúdo gerado por você</p>
            <ul className="list-disc list-inside space-y-1 text-stone-600 mb-3">
              <li><strong>Posts</strong> e <strong>stories</strong> (fotos, vídeos, texto)</li>
              <li><strong>Mensagens de chat</strong> (texto, áudio, foto, vídeo)</li>
              <li><strong>Curtidas, comentários, visualizações</strong></li>
              <li><strong>Gravações de áudio</strong> do chat (transcritas via IA para tradução, ver §6)</li>
              <li><strong>Checklist do intercâmbio</strong> (documentos, vacinas, voo, etc.)</li>
              <li><strong>Gastos da viagem</strong> (valores em moeda local e BRL — só você vê)</li>
            </ul>

            <p className="mb-2 font-semibold text-stone-800">2.3 Dados sensíveis (opt-in)</p>
            <ul className="list-disc list-inside space-y-1 text-stone-600 mb-3">
              <li><strong>Localização aproximada</strong> (somente com permissão explícita do iOS/Android) — usada para conectar você com intercambistas próximos. Você pode revogar a qualquer momento nas configurações do sistema.</li>
              <li><strong>Câmera</strong> — usada SÓ quando você ativa para tirar foto/gravar vídeo no app. Nunca em background.</li>
              <li><strong>Microfone</strong> — usado SÓ quando você grava áudio no chat ou vídeo no feed/stories. Nunca em background.</li>
              <li><strong>Galeria de fotos</strong> — acesso só com sua permissão explícita, somente quando você escolhe enviar uma foto/vídeo.</li>
            </ul>

            <p className="mb-2 font-semibold text-stone-800">2.4 Dados técnicos e de uso</p>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li><strong>Endereço IP</strong> (anonimizado nos logs após 90 dias)</li>
              <li><strong>Modelo do dispositivo</strong>, sistema operacional, versão do app</li>
              <li><strong>Idioma e fuso horário</strong></li>
              <li><strong>Token de notificação push</strong> (APNs do iOS / FCM do Android)</li>
              <li><strong>Logs de erro/crash</strong> (anônimos, para diagnóstico)</li>
              <li><strong>Estatísticas de uso</strong> (telas visitadas, posts visualizados — anônimos, agregados)</li>
            </ul>

            <p className="mt-3 text-xs text-stone-500 italic">
              <strong>Não coletamos:</strong> IDFA (identificador de publicidade iOS), Google Advertising ID (Android),
              dados biométricos, histórico de navegação fora do app, contatos do telefone, SMS, dados bancários
              ou de cartão de crédito.
            </p>
          </section>

          {/* ─── 3. PARA QUE USAMOS ────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>3. Para que usamos seus dados</h3>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li><strong>Operar o app</strong>: criar sua conta, manter sua sessão logada, sincronizar conteúdo entre dispositivos.</li>
              <li><strong>Conectar você com a comunidade</strong>: feed, stories, chat, sugestões de amigos por destino/cidade.</li>
              <li><strong>Tradução automática</strong> de áudios e textos no chat (ver §6 sobre IA).</li>
              <li><strong>Notificações</strong> push de mensagens, curtidas, novos posts (sempre opt-in — você pode desativar).</li>
              <li><strong>Suporte ao cliente</strong> via email/WhatsApp.</li>
              <li><strong>Segurança</strong>: prevenir spam, fraude, identidade falsa, abuso da comunidade.</li>
              <li><strong>Melhorar o produto</strong>: análise agregada e anônima de uso, sem perfil individual.</li>
              <li><strong>Cumprir obrigações legais</strong>: quando exigido por autoridade competente.</li>
            </ul>
          </section>

          {/* ─── 4. BASE LEGAL (LGPD/GDPR) ─────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>4. Base legal para tratamento</h3>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li><strong>Execução de contrato</strong> (LGPD Art. 7°, V / GDPR Art. 6(1)(b)) — para fornecer o serviço que você contratou ao se cadastrar.</li>
              <li><strong>Consentimento</strong> (LGPD Art. 7°, I / GDPR Art. 6(1)(a)) — para localização, notificações, câmera, microfone, galeria. Sempre opt-in, sempre revogável.</li>
              <li><strong>Legítimo interesse</strong> (LGPD Art. 7°, IX / GDPR Art. 6(1)(f)) — para segurança, prevenção de fraude e melhoria do produto.</li>
              <li><strong>Cumprimento de obrigação legal</strong> (LGPD Art. 7°, II / GDPR Art. 6(1)(c)) — quando autoridades exigem.</li>
            </ul>
          </section>

          {/* ─── 5. COMPARTILHAMENTO 3RD-PARTY ─────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>5. Compartilhamento com terceiros (SDKs / serviços)</h3>
            <p className="mb-2">
              Para o app funcionar, usamos fornecedores especializados. Todos têm <strong>cláusulas de proteção de dados</strong> e
              cumprem LGPD/GDPR. Veja exatamente quem recebe o quê:
            </p>

            <div className="space-y-3 mt-3">
              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Supabase Inc. (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  Banco de dados, autenticação, armazenamento de arquivos, presença em tempo real.
                  Recebe: email, senha (hash), todos os dados do app.
                  <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Vercel Inc. (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  Hospedagem do app e funções serverless (back-end).
                  Recebe: IP, logs de requisições.
                  <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Cloudflare Inc. (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  CDN + Stream (hospedagem e streaming de vídeos do feed/stories).
                  Recebe: vídeos públicos do feed.
                  <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Google LLC — Firebase Cloud Messaging (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  Entrega de notificações push no Android.
                  Recebe: token de notificação do dispositivo.
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Apple Inc. — APNs (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  Entrega de notificações push no iOS.
                  Recebe: token de notificação do dispositivo.
                  <a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Google LLC — Translate API (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  Tradução automática de mensagens de texto do chat (quando você ativa).
                  Recebe: texto da mensagem a traduzir (anônimo, sem ID de usuário).
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Groq Inc. — Whisper API (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  Transcrição e tradução de áudios do chat via IA (Whisper).
                  Recebe: arquivo de áudio (anônimo, sem ID de usuário).
                  Groq declara que <strong>não usa</strong> dados de entrada para treinar seus modelos.
                  <a href="https://groq.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Resend Inc. (Estados Unidos)</p>
                <p className="text-xs text-stone-600">
                  Envio de emails transacionais (confirmação, reset de senha, notificações).
                  Recebe: seu email e conteúdo do email.
                  <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>

              <div className="border-l-4 border-emerald-300 pl-3 py-1">
                <p className="font-semibold text-stone-800">Spotify AB (Suécia) — opcional</p>
                <p className="text-xs text-stone-600">
                  Conexão OAuth para anexar músicas em stories/posts/chat. Só ativa se você conectar manualmente.
                  Recebe: autorização OAuth, faixas que você escolhe.
                  <a href="https://www.spotify.com/legal/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-purple-600 underline ml-1">Política</a>
                </p>
              </div>
            </div>

            <p className="mt-4 text-stone-800 font-semibold">
              ❌ Nunca vendemos seus dados. ❌ Nunca compartilhamos para publicidade direcionada.
            </p>
          </section>

          {/* ─── 6. INTELIGENCIA ARTIFICIAL ────────────────────────── */}
          <section className="rounded-2xl p-4" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>6. Inteligência Artificial</h3>
            <p>
              Usamos IA para <strong>tradução automática</strong> de áudios e textos do chat — recurso opt-in que você
              ativa pelo ícone 🌐 na conversa:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-stone-700">
              <li><strong>Áudios:</strong> processados pela API Groq Whisper (transcrição + tradução).</li>
              <li><strong>Textos:</strong> processados pela API Google Translate.</li>
              <li>Os dados são enviados <strong>sem identificação do usuário</strong>.</li>
              <li>Resultados são <strong>cacheados localmente</strong> no seu dispositivo (zero re-envio).</li>
              <li>Estes provedores <strong>não usam</strong> seus dados para treinar modelos.</li>
            </ul>
          </section>

          {/* ─── 7. TRANSFERENCIA INTERNACIONAL ────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>7. Transferência internacional de dados</h3>
            <p>
              Os fornecedores listados acima estão majoritariamente nos <strong>Estados Unidos</strong>. As transferências
              ocorrem sob:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-stone-600">
              <li><strong>Standard Contractual Clauses (SCCs)</strong> da Comissão Europeia (para usuários da UE)</li>
              <li><strong>EU-US Data Privacy Framework</strong> (DPF)</li>
              <li><strong>Cláusulas contratuais específicas LGPD</strong> (para usuários do Brasil)</li>
            </ul>
            <p className="mt-2">
              Todos esses fornecedores oferecem nível de proteção de dados <strong>equivalente</strong> ao exigido pela LGPD/GDPR.
            </p>
          </section>

          {/* ─── 8. RETENCAO ───────────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>8. Por quanto tempo mantemos seus dados</h3>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li><strong>Conta ativa:</strong> dados mantidos enquanto sua conta existir.</li>
              <li><strong>Após exclusão da conta:</strong> dados anonimizados em até <strong>30 dias</strong>; backups expirando em até <strong>90 dias</strong>.</li>
              <li><strong>Stories:</strong> expiram automaticamente após 24h.</li>
              <li><strong>Logs de erro/IP:</strong> 90 dias.</li>
              <li><strong>Dados fiscais/legais:</strong> conforme exigido pela legislação aplicável (até 5 anos pra obrigações tributárias e cíveis no Brasil).</li>
            </ul>
          </section>

          {/* ─── 9. SEUS DIREITOS ──────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>9. Seus direitos</h3>
            <p>Você pode, a qualquer momento e sem custo:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-stone-600">
              <li><strong>Acessar</strong> uma cópia dos seus dados</li>
              <li><strong>Corrigir</strong> informações imprecisas</li>
              <li><strong>Excluir</strong> sua conta e todos os dados (Menu → Configurações → Excluir minha conta)</li>
              <li><strong>Portabilidade</strong> dos seus dados em formato legível</li>
              <li><strong>Revogar consentimentos</strong> (localização, notificações, etc.) a qualquer momento</li>
              <li><strong>Opor-se</strong> ao tratamento baseado em legítimo interesse</li>
              <li><strong>Não ser sujeito a decisões automatizadas</strong> que afetem você (nenhuma é tomada por IA no app)</li>
            </ul>
            <p className="mt-2 text-stone-600">
              Para qualquer direito acima: <strong>suporte@studentclub.app</strong> ou diretamente no app (Menu → Privacidade).
            </p>
            <p className="mt-2 text-xs text-stone-500">
              <strong>Usuários da Califórnia (CCPA/CPRA):</strong> além dos direitos acima, você tem o direito de saber se vendemos
              seus dados (não vendemos) e de fazer opt-out de qualquer compartilhamento com fins de "cross-context advertising"
              (não fazemos).
            </p>
            <p className="mt-2 text-xs text-stone-500">
              <strong>Usuários da UE/UK (GDPR):</strong> você tem direito de apresentar reclamação à sua autoridade local de proteção de dados.
            </p>
            <p className="mt-2 text-xs text-stone-500">
              <strong>Brasil:</strong> você pode também apresentar reclamação à <strong>ANPD (Autoridade Nacional de Proteção de Dados)</strong>.
            </p>
          </section>

          {/* ─── 10. SEGURANCA ─────────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>10. Segurança</h3>
            <ul className="list-disc list-inside space-y-1 text-stone-600">
              <li><strong>Criptografia em trânsito</strong>: TLS 1.3 em todas as conexões</li>
              <li><strong>Criptografia em repouso</strong>: AES-256 nos bancos do Supabase</li>
              <li><strong>Senhas</strong>: armazenadas como hash bcrypt (nunca em texto puro)</li>
              <li><strong>Mensagens privadas do chat</strong>: criptografia end-to-end opcional via WebCrypto API</li>
              <li><strong>Acesso restrito</strong>: apenas membros autorizados da equipe têm acesso ao banco</li>
              <li><strong>Monitoramento</strong> contínuo de tentativas de invasão</li>
              <li><strong>Backups</strong> diários automáticos</li>
            </ul>
            <p className="mt-3 text-xs text-stone-500">
              Em caso de incidente de segurança que afete seus dados, comunicaremos você e a <strong>ANPD</strong>
              dentro do prazo legal (LGPD Art. 48), normalmente em até 72 horas.
            </p>
          </section>

          {/* ─── 11. CRIANCAS ──────────────────────────────────────── */}
          <section className="rounded-2xl p-4" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
            <h3 className="font-bold text-base mb-2" style={{ color: '#854d0e' }}>11. Idade mínima — 16 anos</h3>
            <p>
              O Student Club destina-se a maiores de <strong>16 anos</strong>. Entre 16 e 18, é necessário consentimento
              dos responsáveis legais. <strong>Não coletamos intencionalmente</strong> dados de menores de 16 anos.
            </p>
            <p className="mt-2 text-xs">
              Se você é responsável por um menor de 16 que se cadastrou, escreva para <strong>suporte@studentclub.app</strong>
              que excluímos a conta e todos os dados em até 5 dias úteis.
            </p>
            <p className="mt-2 text-xs">
              Cumprimento: <strong>COPPA</strong> (EUA, 13+), <strong>GDPR-K Art. 8</strong> (UE, 13-16 conforme país),
              <strong>LGPD Art. 14</strong> (Brasil).
            </p>
          </section>

          {/* ─── 12. CONVIVENCIA ───────────────────────────────────── */}
          <section className="rounded-2xl p-4" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <h3 className="font-bold text-base mb-2 text-red-700">12. Regras de convivência — tolerância zero</h3>
            <p>
              Como usuário do Student Club, você se compromete a <strong>NÃO</strong> publicar:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-stone-700">
              <li>Discurso de ódio, racismo, xenofobia, LGBTfobia, misoginia ou capacitismo</li>
              <li>Conteúdo sexualmente explícito, pornografia ou material inadequado a menores</li>
              <li>Assédio, ameaças, perseguição, doxxing</li>
              <li>Spam, golpes, esquemas de pirâmide, fake news</li>
              <li>Falsa identidade ou personificação</li>
              <li>Violação de direitos autorais ou propriedade intelectual</li>
              <li>Promoção de drogas, violência, automutilação ou suicídio</li>
              <li>Atividades ilegais sob a lei brasileira ou do país onde você está</li>
            </ul>
            <p className="mt-3 text-stone-700"><strong>Nossa resposta:</strong></p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-stone-700">
              <li>Denúncias analisadas em <strong>até 24 horas</strong></li>
              <li>Conteúdo removido + usuário banido em violações graves</li>
              <li>Casos criminais reportados às autoridades competentes</li>
              <li>Você pode denunciar qualquer conteúdo direto pelo app (ícone "..." em cada post)</li>
            </ul>
          </section>

          {/* ─── 13. APPLE / GOOGLE DATA CATEGORIES ────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>13. Apple App Privacy & Google Data Safety</h3>
            <p>Conforme exigido pelas lojas de apps, declaramos as categorias de dados coletados:</p>

            <p className="mb-2 mt-3 font-semibold text-stone-800">Apple App Privacy:</p>
            <ul className="list-disc list-inside space-y-1 text-stone-600 text-xs">
              <li><strong>Data Used to Track You</strong>: Nenhum (não fazemos tracking)</li>
              <li><strong>Data Linked to You</strong>: Email, Nome, Foto de perfil, Localização, Conteúdo do usuário, Identificadores (User ID)</li>
              <li><strong>Data Not Linked to You</strong>: Diagnósticos, Estatísticas de uso</li>
            </ul>

            <p className="mb-2 mt-3 font-semibold text-stone-800">Google Data Safety:</p>
            <ul className="list-disc list-inside space-y-1 text-stone-600 text-xs">
              <li><strong>Pessoais</strong>: Email, Nome (necessário)</li>
              <li><strong>Localização</strong>: Aproximada (opcional, com consentimento)</li>
              <li><strong>Fotos/Vídeos</strong>: User-generated content (opcional)</li>
              <li><strong>Áudio</strong>: Voice/sound recordings, Music files (opcional)</li>
              <li><strong>Mensagens</strong>: Outros mensagens dentro do app (necessário)</li>
              <li><strong>Atividade</strong>: Interações com o app (anônimo, agregado)</li>
              <li><strong>Diagnósticos</strong>: Crash logs (anônimo)</li>
              <li><strong>Criptografia em trânsito</strong>: ✅ Sim</li>
              <li><strong>Pode solicitar exclusão</strong>: ✅ Sim, no app</li>
            </ul>
          </section>

          {/* ─── 14. COOKIES ───────────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>14. Cookies e armazenamento local</h3>
            <p>
              Usamos <strong>apenas cookies essenciais</strong> e <strong>armazenamento local</strong> (localStorage,
              IndexedDB) para:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-stone-600">
              <li>Manter sua sessão logada</li>
              <li>Cachear traduções (zero re-envio)</li>
              <li>Guardar rascunhos de stories/posts</li>
              <li>Lembrar suas preferências (idioma, tema escuro/claro)</li>
            </ul>
            <p className="mt-2">
              <strong>NÃO usamos</strong> cookies de rastreamento publicitário ou de terceiros. Não temos pixels do Facebook,
              Google Analytics ou similares.
            </p>
          </section>

          {/* ─── 15. EXCLUSAO DA CONTA (APPLE REQUIREMENT) ─────────── */}
          <section className="rounded-2xl p-4" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <h3 className="font-bold text-base mb-2" style={{ color: '#1e3a8a' }}>15. Como excluir sua conta</h3>
            <p>Você pode excluir sua conta e todos os dados a qualquer momento:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1 text-stone-700">
              <li>Abra o app → Menu → <strong>Configurações</strong> → <strong>Minha conta</strong></li>
              <li>Toque em <strong>"Excluir minha conta"</strong> no fim da tela</li>
              <li>Confirme com sua senha</li>
              <li>Pronto — dados anonimizados em até 30 dias</li>
            </ol>
            <p className="mt-2 text-stone-700">
              Alternativamente, envie email para <strong>suporte@studentclub.app</strong> com assunto "Excluir minha conta".
            </p>
          </section>

          {/* ─── 16. MUDANCAS ──────────────────────────────────────── */}
          <section>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>16. Atualizações desta política</h3>
            <p>
              Esta política pode ser atualizada conforme novas funcionalidades, leis ou serviços. Mudanças relevantes serão
              <strong> notificadas no app</strong> com 30 dias de antecedência. Manter o uso após a atualização significa
              que você aceita a nova versão.
            </p>
          </section>

          {/* ─── 17. CONTATO ───────────────────────────────────────── */}
          <section className="rounded-2xl p-4" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <h3 className="font-bold text-base mb-2" style={{ color: '#5a7a52' }}>17. Contato</h3>
            <p>Para qualquer dúvida, exercício de direitos, denúncia ou suporte:</p>
            <ul className="list-none mt-2 space-y-1 text-stone-700">
              <li>✉️ <strong>Email:</strong> suporte@studentclub.app</li>
              <li>📱 <strong>WhatsApp:</strong> +55 (47) 99638-2238</li>
              <li>📷 <strong>Instagram:</strong> @opapodeintercambio</li>
              <li>🌐 <strong>Site:</strong> studentclub.app</li>
            </ul>
            <p className="mt-3 text-xs text-stone-500">
              <strong>Tempo de resposta:</strong> em até 5 dias úteis para qualquer pedido relacionado aos seus dados pessoais.
              Para casos urgentes (incidente de segurança), garantimos resposta em até 24h.
            </p>
          </section>

          <p className="text-xs text-stone-400 text-center pt-3 border-t border-stone-100">
            Student Club é operado pela <strong>O PAPO DE INTERCAMBIO LTDA</strong> · CNPJ 44.692.725/0001-63 · Rancho Queimado/SC · Brasil
            <br />Versão 2.0 — atende LGPD, GDPR, CCPA, Apple App Privacy, Google Data Safety
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl text-white font-bold transition-all"
            style={{
              background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              letterSpacing: '0.14em',
            }}
          >
            Entendi e aceito
          </button>
        </div>
      </div>
    </div>
  );
}
