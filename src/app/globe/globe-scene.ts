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
import { AIRPORT_LIST, airport } from '../core/airports';
import { extrapolate } from '../core/extrapolate';
import type { Flight } from '../core/flight.model';

export interface GlobeHandle {
  setSpinning(on: boolean): void;
  /** Reemplaza el conjunto de vuelos mostrados (altas, bajas y nuevas posiciones). */
  setFlights(flights: Flight[]): void;
  dispose(): void;
}

const R = 1;
const FLIGHT_R = R * 1.008;
/** Velocidad del giro en radianes por segundo: ~52 s por vuelta, hacia el este como la Tierra. */
const SPIN = 0.12;

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

interface Marker {
  mesh: Mesh;
  flight: Flight;
  /** Posición mostrada, suavizada hacia la posición estimada. */
  shown: Vector3 | null;
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
  for (const ap of AIRPORT_LIST) {
    const dot = new Mesh(
      new SphereGeometry(ap.rd ? 0.016 : 0.011, 12, 12),
      new MeshBasicMaterial({ color: ap.rd ? 0xffffff : 0xbbbbbb }),
    );
    dot.position.copy(toVec(ap.lat, ap.lon, R * 1.004));
    globe.add(dot);
  }

  // Vuelos: un punto por vuelo y, si se conocen origen y destino, el arco de su ruta.
  const markers = new Map<string, Marker>();
  const arcs = new Map<string, Line>();
  const flightGeo = new SphereGeometry(0.014, 10, 10);
  const flightMat = new MeshBasicMaterial({ color: 0xffffff });

  const buildArc = (from: string, to: string): Line | null => {
    const fa = airport(from);
    const fb = airport(to);
    if (!fa || !fb) return null;
    const a = toVec(fa.lat, fa.lon, R * 1.004);
    const b = toVec(fb.lat, fb.lon, R * 1.004);
    const control = a.clone().add(b).normalize().multiplyScalar(R + 0.1 + a.angleTo(b) * 0.55);
    return new Line(
      new BufferGeometry().setFromPoints(new QuadraticBezierCurve3(a, control, b).getPoints(64)),
      new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }),
    );
  };

  const setFlights = (list: Flight[]): void => {
    const ids = new Set(list.map((f) => f.id));
    for (const [id, m] of markers) {
      if (!ids.has(id)) {
        globe.remove(m.mesh);
        markers.delete(id);
      }
    }
    const routeKeys = new Set<string>();
    for (const f of list) {
      let m = markers.get(f.id);
      if (!m) {
        m = { mesh: new Mesh(flightGeo, flightMat), flight: f, shown: null };
        globe.add(m.mesh);
        markers.set(f.id, m);
      }
      m.flight = f;
      if (f.origin && f.destination) routeKeys.add(`${f.origin}-${f.destination}`);
    }
    for (const [key, line] of arcs) {
      if (!routeKeys.has(key)) {
        globe.remove(line);
        line.geometry.dispose();
        (line.material as LineBasicMaterial).dispose();
        arcs.delete(key);
      }
    }
    for (const key of routeKeys) {
      if (arcs.has(key)) continue;
      const [from, to] = key.split('-') as [string, string];
      const line = buildArc(from, to);
      if (line) {
        globe.add(line);
        arcs.set(key, line);
      }
    }
  };

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
    // Los vuelos siguen en vivo aunque el giro esté en pausa.
    const nowMs = Date.now();
    for (const m of markers.values()) {
      const p = extrapolate(m.flight, nowMs);
      const target = toVec(p.lat, p.lon, FLIGHT_R);
      if (m.shown) m.shown.lerp(target, 1 - Math.exp(-dt * 6)).setLength(FLIGHT_R);
      else m.shown = target;
      m.mesh.position.copy(m.shown);
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    setSpinning(on: boolean): void {
      spinning = on;
    },
    setFlights,
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
