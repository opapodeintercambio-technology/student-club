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
  Volume2, VolumeX,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';
import {
  type StoryLayer, type TextLayer,
  FONT_FAMILIES, MENTION_COLOR,
  newTextLayer, newStickerLayer, newMentionLayer, newHashtagLayer, newTimeLayer,
  fontStyleExtras, autoContrastTextColor,
  formatTime,
} from './storyLayers';
import { TextEditorOverlay } from './story/TextEditorOverlay';
import { DraggableText } from './story/DraggableText';
import { TrashZone } from './story/TrashZone';

interface Props {
  src: string;                 // object URL da midia capturada
  kind: 'image' | 'video';
  currentUser: string;
  posting: boolean;
  partsCount?: number;         // se o video foi dividido em N partes
  onCancel: () => void;
  /** Publica o story com a lista de camadas. O onCancel/onPost original
   *  do StoryComposer continua sendo a fonte de verdade — esse componente
   *  so eh o "shell" novo. */
  onPost: (layers: StoryLayer[]) => void;
}

// ──────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────────────

export function StoryEditor({ src, kind, currentUser, posting, partsCount, onCancel, onPost }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<StoryLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  // Som do video do preview. Comeca false (tenta tocar com som). Se iOS
  // bloquear autoplay com audio, o effect abaixo cai pra muted + mostra
  // o botao de som pro user ativar manualmente.
  const [previewMuted, setPreviewMuted] = useState(false);
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

  // Bloqueia eventos NATIVOS de gesto do iOS Safari (gesturestart/change/end).
  // Sao eventos WebKit-only que disparam em alguns cenarios MESMO com 1 dedo —
  // @use-gesture pega isso e interpreta como pinch -> drag de 1 dedo virava
  // resize/rotate sem motivo. Preventing aqui mantem so multi-touch real.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', prevent);
    document.addEventListener('gesturechange', prevent);
    document.addEventListener('gestureend', prevent);
    return () => {
      document.removeEventListener('gesturestart', prevent);
      document.removeEventListener('gesturechange', prevent);
      document.removeEventListener('gestureend', prevent);
    };
  }, []);

  // Trava scroll body enquanto o editor esta aberto
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
    };
  }, []);

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
  // Aceita coords normalizadas opcionais. Quando vem do botao Aa = centro;
  // quando vem de tap no stage = local do tap (cursor aparece onde tocou).
  function startNewText(coords?: { x: number; y: number }) {
    const t = newTextLayer('', coords ?? { x: 0.5, y: 0.5 });
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

  // ── PUBLICAR ─────────────────────────────────────────────────────
  function publish() {
    // Descarta camadas vazias antes de publicar (texto sem conteudo).
    const clean = layers.filter(l => {
      if (l.type === 'text') return l.text.trim().length > 0;
      return true;
    });
    onPost(clean);
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
            // Tap NO FUNDO (e.target === currentTarget). Taps em camadas/
            // overlay sao filtrados pelo stopPropagation deles.
            if (e.target !== e.currentTarget) return;
            if (!editingTextId && !selectedId) {
              // Cria texto NO PONTO TOCADO (cursor aparece la, nao centro).
              // Estilo Instagram: tap-pra-comecar-a-digitar no local exato.
              const rect = stageRef.current?.getBoundingClientRect();
              if (rect) {
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                startNewText({ x, y });
              } else {
                startNewText();
              }
              return;
            }
            // Senao: apenas deseleciona (toolbar volta ao padrao).
            setSelectedId(null);
          }}
        >
          {/* Midia de fundo */}
          {kind === 'image' ? (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover', userSelect: 'none',
              }}
            />
          ) : (
            <video
              src={src}
              autoPlay
              loop
              // Tenta com som ligado (user acabou de gravar — quer ouvir).
              // Se iOS bloquear autoplay com audio, video fica mudo + user
              // toca o botao de som pra ativar. Veja o useEffect abaixo
              // que faz o fallback inteligente.
              muted={previewMuted}
              playsInline
              ref={previewVideoRef}
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
              }}
            />
          )}

          {/* Camadas — escondemos a camada de texto sendo editada (ela
              aparece no TextEditorOverlay no lugar). As outras renderizam
              normalmente. Texto = DraggableText (use-gesture + motion);
              stickers/mention/hashtag/time = DraggableLayer (touch nativo). */}
          {layers.map(layer => {
            // Camada de texto sendo editada nao aparece aqui — vai no overlay
            if (layer.id === editingTextId) return null;
            if (layer.type === 'text') {
              return (
                <DraggableText
                  key={layer.id}
                  layer={layer}
                  stageRef={stageRef}
                  selected={selectedId === layer.id}
                  onSelect={() => setSelectedId(layer.id)}
                  onUpdate={(patch) => updateLayer(layer.id, patch as Partial<StoryLayer>)}
                  onTap={() => setEditingTextId(layer.id)}
                  onDragStart={() => setDraggingId(layer.id)}
                  onDragEnd={(over) => {
                    setDraggingId(null);
                    setOverTrash(false);
                    if (over) deleteLayer(layer.id);
                  }}
                  onTrashHoverChange={(over) => setOverTrash(over)}
                />
              );
            }
            // Demais tipos (sticker/mention/hashtag/time) usam o
            // DraggableLayer legado (touch events nativos).
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
                onTap={() => { /* nao-texto: tap nao tem acao especial */ }}
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
              <ToolButton onClick={startNewText} label="Texto">
                <Type className="w-5 h-5" />
              </ToolButton>
              <ToolButton onClick={() => setStickerPanelOpen(true)} label="Stickers">
                <Smile className="w-5 h-5" />
              </ToolButton>
            </div>
          </div>
        )}

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
          legenda. Aberto via Aa (startNewText) ou tap em legenda existente
          (DraggableText.onTap). Tap no backdrop commita. */}
      <TextEditorOverlay
        layer={(() => {
          if (!editingTextId) return null;
          const l = layers.find(x => x.id === editingTextId);
          return l && l.type === 'text' ? l : null;
        })()}
        onChange={(patch) => editingTextId && updateLayer(editingTextId, patch as Partial<StoryLayer>)}
        onCommit={commitTextEdit}
      />

      {/* STICKER PANEL — emojis + mencao + hashtag + horario */}
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
        />
      )}
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

  // Snapshot do estado no inicio do gesto atual. Refeito quando touches
  // entram/saem (transicao pan ↔ pinch).
  const gestureRef = useRef<{
    kind: 'pan' | 'pinch';
    // pan
    startX?: number; startY?: number; baseX?: number; baseY?: number;
    // pinch
    startDist?: number; startAngle?: number; baseScale?: number; baseRotation?: number;
  } | null>(null);
  const movedRef = useRef(false);

  function stageRect() {
    return stageRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }

  /** Decide o gesto baseado em quantos touches ativos. */
  function initGesture(touches: { x: number; y: number }[]) {
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
      };
    } else if (touches.length === 1) {
      gestureRef.current = {
        kind: 'pan',
        startX: touches[0].x, startY: touches[0].y,
        baseX: layer.x, baseY: layer.y,
      };
    } else {
      gestureRef.current = null;
    }
  }

  function readTouches(list: React.TouchList | TouchList) {
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      out.push({ x: t.clientX, y: t.clientY });
    }
    return out;
  }

  function applyMove(touches: { x: number; y: number }[]) {
    const g = gestureRef.current;
    if (!g) return;
    const rect = stageRect();

    if (g.kind === 'pinch' && touches.length >= 2) {
      const [a, b] = touches;
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
    } else if (g.kind === 'pan' && touches.length >= 1) {
      const t = touches[0];
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

  // ── TOUCH HANDLERS (mobile) ───────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    onSelect();
    if (e.touches.length === 1) onDragStart();
    movedRef.current = false;
    initGesture(readTouches(e.touches));
  }
  function onTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    // preventDefault aqui evita o iOS rolar/pinchar a pagina enquanto
    // arrastamos a camada.
    if (e.cancelable) e.preventDefault();
    applyMove(readTouches(e.touches));
  }
  function onTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    // Posicao do touch que terminou (pro trash check)
    const last = e.changedTouches[0];
    const wasOver = last ? isOverTrashZone(last.clientX, last.clientY) : false;
    // Re-inicia o gesto pros touches que SOBRARAM (1 dedo entre 2 = pan)
    initGesture(readTouches(e.touches));
    if (e.touches.length === 0) {
      onDragEnd(wasOver);
      onDragOverTrashChange(false);
      // SINGLE-TAP: soltou sem arrastar (movedRef false). Pra texto, isso
      // reabre o cursor de edicao — clicar em qualquer letra da legenda
      // volta pra modo edicao (a pedido do user).
      if (!movedRef.current) {
        onTap();
      }
    }
  }
  function onTouchCancel(e: React.TouchEvent) { onTouchEnd(e); }

  // ── MOUSE HANDLERS (desktop) ──────────────────────────────────────
  // Pan apenas (desktop nao tem pinch nativo). Listeners no DOCUMENT
  // pra capturar movimento mesmo se o mouse sair da camada.
  function onMouseDown(e: React.MouseEvent) {
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
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        left: px,
        top: py,
        transform: `translate(-50%, -50%) rotate(${layer.rotation}rad) scale(${layer.scale})`,
        transformOrigin: 'center center',
        touchAction: 'none',
        cursor: 'grab',
        outline: selected ? '2px dashed rgba(255,255,255,0.6)' : 'none',
        outlineOffset: 4,
        borderRadius: 6,
        // Bloqueia selecao de texto e callout do iOS no long-press
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
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
    return (
      <span
        style={{
          display: 'inline-block',
          fontFamily: FONT_FAMILIES[layer.fontStyle],
          fontSize: layer.fontSize,
          color: layer.color,
          background: bg,
          padding,
          borderRadius: 8,
          textAlign: layer.align,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxWidth: '85vw',
          lineHeight: 1.2,
          textShadow: layer.background === 'none' ? '0 1px 4px rgba(0,0,0,0.5)' : undefined,
        }}
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
      parts.push(<span key={i++} style={{ color: MENTION_COLOR, fontWeight: 800 }}>@{m[1]}</span>);
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
}

function StickerPanel({ currentUser, onClose, onPickEmoji, onPickMention, onPickHashtag, onPickTime }: StickerPanelProps) {
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
