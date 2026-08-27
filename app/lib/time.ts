export const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function startOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function dateInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function dateRangeTimes(fromDate?: string, toDate?: string) {
  const start = fromDate ? Date.parse(`${fromDate}T00:00:00.000Z`) : undefined;
  const end = toDate ? Date.parse(`${toDate}T23:59:59.999Z`) : undefined;

  return {
    start: Number.isFinite(start) ? start : undefined,
    end: Number.isFinite(end) ? end : undefined,
  };
}
