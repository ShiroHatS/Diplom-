import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { emptyProgress, normalizeProgress, validProgress, lessonKeys } from '../shared/progress.js';
import { digest, secret, usernameOf, validUsername, validPassword, hashPassword, verifyPassword, matchesSecret } from './security.js';

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const failure = (res, status, code) => res.status(status).json({ error: code });

export function createApp({ db, origins, secureCookies = false, trustProxy = false, authLimit = 20, apiLimit = 180 }) {
  const app = express();
  const cookieName = secureCookies ? '__Host-lumo_session' : 'lumo_session';
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'lax', path: '/' };
  const allowed = new Set(origins);
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(helmet({ contentSecurityPolicy: false, strictTransportSecurity: secureCookies ? undefined : false }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const origin = req.get('Origin');
    if (origin && !allowed.has(origin)) return failure(res, 403, 'ORIGIN_DENIED');
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.vary('Origin');
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, X-Lumo-Request, X-Lumo-Account');
      return res.sendStatus(204);
    }
    // Формы с другого сайта не могут поставить этот заголовок; Origin сверяется точно.
    if (!['GET', 'HEAD'].includes(req.method) && (!origin || req.get('X-Lumo-Request') !== '1')) return failure(res, 403, 'ORIGIN_DENIED');
    next();
  });
  app.use('/api', express.json({ limit: '96kb', strict: true }));
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: authLimit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => failure(res, 429, 'RATE_LIMITED') });
  const apiLimiter = rateLimit({ windowMs: 60000, limit: apiLimit, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, res) => failure(res, 429, 'RATE_LIMITED') });
  app.use('/api', apiLimiter);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/ready', async (_req, res) => {
    try { await db.query('SELECT 1'); res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  function token(req) {
    const raw = (req.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return raw && /^[A-Za-z0-9_-]{43}$/.test(raw) ? raw : null;
  }
  async function findUser(req) {
    const value = token(req);
    if (!value) return null;
    const result = await db.query('SELECT u.id, u.username FROM lumo_users u JOIN lumo_sessions s ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > now()', [digest(value)]);
    return result.rows[0] || null;
  }
  async function requireUser(req, res, next) {
    req.user = await findUser(req);
    if (!req.user) return failure(res, 401, 'SESSION_EXPIRED');
    if (req.get('X-Lumo-Account') !== req.user.id) return failure(res, 409, 'SESSION_CHANGED');
    next();
  }
  async function snapshot(userId, connection = db) {
    const { rows } = await connection.query('SELECT revision, state, updated_at FROM lumo_progress WHERE user_id = $1', [userId]);
    return { revision: rows[0].revision, progress: normalizeProgress(rows[0].state), updatedAt: new Date(rows[0].updated_at).toISOString() };
  }
  async function newSession(connection, userId) {
    const value = secret();
    await connection.query('INSERT INTO lumo_sessions(token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [digest(value), userId, new Date(Date.now() + SESSION_MS)]);
    await connection.query('DELETE FROM lumo_sessions WHERE user_id = $1 AND token_hash NOT IN (SELECT token_hash FROM lumo_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10)', [userId]);
    return value;
  }
  function setSession(res, value) { res.cookie(cookieName, value, { ...cookieOptions, maxAge: SESSION_MS }); }
  const credentials = req => ({ username: usernameOf(req.body?.username), password: req.body?.password });

  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { username, password } = credentials(req);
    if (!validUsername(username)) return failure(res, 400, 'USERNAME_FORMAT');
    if (!validPassword(password)) return failure(res, 400, 'PASSWORD_LENGTH');
    const passwordHash = await hashPassword(password);
    const recoveryCode = `lumo-${secret()}`;
    const user = { id: randomUUID(), username };
    try {
      const session = await db.transaction(async tx => {
        await tx.query('INSERT INTO lumo_users(id, username, password_hash, recovery_hash) VALUES ($1, $2, $3, $4)', [user.id, username, passwordHash, digest(recoveryCode)]);
        await tx.query('INSERT INTO lumo_progress(user_id, state) VALUES ($1, $2::jsonb)', [user.id, JSON.stringify(emptyProgress())]);
        return newSession(tx, user.id);
      });
      setSession(res, session);
      res.status(201).json({ user, snapshot: await snapshot(user.id), recoveryCode });
    } catch (error) { if (error.code === '23505') return failure(res, 409, 'USERNAME_TAKEN'); throw error; }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { username, password } = credentials(req);
    if (!validUsername(username) || typeof password !== 'string' || Buffer.byteLength(password) > 512) return failure(res, 401, 'INVALID_CREDENTIALS');
    const { rows } = await db.query('SELECT id, username, password_hash FROM lumo_users WHERE username = $1', [username]);
    if (!(await verifyPassword(password, rows[0]?.password_hash))) return failure(res, 401, 'INVALID_CREDENTIALS');
    const user = { id: rows[0].id, username: rows[0].username };
    setSession(res, await db.transaction(tx => newSession(tx, user.id)));
    res.json({ user, snapshot: await snapshot(user.id) });
  });

  app.post('/api/auth/recover', authLimiter, async (req, res) => {
    const { username, password } = credentials(req);
    const recoveryCode = req.body?.recoveryCode;
    if (!validUsername(username) || typeof recoveryCode !== 'string' || !/^lumo-[A-Za-z0-9_-]{43}$/.test(recoveryCode)) return failure(res, 401, 'INVALID_RECOVERY');
    if (!validPassword(password)) return failure(res, 400, 'PASSWORD_LENGTH');
    const { rows } = await db.query('SELECT id, username, recovery_hash FROM lumo_users WHERE username = $1', [username]);
    if (!rows[0] || !matchesSecret(recoveryCode, rows[0].recovery_hash)) return failure(res, 401, 'INVALID_RECOVERY');
    const passwordHash = await hashPassword(password);
    const replacement = `lumo-${secret()}`;
    const session = await db.transaction(async tx => {
      const current = (await tx.query('SELECT recovery_hash FROM lumo_users WHERE id = $1 FOR UPDATE', [rows[0].id])).rows[0];
      if (!matchesSecret(recoveryCode, current.recovery_hash)) return null;
      await tx.query('UPDATE lumo_users SET password_hash = $1, recovery_hash = $2 WHERE id = $3', [passwordHash, digest(replacement), rows[0].id]);
      await tx.query('DELETE FROM lumo_sessions WHERE user_id = $1', [rows[0].id]);
      return newSession(tx, rows[0].id);
    });
    if (!session) return failure(res, 401, 'INVALID_RECOVERY');
    setSession(res, session);
    res.json({ user: { id: rows[0].id, username }, snapshot: await snapshot(rows[0].id), recoveryCode: replacement });
  });

  app.get('/api/session', async (req, res) => {
    const user = await findUser(req);
    res.json(user ? { user, snapshot: await snapshot(user.id) } : { user: null });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const user = await findUser(req);
    if (user && req.get('X-Lumo-Account') !== user.id) return failure(res, 409, 'SESSION_CHANGED');
    const value = token(req);
    if (value) await db.query('DELETE FROM lumo_sessions WHERE token_hash = $1', [digest(value)]);
    res.clearCookie(cookieName, cookieOptions);
    res.json({ ok: true });
  });
  app.get('/api/progress', requireUser, async (req, res) => res.json(await snapshot(req.user.id)));
  app.put('/api/progress', requireUser, async (req, res) => {
    const { revision, progress } = req.body || {};
    if (!Number.isSafeInteger(revision) || revision < 0 || !validProgress(progress)) return failure(res, 400, 'INVALID_PROGRESS');
    const result = await db.transaction(async tx => {
      const current = (await tx.query('SELECT revision, state FROM lumo_progress WHERE user_id = $1 FOR UPDATE', [req.user.id])).rows[0];
      if (current.revision !== revision) return { conflict: true, snapshot: await snapshot(req.user.id, tx) };
      const state = normalizeProgress(progress);
      state.completed = lessonKeys.filter(key => current.state.completed.includes(key) || state.completed.includes(key));
      await tx.query('UPDATE lumo_progress SET state = $1::jsonb, revision = revision + 1, updated_at = now() WHERE user_id = $2', [JSON.stringify(state), req.user.id]);
      return { snapshot: await snapshot(req.user.id, tx) };
    });
    res.status(result.conflict ? 409 : 200).json(result.conflict ? { error: 'VERSION_CONFLICT', ...result.snapshot } : result.snapshot);
  });
  app.use('/api', (_req, res) => failure(res, 404, 'NOT_FOUND'));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') return failure(res, 413, 'INVALID_PROGRESS');
    if (error instanceof SyntaxError && error.status === 400) return failure(res, 400, 'INVALID_REQUEST');
    if (error.code === 'SERVER_BUSY') return failure(res, 503, 'SERVER_BUSY');
    // Тело запроса, пароли, cookies и строки подключения не попадают в журналы.
    console.error('API request failed:', typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR');
    failure(res, 500, 'SERVER_ERROR');
  });
  return app;
}
