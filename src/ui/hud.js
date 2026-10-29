import {
  formatMoney, formatTime, formatClock, formatDistance, phaseFor, clamp, ordinal,
} from '../util.js';
import {
  ROAD_LINES, RING, RACES, RACE_BY_ID, GARAGE, DEALER, LANDMARKS, CAR_BY_ID,
} from '../data.js';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';

export class Hud {
  constructor() {
    this.root = $('hud');
    this.money = $('moneyValue');
    this.clockValue = $('clockValue');
    this.clockPhase = $('clockPhase');
    this.clockFill = $('clockFill');
    this.objectiveName = $('objectiveName');
    this.objectiveDist = $('objectiveDist');
    this.speedValue = $('speedValue');
    this.gearValue = $('gearValue');
    this.rpmFill = $('rpmFill');
    this.rpmBar = this.rpmFill ? this.rpmFill.parentElement : null;
    this.shiftHint = $('shiftHint');
    this.nitroFill = $('nitroFill');
    this.fuelFill = $('fuelFill');
    this.fuelWrap = $('fuelWrap');
    this.gaugeArc = $('gaugeArc');
    this.needle = $('gaugeNeedle');
    this.gaugeTicks = $('gaugeTicks');
    this.speedlines = $('speedlines');
    this.prompt = $('prompt');
    this.promptText = $('promptText');
    this.challenge = $('challengeHud');
    this.challengeTitle = $('challengeTitle');
    this.challengeScore = $('challengeScore');
    this.challengeTarget = $('challengeTarget');
    this.challengeFill = $('challengeFill');
    this.driftHud = $('driftHud');
    this.driftPoints = $('driftPoints');
    this.driftMult = $('driftMult');
    this.driftSub = $('driftSub');
    this._lastDriftMult = 0;
    this.raceHud = $('raceHud');
    this.racePos = $('racePos');
    this.raceTotal = $('raceTotal');
    this.raceName = $('raceName');
    this.raceLap = $('raceLap');
    this.raceTime = $('raceTime');
    this.letterbox = $('letterbox');
    this.intro = $('introOverlay');
    this.introKicker = $('introKicker');
    this.introName = $('introEventName');
    this.introLen = $('introLen');
    this.introRivals = $('introRivals');
    this.introReward = $('introReward');
    this.introTip = $('introTip');
    this.countdown = $('countdown');
    this.countdownNum = $('countdownNum');
    this.goText = $('goText');
    this.toasts = $('toasts');
    this.results = $('resultsScreen');
    this.resultPlace = $('resultPlace');
    this.resultOrd = $('resultOrd');
    this.resultKicker = $('resultKicker');
    this.resultName = $('resultName');
    this.resultTime = $('resultTime');
    this.resultPayout = $('resultPayout');
    this.resultBest = $('resultBest');
    this.resultUnlock = $('resultUnlock');
    this.resultUnlockName = $('resultUnlockName');
    this.btnRetry = $('btnResultRetry');
    this.btnContinue = $('btnResultContinue');
    this.navHud = $('navHud');
    this.navInst = $('navInst');
    this.navDest = $('navDest');
    this.navRemain = $('navRemain');
    this.navArrow = $('navArrow');

    this.arcLength = 500;
    try { this.arcLength = this.gaugeArc.getTotalLength() || 500; } catch { /* ignore */ }
    this.gaugeArc.style.strokeDasharray = `${this.arcLength}`;
    this.gaugeArc.style.strokeDashoffset = `${this.arcLength}`;
    this._buildTicks();

    this._lastGear = '';
    this._lastMoney = null;
    this._lastToast = 0;
    this._promptShown = false;
  }

  _buildTicks() {
    for (let i = 0; i <= 12; i++) {
      const major = i % 2 === 0;
      const angle = -120 + (i / 12) * 240;
      const rad = (angle * Math.PI) / 180;
      const r1 = 84, r2 = major ? 72 : 78;
      const cx = 130, cy = 150;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', cx + Math.sin(rad) * r1);
      line.setAttribute('y1', cy - Math.cos(rad) * r1);
      line.setAttribute('x2', cx + Math.sin(rad) * r2);
      line.setAttribute('y2', cy - Math.cos(rad) * r2);
      if (major) line.setAttribute('class', 'major');
      this.gaugeTicks.appendChild(line);
      if (major) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', cx + Math.sin(rad) * 61);
        text.setAttribute('y', cy - Math.cos(rad) * 61 + 2.5);
        text.textContent = String(i * 25);
        this.gaugeTicks.appendChild(text);
      }
    }
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setMoney(value) {
    if (value === this._lastMoney) return;
    this._lastMoney = value;
    this.money.textContent = formatMoney(value);
  }

  setClock(hour) {
    this.clockValue.textContent = formatClock(hour);
    this.clockPhase.textContent = phaseFor(hour);
    this.clockFill.style.width = `${((hour % 24) / 24) * 100}%`;
  }

  setObjective(name, distance, sub = '') {
    this.objectiveName.textContent = name;
    if (sub) this.objectiveName.textContent += ` — ${sub}`;
    this.objectiveDist.textContent = distance == null ? '--' : `${Math.max(0, Math.round(distance))} m`;
  }

  setNav(state) {
    if (!state || !state.active) {
      if (this._navShown) {
        this.navHud.classList.add('hidden');
        this._navShown = false;
      }
      return;
    }
    if (!this._navShown) {
      this.navHud.classList.remove('hidden');
      this._navShown = true;
    }
    const inst = state.arrived ? 'DESTINATION REACHED' : state.instruction;
    if (this._navInst !== inst) {
      this.navInst.textContent = inst;
      this._navInst = inst;
    }
    if (this._navDest !== state.label) {
      this.navDest.textContent = state.label;
      this._navDest = state.label;
    }
    const remain = state.arrived ? 'STOP HERE' : `${formatDistance(state.remaining)} REMAINING`;
    if (this._navRemain !== remain) {
      this.navRemain.textContent = remain;
      this._navRemain = remain;
    }
    if (this._navArrowVal !== state.arrow) {
      this._navArrowVal = state.arrow;
      this.navArrow.style.transform = `rotate(${state.arrow.toFixed(1)}deg)`;
    }
    this.navHud.classList.toggle('arrived', !!state.arrived);
  }

  showPrompt(text) {
    if (this.promptText.textContent !== text) this.promptText.textContent = text;
    if (!this._promptShown) {
      this.prompt.classList.remove('hidden');
      this._promptShown = true;
    }
  }

  hidePrompt() {
    if (this._promptShown) {
      this.prompt.classList.add('hidden');
      this._promptShown = false;
    }
  }

  update(dt, vehicle, opts = {}) {
    const speed = vehicle.speedKmh;
    this.speedValue.textContent = String(Math.round(speed));
    const gear = vehicle.displayGear;
    if (gear !== this._lastGear) {
      this.gearValue.textContent = gear;
      this._lastGear = gear;
    }
    const redline = vehicle.redline || 7600;
    const rpm = clamp(vehicle.rpm / redline, 0, 1);
    this.rpmFill.style.width = `${(0.06 + rpm * 0.94) * 100}%`;
    this.rpmBar?.classList.toggle('hot', rpm > 0.93);
    this.gearValue.classList.toggle('shift', (vehicle.shiftFlash || 0) > 0.01);
    this.shiftHint?.classList.toggle('on', !!vehicle.manual && rpm > 0.88 && speed > 14 && !vehicle.shifting);
    this.nitroFill.style.transform = `scaleY(${vehicle.boostRatio})`;
    if (this.fuelFill && vehicle.fuel != null) {
      const ratio = clamp(vehicle.fuel / (vehicle.fuelCapacity || 100), 0, 1);
      this.fuelFill.style.transform = `scaleY(${ratio})`;
      this.fuelWrap?.classList.toggle('low', ratio < 0.2);
    }

    const g = clamp(speed / 320, 0, 1);
    this.gaugeArc.style.strokeDashoffset = String(this.arcLength * (1 - g));
    const angle = -120 + g * 240;
    this.needle.style.transform = `rotate(${angle}deg)`;

    const lines = clamp((speed - 120) / 170, 0, 1) * 0.8 + (vehicle.boosting ? 0.35 : 0);
    if (lines > 0.12) {
      this.speedlines.classList.add('on');
      this.speedlines.style.opacity = String(clamp(lines, 0, 1));
    } else {
      this.speedlines.classList.remove('on');
      this.speedlines.style.opacity = '0';
    }
  }

  toast(title, main, sub = '', kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`.trim();
    const t = document.createElement('div');
    t.className = 'toast-title';
    t.textContent = title;
    const m = document.createElement('div');
    m.className = 'toast-main';
    m.textContent = main;
    el.appendChild(t);
    el.appendChild(m);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'toast-sub';
      s.textContent = sub;
      el.appendChild(s);
    }
    this.toasts.appendChild(el);
    const life = kind === 'unlock' ? 5200 : 3800;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, life);
  }

  // ── race HUD ───────────────────────────────────────────────
  setRaceVisible(v) {
    this.raceHud.classList.toggle('visible', v);
  }

  updateRace({ position, total, lap, laps, time, name }) {
    this.racePos.textContent = String(position);
    this.raceTotal.textContent = String(total);
    if (name) this.raceName.textContent = name;
    this.raceLap.textContent = `LAP ${lap}/${laps}`;
    this.raceTime.textContent = formatTime(time);
  }

  // ── letterbox / intro / countdown ─────────────────────────
  setLetterbox(on) {
    this.letterbox.classList.toggle('active', on);
  }

  showIntro(race, distanceKm, rivals, reward) {
    this.introKicker.textContent = `${race.type.toUpperCase()} · ${race.district}`;
    this.introName.textContent = race.name;
    this.introLen.textContent = `${distanceKm.toFixed(1)} KM`;
    this.introRivals.textContent = String(rivals);
    this.introReward.textContent = `$${formatMoney(reward)}`;
    this.introTip.textContent = race.tip || 'Win to unlock new events across the city.';
    this.intro.classList.add('show');
  }

  hideIntro() {
    this.intro.classList.remove('show');
  }

  showCountdown(value) {
    this.countdown.classList.add('active');
    this.goText.style.display = 'none';
    this.countdownNum.style.display = '';
    this.countdownNum.textContent = String(value);
    this.countdownNum.classList.remove('tick');
    void this.countdownNum.offsetWidth;
    this.countdownNum.classList.add('tick');
  }

  showGo() {
    this.countdown.classList.add('active');
    this.countdownNum.style.display = 'none';
    this.goText.style.display = 'block';
    this.goText.style.animation = 'none';
    void this.goText.offsetWidth;
    this.goText.style.animation = '';
  }

  hideCountdown() {
    this.countdown.classList.remove('active');
    this.goText.style.display = 'none';
  }

  // ── free roam challenges ─────────────────────────────────
  setChallenge(title, score, target, hint = '') {
    this.challenge.classList.remove('hidden');
    this.challengeTitle.textContent = title;
    this.challengeScore.textContent = formatMoney(score);
    this.challengeTarget.textContent = `/ ${formatMoney(target)}`;
    const pct = clamp(score / target, 0, 1) * 100;
    this.challengeFill.style.width = `${pct}%`;
    this._challengeHint = hint;
  }

  hideChallenge() {
    this.challenge.classList.add('hidden');
  }

  // ── drift chain ───────────────────────────────────────────
  setDriftCombo(state) {
    if (!state) {
      this.driftHud.classList.add('hidden');
      this._lastDriftMult = 0;
      return;
    }
    this.driftHud.classList.remove('hidden');
    this.driftPoints.textContent = formatMoney(state.points);
    this.driftSub.textContent = state.sub || 'KEEP IT SLIDING';
    if (state.mult !== this._lastDriftMult) {
      this.driftMult.textContent = `x${state.mult}`;
      if (state.mult > 1) {
        this.driftMult.classList.remove('pop');
        void this.driftMult.offsetWidth;
        this.driftMult.classList.add('pop');
      }
      this._lastDriftMult = state.mult;
    }
  }

  // ── results ───────────────────────────────────────────────
  showResults(data) {
    const { position, name, time, payout, best, unlockName, isRecord } = data;
    this.resultPlace.textContent = String(position);
    this.resultOrd.textContent = ordinal(position).toLowerCase();
    this.resultKicker.textContent = position === 1 ? 'EVENT COMPLETE · VICTORY' : 'EVENT COMPLETE';
    this.resultName.textContent = name;
    this.resultTime.textContent = formatTime(time);
    this.resultPayout.textContent = `$${formatMoney(payout)}`;
    this.resultBest.textContent = best ? formatTime(best) : '--:--.--';
    if (unlockName) {
      this.resultUnlock.classList.remove('hidden');
      this.resultUnlockName.textContent = unlockName;
    } else {
      this.resultUnlock.classList.add('hidden');
    }
    this.btnRetry.classList.toggle('hidden', !data.canRetry);
    this.results.classList.remove('hidden');
  }

  hideResults() {
    this.results.classList.add('hidden');
  }

  drawSpeedometerTicks() { /* retained for API symmetry */ }
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const RACE_COLORS = {
  won: '#4dffa6',
  available: '#ffb020',
  locked: '#5e6772',
};

const MAP_INK = {
  land: '#eef1ea',
  water: '#a9d7f2',
  waterEdge: '#8bc4e6',
  building: '#dcd8d0',
  buildingMid: '#d3cfc6',
  buildingTall: '#c8c2b8',
  buildingEdge: 'rgba(118,109,95,.34)',
  park: '#c8e5c2',
  parkEdge: '#b2d6ab',
  plaza: '#e3e5de',
  roadCasing: '#d1d6d2',
  road: '#ffffff',
  ringCasing: '#e6c67f',
  ring: '#ffd98a',
  path: '#ffffff',
};

function drawWorldBase(ctx, s, cx, cz, range, detail = true, buildings = null) {
  const half = range / 2;
  const toX = (x) => (x - cx) * s;
  const toY = (z) => (z - cz) * s;

  ctx.fillStyle = MAP_INK.land;
  ctx.fillRect(-half * s, -half * s, range * s, range * s);

  // waterfront east
  const shore = toX(1106);
  ctx.fillStyle = MAP_INK.water;
  ctx.fillRect(shore, -half * s, (half + 400) * s, range * s);
  ctx.strokeStyle = MAP_INK.waterEdge;
  ctx.lineWidth = Math.max(1, 3 * s);
  ctx.beginPath();
  ctx.moveTo(shore, -half * s);
  ctx.lineTo(shore, half * s);
  ctx.stroke();

  // park
  ctx.fillStyle = MAP_INK.park;
  ctx.fillRect(toX(-63), toY(97), 126 * s, 126 * s);
  ctx.strokeStyle = MAP_INK.parkEdge;
  ctx.lineWidth = Math.max(0.8, 2 * s);
  ctx.strokeRect(toX(-63), toY(97), 126 * s, 126 * s);
  // plaza
  ctx.fillStyle = MAP_INK.plaza;
  ctx.fillRect(toX(-544), toY(416), 128 * s, 128 * s);

  // building footprints
  if (buildings && buildings.length) {
    for (const b of buildings) {
      if (b.x + b.w / 2 < cx - half || b.x - b.w / 2 > cx + half ||
          b.z + b.d / 2 < cz - half || b.z - b.d / 2 > cz + half) continue;
      const bx = toX(b.x - b.w / 2);
      const by = toY(b.z - b.d / 2);
      const bw = Math.max(1, b.w * s);
      const bd = Math.max(1, b.d * s);
      ctx.fillStyle = b.h > 70 ? MAP_INK.buildingTall : b.h > 28 ? MAP_INK.buildingMid : MAP_INK.building;
      ctx.fillRect(bx, by, bw, bd);
      if (bw > 5 && bd > 5) {
        ctx.strokeStyle = MAP_INK.buildingEdge;
        ctx.lineWidth = 0.8;
        ctx.strokeRect(bx + 0.4, by + 0.4, bw - 0.8, bd - 0.8);
      }
    }
  } else if (detail) {
    ctx.fillStyle = '#e6e7e1';
    for (let i = 0; i < ROAD_LINES.length - 1; i++) {
      for (let j = 0; j < ROAD_LINES.length - 1; j++) {
        const x0 = ROAD_LINES[i] + 12, x1 = ROAD_LINES[i + 1] - 12;
        const z0 = ROAD_LINES[j] + 12, z1 = ROAD_LINES[j + 1] - 12;
        ctx.fillRect(toX(x0), toY(z0), (x1 - x0) * s, (z1 - z0) * s);
      }
    }
  }

  // streets: soft casing then white fill
  const roadW = Math.max(2.2, 24 * s);
  const roadPath = () => {
    ctx.beginPath();
    for (const l of ROAD_LINES) {
      ctx.moveTo(toX(l), toY(-CITY_EXT));
      ctx.lineTo(toX(l), toY(CITY_EXT));
      ctx.moveTo(toX(-CITY_EXT), toY(l));
      ctx.lineTo(toX(CITY_EXT), toY(l));
    }
  };
  ctx.strokeStyle = MAP_INK.roadCasing;
  ctx.lineWidth = roadW + Math.max(1.2, 3.2 * s);
  roadPath();
  ctx.stroke();
  ctx.strokeStyle = MAP_INK.road;
  ctx.lineWidth = roadW;
  roadPath();
  ctx.stroke();

  // ring motorway
  const ringW = Math.max(2.8, 30 * s);
  ctx.strokeStyle = MAP_INK.ringCasing;
  ctx.lineWidth = ringW + Math.max(1.4, 3.2 * s);
  ctx.strokeRect(toX(-RING), toY(-RING), RING * 2 * s, RING * 2 * s);
  ctx.strokeStyle = MAP_INK.ring;
  ctx.lineWidth = ringW;
  ctx.strokeRect(toX(-RING), toY(-RING), RING * 2 * s, RING * 2 * s);

  // park paths
  ctx.strokeStyle = MAP_INK.path;
  ctx.lineWidth = Math.max(1.2, 10 * s);
  ctx.beginPath();
  ctx.moveTo(toX(0), toY(97)); ctx.lineTo(toX(0), toY(223));
  ctx.moveTo(toX(-63), toY(160)); ctx.lineTo(toX(63), toY(160));
  ctx.stroke();
}

function drawPoiPin(ctx, x, z, color, letter, rot = 0, scale = 1, label = '') {
  ctx.save();
  ctx.translate(x, z);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(24,32,40,.4)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 7.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 5.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 8px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 0, 0.5);
  if (label) {
    ctx.save();
    ctx.translate(9, 0);
    if (rot) ctx.rotate(-rot);
    ctx.font = '600 8px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.strokeText(label, 0, 0.5);
    ctx.fillStyle = '#39434d';
    ctx.fillText(label, 0, 0.5);
    ctx.restore();
  }
  ctx.restore();
}

function mapLabel(ctx, text, x, y, color = '#3d4a56', font = '600 11px Inter, system-ui, sans-serif') {
  ctx.font = font;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

const CITY_EXT = 1120;

function drawNavRoute(ctx, nav, player, project, t = 0) {
  if (!nav || !nav.active) return;
  const pts = nav.drawPoints(player);
  if (!pts || pts.length < 2) return;
  const path = () => {
    const p0 = project(pts[0]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = project(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(26,115,232,.18)';
  ctx.lineWidth = 11;
  path();
  ctx.stroke();
  ctx.strokeStyle = '#1a73e8';
  ctx.lineWidth = 3;
  ctx.setLineDash([13, 10]);
  ctx.lineDashOffset = -((t * 24) % 23);
  path();
  ctx.stroke();
  ctx.setLineDash([]);

  const end = project(pts[pts.length - 1]);
  const pulse = 6.5 + Math.sin(t * 4) * 1.5;
  ctx.strokeStyle = 'rgba(26,115,232,.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(end.x, end.y, pulse + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1a73e8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function raceRemaining(route, player) {
  if (!route || route.length < 2) return [];
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length; i++) {
    const dx = route[i].x - player.pos.x;
    const dz = route[i].z - player.pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  const out = [{ x: player.pos.x, z: player.pos.z }];
  for (let i = best; i < route.length; i++) out.push(route[i]);
  return out;
}

function strokePath(ctx, pts, project) {
  if (!pts.length) return;
  const p0 = project(pts[0]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < pts.length; i++) {
    const p = project(pts[i]);
    ctx.lineTo(p.x, p.y);
  }
}

function drawRaceRoute(ctx, state, player, project, t, wide) {
  const route = state && state.route;
  if (!route || route.length < 2) return;
  const rem = raceRemaining(route, player);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(37,224,255,.13)';
  ctx.lineWidth = wide ? 11 : 7;
  strokePath(ctx, route, project);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(37,224,255,.4)';
  ctx.lineWidth = wide ? 2.4 : 2;
  strokePath(ctx, route, project);
  ctx.stroke();

  if (rem.length > 1) {
    ctx.strokeStyle = 'rgba(37,224,255,.95)';
    ctx.lineWidth = wide ? 3.2 : 2.8;
    ctx.setLineDash(wide ? [16, 12] : [10, 8]);
    ctx.lineDashOffset = -((t * 26) % 28);
    strokePath(ctx, rem, project);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawRaceFlag(ctx, p, color, size) {
  const half = size / 2;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 === 0 ? color : '#0a0f15';
      ctx.fillRect(p.x + (i - 1) * half, p.y + (j - 1) * half, half, half);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - half, p.y - half, size, size);
}

function drawRaceMarkers(ctx, state, project, labels) {
  if (!state) return;
  if (state.start) {
    const p = project(state.start);
    drawRaceFlag(ctx, p, '#25e0ff', labels ? 12 : 8);
    if (labels) {
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9ff4ff';
      ctx.fillText(state.closed ? 'START / FINISH' : 'START', p.x + 11, p.y + 4);
    }
  }
  if (state.finish && !state.closed) {
    const p = project(state.finish);
    drawRaceFlag(ctx, p, '#ffb020', labels ? 12 : 8);
    if (labels) {
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd68a';
      ctx.fillText('FINISH', p.x + 11, p.y + 4);
    }
  }
}

export class MiniMap {
  constructor() {
    this.canvas = $('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.size = 320;
    this.range = 860;
    this.t = 0;
  }

  draw(dt, player, save, raceState, nav = null, traffic = null, world = null) {
    this.t += dt;
    const ctx = this.ctx;
    const S = this.size;
    const s = S / this.range;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = MAP_INK.land;
    ctx.fillRect(0, 0, S, S);

    const rot = player.yaw + Math.PI;
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(rot);
    drawWorldBase(ctx, s, player.pos.x, player.pos.z, this.range, false, world ? world.buildings : null);

    if (raceState) {
      // closed course: the racing line replaces every checkpoint marker
      const project = (p) => ({
        x: (p.x - player.pos.x) * s,
        y: (p.z - player.pos.z) * s,
      });
      drawRaceRoute(ctx, raceState, player, project, this.t, false);
      drawRaceMarkers(ctx, raceState, project, false);
    } else {
      // race markers
      for (const race of RACES) {
        const won = save.completed.includes(race.id);
        const unlocked = !race.requires || save.completed.includes(race.requires);
        const color = won ? RACE_COLORS.won : unlocked ? RACE_COLORS.available : RACE_COLORS.locked;
        this._marker(ctx, (race.start.x - player.pos.x) * s, (race.start.z - player.pos.z) * s, 6, color, won);
      }
      // garage & dealer
      drawPoiPin(ctx, (GARAGE.x - player.pos.x) * s, (GARAGE.z - player.pos.z) * s, '#0aa2c0', 'G', rot, 1.15);
      drawPoiPin(ctx, (DEALER.x - player.pos.x) * s, (DEALER.z - player.pos.z) * s, '#f0a020', 'D', rot, 1.15);
      for (const lm of LANDMARKS) {
        drawPoiPin(ctx, (lm.x - player.pos.x) * s, (lm.z - player.pos.z) * s, lm.color, lm.short, rot, 1.15);
      }
    }

    // rivals
    if (raceState && raceState.rivals) {
      ctx.fillStyle = '#e53935';
      for (const r of raceState.rivals) {
        const x = (r.pos.x - player.pos.x) * s;
        const z = (r.pos.z - player.pos.z) * s;
        if (Math.abs(x) > 190 || Math.abs(z) > 190) continue;
        ctx.beginPath();
        ctx.arc(x, z, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // nearby traffic
    if (traffic) {
      const limit = 150;
      for (const c of traffic.parked) {
        const x = (c.pos.x - player.pos.x) * s;
        const z = (c.pos.z - player.pos.z) * s;
        if (Math.abs(x) > limit || Math.abs(z) > limit) continue;
        ctx.fillStyle = 'rgba(126,137,148,.6)';
        ctx.fillRect(x - 1.7, z - 1.7, 3.4, 3.4);
      }
      ctx.fillStyle = '#e08a1e';
      for (const c of traffic.cars) {
        const x = (c.pos.x - player.pos.x) * s;
        const z = (c.pos.z - player.pos.z) * s;
        if (Math.abs(x) > limit || Math.abs(z) > limit) continue;
        ctx.beginPath();
        ctx.arc(x, z, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawNavRoute(ctx, nav, player, (p) => ({
      x: (p.x - player.pos.x) * s,
      y: (p.z - player.pos.z) * s,
    }), this.t);
    ctx.restore();

    // player arrow (always centred, pointing up)
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = '#1a73e8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(26,115,232,.45)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7.5, 8.5);
    ctx.lineTo(0, 4.8);
    ctx.lineTo(-7.5, 8.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  _marker(ctx, x, z, r, color) {
    if (Math.abs(x) > 150 || Math.abs(z) > 150) {
      const d = Math.hypot(x, z) || 1;
      x = (x / d) * 148;
      z = (z / d) * 148;
      ctx.fillStyle = hexToRgba(color, 0.65);
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x, z - r);
    ctx.lineTo(x + r * 0.86, z + r * 0.6);
    ctx.lineTo(x - r * 0.86, z + r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export class BigMap {
  constructor() {
    this.canvas = $('bigmap');
    this.ctx = this.canvas.getContext('2d');
    this.size = 1400;
  }

  draw(player, save, raceState, t = 0, nav = null, traffic = null, world = null) {
    const ctx = this.ctx;
    const S = this.size;
    const range = 2800;
    const s = S / range;
    const cx = 0, cz = 0;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    drawWorldBase(ctx, s, cx, cz, range, true, world ? world.buildings : null);
    ctx.restore();

    // district labels
    const labels = [
      ['DOWNTOWN', 0, -30], ['MIDTOWN', 240, 240], ['FOUNDRY', -720, 720],
      ['NORTHGATE', 400, -640], ['OLD TOWN', -640, -240], ['COASTLINE', 960, 80],
    ];
    ctx.textAlign = 'center';
    for (const [label, x, z] of labels) {
      mapLabel(ctx, label, (x - cx) * s + S / 2, (z - cz) * s + S / 2, 'rgba(96,110,120,.6)', '700 18px Inter, system-ui, sans-serif');
    }

    // races
    for (const race of RACES) {
      const won = save.completed.includes(race.id);
      const unlocked = !race.requires || save.completed.includes(race.requires);
      const color = won ? RACE_COLORS.won : unlocked ? RACE_COLORS.available : RACE_COLORS.locked;
      const x = (race.start.x - cx) * s + S / 2;
      const z = (race.start.z - cz) * s + S / 2;
      const pulse = unlocked && !won ? Math.sin(t * 3 + race.start.x) * 2 : 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, z, 10 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, z, 7.2 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, z, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'left';
      mapLabel(ctx, race.name, x + 16, z + 4, won ? '#1d7a4f' : unlocked ? '#2f3b47' : '#7b8792', '600 15px Inter, system-ui, sans-serif');
    }

    // garage / dealer
    const gx = (GARAGE.x - cx) * s + S / 2;
    const gz = (GARAGE.z - cz) * s + S / 2;
    drawPoiPin(ctx, gx, gz, '#0aa2c0', 'G', 0, 1.7);
    ctx.textAlign = 'left';
    mapLabel(ctx, 'APEX GARAGE', gx + 16, gz + 5, '#2f3b47', '600 14px Inter, system-ui, sans-serif');

    const dx = (DEALER.x - cx) * s + S / 2;
    const dz = (DEALER.z - cz) * s + S / 2;
    drawPoiPin(ctx, dx, dz, '#f0a020', 'D', 0, 1.7);
    mapLabel(ctx, 'APEX MOTORS', dx + 16, dz + 5, '#2f3b47', '600 14px Inter, system-ui, sans-serif');

    // landmarks
    for (const lm of LANDMARKS) {
      const lx = (lm.x - cx) * s + S / 2;
      const lz = (lm.z - cz) * s + S / 2;
      drawPoiPin(ctx, lx, lz, lm.color, lm.short, 0, 1.7);
      mapLabel(ctx, lm.name, lx + 16, lz + 5, '#2f3b47', '600 14px Inter, system-ui, sans-serif');
    }

    drawNavRoute(ctx, nav, player, (p) => ({
      x: p.x * s + S / 2,
      y: p.z * s + S / 2,
    }), t);

    if (raceState) {
      const project = (p) => ({
        x: (p.x - cx) * s + S / 2,
        y: (p.z - cz) * s + S / 2,
      });
      drawRaceRoute(ctx, raceState, player, project, t, true);
      drawRaceMarkers(ctx, raceState, project, true);
    }

    // traffic
    if (traffic) {
      ctx.fillStyle = 'rgba(126,137,148,.65)';
      for (const c of traffic.parked) {
        ctx.fillRect((c.pos.x - cx) * s + S / 2 - 1.6, (c.pos.z - cz) * s + S / 2 - 1.6, 3.2, 3.2);
      }
      ctx.fillStyle = 'rgba(224,138,30,.85)';
      for (const c of traffic.cars) {
        ctx.beginPath();
        ctx.arc((c.pos.x - cx) * s + S / 2, (c.pos.z - cz) * s + S / 2, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // player
    const px = (player.pos.x - cx) * s + S / 2;
    const pz = (player.pos.z - cz) * s + S / 2;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#1a73e8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.6;
    ctx.shadowColor = 'rgba(26,115,232,.4)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  worldFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const px = ((e.clientX - rect.left) / rect.width) * this.size;
    const pz = ((e.clientY - rect.top) / rect.height) * this.size;
    const worldPerPx = 2800 / this.size;
    return {
      x: (px - this.size / 2) * worldPerPx,
      z: (pz - this.size / 2) * worldPerPx,
    };
  }
}

export { RACE_COLORS };
