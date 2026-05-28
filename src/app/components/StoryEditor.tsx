// Editor de Story estilo Instagram. Recebe a midia ja capturada (foto OU
// video) e permite adicionar CAMADAS interativas em cima: texto, mencao,
// hashtag, sticker (emoji), horario. Cada camada eh draggavel, pinchavel
// (redimensiona) e rotacionavel com 2 dedos. Ao publicar, a midia eh
// enviada COMO ESTA + as camadas viram JSON gravado no story (Opcao B —
// mencoes/hashtags ficam clicaveis no viewer).
//
// Arquitetura:
//   - Estado: layers (array), selectedId (qual camada esta focada)
//   - Toolbar superior: Aa (texto) / Sticker / Pincel / Musica / Salvar / X
//   - "Stage" central: midia + camadas posicionadas (coordenadas norm 0-1)
//   - TrashZone aparece quando dragging — soltar dentro deleta
//   - Botao "Seu story" no rodape -> publica
//
// IMPORTANTE: SO uso PointerEvents nativos (consistente com o resto do
// projeto). Pinch e rotacao sao calculados manualmente a partir de 2 pointers
// no mesmo elemento. Sem libs externas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Type, Smile, AtSign, Hash, Clock, Trash2, Send,
  Volume2, VolumeX, Crop, Check, Music,
} from 'lucide-react';
import { MusicPicker } from './spotify/MusicPicker';
import { TrackPlayer } from './spotify/TrackPlayer';
import type { MusicTrack } from '../lib/spotify';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';
import {
  FILTER_NONE as CSS_FILTER_NONE,
  FUN_FILTERS,
  BEAUTY_FILTERS,
  type CameraFilter,
} from './StoryCameraFilters';
import {
  type StoryLayer,
  FONT_FAMILIES, MENTION_COLOR, STORY_COLORS,
  newTextLayer, newStickerLayer, newMentionLayer, newHashtagLayer, newTimeLayer, newTempLayer,
  fontStyleExtras, autoContrastTextColor,
  formatTime, formatTemp,
} from './storyLayers';
import { TextEditorOverlay } from './story/TextEditorOverlay';
import { TrashZone } from './story/TrashZone';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';

interface Props {
  src: string;                 // object URL da midia capturada
  kind: 'image' | 'video';
  currentUser: string;
  posting: boolean;
  partsCount?: number;         // se o video foi dividido em N partes
  onCancel: () => void;
  /** Publica o story com a lista de camadas + música opcional do Spotify.
   *  O StoryComposer caller decide o que fazer com o spotify_track no
   *  insert da story_demo. */
  /** postFilter: CSS filter string a queimar na midia na publicacao.
   *  'none' ou undefined = nao aplica. Caller (Stories) faz o canvas
   *  composite antes do upload pra que o filtro fique persistido. */
  /** bakedImage: blob da imagem ja com mediaTransform (scale/pan) aplicado.
   *  Quando o user ajusta a foto no editor (encolhe/move), o StoryEditor
   *  renderiza no canvas (com fundo preto) e passa o blob aqui. O caller
   *  deve usa-lo no lugar do file original antes do upload. */
  onPost: (layers: StoryLayer[], spotifyTrack?: MusicTrack | null, postFilterCss?: string, bakedImage?: Blob | null) => void;
}

// ──────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────────────

export function StoryEditor({ src, kind, currentUser, posting, partsCount, onCancel, onPost }: Props) {
  // Editor unificado native + PWA: DRAG LIVRE da legenda em todas as
  // plataformas (igual Instagram). Antes PWA usava 3 zonas fixas como
  // fallback pelo iOS Safari (palm-rejection), mas o user pediu unificacao.
  const stageRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<StoryLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  // Picker de mencao separado (botao @ no topo, fora do StickerPanel)
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  // Spotify: música opcional anexada ao story. Toca em loop durante a
  // visualização (Stories.tsx renderiza <TrackPlayer variant="story" />).
  const [spotifyTrack, setMusicTrack] = useState<MusicTrack | null>(null);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  // AJUSTE DA IMAGEM/VIDEO: scale + pan via pinch+drag. Permite o user
  // reenquadrar a foto/video direto no editor antes de postar.
  const [adjustMode, setAdjustMode] = useState(false);
  const [mediaTransform, setMediaTransform] = useState({ scale: 1, x: 0, y: 0 });
  const adjustRef = useRef<{
    kind: 'pinch' | 'pan';
    startDist?: number;
    baseScale?: number;
    startX?: number;
    startY?: number;
    baseX?: number;
    baseY?: number;
  } | null>(null);
  // Som do video do preview. Comeca false (tenta tocar com som). Se iOS
  // bloquear autoplay com audio, o effect abaixo cai pra muted + mostra
  // o botao de som pro user ativar manualmente.
  const [previewMuted, setPreviewMuted] = useState(false);
  // POST-CAPTURE FILTER: filtro CSS aplicado APOS a foto (estilo Instagram
  // edit). User rola horizontal e troca de filtro sem afetar a midia
  // capturada — so muda o `style.filter` da preview. Quando publica,
  // a midia segue COM o filtro queimado (canvas composite no Stories).
  const [postFilter, setPostFilter] = useState<CameraFilter>(CSS_FILTER_NONE);
  // Ordem invertida — beauty primeiro (mais sutis), fun depois.
  // NONE fica no inicio pra acesso rapido a "sem filtro".
  const POST_FILTERS = useMemo<CameraFilter[]>(() => [
    CSS_FILTER_NONE,
    ...[...FUN_FILTERS, ...BEAUTY_FILTERS].reverse(),
  ], []);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Tenta tocar com som no mount. Se falhar (iOS sem gesture-consumida),
  // cai pra muted e revela o botao de som. User precisa tocar 1x.
  useEffect(() => {
    if (kind !== 'video') return;
    const v = previewVideoRef.current;
    if (!v) return;
    v.muted = false;
    const p = v.play();
    if (p && typeof p.then === 'function') {
      p.catch(() => {
        v.muted = true;
        setPreviewMuted(true);
        v.play().catch(() => {});
      });
    }
  }, [kind]);

  // FIX freeze: iOS as vezes pausa o video do preview quando o user
  // interage com layers ou abre teclado (TextEditorOverlay). Sem
  // retry, o video fica congelado num frame ate o user descartar e
  // recriar o story. onPause re-chama play() automaticamente —
  // mantemos o loop rolando.
  useEffect(() => {
    if (kind !== 'video') return;
    const v = previewVideoRef.current;
    if (!v) return;
    const onPause = () => {
      // Pequeno delay pra nao competir com pauses LEGITIMOS (ex:
      // dragging frame). 60ms eh suficiente pro pause "intencional"
      // do iOS terminar antes do play() retomar.
      setTimeout(() => {
        if (v.paused && document.body.contains(v)) {
          v.play().catch(() => {});
        }
      }, 60);
    };
    v.addEventListener('pause', onPause);
    // Tambem retoma quando o tab/app volta ao foreground
    const onVis = () => {
      if (!document.hidden && v.paused) v.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      v.removeEventListener('pause', onPause);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [kind]);

  // Bloqueia eventos NATIVOS de gesto do iOS Safari (gesturestart/change/end).
  // Sao eventos WebKit-only que disparam em alguns cenarios MESMO com 1 dedo —
  // @use-gesture pega isso e interpreta como pinch -> drag de 1 dedo virava
  // resize/rotate sem motivo.
  //
  // IMPORTANTE: passive:false eh obrigatorio. Sem isso, preventDefault eh
  // silenciosamente ignorado pelo browser e o evento ainda chega no
  // @use-gesture (rotacao espuria continua).
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    document.addEventListener('gesturestart', prevent, opts);
    document.addEventListener('gesturechange', prevent, opts);
    document.addEventListener('gestureend', prevent, opts);
    return () => {
      document.removeEventListener('gesturestart', prevent, opts as any);
      document.removeEventListener('gesturechange', prevent, opts as any);
      document.removeEventListener('gestureend', prevent, opts as any);
    };
  }, []);

  // Trava scroll body via useLockBodyScroll (token-based). Antes usava
  // lock local (style.overflow direto) que corrompia o prev-state quando
  // StoryCamera unmonta em paralelo — bug do "scroll trava ao sair".
  useLockBodyScroll(true);

  function addLayer(layer: StoryLayer) {
    setLayers(prev => [...prev, layer]);
    setSelectedId(layer.id);
  }

  function updateLayer(id: string, patch: Partial<StoryLayer>) {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } as StoryLayer : l));
  }

  function deleteLayer(id: string) {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (selectedId === id) setSelectedId(null);
    if (editingTextId === id) setEditingTextId(null);
  }

  // ── HANDLERS DA TOOLBAR ──────────────────────────────────────────
  // Cria nova legenda. NOVO COMPORTAMENTO: soh UMA legenda por story
  // (fixa no rodape). Se ja existe, abre o editor da existente em vez
  // de criar outra.
  function startNewText() {
    const existing = layers.find(l => l.type === 'text');
    if (existing) {
      setEditingTextId(existing.id);
      return;
    }
    // Sempre nasce SEM zone (zone:undefined) -> renderizado via
    // DraggableLayer com pan/pinch/rotate livre na area inteira do stage.
    // Antes era diferenciado entre native (drag livre) e PWA (zone fixa),
    // mas o user pediu unificacao — PWA agora comporta-se igual ao native.
    const t = newTextLayer('', { x: 0.5, y: 0.5, zone: undefined });
    addLayer(t);
    setEditingTextId(t.id);
  }

  // Commit da edicao de texto atual. Chamado quando o user toca no backdrop
  // do TextEditorOverlay. Se o texto ficou vazio, deleta a camada.
  function commitTextEdit() {
    if (!editingTextId) return;
    const cur = layers.find(l => l.id === editingTextId);
    if (cur && cur.type === 'text' && !cur.text.trim()) {
      deleteLayer(editingTextId);
    } else {
      setSelectedId(editingTextId);
    }
    setEditingTextId(null);
  }

  function addEmojiSticker(emoji: string) {
    const s = newStickerLayer(emoji);
    addLayer(s);
    setStickerPanelOpen(false);
  }

  function addTimeSticker() {
    const t = newTimeLayer();
    addLayer(t);
    setStickerPanelOpen(false);
  }

  // Sticker de temperatura: pede geolocalizacao do user e busca temperatura
  // atual via Open-Meteo (API gratuita, sem chave). Resultado salvo no layer
  // (congelado no momento da criacao — nao re-busca quando o story for visto).
  async function addTempSticker() {
    setStickerPanelOpen(false);
    if (!('geolocation' in navigator)) {
      alert('Geolocalizacao nao suportada nesse dispositivo.');
      return;
    }
    // Pede permissao + posicao. Usa cache de 5min pra evitar pedir GPS toda vez.
    const pos = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
      );
    });
    if (!pos) {
      alert('Nao foi possivel obter sua localizacao. Verifique a permissao no navegador.');
      return;
    }
    const { latitude, longitude } = pos.coords;
    try {
      // Open-Meteo: gratuito, sem chave. Retorna temperatura atual.
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=celsius`;
      const wRes = await fetch(weatherUrl);
      if (!wRes.ok) throw new Error('weather fetch failed');
      const wJson = await wRes.json();
      const tempC: number | undefined = wJson?.current_weather?.temperature;
      if (typeof tempC !== 'number') throw new Error('no temperature in response');

      // Cidade (bonus): reverse geocoding via Open-Meteo tambem (gratuito).
      let city: string | undefined;
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?latitude=${latitude}&longitude=${longitude}&count=1&language=pt`;
        const gRes = await fetch(geoUrl);
        if (gRes.ok) {
          const gJson = await gRes.json();
          city = gJson?.results?.[0]?.name;
        }
      } catch { /* sem nome de cidade — sticker mostra so temp */ }

      addLayer(newTempLayer(tempC, city));
    } catch {
      alert('Nao foi possivel buscar a temperatura. Tente novamente.');
    }
  }

  // INERT no #root enquanto o editor esta montado. Bloqueia o form
  // navigation do iOS (^ v ✓ acima do teclado) de "ver" os inputs do
  // FeedNews por baixo — antes, o placeholder "Comentar..." de um post
  // do feed vazava no accessory bar do iOS enquanto o user digitava a
  // legenda do story. Como o StoryEditor portala pra body (irmao de #root),
  // marcar #root como inert nao desativa o editor.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    root.setAttribute('inert', '');
    return () => { root.removeAttribute('inert'); };
  }, []);

  // ── PUBLICAR ─────────────────────────────────────────────────────
  async function publish() {
    // Descarta camadas vazias antes de publicar (texto sem conteudo).
    const clean = layers.filter(l => {
      if (l.type === 'text') return l.text.trim().length > 0;
      return true;
    });
    const cssFilter = postFilter.id !== 'none' ? postFilter.cssFilter : undefined;

    // BAKE do mediaTransform: se o user encolheu/moveu a foto no modo
    // ajuste, renderiza num canvas (cover + transform + fundo preto)
    // pra que o viewer mostre EXATAMENTE o enquadramento escolhido.
    // Sem isso, o transform vivia so no editor — o upload era o arquivo
    // original e o viewer ignorava o ajuste.
    let bakedImage: Blob | null = null;
    const noTransform = mediaTransform.scale === 1 && mediaTransform.x === 0 && mediaTransform.y === 0;
    if (kind === 'image' && !noTransform) {
      try {
        const rect = stageRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = src;
          });
          // Alta resolucao p/ qualidade no viewer.
          const dpr = 2;
          const W = rect.width;
          const H = rect.height;
          const cw = Math.round(W * dpr);
          const ch = Math.round(H * dpr);
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, cw, ch);
            // Reproduz object-fit: contain do <img> do editor — foto
            // INTEIRA centralizada, sem corte. Bordas pretas onde sobrar.
            const containScale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
            const coverW = img.naturalWidth * containScale;
            const coverH = img.naturalHeight * containScale;
            const coverX = (W - coverW) / 2;
            const coverY = (H - coverH) / 2;
            // Replica o CSS transform: scale(s) translate(tx/s, ty/s)
            // com transform-origin no centro do stage.
            // P_final = (P - C) * s + C + (tx, ty)
            const s = mediaTransform.scale;
            const tx = mediaTransform.x;
            const ty = mediaTransform.y;
            ctx.save();
            // Escala global p/ DPR
            ctx.scale(dpr, dpr);
            ctx.translate(W / 2 + tx, H / 2 + ty);
            ctx.scale(s, s);
            ctx.translate(-W / 2, -H / 2);
            ctx.drawImage(img, coverX, coverY, coverW, coverH);
            ctx.restore();
            bakedImage = await new Promise<Blob | null>(res =>
              canvas.toBlob(b => res(b), 'image/jpeg', 0.92)
            );
          }
        }
      } catch (e) {
        console.warn('[story-editor] bake mediaTransform falhou, publicando sem ajuste:', e);
      }
    }

    onPost(clean, spotifyTrack, cssFilter, bakedImage);
  }

  // ── RENDER ────────────────────────────────────────────────────────
  return createPortal(
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center"
      style={{ background: '#000', touchAction: 'none' }}
    >
      <div
        className="relative w-full sm:max-w-md sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#000', height: '100dvh', maxHeight: '100dvh' }}
      >
        {/* Stage — midia + camadas. */}
        <div
          ref={stageRef}
          className="relative flex-1 min-h-0 overflow-hidden"
          style={{ background: '#000', touchAction: 'none' }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            // Tap no fundo soh deseleciona — pra criar legenda use o botao Aa.
            setSelectedId(null);
          }}
        >
          {/* WRAPPER da midia de fundo. Aplica o mediaTransform (scale +
              pan) — o user pode pinçar/arrastar a imagem pra reenquadrar
              quando estiver em adjustMode. Sempre visivel pra render. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              transform: `scale(${mediaTransform.scale}) translate(${mediaTransform.x / mediaTransform.scale}px, ${mediaTransform.y / mediaTransform.scale}px)`,
              transformOrigin: 'center center',
              willChange: 'transform',
              transition: adjustRef.current ? 'none' : 'transform 180ms ease-out',
              // Captura touch eventos QUANDO em modo ajuste — pra pan/pinch
              touchAction: 'none',
              pointerEvents: adjustMode ? 'auto' : 'none',
            } as React.CSSProperties}
            onTouchStart={adjustMode ? (e) => {
              if (e.touches.length === 2) {
                const t1 = e.touches[0], t2 = e.touches[1];
                const dx = t2.clientX - t1.clientX;
                const dy = t2.clientY - t1.clientY;
                adjustRef.current = {
                  kind: 'pinch',
                  startDist: Math.hypot(dx, dy),
                  baseScale: mediaTransform.scale,
                };
              } else if (e.touches.length === 1) {
                adjustRef.current = {
                  kind: 'pan',
                  startX: e.touches[0].clientX,
                  startY: e.touches[0].clientY,
                  baseX: mediaTransform.x,
                  baseY: mediaTransform.y,
                };
              }
            } : undefined}
            onTouchMove={adjustMode ? (e) => {
              const a = adjustRef.current;
              if (!a) return;
              if (e.cancelable) e.preventDefault();
              if (a.kind === 'pinch' && e.touches.length >= 2 && a.startDist && a.baseScale != null) {
                const t1 = e.touches[0], t2 = e.touches[1];
                const dx = t2.clientX - t1.clientX;
                const dy = t2.clientY - t1.clientY;
                const dist = Math.hypot(dx, dy);
                const ratio = dist / a.startDist;
                const newScale = Math.max(0.3, Math.min(4, a.baseScale * ratio));
                setMediaTransform(prev => ({ ...prev, scale: newScale }));
              } else if (a.kind === 'pan' && e.touches.length === 1
                && a.startX != null && a.startY != null && a.baseX != null && a.baseY != null) {
                const dx = e.touches[0].clientX - a.startX;
                const dy = e.touches[0].clientY - a.startY;
                setMediaTransform(prev => ({ ...prev, x: a.baseX! + dx, y: a.baseY! + dy }));
              }
            } : undefined}
            onTouchEnd={adjustMode ? (e) => {
              if (e.touches.length < 2 && adjustRef.current?.kind === 'pinch') {
                adjustRef.current = null;
              }
              if (e.touches.length === 0) {
                adjustRef.current = null;
              }
            } : undefined}
          >
            {kind === 'image' ? (
              // object-fit: contain — mostra a foto INTEIRA (sem crop),
              // igual o Instagram quando o user seleciona da galeria. Bordas
              // pretas aparecem se a proporcao nao for 9:16. O user pode
              // pinçar pra encolher/aumentar conforme quiser.
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'contain', userSelect: 'none',
                  filter: postFilter.cssFilter,
                  WebkitFilter: postFilter.cssFilter,
                }}
              />
            ) : (
              <video
                src={src}
                autoPlay
                loop
                muted={previewMuted}
                playsInline
                ref={previewVideoRef}
                style={{
                  position: 'absolute', inset: 0,
                  width: '100%', height: '100%',
                  objectFit: 'contain',
                  filter: postFilter.cssFilter,
                  WebkitFilter: postFilter.cssFilter,
                }}
              />
            )}
          </div>

          {/* Camadas — TODAS usam DraggableLayer (mesmo componente dos
              emojis que funciona perfeito). A camada de texto sendo
              editada eh escondida aqui — aparece no TextEditorOverlay. */}
          {layers.map(layer => {
            if (layer.id === editingTextId) return null;
            // TODOS os tipos (incluindo texto) usam o DraggableLayer com pan/
            // pinch/rotate livre. Antes texto em PWA usava 3 zonas fixas como
            // fallback pelo iOS Safari (palm-rejection/pinch-zoom). User pediu
            // unificacao — PWA agora comporta-se igual native, com legenda
            // arrastavel em qualquer x/y, escalavel via pinch, rotacionavel
            // com 2 dedos.
            return (
              <DraggableLayer
                key={layer.id}
                layer={layer}
                stageRef={stageRef}
                selected={selectedId === layer.id}
                onSelect={() => setSelectedId(layer.id)}
                onUpdate={(patch) => updateLayer(layer.id, patch)}
                onDragStart={() => setDraggingId(layer.id)}
                onDragOverTrashChange={(over) => setOverTrash(over)}
                onDragEnd={(droppedOnTrash) => {
                  setDraggingId(null);
                  setOverTrash(false);
                  if (droppedOnTrash) deleteLayer(layer.id);
                }}
                onTap={() => { /* stickers: tap sem acao */ }}
              />
            );
          })}
        </div>

        {/* TOOLBAR SUPERIOR — sempre X, Aa, Stickers (a toolbar de fontes
            quando esta editando vive DENTRO do TextEditorOverlay). Esconde
            enquanto o overlay esta aberto pra evitar dupla apresentacao. */}
        {!editingTextId && (
          <div
            className="absolute left-0 right-0 top-0 px-3 flex items-center justify-between gap-2 z-30"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
          >
            <button
              type="button"
              onClick={onCancel}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
              aria-label="Descartar"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <div className="flex items-center gap-2">
              {/* IMPORTANTE: arrow function (sem passar startNewText nu) — onClick
                  do React injeta o SyntheticEvent como 1o arg, e o spread no
                  newTextLayer estava substituindo o "type: 'text'" do layer
                  pelo "type: 'click'" do evento. Resultado: o overlay filtrava
                  por type==='text' e nao renderizava nada. */}
              <ToolButton onClick={() => startNewText()} label="Texto">
                <Type className="w-5 h-5" />
              </ToolButton>
              {/* @ Mencao agora eh um BOTAO SEPARADO no topo (antes vivia
                  como aba dentro do StickerPanel — muito escondido). */}
              <ToolButton onClick={() => setMentionPickerOpen(true)} label="Mencionar">
                <AtSign className="w-5 h-5" />
              </ToolButton>
              <ToolButton onClick={() => setStickerPanelOpen(true)} label="Stickers">
                <Smile className="w-5 h-5" />
              </ToolButton>
              {/* MÚSICA (Spotify) — abre picker, anexa track ao story.
                  A música toca em loop durante a visualização (player
                  via TrackPlayer variant="story" no Stories.tsx). */}
              <ToolButton onClick={() => setMusicPickerOpen(true)} label="Música">
                <Music className="w-5 h-5" />
              </ToolButton>
              {/* AJUSTAR: entra em modo de pinch+pan na imagem/video pra
                  reenquadrar antes de postar. */}
              <ToolButton onClick={() => setAdjustMode(true)} label="Ajustar">
                <Crop className="w-5 h-5" />
              </ToolButton>
            </div>
          </div>
        )}

        {/* BARRA DE AJUSTE — substitui as toolbars quando adjustMode=true.
            User pode pinçar + arrastar a midia. Botoes pra cancelar (volta
            transform), resetar (zoom 1, pos 0), ou confirmar (sai do modo). */}
        {adjustMode && (
          <div
            className="absolute left-0 right-0 top-0 px-3 z-30 flex items-center justify-between gap-2"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)' }}
          >
            <button
              type="button"
              onClick={() => { setMediaTransform({ scale: 1, x: 0, y: 0 }); setAdjustMode(false); }}
              className="px-3 h-10 rounded-full text-white text-sm font-semibold"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            >
              Cancelar
            </button>
            <span className="text-white text-xs font-semibold uppercase tracking-widest" style={{ letterSpacing: '0.12em' }}>
              Pince p/ ajustar • arraste
            </span>
            <button
              type="button"
              onClick={() => setAdjustMode(false)}
              className="px-4 h-10 rounded-full text-black text-sm font-bold flex items-center gap-1.5"
              style={{ background: '#ffffff' }}
            >
              <Check className="w-4 h-4" /> Pronto
            </button>
          </div>
        )}

        {/* selectedMentionOrHashtag: usado pra DOIS propositos abaixo —
            (1) mostrar a paleta de cores quando uma mention/hashtag esta
            selecionada; (2) ESCONDER o filter strip nesse momento (caso
            contrario os dois ficam empilhados no mesmo `bottom` e a
            paleta de cores fica visualmente sobreposta aos filtros, com
            cliques indo pro elemento errado — bug reportado no native). */}
        {(() => {
          const sel = selectedId ? layers.find(l => l.id === selectedId) : null;
          const isColorablePicked = !editingTextId && !adjustMode && !!sel
            && (sel.type === 'mention' || sel.type === 'hashtag');

          return (
            <>
              {/* PALETA DE CORES — aparece quando uma MENCAO ou HASHTAG esta
                  selecionada. User toca numa cor pra mudar a cor da camada. */}
              {isColorablePicked && sel && (
                <div
                  className="absolute left-0 right-0 z-30 px-3"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 70px)' }}
                >
                  <div
                    className="flex items-center gap-2 overflow-x-auto papo-mention-colors"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    <style>{`.papo-mention-colors::-webkit-scrollbar{display:none}`}</style>
                    {STORY_COLORS.map(c => {
                      const active = sel.color?.toLowerCase() === c.toLowerCase();
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateLayer(sel.id, { color: c } as Partial<StoryLayer>)}
                          aria-label={`Cor ${c}`}
                          className="flex-shrink-0 rounded-full active:scale-95"
                          style={{
                            width: active ? 32 : 26,
                            height: active ? 32 : 26,
                            background: c,
                            border: active ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.5)',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                            transition: 'width 120ms ease, height 120ms ease',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* POST-CAPTURE FILTER STRIP — carrossel horizontal de filtros CSS
                  estilo Instagram edit. User rola e ve o filtro aplicado em
                  tempo real na preview (via style.filter — sem reprocessar a
                  midia). Filtro escolhido eh queimado na publicacao via canvas.
                  ESCONDIDO quando a paleta de cores de mention/hashtag estah
                  visivel (mesmo `bottom`/z-index — evita sobreposicao). */}
              {!editingTextId && !adjustMode && !isColorablePicked && (
          <div
            className="absolute left-0 right-0 z-30 px-2"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 70px)' }}
          >
            <div
              className="flex items-center gap-2 overflow-x-auto papo-post-filters"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
            >
              <style>{`.papo-post-filters::-webkit-scrollbar{display:none}`}</style>
              {POST_FILTERS.map(f => {
                const active = postFilter.id === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPostFilter(f)}
                    className="flex-shrink-0 flex items-center justify-center active:scale-90 transition-transform"
                    style={{
                      width: active ? 56 : 44,
                      height: active ? 56 : 44,
                      borderRadius: '50%',
                      background: f.color,
                      border: active ? '2.5px solid #fff' : '1.5px solid rgba(255,255,255,0.5)',
                      boxShadow: active ? '0 0 12px rgba(255,255,255,0.6)' : '0 2px 6px rgba(0,0,0,0.45)',
                      fontSize: active ? 22 : 18,
                      padding: 0,
                      transition: 'all 140ms ease-out',
                    }}
                    aria-label={f.name}
                    title={f.name}
                  >
                    {f.emoji}
                  </button>
                );
              })}
            </div>
            {postFilter.id !== 'none' && (
              <div
                className="text-center mt-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}
              >
                {postFilter.name}
              </div>
            )}
          </div>
              )}
            </>
          );
        })()}

        {/* FOOTER — botao "Seu story" no canto direito. Some quando o user
            esta editando texto (TextEditorOverlay assume a tela). */}
        {!editingTextId && (
          <div
            className="absolute left-0 right-0 bottom-0 px-3 z-30 flex items-center justify-between gap-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', paddingTop: 12 }}
          >
            {partsCount && partsCount > 1 ? (
              <span
                className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', letterSpacing: '0.14em' }}
              >
                Será dividido em {partsCount} partes
              </span>
            ) : <div />}

            <button
              type="button"
              onClick={publish}
              disabled={posting}
              className="px-4 py-2.5 rounded-full text-white font-bold text-sm disabled:opacity-50 flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
                fontFamily: '"DM Sans", system-ui, sans-serif',
                letterSpacing: '0.10em',
              }}
            >
              {posting ? 'Postando…' : <>Seu story <Send className="w-4 h-4" /></>}
            </button>
          </div>
        )}

        {/* SOM TOGGLE — so aparece pra video. Permite o user ativar/mutar
            o audio do video gravado. Por default tentamos tocar com som
            (useEffect acima); se iOS bloqueou autoplay-com-som, o icone
            vira mudo e o user toca pra ativar (gesto valido). */}
        {kind === 'video' && (
          <button
            type="button"
            onClick={() => {
              const v = previewVideoRef.current;
              if (!v) return;
              const nextMuted = !previewMuted;
              v.muted = nextMuted;
              setPreviewMuted(nextMuted);
              // Garante que continua tocando depois do toggle
              v.play().catch(() => {});
            }}
            className="absolute z-30 w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 64px)',
              right: 12,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(6px)',
            }}
            aria-label={previewMuted ? 'Ativar som' : 'Silenciar'}
          >
            {previewMuted
              ? <VolumeX className="w-5 h-5 text-white" />
              : <Volume2 className="w-5 h-5 text-white" />}
          </button>
        )}

        {/* TRASH ZONE (motion + AnimatePresence) — aparece ao arrastar */}
        <TrashZone visible={!!draggingId} overTrash={overTrash} />
      </div>

      {/* TEXT EDITOR OVERLAY — fullscreen quando o user esta digitando uma
          legenda. Aberto via Aa (startNewText) ou tap em legenda existente.
          mediaSrc/mediaKind: a midia do story como fundo da area editavel
          (preview WYSIWYG enquanto o user digita). */}
      <TextEditorOverlay
        layer={(() => {
          if (!editingTextId) return null;
          const l = layers.find(x => x.id === editingTextId);
          return l && l.type === 'text' ? l : null;
        })()}
        onChange={(patch) => editingTextId && updateLayer(editingTextId, patch as Partial<StoryLayer>)}
        onCommit={commitTextEdit}
        mediaSrc={src}
        mediaKind={kind}
      />

      {/* STICKER PANEL — emojis + mencao + hashtag + horario + temperatura */}
      {stickerPanelOpen && (
        <StickerPanel
          currentUser={currentUser}
          onClose={() => setStickerPanelOpen(false)}
          onPickEmoji={addEmojiSticker}
          onPickMention={(username) => {
            addLayer(newMentionLayer(username));
            setStickerPanelOpen(false);
          }}
          onPickHashtag={(tag) => {
            addLayer(newHashtagLayer(tag));
            setStickerPanelOpen(false);
          }}
          onPickTime={addTimeSticker}
          onPickTemp={addTempSticker}
        />
      )}

      {/* MENTION PICKER — atalho dedicado pro @ (separado do StickerPanel
          a pedido do user). Bottom sheet com lista de amigos pra mencionar. */}
      {mentionPickerOpen && (
        <MentionPickerSheet
          currentUser={currentUser}
          onClose={() => setMentionPickerOpen(false)}
          onPick={(username) => {
            addLayer(newMentionLayer(username));
            setMentionPickerOpen(false);
          }}
        />
      )}

      {/* PREVIEW da música anexada (durante edição) — TrackPlayer inline
          com botao de play/pause funcional, pra o user OUVIR como vai
          ficar antes de postar.
          AUTOPLAY EM TODAS AS PLATAFORMAS: a musica toca imediatamente
          apos selecionar no MusicPicker e segue em loop enquanto o user
          edita. O StoryMusicChip ja lida com loop + seek pro start_ms
          escolhido no trim — "previa do que vai ser publicado" toca
          ao vivo. Em browsers que bloqueiam autoplay sem gesto, o
          TrackPlayer tem retry interno via playAudioWithGestureRetry
          que dispara o play no proximo touch/click do user.
          + Botao X pra remover a musica do draft. */}
      {spotifyTrack && (
        <div className="absolute left-3 bottom-20 z-30 flex items-center gap-1.5">
          <TrackPlayer
            key={`preview-${spotifyTrack.track_id}-${spotifyTrack.start_ms || 0}`}
            track={spotifyTrack}
            variant="story"
            inline
            autoPlay={true}
          />
          <button
            type="button"
            onClick={() => setMusicTrack(null)}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)', color: '#fff', backdropFilter: 'blur(6px)' }}
            aria-label="Remover música"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MUSIC PICKER (Spotify) */}
      <MusicPicker
        open={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(t) => setMusicTrack(t)}
      />
    </div>,
    document.body,
  );
}

// ──────────────────────────────────────────────────────────────────────
// TOOLBUTTON — botao redondinho da toolbar
// ──────────────────────────────────────────────────────────────────────
function ToolButton({ onClick, children, label }: { onClick: () => void; children: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-95"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MENTION PICKER SHEET — bottom sheet simples soh com @ mencao
// ──────────────────────────────────────────────────────────────────────
// Acionado pelo botao @ no top toolbar (separado do StickerPanel).
// Mostra lista de amigos pra mencionar. Tap em um adiciona MentionLayer.
function MentionPickerSheet({
  currentUser, onClose, onPick,
}: {
  currentUser: string;
  onClose: () => void;
  onPick: (username: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<{ username: string; nome?: string | null }[]>([]);

  useEffect(() => {
    const list = getFriends(currentUser).map(u => ({ username: u }));
    setFriends(list);
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,nome')
          .in('username', list.map(f => f.username));
        if (data) setFriends(data as any[]);
      } catch {}
    })();
  }, [currentUser]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(f =>
      f.username.toLowerCase().includes(q) || (f.nome || '').toLowerCase().includes(q)
    );
  }, [query, friends]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100100] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', touchAction: 'none' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: '#15151a', maxHeight: '75vh', minHeight: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-3 border-b border-white/10">
          <p className="text-xs uppercase tracking-widest font-semibold text-white/60 mb-2 px-1">
            Mencionar
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar amigo…"
            className="w-full px-3 py-2 rounded-full text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2" style={{ overscrollBehavior: 'contain' }}>
          {filtered.length === 0 ? (
            <p className="text-sm text-white/45 text-center py-8">
              {friends.length === 0 ? 'Você ainda não tem amigos pra mencionar.' : 'Nenhum amigo encontrado.'}
            </p>
          ) : (
            filtered.map(f => (
              <button
                key={f.username}
                type="button"
                onClick={() => onPick(f.username)}
                className="w-full px-3 py-2 flex items-center gap-2.5 text-left rounded-xl active:bg-white/5"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #1e714a, #4ade80)' }}
                >
                  {f.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{f.nome || f.username}</p>
                  <p className="text-xs text-white/55 truncate">@{f.username}</p>
                </div>
              </button>
            ))
          )}
        </div>
        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>,
    document.body,
  );
}

// ──────────────────────────────────────────────────────────────────────
// DRAGGABLE LAYER — renderiza uma camada com suporte a drag/pinch/rotate
// ──────────────────────────────────────────────────────────────────────
interface DraggableLayerProps {
  layer: StoryLayer;
  stageRef: React.RefObject<HTMLDivElement>;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<StoryLayer>) => void;
  onDragStart: () => void;
  onDragEnd: (droppedOnTrash: boolean) => void;
  onDragOverTrashChange: (over: boolean) => void;
  /** Disparado quando o user toca e solta SEM arrastar (tap simples).
   *  Pra texto, usado pra reabrir o cursor — clique em qualquer letra
   *  da legenda volta pro modo edicao (a pedido do user). */
  onTap: () => void;
}

function DraggableLayer({
  layer, stageRef, selected, onSelect, onUpdate,
  onDragStart, onDragEnd, onDragOverTrashChange, onTap,
}: DraggableLayerProps) {
  // ESTRATEGIA: usar TouchEvent (e.touches) como fonte de verdade. iOS
  // gerencia a lista de touches ativos diretamente — nao precisamos
  // rastrear pointer ids manualmente como nos PointerEvents (que sofriam
  // de palm rejection vazando 2o touch fantasma → falso pinch).
  //
  // 1 touch = pan. 2 touches = pinch + rotate.
  // Mouse (desktop) usa MouseEvent separado — so pan, sem pinch.
  //
  // CRITICO (Andreza bug): React 18 adiciona touch listeners via JSX em
  // PASSIVE mode por padrao — entao e.preventDefault() no onTouchMove
  // NAO funciona, e o iOS rola/bounces a pagina durante o drag em vez
  // de mover o layer. Por isso usamos elementRef + addEventListener
  // manual com { passive: false } pra GARANTIR que preventDefault rola.

  const elementRef = useRef<HTMLDivElement>(null);

  // Snapshot do estado no inicio do gesto atual. Refeito quando touches
  // entram/saem (transicao pan ↔ pinch).
  // panTouchId: identifier do touch ORIGINAL do pan — se 2o dedo entrar
  // (palm-rejection bug do iOS), seguimos o touch original pelo ID em
  // vez de touches[0] cego. iOS pode reordenar a lista, e usar [0]
  // fazia o texto teleportar pra posicao da palm.
  const gestureRef = useRef<{
    kind: 'pan' | 'pinch';
    // pan
    startX?: number; startY?: number; baseX?: number; baseY?: number;
    panTouchId?: number;
    // pinch
    startDist?: number; startAngle?: number; baseScale?: number; baseRotation?: number;
    pinchTouchIds?: [number, number];
  } | null>(null);
  const movedRef = useRef(false);

  function stageRect() {
    return stageRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }

  /** Decide o gesto baseado em quantos touches ativos. Salva tambem o
   *  identifier dos touches — usado pra ANCORAR o gesto a um touch
   *  especifico mesmo se a lista mudar de ordem (iOS faz isso quando
   *  palm/2o dedo entra). Sem isso, texto teleportava pra posicao da
   *  palm porque applyMove usava touches[0] cego. */
  function initGesture(touches: { x: number; y: number; id: number }[]) {
    if (touches.length >= 2) {
      const [a, b] = touches;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      gestureRef.current = {
        kind: 'pinch',
        startDist: Math.hypot(dx, dy),
        startAngle: Math.atan2(dy, dx),
        baseScale: layer.scale,
        baseRotation: layer.rotation,
        pinchTouchIds: [a.id, b.id],
      };
    } else if (touches.length === 1) {
      gestureRef.current = {
        kind: 'pan',
        startX: touches[0].x, startY: touches[0].y,
        baseX: layer.x, baseY: layer.y,
        panTouchId: touches[0].id,
      };
    } else {
      gestureRef.current = null;
    }
  }

  function readTouches(list: React.TouchList | TouchList) {
    const out: { x: number; y: number; id: number }[] = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      out.push({ x: t.clientX, y: t.clientY, id: t.identifier });
    }
    return out;
  }

  function applyMove(touches: { x: number; y: number; id: number }[]) {
    const g = gestureRef.current;
    if (!g) return;
    const rect = stageRect();

    if (g.kind === 'pinch' && g.pinchTouchIds) {
      // Texto NUNCA aceita pinch (resize+rotate). iOS dispara pinch
      // espurio com palma/2o dedo acidental quando o texto eh largo.
      // Pra texto soh pan eh permitido. Resize sera via botoes da toolbar.
      if (layer.type === 'text') return;
      // Pega os 2 touches ORIGINAIS do pinch pelo identifier (lista pode
      // ter mais touches misturados — palm, etc).
      const a = touches.find(t => t.id === g.pinchTouchIds![0]);
      const b = touches.find(t => t.id === g.pinchTouchIds![1]);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      if (g.startDist && g.baseScale != null && g.startAngle != null && g.baseRotation != null) {
        const ratio = dist / g.startDist;
        const newScale = Math.max(0.3, Math.min(5, g.baseScale * ratio));
        const newRotation = g.baseRotation + (angle - g.startAngle);
        onUpdate({ scale: newScale, rotation: newRotation } as any);
      }
    } else if (g.kind === 'pan') {
      // CRITICO: ancorar no touch ORIGINAL pelo identifier. Antes
      // usava touches[0] cego — quando palm/2o dedo entrava, iOS
      // reordenava a lista e touches[0] virava OUTRO touch, fazendo
      // o texto teleportar pra posicao da palm ("letra em cima de
      // letra" reportado pelo user em native).
      const t = g.panTouchId != null
        ? touches.find(x => x.id === g.panTouchId)
        : touches[0];
      if (!t) return;
      if (g.startX != null && g.startY != null && g.baseX != null && g.baseY != null) {
        const dxPx = t.x - g.startX;
        const dyPx = t.y - g.startY;
        // Threshold pra distinguir TAP de DRAG: precisa mover mais de 6px
        // pra contar como arrastar. iOS dispara touchmove ate em "taps"
        // simples por causa de jitter dos dedos — sem esse threshold,
        // um tap simples seria interpretado como drag minusculo e
        // bloquearia onTap, impedindo a re-edicao.
        if (!movedRef.current && Math.hypot(dxPx, dyPx) < 6) return;
        const dxNorm = dxPx / rect.width;
        const dyNorm = dyPx / rect.height;
        const newX = Math.max(0, Math.min(1, g.baseX + dxNorm));
        const newY = Math.max(0, Math.min(1, g.baseY + dyNorm));
        const trashCx = rect.left + rect.width / 2;
        const trashCy = rect.bottom - 80;
        const overTrash = Math.hypot(t.x - trashCx, t.y - trashCy) < 60;
        onDragOverTrashChange(overTrash);
        onUpdate({ x: newX, y: newY } as any);
        movedRef.current = true;
      }
    }
  }

  function isOverTrashZone(x: number, y: number) {
    const rect = stageRect();
    const trashCx = rect.left + rect.width / 2;
    const trashCy = rect.bottom - 80;
    return Math.hypot(x - trashCx, y - trashCy) < 60;
  }

  // ── POINTER EVENTS pra TEXT (setPointerCapture isolando o pointer) ──
  // TEXT usa Pointer Events com setPointerCapture pra imunizar contra
  // palm rejection / 2o touch fantasma. Quando um pointerdown captura
  // o pointer, o navegador rotea TODOS os pointermove daquele pointerId
  // pro nosso elemento e IGNORA outros pointers. Eh o approach que
  // Figma/Excalidraw/Stripe usam.
  //
  // CRITICO — refs vs closures: a tentativa anterior usava variaveis
  // locais (let capturedPid) DENTRO do useEffect. SEM dependency array
  // o effect re-rodava a CADA onUpdate(x,y) -> destruia handlers no
  // meio do drag, capturedPid resetava pra null, drag travava no 2o
  // pointermove. Agora usamos useRef pra estado persistente E deps
  // [layer.type] pra so re-mount em mudanca real de tipo.
  //
  // Acesso a layer.x/y/onUpdate dentro dos handlers: via layerRef/
  // callbacksRef que sao atualizados a cada render mas NAO disparam
  // re-mount do effect. Closures sempre veem dados frescos.
  // Estado persistente do gesto (sobrevive re-renders).
  // active: Map pointerId -> {x, y} atual de cada pointer ATIVO no elemento.
  // panData: snapshot pro pan (1 pointer). pinchData: pro pinch (2 pointers).
  const gestureRefP = useRef<{
    active: Map<number, { x: number; y: number }>;
    kind: 'idle' | 'pan' | 'pinch';
    panData: { startX: number; startY: number; baseX: number; baseY: number; pid: number } | null;
    pinchData: { startDist: number; startAngle: number; baseScale: number; baseRotation: number; baseX: number; baseY: number; centerStartX: number; centerStartY: number; ids: [number, number] } | null;
  }>({ active: new Map(), kind: 'idle', panData: null, pinchData: null });
  const layerRef = useRef(layer);
  const callbacksRef = useRef({ onSelect, onDragStart, onUpdate, onDragEnd, onDragOverTrashChange, onTap });
  useEffect(() => {
    layerRef.current = layer;
    callbacksRef.current = { onSelect, onDragStart, onUpdate, onDragEnd, onDragOverTrashChange, onTap };
  });

  useEffect(() => {
    if (layer.type !== 'text') return;
    const el = elementRef.current;
    if (!el) return;
    const g = gestureRefP.current;

    const snapshotPinch = () => {
      const ids = Array.from(g.active.keys()) as number[];
      if (ids.length < 2) return;
      const [id1, id2] = [ids[0], ids[1]] as [number, number];
      const p1 = g.active.get(id1)!;
      const p2 = g.active.get(id2)!;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      g.pinchData = {
        startDist: Math.hypot(dx, dy),
        startAngle: Math.atan2(dy, dx),
        baseScale: layerRef.current.scale || 1,
        baseRotation: layerRef.current.rotation || 0,
        baseX: layerRef.current.x,
        baseY: layerRef.current.y,
        centerStartX: (p1.x + p2.x) / 2,
        centerStartY: (p1.y + p2.y) / 2,
        ids: [id1, id2],
      };
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      g.active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch {}

      if (g.active.size === 1) {
        // INICIA PAN — 1 pointer
        callbacksRef.current.onSelect();
        callbacksRef.current.onDragStart();
        movedRef.current = false;
        g.kind = 'pan';
        g.panData = {
          startX: e.clientX,
          startY: e.clientY,
          baseX: layerRef.current.x,
          baseY: layerRef.current.y,
          pid: e.pointerId,
        };
        g.pinchData = null;
      } else if (g.active.size === 2) {
        // TRANSICAO PRA PINCH+ROTATE — 2 pointers ativos
        g.kind = 'pinch';
        g.panData = null;
        snapshotPinch();
        // pinch ja conta como movimento — supress reopen do editor via onTap
        movedRef.current = true;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!g.active.has(e.pointerId)) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      g.active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rect = stageRect();

      if (g.kind === 'pinch' && g.pinchData) {
        const [id1, id2] = g.pinchData.ids;
        const p1 = g.active.get(id1);
        const p2 = g.active.get(id2);
        if (!p1 || !p2) return;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const ratio = dist / g.pinchData.startDist;
        const newScale = Math.max(0.3, Math.min(6, g.pinchData.baseScale * ratio));
        const newRotation = g.pinchData.baseRotation + (angle - g.pinchData.startAngle);
        // Pan junto durante pinch: a posicao segue o centro dos 2 pointers
        // (igual Instagram/Photos — pinch+pan simultaneos).
        const centerX = (p1.x + p2.x) / 2;
        const centerY = (p1.y + p2.y) / 2;
        const dxC = centerX - g.pinchData.centerStartX;
        const dyC = centerY - g.pinchData.centerStartY;
        const newX = Math.max(0, Math.min(1, g.pinchData.baseX + dxC / rect.width));
        const newY = Math.max(0, Math.min(1, g.pinchData.baseY + dyC / rect.height));
        callbacksRef.current.onUpdate({ scale: newScale, rotation: newRotation, x: newX, y: newY } as any);
        movedRef.current = true;
      } else if (g.kind === 'pan' && g.panData) {
        if (e.pointerId !== g.panData.pid) return;
        const dxPx = e.clientX - g.panData.startX;
        const dyPx = e.clientY - g.panData.startY;
        if (!movedRef.current && Math.hypot(dxPx, dyPx) < 6) return;
        const newX = Math.max(0, Math.min(1, g.panData.baseX + dxPx / rect.width));
        const newY = Math.max(0, Math.min(1, g.panData.baseY + dyPx / rect.height));
        const trashCx = rect.left + rect.width / 2;
        const trashCy = rect.bottom - 80;
        const overTrash = Math.hypot(e.clientX - trashCx, e.clientY - trashCy) < 60;
        callbacksRef.current.onDragOverTrashChange(overTrash);
        callbacksRef.current.onUpdate({ x: newX, y: newY } as any);
        movedRef.current = true;
      }
    };

    const handlePointerEnd = (e: PointerEvent) => {
      if (!g.active.has(e.pointerId)) return;
      e.stopPropagation();
      g.active.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch {}

      if (g.active.size === 1) {
        // Era pinch e ficou 1 pointer — volta pra pan, re-snapshot
        // baseado no pointer restante e nos valores ATUAIS da layer.
        const remId = Array.from(g.active.keys())[0];
        const rem = g.active.get(remId)!;
        g.kind = 'pan';
        g.panData = {
          startX: rem.x,
          startY: rem.y,
          baseX: layerRef.current.x,
          baseY: layerRef.current.y,
          pid: remId,
        };
        g.pinchData = null;
      } else if (g.active.size === 0) {
        // Fim do gesto
        const wasOver = isOverTrashZone(e.clientX, e.clientY);
        g.kind = 'idle';
        g.panData = null;
        g.pinchData = null;
        callbacksRef.current.onDragEnd(wasOver);
        callbacksRef.current.onDragOverTrashChange(false);
        if (!movedRef.current) callbacksRef.current.onTap();
      }
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerEnd);
    el.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerEnd);
      el.removeEventListener('pointercancel', handlePointerEnd);
      g.active.clear();
      g.kind = 'idle';
      g.panData = null;
      g.pinchData = null;
    };
  }, [layer.type]);

  // ── TOUCH HANDLERS (mobile) — STICKERS/MENTION/HASHTAG/TIME/TEMP ──
  // TEXT usa o useEffect de pointer events acima. Touch handlers SO
  // rodam pra non-text — esses precisam de pinch (calculado de 2
  // touches) e o codigo aqui ja foi battle-tested pra eles.
  //
  // IMPORTANTE: definidos como NATIVE listeners (não JSX props) pra que
  // possam ser registrados com { passive: false }, garantindo que
  // e.preventDefault() funcione. Sem isso, iOS rola a pagina durante drag.
  useEffect(() => {
    if (layer.type === 'text') return;
    const el = elementRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.stopPropagation();
      onSelect();
      const isText = layer.type === 'text';
      const touches = readTouches(e.touches);
      if (!gestureRef.current) {
        if (e.touches.length === 1) onDragStart();
        movedRef.current = false;
        initGesture(touches);
      } else if (!isText && gestureRef.current.kind === 'pan' && touches.length >= 2) {
        initGesture(touches);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.stopPropagation();
      // PASSIVE: false → preventDefault realmente bloqueia scroll/bounce do iOS.
      if (e.cancelable) e.preventDefault();
      // applyMove ja filtra os touches certos pelo identifier (panTouchId
      // pra pan, pinchTouchIds pra pinch). Antes filtravamos aqui com
      // allTouches[0] cego quando aparecia 2o touch durante pan — isso
      // pegava a palma em vez do dedo original quando iOS reordenava.
      applyMove(readTouches(e.touches));
    };

    const handleTouchEnd = (e: TouchEvent) => {
      e.stopPropagation();
      const last = e.changedTouches[0];
      const wasOver = last ? isOverTrashZone(last.clientX, last.clientY) : false;
      if (e.touches.length === 1 && gestureRef.current?.kind === 'pinch' && layer.type !== 'text') {
        const remaining = readTouches(e.touches);
        initGesture(remaining);
      }
      if (e.touches.length === 0) {
        gestureRef.current = null;
        onDragEnd(wasOver);
        onDragOverTrashChange(false);
        if (!movedRef.current) {
          onTap();
        }
      }
    };

    // PASSIVE: false em touchstart + touchmove → e.preventDefault() rola.
    // Crucial pra mention/hashtag/sticker arrastarem livremente no iOS.
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: false });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
    // Dependencias: layer.type pode mudar (raramente), mas o resto eh
    // closures que precisam dos refs/props mais recentes. Re-bind a cada
    // render eh barato — touch handlers nao executam to often.
  });

  // ── MOUSE HANDLERS (desktop) ──────────────────────────────────────
  // Pan apenas (desktop nao tem pinch nativo). Listeners no DOCUMENT
  // pra capturar movimento mesmo se o mouse sair da camada.
  // TEXT desktop: pointer events ja cobrem mouse — ignoramos mousedown
  // pra evitar duplo handling.
  function onMouseDown(e: React.MouseEvent) {
    if (layer.type === 'text') return;
    // Filtra eventos sinteticos do iOS (touch dispara mouse depois)
    if ((e.nativeEvent as any).sourceCapabilities?.firesTouchEvents) return;
    e.stopPropagation();
    onSelect();
    onDragStart();
    movedRef.current = false;
    initGesture([{ x: e.clientX, y: e.clientY }]);

    const onMove = (ev: MouseEvent) => {
      applyMove([{ x: ev.clientX, y: ev.clientY }]);
    };
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const wasOver = isOverTrashZone(ev.clientX, ev.clientY);
      onDragEnd(wasOver);
      onDragOverTrashChange(false);
      gestureRef.current = null;
      // Single click sem mover (no desktop) = mesmo comportamento que tap
      if (!movedRef.current) {
        onTap();
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Posicao em px relativa ao stage
  const rect = stageRef.current?.getBoundingClientRect();
  const stageW = rect?.width ?? 0;
  const stageH = rect?.height ?? 0;
  const px = layer.x * stageW;
  const py = layer.y * stageH;

  return (
    <div
      ref={elementRef}
      onMouseDown={onMouseDown}
      draggable={false}
      style={{
        position: 'absolute',
        left: px,
        top: py,
        // Position:absolute SEM width explicita = SHRINK-TO-FIT do CSS.
        // O browser calcula a largura baseado no ESPACO DISPONIVEL a
        // direita do `left`. Sem width:max-content, ao arrastar pra
        // direita, esse espaco diminuia, o <span> filho era SHRINKED,
        // e o text-wrap recalculava — "amor" virava "amo / r".
        // width:max-content garante largura SEMPRE = conteudo (text
        // wrap so muda quando o user edita o texto, nunca por drag/
        // rotate/pinch — transform afeta APENAS visual, nao layout).
        width: layer.type === 'text' ? 'max-content' : undefined,
        // Sem maxWidth — texto continuo pode extrapolar a tela (igual IG/
        // native); user redimensiona/posiciona com pinch+pan. Antes PWA
        // tinha maxWidth 85vw mas isso ja nao se aplica — pwa unificado
        // com native.
        maxWidth: undefined,
        // TEXT agora aceita rotate + scale via pinch (2 dedos). Aplicado
        // via transform — afeta SO visual, layout do span fica preso pelo
        // width:max-content, entao nao reintroduz o bug de re-wrap.
        transform: layer.type === 'text'
          ? `translate3d(-50%, -50%, 0) rotate(${layer.rotation || 0}rad) scale(${layer.scale || 1})`
          : `translate(-50%, -50%) rotate(${layer.rotation}rad) scale(${layer.scale})`,
        transformOrigin: 'center center',
        willChange: layer.type === 'text' ? 'transform' : undefined,
        touchAction: 'none',
        cursor: 'grab',
        outline: selected ? '2px dashed rgba(255,255,255,0.85)' : 'none',
        outlineOffset: 6,
        borderRadius: 6,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitUserDrag: 'none',
        // padding invisível pra aumentar hitbox (mais facil de tocar a tag)
        padding: 6,
        margin: -6,
      } as React.CSSProperties}
    >
      <LayerVisual layer={layer} />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// LAYER VISUAL — renderiza o conteudo visual da camada (sem interacao).
// Reaproveitavel pelo StoryViewer pra mostrar o resultado final.
// ──────────────────────────────────────────────────────────────────────
export function LayerVisual({ layer }: { layer: StoryLayer }) {
  if (layer.type === 'text') {
    const bg = layer.background === 'none' ? 'transparent'
      : layer.background === 'solid' ? layer.backgroundColor
      : layer.backgroundColor;
    const padding = layer.background === 'none' ? 0 : '6px 12px';
    // Texto CONTINUO em todas as plataformas (PWA + native) — quebra
    // apenas quando o user aperta Enter (igual Instagram Stories).
    // Antes PWA usava 'pre-wrap' com maxWidth pra evitar overflow, mas
    // unificamos com native a pedido do user.
    const wsValue: React.CSSProperties['whiteSpace'] = 'pre';
    return (
      <span
        // iOS bloqueia 4 comportamentos que causavam "letras uma em
        // cima da outra" reportado pelo user durante o drag:
        //  1) pointer-events:none  → toque atravessa pro DraggableLayer
        //     pai (que captura via Pointer Events). Sem isso o iOS
        //     processava o tap NO span e ativava text selection.
        //  2) user-select:none (+ webkit/khtml) → bloqueia selecao de
        //     texto (que aparece com handles azuis sobre as letras).
        //  3) -webkit-touch-callout:none → bloqueia o menu Copiar/
        //     Selecionar que aparece em long-press.
        //  4) -webkit-user-drag:none + draggable=false → bloqueia o
        //     iOS "lift to drag" (iOS 11+ Drag & Drop) que cria uma
        //     COPIA FANTASMA do elemento seguindo o dedo, enquanto o
        //     original fica. Isso era a causa principal do "letras
        //     uma em cima da outra".
        draggable={false}
        style={{
          display: 'inline-block',
          fontFamily: FONT_FAMILIES[layer.fontStyle],
          fontSize: layer.fontSize,
          color: layer.color,
          background: bg,
          padding,
          borderRadius: 8,
          textAlign: layer.align,
          // whiteSpace=pre + sem wordBreak + sem maxWidth -> texto
          // CONTINUO em todas plataformas, quebra so com Enter. Pode
          // extrapolar visualmente (stage tem overflow:hidden -> cortado),
          // igual IG. Native+PWA agora unificados.
          whiteSpace: wsValue,
          wordBreak: undefined,
          maxWidth: undefined,
          lineHeight: 1.2,
          textShadow: layer.background === 'none' ? '0 1px 4px rgba(0,0,0,0.5)' : undefined,
          pointerEvents: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserDrag: 'none',
        } as React.CSSProperties}
      >
        {renderTextWithMentions(layer.text)}
      </span>
    );
  }
  if (layer.type === 'sticker') {
    return <span style={{ fontSize: layer.size, lineHeight: 1 }}>{layer.emoji}</span>;
  }
  if (layer.type === 'mention') {
    return (
      <span
        style={{
          display: 'inline-block',
          fontFamily: FONT_FAMILIES[layer.fontStyle],
          fontSize: layer.fontSize,
          color: layer.color,
          background: layer.background === 'none' ? 'transparent' : layer.backgroundColor,
          padding: layer.background === 'none' ? 0 : '6px 14px',
          borderRadius: 999,
          fontWeight: 800,
        }}
      >
        @{layer.username}
      </span>
    );
  }
  if (layer.type === 'hashtag') {
    return (
      <span
        style={{
          display: 'inline-block',
          fontFamily: FONT_FAMILIES[layer.fontStyle],
          fontSize: layer.fontSize,
          color: layer.color,
          background: layer.background === 'none' ? 'transparent' : layer.backgroundColor,
          padding: layer.background === 'none' ? 0 : '6px 14px',
          borderRadius: 999,
          fontWeight: 800,
        }}
      >
        #{layer.tag.toUpperCase()}
      </span>
    );
  }
  if (layer.type === 'time') {
    return (
      <span
        style={{
          display: 'inline-block',
          fontFamily: '"Bebas Neue", "Archivo Black", sans-serif',
          fontSize: layer.fontSize,
          color: layer.color,
          background: layer.background === 'none' ? 'transparent' : layer.backgroundColor,
          padding: '4px 14px',
          borderRadius: 8,
          letterSpacing: '0.08em',
        }}
      >
        {formatTime(layer.capturedAt)}
      </span>
    );
  }
  if (layer.type === 'temp') {
    return (
      <span
        style={{
          display: 'inline-block',
          fontFamily: '"Bebas Neue", "Archivo Black", sans-serif',
          fontSize: layer.fontSize,
          color: layer.color,
          background: layer.background === 'none' ? 'transparent' : layer.backgroundColor,
          padding: '4px 14px',
          borderRadius: 8,
          letterSpacing: '0.04em',
        }}
      >
        {formatTemp(layer)}
      </span>
    );
  }
  return null;
}

/** Destaca @username e #hashtag dentro do texto livre. Usado pelo
 *  TextLayer (que aceita mencao/hashtag inline). */
function renderTextWithMentions(text: string) {
  const parts: React.ReactNode[] = [];
  const re = /@([a-zA-Z0-9_.]+)|#([a-zA-Z0-9_]+)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    if (m[1]) {
      // Mostra so o nome (sem @) em verde, fonte menor — pedido do user.
      parts.push(
        <span key={i++} style={{ color: MENTION_COLOR, fontWeight: 700, fontSize: '0.88em' }}>
          {m[1]}
        </span>
      );
    } else if (m[2]) {
      parts.push(<span key={i++} style={{ color: MENTION_COLOR, fontWeight: 800 }}>#{m[2]}</span>);
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}


// ──────────────────────────────────────────────────────────────────────
// STICKER PANEL — bottom sheet com emojis + mencao + hashtag + horario
// ──────────────────────────────────────────────────────────────────────
const COMMON_EMOJIS = [
  '😀','😂','😍','🥰','😎','🤩','🤔','😢','😭','😡','🥳','😴',
  '👍','👎','👏','🙌','💪','🤝','🙏','✌️','🤞','👀','💯','🔥',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💞','💖',
  '✨','⭐','🌟','💫','🌈','☀️','🌙','⚡','💥','🎉','🎊','🎁',
  '✈️','🏖️','🗺️','🌍','🏔️','🌅','🌃','🌆','🍕','🍔','🍣','🍜',
  '☕','🍷','🍺','🥂','📸','📱','💻','🎵','🎮','⚽','🏆','💎',
];

interface StickerPanelProps {
  currentUser: string;
  onClose: () => void;
  onPickEmoji: (emoji: string) => void;
  onPickMention: (username: string) => void;
  onPickHashtag: (tag: string) => void;
  onPickTime: () => void;
  onPickTemp: () => void;
}

function StickerPanel({ currentUser, onClose, onPickEmoji, onPickMention, onPickHashtag, onPickTime, onPickTemp }: StickerPanelProps) {
  const [tab, setTab] = useState<'emoji' | 'mention' | 'hashtag'>('emoji');
  const [mentionQ, setMentionQ] = useState('');
  const [hashtagQ, setHashtagQ] = useState('');
  const [friends, setFriends] = useState<{ username: string; nome?: string | null }[]>([]);

  useEffect(() => {
    const list = getFriends(currentUser).map(u => ({ username: u }));
    setFriends(list);
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,nome')
          .in('username', list.map(f => f.username));
        if (data) setFriends(data as any[]);
      } catch {}
    })();
  }, [currentUser]);

  const filteredFriends = useMemo(() => {
    const q = mentionQ.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(f =>
      f.username.toLowerCase().includes(q) || (f.nome || '').toLowerCase().includes(q)
    );
  }, [mentionQ, friends]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100100] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', touchAction: 'none' }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: '#15151a', maxHeight: '75vh', minHeight: 360 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 py-3 border-b border-white/10">
          <TabBtn active={tab === 'emoji'} onClick={() => setTab('emoji')}>
            <Smile className="w-4 h-4" /> Emojis
          </TabBtn>
          <TabBtn active={tab === 'mention'} onClick={() => setTab('mention')}>
            <AtSign className="w-4 h-4" /> @
          </TabBtn>
          <TabBtn active={tab === 'hashtag'} onClick={() => setTab('hashtag')}>
            <Hash className="w-4 h-4" /> #
          </TabBtn>
          <button
            type="button"
            onClick={onPickTime}
            className="px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1 ml-auto"
            style={{ background: 'rgba(255,255,255,0.10)' }}
          >
            <Clock className="w-4 h-4" /> Hora
          </button>
          {/* TEMP: busca temperatura atual via Open-Meteo (gratuito) com
              base na geolocalizacao. Sticker congela temp + cidade no
              momento da criacao. */}
          <button
            type="button"
            onClick={onPickTemp}
            className="px-3 py-1.5 rounded-full text-xs font-bold text-white flex items-center gap-1"
            style={{ background: 'rgba(255,255,255,0.10)' }}
            aria-label="Adicionar temperatura"
          >
            🌡 Temp
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3" style={{ overscrollBehavior: 'contain' }}>
          {tab === 'emoji' && (
            <div className="grid grid-cols-6 gap-2">
              {COMMON_EMOJIS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onPickEmoji(e)}
                  className="aspect-square rounded-xl flex items-center justify-center text-3xl active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {tab === 'mention' && (
            <div className="flex flex-col gap-2">
              <input
                value={mentionQ}
                onChange={e => setMentionQ(e.target.value)}
                placeholder="Buscar amigo…"
                className="w-full px-3 py-2 rounded-full text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              />
              {filteredFriends.length === 0 ? (
                <p className="text-sm text-white/45 text-center py-6">Nenhum amigo encontrado.</p>
              ) : (
                <div className="flex flex-col">
                  {filteredFriends.map(f => (
                    <button
                      key={f.username}
                      type="button"
                      onClick={() => onPickMention(f.username)}
                      className="w-full px-3 py-2 flex items-center gap-2.5 text-left active:bg-white/5"
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #1e714a, #4ade80)' }}
                      >
                        {f.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{f.nome || f.username}</p>
                        <p className="text-xs text-white/55 truncate">@{f.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'hashtag' && (
            <div className="flex flex-col gap-2">
              <input
                value={hashtagQ}
                onChange={e => setHashtagQ(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="Digite a hashtag (sem #)"
                className="w-full px-3 py-2 rounded-full text-sm outline-none"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              />
              {hashtagQ.length > 0 && (
                <button
                  type="button"
                  onClick={() => onPickHashtag(hashtagQ.toLowerCase())}
                  className="w-full px-4 py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#1e714a,#4ade80)', fontFamily: '"DM Sans", system-ui, sans-serif' }}
                >
                  <Hash className="w-4 h-4" /> Adicionar #{hashtagQ.toUpperCase()}
                </button>
              )}
            </div>
          )}
        </div>

        <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>,
    document.body,
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-colors"
      style={{
        background: active ? '#fff' : 'rgba(255,255,255,0.10)',
        color: active ? '#000' : '#fff',
      }}
    >
      {children}
    </button>
  );
}
