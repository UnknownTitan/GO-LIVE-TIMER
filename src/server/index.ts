import { hashPassword } from './auth';
import { query } from './db';
import { createApp } from './app';
import { migrate } from './migrations';
import { scheduleReminder } from './reminder';

const port = Number(process.env.PORT ?? 3000);

/**
 * Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when that email has no account yet,
 * for hosts with no shell to run `admin:create` (e.g. Render's free plan). Never changes an
 * existing account.
 */
async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) {
    console.warn('[admin] ADMIN_PASSWORD must be at least 12 characters; no admin created');
    return;
  }
  const rows = await query(
    `INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    [email, process.env.ADMIN_NAME?.trim() || 'Admin', await hashPassword(password)],
  );
  if (rows.length) console.log(`[admin] Created admin ${email}`);
}

await migrate();
await bootstrapAdmin();
createApp().listen(port, () => {
  console.log(`CLET go-live countdown listening on port ${port}`);
});
scheduleReminder();
