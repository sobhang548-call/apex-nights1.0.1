import * as THREE from 'three';
import { clamp, damp, smoothstep, wrapAngle } from '../util.js';

const UP = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'chase';
    this.pos = new THREE.Vector3(0, 5, -10);
    this.look = new THREE.Vector3();
    this.camYaw = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.manualTimer = 0;
    this.fov = 62;
    this.trauma = 0;
    this.roll = 0;
    this.t = 0;
    this.distanceScale = 1;
    this.orbitAngle = 0;
    this.snapDone = false;
  }

  setMode(mode) {
    this.mode = mode;
  }

  addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snap(car) {
    const f = car.forward();
    this.pos.set(car.pos.x - f.x * 6.6, 2.5, car.pos.z - f.z * 6.6);
    this.look.set(car.pos.x + f.x * 4, 1.1, car.pos.z + f.z * 4);
    this.camYaw = car.yaw;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.snapDone = true;
  }

  update(dt, car, input) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.5);

    if (input && this.mode === 'chase') {
      const { dx, dy } = input.consumeMouse();
      if (dx || dy) {
        this.orbitYaw -= dx * 0.0055;
        this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -0.35, 0.7);
        this.manualTimer = 1.6;
      }
      this.manualTimer = Math.max(0, this.manualTimer - dt);
      if (this.manualTimer <= 0 && !input.dragging) {
        this.orbitYaw = damp(this.orbitYaw, 0, 2.2, dt);
        this.orbitPitch = damp(this.orbitPitch, 0, 2.2, dt);
      }
    }

    if (this.mode === 'cinematic') return;
    if (this.mode === 'orbit') { this.updateOrbit(dt); return; }

    if (this.mode === 'hood') {
      const f = car.forward();
      this.pos.x = damp(this.pos.x, car.pos.x + f.x * 0.35, 14, dt);
      this.pos.y = damp(this.pos.y, 1.16 + car.heave * 0.5, 10, dt);
      this.pos.z = damp(this.pos.z, car.pos.z + f.z * 0.35, 14, dt);
      this.look.x = damp(this.look.x, car.pos.x + f.x * 24, 16, dt);
      this.look.y = damp(this.look.y, 1.02, 10, dt);
      this.look.z = damp(this.look.z, car.pos.z + f.z * 24, 16, dt);
      this.fov = damp(this.fov, 68 + Math.min(12, car.speedKmh * 0.05), 5, dt);
      this.roll = damp(this.roll, clamp(-car.bodyRoll * 0.55, -0.07, 0.07), 5, dt);
      this._apply();
      return;
    }

    const speed = car.speedKmh;
    const f = car.forward();

    const driftAmt = clamp(car.driftBlend || 0, 0, 1);
    // Only swing the camera into an actual slide; following raw slip made the
    // view wobble on every small steering correction.
    const drift = clamp(car.slipAngle * 0.8, -0.55, 0.55) * clamp(driftAmt * 1.3, 0, 1);
    const targetYaw = car.yaw + this.orbitYaw + drift;
    const yawFollow = 5.4 + 2.6 * driftAmt;
    this.camYaw += wrapAngle(targetYaw - this.camYaw) * (1 - Math.exp(-yawFollow * dt));

    const dist = (6.3 + Math.min(3.4, speed * 0.018)) * this.distanceScale;
    const height = 2.25 + Math.min(1.5, speed * 0.006) + this.orbitPitch * 5;

    const dx = Math.sin(this.camYaw) * dist;
    const dz = Math.cos(this.camYaw) * dist;

    const desired = this._desired || (this._desired = new THREE.Vector3());
    desired.set(car.pos.x - dx, height, car.pos.z - dz);

    if (this.world && this.world.collideCircle) {
      const p = { x: desired.x, z: desired.z };
      const hit = this.world.collideCircle(p, 0.85, null);
      if (hit) {
        desired.x = p.x;
        desired.z = p.z;
        desired.y = Math.max(desired.y, height + 0.4);
      }
      desired.x = clamp(desired.x, -1260, 1100);
      desired.z = clamp(desired.z, -1260, 1260);
    }
    desired.y = Math.max(1.1, desired.y);

    if (!this.snapDone) {
      this.snap(car);
    }

    const follow = smoothstep(0, 60, speed) * 4 + 6;
    this.pos.x = damp(this.pos.x, desired.x, follow, dt);
    this.pos.y = damp(this.pos.y, desired.y, 4.5, dt);
    this.pos.z = damp(this.pos.z, desired.z, follow, dt);

    const lookAhead = clamp(3 + speed * 0.055, 3, 12);
    const lookTarget = this._look || (this._look = new THREE.Vector3());
    lookTarget.set(
      car.pos.x + f.x * lookAhead + car.left().x * clamp(car.vLat * 0.25, -3, 3),
      1.05 + car.bodyPitch * 2,
      car.pos.z + f.z * lookAhead + car.left().z * clamp(car.vLat * 0.25, -3, 3),
    );
    this.look.x = damp(this.look.x, lookTarget.x, 10, dt);
    this.look.y = damp(this.look.y, lookTarget.y, 7, dt);
    this.look.z = damp(this.look.z, lookTarget.z, 10, dt);

    const targetFov = 60 + 16 * Math.pow(clamp(speed / 300, 0, 1), 0.9)
      + (car.boosting ? 4 : 0) + 3.5 * clamp(car.driftBlend || 0, 0, 1);
    this.fov = damp(this.fov, targetFov, 3.2, dt);

    const targetRoll = clamp(-car.bodyRoll * 0.35 - car.steerAngle * 0.03, -0.06, 0.06);
    this.roll = damp(this.roll, targetRoll, 4, dt);

    this._apply();
  }

  updateCinematic(dt, car, progress, radiusBase = 11) {
    const p = clamp(progress, 0, 1);
    const angle = car.yaw + Math.PI * 0.82 + p * 1.5;
    const radius = radiusBase - p * 3.2;
    const height = 0.95 + p * 1.45;
    const cx = car.pos.x + Math.sin(angle) * radius;
    const cz = car.pos.z + Math.cos(angle) * radius;
    this.pos.x = damp(this.pos.x, cx, 3.2, dt);
    this.pos.y = damp(this.pos.y, height, 3.2, dt);
    this.pos.z = damp(this.pos.z, cz, 3.2, dt);
    this.look.x = damp(this.look.x, car.pos.x - car.forward().x * 0.8, 4, dt);
    this.look.y = damp(this.look.y, 0.85, 4, dt);
    this.look.z = damp(this.look.z, car.pos.z - car.forward().z * 0.8, 4, dt);
    this.fov = damp(this.fov, 46 + p * 8, 3, dt);
    this.roll = damp(this.roll, 0, 3, dt);
    this._apply();
  }

  orbitAround(dt, center, radius = 8, height = 2.4, speed = 0.28) {
    this.mode = 'orbit';
    this._orbitCenter = center;
    this._orbitRadius = radius;
    this._orbitHeight = height;
    this._orbitSpeed = speed;
    this.orbitAngle = Math.atan2(this.pos.x - center.x, this.pos.z - center.z);
    this._orbitInit = false;
    this.updateOrbit(dt);
  }

  updateOrbit(dt) {
    const c = this._orbitCenter;
    if (!c) return;
    this.orbitAngle += (this._orbitSpeed || 0.25) * dt;
    const r = this._orbitRadius || 8;
    const h = this._orbitHeight || 2.4;
    this.pos.x = c.x + Math.sin(this.orbitAngle) * r;
    this.pos.z = c.z + Math.cos(this.orbitAngle) * r;
    this.pos.y = h;
    this.look.set(c.x, 0.75, c.z);
    this.fov = damp(this.fov, 40, 4, dt);
    this.roll = 0;
    this._apply();
  }

  _apply() {
    const cam = this.camera;
    cam.up.copy(UP);
    if (cam.position.distanceToSquared(this.pos) > 0.0004) cam.position.copy(this.pos);
    cam.lookAt(this.look);
    if (Math.abs(this.roll) > 0.0004) cam.rotateZ(this.roll);

    if (this.trauma > 0.001) {
      const s = this.trauma * this.trauma;
      const t = this.t * 42;
      cam.position.x += Math.sin(t * 1.7) * 0.12 * s;
      cam.position.y += Math.sin(t * 2.3 + 1.1) * 0.09 * s;
      cam.position.z += Math.cos(t * 1.9) * 0.12 * s;
    }

    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
