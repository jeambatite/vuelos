import { airport } from './airports';

/** Un vuelo con su posición. Es el único formato que entiende la app: cada API se adapta a este modelo. */
export interface Flight {
  /** Identificador estable entre actualizaciones (ej. icao24 o id interno). */
  id: string;
  /** Indicativo tal como lo reporta la fuente (ej. DM201 o ADB201). */
  callsign: string;
  /** Número de vuelo comercial IATA, si la fuente lo conoce. */
  flightNumber?: string;
  /** Código IATA de la aerolínea (ej. DM). */
  airline?: string;
  /** Códigos IATA de aeropuerto, si la fuente los conoce. */
  origin?: string;
  destination?: string;
  lat: number;
  lon: number;
  altitudeFt: number;
  speedKmh: number;
  /** Rumbo en grados (0 = norte, 90 = este). */
  headingDeg: number;
  onGround: boolean;
  delayMin?: number;
  /** Momento (ms desde epoch) en que se midió esta posición. */
  updatedAt: number;
}

/** Parámetros de búsqueda de la barra superior. */
/**
 * Cómo se ve un vuelo respecto al país de referencia (República Dominicana):
 * nacional (ambos aeropuertos dentro), saliente (sale del país), entrante (llega al país)
 * u otro (ninguno de los dos aeropuertos es del país, ej. una ruta Miami-Nueva York).
 */
export type FlightClass = 'nacional' | 'saliente' | 'entrante' | 'otro';

export function classifyRoute(origin: string, destination: string): FlightClass {
  const o = airport(origin)?.rd ?? false;
  const d = airport(destination)?.rd ?? false;
  if (o && d) return 'nacional';
  if (o && !d) return 'saliente';
  if (!o && d) return 'entrante';
  return 'otro';
}

export function classifyFlight(f: Flight): FlightClass {
  return f.origin && f.destination ? classifyRoute(f.origin, f.destination) : 'otro';
}

export interface FlightQuery {
  aerolinea: string;
  numero: string;
  origen: string;
  destino: string;
  fecha: string;
}

/** Filtro común. Las fuentes que no filtran en el servidor pueden usarlo en el cliente. */
export function filterFlights(flights: Flight[], q: FlightQuery | null): Flight[] {
  if (!q) return flights;
  const num = q.numero.trim().toUpperCase();
  const origen = q.origen.trim().toUpperCase();
  const destino = q.destino.trim().toUpperCase();
  return flights.filter(
    (f) =>
      (q.aerolinea === 'todas' || f.airline === q.aerolinea) &&
      (!num || f.callsign.toUpperCase() === num || f.flightNumber?.toUpperCase() === num) &&
      (!origen || f.origin === origen) &&
      (!destino || f.destination === destino),
  );
}
