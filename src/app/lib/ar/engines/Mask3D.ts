// Mask3D — modelos 3D (.glb) ancorados em landmarks faciais.
//
// Como funciona:
//   1. Renderiza o video num canvas 2D (background)
//   2. Three.js renderiza modelo 3D num canvas WebGL (overlay)
//   3. Composita 2D + 3D no canvas de saida a cada frame
//
// Tracking de pose:
//   - Posicao: landmark 1 (nose tip) ou 168 (between eyes) — usado como
//     anchor do modelo
//   - Rotacao (yaw): angulo entre landmarks 234 e 454 (left/right cheek)
//   - Rotacao (pitch): angulo entre 10 (forehead) e 152 (chin)
//   - Rotacao (roll): angulo entre 33 (right eye) e 263 (left eye)
//   - Escala: distancia entre 234 e 454 (face width) -> tamanho do modelo
//
// FALLBACK SEM .GLB: enquanto nao temos os modelos 3D reais, usamos
// placeholders geometricos por modelo (ex: cachorrinho = 2 cones nas
// orelhas + esfera preta no nariz). Substituir por .glb quando os assets
// estiverem disponiveis em /public/filters/3d-models/.

import type { FilterEngine, Landmark } from '../types';

interface Mask3DParams {
  model?: string; // 'dog.glb', 'bunny.glb', etc.
}

// Landmarks de referencia
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const LEFT_EYE_OUTER = 263;
const RIGHT_EYE_OUTER = 33;

export class Mask3DEngine implements FilterEngine {
  readonly id = 'mask3d' as const;
  private model = 'dog.glb';
  private THREE: any = null;
  private renderer: any = null;
  private scene: any = null;
  private camera: any = null;
  private maskGroup: any = null;
  private offscreen: HTMLCanvasElement | null = null;

  async mount(_gl: any, params: Record<string, unknown>): Promise<void> {
    const p = params as Mask3DParams;
    this.model = p.model || 'dog.glb';

    // Lazy import de Three.js (so quando filtro 3D e ativado)
    const THREE = await import('three');
    this.THREE = THREE;

    // Canvas offscreen pro Three.js. Tamanho ajustado em render.
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = 720;
    this.offscreen.height = 1280;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.offscreen,
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.renderer.setClearColor(0x000000, 0); // transparente

    this.scene = new THREE.Scene();
    // Camera ortografica — modelos sempre face-on, sem perspectiva
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    this.camera.position.z = 5;

    // Luz ambient + directional (sem isso geometrias com material standard
    // ficam pretas)
    const amb = new THREE.AmbientLight(0xffffff, 0.7);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(1, 1, 2);
    this.scene.add(amb);
    this.scene.add(dir);

    // Cria o placeholder geometrico baseado no nome do modelo
    this.maskGroup = this.buildPlaceholder(THREE, this.model);
    this.scene.add(this.maskGroup);
  }

  private buildPlaceholder(THREE: any, model: string): any {
    const group = new THREE.Group();
    switch (model) {
      case 'dog.glb':
        // Orelhas marrons (cones) + nariz preto (esfera)
        group.add(this.makeEar(THREE, -0.35, 0.5, '#8B4513'));
        group.add(this.makeEar(THREE, 0.35, 0.5, '#8B4513'));
        group.add(this.makeNose(THREE, 0, -0.1, '#000000', 0.08));
        break;
      case 'bunny.glb':
        // Orelhas longas brancas
        group.add(this.makeLongEar(THREE, -0.2, 0.6, '#fff5e6'));
        group.add(this.makeLongEar(THREE, 0.2, 0.6, '#fff5e6'));
        break;
      case 'cat.glb':
        // Orelhas pontudas pretas + bigode (cilindros finos)
        group.add(this.makeEar(THREE, -0.3, 0.45, '#1a1a1a'));
        group.add(this.makeEar(THREE, 0.3, 0.45, '#1a1a1a'));
        group.add(this.makeWhisker(THREE, -0.3, -0.1, -0.3));
        group.add(this.makeWhisker(THREE, 0.3, -0.1, 0.3));
        break;
      case 'bear.glb':
        // Orelhinhas redondas marrons + focinho
        group.add(this.makeRoundEar(THREE, -0.4, 0.5, '#6b3410'));
        group.add(this.makeRoundEar(THREE, 0.4, 0.5, '#6b3410'));
        group.add(this.makeNose(THREE, 0, -0.1, '#2d1810', 0.1));
        break;
      case 'clown.glb':
        // Nariz vermelho grande + chapeu
        group.add(this.makeNose(THREE, 0, -0.05, '#dc2626', 0.12));
        group.add(this.makeHat(THREE, 0, 0.7, '#7c3aed'));
        break;
      case 'alien.glb':
        // Antenas verdes
        group.add(this.makeAntenna(THREE, -0.15, 0.55, '#22c55e'));
        group.add(this.makeAntenna(THREE, 0.15, 0.55, '#22c55e'));
        break;
      default:
        // Fallback simples — cubo magenta no centro
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshStandardMaterial({ color: '#ec4899' });
        group.add(new THREE.Mesh(geo, mat));
    }
    return group;
  }

  private makeEar(THREE: any, x: number, y: number, color: string): any {
    const geo = new THREE.ConeGeometry(0.12, 0.3, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    return m;
  }
  private makeLongEar(THREE: any, x: number, y: number, color: string): any {
    const geo = new THREE.CylinderGeometry(0.06, 0.04, 0.5, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + 0.1, 0);
    return m;
  }
  private makeRoundEar(THREE: any, x: number, y: number, color: string): any {
    const geo = new THREE.SphereGeometry(0.1, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    return m;
  }
  private makeNose(THREE: any, x: number, y: number, color: string, size: number): any {
    const geo = new THREE.SphereGeometry(size, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0.1);
    return m;
  }
  private makeWhisker(THREE: any, x: number, y: number, lengthSign: number): any {
    const geo = new THREE.CylinderGeometry(0.005, 0.005, 0.3, 6);
    const mat = new THREE.MeshStandardMaterial({ color: '#fff' });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x + lengthSign * 0.15, y, 0);
    m.rotation.z = Math.PI / 2;
    return m;
  }
  private makeHat(THREE: any, x: number, y: number, color: string): any {
    const geo = new THREE.ConeGeometry(0.2, 0.4, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    return m;
  }
  private makeAntenna(THREE: any, x: number, y: number, color: string): any {
    const group = new this.THREE.Group();
    const stick = new this.THREE.Mesh(
      new this.THREE.CylinderGeometry(0.01, 0.01, 0.3, 8),
      new this.THREE.MeshStandardMaterial({ color }),
    );
    stick.position.y = 0.15;
    const ball = new this.THREE.Mesh(
      new this.THREE.SphereGeometry(0.04, 12, 12),
      new this.THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
    );
    ball.position.y = 0.3;
    group.add(stick);
    group.add(ball);
    group.position.set(x, y, 0);
    return group;
  }

  render({ video, landmarks, canvas }: {
    video: HTMLVideoElement;
    landmarks: Landmark[] | null;
    canvas: HTMLCanvasElement;
    timestamp: number;
  }): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1) Desenha o video como background
    ctx.drawImage(video, 0, 0, w, h);

    if (!landmarks || landmarks.length < 468 || !this.maskGroup) return;

    // 2) Calcula posicao + rotacao + escala da mascara baseado nos landmarks
    const nose = landmarks[NOSE_TIP];
    const leftCheek = landmarks[LEFT_CHEEK];
    const rightCheek = landmarks[RIGHT_CHEEK];
    const forehead = landmarks[FOREHEAD];
    const chin = landmarks[CHIN];
    const leftEye = landmarks[LEFT_EYE_OUTER];
    const rightEye = landmarks[RIGHT_EYE_OUTER];
    if (!nose || !leftCheek || !rightCheek || !forehead || !chin) return;

    // Largura facial em coords normalizadas [0,1]
    const faceWidth = Math.hypot(leftCheek.x - rightCheek.x, leftCheek.y - rightCheek.y);
    const faceHeight = Math.hypot(forehead.x - chin.x, forehead.y - chin.y);

    // Yaw: diferenca de Z entre cheeks (positivo = virou pra esquerda)
    const yaw = Math.atan2(leftCheek.z - rightCheek.z, leftCheek.x - rightCheek.x);
    // Pitch: diferenca de Z entre testa e queixo
    const pitch = Math.atan2(forehead.z - chin.z, chin.y - forehead.y);
    // Roll: angulo entre os olhos no plano XY
    const roll = rightEye && leftEye
      ? Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x)
      : 0;

    // Posiciona o group na cena (coords ortho [-1,1])
    // nose.x/y estao em [0,1], convertemos pra [-1,1] espelhado no Y (Three +Y up)
    this.maskGroup.position.set(
      (nose.x - 0.5) * 2,
      -(nose.y - 0.5) * 2,
      0,
    );
    // Escala proporcional ao tamanho do rosto
    const scale = Math.max(0.6, Math.min(2.0, faceHeight * 3));
    this.maskGroup.scale.set(scale, scale, scale);
    this.maskGroup.rotation.set(pitch, yaw, roll);

    // Ajusta renderer pro tamanho do canvas
    if (this.offscreen!.width !== w || this.offscreen!.height !== h) {
      this.offscreen!.width = w;
      this.offscreen!.height = h;
      this.renderer.setSize(w, h, false);
      // Ajusta camera ortho pra manter aspect
      const aspect = w / h;
      this.camera.left = -aspect;
      this.camera.right = aspect;
      this.camera.top = 1;
      this.camera.bottom = -1;
      this.camera.updateProjectionMatrix();
    }

    // 3) Renderiza Three.js
    this.renderer.render(this.scene, this.camera);
    // 4) Composita o canvas 3D por cima do video 2D
    ctx.drawImage(this.offscreen!, 0, 0, w, h);
  }

  dispose(): void {
    try {
      // Dispose geometrias/materials/texturas do scene tree
      this.scene?.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
          else obj.material.dispose();
        }
      });
      this.renderer?.dispose();
      this.renderer?.forceContextLoss?.();
    } catch {}
    this.scene = null;
    this.renderer = null;
    this.maskGroup = null;
    this.offscreen = null;
    this.THREE = null;
  }
}
