'use client';

import { useMemo, useState } from 'react';
import { deriveTimelineStats, type TrendBucket, type TrendMetric } from '../stats';
import type { ModeKey, NormalizedTimeline } from '../timeline';

type StatsViewProps = {
  timeline: NormalizedTimeline;
  selectedModes: ModeKey[];
  showVisits: boolean;
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

const MODE_COLORS: Record<ModeKey, string> = {
  drive: '#ff806d',
  walk: '#89f5c9',
  cycle: '#ffd166',
  transit: '#77d7ff',
  flight: '#c4b5fd',
  water: '#60a5fa',
  other: '#a8b1c2',
};

function formatCount(value: number) {
  if (!Number.isFinite(value)) return '--';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return '--';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const kilometers = meters / 1000;
  return kilometers >= 1000 ? `${(kilometers / 1000).toFixed(1)}k km` : `${kilometers.toFixed(kilometers < 100 ? 1 : 0)} km`;
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '--';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours >= 24 ? `${(hours / 24).toFixed(1)} days` : `${hours.toFixed(hours < 10 ? 1 : 0)} hrs`;
}

function formatDate(timestamp: number | undefined) {
  if (timestamp === undefined) return '--';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(timestamp);
}

function formatHour(hour: number | undefined) {
  if (hour === undefined) return '--';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
}

function metricValue(bucket: TrendBucket, metric: TrendMetric) {
  if (metric === 'distance') return bucket.distanceMeters;
  if (metric === 'visits') return bucket.visits;
  return bucket.activeDays;
}

function metricLabel(metric: TrendMetric) {
  if (metric === 'distance') return 'Distance';
  if (metric === 'visits') return 'Visits';
  return 'Active days';
}

function metricValueLabel(value: number, metric: TrendMetric) {
  if (metric === 'distance') return formatDistance(value);
  return formatCount(value);
}

function chartPoints(trend: TrendBucket[], metric: TrendMetric, chartWidth: number, chartHeight: number) {
  const max = Math.max(1, ...trend.map((bucket) => metricValue(bucket, metric)));
  const left = 42;
  const right = 12;
  const top = 16;
  const bottom = 36;
  const plotWidth = chartWidth - left - right;
  const plotHeight = chartHeight - top - bottom;
  const step = trend.length > 1 ? plotWidth / (trend.length - 1) : plotWidth;
  const points = trend.map((bucket, index) => {
    const value = metricValue(bucket, metric);
    return {
      bucket,
      value,
      x: left + index * step,
      y: top + plotHeight - (value / max) * plotHeight,
    };
  });
  return { max, left, right, top, bottom, plotWidth, plotHeight, step, points };
}

export default function StatsView({ timeline, selectedModes, showVisits }: StatsViewProps) {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('days');
  const stats = useMemo(() => deriveTimelineStats(timeline, selectedModes, showVisits), [timeline, selectedModes, showVisits]);
  const chart = useMemo(() => chartPoints(stats.trend, trendMetric, 820, 250), [stats.trend, trendMetric]);
  const maxWeekday = Math.max(1, ...stats.weekdayCounts.map((entry) => entry.count));
  const busiestWeekday = stats.weekdayCounts.reduce((best, entry) => entry.count > best.count ? entry : best, stats.weekdayCounts[0]);
  const movementPoints = stats.trend.reduce((total, bucket) => total + bucket.movementPoints, 0);
  const labelStep = Math.max(1, Math.ceil(stats.trend.length / 8));
  const chartLine = chart.points.map((point) => `${point.x},${point.y}`).join(' ');
  const chartArea = chart.points.length > 0
    ? `${chart.left},${chart.top + chart.plotHeight} ${chartLine} ${chart.points[chart.points.length - 1].x},${chart.top + chart.plotHeight}`
    : '';

  return (
    <section className="stats-page" aria-label="Timeline statistics">
      <div className="stats-page-heading">
        <div>
          <h2>Timeline analytics</h2>
          <p>Patterns from the selected range, calculated locally in this browser.</p>
        </div>
        <div className="stats-range-stamp">
          <span>Analyzing</span>
          <strong>{formatDate(timeline.coverage.start)} <i>to</i> {formatDate(timeline.coverage.end)}</strong>
          <small>{selectedModes.length} activity types · {showVisits ? 'Visits included' : 'Visits hidden'}</small>
        </div>
      </div>

      <div className="stats-kpi-grid">
        <article className="stats-kpi">
          <span>Distance traveled</span>
          <strong>{formatDistance(stats.distanceMeters)}</strong>
          <small>{formatCount(movementPoints)} recorded moments</small>
        </article>
        <article className="stats-kpi">
          <span>Longest streak</span>
          <strong>{stats.longestStreak}<em> days</em></strong>
          <small>{stats.activeDays ? `${formatCount(stats.activeDays)} active days total` : 'No activity in this range'}</small>
        </article>
        <article className="stats-kpi">
          <span>Time at places</span>
          <strong>{formatDuration(stats.dwellMinutes)}</strong>
          <small>{formatCount(stats.visitCount)} visited places</small>
        </article>
        <article className="stats-kpi accent-kpi">
          <span>Favourite mode</span>
          <strong>{stats.topMode ? MODE_LABELS[stats.topMode] : '--'}</strong>
          <small>{stats.topMode ? `${Math.round((stats.modeBreakdown[0]?.share ?? 0) * 100)}% of route distance` : 'Select an activity type'}</small>
        </article>
      </div>

      <section className="stats-chart-section" aria-labelledby="activity-trend-title">
        <div className="stats-section-heading">
          <div>
            <h3 id="activity-trend-title">Activity over time</h3>
            <p>{stats.trendGranularity === 'year' ? 'Yearly pattern across the selected range' : 'Monthly pattern across the selected range'}</p>
          </div>
          <div className="stats-metric-switch" role="group" aria-label="Trend metric">
            {(['days', 'distance', 'visits'] as TrendMetric[]).map((metric) => (
              <button key={metric} type="button" aria-pressed={trendMetric === metric} onClick={() => setTrendMetric(metric)}>{metricLabel(metric)}</button>
            ))}
          </div>
        </div>
        <div className="trend-chart-wrap">
          <svg className="trend-chart" viewBox="0 0 820 250" role="img" aria-labelledby="trend-chart-title trend-chart-description">
            <title id="trend-chart-title">{metricLabel(trendMetric)} over time</title>
            <desc id="trend-chart-description">A chart showing {metricLabel(trendMetric).toLowerCase()} for each {stats.trendGranularity} in the selected timeline.</desc>
            {[0, 0.5, 1].map((ratio) => {
              const y = chart.top + chart.plotHeight * ratio;
              const value = chart.max * (1 - ratio);
              return <g key={ratio}><line x1={chart.left} x2={820 - chart.right} y1={y} y2={y} className="chart-grid-line" /><text x={chart.left - 9} y={y + 4} textAnchor="end" className="chart-axis-label">{metricValueLabel(value, trendMetric)}</text></g>;
            })}
            {chartArea && <polygon points={chartArea} className="trend-area" />}
            {chartLine && <polyline points={chartLine} className="trend-line" />}
            {chart.points.map((point, index) => (
              <g key={point.bucket.key}>
                <circle cx={point.x} cy={point.y} r="5" className="trend-point" />
                {(index % labelStep === 0 || index === chart.points.length - 1) && <text x={point.x} y={234} textAnchor="middle" className="chart-x-label">{point.bucket.label}</text>}
                <title>{`${point.bucket.label}: ${metricValueLabel(point.value, trendMetric)}`}</title>
              </g>
            ))}
          </svg>
        </div>
      </section>

      <div className="stats-detail-grid">
        <section className="stats-detail-section" aria-labelledby="mode-breakdown-title">
          <div className="stats-section-heading compact-heading"><div><h3 id="mode-breakdown-title">Distance by mode</h3></div></div>
          <div className="mode-stat-list">
            {stats.modeBreakdown.length > 0 ? stats.modeBreakdown.map((entry) => (
              <div className="mode-stat-row" key={entry.mode}>
                <div className="mode-stat-label"><span className="mode-dot" style={{ backgroundColor: MODE_COLORS[entry.mode] }} /><span>{MODE_LABELS[entry.mode]}</span><strong>{formatDistance(entry.distanceMeters)}</strong></div>
                <div className="mode-stat-track"><span style={{ width: `${Math.max(2, entry.share * 100)}%`, backgroundColor: MODE_COLORS[entry.mode] }} /></div>
              </div>
            )) : <p className="empty-stats">Select at least one activity type to see the breakdown.</p>}
          </div>
        </section>

        <section className="stats-detail-section" aria-labelledby="weekly-rhythm-title">
          <div className="stats-section-heading compact-heading"><div><h3 id="weekly-rhythm-title">Weekly rhythm</h3></div><span className="detail-note">Peak: {busiestWeekday?.label ?? '--'}</span></div>
          <div className="weekday-chart" role="img" aria-label="Activity by day of week">
            {stats.weekdayCounts.map((entry) => <div className="weekday-column" key={entry.label}><div className="weekday-bar-track"><span style={{ height: `${Math.max(entry.count > 0 ? 8 : 2, entry.count / maxWeekday * 100)}%` }} /></div><strong>{entry.label.slice(0, 1)}</strong><small>{formatCount(entry.count)}</small></div>)}
          </div>
        </section>
      </div>

      <div className="stats-detail-grid country-year-grid">
        <section className="stats-detail-section" aria-labelledby="country-breakdown-title">
          <div className="stats-section-heading compact-heading"><div><h3 id="country-breakdown-title">Time by country</h3></div><span className="detail-note">Local estimate</span></div>
          <div className="country-stat-list">
            {stats.countryBreakdown.length > 0 ? stats.countryBreakdown.slice(0, 8).map((entry, index) => {
              const maxMinutes = Math.max(1, stats.countryBreakdown[0]?.minutes ?? 0);
              return <div className="country-stat-row" key={entry.country}><span className="country-rank">{String(index + 1).padStart(2, '0')}</span><div className="country-stat-main"><div className="country-stat-name"><strong>{entry.country}</strong><small>{entry.visits > 0 ? `${formatCount(entry.visits)} visits` : `${formatCount(Math.round(entry.movementPoints))} movement points`}</small></div><div className="country-stat-track"><span style={{ width: `${entry.minutes > 0 ? Math.max(3, entry.minutes / maxMinutes * 100) : 3}%` }} /></div></div><strong className="country-stat-value">{entry.minutes > 0 ? formatDuration(entry.minutes) : 'Travel only'}</strong></div>;
            }) : <p className="empty-stats">No country-level locations were recognized in this range.</p>}
          </div>
        </section>

        <section className="stats-detail-section" aria-labelledby="year-breakdown-title">
          <div className="stats-section-heading compact-heading"><div><h3 id="year-breakdown-title">Year by year</h3></div><span className="detail-note">Selected range</span></div>
          <div className="year-stat-table" role="table" aria-label="Year by year timeline statistics">
            <div className="year-stat-row year-stat-header" role="row"><span>Year</span><span>Days</span><span>Distance</span><span>Places</span><span>Time at places</span></div>
            {stats.yearBreakdown.length > 0 ? stats.yearBreakdown.map((entry) => <div className="year-stat-row" role="row" key={entry.year}><strong>{entry.year}</strong><span>{formatCount(entry.activeDays)}</span><span>{formatDistance(entry.distanceMeters)}</span><span>{formatCount(entry.visits)}</span><span>{formatDuration(entry.dwellMinutes)}</span></div>) : <p className="empty-stats">No year-level activity in this range.</p>}
          </div>
        </section>
      </div>

      <section className="signature-section" aria-labelledby="signature-title">
          <div className="stats-section-heading compact-heading"><div><h3 id="signature-title">Timeline signature</h3></div></div>
        <div className="signature-grid">
          <div><span>Busiest date</span><strong>{formatDate(stats.busiestDate ? Date.parse(`${stats.busiestDate}T00:00:00.000Z`) : undefined)}</strong><small>{formatCount(stats.busiestDateCount)} moments logged</small></div>
          <div><span>Peak hour</span><strong>{formatHour(stats.peakHour)}</strong><small>{formatCount(stats.peakHourCount)} moments in the busiest hour</small></div>
          <div><span>Average stay</span><strong>{formatDuration(stats.averageVisitMinutes)}</strong><small>per visited place</small></div>
          <div><span>Route points</span><strong>{formatCount(stats.routePointCount)}</strong><small>rendered across selected modes</small></div>
          <div><span>Busiest weekday</span><strong>{busiestWeekday?.label ?? '--'}</strong><small>{formatCount(busiestWeekday?.count ?? 0)} moments logged</small></div>
          <div><span>Routine pulse</span><strong>{formatHour(stats.peakHour)}</strong><small>{formatCount(stats.peakHourCount)} moments at peak</small></div>
        </div>
      </section>
    </section>
  );
}
