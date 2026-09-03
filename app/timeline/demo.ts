import type { ModeKey } from '../lib/modes';
import { aggregateHeatData } from './normalize';
import type {
  HeatSample,
  LineFeature,
  NormalizedTimeline,
  PointFeature,
  VisitProperties,
} from './types';

function feature(mode: ModeKey, points: Array<[number, number, string]>): LineFeature {
  const normalizedPoints = points.map(([lng, lat, time]) => ({
    lng,
    lat,
    time: Date.parse(time),
    mode,
  }));
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: normalizedPoints.map((point) => [point.lng, point.lat]),
    },
    properties: {
      mode,
      start: normalizedPoints[0].time,
      end: normalizedPoints[normalizedPoints.length - 1].time,
    },
  };
}

function demoVisit(
  lng: number,
  lat: number,
  start: string,
  end: string,
): PointFeature<VisitProperties> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      start: Date.parse(start),
      end: Date.parse(end),
      durationMinutes: (Date.parse(end) - Date.parse(start)) / 60000,
    },
  };
}

export function createDemoTimeline(): NormalizedTimeline {
  const routes = [
    feature('flight', [
      [-0.12, 51.5, '2024-04-12T08:00:00Z'],
      [2.35, 48.86, '2024-04-12T10:30:00Z'],
    ]),
    feature('walk', [
      [2.35, 48.86, '2024-04-12T10:35:00Z'],
      [2.29, 48.87, '2024-04-12T11:10:00Z'],
      [2.34, 48.85, '2024-04-12T13:15:00Z'],
    ]),
    feature('transit', [
      [2.34, 48.85, '2024-04-12T14:00:00Z'],
      [12.49, 41.9, '2024-04-12T16:15:00Z'],
    ]),
    feature('walk', [
      [12.49, 41.9, '2024-04-12T16:20:00Z'],
      [12.48, 41.89, '2024-04-12T18:00:00Z'],
      [12.46, 41.9, '2024-04-13T09:00:00Z'],
    ]),
    feature('drive', [
      [12.46, 41.9, '2024-04-13T10:00:00Z'],
      [12.52, 41.93, '2024-04-13T10:35:00Z'],
      [12.46, 41.9, '2024-04-13T13:00:00Z'],
    ]),
    feature('flight', [
      [12.46, 41.9, '2024-04-14T07:00:00Z'],
      [13.4, 52.52, '2024-04-14T09:10:00Z'],
    ]),
    feature('walk', [
      [13.4, 52.52, '2024-04-14T09:20:00Z'],
      [13.38, 52.51, '2024-04-14T11:30:00Z'],
      [13.41, 52.51, '2024-04-14T14:00:00Z'],
    ]),
    feature('transit', [
      [13.41, 52.51, '2024-04-14T15:00:00Z'],
      [13.35, 52.5, '2024-04-14T15:35:00Z'],
      [13.4, 52.52, '2024-04-15T08:00:00Z'],
    ]),
  ];

  const visits = [
    demoVisit(2.35, 48.86, '2024-04-12T10:30:00Z', '2024-04-12T13:00:00Z'),
    demoVisit(12.49, 41.9, '2024-04-12T16:15:00Z', '2024-04-13T09:00:00Z'),
    demoVisit(13.4, 52.52, '2024-04-14T09:10:00Z', '2024-04-14T14:00:00Z'),
  ];
  const playback = routes
    .flatMap((route) =>
      route.geometry.coordinates.map(([lng, lat], index) => ({
        lat,
        lng,
        time:
          route.properties.start +
          ((route.properties.end - route.properties.start) * index) /
            Math.max(1, route.geometry.coordinates.length - 1),
        mode: route.properties.mode,
      })),
    )
    .sort((a, b) => a.time - b.time);
  const heatSamples: HeatSample[] = [
    ...routes.flatMap((route) =>
      route.geometry.coordinates.map(([lng, lat], index) => {
        const time =
          route.properties.start +
          ((route.properties.end - route.properties.start) * index) /
            Math.max(1, route.geometry.coordinates.length - 1);
        return {
          lat,
          lng,
          start: time,
          end: time,
          movementWeight: 0.45,
          dwellWeight: 0,
          mode: route.properties.mode,
        };
      }),
    ),
    ...visits.map((visit) => ({
      lat: visit.geometry.coordinates[1],
      lng: visit.geometry.coordinates[0],
      start: visit.properties.start,
      end: visit.properties.end,
      movementWeight: 0.25,
      dwellWeight: visit.properties.durationMinutes ?? 1,
      mode: 'other' as ModeKey,
    })),
  ];
  const { heatPoints, hotspots } = aggregateHeatData(heatSamples);

  return {
    coverage: {
      start: Date.parse('2024-04-12T08:00:00Z'),
      end: Date.parse('2024-04-15T08:00:00Z'),
    },
    routes: { type: 'FeatureCollection', features: routes },
    detailedRoutes: { type: 'FeatureCollection', features: routes },
    visits: { type: 'FeatureCollection', features: visits },
    heatPoints: { type: 'FeatureCollection', features: heatPoints },
    heatSamples,
    playback,
    stats: {
      activeDays: 4,
      distanceMeters: 2580000,
      visitCount: visits.length,
      routePointCount: routes.reduce(
        (total, route) => total + route.geometry.coordinates.length,
        0,
      ),
      hotspots,
    },
  };
}
