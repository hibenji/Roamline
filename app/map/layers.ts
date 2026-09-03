import type {
  ExpressionSpecification,
  FilterSpecification,
  LineLayerSpecification,
  Map as MapLibreMap,
} from 'maplibre-gl';
import {
  DETAIL_ROUTE_MIN_ZOOM,
  PLACE_VISIT_MIN_ZOOM,
  RECORDED_POINT_MIN_ZOOM,
  ROUTE_COLORS,
  ROUTE_MODES,
  emptyCollection,
} from './config';

export function addTimelineSourcesAndLayers(map: MapLibreMap) {
  map.addSource('timeline-routes', { type: 'geojson', data: emptyCollection });
  map.addSource('timeline-routes-detail', { type: 'geojson', data: emptyCollection });
  map.addSource('timeline-heat', { type: 'geojson', data: emptyCollection });
  map.addSource('timeline-playback-route', { type: 'geojson', data: emptyCollection });
  map.addSource('timeline-playback-point', { type: 'geojson', data: emptyCollection });
  map.addSource('timeline-connected-route', {
    type: 'geojson',
    lineMetrics: true,
    data: emptyCollection,
  });

  const modeExpression = [
    'match',
    ['get', 'mode'],
    ...ROUTE_MODES.flatMap((mode) => [mode, ROUTE_COLORS[mode]]),
    ROUTE_COLORS.other,
  ] as unknown as ExpressionSpecification;

  map.addLayer({
    id: 'timeline-route-glow',
    type: 'line',
    source: 'timeline-routes',
    maxzoom: DETAIL_ROUTE_MIN_ZOOM,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': modeExpression,
      'line-width': 8,
      'line-opacity': 0.1,
      'line-blur': 5,
    },
  });
  map.addLayer({
    id: 'timeline-route',
    type: 'line',
    source: 'timeline-routes',
    maxzoom: DETAIL_ROUTE_MIN_ZOOM,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': modeExpression,
      'line-width': 2.2,
      'line-opacity': 0.82,
    },
  });

  map.addLayer({
    id: 'timeline-route-detail-glow',
    type: 'line',
    source: 'timeline-routes-detail',
    minzoom: DETAIL_ROUTE_MIN_ZOOM,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': modeExpression,
      'line-width': 8,
      'line-opacity': 0.1,
      'line-blur': 5,
    },
  });
  map.addLayer({
    id: 'timeline-route-detail',
    type: 'line',
    source: 'timeline-routes-detail',
    minzoom: DETAIL_ROUTE_MIN_ZOOM,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': modeExpression,
      'line-width': 2.2,
      'line-opacity': 0.82,
    },
  });

  // Gradients are defined per layer, so split connectors by their endpoint modes.
  for (const startMode of ROUTE_MODES) {
    for (const endMode of ROUTE_MODES) {
      const id = `timeline-connected-route-${startMode}-${endMode}`;
      const paint: NonNullable<LineLayerSpecification['paint']> = {
        'line-color': ROUTE_COLORS[startMode],
        'line-width': 1.5,
        'line-opacity': 0.42,
        'line-dasharray': [1.2, 2.4],
      };
      if (startMode !== endMode) {
        paint['line-gradient'] = [
          'interpolate',
          ['linear'],
          ['line-progress'],
          0,
          ROUTE_COLORS[startMode],
          1,
          ROUTE_COLORS[endMode],
        ];
      }

      map.addLayer({
        id,
        type: 'line',
        source: 'timeline-connected-route',
        filter: [
          'all',
          ['==', ['get', 'startMode'], startMode],
          ['==', ['get', 'endMode'], endMode],
        ] as FilterSpecification,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint,
      });
    }
  }

  map.addLayer({
    id: 'timeline-route-hit',
    type: 'line',
    source: 'timeline-routes',
    maxzoom: DETAIL_ROUTE_MIN_ZOOM,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 14, 'line-opacity': 0.001 },
  });
  map.addLayer({
    id: 'timeline-route-detail-hit',
    type: 'line',
    source: 'timeline-routes-detail',
    minzoom: DETAIL_ROUTE_MIN_ZOOM,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 14, 'line-opacity': 0.001 },
  });
  map.addSource('timeline-recorded-points', { type: 'geojson', data: emptyCollection });
  map.addLayer({
    id: 'timeline-recorded-points',
    type: 'circle',
    source: 'timeline-recorded-points',
    minzoom: RECORDED_POINT_MIN_ZOOM,
    paint: {
      'circle-color': modeExpression,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        RECORDED_POINT_MIN_ZOOM,
        2,
        15,
        3.5,
        18,
        5,
      ],
      'circle-opacity': 0.72,
      'circle-stroke-color': '#101522',
      'circle-stroke-width': 0.8,
      'circle-stroke-opacity': 0.78,
    },
  });
  map.addSource('timeline-visits', { type: 'geojson', data: emptyCollection });
  map.addLayer({
    id: 'timeline-visits',
    type: 'circle',
    source: 'timeline-visits',
    minzoom: PLACE_VISIT_MIN_ZOOM,
    paint: {
      'circle-color': '#fff3c4',
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        PLACE_VISIT_MIN_ZOOM,
        4.5,
        12,
        6,
        18,
        8,
      ],
      'circle-opacity': 0.92,
      'circle-stroke-color': '#ff806d',
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.95,
    },
  });
  map.addLayer({
    id: 'timeline-playback-route',
    type: 'line',
    source: 'timeline-playback-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#fff3c4',
      'line-width': 4.4,
      'line-opacity': 0.96,
      'line-blur': 0.2,
    },
  });
  map.addLayer({
    id: 'timeline-heat-movement',
    type: 'heatmap',
    source: 'timeline-heat',
    maxzoom: 10,
    paint: {
      'heatmap-weight': ['get', 'movementWeight'],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.7, 6, 1.5, 10, 2.4],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 18, 6, 28, 10, 42],
      'heatmap-opacity': 0.84,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(24, 31, 48, 0)',
        0.2,
        '#4051a3',
        0.5,
        '#29b6c8',
        0.75,
        '#ffd166',
        1,
        '#ff806d',
      ],
    },
  });
  map.addLayer({
    id: 'timeline-heat-dwell',
    type: 'heatmap',
    source: 'timeline-heat',
    maxzoom: 10,
    paint: {
      'heatmap-weight': ['get', 'dwellWeight'],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 1, 0.75, 6, 1.7, 10, 2.6],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 20, 6, 32, 10, 48],
      'heatmap-opacity': 0.88,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(24, 31, 48, 0)',
        0.18,
        '#253a83',
        0.45,
        '#3ad6c4',
        0.72,
        '#ffd166',
        1,
        '#ff806d',
      ],
    },
  });
  map.addLayer({
    id: 'timeline-playback-point',
    type: 'circle',
    source: 'timeline-playback-point',
    paint: {
      'circle-color': '#fff3c4',
      'circle-radius': 6,
      'circle-opacity': 1,
      'circle-stroke-color': '#ff806d',
      'circle-stroke-width': 2.5,
      'circle-stroke-opacity': 1,
    },
  });
}
