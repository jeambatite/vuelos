import { InjectionToken } from '@angular/core';
import { Flight, FlightQuery } from './flight.model';

/** Datos de conexión de una API HTTP. */
export interface HttpApiConfig {
  baseUrl: string;
  /** Ojo: una clave en el front queda visible. Para APIs de pago usa un backend o proxy propio. */
  apiKey?: string;
}

/** Traduce una API concreta al modelo `Flight`. Es lo único que hay que escribir para sumar una fuente nueva. */
export interface FlightApiAdapter {
  readonly name: string;
  /** Arma la petición a partir de la búsqueda del usuario. */
  request(
    query: FlightQuery | null,
    api: HttpApiConfig,
  ): { url: string; params?: Record<string, string | number | boolean>; headers?: Record<string, string> };
  /** Convierte la respuesta cruda de la API en vuelos (y aplica el filtro si la API no lo hace). */
  parse(response: unknown, query: FlightQuery | null): Flight[];
}

export interface FlightDataConfig {
  mode: 'mock' | 'http';
  /** Cada cuántos ms se consulta la fuente. Por defecto 1000 (mock) o 10000 (http). */
  pollIntervalMs?: number;
  mock?: {
    /** Cuánto se acelera el tiempo simulado para que se vea movimiento (1 = tiempo real). Por defecto 60. */
    speedFactor?: number;
  };
  http?: HttpApiConfig & { adapter: FlightApiAdapter };
}

export type ResolvedFlightDataConfig = FlightDataConfig & { pollIntervalMs: number };

export const FLIGHT_DATA_CONFIG = new InjectionToken<ResolvedFlightDataConfig>('FLIGHT_DATA_CONFIG');
