// Daily 18:00 Africa/Accra reminder job (FR6, GL-9) and the admin test send (GL-10).
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { query } from './db';
import { loadClusters, loadSettingsRow } from './data';
import { composeReminder, type ReminderMessage } from './reminder-message';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5 * 60_000;

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMail(to: string[], message: ReminderMessage): Promise<void> {
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM ?? 'CLET Go-Live Countdown <no-reply@localhost>',
    to,
    subject: message.subject,
    text: message.text,
  });
  if (!process.env.SMTP_HOST) {
    console.log(`[reminder] SMTP_HOST not set; message not sent. Would send to ${to.join(', ')}:\n${message.subject}\n${message.text}`);
  } else {
    console.log(`[reminder] Sent "${message.subject}" to ${to.length} recipient(s) (${info.messageId})`);
  }
}

/** Sends once, then retries up to 3 more times at 5-minute intervals. */
async function sendWithRetry(to: string[], message: ReminderMessage): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await sendMail(to, message);
      return true;
    } catch (err) {
      const remaining = RETRY_ATTEMPTS - attempt;
      console.error(
        `[reminder] Send failed (attempt ${attempt + 1}): ${(err as Error).message}` +
          (remaining > 0 ? `; retrying in ${RETRY_DELAY_MS / 60_000} minutes` : '; giving up for today'),
      );
      if (remaining > 0) await sleep(RETRY_DELAY_MS);
    }
  }
  return false;
}

export async function buildTodaysMessage(now = new Date()): Promise<ReminderMessage> {
  const [settings, { clusters, updatedAt }] = await Promise.all([loadSettingsRow(), loadClusters()]);
  return composeReminder({
    now,
    goLiveAt: settings.go_live_at,
    holidays: settings.holidays,
    clusters,
    readinessUpdatedAt: updatedAt,
    appUrl: process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL,
  });
}

/** The scheduled run. Exported so it can be triggered by an external scheduler instead. */
export async function runDailyReminder(now = new Date()): Promise<void> {
  const settings = await loadSettingsRow();
  if (!settings.reminder_enabled) {
    console.log('[reminder] Disabled in settings; skipping');
    return;
  }
  if (settings.reminder_final_sent) {
    console.log('[reminder] Final "is live" message already sent; nothing to do');
    return;
  }

  const message = await buildTodaysMessage(now);

  if (message.kind === 'no-date') {
    const admins = await query<{ email: string }>('SELECT email FROM admins WHERE active');
    if (admins.length === 0) return console.warn('[reminder] No go-live date and no active admins to notify');
    await sendWithRetry(admins.map((a) => a.email), message);
    return;
  }

  const recipients = settings.reminder_recipients;
  if (recipients.length === 0) {
    console.warn('[reminder] No reminder recipients configured; skipping');
    return;
  }

  const sent = await sendWithRetry(recipients, message);
  if (sent && message.kind === 'live') {
    await query('UPDATE settings SET reminder_final_sent = true WHERE id = 1');
    console.log('[reminder] Final message sent; reminder job has stopped itself');
  }
}

export async function sendTestReminder(to: string): Promise<ReminderMessage> {
  const message = await buildTodaysMessage();
  await sendMail([to], { ...message, subject: `[Test] ${message.subject}` });
  return message;
}

export function scheduleReminder(): void {
  if (process.env.REMINDER_CRON_ENABLED === 'false') {
    console.log('[reminder] Cron disabled by REMINDER_CRON_ENABLED=false');
    return;
  }
  // No catch-up: a day missed while the process was down is not sent late.
  cron.schedule(
    '0 18 * * *',
    () => {
      runDailyReminder().catch((err) => console.error('[reminder] Run failed:', err));
    },
    { timezone: 'Africa/Accra', name: 'daily-reminder' },
  );
  console.log('[reminder] Scheduled daily at 18:00 Africa/Accra');
}
