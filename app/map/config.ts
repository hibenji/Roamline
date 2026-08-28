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

export function mapStyleForToken(mapboxAccessToken = ''): StyleSpecification {
  const token = mapboxAccessToken.trim();

  return {
    version: 8,
    sources:
      token.length > 0
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
        : {},
    layers:
      token.length > 0
        ? [
            {
              id: 'basemap',
              type: 'raster' as const,
              source: 'mapboxDark',
              paint: {
                'raster-opacity': 0.78,
                'raster-saturation': -0.3,
                'raster-contrast': 0.12,
              },
            },
          ]
        : [],
    projection: { type: 'globe' },
  };
}

export const emptyCollection = { type: 'FeatureCollection' as const, features: [] };
