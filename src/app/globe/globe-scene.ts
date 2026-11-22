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
  DoubleSide,
  Quaternion,
  Raycaster,
  Scene,
  Shape,
  ShaderMaterial,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { geoDistance, geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { AIRPORT_LIST, airport } from '../core/airports';
import { COUNTRIES, CountryInfo, countryRings, findCountryAt } from '../core/countries';
import { extrapolate } from '../core/extrapolate';
import { classifyRoute, type Flight, type FlightClass } from '../core/flight.model';

export interface GlobeOptions {
  spinning: boolean;
  /** Avisa cuando cambia el país bajo el cursor (null si ninguno). */
  onHoverChange?: (name: string | null) => void;
  /** Avisa cuando se hace zoom a un país (null al volver a la vista general). */
  onZoomChange?: (name: string | null) => void;
}

export interface GlobeHandle {
  setSpinning(on: boolean): void;
  /** Reemplaza el conjunto de vuelos mostrados (altas, bajas y nuevas posiciones). */
  setFlights(flights: Flight[]): void;
  /** Vuelve de la vista acercada de un país a la vista general del planeta. */
  zoomOut(): void;
  dispose(): void;
}

const R = 1;
const FLIGHT_R = R * 1.008;
/** Velocidad del giro en radianes por segundo: ~52 s por vuelta, hacia el este como la Tierra. */
const SPIN = 0.12;
/** Distancia de cámara más cercana permitida (justo fuera del resplandor de atmósfera, a 1.12). */
const MIN_ZOOM_DIST = 1.22;
/** Cuánto más lejos del ajuste normal se puede alejar el planeta a mano (rueda o pellizco). */
const MAX_ZOOM_OUT = 1.6;
const ZOOM_ANIM_MS = 900;
const CLICK_PX = 6;

const FLIGHT_COLOR: Record<FlightClass, number> = {
  nacional: 0x2ecc71, // verde: vuelo nacional
  saliente: 0x2ecc71, // verde: saliendo del país
  entrante: 0xffd60a, // amarillo: entrando al país
  otro: 0xffffff,
};

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Latitud/longitud (grados) a punto de la esfera unitaria (la textura tiene lon 0 en +x). */
function toVec(lat: number, lon: number, r = R): Vector3 {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return new Vector3(r * Math.cos(phi) * Math.cos(lam), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(lam));
}

/**
 * Silueta de avión (fuselaje angosto, alas principales anchas y estabilizadores de cola más
 * pequeños, como el ícono clásico de un avión visto desde arriba), apoyada en el globo:
 * nariz en -Z y normal (hacia afuera) en +Y.
 */
function makePlaneGeometry(): ShapeGeometry {
  const s = new Shape();
  s.moveTo(0, 0.022); // nariz
  s.lineTo(0.0022, 0.004); // hombro derecho del fuselaje
  s.lineTo(0.016, -0.004); // punta del ala principal derecha
  s.lineTo(0.0032, -0.006); // raíz trasera del ala derecha
  s.lineTo(0.0026, -0.012); // fuselaje angosto entre las dos alas
  s.lineTo(0.008, -0.016); // punta del estabilizador (cola) derecho
  s.lineTo(0.0022, -0.018); // raíz trasera del estabilizador derecho
  s.lineTo(0, -0.0205); // cono de cola
  s.lineTo(-0.0022, -0.018); // raíz trasera del estabilizador izquierdo
  s.lineTo(-0.008, -0.016); // punta del estabilizador izquierdo
  s.lineTo(-0.0026, -0.012);
  s.lineTo(-0.0032, -0.006); // raíz trasera del ala izquierda
  s.lineTo(-0.016, -0.004); // punta del ala principal izquierda
  s.lineTo(-0.0022, 0.004); // hombro izquierdo del fuselaje
  s.closePath();
  const geo = new ShapeGeometry(s);
  geo.rotateX(-Math.PI / 2); // de plano XY (nariz en +Y) a apoyado en la esfera (nariz en -Z, normal en +Y)
  return geo;
}

const UP_AXIS = new Vector3(0, 1, 0);

/** Orienta el avión tangente a la esfera en su posición actual, apuntando hacia su rumbo (grados desde el norte). */
function orientPlane(mesh: Mesh, headingDeg: number): void {
  const normal = mesh.position.clone().normalize();
  let east = UP_AXIS.clone().cross(normal);
  if (east.lengthSq() < 1e-6) east = new Vector3(1, 0, 0); // caso raro: cerca de un polo
  east.normalize();
  const north = normal.clone().cross(east).normalize();
  const rad = (headingDeg * Math.PI) / 180;
  const forward = north.multiplyScalar(Math.cos(rad)).add(east.multiplyScalar(Math.sin(rad)));
  mesh.up.copy(normal);
  mesh.lookAt(mesh.position.clone().add(forward));
}

function makeTexture(): CanvasTexture {
  const w = 4096;
  const h = 2048;
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

  // Un solo trazo de todos los países: delinea a la vez la costa y las fronteras internas.
  const collection: FeatureCollection<Polygon | MultiPolygon> = {
    type: 'FeatureCollection',
    features: COUNTRIES.map((c) => c.feature),
  };
  ctx.beginPath();
  path(collection);
  ctx.fillStyle = '#8a8a8a';
  ctx.fill();
  ctx.strokeStyle = '#dcdcdc';
  ctx.lineWidth = 1.1;
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

export function createGlobe(container: HTMLElement, opts: GlobeOptions): GlobeHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);

  scene.add(new AmbientLight(0xffffff, 1.2));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, 2, 4);
  scene.add(sun);

  // Inclinación para ver el hemisferio norte; el giro y el apunte a un país van en el grupo hijo.
  const tilt = new Group();
  tilt.rotation.x = 0.32;
  const globe = new Group();
  const center = toVec(19, -70);
  globe.rotation.y = -Math.atan2(center.x, center.z); // arranca mostrando República Dominicana
  tilt.add(globe);
  scene.add(tilt);

  const landMesh = new Mesh(
    new SphereGeometry(R, 96, 64),
    new MeshStandardMaterial({ map: makeTexture(), roughness: 0.9, metalness: 0 }),
  );
  globe.add(landMesh);

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

  // Aeropuertos: geometría de radio 1 reescalada cada cuadro (ver tick) según el zoom,
  // para que no se vean enormes ni al alejar ni, sobre todo, al acercarse a un país.
  const AIRPORT_SPHERE = new SphereGeometry(1, 12, 12);
  const airportDots: { mesh: Mesh; baseRadius: number }[] = [];
  for (const ap of AIRPORT_LIST) {
    const baseRadius = ap.rd ? 0.009 : 0.006;
    const dot = new Mesh(AIRPORT_SPHERE, new MeshBasicMaterial({ color: ap.rd ? 0xffffff : 0xbbbbbb }));
    dot.position.copy(toVec(ap.lat, ap.lon, R * 1.004));
    dot.scale.setScalar(baseRadius);
    globe.add(dot);
    airportDots.push({ mesh: dot, baseRadius });
  }

  // Vuelos: un punto por vuelo, coloreado según si es nacional, de salida o de llegada,
  // y el arco de su ruta si se conocen origen y destino.
  const markers = new Map<string, Marker>();
  const arcs = new Map<string, Line>();
  const flightGeo = makePlaneGeometry();
  // DoubleSide evita que el avión "desaparezca" si en algún ángulo se ve desde atrás de su cara.
  const flightMat: Record<FlightClass, MeshBasicMaterial> = {
    nacional: new MeshBasicMaterial({ color: FLIGHT_COLOR.nacional, side: DoubleSide }),
    saliente: new MeshBasicMaterial({ color: FLIGHT_COLOR.saliente, side: DoubleSide }),
    entrante: new MeshBasicMaterial({ color: FLIGHT_COLOR.entrante, side: DoubleSide }),
    otro: new MeshBasicMaterial({ color: FLIGHT_COLOR.otro, side: DoubleSide }),
  };
  const arcMat: Record<FlightClass, LineBasicMaterial> = {
    nacional: new LineBasicMaterial({ color: FLIGHT_COLOR.nacional, transparent: true, opacity: 0.55 }),
    saliente: new LineBasicMaterial({ color: FLIGHT_COLOR.saliente, transparent: true, opacity: 0.55 }),
    entrante: new LineBasicMaterial({ color: FLIGHT_COLOR.entrante, transparent: true, opacity: 0.55 }),
    otro: new LineBasicMaterial({ color: FLIGHT_COLOR.otro, transparent: true, opacity: 0.4 }),
  };

  const buildArc = (from: string, to: string, cls: FlightClass): Line | null => {
    const fa = airport(from);
    const fb = airport(to);
    if (!fa || !fb) return null;
    const a = toVec(fa.lat, fa.lon, R * 1.004);
    const b = toVec(fb.lat, fb.lon, R * 1.004);
    // Arco bajo, pegado a la superficie (como la altura de crucero real frente al radio del planeta),
    // en vez de un domo que parece ignorar la curvatura.
    const bulge = 0.01 + a.angleTo(b) * 0.035;
    const control = a.clone().add(b).normalize().multiplyScalar(R + bulge);
    return new Line(
      new BufferGeometry().setFromPoints(new QuadraticBezierCurve3(a, control, b).getPoints(64)),
      arcMat[cls],
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
        m = { mesh: new Mesh(flightGeo, flightMat.otro), flight: f, shown: null };
        globe.add(m.mesh);
        markers.set(f.id, m);
      }
      m.flight = f;
      if (f.origin && f.destination) {
        m.mesh.material = flightMat[classifyRoute(f.origin, f.destination)];
        routeKeys.add(`${f.origin}-${f.destination}`);
      } else {
        m.mesh.material = flightMat.otro;
      }
    }
    for (const [key, line] of arcs) {
      if (!routeKeys.has(key)) {
        globe.remove(line);
        line.geometry.dispose();
        arcs.delete(key);
      }
    }
    for (const key of routeKeys) {
      if (arcs.has(key)) continue;
      const [from, to] = key.split('-') as [string, string];
      const line = buildArc(from, to, classifyRoute(from, to));
      if (line) {
        globe.add(line);
        arcs.set(key, line);
      }
    }
  };

  // --- País bajo el cursor: resalte de fronteras y acercamiento al hacer click -----------------

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const HOVER_COLOR = 0x2ec4b6; // verde azulado

  const outlineCache = new Map<string, Group>();
  const outlineFor = (country: CountryInfo): Group => {
    let g = outlineCache.get(country.id);
    if (g) return g;
    g = new Group();
    const mat = new LineBasicMaterial({ color: HOVER_COLOR });
    for (const ring of countryRings(country)) {
      const pts = ring.map(([lon, lat]) => toVec(lat, lon, R * 1.006));
      g.add(new Line(new BufferGeometry().setFromPoints(pts), mat));
    }
    g.visible = false;
    globe.add(g);
    outlineCache.set(country.id, g);
    return g;
  };

  /** Punto geográfico (grados) bajo una posición de pantalla, o null si cae fuera del globo. */
  const pointAtClient = (clientX: number, clientY: number): { lat: number; lon: number } | null => {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(landMesh, false)[0];
    if (!hit) return null;
    const local = landMesh.worldToLocal(hit.point.clone()).normalize();
    return {
      lat: Math.asin(clamp(local.y, -1, 1)) * (180 / Math.PI),
      lon: Math.atan2(-local.z, local.x) * (180 / Math.PI),
    };
  };
  const pickCountryAt = (clientX: number, clientY: number): CountryInfo | null => {
    const p = pointAtClient(clientX, clientY);
    return p ? findCountryAt(p.lat, p.lon) : null;
  };

  let hoveredId: string | null = null;
  const setHovered = (country: CountryInfo | null): void => {
    const id = country?.id ?? null;
    if (id === hoveredId) return;
    if (hoveredId) {
      const prev = outlineCache.get(hoveredId);
      if (prev) prev.visible = false;
    }
    hoveredId = id;
    if (country) outlineFor(country).visible = true;
    canvas.style.cursor = dragging ? 'grabbing' : country ? 'pointer' : 'grab';
    opts.onHoverChange?.(country?.name ?? null);
  };

  // --- Giro, arrastre y acercamiento (zoom) a un país --------------------------------------------

  let spinning = opts.spinning;
  let raf = 0;
  let last = performance.now();
  let velY = 0; // velocidad angular actual del giro (rad/s)
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let downX = 0;
  let downY = 0;
  let hoverPending = false;
  let pointerX = 0;
  let pointerY = 0;

  let zoomed = false;
  let zooming = false;
  let fitDistance = 0; // distancia que encuadra todo el planeta para el tamaño actual del panel
  let userDistance = 0; // distancia elegida a mano (rueda o pellizco) cuando no se mira un país
  let manualZoom = false; // true en cuanto el usuario toca la rueda o hace un pellizco
  let camDistance = 0; // distancia realmente usada en la cámara este cuadro
  const animFromQuat = new Quaternion();
  const animToQuat = new Quaternion();
  let animFromDist = 0;
  let animToDist = 0;
  let animStart = 0;
  const preZoomQuat = new Quaternion();
  let preZoomDist = 0;

  function angularRadiusOf(country: CountryInfo): number {
    const [lon0, lat0] = country.centroid;
    let max = 0.04;
    for (const ring of countryRings(country)) {
      for (const [lon, lat] of ring) max = Math.max(max, geoDistance([lon0, lat0], [lon, lat]));
    }
    return max;
  }

  function zoomTo(country: CountryInfo): void {
    const point = toVec(country.centroid[1], country.centroid[0], 1).normalize();
    const localTarget = new Vector3(0, 0, 1).applyQuaternion(tilt.quaternion.clone().invert()).normalize();
    animToQuat.setFromUnitVectors(point, localTarget);
    animToDist = clamp(MIN_ZOOM_DIST + angularRadiusOf(country) * 2.6, MIN_ZOOM_DIST, fitDistance);

    if (!zoomed) {
      preZoomQuat.copy(globe.quaternion);
      preZoomDist = camDistance; // vuelve exactamente al nivel de zoom manual que tenía antes
    }
    animFromQuat.copy(globe.quaternion);
    animFromDist = camDistance;
    animStart = performance.now();
    zooming = true;
    zoomed = true;
    setHovered(null);
    opts.onZoomChange?.(country.name);
  }

  function zoomOut(): void {
    if (!zoomed) return;
    animFromQuat.copy(globe.quaternion);
    animFromDist = camDistance;
    animToQuat.copy(preZoomQuat);
    animToDist = preZoomDist;
    animStart = performance.now();
    zooming = true;
    zoomed = false;
    opts.onZoomChange?.(null);
  }

  // Arrastrar con un dedo o el mouse gira el globo; al soltar se reanuda el giro suavemente.
  // La rueda del mouse o un pellizco con dos dedos acercan o alejan el planeta libremente.
  // Mientras está acercado a un país no se arrastra ni se hace zoom libre: un click corto elige otro país.
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'pan-y'; // en táctil, el scroll vertical de la página sigue funcionando
  canvas.style.userSelect = 'none';
  const K = 0.006; // radianes por píxel arrastrado

  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let pinchBaseDistance = 0;

  const pinchPoints = (): [{ x: number; y: number }, { x: number; y: number }] => {
    const [a, b] = [...activePointers.values()];
    return [a!, b!];
  };

  const onDown = (e: PointerEvent): void => {
    downX = e.clientX;
    downY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    if (zoomed || zooming) return; // acercado a un país: solo se puede hacer click en otro
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      dragging = false;
      const [a, b] = pinchPoints();
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchBaseDistance = userDistance;
      return;
    }
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = e.timeStamp;
    velY = 0;
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent): void => {
    if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size >= 2) {
      const [a, b] = pinchPoints();
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      if (pinchDist > 10) {
        manualZoom = true;
        userDistance = clamp(pinchBaseDistance * (pinchDist / dist), MIN_ZOOM_DIST, fitDistance * MAX_ZOOM_OUT);
      }
      return;
    }
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      const dt = Math.max(0.008, (e.timeStamp - lastT) / 1000);
      globe.rotation.y += dx * K;
      tilt.rotation.x = clamp(tilt.rotation.x + dy * K, -1.2, 1.2);
      velY = clamp(velY + ((dx * K) / dt - velY) * 0.5, -6, 6);
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = e.timeStamp;
      return;
    }
    pointerX = e.clientX;
    pointerY = e.clientY;
    hoverPending = true;
  };
  const onUp = (e: PointerEvent): void => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchDist = 0;
    if (dragging && activePointers.size === 0) {
      dragging = false;
      if (e.timeStamp - lastT > 80) velY = 0; // soltó después de quedarse quieto: sin inercia
      canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
    }
    if (activePointers.size === 0 && moved < CLICK_PX) {
      const country = pickCountryAt(e.clientX, e.clientY);
      if (country) zoomTo(country);
    }
  };
  const onLeave = (): void => {
    if (!dragging) setHovered(null);
  };
  const onWheel = (e: WheelEvent): void => {
    if (zoomed || zooming) return;
    e.preventDefault();
    manualZoom = true;
    const factor = Math.exp(e.deltaY * 0.0015);
    userDistance = clamp(userDistance * factor, MIN_ZOOM_DIST, fitDistance * MAX_ZOOM_OUT);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const resize = (): void => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const half = Math.tan((camera.fov * Math.PI) / 360);
    fitDistance = Math.max(1.32 / half, 1.32 / (half * camera.aspect));
    userDistance = manualZoom ? clamp(userDistance, MIN_ZOOM_DIST, fitDistance * MAX_ZOOM_OUT) : fitDistance;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (hoverPending) {
      hoverPending = false;
      if (!dragging) setHovered(pickCountryAt(pointerX, pointerY));
    }

    if (zooming) {
      const t = Math.min(1, (now - animStart) / ZOOM_ANIM_MS);
      const eased = easeInOutCubic(t);
      globe.quaternion.slerpQuaternions(animFromQuat, animToQuat, eased);
      camDistance = animFromDist + (animToDist - animFromDist) * eased;
      if (t >= 1) zooming = false;
    } else if (zoomed) {
      camDistance = animToDist; // quieto, mirando el país acercado
    } else {
      camDistance = userDistance; // sigue el zoom libre (rueda o pellizco) del usuario
      if (!dragging) {
        // La velocidad vuelve suavemente al giro normal (o a cero si está en pausa).
        velY += ((spinning ? SPIN : 0) - velY) * Math.min(1, dt * 2.5);
        globe.rotation.y += velY * dt;
      }
    }
    camera.position.set(0, 0, camDistance);

    // Los aeropuertos se ven del tamaño pensado para la vista general; al acercarse a un país
    // (camDistance baja hacia MIN_ZOOM_DIST) se reducen en proporción, para no tapar el mapa.
    const apScale = clamp(camDistance / fitDistance, 0.22, 1.5);
    for (const d of airportDots) d.mesh.scale.setScalar(d.baseRadius * apScale);

    // Los vuelos siguen en vivo aunque el giro esté en pausa o la vista esté acercada.
    const nowMs = Date.now();
    for (const m of markers.values()) {
      const p = extrapolate(m.flight, nowMs);
      const target = toVec(p.lat, p.lon, FLIGHT_R);
      if (m.shown) m.shown.lerp(target, 1 - Math.exp(-dt * 6)).setLength(FLIGHT_R);
      else m.shown = target;
      m.mesh.position.copy(m.shown);
      orientPlane(m.mesh, m.flight.headingDeg);
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
    zoomOut,
    dispose(): void {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
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
