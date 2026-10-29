import * as THREE from 'three';
import {
  RACES, RACE_BY_ID, GARAGE, DEALER, CAR_BY_ID, SPEED_TRAPS, DRIFT_ZONES,
} from '../data.js';
import { clamp, formatMoney, formatTime } from '../util.js';
import { writeSave } from '../storage.js';
import { RaceManager } from './race.js';

const TIME_SPEEDS = { slow: 1 / 150, normal: 1 / 80, fast: 1 / 32 };

export class Game {
  constructor(deps) {
    Object.assign(this, deps);
    this.state = 'menu';
    this.hour = this.save.timeOfDay ?? 18.35;
    this.cameraMode = 'chase';
    this.autosaveTimer = 0;
    this.objective = '';
    this.promptKey = '';
    this.activeTrap = null;
    this.activeDrift = null;
    this.driftScore = 0;
    this.driftChainPts = 0;
    this.driftChainMult = 1;
    this.driftChainTime = 0;
    this.driftChainIdle = 0;
    this.driftChainOn = false;
    this._lastImpact = 0;
    this.raceManager = null;
    this.traffic = this.traffic || null;
    this.garage = null;
    this.dealer = null;
    this._nearRace = null;
    this._nearGarage = false;
    this._nearDealer = false;
    this._mapTimer = 0;
    this._lastHudMoney = -1;
    this._started = false;
    this._fuelOut = false;
    this._fuelTimer = 0;
    this.time = 0;
    this.raceManager = new RaceManager(this);

    if (this.bigmap && this.bigmap.canvas) {
      this.bigmap.canvas.addEventListener('click', (e) => this._onMapClick(e));
    }
    const navClear = document.getElementById('navClear');
    if (navClear) {
      navClear.addEventListener('click', (e) => {
        e.stopPropagation();
        this.clearNav();
      });
    }
    const mapClear = document.getElementById('mapNavClear');
    if (mapClear) mapClear.addEventListener('click', () => this.clearNav());
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this.save.timeOfDay = this.hour;
    this.sky.setHour(this.hour);
    this.hud.setClock(this.hour);
  }

  applySaveToPlayer() {
    const carId = this.save.active;
    const def = CAR_BY_ID[carId];
    if (!def) return;
    const owned = this.save.owned[carId];
    // keep the car exactly where it is parked, not at the last autosave point
    const px = this.player ? this.player.pos.x : (this.save.position?.x ?? GARAGE.spawn.x);
    const pz = this.player ? this.player.pos.z : (this.save.position?.z ?? GARAGE.spawn.z);
    const pyaw = this.player ? this.player.yaw : (this.save.position?.yaw ?? GARAGE.spawn.yaw);
    if (this.player) this.player.dispose();
    this.player = new this.VehicleClass(this.scene, def, owned.upgrades, owned.cosmetics, {
      isPlayer: true,
      effects: this.effects,
      audio: this.audio,
      headlights: true,
      x: px,
      z: pz,
      yaw: pyaw,
      fuel: owned.fuel ?? 100,
    });
    this.player.setNight(this.sky.night);
    this.camera.snap(this.player);
    this.hud.setMoney(this.save.money);
    this.save.position = { x: px, z: pz, yaw: pyaw };
    this.objective = '';
  }

  begin() {
    this.setHour(this.hour);
    this.hud.setMoney(this.save.money);
    this.hud.setClock(this.hour);
    this.camera.setMode('orbit');
    this.camera.orbitAround(0, { x: this.player.pos.x, z: this.player.pos.z }, 9.5, 2.1, 0.16);
    this.camera.snapDone = false;
    this._updateObjective();
  }

  startRun() {
    this.state = 'play';
    this.hud.show();
    this.camera.setMode(this.cameraMode === 'hood' ? 'hood' : 'chase');
    this.camera.snap(this.player);
    this.player.setPose(this.save.position?.x ?? GARAGE.spawn.x, this.save.position?.z ?? GARAGE.spawn.z, this.save.position?.yaw ?? GARAGE.spawn.yaw);
    this._started = true;
    if (this.nav) this.nav.setBeaconVisible(true);
    this._updateObjective();
    this.toast('WELCOME TO APEX CITY', 'Drive to a glowing marker', 'M city map · F interact', '');
    if (!this._manualTipShown) {
      this._manualTipShown = true;
      this.toast('MANUAL GEARBOX', 'Q / E to shift down / up', 'SHIFT = NOS · watch the rev counter', '');
    }
    if (!this.save.visitedGarage) {
      this.toast('STARTER CAR', 'BAVARIS SP 320', 'Reach the APEX GARAGE to upgrade it.', 'money');
    }
  }

  returnToMenu() {
    if (this.raceManager) this.raceManager.abort();
    this.save.position = { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw };
    this.save.timeOfDay = this.hour;
    this.save.settings.volume = Math.round(this.audio.volume * 100);
    this.syncPlayerFuel();
    writeSave(this.save);
    this.state = 'menu';
    this.hud.hide();
    this.hud.hidePrompt();
    this.hud.setNav(null);
    if (this.nav) this.nav.setBeaconVisible(false);
    this.camera.setMode('orbit');
    this.camera.orbitAround(0, { x: this.player.pos.x, z: this.player.pos.z }, 9.5, 2.1, 0.16);
    this.menuScreen.classList.remove('hidden');
  }

  toast(title, main, sub = '', kind = '') {
    this.hud.toast(title, main, sub, kind);
  }

  addMoney(amount, reason = '') {
    this.save.money += amount;
    this.hud.setMoney(this.save.money);
    if (amount > 0) {
      this.audio.cash();
      this.toast('CASH EARNED', `+$${formatMoney(amount)}`, reason, 'money');
    }
    this.autosave();
  }

  autosave() {
    if (!this.player) return;
    this.save.position = { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw };
    this.save.timeOfDay = this.hour;
    this.syncPlayerFuel();
    writeSave(this.save);
  }

  syncPlayerFuel() {
    if (!this.player) return;
    const owned = this.save.owned[this.player.def.id];
    if (owned) owned.fuel = Math.round(this.player.fuel * 10) / 10;
  }

  saveNow() {
    if (this.player) {
      this.save.position = { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw };
      this.syncPlayerFuel();
    }
    this.save.timeOfDay = this.hour;
    this.save.settings.volume = Math.round(this.audio.volume * 100);
    writeSave(this.save);
  }

  // ── main simulation ────────────────────────────────────────
  update(dt) {
    this.time += dt;
    const focus = this.player ? this.player.pos : { x: 0, z: 0 };

    if (this.state === 'menu') {
      this.camera.updateOrbit(dt);
      this.sky.update(dt, focus);
      this.world.update(dt, focus, this.sky);
      if (this.player) this.player.setNight(this.sky.night);
      if (this.traffic) this.traffic.update(dt, this.player, this.sky.night);
      this.effects.update(dt);
      return;
    }

    if (this.state === 'paused' || this.state === 'map' || this.state === 'garage' || this.state === 'dealer') {
      this.effects.update(dt);
      this.sky.update(dt, focus);
      this.world.update(dt, focus, this.sky);
      if (this.state === 'garage' && this.updateGaragePreview) this.updateGaragePreview(dt);
      if (this.state === 'dealer' && this.updateDealerPreview) this.updateDealerPreview(dt);
      if (this.state === 'map') {
        this._mapTimer -= dt;
        if (this._mapTimer <= 0) {
          this._mapTimer = 0.25;
          this.bigmap.draw(this.player, this.save, this._raceState(), this.time, this.nav, this.traffic, this.world);
        }
      }
      return;
    }

    if (this.state === 'results') {
      // keep the world alive but the car parked
      this.sky.update(dt, focus);
      this.world.update(dt, focus, this.sky);
      this.camera.update(dt, this.player, null);
      return;
    }

    // running
    const speed = TIME_SPEEDS[this.save.settings.timeSpeed] || TIME_SPEEDS.normal;
    this.setHour(this.hour + speed * dt);
    this.sky.update(dt, focus);
    this.world.update(dt, focus, this.sky);
    this.player.setNight(this.sky.night);

    const racing = this.raceManager && this.raceManager.active;
    let ctrl;
    if (racing) {
      ctrl = this.raceManager.controls(dt);
    } else {
      ctrl = {
        throttle: this.input.throttle,
        brake: this.input.brake,
        steer: this.input.steer,
        handbrake: this.input.handbrake,
        boost: this.input.boost,
      };
    }
    ctrl.shiftUp = this.input.shiftUp;
    ctrl.shiftDown = this.input.shiftDown;

    if (this.input.pressed('KeyC') && !racing) {
      this.cameraMode = this.cameraMode === 'chase' ? 'hood' : 'chase';
      this.camera.setMode(this.cameraMode);
      this.toast('CAMERA', this.cameraMode === 'hood' ? 'BONNET VIEW' : 'CHASE VIEW');
    }
    if (this.input.pressed('KeyR') && !racing) this.resetCar();
    if (this.input.pressed('KeyM') && !racing) this.openMap();
    if (this.input.pressed('Escape')) this.openPause();

    const hit = this.player.update(dt, ctrl, this.world);
    this._lastImpact = hit && hit.impact ? hit.impact : 0;
    if (hit && hit.impact) this.camera.addShake(clamp(hit.impact / 30, 0.1, 0.7));

    if (this.debugAuto && !racing) {
      ctrl.throttle = 1;
      ctrl.steer = this.debugSteer || 0;
    }

    if (racing) {
      this.raceManager.update(dt);
      this.camera.update(dt, this.player, null);
      if (this.raceManager.phase === 'racing') {
        this.hud.setRaceVisible(true);
        const rs = this.raceManager.hudState();
        if (rs) this.hud.updateRace(rs);
        this.hud.setObjective(`${this.raceManager.race.name} · ${this.raceManager.lap}/${this.raceManager.race.laps}`, this.raceManager.distanceToFinish());
      } else {
        this.hud.setRaceVisible(false);
      }
    } else {
      this.camera.update(dt, this.player, this.input);
      this.hud.setRaceVisible(false);
      this.handleInteractions();
      this.updateFreeroamChallenges(dt);
      this.updateDriftChain(dt);
      this._updateObjective();
    }

    this.updateFuel(dt);

    if (this.nav) {
      this.nav.update(dt, this.player, !racing);
      if (this.nav.consumeArrival()) {
        this.audio.unlock();
        this.toast('DESTINATION REACHED', this.nav.label, 'Route complete', 'unlock');
      }
      this.hud.setNav(racing ? null : this.nav.hudState());
    }

    if (this.traffic) this.traffic.update(dt, this.player, this.sky.night);
    if (this.physics) {
      const extra = racing ? this.raceManager.rivals.map((r) => r.vehicle) : null;
      const propImpact = this.physics.update(dt, this.player, this.traffic, extra);
      if (propImpact > 2.5) {
        this.camera.addShake(clamp(propImpact / 60, 0.03, 0.28));
        if (!racing && propImpact > 6 && this.driftChainOn) this._loseDriftChain('HIT THE STREET');
      }
    }
    this.effects.update(dt);
    this.hud.update(dt, this.player);
    this._miniAcc = (this._miniAcc || 0) + dt;
    if (this._miniAcc >= 0.033) {
      this.minimap.draw(this._miniAcc, this.player, this.save, this._raceState(), this.nav, this.traffic, this.world);
      this._miniAcc = 0;
    }

    this.audio.update(dt, this.player.audioState());

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 20;
      this.save.position = { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw };
      this.save.timeOfDay = this.hour;
      writeSave(this.save);
    }
  }

  _raceState() {
    const rm = this.raceManager;
    if (!rm || !rm.active || !rm.route || rm.route.length < 2) return null;
    return {
      route: rm.route,
      closed: rm.closedLoop,
      start: rm.race ? rm.race.start : null,
      finish: rm.finish,
      rivals: rm.rivals.map((r) => ({ pos: r.vehicle.pos })),
    };
  }

  // ── interactions ──────────────────────────────────────────
  handleInteractions() {
    const p = this.player.pos;
    let prompt = null;
    let action = null;
    this._nearRace = null;
    this._nearGarage = false;
    this._nearDealer = false;

    const dGarage = Math.hypot(p.x - GARAGE.zone.x, p.z - GARAGE.zone.z);
    if (dGarage < GARAGE.zone.r + 5) {
      this._nearGarage = true;
      this.save.visitedGarage = true;
      prompt = 'Enter APEX GARAGE';
      action = () => this.openGarage();
    }
    const dDealer = Math.hypot(p.x - DEALER.zone.x, p.z - DEALER.zone.z);
    if (dDealer < DEALER.zone.r + 5) {
      this._nearDealer = true;
      prompt = 'Browse APEX MOTORS';
      action = () => this.openDealer();
    }

    for (const race of RACES) {
      const d = Math.hypot(p.x - race.start.x, p.z - race.start.z);
      if (d < 26) {
        const unlocked = !race.requires || this.save.completed.includes(race.requires);
        const won = this.save.completed.includes(race.id);
        if (prompt && d > 16) continue;
        this._nearRace = race;
        if (unlocked) {
          prompt = `${won ? 'Re-run' : 'Start'} ${race.name}`;
          action = () => this.startRace(race.id);
        } else {
          const req = RACE_BY_ID[race.requires];
          prompt = `Locked — win ${req ? req.name : 'previous event'}`;
          action = () => {
            this.audio.deny();
            this.toast('LOCKED', req ? `Win ${req.name} first` : 'Win earlier events first');
          };
        }
        break;
      }
    }

    if (prompt) {
      this.hud.showPrompt(prompt);
      if (this.input.pressed('KeyF') && action) action();
    } else {
      this.hud.hidePrompt();
    }
  }

  _updateObjective() {
    const p = this.player.pos;
    let best = null;
    if (!this.save.visitedGarage) {
      best = { name: 'Reach the APEX GARAGE', x: GARAGE.zone.x, z: GARAGE.zone.z };
    } else {
      for (const race of RACES) {
        const unlocked = !race.requires || this.save.completed.includes(race.requires);
        if (!unlocked || this.save.completed.includes(race.id)) continue;
        const d = Math.hypot(p.x - race.start.x, p.z - race.start.z);
        if (!best || d < best.d) best = { name: race.name, x: race.start.x, z: race.start.z, d };
      }
      if (!best) best = { name: 'Free roam — visit APEX MOTORS', x: DEALER.zone.x, z: DEALER.zone.z };
    }
    const d = Math.hypot(p.x - best.x, p.z - best.z);
    if (this.objective !== best.name || Math.abs((this._objDist || 0) - d) > 1) {
      this.objective = best.name;
      this._objDist = d;
      this.hud.setObjective(best.name, d);
    }
  }

  updateFreeroamChallenges(dt) {
    const p = this.player.pos;
    const speed = this.player.speedKmh;

    let trap = null;
    for (const t of SPEED_TRAPS) {
      const d = Math.hypot(p.x - t.x, p.z - t.z);
      if (d < 70 && speed > 80) { trap = t; break; }
    }
    if (trap) {
      if (this.activeTrap !== trap) {
        this.activeTrap = trap;
        this.hud.setChallenge(trap.name, Math.round(speed), trap.target, 'KM/H');
        this.hud.challengeTarget.textContent = `/ ${trap.target} KM/H`;
      } else {
        this.hud.setChallenge(trap.name, Math.round(speed), trap.target);
        this.hud.challengeTarget.textContent = `/ ${trap.target} KM/H`;
      }
      if (speed >= trap.target && !(this.save.trapBest[trap.id] >= trap.target)) {
        this.save.trapBest[trap.id] = Math.round(speed);
        this.addMoney(trap.reward, `${trap.name} · ${Math.round(speed)} km/h`);
        this.toast('SPEED TRAP CLEARED', trap.name, `${Math.round(speed)} KM/H`, 'unlock');
        this.hud.hideChallenge();
        this.activeTrap = null;
        this.autosave();
      }
    } else if (this.activeTrap) {
      this.activeTrap = null;
      this.hud.hideChallenge();
    }

    let driftZone = null;
    for (const z of DRIFT_ZONES) {
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < z.radius && speed > 25) { driftZone = z; break; }
    }
    if (driftZone) {
      if (this.activeDrift !== driftZone) {
        this.activeDrift = driftZone;
        this.driftScore = 0;
        this.toast('DRIFT ZONE', driftZone.name, 'Hold SPACE and slide to score', '');
      }
      const slip = this.player.wheelSlip;
      if (slip > 0.25) {
        this.driftScore += speed * slip * dt * 9;
      }
      this.hud.setChallenge(driftZone.name, Math.round(this.driftScore), driftZone.target);
      this.hud.challengeTarget.textContent = `/ ${formatMoney(driftZone.target)} PTS`;
      if (this.driftScore >= driftZone.target && !(this.save.driftBest[driftZone.id] >= driftZone.target)) {
        this.save.driftBest[driftZone.id] = Math.round(this.driftScore);
        this.addMoney(driftZone.reward, `${driftZone.name} · ${Math.round(this.driftScore)} pts`);
        this.toast('DRIFT ZONE CLEARED', driftZone.name, `${Math.round(this.driftScore)} PTS`, 'unlock');
        this.hud.hideChallenge();
        this.activeDrift = null;
        this.driftScore = 0;
        this.autosave();
      }
    } else if (this.activeDrift) {
      this.activeDrift = null;
      this.driftScore = 0;
      this.hud.hideChallenge();
    }
  }

  // ── drift chain (Heat-style free-roam scoring) ────────────
  updateDriftChain(dt) {
    const p = this.player;
    const speed = p.speedKmh;
    const sliding = p.driftBlend > 0.15 && speed > 30 && p.wheelSlip > 0.22;

    if (this.driftChainOn && this._lastImpact > 3) {
      this._loseDriftChain('WRECKED THE CHAIN');
      return;
    }

    if (sliding) {
      this.driftChainIdle = 0;
      if (!this.driftChainOn) {
        this.driftChainOn = true;
        this.driftChainPts = 0;
        this.driftChainTime = 0;
        this.driftChainMult = 1;
      }
      this.driftChainTime += dt;
      this.driftChainMult = Math.min(5, 1 + Math.floor(this.driftChainTime / 2.2));
      this.driftChainPts += speed * p.wheelSlip * 8.5 * dt * this.driftChainMult;
      this.hud.setDriftCombo({ points: Math.round(this.driftChainPts), mult: this.driftChainMult });
    } else if (this.driftChainOn) {
      this.driftChainIdle += dt;
      if (this.driftChainIdle > 0.65) this._bankDriftChain();
    }
  }

  _bankDriftChain() {
    const pts = Math.round(this.driftChainPts);
    this._resetDriftChain();
    if (pts < 250) return;
    const best = this.save.driftBest.chain || 0;
    if (pts > best) {
      this.save.driftBest.chain = pts;
      const bonus = Math.max(50, Math.round(pts / 40));
      this.addMoney(bonus, `DRIFT RECORD · ${formatMoney(pts)} PTS`);
    } else {
      this.toast('DRIFT BANKED', `${formatMoney(pts)} PTS`, `BEST ${formatMoney(best)}`, '');
    }
  }

  _loseDriftChain(reason) {
    const pts = Math.round(this.driftChainPts);
    this._resetDriftChain();
    if (pts >= 250) this.toast('DRIFT LOST', `${formatMoney(pts)} PTS`, reason, '');
  }

  _resetDriftChain() {
    this.driftChainOn = false;
    this.driftChainPts = 0;
    this.driftChainTime = 0;
    this.driftChainIdle = 0;
    this.hud.setDriftCombo(null);
  }

  updateFuel(dt) {
    const p = this.player;
    if (!p) return;
    if (p.fuel <= 0.001) {
      if (!this._fuelOut) {
        this._fuelOut = true;
        this._fuelTimer = 0;
        this.audio.deny();
        this.toast('OUT OF FUEL', 'Engine stalled', 'Roadside delivery in 6s', '');
      } else {
        this._fuelTimer += dt;
        if (this._fuelTimer >= 6) this.refuel(true);
      }
    } else if (this._fuelOut) {
      this._fuelOut = false;
      this._fuelTimer = 0;
    }
  }

  refuel(roadside = false) {
    const p = this.player;
    if (!p) return;
    if (roadside) {
      const pay = Math.min(600, Math.max(0, this.save.money));
      this.save.money -= pay;
      this.hud.setMoney(this.save.money);
      if (pay > 0) {
        this.toast('ROADSIDE REFUEL', 'Tank filled', `-$${formatMoney(pay)}`, 'money');
      } else {
        this.toast('EMERGENCY FUEL', 'Tank filled', 'On the house', 'unlock');
      }
    }
    p.fuel = p.fuelCapacity;
    this._fuelOut = false;
    this._fuelTimer = 0;
    this.syncPlayerFuel();
    writeSave(this.save);
  }

  resetCar() {
    const p = this.player.pos;
    const nearest = this.world.findNearestRoad(p.x, p.z);
    if (nearest) {
      this.player.setPose(nearest.x, nearest.z, nearest.yaw);
      this.camera.snap(this.player);
      this.toast('CAR RESET', 'Back on the road');
    }
  }

  // ── screens ───────────────────────────────────────────────
  openMap() {
    this.state = 'map';
    this._mapTimer = 0;
    this.mapScreen.classList.remove('hidden');
    this.hud.hidePrompt();
    this.hud.setNav(null);
    this.refreshMap();
    this._syncMapNav();
  }

  closeMap() {
    this.mapScreen.classList.add('hidden');
    this.state = 'play';
  }

  refreshMap() {
    if (this.nav && this.nav.active) this.nav.update(0, this.player, false);
    this.bigmap.draw(this.player, this.save, this._raceState(), this.time, this.nav, this.traffic, this.world);
  }

  _syncMapNav() {
    const hint = document.getElementById('mapNavHint');
    const btn = document.getElementById('mapNavClear');
    const active = !!(this.nav && this.nav.active);
    if (hint) hint.textContent = active ? `ROUTE ACTIVE · ${this.nav.label}` : 'CLICK THE MAP TO SET A DESTINATION';
    if (btn) btn.classList.toggle('hidden', !active);
  }

  _onMapClick(e) {
    if (this.state !== 'map' || !this.nav) return;
    const w = this.bigmap.worldFromEvent(e);
    if (!w) return;
    const hit = 70;
    for (const race of RACES) {
      if (Math.hypot(w.x - race.start.x, w.z - race.start.z) < hit) {
        this.setNavDestination(race.start.x, race.start.z, `RACE · ${race.name}`, true);
        return;
      }
    }
    if (Math.hypot(w.x - GARAGE.x, w.z - GARAGE.z) < hit) {
      this.setNavDestination(GARAGE.x, GARAGE.z, 'APEX GARAGE', true);
      return;
    }
    if (Math.hypot(w.x - DEALER.x, w.z - DEALER.z) < hit) {
      this.setNavDestination(DEALER.x, DEALER.z, 'APEX MOTORS', true);
      return;
    }
    const wp = this.nav.waypointAt(w.x, w.z);
    this.setNavDestination(wp.x, wp.z, wp.label, true);
  }

  setNavDestination(x, z, label, exact = false) {
    if (!this.nav) return;
    if (!this.nav.setDestination(x, z, label, exact)) return;
    this.save.nav = { x: this.nav.dest.x, z: this.nav.dest.z, label: this.nav.label };
    writeSave(this.save);
    this.audio.ui();
    this.toast('ROUTE SET', this.nav.label, 'Follow the cyan line', '');
    if (this.state === 'map') {
      this.refreshMap();
      this._syncMapNav();
    }
  }

  clearNav(silent = false) {
    if (!this.nav) return;
    this.nav.clear();
    delete this.save.nav;
    writeSave(this.save);
    this.hud.setNav(null);
    if (this.state === 'map') {
      this.refreshMap();
      this._syncMapNav();
    }
    if (!silent) this.toast('ROUTE CLEARED', 'Navigation off', '', '');
  }

  openPause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.pauseScreen.classList.remove('hidden');
    this.hud.hidePrompt();
    this.syncPauseSettings();
  }

  closePause() {
    this.pauseScreen.classList.add('hidden');
    this.state = 'play';
  }

  syncPauseSettings() {
    const q = this.save.settings.quality;
    for (const b of document.querySelectorAll('#qualitySeg button')) {
      b.classList.toggle('active', b.dataset.q === q);
    }
    const t = this.save.settings.timeSpeed;
    for (const b of document.querySelectorAll('#timeSeg button')) {
      b.classList.toggle('active', b.dataset.t === t);
    }
    const vol = this.volumeRange;
    if (vol) vol.value = String(this.save.settings.volume);
  }

  openGarage() {
    if (this.nav) this.nav.setBeaconVisible(false);
    if (this.player && this.player.fuel < this.player.fuelCapacity - 0.5) {
      this.player.fuel = this.player.fuelCapacity;
      this.syncPlayerFuel();
      this.toast('APEX GARAGE', 'Tank refilled', 'Free with every visit', '');
    }    if (this.garageUI) {
      this.garageUI.open();
    } else {
      this.toast('APEX GARAGE', 'Bay doors opening soon', 'Garage UI is being installed.');
    }
  }

  openDealer() {
    if (this.nav) this.nav.setBeaconVisible(false);
    if (this.dealerUI) {
      this.dealerUI.open();
    } else {
      this.toast('APEX MOTORS', 'Showroom closed for restock', 'Dealership UI is being installed.');
    }
  }

  startRace(id) {
    if (!this.raceManager) return;
    this._resetDriftChain();
    this.raceManager.start(id);
  }

  retryRace() {
    if (this.raceManager) this.raceManager.retry();
  }

  continueAfterRace() {
    if (this.raceManager) this.raceManager.continueToCity();
  }
}
