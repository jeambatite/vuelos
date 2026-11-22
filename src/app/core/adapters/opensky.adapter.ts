import { FlightApiAdapter } from '../flight-data.tokens';
import { Flight, filterFlights } from '../flight.model';

/**
 * Ejemplo de adaptador para OpenSky Network (GET /states/all con un recuadro geográfico).
 * Está escrito según su formato documentado y NO se ha probado contra la API real. Limitaciones a tener en cuenta:
 * - Solo trae posición: no incluye origen, destino ni aerolínea, así que esos filtros no podrán coincidir.
 * - El indicativo suele ser ICAO (ej. "ADB201"), distinto del número IATA ("DM201").
 * - Puede requerir un proxy propio por CORS o por límites de uso.
 */
export function openSkyAdapter(bbox: [number, number, number, number] = [8, -88, 28, -60]): FlightApiAdapter {
  const [lamin, lomin, lamax, lomax] = bbox;
  return {
    name: 'OpenSky Network',
    request: (_query, api) => ({
      url: `${api.baseUrl}/states/all`,
      params: { lamin, lomin, lamax, lomax },
      headers: api.apiKey ? { Authorization: `Bearer ${api.apiKey}` } : undefined,
    }),
    parse: (raw, query) => {
      const states = (raw as { states?: unknown[][] | null }).states ?? [];
      const flights: Flight[] = states
        .filter((s) => typeof s[5] === 'number' && typeof s[6] === 'number')
        .map((s) => ({
          id: String(s[0]),
          callsign: String(s[1] ?? '').trim() || String(s[0]),
          lat: s[6] as number,
          lon: s[5] as number,
          altitudeFt: Math.round(((s[7] as number | null) ?? 0) * 3.28084),
          speedKmh: Math.round(((s[9] as number | null) ?? 0) * 3.6),
          headingDeg: (s[10] as number | null) ?? 0,
          onGround: Boolean(s[8]),
          updatedAt: ((s[3] as number | null) ?? Date.now() / 1000) * 1000,
        }));
      return filterFlights(flights, query);
    },
  };
}
