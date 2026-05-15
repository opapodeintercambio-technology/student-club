// Conteúdo curado de cada sub-aba de "Informações". Cards renderizados acima
// dos PDFs / vídeos enviados pelo admin.

export interface InfoLink {
  label: string;
  url: string;
  badge?: string;       // ex: "App Store", "Site oficial"
}

export interface InfoCard {
  title: string;
  emoji?: string;
  body?: string;
  bullets?: string[];
  links?: InfoLink[];
  highlight?: 'tip' | 'warn' | 'info';
}

export interface InfoContent {
  intro: string;
  cards: InfoCard[];
}

export type InfoSubKey =
  | 'aeroporto'
  | 'acomodacoes'
  | 'seguro'
  | 'curriculo'
  | 'empregos'
  | 'cursos'
  | 'roteiro';

export const INFO_CONTENT: Record<InfoSubKey, InfoContent> = {

  // ─── AEROPORTO ───────────────────────────────────────────────────────
  aeroporto: {
    intro:
      'O dia do embarque é o mais ansioso da jornada. Aqui está tudo que você precisa saber pra chegar tranquilo no aeroporto, despachar suas malas, passar pela imigração e pousar na Europa sem nenhum susto.',
    cards: [
      {
        emoji: '🧳',
        title: 'Antes de sair de casa — checklist',
        bullets: [
          'Passaporte válido por pelo menos 6 meses, com a página do visto (se aplicável).',
          'Carta de aceitação da escola impressa + cópia digital.',
          'Comprovação financeira (€6.665 para Irlanda) impressa.',
          'Seguro saúde europeu impresso (apólice + telefone 24h).',
          'Endereço da acomodação anotado (a imigração pode pedir).',
          'Adaptador de tomada europeu — não esqueça, custa o dobro lá.',
          'Caneta preta pra preencher os cartões de imigração no voo.',
        ],
      },
      {
        emoji: '⚖️',
        title: 'Regras de bagagem — o que pode ir',
        body:
          'A regra muda por companhia, mas a maioria dos voos internacionais Brasil ↔ Europa segue o padrão abaixo. Sempre confirme no e-ticket.',
        bullets: [
          'Despachada: 1 mala de até 23 kg (Latam, TAP, KLM). Algumas low-cost cobram à parte.',
          'De mão: 1 mochila ou mala pequena de até 8 a 10 kg + 1 item pessoal.',
          'Líquidos no carry-on: frascos de até 100 ml em saco transparente de 1 L.',
          'Eletrônicos (notebook, tablet): tira da mochila no raio-X.',
          'Bateria de lítio (power bank): SEMPRE na bagagem de mão, nunca na despachada.',
          'Comida: sem produtos de origem animal (carne, queijo) na União Europeia.',
        ],
        highlight: 'tip',
      },
      {
        emoji: '🛫',
        title: 'No aeroporto de saída (Brasil)',
        bullets: [
          'Chegue 3 horas antes do voo internacional.',
          'Faça o check-in no balcão da companhia ou pelo app — escolhe o assento.',
          'Despache a mala e guarde o ticket que vão grudar nela (precisa em caso de extravio).',
          'Passa pela Polícia Federal pra carimbar a saída do Brasil.',
          'Raio-X de segurança: tira casaco, cinto, eletrônicos e líquidos da mochila.',
          'Olha o painel pra confirmar o portão de embarque (muda de última hora).',
        ],
      },
      {
        emoji: '🛬',
        title: 'Imigração europeia — o que esperar',
        body:
          'Você passa pela imigração na PRIMEIRA cidade europeia onde pousar (mesmo que seja só conexão). Eles vão fazer 3 a 5 perguntas básicas.',
        bullets: [
          '"Qual o motivo da sua viagem?" — responda: "estudar inglês".',
          '"Quanto tempo vai ficar?" — exato como está no visto/carta.',
          '"Tem dinheiro/seguro?" — mostre a comprovação financeira e o seguro.',
          '"Onde vai ficar?" — mostre o endereço da acomodação.',
          'Em alguns casos pedem para mostrar a passagem de volta.',
          'Mantenha a calma, responda curto, sem mentir. Se você tem todos os documentos, é tranquilo.',
        ],
        highlight: 'info',
      },
      {
        emoji: '🇮🇪',
        title: 'GNIB / IRP — chegou na Irlanda',
        body:
          'Em até 90 dias após chegar, você precisa registrar sua identidade no Burgh Quay (Dublin) ou no Garda local. Agendamento online no site da Burgh Quay Registration Office.',
        bullets: [
          'Custa €300 para o IRP (Irish Residence Permit).',
          'Leva 5 a 10 dias úteis para ficar pronto.',
          'É o seu "RG" enquanto morar na Irlanda. Não perca.',
        ],
        links: [
          { label: 'Burgh Quay (agendamento)', url: 'https://burghquayregistrationoffice.inis.gov.ie/', badge: 'Site oficial' },
        ],
      },
      {
        emoji: '🚨',
        title: 'Bagagem extraviada ou atrasada',
        bullets: [
          'Vá direto ao balcão "Lost & Found" do aeroporto de chegada (não saia sem isso).',
          'Apresente o ticket que estava grudado no embarque do Brasil.',
          'Preencha o formulário com endereço de entrega.',
          'A companhia entrega em até 5 dias na sua acomodação, sem custo.',
          'Guarde o número do PIR (Property Irregularity Report).',
        ],
        highlight: 'warn',
      },
    ],
  },

  // ─── ACOMODAÇÕES ─────────────────────────────────────────────────────
  acomodacoes: {
    intro:
      'Encontrar acomodação na Europa pode ser desafiador, especialmente em Dublin, Londres e Berlim. Use esses apps e sites confiáveis. Comece a procurar com pelo menos 30 dias de antecedência.',
    cards: [
      {
        emoji: '🏠',
        title: 'Daft.ie — o maior portal da Irlanda',
        body:
          'O site #1 para alugar na Irlanda. Tem casas, apartamentos, quartos compartilhados (house share) e residências estudantis. Maioria das ofertas em Dublin, Cork, Galway, Limerick.',
        links: [
          { label: 'Abrir o Daft.ie', url: 'https://www.daft.ie/', badge: 'Site oficial' },
          { label: 'App na App Store', url: 'https://apps.apple.com/ie/app/daft-ie/id360381914', badge: 'iOS' },
          { label: 'App no Google Play', url: 'https://play.google.com/store/apps/details?id=ie.daft.daftie', badge: 'Android' },
        ],
      },
      {
        emoji: '🏘️',
        title: 'Spotahome — sem visita, contrato online',
        body:
          'Você aluga sem precisar visitar. A Spotahome envia um corretor pra fotografar e filmar antes de listar. Bom para quem ainda está no Brasil. Foco em Madrid, Barcelona, Lisboa, Berlim, Dublin, Roma.',
        links: [
          { label: 'Abrir Spotahome', url: 'https://www.spotahome.com/', badge: 'Site oficial' },
          { label: 'App iOS', url: 'https://apps.apple.com/app/spotahome/id1107717023', badge: 'iOS' },
          { label: 'App Android', url: 'https://play.google.com/store/apps/details?id=com.spotahome.spotahome', badge: 'Android' },
        ],
      },
      {
        emoji: '🌍',
        title: 'HousingAnywhere — internacional, focado em estudante',
        body:
          'Marketplace global de aluguel de média e longa duração para estudantes e profissionais. Tem o "Tenant Protection" que segura o pagamento até você confirmar que tudo está OK.',
        links: [
          { label: 'Abrir HousingAnywhere', url: 'https://housinganywhere.com/', badge: 'Site oficial' },
          { label: 'App iOS', url: 'https://apps.apple.com/app/housinganywhere/id1493361443', badge: 'iOS' },
          { label: 'App Android', url: 'https://play.google.com/store/apps/details?id=com.housinganywhere', badge: 'Android' },
        ],
      },
      {
        emoji: '🎓',
        title: 'Uniplaces — quartos para estudantes',
        body:
          'Especializado em estudantes universitários. Apartamentos compartilhados e quartos individuais em Lisboa, Madrid, Barcelona, Roma, Berlim. Reservas verificadas.',
        links: [
          { label: 'Abrir Uniplaces', url: 'https://www.uniplaces.com/', badge: 'Site oficial' },
        ],
      },
      {
        emoji: '✏️',
        title: 'Erasmusu — comunidade Erasmus / intercâmbio',
        body:
          'Site comunitário com aluguel + dicas + grupo de outros intercambistas. Ideal pra fazer amigos antes mesmo de embarcar.',
        links: [
          { label: 'Abrir Erasmusu', url: 'https://erasmusu.com/', badge: 'Site oficial' },
        ],
      },
      {
        emoji: '👥',
        title: 'Facebook Groups (não subestime!)',
        body:
          'A maior parte dos aluguéis em Dublin e Londres vai parar em grupos do Facebook ANTES de chegar nos sites. Procure por:',
        bullets: [
          '"Brasileiros em Dublin / Cork / Galway"',
          '"Rent a room Dublin"',
          '"Aluguel Lisboa / Porto"',
          '"Wohnung Berlin Mitte" (Alemanha)',
          'Sempre cheque o perfil do anunciante e faça vídeo-chamada antes de pagar.',
        ],
        highlight: 'tip',
      },
      {
        emoji: '🏨',
        title: 'Hostel para os primeiros dias',
        body:
          'Reserva um hostel pra 5-7 noites enquanto procura. Você ganha tempo pra visitar lugares de verdade.',
        links: [
          { label: 'Hostelworld', url: 'https://www.hostelworld.com/', badge: 'Site' },
          { label: 'Booking', url: 'https://www.booking.com/', badge: 'Site' },
        ],
      },
      {
        emoji: '⚠️',
        title: 'Cuidado com golpes',
        bullets: [
          'NUNCA pague antes de ver o lugar pessoalmente ou por vídeo-chamada.',
          'Desconfie de preço muito abaixo do mercado.',
          'Desconfie de quem só conversa por e-mail e não atende ligações.',
          'Não envie dinheiro por Western Union ou cartão pré-pago. Use transferência bancária com nota fiscal/recibo.',
          'Em Dublin, aluguel médio de quarto: €700-€1.100. Apartamento inteiro: €1.800+.',
        ],
        highlight: 'warn',
      },
    ],
  },

  // ─── SEGURO SAÚDE ────────────────────────────────────────────────────
  seguro: {
    intro:
      'Na Europa, ter seguro saúde é obrigatório para o visto. Na Irlanda, o seguro é exigido para a renovação do visto e custa em média €120-€220/ano. Aqui está tudo sobre como funciona.',
    cards: [
      {
        emoji: '🏥',
        title: 'Como funciona o sistema de saúde europeu',
        body:
          'A maioria dos países da União Europeia tem sistema público gratuito (similar ao SUS) + sistema privado. Você só consegue acesso ao público se for residente legal e tiver número de identificação local.',
        bullets: [
          'Irlanda: HSE (público) + planos privados (VHI, Laya, Irish Life Health).',
          'Reino Unido: NHS (público, exige NHS Number) + Bupa, AXA (privados).',
          'Portugal: SNS (público, com Cartão de Utente) + Médis, Multicare.',
          'Espanha: Sistema Nacional de Salud + Sanitas, Adeslas, DKV.',
          'Alemanha: Krankenversicherung obrigatório (TK, AOK públicos / Allianz privados).',
        ],
      },
      {
        emoji: '🎫',
        title: 'O que o seguro cobre obrigatoriamente',
        body:
          'Para o visto, o seguro precisa ter pelo menos essas coberturas:',
        bullets: [
          'Despesas médicas de emergência (mínimo €30.000 na Irlanda).',
          'Hospitalização e cirurgia.',
          'Repatriação sanitária (transporte de volta ao Brasil em caso grave).',
          'Repatriação funerária.',
          'Cobertura para toda a duração do curso (8 meses no plano padrão Irlanda).',
        ],
      },
      {
        emoji: '💉',
        title: 'Seguros brasileiros que servem para o visto',
        body:
          'Vários planos brasileiros são aceitos pelo consulado irlandês. Os mais usados pelos alunos do Papo:',
        bullets: [
          'Affinity — €145/ano com cobertura completa (mais usado).',
          'Travel Ace — €165/ano.',
          'Real Seguro Viagem — €130/ano.',
          'AIG / GTA — para quem quer cobertura premium.',
        ],
        highlight: 'tip',
      },
      {
        emoji: '🇮🇪',
        title: 'Saúde na Irlanda — passos práticos',
        bullets: [
          'Ao chegar, registre seu seguro brasileiro com o telefone 24h salvo no celular.',
          'Procure um GP (General Practitioner) próximo da sua casa pra ter cadastro.',
          'Consulta com GP custa €50-€60 (sem PPS Number) ou subsidiada se for residente.',
          'Pronto-socorro público: €100 sem encaminhamento de GP.',
          'Receitas médicas: pague na farmácia (Boots, McCabes). Antibiótico €15-25.',
          'EHIC — depois de 1 ano com PPS Number, você pode pedir o cartão europeu de saúde.',
        ],
      },
      {
        emoji: '☎️',
        title: 'O que fazer numa emergência',
        bullets: [
          'Ligue 112 (Europa toda) — atendem em inglês, mandam ambulância.',
          'Na Irlanda: 999 também funciona.',
          'Ligue PRIMEIRO o telefone 24h do seu seguro brasileiro — eles autorizam o atendimento e indicam hospital coberto.',
          'Guarde TODA nota fiscal e relatório médico para reembolso.',
        ],
        highlight: 'warn',
      },
    ],
  },

  // ─── CURRÍCULO ───────────────────────────────────────────────────────
  curriculo: {
    intro:
      'O currículo europeu é bem diferente do brasileiro. É mais enxuto, sem foto na maioria dos países, e bem específico para a vaga. Aqui estão as regras por país e modelos que funcionam.',
    cards: [
      {
        emoji: '📝',
        title: 'Regras gerais do CV europeu',
        bullets: [
          'Máximo 2 páginas (idealmente 1).',
          'Foto: SIM em Alemanha, França, Itália. NÃO em Irlanda, Reino Unido, Holanda.',
          'Em inglês quando o país falar inglês ou for multinacional. Em alemão/espanhol/francês quando for vaga local.',
          'Comece com "Personal Statement" (3-4 linhas resumindo quem você é).',
          'Habilidades em ordem decrescente de relevância para a vaga.',
          'NÃO coloque RG, CPF, estado civil, idade ou religião (proibido por lei em muitos países).',
        ],
      },
      {
        emoji: '🇮🇪',
        title: 'CV irlandês — o padrão',
        body:
          'A Irlanda segue o padrão UK. Foco em experiência, sem foto, conciso.',
        bullets: [
          'Nome + telefone irlandês (assim que você tiver) + e-mail + LinkedIn.',
          'Personal Statement no topo: "Hardworking, customer-oriented, with experience in..."',
          'Work Experience em ordem reversa (mais recente primeiro).',
          'Education: idiomas falados (português nativo, inglês intermediário, etc).',
          'Skills: 5 a 8 skills relevantes.',
          'References: "Available on request".',
        ],
      },
      {
        emoji: '🇬🇧',
        title: 'CV britânico — exemplo',
        bullets: [
          'Igual ao irlandês mas com endereço (mesmo que seja temporário).',
          'Use "CV" no topo, fonte Calibri ou Arial 10-11.',
          'Cover Letter SEMPRE acompanha (1 página separada).',
          'Pergunte sobre "Right to Work" — diga que tem visto de estudante com permissão de 20h/semana.',
        ],
      },
      {
        emoji: '🇪🇺',
        title: 'Europass — padrão europeu oficial',
        body:
          'O Europass é o currículo oficial da União Europeia. Aceito por todos os países. Gera o PDF online de graça.',
        links: [
          { label: 'Criar Europass online', url: 'https://europa.eu/europass/en', badge: 'Site oficial UE' },
        ],
      },
      {
        emoji: '🇩🇪',
        title: 'CV alemão (Lebenslauf)',
        body:
          'Mais formal que os outros. Foto profissional NO TOPO (sorriso discreto, fundo neutro).',
        bullets: [
          'Dados pessoais: nome, endereço, telefone, e-mail, data de nascimento.',
          'Cronologia REVERSA: educação → experiência → idiomas → habilidades.',
          'Assinado e datado no final ("Datum, Unterschrift").',
          'Tabular, sem floreios. Em alemão se possível.',
        ],
      },
      {
        emoji: '🛠️',
        title: 'Ferramentas gratuitas pra criar',
        links: [
          { label: 'Canva — modelos prontos', url: 'https://www.canva.com/curriculum/', badge: 'Free' },
          { label: 'Europass', url: 'https://europa.eu/europass/en/create-europass-cv', badge: 'UE' },
          { label: 'Novoresume', url: 'https://novoresume.com/', badge: 'Free + Pro' },
          { label: 'Zety', url: 'https://zety.com/', badge: 'Free + Pro' },
        ],
        highlight: 'tip',
      },
    ],
  },

  // ─── EMPREGOS ────────────────────────────────────────────────────────
  empregos: {
    intro:
      'Você pode trabalhar legalmente até 20h/semana durante o curso e 40h nas férias oficiais. As primeiras vagas geralmente são em café, restaurante, limpeza ou retail. Com inglês intermediário você consegue. Aqui está onde achar.',
    cards: [
      {
        emoji: '🔎',
        title: 'Sites e apps de busca (Irlanda)',
        body:
          'Os principais portais. Crie perfil em todos. Atualize semanalmente.',
        links: [
          { label: 'Indeed Ireland', url: 'https://ie.indeed.com/', badge: 'Site oficial' },
          { label: 'IrishJobs', url: 'https://www.irishjobs.ie/', badge: 'Site' },
          { label: 'Jobs.ie', url: 'https://www.jobs.ie/', badge: 'Site' },
          { label: 'Recruit Ireland', url: 'https://www.recruitireland.com/', badge: 'Site' },
          { label: 'LinkedIn', url: 'https://www.linkedin.com/jobs/', badge: 'Global' },
        ],
      },
      {
        emoji: '🇬🇧',
        title: 'Reino Unido',
        links: [
          { label: 'Reed.co.uk', url: 'https://www.reed.co.uk/', badge: 'Site' },
          { label: 'TotalJobs', url: 'https://www.totaljobs.com/', badge: 'Site' },
          { label: 'CV-Library', url: 'https://www.cv-library.co.uk/', badge: 'Site' },
        ],
      },
      {
        emoji: '🇪🇸',
        title: 'Espanha',
        links: [
          { label: 'InfoJobs', url: 'https://www.infojobs.net/', badge: 'Site' },
          { label: 'JobToday', url: 'https://www.jobtoday.com/', badge: 'App vagas hora' },
        ],
      },
      {
        emoji: '🧹',
        title: 'Agências de limpeza (cleaner / housekeeper)',
        body:
          'Vaga mais fácil de conseguir nas primeiras semanas. Pagamento por hora, geralmente €13-€16/h em Dublin.',
        bullets: [
          'Bidvest Noonan — uma das maiores da Irlanda.',
          'Mrs. Buckley\'s — limpeza de casa.',
          'Grosvenor Services — limpeza comercial.',
          'OCS Group — multinacional, várias funções.',
          'Procure por "cleaner Dublin" no Indeed — tem dezenas por dia.',
        ],
      },
      {
        emoji: '☕',
        title: 'Café & restaurante (barista, waiter, kitchen porter)',
        bullets: [
          'Vá com 15 cópias do CV no centro da cidade e entregue em mão.',
          'Comece pelos cafés independentes (não Starbucks ou Costa — esses pedem inglês fluente).',
          'Domínio do inglês cresce na velocidade da luz nesse tipo de função.',
          'Salário Dublin: €13,50/h (mínimo) + gorjetas (€20-50/turno).',
        ],
        highlight: 'tip',
      },
      {
        emoji: '🛒',
        title: 'Retail (lojas, supermercados)',
        bullets: [
          'Tesco, Dunnes Stores, Lidl, Aldi sempre estão contratando.',
          'Black Friday, Natal e Janeiro são as melhores épocas pra começar.',
          'Penneys, Zara, H&M abrem 200+ vagas em Dublin no Natal.',
        ],
      },
      {
        emoji: '📦',
        title: 'Delivery (Deliveroo, Just Eat, Uber Eats)',
        bullets: [
          'Bicicleta é o jeito mais comum. Não precisa CNH.',
          'Renda média €15-20/h (mais nos fins de semana).',
          'Você é autônomo (self-employed) — precisa declarar imposto.',
        ],
      },
      {
        emoji: '🏛️',
        title: 'INTREO — agência pública de emprego',
        body:
          'O órgão oficial do governo irlandês para empregos. Atende presencialmente em Dublin e cidades grandes. Eles também oferecem cursos profissionais (ver aba "Cursos Gratuitos").',
        links: [
          { label: 'Site INTREO', url: 'https://www.gov.ie/en/service/welcome-to-intreo/', badge: 'Site oficial' },
        ],
      },
      {
        emoji: '✅',
        title: 'Dicas pra conseguir mais rápido',
        bullets: [
          'Tenha PPS Number — sem ele, ninguém te contrata oficialmente.',
          'Banco aberto: conta com IBAN irlandês (Revolut funciona temporariamente).',
          'CV impresso + sorriso + chegando perguntando "Are you hiring?".',
          'Mande mensagens nos grupos de Facebook "Brasileiros em Dublin Empregos".',
          'Tenha referências — peça em qualquer trampo antigo no Brasil.',
        ],
        highlight: 'tip',
      },
    ],
  },

  // ─── CURSOS GRATUITOS ────────────────────────────────────────────────
  cursos: {
    intro:
      'A Irlanda e a Europa têm várias opções de cursos profissionalizantes GRATUITOS para residentes (mesmo com visto de estudante). Eles geram certificado oficial e abrem portas em barista, hotelaria, cuidados infantis e mais.',
    cards: [
      {
        emoji: '🏛️',
        title: 'SOLAS / ETB — cursos profissionais gratuitos (Irlanda)',
        body:
          'Education and Training Boards (ETBs) oferecem cursos técnicos oficiais gratuitos para residentes (mesmo com PPS de estudante).',
        bullets: [
          'Barista course — em geral 4 semanas, gera certificado QQI.',
          'Hairdressing / Hairstylist — meses, ideal pra quem já cortava cabelo.',
          'Childcare (Cuidados Infantis) — exigido por creches, salário sobe.',
          'Cleaning & Hygiene — certificação oficial, ajuda a entrar em hotéis bons.',
          'Bartending — coquetel, beer, vinhos.',
          'Forklift / Empilhadeira — emprego em armazém, paga muito bem.',
        ],
        links: [
          { label: 'Encontrar curso SOLAS', url: 'https://www.fetchcourses.ie/', badge: 'Site oficial' },
          { label: 'City of Dublin ETB', url: 'https://www.cdetb.ie/', badge: 'Dublin' },
        ],
      },
      {
        emoji: '🎓',
        title: 'Alison.com — plataforma gratuita de cursos',
        body:
          'Site irlandês com 4.000+ cursos online com certificado gratuito. Recomenda fortemente fazer Barista, Customer Service e Hospitality Basics.',
        links: [
          { label: 'Alison.com', url: 'https://alison.com/', badge: 'Free' },
        ],
        highlight: 'tip',
      },
      {
        emoji: '📚',
        title: 'Coursera — cursos universitários gratuitos',
        body:
          'Cursos de universidades top (Stanford, Yale, IBM) em modo "audit" (assistir grátis). Excelente pra inglês acadêmico + skills profissionais. Certificado pago, mas o conteúdo é livre.',
        links: [
          { label: 'Coursera', url: 'https://www.coursera.org/', badge: 'Free audit' },
        ],
      },
      {
        emoji: '🎒',
        title: 'edX — cursos do MIT e Harvard',
        links: [
          { label: 'edX', url: 'https://www.edx.org/', badge: 'Free' },
        ],
      },
      {
        emoji: '☕',
        title: 'Barista Skills Foundation — SCA (Specialty Coffee)',
        body:
          'Curso de barista internacionalmente reconhecido. Tem versões pagas, mas a SCA tem material gratuito de leitura e os ETBs irlandeses dão o curso completo grátis.',
        links: [
          { label: 'SCA (material grátis)', url: 'https://sca.coffee/research', badge: 'Site' },
        ],
      },
      {
        emoji: '🧹',
        title: 'Housekeeping & Hospitality (Irlanda)',
        body:
          'Vários hotéis grandes em Dublin (The Westbury, The Shelbourne, Marriott) treinam funcionários do zero. Você entra como "trainee" e em 2-3 meses já é housekeeper formado.',
        bullets: [
          'IHF (Irish Hotels Federation) oferece programas com bolsa.',
          'Procure "Hotel trainee Dublin" no Indeed.',
        ],
      },
      {
        emoji: '💼',
        title: 'LinkedIn Learning — 1 mês grátis',
        body:
          'Plataforma de cursos profissionais (negócios, design, programação, idiomas). Teste grátis por 1 mês — dá pra fazer 5-6 cursos completos nesse período.',
        links: [
          { label: 'LinkedIn Learning', url: 'https://www.linkedin.com/learning/', badge: 'Trial' },
        ],
      },
      {
        emoji: '🇮🇪',
        title: 'Erasmus+ Adult Learning',
        body:
          'Programa europeu que oferece bolsas pra cursos profissionalizantes em vários países. Vale conferir mesmo que você esteja com visto de estudante.',
        links: [
          { label: 'Erasmus+', url: 'https://erasmus-plus.ec.europa.eu/', badge: 'UE' },
        ],
      },
    ],
  },

  // ─── ROTEIRO (default = Irlanda) ─────────────────────────────────────
  roteiro: {
    intro:
      'Você está em uma ilha pequena cheia de paisagens absurdas. Aqui está um roteiro completo para conhecer o melhor da Irlanda durante os fins de semana e feriados. A maioria pode ser feita de ônibus (Bus Éireann, Aircoach, Citylink).',
    cards: [
      {
        emoji: '🍀',
        title: 'Semana 1 — Conhecendo Dublin',
        bullets: [
          'Trinity College + Book of Kells (€20, evite às terças).',
          'Temple Bar (à noite, música ao vivo nos pubs).',
          'Guinness Storehouse (€30, pinta grátis no rooftop com vista 360°).',
          'St. Stephen\'s Green + Grafton Street (compras e música de rua).',
          'Dublin Castle + Christ Church Cathedral (€10 cada).',
          'Phoenix Park (maior parque urbano da Europa, tem cervos soltos).',
        ],
        highlight: 'tip',
      },
      {
        emoji: '🌊',
        title: 'Fim de semana 1 — Howth (30min de Dublin)',
        body:
          'Vila pesqueira ligada a Dublin pelo DART. Cliff Walk com vista do mar, fish and chips no Beshoff, foca selvagem no porto.',
        bullets: [
          'Vá de DART (Dublin Connolly → Howth, €5).',
          'Cliff Walk completo: 2h, fácil. Vista absurda.',
          'Almoço no Beshoff Bros (peixe fresco).',
          'Conheça a foca chamada Sammy.',
        ],
      },
      {
        emoji: '⛰️',
        title: 'Cliffs of Moher (1 dia, ida e volta)',
        body:
          'O símbolo da Irlanda. Penhascos de 200m no Atlântico. A 3h de Dublin de ônibus.',
        bullets: [
          'Tour de 1 dia saindo de Dublin: €60-€80 (Wild Rover, Paddywagon).',
          'Ou alugue carro e faça com calma — passa por Galway e Burren.',
          'Leve casaco — vento forte mesmo no verão.',
          'Melhor luz: entardecer (16-18h no inverno, 19-21h no verão).',
        ],
      },
      {
        emoji: '🎵',
        title: 'Galway (fim de semana)',
        body:
          'Cidade super jovem e cultural na costa oeste. Música ao vivo em todo bar.',
        bullets: [
          'Vá de ônibus (€20 Citylink, 2h30 de Dublin).',
          'Latin Quarter — bares, restaurantes, artistas de rua.',
          'Galway Cathedral.',
          'Salthill Promenade — caminhada à beira-mar.',
          'Day trip pra Connemara National Park.',
        ],
      },
      {
        emoji: '🏰',
        title: 'Norte da Irlanda — Belfast & Causeway',
        body:
          'Atravessa a fronteira (não precisa de visto a mais) e entra na Irlanda do Norte (Reino Unido).',
        bullets: [
          'Belfast: Titanic Museum (€25), Cathedral Quarter, mural Peace Wall.',
          'Giant\'s Causeway: 40.000 colunas de basalto na costa. €15 entrada.',
          'Dark Hedges: cenário de Game of Thrones.',
          'Faça em tour de 1 dia de Dublin: €55 (Paddywagon, Wild Rover).',
        ],
      },
      {
        emoji: '🌈',
        title: 'Anel de Kerry & Killarney',
        body:
          'O sul da Irlanda. Lagos, montanhas, castelos. Cenário de várias produções de Hollywood.',
        bullets: [
          'Killarney National Park (gratuito).',
          'Ring of Kerry: 180km de costa em loop. Faça de carro ou tour.',
          'Dingle Peninsula: vila pesqueira, golfinho Fungie (era 😢).',
          'Cork no caminho: 2ª maior cidade, English Market, Blarney Castle.',
        ],
      },
      {
        emoji: '🎉',
        title: 'St. Patrick\'s Day (17 de março)',
        body:
          'O dia mais importante do ano na Irlanda. Toda a cidade se pinta de verde. Parada em Dublin, Cork e Galway. Pubs lotados das 10h às 2h.',
        bullets: [
          'Use verde da cabeça aos pés.',
          'Compre ingressos da parada online com antecedência.',
          'Pintura no rosto nos carrinhos da rua (€5).',
          'Reserve mesa em pub pelo menos 1 semana antes.',
        ],
        highlight: 'tip',
      },
      {
        emoji: '✈️',
        title: 'Bate-volta para o resto da Europa',
        body:
          'Estando na Irlanda, voos baratos abrem o continente. Ryanair e Aer Lingus saem de Dublin.',
        bullets: [
          'Londres €30 (1h).',
          'Edimburgo (Escócia) €40 (1h).',
          'Amsterdã €50 (1h30).',
          'Lisboa €80 (3h).',
          'Berlim €90 (2h30).',
          'Roma €100 (3h).',
          'Reserve com 2-3 meses de antecedência pra pegar barato.',
        ],
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Overrides POR PAÍS. Cada chave de país (ISO-2) pode sobrescrever 1+
// sub-abas. Se faltar, cai no INFO_CONTENT default (que é o conteúdo Irlanda).
// ─────────────────────────────────────────────────────────────────────────

// Helper: resolve o conteúdo de uma sub-aba pro país do aluno. Se o país
// não tiver override, cai no INFO_CONTENT default (que é Irlanda).
export function getInfoContent(subKey: InfoSubKey, country?: string): InfoContent {
  const code = (country || '').toUpperCase();
  const override = INFO_BY_COUNTRY[code]?.[subKey];
  return override || INFO_CONTENT[subKey];
}

export const INFO_BY_COUNTRY: Record<string, Partial<Record<InfoSubKey, InfoContent>>> = {

  // ─── REINO UNIDO (GB) ──────────────────────────────────────────────
  GB: {
    curriculo: {
      intro:
        'O CV britânico é direto, sem foto e focado em resultados. Use "CV" no topo, fonte Calibri ou Arial 10-11, máximo 2 páginas. Cover Letter SEMPRE acompanha.',
      cards: [
        {
          emoji: '🇬🇧',
          title: 'Estrutura padrão UK',
          bullets: [
            'Nome + telefone UK (+44) + email + LinkedIn.',
            'Personal Statement: 3-4 linhas resumindo experiência e objetivo.',
            'Work Experience em ordem reversa (mais recente primeiro).',
            'Education: graduação, certificados, idiomas.',
            'Skills relevantes: 5-8 bullets.',
            'References: "Available on request".',
          ],
        },
        {
          emoji: '✉️',
          title: 'Cover Letter britânica',
          body: 'Carta de apresentação separada do CV. 1 página. Estrutura:',
          bullets: [
            'Cabeçalho com seu endereço UK + data + endereço da empresa.',
            'Saudação: "Dear Hiring Manager," ou nome se souber.',
            'Parágrafo 1: por que está aplicando.',
            'Parágrafo 2: qual experiência você traz.',
            'Parágrafo 3: por que essa empresa.',
            'Encerramento: "Yours sincerely, [Nome]".',
          ],
        },
        {
          emoji: '🛠️',
          title: 'Ferramentas grátis pra criar',
          links: [
            { label: 'Canva CV templates', url: 'https://www.canva.com/curriculum/', badge: 'Free' },
            { label: 'Novoresume', url: 'https://novoresume.com/', badge: 'Free + Pro' },
            { label: 'Reed CV builder', url: 'https://www.reed.co.uk/career-advice/cv-templates/', badge: 'UK' },
          ],
          highlight: 'tip',
        },
      ],
    },
    empregos: {
      intro:
        'No Reino Unido você precisa ter "Right to Work" comprovado. Com visto de estudante T4/Student dá 20h/semana. As primeiras vagas geralmente vêm em retail, hospitality e construction.',
      cards: [
        {
          emoji: '🔎',
          title: 'Sites principais',
          links: [
            { label: 'Reed.co.uk', url: 'https://www.reed.co.uk/', badge: 'Site' },
            { label: 'TotalJobs', url: 'https://www.totaljobs.com/', badge: 'Site' },
            { label: 'Indeed UK', url: 'https://uk.indeed.com/', badge: 'Site' },
            { label: 'CV-Library', url: 'https://www.cv-library.co.uk/', badge: 'Site' },
            { label: 'LinkedIn', url: 'https://uk.linkedin.com/jobs/', badge: 'Global' },
          ],
        },
        {
          emoji: '☕',
          title: 'Café, restaurante e retail',
          bullets: [
            'Pret a Manger, Costa, Caffè Nero — sempre contratando.',
            'Tesco, Sainsburys, ASDA — supermercados gigantes.',
            'Selfridges, Harrods, John Lewis — retail premium em Londres.',
            'Pay: £11.44/h mínimo (£12.21 desde abril/2026).',
          ],
        },
        {
          emoji: '🧹',
          title: 'Agências e empresas de limpeza',
          bullets: [
            'OCS Group, Mitie, ISS — multinacionais.',
            '"Cleaner London" no Indeed: 100+ vagas/dia.',
            'Hotéis grandes (Hilton, Marriott) treinam do zero.',
          ],
        },
        {
          emoji: '✅',
          title: 'Dicas pra conseguir rápido',
          bullets: [
            'NI Number (National Insurance) é equivalente ao PPS — peça no Jobcentre Plus.',
            'Conta no Monzo ou Starling (digital, abre em 5min).',
            'CV em mão pelas ruas de Soho e Camden funciona muito.',
            'Use o Workaway pra trabalhar em troca de hospedagem temporária.',
          ],
          highlight: 'tip',
        },
      ],
    },
    roteiro: {
      intro:
        'Reino Unido tem 4 países: Inglaterra, Escócia, País de Gales e Irlanda do Norte. Voos baratos e trens conectam tudo. Esse é um roteiro pra explorar nos fins de semana.',
      cards: [
        {
          emoji: '🇬🇧',
          title: 'Londres — primeira semana',
          bullets: [
            'British Museum (grátis) — Pedra de Roseta, múmias egípcias.',
            'National Gallery + Trafalgar Square (grátis).',
            'Tower of London (£35) + Tower Bridge (grátis caminhar).',
            'Camden Town — mercado alternativo, comida internacional.',
            'Notting Hill + Portobello Road (sábado).',
            'Hyde Park + Speakers\' Corner (domingo).',
            'Use Oyster Card no metrô (£2.80/viagem zona 1-2).',
          ],
          highlight: 'tip',
        },
        {
          emoji: '🏰',
          title: 'Castelos & história',
          bullets: [
            'Windsor Castle (40min de Londres) — residência da Família Real.',
            'Stonehenge + Bath (1 dia inteiro, tour £80).',
            'Hampton Court Palace — Tudor, Henrique VIII.',
            'Edinburgh Castle (Escócia) — Castelo no topo da colina.',
          ],
        },
        {
          emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
          title: 'Escócia — Edimburgo & Highlands',
          bullets: [
            'Voo de Londres £30 (LumiAir, Ryanair, 1h15).',
            'Royal Mile, Holyrood Palace, Arthur\'s Seat.',
            'Tour Highlands + Loch Ness 1 dia (£60).',
            'Festival Fringe em agosto (maior festival de arte do mundo).',
          ],
        },
        {
          emoji: '🍻',
          title: 'Manchester, Liverpool, York',
          bullets: [
            'Manchester: Old Trafford (Manchester United), Northern Quarter.',
            'Liverpool: Beatles Story Museum, Albert Dock.',
            'York: muralhas medievais, York Minster, ruas antigas.',
          ],
        },
        {
          emoji: '✈️',
          title: 'Bate-volta pra Europa',
          bullets: [
            'Paris (Eurostar £100, 2h30) ou voo £40.',
            'Amsterdã £50 (1h).',
            'Dublin £50 (1h15).',
            'Roma, Madri, Berlim a partir de £80.',
          ],
        },
      ],
    },
  },

  // ─── CANADÁ (CA) ───────────────────────────────────────────────────
  CA: {
    curriculo: {
      intro:
        'O CV canadense é parecido com o americano: sem foto, sem idade, sem estado civil. Resumo curto no topo, experiência em ordem reversa, máximo 2 páginas. Em inglês (ou francês em Quebec).',
      cards: [
        {
          emoji: '🇨🇦',
          title: 'Estrutura típica',
          bullets: [
            'Nome grande no topo + cidade canadense + e-mail + LinkedIn.',
            'Professional Summary (2-3 frases).',
            'Work Experience com bullets de resultados quantificados.',
            'Education + Certifications.',
            'Volunteer Experience é VALORIZADO no Canadá (diferente do BR).',
            'Languages: inglês + português + francês se tiver.',
          ],
        },
        {
          emoji: '⚠️',
          title: 'Cuidados',
          bullets: [
            'Não coloque foto.',
            'Não coloque "Brazilian" ou país — é discriminatório lá.',
            'Adapte palavras: "stage" → "internship", "ensino médio" → "high school".',
            'Sempre acompanhe de Cover Letter.',
          ],
          highlight: 'warn',
        },
        {
          emoji: '🛠️',
          title: 'Ferramentas',
          links: [
            { label: 'Canada Job Bank — CV Builder', url: 'https://www.jobbank.gc.ca/findajob/resume-builder', badge: 'Site oficial' },
            { label: 'Canva templates', url: 'https://www.canva.com/curriculum/', badge: 'Free' },
          ],
        },
      ],
    },
    empregos: {
      intro:
        'Com visto de estudante (Study Permit), você pode trabalhar 24h/semana durante o curso e tempo integral nas férias. As cidades com mais vagas pra brasileiros: Toronto, Vancouver, Calgary, Montreal.',
      cards: [
        {
          emoji: '🔎',
          title: 'Sites principais',
          links: [
            { label: 'Job Bank (governo)', url: 'https://www.jobbank.gc.ca/', badge: 'Oficial' },
            { label: 'Indeed Canada', url: 'https://ca.indeed.com/', badge: 'Site' },
            { label: 'Workopolis', url: 'https://www.workopolis.com/', badge: 'Site' },
            { label: 'LinkedIn Canada', url: 'https://ca.linkedin.com/jobs/', badge: 'Global' },
          ],
        },
        {
          emoji: '☕',
          title: 'Tim Hortons, Starbucks, fast food',
          bullets: [
            'Tim Hortons treina do zero, comuníssimo entre brasileiros.',
            'Aplica online + visita as lojas com o CV.',
            'Pagamento C$16,55/h (Ontário 2026), com tips em alguns lugares.',
          ],
        },
        {
          emoji: '🧹',
          title: 'Limpeza, retail, construction',
          bullets: [
            'Bee-Clean, GDI Integrated Facility Services — limpeza.',
            'Loblaws, Walmart Canada, Costco — retail.',
            'Procurar "Cleaner Toronto" ou "Warehouse Mississauga" no Indeed.',
          ],
        },
        {
          emoji: '✅',
          title: 'Documentos necessários',
          bullets: [
            'SIN (Social Insurance Number) — pega num Service Canada com o passaporte e Study Permit.',
            'Conta no RBC, TD ou Scotiabank — abrem com Study Permit.',
            'Tax File: declare imposto via Canada Revenue Agency.',
          ],
          highlight: 'tip',
        },
      ],
    },
    roteiro: {
      intro:
        'O Canadá é gigante. Concentre nos fins de semana em coisas próximas da sua cidade e use feriados longos pra esticar. Trem (Via Rail), ônibus (Megabus) e voos baratos (Flair, WestJet) ajudam.',
      cards: [
        {
          emoji: '🏙️',
          title: 'Toronto — fim de semana clássico',
          bullets: [
            'CN Tower (C$45) + EdgeWalk pra corajosos.',
            'Distillery District + Kensington Market.',
            'Lake Ontario + Toronto Islands (ferry C$10).',
            'Jogo NBA Raptors (C$50+) ou NHL Maple Leafs.',
          ],
        },
        {
          emoji: '💦',
          title: 'Niagara Falls',
          bullets: [
            '1h30 de Toronto. Vista das Cataratas no lado canadense.',
            'Maid of the Mist (C$30, barco até as cataratas).',
            'Skylon Tower restaurante giratório.',
            'Ônibus FlixBus ou GO Transit (C$25 ida-volta).',
          ],
          highlight: 'tip',
        },
        {
          emoji: '🍁',
          title: 'Quebec & Montreal',
          bullets: [
            'Voo Toronto-Montreal C$80 (1h15) ou trem 5h.',
            'Old Montreal + Mount Royal.',
            'Quebec City (3h de Montreal) — única cidade fortificada da América do Norte.',
            'Outono (set-out): a coisa mais bonita já filmada.',
          ],
        },
        {
          emoji: '🏔️',
          title: 'Vancouver & Rocky Mountains',
          bullets: [
            'Stanley Park, Granville Island, Capilano Suspension Bridge.',
            'Banff + Lake Louise (10h de Vancouver de carro, vale alugar).',
            'Whistler — esqui no inverno, mountain biking no verão.',
          ],
        },
        {
          emoji: '✈️',
          title: 'Bate-volta pros EUA',
          bullets: [
            'Toronto-NY voo C$200 (1h30).',
            'Toronto-Chicago C$180.',
            'Vancouver-Seattle ônibus C$30 (3h).',
            'Você precisa de visto B1/B2 dos EUA (válido por 10 anos pra brasileiros).',
          ],
        },
      ],
    },
  },

  // ─── AUSTRÁLIA (AU) ────────────────────────────────────────────────
  AU: {
    curriculo: {
      intro:
        'O resumé australiano é mais longo (até 3 páginas), informal mas profissional. Use "Hi [Name]" se souber pra quem está enviando. Sem foto, sem idade.',
      cards: [
        {
          emoji: '🇦🇺',
          title: 'Estrutura padrão',
          bullets: [
            'Nome + telefone AU (+61) + e-mail.',
            'Career Objective ou Profile (2-3 linhas).',
            'Work History em ordem reversa, com bullets dos achievements.',
            'Education + Skills.',
            'References: 2 pessoas com nome, cargo e telefone.',
            'Hobbies podem ser incluídos (mostra personalidade).',
          ],
        },
      ],
    },
    empregos: {
      intro:
        'Com visto de estudante (Subclass 500), você trabalha 48h por quinzena durante as aulas e ilimitado nas férias. Sydney, Melbourne, Brisbane, Gold Coast são os melhores mercados.',
      cards: [
        {
          emoji: '🔎',
          title: 'Sites principais',
          links: [
            { label: 'Seek', url: 'https://www.seek.com.au/', badge: 'Maior site AU' },
            { label: 'Indeed Australia', url: 'https://au.indeed.com/', badge: 'Site' },
            { label: 'Jora', url: 'https://au.jora.com/', badge: 'Site' },
            { label: 'Gumtree Jobs', url: 'https://www.gumtree.com.au/jobs', badge: 'Casual' },
          ],
        },
        {
          emoji: '☕',
          title: 'Trampos clássicos pra brasileiros',
          bullets: [
            'Café (Australia tem cultura cafeeira forte).',
            'Cleaner, housekeeping, construction.',
            'Backpacker hostels: trabalha por hospedagem.',
            'Salário mínimo: AUD 24.10/h (2026) — alto comparado a outros países.',
          ],
          highlight: 'tip',
        },
        {
          emoji: '🦘',
          title: 'TFN e conta no banco',
          bullets: [
            'TFN (Tax File Number) — equivalente ao CPF, peça online em ato.gov.au.',
            'Bancos: CommBank, ANZ, NAB. Abrem com passaporte + visto.',
            'Super Annuation: 12% do salário vai pra um fundo de aposentadoria. Você resgata ao deixar o país.',
          ],
        },
      ],
    },
    roteiro: {
      intro:
        'A Austrália é maior que o Brasil mas com 1/10 da população. Maioria das atrações fica na costa leste. Voos internos com Jetstar e Virgin a partir de AUD 80.',
      cards: [
        {
          emoji: '🌉',
          title: 'Sydney essencial',
          bullets: [
            'Opera House + Harbour Bridge (escalada AUD 300, ou só foto da Mrs Macquarie\'s Chair).',
            'Bondi Beach + caminhada até Coogee (6km à beira-mar).',
            'Royal Botanic Garden + Manly ferry (AUD 8).',
            'Blue Mountains (1h30 de trem) — Three Sisters, paisagem brutal.',
          ],
          highlight: 'tip',
        },
        {
          emoji: '🎨',
          title: 'Melbourne — cidade cultural',
          bullets: [
            'Hosier Lane (street art).',
            'Federation Square + NGV (National Gallery of Victoria, grátis).',
            'Brighton Beach + Bathing Boxes coloridas.',
            'Great Ocean Road (1 dia inteiro, AUD 130 em tour).',
          ],
        },
        {
          emoji: '🐠',
          title: 'Grande Barreira de Coral (Cairns)',
          bullets: [
            'Voo Sydney-Cairns AUD 200 (3h).',
            'Day trip pra mergulho (AUD 220 com equipamento).',
            'Daintree Rainforest — floresta mais antiga do mundo.',
          ],
        },
        {
          emoji: '🏖️',
          title: 'Gold Coast & Brisbane',
          bullets: [
            'Surfers Paradise — praia + vida noturna.',
            'Currumbin Wildlife Sanctuary (cangurus, coalas).',
            'Brisbane: South Bank + Story Bridge.',
          ],
        },
      ],
    },
  },

  // ─── PORTUGAL (PT) ─────────────────────────────────────────────────
  PT: {
    curriculo: {
      intro:
        'O CV português pode ter foto (opcional) e é em português europeu. Empresas internacionais geralmente preferem em inglês. Máximo 2 páginas.',
      cards: [
        {
          emoji: '🇵🇹',
          title: 'Estrutura típica',
          bullets: [
            'Cabeçalho: nome, telefone (+351), e-mail, LinkedIn.',
            'Foto profissional opcional (no canto superior direito).',
            'Resumo profissional (3-4 linhas).',
            'Experiência profissional em ordem reversa.',
            'Formação académica + idiomas (B1, B2, C1, C2).',
            'Competências técnicas e interpessoais.',
          ],
        },
      ],
    },
    empregos: {
      intro:
        'Brasileiros têm acesso fácil ao mercado português pelo acordo bilateral. Lisboa, Porto e Coimbra concentram as vagas. Setores fortes: turismo, tecnologia, restauração.',
      cards: [
        {
          emoji: '🔎',
          title: 'Sites principais',
          links: [
            { label: 'Sapo Emprego', url: 'https://emprego.sapo.pt/', badge: 'Maior site' },
            { label: 'Net-Empregos', url: 'https://www.net-empregos.com/', badge: 'Site' },
            { label: 'Indeed Portugal', url: 'https://pt.indeed.com/', badge: 'Site' },
            { label: 'LinkedIn Portugal', url: 'https://pt.linkedin.com/jobs/', badge: 'Global' },
            { label: 'IEFP (público)', url: 'https://www.iefp.pt/', badge: 'Oficial' },
          ],
        },
        {
          emoji: '🍷',
          title: 'Turismo, restaurantes e hotéis',
          bullets: [
            'Cadeias hoteleiras (Pestana, Vila Galé) sempre contratam.',
            'Restaurantes em Lisboa Centro / Bairro Alto.',
            'Programa "Talento" de empresas de tech recruta brasileiros.',
            'Salário mínimo: €870/mês (2026).',
          ],
        },
        {
          emoji: '✅',
          title: 'NIF e Segurança Social',
          bullets: [
            'NIF — pega no Serviço de Finanças com passaporte + comprovativo de morada.',
            'NISS (Segurança Social) — necessário pra trabalhar formalmente.',
            'Conta bancária: Millennium BCP, Santander, ActivoBank.',
          ],
          highlight: 'tip',
        },
      ],
    },
    roteiro: {
      intro:
        'Portugal é pequeno e dá pra explorar TODO em 3-4 fins de semana. Trens da CP conectam tudo. Use Flixbus pra preços baixos.',
      cards: [
        {
          emoji: '🇵🇹',
          title: 'Lisboa — fim de semana',
          bullets: [
            'Alfama + Castelo de São Jorge.',
            'Belém: Mosteiro dos Jerónimos + Torre + Pastéis de Belém.',
            'Bairro Alto à noite (fado + bares).',
            'Tram 28 (cuidado com batedores de carteira).',
            'LX Factory — bares e arte.',
          ],
        },
        {
          emoji: '🌊',
          title: 'Sintra & Cascais (bate-volta de Lisboa)',
          bullets: [
            'Palácio da Pena (€14) — colorido em cima do monte.',
            'Quinta da Regaleira + Castelo dos Mouros.',
            'Cabo da Roca (ponto mais ocidental da Europa).',
            'Praia do Guincho + Cascais (€2.30 de trem).',
          ],
          highlight: 'tip',
        },
        {
          emoji: '🍷',
          title: 'Porto & Douro',
          bullets: [
            'Trem Lisboa-Porto €25 (3h, Alfa Pendular €35).',
            'Ribeira + Ponte D. Luís I.',
            'Cruzeiro pelas caves do vinho do Porto (€20).',
            'Vale do Douro — patrimônio mundial, tours de 1 dia €50.',
          ],
        },
        {
          emoji: '🏖️',
          title: 'Algarve (sul) e Madeira',
          bullets: [
            'Algarve: Lagos, Tavira, Praia da Marinha. Trem Lisboa-Faro €25.',
            'Madeira: voo €40, trilhas levada, vista de tirar o fôlego.',
          ],
        },
      ],
    },
  },

  // ─── ESPANHA (ES) ──────────────────────────────────────────────────
  ES: {
    curriculo: {
      intro:
        'CV espanhol pode ter foto. Em espanhol pra vagas locais, inglês pra multinacionais. Inclui DNI/NIE quando você tiver.',
      cards: [
        {
          emoji: '🇪🇸',
          title: 'Estrutura',
          bullets: [
            'Datos personales: nombre, teléfono (+34), email.',
            'Foto pequena (opcional).',
            'Perfil profesional (2-3 líneas).',
            'Experiencia laboral em ordem reversa.',
            'Formación académica + idiomas (con nivel CEFR).',
            'Otros datos de interés.',
          ],
        },
      ],
    },
    empregos: {
      intro:
        'Mercado espanhol está aquecido em 2026, especialmente em Madrid, Barcelona, Valência. Brasileiros são bem vistos. Salário médio mais baixo que outros países europeus.',
      cards: [
        {
          emoji: '🔎',
          title: 'Sites principais',
          links: [
            { label: 'InfoJobs', url: 'https://www.infojobs.net/', badge: 'Maior site' },
            { label: 'Indeed España', url: 'https://es.indeed.com/', badge: 'Site' },
            { label: 'JobToday', url: 'https://www.jobtoday.com/', badge: 'App vagas hora' },
            { label: 'LinkedIn España', url: 'https://es.linkedin.com/jobs/', badge: 'Global' },
            { label: 'SEPE (gov)', url: 'https://www.sepe.es/', badge: 'Oficial' },
          ],
        },
        {
          emoji: '🍷',
          title: 'Trampos clássicos',
          bullets: [
            'Hostelería (bares, restaurantes) — alta rotatividade.',
            'Turismo (Barcelona, Sevilla, Madrid).',
            'Salário mínimo: €1.323/mês (2026).',
            'Café à parte: muitas vagas em call centers atendendo Brasil.',
          ],
        },
        {
          emoji: '✅',
          title: 'NIE e Seguridad Social',
          bullets: [
            'NIE (Número de Identidad de Extranjero) — Comisaría de Policía.',
            'Número de Seguridad Social — necessário pra contrato.',
            'Conta no Santander, BBVA, CaixaBank.',
          ],
          highlight: 'tip',
        },
      ],
    },
    roteiro: {
      intro:
        'Espanha é gigante e variada. Madrid no centro, Barcelona na costa leste, Andaluzia no sul. Trens AVE são rápidos mas caros — use BlaBlaCar e Flixbus.',
      cards: [
        {
          emoji: '🇪🇸',
          title: 'Madrid — coração da Espanha',
          bullets: [
            'Museo del Prado + Reina Sofía (Guernica).',
            'Plaza Mayor + Puerta del Sol.',
            'Parque del Retiro + Templo de Debod.',
            'La Latina pra tapas no domingo.',
            'Real Madrid no Bernabéu (€40+).',
          ],
        },
        {
          emoji: '🏛️',
          title: 'Barcelona — Gaudí everywhere',
          bullets: [
            'Sagrada Família (€26, reserve com 1 mês).',
            'Park Güell (€10) + Casa Batlló.',
            'Las Ramblas + Mercado de La Boqueria.',
            'Barceloneta — praia urbana.',
            'AVE Madrid-Barcelona €50 (2h30).',
          ],
          highlight: 'tip',
        },
        {
          emoji: '☀️',
          title: 'Andaluzia — Sevilha, Granada, Córdoba',
          bullets: [
            'Sevilla: Plaza de España + Real Alcázar (cenário Game of Thrones).',
            'Granada: Alhambra (€19, único, RESERVE).',
            'Córdoba: Mezquita (Catedral-Mesquita).',
            'Flamenco em Sevilha ou Granada.',
          ],
        },
        {
          emoji: '🏖️',
          title: 'Valência, Mallorca, Ibiza',
          bullets: [
            'Valência: Cidade das Artes e Ciências.',
            'Mallorca: praias paradisíacas, voo €30 de Madrid.',
            'Ibiza: baladas no verão (junho-setembro).',
          ],
        },
      ],
    },
  },

  // ─── ALEMANHA (DE) ─────────────────────────────────────────────────
  DE: {
    curriculo: {
      intro:
        'O Lebenslauf alemão é o mais formal da Europa: foto profissional no topo, tabular, assinado e datado. Acompanha sempre uma Anschreiben (cover letter).',
      cards: [
        {
          emoji: '🇩🇪',
          title: 'Lebenslauf — estrutura padrão',
          bullets: [
            'Foto profissional no canto superior direito (sorriso discreto).',
            'Persönliche Daten: nome, endereço, telefone, e-mail, data e local de nascimento.',
            'Beruflicher Werdegang (experiência) em ordem reversa.',
            'Ausbildung (formação) — escola → graduação → certificados.',
            'Sprachkenntnisse: idiomas com nível (A1 a C2).',
            'EDV-Kenntnisse: ferramentas e software.',
            'Final: Datum + Unterschrift (assinatura à mão se for impresso).',
          ],
        },
        {
          emoji: '✍️',
          title: 'Anschreiben — carta de apresentação',
          body: 'Tão importante quanto o CV. 1 página, máximo.',
          bullets: [
            'Endereço seu + endereço da empresa.',
            'Linha do assunto: "Bewerbung als [Cargo]".',
            'Saudação: "Sehr geehrte Damen und Herren," ou nome.',
            'Por que está aplicando, qual experiência tem, por que essa empresa.',
            'Encerramento: "Mit freundlichen Grüßen, [Nome]".',
          ],
        },
      ],
    },
    empregos: {
      intro:
        'Mercado alemão é forte e organizado. Aprender alemão DUPLICA suas chances. Cidades com mais vagas para brasileiros: Berlim, Munique, Frankfurt, Hamburgo, Colônia.',
      cards: [
        {
          emoji: '🔎',
          title: 'Sites principais',
          links: [
            { label: 'StepStone', url: 'https://www.stepstone.de/', badge: 'Maior' },
            { label: 'Indeed Deutschland', url: 'https://de.indeed.com/', badge: 'Site' },
            { label: 'Xing', url: 'https://www.xing.com/jobs/', badge: 'LinkedIn alemão' },
            { label: 'Bundesagentur für Arbeit', url: 'https://www.arbeitsagentur.de/', badge: 'Oficial' },
            { label: 'Make it in Germany', url: 'https://www.make-it-in-germany.com/', badge: 'Gov para imigrantes' },
          ],
        },
        {
          emoji: '🥨',
          title: 'Vagas pra estudantes',
          bullets: [
            'Werkstudent — meio período (até 20h durante as aulas, ilimitado nas férias).',
            'Mini-job (€538/mês) — sem imposto, popular em cafés e supermercados.',
            'Salário mínimo: €12,82/h (2026).',
            'Setores: tech, engenharia, automotivo, turismo.',
          ],
        },
        {
          emoji: '✅',
          title: 'Documentos essenciais',
          bullets: [
            'Anmeldung (registro de endereço) — fundamental, pega no Bürgeramt.',
            'Steuer-ID (CPF alemão) — vem pelo correio depois da Anmeldung.',
            'Krankenversicherung (seguro saúde) — obrigatório por lei.',
            'Conta bancária: N26, Deutsche Bank, Commerzbank.',
          ],
          highlight: 'tip',
        },
      ],
    },
    roteiro: {
      intro:
        'Alemanha tem trem (Deutsche Bahn) eficiente. Use Ländertickets (passes regionais) por €25-30 num dia inteiro. Cidades pequenas têm o melhor charme.',
      cards: [
        {
          emoji: '🇩🇪',
          title: 'Berlim — capital cultural',
          bullets: [
            'Brandenburger Tor + Reichstag (entrada grátis, marca antes).',
            'East Side Gallery (Muro de Berlim).',
            'Museum Island (5 museus, €19).',
            'Mauerpark domingos (karaoke ao ar livre).',
            'Berghain — clube mais famoso do mundo (sexta a domingo).',
          ],
          highlight: 'tip',
        },
        {
          emoji: '🏰',
          title: 'Baviera — Munique & castelos',
          bullets: [
            'Munique: Marienplatz, Englischer Garten, Hofbräuhaus.',
            'Castelo Neuschwanstein (cenário Disney) — 2h de Munique.',
            'Oktoberfest em setembro/outubro (chega cedo).',
            'Salzburg (Áustria, 1h45 de trem).',
          ],
        },
        {
          emoji: '⛪',
          title: 'Colônia, Hamburgo, Dresden',
          bullets: [
            'Colônia: Catedral (gótica, grátis), Karneval em fevereiro.',
            'Hamburgo: porto, Elbphilharmonie, Reeperbahn.',
            'Dresden: Frauenkirche reconstruída, palácio Zwinger.',
          ],
        },
        {
          emoji: '✈️',
          title: 'Bate-volta pra Europa',
          bullets: [
            'Praga (CZ) — Flixbus €15 de Berlim.',
            'Amsterdã — voo €30 de Hamburgo.',
            'Viena (AT) — trem €40 de Munique.',
            'Paris — TGV €60 de Frankfurt (3h45).',
          ],
        },
      ],
    },
  },
};

