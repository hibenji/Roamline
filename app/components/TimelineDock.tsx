import { motion } from 'motion/react';
import type { MutableRefObject } from 'react';
import { formatCount, formatDate, formatTime } from '../lib/format';
import { motionEase, timelineReturnTransition } from '../lib/motion';
import type { NormalizedTimeline } from '../timeline';
import type { GlobeViewMode } from './GlobeMap';

type TimelineDockProps = {
  currentDate: number;
  isPlaying: boolean;
  isReturningFromStats: boolean;
  onChooseView: (viewMode: GlobeViewMode) => void;
  onPlaybackProgressChange: (progress: number) => void;
  playbackProgress: number;
  progressRef: MutableRefObject<number>;
  setIsPlaying: (isPlaying: boolean | ((current: boolean) => boolean)) => void;
  setSpeed: (speed: number) => void;
  speed: number;
  timeline: NormalizedTimeline;
  timelineDockRef: MutableRefObject<HTMLElement | null>;
  viewMode: GlobeViewMode;
  onAnimationComplete: () => void;
};

export default function TimelineDock({
  currentDate,
  isPlaying,
  isReturningFromStats,
  onChooseView,
  onPlaybackProgressChange,
  playbackProgress,
  progressRef,
  setIsPlaying,
  setSpeed,
  speed,
  timeline,
  timelineDockRef,
  viewMode,
  onAnimationComplete,
}: TimelineDockProps) {
  return (
    <motion.section
      ref={timelineDockRef}
      className={`timeline-dock ${viewMode === 'replay' ? 'is-visible' : ''}`}
      aria-label="Timeline playback"
      initial={{ opacity: 0, y: 13 }}
      animate={viewMode === 'stats' ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }}
      transition={
        viewMode === 'stats'
          ? { duration: 0.28, ease: motionEase }
          : isReturningFromStats
            ? timelineReturnTransition
            : { duration: 0.42, ease: motionEase }
      }
      onAnimationComplete={onAnimationComplete}
      style={{ pointerEvents: viewMode === 'stats' ? 'none' : 'auto' }}
    >
      <div className="timeline-dock-top">
        <div className="timeline-label">
          <span className="playhead-dot" />{' '}
          <span>{viewMode === 'replay' ? 'LIVE REPLAY' : 'TIMELINE REPLAY'}</span>
        </div>
        <strong>
          {formatDate(currentDate)} <span className="timeline-time">{formatTime(currentDate)}</span>
        </strong>
        <div className="speed-options" role="group" aria-label="Playback speed">
          {[1, 4, 16].map((value) => (
            <button
              key={value}
              className={speed === value ? 'is-active' : ''}
              onClick={() => setSpeed(value)}
              type="button"
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
      <div className="timeline-controls">
        <button
          className="play-button"
          type="button"
          onClick={() => {
            if (playbackProgress >= 1) {
              progressRef.current = 0;
              onPlaybackProgressChange(0);
            }
            onChooseView('replay');
            setIsPlaying((value) => !value);
          }}
          aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
        >
          {isPlaying ? 'Ⅱ' : '▶'}
        </button>
        <div className="range-wrap">
          <input
            aria-label="Timeline position"
            type="range"
            min="0"
            max="1000"
            value={Math.round(playbackProgress * 1000)}
            onChange={(event) => {
              const next = Number(event.target.value) / 1000;
              progressRef.current = next;
              onPlaybackProgressChange(next);
              onChooseView('replay');
              setIsPlaying(false);
            }}
          />
          <div className="range-labels">
            <span>{formatDate(timeline.coverage.start, false)}</span>
            <span>{formatDate(timeline.coverage.end, false)}</span>
          </div>
        </div>
        <span className="route-count">{formatCount(timeline.playback.length)} moments</span>
      </div>
    </motion.section>
  );
}
