import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDemoTimeline, normalizeTimeline } from './timeline';

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

  it.skipIf(!existsSync(resolve(process.cwd(), '..', 'Timeline.json')))('smoke-tests the included export', () => {
    const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '..', 'Timeline.json'), 'utf8')) as unknown;
    const timeline = normalizeTimeline(fixture);
    expect(timeline.coverage.start).toBeLessThan(timeline.coverage.end);
    expect(timeline.routes.features.length).toBeGreaterThan(0);
    expect(timeline.playback.length).toBeGreaterThan(0);
    expect(timeline.stats.visitCount).toBeGreaterThan(0);
  }, 90000);
});
