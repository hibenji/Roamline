import { motion } from 'motion/react';
import { formatCount, formatDate, formatDistance } from '../lib/format';
import type { NormalizedTimeline } from '../timeline';
import { panelTransition } from '../lib/motion';

type StatsSummaryProps = {
  timeline: NormalizedTimeline;
};

export default function StatsSummary({ timeline }: StatsSummaryProps) {
  return (
    <motion.section
      className="stats-panel"
      aria-label="Timeline summary"
      initial={{ opacity: 0, y: 13 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...panelTransition, delay: 0.3 }}
    >
      <div className="stats-intro">
        <span className="eyebrow">THE LONG VIEW</span>
        <strong>
          {formatDate(timeline.coverage.start)} <span>→</span> {formatDate(timeline.coverage.end)}
        </strong>
      </div>
      <div className="stat-item">
        <span>ACTIVE DAYS</span>
        <strong>{formatCount(timeline.stats.activeDays)}</strong>
      </div>
      <div className="stat-item">
        <span>DISTANCE</span>
        <strong>{formatDistance(timeline.stats.distanceMeters)}</strong>
      </div>
      <div className="stat-item">
        <span>VISITS</span>
        <strong>{formatCount(timeline.stats.visitCount)}</strong>
      </div>
      <div className="stat-item hotspots">
        <span>HOT ZONES</span>
        <div className="hotspot-chips">
          {timeline.stats.hotspots.slice(0, 3).map((hotspot, index) => (
            <span key={`${hotspot.lat}-${hotspot.lng}-${index}`}>
              {index + 1} · {hotspot.lat.toFixed(2)}°, {hotspot.lng.toFixed(2)}°
            </span>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
