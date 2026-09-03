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

export const DETAIL_ROUTE_MIN_ZOOM = 5.5;
export const PLACE_VISIT_MIN_ZOOM = 8.5;
export const RECORDED_POINT_MIN_ZOOM = 11.5;

export const MAP_INTERACTIVE_LAYER_IDS = [
  'timeline-route-hit',
  'timeline-route',
  'timeline-route-detail-hit',
  'timeline-route-detail',
  'timeline-visits',
  'timeline-visits-short',
  ...CONNECTED_ROUTE_LAYER_IDS,
];

export function mapStyleForCartoKey(cartoBasemapsApiKey = ''): StyleSpecification {
  const apiKey = cartoBasemapsApiKey.trim();

  return {
    version: 8,
    sources:
      apiKey.length > 0
        ? {
            cartoDarkMatter: {
              type: 'raster' as const,
              tiles: [
                `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=${encodeURIComponent(apiKey)}`,
              ],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            },
          }
        : {},
    layers:
      apiKey.length > 0
        ? [
            {
              id: 'basemap',
              type: 'raster' as const,
              source: 'cartoDarkMatter',
              paint: {
                'raster-opacity': 0.84,
                'raster-brightness-min': 0.03,
                'raster-brightness-max': 0.68,
                'raster-saturation': -0.55,
                'raster-contrast': -0.05,
              },
            },
          ]
        : [],
    projection: { type: 'globe' },
  };
}

export const emptyCollection = { type: 'FeatureCollection' as const, features: [] };
