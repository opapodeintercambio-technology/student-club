// CATALOGO DE FILTROS AR — 20 filtros declarativos.
//
// Adicionar um filtro novo: adicionar uma entry aqui (sem codigo novo)
// desde que ja exista a engine. Status atual (MVP fase 1):
//
//   ENGINE A — SkinSmoothing: 5 filtros (todos prontos)
//   ENGINE B — FaceLiquify:   3 filtros (placeholder — engine WIP)
//   ENGINE C — Mask3D:        6 filtros (placeholder — engine WIP)
//   ENGINE D — FaceTexture:   3 filtros (placeholder — engine WIP)
//   ENGINE E — FXOverlay:     3 filtros (placeholder — engine WIP)
//
// Filtros com `modifiesFace: true` ganham badge "✨ Filtro" no story/post.

import type { FilterConfig } from './types';

export const FILTER_CATALOG: FilterConfig[] = [
  // ─── BEAUTY (5) ───────────────────────────────────────────────────
  { id: 'natural',      name: 'Natural',     category: 'beauty', engine: 'skin', params: { intensity: 0.2 }, modifiesFace: false, emoji: '✨' },
  { id: 'suave',        name: 'Suave',       category: 'beauty', engine: 'skin', params: { intensity: 0.4, brightness: 5 }, modifiesFace: false, emoji: '🌸' },
  { id: 'forte',        name: 'Forte',       category: 'beauty', engine: 'skin', params: { intensity: 0.6, brightness: 10 }, modifiesFace: false, emoji: '💫' },
  { id: 'glow',         name: 'Glow',        category: 'beauty', engine: 'skin', params: { intensity: 0.3, brightness: 8 }, modifiesFace: false, emoji: '🌟' },
  { id: 'sem-espinha',  name: 'Sem Espinha', category: 'beauty', engine: 'skin', params: { intensity: 0.5 }, modifiesFace: false, emoji: '💧' },

  // ─── HARMONIZAÇÃO LEVE (3) — gera badge "Filtro Aplicado" ─────────
  { id: 'queixo-v',       name: 'Queixo V',       category: 'harmonization', engine: 'liquify', params: { target: 'chin', intensity: 0.2 }, modifiesFace: true, emoji: '💎' },
  { id: 'olhar-marcado',  name: 'Olhar Marcado',  category: 'harmonization', engine: 'liquify', params: { target: 'eyes', intensity: 0.15 }, modifiesFace: true, emoji: '👁️' },
  { id: 'macas-rosto',    name: 'Maçãs do Rosto', category: 'harmonization', engine: 'liquify', params: { target: 'cheeks', intensity: 0.2 }, modifiesFace: true, emoji: '🍑' },

  // ─── MÁSCARAS 3D (6) ──────────────────────────────────────────────
  { id: 'cachorrinho', name: 'Cachorrinho', category: 'mask3d', engine: 'mask3d', params: { model: 'dog.glb' }, modifiesFace: false, emoji: '🐶' },
  { id: 'coelhinho',   name: 'Coelhinho',   category: 'mask3d', engine: 'mask3d', params: { model: 'bunny.glb' }, modifiesFace: false, emoji: '🐰' },
  { id: 'gatinho',     name: 'Gatinho',     category: 'mask3d', engine: 'mask3d', params: { model: 'cat.glb' }, modifiesFace: false, emoji: '🐱' },
  { id: 'ursinho',     name: 'Ursinho',     category: 'mask3d', engine: 'mask3d', params: { model: 'bear.glb' }, modifiesFace: false, emoji: '🐻' },
  { id: 'palhaco',     name: 'Palhaço',     category: 'mask3d', engine: 'mask3d', params: { model: 'clown.glb' }, modifiesFace: false, emoji: '🤡' },
  { id: 'alien',       name: 'Alien',       category: 'mask3d', engine: 'mask3d', params: { model: 'alien.glb' }, modifiesFace: false, emoji: '👽' },

  // ─── TEXTURAS FACIAIS (3) ─────────────────────────────────────────
  { id: 'carnaval',  name: 'Carnaval',  category: 'texture', engine: 'texture', params: { texture: 'carnaval.png' }, modifiesFace: false, emoji: '🎭' },
  { id: 'sardas',    name: 'Sardas',    category: 'texture', engine: 'texture', params: { texture: 'sardas.png' }, modifiesFace: false, emoji: '✨' },
  { id: 'maquiagem', name: 'Maquiagem', category: 'texture', engine: 'texture', params: { texture: 'makeup.png' }, modifiesFace: false, emoji: '💄' },

  // ─── FX DIVERTIDOS (3) ────────────────────────────────────────────
  { id: 'coracao-olhos', name: 'Coração',  category: 'fx', engine: 'fx', params: { sprite: 'heart', anchor: 'eyes' }, modifiesFace: false, emoji: '😍' },
  { id: 'estrelas',      name: 'Estrelas', category: 'fx', engine: 'fx', params: { sprite: 'star', anchor: 'around-face' }, modifiesFace: false, emoji: '⭐' },
  { id: 'glitter',       name: 'Glitter',  category: 'fx', engine: 'fx', params: { sprite: 'glitter', anchor: 'eyes' }, modifiesFace: false, emoji: '✨' },
];

export const FILTER_NONE: FilterConfig = {
  id: 'none',
  name: 'Sem filtro',
  category: 'beauty',
  engine: 'skin',
  params: { intensity: 0 },
  modifiesFace: false,
  emoji: '⚪',
};
