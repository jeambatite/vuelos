import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  QuadraticBezierCurve3,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import landTopo from 'world-atlas/land-110m.json';

export interface GlobeHandle {
  setSpinning(on: boolean): void;
  dispose(): void;
}

const R = 1;
/** Vueltas por segundo en radianes: ~52 s por giro completo, hacia el este como la Tierra. */
const SPIN = 0.12;

const AIRPORTS: Record<string, [number, number]> = {
  SDQ: [18.4297, -69.6689],
  STI: [19.4061, -70.6047],
  PUJ: [18.5674, -68.3634],
  POP: [19.7579, -70.57],
  SJU: [18.4394, -66.0018],
  MIA: [25.7959, -80.287],
  JFK: [40.6413, -73.7781],
  PTY: [9.0714, -79.3835],
  BOG: [4.7016, -74.1469],
  MAD: [40.4983, -3.5676],
  CUN: [21.0365, -86.8771],
};
const RD = new Set(['SDQ', 'STI', 'PUJ', 'POP']);
const ROUTES: [string, string][] = [
  ['SDQ', 'MIA'], ['SDQ', 'JFK'], ['PUJ', 'MAD'], ['SDQ', 'PTY'], ['STI', 'MIA'],
  ['SDQ', 'BOG'], ['PUJ', 'JFK'], ['SDQ', 'SJU'], ['SDQ', 'CUN'], ['POP', 'MIA'],
];

/** Latitud/longitud a punto de la esfera (la textura equirectangular tiene lon 0 en +x). */
function toVec(lat: number, lon: number, r = R): Vector3 {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return new Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}

function makeTexture(): CanvasTexture {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const path = geoPath(geoEquirectangular().fitSize([w, h], { type: 'Sphere' }), ctx);

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const topo = landTopo as unknown as Topology;
  const land = feature(topo, topo.objects['land']!);
  ctx.beginPath();
  path(land);
  ctx.fillStyle = '#8a8a8a';
  ctx.fill();
  ctx.strokeStyle = '#dcdcdc';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createGlobe(container: HTMLElement, opts: { spinning: boolean }): GlobeHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);

  scene.add(new AmbientLight(0xffffff, 1.2));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 2, 4);
  scene.add(sun);

  // Inclinación para ver el hemisferio norte; el giro va en el grupo hijo.
  const tilt = new Group();
  tilt.rotation.x = 0.32;
  const globe = new Group();
  const center = toVec(19, -70);
  globe.rotation.y = -Math.atan2(center.x, center.z); // arranca mostrando República Dominicana
  tilt.add(globe);
  scene.add(tilt);

  globe.add(
    new Mesh(
      new SphereGeometry(R, 96, 64),
      new MeshStandardMaterial({ map: makeTexture(), roughness: 0.9, metalness: 0 }),
    ),
  );

  // Resplandor de atmósfera (no gira con el planeta).
  tilt.add(
    new Mesh(
      new SphereGeometry(R * 1.12, 64, 48),
      new ShaderMaterial({
        vertexShader:
          'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'varying vec3 vN; void main(){ float i = pow(max(0.0, 0.62 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0) * i * 1.2; }',
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );

  // Estrellas.
  const starPos: number[] = [];
  for (let i = 0; i < 700; i++) {
    const v = new Vector3().randomDirection().multiplyScalar(18 + Math.random() * 14);
    starPos.push(v.x, v.y, v.z);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new Float32BufferAttribute(starPos, 3));
  scene.add(new Points(starGeo, new PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.8 })));

  // Aeropuertos.
  for (const [code, [lat, lon]] of Object.entries(AIRPORTS)) {
    const rd = RD.has(code);
    const dot = new Mesh(
      new SphereGeometry(rd ? 0.016 : 0.011, 12, 12),
      new MeshBasicMaterial({ color: rd ? 0xffffff : 0xbbbbbb }),
    );
    dot.position.copy(toVec(lat, lon, R * 1.004));
    globe.add(dot);
  }

  // Rutas con un avión (punto) recorriendo cada arco.
  const flyers: { mesh: Mesh; curve: QuadraticBezierCurve3; t: number; speed: number }[] = [];
  ROUTES.forEach(([from, to], i) => {
    const a = toVec(...AIRPORTS[from]!);
    const b = toVec(...AIRPORTS[to]!);
    const angle = a.angleTo(b);
    const control = a.clone().add(b).normalize().multiplyScalar(R + 0.1 + angle * 0.55);
    const curve = new QuadraticBezierCurve3(a.multiplyScalar(1.004), control, b.multiplyScalar(1.004));
    globe.add(
      new Line(
        new BufferGeometry().setFromPoints(curve.getPoints(64)),
        new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
      ),
    );
    const mesh = new Mesh(new SphereGeometry(0.014, 10, 10), new MeshBasicMaterial({ color: 0xffffff }));
    globe.add(mesh);
    flyers.push({ mesh, curve, t: (i * 0.173) % 1, speed: 0.045 + (i % 4) * 0.012 });
  });

  let spinning = opts.spinning;
  let raf = 0;
  let last = performance.now();
  let velY = 0; // velocidad angular actual del giro (rad/s)
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;

  // Arrastrar con el puntero para girar el globo; al soltar se reanuda el giro suavemente.
  const canvas = renderer.domElement;
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'pan-y'; // en táctil, el scroll vertical de la página sigue funcionando
  canvas.style.userSelect = 'none';
  const K = 0.006; // radianes por píxel arrastrado

  const onDown = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
    velY = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const dt = Math.max(0.008, (e.timeStamp - lastT) / 1000);
    globe.rotation.y += dx * K;
    tilt.rotation.x = Math.max(-1.2, Math.min(1.2, tilt.rotation.x + dy * K));
    velY = Math.max(-6, Math.min(6, velY + ((dx * K) / dt - velY) * 0.5));
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
  };
  const onUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (e.timeStamp - lastT > 80) velY = 0; // soltó después de quedarse quieto: sin inercia
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    camera.position.set(0, 0, Math.max(1.32 / half, 1.32 / (half * camera.aspect)));
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging) {
      // La velocidad vuelve suavemente al giro normal (o a cero si está en pausa).
      velY += ((spinning ? SPIN : 0) - velY) * Math.min(1, dt * 2.5);
      globe.rotation.y += velY * dt;
    }
    if (spinning) {
      for (const f of flyers) {
        f.t = (f.t + dt * f.speed) % 1;
        f.mesh.position.copy(f.curve.getPoint(f.t));
      }
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  flyers.forEach((f) => f.mesh.position.copy(f.curve.getPoint(f.t)));
  raf = requestAnimationFrame(tick);

  return {
    setSpinning(on: boolean): void {
      spinning = on;
    },
    dispose(): void {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      scene.traverse((obj) => {
        const o = obj as Mesh;
        o.geometry?.dispose();
        const mat = o.material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
