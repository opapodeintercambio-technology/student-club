import { Mail, MessageCircle, MapPin } from 'lucide-react';
import { useState } from 'react';
import { useLang } from '../i18n';

export function ContactSection() {
  const { AT } = useLang();
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  const contactItems = [
    { icon: MapPin,        label: AT.contactAddress, value: 'Curitiba, PR — Brasil',  href: null },
    { icon: Mail,          label: AT.contactEmail,   value: 'suporte@studentclub.com.br', href: 'mailto:suporte@studentclub.com.br' },
    { icon: MessageCircle, label: AT.contactSupport, value: AT.contactSupportHours,   href: null },
  ];

  return (
    <section className="py-16 px-4 about-section">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">
            {AT.contactTitle} <span className="text-purple-600">{AT.contactTitleHighlight}</span>
          </h2>
          <p className="text-gray-600">{AT.contactSubtitle}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div>
            <div className="space-y-6">
              {contactItems.map(({ icon: Icon, label, value, href }) => (
                <div key={label} className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Icon className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{label}</p>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-purple-700 hover:underline">
                        {value}
                      </a>
                    ) : (
                      <p className="font-semibold text-gray-800">{value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {sent ? (
              <div className="bg-green-50 rounded-3xl p-10 text-center">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-xl font-bold text-green-700">{AT.contactSent}</h3>
                <p className="text-green-600 mt-2">{AT.contactSentDesc}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  placeholder={AT.contactNamePlaceholder}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-5 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none"
                />
                <input
                  type="email"
                  placeholder={AT.contactEmailPlaceholder}
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                  className="w-full px-5 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none"
                />
                <textarea
                  placeholder={AT.contactMessagePlaceholder}
                  value={form.message}
                  onChange={e => setForm({ ...form, message: e.target.value })}
                  required
                  rows={5}
                  className="w-full px-5 py-3 border-2 border-gray-200 rounded-2xl focus:border-purple-500 outline-none resize-none"
                />
                <button
                  type="submit"
                  className="w-full bg-purple-600 text-white py-3 rounded-2xl font-bold hover:bg-purple-700 transition-colors"
                >
                  {AT.contactSendBtn}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
