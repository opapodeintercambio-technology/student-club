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
    // POSICOES CALIBRADAS — anchor da maskGroup eh o FOREHEAD
    // (landmark 10), scale = 2*faceHeight em world coords.
    // Convencao de offsets Y (re-calibrada apos teste no telefone):
    //   +0.25 → ENCOSTADO no topo da cabeca/gorro (orelhas)
    //   +0.50 → acima da cabeca (chapeu de palhaco)
    //   +0.45 → orelhas longas de coelho subindo
    //   0     → testa (anchor)
    //   -0.50 → nariz tip (nariz palhaco, narizinho animal)
    //   -0.55 → embaixo do nariz (bigode)
    switch (model) {
      case 'dog.glb':
        // Orelhas marrons NO TOPO DA CABECA, laterais
        group.add(this.makeEar(THREE, -0.30, 0.25, '#8B4513'));
        group.add(this.makeEar(THREE,  0.30, 0.25, '#8B4513'));
        group.add(this.makeNose(THREE, 0, -0.50, '#000000', 0.07));
        break;
      case 'bunny.glb':
        // Orelhas LONGAS subindo do topo da cabeca (mais altas)
        group.add(this.makeLongEar(THREE, -0.16, 0.45, '#fff5e6'));
        group.add(this.makeLongEar(THREE,  0.16, 0.45, '#fff5e6'));
        break;
      case 'cat.glb':
        // Orelhas pontudas no topo + bigodes embaixo do nariz
        group.add(this.makeEar(THREE, -0.25, 0.25, '#1a1a1a'));
        group.add(this.makeEar(THREE,  0.25, 0.25, '#1a1a1a'));
        group.add(this.makeWhisker(THREE, -0.20, -0.55, -0.3));
        group.add(this.makeWhisker(THREE,  0.20, -0.55,  0.3));
        break;
      case 'bear.glb':
        // Orelhinhas redondas no topo, narizinho escuro no nariz real
        group.add(this.makeRoundEar(THREE, -0.32, 0.25, '#6b3410'));
        group.add(this.makeRoundEar(THREE,  0.32, 0.25, '#6b3410'));
        group.add(this.makeNose(THREE, 0, -0.50, '#2d1810', 0.08));
        break;
      case 'clown.glb':
        // Nariz vermelho NO nariz real + chapeu acima da cabeca
        group.add(this.makeNose(THREE, 0, -0.50, '#dc2626', 0.10));
        group.add(this.makeHat(THREE, 0, 0.50, '#7c3aed'));
        break;
      case 'alien.glb':
        // Antenas saindo do topo da cabeca (base no topo + stick/ball acima)
        group.add(this.makeAntenna(THREE, -0.12, 0.25, '#22c55e'));
        group.add(this.makeAntenna(THREE,  0.12, 0.25, '#22c55e'));
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
    // Cone menor (orelha de gato/cachorro). Altura 0.15 (era 0.3).
    const geo = new THREE.ConeGeometry(0.08, 0.15, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    return m;
  }
  private makeLongEar(THREE: any, x: number, y: number, color: string): any {
    // Orelha LONGA de coelho. Altura 0.30 (era 0.5) e offset interno 0.05.
    const geo = new THREE.CylinderGeometry(0.04, 0.03, 0.30, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y + 0.05, 0);
    return m;
  }
  private makeRoundEar(THREE: any, x: number, y: number, color: string): any {
    // Esfera menor (orelha de ursinho). Raio 0.08 (era 0.1).
    const geo = new THREE.SphereGeometry(0.08, 16, 16);
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
    // Chapeu menor — altura 0.22 (era 0.4), pra caber acima da cabeca.
    const geo = new THREE.ConeGeometry(0.14, 0.22, 16);
    const mat = new THREE.MeshStandardMaterial({ color });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    return m;
  }
  private makeAntenna(THREE: any, x: number, y: number, color: string): any {
    // Antena reduzida: stick 0.18 (era 0.3), bola no topo. Total y eh
    // base_y (0.18 vindo do outer) + stick_y (0.09) + ball_y_extra
    // (0.09 + 0.025) ≈ 0.30 → bola acima da cabeca, nao FORA da tela.
    const group = new this.THREE.Group();
    const stick = new this.THREE.Mesh(
      new this.THREE.CylinderGeometry(0.008, 0.008, 0.18, 8),
      new this.THREE.MeshStandardMaterial({ color }),
    );
    stick.position.y = 0.09;
    const ball = new this.THREE.Mesh(
      new this.THREE.SphereGeometry(0.025, 12, 12),
      new this.THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }),
    );
    ball.position.y = 0.20;
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

    // Posiciona o group na TESTA (forehead, landmark 10). Anchor antiga
    // era o NOSE_TIP, mas isso deixava as orelhas/chapeu/antenas DENTRO
    // da face mesmo com offsets +0.20 — porque o nariz fica BEM no
    // centro vertical da face. Ancorando na testa, +0.5 ja chega no
    // topo da cabeca e +0.75-0.85 fica bem acima (chapeu).
    this.maskGroup.position.set(
      (forehead.x - 0.5) * 2,
      -(forehead.y - 0.5) * 2,
      0,
    );
    // Escala = 2 * faceHeight: assim cada 0.5 em world Y equivale a
    // ~meia-altura facial (consistente em qualquer distancia da camera).
    // Range generoso pra cobrir face muito pequena (distante) e muito
    // grande (selfie de perto).
    const scale = Math.max(0.45, Math.min(1.4, faceHeight * 2.0));
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
