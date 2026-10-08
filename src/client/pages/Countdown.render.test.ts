// Renders the viewer dashboard to HTML with realistic data, to catch runtime errors
// and check the key sections appear.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { computeCountdown } from '../../shared/calc';
import type { CountdownData, PublicSystem } from '../../shared/validation';
import { Dashboard, normalise, TileDetail } from './Countdown';

const systems: PublicSystem[] = [
  { code: 'S001', name: 'Governance Portal', clusterCode: 'C1', phase: '1A', status: 'live', goLive: 'yes', inCountdown: true },
  { code: 'S002', name: 'Board Document Management System', clusterCode: 'C1', phase: '1A', status: 'ready', goLive: 'yes', inCountdown: true },
  { code: 'S003', name: 'Records Management System', clusterCode: 'C1', phase: '1A', status: 'not_ready', goLive: 'tbd', inCountdown: true },
  { code: 'S027', name: 'NLEMS', clusterCode: 'C3', phase: '1B', status: 'in_progress', goLive: 'tbd', inCountdown: true },
  { code: 'S004', name: 'Digital Archiving System', clusterCode: 'C1', phase: '2A', status: 'not_ready', goLive: 'tbd', inCountdown: false },
];

const data = normalise({
  goLiveAt: '2026-10-15T10:00:00.000Z',
  headline: 'Countdown to Phase 1 Go-Live',
  programmeLine: 'CLET Digital Transformation Programme · Phase 1',
  holidays: [],
  clusters: [],
  readinessUpdatedAt: '2026-10-08T16:30:00.000Z',
  countdownPhases: ['1A', '1B'],
  clusterNames: [
    { code: 'C1', name: 'Governance, Board, Statutory & Records' },
    { code: 'C3', name: 'Student & Academic Lifecycle' },
  ],
  systems,
}) as CountdownData;

const render = (now: string) =>
  renderToStaticMarkup(
    createElement(Dashboard, { data, c: computeCountdown(Date.parse(now), Date.parse(data.goLiveAt!), []) }),
  );

describe('viewer dashboard', () => {
  it('renders the countdown, tiles, charts, table and lists', () => {
    const html = render('2026-10-08T20:00:00Z');
    expect(html).toContain('Go-live countdown');
    expect(html).toContain('This go-live');
    expect(html).not.toContain('Readiness by phase');
    expect(html).not.toContain('Systems by status');
    expect(html).toContain('This go-live by cluster');
    expect(html).not.toContain('Already live');
    expect(html).not.toContain('Going live this release');
    expect(html).not.toContain('Needs attention');
    // Four systems are in this go-live; the phase 2A system is not.
    expect(html).toMatch(/class="tile-value">4</);
  });

  it('switches to "Live for" after go-live', () => {
    expect(render('2026-10-16T10:00:00Z')).toContain('Live for');
  });

  it('renders with no systems at all', () => {
    const empty = { ...data, systems: [], clusterNames: [] };
    const html = renderToStaticMarkup(createElement(Dashboard, { data: empty, c: null }));
    expect(html).toContain('The go-live date has not been set yet.');
  });
});

describe('summary card detail', () => {
  it('makes each summary card a button that opens its systems', () => {
    const html = render('2026-10-08T20:00:00Z');
    expect(html.match(/<button type="button" class="tile"[^>]*aria-haspopup="dialog"/g)).toHaveLength(6);
  });

  it('lists the systems behind a card, grouped by cluster', () => {
    const ready = systems.filter((s) => s.status === 'ready');
    const html = renderToStaticMarkup(
      createElement(TileDetail, {
        title: 'Ready',
        subtitle: 'Ready systems in this go-live.',
        systems: ready,
        clusterNames: data.clusterNames,
        showStatus: false,
        onClose: () => {},
      }),
    );
    expect(html).toContain('Board Document Management System');
    expect(html).toContain('Governance, Board, Statutory &amp; Records');
    expect(html).not.toContain('NLEMS');
    expect(html).toContain('1 system');
    expect(html).toMatch(/^<dialog/);
  });
});
