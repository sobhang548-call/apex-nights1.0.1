import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  RACES, RACE_BY_ID, CAR_BY_ID, emptyCosmetics,
} from '../data.js';
import { clamp, wrapAngle, createCanvas } from '../util.js';
import { writeSave } from '../storage.js';
import { Vehicle } from '../car/vehicle.js';

const INTRO_TIME = 3.4;
const COUNTDOWN_STEP = 0.9;
const GATE_RADIUS = 16;
const RIVAL_GATE_RADIUS = 20;

// Street geometry: barriers sit just outside the tarmac on each side of the
// race route and stop short of every junction so corners stay open.
const GRID_HALF = 12;
const RING_HALF = 17;
const WALL_OFFSET = 1.35;
const WALL_TRIM = 13.4;
const WALL_TRIM_RING = 18.6;
const WALL_HEIGHT = 1.02;
const WALL_THICK = 0.55;
const WALL_TEX_LEN = 3.4;

function barrierTexture() {
  const { canvas, ctx } = createCanvas(128, 64);
  ctx.fillStyle = '#d9d6cf';
  ctx.fillRect(0, 0, 128, 64);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 128, 64);
  ctx.clip();
  ctx.fillStyle = '#b3202a';
  for (let x = -64; x < 192; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 64, 0);
    ctx.lineTo(x + 32, 64);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const grime = ctx.createLinearGradient(0, 0, 0, 64);
  grime.addColorStop(0, 'rgba(255,255,255,0.10)');
  grime.addColorStop(0.55, 'rgba(0,0,0,0)');
  grime.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function checkerTexture() {
  const { canvas, ctx } = createCanvas(128, 32);
  const cell = 16;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#f2f3f0' : '#0b0e13';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class RaceManager {
  constructor(game) {
    this.game = game;
    this.phase = 'idle';
    this.race = null;
    this.rivals = [];
    this.time = 0;
    this.lap = 1;
    this.nextIdx = 0;
    this.position = 1;
    this.playerScore = 0;

    this.route = [];
    this.routeLens = [];
    this.routeTotal = 0;
    this.closedLoop = false;
    this.finish = null;
    this.courseGroup = null;
    this.wallColliders = [];

    this.phaseTimer = 0;
    this.count = 3;
    this._goTimer = 0;
    this._lastRaceId = null;
  }

  get active() {
    return this.phase !== 'idle';
  }

  get player() {
    return this.game.player;
  }

  get save() {
    return this.game.save;
  }

  get totalRacers() {
    return this.rivals.length + 1;
  }

  // ── session lifecycle ─────────────────────────────────────
  start(id) {
    const race = RACE_BY_ID[id];
    if (!race) {
      this.game.audio.deny();
      return;
    }
    this.abort();
    this.race = race;
    this._lastRaceId = id;
    this.lap = 1;
    this.nextIdx = 0;
    this.time = 0;
    this.position = 1;
    this.playerScore = 0;
    this.phase = 'intro';
    this.phaseTimer = 0;
    this.count = 3;
    this.game.state = 'play';
    this.game.hud.hidePrompt();
    this.game.hud.hideResults();
    this.game.hud.setNav(null);
    if (this.game.nav) {
      this.game.nav.clear();
      this.game.nav.setBeaconVisible(false);
    }

    this._buildRoute();
    const p0 = this.route[0];
    const p1 = this.route[1] || race.gates[0];
    const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);

    this.player.setPose(p0.x, p0.z, yaw);
    this.game.cameraMode = 'chase';
    this.game.camera.setMode('chase');
    this.game.camera.snap(this.player);

    this._spawnRivals(p0, yaw);
    this._buildCourseVisuals();
    this.game.hud.setObjective(`${race.name} · 1/${race.laps}`, this.distanceToFinish());

    this.game.hud.setRaceVisible(false);
    this.game.hud.setLetterbox(true);
    this.game.hud.showIntro(race, this._distanceKm(race), this.totalRacers, race.payout[0]);
    this.game.camera.setMode('cinematic');
    this.game.audio.ui();
  }

  abort() {
    this._disposeRivals();
    this._disposeCourse();
    if (!this.race) {
      this.phase = 'idle';
      return;
    }
    this.game.hud.hideIntro();
    this.game.hud.hideCountdown();
    this.game.hud.setLetterbox(false);
    this.game.hud.setRaceVisible(false);
    this.phase = 'idle';
    this.race = null;
    this.rivals = [];
  }

  retry() {
    const id = this._lastRaceId || this.race?.id;
    if (!id) return;
    this.game.hud.hideResults();
    this.game.state = 'play';
    this.start(id);
  }

  continueToCity() {
    this.game.hud.hideResults();
    this.game.state = 'play';
    this.abort();
    this.game.cameraMode = this.game.cameraMode === 'hood' ? 'hood' : 'chase';
    this.game.camera.setMode(this.game.cameraMode);
    this.game.camera.snap(this.player);
    this.game._updateObjective?.();
  }

  // ── route ─────────────────────────────────────────────────
  _buildRoute() {
    const race = this.race;
    const graph = this.game.nav ? this.game.nav.graph : null;
    const pts = [{ x: race.start.x, z: race.start.z }];
    const push = (x, z) => {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - x, last.z - z) > 0.75) pts.push({ x, z });
    };

    if (graph) {
      let prev = graph.nearest(race.start.x, race.start.z);
      if (Math.hypot(prev.x - race.start.x, prev.z - race.start.z) > 2) {
        push(prev.x, prev.z);
      }
      for (const gate of race.gates) {
        const goal = graph.nearest(gate.x, gate.z);
        const path = graph.shortest(prev, goal);
        if (path && path.length) {
          for (let i = 1; i < path.length; i++) push(path[i].x, path[i].z);
        } else {
          push(gate.x, gate.z);
        }
        prev = goal;
      }
    } else {
      for (const gate of race.gates) push(gate.x, gate.z);
    }

    const lastGate = race.gates[race.gates.length - 1];
    const nearStart = Math.hypot(lastGate.x - race.start.x, lastGate.z - race.start.z) < 2;
    const last = pts[pts.length - 1];
    this.closedLoop = !!(nearStart && Math.hypot(last.x - race.start.x, last.z - race.start.z) < 2);
    if (this.closedLoop) {
      last.x = race.start.x;
      last.z = race.start.z;
    }
    this.finish = this.closedLoop
      ? { x: race.start.x, z: race.start.z }
      : { x: lastGate.x, z: lastGate.z };

    this.route = pts;
    this.routeLens = new Array(pts.length).fill(0);
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      this.routeLens[i] = total;
    }
    this.routeTotal = total;
  }

  _distanceKm(race) {
    let d = 0;
    let prev = race.start;
    for (const g of race.gates) {
      d += Math.hypot(g.x - prev.x, g.z - prev.z);
      prev = g;
    }
    return (d * race.laps) / 1000;
  }

  _projectRouteS(pos) {
    const route = this.route;
    if (!route || route.length < 2) return { s: 0, dist: 0, idx: 0 };
    let s = 0;
    let dist = Infinity;
    let idx = 0;
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      if (len2 < 1e-6) continue;
      let t = ((pos.x - a.x) * abx + (pos.z - a.z) * abz) / len2;
      t = clamp(t, 0, 1);
      const px = a.x + abx * t;
      const pz = a.z + abz * t;
      const d = Math.hypot(pos.x - px, pos.z - pz);
      if (d < dist) {
        dist = d;
        s = this.routeLens[i - 1] + Math.sqrt(len2) * t;
        idx = i;
      }
    }
    return { s, dist, idx };
  }

  _pointAtDistance(s) {
    const route = this.route;
    if (!route || route.length < 2) return { x: 0, z: 0, idx: 0 };
    const total = this.routeTotal;
    if (total <= 0) return { x: route[0].x, z: route[0].z, idx: 0 };
    if (this.closedLoop) {
      s = ((s % total) + total) % total;
    } else {
      s = clamp(s, 0, total);
    }
    let lo = 1;
    let hi = route.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.routeLens[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const segLen = this.routeLens[i] - this.routeLens[i - 1];
    const t = segLen > 1e-6 ? (s - this.routeLens[i - 1]) / segLen : 0;
    return {
      x: route[i - 1].x + (route[i].x - route[i - 1].x) * t,
      z: route[i - 1].z + (route[i].z - route[i - 1].z) * t,
      idx: i,
    };
  }

  _turnAhead(s, dist) {
    const route = this.route;
    if (!route || route.length < 3) return 0;
    const total = this.routeTotal;
    let best = 0;
    for (let i = 1; i < route.length - 1; i++) {
      let d = this.routeLens[i] - s;
      if (this.closedLoop && total > 0) {
        d = ((d % total) + total) % total;
      }
      if (d < 0 || d > dist) continue;
      const a = route[i - 1];
      const b = route[i];
      const c = route[i + 1];
      const inYaw = Math.atan2(b.x - a.x, b.z - a.z);
      const outYaw = Math.atan2(c.x - b.x, c.z - b.z);
      const ang = Math.abs(wrapAngle(outYaw - inYaw));
      if (ang > best) best = ang;
    }
    return best;
  }

  /** First meaningful corner ahead: { d: metres, ang: radians } or null. */
  _nextTurn(s, maxDist) {
    const route = this.route;
    if (!route || route.length < 3) return null;
    const total = this.routeTotal;
    for (let i = 1; i < route.length - 1; i++) {
      let d = this.routeLens[i] - s;
      if (this.closedLoop && total > 0) {
        d = ((d % total) + total) % total;
      }
      if (d < -0.5) continue;
      if (d > maxDist) {
        if (!this.closedLoop) break;
        continue;
      }
      const a = route[i - 1];
      const b = route[i];
      const c = route[i + 1];
      const inYaw = Math.atan2(b.x - a.x, b.z - a.z);
      const outYaw = Math.atan2(c.x - b.x, c.z - b.z);
      const delta = wrapAngle(outYaw - inYaw);
      const ang = Math.abs(delta);
      if (ang > 0.3) return { d: Math.max(0, d), ang, dir: Math.sign(delta) || 1 };
    }
    return null;
  }

  /** Direction of the route segment under s. */
  _routeYawAt(s) {
    const route = this.route;
    if (!route || route.length < 2) return 0;
    const s2 = clamp(s, 0, Math.max(0.01, this.routeTotal - 0.01));
    let i = 1;
    while (i < route.length - 1 && this.routeLens[i] < s2) i++;
    const a = route[i - 1];
    const b = route[i];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  distanceToFinish() {
    if (!this.route || !this.race) return null;
    const proj = this._projectRouteS(this.player.pos);
    return Math.max(0, this.routeTotal - proj.s);
  }

  // ── course visuals ────────────────────────────────────────
  _buildCourseVisuals() {
    const group = new THREE.Group();
    group.name = 'race-course';
    this.game.scene.add(group);
    this.courseGroup = group;

    const checker = checkerTexture();
    this._checkerTex = checker;
    const startMat = new THREE.MeshBasicMaterial({
      map: checker, polygonOffset: true, polygonOffsetFactor: -4,
    });
    const finishMat = new THREE.MeshBasicMaterial({
      map: checker, color: 0xffcf7a, polygonOffset: true, polygonOffsetFactor: -4,
    });

    const p0 = this.route[0];
    const p1 = this.route[1] || this.race.gates[0];
    const yaw0 = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    group.add(this._lineMesh(p0, yaw0, startMat));

    if (!this.closedLoop && this.finish) {
      const prev = this.route[this.route.length - 2] || p0;
      const yawF = Math.atan2(this.finish.x - prev.x, this.finish.z - prev.z);
      group.add(this._lineMesh(this.finish, yawF, finishMat));
    }

    this._buildWalls();
  }

  _lineMesh(pos, yaw, mat) {
    const onRing = Math.max(Math.abs(pos.x), Math.abs(pos.z)) > 960;
    const half = (onRing ? RING_HALF : GRID_HALF) - 1.5;
    const geo = new THREE.PlaneGeometry(half * 2, 3.4);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.046, pos.z);
    mesh.rotation.y = yaw;
    mesh.renderOrder = 2;
    return mesh;
  }

  _buildWalls() {
    const route = this.route;
    const world = this.game.world;
    if (!route || route.length < 2) return;
    const seen = new Set();
    const bodies = [];
    const caps = [];

    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1];
      const b = route[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const ux = dx / len;
      const uz = dz / len;
      if (Math.abs(ux) > 0.02 && Math.abs(uz) > 0.02) continue;
      const horizontal = Math.abs(ux) > 0.5;
      const midX = (a.x + b.x) / 2;
      const midZ = (a.z + b.z) / 2;
      const onRing = horizontal ? Math.abs(midZ) > 960 : Math.abs(midX) > 960;
      const off = (onRing ? RING_HALF : GRID_HALF) + WALL_OFFSET;
      const trim = onRing ? WALL_TRIM_RING : WALL_TRIM;
      if (len <= trim * 2 + 5) continue;
      const s0 = trim;
      const s1 = len - trim;
      const runLen = s1 - s0;

      for (const side of [-1, 1]) {
        const sx = a.x + ux * s0 + (horizontal ? 0 : side * off);
        const sz = a.z + uz * s0 + (horizontal ? side * off : 0);
        const ex = a.x + ux * s1 + (horizontal ? 0 : side * off);
        const ez = a.z + uz * s1 + (horizontal ? side * off : 0);
        const key = `${Math.min(sx, ex).toFixed(1)}:${Math.min(sz, ez).toFixed(1)}`
          + `:${Math.max(sx, ex).toFixed(1)}:${Math.max(sz, ez).toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const cx = (sx + ex) / 2;
        const cz = (sz + ez) / 2;
        const body = new THREE.BoxGeometry(
          horizontal ? runLen : WALL_THICK,
          WALL_HEIGHT,
          horizontal ? WALL_THICK : runLen,
        );
        const uv = body.attributes.uv;
        for (let k = 0; k < uv.count; k++) {
          uv.setXY(k, uv.getX(k) * (runLen / WALL_TEX_LEN), uv.getY(k));
        }
        body.translate(cx, WALL_HEIGHT / 2, cz);
        bodies.push(body);

        const cap = new THREE.BoxGeometry(
          horizontal ? runLen : 0.18,
          0.09,
          horizontal ? 0.18 : runLen,
        );
        cap.translate(cx, WALL_HEIGHT + 0.045, cz);
        caps.push(cap);

        const col = {
          minX: horizontal ? Math.min(sx, ex) : cx - 0.6,
          maxX: horizontal ? Math.max(sx, ex) : cx + 0.6,
          minZ: horizontal ? cz - 0.6 : Math.min(sz, ez),
          maxZ: horizontal ? cz + 0.6 : Math.max(sz, ez),
          tag: 'racewall',
        };
        if (world) {
          world.addCollider(col);
          this.wallColliders.push(col);
        }
      }
    }

    if (bodies.length) {
      const merged = mergeGeometries(bodies, false);
      bodies.forEach((g) => g.dispose());
      const mat = new THREE.MeshStandardMaterial({
        map: barrierTexture(), roughness: 0.72, metalness: 0.08,
      });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.courseGroup.add(mesh);
    }
    if (caps.length) {
      const merged = mergeGeometries(caps, false);
      caps.forEach((g) => g.dispose());
      const mat = new THREE.MeshBasicMaterial({ color: 0x25e0ff, toneMapped: false });
      mat.color.multiplyScalar(2.1);
      this.courseGroup.add(new THREE.Mesh(merged, mat));
    }
  }

  _disposeCourse() {
    if (this.courseGroup) {
      this.courseGroup.parent?.remove(this.courseGroup);
      this.courseGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      this.courseGroup = null;
    }
    this._checkerTex = null;
    if (this.game.world) {
      for (const c of this.wallColliders) this.game.world.removeCollider(c);
    }
    this.wallColliders.length = 0;
    this.route = [];
    this.routeLens = [];
    this.routeTotal = 0;
    this.closedLoop = false;
    this.finish = null;
  }

  // ── grid ──────────────────────────────────────────────────
  _spawnRivals(start, yaw) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    this.rivals.length = 0;

    this.race.rivals.forEach((carId, i) => {
      const def = CAR_BY_ID[carId] || CAR_BY_ID.sp320;
      const side = i % 2 === 0 ? -3.6 : 3.6;
      const back = 7 + i * 8;
      const x = start.x - fx * back + rx * side;
      const z = start.z - fz * back + rz * side;
      const vehicle = new Vehicle(
        this.game.scene,
        def,
        {},
        emptyCosmetics(def.color),
        { simple: true, x, z, yaw },
      );
      vehicle.manual = false;
      vehicle.setNight(this.game.sky ? this.game.sky.night : 0);
      // A touch of extra bite so the field can actually corner cleanly.
      vehicle.stats = {
        ...vehicle.stats,
        grip: vehicle.stats.grip * 1.07,
        handling: vehicle.stats.handling * 1.06,
      };
      const proj = this._projectRouteS(vehicle.pos);
      this.rivals.push({
        vehicle,
        gateIdx: 0,
        lap: 1,
        score: 0,
        routeS: proj.s,
        boostHold: 0,
        finished: false,
        finishTime: 0,
        stuck: 0,
        offRoute: 0,
        laneBias: (i % 2 === 0 ? -1 : 1) * 1.7,
      });
    });
  }

  _disposeRivals() {
    for (const r of this.rivals) r.vehicle.dispose();
    this.rivals.length = 0;
  }

  // ── input ─────────────────────────────────────────────────
  controls() {
    const input = this.game.input;
    if (this.phase !== 'racing') {
      return { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    }
    return {
      throttle: input.throttle,
      brake: input.brake,
      steer: input.steer,
      handbrake: input.handbrake,
      boost: input.boost,
    };
  }

  // ── update ────────────────────────────────────────────────
  update(dt) {
    if (this.phase === 'idle') return;

    if (this.phase === 'intro') {
      this.phaseTimer += dt;
      const p = clamp(this.phaseTimer / INTRO_TIME, 0, 1);
      this.game.camera.updateCinematic(dt, this.player, p, 12);
      if (this.phaseTimer >= INTRO_TIME) {
        this.phase = 'countdown';
        this.phaseTimer = 0;
        this.game.hud.hideIntro();
        this.game.hud.showCountdown(3);
        this.game.audio.countdown(false);
      }
      return;
    }

    if (this.phase === 'countdown') {
      this.phaseTimer += dt;
      this.game.camera.updateCinematic(dt, this.player, 1, 12);
      if (this.phaseTimer >= COUNTDOWN_STEP) {
        this.phaseTimer = 0;
        this.count--;
        if (this.count > 0) {
          this.game.hud.showCountdown(this.count);
          this.game.audio.countdown(false);
        } else {
          this.game.hud.showGo();
          this.game.audio.countdown(true);
          this.phase = 'racing';
          this.time = 0;
          this._goTimer = 1.2;
          this.game.hud.setLetterbox(false);
          this.game.hud.setRaceVisible(true);
          this.game.camera.setMode(this.game.cameraMode === 'hood' ? 'hood' : 'chase');
          this.game.camera.snap(this.player);
          this._lastRaceId = this.race.id;
        }
      }
      return;
    }

    if (this.phase !== 'racing') return;

    if (this._goTimer > 0) {
      this._goTimer -= dt;
      if (this._goTimer <= 0) this.game.hud.hideCountdown();
    }

    this.time += dt;
    this._updateRivals(dt);
    this._updatePlayerProgress();
    if (this.phase !== 'racing') return;
    this._updateStandings();
    this._separate();

    this.game.hud.updateRace({
      position: this.position,
      total: this.totalRacers,
      lap: this.lap,
      laps: this.race.laps,
      time: this.time,
      name: this.race.name,
    });
  }

  _updatePlayerProgress() {
    const gate = this.race.gates[this.nextIdx];
    const d = Math.hypot(this.player.pos.x - gate.x, this.player.pos.z - gate.z);
    if (d >= GATE_RADIUS) return;

    this.game.audio.ui();
    if (this.game.effects) {
      this.game.effects.sparkBurst(gate.x, 1.4, gate.z, 10, 0, 1, 0.8);
    }
    this.nextIdx++;
    if (this.nextIdx >= this.race.gates.length) {
      this.nextIdx = 0;
      this.lap++;
      if (this.lap > this.race.laps) {
        this._finish();
        return;
      }
      this.lapToast();
    }
  }

  lapToast() {
    const left = this.race.laps - this.lap + 1;
    this.game.hud.toast('LAP', `LAP ${this.lap} OF ${this.race.laps}`, left === 1 ? 'FINAL LAP' : `${left} LAPS TO GO`, '');
  }

  _updateRivals(dt) {
    const race = this.race;
    const diff = race.difficulty || 1;
    const traffic = this.game.traffic;
    const playerS = this._projectRouteS(this.player.pos).s + (this.lap - 1) * this.routeTotal;

    for (const r of this.rivals) {
      const v = r.vehicle;
      if (r.finished) {
        v.vLong = 0;
        v.vLat = 0;
        continue;
      }

      const gate = race.gates[r.gateIdx];
      const distToGate = Math.hypot(gate.x - v.pos.x, gate.z - v.pos.z);
      if (distToGate < RIVAL_GATE_RADIUS) {
        r.gateIdx = (r.gateIdx + 1) % race.gates.length;
        if (r.gateIdx === 0) {
          r.lap++;
          if (r.lap > race.laps) {
            r.finished = true;
            r.finishTime = this.time;
            v.vLong = 0;
            v.vLat = 0;
            continue;
          }
        }
      }

      const proj = this._projectRouteS(v.pos);
      r.routeS = proj.s;
      const speed = v.speedMs;
      if (v.fuel < 22) v.fuel = 100;

      // A missed corner must not leave the driver lost on a parallel street:
      // if we stray from the course (or face the wrong way) snap back onto it.
      const routeYaw = this._routeYawAt(proj.s);
      const headingError = Math.abs(wrapAngle(routeYaw - v.yaw));
      // Rivals launch behind the first route point, so ignore the brief
      // "off course" reading while the field rolls up to the start line.
      const launched = this.time > 2.5;
      if (launched && (proj.dist > 16 || (headingError > 2.1 && speed > 6))) r.offRoute += dt;
      else r.offRoute = Math.max(0, r.offRoute - dt * 2);
      if (r.offRoute > 1.2) {
        r.offRoute = 0;
        const here = this._pointAtDistance(proj.s + 3);
        const ahead = this._pointAtDistance(proj.s + 22);
        const keep = Math.min(16, Math.max(8, speed * 0.45));
        v.setPose(here.x, here.z, Math.atan2(ahead.x - here.x, ahead.z - here.z));
        v.vLong = keep;
        v.fuel = Math.max(v.fuel, 30);
        continue;
      }

      // Look well down the course so the braking zone opens before a junction.
      const turn = this._nextTurn(proj.s, 280);

      // Pure pursuit with the carrot kept on the course. On approach the
      // carrot drifts to the inside of the coming turn (racing line), then
      // swings into the next street so the car turns in at corner speed.
      const idx = clamp(proj.idx, 1, this.route.length - 1);
      const dVertex = Math.max(0, this.routeLens[idx] - proj.s);
      const look = Math.min(60, 14 + speed * 1.3);
      const turnIn = 8 + speed * 1.6;
      let aimS;
      if (dVertex < turnIn) aimS = this.routeLens[idx] + 22;
      else aimS = proj.s + Math.min(look, Math.max(0, dVertex - 4));
      const aim = this._pointAtDistance(aimS);
      let bias = r.laneBias * clamp((dVertex - 10) / 24, 0, 1);
      // Swing wide on the approach so the car can use the full junction
      // instead of turning from the middle of the road.
      if (turn && turn.d < 48 && proj.dist < 6) {
        bias -= 2.4 * turn.dir * clamp((48 - turn.d) / 26, 0, 1);
      }
      const aimYaw = this._routeYawAt(aimS);
      const aimX = aim.x + Math.cos(aimYaw) * bias;
      const aimZ = aim.z - Math.sin(aimYaw) * bias;
      const bearing = Math.atan2(aimX - v.pos.x, aimZ - v.pos.z);
      const diffA = wrapAngle(bearing - v.yaw);

      // Pace with a tighter catch-up band than before.
      const rivalS = r.routeS + (r.lap - 1) * this.routeTotal;
      const rubber = clamp(1 + (playerS - rivalS) * 0.0016, 0.94, 1.10);
      let target = (26 + diff * 5) * rubber;

      // Brake for the next real corner using its distance, not a blind scan.
      if (turn) {
        const corner = clamp(34 - turn.ang * 17, 6.5, 30);
        const brakeA = 4.2 + diff * 0.4;
        const allowed = Math.sqrt(corner * corner + 2 * brakeA * Math.max(0, turn.d - 6));
        target = Math.min(target, allowed);
        if (turn.d < 6) target = Math.min(target, corner);
      }
      // A car that is wide of the course lifts so it can rejoin the line
      // instead of grinding along the barriers.
      if (proj.dist > 6) target = Math.min(target, 19);
      if (proj.dist > 10) target = Math.min(target, 12);

      const fx = Math.sin(v.yaw);
      const fz = Math.cos(v.yaw);
      const rx = Math.cos(v.yaw);
      const rz = -Math.sin(v.yaw);

      // Give traffic and slower cars room instead of ploughing through them.
      if (traffic) {
        for (const c of traffic.cars) {
          const dx = c.pos.x - v.pos.x;
          const dz = c.pos.z - v.pos.z;
          const ahead = dx * fx + dz * fz;
          if (ahead <= 1 || ahead > 26) continue;
          const side = dx * rx + dz * rz;
          if (Math.abs(side) > 3.3) continue;
          const limit = Math.max(2, c.speed + Math.max(0, ahead - 7) * 1.1);
          if (limit < target) target = limit;
        }
      }
      for (const other of this.rivals) {
        if (other === r) continue;
        const dx = other.vehicle.pos.x - v.pos.x;
        const dz = other.vehicle.pos.z - v.pos.z;
        const ahead = dx * fx + dz * fz;
        if (ahead <= 1 || ahead > 15) continue;
        if (Math.abs(dx * rx + dz * rz) > 3) continue;
        target = Math.min(target, Math.max(4, ahead * 1.15));
      }
      {
        const dx = this.player.pos.x - v.pos.x;
        const dz = this.player.pos.z - v.pos.z;
        const ahead = dx * fx + dz * fz;
        if (ahead > 1 && ahead < 15 && Math.abs(dx * rx + dz * rz) <= 3) {
          target = Math.min(target, Math.max(4, ahead * 1.15));
        }
      }

      if (r.boostHold > 0) r.boostHold -= dt;
      let boost = false;
      if ((!turn || turn.d > 90) && speed > 16) {
        if (r.boostHold > 0 || v.boostTank > 55) {
          if (r.boostHold <= 0) r.boostHold = 1.4 + diff * 0.15;
          boost = true;
        }
      }

      // Ackermann-style pure pursuit: ask for the wheel angle that matches
      // the arc through the carrot, instead of slamming full lock. Cap the
      // requested curvature at what the tyres can actually deliver so the
      // car does not command a slide it then has to chase.
      const carrot = Math.max(4, Math.hypot(aimX - v.pos.x, aimZ - v.pos.z));
      const grow = Math.min(1, speed / 8);
      const kappaMax = (20 * grow) / Math.max(1, speed * speed);
      const kappa = clamp((2 * Math.sin(diffA)) / carrot, -kappaMax, kappaMax);
      const wheel = Math.atan(v.wheelbase * kappa);
      const speedSteer = 0.62 / (1 + Math.pow(speed / 13, 1.32));
      const maxSteer = speedSteer * (v.stats.handling || 1);
      const yawDamp = clamp(v.yawRate * 0.15, -0.3, 0.3);
      let steerCmd = wheel / Math.max(0.06, maxSteer) + diffA * 1.1;
      // The tyre model only saturates at a real slip angle, so the gentle
      // pursuit angle cannot rotate the car through a junction. Add lock in
      // the turn direction as the vertex arrives.
      if (turn && turn.d < 10) {
        steerCmd += turn.dir * clamp((10 - turn.d) / 7, 0, 1) * 0.4;
      }
      const ctrl = {
        throttle: speed < target ? 1 : 0.08,
        brake: speed > target + 2.5 ? clamp((speed - target) / 3, 0, 1) : 0,
        steer: clamp(steerCmd - yawDamp, -1, 1),
        handbrake: false,
        boost,
      };
      v.update(dt, ctrl, this.game.world);
      if (v.speedMs < 1.5) r.stuck += dt;
      else r.stuck = 0;
      if (r.stuck > 2.2) {
        r.stuck = 0;
        const here = this._pointAtDistance(r.routeS + 4);
        const ahead = this._pointAtDistance(r.routeS + 20);
        const yaw = Math.atan2(ahead.x - here.x, ahead.z - here.z);
        v.setPose(here.x, here.z, yaw);
        v.vLong = 12;
        v.fuel = Math.max(v.fuel, 30);
      }
    }
  }

  _progress(lap, idx, pos) {
    const gates = this.race.gates;
    const gate = gates[idx];
    const prev = idx === 0 ? this.race.start : gates[idx - 1];
    const seg = Math.max(1, Math.hypot(gate.x - prev.x, gate.z - prev.z));
    const remaining = Math.hypot(gate.x - pos.x, gate.z - pos.z);
    const frac = clamp(1 - remaining / seg, 0, 0.98);
    return (lap - 1) * gates.length + idx + frac;
  }

  _updateStandings() {
    this.playerScore = this._progress(this.lap, this.nextIdx, this.player.pos);
    let pos = 1;
    for (const r of this.rivals) {
      if (r.finished) {
        r.score = 1e6 - r.finishTime;
      } else {
        r.score = this._progress(r.lap, r.gateIdx, r.vehicle.pos);
      }
      if (r.score > this.playerScore) pos++;
    }
    this.position = pos;
  }

  _separate() {
    const cars = this.rivals;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i].vehicle;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j].vehicle;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 3.4 || d < 1e-4) continue;
        const push = (3.4 - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        a.pos.x -= nx * push;
        a.pos.z -= nz * push;
        b.pos.x += nx * push;
        b.pos.z += nz * push;
        a.vLong *= 0.985;
        b.vLong *= 0.985;
      }
      const dx = a.pos.x - this.player.pos.x;
      const dz = a.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 3.6 && d > 1e-4) {
        a.pos.x += (dx / d) * (3.6 - d);
        a.pos.z += (dz / d) * (3.6 - d);
        a.vLong *= 0.9;
      }
    }
  }

  // ── finish ────────────────────────────────────────────────
  _finish() {
    this.phase = 'finished';
    this._updateStandings();
    const race = this.race;
    const pos = this.position;
    const time = this.time;
    const payout = pos <= race.payout.length ? race.payout[pos - 1] : 0;

    const best = this.save.best?.[race.id];
    const isRecord = !best || time < best;
    if (isRecord) {
      this.save.best = this.save.best || {};
      this.save.best[race.id] = time;
    }
    this.save.races = (this.save.races || 0) + 1;

    let unlockName = null;
    if (pos === 1) {
      this.save.wins = (this.save.wins || 0) + 1;
      if (!this.save.completed.includes(race.id)) this.save.completed.push(race.id);
      const next = RACES.find((r) => r.requires === race.id && !this.save.completed.includes(r.id));
      if (next) unlockName = next.name;
    }

    if (payout > 0) {
      this.save.money += payout;
      this.game.hud.setMoney(this.save.money);
      this.game.audio.cash();
    }
    writeSave(this.save);

    const player = this.player;
    player.vLong = 0;
    player.vLat = 0;
    player.yawRate = 0;

    this._disposeRivals();
    this._disposeCourse();
    this.game.hud.setRaceVisible(false);
    this.game.hud.setLetterbox(false);
    this.game.hud.hideCountdown();
    this.game.hud.showResults({
      position: pos,
      name: race.name,
      time,
      payout,
      best: isRecord ? time : best,
      unlockName,
      isRecord,
      canRetry: true,
    });
    this.game.audio.finish();
    this.game.state = 'results';
    this.phase = 'idle';
    this.race = null;
    this.game.objective = '';
  }

  // ── helpers for HUD / minimap ─────────────────────────────
  hudState() {
    if (this.phase !== 'racing') return null;
    return {
      position: this.position,
      total: this.totalRacers,
      lap: this.lap,
      laps: this.race.laps,
      time: this.time,
      name: this.race.name,
    };
  }
}
