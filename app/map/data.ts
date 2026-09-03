import { distanceBetweenCoordinates } from '../lib/geo';
import type { ModeKey } from '../lib/modes';
import type { NormalizedTimeline, Point } from '../timeline';
import { emptyCollection } from './config';

const SHORT_RANGE_MAX_DURATION_MS = 2 * 24 * 60 * 60 * 1000;

export function isShortRangeTimeline(timeline: NormalizedTimeline) {
  return timeline.coverage.end - timeline.coverage.start <= SHORT_RANGE_MAX_DURATION_MS;
}

export function recordedPointData(timeline: NormalizedTimeline) {
  return {
    type: 'FeatureCollection' as const,
    features: timeline.detailedRoutes.features.flatMap((route) =>
      route.geometry.coordinates.map((coordinate) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: coordinate },
        properties: { mode: route.properties.mode },
      })),
    ),
  };
}

export function sourceData(
  timeline: NormalizedTimeline,
  playbackProgress: number,
  selectedModes: ModeKey[],
) {
  const playback = isShortRangeTimeline(timeline) ? timeline.detailedPlayback : timeline.playback;
  const playbackIndex = Math.max(
    0,
    Math.min(playback.length - 1, Math.floor(playbackProgress * Math.max(0, playback.length - 1))),
  );
  const selected = new Set(selectedModes);
  const activePoints = playback.slice(0, playbackIndex + 1);
  const routeFeatures: Array<{
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    properties: Record<string, never>;
  }> = [];
  let segment: Point[] = [];
  const flushSegment = () => {
    if (segment.length > 1) {
      routeFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: segment.map((point) => [point.lng, point.lat]),
        },
        properties: {},
      });
    }
    segment = [];
  };
  for (const point of activePoints) {
    if (selected.has(point.mode ?? 'other')) segment.push(point);
    else flushSegment();
  }
  flushSegment();
  const currentPoint = activePoints[activePoints.length - 1];
  const route =
    routeFeatures.length > 0
      ? { type: 'FeatureCollection', features: routeFeatures }
      : emptyCollection;
  const point =
    currentPoint && selected.has(currentPoint.mode ?? 'other')
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [currentPoint.lng, currentPoint.lat] },
              properties: {},
            },
          ],
        }
      : emptyCollection;

  return { route, point };
}

const MAX_CONNECT_TIME_GAP_MS = 2 * 60 * 60 * 1000;
const MIN_CONNECT_DISTANCE_METERS = 1_000;
const MAX_CONNECT_DISTANCE_METERS = 150_000;
const MAX_FLIGHT_CONNECT_TIME_GAP_MS = 24 * 60 * 60 * 1000;

function hasTimestampBetween(values: number[], start: number, end: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= start) low = middle + 1;
    else high = middle;
  }
  return low < values.length && values[low] < end;
}

export function sequentialRouteData(timeline: NormalizedTimeline, selectedModes: ModeKey[]) {
  const selected = new Set(selectedModes);
  const visitStarts = timeline.visits.features
    .map((visit) => visit.properties.start)
    .sort((a, b) => a - b);
  const boundaries = timeline.routes.features
    .filter((route) => route.geometry.coordinates.length >= 2)
    .map((route) => {
      const coordinates = route.geometry.coordinates;
      return {
        start: coordinates[0],
        end: coordinates[coordinates.length - 1],
        startTime: route.properties.start,
        endTime: route.properties.end,
        mode: route.properties.mode,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
  const features: Array<{
    type: 'Feature';
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    properties: { mode: ModeKey; startMode: ModeKey; endMode: ModeKey; start: number; end: number };
  }> = [];

  for (let index = 1; index < boundaries.length; index += 1) {
    const previous = boundaries[index - 1];
    const current = boundaries[index];
    const timeGap = current.startTime - previous.endTime;
    const distance = distanceBetweenCoordinates(previous.end, current.start);
    const isFlightConnection = previous.mode === 'flight' || current.mode === 'flight';
    const hasVisitBetween = hasTimestampBetween(visitStarts, previous.endTime, current.startTime);
    if (
      !selected.has(previous.mode) ||
      !selected.has(current.mode) ||
      hasVisitBetween ||
      timeGap < 0 ||
      timeGap > (isFlightConnection ? MAX_FLIGHT_CONNECT_TIME_GAP_MS : MAX_CONNECT_TIME_GAP_MS) ||
      distance < MIN_CONNECT_DISTANCE_METERS ||
      (!isFlightConnection && distance > MAX_CONNECT_DISTANCE_METERS)
    )
      continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [previous.end, current.start] },
      properties: {
        mode: current.mode,
        startMode: previous.mode,
        endMode: current.mode,
        start: previous.endTime,
        end: current.startTime,
      },
    });
  }

  return { type: 'FeatureCollection' as const, features };
}

export function boundsForTimeline(timeline: NormalizedTimeline) {
  const points =
    timeline.detailedRoutes.features.length > 0
      ? timeline.detailedRoutes.features.flatMap((feature) => feature.geometry.coordinates)
      : timeline.visits.features.map((feature) => feature.geometry.coordinates);
  const first = points[0];
  if (!first) return undefined;

  let minLng = first[0];
  let maxLng = first[0];
  let minLat = first[1];
  let maxLat = first[1];
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLng, maxLng, minLat, maxLat };
}

export function pointAtProgress(timeline: NormalizedTimeline, progress: number): Point | undefined {
  const playback = isShortRangeTimeline(timeline) ? timeline.detailedPlayback : timeline.playback;
  if (playback.length === 0) return undefined;
  return playback[
    Math.max(0, Math.min(playback.length - 1, Math.floor(progress * (playback.length - 1))))
  ];
}
