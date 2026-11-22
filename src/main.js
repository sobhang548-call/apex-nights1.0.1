import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/effectcomposer.js';
import { RenderPass } from 'three/addons/postprocessing/renderpass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/unrealbloompass.js';
import { OutputPass } from 'three/addons/postprocessing/outputpass.js';

import { CAR_BY_ID } from './data.js';
import { loadSave, newSave, hasSave, clearSave } from './storage.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { SkySystem } from './world/sky.js';
import { World } from './world/city.js';
import { Effects } from './car/effects.js';
import { Vehicle } from './car/vehicle.js';
import { PhysicsWorld } from './physics.js';
import { ChaseCamera } from './game/camera.js';
import { Hud, MiniMap, BigMap } from './ui/hud.js';
import { Game } from './game/game.js';
import { Nav } from './game/nav.js';
import { Traffic } from './game/traffic.js';
import { GarageUI } from './ui/garage.js';
import { DealerUI } from './ui/dealer.js';

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const fin = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(fin, 0));
  setTimeout(fin, 80);
});

const loading = {
  bar: $('loadingBar'),
  text: $('loadingText'),
  tip: $('loadingTip'),
  screen: $('loading'),
};

const LOAD_TIPS = [
  'Tip: Q and E shift gears in cars with manual transmissions.',
  'Tip: shift before the limiter cuts power — watch the rev counter.',
  'Tip: tap SPACE to break traction, then feed in throttle to hold the slide.',
  'Tip: drifts and wheelspin recharge NOS faster than cruising.',
  'Tip: brake into a corner to rotate the car, then countersteer out.',
  'Tip: finish 1st to unlock new events across the city.',
  'Tip: the garage installs upgrades and paint instantly.',
  'Tip: press C to switch between chase and bonnet views.',
  'Tip: open the map with M and click to set a navigation route.',
  'Tip: speed traps and drift zones pay cash in free roam.',
  'Tip: the city is dangerous at night — use your headlights.',
];

let tipIndex = 0;
const tipTimer = setInterval(() => {
  tipIndex = (tipIndex + 1) % LOAD_TIPS.length;
  if (loading.tip) loading.tip.textContent = LOAD_TIPS[tipIndex];
}, 2600);

function setLoading(pct, text) {
  if (loading.bar) loading.bar.style.width = `${pct}%`;
  if (loading.text && text) loading.text.textContent = text;
}

async function boot() {
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  let save = loadSave();
  const returning = !!save;
  if (!save) save = newSave();
  const quality = save.settings.quality || 'medium';
  let renderScale = 1;
  const pixelRatio = () => {
    const q = save.settings.quality;
    const base = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'low' ? 1 : 1.5);
    return Math.max(0.65, base * renderScale);
  };
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3600);
  camera.position.set(0, 6, -12);

  setLoading(8, 'Calibrating sky and atmosphere…');
  await nextFrame();
  const sky = new SkySystem(scene, renderer, quality);
  sky.setHour(save.timeOfDay ?? 18.35);

  setLoading(26, 'Paving 40 kilometres of road…');
  await nextFrame();
  const world = new World(scene, renderer, sky, quality);

  setLoading(64, 'Warming up the tyre model…');
  await nextFrame();
  const effects = new Effects(scene, quality);
  const physics = new PhysicsWorld(scene, world, effects);

  const owned = save.owned[save.active] || save.owned.sp320;
  const def = CAR_BY_ID[save.active] || CAR_BY_ID.sp320;
  const player = new Vehicle(scene, def, owned.upgrades, owned.cosmetics, {
    isPlayer: true,
    effects,
    x: save.position?.x ?? -640,
    z: save.position?.z ?? 402,
    yaw: save.position?.yaw ?? 0,
    headlights: true,
    fuel: owned.fuel ?? 100,
  });
  player.setNight(sky.night);

  const chase = new ChaseCamera(camera, world);
  const input = new Input(canvas);
  const audio = new GameAudio();
  audio.volume = (save.settings.volume ?? 70) / 100;
  audio.setVolume(audio.volume);

  const hud = new Hud();
  const minimap = new MiniMap();
  const bigmap = new BigMap();
  const nav = new Nav(scene);
  const traffic = new Traffic(scene, nav.graph, {
    world, effects, count: 26, avoid: player.pos,
  });
  traffic.setNight(sky.night);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.34, 0.55, 0.86,
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function applyRes() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = pixelRatio();
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }

  const game = new Game({
    scene, renderer, camera: chase, cameraObject: camera, composer, bloom,
    sky, world, effects, player, input, audio, hud, minimap, bigmap, save, nav, traffic,
    physics,
    VehicleClass: Vehicle,
    menuScreen: $('menuScreen'),
    pauseScreen: $('pauseScreen'),
    mapScreen: $('mapScreen'),
    guideScreen: $('guideScreen'),
    volumeRange: $('volumeRange'),
  });

  setLoading(86, 'Unlocking the garage…');
  await nextFrame();

  window.game = game;
  game.garageUI = new GarageUI(game);
  game.dealerUI = new DealerUI(game);
  if (save.nav && isFinite(save.nav.x) && isFinite(save.nav.z)) {
    nav.setDestination(
      save.nav.x,
      save.nav.z,
      typeof save.nav.label === 'string' ? save.nav.label : null,
      true,
    );
  }
  nav.setBeaconVisible(false);
  game.begin();

  const params = new URLSearchParams(window.location.search);
  if (params.has('play')) {
    $('menuScreen').classList.add('hidden');
    game.startRun();
    if (params.has('x')) {
      game.player.setPose(Number(params.get('x')), Number(params.get('z')), Number(params.get('yaw')) || 0);
      chase.snap(game.player);
    }
    if (params.has('auto')) {
      game.debugAuto = true;
      game.debugSteer = Number(params.get('steer')) || 0;
      game.player.manual = false;
    }
    if (params.has('hour')) game.setHour(Number(params.get('hour')));
    if (params.has('orbit')) {
      const radius = Number(params.get('r')) || 7;
      const height = Number(params.get('h')) || 1.6;
      chase.orbitAround(0, { x: game.player.pos.x, z: game.player.pos.z }, radius, height, 0);
      if (params.has('a')) chase.orbitAngle = Number(params.get('a'));
    }
    if (params.has('race')) setTimeout(() => game.startRace(params.get('race')), 60);
    if (params.has('garage')) setTimeout(() => game.openGarage(), 90);
    if (params.has('dealer')) setTimeout(() => game.openDealer(), 90);
    if (params.has('map')) setTimeout(() => game.openMap(), 90);
    if (params.has('nav')) {
      const [nx, nz] = String(params.get('nav')).split(',').map(Number);
      if (isFinite(nx) && isFinite(nz)) {
        setTimeout(() => game.setNavDestination(nx, nz, 'TEST WAYPOINT', true), 120);
      }
    }
    if (params.has('traffic') && game.traffic) {
      const p = game.player;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      game.traffic.cars.slice(0, 4).forEach((car, i) => {
        const dist = 16 + i * 11;
        const side = i % 2 ? 4.4 : -4.4;
        const x = p.pos.x + fx * dist + rx * side;
        const z = p.pos.z + fz * dist + rz * side;
        car.pos.set(x, 0, z);
        car.yaw = p.yaw;
        car.route = [{ x, z }, { x: x + fx * 140, z: z + fz * 140 }];
        car.idx = 1;
        car.speed = car.maxSpeed * 0.7;
        car.root.position.set(x, 0, z);
        car.root.rotation.y = car.yaw;
      });
    }
    if (params.has('hud')) $('hud').classList.remove('hidden');
  }

  // menu info
  const saveInfo = $('menuSaveInfo');
  if (saveInfo) {
    const wins = save.wins || 0;
    saveInfo.textContent = returning
      ? `CAREER LOADED · ${def.brand} ${def.name} · $${Math.round(save.money).toLocaleString('en-US')} · ${wins} WIN${wins === 1 ? '' : 'S'}`
      : 'No career yet — a starter BAVARIS is waiting at the APEX GARAGE.';
  }
  const startLabel = $('btnStartLabel');
  if (startLabel) startLabel.textContent = returning ? 'CONTINUE CAREER' : 'START ENGINE';

  setLoading(100, 'Ready.');
  await new Promise((r) => setTimeout(r, 420));
  clearInterval(tipTimer);
  loading.screen.classList.add('hidden');

  window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyRes();
  });

  // ── menu / screens ────────────────────────────────────────
  $('btnStart').addEventListener('click', () => {
    audio.init();
    audio.ui();
    $('menuScreen').classList.add('hidden');
    game.startRun();
  });

  $('btnControls').addEventListener('click', () => {
    audio.ui();
    $('guideScreen').classList.remove('hidden');
  });

  $('btnResetProgress').addEventListener('click', () => {
    if (window.confirm('Erase your career, cars and money? This cannot be undone.')) {
      clearSave();
      window.location.reload();
    }
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.close;
      if (id === 'mapScreen') game.closeMap();
      else if (id === 'pauseScreen') game.closePause();
      else if (id === 'guideScreen') $('guideScreen').classList.add('hidden');
      else if (id === 'garageScreen' && game.garageUI) game.garageUI.close();
      else if (id === 'dealerScreen' && game.dealerUI) game.dealerUI.close();
      else $(id)?.classList.add('hidden');
    });
  });

  $('btnResume').addEventListener('click', () => game.closePause());
  $('btnPauseGarage').addEventListener('click', () => {
    game.closePause();
    if (game._nearGarage) game.openGarage();
    else {
      game.toast('APEX GARAGE', 'Drive to the garage', 'The cyan G marker on your map.', '');
    }
  });
  $('btnSaveQuit').addEventListener('click', () => {
    game.saveNow();
    game.closePause();
    $('menuScreen').classList.remove('hidden');
    game.returnToMenu();
  });

  $('btnResultRetry').addEventListener('click', () => game.retryRace());
  $('btnResultContinue').addEventListener('click', () => game.continueAfterRace());

  const qualitySeg = $('qualitySeg');
  qualitySeg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      save.settings.quality = btn.dataset.q;
      qualitySeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      sky.setQuality(btn.dataset.q);
      renderScale = 1;
      applyRes();
      renderer.shadowMap.needsUpdate = true;
      game.autosave();
      audio.ui();
    });
  });

  const timeSeg = $('timeSeg');
  timeSeg.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      save.settings.timeSpeed = btn.dataset.t;
      timeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      game.autosave();
      audio.ui();
    });
  });

  $('volumeRange').addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    audio.setVolume(v);
    save.settings.volume = Number(e.target.value);
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (!$('guideScreen').classList.contains('hidden')) {
        $('guideScreen').classList.add('hidden');
      } else if (game.state === 'map') {
        game.closeMap();
      } else if (game.state === 'paused') {
        game.closePause();
      } else if (game.state === 'garage') {
        game.garageUI?.close();
      } else if (game.state === 'dealer') {
        game.dealerUI?.close();
      } else if (game.state === 'play') {
        game.openPause();
      }
    }
    if (e.code === 'KeyM' && game.state === 'map') game.closeMap();
  });

  let last = performance.now();
  let rawDt = 1 / 60;
  let shadowT = 0;
  let perfT = 0;
  let perfFrames = 0;
  let perfCooldown = 3;
  let slowWindows = 0;
  let fastWindows = 0;

  function animate(now) {
    requestAnimationFrame(animate);
    rawDt = Math.min(0.25, (now - last) / 1000 || 0.016);
    const dt = Math.min(0.05, rawDt);
    last = now;

    game.update(dt);

    // Shadows follow the sun and the cars — refresh at a steady cadence.
    // Faster cadence while moving keeps the car's shadow glued to it instead
    // of visibly stepping behind the body; idle scenes refresh slowly.
    shadowT += Math.min(dt, 1 / 30);
    const speed = game.player ? game.player.speedKmh : 0;
    const shadowStep = speed > 30 ? 0.024 : speed > 4 ? 0.04 : 0.11;
    if (shadowT >= shadowStep) {
      renderer.shadowMap.needsUpdate = true;
      shadowT = 0;
    }

    // Adaptive resolution with a two-window confirmation so it settles on a
    // scale instead of pumping up and down around the 60 fps target.
    perfT += rawDt;
    perfFrames++;
    perfCooldown -= rawDt;
    if (perfT >= 1.6) {
      const avg = perfT / perfFrames;
      if (avg > 0.0275) { slowWindows++; fastWindows = 0; }
      else if (avg < 0.0172) { fastWindows++; slowWindows = 0; }
      else { slowWindows = 0; fastWindows = 0; }
      if (perfCooldown <= 0) {
        if (slowWindows >= 2 && renderScale > 0.68) {
          renderScale = Math.max(0.68, renderScale - 0.08);
          perfCooldown = 4.5;
          slowWindows = 0;
          applyRes();
        } else if (fastWindows >= 3 && renderScale < 0.999) {
          renderScale = Math.min(1, renderScale + 0.06);
          perfCooldown = 6;
          fastWindows = 0;
          applyRes();
        }
      }
      perfT = 0;
      perfFrames = 0;
    }

    composer.render();
    input.endFrame();
  }
  requestAnimationFrame(animate);
}

boot().catch((err) => {
  console.error('Boot failed', err);
  setLoading(100, 'FAILED TO START — see console');
  if (loading.tip) loading.tip.textContent = String(err && err.message ? err.message : err);
});
