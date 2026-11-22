// ─────────────────────────────────────────────────────────────
// APEX NIGHTS — game data. All cars are original designs inspired
// by the great German and Italian performance machines.
// ─────────────────────────────────────────────────────────────

export const ROAD_LINES = [-880, -720, -560, -400, -240, -80, 80, 240, 400, 560, 720, 880];
export const RING = 1000;
export const CITY_HALF = 1120;
export const WORLD_HALF = 1300;
export const BLOCK = 160;
export const ROAD_WIDTH = 24;

export const WORLD_BOUNDS = 1270;

export const BRANDS = {
  BAVARIS: { country: 'MUNICH', hue: '#3f7bd6' },
  STUTTGAR: { country: 'STUTTGART', hue: '#c9d0d8' },
  ZUFFEN: { country: 'STUTTGART', hue: '#d6b25e' },
  SAKURA: { country: 'TOKYO', hue: '#d43a3a' },
  DETROIT: { country: 'MOTOR CITY', hue: '#e0822e' },
  MARANELLO: { country: 'MARANELLO', hue: '#d11f2a' },
  AERO: { country: 'MODENA', hue: '#25e0ff' },
};

export const PAINTS = [
  { id: 'white', name: 'ALPINE WHITE', hex: '#e9ebe7', price: 0 },
  { id: 'black', name: 'JET BLACK', hex: '#0c0e11', price: 600 },
  { id: 'nardo', name: 'NARDO GREY', hex: '#8c9095', price: 600 },
  { id: 'portimao', name: 'PORTIMAO BLUE', hex: '#1d5aa6', price: 600 },
  { id: 'sakhir', name: 'SAKHIR ORANGE', hex: '#c94a1b', price: 750 },
  { id: 'green', name: 'ISLE GREEN', hex: '#0e4a3b', price: 750 },
  { id: 'rosso', name: 'ROSSO CORSA', hex: '#a8121e', price: 900 },
  { id: 'silver', name: 'TITAN SILVER', hex: '#b7bec7', price: 650 },
  { id: 'purple', name: 'MIDNIGHT VIOLET', hex: '#2c1c4d', price: 900 },
  { id: 'yellow', name: 'RACING YELLOW', hex: '#e5b200', price: 800 },
  { id: 'blue', name: 'MIAMI CYAN', hex: '#169bb8', price: 800 },
  { id: 'british', name: 'BRITISH RACING', hex: '#1f4a37', price: 700 },
];

export const FINISHES = [
  { id: 'metallic', name: 'METALLIC' },
  { id: 'gloss', name: 'GLOSS' },
  { id: 'matte', name: 'MATTE' },
];

export const RIMS = [
  { id: 'sport', name: 'SPORT 5', price: 0, color: '#c9d2dc' },
  { id: 'mesh', name: 'MESH FORGED', price: 2400, color: '#2e333a' },
  { id: 'deep', name: 'DEEP DISH', price: 2800, color: '#d7dde5' },
  { id: 'multi', name: 'MULTI-SPOKE', price: 3200, color: '#b48a4a' },
];

export const SPOILERS = [
  { id: 'none', name: 'CLEAN', price: 0 },
  { id: 'lip', name: 'LIP SPOILER', price: 0 },
  { id: 'gt', name: 'GT WING', price: 2200 },
  { id: 'duck', name: 'DUCKTAIL', price: 1400 },
];

export const NEONS = [
  { id: 'none', name: 'OFF', hex: null, price: 0 },
  { id: 'cyan', name: 'CYAN', hex: '#25e0ff', price: 3200 },
  { id: 'magenta', name: 'MAGENTA', hex: '#ff2fa0', price: 3200 },
  { id: 'lime', name: 'LIME', hex: '#9dff3b', price: 3200 },
  { id: 'amber', name: 'AMBER', hex: '#ffb020', price: 3200 },
];

export const CARS = [
  {
    id: 'sp320',
    brand: 'BAVARIS', name: 'SP 320', cls: 'SPORT SEDAN',
    price: 0, tagline: 'Balanced rear-drive starter with room to grow.',
    power: 255, mass: 1520, drive: 'RWD', grip: 1.0, brake: 1.0, handling: 1.0,
    topSpeed: 252, accel: 6.1,
    color: '#2f6fa8',
    shape: {
      type: 'sedan', length: 4.72, width: 1.87, height: 1.44, wheelbase: 2.86,
      track: 1.59, wheelR: 0.345, belt: 0.98, hood: 0.93, roof: 1.44,
      cabin: [0.92, 0.28, -0.88, -1.58], grille: 'kidney', lights: 'ring',
      exhaust: 2, arch: 0.43,
    },
  },
  {
    id: 'sp440',
    brand: 'BAVARIS', name: 'SP 440 M', cls: 'PERFORMANCE COUPE',
    price: 34000, tagline: 'Twin-turbo straight-six, track-tuned chassis.',
    power: 473, mass: 1600, drive: 'RWD', grip: 1.12, brake: 1.1, handling: 1.1,
    topSpeed: 290, accel: 3.9,
    color: '#1d5aa6',
    shape: {
      type: 'coupe', length: 4.79, width: 1.9, height: 1.39, wheelbase: 2.86,
      track: 1.62, wheelR: 0.36, belt: 1.0, hood: 0.96, roof: 1.39,
      cabin: [0.78, 0.14, -0.86, -1.48], grille: 'kidney', lights: 'ring',
      exhaust: 4, arch: 0.45, wing: 'lip',
    },
  },
  {
    id: 's43',
    brand: 'STUTTGAR', name: 'S 43', cls: 'AMG-LINE SEDAN',
    price: 42000, tagline: 'All-weather traction with a hand-built twin-turbo V6.',
    power: 385, mass: 1690, drive: 'AWD', grip: 1.08, brake: 1.06, handling: 1.02,
    topSpeed: 268, accel: 4.7,
    color: '#8c9095',
    shape: {
      type: 'sedan', length: 4.81, width: 1.9, height: 1.45, wheelbase: 2.87,
      track: 1.6, wheelR: 0.365, belt: 1.0, hood: 0.95, roof: 1.45,
      cabin: [0.95, 0.3, -0.9, -1.62], grille: 'panamericana', lights: 'slash',
      exhaust: 4, arch: 0.44,
    },
  },
  {
    id: 'sakura',
    brand: 'SAKURA', name: 'GT-X', cls: 'SUPER GT AWD',
    price: 65000, tagline: 'Godzilla. Launch control. No excuses.',
    power: 565, mass: 1750, drive: 'AWD', grip: 1.18, brake: 1.12, handling: 1.08,
    topSpeed: 315, accel: 3.2,
    color: '#4b5057',
    shape: {
      type: 'coupe', length: 4.71, width: 1.9, height: 1.37, wheelbase: 2.78,
      track: 1.62, wheelR: 0.365, belt: 0.99, hood: 0.96, roof: 1.37,
      cabin: [0.72, 0.16, -0.8, -1.34], grille: 'mesh', lights: 'quad',
      exhaust: 2, arch: 0.45, wing: 'gt',
    },
  },
  {
    id: 'venom',
    brand: 'DETROIT', name: 'VENOM V8', cls: 'MUSCLE COUPE',
    price: 58000, tagline: 'Naturally aspirated 7.0 litres. Tyres hate it.',
    power: 717, mass: 1780, drive: 'RWD', grip: 1.05, brake: 1.02, handling: 0.92,
    topSpeed: 328, accel: 3.6,
    color: '#c94a1b',
    shape: {
      type: 'muscle', length: 5.02, width: 2.0, height: 1.35, wheelbase: 2.94,
      track: 1.66, wheelR: 0.37, belt: 1.0, hood: 0.99, roof: 1.35,
      cabin: [0.82, 0.18, -0.7, -1.3], grille: 'blade', lights: 'quad',
      exhaust: 4, arch: 0.46, wing: 'duck',
    },
  },
  {
    id: 'rs3',
    brand: 'ZUFFEN', name: 'RS-3', cls: 'REAR-ENGINE SPORTS',
    price: 79000, tagline: 'Rear-engined precision. Rewards the brave.',
    power: 518, mass: 1580, drive: 'RWD', grip: 1.24, brake: 1.16, handling: 1.2,
    topSpeed: 316, accel: 3.3,
    color: '#d6b25e',
    shape: {
      type: 'super', length: 4.55, width: 1.9, height: 1.31, wheelbase: 2.46,
      track: 1.6, wheelR: 0.36, belt: 0.93, hood: 0.86, roof: 1.31,
      cabin: [0.62, 0.08, -0.85, -1.35], grille: 'blade', lights: 'round',
      exhaust: 2, arch: 0.46, wing: 'duck',
    },
  },
  {
    id: 'gtm',
    brand: 'BAVARIS', name: 'GT-M', cls: 'GRAND TOURER',
    price: 88000, tagline: '617 horsepower of autobahn missile.',
    power: 617, mass: 1850, drive: 'AWD', grip: 1.16, brake: 1.14, handling: 1.06,
    topSpeed: 305, accel: 3.3,
    color: '#0c0e11',
    shape: {
      type: 'coupe', length: 4.89, width: 1.95, height: 1.36, wheelbase: 2.84,
      track: 1.65, wheelR: 0.375, belt: 1.01, hood: 0.97, roof: 1.36,
      cabin: [0.86, 0.2, -0.86, -1.52], grille: 'kidney', lights: 'laser',
      exhaust: 4, arch: 0.46, wing: 'lip',
    },
  },
  {
    id: 'gt63',
    brand: 'STUTTGAR', name: 'GT 63 S', cls: 'FOUR-DOOR SUPER',
    price: 96000, tagline: 'Affalterbach fury in a tailored suit.',
    power: 630, mass: 2050, drive: 'AWD', grip: 1.15, brake: 1.18, handling: 1.02,
    topSpeed: 315, accel: 3.4,
    color: '#0f4a3b',
    shape: {
      type: 'coupe', length: 5.06, width: 1.96, height: 1.45, wheelbase: 2.96,
      track: 1.66, wheelR: 0.38, belt: 1.03, hood: 0.99, roof: 1.45,
      cabin: [0.98, 0.3, -0.92, -1.68], grille: 'panamericana', lights: 'slash',
      exhaust: 4, arch: 0.47, wing: 'gt',
    },
  },
  {
    id: 'modele',
    brand: 'VOLTA', name: 'MODEL E', cls: 'ELECTRIC SPORT SEDAN',
    price: 61000, tagline: 'Dual-motor silence, 0-100 in 3.1 seconds.',
    power: 670, mass: 2060, drive: 'AWD', grip: 1.16, brake: 1.12, handling: 1.06,
    topSpeed: 250, accel: 3.1,
    color: '#d7dade',
    shape: {
      type: 'sedan', length: 4.98, width: 1.96, height: 1.45, wheelbase: 2.96,
      track: 1.66, wheelR: 0.365, belt: 0.99, hood: 0.95, roof: 1.45,
      cabin: [0.9, 0.2, -1.02, -1.78], grille: 'ev', lights: 'bar',
      exhaust: 0, arch: 0.45, wing: 'lip',
    },
  },
  {
    id: 'rosso',
    brand: 'MARANELLO', name: 'F8 ROSSA', cls: 'MID-ENGINE SUPER',
    price: 148000, tagline: 'A screaming twin-turbo V8 behind your ears.',
    power: 710, mass: 1435, drive: 'RWD', grip: 1.28, brake: 1.25, handling: 1.24,
    topSpeed: 340, accel: 2.9,
    color: '#a8121e',
    shape: {
      type: 'super', length: 4.62, width: 1.98, height: 1.22, wheelbase: 2.66,
      track: 1.67, wheelR: 0.365, belt: 0.9, hood: 0.82, roof: 1.22,
      cabin: [0.58, 0.04, -0.72, -1.24], grille: 'mesh', lights: 'blade',
      exhaust: 2, arch: 0.47, wing: 'duck',
    },
  },
  {
    id: 'aero',
    brand: 'AERO', name: 'V12 HYPER', cls: 'HYPERCAR',
    price: 265000, tagline: 'A thousand horsepower of ground-effect madness.',
    power: 1000, mass: 1390, drive: 'AWD', grip: 1.32, brake: 1.3, handling: 1.28,
    topSpeed: 382, accel: 2.4,
    color: '#169bb8',
    unlockWins: 5,
    shape: {
      type: 'hyper', length: 4.92, width: 2.06, height: 1.14, wheelbase: 2.74,
      track: 1.7, wheelR: 0.375, belt: 0.86, hood: 0.78, roof: 1.14,
      cabin: [0.5, 0.0, -0.66, -1.18], grille: 'blade', lights: 'laser',
      exhaust: 2, arch: 0.49, wing: 'gt',
    },
  },
  {
    id: 'bavaris-m8x',
    brand: 'BAVARIS', name: 'M8X GRAN COUPE', cls: 'LUXURY SUPER GT',
    price: 218000, tagline: 'A hand-finished grand tourer with effortless all-wheel-drive pace.',
    power: 760, mass: 1980, drive: 'AWD', grip: 1.2, brake: 1.2, handling: 1.14,
    topSpeed: 325, accel: 3.0,
    color: '#b7bec7', transmission: 'automatic', unlockWins: 5,
    shape: {
      type: 'coupe', length: 5.08, width: 1.96, height: 1.42, wheelbase: 3.02,
      track: 1.68, wheelR: 0.385, belt: 1.03, hood: 1.0, roof: 1.42,
      cabin: [0.96, 0.27, -0.94, -1.7], grille: 'kidney', lights: 'laser',
      exhaust: 4, arch: 0.48, wing: 'lip',
    },
  },
  {
    id: 'stuttgar-s900',
    brand: 'STUTTGAR', name: 'S 900 BLACKLINE', cls: 'LUXURY PERFORMANCE SEDAN',
    price: 246000, tagline: 'A quiet executive cabin wrapped around a thunderous twin-turbo V8.',
    power: 820, mass: 2070, drive: 'AWD', grip: 1.19, brake: 1.22, handling: 1.12,
    topSpeed: 330, accel: 2.9,
    color: '#0c0e11', transmission: 'automatic', unlockWins: 6,
    shape: {
      type: 'sedan', length: 5.18, width: 1.98, height: 1.46, wheelbase: 3.08,
      track: 1.69, wheelR: 0.39, belt: 1.04, hood: 1.01, roof: 1.46,
      cabin: [1.01, 0.32, -0.98, -1.75], grille: 'panamericana', lights: 'slash',
      exhaust: 4, arch: 0.48,
    },
  },
  {
    id: 'zuffen-rs9',
    brand: 'ZUFFEN', name: 'RS-9 TURBO', cls: 'HYPER PERFORMANCE COUPE',
    price: 318000, tagline: 'Rear-engine precision sharpened for devastating point-to-point speed.',
    power: 790, mass: 1510, drive: 'AWD', grip: 1.31, brake: 1.29, handling: 1.27,
    topSpeed: 352, accel: 2.6,
    color: '#d6b25e', transmission: 'automatic', unlockWins: 7,
    shape: {
      type: 'super', length: 4.62, width: 1.98, height: 1.3, wheelbase: 2.68,
      track: 1.67, wheelR: 0.37, belt: 0.94, hood: 0.86, roof: 1.3,
      cabin: [0.63, 0.08, -0.83, -1.35], grille: 'blade', lights: 'round',
      exhaust: 2, arch: 0.48, wing: 'gt',
    },
  },
  {
    id: 'maranello-f12s',
    brand: 'MARANELLO', name: 'F12 STRADALE', cls: 'MID-ENGINE SUPERCAR',
    price: 386000, tagline: 'A naturally aspirated twelve-cylinder soundtrack at the edge of grip.',
    power: 830, mass: 1480, drive: 'RWD', grip: 1.32, brake: 1.3, handling: 1.29,
    topSpeed: 358, accel: 2.7,
    color: '#a8121e', transmission: 'automatic', unlockWins: 8,
    shape: {
      type: 'super', length: 4.7, width: 1.99, height: 1.23, wheelbase: 2.7,
      track: 1.68, wheelR: 0.37, belt: 0.91, hood: 0.83, roof: 1.23,
      cabin: [0.6, 0.05, -0.74, -1.29], grille: 'mesh', lights: 'blade',
      exhaust: 2, arch: 0.48, wing: 'duck',
    },
  },
  {
    id: 'aero-v16x',
    brand: 'AERO', name: 'V16 X', cls: 'ULTIMATE HYPERCAR',
    price: 895000, tagline: 'Sixteen cylinders, active aero, and a top speed built for the ring.',
    power: 1280, mass: 1580, drive: 'AWD', grip: 1.38, brake: 1.36, handling: 1.34,
    topSpeed: 410, accel: 2.1,
    color: '#25e0ff', transmission: 'automatic', unlockWins: 10,
    shape: {
      type: 'hyper', length: 5.02, width: 2.08, height: 1.12, wheelbase: 2.82,
      track: 1.72, wheelR: 0.39, belt: 0.86, hood: 0.79, roof: 1.12,
      cabin: [0.52, 0.01, -0.68, -1.2], grille: 'blade', lights: 'laser',
      exhaust: 4, arch: 0.5, wing: 'gt',
    },
  },
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));

export const UPGRADES = [
  { id: 'engine', name: 'ENGINE', desc: '+7% power per stage', max: 5, base: 3400, grow: 1.55 },
  { id: 'turbo', name: 'TURBOCHARGER', desc: '+9% power, +2% top speed', max: 4, base: 4600, grow: 1.6 },
  { id: 'gearbox', name: 'GEARBOX', desc: 'Faster shifts, +3% top speed', max: 4, base: 3100, grow: 1.5 },
  { id: 'tires', name: 'TYRES', desc: '+5% cornering grip', max: 5, base: 2700, grow: 1.48 },
  { id: 'suspension', name: 'SUSPENSION', desc: '+4% steering and stability', max: 4, base: 2500, grow: 1.45 },
  { id: 'brakes', name: 'BRAKES', desc: '+9% braking force', max: 4, base: 2300, grow: 1.45 },
  { id: 'weight', name: 'WEIGHT REDUCTION', desc: '-3.5% mass per stage', max: 4, base: 3900, grow: 1.6 },
  { id: 'nitro', name: 'NITROUS', desc: 'Stronger, longer boost', max: 3, base: 5200, grow: 1.8 },
];

export function emptyUpgrades() {
  return Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
}
export function emptyCosmetics(color) {
  return {
    paint: color || '#e9ebe7',
    finish: 'metallic',
    rimStyle: 'sport',
    rimColor: '#c9d2dc',
    spoiler: 'lip',
    neon: 'none',
    rideHeight: 0,
  };
}
export function upgradeCost(up, level) {
  if (level >= up.max) return 0;
  return Math.round((up.base * Math.pow(up.grow, level)) / 100) * 100;
}

export function computeStats(def, up = {}) {
  const engine = up.engine || 0, turbo = up.turbo || 0, gearbox = up.gearbox || 0;
  const tires = up.tires || 0, susp = up.suspension || 0, brakes = up.brakes || 0;
  const weight = up.weight || 0, nitro = up.nitro || 0;
  const power = def.power * (1 + 0.07 * engine + 0.09 * turbo);
  const mass = def.mass * (1 - 0.035 * weight);
  const grip = def.grip * (1 + 0.05 * tires);
  const brake = def.brake * (1 + 0.09 * brakes);
  const handling = def.handling * (1 + 0.04 * susp);
  const topSpeed = def.topSpeed * (1 + 0.03 * gearbox + 0.02 * turbo);
  const accel = def.accel * Math.pow((def.power / power) * (mass / def.mass), 0.62);
  return {
    power, mass, grip, brake, handling, topSpeed, accel,
    nitroLevel: nitro,
    boostCapacity: 100,
    powerW: power * 745.7,
  };
}

// ── Race events ───────────────────────────────────────────────
// Coordinates are intersections of the city road grid so every
// route follows tarmac.
export const RACES = [
  {
    id: 'dockside',
    name: 'DOCKSIDE SPRINT',
    district: 'DOCKSIDE',
    type: 'sprint',
    laps: 1,
    start: { x: -560, z: 400 },
    gates: [
      { x: -560, z: 80 }, { x: -400, z: 80 }, { x: -400, z: -240 },
      { x: -80, z: -240 }, { x: -80, z: 80 }, { x: 240, z: 80 },
    ],
    payout: [10000, 3500, 1400],
    requires: null,
    difficulty: 1,
    rivals: ['sp320', 'sp320', 'sp320'],
    tip: 'Win to unlock DOWNTOWN DASH.',
    blurb: 'A tight sprint from the docks into the financial district. Watch the 90-degree corners.',
  },
  {
    id: 'downtown',
    name: 'DOWNTOWN DASH',
    district: 'DOWNTOWN',
    type: 'circuit',
    laps: 2,
    start: { x: -240, z: -240 },
    gates: [
      { x: -240, z: 240 }, { x: 240, z: 240 }, { x: 240, z: -240 }, { x: -240, z: -240 },
    ],
    payout: [18000, 6000, 2200],
    requires: 'dockside',
    difficulty: 1.5,
    rivals: ['sp320', 's43', 'sp440'],
    tip: 'Two laps around the towers. Brake before the hairpin at 240.',
    blurb: 'A two-lap circuit circling the neon core of Apex City.',
  },
  {
    id: 'neon',
    name: 'NEON MILE',
    district: 'NORTHGATE',
    type: 'sprint',
    laps: 1,
    start: { x: 400, z: -560 },
    gates: [
      { x: 400, z: -720 }, { x: 400, z: -1000 }, { x: 880, z: -1000 },
      { x: 880, z: -720 }, { x: 880, z: -400 },
    ],
    payout: [24000, 8000, 3000],
    requires: 'downtown',
    difficulty: 2,
    rivals: ['sp440', 's43', 'sakura'],
    tip: 'Deep braking into the ring-road exit. Use nitrous on the straights.',
    blurb: 'Blast north through the city and swing onto the elevated ring road.',
  },
  {
    id: 'industrial',
    name: 'INDUSTRIAL LOOP',
    district: 'FOUNDRY',
    type: 'circuit',
    laps: 2,
    start: { x: -720, z: 560 },
    gates: [
      { x: -720, z: 880 }, { x: -400, z: 880 }, { x: -400, z: 560 }, { x: -720, z: 560 },
    ],
    payout: [30000, 10000, 3800],
    requires: 'neon',
    difficulty: 2.5,
    rivals: ['sp440', 's43', 'venom'],
    tip: 'Long straights, heavy braking zones. Use the handbrake to rotate.',
    blurb: 'Warehouse district circuit with long full-throttle runs.',
  },
  {
    id: 'coast',
    name: 'COAST RUN',
    district: 'COASTLINE',
    type: 'sprint',
    laps: 1,
    start: { x: 880, z: -720 },
    gates: [
      { x: 880, z: -400 }, { x: 880, z: -80 }, { x: 880, z: 240 },
      { x: 880, z: 560 }, { x: 880, z: 880 },
    ],
    payout: [38000, 13000, 5000],
    requires: 'industrial',
    difficulty: 3,
    rivals: ['gtm', 'sakura', 'gt63'],
    tip: 'Flat-out coastal run. Keep it clean — the seawall is unforgiving.',
    blurb: 'A 1.6 km top-speed duel along the waterfront boulevard.',
  },
  {
    id: 'midtown',
    name: 'MIDTOWN MAYHEM',
    district: 'MIDTOWN',
    type: 'circuit',
    laps: 3,
    start: { x: 240, z: -240 },
    gates: [
      { x: 720, z: -240 }, { x: 720, z: 240 }, { x: 240, z: 240 }, { x: 240, z: -240 },
    ],
    payout: [50000, 17000, 6500],
    requires: 'coast',
    difficulty: 3.5,
    rivals: ['gtm', 'gt63', 'rs3', 'sakura'],
    tip: 'Three laps, four 90-degree corners. Nitrous out of every apex.',
    blurb: 'Dense midtown circuit — four corners, three laps, no room for error.',
  },
  {
    id: 'ring',
    name: 'RING OF FIRE',
    district: 'RING HIGHWAY',
    type: 'circuit',
    laps: 1,
    start: { x: 80, z: 1000 },
    gates: [
      { x: 1000, z: 1000 }, { x: 1000, z: -1000 }, { x: -1000, z: -1000 },
      { x: -1000, z: 1000 }, { x: 80, z: 1000 },
    ],
    payout: [70000, 22000, 8000],
    requires: 'midtown',
    difficulty: 4,
    rivals: ['gt63', 'rs3', 'rosso', 'gtm'],
    tip: 'One lap of the outer ring — 8 km. Tuck in, use nitrous, brake late.',
    blurb: 'The full outer ring highway. Top speed is everything.',
  },
  {
    id: 'king',
    name: 'KING OF THE CITY',
    district: 'DOWNTOWN',
    type: 'circuit',
    laps: 2,
    start: { x: -240, z: -240 },
    gates: [
      { x: 240, z: -240 }, { x: 240, z: 240 }, { x: 80, z: 240 }, { x: 80, z: 400 },
      { x: -400, z: 400 }, { x: -400, z: -240 }, { x: -240, z: -240 },
    ],
    payout: [130000, 40000, 14000],
    requires: 'ring',
    difficulty: 5,
    rivals: ['rosso', 'aero', 'rs3', 'gt63', 'gtm'],
    tip: 'The final showdown. Everything you have learned, all at once.',
    blurb: 'The city championship. Two laps through every downtown block.',
  },
];

export const RACE_BY_ID = Object.fromEntries(RACES.map((r) => [r.id, r]));

export const SPEED_TRAPS = [
  { id: 'trap-east', name: 'EAST RING TRAP', x: 1000, z: 240, target: 250, reward: 3500 },
  { id: 'trap-north', name: 'NORTH RING TRAP', x: 80, z: -1000, target: 245, reward: 3200 },
  { id: 'trap-west', name: 'WEST RING TRAP', x: -1000, z: -400, target: 240, reward: 3400 },
];

export const DRIFT_ZONES = [
  { id: 'drift-midtown', name: 'MIDTOWN SLIDE', x: 240, z: -80, radius: 62, target: 4500, reward: 3000 },
  { id: 'drift-dockside', name: 'DOCKSIDE DRIFT', x: -400, z: 720, radius: 62, target: 3800, reward: 2600 },
];

export const GARAGE = {
  x: -640, z: 440,
  spawn: { x: -640, z: 402, yaw: 0 },
  zone: { x: -640, z: 442, r: 20 },
  label: 'APEX GARAGE',
};

export const DEALER = {
  x: 600, z: -480,
  zone: { x: 600, z: -480, r: 20 },
  label: 'APEX MOTORS',
};

export const LANDMARKS = [
  { id: 'airport', name: 'APEX CITY AIRPORT', short: 'A', x: 640, z: 640, color: '#7cd6ff', sub: 'TERMINAL 1' },
  { id: 'bus', name: 'APEX CENTRAL', short: 'B', x: -480, z: -480, color: '#ffb020', sub: 'BUS TERMINAL' },
  { id: 'market', name: 'FRESHMART 24', short: 'S', x: -160, z: 480, color: '#5fe08a', sub: 'SUPERMARKET' },
  { id: 'tower', name: 'APEX TOWER', short: 'T', x: 160, z: 0, color: '#25e0ff', sub: 'SKYSCRAPER' },
  { id: 'mall', name: 'APEX GALERIA', short: 'L', x: 480, z: 160, color: '#ff5d9e', sub: 'MALL' },
  { id: 'subway-central', name: 'APEX SUBWAY · CENTRAL', short: 'U', x: -160, z: -160, color: '#4f8cff', sub: 'METRO LINE 1' },
  { id: 'subway-north', name: 'APEX SUBWAY · NORTHGATE', short: 'U', x: -160, z: -800, color: '#4f8cff', sub: 'METRO LINE 2' },
  { id: 'subway-coast', name: 'APEX SUBWAY · COASTLINE', short: 'U', x: 800, z: 160, color: '#4f8cff', sub: 'METRO LINE 3' },
  { id: 'airfield-north', name: 'APEX NORTH AIRFIELD', short: 'A', x: -800, z: -800, color: '#7cd6ff', sub: 'EXECUTIVE FIELD' },
  { id: 'airfield-south', name: 'APEX SOUTH AIRFIELD', short: 'A', x: 0, z: 800, color: '#7cd6ff', sub: 'REGIONAL FIELD' },
];

export const LANDMARK_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

export const START_MONEY = 8500;
export const SAVE_KEY = 'apex-nights-save-v1';
export const RACE_START_DELAY = 3.2;
