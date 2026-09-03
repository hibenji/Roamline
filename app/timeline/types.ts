import type { ModeKey } from '../lib/modes';

export type { ModeKey } from '../lib/modes';

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
  detailedRoutes: TimelineCollection<LineFeature>;
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
