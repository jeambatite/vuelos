export interface Airport {
  codigo: string;
  ciudad: string;
  lat: number;
  lon: number;
  /** Aeropuerto de República Dominicana. */
  rd: boolean;
}

export const AIRPORT_LIST: Airport[] = [
  { codigo: 'SDQ', ciudad: 'Santo Domingo', lat: 18.4297, lon: -69.6689, rd: true },
  { codigo: 'STI', ciudad: 'Santiago', lat: 19.4061, lon: -70.6047, rd: true },
  { codigo: 'PUJ', ciudad: 'Punta Cana', lat: 18.5674, lon: -68.3634, rd: true },
  { codigo: 'POP', ciudad: 'Puerto Plata', lat: 19.7579, lon: -70.57, rd: true },
  { codigo: 'LRM', ciudad: 'La Romana', lat: 18.4507, lon: -68.9118, rd: true },
  { codigo: 'AZS', ciudad: 'Samaná', lat: 19.267, lon: -69.742, rd: true },
  { codigo: 'SJU', ciudad: 'San Juan', lat: 18.4394, lon: -66.0018, rd: false },
  { codigo: 'MIA', ciudad: 'Miami', lat: 25.7959, lon: -80.287, rd: false },
  { codigo: 'JFK', ciudad: 'Nueva York', lat: 40.6413, lon: -73.7781, rd: false },
  { codigo: 'PTY', ciudad: 'Panamá', lat: 9.0714, lon: -79.3835, rd: false },
  { codigo: 'BOG', ciudad: 'Bogotá', lat: 4.7016, lon: -74.1469, rd: false },
  { codigo: 'CUR', ciudad: 'Curazao', lat: 12.1889, lon: -68.9598, rd: false },
  { codigo: 'CUN', ciudad: 'Cancún', lat: 21.0365, lon: -86.8771, rd: false },
  { codigo: 'MAD', ciudad: 'Madrid', lat: 40.4983, lon: -3.5676, rd: false },
];

const BY_CODE = new Map(AIRPORT_LIST.map((a) => [a.codigo, a]));

export function airport(codigo: string): Airport | undefined {
  return BY_CODE.get(codigo);
}
