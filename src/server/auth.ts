import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { query } from './db';

export const SESSION_COOKIE = 'golive_session';
const SESSION_HOURS = 12;

export interface Admin {
  id: number;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: Admin;
    }
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export async function verifyCredentials(email: string, password: string): Promise<Admin | null> {
  const [row] = await query<Admin & { password_hash: string | null }>(
    'SELECT id, email, name, password_hash FROM admins WHERE lower(email) = $1 AND active',
    [email.toLowerCase()],
  );
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !row.password_hash || !ok) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export async function createSession(res: Response, adminId: number): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  await query('DELETE FROM sessions WHERE expires_at < now()');
  await query('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, $3)', [
    hashToken(token),
    adminId,
    expires,
  ]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Rejects with 401 unless the request carries a live session for an active admin. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const [admin] = await query<Admin>(
      `SELECT a.id, a.email, a.name FROM sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND a.active`,
      [hashToken(token)],
    );
    if (admin) {
      req.admin = admin;
      return next();
    }
  }
  res.status(401).json({ error: 'Sign in required' });
}

/** 5 failed attempts per 15 minutes per client; the 6th is blocked. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many failed sign-in attempts. Try again in 15 minutes.' },
});

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
