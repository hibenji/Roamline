'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  MapMouseEvent,
  FilterSpecification,
} from 'maplibre-gl';
import { MODE_LABELS, type ModeKey } from '../lib/modes';
import { DAY_MS, dateInputValue, startOfUtcDay } from '../lib/time';
import type { NormalizedTimeline } from '../timeline';
import {
  CONNECTED_ROUTE_LAYER_IDS,
  MAP_INTERACTIVE_LAYER_IDS,
  MAP_STYLE,
  ROUTE_COLORS,
} from '../map/config';
import { boundsForTimeline, sequentialRouteData, sourceData } from '../map/data';
import {
  finiteNumber,
  formatDetailDistance,
  formatDetailRange,
  positionForDetail,
  type MapDetail,
} from '../map/detail';
import { addTimelineSourcesAndLayers } from '../map/layers';

export type GlobeViewMode = 'all' | 'replay' | 'heatmap' | 'stats';
export type HeatViewMode = 'dwell' | 'movement';

type GlobeMapProps = {
  timeline: NormalizedTimeline;
  viewMode: GlobeViewMode;
  heatMode: HeatViewMode;
  selectedModes: ModeKey[];
  connectSequential: boolean;
  playbackProgress: number;
  autoRotate: boolean;
  onMapReady?: () => void;
  onFocusRange?: (fromDate: string, toDate: string) => void;
};

const globeFadeEase = [0.22, 1, 0.36, 1] as const;

export default function GlobeMap({
  timeline,
  viewMode,
  heatMode,
  selectedModes,
  connectSequential,
  playbackProgress,
  autoRotate,
  onMapReady,
  onFocusRange,
}: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hasLoadedRef = useRef(false);
  const initialFitRef = useRef(false);
  const timelineIdentityRef = useRef(timeline);
  const viewModeRef = useRef(viewMode);
  const selectedAnchorRef = useRef<[number, number] | null>(null);
  const onFocusRangeRef = useRef(onFocusRange);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<MapDetail | null>(null);

  const playbackSources = useMemo(
    () => sourceData(timeline, playbackProgress, selectedModes),
    [timeline, playbackProgress, selectedModes],
  );
  const sequentialRoute = useMemo(
    () => sequentialRouteData(timeline, selectedModes),
    [timeline, selectedModes],
  );

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    onFocusRangeRef.current = onFocusRange;
  }, [onFocusRange]);

  useEffect(() => {
    let disposed = false;
    let mapResizeObserver: ResizeObserver | null = null;
    let controlResizeObserver: ResizeObserver | null = null;
    let syncMobilePadding: (() => void) | null = null;

    async function createMap() {
      if (!containerRef.current) return;
      const maplibreModule = await import('maplibre-gl');
      const maplibregl =
        'Map' in maplibreModule
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
      syncMobilePadding = () => {
        const isMobile = window.matchMedia('(max-width: 760px)').matches;
        const controls = document.querySelector<HTMLElement>('.layer-panel');
        const topbar = document.querySelector<HTMLElement>('.topbar');
        const padding =
          isMobile && controls
            ? {
                top: topbar?.getBoundingClientRect().height ?? 66,
                bottom: controls.getBoundingClientRect().height + 37,
                left: 0,
                right: 0,
              }
            : { top: 0, bottom: 0, left: 0, right: 0 };
        map.setPadding(padding);
      };

      if (typeof ResizeObserver !== 'undefined') {
        mapResizeObserver = new ResizeObserver(() => {
          if (!disposed) map.resize();
        });
        mapResizeObserver.observe(containerRef.current);
        const controls = document.querySelector<HTMLElement>('.layer-panel');
        if (controls) {
          controlResizeObserver = new ResizeObserver(syncMobilePadding);
          controlResizeObserver.observe(controls);
        }
      }
      window.addEventListener('resize', syncMobilePadding);
      syncMobilePadding();

      map.on('load', () => {
        if (disposed) return;
        addTimelineSourcesAndLayers(map);

        const syncDetailPosition = () => {
          const coordinate = selectedAnchorRef.current;
          if (!coordinate) return;
          setSelectedDetail((current) =>
            current ? { ...current, ...positionForDetail(map, coordinate) } : current,
          );
        };

        const closeDetail = () => {
          selectedAnchorRef.current = null;
          setSelectedDetail(null);
        };

        const handleMapClick = (event: MapMouseEvent) => {
          if (viewModeRef.current !== 'all') return;
          const features = map.queryRenderedFeatures(event.point, {
            layers: MAP_INTERACTIVE_LAYER_IDS,
          });
          const feature =
            features.find(
              (candidate: MapGeoJSONFeature) =>
                candidate.layer?.id === 'timeline-route-hit' ||
                candidate.layer?.id === 'timeline-route',
            ) ??
            features.find((candidate: MapGeoJSONFeature) =>
              CONNECTED_ROUTE_LAYER_IDS.includes(candidate.layer?.id ?? ''),
            );
          if (!feature) {
            closeDetail();
            return;
          }

          const properties = feature.properties ?? {};
          const coordinate = event.lngLat.toArray() as [number, number];
          const start = finiteNumber(properties.start) ?? Number.NaN;
          const end = finiteNumber(properties.end) ?? start;
          const mode =
            typeof properties.mode === 'string' && properties.mode in ROUTE_COLORS
              ? (properties.mode as ModeKey)
              : undefined;
          const position = positionForDetail(map, coordinate);

          selectedAnchorRef.current = coordinate;
          setSelectedDetail({
            coordinate,
            start,
            end,
            mode,
            distanceMeters: finiteNumber(properties.distanceMeters),
            ...position,
          });
        };

        const handleMapMove = (event: MapMouseEvent) => {
          if (viewModeRef.current !== 'all') {
            map.getCanvas().style.cursor = '';
            return;
          }
          const features = map.queryRenderedFeatures(event.point, {
            layers: MAP_INTERACTIVE_LAYER_IDS,
          });
          map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
        };

        map.on('click', handleMapClick);
        map.on('mousemove', handleMapMove);
        map.on('mouseout', () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('move', syncDetailPosition);
        map.on('resize', syncDetailPosition);

        hasLoadedRef.current = true;
        setIsMapLoaded(true);
        onMapReady?.();
      });
    }

    void createMap();
    return () => {
      disposed = true;
      mapResizeObserver?.disconnect();
      controlResizeObserver?.disconnect();
      if (syncMobilePadding) window.removeEventListener('resize', syncMobilePadding);
      mapRef.current?.remove();
      mapRef.current = null;
      hasLoadedRef.current = false;
      setIsMapLoaded(false);
    };
  }, [onMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !hasLoadedRef.current) return;

    if (timelineIdentityRef.current !== timeline) {
      timelineIdentityRef.current = timeline;
      initialFitRef.current = false;
    }

    const routeSource = map.getSource('timeline-routes') as GeoJSONSource | undefined;
    const heatSource = map.getSource('timeline-heat') as GeoJSONSource | undefined;
    const replayRouteSource = map.getSource('timeline-playback-route') as GeoJSONSource | undefined;
    const replayPointSource = map.getSource('timeline-playback-point') as GeoJSONSource | undefined;
    const connectedRouteSource = map.getSource('timeline-connected-route') as
      GeoJSONSource | undefined;
    routeSource?.setData(timeline.routes as unknown as GeoJSON.GeoJSON);
    heatSource?.setData(timeline.heatPoints as unknown as GeoJSON.GeoJSON);
    replayRouteSource?.setData(playbackSources.route as unknown as GeoJSON.GeoJSON);
    replayPointSource?.setData(playbackSources.point as unknown as GeoJSON.GeoJSON);
    connectedRouteSource?.setData(sequentialRoute as unknown as GeoJSON.GeoJSON);

    const modeFilter: FilterSpecification =
      selectedModes.length > 0
        ? (['match', ['get', 'mode'], selectedModes, true, false] as FilterSpecification)
        : (['==', ['get', 'mode'], '__none__'] as FilterSpecification);
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
    for (const layerId of CONNECTED_ROUTE_LAYER_IDS) {
      map.setLayoutProperty(
        layerId,
        'visibility',
        routeVisible && connectSequential ? 'visible' : 'none',
      );
    }
    map.setLayoutProperty(
      'timeline-playback-route',
      'visibility',
      replayVisible ? 'visible' : 'none',
    );
    map.setLayoutProperty(
      'timeline-playback-point',
      'visibility',
      replayVisible ? 'visible' : 'none',
    );
    map.setLayoutProperty(
      'timeline-heat-movement',
      'visibility',
      heatVisible && heatMode === 'movement' ? 'visible' : 'none',
    );
    map.setLayoutProperty(
      'timeline-heat-dwell',
      'visibility',
      heatVisible && heatMode === 'dwell' ? 'visible' : 'none',
    );

    if (!initialFitRef.current) {
      const bounds = boundsForTimeline(timeline);
      if (bounds) {
        const isMobile = window.matchMedia('(max-width: 760px)').matches;
        const padding = isMobile
          ? { top: 16, bottom: 16, left: 24, right: 24 }
          : { top: 140, bottom: 180, left: 320, right: 80 };
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          { padding, maxZoom: 4.2, duration: 1200 },
        );
        initialFitRef.current = true;
      }
    }
  }, [
    timeline,
    playbackSources,
    sequentialRoute,
    viewMode,
    heatMode,
    selectedModes,
    connectSequential,
    isMapLoaded,
  ]);

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
    if (
      !map ||
      !hasLoadedRef.current ||
      viewMode !== 'replay' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
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

  const detailTitle = selectedDetail ? `${MODE_LABELS[selectedDetail.mode ?? 'other']} route` : '';
  const detailMetricValue = selectedDetail
    ? formatDetailDistance(selectedDetail.distanceMeters)
    : '';

  return (
    <div className="globe-layer">
      <motion.div
        ref={containerRef}
        className="globe-canvas"
        animate={{ opacity: viewMode === 'stats' ? 0.24 : 1 }}
        transition={{ duration: 0.55, ease: globeFadeEase }}
        aria-label="Interactive 3D globe showing your timeline"
      />
      <AnimatePresence initial={false}>
        {viewMode === 'all' && selectedDetail && (
          <>
            <motion.span
              key={`${selectedDetail.start}-anchor`}
              className="map-detail-anchor"
              style={{ left: selectedDetail.screenX, top: selectedDetail.screenY }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: [0.72, 1, 0.72], scale: [0.86, 1.16, 0.86] }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
              aria-hidden="true"
            />
            <motion.aside
              key={`${selectedDetail.start}-popup`}
              className={`map-detail-popup ${selectedDetail.placement}`}
              style={{ left: selectedDetail.screenX, top: selectedDetail.screenY }}
              layout
              initial={{
                opacity: 0,
                scale: 0.92,
                y: selectedDetail.placement === 'above' ? 13 : -13,
              }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{
                opacity: 0,
                scale: 0.92,
                y: selectedDetail.placement === 'above' ? 13 : -13,
              }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              aria-label={`${detailTitle} details`}
            >
              <button
                className="map-detail-close"
                type="button"
                onClick={closeSelectedDetail}
                aria-label="Close map detail"
              >
                ×
              </button>
              <span className="map-detail-type">ROUTE SEGMENT</span>
              <h3>{detailTitle}</h3>
              <p className="map-detail-time">
                {formatDetailRange(selectedDetail.start, selectedDetail.end)}
              </p>
              <div className="map-detail-stats">
                <span>
                  <small>DISTANCE</small>
                  <strong>{detailMetricValue}</strong>
                </span>
                <span>
                  <small>POINT</small>
                  <strong>
                    {selectedDetail.coordinate[1].toFixed(2)}°,{' '}
                    {selectedDetail.coordinate[0].toFixed(2)}°
                  </strong>
                </span>
              </div>
              <div className="map-detail-actions">
                <button
                  type="button"
                  onClick={() => focusSelectedDetail(0)}
                  disabled={!Number.isFinite(selectedDetail.start)}
                >
                  This day
                </button>
                <button
                  type="button"
                  onClick={() => focusSelectedDetail(2)}
                  disabled={!Number.isFinite(selectedDetail.start)}
                >
                  ±2 days
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export { pointAtProgress } from '../map/data';
