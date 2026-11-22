import { SAVE_KEY } from './src/data.js';

const authScreen = document.getElementById('authScreen');
const authForms = document.getElementById('authForms');
const authOfflineOwner = document.getElementById('authOfflineOwner');
const authFooter = document.getElementById('authFooter');
const authError = document.getElementById('authError');
const authNotice = document.getElementById('authNotice');
const authAnnouncement = document.getElementById('authAnnouncement');
const authLoginForm = document.getElementById('authLoginForm');
const authRegisterForm = document.getElementById('authRegisterForm');
const authLoginTab = document.getElementById('authLoginTab');
const authRegisterTab = document.getElementById('authRegisterTab');
const authSignedIn = document.getElementById('authSignedIn');
const ownerDashboard = document.getElementById('ownerDashboard');
const ownerStatus = document.getElementById('ownerStatus');
const toolbar = document.getElementById('accountToolbar');
const accountSavePrefix = SAVE_KEY;

let appStatus = null;
let backendAvailable = false;
let currentAccount = null;
let appStarted = false;
let pendingSave = null;
let latestSave = null;
let saveTimer = null;
let activeSaveRequest = Promise.resolve();

function showError(message) {
  authNotice.classList.add('hidden');
  authError.textContent = message;
  authError.classList.remove('hidden');
}

function showNotice(message) {
  authError.classList.add('hidden');
  authNotice.textContent = message;
  authNotice.classList.toggle('hidden', !message);
}

function showSessionExpired() {
  currentAccount = null;
  window.APEX_AUTH_ACCOUNT = null;
  document.body.classList.remove('game-active', 'game-hud-visible');
  toolbar.classList.add('hidden');
  authScreen.classList.remove('hidden');
  showLoginForm('login');
  showError('Your session expired or the account was disabled. Sign in again to continue.');
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    if (!response.ok) {
      const error = new Error(`The server returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
  }
  if (!response.ok) {
    const error = new Error(result.error || `The server returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function requestSaveSync() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    flushGameSave().catch((error) => console.error('Account save sync failed:', error));
  }, 500);
}

async function flushGameSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  while (pendingSave !== null) {
    const save = pendingSave;
    pendingSave = null;
    activeSaveRequest = activeSaveRequest.catch(() => {}).then(() => api('/api/game/save', {
      method: 'PUT',
      body: JSON.stringify({ save: JSON.parse(save) }),
    }));
    try {
      await activeSaveRequest;
    } catch (error) {
      if (pendingSave === null) pendingSave = save;
      if (error.status === 401) showSessionExpired();
      throw error;
    }
  }
  await activeSaveRequest;
}

async function clearAccountSaveQueue() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await activeSaveRequest;
  pendingSave = null;
  latestSave = null;
}

window.apexPersistGameSave = (save) => {
  latestSave = JSON.stringify(save);
  pendingSave = latestSave;
  requestSaveSync();
};
window.apexFlushGameSave = flushGameSave;
window.apexClearAccountSaveQueue = clearAccountSaveQueue;

window.addEventListener('pagehide', () => {
  if (!currentAccount || latestSave === null) return;
  fetch('/api/game/save', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ save: JSON.parse(latestSave) }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) throw new Error(`Account save sync failed (HTTP ${response.status}).`);
  }).catch((error) => console.error('Final account save sync failed:', error));
});

function showLoginForm(mode = 'login') {
  authForms.classList.remove('hidden');
  authSignedIn.classList.add('hidden');
  ownerDashboard.classList.add('hidden');
  const isSetup = appStatus?.setupRequired;
  const canRegister = isSetup || appStatus?.settings.allowRegistration;
  document.getElementById('authSetupNote').classList.toggle('hidden', !isSetup);
  document.getElementById('authTabs').classList.toggle('hidden', isSetup || !canRegister);
  authLoginForm.classList.toggle('hidden', isSetup || mode !== 'login');
  authRegisterForm.classList.toggle('hidden', !isSetup && mode !== 'register');
  authLoginTab.classList.toggle('active', !isSetup && mode === 'login');
  authRegisterTab.classList.toggle('active', isSetup || mode === 'register');
  authLoginTab.classList.toggle('hidden', isSetup);
  authRegisterTab.classList.toggle('hidden', !canRegister);
  document.getElementById('authRegisterSubmit').firstChild.textContent = isSetup ? 'CREATE OWNER ACCOUNT ' : 'CREATE ACCOUNT ';
}

function syncLocalSaveKey(account) {
  const accountKey = `${accountSavePrefix}:user:${account.id}`;
  const legacySave = localStorage.getItem(accountSavePrefix);
  if (!localStorage.getItem(accountKey) && legacySave) {
    localStorage.setItem(accountKey, legacySave);
    localStorage.removeItem(accountSavePrefix);
  }
  return accountKey;
}

async function prepareAccountSave(account) {
  const key = syncLocalSaveKey(account);
  const result = await api('/api/game/save');
  if (result.save) {
    localStorage.setItem(key, JSON.stringify(result.save));
    return;
  }
  const localSave = localStorage.getItem(key);
  if (localSave) {
    try {
      const parsed = JSON.parse(localSave);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid career save.');
      pendingSave = JSON.stringify(parsed);
      latestSave = pendingSave;
    } catch (error) {
      console.warn('Discarding an invalid local career save:', error);
      localStorage.removeItem(key);
      return;
    }
    await flushGameSave();
  }
}

function setAccount(account, settings) {
  currentAccount = account;
  appStatus.settings = settings;
  window.APEX_AUTH_ACCOUNT = account;
  window.APEX_GAME_DEFAULTS = {
    quality: settings.defaultQuality,
    timeSpeed: settings.defaultTimeSpeed,
  };
  document.getElementById('authAccountName').textContent = account.username;
  document.getElementById('authAccountRole').textContent = account.role === 'owner' ? 'PROJECT OWNER' : 'PLAYER ACCOUNT';
  document.getElementById('toolbarAccountName').textContent = account.username;
  document.getElementById('toolbarDashboard').classList.toggle('hidden', account.role !== 'owner');
  toolbar.classList.add('hidden');
  authForms.classList.add('hidden');
  if (settings.announcement) {
    authAnnouncement.textContent = settings.announcement;
    authAnnouncement.classList.remove('hidden');
  }
  const maintenance = settings.maintenanceMode && account.role !== 'owner';
  const launch = document.getElementById('authLaunchGame');
  launch.disabled = maintenance;
  launch.textContent = maintenance ? 'GAME UNDER MAINTENANCE' : 'ENTER THE CITY ›';
  authSignedIn.classList.toggle('hidden', account.role === 'owner');
  ownerDashboard.classList.toggle('hidden', account.role !== 'owner');
  authScreen.classList.remove('hidden');
  if (maintenance) showNotice('The owner has temporarily enabled maintenance mode. Try again later.');
  else showNotice('');
  if (account.role === 'owner') loadOwnerDashboard();
}

function accountRow(account) {
  const row = document.createElement('div');
  row.className = 'owner-account-row';
  const identity = document.createElement('div');
  identity.className = 'owner-account-identity';
  const name = document.createElement('strong');
  name.textContent = account.username;
  const details = document.createElement('span');
  details.textContent = account.role === 'owner' ? 'OWNER · PROTECTED' : `${account.disabled ? 'DISABLED' : 'PLAYER'} · ${new Date(account.createdAt).toLocaleDateString()}`;
  identity.append(name, details);
  row.append(identity);
  if (account.role !== 'owner') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = account.disabled ? 'ENABLE' : 'DISABLE';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api(`/api/admin/accounts/${account.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ disabled: !account.disabled }),
        });
        await loadOwnerDashboard();
      } catch (error) {
        ownerStatus.textContent = error.message;
      }
    });
    row.append(button);
  }
  return row;
}

async function loadOwnerDashboard() {
  ownerStatus.textContent = `Signed in as ${currentAccount.username}.`;
  try {
    const [accountResult, settingsResult] = await Promise.all([
      api('/api/admin/accounts'),
      api('/api/admin/settings'),
    ]);
    const settings = settingsResult.settings;
    document.getElementById('settingRegistration').checked = settings.allowRegistration;
    document.getElementById('settingMaintenance').checked = settings.maintenanceMode;
    document.getElementById('settingAnnouncement').value = settings.announcement;
    document.getElementById('settingQuality').value = settings.defaultQuality;
    document.getElementById('settingTimeSpeed').value = settings.defaultTimeSpeed;
    document.getElementById('ownerAccountCount').textContent = `${accountResult.accounts.length} total`;
    const list = document.getElementById('ownerAccountList');
    list.replaceChildren(...accountResult.accounts.map(accountRow));
  } catch (error) {
    ownerStatus.textContent = error.message;
    if (error.status === 401) showSessionExpired();
  }
}

async function launchGame() {
  if (!currentAccount) return;
  if (appStatus.settings.maintenanceMode && currentAccount.role !== 'owner') {
    showNotice('The owner has temporarily enabled maintenance mode. Try again later.');
    return;
  }
  try {
    await prepareAccountSave(currentAccount);
    authScreen.classList.add('hidden');
    document.body.classList.add('game-active');
    toolbar.classList.remove('hidden');
    if (!appStarted) {
      appStarted = true;
      await import('./src/main.js');
    }
  } catch (error) {
    appStarted = false;
    document.body.classList.remove('game-active', 'game-hud-visible');
    toolbar.classList.add('hidden');
    showError(`Could not load your account or career: ${error.message}`);
    authScreen.classList.remove('hidden');
  }
}

async function signOut() {
  if (window.game && typeof window.game.saveNow === 'function') window.game.saveNow();
  try {
    await flushGameSave();
    latestSave = null;
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    window.location.reload();
  } catch (error) {
    showError(`Sign-out failed: ${error.message}`);
  }
}

document.getElementById('authLoginTab').addEventListener('click', () => showLoginForm('login'));
document.getElementById('authRegisterTab').addEventListener('click', () => showLoginForm('register'));

authLoginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!backendAvailable) return;
  const form = new FormData(authLoginForm);
  const submit = authLoginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username'),
        password: form.get('password'),
      }),
    });
    authLoginForm.reset();
    setAccount(result.account, appStatus.settings);
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

authRegisterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!backendAvailable) return;
  const form = new FormData(authRegisterForm);
  const submit = authRegisterForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username'),
        password: form.get('password'),
        confirmPassword: form.get('confirmPassword'),
      }),
    });
    authRegisterForm.reset();
    setAccount(result.account, appStatus.settings);
  } catch (error) {
    showError(error.message);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById('authLaunchGame').addEventListener('click', launchGame);
document.getElementById('ownerLaunchGame').addEventListener('click', launchGame);
document.getElementById('authSignOut').addEventListener('click', signOut);
document.getElementById('ownerSignOut').addEventListener('click', signOut);
document.getElementById('toolbarSignOut').addEventListener('click', signOut);
document.getElementById('toolbarDashboard').addEventListener('click', async () => {
  if (window.game && typeof window.game.saveNow === 'function') window.game.saveNow();
  try {
    await flushGameSave();
  } catch (error) {
    showError(`Could not save your career: ${error.message}`);
    authScreen.classList.remove('hidden');
    return;
  }
  document.body.classList.remove('game-active');
  document.body.classList.remove('game-hud-visible');
  toolbar.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authSignedIn.classList.add('hidden');
  ownerDashboard.classList.remove('hidden');
  loadOwnerDashboard();
});

document.getElementById('ownerSettingsForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  ownerStatus.textContent = 'Saving settings…';
  try {
    const result = await api('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        allowRegistration: document.getElementById('settingRegistration').checked,
        maintenanceMode: document.getElementById('settingMaintenance').checked,
        announcement: document.getElementById('settingAnnouncement').value,
        defaultQuality: document.getElementById('settingQuality').value,
        defaultTimeSpeed: document.getElementById('settingTimeSpeed').value,
      }),
    });
    appStatus.settings = result.settings;
    ownerStatus.textContent = 'Settings saved. Defaults apply to new careers.';
  } catch (error) {
    ownerStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

const gameHud = document.getElementById('hud');
new MutationObserver(() => {
  document.body.classList.toggle('game-hud-visible', !gameHud.classList.contains('hidden'));
}).observe(gameHud, { attributes: true, attributeFilter: ['class'] });

async function initialize() {
  try {
    appStatus = await api('/api/auth/status');
    if (!appStatus.settings || typeof appStatus.setupRequired !== 'boolean') {
      throw new Error('The server returned an invalid authentication status.');
    }
    backendAvailable = true;
    if (appStatus.settings.announcement) {
      authAnnouncement.textContent = appStatus.settings.announcement;
      authAnnouncement.classList.remove('hidden');
    }
    if (appStatus.account) {
      setAccount(appStatus.account, appStatus.settings);
      return;
    }
    toolbar.classList.add('hidden');
    showLoginForm(appStatus.setupRequired ? 'register' : 'login');
  } catch (error) {
    backendAvailable = false;
    appStatus = {
      settings: {
        allowRegistration: true,
        announcement: '',
        defaultQuality: 'medium',
        defaultTimeSpeed: 'normal',
        maintenanceMode: false,
      },
      setupRequired: false,
    };
    toolbar.classList.add('hidden');
    authOfflineOwner.classList.remove('hidden');
    authFooter.textContent = 'ACCOUNT SAVES REQUIRE THE NODE/SQLITE SERVICE';
    showLoginForm('login');
    authForms.querySelectorAll('input, button[type="submit"]').forEach((control) => {
      control.disabled = true;
    });
    showError(`The Node/SQLite authentication service is unavailable. Sign-in, account creation, owner setup, and gameplay are disabled until it connects. Run start-game.bat or npm start on a Node host. (${error.message})`);
  }
}

initialize().catch((error) => {
  console.error('Authentication startup failed:', error);
  showError(`Authentication could not start: ${error.message}`);
});
