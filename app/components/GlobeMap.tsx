/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import type { ModeKey, NormalizedTimeline, Point } from '../timeline';

export type GlobeViewMode = 'all' | 'replay' | 'heatmap' | 'stats';
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
  onFocusRange?: (fromDate: string, toDate: string) => void;
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

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? '';
const CARTO_DARK_TILES = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
];

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    cartoDark: {
      type: 'raster',
      tiles: CARTO_DARK_TILES,
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
    ...(MAPBOX_ACCESS_TOKEN ? {
      mapboxDark: {
        type: 'raster' as const,
        tiles: [`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(MAPBOX_ACCESS_TOKEN)}`],
        tileSize: 256,
        attribution: '&copy; Mapbox &copy; OpenStreetMap',
      },
    } : {}),
  },
  layers: [
    {
      id: 'basemap',
      type: 'raster',
      source: MAPBOX_ACCESS_TOKEN ? 'mapboxDark' : 'cartoDark',
      paint: { 'raster-opacity': 0.78, 'raster-saturation': -0.3, 'raster-contrast': 0.12 },
    },
  ],
  projection: { type: 'globe' },
};

const emptyCollection = { type: 'FeatureCollection' as const, features: [] };
const DAY_MS = 24 * 60 * 60 * 1000;

type MapDetail = {
  kind: 'route' | 'visit';
  coordinate: [number, number];
  screenX: number;
  screenY: number;
  placement: 'above' | 'below';
  start: number;
  end: number;
  mode?: ModeKey;
  distanceMeters?: number;
  durationMinutes?: number;
};

const MODE_LABELS: Record<ModeKey, string> = {
  drive: 'Driving',
  walk: 'Walking',
  cycle: 'Cycling',
  transit: 'Transit',
  flight: 'Flying',
  water: 'Water',
  other: 'Other',
};

function finiteNumber(value: unknown): number | undefined {
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

function formatDetailRange(start: number, end: number) {
  if (!Number.isFinite(start)) return 'Time unavailable';
  if (!Number.isFinite(end) || end <= start || end - start < 60_000) return formatDetailTime(start);
  return `${formatDetailTime(start)} → ${formatDetailTime(end)}`;
}

function formatDetailDistance(meters?: number) {
  if (!Number.isFinite(meters) || !meters || meters <= 0) return 'Not available';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters >= 100_000 ? 0 : 1)} km`;
}

function formatDetailDuration(minutes?: number) {
  if (!Number.isFinite(minutes) || !minutes || minutes <= 0) return 'Not available';
  if (minutes >= 1440) return `${(minutes / 1440).toFixed(1)} days`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} hrs`;
  return `${Math.round(minutes)} min`;
}

function startOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dateInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function positionForDetail(map: MapLibreMap, coordinate: [number, number]) {
  const projected = map.project(coordinate);
  const width = map.getContainer().clientWidth;
  const height = map.getContainer().clientHeight;
  return {
    screenX: Math.min(Math.max(projected.x, 18), Math.max(18, width - 18)),
    screenY: Math.min(Math.max(projected.y, 18), Math.max(18, height - 18)),
    placement: projected.y < 170 ? 'below' as const : 'above' as const,
  };
}

function sourceData(timeline: NormalizedTimeline, playbackProgress: number, selectedModes: ModeKey[]) {
  const playbackIndex = Math.max(0, Math.min(timeline.playback.length - 1, Math.floor(playbackProgress * Math.max(0, timeline.playback.length - 1))));
  const selected = new Set(selectedModes);
  const activePoints = timeline.playback.slice(0, playbackIndex + 1);
  const routeFeatures: Array<{ type: 'Feature'; geometry: { type: 'LineString'; coordinates: [number, number][] }; properties: Record<string, never> }> = [];
  let segment: Point[] = [];
  const flushSegment = () => {
    if (segment.length > 1) {
      routeFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: segment.map((point) => [point.lng, point.lat]) },
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
  const route = routeFeatures.length > 0
    ? { type: 'FeatureCollection', features: routeFeatures }
    : emptyCollection;
  const point = currentPoint && selected.has(currentPoint.mode ?? 'other')
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [currentPoint.lng, currentPoint.lat] }, properties: {} }],
      }
    : emptyCollection;

  return { route, point };
}

export default function GlobeMap({ timeline, viewMode, heatMode, selectedModes, showVisits, playbackProgress, autoRotate, onMapReady, onFocusRange }: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hasLoadedRef = useRef(false);
  const initialFitRef = useRef(false);
  const timelineIdentityRef = useRef(timeline);
  const viewModeRef = useRef(viewMode);
  const selectedAnchorRef = useRef<[number, number] | null>(null);
  const onFocusRangeRef = useRef(onFocusRange);
  const [selectedDetail, setSelectedDetail] = useState<MapDetail | null>(null);

  const playbackSources = useMemo(() => sourceData(timeline, playbackProgress, selectedModes), [timeline, playbackProgress, selectedModes]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    onFocusRangeRef.current = onFocusRange;
  }, [onFocusRange]);

  useEffect(() => {
    let disposed = false;

    async function createMap() {
      if (!containerRef.current) return;
      const maplibreModule = await import('maplibre-gl');
      const maplibregl = 'Map' in maplibreModule
        ? maplibreModule
        : (maplibreModule as unknown as { default: typeof maplibreModule }).default;
      if (disposed || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [10, 40],
        zoom: 1.45,
        pitch: 0,
        bearing: 0,
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
          id: 'timeline-route-hit',
          type: 'line',
          source: 'timeline-routes',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': 14, 'line-opacity': 0.001 },
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

        const syncDetailPosition = () => {
          const coordinate = selectedAnchorRef.current;
          if (!coordinate) return;
          setSelectedDetail((current) => current ? { ...current, ...positionForDetail(map, coordinate) } : current);
        };

        const closeDetail = () => {
          selectedAnchorRef.current = null;
          setSelectedDetail(null);
        };

        const handleMapClick = (event: any) => {
          if (viewModeRef.current !== 'all') return;
          const features = map.queryRenderedFeatures(event.point, {
            layers: ['timeline-visits', 'timeline-route-hit', 'timeline-route'],
          });
          const feature = features.find((candidate: any) => candidate.layer?.id === 'timeline-visits')
            ?? features.find((candidate: any) => candidate.layer?.id === 'timeline-route-hit' || candidate.layer?.id === 'timeline-route');
          if (!feature) {
            closeDetail();
            return;
          }

          const properties = feature.properties ?? {};
          const kind: MapDetail['kind'] = feature.layer?.id === 'timeline-visits' ? 'visit' : 'route';
          const coordinate = event.lngLat.toArray() as [number, number];
          const start = finiteNumber(properties.start) ?? Number.NaN;
          const end = finiteNumber(properties.end) ?? start;
          const mode = typeof properties.mode === 'string' && properties.mode in ROUTE_COLORS
            ? properties.mode as ModeKey
            : undefined;
          const position = positionForDetail(map, coordinate);

          selectedAnchorRef.current = coordinate;
          setSelectedDetail({
            kind,
            coordinate,
            start,
            end,
            mode,
            distanceMeters: finiteNumber(properties.distanceMeters),
            durationMinutes: finiteNumber(properties.durationMinutes),
            ...position,
          });
        };

        const handleMapMove = (event: any) => {
          if (viewModeRef.current !== 'all') {
            map.getCanvas().style.cursor = '';
            return;
          }
          const features = map.queryRenderedFeatures(event.point, {
            layers: ['timeline-visits', 'timeline-route-hit', 'timeline-route'],
          });
          map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
        };

        map.on('click', handleMapClick);
        map.on('mousemove', handleMapMove);
        map.on('mouseout', () => { map.getCanvas().style.cursor = ''; });
        map.on('move', syncDetailPosition);
        map.on('resize', syncDetailPosition);

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
    map.setFilter('timeline-route-hit', modeFilter);
    map.setFilter('timeline-heat-movement', modeFilter);
    map.setFilter('timeline-heat-dwell', modeFilter);

    const routeVisible = viewMode === 'all';
    const replayVisible = viewMode === 'replay';
    const heatVisible = viewMode === 'heatmap';
    map.setLayoutProperty('timeline-route', 'visibility', routeVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-route-glow', 'visibility', routeVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-route-hit', 'visibility', routeVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-playback-route', 'visibility', replayVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-playback-point', 'visibility', replayVisible ? 'visible' : 'none');
    map.setLayoutProperty('timeline-heat-movement', 'visibility', heatVisible && heatMode === 'movement' ? 'visible' : 'none');
    map.setLayoutProperty('timeline-heat-dwell', 'visibility', heatVisible && heatMode === 'dwell' ? 'visible' : 'none');
    map.setLayoutProperty('timeline-visits', 'visibility', showVisits ? 'visible' : 'none');

    if (!initialFitRef.current && (timeline.routes.features.length > 0 || timeline.visits.features.length > 0)) {
      const points = timeline.routes.features.length > 0
        ? timeline.routes.features.flatMap((feature) => feature.geometry.coordinates)
        : timeline.visits.features.map((feature) => feature.geometry.coordinates);
      const first = points[0];
      const last = points[points.length - 1];
      if (first && last) {
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
        const isMobile = window.matchMedia('(max-width: 760px)').matches;
        const padding = isMobile
          ? { top: 84, bottom: 410, left: 24, right: 24 }
          : { top: 140, bottom: 180, left: 320, right: 80 };
        map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding, maxZoom: 4.2, duration: 1200 });
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasLoadedRef.current || viewMode !== 'replay' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const pulse = (now: number) => {
      if (!map.getLayer('timeline-playback-point')) return;
      const wave = (Math.sin(now / 520) + 1) / 2;
      map.setPaintProperty('timeline-playback-point', 'circle-radius', 5.5 + wave * 2.5);
      map.setPaintProperty('timeline-playback-point', 'circle-opacity', 0.84 + wave * 0.16);
      frame = requestAnimationFrame(pulse);
    };
    frame = requestAnimationFrame(pulse);
    return () => {
      cancelAnimationFrame(frame);
      if (map.getLayer('timeline-playback-point')) {
        map.setPaintProperty('timeline-playback-point', 'circle-radius', 6);
        map.setPaintProperty('timeline-playback-point', 'circle-opacity', 1);
      }
    };
  }, [viewMode]);

  function closeSelectedDetail() {
    selectedAnchorRef.current = null;
    setSelectedDetail(null);
  }

  function focusSelectedDetail(radiusDays: number) {
    if (!selectedDetail || !Number.isFinite(selectedDetail.start)) return;
    const selectedDay = startOfUtcDay(selectedDetail.start);
    const fromDate = dateInputValue(selectedDay - radiusDays * DAY_MS);
    const toDate = dateInputValue(selectedDay + radiusDays * DAY_MS);
    closeSelectedDetail();
    onFocusRangeRef.current?.(fromDate, toDate);
  }

  const detailTitle = selectedDetail?.kind === 'route'
    ? `${MODE_LABELS[selectedDetail.mode ?? 'other']} route`
    : 'Place visit';
  const detailMetricLabel = selectedDetail?.kind === 'route' ? 'DISTANCE' : 'TIME THERE';
  const detailMetricValue = selectedDetail
    ? selectedDetail.kind === 'route'
      ? formatDetailDistance(selectedDetail.distanceMeters)
      : formatDetailDuration(selectedDetail.durationMinutes ?? ((selectedDetail.end - selectedDetail.start) / 60_000))
    : '';

  return (
    <div className="globe-layer">
      <div ref={containerRef} className="globe-canvas" aria-label="Interactive 3D globe showing your timeline" />
      {viewMode === 'all' && selectedDetail && (
        <>
          <span
            className={`map-detail-anchor ${selectedDetail.kind}`}
            style={{ left: selectedDetail.screenX, top: selectedDetail.screenY }}
            aria-hidden="true"
          />
          <aside
            className={`map-detail-popup ${selectedDetail.placement}`}
            style={{ left: selectedDetail.screenX, top: selectedDetail.screenY }}
            aria-label={`${detailTitle} details`}
          >
            <button className="map-detail-close" type="button" onClick={closeSelectedDetail} aria-label="Close map detail">×</button>
            <span className="map-detail-type">{selectedDetail.kind === 'route' ? 'ROUTE SEGMENT' : 'VISIT'}</span>
            <h3>{detailTitle}</h3>
            <p className="map-detail-time">{formatDetailRange(selectedDetail.start, selectedDetail.end)}</p>
            <div className="map-detail-stats">
              <span><small>{detailMetricLabel}</small><strong>{detailMetricValue}</strong></span>
              <span><small>POINT</small><strong>{selectedDetail.coordinate[1].toFixed(2)}°, {selectedDetail.coordinate[0].toFixed(2)}°</strong></span>
            </div>
            <div className="map-detail-actions">
              <button type="button" onClick={() => focusSelectedDetail(0)} disabled={!Number.isFinite(selectedDetail.start)}>This day</button>
              <button type="button" onClick={() => focusSelectedDetail(2)} disabled={!Number.isFinite(selectedDetail.start)}>±2 days</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export function pointAtProgress(timeline: NormalizedTimeline, progress: number): Point | undefined {
  if (timeline.playback.length === 0) return undefined;
  return timeline.playback[Math.max(0, Math.min(timeline.playback.length - 1, Math.floor(progress * (timeline.playback.length - 1))))];
}
