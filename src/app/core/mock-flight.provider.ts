import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { airport } from './airports';
import { FlightDataProvider } from './flight-data.provider';
import { FLIGHT_DATA_CONFIG } from './flight-data.tokens';
import { Flight, FlightQuery, filterFlights } from './flight.model';
import { bearing, distanceKm, interpolate } from './geo';

interface MockRoute {
  number: number;
  from: string;
  to: string;
  /** Avance inicial del ciclo (0-2: ida y vuelta). */
  phase: number;
  delay: number;
}

const ROUTES: MockRoute[] = [
  { number: 201, from: 'SDQ', to: 'MIA', phase: 0.35, delay: 0 },
  { number: 418, from: 'SDQ', to: 'SJU', phase: 0.6, delay: 0 },
  { number: 502, from: 'PTY', to: 'SDQ', phase: 0.2, delay: 15 },
  { number: 155, from: 'PUJ', to: 'PTY', phase: 0.5, delay: 0 },
  { number: 330, from: 'MIA', to: 'STI', phase: 0.7, delay: 0 },
  { number: 276, from: 'CUN', to: 'SDQ', phase: 0.4, delay: 25 },
  { number: 640, from: 'SDQ', to: 'BOG', phase: 0.15, delay: 0 },
  { number: 712, from: 'SJU', to: 'PUJ', phase: 0.8, delay: 0 },
  { number: 89, from: 'POP', to: 'MIA', phase: 0.55, delay: 0 },
  { number: 910, from: 'SDQ', to: 'JFK', phase: 0.3, delay: 0 },
  { number: 780, from: 'PUJ', to: 'MAD', phase: 0.45, delay: 10 },
  { number: 345, from: 'STI', to: 'JFK', phase: 0.9, delay: 0 },
  // Rutas nacionales, para ver el color de los vuelos domésticos en el globo.
  { number: 150, from: 'SDQ', to: 'PUJ', phase: 0.25, delay: 0 },
  { number: 260, from: 'STI', to: 'POP', phase: 0.65, delay: 0 },
];

/**
 * Fuente simulada: vuelos ilustrativos que van y vienen entre aeropuertos por círculo máximo.
 * El movimiento se acelera (`speedFactor`) para que se note en el globo; la velocidad que reporta es la real.
 */
@Injectable()
export class MockFlightProvider extends FlightDataProvider {
  readonly name = 'Simulado';
  readonly simulated = true;

  private readonly speedFactor = inject(FLIGHT_DATA_CONFIG).mock?.speedFactor ?? 60;
  private readonly t0 = Date.now();

  getFlights(query: FlightQuery | null): Observable<Flight[]> {
    const now = Date.now();
    return of(filterFlights(ROUTES.map((r, i) => this.snapshot(r, i, now)), query));
  }

  private snapshot(r: MockRoute, index: number, now: number): Flight {
    const a = airport(r.from)!;
    const b = airport(r.to)!;
    const durationMin = distanceKm(a, b) / 800 * 60 + 25;
    const cycleMs = (durationMin * 60_000) / this.speedFactor;

    const x = ((now - this.t0) / cycleMs + r.phase) % 2;
    const back = x >= 1;
    const p = back ? x - 1 : x;
    const [from, to] = back ? [b, a] : [a, b];

    const pos = interpolate(from, to, p);
    const ahead = interpolate(from, to, Math.min(1, p + 0.01));
    const profile = Math.min(1, p / 0.12, (1 - p) / 0.12);
    const number = `DM${back ? r.number + 1 : r.number}`;

    return {
      id: `mock-${index}`,
      callsign: number,
      flightNumber: number,
      airline: 'DM',
      origin: back ? r.to : r.from,
      destination: back ? r.from : r.to,
      lat: pos.lat,
      lon: pos.lon,
      altitudeFt: Math.round((profile * 37000) / 100) * 100,
      speedKmh: Math.round(280 + profile * 550),
      headingDeg: bearing(pos, ahead),
      onGround: p < 0.02 || p > 0.98,
      delayMin: r.delay || undefined,
      updatedAt: now,
    };
  }
}
