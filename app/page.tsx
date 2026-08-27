'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import GlobeMap, { pointAtProgress, type GlobeViewMode, type HeatViewMode } from './components/GlobeMap';
import StatsView from './components/StatsView';
import TimelineWorker from './timeline.worker?worker';
import {
  createDemoTimeline,
  filterTimelineByDateRange,
  type ModeKey,
  type NormalizedTimeline,
  type TimelineWorkerMessage,
} from './timeline';

const MODES: Array<{ key: ModeKey; label: string; short: string }> = [
  { key: 'drive', label: 'Driving', short: 'Drive' },
  { key: 'walk', label: 'Walking', short: 'Walk' },
  { key: 'cycle', label: 'Cycling', short: 'Cycle' },
  { key: 'transit', label: 'Transit', short: 'Transit' },
  { key: 'flight', label: 'Flying', short: 'Flight' },
  { key: 'water', label: 'Water', short: 'Water' },
  { key: 'other', label: 'Other', short: 'Other' },
];

const modeColors: Record<ModeKey, string> = {
  drive: '#df563e',
  walk: '#3c9b61',
  cycle: '#dda11c',
  transit: '#4387bb',
  flight: '#8058b4',
  water: '#299a98',
  other: '#68727c',
};

const motionEase = [0.22, 1, 0.36, 1] as const;
const panelTransition = { duration: 0.65, ease: motionEase };
const statsReturnTransition = { duration: 0.58, ease: motionEase };
const timelineReturnTransition = { ...statsReturnTransition, opacity: { duration: 0.46, ease: 'linear' as const } };
const layerLayoutTransition = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

function formatDate(timestamp: number, includeYear = true) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: includeYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(timestamp);
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${km.toFixed(km < 100 ? 1 : 0)} km`;
}

function formatCount(value: number) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function isJsonFile(file: File) {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}

function formatRangeDate(value: string, fallback: string) {
  if (!value) return fallback;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? formatDate(timestamp) : fallback;
}

export default function Home() {
  const [timeline, setTimeline] = useState<NormalizedTimeline>(() => createDemoTimeline());
  const [viewMode, setViewMode] = useState<GlobeViewMode>('all');
  const [heatMode, setHeatMode] = useState<HeatViewMode>('dwell');
  const [selectedModes, setSelectedModes] = useState<ModeKey[]>(MODES.map((mode) => mode.key));
  const [connectSequential, setConnectSequential] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [fromDate, setFromDate] = useState('2022-01-01');
  const [toDate, setToDate] = useState('');
  const [rangeFocusActive, setRangeFocusActive] = useState(false);
  const [previousRange, setPreviousRange] = useState<{ fromDate: string; toDate: string } | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [dragActive, setDragActive] = useState(false);
  const [loadState, setLoadState] = useState<'demo' | 'ready' | 'reading' | 'error'>('demo');
  const [loadLabel, setLoadLabel] = useState('Synthetic demo · 4 days');
  const [loadMessage, setLoadMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [layerPanelTop, setLayerPanelTop] = useState<number | null>(null);
  const [timelineDockHeight, setTimelineDockHeight] = useState<number | null>(null);
  const [isReturningFromStats, setIsReturningFromStats] = useState(false);
  const [restoredLayerPanelSnapshot, setRestoredLayerPanelSnapshot] = useState<{ panelHeight: number; headingHeight: number; settingsHeight: number } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const layerPanelRef = useRef<HTMLElement | null>(null);
  const layerHeadingRef = useRef<HTMLDivElement | null>(null);
  const layerSettingsRef = useRef<HTMLDivElement | null>(null);
  const timelineDockRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef(playbackProgress);
  const prefersReducedMotionRef = useRef(false);

  const handleMapReady = useCallback(() => setMapReady(true), []);

  useEffect(() => {
    progressRef.current = playbackProgress;
  }, [playbackProgress]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = media.matches;
    const handleChange = () => {
      prefersReducedMotionRef.current = media.matches;
    };
    media.addEventListener?.('change', handleChange);
    return () => {
      media.removeEventListener?.('change', handleChange);
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const handleChange = () => {
      setIsMobileViewport(media.matches);
      setLayerPanelTop(null);
    };
    handleChange();
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  useLayoutEffect(() => {
    const dock = timelineDockRef.current;
    if (!dock) return;

    const updateDockHeight = () => setTimelineDockHeight(dock.getBoundingClientRect().height);
    updateDockHeight();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(updateDockHeight);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let last = performance.now();
    const totalDuration = prefersReducedMotionRef.current ? 56000 : 44000;

    const tick = (now: number) => {
      const delta = Math.max(0, now - last);
      last = now;
      const next = progressRef.current + (delta / totalDuration) * speed;
      if (next >= 1) {
        progressRef.current = 1;
        setPlaybackProgress(1);
        setIsPlaying(false);
        return;
      }
      progressRef.current = next;
      setPlaybackProgress(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, speed]);

  const rangeError = Boolean(fromDate && toDate && fromDate > toDate);
  const visibleTimeline = useMemo(
    () => rangeError ? timeline : filterTimelineByDateRange(timeline, fromDate || undefined, toDate || undefined),
    [timeline, fromDate, toDate, rangeError],
  );
  const currentPoint = useMemo(() => pointAtProgress(visibleTimeline, playbackProgress), [visibleTimeline, playbackProgress]);
  const currentDate = currentPoint?.time ?? visibleTimeline.coverage.end;
  const rangeLabel = `${formatRangeDate(fromDate, 'Beginning')} → ${formatRangeDate(toDate, 'Latest')}`;
  const rangeHasData = visibleTimeline.playback.length > 0 || visibleTimeline.routes.features.length > 0 || visibleTimeline.visits.features.length > 0;
  const allModesSelected = selectedModes.length === MODES.length;
  const isMobileStats = isMobileViewport && viewMode === 'stats';

  const focusMapDateRange = useCallback((nextFromDate: string, nextToDate: string) => {
    setPreviousRange({ fromDate, toDate });
    setFromDate(nextFromDate);
    setToDate(nextToDate);
    setRangeFocusActive(true);
    setIsReturningFromStats(viewMode === 'stats');
    setViewMode('all');
    setIsPlaying(false);
    progressRef.current = 1;
    setPlaybackProgress(1);
  }, [fromDate, toDate, viewMode]);

  function rememberLayerPanelSize() {
    if (!isMobileViewport || viewMode === 'stats' || !layerPanelRef.current || !layerHeadingRef.current || !layerSettingsRef.current) return;
    setRestoredLayerPanelSnapshot({
      panelHeight: layerPanelRef.current.getBoundingClientRect().height,
      headingHeight: layerHeadingRef.current.getBoundingClientRect().height,
      settingsHeight: layerSettingsRef.current.getBoundingClientRect().height,
    });
  }

  function clearDateRange() {
    setFromDate('');
    setToDate('');
    setRangeFocusActive(false);
    setPreviousRange(null);
  }

  function goBackFromFocusedRange() {
    if (previousRange) {
      setFromDate(previousRange.fromDate);
      setToDate(previousRange.toDate);
    }
    setRangeFocusActive(false);
    setPreviousRange(null);
  }

  function chooseView(nextMode: GlobeViewMode) {
    if (nextMode === 'stats' && viewMode !== 'stats') rememberLayerPanelSize();
    if (nextMode !== 'stats' && viewMode !== 'stats') setRestoredLayerPanelSnapshot(null);
    if (nextMode === 'stats' || viewMode === 'stats') {
      setLayerPanelTop(null);
    } else if (isMobileViewport && nextMode !== viewMode && layerPanelRef.current) {
      setLayerPanelTop(layerPanelRef.current.getBoundingClientRect().top);
    }
    setIsReturningFromStats(viewMode === 'stats' && nextMode !== 'stats');
    setViewMode(nextMode);
    setIsPlaying(false);
    if (nextMode === 'replay' && playbackProgress >= 1) {
      progressRef.current = 0;
      setPlaybackProgress(0);
    }
  }

  function toggleMode(mode: ModeKey) {
    setSelectedModes((current) => current.includes(mode) ? current.filter((value) => value !== mode) : [...current, mode]);
  }

  function resetDemo() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setTimeline(createDemoTimeline());
    setLoadState('demo');
    setLoadLabel('Synthetic demo · 4 days');
    setLoadMessage('');
    setFromDate('2022-01-01');
    setToDate('');
    setRangeFocusActive(false);
    setPreviousRange(null);
    setLayerPanelTop(null);
    setProgress(0);
    setIsReturningFromStats(viewMode === 'stats');
    setViewMode('all');
    setConnectSequential(true);
    progressRef.current = 1;
    setPlaybackProgress(1);
    setIsPlaying(false);
  }

  function parseFile(file: File) {
    if (!isJsonFile(file)) {
      setLoadState('error');
      setLoadMessage('Drop a Google Timeline JSON export to continue.');
      return;
    }

    workerRef.current?.terminate();
    const worker = new TimelineWorker();
    workerRef.current = worker;
    setLoadState('reading');
    setLoadLabel(file.name);
    setLoadMessage('Your file is being read locally.');
    setProgress(4);
    setIsPlaying(false);

    worker.onmessage = (event: MessageEvent<TimelineWorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') {
        setProgress(message.percent);
        setLoadMessage(message.label);
      }
      if (message.type === 'success') {
        setTimeline(message.data);
        setLoadState('ready');
        setLoadMessage('Loaded locally · nothing was uploaded');
        setProgress(100);
        setIsReturningFromStats(viewMode === 'stats');
        setViewMode('all');
        setRangeFocusActive(false);
        setPreviousRange(null);
        progressRef.current = 1;
        setPlaybackProgress(1);
        worker.terminate();
        workerRef.current = null;
      }
      if (message.type === 'error') {
        setLoadState('error');
        setLoadMessage(message.message);
        setProgress(0);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = () => {
      setLoadState('error');
      setLoadMessage('This export could not be parsed in the browser.');
      setProgress(0);
      worker.terminate();
      workerRef.current = null;
    };

    void file.arrayBuffer().then((buffer) => {
      worker.postMessage({ buffer }, [buffer]);
    }).catch(() => {
      setLoadState('error');
      setLoadMessage('The browser could not read that file.');
      worker.terminate();
      workerRef.current = null;
    });
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) parseFile(file);
    event.target.value = '';
  }

  const modeDescription = viewMode === 'all'
    ? 'Every route, one persistent layer'
    : viewMode === 'replay'
      ? 'Replay the shape of your days'
      : viewMode === 'stats'
      ? 'Patterns across your selected range'
      : heatMode === 'dwell'
        ? 'Brighter means more time spent'
        : 'Brighter means more route passages';

  return (
    <MotionConfig reducedMotion="user">
      <main className={`roamline-shell ${viewMode === 'stats' ? 'is-stats' : ''} ${loadState === 'ready' ? 'has-loaded-file' : ''}`}>
      <div className="atmosphere atmosphere-one" />
      <div className="atmosphere atmosphere-two" />

      <GlobeMap
        timeline={visibleTimeline}
        viewMode={viewMode}
        heatMode={heatMode}
        selectedModes={selectedModes}
        connectSequential={connectSequential}
        playbackProgress={playbackProgress}
        autoRotate={autoRotate}
        onMapReady={handleMapReady}
        onFocusRange={focusMapDateRange}
      />

      <motion.header className="topbar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={panelTransition}>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">ROAMLINE</span>
          <span className="brand-divider" />
          <span className="brand-caption">private location atlas</span>
        </div>
        <div className="topbar-actions">
          <span className={`connection-status ${mapReady ? 'is-ready' : ''}`}><motion.span animate={mapReady ? { opacity: [0.68, 1, 0.68], scale: [0.86, 1.16, 0.86] } : { opacity: 0.68, scale: 0.86 }} transition={{ duration: 2.4, ease: 'easeInOut', repeat: mapReady ? Infinity : 0 }} /> {mapReady ? 'globe online' : 'starting globe'}</span>
          <button className={`orbit-toggle ${autoRotate ? 'is-active' : ''}`} onClick={() => setAutoRotate((value) => !value)} type="button">
            <span aria-hidden="true">◌</span> {autoRotate ? 'Pause orbit' : 'Orbit globe'}
          </button>
          <button className="reset-button" onClick={resetDemo} type="button">Reset demo</button>
        </div>
      </motion.header>

      <motion.section className="control-panel intro-panel" initial={{ opacity: 0, y: 13 }} animate={{ opacity: 1, y: 0 }} transition={{ ...panelTransition, delay: 0.08 }}>
        <div className="eyebrow"><span className="eyebrow-dot" /> LOCATION MEMORY / 01</div>
        <h1>See the shape<br /><em>of your days.</em></h1>
        <p className="intro-copy">A quiet, visual record of everywhere you’ve been — orbit it, replay it, feel the patterns.</p>

        <div
          className={`dropzone ${dragActive ? 'is-dragging' : ''} ${loadState === 'reading' ? 'is-reading' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
          onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="Choose or drop a Google Timeline JSON export"
        >
          <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileChange} hidden />
          <span className="drop-icon" aria-hidden="true">↑</span>
          <span className="drop-copy">
            <strong>{loadState === 'reading' ? `Reading ${loadLabel}` : 'Drop your Timeline JSON'}</strong>
            <small>{loadState === 'reading' ? `${progress}% · ${loadMessage}` : 'or click to browse · stays on your device'}</small>
          </span>
        </div>

        {loadState === 'error' && <p className="error-message" role="alert">{loadMessage}</p>}
        {loadState !== 'error' && <div className="load-meta"><span className={`state-dot ${loadState}`} /> <span>{loadState === 'demo' ? 'Synthetic demo' : loadState === 'reading' ? loadMessage : loadLabel}</span><span className="local-chip">LOCAL ONLY</span></div>}
      </motion.section>

      <motion.section
        ref={layerPanelRef}
        className="control-panel layer-panel"
        initial={{ opacity: 0, y: 13 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...panelTransition, delay: isReturningFromStats ? 0 : 0.18 }}
        style={{
          '--timeline-dock-height': timelineDockHeight === null ? undefined : `${timelineDockHeight}px`,
          height: !isMobileStats && restoredLayerPanelSnapshot !== null ? restoredLayerPanelSnapshot.panelHeight : undefined,
          top: isMobileViewport && layerPanelTop !== null && !isMobileStats ? `${layerPanelTop}px` : undefined,
          bottom: isMobileViewport && layerPanelTop !== null && !isMobileStats ? 'auto' : undefined,
        } as CSSProperties}
      >
        <motion.div
          ref={layerHeadingRef}
          className="panel-heading"
          aria-hidden={isMobileStats}
          initial={false}
          animate={isMobileStats ? { height: 0, opacity: 0, y: -10 } : { height: restoredLayerPanelSnapshot?.headingHeight ?? 'auto', opacity: 1, y: 0 }}
          transition={isReturningFromStats ? statsReturnTransition : { height: panelTransition, opacity: { duration: 0.28 }, y: panelTransition }}
          style={{ overflow: 'hidden' }}
        >
          <div>
            <div className="eyebrow">VIEW LAYERS</div>
            <p>{modeDescription}</p>
          </div>
          <span className="layer-count">{formatCount(visibleTimeline.stats.routePointCount)} pts</span>
        </motion.div>
        <motion.div className="view-switcher-box" layout="position" transition={{ layout: isReturningFromStats ? statsReturnTransition : layerLayoutTransition }}>
          <div className="view-tabs" role="tablist" aria-label="Globe view">
            <motion.span
              className={`view-tab-active-bg view-tab-${viewMode}`}
              layout
              initial={false}
              transition={layerLayoutTransition}
              aria-hidden="true"
            />
            {([
              ['all', 'All activity', '◉'],
              ['replay', 'Replay', '▶'],
              ['heatmap', 'Heatmap', '◌'],
              ['stats', 'Stats', '✦'],
            ] as Array<[GlobeViewMode, string, string]>).map(([key, label, icon]) => (
              <motion.button
                key={key}
                className={`view-tab view-tab-${key} ${viewMode === key ? 'is-active' : ''}`}
                onClick={() => chooseView(key)}
                type="button"
                role="tab"
                aria-selected={viewMode === key}
                animate={{ color: viewMode === key ? '#fff4d0' : '#8d9aad' }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                whileTap={{ scale: 0.97 }}
              >
                <span className="view-tab-content"><span aria-hidden="true">{icon}</span>{label}</span>
              </motion.button>
            ))}
          </div>
        </motion.div>

        <motion.div
          ref={layerSettingsRef}
          className="layer-settings"
          aria-hidden={isMobileStats}
          inert={isMobileStats || undefined}
          initial={false}
          animate={isMobileStats ? { height: 0, opacity: 0, y: -10 } : { height: restoredLayerPanelSnapshot?.settingsHeight ?? 'auto', opacity: 1, y: 0 }}
          transition={isReturningFromStats ? statsReturnTransition : { height: panelTransition, opacity: { duration: 0.28 }, y: panelTransition }}
          style={{ overflow: isMobileStats ? 'hidden' : 'visible', pointerEvents: isMobileStats ? 'none' : 'auto' }}
        >
          <details className="range-details">
            <summary>
              <span className="range-summary-copy"><span className="range-summary-icon" aria-hidden="true">◷</span><span><strong>TIME RANGE</strong><small>{rangeLabel}</small></span></span>
              <span className="range-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div className="range-popover">
              <div className="range-fields">
                <label>From<input type="date" value={fromDate} onChange={(event) => { setFromDate(event.target.value); setRangeFocusActive(false); setPreviousRange(null); }} /></label>
                <label>To<input type="date" value={toDate} onChange={(event) => { setToDate(event.target.value); setRangeFocusActive(false); setPreviousRange(null); }} /></label>
              </div>
              <div className="range-actions"><button type="button" onClick={clearDateRange}>Full timeline</button><span>Default: since 2022</span></div>
              {rangeError && <p className="range-message" role="alert">End date must be on or after the start date.</p>}
              {!rangeError && !rangeHasData && <p className="range-message" role="status">No locations found in this range.</p>}
            </div>
          </details>

          <AnimatePresence initial={false}>
            {viewMode === 'heatmap' && (
              <motion.div
                className="heat-switch-drawer"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ height: { duration: 0.42, ease: motionEase }, opacity: { duration: 0.22, ease: 'linear' } }}
                style={{ overflow: 'hidden' }}
              >
                <div className="heat-switch" role="group" aria-label="Heatmap metric">
                  <button className={heatMode === 'dwell' ? 'is-active' : ''} onClick={() => setHeatMode('dwell')} type="button"><span className="heat-swatch dwell" />Time spent</button>
                  <button className={heatMode === 'movement' ? 'is-active' : ''} onClick={() => setHeatMode('movement')} type="button"><span className="heat-swatch movement" />Movement frequency</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="filter-heading"><span>ACTIVITY</span><button type="button" onClick={() => setSelectedModes(allModesSelected ? [] : MODES.map((mode) => mode.key))}>{allModesSelected ? 'Clear' : 'All modes'}</button></div>
          <div className="mode-filters">
            {MODES.map((mode) => (
              <button key={mode.key} className={`mode-pill ${selectedModes.includes(mode.key) ? 'is-selected' : ''}`} onClick={() => toggleMode(mode.key)} style={{ '--mode-color': modeColors[mode.key] } as CSSProperties} type="button">
                <span className="mode-dot" aria-hidden="true" />{mode.short}
              </button>
            ))}
          </div>
          <label className="toggle-row">
            <span><span className="toggle-icon" aria-hidden="true">↝</span> Connect timeline points</span>
            <input type="checkbox" checked={connectSequential} onChange={(event) => setConnectSequential(event.target.checked)} />
            <span className="toggle-track" aria-hidden="true"><span /></span>
          </label>
        </motion.div>
      </motion.section>

      <AnimatePresence initial={false}>
        {rangeFocusActive && (
        <motion.button className="range-back-button" type="button" onClick={goBackFromFocusedRange} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.26, ease: motionEase }}>
          <span aria-hidden="true">←</span> Back
        </motion.button>
        )}
      </AnimatePresence>

      <StatsView timeline={visibleTimeline} selectedModes={selectedModes} isVisible={viewMode === 'stats'} />

      <motion.section className="stats-panel" aria-label="Timeline summary" initial={{ opacity: 0, y: 13 }} animate={{ opacity: 1, y: 0 }} transition={{ ...panelTransition, delay: 0.3 }}>
        <div className="stats-intro"><span className="eyebrow">THE LONG VIEW</span><strong>{formatDate(visibleTimeline.coverage.start)} <span>→</span> {formatDate(visibleTimeline.coverage.end)}</strong></div>
        <div className="stat-item"><span>ACTIVE DAYS</span><strong>{formatCount(visibleTimeline.stats.activeDays)}</strong></div>
        <div className="stat-item"><span>DISTANCE</span><strong>{formatDistance(visibleTimeline.stats.distanceMeters)}</strong></div>
        <div className="stat-item"><span>VISITS</span><strong>{formatCount(visibleTimeline.stats.visitCount)}</strong></div>
        <div className="stat-item hotspots"><span>HOT ZONES</span><div className="hotspot-chips">{visibleTimeline.stats.hotspots.slice(0, 3).map((hotspot, index) => <span key={`${hotspot.lat}-${hotspot.lng}-${index}`}>{index + 1} · {hotspot.lat.toFixed(2)}°, {hotspot.lng.toFixed(2)}°</span>)}</div></div>
      </motion.section>

      <motion.section
        ref={timelineDockRef}
        className={`timeline-dock ${viewMode === 'replay' ? 'is-visible' : ''}`}
        aria-label="Timeline playback"
        initial={{ opacity: 0, y: 13 }}
        animate={viewMode === 'stats' ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }}
        transition={viewMode === 'stats' ? { duration: 0.28, ease: motionEase } : isReturningFromStats ? timelineReturnTransition : { duration: 0.42, ease: motionEase }}
        onAnimationComplete={() => {
          if (isReturningFromStats) {
            setIsReturningFromStats(false);
          }
        }}
        style={{ pointerEvents: viewMode === 'stats' ? 'none' : 'auto' }}
      >
        <div className="timeline-dock-top">
          <div className="timeline-label"><span className="playhead-dot" /> <span>{viewMode === 'replay' ? 'LIVE REPLAY' : 'TIMELINE REPLAY'}</span></div>
          <strong>{formatDate(currentDate)} <span className="timeline-time">{new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(currentDate)}</span></strong>
          <div className="speed-options" role="group" aria-label="Playback speed">
            {[1, 4, 16].map((value) => <button key={value} className={speed === value ? 'is-active' : ''} onClick={() => setSpeed(value)} type="button">{value}×</button>)}
          </div>
        </div>
        <div className="timeline-controls">
          <button className="play-button" type="button" onClick={() => { if (playbackProgress >= 1) { progressRef.current = 0; setPlaybackProgress(0); } chooseView('replay'); setIsPlaying((value) => !value); }} aria-label={isPlaying ? 'Pause replay' : 'Play replay'}>{isPlaying ? 'Ⅱ' : '▶'}</button>
          <div className="range-wrap">
            <input aria-label="Timeline position" type="range" min="0" max="1000" value={Math.round(playbackProgress * 1000)} onChange={(event) => { const next = Number(event.target.value) / 1000; progressRef.current = next; setPlaybackProgress(next); chooseView('replay'); setIsPlaying(false); }} />
            <div className="range-labels"><span>{formatDate(visibleTimeline.coverage.start, false)}</span><span>{formatDate(visibleTimeline.coverage.end, false)}</span></div>
          </div>
          <span className="route-count">{formatCount(visibleTimeline.playback.length)} moments</span>
        </div>
      </motion.section>

      <footer className="privacy-note"><span className="lock-mark" aria-hidden="true">⌁</span> Your timeline is processed locally. We never see where you’ve been.</footer>
      </main>
    </MotionConfig>
  );
}
