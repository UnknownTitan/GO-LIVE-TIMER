// Calculation rules from section 4 of the development plan.
// Everything is computed in UTC (Africa/Accra is UTC+0 with no daylight saving),
// always from the current time rather than a ticking counter.

export const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

export interface Cluster {
  id: number;
  name: string;
  ready: number;
  total: number;
}

export interface Countdown {
  /** True once now >= go-live. */
  isLive: boolean;
  /** Whole days left before go-live, or whole days since go-live once live. */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  weeksLeft: number;
  workingDaysLeft: number;
}

/** Start of the UTC calendar day containing `ms`. */
function utcDayStart(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** ISO date string (YYYY-MM-DD) of the UTC day containing `ms`. */
export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Monday to Friday dates from today (inclusive) up to but not including the
 * go-live date, minus listed holidays that fall on those dates.
 */
export function workingDaysBetween(nowMs: number, goLiveMs: number, holidays: string[]): number {
  const holidaySet = new Set(holidays);
  const end = utcDayStart(goLiveMs);
  let count = 0;
  for (let day = utcDayStart(nowMs); day < end; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    if (holidaySet.has(isoDate(day))) continue;
    count++;
  }
  return count;
}

export function computeCountdown(
  now: Date | number,
  goLiveAt: Date | number,
  holidays: string[] = [],
): Countdown {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const goLiveMs = typeof goLiveAt === 'number' ? goLiveAt : goLiveAt.getTime();
  const isLive = nowMs >= goLiveMs;
  const diff = Math.abs(goLiveMs - nowMs);

  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((diff % MINUTE_MS) / 1000);

  if (isLive) {
    return { isLive, days, hours, minutes, seconds, weeksLeft: 0, workingDaysLeft: 0 };
  }

  return {
    isLive,
    days,
    hours,
    minutes,
    seconds,
    // Rounded down to one decimal so "1.0 weeks" never shows with under a week left.
    weeksLeft: Math.floor((diff / (7 * DAY_MS)) * 10) / 10,
    workingDaysLeft: workingDaysBetween(nowMs, goLiveMs, holidays),
  };
}

/** ready / total as a whole percentage; 0 when total is 0. */
export function percent(ready: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((ready / total) * 100);
}

export interface Readiness {
  ready: number;
  total: number;
  percent: number;
}

export function overallReadiness(clusters: Pick<Cluster, 'ready' | 'total'>[]): Readiness {
  const ready = clusters.reduce((sum, c) => sum + c.ready, 0);
  const total = clusters.reduce((sum, c) => sum + c.total, 0);
  return { ready, total, percent: percent(ready, total) };
}

/** Percentage points below the overall figure at which a cluster counts as "well behind". */
export const WELL_BEHIND_POINTS = 20;

/** Clusters at 0% or well behind the overall readiness figure. */
export function laggingClusters<T extends Pick<Cluster, 'ready' | 'total'>>(clusters: T[]): T[] {
  const overall = overallReadiness(clusters).percent;
  return clusters.filter((c) => {
    if (c.total === 0) return false;
    const p = percent(c.ready, c.total);
    return p === 0 || overall - p >= WELL_BEHIND_POINTS;
  });
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** e.g. "Thursday 15 October 2026, 10:00 GMT" */
export function formatGoLive(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${DATE_FORMAT.format(d).replace(',', '')}, ${TIME_FORMAT.format(d)} GMT`;
}

/** e.g. "9 October 2026" */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
