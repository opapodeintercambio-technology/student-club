// Tipos compartilhados entre engines de filtro AR. Mantem o catalogo
// de filtros declarativo — adicionar um filtro novo eh so adicionar uma
// entry em `catalog.ts` (sem codigo novo) desde que ja exista a engine.

export type FilterCategory = 'beauty' | 'harmonization' | 'mask3d' | 'texture' | 'fx';
export type EngineId = 'skin' | 'liquify' | 'mask3d' | 'texture' | 'fx';

/** Cada landmark do MediaPipe Face Mesh — 468 pontos em [0,1] (normalized). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Result de uma deteccao — landmarks + estado de tracking. */
export interface FaceTrackingResult {
  landmarks: Landmark[] | null;
  detected: boolean;
  /** Yaw/pitch/roll da cabeca em radianos. Util pra rotacionar mascaras 3D. */
  pose?: { yaw: number; pitch: number; roll: number };
}

/** Config de um filtro do catalogo. */
export interface FilterConfig {
  id: string;
  name: string;
  category: FilterCategory;
  engine: EngineId;
  /** Parametros especificos da engine — schema livre, validado pela engine. */
  params: Record<string, unknown>;
  /** Indica se modifica geometria/cor da face (queixo, olhos, pele).
   *  Filtros com true ganham badge "Filtro Aplicado" no story/post. */
  modifiesFace: boolean;
  /** Thumbnail (80x80 PNG) — caminho relativo a /public/filters/thumbnails/ */
  thumbnail?: string;
  emoji?: string;
}

/** Metadado salvo no banco quando o filtro e aplicado a uma midia. */
export interface AppliedFilterMeta {
  filter_id: string;
  filter_name: string;
  category: FilterCategory;
  has_face_modification: boolean;
  applied_at: string;
}

/** Interface comum de todas as engines.
 *  - mount: prepara recursos GPU (shader, texture, mesh) — chamado 1x
 *  - render: aplica o filtro num frame (chamado a cada frame)
 *  - dispose: libera recursos (chamado quando filtro muda ou camera fecha)
 */
export interface FilterEngine {
  id: EngineId;
  mount(gl: WebGL2RenderingContext | WebGLRenderingContext, params: Record<string, unknown>): Promise<void>;
  render(input: {
    video: HTMLVideoElement;
    landmarks: Landmark[] | null;
    canvas: HTMLCanvasElement;
    timestamp: number;
  }): void;
  dispose(): void;
}
