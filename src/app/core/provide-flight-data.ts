import { provideHttpClient } from '@angular/common/http';
import { EnvironmentProviders, Provider, makeEnvironmentProviders } from '@angular/core';
import { FlightDataProvider } from './flight-data.provider';
import { FLIGHT_DATA_CONFIG, FlightDataConfig } from './flight-data.tokens';
import { HttpFlightProvider } from './http-flight.provider';
import { MockFlightProvider } from './mock-flight.provider';

/** Registra la fuente de datos de vuelos. Cambiar de simulada a una API real es cambiar esta configuración. */
export function provideFlightData(config: FlightDataConfig): EnvironmentProviders {
  const pollIntervalMs = config.pollIntervalMs ?? (config.mode === 'mock' ? 1_000 : 10_000);
  const source: (EnvironmentProviders | Provider)[] =
    config.mode === 'http'
      ? [provideHttpClient(), { provide: FlightDataProvider, useClass: HttpFlightProvider }]
      : [{ provide: FlightDataProvider, useClass: MockFlightProvider }];
  return makeEnvironmentProviders([{ provide: FLIGHT_DATA_CONFIG, useValue: { ...config, pollIntervalMs } }, ...source]);
}
