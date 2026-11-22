const RAD = Math.PI / 180;
const EARTH_KM = 6371;

export interface LatLon {
  lat: number;
  lon: number;
}

export function distanceKm(a: LatLon, b: LatLon): number {
  const dp = (b.lat - a.lat) * RAD;
  const dl = (b.lon - a.lon) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Rumbo inicial (0-360) de a hacia b. */
export function bearing(a: LatLon, b: LatLon): number {
  const dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(b.lat * RAD);
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

/** Punto a una fracción f (0-1) del círculo máximo entre a y b. */
export function interpolate(a: LatLon, b: LatLon, f: number): LatLon {
  const delta = distanceKm(a, b) / EARTH_KM;
  if (delta < 1e-9) return { ...a };
  const A = Math.sin((1 - f) * delta) / Math.sin(delta);
  const B = Math.sin(f * delta) / Math.sin(delta);
  const x = A * Math.cos(a.lat * RAD) * Math.cos(a.lon * RAD) + B * Math.cos(b.lat * RAD) * Math.cos(b.lon * RAD);
  const y = A * Math.cos(a.lat * RAD) * Math.sin(a.lon * RAD) + B * Math.cos(b.lat * RAD) * Math.sin(b.lon * RAD);
  const z = A * Math.sin(a.lat * RAD) + B * Math.sin(b.lat * RAD);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / RAD, lon: Math.atan2(y, x) / RAD };
}

/** Punto al que se llega saliendo de `from` con un rumbo y una distancia. */
export function destinationPoint(from: LatLon, headingDeg: number, km: number): LatLon {
  const d = km / EARTH_KM;
  const t = headingDeg * RAD;
  const p1 = from.lat * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = from.lon * RAD + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / RAD, lon: ((l2 / RAD + 540) % 360) - 180 };
}
