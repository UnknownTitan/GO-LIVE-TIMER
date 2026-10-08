import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { createSession, destroySession, loginLimiter, requireAdmin, verifyCredentials } from './auth';
import { loadCountdownData } from './data';
import { firstError, loginSchema } from '../shared/validation';
import { adminRouter } from './routes/admin';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind the platform's HTTPS proxy
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/countdown', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await loadCountdownData());
  });

  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) });
    const admin = await verifyCredentials(parsed.data.email, parsed.data.password);
    if (!admin) return void res.status(401).json({ error: 'Email or password is incorrect' });
    await createSession(res, admin.id);
    res.json({ admin });
  });

  app.post('/api/auth/logout', requireAdmin, async (req, res) => {
    await destroySession(req, res);
    res.status(204).end();
  });

  app.use('/api/admin', requireAdmin, adminRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Serve the built frontend, falling back to index.html for client routes.
  const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
  app.use(onError);

  return app;
}
