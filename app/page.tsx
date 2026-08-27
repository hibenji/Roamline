'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import GlobeMap, {
  pointAtProgress,
  type GlobeViewMode,
  type HeatViewMode,
} from './components/GlobeMap';
import StatsView from './components/StatsView';
import StatsSummary from './components/StatsSummary';
import TimelineDock from './components/TimelineDock';
import { useTimelineLoader } from './hooks/useTimelineLoader';
import { useTimelinePlayback } from './hooks/useTimelinePlayback';
import { formatCount, formatDateInput } from './lib/format';
import {
  layerLayoutTransition,
  motionEase,
  panelTransition,
  statsReturnTransition,
} from './lib/motion';
import { MODE_DEFINITIONS, MODE_KEYS, MODE_UI_COLORS } from './lib/modes';
import {
  createDemoTimeline,
  filterTimelineByDateRange,
  type ModeKey,
  type NormalizedTimeline,
} from './timeline';

function isValidDateInput(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export default function Home() {
  const [timeline, setTimeline] = useState<NormalizedTimeline>(() => createDemoTimeline());
  const [viewMode, setViewMode] = useState<GlobeViewMode>('all');
  const [heatMode, setHeatMode] = useState<HeatViewMode>('dwell');
  const [selectedModes, setSelectedModes] = useState<ModeKey[]>(MODE_KEYS);
  const [connectSequential, setConnectSequential] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [fromDate, setFromDate] = useState('2022-01-01');
  const [toDate, setToDate] = useState('');
  const [draftFromDate, setDraftFromDate] = useState('2022-01-01');
  const [draftToDate, setDraftToDate] = useState('');
  const [rangeFocusActive, setRangeFocusActive] = useState(false);
  const [previousRange, setPreviousRange] = useState<{ fromDate: string; toDate: string } | null>(
    null,
  );
  const [playbackProgress, setPlaybackProgress] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [dragActive, setDragActive] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [layerPanelTop, setLayerPanelTop] = useState<number | null>(null);
  const [timelineDockHeight, setTimelineDockHeight] = useState<number | null>(null);
  const [isReturningFromStats, setIsReturningFromStats] = useState(false);
  const [restoredLayerPanelSnapshot, setRestoredLayerPanelSnapshot] = useState<{
    panelHeight: number;
    headingHeight: number;
    settingsHeight: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const layerPanelRef = useRef<HTMLElement | null>(null);
  const layerHeadingRef = useRef<HTMLDivElement | null>(null);
  const layerSettingsRef = useRef<HTMLDivElement | null>(null);
  const timelineDockRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef(playbackProgress);
  const prefersReducedMotionRef = useRef(false);

  const handleMapReady = useCallback(() => setMapReady(true), []);

  const handleTimelineLoaded = useCallback(
    (nextTimeline: NormalizedTimeline) => {
      setTimeline(nextTimeline);
      setIsReturningFromStats(viewMode === 'stats');
      setViewMode('all');
      setRangeFocusActive(false);
      setPreviousRange(null);
      progressRef.current = 1;
      setPlaybackProgress(1);
      setIsPlaying(false);
    },
    [viewMode],
  );

  const { loadState, loadLabel, loadMessage, parseFile, progress, resetLoader } = useTimelineLoader(
    { onLoaded: handleTimelineLoaded },
  );

  useTimelinePlayback({
    isPlaying,
    playbackProgress,
    prefersReducedMotionRef,
    progressRef,
    setIsPlaying,
    setPlaybackProgress,
    speed,
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = media.matches;
    const handleChange = () => {
      prefersReducedMotionRef.current = media.matches;
    };
    media.addEventListener?.('change', handleChange);
    return () => {
      media.removeEventListener?.('change', handleChange);
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

  const rangeError = Boolean(fromDate && toDate && fromDate > toDate);
  const visibleTimeline = useMemo(
    () =>
      rangeError
        ? timeline
        : filterTimelineByDateRange(timeline, fromDate || undefined, toDate || undefined),
    [timeline, fromDate, toDate, rangeError],
  );
  const currentPoint = useMemo(
    () => pointAtProgress(visibleTimeline, playbackProgress),
    [visibleTimeline, playbackProgress],
  );
  const currentDate = currentPoint?.time ?? visibleTimeline.coverage.end;
  const rangeLabel = `${formatDateInput(fromDate, 'Beginning')} → ${formatDateInput(toDate, 'Latest')}`;
  const rangeHasData =
    visibleTimeline.playback.length > 0 ||
    visibleTimeline.routes.features.length > 0 ||
    visibleTimeline.visits.features.length > 0;
  const allModesSelected = selectedModes.length === MODE_KEYS.length;
  const isMobileStats = isMobileViewport && viewMode === 'stats';

  const focusMapDateRange = useCallback(
    (nextFromDate: string, nextToDate: string) => {
      setPreviousRange({ fromDate, toDate });
      setFromDate(nextFromDate);
      setToDate(nextToDate);
      setDraftFromDate(nextFromDate);
      setDraftToDate(nextToDate);
      setRangeFocusActive(true);
      setIsReturningFromStats(viewMode === 'stats');
      setViewMode('all');
      setIsPlaying(false);
      progressRef.current = 1;
      setPlaybackProgress(1);
    },
    [fromDate, toDate, viewMode],
  );

  function rememberLayerPanelSize() {
    if (
      !isMobileViewport ||
      viewMode === 'stats' ||
      !layerPanelRef.current ||
      !layerHeadingRef.current ||
      !layerSettingsRef.current
    )
      return;
    setRestoredLayerPanelSnapshot({
      panelHeight: layerPanelRef.current.getBoundingClientRect().height,
      headingHeight: layerHeadingRef.current.getBoundingClientRect().height,
      settingsHeight: layerSettingsRef.current.getBoundingClientRect().height,
    });
  }

  function clearDateRange() {
    setFromDate('');
    setToDate('');
    setDraftFromDate('');
    setDraftToDate('');
    setRangeFocusActive(false);
    setPreviousRange(null);
  }

  function goBackFromFocusedRange() {
    if (previousRange) {
      setFromDate(previousRange.fromDate);
      setToDate(previousRange.toDate);
      setDraftFromDate(previousRange.fromDate);
      setDraftToDate(previousRange.toDate);
    }
    setRangeFocusActive(false);
    setPreviousRange(null);
  }

  function applyDateRangeInput(field: 'from' | 'to') {
    const value = field === 'from' ? draftFromDate : draftToDate;
    if (!isValidDateInput(value)) {
      if (field === 'from') setDraftFromDate(fromDate);
      else setDraftToDate(toDate);
      return;
    }

    if (field === 'from') setFromDate(value);
    else setToDate(value);
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
    setSelectedModes((current) =>
      current.includes(mode) ? current.filter((value) => value !== mode) : [...current, mode],
    );
  }

  function resetDemo() {
    resetLoader();
    setTimeline(createDemoTimeline());
    setFromDate('2022-01-01');
    setToDate('');
    setDraftFromDate('2022-01-01');
    setDraftToDate('');
    setRangeFocusActive(false);
    setPreviousRange(null);
    setLayerPanelTop(null);
    setIsReturningFromStats(viewMode === 'stats');
    setViewMode('all');
    setConnectSequential(true);
    progressRef.current = 1;
    setPlaybackProgress(1);
    setIsPlaying(false);
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

  const modeDescription =
    viewMode === 'all'
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
      <main
        className={`roamline-shell ${viewMode === 'stats' ? 'is-stats' : ''} ${loadState === 'ready' ? 'has-loaded-file' : ''}`}
      >
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

        <motion.header
          className="topbar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={panelTransition}
        >
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span className="brand-name">ROAMLINE</span>
            <span className="brand-divider" />
            <span className="brand-caption">private location atlas</span>
          </div>
          <div className="topbar-actions">
            <span className={`connection-status ${mapReady ? 'is-ready' : ''}`}>
              <motion.span
                animate={
                  mapReady
                    ? { opacity: [0.68, 1, 0.68], scale: [0.86, 1.16, 0.86] }
                    : { opacity: 0.68, scale: 0.86 }
                }
                transition={{ duration: 2.4, ease: 'easeInOut', repeat: mapReady ? Infinity : 0 }}
              />{' '}
              {mapReady ? 'globe online' : 'starting globe'}
            </span>
            <button
              className={`orbit-toggle ${autoRotate ? 'is-active' : ''}`}
              onClick={() => setAutoRotate((value) => !value)}
              type="button"
            >
              <span aria-hidden="true">◌</span> {autoRotate ? 'Pause orbit' : 'Orbit globe'}
            </button>
            <button className="reset-button" onClick={resetDemo} type="button">
              Reset demo
            </button>
          </div>
        </motion.header>

        <motion.section
          className="control-panel intro-panel"
          initial={{ opacity: 0, y: 13 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...panelTransition, delay: 0.08 }}
        >
          <div className="eyebrow">
            <span className="eyebrow-dot" /> LOCATION MEMORY / 01
          </div>
          <h1>
            See the shape
            <br />
            <em>of your days.</em>
          </h1>
          <p className="intro-copy">
            A quiet, visual record of everywhere you’ve been — orbit it, replay it, feel the
            patterns.
          </p>

          <div
            className={`dropzone ${dragActive ? 'is-dragging' : ''} ${loadState === 'reading' ? 'is-reading' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDragActive(false);
            }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Choose or drop a Google Timeline JSON export"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              hidden
            />
            <span className="drop-icon" aria-hidden="true">
              ↑
            </span>
            <span className="drop-copy">
              <strong>
                {loadState === 'reading' ? `Reading ${loadLabel}` : 'Drop your Timeline JSON'}
              </strong>
              <small>
                {loadState === 'reading'
                  ? `${progress}% · ${loadMessage}`
                  : 'or click to browse · stays on your device'}
              </small>
            </span>
          </div>

          {loadState === 'error' && (
            <p className="error-message" role="alert">
              {loadMessage}
            </p>
          )}
          {loadState !== 'error' && (
            <div className="load-meta">
              <span className={`state-dot ${loadState}`} />{' '}
              <span>
                {loadState === 'demo'
                  ? 'Synthetic demo'
                  : loadState === 'reading'
                    ? loadMessage
                    : loadLabel}
              </span>
              <span className="local-chip">LOCAL ONLY</span>
            </div>
          )}
        </motion.section>

        <motion.section
          ref={layerPanelRef}
          className="control-panel layer-panel"
          initial={{ opacity: 0, y: 13 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...panelTransition, delay: isReturningFromStats ? 0 : 0.18 }}
          style={
            {
              '--timeline-dock-height':
                timelineDockHeight === null ? undefined : `${timelineDockHeight}px`,
              height:
                !isMobileStats && restoredLayerPanelSnapshot !== null
                  ? restoredLayerPanelSnapshot.panelHeight
                  : undefined,
              top:
                isMobileViewport && layerPanelTop !== null && !isMobileStats
                  ? `${layerPanelTop}px`
                  : undefined,
              bottom:
                isMobileViewport && layerPanelTop !== null && !isMobileStats ? 'auto' : undefined,
            } as CSSProperties
          }
        >
          <motion.div
            ref={layerHeadingRef}
            className="panel-heading"
            aria-hidden={isMobileStats}
            initial={false}
            animate={
              isMobileStats
                ? { height: 0, opacity: 0, y: -10 }
                : { height: restoredLayerPanelSnapshot?.headingHeight ?? 'auto', opacity: 1, y: 0 }
            }
            transition={
              isReturningFromStats
                ? statsReturnTransition
                : { height: panelTransition, opacity: { duration: 0.28 }, y: panelTransition }
            }
            style={{ overflow: 'hidden' }}
          >
            <div>
              <div className="eyebrow">VIEW LAYERS</div>
              <p>{modeDescription}</p>
            </div>
            <span className="layer-count">
              {formatCount(visibleTimeline.stats.routePointCount)} pts
            </span>
          </motion.div>
          <motion.div
            className="view-switcher-box"
            layout="position"
            transition={{
              layout: isReturningFromStats ? statsReturnTransition : layerLayoutTransition,
            }}
          >
            <div className="view-tabs" role="tablist" aria-label="Globe view">
              <motion.span
                className={`view-tab-active-bg view-tab-${viewMode}`}
                layout
                initial={false}
                transition={layerLayoutTransition}
                aria-hidden="true"
              />
              {(
                [
                  ['all', 'All activity', '◉'],
                  ['replay', 'Replay', '▶'],
                  ['heatmap', 'Heatmap', '◌'],
                  ['stats', 'Stats', '✦'],
                ] as Array<[GlobeViewMode, string, string]>
              ).map(([key, label, icon]) => (
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
                  <span className="view-tab-content">
                    <span aria-hidden="true">{icon}</span>
                    {label}
                  </span>
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
            animate={
              isMobileStats
                ? { height: 0, opacity: 0, y: -10 }
                : { height: restoredLayerPanelSnapshot?.settingsHeight ?? 'auto', opacity: 1, y: 0 }
            }
            transition={
              isReturningFromStats
                ? statsReturnTransition
                : { height: panelTransition, opacity: { duration: 0.28 }, y: panelTransition }
            }
            style={{
              overflow: isMobileStats ? 'hidden' : 'visible',
              pointerEvents: isMobileStats ? 'none' : 'auto',
            }}
          >
            <details className="range-details">
              <summary>
                <span className="range-summary-copy">
                  <span className="range-summary-icon" aria-hidden="true">
                    ◷
                  </span>
                  <span>
                    <strong>TIME RANGE</strong>
                    <small>{rangeLabel}</small>
                  </span>
                </span>
                <span className="range-chevron" aria-hidden="true">
                  ⌄
                </span>
              </summary>
              <div className="range-popover">
                <div className="range-fields">
                  <label>
                    From
                    <input
                      type="date"
                      value={draftFromDate}
                      onChange={(event) => setDraftFromDate(event.target.value)}
                      onBlur={() => applyDateRangeInput('from')}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={draftToDate}
                      onChange={(event) => setDraftToDate(event.target.value)}
                      onBlur={() => applyDateRangeInput('to')}
                    />
                  </label>
                </div>
                <div className="range-actions">
                  <button type="button" onClick={clearDateRange}>
                    Full timeline
                  </button>
                  <span>Default: since 2022</span>
                </div>
                {rangeError && (
                  <p className="range-message" role="alert">
                    End date must be on or after the start date.
                  </p>
                )}
                {!rangeError && !rangeHasData && (
                  <p className="range-message" role="status">
                    No locations found in this range.
                  </p>
                )}
              </div>
            </details>

            <AnimatePresence initial={false}>
              {viewMode === 'heatmap' && (
                <motion.div
                  className="heat-switch-drawer"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    height: { duration: 0.42, ease: motionEase },
                    opacity: { duration: 0.22, ease: 'linear' },
                  }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="heat-switch" role="group" aria-label="Heatmap metric">
                    <button
                      className={heatMode === 'dwell' ? 'is-active' : ''}
                      onClick={() => setHeatMode('dwell')}
                      type="button"
                    >
                      <span className="heat-swatch dwell" />
                      Time spent
                    </button>
                    <button
                      className={heatMode === 'movement' ? 'is-active' : ''}
                      onClick={() => setHeatMode('movement')}
                      type="button"
                    >
                      <span className="heat-swatch movement" />
                      Movement frequency
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="filter-heading">
              <span>ACTIVITY</span>
              <button
                type="button"
                onClick={() => setSelectedModes(allModesSelected ? [] : MODE_KEYS)}
              >
                {allModesSelected ? 'Clear' : 'All modes'}
              </button>
            </div>
            <div className="mode-filters">
              {MODE_DEFINITIONS.map((mode) => (
                <button
                  key={mode.key}
                  className={`mode-pill ${selectedModes.includes(mode.key) ? 'is-selected' : ''}`}
                  onClick={() => toggleMode(mode.key)}
                  style={{ '--mode-color': MODE_UI_COLORS[mode.key] } as CSSProperties}
                  type="button"
                >
                  <span className="mode-dot" aria-hidden="true" />
                  {mode.short}
                </button>
              ))}
            </div>
            <label className="toggle-row">
              <span>
                <span className="toggle-icon" aria-hidden="true">
                  ↝
                </span>{' '}
                Connect timeline points
              </span>
              <input
                type="checkbox"
                checked={connectSequential}
                onChange={(event) => setConnectSequential(event.target.checked)}
              />
              <span className="toggle-track" aria-hidden="true">
                <span />
              </span>
            </label>
          </motion.div>
        </motion.section>

        <AnimatePresence initial={false}>
          {rangeFocusActive && (
            <motion.button
              className="range-back-button"
              type="button"
              onClick={goBackFromFocusedRange}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: motionEase }}
            >
              <span aria-hidden="true">←</span> Back
            </motion.button>
          )}
        </AnimatePresence>

        <StatsView
          timeline={visibleTimeline}
          selectedModes={selectedModes}
          isVisible={viewMode === 'stats'}
        />

        <StatsSummary timeline={visibleTimeline} />

        <TimelineDock
          currentDate={currentDate}
          isPlaying={isPlaying}
          isReturningFromStats={isReturningFromStats}
          onChooseView={chooseView}
          onPlaybackProgressChange={setPlaybackProgress}
          playbackProgress={playbackProgress}
          progressRef={progressRef}
          setIsPlaying={setIsPlaying}
          setSpeed={setSpeed}
          speed={speed}
          timeline={visibleTimeline}
          timelineDockRef={timelineDockRef}
          viewMode={viewMode}
          onAnimationComplete={() => {
            if (isReturningFromStats) setIsReturningFromStats(false);
          }}
        />

        <footer className="privacy-note">
          <span className="lock-mark" aria-hidden="true">
            ⌁
          </span>{' '}
          Your timeline is processed locally. We never see where you’ve been.
        </footer>
      </main>
    </MotionConfig>
  );
}
