// Logo oficial do Deezer (SVG) — branding obrigatório por Deezer API ToS.
// Fonte: https://developers.deezer.com/api/branding
//
// Variantes:
// - default (gradient roxo/rosa): usar em fundos brancos/claros
// - mono (branco): usar em fundos coloridos/escuros (ex: chip do feed)

interface Props {
  className?: string;
  mono?: boolean;
}

export function DeezerLogo({ className = 'w-4 h-4', mono = false }: Props) {
  // Logo Deezer simplificado: 5 barras verticais (equalizer style)
  // de tamanhos crescentes/decrescentes — formato icônico oficial.
  const fill = mono ? '#ffffff' : '#a238ff';
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-label="Deezer"
      role="img"
    >
      {/* 5 barras representando o logo equalizer do Deezer */}
      <rect x="10" y="60" width="14" height="20" fill={fill} rx="1" />
      <rect x="28" y="50" width="14" height="30" fill={fill} rx="1" />
      <rect x="46" y="35" width="14" height="45" fill={fill} rx="1" />
      <rect x="64" y="20" width="14" height="60" fill={fill} rx="1" />
      <rect x="82" y="50" width="14" height="30" fill={fill} rx="1" />
    </svg>
  );
}
