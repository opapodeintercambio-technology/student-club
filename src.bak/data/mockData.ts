import type { Product, Match, Chat, User } from '../types';

export const currentUser: User = {
  id: 'u1',
  name: 'Ana Souza',
  avatar: 'AS',
  rating: 4.8,
  location: 'São Paulo, SP',
};

export const mockProducts: Product[] = [
  {
    id: 'p1',
    title: 'MacBook Pro 2021',
    description: 'MacBook Pro M1, 16GB RAM, 512GB SSD. Excelente estado, pouquíssimo uso.',
    category: 'Eletrônicos',
    images: [],
    owner: { id: 'u2', name: 'Carlos Lima', avatar: 'CL', rating: 4.9, location: 'Rio de Janeiro, RJ' },
    wantedFor: 'iPhone 14 Pro ou similar',
    postedAt: '2h atrás',
    type: 'product',
  },
  {
    id: 'p2',
    title: 'Aulas de Design UX/UI',
    description: '10 aulas de 1h cada, cobrindo Figma, prototipagem e design thinking. 5 anos de experiência.',
    category: 'Serviços',
    images: [],
    owner: { id: 'u3', name: 'Mariana Costa', avatar: 'MC', rating: 4.7, location: 'Curitiba, PR' },
    wantedFor: 'Aulas de programação (React/Node)',
    postedAt: '5h atrás',
    type: 'service',
  },
  {
    id: 'p3',
    title: 'Bicicleta Trek Marlin 5',
    description: 'Bike de montanha 2022, tamanho M, alumínio, 24 marchas. Usada apenas fins de semana.',
    category: 'Esportes',
    images: [],
    owner: { id: 'u4', name: 'Pedro Alves', avatar: 'PA', rating: 4.5, location: 'Belo Horizonte, MG' },
    wantedFor: 'Equipamentos de academia ou câmera fotográfica',
    postedAt: '1d atrás',
    type: 'product',
  },
  {
    id: 'p4',
    title: 'Consultoria Financeira',
    description: 'Planejamento financeiro pessoal, investimentos e organização de dívidas. CPA-10 certificado.',
    category: 'Serviços',
    images: [],
    owner: { id: 'u5', name: 'Julia Ferreira', avatar: 'JF', rating: 5.0, location: 'Brasília, DF' },
    wantedFor: 'Serviços de marketing digital ou design gráfico',
    postedAt: '2d atrás',
    type: 'service',
  },
  {
    id: 'p5',
    title: 'Sony PlayStation 5',
    description: 'PS5 edição padrão com leitor de disco, 2 controles e 3 jogos inclusos.',
    category: 'Eletrônicos',
    images: [],
    owner: { id: 'u6', name: 'Rafael Santos', avatar: 'RS', rating: 4.6, location: 'Porto Alegre, RS' },
    wantedFor: 'Xbox Series X ou PC Gamer',
    postedAt: '3d atrás',
    type: 'product',
  },
];

export const mockMatches: Match[] = [
  {
    id: 'm1',
    product: mockProducts[1], // Aulas de Design
    matchedWith: {
      id: 'my1',
      title: 'Aulas de React & Node.js',
      description: 'Ensino React, Node e TypeScript para iniciantes e intermediários.',
      category: 'Serviços',
      images: [],
      owner: currentUser,
      wantedFor: 'Aulas de design ou marketing',
      postedAt: '1d atrás',
      type: 'service',
    },
    compatibilityScore: 98,
  },
  {
    id: 'm2',
    product: mockProducts[3], // Consultoria financeira
    matchedWith: {
      id: 'my2',
      title: 'Design Gráfico e Identidade Visual',
      description: 'Criação de logos, materiais de marketing e identidade visual completa.',
      category: 'Serviços',
      images: [],
      owner: currentUser,
      wantedFor: 'Consultoria ou serviços contábeis',
      postedAt: '2d atrás',
      type: 'service',
    },
    compatibilityScore: 92,
  },
  {
    id: 'm3',
    product: mockProducts[2], // Bicicleta
    matchedWith: {
      id: 'my3',
      title: 'Câmera Sony A6400',
      description: 'Câmera mirrorless com lente kit 16-50mm, ótima para fotografia e vídeo.',
      category: 'Eletrônicos',
      images: [],
      owner: currentUser,
      wantedFor: 'Bike ou equipamento esportivo',
      postedAt: '3d atrás',
      type: 'product',
    },
    compatibilityScore: 85,
  },
];

export const mockChat: Chat = {
  id: 'c1',
  participant: mockProducts[1].owner,
  product: mockProducts[1],
  messages: [
    { id: 'msg1', senderId: 'u3', text: 'Oi! Vi que você oferece aulas de React. Tenho interesse em trocar pelas minhas aulas de UX/UI!', timestamp: '10:23' },
    { id: 'msg2', senderId: 'u1', text: 'Oi Mariana! Que coincidência, estava procurando exatamente isso. Quantas aulas você propõe trocar?', timestamp: '10:25' },
    { id: 'msg3', senderId: 'u3', text: 'Que tal 10 aulas de cada? Podemos começar quando quiser. Tenho disponibilidade nos fins de semana.', timestamp: '10:28' },
    { id: 'msg4', senderId: 'u1', text: 'Perfeito! Fins de semana funcionam bem pra mim também. Podemos começar no próximo sábado?', timestamp: '10:30' },
    { id: 'msg5', senderId: 'u3', text: 'Combinado! Às 10h está bom? Posso fazer por videochamada.', timestamp: '10:31' },
  ],
};
