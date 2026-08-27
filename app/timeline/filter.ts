import { distanceBetweenCoordinates, lineDistance } from '../lib/geo';
import { dateRangeTimes } from '../lib/time';
import { aggregateHeatData } from './normalize';
import type { NormalizedTimeline } from './types';

export function filterTimelineByDateRange(
  timeline: NormalizedTimeline,
  fromDate?: string,
  toDate?: string,
): NormalizedTimeline {
  const requested = dateRangeTimes(fromDate, toDate);
  const start = Math.max(timeline.coverage.start, requested.start ?? timeline.coverage.start);
  const end = Math.min(timeline.coverage.end, requested.end ?? timeline.coverage.end);
  if (end < start) return timeline;

  const routes = timeline.routes.features.filter(
    (route) => route.properties.end >= start && route.properties.start <= end,
  );
  const visits = timeline.visits.features
    .filter((visit) => visit.properties.end >= start && visit.properties.start <= end)
    .map((visit) => ({
      ...visit,
      properties: {
        ...visit.properties,
        start: Math.max(start, visit.properties.start),
        end: Math.min(end, visit.properties.end),
        durationMinutes: Math.max(
          1,
          (Math.min(end, visit.properties.end) - Math.max(start, visit.properties.start)) / 60000,
        ),
      },
    }));
  const playback = timeline.playback.filter((point) => point.time >= start && point.time <= end);
  const heatSamples = timeline.heatSamples.filter(
    (sample) => sample.end >= start && sample.start <= end,
  );
  const { heatPoints, hotspots } = aggregateHeatData(heatSamples, { start, end });
  const visibleTimes = [
    ...routes.flatMap((route) => [
      Math.max(start, route.properties.start),
      Math.min(end, route.properties.end),
    ]),
    ...visits.flatMap((visit) => [visit.properties.start, visit.properties.end]),
    ...playback.map((point) => point.time),
  ];
  const coverageStart = visibleTimes.length > 0 ? Math.min(...visibleTimes) : start;
  const coverageEnd = visibleTimes.length > 0 ? Math.max(...visibleTimes) : end;
  const activeDays = new Set(visibleTimes.map((time) => new Date(time).toISOString().slice(0, 10)))
    .size;
  const routePointCount = routes.reduce(
    (total, route) => total + route.geometry.coordinates.length,
    0,
  );
  const routeDistance = routes.reduce(
    (total, route) =>
      total + (route.properties.distanceMeters ?? lineDistance(route.geometry.coordinates)),
    0,
  );
  const playbackDistance = playback
    .slice(1)
    .reduce(
      (total, point, index) =>
        total +
        distanceBetweenCoordinates(
          [playback[index].lng, playback[index].lat],
          [point.lng, point.lat],
        ),
      0,
    );

  return {
    ...timeline,
    coverage: { start: coverageStart, end: coverageEnd },
    routes: { type: 'FeatureCollection', features: routes },
    visits: { type: 'FeatureCollection', features: visits },
    heatPoints: { type: 'FeatureCollection', features: heatPoints },
    heatSamples,
    playback,
    stats: {
      activeDays,
      distanceMeters: routeDistance || playbackDistance,
      visitCount: visits.length,
      routePointCount,
      hotspots,
    },
  };
}
