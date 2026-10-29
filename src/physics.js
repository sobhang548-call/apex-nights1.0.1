import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, clamp } from './util.js';

const GRAVITY = 26;
const ACTIVE_RADIUS = 300;
const FIXED_STEP = 1 / 90;
const MAX_STEPS = 4;

const _r = new THREE.Vector3();
const _vp = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _unit = new THREE.Vector3(1, 1, 1);

function coloredGeometry(parts) {
  const geos = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

function box(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return { geo: g, color };
}

function cyl(rt, rb, h, seg, x, y, z, color, rot) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rot) g[rot.fn](rot.a);
  g.translate(x, y, z);
  return { geo: g, color };
}

function buildPropTypes() {
  const types = {};

  // traffic cone
  types.cone = {
    half: [0.24, 0.35, 0.24],
    mass: 2.2,
    rest: 0.24,
    friction: 0.5,
    geo: coloredGeometry([
      box(0.48, 0.07, 0.48, 0, -0.315, 0, 0x15171a),
      cyl(0.045, 0.2, 0.62, 10, 0, 0.03, 0, 0xff6a12),
      cyl(0.135, 0.168, 0.12, 10, 0, -0.03, 0, 0xeef1f3),
    ]),
  };

  // construction barrel
  types.barrel = {
    half: [0.31, 0.52, 0.31],
    mass: 11,
    rest: 0.28,
    friction: 0.45,
    geo: coloredGeometry([
      cyl(0.3, 0.26, 1.0, 12, 0, 0, 0, 0xe2621a),
      cyl(0.312, 0.302, 0.13, 12, 0, -0.16, 0, 0xf2f4f6),
      cyl(0.316, 0.308, 0.13, 12, 0, 0.2, 0, 0xf2f4f6),
      cyl(0.31, 0.31, 0.06, 12, 0, 0.49, 0, 0x24272b),
      cyl(0.33, 0.33, 0.06, 12, 0, -0.49, 0, 0x24272b),
    ]),
  };

  // roadworks barrier
  types.barrier = {
    half: [0.9, 0.52, 0.32],
    mass: 15,
    rest: 0.18,
    friction: 0.62,
    geo: coloredGeometry([
      box(1.8, 0.34, 0.07, 0, 0.2, 0, 0xe8e8e4),
      box(0.22, 0.36, 0.075, -0.62, 0.2, 0, 0xc2261f),
      box(0.22, 0.36, 0.075, -0.2, 0.2, 0, 0xc2261f),
      box(0.22, 0.36, 0.075, 0.22, 0.2, 0, 0xc2261f),
      box(0.22, 0.36, 0.075, 0.64, 0.2, 0, 0xc2261f),
      box(0.09, 0.72, 0.5, -0.82, -0.16, 0, 0x3a3f45),
      box(0.09, 0.72, 0.5, 0.82, -0.16, 0, 0x3a3f45),
      box(0.16, 0.09, 0.72, -0.82, -0.48, 0, 0x2a2e33),
      box(0.16, 0.09, 0.72, 0.82, -0.48, 0, 0x2a2e33),
    ]),
  };

  // street bin
  types.bin = {
    half: [0.33, 0.55, 0.33],
    mass: 7,
    rest: 0.16,
    friction: 0.66,
    geo: coloredGeometry([
      cyl(0.3, 0.26, 0.95, 10, 0, -0.03, 0, 0x2f4b3c),
      cyl(0.33, 0.315, 0.09, 10, 0, 0.47, 0, 0x24292c),
      cyl(0.305, 0.27, 0.07, 10, 0, -0.4, 0, 0x20262a),
      box(0.1, 0.1, 0.06, 0, 0.56, 0, 0x111417),
    ]),
  };

  // wooden crate
  types.crate = {
    half: [0.4, 0.4, 0.4],
    mass: 16,
    rest: 0.15,
    friction: 0.68,
    geo: coloredGeometry([
      box(0.8, 0.8, 0.8, 0, 0, 0, 0x7a5a3c),
      box(0.06, 0.84, 0.06, -0.37, 0, -0.37, 0x4a3524),
      box(0.06, 0.84, 0.06, 0.37, 0, -0.37, 0x4a3524),
      box(0.06, 0.84, 0.06, -0.37, 0, 0.37, 0x4a3524),
      box(0.06, 0.84, 0.06, 0.37, 0, 0.37, 0x4a3524),
      box(0.84, 0.06, 0.06, 0, 0.36, 0.37, 0x4a3524),
      box(0.84, 0.06, 0.06, 0, -0.36, 0.37, 0x4a3524),
    ]),
  };

  // wooden pallet
  types.pallet = {
    half: [0.6, 0.1, 0.45],
    mass: 6,
    rest: 0.1,
    friction: 0.7,
    geo: coloredGeometry([
      box(1.2, 0.05, 0.16, 0, 0.05, -0.36, 0x8a6a48),
      box(1.2, 0.05, 0.16, 0, 0.05, -0.18, 0x8a6a48),
      box(1.2, 0.05, 0.16, 0, 0.05, 0, 0x8a6a48),
      box(1.2, 0.05, 0.16, 0, 0.05, 0.18, 0x8a6a48),
      box(1.2, 0.05, 0.16, 0, 0.05, 0.36, 0x8a6a48),
      box(1.2, 0.05, 0.18, 0, -0.065, -0.36, 0x6d5236),
      box(1.2, 0.05, 0.18, 0, -0.065, 0.36, 0x6d5236),
      box(0.18, 0.11, 0.18, -0.5, -0.005, 0, 0x5f472e),
      box(0.18, 0.11, 0.18, 0, -0.005, 0, 0x5f472e),
      box(0.18, 0.11, 0.18, 0.5, -0.005, 0, 0x5f472e),
    ]),
  };

  // A-frame sidewalk sign
  types.board = {
    half: [0.38, 0.52, 0.3],
    mass: 5,
    rest: 0.2,
    friction: 0.52,
    geo: coloredGeometry([
      (() => { const g = new THREE.BoxGeometry(0.72, 0.94, 0.035); g.rotateX(0.22); g.translate(0, 0.01, -0.12); return { geo: g, color: 0xe8e2d4 }; })(),
      (() => { const g = new THREE.BoxGeometry(0.72, 0.94, 0.035); g.rotateX(-0.22); g.translate(0, 0.01, 0.12); return { geo: g, color: 0xe8e2d4 }; })(),
      box(0.74, 0.08, 0.42, 0, 0.48, 0, 0x202326),
      box(0.5, 0.06, 0.05, 0, 0.06, -0.24, 0x202326),
    ]),
  };

  // loose tyre
  types.tire = {
    half: [0.4, 0.12, 0.4],
    mass: 6,
    rest: 0.34,
    friction: 0.5,
    geo: coloredGeometry([
      (() => { const g = new THREE.TorusGeometry(0.28, 0.11, 8, 16); g.rotateX(-Math.PI / 2); return { geo: g, color: 0x17181a }; })(),
      cyl(0.12, 0.12, 0.11, 10, 0, 0, 0, 0x3b4046),
    ]),
  };

  for (const key of Object.keys(types)) {
    types[key].geo.computeBoundingSphere();
  }
  return types;
}

class RigidBody {
  constructor(type, spawn, slot, rnd) {
    this.half = new THREE.Vector3(type.half[0], type.half[1], type.half[2]);
    this.pos = new THREE.Vector3(spawn.x, this.half.y, spawn.z);
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawn.yaw ?? rnd() * Math.PI * 2);
    this.angVel = new THREE.Vector3();
    this.mass = type.mass;
    this.invMass = 1 / type.mass;
    const h = this.half;
    this.invI = 1 / (type.mass * (h.x * h.x + h.y * h.y + h.z * h.z) * 0.35);
    this.rest = type.rest;
    this.friction = type.friction;
    this.radius = Math.sqrt(h.x * h.x + h.y * h.y + h.z * h.z);
    this.span = Math.max(h.x, h.z);
    this.slot = slot;
    this.sleeping = true;
    this.sleepTimer = 0;
    this.hitCooldown = 0;
    this.grounded = true;
  }

  writeMatrix(m) {
    m.compose(this.pos, this.quat, _unit);
  }

  integrate(h, world) {
    this.hitCooldown = Math.max(0, this.hitCooldown - h);
    this.vel.y -= GRAVITY * h;
    this.vel.multiplyScalar(1 - 0.08 * h);
    this.pos.addScaledVector(this.vel, h);

    if (this.angVel.lengthSq() > 1e-6) {
      _dq.set(this.angVel.x, this.angVel.y, this.angVel.z, 0);
      _dq.multiply(this.quat);
      this.quat.x += 0.5 * h * _dq.x;
      this.quat.y += 0.5 * h * _dq.y;
      this.quat.z += 0.5 * h * _dq.z;
      this.quat.w += 0.5 * h * _dq.w;
      this.quat.normalize();
    }
    this.angVel.multiplyScalar(1 - 0.35 * h);

    this.grounded = this._ground(h);

    // static city geometry
    const p = { x: this.pos.x, z: this.pos.z };
    const v = { x: this.vel.x, z: this.vel.z };
    const hit = world.collideCircle(p, this.span * 0.88, v);
    if (hit) {
      this.pos.x = p.x;
      this.pos.z = p.z;
      this.vel.x = v.x;
      this.vel.z = v.z;
      if (hit.impact > 1.4) {
        this.angVel.x += (this.vel.z * 0.4) * 0.5;
        this.angVel.z -= (this.vel.x * 0.4) * 0.5;
      }
    } else {
      this.pos.x = p.x;
      this.pos.z = p.z;
    }

    // hard clamps so nothing escapes the world
    this.vel.clampLength(0, 40);
    this.angVel.clampLength(0, 24);

    const linSq = this.vel.lengthSq();
    const angSq = this.angVel.lengthSq();
    if (this.grounded && linSq < 0.05 && angSq < 0.16) {
      this.sleepTimer += h;
      if (this.sleepTimer > 0.8) {
        this.sleeping = true;
        this.vel.set(0, 0, 0);
        this.angVel.set(0, 0, 0);
      }
    } else {
      this.sleepTimer = 0;
    }
  }

  _ground(h) {
    const half = this.half;
    let grounded = false;
    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sy = -1; sy <= 1; sy += 2) {
        for (let sz = -1; sz <= 1; sz += 2) {
          _r.set(sx * half.x, sy * half.y, sz * half.z).applyQuaternion(this.quat);
          const worldY = this.pos.y + _r.y;
          if (worldY >= 0) continue;
          grounded = true;
          this.pos.y -= worldY * 0.62;

          _vp.copy(this.angVel).cross(_r).add(this.vel);
          const vn = _vp.y;
          if (vn >= 0) continue;

          const rnx = _r.z;
          const rnz = -_r.x;
          const denom = this.invMass + this.invI * (rnx * rnx + rnz * rnz);
          const j = -(1 + this.rest) * vn / denom;
          this.vel.y += j * this.invMass;
          this.angVel.x += this.invI * rnx * j;
          this.angVel.z += this.invI * rnz * j;

          const vt = Math.hypot(_vp.x, _vp.z);
          if (vt > 1e-4) {
            const tx = -_vp.x / vt;
            const tz = -_vp.z / vt;
            const cx = _r.y * tz;
            const cy = _r.z * tx - _r.x * tz;
            const cz = -_r.y * tx;
            const denomT = this.invMass + this.invI * (cx * cx + cy * cy + cz * cz);
            const jt = Math.min(this.friction * j, vt / denomT);
            this.vel.x += jt * this.invMass * tx;
            this.vel.z += jt * this.invMass * tz;
            this.angVel.x += this.invI * cx * jt;
            this.angVel.y += this.invI * cy * jt;
            this.angVel.z += this.invI * cz * jt;
          }
        }
      }
    }

    if (grounded) {
      const damp = Math.exp(-1.7 * h);
      this.vel.x *= damp;
      this.vel.z *= damp;
      this.angVel.multiplyScalar(Math.exp(-1.15 * h));
      if (this.vel.y > 0 && this.vel.y < 0.45) this.vel.y = 0;
      if (this.pos.y < this.half.y * 0.5) this.pos.y = this.half.y * 0.5;
    }
    return grounded;
  }
}

export class PhysicsWorld {
  constructor(scene, world, effects = null) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.rnd = mulberry32(1337);
    this.bodies = [];
    this.types = buildPropTypes();
    this.meshes = {};

    const counts = {};
    for (const p of world.props || []) counts[p.type] = (counts[p.type] || 0) + 1;
    for (const key of Object.keys(counts)) {
      const mesh = new THREE.InstancedMesh(
        this.types[key].geo,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.08 }),
        counts[key],
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      this.meshes[key] = { mesh, next: 0 };
    }

    for (const p of world.props || []) {
      const type = this.types[p.type];
      const slot = this.meshes[p.type];
      if (!type || !slot) continue;
      const body = new RigidBody(type, p, slot.next++, this.rnd);
      body.type = p.type;
      this.bodies.push(body);
      body.writeMatrix(_m);
      slot.mesh.setMatrixAt(body.slot, _m);
    }
    for (const key of Object.keys(this.meshes)) {
      this.meshes[key].mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _vehicles(player, traffic, extra) {
    const list = [];
    const push = (v, halfL, halfW) => {
      if (!v || !v.pos) return;
      const yaw = v.yaw ?? 0;
      let vx = 0;
      let vz = 0;
      if (typeof v.vLong === 'number') {
        vx = Math.sin(yaw) * v.vLong + Math.cos(yaw) * (v.vLat || 0);
        vz = Math.cos(yaw) * v.vLong - Math.sin(yaw) * (v.vLat || 0);
      } else if (typeof v.speed === 'number') {
        vx = Math.sin(yaw) * v.speed;
        vz = Math.cos(yaw) * v.speed;
      }
      list.push({ ref: v, x: v.pos.x, z: v.pos.z, yaw, vx, vz, speed: Math.hypot(vx, vz), halfL, halfW });
    };
    if (player && player.pos) {
      const sh = player.def?.shape;
      push(player, (sh?.length ?? 4.4) / 2, (sh?.width ?? 1.9) / 2);
    }
    if (traffic && traffic.cars) {
      for (const c of traffic.cars) push(c, (c.length ?? 4.4) / 2, 1.05);
    }
    if (extra) {
      for (const v of extra) {
        if (!v || !v.pos) continue;
        const sh = v.def?.shape;
        push(v, (sh?.length ?? 4.4) / 2, (sh?.width ?? 1.9) / 2);
      }
    }
    return list;
  }

  update(dt, player, traffic = null, extraVehicles = null) {
    if (!player || !this.bodies.length) return 0;
    const step = Math.min(dt, 0.05);
    const vehicles = this._vehicles(player, traffic, extraVehicles);
    const near = [];
    let impact = 0;

    for (const body of this.bodies) {
      const dx = body.pos.x - player.pos.x;
      const dz = body.pos.z - player.pos.z;
      if (dx * dx + dz * dz < ACTIVE_RADIUS * ACTIVE_RADIUS) {
        near.push(body);
        if (body.sleeping) {
          for (const v of vehicles) {
            if (v.speed < 3) continue;
            const d = Math.hypot(body.pos.x - v.x, body.pos.z - v.z);
            if (d < v.halfL + body.span + 5) {
              body.sleeping = false;
              body.sleepTimer = 0;
              break;
            }
          }
        }
      } else if (!body.sleeping) {
        body.sleeping = true;
        body.vel.set(0, 0, 0);
        body.angVel.set(0, 0, 0);
      }
    }

    const steps = clamp(Math.ceil(step / FIXED_STEP), 1, MAX_STEPS);
    const h = step / steps;
    for (let s = 0; s < steps; s++) {
      for (const body of near) {
        if (!body.sleeping) body.integrate(h, this.world);
      }
    }

    // vehicles
    for (const body of near) {
      for (const v of vehicles) {
        if (v.speed < 1.5) continue;
        const dx = body.pos.x - v.x;
        const dz = body.pos.z - v.z;
        const sy = Math.sin(v.yaw);
        const cy = Math.cos(v.yaw);
        const u = dx * sy + dz * cy;
        const w = dx * cy - dz * sy;
        const rXZ = body.span * 0.85;
        const hL = v.halfL + rXZ;
        const hW = v.halfW + rXZ;
        if (Math.abs(u) > hL || Math.abs(w) > hW) continue;

        const penU = hL - Math.abs(u);
        const penW = hW - Math.abs(w);
        let nx;
        let nz;
        let pen;
        if (penU < penW) {
          const sgn = u >= 0 ? 1 : -1;
          nx = sy * sgn;
          nz = cy * sgn;
          pen = penU;
        } else {
          const sgn = w >= 0 ? 1 : -1;
          nx = cy * sgn;
          nz = -sy * sgn;
          pen = penW;
        }

        body.pos.x += nx * (pen + 0.02);
        body.pos.z += nz * (pen + 0.02);
        body.sleeping = false;
        body.sleepTimer = 0;
        body.grounded = false;

        const closing = v.vx * nx + v.vz * nz;
        if (closing < -1.5) continue;

        const power = Math.max(2.2, v.speed * 0.85 + closing * 0.4);
        body.vel.x = nx * power * 0.85 + v.vx * 0.3 + (this.rnd() - 0.5) * power * 0.25;
        body.vel.z = nz * power * 0.85 + v.vz * 0.3 + (this.rnd() - 0.5) * power * 0.25;
        body.vel.y = Math.max(body.vel.y, Math.min(7.5, 0.8 + v.speed * 0.16));
        body.angVel.set(
          (this.rnd() - 0.5) * (2 + v.speed * 0.45),
          (this.rnd() - 0.5) * 5,
          (this.rnd() - 0.5) * (2 + v.speed * 0.45),
        );

        const heavy = body.mass > 12;
        const force = power * clamp(body.mass / 9, 0.5, 1.7);
        impact = Math.max(impact, force * (body.mass > 10 ? 1 : 0.35));

        if (body.hitCooldown <= 0 && v.speed > 6) {
          body.hitCooldown = 0.4;
          if (v.ref.isPlayer) {
            v.ref.vLong *= heavy ? 0.9 : 0.965;
            v.ref.vLat *= 0.94;
            if (heavy && v.ref.fuel != null) v.ref.fuel = Math.max(0, v.ref.fuel - 0.6);
            if (this.effects && v.speed > 9) {
              this.effects.sparkBurst(body.pos.x, 0.8, body.pos.z, heavy ? 12 : 6, -nx, -nz, 1.0);
            }
            if (v.ref.audio && v.speed > 13) v.ref.audio.crash(clamp(v.speed / 90, 0.12, 0.5));
          } else if (typeof v.ref.speed === 'number') {
            v.ref.speed *= heavy ? 0.84 : 0.94;
          }
        }
        break;
      }
    }

    // prop vs prop
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        if (a.sleeping && b.sleeping) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const rsum = a.span + b.span;
        if (Math.abs(dx) > rsum || Math.abs(dz) > rsum) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 > rsum * rsum || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const pen = rsum - d;
        const totalInv = a.invMass + b.invMass;
        a.pos.x -= nx * pen * (a.invMass / totalInv);
        a.pos.z -= nz * pen * (a.invMass / totalInv);
        b.pos.x += nx * pen * (b.invMass / totalInv);
        b.pos.z += nz * pen * (b.invMass / totalInv);

        const rvn = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        a.sleeping = false;
        b.sleeping = false;
        a.sleepTimer = 0;
        b.sleepTimer = 0;
        if (rvn < 0) {
          const jimp = -1.15 * rvn / totalInv;
          a.vel.x -= nx * jimp * a.invMass;
          a.vel.z -= nz * jimp * a.invMass;
          b.vel.x += nx * jimp * b.invMass;
          b.vel.z += nz * jimp * b.invMass;
          a.angVel.y += (this.rnd() - 0.5) * 1.4;
          b.angVel.y += (this.rnd() - 0.5) * 1.4;
        }
      }
    }

    for (const body of near) {
      body.writeMatrix(_m);
      const slot = this.meshes[body.type];
      if (slot) slot.mesh.setMatrixAt(body.slot, _m);
    }
    for (const key of Object.keys(this.meshes)) {
      this.meshes[key].mesh.instanceMatrix.needsUpdate = true;
    }
    return impact;
  }

  reset() {
    for (const body of this.bodies) {
      body.sleeping = true;
      body.vel.set(0, 0, 0);
      body.angVel.set(0, 0, 0);
    }
  }

  dispose() {
    for (const key of Object.keys(this.meshes)) {
      const { mesh } = this.meshes[key];
      this.scene.remove(mesh);
      mesh.material.dispose();
      mesh.dispose();
    }
    for (const key of Object.keys(this.types)) this.types[key].geo.dispose();
    this.meshes = {};
    this.bodies.length = 0;
  }
}
