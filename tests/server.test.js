import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { createApp } from '../server.js';
import { CARS } from '../src/data.js';

let directory;
let app;
let baseUrl;

async function startServer() {
  app = createApp({ dbPath: join(directory, 'test.sqlite3'), secureCookies: false });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${app.server.address().port}`;
}

async function stopServer() {
  if (!app) return;
  await new Promise((resolve, reject) => {
    app.server.close((error) => error ? reject(error) : resolve());
  });
  app = null;
}

async function json(path, { method = 'GET', body, cookie } = {}) {
  const headers = { Origin: baseUrl };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    body: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';', 1)[0],
    status: response.status,
  };
}

async function register(username, password = 'correct horse battery staple') {
  return json('/api/auth/register', {
    method: 'POST',
    body: { username, password, confirmPassword: password },
  });
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'apex-nights-test-'));
  await startServer();
});

afterEach(async () => {
  await stopServer();
  await rm(directory, { recursive: true, force: true });
});

test('first account becomes the persisted owner with a server-side session', async () => {
  const result = await register('road-owner');
  assert.equal(result.status, 201);
  assert.equal(result.body.account.role, 'owner');
  assert.match(result.cookie, /^apex_session=/);

  const stored = app.db.prepare('SELECT password_salt, password_hash, role FROM users WHERE username = ?').get('road-owner');
  assert.equal(stored.role, 'owner');
  assert.notEqual(stored.password_hash, 'correct horse battery staple');
  assert.notEqual(stored.password_salt, '');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
});

test('player cannot use owner APIs; owner can update settings and disable player access', async () => {
  const owner = await register('road-owner');
  const player = await register('street-driver');
  assert.equal(player.body.account.role, 'player');

  const forbidden = await json('/api/admin/accounts', { cookie: player.cookie });
  assert.equal(forbidden.status, 403);

  const settings = await json('/api/admin/settings', {
    method: 'PUT',
    cookie: owner.cookie,
    body: {
      allowRegistration: false,
      announcement: 'Welcome to the city',
      defaultQuality: 'high',
      defaultTimeSpeed: 'fast',
      maintenanceMode: true,
    },
  });
  assert.equal(settings.status, 200);
  assert.equal(settings.body.settings.defaultQuality, 'high');

  const blockedSignup = await register('new-driver');
  assert.equal(blockedSignup.status, 403);

  const accounts = await json('/api/admin/accounts', { cookie: owner.cookie });
  const playerAccount = accounts.body.accounts.find((account) => account.username === 'street-driver');
  const disabled = await json(`/api/admin/accounts/${playerAccount.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { disabled: true },
  });
  assert.equal(disabled.status, 200);
  const revoked = await json('/api/game/save', { cookie: player.cookie });
  assert.equal(revoked.status, 401);

  const ownerAccount = accounts.body.accounts.find((account) => account.role === 'owner');
  const protectedOwner = await json(`/api/admin/accounts/${ownerAccount.id}`, {
    method: 'PATCH',
    cookie: owner.cookie,
    body: { disabled: true },
  });
  assert.equal(protectedOwner.status, 400);
});

test('game saves are stored in SQLite and isolated per authenticated account', async () => {
  const owner = await register('road-owner');
  const player = await register('street-driver');
  const ownerSave = await json('/api/game/save', {
    method: 'PUT',
    cookie: owner.cookie,
    body: { save: { money: 1200, active: 'sp320' } },
  });
  assert.equal(ownerSave.status, 200);
  const playerSave = await json('/api/game/save', { cookie: player.cookie });
  assert.equal(playerSave.status, 200);
  assert.equal(playerSave.body.save, null);
  await stopServer();
  await startServer();
  const ownerRead = await json('/api/game/save', { cookie: owner.cookie });
  assert.deepEqual(ownerRead.body.save, { money: 1200, active: 'sp320' });

  const deleted = await json('/api/game/save', { method: 'DELETE', cookie: owner.cookie });
  assert.equal(deleted.status, 200);
  assert.equal((await json('/api/game/save', { cookie: owner.cookie })).body.save, null);
});

test('login survives server restart and static routes do not expose server files', async () => {
  const owner = await register('road-owner');
  await stopServer();
  await startServer();
  const login = await json('/api/auth/login', {
    method: 'POST',
    body: { username: 'road-owner', password: 'correct horse battery staple' },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.account.role, 'owner');

  const index = await fetch(`${baseUrl}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /FIRST RUN.*CREATE THE OWNER ACCOUNT/);
  const privateFile = await fetch(`${baseUrl}/server.js`);
  assert.equal(privateFile.status, 404);
  const nestedPrivateFile = await fetch(`${baseUrl}/src%2f..%2fserver.js`);
  assert.notEqual(nestedPrivateFile.status, 200);
  const accountStatus = await json('/api/auth/status', { cookie: login.cookie });
  assert.equal(accountStatus.body.setupRequired, false);
  assert.equal(accountStatus.body.account.id, owner.body.account.id);
});

test('writes reject cross-origin requests and invalid accounts', async () => {
  const invalid = await json('/api/auth/register', {
    method: 'POST',
    body: { username: 'ab', password: 'tiny', confirmPassword: 'tiny' },
  });
  assert.equal(invalid.status, 400);

  const crossOrigin = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'road-owner',
      password: 'correct horse battery staple',
      confirmPassword: 'correct horse battery staple',
    }),
  });
  assert.equal(crossOrigin.status, 403);
});

test('the five existing automatic cars remain in the game data', () => {
  assert.equal(CARS.filter((car) => car.transmission === 'automatic').length, 5);
});
