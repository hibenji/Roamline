import type { StyleSpecification } from 'maplibre-gl';
import type { ModeKey } from '../lib/modes';

export const ROUTE_COLORS: Record<ModeKey, string> = {
  drive: '#ff806d',
  walk: '#89f5c9',
  cycle: '#ffd166',
  transit: '#77d7ff',
  flight: '#c4b5fd',
  water: '#60a5fa',
  other: '#a8b1c2',
};

export const ROUTE_MODES = Object.keys(ROUTE_COLORS) as ModeKey[];

export const CONNECTED_ROUTE_LAYER_IDS = ROUTE_MODES.flatMap((startMode) =>
  ROUTE_MODES.map((endMode) => `timeline-connected-route-${startMode}-${endMode}`),
);

export const MAP_INTERACTIVE_LAYER_IDS = [
  'timeline-route-hit',
  'timeline-route',
  ...CONNECTED_ROUTE_LAYER_IDS,
];

const CARTO_DARK_TILES = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];

export function mapStyleForToken(mapboxAccessToken = ''): StyleSpecification {
  const token = mapboxAccessToken.trim();
  const useMapbox = token.length > 0;

  return {
    version: 8,
    sources: {
      cartoDark: {
        type: 'raster',
        tiles: CARTO_DARK_TILES,
        tileSize: 256,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      },
      ...(useMapbox
        ? {
            mapboxDark: {
              type: 'raster' as const,
              tiles: [
                `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`,
              ],
              tileSize: 256,
              attribution: '&copy; Mapbox &copy; OpenStreetMap',
            },
          }
        : {}),
    },
    layers: [
      {
        id: 'basemap',
        type: 'raster',
        source: useMapbox ? 'mapboxDark' : 'cartoDark',
        paint: { 'raster-opacity': 0.78, 'raster-saturation': -0.3, 'raster-contrast': 0.12 },
      },
    ],
    projection: { type: 'globe' },
  };
}

export const emptyCollection = { type: 'FeatureCollection' as const, features: [] };
