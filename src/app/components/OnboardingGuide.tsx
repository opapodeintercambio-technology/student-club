import { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

interface OnboardingGuideProps {
  username: string;
  onClose: () => void;
}

const STEPS = [
  {
    emoji: '👋',
    title: 'Bem-vindo ao Papo de Alunos!',
    desc: 'O lugar onde você troca o que não usa pelo que precisa. Aqui, tudo tem valor — basta encontrar quem queira trocar!',
    image: null,
    tip: null,
  },
  {
    emoji: '📢',
    title: 'Crie seu anúncio',
    desc: 'Clique em "+ Anunciar" para cadastrar um item que você quer trocar. Adicione fotos, vídeo e descreva bem o produto.',
    image: null,
    tip: '💡 Anúncios com fotos de qualidade recebem até 3x mais interesse!',
  },
  {
    emoji: '🔍',
    title: 'Encontre o que quer',
    desc: 'Use a busca inteligente — digite "moto", "iphone", "carro" e encontraremos todos os anúncios relacionados, mesmo que o título seja "Titan 150" ou "BMW F800".',
    image: null,
    tip: '💡 A busca entende marcas e modelos automaticamente!',
  },
  {
    emoji: '❤️',
    title: 'Curta e negocie',
    desc: 'Curtiu um item? Clique em "Trocar" e negocie direto com o proprietário. O Match IA e o Match IA Avançado são exclusivos para quem já tem pelo menos um anúncio de troca na plataforma.',
    image: null,
    tip: '💡 Quanto mais anúncios você tiver, mais chances de match!',
  },
  {
    emoji: '💬',
    title: 'Converse pelo Chat',
    desc: 'Ao clicar em "Mensagem" num anúncio, abre um chat direto com o anunciante. Combine os detalhes da troca por lá.',
    image: null,
    tip: '💡 Você recebe notificação quando chegar mensagem, mesmo com o site fechado!',
  },
  {
    emoji: '🤖',
    title: 'Match IA',
    desc: 'O Match IA analisa seus anúncios e encontra as melhores combinações de troca — pelo valor do produto e pela distância até você.',
    image: null,
    tip: '💡 O Match IA Avançado busca em um raio de 5km. Ótimo para trocas presenciais!',
  },
  {
    emoji: '🎁',
    title: 'Dar, para receber!',
    desc: 'Empresas que fazem doações no Papo de Alunos transformam cada item gratuito em um lead presencial. Uma barbearia que oferece 10 cortes gratuitos garante 10 clientes na loja — e quando o cliente chega, a chance de contratar também barba, progressiva ou outros serviços é altíssima. Raramente alguém vai só para o corte! Isso vale para qualquer negócio: restaurante, academia, clínica, loja. Cada doação é uma visita real, um cliente real, uma venda real.',
    image: null,
    tip: '💡 Clientes presenciais convertem muito mais. Use doações como sua estratégia de aquisição de clientes!',
  },
  {
    emoji: '⭐',
    title: 'Avalie as trocas',
    desc: 'Após cada troca concluída, avalie a experiência. Usuários bem avaliados têm mais credibilidade e recebem mais propostas.',
    image: null,
    tip: '💡 Sua reputação é pública. Quanto mais estrelas, mais confiança!',
  },
  {
    emoji: '🚀',
    title: 'Tudo pronto!',
    desc: `Você está pronto para começar, @__USERNAME__! Crie seu primeiro anúncio e comece a trocar agora mesmo. Boa sorte! 🎉`,
    image: null,
    tip: null,
  },
];

export function OnboardingGuide({ username, onClose }: OnboardingGuideProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const desc = current.desc.replace('__USERNAME__', username);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden">
        {/* Header colorido */}
        <div className="bg-gradient-to-r from-purple-600 to-orange-500 px-6 pt-6 pb-10 text-white text-center relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <div className="text-6xl mb-3">{current.emoji}</div>
          <h2 className="text-xl font-bold">{current.title}</h2>
        </div>

        {/* Bolha de progresso */}
        <div className="flex justify-center gap-1.5 -mt-3 mb-1 relative z-10">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-purple-600' : 'w-2 bg-gray-300'}`}
            />
          ))}
        </div>

        {/* Conteúdo */}
        <div className="px-6 py-5">
          <p className="text-gray-700 text-sm leading-relaxed text-center mb-4">{desc}</p>

          {current.tip && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3 text-xs text-purple-700 text-center">
              {current.tip}
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="px-6 pb-6 flex gap-3">
          {!isFirst && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-gray-100 text-gray-600 font-semibold text-sm hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
          )}
          <button
            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
            className="flex-1 flex items-center justify-center gap-1 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-orange-500 text-white font-bold text-sm hover:opacity-90 transition-opacity"
          >
            {isLast ? '🚀 Começar!' : <>Próximo <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>

        {/* Pular */}
        {!isLast && (
          <button onClick={onClose} className="w-full pb-4 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Pular guia
          </button>
        )}
      </div>
    </div>
  );
}
