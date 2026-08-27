import type { Map as MapLibreMap } from 'maplibre-gl';
import type { ModeKey } from '../lib/modes';

export type MapDetail = {
  coordinate: [number, number];
  screenX: number;
  screenY: number;
  placement: 'above' | 'below';
  start: number;
  end: number;
  mode?: ModeKey;
  distanceMeters?: number;
};

export function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatDetailTime(timestamp: number) {
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(timestamp);
}

export function formatDetailRange(start: number, end: number) {
  if (!Number.isFinite(start)) return 'Time unavailable';
  if (!Number.isFinite(end) || end <= start || end - start < 60_000) return formatDetailTime(start);
  return `${formatDetailTime(start)} → ${formatDetailTime(end)}`;
}

export function formatDetailDistance(meters?: number) {
  if (!Number.isFinite(meters) || !meters || meters <= 0) return 'Not available';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters >= 100_000 ? 0 : 1)} km`;
}

export function positionForDetail(map: MapLibreMap, coordinate: [number, number]) {
  const projected = map.project(coordinate);
  const width = map.getContainer().clientWidth;
  const height = map.getContainer().clientHeight;
  return {
    screenX: Math.min(Math.max(projected.x, 18), Math.max(18, width - 18)),
    screenY: Math.min(Math.max(projected.y, 18), Math.max(18, height - 18)),
    placement: projected.y < 170 ? ('below' as const) : ('above' as const),
  };
}
