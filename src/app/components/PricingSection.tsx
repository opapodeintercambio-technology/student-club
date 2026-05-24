import { useState } from 'react';
import { Check } from 'lucide-react';
import { useLang } from '../i18n';

interface PricingSectionProps {
  /** Props legadas mantidas pra compatibilidade com chamadas existentes em App.tsx — não são mais usadas. */
  trialDaysLeft?: number;
  advancedTrialDaysLeft?: number;
  userPlan?: 'free' | 'pro' | 'plus';
  userVerificado?: boolean;
  onVerificar?: () => void;
}

export function PricingSection(_props: PricingSectionProps = {}) {
  const { AT } = useLang();
  const [gratuito, setGratuito] = useState<string | null>(null);

  // Botoes dos 3 planos sao todos verde (cor da marca Student Club: #1e714a)
  // pra manter contraste em dark mode. Antes: Free outline-roxo (invisivel
  // no dark), Pro roxo-cheio, Plus laranja-cheio — user pediu uniformizar.
  const greenBtnClass = 'bg-emerald-700 text-white hover:bg-emerald-800';

  const plans = [
    {
      name: 'Free',
      realPrice: null,
      desc: AT.pricingFreeDesc,
      color: 'border-gray-200',
      badge: null,
      buttonClass: greenBtnClass,
      features: AT.pricingFreeFeatures,
      isPaid: false,
    },
    {
      name: 'Pro',
      realPrice: 'R$9,90',
      desc: AT.pricingProDesc,
      color: 'border-emerald-600 shadow-xl scale-105',
      badge: AT.pricingPopular,
      buttonClass: greenBtnClass,
      features: AT.pricingProFeatures,
      isPaid: true,
    },
    {
      name: 'Plus',
      realPrice: 'R$24,90',
      desc: AT.pricingPlusDesc,
      color: 'border-emerald-400',
      badge: AT.pricingPremium,
      buttonClass: greenBtnClass,
      features: AT.pricingPlusFeatures,
      isPaid: true,
    },
  ];

  return (
    <section className="py-16 px-4 about-section">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">
            {AT.pricingTitle} <span style={{ color: '#1e714a' }}>Student</span> <span style={{ color: '#f59e0b' }}>Club</span>
          </h2>
          <p className="text-gray-600">{AT.pricingSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {plans.map((plan) => (
            <div key={plan.name} className={`border-2 rounded-3xl p-8 ${plan.color} transition-all`}>
              {plan.badge && (
                <div className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
                  {plan.badge}
                </div>
              )}
              <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
              <p className="text-gray-500 text-sm mb-4">{plan.desc}</p>

              <div className="mb-6">
                {plan.isPaid ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-2xl font-bold text-gray-300 line-through">
                      {plan.realPrice}<span className="text-sm font-normal">{AT.pricingPeriod}</span>
                    </span>
                    <div className="flex items-end gap-1">
                      <span className="text-4xl font-bold text-green-600">R$0</span>
                      <span className="text-gray-500 text-sm mb-1">{AT.pricingPeriod}</span>
                    </div>
                    <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full w-fit">
                      {AT.pricingFreeForever}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="text-4xl font-bold">R$0</span>
                    <span className="text-gray-500 text-sm">{AT.pricingPeriod}</span>
                  </div>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 flex-shrink-0 text-green-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setGratuito(gratuito === plan.name ? null : plan.name)}
                className={`w-full py-3 rounded-2xl font-bold transition-colors ${plan.buttonClass}`}
              >
                {plan.isPaid ? AT.pricingSubscribe(plan.name) : AT.pricingStartFree}
              </button>
              {gratuito === plan.name && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-center">
                  <p className="text-green-700 font-semibold text-sm">{AT.pricingFreeMessage}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
