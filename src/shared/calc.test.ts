import { describe, expect, it } from 'vitest';
import {
  computeCountdown,
  formatGoLive,
  laggingClusters,
  overallReadiness,
  percent,
  workingDaysBetween,
} from './calc';

const GO_LIVE = Date.parse('2026-10-15T10:00:00Z');

describe('countdown (section 4)', () => {
  it('matches the worked check', () => {
    const c = computeCountdown(Date.parse('2026-10-08T20:00:00Z'), GO_LIVE, []);
    expect(c).toMatchObject({
      isLive: false,
      days: 6,
      hours: 14,
      minutes: 0,
      seconds: 0,
      weeksLeft: 0.9,
      workingDaysLeft: 5,
    });
  });

  it('shows 1 day, 0 hours with go-live in exactly 24 hours', () => {
    const c = computeCountdown(GO_LIVE - 86_400_000, GO_LIVE);
    expect(c).toMatchObject({ days: 1, hours: 0, minutes: 0, seconds: 0 });
  });

  it('shows 0 days 0:00:01 one second before go-live', () => {
    const c = computeCountdown(GO_LIVE - 1000, GO_LIVE);
    expect(c).toMatchObject({ isLive: false, days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  it('switches to days since go-live one second after, with figures at 0', () => {
    const c = computeCountdown(GO_LIVE + 1000, GO_LIVE);
    expect(c).toMatchObject({
      isLive: true,
      days: 0,
      seconds: 1,
      weeksLeft: 0,
      workingDaysLeft: 0,
    });
  });

  it('counts days since go-live upwards', () => {
    const c = computeCountdown(GO_LIVE + 3 * 86_400_000 + 5000, GO_LIVE);
    expect(c).toMatchObject({ isLive: true, days: 3, seconds: 5 });
  });
});

describe('working days', () => {
  const now = Date.parse('2026-10-08T20:00:00Z');

  it('a holiday on a weekday reduces working days by one', () => {
    expect(workingDaysBetween(now, GO_LIVE, ['2026-10-12'])).toBe(4);
  });

  it('a holiday on a Saturday changes nothing', () => {
    expect(workingDaysBetween(now, GO_LIVE, ['2026-10-10'])).toBe(5);
  });

  it('go-live on a Monday counts the previous Friday but not the weekend', () => {
    const mondayGoLive = Date.parse('2026-10-19T10:00:00Z');
    const friday = Date.parse('2026-10-16T08:00:00Z');
    expect(workingDaysBetween(friday, mondayGoLive, [])).toBe(1);
  });

  it('does not count the go-live day itself', () => {
    const morningOf = Date.parse('2026-10-15T07:00:00Z');
    expect(workingDaysBetween(morningOf, GO_LIVE, [])).toBe(0);
  });
});

describe('readiness', () => {
  it('gives 0% with total 0 and no division error', () => {
    expect(percent(0, 0)).toBe(0);
    expect(overallReadiness([{ ready: 0, total: 0 }])).toEqual({ ready: 0, total: 0, percent: 0 });
    expect(overallReadiness([])).toEqual({ ready: 0, total: 0, percent: 0 });
  });

  it('sums ready over total across clusters', () => {
    expect(
      overallReadiness([
        { ready: 3, total: 4 },
        { ready: 1, total: 6 },
      ]),
    ).toEqual({ ready: 4, total: 10, percent: 40 });
  });

  it('flags clusters at 0% or well behind overall', () => {
    const clusters = [
      { name: 'A', ready: 9, total: 10 },
      { name: 'B', ready: 0, total: 5 },
      { name: 'C', ready: 3, total: 10 },
      { name: 'D', ready: 7, total: 10 },
      { name: 'E', ready: 0, total: 0 },
    ];
    // overall = 19/35 = 54%
    expect(laggingClusters(clusters).map((c) => c.name)).toEqual(['B', 'C']);
  });
});

describe('formatting', () => {
  it('writes the go-live date out with GMT', () => {
    expect(formatGoLive('2026-10-15T10:00:00Z')).toBe('Thursday 15 October 2026, 10:00 GMT');
  });
});
