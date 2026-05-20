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
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getFriends } from './friends';
import {
  type StoryLayer, type TextLayer,
  FONT_FAMILIES, FONT_LABELS, STORY_COLORS, MENTION_COLOR,
  newTextLayer, newStickerLayer, newMentionLayer, newHashtagLayer, newTimeLayer,
  formatTime,
} from './storyLayers';

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
  function startNewText() {
    const t = newTextLayer('');
    addLayer(t);
    setEditingTextId(t.id);
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
            // So reage a tap NO FUNDO (e.target === currentTarget); taps em
            // camadas/textarea sao filtrados pelo stopPropagation deles.
            if (e.target !== e.currentTarget) return;

            if (editingTextId) {
              // Tap fora do textarea = "Pronto" (commit). Camada continua
              // SELECIONADA pra ficar com a toolbar de fonte/cor disponivel
              // (o user pode "avancar" pra mudar fonte/cor antes de postar).
              const cur = layers.find(l => l.id === editingTextId);
              if (cur && cur.type === 'text' && !cur.text.trim()) {
                // Texto vazio = abortou, deleta a camada
                deleteLayer(editingTextId);
                setSelectedId(null);
              } else {
                setSelectedId(editingTextId); // mantem selecionada pra toolbar
              }
              setEditingTextId(null);
              return;
            }

            // Sem edicao em andamento: 2 caminhos:
            // (1) Se ja existe uma camada de texto selecionada -> DESELECIONA
            //     (toolbar volta pra X/Aa/Sticker padrao).
            // (2) Senao -> CRIA nova legenda no ponto tocado e entra em
            //     edicao (cursor aparece imediatamente, estilo IG).
            //
            // OBS: nao criamos uma nova legenda se ja existe uma OUTRA
            // selecionada — isso evitaria sobreposicao acidental. Pra criar
            // mais, o user usa o botao Aa.
            const selLayer = selectedId ? layers.find(l => l.id === selectedId) : null;
            if (selLayer && selLayer.type === 'text') {
              setSelectedId(null);
              return;
            }
            const rect = stageRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;
            const t = newTextLayer('', { x, y });
            setLayers(prev => [...prev, t]);
            setSelectedId(t.id);
            setEditingTextId(t.id);
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
              muted
              playsInline
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
              }}
            />
          )}

          {/* Camadas — InlineTextEditor pro layer sendo editado, Draggable
              pros outros. Trocar pra Draggable assim que sai do modo edicao. */}
          {layers.map(layer => (
            layer.id === editingTextId && layer.type === 'text' ? (
              <InlineTextEditor
                key={layer.id}
                layer={layer}
                stageRef={stageRef}
                currentUser={currentUser}
                onChange={(patch) => updateLayer(layer.id, patch)}
              />
            ) : (
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
                onTap={() => {
                  // Single tap em camada de texto -> volta pra edicao
                  // (o user pode clicar em qualquer letra pra corrigir).
                  if (layer.type === 'text') setEditingTextId(layer.id);
                }}
              />
            )
          ))}
        </div>

        {/* TOOLBAR SUPERIOR — varia conforme o modo:
            - EDITANDO texto OU SELECIONADO um texto -> seletor de fontes
              (no editing aplica enquanto digita, no selected aplica na
              camada ja committada — o user pode avancar e mudar a fonte
              depois do "Pronto").
            - normal -> X, Aa, Stickers */}
        {(() => {
          // "focused" = camada de texto sendo editada OU selecionada (apos
          // commit). Toolbar de fontes atua na mesma instancia em ambos casos.
          const focusId = editingTextId || selectedId;
          const focusLayer = focusId
            ? (layers.find(l => l.id === focusId) as any)
            : null;
          if (focusLayer && focusLayer.type === 'text') {
            return (
              <div
                className="absolute left-0 right-0 top-0 px-3 z-30 flex gap-2 overflow-x-auto"
                style={{
                  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
                  paddingBottom: 8,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0))',
                  scrollbarWidth: 'none',
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {(Object.keys(FONT_LABELS) as Array<keyof typeof FONT_LABELS>).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => updateLayer(focusLayer.id, { fontStyle: f } as any)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
                    style={{
                      background: focusLayer.fontStyle === f ? '#fff' : 'rgba(255,255,255,0.18)',
                      color: focusLayer.fontStyle === f ? '#000' : '#fff',
                      fontFamily: FONT_FAMILIES[f],
                      letterSpacing: '0.04em',
                    }}
                  >
                    {FONT_LABELS[f]}
                  </button>
                ))}
              </div>
            );
          }
          return (
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
          );
        })()}

        {/* FOOTER — varia conforme o modo:
            - EDITANDO texto: paleta de cores + alignment + bg toggle (sem
              Post — user precisa primeiro tap fora pra commitar)
            - SELECIONADO texto (apos commit): mesmas ferramentas + Post
              (o user pode "avancar" pra mudar fonte/cor e publicar)
            - normal: botao "Seu story" */}
        {(() => {
          const focusId = editingTextId || selectedId;
          const focusLayer = focusId
            ? (layers.find(l => l.id === focusId) as any)
            : null;
          const isEditing = !!editingTextId;
          if (focusLayer && focusLayer.type === 'text') {
            const order: Array<'none' | 'translucent' | 'solid'> = ['none', 'translucent', 'solid'];
            return (
              <div
                className="absolute left-0 right-0 bottom-0 px-3 z-30 flex flex-col gap-2"
                style={{
                  paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
                  paddingTop: 10,
                  background: 'linear-gradient(0deg, rgba(0,0,0,0.45), rgba(0,0,0,0))',
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {/* alignment + background toggle + (post quando selecionado) */}
                <div className="flex items-center justify-center gap-2">
                  {(['left', 'center', 'right'] as const).map(a => {
                    const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => updateLayer(focusLayer.id, { align: a } as any)}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                        style={{
                          background: focusLayer.align === a
                            ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.10)',
                        }}
                        aria-label={`Alinhar ${a}`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const idx = order.indexOf(focusLayer.background);
                      const nextBg = order[(idx + 1) % order.length];
                      const nextBgColor = nextBg === 'solid' ? focusLayer.color
                        : nextBg === 'translucent' ? 'rgba(0,0,0,0.55)'
                        : focusLayer.backgroundColor;
                      const nextTextColor = nextBg === 'solid' ? '#000000' : focusLayer.color;
                      updateLayer(focusLayer.id, {
                        background: nextBg, backgroundColor: nextBgColor, color: nextTextColor,
                      } as any);
                    }}
                    className="px-3 h-9 rounded-full text-white text-xs font-semibold"
                    style={{ background: 'rgba(255,255,255,0.18)' }}
                  >
                    Aa fundo
                  </button>
                  {/* POST aparece quando a camada esta SELECIONADA (ja
                      passou pelo "Pronto") — user avanca pra publicar. */}
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={publish}
                      disabled={posting}
                      className="ml-auto px-4 h-9 rounded-full text-white font-bold text-xs disabled:opacity-50 flex items-center gap-1.5"
                      style={{
                        background: 'linear-gradient(135deg, #1e714a 0%, #4ade80 100%)',
                        fontFamily: '"DM Sans", system-ui, sans-serif',
                        letterSpacing: '0.10em',
                      }}
                    >
                      {posting ? 'Postando…' : <>Postar <Send className="w-3.5 h-3.5" /></>}
                    </button>
                  )}
                </div>
                {/* paleta de cores */}
                <div
                  className="flex items-center gap-2 overflow-x-auto py-1"
                  style={{ scrollbarWidth: 'none' }}
                >
                  {STORY_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        if (focusLayer.background === 'solid') {
                          updateLayer(focusLayer.id, { backgroundColor: c } as any);
                        } else {
                          updateLayer(focusLayer.id, { color: c } as any);
                        }
                      }}
                      className="rounded-full flex-shrink-0"
                      style={{
                        width: 28, height: 28, background: c,
                        border: ((focusLayer.background === 'solid'
                          ? focusLayer.backgroundColor : focusLayer.color) === c)
                          ? '3px solid #fff'
                          : '2px solid rgba(255,255,255,0.3)',
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          }
          return (
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
          );
        })()}

        {/* TRASH ZONE — aparece quando esta arrastando uma camada */}
        {draggingId && (
          <div
            className="absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{
                width: overTrash ? 76 : 60,
                height: overTrash ? 76 : 60,
                background: overTrash ? '#dc2626' : 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(6px)',
                border: '2px solid rgba(255,255,255,0.4)',
                transition: 'all 140ms ease-out',
              }}
            >
              <Trash2 className="w-7 h-7 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* (TextEditorOverlay removido — agora a edicao acontece inline no
          proprio stage. Ver InlineTextEditor abaixo + onPointerDown do stage.) */}

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
// INLINE TEXT EDITOR — textarea posicionado NO LOCAL da camada
// ──────────────────────────────────────────────────────────────────────
// Substitui o antigo TextEditorOverlay (modal fullscreen com botao "Pronto").
// Agora o usuario:
//   1. Toca em qualquer ponto vazio do stage -> cria legenda nova ali +
//      cursor aparece imediatamente
//   2. Digita o texto livremente
//   3. Toca em qualquer outro ponto fora do textarea -> commit automatico
//      (o stage onPointerDown trata isso no StoryEditor principal)
//
// Suporta autocomplete inline de @mencao buscando friends.
//
// O textarea eh visualmente IDENTICO ao LayerVisual (mesma fonte, cor,
// background) — fica invisivel a fronteira entre "editando" e "renderizado".

interface InlineTextEditorProps {
  layer: TextLayer;
  stageRef: React.RefObject<HTMLDivElement>;
  currentUser: string;
  onChange: (patch: Partial<TextLayer>) => void;
}

function InlineTextEditor({ layer, stageRef, currentUser, onChange }: InlineTextEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [friends, setFriends] = useState<{ username: string; nome?: string | null }[]>([]);
  const [mentionPrefix, setMentionPrefix] = useState<{ start: number; prefix: string } | null>(null);

  // Carrega friends pro autocomplete (uma vez por montagem)
  useEffect(() => {
    const list = getFriends(currentUser).map(u => ({ username: u }));
    setFriends(list);
    (async () => {
      try {
        const { data } = await supabase
          .from('usuarios')
          .select('username,nome')
          .in('username', list.map(f => f.username));
        if (data) {
          setFriends(prev => {
            const map: Record<string, { username: string; nome?: string | null }> = {};
            for (const f of prev) map[f.username] = f;
            for (const u of (data as any[])) map[u.username] = u;
            return Object.values(map);
          });
        }
      } catch {}
    })();
  }, [currentUser]);

  // AUTO-FOCUS imediatamente apos montagem — cursor piscando aparece sem o
  // user precisar tocar de novo. setTimeout pra dar tempo do React montar.
  useEffect(() => {
    const t = setTimeout(() => taRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  // Auto-resize do textarea pra crescer com o conteudo (sem rolagem interna)
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [layer.text]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange({ text: v });
    const caret = e.target.selectionStart ?? v.length;
    setMentionPrefix(detectMentionAt(v, caret));
  }

  function detectMentionAt(text: string, caret: number): { start: number; prefix: string } | null {
    if (caret <= 0) return null;
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === '@') {
        if (i === 0 || /\s/.test(text[i - 1])) {
          const prefix = text.slice(i + 1, caret);
          if (/^[A-Za-z0-9_.]*$/.test(prefix)) return { start: i, prefix };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }

  function pickMention(username: string) {
    if (!mentionPrefix) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? layer.text.length;
    const before = layer.text.slice(0, mentionPrefix.start);
    const after = layer.text.slice(caret);
    const insert = `@${username} `;
    const next = before + insert + after;
    onChange({ text: next });
    setMentionPrefix(null);
    const newCaret = before.length + insert.length;
    requestAnimationFrame(() => {
      if (ta) { ta.focus(); try { ta.setSelectionRange(newCaret, newCaret); } catch {} }
    });
  }

  const suggestions = useMemo(() => {
    if (!mentionPrefix) return [];
    const q = mentionPrefix.prefix.toLowerCase();
    return friends
      .filter(f => f.username.toLowerCase().startsWith(q) || (f.nome || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionPrefix, friends]);

  // Posicao do layer (mesma logica do DraggableLayer)
  const rect = stageRef.current?.getBoundingClientRect();
  const stageW = rect?.width ?? 0;
  const stageH = rect?.height ?? 0;
  const px = layer.x * stageW;
  const py = layer.y * stageH;

  return (
    <div
      // stopPropagation pra nao disparar o "commit" do stage onPointerDown
      // quando o user toca no proprio textarea pra editar.
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: px,
        top: py,
        transform: `translate(-50%, -50%) rotate(${layer.rotation}rad) scale(${layer.scale})`,
        transformOrigin: 'center center',
        maxWidth: '85vw',
        // SEM outline tracejado ou "balao" visivel — o user pediu que o
        // cursor aparecesse na propria imagem, sem balao. O blink do
        // cursor + a fonte/cor escolhida ja eh feedback suficiente de
        // "modo edicao".
      }}
    >
      <textarea
        ref={taRef}
        value={layer.text}
        onChange={handleChange}
        placeholder="Digite algo…"
        rows={1}
        style={{
          display: 'block',
          width: 'auto',
          minWidth: 80,
          maxWidth: '85vw',
          fontFamily: FONT_FAMILIES[layer.fontStyle],
          fontSize: layer.fontSize,
          color: layer.color,
          // background SO aplica quando o user escolheu fundo solido/translucido.
          // Sem fundo, o textarea fica totalmente transparente — texto direto
          // na imagem, sem caixa ao redor.
          background: layer.background === 'none' ? 'transparent' : layer.backgroundColor,
          // Padding so quando tem fundo. Sem fundo, padding=0 pra nao
          // criar a sensacao de "balao".
          padding: layer.background === 'none' ? 0 : '6px 12px',
          borderRadius: layer.background === 'none' ? 0 : 8,
          textAlign: layer.align,
          lineHeight: 1.2,
          outline: 'none',
          border: 'none',
          resize: 'none',
          overflow: 'hidden',
          textShadow: layer.background === 'none' ? '0 1px 4px rgba(0,0,0,0.5)' : undefined,
          caretColor: layer.color === '#000000' ? '#000' : '#fff',
        }}
      />

      {/* Sugestoes de mencao — popup absoluto LOGO ABAIXO do textarea.
          Em portal pro body pra nao ser cortado pelo overflow do stage. */}
      {suggestions.length > 0 && createPortal(
        <div
          className="fixed left-3 right-3 z-[100100] rounded-xl overflow-hidden"
          style={{
            // Posiciona no rodape da viewport, acima da paleta de cores
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            maxHeight: 240,
            overflowY: 'auto',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {suggestions.map(s => (
            <button
              key={s.username}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickMention(s.username); }}
              className="w-full px-3 py-2 flex items-center gap-2.5 text-left active:bg-white/10"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #1e714a, #4ade80)' }}
              >
                {s.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{s.nome || s.username}</p>
                <p className="text-xs text-white/55 truncate">@{s.username}</p>
              </div>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
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
