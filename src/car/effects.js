import * as THREE from 'three';

function spriteTexture(inner, outer, soft = true) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, soft ? 2 : 12, 32, 32, 31);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.55, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skidTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.78, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`;
    g.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 4, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function skidGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

const PARTICLE_VERT = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const PARTICLE_FRAG = `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    float a = t.a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * t.rgb, a);
  }
`;

class ParticlePool {
  constructor(scene, max, tex, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.cursor = 0;
    this.alive = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
    scene.add(this.points);

    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -500;
    geo.setDrawRange(0, max);
  }

  spawn(x, y, z, vx, vy, vz, size, grow, life, color, drag = 0.9, gravity = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    this.size[i] = size;
    this.grow[i] = grow;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.alpha[i] = 1;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.alive = this.max;
    return i;
  }

  update(dt) {
    const { pos, vel, life, maxLife, alpha, size, grow, drag, gravity } = this;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      any = true;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -500; alpha[i] = 0; continue; }
      const i3 = i * 3;
      const d = Math.pow(drag[i], dt * 60);
      vel[i3] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d + gravity[i] * dt;
      vel[i3 + 2] *= d;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.04) { pos[i3 + 1] = 0.04; vel[i3 + 1] = Math.abs(vel[i3 + 1]) * 0.15; }
      size[i] += grow[i] * dt;
      const t = life[i] / maxLife[i];
      alpha[i] = t * Math.min(1, t * 3.2);
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
  }

  clear() {
    for (let i = 0; i < this.max; i++) {
      this.life[i] = 0;
      this.alpha[i] = 0;
      this.pos[i * 3 + 1] = -500;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, quality = 'medium') {
    this.scene = scene;
    const maxSkids = quality === 'low' ? 500 : quality === 'high' ? 3000 : 1600;
    this.skidMax = maxSkids;
    this.skidIdx = 0;
    this.skidDirty = false;

    this.skidMesh = new THREE.InstancedMesh(
      skidGeometry(),
      new THREE.MeshBasicMaterial({
        map: skidTexture(), transparent: true, opacity: 0.52, depthWrite: false,
        vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      }),
      maxSkids,
    );
    this.skidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skidMesh.frustumCulled = false;
    this.skidMesh.renderOrder = 1;
    this.skidMesh.count = maxSkids;
    const white = new THREE.Color(0x1a1a1a);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < maxSkids; i++) {
      this.skidMesh.setMatrixAt(i, this._zero);
      this.skidMesh.setColorAt(i, white);
    }
    this.skidMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.skidMesh);

    const smokeTex = spriteTexture('rgba(255,255,255,0.85)', 'rgba(190,190,190,0.4)');
    const sparkTex = spriteTexture('rgba(255,255,220,1)', 'rgba(255,150,40,0.8)', false);
    this.smoke = new ParticlePool(scene, quality === 'low' ? 140 : quality === 'high' ? 420 : 280, smokeTex, false);
    this.sparks = new ParticlePool(scene, quality === 'low' ? 80 : 220, sparkTex, true);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._smokeColor = new THREE.Color();
    this._sparkColor = new THREE.Color(0xffa347);
    this._nitroColor = new THREE.Color(0x5fc8ff);
    this._nitroHot = new THREE.Color(0xff8a2a);
  }

  /** Lay a rubber mark between two ground points. */
  addSkid(x0, z0, x1, z1, width = 0.3, strength = 1) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.04 || len > 4) return;
    const angle = Math.atan2(dx, dz);
    this._q.setFromAxisAngle(this._up, angle);
    this._v.set((x0 + x1) / 2, 0.045, (z0 + z1) / 2);
    this._s.set(width, 1, len * 1.08);
    this._m.compose(this._v, this._q, this._s);
    this.skidMesh.setMatrixAt(this.skidIdx, this._m);
    const shade = 0.055 + 0.12 * (1 - Math.min(1, strength));
    this.skidMesh.setColorAt(this.skidIdx, new THREE.Color(shade, shade, shade));
    this.skidIdx = (this.skidIdx + 1) % this.skidMax;
    this.skidDirty = true;
  }

  smokePuff(x, y, z, count = 4, power = 1, tint = 0.72) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.4 * power;
      this._smokeColor.setRGB(tint, tint, tint * 1.02);
      this.smoke.spawn(
        x + Math.cos(a) * r * 0.3, y + Math.random() * 0.2, z + Math.sin(a) * r * 0.3,
        Math.cos(a) * r, 0.6 + Math.random() * 1.1, Math.sin(a) * r,
        0.55 + Math.random() * 0.6, 1.5 + Math.random() * 1.4,
        0.65 + Math.random() * 0.55, this._smokeColor, 0.94, 0.55,
      );
    }
  }

  sparkBurst(x, y, z, count = 12, dirX = 0, dirZ = 0, power = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (3 + Math.random() * 9) * power;
      this.sparks.spawn(
        x, y + 0.2 + Math.random() * 0.4, z,
        Math.cos(a) * sp + dirX * 3, 1.4 + Math.random() * 3.6, Math.sin(a) * sp + dirZ * 3,
        0.1 + Math.random() * 0.14, -0.05, 0.24 + Math.random() * 0.42,
        this._sparkColor, 0.9, -9.8,
      );
    }
  }

  nitroFlame(x, y, z, dirX, dirZ, strength = 1) {
    const col = Math.random() < 0.4 ? this._nitroHot : this._nitroColor;
    this.sparks.spawn(
      x + (Math.random() - 0.5) * 0.12, y + (Math.random() - 0.5) * 0.1, z + (Math.random() - 0.5) * 0.12,
      -dirX * (5 + Math.random() * 7) + (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 0.7,
      -dirZ * (5 + Math.random() * 7) + (Math.random() - 0.5) * 1.2,
      0.28 + Math.random() * 0.34, -0.9, 0.16 + Math.random() * 0.12,
      col, 0.86, 0,
    );
  }

  update(dt) {
    if (this.skidDirty) {
      this.skidMesh.instanceMatrix.needsUpdate = true;
      this.skidMesh.instanceColor.needsUpdate = true;
      this.skidDirty = false;
    }
    this.smoke.update(dt);
    this.sparks.update(dt);
  }

  clear() {
    for (let i = 0; i < this.skidMax; i++) this.skidMesh.setMatrixAt(i, this._zero);
    this.skidMesh.instanceMatrix.needsUpdate = true;
    this.skidIdx = 0;
    this.smoke.clear();
    this.sparks.clear();
  }
}
