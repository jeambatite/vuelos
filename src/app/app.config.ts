import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideFlightData } from './core/provide-flight-data';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // Fuente de datos de vuelos. Hoy: simulada. Para usar una API real, cambia esta línea por
    // (ver README, sección "Conectar una API de vuelos"):
    //
    //   provideFlightData({
    //     mode: 'http',
    //     pollIntervalMs: 10_000,
    //     http: { baseUrl: 'https://opensky-network.org/api', adapter: openSkyAdapter() },
    //   }),
    provideFlightData({ mode: 'mock' }),
  ],
};
