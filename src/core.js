import { createRouter } from './router.js';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const deriveKey = promisify(scrypt);
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function text(value, name, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    fail(400, name + ' must be a non-empty string, at most ' + max + ' characters');
  return value.trim();
}
export function integer(value, name, min = 1, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(400, name + ' must be an integer between ' + min + ' and ' + max);
  return value;
}
export function id(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) fail(400, 'Invalid ID');
  return integer(Number(value), 'ID', 1, Number.MAX_SAFE_INTEGER);
}
export function page(query) {
  const parse = (v, fallback, max) => v === undefined ? fallback : integer(id(v), 'pagination', 1, max);
  return { limit: parse(query.limit, 20, 100), offset: (parse(query.page, 1, 1000000) - 1) * parse(query.limit, 20, 100) };
}
export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
const hashToken = value => createHash('sha256').update(value).digest('hex');
export function createCore(databasePath, adminKey) {
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, salt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
  `);
  const app = createRouter();
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (['POST', 'PUT', 'PATCH'].includes(req.method) &&
        (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)))
      return next(Object.assign(new Error('Send a JSON object with Content-Type: application/json'), { status: 400 }));
    next();
  });
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  function credentials(body) {
    const email = text(body.email, 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Invalid email');
    if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128)
      fail(400, 'Password must contain 10-128 characters');
    return { email, password: body.password };
  }
  app.post('/auth/register', async (req, res) => {
    const { email, password } = credentials(req.body);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await deriveKey(password, salt, 64)).toString('hex');
    try {
      const result = db.prepare('INSERT INTO users(email, password_hash, salt) VALUES(?, ?, ?)').run(email, passwordHash, salt);
      res.status(201).json({ id: Number(result.lastInsertRowid), email });
    } catch (error) {
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) fail(409, 'Email already registered');
      throw error;
    }
  });
  app.post('/auth/login', async (req, res) => {
    const { email, password } = credentials(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Derive a key even when the account is absent.
    const candidate = await deriveKey(password, user?.salt ?? '00000000000000000000000000000000', 64);
    if (!user || !timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))) fail(401, 'Invalid credentials');
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?, ?, ?)').run(hashToken(token), user.id, expiresAt);
    res.json({ token, token_type: 'Bearer', expires_at: new Date(expiresAt).toISOString() });
  });
  function auth(req, res, next) {
    const header = req.get('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hashToken(token), Date.now());
    if (!session) return next(Object.assign(new Error('Authentication required'), { status: 401 }));
    req.userId = session.user_id;
    req.tokenHash = hashToken(token);
    next();
  }
  function admin(req, res, next) {
    if (!adminKey) return next(Object.assign(new Error('Admin access is not configured'), { status: 503 }));
    const supplied = req.get('X-Admin-Key') ?? '';
    if (!timingSafeEqual(Buffer.from(hashToken(supplied)), Buffer.from(hashToken(adminKey))))
      return next(Object.assign(new Error('Admin key required'), { status: 403 }));
    next();
  }
  app.post('/auth/logout', auth, (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.tokenHash);
    res.status(204).end();
  });
  function finish() {
    app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
    app.use((error, req, res, next) => {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : error.status === 503 ? 503 : 500;
      if (status === 500) console.error(error);
      res.status(status).json({ error: status === 500 ? 'Internal server error' : error.type === 'entity.parse.failed' ? 'Invalid JSON' : error.message });
    });
    return { app, db };
  }
  return { app, db, auth, admin, finish };
}

