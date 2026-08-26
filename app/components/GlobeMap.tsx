/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { ModeKey, NormalizedTimeline, Point } from '../timeline';

export type GlobeViewMode = 'all' | 'replay' | 'heatmap';
export type HeatViewMode = 'dwell' | 'movement';

type GlobeMapProps = {
  timeline: NormalizedTimeline;
  viewMode: GlobeViewMode;
  heatMode: HeatViewMode;
  selectedModes: ModeKey[];
  showVisits: boolean;
  playbackProgress: number;
  autoRotate: boolean;
  onMapReady?: () => void;
};

const ROUTE_COLORS: Record<ModeKey, string> = {
  drive: '#ff806d',
  walk: '#89f5c9',
  cycle: '#ffd166',
  transit: '#77d7ff',
  flight: '#c4b5fd',
  water: '#60a5fa',
  other: '#a8b1c2',
};

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    cartoDark: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'carto-dark',
      type: 'raster',
      source: 'cartoDark',
      paint: { 'raster-opacity': 0.78, 'raster-saturation': -0.3, 'raster-contrast': 0.12 },
    },
  ],
  projection: { type: 'globe' },
};

const emptyCollection = { type: 'FeatureCollection', features: [] } as const;

function sourceData(timeline: NormalizedTimeline, playbackProgress: number) {
  const playbackIndex = Math.max(0, Math.min(timeline.playback.length - 1, Math.floor(playbackProgress * Math.max(0, timeline.playback.length - 1))));
  const activePoints = timeline.playback.slice(0, playbackIndex + 1);
  const currentPoint = timeline.playback[playbackIndex];
  const route = activePoints.length > 1
    ? {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: activePoints.map((point) => [point.lng, point.lat]) },
          properties: {},
        }],
      }
    : emptyCollection;
  const point = currentPoint
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [currentPoint.lng, currentPoint.lat] }, properties: {} }],
      }
    : emptyCollection;

  return { route, point };
}

export default function GlobeMap({ timeline, viewMode, heatMode, selectedModes, showVisits, playbackProgress, autoRotate, onMapReady }: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hasLoadedRef = useRef(false);
  const initialFitRef = useRef(false);
  const timelineIdentityRef = useRef(timeline);

  const playbackSources = useMemo(() => sourceData(timeline, playbackProgress), [timeline, playbackProgress]);

  useEffect(() => {
    let disposed = false;

    async function createMap() {
      if (!containerRef.current) return;
      const maplibregl = await import('maplibre-gl');
      if (disposed || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [10, 40],
        zoom: 1.45,
        pitch: 0,
        bearing: -12,
        dragRotate: true,
        touchPitch: true,
      });
      mapRef.current = map;

      map.on('load', () => {
        if (disposed) return;
        map.addSource('timeline-routes', { type: 'geojson', data: emptyCollection });
        map.addSource('timeline-visits', { type: 'geojson', data: emptyCollection });
        map.addSource('timeline-heat', { type: 'geojson', data: emptyCollection });
        map.addSource('timeline-playback-route', { type: 'geojson', data: emptyCollection });
        map.addSource('timeline-playback-point', { type: 'geojson', data: emptyCollection });

        const modeExpression: any = ['match', ['get', 'mode']];
        for (const mode of Object.keys(ROUTE_COLORS) as ModeKey[]) modeExpression.push(mode, ROUTE_COLORS[mode]);
        modeExpression.push(ROUTE_COLORS.other);

        map.addLayer({
          id: 'timeline-route-glow',
          type: 'line',
          source: 'timeline-routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': modeExpression, 'line-width': 8, 'line-opacity': 0.1, 'line-blur': 5 },
        });
        map.addLayer({
          id: 'timeline-route',
          type: 'line',
          source: 'timeline-routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': modeExpression, 'line-width': 2.2, 'line-opacity': 0.82 },
        });
        map.addLayer({
          id: 'timeline-playback-route',
          type: 'line',
          source: 'timeline-playback-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#fff3c4', 'line-width': 4.4, 'line-opacity': 0.96, 'line-blur': 0.2 },
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
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(24, 31, 48, 0)', 0.2, '#4051a3', 0.5, '#29b6c8', 0.75, '#ffd166', 1, '#ff806d'],
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
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(24, 31, 48, 0)', 0.18, '#253a83', 0.45, '#3ad6c4', 0.72, '#ffd166', 1, '#ff806d'],
          },
        });
        map.addLayer({
          id: 'timeline-visits',
          type: 'circle',
          source: 'timeline-visits',
          paint: {
            'circle-color': '#f8f5ed',
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.2, 5, 4, 10, 7],
            'circle-opacity': 0.78,
            'circle-stroke-color': '#ff806d',
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.8,
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

        hasLoadedRef.current = true;
        onMapReady?.();
      });
    }

    void createMap();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      hasLoadedRef.current = false;
    };
  }, [onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasLoadedRef.current) return;

    if (timelineIdentityRef.current !== timeline) {
      timelineIdentityRef.current = timeline;
      initialFitRef.current = false;
    }

    const routeSource = map.getSource('timeline-routes') as GeoJSONSource | undefined;
    const visitSource = map.getSource('timeline-visits') as GeoJSONSource | undefined;
    const heatSource = map.getSource('timeline-heat') as GeoJSONSource | undefined;
    const replayRouteSource = map.getSource('timeline-playback-route') as GeoJSONSource | undefined;
    const replayPointSource = map.getSource('timeline-playback-point') as GeoJSONSource | undefined;
    routeSource?.setData(timeline.routes as any);
    visitSource?.setData(timeline.visits as any);
    heatSource?.setData(timeline.heatPoints as any);
    replayRouteSource?.setData(playbackSources.route as any);
    replayPointSource?.setData(playbackSources.point as any);

    const modeFilter: any = selectedModes.length > 0
      ? ['match', ['get', 'mode'], selectedModes, true, false]
      : ['==', ['get', 'mode'], '__none__'];
    map.setFilter('timeline-route', modeFilter);
    map.setFilter('timeline-route-glow', modeFilter);
    map.setFilter('timeline-heat-movement', modeFilter);
    map.setFilter('timeline-heat-dwell', modeFilter);

    const routeVisible = viewMode === 'all' || viewMode === 'replay';
    const replayVisible = viewMode === 'replay';
    const heatVisible = viewMode === 'heatmap';
    map.setLayoutProperty('timeline-route', 'visibility', routeVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-route-glow', 'visibility', routeVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-playback-route', 'visibility', replayVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-playback-point', 'visibility', replayVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-heat-movement', 'visibility', heatVisible && heatMode === 'movement' ? 'visible' : 'none');
    map.setLayoutProperty('timeline-heat-dwell', 'visibility', heatVisible && heatMode === 'dwell' ? 'visible' : 'none');
    map.setLayoutProperty('timeline-visits', 'visibility', showVisits ? 'visible' : 'none');

    if (!initialFitRef.current && timeline.routes.features.length > 0) {
      const points = timeline.routes.features.flatMap((feature) => feature.geometry.coordinates);
      const first = points[0];
      const last = points[points.length - 1];
      if (first && last) {
        const lngs = points.map((point) => point[0]);
        const lats = points.map((point) => point[1]);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 140, bottom: 180, left: 320, right: 80 }, maxZoom: 4.2, duration: 1200 });
        initialFitRef.current = true;
      }
    }
  }, [timeline, playbackSources, viewMode, heatMode, selectedModes, showVisits]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasLoadedRef.current || !autoRotate) return;
    let frame = 0;
    let last = performance.now();
    const rotate = (now: number) => {
      if (now - last > 70 && !map.isMoving()) {
        map.rotateTo(map.getBearing() + 0.18, { duration: 0 });
        last = now;
      }
      frame = requestAnimationFrame(rotate);
    };
    frame = requestAnimationFrame(rotate);
    return () => cancelAnimationFrame(frame);
  }, [autoRotate]);

  return <div ref={containerRef} className="globe-canvas" aria-label="Interactive 3D globe showing your timeline" />;
}

export function pointAtProgress(timeline: NormalizedTimeline, progress: number): Point | undefined {
  if (timeline.playback.length === 0) return undefined;
  return timeline.playback[Math.max(0, Math.min(timeline.playback.length - 1, Math.floor(progress * (timeline.playback.length - 1))))];
}
