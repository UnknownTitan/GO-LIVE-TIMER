import { describe, expect, it } from 'vitest';
import { normalise } from './Countdown';

describe('normalise countdown data', () => {
  it('fills in fields missing from data saved by an older version of the page', () => {
    const old = {
      goLiveAt: '2026-10-15T10:00:00.000Z',
      headline: 'Countdown to Phase 1 Go-Live',
      programmeLine: 'CLET',
      sprintWeeks: 2,
      holidays: [],
      clusters: [{ id: 1, name: 'Licensing', ready: 3, total: 5 }],
      readinessUpdatedAt: null,
    };
    expect(normalise(old)?.clusters[0]).toEqual({
      id: 1,
      name: 'Licensing',
      ready: 3,
      total: 5,
      readySystems: [],
      liveSystems: [],
    });
  });

  it('rejects data that is not an object', () => {
    expect(normalise(null)).toBeNull();
    expect(normalise('x')).toBeNull();
  });
});
