import * as THREE from 'three';
import { CAR_BY_ID } from '../data.js';
import { buildCarModel, disposeCarModel } from '../car/model.js';
import { clamp, mulberry32, wrapAngle } from '../util.js';

const LANE = 4.4;
const TRAFFIC_DEFS = [
  'sp320', 'sp320', 'sp320',
  's43', 's43', 's43',
  'sp440', 'sp440',
  'gtm', 'gtm',
  'gt63', 'venom', 'rs3', 'sakura',
];
const PAINTS = [
  '#e9ebe7', '#b7bec7', '#8c9095', '#0c0e11', '#1d5aa6',
  '#8c9095', '#a8121e', '#0f4a3b', '#e9ebe7', '#c94a1b', '#169bb8',
];

class TrafficCar {
  constructor(traffic, def, cosmetic, x, z, yaw) {
    this.traffic = traffic;
    this.def = def;
    this.visual = buildCarModel(def, cosmetic, { simple: true });
    this.root = new THREE.Group();
    this.root.add(this.visual.root);
    this.root.position.set(x, 0, z);
    this.root.rotation.y = yaw;
    traffic.scene.add(this.root);

    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.speed = 0;
    this.maxSpeed = 12 + traffic.rnd() * 5;
    this.length = def.shape.length;
    this.wheelR = def.shape.wheelR;
    this.wheelbase = def.shape.wheelbase;
    this.wheelSpin = 0;
    this.steer = 0;
    this.route = [];
    this.idx = 1;
    this.target = { x, z };
    this.stuck = 0;
    this.collisionCooldown = 0;
    this._braking = false;
    this.retarget();
  }

  retarget() {
    const graph = this.traffic.graph;
    const start = graph.nearest(this.pos.x, this.pos.z);
    let goal = start;
    for (let tries = 0; tries < 8 && goal === start; tries++) {
      goal = graph.list[(this.traffic.rnd() * graph.list.length) | 0];
    }
    const path = graph.shortest(start, goal) || [start, goal];
    this.route = path.map((n) => ({ x: n.x, z: n.z }));
    if (this.route.length < 2) this.route.push({ x: goal.x, z: goal.z });
    this.idx = 1;
  }

  startRoute(fromNode, nextNode) {
    const graph = this.traffic.graph;
    let goal = nextNode;
    for (let tries = 0; tries < 8 && goal === nextNode; tries++) {
      goal = graph.list[(this.traffic.rnd() * graph.list.length) | 0];
    }
    const path = graph.shortest(nextNode, goal) || [nextNode, goal];
    this.route = [
      { x: fromNode.x, z: fromNode.z },
      ...path.map((n) => ({ x: n.x, z: n.z })),
    ];
    this.idx = 1;
  }

  _targetPoint(i) {
    const node = this.route[i];
    const prev = this.route[Math.max(0, i - 1)];
    const dx = node.x - prev.x;
    const dz = node.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    // right-hand lane of the road we are travelling on
    return { x: node.x + (dz / len) * LANE, z: node.z - (dx / len) * LANE };
  }

  update(dt, player, cars) {
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    if (!this.route.length || this.idx >= this.route.length) this.retarget();
    if (this.idx >= this.route.length) return;

    const node = this.route[this.idx];
    const distNode = Math.hypot(node.x - this.pos.x, node.z - this.pos.z);
    if (distNode < 7 && this.idx < this.route.length - 1) {
      this.idx++;
    } else if (distNode < 7) {
      this.retarget();
    }

    const target = this._targetPoint(Math.min(this.idx, this.route.length - 1));
    this.target = target;

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);

    let targetSpeed = this._isRing() ? this.maxSpeed + 9 : this.maxSpeed;

    // slow down for sharp turns
    const next = this.route[this.idx + 1];
    if (next && distNode < 42) {
      const prev = this.route[Math.max(0, this.idx - 1)];
      const a = Math.atan2(node.x - prev.x, node.z - prev.z);
      const b = Math.atan2(next.x - node.x, next.z - node.z);
      if (Math.abs(wrapAngle(b - a)) > 0.55) targetSpeed = Math.min(targetSpeed, 6.5);
    }

    // hold position behind the player
    const prx = player.pos.x - this.pos.x;
    const prz = player.pos.z - this.pos.z;
    const pAhead = prx * fx + prz * fz;
    const pSide = prx * rx + prz * rz;
    if (pAhead > 0 && pAhead < 18 && Math.abs(pSide) < 3.4) {
      targetSpeed = Math.min(targetSpeed, Math.max(0, pAhead - 7) * 1.4);
    }

    // keep distance from other traffic
    for (const other of cars) {
      if (other === this) continue;
      const dx = other.pos.x - this.pos.x;
      const dz = other.pos.z - this.pos.z;
      const ahead = dx * fx + dz * fz;
      const side = dx * rx + dz * rz;
      if (ahead > 0 && ahead < 13 && Math.abs(side) < 2.6) {
        const limit = Math.max(0, other.speed - 0.5);
        if (limit < targetSpeed) targetSpeed = Math.min(targetSpeed, limit, Math.max(0, ahead - 6) * 1.2);
      }
    }

    this._braking = targetSpeed < this.speed - 0.6;
    if (this.speed > targetSpeed) {
      this.speed = Math.max(targetSpeed, this.speed - 10 * dt);
    } else {
      this.speed = Math.min(targetSpeed, this.speed + 4.5 * dt);
    }

    const desiredYaw = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    const diff = wrapAngle(desiredYaw - this.yaw);
    const maxYawRate = clamp((this.speed / Math.max(2.2, this.wheelbase)) * 0.95, 0.4, 1.6);
    const yawStep = clamp(diff, -maxYawRate * dt, maxYawRate * dt);
    this.yaw = wrapAngle(this.yaw + yawStep);
    this.steer = clamp(diff, -0.55, 0.55);

    if (this.speed > 0.02) {
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    }

    // world bounds and static geometry
    this.pos.x = clamp(this.pos.x, -1260, 1100);
    this.pos.z = clamp(this.pos.z, -1260, 1260);
    if (this.traffic.world) {
      const probe = { x: this.pos.x, z: this.pos.z };
      const hit = this.traffic.world.collideCircle(probe, 1.15);
      if (hit) {
        this.pos.x = probe.x;
        this.pos.z = probe.z;
        this.speed *= 0.45;
        this.stuck += dt;
      }
    }

    // recover cars that get wedged
    if (this.speed < 0.35) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 4.5) {
      this.stuck = 0;
      this.retarget();
    }

    this._animate(dt);
  }

  _isRing() {
    return Math.abs(this.pos.x) > 960 || Math.abs(this.pos.z) > 960;
  }

  _animate(dt) {
    this.wheelSpin += (this.speed / this.wheelR) * dt;
    for (const w of this.visual.wheels) {
      w.spin.rotation.z = -this.wheelSpin;
      if (w.front) w.steer.rotation.y = this.steer;
    }
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.yaw;
    const tail = this.visual.materials.tail;
    if (tail) {
      tail.emissiveIntensity = 0.5 + this.traffic.night * 1.1 + (this._braking ? 3.2 : 0);
    }
  }

  setNight(n) {
    const mats = this.visual.materials;
    if (mats.head) mats.head.emissiveIntensity = 1.5 + n * 2.4;
    if (mats.tail) mats.tail.emissiveIntensity = 0.5 + n * 1.1;
  }

  dispose() {
    this.traffic.scene.remove(this.root);
    disposeCarModel(this.visual);
  }
}

export class Traffic {
  constructor(scene, graph, opts = {}) {
    this.scene = scene;
    this.graph = graph;
    this.world = opts.world || null;
    this.effects = opts.effects || null;
    this.rnd = mulberry32(90421);
    this.night = 0;
    this.cars = [];
    this.parked = [];
    this.count = opts.count ?? 16;
    this._avoid = opts.avoid || null;
    this._densityTimer = 0;
    this._spawnCars();
    this._spawnParked();
  }

  _pick(defs) {
    return CAR_BY_ID[defs[(this.rnd() * defs.length) | 0]] || CAR_BY_ID.sp320;
  }

  _cosmetic() {
    return {
      paint: PAINTS[(this.rnd() * PAINTS.length) | 0],
      finish: this.rnd() < 0.35 ? 'matte' : 'metallic',
      rimStyle: 'sport',
    };
  }

  _tooClose(x, z, list) {
    if (this._avoid && Math.hypot(x - this._avoid.x, z - this._avoid.z) < 55) return true;
    for (const c of list) {
      if (Math.hypot(x - c.pos.x, z - c.pos.z) < 24) return true;
    }
    return false;
  }

  _spawnCars() {
    const nodes = this.graph.list;
    let guard = 0;
    while (this.cars.length < this.count && guard++ < this.count * 30) {
      const node = nodes[(this.rnd() * nodes.length) | 0];
      const edges = node.edges;
      if (!edges.length) continue;
      const edge = edges[(this.rnd() * edges.length) | 0];
      const dx = edge.node.x - node.x;
      const dz = edge.node.z - node.z;
      const len = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx / len, dz / len);
      const x = node.x + (dz / len) * LANE;
      const z = node.z - (dx / len) * LANE;
      if (this._tooClose(x, z, this.cars)) continue;
      const def = this._pick(TRAFFIC_DEFS);
      const car = new TrafficCar(this, def, this._cosmetic(), x, z, yaw);
      car.startRoute(node, edge.node);
      car.speed = car.maxSpeed * 0.7;
      this.cars.push(car);
    }
  }

  _spawnParked() {
    const cx = -480, cz = 480;
    const rowA = [0, 1, 3, 5];
    const rowB = [0, 2, 4, 5];
    for (const idx of rowA) {
      const def = this._pick(TRAFFIC_DEFS);
      this.parked.push(this._park(def, cx - 40 + idx * 16, cz + 46, Math.PI));
    }
    for (const idx of rowB) {
      const def = this._pick(TRAFFIC_DEFS);
      this.parked.push(this._park(def, cx - 40 + idx * 16, cz - 46, 0));
    }
    // a few cars on the waterfront promenade
    this.parked.push(this._park(this._pick(TRAFFIC_DEFS), 1040, 320, Math.PI / 2));
    this.parked.push(this._park(this._pick(TRAFFIC_DEFS), 1040, 290, Math.PI / 2));
  }

  _park(def, x, z, yaw) {
    const car = new TrafficCar(this, def, this._cosmetic(), x, z, yaw);
    car.maxSpeed = 0;
    car.speed = 0;
    car.route = [];
    return car;
  }

  setNight(n) {
    if (Math.abs(n - this.night) < 0.02) return;
    this.night = n;
    for (const c of this.cars) c.setNight(n);
    for (const c of this.parked) c.setNight(n);
  }

  _ensureDensity(dt, player) {
    if (!player) return;
    this._densityTimer -= dt;
    if (this._densityTimer > 0) return;
    this._densityTimer = 1.5;

    let near = 0;
    let farthest = null;
    let farDist = 0;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - player.pos.x, car.pos.z - player.pos.z);
      if (d < 460) near++;
      if (d > farDist) { farDist = d; farthest = car; }
    }
    if (near >= 4 || !farthest || farDist < 650) return;

    const nodes = this.graph.list;
    for (let tries = 0; tries < 14; tries++) {
      const node = nodes[(this.rnd() * nodes.length) | 0];
      if (!node.edges.length) continue;
      const d = Math.hypot(node.x - player.pos.x, node.z - player.pos.z);
      if (d < 230 || d > 520) continue;
      const edge = node.edges[(this.rnd() * node.edges.length) | 0];
      const dx = edge.node.x - node.x;
      const dz = edge.node.z - node.z;
      const len = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx / len, dz / len);
      const x = node.x + (dz / len) * LANE;
      const z = node.z - (dx / len) * LANE;
      if (this._tooClose(x, z, this.cars)) continue;
      farthest.pos.set(x, 0, z);
      farthest.yaw = yaw;
      farthest.startRoute(node, edge.node);
      farthest.speed = farthest.maxSpeed * 0.7;
      farthest.root.position.set(x, 0, z);
      farthest.root.rotation.y = yaw;
      break;
    }
  }

  update(dt, player, night = this.night) {
    this.setNight(night);
    this._ensureDensity(dt, player);
    for (const car of this.cars) {
      car.update(dt, player, this.cars);
      this._pushPlayer(car, player);
    }
    for (const car of this.parked) {
      this._pushPlayer(car, player);
    }
  }

  _pushPlayer(car, player) {
    const dx = player.pos.x - car.pos.x;
    const dz = player.pos.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const minDist = 2.7;
    if (dist > minDist || dist < 1e-4) return;
    const nx = dx / dist;
    const nz = dz / dist;
    player.pos.x += nx * (minDist - dist);
    player.pos.z += nz * (minDist - dist);
    const impact = clamp(1 + Math.abs(player.vLong) * 0.16, 1.2, 7);
    player.vLong *= 0.45;
    player.vLat *= 0.55;
    player.yawRate *= 0.5;
    car.speed = Math.max(0, car.speed * 0.35);
    if (car.collisionCooldown <= 0) {
      car.collisionCooldown = 0.6;
      player.impact = Math.max(player.impact || 0, impact);
      if (player.isPlayer && player.fuel != null) {
        player.fuel = Math.max(0, player.fuel - clamp(impact * 0.6, 1, 4.5));
      }
      if (this.effects) {
        this.effects.sparkBurst(
          (car.pos.x + player.pos.x) / 2, 0.72, (car.pos.z + player.pos.z) / 2,
          14, nx, nz, 1.1,
        );
      }
      if (player.isPlayer && player.audio) {
        player.audio.crash(clamp(impact / 9, 0.25, 1.1));
      }
    }
  }

  dispose() {
    for (const c of this.cars) c.dispose();
    for (const c of this.parked) c.dispose();
    this.cars.length = 0;
    this.parked.length = 0;
  }
}
