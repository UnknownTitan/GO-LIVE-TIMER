// API tests against a real PostgreSQL database (TEST_DATABASE_URL, default golive_test).
// The database is wiped and re-migrated at the start of the run.
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://localhost:5432/golive_test';
process.env.REMINDER_CRON_ENABLED = 'false';

const { pool, query } = await import('./db');
const { migrate } = await import('./migrations');
const { hashPassword } = await import('./auth');
const { createApp } = await import('./app');

const app = createApp();
const ADMIN = { email: 'sm@example.org', password: 'correct-horse-battery' };
let cookie: string[];

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  // Start from the workplan's defaults, not the readiness snapshot (migration 007).
  await query(`UPDATE systems SET status = 'not_ready', go_live = 'tbd', updated_at = NULL, updated_by = NULL`);
  await query(`UPDATE systems SET notes = NULL WHERE notes LIKE 'Release 1%' OR notes LIKE 'Follows after%'
    OR notes LIKE 'Audit trail (CALS)%' OR notes LIKE 'HRMS (minimal)%' OR notes LIKE 'Not ready for Release 1%'`);
  await query('INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3)', [
    ADMIN.email,
    'Scrum Master',
    await hashPassword(ADMIN.password),
  ]);
  const res = await request(app).post('/api/auth/login').send(ADMIN).expect(200);
  cookie = res.headers['set-cookie'] as unknown as string[];
});

afterAll(() => pool.end());

describe('public countdown endpoint', () => {
  it('returns settings and clusters without private data', async () => {
    const res = await request(app).get('/api/countdown').expect(200);
    expect(res.body).toMatchObject({
      goLiveAt: '2026-10-15T10:00:00.000Z',
      headline: 'Countdown to Phase 1 Go-Live',
      holidays: [],
      readinessUpdatedAt: null,
    });
    expect(res.body.clusters).toHaveLength(12);
    const totals = res.body.clusters.reduce((n: number, c: { total: number }) => n + c.total, 0);
    expect(totals).toBe(95);
    expect(res.body.clusters[0]).toMatchObject({ name: 'C1 · Governance, Board, Statutory & Records', ready: 0, total: 10 });
    expect(JSON.stringify(res.body)).not.toMatch(/@|recipient/i);
    expect(res.body.systems).toHaveLength(252);
    expect(Object.keys(res.body.systems[0]).sort()).toEqual(
      ['clusterCode', 'code', 'goLive', 'inCountdown', 'name', 'phase', 'status'],
    );
    expect(res.body.countdownPhases).toEqual(['1A', '1B']);
    expect(res.body.clusterNames).toHaveLength(13);
  });
});

describe('admin access', () => {
  it('rejects viewers with 401', async () => {
    await request(app).get('/api/admin/settings').expect(401);
    await request(app).put('/api/admin/settings').send({}).expect(401);
    await request(app).patch('/api/admin/systems').send({ ids: [1], status: 'ready' }).expect(401);
    await request(app).get('/api/admin/audit').expect(401);
  });

  it('sets an HTTP-only SameSite=Lax session cookie', () => {
    expect(cookie[0]).toMatch(/HttpOnly/);
    expect(cookie[0]).toMatch(/SameSite=Lax/);
  });

  it('allows a signed-in admin', async () => {
    const res = await request(app).get('/api/admin/me').set('Cookie', cookie).expect(200);
    expect(res.body.admin.email).toBe(ADMIN.email);
  });
});

describe('settings', () => {
  const valid = {
    goLiveAt: '2026-10-16T09:30:00Z',
    headline: 'Countdown to Phase 1 Go-Live',
    programmeLine: 'CLET Digital Transformation Programme · Phase 1',
    holidays: ['2026-10-12'],
    countdownPhases: ['1A', '1B'],
    reminderEnabled: true,
    reminderRecipients: ['team@example.org'],
  };

  it('saves, shows publicly and writes an audit entry', async () => {
    await request(app).put('/api/admin/settings').set('Cookie', cookie).send(valid).expect(200);
    const pub = await request(app).get('/api/countdown');
    expect(pub.body.goLiveAt).toBe('2026-10-16T09:30:00.000Z');
    expect(pub.body.holidays).toEqual(['2026-10-12']);
    const audit = await request(app).get('/api/admin/audit').set('Cookie', cookie);
    expect(audit.body[0]).toMatchObject({ action: 'settings.update', adminEmail: ADMIN.email });
    expect(audit.body[0].after.goLiveAt).toBe('2026-10-16T09:30:00.000Z');
  });

  it('validates per section 4', async () => {
    const put = (body: object) => request(app).put('/api/admin/settings').set('Cookie', cookie).send({ ...valid, ...body });
    expect((await put({ holidays: ['2026-02-30'] }).expect(400)).body.error).toMatch(/valid date/);
    expect((await put({ countdownPhases: [] }).expect(400)).body.error).toMatch(/at least one phase/);
    expect((await put({ headline: 'x'.repeat(91) }).expect(400)).body.error).toMatch(/90/);
    expect((await put({ programmeLine: 'x'.repeat(141) }).expect(400)).body.error).toMatch(/140/);
    await put({ reminderRecipients: ['not-an-email'] }).expect(400);
  });
});

describe('systems readiness board', () => {
  it('lists all 252 workplan systems, with Phase 1 in the countdown', async () => {
    const res = await request(app).get('/api/admin/systems').set('Cookie', cookie).expect(200);
    expect(res.body).toHaveLength(252);
    expect(res.body.filter((s: { inCountdown: boolean }) => s.inCountdown)).toHaveLength(95);
    expect(res.body.filter((s: { phase: string }) => s.phase === '4A')).toHaveLength(27);
    expect(res.body.filter((s: { phase: string }) => s.phase === '1B')).toHaveLength(12);
    expect(res.body[0]).toMatchObject({ code: 'S001', name: 'Governance Portal', clusterCode: 'C1', status: 'not_ready', goLive: 'tbd' });
  });

  it('sets readiness, updates cluster counts and audits it', async () => {
    const all = (await request(app).get('/api/admin/systems').set('Cookie', cookie)).body as { id: number; code: string }[];
    const id = (code: string) => all.find((s) => s.code === code)!.id;
    const patch = (ids: number[], change: object) =>
      request(app).patch('/api/admin/systems').set('Cookie', cookie).send({ ids, ...change });

    expect((await patch([id('S001'), id('S002'), id('S027')], { status: 'ready' }).expect(200)).body.changed).toBe(3);
    expect((await patch([id('S002'), id('S003')], { status: 'live' }).expect(200)).body.changed).toBe(2);
    await patch([id('S008')], { status: 'in_progress' }).expect(200);

    const pub = await request(app).get('/api/countdown');
    expect(pub.body.clusters[0]).toMatchObject({
      ready: 3, // ready or live; in progress does not count
      total: 10,
      readySystems: [{ code: 'S001', name: 'Governance Portal' }],
      liveSystems: [
        { code: 'S002', name: 'Board Document Management System' },
        { code: 'S003', name: 'Records Management System (System 05)' },
      ],
    });
    expect(pub.body.clusters[1]).toMatchObject({ readySystems: [], liveSystems: [] });
    expect(pub.body.readinessUpdatedAt).not.toBeNull();

    // Setting the value a system already has changes nothing and writes no audit entry.
    expect((await patch([id('S001')], { status: 'ready' })).body.changed).toBe(0);

    await patch([id('S027')], { status: 'not_ready' }).expect(200);
    const audit = await request(app).get('/api/admin/audit').set('Cookie', cookie);
    expect(audit.body[0]).toMatchObject({
      action: 'system.status',
      before: { systems: [{ system: 'S027 NLEMS / Student Information System (System 01)', status: 'ready' }] },
      after: { status: 'not_ready', systems: ['S027 NLEMS / Student Information System (System 01)'] },
    });
  });

  it('leaves systems decided "no" out of the countdown', async () => {
    const all = (await request(app).get('/api/admin/systems').set('Cookie', cookie)).body as { id: number; code: string }[];
    const ids = all.filter((s) => ['S016', 'S017'].includes(s.code)).map((s) => s.id);
    await request(app).patch('/api/admin/systems').set('Cookie', cookie).send({ ids, goLive: 'no' }).expect(200);
    const pub = await request(app).get('/api/countdown');
    expect(pub.body.clusters[0].total).toBe(8);
    const audit = await request(app).get('/api/admin/audit').set('Cookie', cookie);
    expect(audit.body[0]).toMatchObject({ action: 'system.go_live', after: { goLive: 'no' } });
  });

  it('counts only the chosen phases on the countdown', async () => {
    const settings = (await request(app).get('/api/admin/settings').set('Cookie', cookie)).body;
    const { updatedAt: _a, updatedBy: _b, ...body } = settings;
    await request(app).put('/api/admin/settings').set('Cookie', cookie).send({ ...body, countdownPhases: ['2A'] }).expect(200);
    const pub = await request(app).get('/api/countdown');
    const total = pub.body.clusters.reduce((n: number, c: { total: number }) => n + c.total, 0);
    expect(total).toBe(26);
    await request(app).put('/api/admin/settings').set('Cookie', cookie).send({ ...body, countdownPhases: ['1A', '1B'] }).expect(200);
  });

  it('counts a system set to "yes" even when it is outside the countdown phases', async () => {
    const all = (await request(app).get('/api/admin/systems').set('Cookie', cookie)).body as { id: number; code: string }[];
    const s007 = all.find((s) => s.code === 'S007')!.id; // Tribunal, phase 2A
    const before = (await request(app).get('/api/countdown')).body.clusters[0].total;
    await request(app).patch('/api/admin/systems').set('Cookie', cookie).send({ ids: [s007], goLive: 'yes' }).expect(200);
    const pub = (await request(app).get('/api/countdown')).body;
    expect(pub.clusters[0].total).toBe(before + 1);
    expect(pub.systems.find((s: { code: string }) => s.code === 'S007').inCountdown).toBe(true);
    await request(app).patch('/api/admin/systems').set('Cookie', cookie).send({ ids: [s007], goLive: 'tbd' }).expect(200);
  });

  it('edits notes on one system', async () => {
    const all = (await request(app).get('/api/admin/systems').set('Cookie', cookie)).body as { id: number; code: string }[];
    const s001 = all.find((s) => s.code === 'S001')!.id;
    const res = await request(app).patch('/api/admin/systems').set('Cookie', cookie).send({ ids: [s001], notes: '  UAT signed off ' });
    expect(res.status).toBe(200);
    expect(res.body.systems.find((s: { id: number }) => s.id === s001).notes).toBe('UAT signed off');
    await request(app).patch('/api/admin/systems').set('Cookie', cookie).send({ ids: [s001], notes: '' }).expect(200);
    const after = await request(app).get('/api/admin/systems').set('Cookie', cookie);
    expect(after.body.find((s: { id: number }) => s.id === s001).notes).toBeNull();
  });

  it('rejects bad input', async () => {
    const patch = (body: object) => request(app).patch('/api/admin/systems').set('Cookie', cookie).send(body);
    await patch({ ids: [], status: 'ready' }).expect(400);
    await patch({ ids: ['x'], status: 'ready' }).expect(400);
    await patch({ ids: [1], status: 'done' }).expect(400);
    await patch({ ids: [1], goLive: 'maybe' }).expect(400);
    await patch({ ids: [1] }).expect(400);
    await patch({ ids: [1], status: 'ready', goLive: 'yes' }).expect(400);
    await patch({ ids: [1, 2], notes: 'x' }).expect(400);
  });
});

describe('sign-in', () => {
  it('signs out and the session stops working', async () => {
    const login = await request(app).post('/api/auth/login').send(ADMIN).expect(200);
    const c = login.headers['set-cookie'] as unknown as string[];
    await request(app).post('/api/auth/logout').set('Cookie', c).expect(204);
    await request(app).get('/api/admin/me').set('Cookie', c).expect(401);
  });

  it('blocks the 6th failed attempt in 15 minutes', async () => {
    const bad = { email: ADMIN.email, password: 'wrong-password' };
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/auth/login').send(bad);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Email or password is incorrect');
    }
    await request(app).post('/api/auth/login').send(bad).expect(429);
  });
});
