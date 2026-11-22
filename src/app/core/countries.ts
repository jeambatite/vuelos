import { geoBounds, geoCentroid, geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
// Resolución 50m: fronteras bastante más fieles que 110m, con un peso aún razonable para cargar en el navegador.
import countriesTopo from 'world-atlas/countries-50m.json';

export interface CountryInfo {
  id: string;
  name: string;
  feature: Feature<Polygon | MultiPolygon, { name?: string }>;
  /** [longitud, latitud] del centro del país. */
  centroid: [number, number];
  /** Recuadro [[lonMin, latMin], [lonMax, latMax]]. */
  bbox: [[number, number], [number, number]];
}

const topo = countriesTopo as unknown as Topology;
const collection = feature(topo, topo.objects['countries']) as unknown as FeatureCollection<
  Polygon | MultiPolygon,
  { name?: string }
>;

export const COUNTRIES: CountryInfo[] = collection.features.map((f) => {
  const [[lonMin, latMin], [lonMax, latMax]] = geoBounds(f);
  return {
    id: String(f.id),
    name: f.properties?.name ?? String(f.id),
    feature: f,
    centroid: geoCentroid(f),
    bbox: [[lonMin, latMin], [lonMax, latMax]],
  };
});

/** Todos los anillos (exterior e interiores, de cada parte si es multipolígono) como listas de [lon, lat]. */
export function countryRings(c: CountryInfo): [number, number][][] {
  const g = c.feature.geometry;
  const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
  return rings as [number, number][][];
}

/** País que contiene el punto (en grados), o null si cae en el mar o fuera de todo país conocido. */
export function findCountryAt(lat: number, lon: number): CountryInfo | null {
  for (const c of COUNTRIES) {
    const [[lonMin, latMin], [lonMax, latMax]] = c.bbox;
    if (lat < latMin || lat > latMax) continue;
    // El recuadro puede cruzar el antimeridiano (ej. Rusia, Fiyi); ahí no se descarta por longitud.
    const cruzaAntimeridiano = lonMin > lonMax;
    const enRangoLon = cruzaAntimeridiano ? lon >= lonMin || lon <= lonMax : lon >= lonMin && lon <= lonMax;
    if (!enRangoLon) continue;
    if (geoContains(c.feature, [lon, lat])) return c;
  }
  return null;
}
