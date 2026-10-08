import { describe, expect, it } from 'vitest';
import { composeReminder, type ReminderInput } from './reminder-message';

const base: ReminderInput = {
  now: new Date('2026-10-08T18:00:00Z'),
  goLiveAt: new Date('2026-10-15T10:00:00Z'),
  holidays: [],
  clusters: [
    { id: 1, name: 'Licensing', ready: 8, total: 10 },
    { id: 2, name: 'Finance', ready: 0, total: 4 },
    { id: 3, name: 'Registry', ready: 5, total: 6 },
  ],
  readinessUpdatedAt: '2026-10-08T16:30:00Z',
};

describe('composeReminder', () => {
  it('writes the daily status with days, working days and readiness', () => {
    const m = composeReminder(base);
    expect(m.kind).toBe('status');
    expect(m.subject).toBe('CLET go-live: 6 days to go');
    expect(m.text).toContain('Go-live: Thursday 15 October 2026, 10:00 GMT');
    expect(m.text).toContain('Working days left: 5');
    expect(m.text).not.toMatch(/sprint/i);
    expect(m.text).toContain('Readiness: 13 of 20 systems ready (65%)');
    expect(m.text).toContain('Finance: 0 of 4 (0%)');
    expect(m.text).not.toContain('Licensing:');
    expect(m.text).toContain('Figures last updated 8 October 2026.');
  });

  it('tells the admins when no go-live date is set', () => {
    const m = composeReminder({ ...base, goLiveAt: null });
    expect(m.kind).toBe('no-date');
    expect(m.text).toContain('no go-live date is set');
  });

  it('sends the final "is live" message after go-live', () => {
    const m = composeReminder({ ...base, now: new Date('2026-10-15T18:00:00Z') });
    expect(m.kind).toBe('live');
    expect(m.subject).toBe('CLET Phase 1 is live');
    expect(m.text).toContain('final daily reminder');
  });

  it('handles no clusters', () => {
    const m = composeReminder({ ...base, clusters: [] });
    expect(m.text).toContain('no clusters entered yet');
  });
});
