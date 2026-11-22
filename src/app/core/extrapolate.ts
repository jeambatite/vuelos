import { Flight } from './flight.model';
import { LatLon, destinationPoint } from './geo';

/** Máximo de segundos que se proyecta una posición vieja. */
const MAX_AGE_S = 60;

/**
 * Posición estimada ahora mismo a partir de la última medición, rumbo y velocidad.
 * Las APIs reales actualizan cada varios segundos; esto mantiene el movimiento fluido entre actualizaciones.
 */
export function extrapolate(f: Flight, nowMs: number): LatLon {
  const age = Math.min(Math.max((nowMs - f.updatedAt) / 1000, 0), MAX_AGE_S);
  if (f.onGround || f.speedKmh < 30 || age === 0) return { lat: f.lat, lon: f.lon };
  return destinationPoint({ lat: f.lat, lon: f.lon }, f.headingDeg, (f.speedKmh / 3600) * age);
}
