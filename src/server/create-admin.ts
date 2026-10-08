// CLI: npm run admin:create -- <email> "<Full Name>"
// Prompts for the password (or reads ADMIN_PASSWORD). Re-running for an existing email resets
// the password and reactivates the account. Pass --deactivate to switch an admin off instead.
import { createInterface } from 'node:readline/promises';
import { hashPassword } from './auth';
import { pool, query } from './db';
import { migrate } from './migrations';

async function promptPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question('Password (min 12 characters): ');
  rl.close();
  return password;
}

async function main() {
  const args = process.argv.slice(2);
  const deactivate = args.includes('--deactivate');
  const [email, name] = args.filter((a) => !a.startsWith('--'));
  if (!email || (!deactivate && !name)) {
    console.error('Usage: npm run admin:create -- <email> "<Full Name>"\n       npm run admin:create -- <email> --deactivate');
    process.exitCode = 1;
    return;
  }
  await migrate();

  if (deactivate) {
    const rows = await query('UPDATE admins SET active = false WHERE lower(email) = lower($1) RETURNING id', [email]);
    await query('DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE lower(email) = lower($1))', [email]);
    console.log(rows.length ? `Deactivated ${email}` : `No admin with email ${email}`);
    return;
  }

  const password = await promptPassword();
  if (password.length < 12) {
    console.error('Password must be at least 12 characters');
    process.exitCode = 1;
    return;
  }
  await query(
    `INSERT INTO admins (email, name, password_hash, active) VALUES (lower($1), $2, $3, true)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, active = true`,
    [email, name, await hashPassword(password)],
  );
  console.log(`Admin ${email} is ready to sign in`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
