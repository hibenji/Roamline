import type { ModeKey, NormalizedTimeline } from './timeline';
import { countryForPoint } from './country';

export type TrendMetric = 'days' | 'distance' | 'visits';

export type TrendBucket = {
  key: string;
  label: string;
  activeDays: number;
  distanceMeters: number;
  visits: number;
  movementPoints: number;
};

export type CountryStat = {
  country: string;
  minutes: number;
  visits: number;
  movementPoints: number;
  share: number;
};

export type YearStat = {
  year: string;
  activeDays: number;
  distanceMeters: number;
  visits: number;
  dwellMinutes: number;
  movementPoints: number;
};

export type TimelineAnalysis = {
  activeDays: number;
  distanceMeters: number;
  visitCount: number;
  routePointCount: number;
  dwellMinutes: number;
  averageVisitMinutes: number;
  longestStreak: number;
  peakHour: number | undefined;
  peakHourCount: number;
  busiestDate: string | undefined;
  busiestDateCount: number;
  topMode: ModeKey | undefined;
  modeBreakdown: Array<{ mode: ModeKey; distanceMeters: number; share: number }>;
  weekdayCounts: Array<{ label: string; count: number }>;
  hourlyCounts: number[];
  trendGranularity: 'year' | 'month';
  trend: TrendBucket[];
  countryBreakdown: CountryStat[];
  yearBreakdown: YearStat[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function bucketKey(timestamp: number, granularity: 'year' | 'month') {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  return granularity === 'year'
    ? `${year}`
    : `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function bucketLabel(key: string, granularity: 'year' | 'month') {
  if (granularity === 'year') return key;
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .format(Date.UTC(year, month - 1, 1));
}

function locationKey(lat: number, lng: number, start: number, end: number) {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}:${start}:${end}`;
}

function lineDistance(coordinates: [number, number][]) {
  return coordinates.slice(1).reduce((total, [lng, lat], index) => {
    const [previousLng, previousLat] = coordinates[index];
    const latitudeDelta = (lat - previousLat) * Math.PI / 180;
    const longitudeDelta = (lng - previousLng) * Math.PI / 180;
    const a = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(previousLat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(longitudeDelta / 2) ** 2;
    return total + 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, 0);
}

function trendKeys(start: number, end: number, granularity: 'year' | 'month') {
  const keys: string[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  if (granularity === 'year') cursor.setUTCMonth(0);
  const lastKey = bucketKey(end, granularity);
  while (bucketKey(cursor.getTime(), granularity) <= lastKey && keys.length < 240) {
    keys.push(bucketKey(cursor.getTime(), granularity));
    if (granularity === 'year') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

export function deriveTimelineStats(
  timeline: NormalizedTimeline,
  selectedModes: ModeKey[],
  includeVisits = true,
): TimelineAnalysis {
  const selected = new Set(selectedModes);
  const routes = timeline.routes.features.filter((route) => selected.has(route.properties.mode));
  const playback = timeline.playback.filter((point) => selected.has(point.mode ?? 'other'));
  const visits = includeVisits ? timeline.visits.features : [];
  const countryMap = new Map<string, { minutes: number; visits: number; movementPoints: number }>();
  const visitSampleKeys = new Set(timeline.visits.features.map((visit) => locationKey(
    visit.geometry.coordinates[1],
    visit.geometry.coordinates[0],
    visit.properties.start,
    visit.properties.end,
  )));
  const countryCache = new Map<string, string | undefined>();
  const addCountry = (lat: number, lng: number, minutes: number, movementPoints: number, visitCount: number) => {
    const cacheKey = `${lat.toFixed(4)}:${lng.toFixed(4)}`;
    if (!countryCache.has(cacheKey)) countryCache.set(cacheKey, countryForPoint(lat, lng));
    const country = countryCache.get(cacheKey);
    if (!country) return;
    const existing = countryMap.get(country) ?? { minutes: 0, visits: 0, movementPoints: 0 };
    existing.minutes += minutes;
    existing.visits += visitCount;
    existing.movementPoints += movementPoints;
    countryMap.set(country, existing);
  };
  const spanDays = Math.max(1, (timeline.coverage.end - timeline.coverage.start) / DAY_MS);
  const trendGranularity: 'year' | 'month' = spanDays > 900 ? 'year' : 'month';
  const buckets = new Map<string, TrendBucket>();
  const bucketDays = new Map<string, Set<string>>();
  const ensureBucket = (timestamp: number) => {
    const key = bucketKey(timestamp, trendGranularity);
    const bucket = buckets.get(key) ?? {
      key,
      label: bucketLabel(key, trendGranularity),
      activeDays: 0,
      distanceMeters: 0,
      visits: 0,
      movementPoints: 0,
    };
    buckets.set(key, bucket);
    if (!bucketDays.has(key)) bucketDays.set(key, new Set());
    return bucket;
  };

  const activeDates = new Set<string>();
  const dateCounts = new Map<string, number>();
  const yearMap = new Map<string, { activeDays: Set<string>; distanceMeters: number; visits: number; dwellMinutes: number; movementPoints: number }>();
  const ensureYear = (timestamp: number) => {
    const year = String(new Date(timestamp).getUTCFullYear());
    const bucket = yearMap.get(year) ?? { activeDays: new Set<string>(), distanceMeters: 0, visits: 0, dwellMinutes: 0, movementPoints: 0 };
    yearMap.set(year, bucket);
    return { year, bucket };
  };
  const addYearTime = (timestamp: number) => {
    if (!Number.isFinite(timestamp)) return;
    const dateValue = dayKey(timestamp);
    ensureYear(timestamp).bucket.activeDays.add(dateValue);
  };
  const weekdayCounts = Array.from({ length: 7 }, (_, index) => ({
    label: new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 7 + index)),
    count: 0,
  }));
  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  const addTime = (timestamp: number, count = 1) => {
    if (!Number.isFinite(timestamp)) return;
    const date = new Date(timestamp);
    const dateValue = dayKey(timestamp);
    const bucket = ensureBucket(timestamp);
    addYearTime(timestamp);
    activeDates.add(dateValue);
    dateCounts.set(dateValue, (dateCounts.get(dateValue) ?? 0) + count);
    bucketDays.get(bucket.key)?.add(dateValue);
    weekdayCounts[date.getUTCDay()].count += count;
    hourlyCounts[date.getUTCHours()] += count;
  };

  for (const point of playback) {
    const bucket = ensureBucket(point.time);
    bucket.movementPoints += 1;
    ensureYear(point.time).bucket.movementPoints += 1;
    addTime(point.time);
  }

  const modeDistances = new Map<ModeKey, number>();
  let distanceMeters = 0;
  let routePointCount = 0;
  for (const route of routes) {
    const routeDistance = route.properties.distanceMeters ?? lineDistance(route.geometry.coordinates);
    distanceMeters += routeDistance;
    routePointCount += route.geometry.coordinates.length;
    modeDistances.set(route.properties.mode, (modeDistances.get(route.properties.mode) ?? 0) + routeDistance);
    const routeTime = route.properties.start + (route.properties.end - route.properties.start) / 2;
    ensureBucket(routeTime).distanceMeters += routeDistance;
    ensureYear(routeTime).bucket.distanceMeters += routeDistance;
    addTime(route.properties.start);
    if (route.properties.end !== route.properties.start) addTime(route.properties.end);
  }

  let dwellMinutes = 0;
  for (const visit of visits) {
    const duration = visit.properties.durationMinutes ?? Math.max(1, (visit.properties.end - visit.properties.start) / 60000);
    dwellMinutes += duration;
    const bucket = ensureBucket(visit.properties.start);
    bucket.visits += 1;
    const yearBucket = ensureYear(visit.properties.start).bucket;
    yearBucket.visits += 1;
    yearBucket.dwellMinutes += duration;
    addTime(visit.properties.start);
  }

  for (const visit of visits) {
    addCountry(
      visit.geometry.coordinates[1],
      visit.geometry.coordinates[0],
      visit.properties.durationMinutes ?? Math.max(1, (visit.properties.end - visit.properties.start) / 60000),
      0,
      1,
    );
  }
  for (const sample of timeline.heatSamples) {
    if (!selected.has(sample.mode ?? 'other')) continue;
    const sampleIsVisit = visitSampleKeys.has(locationKey(sample.lat, sample.lng, sample.start, sample.end));
    if (sampleIsVisit) continue;
    if (sample.movementWeight <= 0 && sample.dwellWeight <= 0) continue;
    addCountry(sample.lat, sample.lng, sample.dwellWeight, sample.movementWeight, 0);
  }

  for (const bucket of buckets.values()) bucket.activeDays = bucketDays.get(bucket.key)?.size ?? 0;
  const trend = trendKeys(timeline.coverage.start, timeline.coverage.end, trendGranularity).map((key) => buckets.get(key) ?? {
    key,
    label: bucketLabel(key, trendGranularity),
    activeDays: 0,
    distanceMeters: 0,
    visits: 0,
    movementPoints: 0,
  });

  const totalCountryMinutes = [...countryMap.values()].reduce((total, country) => total + country.minutes, 0);
  const countryBreakdown = [...countryMap.entries()]
    .sort((a, b) => b[1].minutes - a[1].minutes || b[1].movementPoints - a[1].movementPoints)
    .map(([country, values]) => ({ country, ...values, share: totalCountryMinutes > 0 ? values.minutes / totalCountryMinutes : 0 }));
  const yearBreakdown = [...yearMap.entries()]
    .sort(([yearA], [yearB]) => yearA.localeCompare(yearB))
    .map(([year, values]) => ({ year, activeDays: values.activeDays.size, distanceMeters: values.distanceMeters, visits: values.visits, dwellMinutes: values.dwellMinutes, movementPoints: values.movementPoints }));

  const modeBreakdown = [...modeDistances.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mode, distance]) => ({ mode, distanceMeters: distance, share: distanceMeters > 0 ? distance / distanceMeters : 0 }));
  const busiestDateEntry = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const peakHourCount = Math.max(0, ...hourlyCounts);
  const peakHour = peakHourCount > 0 ? hourlyCounts.indexOf(peakHourCount) : undefined;
  const sortedDates = [...activeDates].sort();
  let longestStreak = sortedDates.length > 0 ? 1 : 0;
  let currentStreak = longestStreak;
  for (let index = 1; index < sortedDates.length; index += 1) {
    const previous = Date.parse(`${sortedDates[index - 1]}T00:00:00.000Z`);
    const current = Date.parse(`${sortedDates[index]}T00:00:00.000Z`);
    currentStreak = current - previous === DAY_MS ? currentStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, currentStreak);
  }

  return {
    activeDays: activeDates.size,
    distanceMeters,
    visitCount: visits.length,
    routePointCount,
    dwellMinutes,
    averageVisitMinutes: visits.length > 0 ? dwellMinutes / visits.length : 0,
    longestStreak,
    peakHour,
    peakHourCount,
    busiestDate: busiestDateEntry?.[0],
    busiestDateCount: busiestDateEntry?.[1] ?? 0,
    topMode: modeBreakdown[0]?.mode,
    modeBreakdown,
    weekdayCounts,
    hourlyCounts,
    trendGranularity,
    trend,
    countryBreakdown,
    yearBreakdown,
  };
}
