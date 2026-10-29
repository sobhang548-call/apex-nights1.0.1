import * as THREE from 'three';
import { buildCarModel, disposeCarModel } from './model.js';
import { computeStats } from '../data.js';
import { clamp, damp, smoothstep } from '../util.js';

// Six-speed manual. GEAR_MULT turns the selected ratio into a real force
// multiplier, so the right gear pulls and the wrong one bogs down.
const GEARS = [4.15, 2.55, 1.78, 1.32, 1.03, 0.84];
const FINAL_DRIVE = 3.15;
const GEAR_MULT = GEARS.map((g) => Math.pow(g / GEARS[0], 0.55));
const IDLE_RPM = 850;
const LIMITER_RPM = 7500;
const G = 9.81;

function torqueCurve(rpm) {
  const x = clamp(rpm / 4400, 0, 1);
  const build = 1 - Math.pow(1 - x, 2.2);
  const fall = rpm > 4400
    ? clamp(1 - Math.pow((rpm - 4400) / 4200, 1.7) * 0.45, 0.6, 1)
    : 1;
  return clamp(0.42 + 0.63 * build, 0.42, 1.05) * fall;
}

export class Vehicle {
  constructor(scene, def, upgrades = {}, cosmetic = {}, opts = {}) {
    this.scene = scene;
    this.def = def;
    this.stats = computeStats(def, upgrades);
    this.upgrades = upgrades;
    this.isPlayer = !!opts.isPlayer;
    this.manual = opts.manual !== undefined ? !!opts.manual : this.isPlayer;
    this.effects = opts.effects || null;
    this.audio = opts.audio || null;

    this.visual = buildCarModel(def, cosmetic, { simple: opts.simple && !opts.headlights });
    this.root = new THREE.Group();
    this.root.add(this.visual.root);
    scene.add(this.root);

    this.dims = this.visual.dims;
    this.mass = this.stats.mass;
    this.powerW = this.stats.powerW * 0.9;
    this.topSpeedMs = this.stats.topSpeed / 3.6;
    this.drive = def.drive;

    // Longitudinal capability from published acceleration, power-limited at speed.
    this.fMax = this.mass * (27.78 / Math.max(2.0, this.stats.accel)) * 1.16;
    const rollForce = 0.015 * this.mass * G;
    this.dragK = Math.max(0.26, (this.powerW / this.topSpeedMs - rollForce) / (this.topSpeedMs * this.topSpeedMs));
    this.rollForce = rollForce;

    this.wheelbase = def.shape.wheelbase;
    this.a = this.wheelbase * 0.47;
    this.b = this.wheelbase * 0.53;
    this.radius = this.dims.wheelR;
    this.halfWidth = def.shape.width / 2;
    this.izz = (this.mass * (def.shape.length ** 2 + def.shape.width ** 2)) / 12;
    this.cla = def.shape.type === 'super' || def.shape.type === 'hyper' ? 1.5
      : def.shape.type === 'coupe' ? 1.0 : 0.55;

    this.pos = new THREE.Vector3(opts.x || 0, 0, opts.z || 0);
    this.yaw = opts.yaw || 0;
    this.vLong = 0;
    this.vLat = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.gear = 1;
    this.rpm = 900;
    this.shiftTimer = 0;
    this.shiftPhase = 0;
    this.shiftFlash = 0;
    this.clutch = 1;
    this.limiterT = 0;
    this.bogging = false;
    this.gearboxLevel = upgrades.gearbox || 0;
    this.redline = LIMITER_RPM;
    this.gearCount = GEARS.length;
    this.gearMult = GEAR_MULT[0];
    this.boostTank = this.maxBoost();
    this.fuelCapacity = 100;
    this.fuel = clamp(opts.fuel ?? 100, 0, 100);
    this.boosting = false;
    this.boostInput = false;
    this.throttle = 0;
    this.brakepedal = 0;
    this.steerInput = 0;
    this.handbrake = false;
    this.surface = { type: 'road', grip: 1 };
    this.gripNow = this.stats.grip;
    this.wheelSlip = 0;
    this.slipAngle = 0;
    this.rearGrip = 1;
    this.driftBlend = 0;
    this.driftTime = 0;
    this.latAccel = 0;
    this.longAccel = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.heave = 0;
    this.impact = 0;
    this.collisionCooldown = 0;
    this.headlightsOn = false;
    this.night = 0;
    this._skidPrev = [null, null];
    this._smokeTimer = 0;
    this._nitroTimer = 0;
    this._skidAccum = 0;
    this._lastF = { x: 0, z: 1 };
    this._lastL = { x: 1, z: 0 };

    this._wheels = this.visual.wheels;
    this._brakeLights = 0;
    this._headlights = [];

    if (opts.headlights) this._makeHeadlights();

    this.setPose(this.pos.x, this.pos.z, this.yaw);
    this._syncTransform();
  }

  maxBoost() {
    return 100 + 22 * (this.stats.nitroLevel || 0);
  }

  _makeHeadlights() {
    const L = this.dims.length;
    for (const side of [-1, 1]) {
      const light = new THREE.SpotLight(0xfff2d8, 0, 110, 0.52, 0.62, 1.35);
      light.position.set(side * this.halfWidth * 0.62, 0.78, L * 0.46);
      light.target.position.set(side * this.halfWidth * 0.5, -0.6, L * 0.46 + 22);
      this.root.add(light);
      this.root.add(light.target);
      this._headlights.push(light);
    }
  }

  setNight(night) {
    this.night = night;
    const v = this.visual.materials;
    if (v.head) v.head.emissiveIntensity = 0.5 + night * 1.6;
    if (v.tail) v.tail.emissiveIntensity = this._brakeLights > 0.5 ? 3.6 : 0.5 + night * 1.0;
    for (const l of this._headlights) l.intensity = night * 320;
    this.headlightsOn = night > 0.3;
  }

  setPose(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.vLong = 0;
    this.vLat = 0;
    this.yawRate = 0;
    this.steerAngle = 0;
    this.gear = 1;
    this.rpm = 900;
    this.shiftTimer = 0;
    this.shiftPhase = 0;
    this.shiftFlash = 0;
    this.clutch = 1;
    this.limiterT = 0;
    this.boosting = false;
    this.boostTank = this.maxBoost();
    this.rearGrip = 1;
    this.driftBlend = 0;
    this.driftTime = 0;
    this._skidPrev = [null, null];
    this._syncTransform();
  }

  get speedKmh() {
    return Math.hypot(this.vLong, this.vLat) * 3.6;
  }

  get speedMs() {
    return Math.hypot(this.vLong, this.vLat);
  }

  get displayGear() {
    if (this.vLong < -0.5) return 'R';
    if (!this.manual && Math.abs(this.vLong) < 0.4 && this.throttle < 0.1) return 'N';
    return String(this.gear);
  }

  get shifting() {
    return this.shiftTimer > 0;
  }

  get boostRatio() {
    return clamp(this.boostTank / this.maxBoost(), 0, 1);
  }

  forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  left() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  /** Update driving simulation. ctrl = {throttle, brake, steer, handbrake, boost} */
  update(dt, ctrl, world) {
    dt = Math.min(dt, 1 / 30);
    const throttle = clamp(ctrl?.throttle || 0, 0, 1);
    const brake = clamp(ctrl?.brake || 0, 0, 1);
    const steerIn = clamp(ctrl?.steer || 0, -1, 1);
    const handbrake = !!ctrl?.handbrake;
    const boostIn = !!ctrl?.boost;

    this.throttle = throttle;
    this.brakepedal = brake;
    this.steerInput = steerIn;
    this.handbrake = handbrake;
    this.boostInput = boostIn;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    this.shiftFlash = Math.max(0, this.shiftFlash - dt);

    this.surface = world && world.surfaceAt ? world.surfaceAt(this.pos.x, this.pos.z) : { type: 'road', grip: 1 };
    const surfaceGrip = this.surface.type === 'grass' ? 0.78 : this.surface.type === 'sidewalk' ? 0.9 : this.surface.grip;
    this.gripNow = this.stats.grip * surfaceGrip;

    const speed = Math.hypot(this.vLong, this.vLat);
    const absLong = Math.abs(this.vLong);

    // ── drift intent ────────────────────────────────────────
    // Slide grip is a smoothed state instead of an on/off handbrake
    // switch, so the rear axle lets go and recovers progressively.
    const driftIntent = this.isPlayer && (
      handbrake
      || (brake > 0.3 && Math.abs(steerIn) > 0.35 && speed > 8)
      || (Math.abs(this.slipAngle) > 0.4 && speed > 12 && throttle > 0.35)
    );
    const gripTarget = handbrake ? 0.42 : driftIntent ? 0.68 : 1;
    this.rearGrip = damp(this.rearGrip, gripTarget, gripTarget < this.rearGrip ? 11 : 4.4, dt);
    this.driftBlend = damp(this.driftBlend, driftIntent ? 1 : 0, driftIntent ? 8 : 3.6, dt);
    this.driftTime = driftIntent ? this.driftTime + dt : 0;

    // ── steering ────────────────────────────────────────────
    const speedSteer = 0.58 / (1 + Math.pow(speed / 12, 1.35));
    const maxSteer = speedSteer * this.stats.handling * (1 + 0.45 * this.driftBlend);
    const steerTarget = steerIn * maxSteer;
    const steerRate = Math.abs(steerIn) > 0.05 ? 7.5 : 11;
    this.steerAngle = damp(this.steerAngle, steerTarget, steerRate, dt);
    if (Math.abs(this.steerAngle) < 0.0005) this.steerAngle = 0;

    // ── gearbox ─────────────────────────────────────────────
    const wheelCirc = Math.PI * 2 * this.radius;
    const gearRpm = (gear) =>
      clamp((absLong / wheelCirc) * GEARS[gear - 1] * FINAL_DRIVE * 60, IDLE_RPM, LIMITER_RPM + 900);
    const shifting = this.shiftTimer > 0;

    if (!shifting) {
      if (this.manual) {
        if (ctrl?.shiftUp && this.gear < GEARS.length) {
          this.gear++;
          this.shiftPhase = 1;
          this.shiftTimer = 0.17 - 0.02 * this.gearboxLevel;
          this.shiftFlash = 0.45;
          if (this.isPlayer && this.audio) this.audio.shift();
        } else if (ctrl?.shiftDown && this.gear > 1) {
          // Money-shift protection: refuse a gear that would spin the engine
          // past the limiter, exactly like a cautious manual driver.
          if (gearRpm(this.gear - 1) < LIMITER_RPM + 40) {
            this.gear--;
            this.shiftPhase = -1;
            this.shiftTimer = 0.13 - 0.015 * this.gearboxLevel;
            this.shiftFlash = 0.45;
            if (this.isPlayer && this.audio) this.audio.shift();
          } else if (this.isPlayer && this.audio) {
            this.audio.deny();
          }
        }
      } else {
        const autoRpm = gearRpm(this.gear);
        if (autoRpm > LIMITER_RPM - 250 && this.gear < GEARS.length && throttle > 0.1) {
          this.gear++;
          this.shiftPhase = 1;
          this.shiftTimer = 0.13;
          if (this.isPlayer && this.audio) this.audio.shift();
        } else if (autoRpm < 2250 && this.gear > 1) {
          this.gear--;
          this.shiftPhase = -1;
          this.shiftTimer = 0.11;
        }
      }
    }
    // Re-read after the shift block so a fresh shift opens the clutch on the
    // same frame instead of letting one full-power frame slip through.
    const shiftNow = this.shiftTimer > 0;

    // The clutch opens quickly on a shift and closes progressively after,
    // so torque returns in one smooth wave instead of snapping back on.
    this.clutch = damp(this.clutch, shiftNow ? 0 : 1, shiftNow ? 24 : 9, dt);

    let rpmTarget = gearRpm(this.gear);
    if (absLong < 5) {
      const revUp = IDLE_RPM + throttle * 2500 * (1 - absLong / 5);
      rpmTarget = Math.max(rpmTarget, revUp);
    }
    if (this.rpm >= LIMITER_RPM - 60 && throttle > 0.2) this.limiterT = 0.16;
    else this.limiterT = Math.max(0, this.limiterT - dt);
    const overRev = this.limiterT > 0;
    if (overRev) rpmTarget = Math.min(rpmTarget, LIMITER_RPM - 110);
    this.rpm = damp(this.rpm, clamp(rpmTarget, IDLE_RPM, LIMITER_RPM + 30), shiftNow ? 16 : 8.5, dt);

    // ── boost ───────────────────────────────────────────────
    const hasFuel = this.fuel > 0.001;
    if (boostIn && hasFuel && this.boostTank > 0.5 && throttle > 0.05) {
      if (!this.boosting && this.isPlayer && this.audio) this.audio.boostStart();
      this.boosting = true;
      this.boostTank = Math.max(0, this.boostTank - (24 + 3 * this.stats.nitroLevel) * dt);
      if (this.boostTank <= 0) this.boosting = false;
    } else {
      this.boosting = false;
      // Heat-style NOS: risky driving (slides, wheelspin) recharges faster.
      const driftCharge = this.isPlayer ? clamp(this.wheelSlip, 0, 1) * (handbrake ? 26 : 15) : 0;
      const baseCharge = this.isPlayer ? 4.5 : 6.5;
      this.boostTank = Math.min(this.maxBoost(), this.boostTank + (baseCharge + driftCharge) * dt);
    }

    // ── longitudinal forces ─────────────────────────────────
    const gearMult = GEAR_MULT[this.gear - 1];
    this.gearMult = gearMult;
    const clutchForce = 0.12 + 0.88 * this.clutch;
    const powerForce = this.powerW / Math.max(7, absLong);
    let driveForce = Math.min(
      this.fMax * gearMult * torqueCurve(this.rpm) * clutchForce,
      powerForce,
    ) * throttle;
    if (this.boosting) driveForce += this.mass * (2.6 + 0.45 * this.stats.nitroLevel) * clutchForce;
    if (overRev) driveForce *= 0.05;
    const bogging = this.manual && absLong > 1.5 && this.rpm < IDLE_RPM + 500 && throttle > 0.15;
    this.bogging = bogging;
    if (bogging) driveForce *= (0.3 + 0.7 * clamp((this.rpm - IDLE_RPM) / 500, 0, 1)) * 0.75;
    if (!hasFuel) driveForce = 0;

    // Off-throttle engine braking scales with rpm and gear, so dropping a
    // cog slows the car and settles the nose before a corner.
    let engineBrake = 0;
    if (throttle < 0.08 && absLong > 2 && !shiftNow) {
      engineBrake = Math.sign(this.vLong) * this.mass * G
        * (0.012 + 0.022 * gearMult) * clamp(this.rpm / 5000, 0.25, 1.3);
    }

    this.fuel = Math.max(0, this.fuel - (0.035 + throttle * 0.085 + absLong * 0.0017 + (this.boosting ? 0.3 : 0) + (this.rpm / 7500) * 0.02) * dt);

    let brakeForce = 0;
    if (brake > 0.02) {
      if (this.vLong > 0.5) {
        brakeForce = this.mass * G * 1.45 * this.stats.brake * brake;
      } else if (this.vLong > -8.5) {
        driveForce = -this.fMax * 0.42 * brake;
      }
    }

    let drag = this.dragK * this.vLong * absLong;
    let roll = Math.sign(this.vLong) * this.rollForce;
    if (this.surface.type === 'grass') {
      drag += 0.55 * absLong;
      roll *= 2.2;
    }
    if (Math.abs(this.vLong) < 0.25 && driveForce < this.rollForce && brakeForce === 0) {
      drag = 0; roll = 0;
    }

    const longTotal = driveForce - Math.sign(this.vLong) * brakeForce - drag - roll - engineBrake;
    this.longAccel = longTotal / this.mass;
    this.vLong += (this.longAccel + this.yawRate * this.vLat) * dt;
    if (this.boosting && this.vLong > this.topSpeedMs * 1.06) this.vLong = this.topSpeedMs * 1.06;

    // ── lateral tyre model ──────────────────────────────────
    const downforce = 0.5 * 1.2 * this.cla * this.vLong * this.vLong;
    const transfer = clamp((this.mass * this.longAccel * 0.52) / this.wheelbase, -0.42 * this.mass * G, 0.42 * this.mass * G);
    const staticF = (this.mass * G * this.b) / this.wheelbase;
    const staticR = (this.mass * G * this.a) / this.wheelbase;
    const dF = downforce * 0.46, dR = downforce * 0.54;
    const loadF = Math.max(400, staticF - transfer + dF);
    const loadR = Math.max(400, staticR + transfer + dR);

    const muF = this.gripNow * 1.04;
    const muR = this.gripNow * this.rearGrip;

    const vAbs = Math.max(2.2, absLong);
    const vLatF = this.vLat + this.yawRate * this.a;
    const vLatR = this.vLat - this.yawRate * this.b;
    let alphaF = Math.atan2(vLatF, vAbs) - this.steerAngle;
    let alphaR = Math.atan2(vLatR, vAbs);

    // Tyres build lateral force quickly and saturate around 0.2 rad of slip.
    // A softer ramp made every steering input skate like wet ice.
    const gripScale = 9.0;
    let fyF = -muF * loadF * Math.tanh(gripScale * alphaF);
    let fyR = -muR * loadR * Math.tanh(gripScale * alphaR);

    // Handbrake drags the rear axle without killing momentum at speed.
    let hbBrake = 0;
    if (handbrake) {
      hbBrake = this.mass * G * (absLong > 12 ? 0.24 : 0.5);
      this.vLong -= Math.sign(this.vLong) * Math.min(Math.abs(this.vLong) / dt, hbBrake / this.mass) * dt;
    }

    const yawAcc = (fyF * this.a - fyR * this.b) / this.izz;
    this.yawRate += yawAcc * dt;

    // Assisted rotation and a slip-angle ceiling keep the slide from
    // turning into a spin, so countersteer and recovery stay progressive.
    if (this.isPlayer) {
      if (brake > 0.35 && Math.abs(steerIn) > 0.4 && speed > 9 && !handbrake) {
        this.yawRate += steerIn * clamp((speed - 9) / 18, 0, 1) * 2.0 * dt;
      }
      if (this.driftBlend > 0.02) {
        const slipCap = 1.0;
        const slip = this.slipAngle;
        if (Math.abs(slip) > slipCap) {
          this.yawRate += Math.sign(slip) * (Math.abs(slip) - slipCap) * 7 * this.driftBlend * dt;
        }
      }
    }

    const maxYaw = (absLong / this.wheelbase) * Math.tan(Math.max(0.1, maxSteer)) * (1.45 + 0.35 * this.driftBlend);
    const yawSlack = Math.min(0.6, absLong * 0.05);
    this.yawRate = clamp(this.yawRate, -maxYaw - yawSlack, maxYaw + yawSlack);

    const fy = fyF + fyR;
    this.vLat += (fy / this.mass - this.yawRate * this.vLong) * dt;

    // Low-speed stabilisers so the car cannot pivot on the spot.
    if (absLong < 2.5) {
      this.vLat *= Math.exp(-6.5 * dt);
      this.yawRate *= Math.exp(-(2.4 + (2.5 - absLong) * 6) * dt);
    }
    if (absLong < 0.4 && throttle < 0.05) {
      this.vLat = 0;
      this.yawRate = 0;
    }
    this.yawRate *= Math.exp(-(0.30 - 0.16 * this.driftBlend) * dt);
    this.slipAngle = Math.atan2(this.vLat, Math.max(3, absLong));
    this.latAccel = this.vLong * this.yawRate;

    // ── integrate pose ──────────────────────────────────────
    this.yaw += this.yawRate * dt;
    const f = this.forward();
    const l = this.left();
    this._lastF = f;
    this._lastL = l;
    this.pos.x += (f.x * this.vLong + l.x * this.vLat) * dt;
    this.pos.z += (f.z * this.vLong + l.z * this.vLat) * dt;

    // world bounds without full collision pass
    this.pos.x = clamp(this.pos.x, -1264, 1104);
    this.pos.z = clamp(this.pos.z, -1264, 1264);

    if (world && world.collideCircle) this._collide(dt, world, f, l);

    // ── drifting / slip bookkeeping ─────────────────────────
    const drifting = Math.abs(this.vLat) > 2.6 && absLong > 5;
    const wheelspin = throttle > 0.65 && absLong < 11 && (this.drive === 'RWD' || this.boosting);
    const slip = clamp(
      Math.max(Math.abs(this.vLat) / 14, drifting ? Math.abs(this.vLat) / 9 : 0, wheelspin ? 0.45 + throttle * 0.3 : 0),
      0, 1,
    );
    this.wheelSlip = damp(this.wheelSlip, slip, 9, dt);

    this._animate(dt, drifting || handbrake, wheelspin);

    // ── lights ──────────────────────────────────────────────
    const braking = brake > 0.08 || handbrake;
    this._brakeLights = damp(this._brakeLights, braking ? 1 : 0, 12, dt);
    const v = this.visual.materials;
    this._tailBase = 0.55 + this.night * 1.0;
    if (v.tail) v.tail.emissiveIntensity = this._tailBase + this._brakeLights * 3.4;

    this._syncTransform();

    if (this.impact > 0) {
      const imp = this.impact;
      this.impact = 0;
      return { impact: imp };
    }
    return null;
  }

  _collide(dt, world, f, l) {
    const vel = {
      x: f.x * this.vLong + l.x * this.vLat,
      z: f.z * this.vLong + l.z * this.vLat,
    };
    const r = this.halfWidth * 0.94;
    let hit = null;
    for (const off of [this.dims.length * 0.3, -this.dims.length * 0.3]) {
      const cx = this.pos.x + f.x * off;
      const cz = this.pos.z + f.z * off;
      const c = { x: cx, z: cz };
      const res = world.collideCircle(c, r, vel);
      if (res) {
        hit = res;
        this.pos.x += c.x - cx;
        this.pos.z += c.z - cz;
        this.vLong *= 0.45;
        this.vLat = (vel.x * l.x + vel.z * l.z) * 0.7;
        this.yawRate *= 0.5;
        if (this.effects) this.effects.sparkBurst(c.x, 0.7, c.z, 10 + Math.min(14, res.impact * 1.4), res.nx, res.nz, Math.min(1.8, 0.6 + res.impact * 0.08));
        if (res.impact > 3) this.impact = Math.max(this.impact, res.impact);
      }
    }
    if (hit && this.collisionCooldown <= 0) {
      this.collisionCooldown = 0.4;
      this.impact = Math.max(this.impact, hit.impact);
      this.fuel = Math.max(0, this.fuel - clamp(hit.impact * 0.22, 0.6, 5));
      if (this.isPlayer && this.audio) this.audio.crash(clamp(hit.impact / 14, 0.3, 1.4));
    }
    if (vel) {
      this.vLong = vel.x * f.x + vel.z * f.z;
    }
  }

  _animate(dt, sliding, wheelspin) {
    const spinDelta = (this.vLong / this.radius) * dt;
    this.wheelSpin += spinDelta;
    for (const w of this._wheels) {
      w.spin.rotation.z = -this.wheelSpin;
      if (w.front) w.steer.rotation.y = this.steerAngle * 1.12;
    }

    const rollTarget = clamp(this.latAccel * 0.014, -0.1, 0.1);
    const pitchTarget = clamp(this.longAccel * 0.012 + (wheelspin ? -0.012 : 0), -0.055, 0.055);
    this.bodyRoll = damp(this.bodyRoll, rollTarget, 5.5, dt);
    this.bodyPitch = damp(this.bodyPitch, pitchTarget, 6.5, dt);
    const body = this.visual.body;
    if (body) {
      body.rotation.x = this.bodyRoll;
      body.rotation.z = this.bodyPitch;
      const settle = Math.abs(Math.sin(this.wheelSpin * 0.7)) * clamp(this.speedKmh / 260, 0, 1) * 0.004;
      this.heave = damp(this.heave, -settle, 8, dt);
      body.position.y = 0.5 + this.visual.rideHeight + this.heave;
    }

    if (!this.effects) return;
    const speed = Math.abs(this.vLong);
    const f = this._lastF;
    const l = this._lastL;
    const W = this.def.shape.width;
    const rearOffset = -this.dims.wheelbase / 2;

    if ((sliding || (this.handbrake && speed > 3)) && speed > 2.5) {
      this._skidAccum += speed * dt;
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const wx = this.pos.x + f.x * rearOffset - l.x * side * (W / 2 - 0.1);
        const wz = this.pos.z + f.z * rearOffset - l.z * side * (W / 2 - 0.1);
        const prev = this._skidPrev[i];
        if (prev) {
          const d = Math.hypot(wx - prev.x, wz - prev.z);
          if (d > 0.16 && d < 3.5) {
            this.effects.addSkid(prev.x, prev.z, wx, wz, 0.3, clamp(this.wheelSlip + 0.35, 0, 1));
            prev.x = wx; prev.z = wz;
          } else if (d >= 3.5) {
            prev.x = wx; prev.z = wz;
          }
        } else {
          this._skidPrev[i] = { x: wx, z: wz };
        }
        if (this._skidAccum > 0.5) {
          this.effects.smokePuff(wx, 0.22, wz, 1, 0.9 + this.wheelSlip, this.surface.type === 'grass' ? 0.5 : 0.74);
        }
      }
      if (this._skidAccum > 0.5) this._skidAccum = 0;
      this._smokeTimer = 0;
    } else {
      this._skidPrev[0] = null;
      this._skidPrev[1] = null;
      this._skidAccum = 0;
    }

    if (wheelspin) {
      this._smokeTimer -= dt;
      if (this._smokeTimer <= 0) {
        this._smokeTimer = 0.055;
        const side = Math.random() < 0.5 ? -1 : 1;
        const wx = this.pos.x + f.x * rearOffset - l.x * side * (W / 2 - 0.1);
        const wz = this.pos.z + f.z * rearOffset - l.z * side * (W / 2 - 0.1);
        this.effects.smokePuff(wx, 0.25, wz, 2, 1.3, 0.8);
      }
    }

    if (this.boosting) {
      this._nitroTimer -= dt;
      if (this._nitroTimer <= 0) {
        this._nitroTimer = 0.018;
        for (const side of [-1, 1]) {
          const ex = this.pos.x - f.x * this.dims.length * 0.48 - l.x * side * W * 0.3;
          const ez = this.pos.z - f.z * this.dims.length * 0.48 - l.z * side * W * 0.3;
          this.effects.nitroFlame(ex, 0.4, ez, f.x, f.z);
        }
      }
    }
  }

  _syncTransform() {
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw;
  }

  /** State packet for the audio engine. */
  audioState() {
    return {
      rpm: this.rpm,
      throttle: this.throttle,
      speed: this.speedMs,
      slip: this.wheelSlip,
      boosting: this.boosting,
      gear: this.gear,
      active: this.isPlayer,
    };
  }

  dispose() {
    this.scene.remove(this.root);
    disposeCarModel(this.visual);
    for (const light of this._headlights) {
      light.target.removeFromParent();
      light.removeFromParent();
    }
    this._headlights.length = 0;
  }
}
