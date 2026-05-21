// Tipos compartilhados.
//
// Product: tipo legado herdado do Trok Vibe (marketplace base).
// O Student Club nao usa anuncios/marketplace, mas o ChatPanel ainda
// referencia este tipo pra:
//   - selectedChat (id, username pra abrir o canal)
//   - renderizacao de mensagens ANTIGAS com cards de produto (legacy)
//
// Quando o chat eh aberto via openDirectChat (App.tsx), passamos:
//   { id: 'direct', username: <other>, title: 'Chat com @user', image: '',
//     description: '', wantsInExchange: '', category: '', tipo: 'troca' }
// Ou seja, a maioria dos campos eh stub. Mantemos a interface completa
// pra nao quebrar codigo legado e mensagens historicas.
export interface Product {
  id: string;
  title: string;
  image: string;
  description: string;
  wantsInExchange: string;
  category: string;
  gender?: 'Masculino' | 'Feminino' | 'Unissex';
  username: string;
  matchScore?: number;
  trokValue?: number;
  precoOriginal?: number;
  images?: string[];
  video?: string;
  cidade?: string;
  lat?: number | null;
  lng?: number | null;
  ownerPlan?: 'free' | 'pro' | 'plus';
  boosted?: boolean;
  tipo?: 'troca' | 'doacao' | 'pedido_doacao' | 'amostra' | 'promocao' | 'pedido_amostra';
  scoreMedio?: number;
  totalAvaliacoes?: number;
  createdAt?: string;
  visualizacoes?: number;
  quantity?: number;
}
