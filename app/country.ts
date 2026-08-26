import { feature as topoFeature } from 'topojson-client';
import countriesTopology from 'world-atlas/countries-110m.json';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

type CountryProperties = { name?: string };
type CountryGeometry = Polygon | MultiPolygon;
type CountryCollection = FeatureCollection<CountryGeometry, CountryProperties>;
type CountryIndexEntry = {
  name: string;
  geometry: CountryGeometry;
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

const countryTopology = countriesTopology as unknown as Parameters<typeof topoFeature>[0];
const countryObject = (countriesTopology as unknown as { objects: { countries: Parameters<typeof topoFeature>[1] } }).objects.countries;
const countryCollection = topoFeature(countryTopology, countryObject) as unknown as CountryCollection;

function collectCoordinates(value: unknown, points: Array<[number, number]>) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    points.push([value[0], value[1]]);
    return;
  }
  for (const item of value) collectCoordinates(item, points);
}

function boundsForGeometry(geometry: CountryGeometry) {
  const points: Array<[number, number]> = [];
  collectCoordinates(geometry.coordinates, points);
  return points.reduce((bounds, [lng, lat]) => ({
    minLng: Math.min(bounds.minLng, lng),
    maxLng: Math.max(bounds.maxLng, lng),
    minLat: Math.min(bounds.minLat, lat),
    maxLat: Math.max(bounds.maxLat, lat),
  }), { minLng: 180, maxLng: -180, minLat: 90, maxLat: -90 });
}

const countryIndex: CountryIndexEntry[] = countryCollection.features
  .filter((country) => Boolean(country.properties?.name))
  .map((country) => ({ name: country.properties.name ?? 'Unknown', geometry: country.geometry, ...boundsForGeometry(country.geometry) }));

function pointInRing(lng: number, lat: number, ring: readonly number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLng, currentLat] = ring[index];
    const [previousLng, previousLat] = ring[previous];
    const intersects = ((currentLat > lat) !== (previousLat > lat))
      && (lng < ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat) + currentLng);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geometry: CountryGeometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => {
    const [outerRing, ...holes] = polygon;
    return pointInRing(lng, lat, outerRing) && !holes.some((hole) => pointInRing(lng, lat, hole));
  });
}

export function countryForPoint(lat: number, lng: number) {
  for (const country of countryIndex) {
    if (lng < country.minLng || lng > country.maxLng || lat < country.minLat || lat > country.maxLat) continue;
    if (pointInGeometry(lng, lat, country.geometry)) return country.name;
  }
  return undefined;
}
