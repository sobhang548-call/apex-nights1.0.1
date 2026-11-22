import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Database from 'better-sqlite3';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SESSION_COOKIE = 'apex_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const scryptAsync = promisify(scrypt);
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const PUBLIC_FILES = new Set(['auth.js', 'index.html', 'styles.css']);
const PUBLIC_DIRECTORIES = new Set(['src', 'vendor']);
const DEFAULT_SETTINGS = {
  allowRegistration: true,
  announcement: '',
  defaultQuality: 'medium',
  defaultTimeSpeed: 'normal',
  maintenanceMode: false,
};

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function serializeAccount(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

function settingsFromDatabase(db) {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const values = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key === 'allowRegistration' || key === 'maintenanceMode') values[key] = value === 'true';
    else if (key === 'defaultQuality' || key === 'defaultTimeSpeed' || key === 'announcement') values[key] = value;
  }
  return values;
}

function initializeDatabase(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'player')),
      disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS game_saves (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      save_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const addSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    addSetting.run(key, String(value));
  }
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

function sendJson(response, status, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(body);
}

function parseCookies(header = '') {
  const cookies = new Map();
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function sessionCookie(token, secure) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure ? '; Secure' : ''}`;
}

function clearSessionCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}

async function readJson(request) {
  const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    const error = new Error('Content-Type must be application/json.');
    error.status = 415;
    throw error;
  }
  const declaredLength = Number(request.headers['content-length'] || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    const error = new Error('Request body is too large.');
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Expected an object.');
    return value;
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.status = 400;
    throw error;
  }
}

function validateOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function usernameError(username) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,24}$/.test(username)) {
    return 'Username must be 3–24 characters and contain only letters, numbers, dots, underscores, or hyphens.';
  }
  return null;
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be between 12 and 128 characters.';
  }
  return null;
}

async function makePasswordHash(password, salt = randomBytes(16)) {
  const hash = await scryptAsync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt: salt.toString('hex'), hash: Buffer.from(hash).toString('hex') };
}

function allowedSettings(settings) {
  return {
    allowRegistration: Boolean(settings.allowRegistration),
    announcement: String(settings.announcement || '').trim().slice(0, 180),
    defaultQuality: ['low', 'medium', 'high'].includes(settings.defaultQuality)
      ? settings.defaultQuality
      : DEFAULT_SETTINGS.defaultQuality,
    defaultTimeSpeed: ['slow', 'normal', 'fast'].includes(settings.defaultTimeSpeed)
      ? settings.defaultTimeSpeed
      : DEFAULT_SETTINGS.defaultTimeSpeed,
    maintenanceMode: Boolean(settings.maintenanceMode),
  };
}

export function createApp({
  dbPath = process.env.DB_PATH || join(ROOT, 'data', 'apex-nights.sqlite3'),
  staticRoot = ROOT,
  secureCookies = process.env.NODE_ENV === 'production',
} = {}) {
  mkdirSync(dirname(resolve(dbPath)), { mode: 0o700, recursive: true });
  const db = new Database(dbPath);
  initializeDatabase(db);

  const attempts = new Map();
  const accountBySession = db.prepare(`
    SELECT users.id, users.username, users.role, users.disabled, users.created_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `);
  const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const findUser = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE');

  function getCurrentAccount(request) {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (!token || !/^[\w-]{40,60}$/.test(token)) return null;
    const row = accountBySession.get(hashToken(token), Date.now());
    if (!row || row.disabled) return null;
    return row;
  }

  function requireAccount(request, response) {
    const account = getCurrentAccount(request);
    if (!account) {
      sendJson(response, 401, { error: 'Sign in to continue.' }, {
        'Set-Cookie': clearSessionCookie(secureCookies),
      });
      return null;
    }
    return account;
  }

  function requireOwner(request, response) {
    const account = requireAccount(request, response);
    if (!account) return null;
    if (account.role !== 'owner') {
      sendJson(response, 403, { error: 'Owner access is required.' });
      return null;
    }
    return account;
  }

  function allowAttempt(key, limit) {
    const now = Date.now();
    const existing = attempts.get(key);
    if (!existing || existing.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return true;
    }
    if (existing.count >= limit) return false;
    existing.count += 1;
    return true;
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    let url;
    try {
      url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    } catch {
      sendJson(response, 400, { error: 'Invalid request URL.' });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !validateOrigin(request)) {
        sendJson(response, 403, { error: 'Request origin was rejected.' });
        return;
      }

      try {
        if (request.method === 'GET' && url.pathname === '/api/auth/status') {
          const account = getCurrentAccount(request);
          const settings = settingsFromDatabase(db);
          const setupRequired = db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0;
          sendJson(response, 200, {
            account: account ? serializeAccount(account) : null,
            settings,
            setupRequired,
          });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/api/auth/register') {
          const rateKey = `${request.socket.remoteAddress || 'unknown'}:register`;
          if (!allowAttempt(rateKey, 5)) {
            sendJson(response, 429, { error: 'Too many account attempts. Try again in 15 minutes.' });
            return;
          }
          const body = await readJson(request);
          const nameProblem = usernameError(body.username);
          if (nameProblem) {
            sendJson(response, 400, { error: nameProblem });
            return;
          }
          const passwordProblem = passwordError(body.password);
          if (passwordProblem) {
            sendJson(response, 400, { error: passwordProblem });
            return;
          }
          if (body.password !== body.confirmPassword) {
            sendJson(response, 400, { error: 'Passwords do not match.' });
            return;
          }
          const password = await makePasswordHash(body.password);
          let user;
          try {
            user = db.transaction(() => {
              const isFirstUser = db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0;
              if (!isFirstUser && !settingsFromDatabase(db).allowRegistration) {
                const error = new Error('New accounts are currently disabled.');
                error.status = 403;
                throw error;
              }
              const result = db.prepare(`
                INSERT INTO users (username, password_salt, password_hash, role, created_at)
                VALUES (?, ?, ?, ?, ?)
              `).run(body.username, password.salt, password.hash, isFirstUser ? 'owner' : 'player', new Date().toISOString());
              return db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
            })();
          } catch (error) {
            if (error.status) throw error;
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed: users\.username/i.test(error.message)) {
              sendJson(response, 409, { error: 'That username is already in use.' });
              return;
            }
            throw error;
          }
          const token = randomBytes(32).toString('base64url');
          insertSession.run(hashToken(token), user.id, Date.now() + SESSION_TTL_MS);
          attempts.delete(rateKey);
          sendJson(response, 201, { account: serializeAccount(user) }, {
            'Set-Cookie': sessionCookie(token, secureCookies),
          });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/api/auth/login') {
          const rateKey = `${request.socket.remoteAddress || 'unknown'}:login`;
          if (!allowAttempt(rateKey, 10)) {
            sendJson(response, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
            return;
          }
          const body = await readJson(request);
          const password = typeof body.password === 'string' && body.password.length <= 128 ? body.password : '';
          const user = typeof body.username === 'string' ? findUser.get(body.username) : null;
          const salt = user ? Buffer.from(user.password_salt, 'hex') : Buffer.alloc(16);
          const candidate = await makePasswordHash(password, salt);
          const storedHash = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
          const candidateHash = Buffer.from(candidate.hash, 'hex');
          const correct = storedHash.length === candidateHash.length && timingSafeEqual(storedHash, candidateHash);
          if (!user || user.disabled || !correct) {
            sendJson(response, 401, { error: 'Username or password is incorrect.' });
            return;
          }
          attempts.delete(rateKey);
          const token = randomBytes(32).toString('base64url');
          insertSession.run(hashToken(token), user.id, Date.now() + SESSION_TTL_MS);
          sendJson(response, 200, { account: serializeAccount(user) }, {
            'Set-Cookie': sessionCookie(token, secureCookies),
          });
          return;
        }

        if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
          const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
          if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
          sendJson(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(secureCookies) });
          return;
        }

        if (url.pathname === '/api/game/save' && request.method === 'GET') {
          const account = requireAccount(request, response);
          if (!account) return;
          const row = db.prepare('SELECT save_json FROM game_saves WHERE user_id = ?').get(account.id);
          sendJson(response, 200, { save: row ? JSON.parse(row.save_json) : null });
          return;
        }

        if (url.pathname === '/api/game/save' && request.method === 'PUT') {
          const account = requireAccount(request, response);
          if (!account) return;
          const body = await readJson(request);
          if (!body.save || Array.isArray(body.save) || typeof body.save !== 'object') {
            sendJson(response, 400, { error: 'A valid game save is required.' });
            return;
          }
          const encoded = JSON.stringify(body.save);
          if (Buffer.byteLength(encoded) > MAX_BODY_BYTES) {
            sendJson(response, 413, { error: 'Game save is too large.' });
            return;
          }
          db.prepare(`
            INSERT INTO game_saves (user_id, save_json, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET save_json = excluded.save_json, updated_at = excluded.updated_at
          `).run(account.id, encoded, new Date().toISOString());
          sendJson(response, 200, { ok: true });
          return;
        }

        if (url.pathname === '/api/game/save' && request.method === 'DELETE') {
          const account = requireAccount(request, response);
          if (!account) return;
          db.prepare('DELETE FROM game_saves WHERE user_id = ?').run(account.id);
          sendJson(response, 200, { ok: true });
          return;
        }

        if (request.method === 'GET' && url.pathname === '/api/admin/accounts') {
          if (!requireOwner(request, response)) return;
          const accounts = db.prepare(`
            SELECT id, username, role, disabled, created_at
            FROM users ORDER BY created_at, id
          `).all().map((account) => ({
            ...serializeAccount(account),
            disabled: Boolean(account.disabled),
          }));
          sendJson(response, 200, { accounts });
          return;
        }

        const accountMatch = request.method === 'PATCH'
          ? url.pathname.match(/^\/api\/admin\/accounts\/(\d+)$/)
          : null;
        if (accountMatch) {
          if (!requireOwner(request, response)) return;
          const targetId = Number(accountMatch[1]);
          const body = await readJson(request);
          if (typeof body.disabled !== 'boolean') {
            sendJson(response, 400, { error: 'Choose whether this account is disabled.' });
            return;
          }
          const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
          if (!target) {
            sendJson(response, 404, { error: 'Account not found.' });
            return;
          }
          if (target.role === 'owner') {
            sendJson(response, 400, { error: 'The owner account cannot be disabled.' });
            return;
          }
          db.transaction(() => {
            db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(Number(body.disabled), targetId);
            if (body.disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId);
          })();
          sendJson(response, 200, { ok: true });
          return;
        }

        if (request.method === 'GET' && url.pathname === '/api/admin/settings') {
          if (!requireOwner(request, response)) return;
          sendJson(response, 200, { settings: settingsFromDatabase(db) });
          return;
        }

        if (request.method === 'PUT' && url.pathname === '/api/admin/settings') {
          if (!requireOwner(request, response)) return;
          const body = await readJson(request);
          if (
            typeof body.allowRegistration !== 'boolean'
            || typeof body.maintenanceMode !== 'boolean'
            || !['low', 'medium', 'high'].includes(body.defaultQuality)
            || !['slow', 'normal', 'fast'].includes(body.defaultTimeSpeed)
            || typeof body.announcement !== 'string'
            || body.announcement.length > 180
          ) {
            sendJson(response, 400, { error: 'One or more game settings are invalid.' });
            return;
          }
          const settings = allowedSettings(body);
          const upsert = db.prepare(`
            INSERT INTO app_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `);
          db.transaction(() => {
            for (const [key, value] of Object.entries(settings)) upsert.run(key, String(value));
          })();
          sendJson(response, 200, { settings });
          return;
        }

        sendJson(response, 404, { error: 'API route not found.' });
      } catch (error) {
        if (error.status) {
          sendJson(response, error.status, { error: error.message });
          return;
        }
        console.error('Request failed:', error);
        if (!response.headersSent) sendJson(response, 500, { error: 'The server could not complete that request.' });
        else response.destroy();
      }
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      sendJson(response, 400, { error: 'Invalid file path.' });
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    const relativePath = pathname.replace(/^\/+/, '');
    const topLevel = relativePath.split(/[\\/]/, 1)[0];
    if (!PUBLIC_FILES.has(relativePath) && !PUBLIC_DIRECTORIES.has(topLevel)) {
      sendJson(response, 404, { error: 'File not found.' });
      return;
    }
    const filePath = resolve(staticRoot, relativePath);
    const rootRelative = relative(resolve(staticRoot), filePath);
    const resolvedTopLevel = rootRelative.split(/[\\/]/, 1)[0];
    if (
      rootRelative === '..'
      || rootRelative.startsWith(`..${sep}`)
      || isAbsolute(rootRelative)
      || (!PUBLIC_FILES.has(rootRelative) && !PUBLIC_DIRECTORIES.has(resolvedTopLevel))
    ) {
      sendJson(response, 403, { error: 'File access is not allowed.' });
      return;
    }
    let fileStat;
    try {
      fileStat = statSync(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file.');
    } catch {
      sendJson(response, 404, { error: 'File not found.' });
      return;
    }
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Length': fileStat.size,
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    };
    response.writeHead(200, headers);
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  });

  server.on('close', () => db.close());
  return { server, db };
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const { server, db } = createApp();
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be between 0 and 65535.');

  function listenOn(candidatePort, allowFallback) {
    const handleListenError = (error) => {
      if (allowFallback && ['EACCES', 'EADDRINUSE'].includes(error.code)) {
        console.warn(`Port ${candidatePort} is unavailable. Trying ${candidatePort + 1}...`);
        listenOn(candidatePort + 1, false);
        return;
      }
      db.close();
      console.error(`Could not start the APEX NIGHTS server: ${error.message}`);
      process.exitCode = 1;
    };
    server.once('error', handleListenError);
    server.listen(candidatePort, host, () => {
      server.removeListener('error', handleListenError);
      const address = server.address();
      const url = `http://${host}:${address.port}/`;
      console.log(`APEX NIGHTS is ready at ${url}`);
      if (process.env.OPEN_BROWSER !== '0' && process.platform === 'win32' && host === '127.0.0.1') {
        import('node:child_process').then(({ spawn }) => {
          const browser = spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
          browser.unref();
        }).catch((error) => console.error('Could not open a browser automatically:', error.message));
      }
    });
  }

  listenOn(port, port < 65535);
}
