import { useState } from 'react';
import { Check } from 'lucide-react';
import { useLang } from '../i18n';

interface PricingSectionProps {
  trialDaysLeft?: number;
  advancedTrialDaysLeft?: number;
  userPlan?: 'free' | 'pro' | 'plus';
  userVerificado?: boolean;
  onVerificar?: () => void;
}

export function PricingSection({ userVerificado = true, onVerificar }: PricingSectionProps) {
  const { AT } = useLang();
  const [gratuito, setGratuito] = useState<string | null>(null);

  const plans = [
    {
      name: 'Free',
      realPrice: null,
      desc: AT.pricingFreeDesc,
      color: 'border-gray-200',
      badge: null,
      buttonClass: 'border-2 border-purple-600 text-purple-600 hover:bg-purple-50',
      features: AT.pricingFreeFeatures,
      isPaid: false,
    },
    {
      name: 'Pro',
      realPrice: 'R$9,90',
      desc: AT.pricingProDesc,
      color: 'border-purple-500 shadow-xl scale-105',
      badge: AT.pricingPopular,
      buttonClass: 'bg-purple-600 text-white hover:bg-purple-700',
      features: AT.pricingProFeatures,
      isPaid: true,
    },
    {
      name: 'Plus',
      realPrice: 'R$24,90',
      desc: AT.pricingPlusDesc,
      color: 'border-orange-400',
      badge: AT.pricingPremium,
      buttonClass: 'bg-orange-500 text-white hover:bg-orange-600',
      features: AT.pricingPlusFeatures,
      isPaid: true,
    },
  ];

  return (
    <section className="py-16 px-4 about-section">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">
            {AT.pricingTitle} <span className="text-purple-600">TROK</span><span className="text-orange-500">VIBE</span>
          </h2>
          <p className="text-gray-600">{AT.pricingSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {plans.map((plan) => (
            <div key={plan.name} className={`border-2 rounded-3xl p-8 ${plan.color} transition-all`}>
              {plan.badge && (
                <div className="bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full inline-block mb-4">
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

              {!userVerificado ? (
                <button
                  onClick={onVerificar}
                  className="w-full py-3 rounded-2xl font-bold bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                >
                  {AT.pricingSendDocs}
                </button>
              ) : plan.isPaid ? (
                <>
                  <button
                    onClick={() => setGratuito(gratuito === plan.name ? null : plan.name)}
                    className={`w-full py-3 rounded-2xl font-bold transition-colors ${plan.buttonClass}`}
                  >
                    {AT.pricingSubscribe(plan.name)}
                  </button>
                  {gratuito === plan.name && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-center">
                      <p className="text-green-700 font-semibold text-sm">{AT.pricingFreeMessage}</p>
                    </div>
                  )}
                </>
              ) : (
                <button className={`w-full py-3 rounded-2xl font-bold transition-colors ${plan.buttonClass}`}>
                  {AT.pricingStartFree}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
