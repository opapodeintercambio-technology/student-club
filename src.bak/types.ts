export type Screen = 'login' | 'home' | 'create' | 'matches' | 'chat';

export interface User {
  id: string;
  name: string;
  avatar: string;
  rating: number;
  location: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  owner: User;
  wantedFor: string;
  postedAt: string;
  type: 'product' | 'service';
}

export interface Match {
  id: string;
  product: Product;
  matchedWith: Product;
  compatibilityScore: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface Chat {
  id: string;
  participant: User;
  product: Product;
  messages: Message[];
}
