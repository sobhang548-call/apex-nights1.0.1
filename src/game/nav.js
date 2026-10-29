import * as THREE from 'three';
import { ROAD_LINES, RING } from '../data.js';
import { wrapAngle } from '../util.js';

const RING_COORDS = [...new Set([-RING, ...ROAD_LINES, RING])].sort((a, b) => a - b);
const CITY_EDGE = 1120;

function districtAt(x, z) {
  if (Math.abs(x) > 900 || Math.abs(z) > 900) return 'RING HIGHWAY';
  if (z < -480 && x > 200) return 'NORTHGATE';
  if (x < -480 && z > 420) return 'FOUNDRY';
  if (x < -480) return 'OLD TOWN';
  if (x > 700) return 'COASTLINE';
  if (x > 100 && z > 100) return 'MIDTOWN';
  return 'DOWNTOWN';
}

function snapToRoad(x, z) {
  const cz = Math.min(CITY_EDGE, Math.max(-CITY_EDGE, z));
  const cx = Math.min(CITY_EDGE, Math.max(-CITY_EDGE, x));
  let best = null;
  let bestD = Infinity;
  for (const l of ROAD_LINES) {
    const dx = Math.abs(x - l);
    if (dx < bestD) { bestD = dx; best = { x: l, z: cz }; }
    const dz = Math.abs(z - l);
    if (dz < bestD) { bestD = dz; best = { x: cx, z: l }; }
  }
  const ringZ = Math.max(-RING, Math.min(RING, z));
  const ringX = Math.max(-RING, Math.min(RING, x));
  if (Math.abs(x - RING) < bestD) { bestD = Math.abs(x - RING); best = { x: RING, z: ringZ }; }
  if (Math.abs(x + RING) < bestD) { bestD = Math.abs(x + RING); best = { x: -RING, z: ringZ }; }
  if (Math.abs(z - RING) < bestD) { bestD = Math.abs(z - RING); best = { x: ringX, z: RING }; }
  if (Math.abs(z + RING) < bestD) { best = { x: ringX, z: -RING }; }
  return best || { x: 0, z: 0 };
}

export class RoadGraph {
  constructor() {
    this.nodes = new Map();
    this.list = [];
    this._build();
  }

  _node(x, z) {
    const key = `${x},${z}`;
    let n = this.nodes.get(key);
    if (!n) {
      n = { x, z, key, edges: [] };
      this.nodes.set(key, n);
      this.list.push(n);
    }
    return n;
  }

  _link(a, b) {
    if (!a || !b || a === b) return;
    const w = Math.hypot(a.x - b.x, a.z - b.z);
    a.edges.push({ node: b, w });
    b.edges.push({ node: a, w });
  }

  _build() {
    const lines = ROAD_LINES;
    for (const z of lines) {
      for (let i = 0; i < lines.length - 1; i++) {
        this._link(this._node(lines[i], z), this._node(lines[i + 1], z));
      }
    }
    for (const x of lines) {
      for (let i = 0; i < lines.length - 1; i++) {
        this._link(this._node(x, lines[i]), this._node(x, lines[i + 1]));
      }
    }

    for (let i = 0; i < RING_COORDS.length - 1; i++) {
      const a = RING_COORDS[i];
      const b = RING_COORDS[i + 1];
      this._link(this._node(a, RING), this._node(b, RING));
      this._link(this._node(a, -RING), this._node(b, -RING));
      this._link(this._node(RING, a), this._node(RING, b));
      this._link(this._node(-RING, a), this._node(-RING, b));
    }

    const lo = lines[0];
    const hi = lines[lines.length - 1];
    for (const l of lines) {
      this._link(this._node(l, lo), this._node(l, -RING));
      this._link(this._node(l, hi), this._node(l, RING));
      this._link(this._node(lo, l), this._node(-RING, l));
      this._link(this._node(hi, l), this._node(RING, l));
    }
  }

  nearest(x, z) {
    let best = this.list[0];
    let bestD = Infinity;
    for (const n of this.list) {
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  shortest(start, goal) {
    if (!start || !goal) return null;
    const dist = new Map([[start.key, 0]]);
    const prev = new Map();
    const open = [{ node: start, d: 0 }];
    while (open.length) {
      open.sort((a, b) => a.d - b.d);
      const cur = open.shift();
      if (cur.d > (dist.get(cur.node.key) ?? Infinity)) continue;
      if (cur.node === goal) break;
      for (const e of cur.node.edges) {
        const nd = cur.d + e.w;
        if (nd < (dist.get(e.node.key) ?? Infinity)) {
          dist.set(e.node.key, nd);
          prev.set(e.node.key, cur.node);
          open.push({ node: e.node, d: nd });
        }
      }
    }
    if (start !== goal && !prev.has(goal.key)) return null;
    const path = [goal];
    let n = goal;
    while (n !== start) {
      n = prev.get(n.key);
      if (!n) return null;
      path.push(n);
    }
    return path.reverse();
  }
}

export class Nav {
  constructor(scene) {
    this.graph = new RoadGraph();
    this.dest = null;
    this.label = '';
    this.points = [];
    this._active = false;
    this.arrived = false;
    this.remaining = 0;
    this.nextDist = 0;
    this.instruction = '';
    this.arrow = 0;
    this._timer = 0;
    this._arriveEvent = false;
    this._beaconOn = false;
    this._t = 0;

    const colMat = new THREE.MeshBasicMaterial({
      color: 0x25e0ff, transparent: true, opacity: 0.10, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.8, 90, 16, 1, true), colMat);
    col.position.y = 45;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x25e0ff, transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.5, 8, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.35;
    this.beacon = new THREE.Group();
    this.beacon.add(col, ring);
    this.beacon.visible = false;
    this._colMat = colMat;
    this._ringMat = ringMat;
    this._ring = ring;
    scene.add(this.beacon);
  }

  get active() {
    return this._active;
  }

  set active(v) {
    this._active = !!v;
    if (!this._active) this.beacon.visible = false;
  }

  waypointAt(x, z) {
    const p = snapToRoad(x, z);
    return { x: p.x, z: p.z, label: `WAYPOINT · ${districtAt(p.x, p.z)}` };
  }

  setDestination(x, z, label, exact = false) {
    if (!isFinite(x) || !isFinite(z)) return false;
    const p = exact
      ? { x: Math.max(-1260, Math.min(1260, x)), z: Math.max(-1260, Math.min(1260, z)) }
      : snapToRoad(x, z);
    this.dest = p;
    this.label = label || (exact ? 'DESTINATION' : `WAYPOINT · ${districtAt(p.x, p.z)}`);
    this.active = true;
    this.arrived = false;
    this._arriveEvent = false;
    this.points = [];
    this.remaining = 0;
    this.nextDist = 0;
    this.instruction = '';
    this.arrow = 0;
    this._timer = 0;
    this.beacon.position.set(p.x, 0, p.z);
    this.beacon.visible = this._beaconOn && !this.arrived;
    return true;
  }

  clear() {
    this.active = false;
    this.dest = null;
    this.label = '';
    this.points = [];
    this.arrived = false;
    this._arriveEvent = false;
    this.remaining = 0;
    this.nextDist = 0;
    this.instruction = '';
  }

  setBeaconVisible(v) {
    this._beaconOn = !!v;
    this.beacon.visible = this._beaconOn && this.active && !this.arrived;
  }

  consumeArrival() {
    if (!this._arriveEvent) return false;
    this._arriveEvent = false;
    return true;
  }

  update(dt, player, beacon = true) {
    this._t += dt;
    if (!this.active || !player) {
      this.beacon.visible = false;
      return;
    }
    this._beaconOn = beacon;
    this._timer -= dt;
    if (this._timer <= 0 || !this.points.length) {
      this._timer = 0.33;
      this._recompute(player);
    }
    const p = player.pos;
    const toDest = Math.hypot(p.x - this.dest.x, p.z - this.dest.z);
    if (!this.arrived && toDest < 20) {
      this.arrived = true;
      this._arriveEvent = true;
    } else if (this.arrived && toDest > 34) {
      this.arrived = false;
    }
    this._guidance(player);
    this._updateBeacon(dt, beacon);
  }

  _recompute(player) {
    const start = this.graph.nearest(player.pos.x, player.pos.z);
    const goal = this.graph.nearest(this.dest.x, this.dest.z);
    const path = this.graph.shortest(start, goal) || [goal];
    const pts = path.map((n) => ({ x: n.x, z: n.z }));

    // Don't route back to a node the player has already driven past: snap the
    // first waypoint onto the segment under the car instead.
    if (pts.length > 1) {
      const a = pts[0];
      const b = pts[1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      if (len2 > 1) {
        const t = Math.max(0, Math.min(1,
          ((player.pos.x - a.x) * abx + (player.pos.z - a.z) * abz) / len2));
        const proj = { x: a.x + abx * t, z: a.z + abz * t };
        if (Math.hypot(proj.x - player.pos.x, proj.z - player.pos.z) < 45) pts[0] = proj;
      }
    }

    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - this.dest.x, last.z - this.dest.z) > 1.5) {
      pts.push({ x: this.dest.x, z: this.dest.z });
    }
    this.points = pts;
  }

  _guidance(player) {
    const pts = this.points;
    const p = player.pos;
    if (!pts.length) {
      this.remaining = Math.hypot(p.x - this.dest.x, p.z - this.dest.z);
      return;
    }
    let i = 0;
    while (i < pts.length - 1 && Math.hypot(pts[i].x - p.x, pts[i].z - p.z) < 18) i++;
    const target = pts[i];
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const distToTarget = Math.hypot(dx, dz) || 0.001;
    const desired = Math.atan2(dx, dz);
    let rel = wrapAngle(desired - player.yaw);
    let instruction = 'STRAIGHT AHEAD';

    if (this.arrived) {
      instruction = 'DESTINATION REACHED';
    } else {
      const after = pts[i + 1];
      if (after) {
        const outYaw = Math.atan2(after.x - target.x, after.z - target.z);
        const turn = wrapAngle(outYaw - desired);
        if (Math.abs(turn) > 0.5 && distToTarget < 150) {
          rel = wrapAngle(outYaw - player.yaw);
          instruction = turn > 0 ? 'TURN LEFT' : 'TURN RIGHT';
        }
      } else {
        instruction = 'DESTINATION';
      }
      if (instruction === 'STRAIGHT AHEAD' && Math.abs(rel) > 0.55) {
        instruction = rel > 0 ? 'TURN LEFT' : 'TURN RIGHT';
      }
      if (Math.abs(rel) > 2.5) instruction = 'TURN AROUND';
    }

    this.instruction = instruction;
    this.arrow = (-rel * 180) / Math.PI;
    this.nextDist = distToTarget;

    let remaining = distToTarget;
    for (let j = i; j < pts.length - 1; j++) {
      remaining += Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].z - pts[j].z);
    }
    this.remaining = remaining;
  }

  _updateBeacon(dt, beacon) {
    const show = beacon && this.active && !this.arrived;
    this.beacon.visible = show;
    if (!show) return;
    const pulse = 0.5 + 0.5 * Math.sin(this._t * 2.4);
    this._colMat.opacity = 0.05 + pulse * 0.075;
    this._ringMat.opacity = 0.3 + pulse * 0.3;
    this._ring.scale.setScalar(1 + pulse * 0.22);
    this._ring.rotation.z += dt * 0.5;
  }

  hudState() {
    if (!this.active) return null;
    return {
      active: true,
      label: this.label,
      instruction: this.instruction,
      arrow: this.arrow,
      nextDist: this.nextDist,
      remaining: this.remaining,
      arrived: this.arrived,
    };
  }

  /** Polyline for map drawing: live car position followed by the remaining nodes. */
  drawPoints(player) {
    if (!this.active || !this.points.length) return [];
    let i = 0;
    while (i < this.points.length - 1
      && Math.hypot(this.points[i].x - player.pos.x, this.points[i].z - player.pos.z) < 18) i++;
    const out = [{ x: player.pos.x, z: player.pos.z }];
    for (; i < this.points.length; i++) out.push(this.points[i]);
    return out;
  }
}
