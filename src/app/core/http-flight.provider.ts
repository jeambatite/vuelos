import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { FlightDataProvider } from './flight-data.provider';
import { FLIGHT_DATA_CONFIG } from './flight-data.tokens';
import { Flight, FlightQuery } from './flight.model';

/** Fuente genérica para APIs HTTP/JSON. La API concreta se describe con un `FlightApiAdapter`. */
@Injectable()
export class HttpFlightProvider extends FlightDataProvider {
  readonly simulated = false;
  readonly name: string;

  private readonly http = inject(HttpClient);
  private readonly cfg = inject(FLIGHT_DATA_CONFIG).http;

  constructor() {
    super();
    if (!this.cfg) throw new Error('provideFlightData: en modo "http" falta la configuración "http".');
    this.name = this.cfg.adapter.name;
  }

  getFlights(query: FlightQuery | null): Observable<Flight[]> {
    const { adapter, ...api } = this.cfg!;
    const req = adapter.request(query, api);
    return this.http
      .get<unknown>(req.url, { params: req.params, headers: req.headers })
      .pipe(map((res) => adapter.parse(res, query)));
  }
}
