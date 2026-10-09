import bcrypt from 'bcryptjs';
import { hashPassword } from './auth';
import { query } from './db';
import { createApp } from './app';
import { migrate } from './migrations';
import { scheduleReminder } from './reminder';

const port = Number(process.env.PORT ?? 3000);

/**
 * Keeps the admin named in ADMIN_EMAIL / ADMIN_PASSWORD signed-in-able, for hosts with no shell
 * to run `admin:create` (e.g. Render's free plan): creates the account if it is missing, and if
 * it exists, re-activates it and resets its password when ADMIN_PASSWORD has changed.
 */
async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!email || !password) return;
  if (password.length < 12) {
    console.warn('[admin] ADMIN_PASSWORD must be at least 12 characters; admin not created or updated');
    return;
  }
  const [existing] = await query<{ id: number; password_hash: string | null; active: boolean }>(
    'SELECT id, password_hash, active FROM admins WHERE lower(email) = $1',
    [email],
  );
  if (!existing) {
    await query('INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3)', [
      email,
      process.env.ADMIN_NAME?.trim() || 'Admin',
      await hashPassword(password),
    ]);
    console.log(`[admin] Created admin ${email}`);
    return;
  }
  const matches = existing.password_hash ? await bcrypt.compare(password, existing.password_hash) : false;
  if (matches && existing.active) return;
  await query('UPDATE admins SET password_hash = $1, active = true WHERE id = $2', [
    matches ? existing.password_hash : await hashPassword(password),
    existing.id,
  ]);
  console.log(`[admin] Updated admin ${email} to match ADMIN_PASSWORD`);
}

await migrate();
await bootstrapAdmin();
createApp().listen(port, () => {
  console.log(`CLET go-live countdown listening on port ${port}`);
});
scheduleReminder();
