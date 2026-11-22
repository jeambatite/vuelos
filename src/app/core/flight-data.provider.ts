import { Observable } from 'rxjs';
import { Flight, FlightQuery } from './flight.model';

/**
 * Contrato de cualquier fuente de posiciones de vuelos (simulada, HTTP, WebSocket, etc.).
 * La app solo depende de esta clase: para usar otra fuente se registra otra implementación
 * en `provideFlightData(...)`, sin tocar el mapa ni la barra de búsqueda.
 */
export abstract class FlightDataProvider {
  /** Nombre que se muestra al usuario como fuente de los datos. */
  abstract readonly name: string;
  /** True si los datos no son reales (se avisa en pantalla). */
  abstract readonly simulated: boolean;
  /** Foto actual de los vuelos que cumplen la búsqueda (todos si es null). Emite una vez y completa. */
  abstract getFlights(query: FlightQuery | null): Observable<Flight[]>;
}
