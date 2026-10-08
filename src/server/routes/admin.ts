import { Router, type Response } from 'express';
import type pg from 'pg';
import { firstError, settingsSchema, systemsUpdateSchema, type AuditEntry } from '../../shared/validation';
import { query, transaction } from '../db';
import { loadSettingsRow, loadSystems, toAdminSettings } from '../data';
import { sendTestReminder } from '../reminder';

export const adminRouter = Router();

async function audit(
  client: pg.PoolClient,
  adminId: number,
  action: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await client.query('INSERT INTO audit_log (admin_id, action, before, after) VALUES ($1, $2, $3, $4)', [
    adminId,
    action,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
  ]);
}

/** Only the fields that differ, so audit entries show what actually changed. */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}

const badRequest = (res: Response, error: string) => res.status(400).json({ error });

adminRouter.get('/me', (req, res) => {
  res.json({ admin: req.admin });
});

adminRouter.get('/settings', async (_req, res) => {
  res.json(toAdminSettings(await loadSettingsRow()));
});

adminRouter.put('/settings', async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return void badRequest(res, firstError(parsed.error));
  const input = {
    ...parsed.data,
    goLiveAt: parsed.data.goLiveAt ? new Date(parsed.data.goLiveAt).toISOString() : null,
    holidays: [...new Set(parsed.data.holidays)].sort(),
    countdownPhases: [...new Set(parsed.data.countdownPhases)].sort(),
    reminderRecipients: [...new Set(parsed.data.reminderRecipients.map((r) => r.toLowerCase()))],
  };

  await transaction(async (client) => {
    const { updatedAt: _u, updatedBy: _b, ...before } = toAdminSettings(await loadSettingsRow());
    const changes = diff(before, input);
    if (!changes.changed) return;
    await client.query(
      `UPDATE settings SET go_live_at = $1, headline = $2, programme_line = $3,
         holidays = $4::date[], reminder_enabled = $5, reminder_recipients = $6, countdown_phases = $8,
         -- a new go-live date re-arms the final "is live" message
         reminder_final_sent = CASE WHEN go_live_at IS DISTINCT FROM $1 THEN false ELSE reminder_final_sent END,
         updated_at = now(), updated_by = $7
       WHERE id = 1`,
      [
        input.goLiveAt,
        input.headline,
        input.programmeLine,
        input.holidays,
        input.reminderEnabled,
        input.reminderRecipients,
        req.admin!.id,
        input.countdownPhases,
      ],
    );
    await audit(client, req.admin!.id, 'settings.update', changes.before, changes.after);
  });

  res.json(toAdminSettings(await loadSettingsRow()));
});

adminRouter.get('/systems', async (_req, res) => {
  res.json(await loadSystems());
});

const FIELD_COLUMNS = { status: 'status', goLive: 'go_live', notes: 'notes' } as const;

/** Sets readiness status, go-live decision or notes on one or more systems. */
adminRouter.patch('/systems', async (req, res) => {
  const parsed = systemsUpdateSchema.safeParse(req.body);
  if (!parsed.success) return void badRequest(res, firstError(parsed.error));
  const { ids, ...change } = parsed.data;
  const field = (Object.keys(change) as (keyof typeof FIELD_COLUMNS)[]).find((k) => change[k] !== undefined)!;
  const column = FIELD_COLUMNS[field];
  const value = change[field] || null;

  const changed = await transaction(async (client) => {
    const { rows } = await client.query<{ code: string; name: string; previous: string | null }>(
      `UPDATE systems s SET ${column} = $1, updated_at = now(), updated_by = $2
       FROM systems old
       WHERE s.id = old.id AND s.id = ANY($3::int[]) AND old.${column} IS DISTINCT FROM $1
       RETURNING s.code, s.name, old.${column} AS previous`,
      [value, req.admin!.id, ids],
    );
    if (rows.length > 0) {
      await audit(
        client,
        req.admin!.id,
        `system.${column}`,
        { systems: rows.map((r) => ({ system: `${r.code} ${r.name}`, [field]: r.previous })) },
        { [field]: value, systems: rows.map((r) => `${r.code} ${r.name}`) },
      );
    }
    return rows.length;
  });
  res.json({ changed, systems: await loadSystems() });
});

adminRouter.post('/reminder/test', async (req, res) => {
  const message = await sendTestReminder(req.admin!.email);
  res.json({ sentTo: req.admin!.email, subject: message.subject });
});

adminRouter.get('/audit', async (_req, res) => {
  const rows = await query<AuditEntry>(
    `SELECT l.id, a.name AS "adminName", a.email AS "adminEmail", l.action, l.before, l.after,
            l.created_at AS "createdAt"
     FROM audit_log l LEFT JOIN admins a ON a.id = l.admin_id
     ORDER BY l.created_at DESC, l.id DESC LIMIT 100`,
  );
  res.json(rows);
});
