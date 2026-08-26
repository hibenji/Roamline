import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countryForPoint } from './country';
import { deriveTimelineStats } from './stats';
import { createDemoTimeline, filterTimelineByDateRange, normalizeTimeline } from './timeline';

describe('timeline normalizer', () => {
  it('normalizes semantic segments, activities, and visits', () => {
    const timeline = normalizeTimeline({
      semanticSegments: [
        {
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:10:00Z',
          timelinePath: [
            { point: '48.1000°, 16.1000°', time: '2024-01-01T10:00:00Z' },
            { point: '48.1100Â°, 16.1100Â°', time: '2024-01-01T10:05:00Z' },
          ],
        },
        {
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:10:00Z',
          activity: {
            start: { latLng: '48.1000°, 16.1000°' },
            end: { latLng: '48.1100°, 16.1100°' },
            distanceMeters: 1400,
            topCandidate: { type: 'WALKING' },
          },
        },
        {
          startTime: '2024-01-01T10:10:00Z',
          endTime: '2024-01-01T12:10:00Z',
          visit: { topCandidate: { placeLocation: { latLng: '48.1100°, 16.1100°' } } },
        },
      ],
    });

    expect(timeline.routes.features).toHaveLength(1);
    expect(timeline.routes.features[0].properties.mode).toBe('walk');
    expect(timeline.visits.features).toHaveLength(1);
    expect(timeline.stats.distanceMeters).toBe(1400);
    expect(timeline.stats.visitCount).toBe(1);
  });

  it('supports legacy E7 coordinates and raw location fallback', () => {
    const timeline = normalizeTimeline({
      locations: [
        { latitudeE7: 481000000, longitudeE7: 161000000, timestampMs: 1704103200000 },
        { latitudeE7: 481100000, longitudeE7: 161100000, timestampMs: 1704103500000 },
      ],
    });

    expect(timeline.playback).toHaveLength(2);
    expect(timeline.playback[0]).toMatchObject({ lat: 48.1, lng: 16.1 });
    expect(timeline.routes.features).toHaveLength(1);
  });

  it('creates a self-contained synthetic demo without private fixture data', () => {
    const demo = createDemoTimeline();
    expect(demo.routes.features.length).toBeGreaterThan(1);
    expect(demo.playback.length).toBeGreaterThan(1);
    expect(demo.stats.visitCount).toBe(3);
  });

  it('filters routes, visits, heat samples, playback, and stats by an inclusive date range', () => {
    const demo = createDemoTimeline();
    const filtered = filterTimelineByDateRange(demo, '2024-04-14', '2024-04-14');

    expect(filtered.playback.every((point) => point.time >= Date.parse('2024-04-14T00:00:00Z') && point.time <= Date.parse('2024-04-14T23:59:59.999Z'))).toBe(true);
    expect(filtered.routes.features).toHaveLength(3);
    expect(filtered.visits.features).toHaveLength(1);
    expect(filtered.stats.visitCount).toBe(1);
    expect(filtered.heatPoints.features.length).toBeGreaterThan(0);
    expect(filtered.coverage.start).toBeGreaterThanOrEqual(Date.parse('2024-04-14T00:00:00Z'));
    expect(filtered.coverage.end).toBeLessThanOrEqual(Date.parse('2024-04-14T23:59:59.999Z'));
  });

  it('derives trend, rhythm, streak, and mode statistics from the visible timeline', () => {
    const demo = createDemoTimeline();
    const stats = deriveTimelineStats(demo, ['drive', 'walk', 'transit', 'flight'], true);
    const walkingStats = deriveTimelineStats(demo, ['walk'], true);

    expect(stats.trendGranularity).toBe('month');
    expect(stats.trend[0].visits).toBe(3);
    expect(stats.activeDays).toBe(4);
    expect(stats.longestStreak).toBe(4);
    expect(stats.topMode).toBe('flight');
    expect(stats.peakHour).toBeDefined();
    expect(walkingStats.topMode).toBe('walk');
    expect(walkingStats.distanceMeters).toBeLessThan(stats.distanceMeters);
  });

  it('matches representative coordinates to offline country boundaries', () => {
    expect(countryForPoint(48.2082, 16.3738)).toBe('Austria');
    expect(countryForPoint(48.8566, 2.3522)).toBe('France');
  });

  it.skipIf(!existsSync(resolve(process.cwd(), '..', 'Timeline.json')))('smoke-tests the included export', () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '..', 'Timeline.json'), 'utf8')) as unknown;
    const timeline = normalizeTimeline(fixture);
    expect(timeline.coverage.start).toBeLessThan(timeline.coverage.end);
    expect(timeline.routes.features.length).toBeGreaterThan(0);
    expect(timeline.playback.length).toBeGreaterThan(0);
    expect(timeline.stats.visitCount).toBeGreaterThan(0);
  }, 90000);
});
