import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { extrapolate } from './extrapolate';
import { findCountryAt } from './countries';
import { classifyRoute } from './flight.model';
import { FlightDataProvider } from './flight-data.provider';
import { Flight, FlightQuery } from './flight.model';
import { provideFlightData } from './provide-flight-data';

const query = (p: Partial<FlightQuery>): FlightQuery => ({
  aerolinea: 'todas',
  numero: '',
  origen: '',
  destino: '',
  fecha: '',
  ...p,
});

describe('MockFlightProvider', () => {
  let provider: FlightDataProvider;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideFlightData({ mode: 'mock' })] });
    provider = TestBed.inject(FlightDataProvider);
  });

  it('devuelve vuelos con el formato del modelo', async () => {
    const flights = await firstValueFrom(provider.getFlights(null));
    expect(flights.length).toBe(14);
    expect(flights.every((f) => Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180)).toBe(true);
  });

  it('filtra por origen y por número de vuelo', async () => {
    const porOrigen = await firstValueFrom(provider.getFlights(query({ origen: 'SDQ' })));
    expect(porOrigen.length).toBeGreaterThan(0);
    expect(porOrigen.every((f) => f.origin === 'SDQ')).toBe(true);

    const todos = await firstValueFrom(provider.getFlights(null));
    const numero = todos[0]!.flightNumber!;
    const uno = await firstValueFrom(provider.getFlights(query({ numero })));
    expect(uno.map((f) => f.flightNumber)).toEqual([numero]);
  });
});

describe('extrapolate', () => {
  const base: Flight = {
    id: 'x', callsign: 'X1', lat: 18, lon: -70, altitudeFt: 30000, speedKmh: 900,
    headingDeg: 90, onGround: false, updatedAt: 0,
  };

  it('avanza hacia el rumbo con el tiempo', () => {
    const p = extrapolate(base, 10_000);
    expect(p.lon).toBeGreaterThan(-70);
    expect(Math.abs(p.lat - 18)).toBeLessThan(0.01);
  });

  it('no mueve un avión en tierra', () => {
    expect(extrapolate({ ...base, onGround: true }, 10_000)).toEqual({ lat: 18, lon: -70 });
  });
});

describe('classifyRoute', () => {
  it('distingue vuelos nacionales, salientes y entrantes', () => {
    expect(classifyRoute('SDQ', 'PUJ')).toBe('nacional'); // ambos en RD
    expect(classifyRoute('SDQ', 'MIA')).toBe('saliente'); // sale de RD
    expect(classifyRoute('MIA', 'SDQ')).toBe('entrante'); // llega a RD
    expect(classifyRoute('MIA', 'JFK')).toBe('otro'); // ninguno es de RD
  });
});

describe('findCountryAt', () => {
  // Puntos bien dentro del país (no justo en la costa, donde el límite exacto es ambiguo incluso en la realidad).
  it('ubica un punto conocido dentro de su país', () => {
    expect(findCountryAt(19.4061, -70.6047)?.name).toBe('Dominican Rep.'); // Santiago, RD
    expect(findCountryAt(39.0, -98.0)?.name).toBe('United States of America'); // centro de EE. UU.
  });

  it('no asigna país a un punto en medio del océano', () => {
    expect(findCountryAt(0, -40)).toBeNull();
  });
});
