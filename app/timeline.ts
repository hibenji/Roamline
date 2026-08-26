/* eslint-disable @typescript-eslint/no-explicit-any */

export type ModeKey =
  | 'drive'
  | 'walk'
  | 'cycle'
  | 'transit'
  | 'flight'
  | 'water'
  | 'other';

export type Point = {
  lat: number;
  lng: number;
  time: number;
  mode?: ModeKey;
};

export type RouteProperties = {
  mode: ModeKey;
  start: number;
  end: number;
  distanceMeters?: number;
};

export type VisitProperties = {
  start: number;
  end: number;
  durationMinutes?: number;
};

export type HeatProperties = {
  movementWeight: number;
  dwellWeight: number;
  mode?: ModeKey;
};

export type HeatSample = {
  lat: number;
  lng: number;
  start: number;
  end: number;
  movementWeight: number;
  dwellWeight: number;
  mode?: ModeKey;
};

export type LineFeature = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: RouteProperties;
};

export type PointFeature<T> = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: T;
};

export type TimelineCollection<T> = {
  type: 'FeatureCollection';
  features: T[];
};

export type NormalizedTimeline = {
  coverage: { start: number; end: number };
  routes: TimelineCollection<LineFeature>;
  visits: TimelineCollection<PointFeature<VisitProperties>>;
  heatPoints: TimelineCollection<PointFeature<HeatProperties>>;
  heatSamples: HeatSample[];
  playback: Point[];
  stats: {
    activeDays: number;
    distanceMeters: number;
    visitCount: number;
    routePointCount: number;
    hotspots: Array<{ lat: number; lng: number; dwell: number; movement: number }>;
  };
};

export type WorkerProgress = {
  type: 'progress';
  percent: number;
  label: string;
};

export type WorkerSuccess = {
  type: 'success';
  data: NormalizedTimeline;
};

export type WorkerFailure = {
  type: 'error';
  message: string;
};

export type TimelineWorkerMessage = WorkerProgress | WorkerSuccess | WorkerFailure;

const EARTH_RADIUS_METERS = 6371008.8;
const MAX_ROUTE_POINTS = 52000;
const MAX_PLAYBACK_POINTS = 14000;
const MAX_VISITS = 2600;
const MAX_HEAT_CELLS = 14000;
const MAX_HEAT_ROUTE_SAMPLES = 28000;
const MAX_HEAT_SIGNAL_SAMPLES = 12000;
const GRID_SIZE = 0.025;

const MODE_ALIASES: Record<string, ModeKey> = {
  IN_PASSENGER_VEHICLE: 'drive',
  IN_TAXI: 'drive',
  MOTORCYCLING: 'drive',
  IN_ROAD_VEHICLE: 'drive',
  WALKING: 'walk',
  RUNNING: 'walk',
  ON_FOOT: 'walk',
  CYCLING: 'cycle',
  ON_BICYCLE: 'cycle',
  IN_BUS: 'transit',
  IN_TRAIN: 'transit',
  IN_SUBWAY: 'transit',
  IN_TRAM: 'transit',
  IN_FERRY: 'transit',
  IN_GONDOLA_LIFT: 'transit',
  FLYING: 'flight',
  BOATING: 'water',
  KAYAKING: 'water',
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function parseTime(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 100000000000 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const numericTime = Number(value);
    if (Number.isFinite(numericTime)) {
      return numericTime > 100000000000 ? numericTime : numericTime * 1000;
    }
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : undefined;
  }

  return undefined;
}

function readLatLngString(value: string): [number, number] | undefined {
  const normalized = value.replace(/Ã‚Â°|Â°|º/g, '°');
  const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)\s*°?/);
  if (!match) return undefined;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return undefined;
  }

  return [lat, lng];
}

function readCoordinate(value: unknown): [number, number] | undefined {
  if (typeof value === 'string') return readLatLngString(value);
  const record = asRecord(value);

  const lat = record.latitude ?? record.lat ?? record.Latitude;
  const lng = record.longitude ?? record.lng ?? record.lon ?? record.Longitude;
  if (typeof lat === 'number' && typeof lng === 'number') {
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
  }

  for (const key of ['latLng', 'LatLng', 'placeLocation', 'placeLocationLatLng', 'location']) {
    if (record[key]) {
      const point = readCoordinate(record[key]);
      if (point) return point;
    }
  }

  if (typeof record.latitudeE7 === 'number' && typeof record.longitudeE7 === 'number') {
    const e7Point: [number, number] = [record.latitudeE7 / 10000000, record.longitudeE7 / 10000000];
    if (Math.abs(e7Point[0]) <= 90 && Math.abs(e7Point[1]) <= 180) return e7Point;
  }

  return undefined;
}

function readPoint(value: unknown, time: number | undefined, mode?: ModeKey): Point | undefined {
  const point = readCoordinate(value);
  if (!point || time === undefined) return undefined;
  return { lat: point[0], lng: point[1], time, mode };
}

function normalizeMode(value: unknown): ModeKey {
  if (typeof value !== 'string') return 'other';
  return MODE_ALIASES[value.toUpperCase()] ?? 'other';
}

function distanceBetween(a: Point, b: Point): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function dedupePoints(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng && previous.time === point.time) {
      continue;
    }
    result.push(point);
  }
  return result;
}

function decimate(points: Point[], limit: number): Point[] {
  if (points.length <= limit) return points;
  const stride = Math.ceil(points.length / limit);
  const result: Point[] = [];
  for (let index = 0; index < points.length; index += stride) result.push(points[index]);
  const last = points[points.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

function decimateWithAnchors(points: Point[], limit: number, anchors: Point[]): Point[] {
  if (points.length <= limit) return points;
  return dedupePoints(
    [...decimate(points, limit), ...anchors].sort((a, b) => a.time - b.time),
  );
}

function getSegmentMode(
  start: number | undefined,
  end: number | undefined,
  activities: Array<{ start: number; end: number; mode: ModeKey }>,
): ModeKey {
  if (start === undefined || end === undefined || activities.length === 0) return 'other';
  const center = start + (end - start) / 2;
  let low = 0;
  let high = activities.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const activity = activities[middle];
    if (center < activity.start) high = middle - 1;
    else if (center > activity.end) low = middle + 1;
    else return activity.mode;
  }

  const closest = activities[Math.max(0, Math.min(activities.length - 1, low))];
  return closest && Math.abs(closest.start - center) < 30 * 60 * 1000 ? closest.mode : 'other';
}

type RawPath = { points: Point[]; start?: number; end?: number; mode?: ModeKey; distanceMeters?: number };
type RawVisit = { point: Point; start: number; end: number };

type HeatCell = { lat: number; lng: number; movement: number; dwell: number; mode: ModeKey };

function aggregateHeatData(samples: HeatSample[], range?: { start: number; end: number }) {
  const grid = new Map<string, HeatCell>();
  const addHeat = (sample: HeatSample, movement: number, dwell: number) => {
    const latCell = Math.round(sample.lat / GRID_SIZE);
    const lngCell = Math.round(sample.lng / GRID_SIZE);
    const mode = sample.mode ?? 'other';
    const key = `${latCell}:${lngCell}:${mode}`;
    const existing = grid.get(key) ?? { lat: latCell * GRID_SIZE, lng: lngCell * GRID_SIZE, movement: 0, dwell: 0, mode };
    existing.movement += movement;
    existing.dwell += dwell;
    grid.set(key, existing);
  };

  for (const sample of samples) {
    const sampleStart = Math.min(sample.start, sample.end);
    const sampleEnd = Math.max(sample.start, sample.end);
    const rangeStart = range?.start ?? sampleStart;
    const rangeEnd = range?.end ?? sampleEnd;
    if (sampleEnd < rangeStart || sampleStart > rangeEnd) continue;

    const overlapStart = Math.max(sampleStart, rangeStart);
    const overlapEnd = Math.min(sampleEnd, rangeEnd);
    const sampleDuration = sampleEnd - sampleStart;
    const overlapRatio = sampleDuration > 0 ? Math.max(0, Math.min(1, (overlapEnd - overlapStart) / sampleDuration)) : 1;
    addHeat(sample, sample.movementWeight * overlapRatio, sample.dwellWeight * overlapRatio);
  }

  const rawHeat = [...grid.values()]
    .sort((a, b) => b.movement + b.dwell - (a.movement + a.dwell))
    .slice(0, MAX_HEAT_CELLS);
  const maxMovement = Math.max(1, ...rawHeat.map((cell) => cell.movement));
  const maxDwell = Math.max(1, ...rawHeat.map((cell) => cell.dwell));
  const heatPoints: PointFeature<HeatProperties>[] = rawHeat.map((cell) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [cell.lng, cell.lat] },
    properties: {
      movementWeight: Math.min(1, Math.log1p(cell.movement) / Math.log1p(maxMovement)),
      dwellWeight: Math.min(1, Math.log1p(cell.dwell) / Math.log1p(maxDwell)),
      mode: cell.mode,
    },
  }));

  return {
    heatPoints,
    hotspots: rawHeat.slice(0, 4).map((cell) => ({ lat: cell.lat, lng: cell.lng, dwell: cell.dwell, movement: cell.movement })),
  };
}

function extractLegacy(root: Record<string, any>, paths: RawPath[], visits: RawVisit[], rawPositions: Point[]) {
  for (const item of asArray(root.locations)) {
    const record = asRecord(item);
    const time = parseTime(record.timestampMs ?? record.timestamp ?? record.time);
    const point = readPoint(record, time);
    if (point) rawPositions.push(point);
  }

  for (const item of asArray(root.timelineObjects)) {
    const record = asRecord(item);
    const activity = asRecord(record.activitySegment);
    if (Object.keys(activity).length > 0) {
      const start = parseTime(activity.duration?.startTimestampMs ?? activity.duration?.startTimestamp);
      const end = parseTime(activity.duration?.endTimestampMs ?? activity.duration?.endTimestamp) ?? start;
      const startPoint = readPoint(activity.startLocation, start);
      const endPoint = readPoint(activity.endLocation, end);
      if (startPoint && endPoint) {
        paths.push({
          points: [startPoint, endPoint],
          start,
          end,
          mode: normalizeMode(activity.activityType),
          distanceMeters: Number(activity.distance) || undefined,
        });
      }
    }

    const place = asRecord(record.placeVisit);
    const placeLocation = place.location ?? place.location?.placeLocation;
    const start = parseTime(place.duration?.startTimestampMs ?? place.duration?.startTimestamp);
    const end = parseTime(place.duration?.endTimestampMs ?? place.duration?.endTimestamp) ?? start;
    const point = readPoint(placeLocation, start);
    if (point && start !== undefined && end !== undefined) visits.push({ point, start, end });
  }
}

export function normalizeTimeline(payload: unknown): NormalizedTimeline {
  const root = asRecord(payload);
  const paths: RawPath[] = [];
  const visits: RawVisit[] = [];
  const rawPositions: Point[] = [];
  const activities: Array<{ start: number; end: number; mode: ModeKey; distanceMeters?: number }> = [];
  const segments = asArray(root.semanticSegments);

  for (const segmentValue of segments) {
    const segment = asRecord(segmentValue);
    const segmentStart = parseTime(segment.startTime);
    const segmentEnd = parseTime(segment.endTime) ?? segmentStart;

    const activity = asRecord(segment.activity);
    if (segmentStart !== undefined && segmentEnd !== undefined && Object.keys(activity).length > 0) {
      const mode = normalizeMode(activity.topCandidate?.type);
      const distanceMeters = Number(activity.distanceMeters);
      activities.push({ start: segmentStart, end: segmentEnd, mode, distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : undefined });
    }

    const pathValues = asArray(segment.timelinePath);
    if (pathValues.length > 0) {
      const points = dedupePoints(
        pathValues
          .map((value) => {
            const record = asRecord(value);
            return readPoint(record.point ?? record.latLng ?? record, parseTime(record.time ?? record.timestamp));
          })
          .filter((point): point is Point => Boolean(point)),
      );
      if (points.length > 0) paths.push({ points, start: segmentStart, end: segmentEnd });
    }

    const visit = asRecord(segment.visit);
    const visitPoint = readPoint(visit.topCandidate?.placeLocation, segmentStart);
    if (visitPoint && segmentStart !== undefined && segmentEnd !== undefined) {
      visits.push({ point: visitPoint, start: segmentStart, end: segmentEnd });
    }
  }

  for (const signalValue of asArray(root.rawSignals)) {
    const signal = asRecord(signalValue);
    const position = asRecord(signal.position);
    const point = readPoint(position.LatLng ?? position.latLng ?? position, parseTime(position.timestamp));
    if (point) rawPositions.push(point);
  }

  extractLegacy(root, paths, visits, rawPositions);

  activities.sort((a, b) => a.start - b.start);
  paths.sort((a, b) => (a.start ?? a.points[0]?.time ?? 0) - (b.start ?? b.points[0]?.time ?? 0));
  visits.sort((a, b) => a.start - b.start);
  rawPositions.sort((a, b) => a.time - b.time);

  for (const path of paths) {
    path.mode = path.mode ?? getSegmentMode(path.start ?? path.points[0]?.time, path.end ?? path.points[path.points.length - 1]?.time, activities);
    for (const point of path.points) point.mode = path.mode;
  }

  if (paths.length === 0 && rawPositions.length > 1) {
    let current: Point[] = [];
    for (const point of rawPositions) {
      const previous = current[current.length - 1];
      if (previous && point.time - previous.time > 2 * 60 * 60 * 1000) {
        if (current.length > 1) paths.push({ points: current, start: current[0].time, end: previous.time, mode: 'other' });
        current = [];
      }
      current.push(point);
    }
    if (current.length > 1) paths.push({ points: current, start: current[0].time, end: current[current.length - 1].time, mode: 'other' });
  }

  const allPathPoints = paths.flatMap((path) => path.points).sort((a, b) => a.time - b.time);
  const playbackPoints = allPathPoints.length > 0 ? allPathPoints : rawPositions;
  const playbackAnchors = allPathPoints.length > 0
    ? paths.flatMap((path) => [path.points[0], path.points[path.points.length - 1]])
    : [];
  const playback = decimateWithAnchors(dedupePoints(playbackPoints), MAX_PLAYBACK_POINTS, playbackAnchors);
  if (playback.length === 0 && visits.length === 0) {
    throw new Error('No recognizable locations were found in this file.');
  }

  const renderRoutes: LineFeature[] = [];
  let renderPointCount = 0;
  for (const path of paths) {
    const visiblePoints = decimate(dedupePoints(path.points), Math.max(2, Math.floor(MAX_ROUTE_POINTS / Math.max(1, paths.length))));
    renderPointCount += path.points.length;
    if (visiblePoints.length < 2) continue;
    renderRoutes.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: visiblePoints.map((point) => [point.lng, point.lat]) },
      properties: {
        mode: path.mode ?? 'other',
        start: path.start ?? visiblePoints[0].time,
        end: path.end ?? visiblePoints[visiblePoints.length - 1].time,
        distanceMeters: path.distanceMeters,
      },
    });
  }

  const heatSamples: HeatSample[] = [
    ...decimate(allPathPoints, MAX_HEAT_ROUTE_SAMPLES).map((point) => ({
      lat: point.lat,
      lng: point.lng,
      start: point.time,
      end: point.time,
      movementWeight: 1,
      dwellWeight: 0,
      mode: point.mode,
    })),
    ...decimate(rawPositions.filter((_, index) => index % 4 === 0), MAX_HEAT_SIGNAL_SAMPLES).map((point) => ({
      lat: point.lat,
      lng: point.lng,
      start: point.time,
      end: point.time,
      movementWeight: 0.05,
      dwellWeight: 0.25,
      mode: point.mode,
    })),
    ...visits.map((visit) => ({
      lat: visit.point.lat,
      lng: visit.point.lng,
      start: visit.start,
      end: visit.end,
      movementWeight: 0.25,
      dwellWeight: Math.max(1, (visit.end - visit.start) / 60000),
      mode: 'other' as ModeKey,
    })),
  ].sort((a, b) => a.start - b.start);
  const { heatPoints, hotspots } = aggregateHeatData(heatSamples);

  const allTimes = [
    ...allPathPoints.map((point) => point.time),
    ...rawPositions.map((point) => point.time),
    ...visits.flatMap((visit) => [visit.start, visit.end]),
  ].filter(Number.isFinite);
  const start = allTimes.length > 0 ? allTimes.reduce((minimum, time) => Math.min(minimum, time), Number.POSITIVE_INFINITY) : Date.now();
  const end = allTimes.length > 0 ? allTimes.reduce((maximum, time) => Math.max(maximum, time), Number.NEGATIVE_INFINITY) : Date.now();
  const activeDays = new Set(allTimes.map((time) => new Date(time).toISOString().slice(0, 10))).size;
  const activityDistance = activities.reduce((total, activity) => total + (activity.distanceMeters ?? 0), 0);
  const fallbackDistance = allPathPoints.slice(1).reduce((total, point, index) => total + distanceBetween(allPathPoints[index], point), 0);
  return {
    coverage: { start: Number.isFinite(start) ? start : Date.now(), end: Number.isFinite(end) ? end : Date.now() },
    routes: { type: 'FeatureCollection', features: renderRoutes },
    visits: {
      type: 'FeatureCollection',
      features: visits.slice(0, MAX_VISITS).map((visit) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [visit.point.lng, visit.point.lat] },
        properties: { start: visit.start, end: visit.end, durationMinutes: Math.max(1, (visit.end - visit.start) / 60000) },
      })),
    },
    heatPoints: { type: 'FeatureCollection', features: heatPoints },
    heatSamples,
    playback,
    stats: {
      activeDays,
      distanceMeters: activityDistance || fallbackDistance,
      visitCount: visits.length,
      routePointCount: renderPointCount,
      hotspots,
    },
  };
}

function lineDistance(coordinates: [number, number][]) {
  return coordinates.slice(1).reduce((total, [lng, lat], index) => {
    const [previousLng, previousLat] = coordinates[index];
    return total + distanceBetween(
      { lat: previousLat, lng: previousLng, time: 0 },
      { lat, lng, time: 0 },
    );
  }, 0);
}

function dateRangeTimes(fromDate?: string, toDate?: string) {
  const start = fromDate ? Date.parse(`${fromDate}T00:00:00.000Z`) : undefined;
  const end = toDate ? Date.parse(`${toDate}T23:59:59.999Z`) : undefined;
  return {
    start: Number.isFinite(start) ? start : undefined,
    end: Number.isFinite(end) ? end : undefined,
  };
}

export function filterTimelineByDateRange(timeline: NormalizedTimeline, fromDate?: string, toDate?: string): NormalizedTimeline {
  const requested = dateRangeTimes(fromDate, toDate);
  const start = Math.max(timeline.coverage.start, requested.start ?? timeline.coverage.start);
  const end = Math.min(timeline.coverage.end, requested.end ?? timeline.coverage.end);
  if (end < start) return timeline;

  const routes = timeline.routes.features.filter((route) => route.properties.end >= start && route.properties.start <= end);
  const visits = timeline.visits.features
    .filter((visit) => visit.properties.end >= start && visit.properties.start <= end)
    .map((visit) => ({
      ...visit,
      properties: {
        ...visit.properties,
        start: Math.max(start, visit.properties.start),
        end: Math.min(end, visit.properties.end),
        durationMinutes: Math.max(1, (Math.min(end, visit.properties.end) - Math.max(start, visit.properties.start)) / 60000),
      },
    }));
  const playback = timeline.playback.filter((point) => point.time >= start && point.time <= end);
  const heatSamples = timeline.heatSamples.filter((sample) => sample.end >= start && sample.start <= end);
  const { heatPoints, hotspots } = aggregateHeatData(heatSamples, { start, end });
  const visibleTimes = [
    ...routes.flatMap((route) => [Math.max(start, route.properties.start), Math.min(end, route.properties.end)]),
    ...visits.flatMap((visit) => [visit.properties.start, visit.properties.end]),
    ...playback.map((point) => point.time),
  ];
  const coverageStart = visibleTimes.length > 0 ? Math.min(...visibleTimes) : start;
  const coverageEnd = visibleTimes.length > 0 ? Math.max(...visibleTimes) : end;
  const activeDays = new Set(visibleTimes.map((time) => new Date(time).toISOString().slice(0, 10))).size;
  const routePointCount = routes.reduce((total, route) => total + route.geometry.coordinates.length, 0);
  const routeDistance = routes.reduce((total, route) => total + (route.properties.distanceMeters ?? lineDistance(route.geometry.coordinates)), 0);
  const playbackDistance = playback.slice(1).reduce((total, point, index) => total + distanceBetween(playback[index], point), 0);

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

function feature(
  mode: ModeKey,
  points: Array<[number, number, string]>,
): LineFeature {
  const normalizedPoints = points.map(([lng, lat, time]) => ({ lng, lat, time: Date.parse(time), mode }));
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: normalizedPoints.map((point) => [point.lng, point.lat]) },
    properties: { mode, start: normalizedPoints[0].time, end: normalizedPoints[normalizedPoints.length - 1].time },
  };
}

function demoVisit(lng: number, lat: number, start: string, end: string): PointFeature<VisitProperties> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { start: Date.parse(start), end: Date.parse(end), durationMinutes: (Date.parse(end) - Date.parse(start)) / 60000 },
  };
}

export function createDemoTimeline(): NormalizedTimeline {
  const routes = [
    feature('flight', [[-0.12, 51.5, '2024-04-12T08:00:00Z'], [2.35, 48.86, '2024-04-12T10:30:00Z']]),
    feature('walk', [[2.35, 48.86, '2024-04-12T10:35:00Z'], [2.29, 48.87, '2024-04-12T11:10:00Z'], [2.34, 48.85, '2024-04-12T13:15:00Z']]),
    feature('transit', [[2.34, 48.85, '2024-04-12T14:00:00Z'], [12.49, 41.9, '2024-04-12T16:15:00Z']]),
    feature('walk', [[12.49, 41.9, '2024-04-12T16:20:00Z'], [12.48, 41.89, '2024-04-12T18:00:00Z'], [12.46, 41.9, '2024-04-13T09:00:00Z']]),
    feature('drive', [[12.46, 41.9, '2024-04-13T10:00:00Z'], [12.52, 41.93, '2024-04-13T10:35:00Z'], [12.46, 41.9, '2024-04-13T13:00:00Z']]),
    feature('flight', [[12.46, 41.9, '2024-04-14T07:00:00Z'], [13.4, 52.52, '2024-04-14T09:10:00Z']]),
    feature('walk', [[13.4, 52.52, '2024-04-14T09:20:00Z'], [13.38, 52.51, '2024-04-14T11:30:00Z'], [13.41, 52.51, '2024-04-14T14:00:00Z']]),
    feature('transit', [[13.41, 52.51, '2024-04-14T15:00:00Z'], [13.35, 52.5, '2024-04-14T15:35:00Z'], [13.4, 52.52, '2024-04-15T08:00:00Z']]),
  ];

  const visits = [
    demoVisit(2.35, 48.86, '2024-04-12T10:30:00Z', '2024-04-12T13:00:00Z'),
    demoVisit(12.49, 41.9, '2024-04-12T16:15:00Z', '2024-04-13T09:00:00Z'),
    demoVisit(13.4, 52.52, '2024-04-14T09:10:00Z', '2024-04-14T14:00:00Z'),
  ];
  const playback = routes
    .flatMap((route) => route.geometry.coordinates.map(([lng, lat], index) => ({
      lat,
      lng,
      time: route.properties.start + ((route.properties.end - route.properties.start) * index) / Math.max(1, route.geometry.coordinates.length - 1),
      mode: route.properties.mode,
    })))
    .sort((a, b) => a.time - b.time);
  const heatSamples: HeatSample[] = [
    ...routes.flatMap((route) => route.geometry.coordinates.map(([lng, lat], index) => {
      const time = route.properties.start + ((route.properties.end - route.properties.start) * index) / Math.max(1, route.geometry.coordinates.length - 1);
      return { lat, lng, start: time, end: time, movementWeight: 0.45, dwellWeight: 0, mode: route.properties.mode };
    })),
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
    coverage: { start: Date.parse('2024-04-12T08:00:00Z'), end: Date.parse('2024-04-15T08:00:00Z') },
    routes: { type: 'FeatureCollection', features: routes },
    visits: { type: 'FeatureCollection', features: visits },
    heatPoints: { type: 'FeatureCollection', features: heatPoints },
    heatSamples,
    playback,
    stats: {
      activeDays: 4,
      distanceMeters: 2580000,
      visitCount: visits.length,
      routePointCount: routes.reduce((total, route) => total + route.geometry.coordinates.length, 0),
      hotspots,
    },
  };
}
