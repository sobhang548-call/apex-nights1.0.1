import {
  SAVE_KEY, START_MONEY, CAR_BY_ID, GARAGE,
  emptyUpgrades, emptyCosmetics,
} from './data.js';

export function defaultSettings() {
  return { quality: 'medium', timeSpeed: 'normal', volume: 70 };
}

export function newSave() {
  return {
    v: 1,
    money: START_MONEY,
    owned: {
      sp320: {
        upgrades: emptyUpgrades(),
        cosmetics: emptyCosmetics('#2f6fa8'),
        invested: 0,
      },
    },
    active: 'sp320',
    completed: [],
    best: {},
    wins: 0,
    races: 0,
    visitedGarage: false,
    timeOfDay: 18.35,
    position: { x: GARAGE.spawn.x, z: GARAGE.spawn.z, yaw: GARAGE.spawn.yaw },
    settings: defaultSettings(),
    trapBest: {},
    driftBest: {},
    createdAt: Date.now(),
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const base = newSave();
    const save = { ...base, ...data };
    save.settings = { ...base.settings, ...(data.settings || {}) };
    save.owned = save.owned || base.owned;
    for (const id of Object.keys(save.owned)) {
      const car = CAR_BY_ID[id];
      if (!car) { delete save.owned[id]; continue; }
      const state = save.owned[id];
      state.upgrades = { ...emptyUpgrades(), ...(state.upgrades || {}) };
      state.cosmetics = { ...emptyCosmetics(car.color), ...(state.cosmetics || {}) };
      state.invested = state.invested || 0;
      state.fuel = isFinite(state.fuel) ? state.fuel : 100;
    }
    if (!save.owned[save.active]) {
      save.active = Object.keys(save.owned)[0] || 'sp320';
      if (!save.owned[save.active]) {
        save.owned.sp320 = {
          upgrades: emptyUpgrades(),
          cosmetics: emptyCosmetics(CAR_BY_ID.sp320.color),
          invested: 0,
        };
        save.active = 'sp320';
      }
    }
    if (typeof save.money !== 'number' || !isFinite(save.money)) save.money = START_MONEY;
    if (!Array.isArray(save.completed)) save.completed = [];
    save.trapBest = save.trapBest || {};
    save.driftBest = save.driftBest || {};
    return save;
  } catch (err) {
    console.warn('Save load failed', err);
    return null;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function writeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (err) {
    console.warn('Save write failed', err);
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function ensureCarState(save, carId) {
  if (!save.owned[carId]) {
    const car = CAR_BY_ID[carId];
    save.owned[carId] = {
      upgrades: emptyUpgrades(),
      cosmetics: emptyCosmetics(car ? car.color : '#e9ebe7'),
      invested: 0,
    };
  }
  return save.owned[carId];
}
