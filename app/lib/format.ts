const DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

const COUNT_FORMATTER = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatDate(timestamp: number | undefined, includeYear = true, fallback = '--') {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return fallback;
  return (includeYear ? DATE_FORMATTER : SHORT_DATE_FORMATTER).format(timestamp);
}

export function formatCount(value: number, fallback = '--') {
  if (!Number.isFinite(value)) return fallback;
  return COUNT_FORMATTER.format(value);
}

export function formatDistance(meters: number, fallback = '--') {
  if (!Number.isFinite(meters) || meters <= 0) return fallback;
  if (meters < 1000) return `${Math.round(meters)} m`;

  const kilometers = meters / 1000;
  return kilometers >= 1000
    ? `${(kilometers / 1000).toFixed(1)}k km`
    : `${kilometers.toFixed(kilometers < 100 ? 1 : 0)} km`;
}

export function formatDuration(minutes: number, fallback = '--') {
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  if (minutes < 60) return `${Math.round(minutes)} min`;

  const hours = minutes / 60;
  return hours >= 24
    ? `${(hours / 24).toFixed(1)} days`
    : `${hours.toFixed(hours < 10 ? 1 : 0)} hrs`;
}

export function formatHour(hour: number | undefined, fallback = '--') {
  if (hour === undefined || !Number.isFinite(hour)) return fallback;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${suffix}`;
}

export function formatTime(timestamp: number, fallback = '--') {
  if (!Number.isFinite(timestamp)) return fallback;
  return TIME_FORMATTER.format(timestamp);
}

export function formatDateInput(value: string, fallback: string) {
  if (!value) return fallback;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? formatDate(timestamp) : fallback;
}
