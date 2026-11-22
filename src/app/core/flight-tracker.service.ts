import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, switchMap, timer } from 'rxjs';
import { FlightDataProvider } from './flight-data.provider';
import { FLIGHT_DATA_CONFIG } from './flight-data.tokens';
import { Flight, FlightQuery } from './flight.model';

/** Consulta la fuente de datos cada cierto tiempo y expone los vuelos como señales para la interfaz. */
@Injectable({ providedIn: 'root' })
export class FlightTrackerService {
  private readonly provider = inject(FlightDataProvider);
  private readonly config = inject(FLIGHT_DATA_CONFIG);

  readonly sourceName = this.provider.name;
  readonly simulated = this.provider.simulated;

  /** Búsqueda activa (null = todos los vuelos). */
  readonly query = signal<FlightQuery | null>(null);
  readonly flights = signal<Flight[]>([]);
  readonly error = signal<string | null>(null);
  readonly updatedAt = signal<number | null>(null);

  constructor() {
    toObservable(this.query)
      .pipe(
        switchMap((q) =>
          timer(0, this.config.pollIntervalMs).pipe(
            // exhaustMap evita acumular peticiones si la API tarda más que el intervalo.
            exhaustMap(() =>
              this.provider.getFlights(q).pipe(
                catchError((e: unknown) => {
                  this.error.set(mensaje(e));
                  return EMPTY; // se conservan los últimos datos buenos
                }),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((flights) => {
        this.flights.set(flights);
        this.error.set(null);
        this.updatedAt.set(Date.now());
      });
  }

  buscar(q: FlightQuery): void {
    this.query.set(q);
  }

  limpiar(): void {
    this.query.set(null);
  }
}

function mensaje(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  return status
    ? `La fuente respondió con error ${status}. Se muestran los últimos datos.`
    : 'No se pudo contactar la fuente de datos. Se muestran los últimos datos.';
}
