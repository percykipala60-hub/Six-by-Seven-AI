import * as THREE from "three";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";

// Moteur des scènes 3D du site, écrit directement avec three.js (sans react-three-fiber, qui pesait à lui
// seul plus de 160 Ko et empêchait d'alléger three.js). Il reproduit ce que faisait la bibliothèque :
// une zone de dessin qui suit la taille de son emplacement, une caméra, et une boucle d'images qui peut
// tourner en continu, seulement à la demande, ou être arrêtée.

export type Frameloop = "always" | "demand" | "never";

/** Ce que reçoit chaque fonction appelée à chaque image. */
export type FrameState = {
  /** Temps écoulé depuis la création de la scène, en secondes. */
  time: number;
  /** Durée de l'image précédente, en secondes. */
  delta: number;
  size: { width: number; height: number };
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
};
export type FrameFn = (state: FrameState) => void;

export type StageOptions = {
  /** Styles de l'emplacement de la zone de dessin (fusionnés avec position relative, 100 % × 100 %). */
  style?: Partial<CSSStyleDeclaration>;
  camera: { position: [number, number, number]; fov: number; near: number; far: number };
  /** Définition : fixe, ou plage [min, max] bornée par celle de l'écran. */
  dpr?: number | [number, number];
  renderer?: THREE.WebGLRendererParameters;
  toneMapping?: THREE.ToneMapping;
  frameloop?: Frameloop;
  /** Définition adaptative (voir Stage.adapt) : seulement pour une scène dessinée en continu. */
  adaptive?: boolean;
};

export class Stage {
  readonly root: HTMLDivElement;
  readonly container: HTMLDivElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly size = { width: 0, height: 0 };
  css: CSS3DRenderer | null = null;

  private frameloop: Frameloop;
  private subs: { fn: FrameFn; priority: number; order: number }[] = [];
  private order = 0;
  private frames = 0;
  private raf = 0;
  private start = performance.now();
  private last = 0;
  private dprRange: [number, number];
  private ro: ResizeObserver;
  private disposed = false;
  private adaptive: Adaptive | null = null;
  private inFrame = false;
  private readonly state: FrameState;

  constructor(parent: HTMLElement, opts: StageOptions) {
    // Même structure que la zone de dessin de react-three-fiber : un emplacement, un conteneur mesuré, la zone.
    this.root = document.createElement("div");
    Object.assign(this.root.style, { position: "relative", width: "100%", height: "100%", overflow: "hidden" }, opts.style);
    this.container = document.createElement("div");
    Object.assign(this.container.style, { width: "100%", height: "100%" });
    this.root.appendChild(this.container);
    parent.appendChild(this.root);

    this.renderer = new THREE.WebGLRenderer({ powerPreference: "high-performance", antialias: true, alpha: true, ...opts.renderer });
    this.renderer.domElement.style.display = "block";
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = opts.toneMapping ?? THREE.ACESFilmicToneMapping;
    this.container.appendChild(this.renderer.domElement);

    const c = opts.camera;
    this.camera = new THREE.PerspectiveCamera(c.fov, 1, c.near, c.far);
    this.camera.position.set(...c.position);
    // Comme react-three-fiber : la caméra regarde le centre de la scène.
    this.camera.lookAt(0, 0, 0);

    const d = opts.dpr ?? 1;
    this.dprRange = Array.isArray(d) ? d : [d, d];
    this.renderer.setPixelRatio(this.screenDpr());
    this.frameloop = opts.frameloop ?? "always";
    if (opts.adaptive) this.adaptive = new Adaptive(this);

    this.state = { time: 0, delta: 0, size: this.size, camera: this.camera, scene: this.scene };
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
    this.resize();
    this.kick();
  }

  /** Définition visée : celle de l'écran, bornée par la plage demandée. */
  screenDpr() {
    const [lo, hi] = this.dprRange;
    return Math.min(Math.max(lo, window.devicePixelRatio || 2), hi);
  }

  setDpr(dpr: number) {
    if (Math.abs(this.renderer.getPixelRatio() - dpr) < 1e-3) return;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(this.size.width, this.size.height);
    this.invalidate();
  }

  /** Calque des interfaces (CSS 3D), placé sous l'image 3D : chaque écran y est visible à travers une
   *  « fenêtre » découpée dans l'image (voir createScreenAnchor). */
  addCssLayer() {
    if (this.css) return this.css;
    const css = new CSS3DRenderer();
    Object.assign(css.domElement.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "0" });
    Object.assign(this.renderer.domElement.style, { position: "relative", zIndex: "1" });
    this.container.insertBefore(css.domElement, this.renderer.domElement);
    css.setSize(this.size.width, this.size.height);
    this.css = css;
    return css;
  }

  /** Fonction appelée à chaque image ; les priorités les plus hautes passent en dernier (le dessin). */
  onFrame(fn: FrameFn, priority = 0) {
    const sub = { fn, priority, order: this.order++ };
    this.subs.push(sub);
    this.subs.sort((a, b) => a.priority - b.priority || a.order - b.order);
    this.invalidate();
    return () => {
      this.subs = this.subs.filter((s) => s !== sub);
    };
  }

  setFrameloop(mode: Frameloop) {
    if (mode === this.frameloop) return;
    this.frameloop = mode;
    if (mode === "never") {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else this.kick();
  }

  /** Demande une nouvelle image (rendu à la demande). Appelée pendant une image, en demande une de plus. */
  invalidate() {
    if (this.disposed || this.frameloop === "never") return;
    this.frames = this.inFrame ? 2 : Math.max(this.frames, 1);
    this.kick();
  }

  private kick() {
    if (this.raf || this.disposed || this.frameloop === "never") return;
    if (this.frameloop === "demand" && this.frames === 0) return;
    // Reprise après une pause : la première image ne compte pas tout le temps passé à l'arrêt.
    this.last = 0;
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (this.disposed || this.frameloop === "never") return;
    const s = this.state;
    s.time = (now - this.start) / 1000;
    s.delta = this.last ? Math.min((now - this.last) / 1000, 0.25) : 1 / 60;
    this.last = now;
    this.inFrame = true;
    for (const sub of this.subs) sub.fn(s);
    this.inFrame = false;
    this.adaptive?.sample(now);
    this.frames = Math.max(0, this.frames - 1);
    if (this.frameloop === "always" || this.frames > 0) this.raf = requestAnimationFrame(this.loop);
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h || (w === this.size.width && h === this.size.height)) return;
    this.size.width = w;
    this.size.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.css?.setSize(w, h);
    this.invalidate();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.subs = [];
    // La perte du contexte graphique libère d'un coup tout ce que la carte graphique gardait (modèles, textures).
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.root.remove();
  }
}

// Définition adaptative : la scène part en pleine définition et ne la baisse (par petites touches)
// que si l'appareil n'arrive plus à suivre, puis la remonte dès que ça va mieux. Même méthode que
// l'outil PerformanceMonitor de drei : 10 mesures de 250 ms ; si les trois quarts sont sous le seuil
// bas, la définition baisse d'un cran (10 %), si elles sont au-dessus du seuil haut, elle remonte.
// Après 6 allers-retours, on garde la définition atteinte au lieu d'osciller.
class Adaptive {
  private frames: number[] = [];
  private averages: number[] = [];
  private refresh = 0;
  private factor = 1;
  private flips = 0;
  private stopped = false;
  private readonly max: number;

  constructor(private stage: Stage) {
    this.max = Math.min(window.devicePixelRatio || 1, 2);
    if (this.max <= 1) this.stopped = true;
  }

  sample(now: number) {
    if (this.stopped) return;
    this.frames.push(now);
    const span = this.frames[this.frames.length - 1] - this.frames[0];
    if (span < 250) return;
    const fps = Math.round((this.frames.length / span) * 1000);
    this.refresh = Math.max(this.refresh, fps);
    this.averages.push(fps);
    this.frames = [];
    if (this.averages.length < 10) return;
    const [lower, upper] = this.refresh > 100 ? [60, 100] : [40, 60];
    const before = this.factor;
    if (this.averages.filter((a) => a >= upper).length > 7.5) {
      this.factor = Math.min(1, this.factor + 0.1);
      this.flips++;
    }
    if (this.averages.filter((a) => a < lower).length > 7.5) {
      this.factor = Math.max(0, this.factor - 0.1);
      this.flips++;
    }
    this.averages = [];
    if (this.factor !== before) this.stage.setDpr(Math.round((1 + (this.max - 1) * this.factor) * 4) / 4);
    if (this.flips > 6) this.stopped = true;
  }
}
