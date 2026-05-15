import { Heart, MapPin, Handshake, Euro } from 'lucide-react';
import { useLang } from '../i18n';

export function AboutSection() {
  const { AT } = useLang();

  const stats = [
    { icon: Heart,     title: AT.aboutStat1Title, desc: AT.aboutStat1Desc, color: 'bg-red-100 text-red-600' },
    { icon: MapPin,    title: AT.aboutStat2Title, desc: AT.aboutStat2Desc, color: 'bg-purple-100 text-purple-600' },
    { icon: Handshake, title: AT.aboutStat3Title, desc: AT.aboutStat3Desc, color: 'bg-green-100 text-green-600' },
    { icon: Euro,      title: AT.aboutStat4Title, desc: AT.aboutStat4Desc, color: 'bg-yellow-100 text-yellow-700' },
  ];

  return (
    <section className="py-16 px-4 about-section">
      <div className="max-w-[1400px] mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">
            {AT.aboutTitle} <span className="text-purple-600">{AT.aboutTitleHighlight}</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="glass p-8" style={{borderRadius:24}}>
              <p className="text-gray-700 leading-relaxed mb-6" dangerouslySetInnerHTML={{ __html: AT.aboutText1 }} />
              <p className="text-gray-700 leading-relaxed mb-6" dangerouslySetInnerHTML={{ __html: AT.aboutText2 }} />
              <p className="text-gray-700 leading-relaxed mb-6" dangerouslySetInnerHTML={{ __html: AT.aboutText3 }} />
              <p className="text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: AT.aboutText4 }} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {stats.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="glass p-6 flex items-center gap-4" style={{borderRadius:18}}>
                <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{title}</h3>
                  <p className="text-sm text-gray-600">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
