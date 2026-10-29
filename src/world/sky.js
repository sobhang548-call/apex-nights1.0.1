import * as THREE from 'three';
import { clamp, lerp, smoothstep, createCanvas, mulberry32 } from '../util.js';

// Warm, photographic palette. Greys are deliberately tinted (cool in shadow,
// amber in the highlight) so the city reads as sunlight instead of studio light.
const KEYS = [
  { h: 0,    top: '#060a14', horizon: '#131a26', fog: '#0d121b', sun: '#a8b8d8', sunI: 0.24, hs: '#2b3550', hg: '#141519', hi: 0.34, exp: 0.95, night: 1 },
  { h: 4.8,  top: '#0a1220', horizon: '#232739', fog: '#171c27', sun: '#a8b8d8', sunI: 0.24, hs: '#2b3550', hg: '#141519', hi: 0.34, exp: 0.96, night: 0.95 },
  { h: 5.8,  top: '#2c3c62', horizon: '#d9896a', fog: '#7c6b6c', sun: '#ffb07a', sunI: 0.95, hs: '#6a7da0', hg: '#2b2523', hi: 0.56, exp: 1.02, night: 0.42 },
  { h: 6.9,  top: '#6a8fc0', horizon: '#ffb37c', fog: '#c49a84', sun: '#ffc48e', sunI: 2.0, hs: '#a8b8cc', hg: '#40382e', hi: 0.8, exp: 1.05, night: 0.1 },
  { h: 9.2,  top: '#5b93c9', horizon: '#e6dac6', fog: '#c4cbc8', sun: '#fff0d6', sunI: 3.0, hs: '#aabfda', hg: '#454138', hi: 0.9, exp: 1.02, night: 0 },
  { h: 12.4, top: '#4b86c4', horizon: '#dfe6e4', fog: '#c8d0d3', sun: '#fffaf0', sunI: 3.2, hs: '#b0c8de', hg: '#4a473e', hi: 0.93, exp: 1.0, night: 0 },
  { h: 16.2, top: '#5a8cbc', horizon: '#f0d4ae', fog: '#d2c1a9', sun: '#ffe0b4', sunI: 2.85, hs: '#b2c0cc', hg: '#4a4136', hi: 0.86, exp: 1.02, night: 0 },
  { h: 17.9, top: '#6b7fa8', horizon: '#ffb06a', fog: '#c08e6c', sun: '#ffae62', sunI: 2.25, hs: '#a3a5ad', hg: '#40342a', hi: 0.72, exp: 1.06, night: 0.05 },
  { h: 18.8, top: '#3f4f7c', horizon: '#ff8a52', fog: '#8f6a5a', sun: '#ff7a40', sunI: 1.3, hs: '#7f8098', hg: '#322a25', hi: 0.62, exp: 1.08, night: 0.32 },
  { h: 19.5, top: '#1d2747', horizon: '#a9586c', fog: '#4f4552', sun: '#d1789b', sunI: 0.44, hs: '#505573', hg: '#1a1a20', hi: 0.44, exp: 1.02, night: 0.72 },
  { h: 20.8, top: '#0c1428', horizon: '#302e46', fog: '#1a1e2a', sun: '#9fb0e0', sunI: 0.28, hs: '#2c3752', hg: '#121418', hi: 0.36, exp: 0.98, night: 0.94 },
  { h: 24,   top: '#060a14', horizon: '#131a26', fog: '#0d121b', sun: '#a8b8d8', sunI: 0.24, hs: '#2b3550', hg: '#141519', hi: 0.34, exp: 0.95, night: 1 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);
const CITY_GLOW = new THREE.Color(0x7a4a24);

function blendKey(hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = KEYS[0], b = KEYS[KEYS.length - 1], t = 0;
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (h >= KEYS[i].h && h <= KEYS[i + 1].h) {
      a = KEYS[i]; b = KEYS[i + 1];
      t = smoothstep(0, 1, (h - a.h) / (b.h - a.h));
      break;
    }
  }
  const col = (key) => tmpA.copy(new THREE.Color(a[key])).lerp(tmpB.copy(new THREE.Color(b[key])), t).clone();
  return {
    top: col('top'), horizon: col('horizon'), fog: col('fog'), sun: col('sun'),
    hs: col('hs'), hg: col('hg'),
    sunI: lerp(a.sunI, b.sunI, t), hi: lerp(a.hi, b.hi, t),
    exp: lerp(a.exp, b.exp, t), night: lerp(a.night, b.night, t),
  };
}

export class SkySystem {
  constructor(scene, renderer, quality = 'medium') {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.hour = 18.35;
    this.night = 0;
    this._envHour = -99;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    this.group = new THREE.Group();
    this.group.name = 'sky';
    scene.add(this.group);

    this.uniforms = {
      topColor: { value: new THREE.Color('#2d3f6b') },
      horizonColor: { value: new THREE.Color('#ff8a4a') },
      sunColor: { value: new THREE.Color('#ff8a45') },
      sunDir: { value: new THREE.Vector3(0.3, 0.2, 0.4) },
      moonDir: { value: new THREE.Vector3(-0.3, 0.5, -0.4) },
      night: { value: 0.3 },
      time: { value: 0 },
    };

    const skyGeo = new THREE.SphereGeometry(3600, 48, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vWorld;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        uniform vec3 moonDir;
        uniform float night;
        uniform float time;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 dir = normalize(vWorld);
          float y = clamp(dir.y, -0.1, 1.0);
          float h = clamp(y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(horizonColor, topColor, smoothstep(0.48, 0.86, h));
          col = mix(col, horizonColor * 0.55, smoothstep(0.52, 0.36, h));

          float sd = max(dot(dir, sunDir), 0.0);
          float above = smoothstep(-0.06, 0.06, sunDir.y);
          col += sunColor * pow(sd, 220.0) * 1.1 * above;
          col += sunColor * pow(sd, 8.0) * 0.16 * above;
          col += sunColor * pow(sd, 2.0) * 0.05 * above;

          float md = max(dot(dir, moonDir), 0.0);
          col += vec3(0.55, 0.68, 1.0) * pow(md, 1200.0) * 1.4 * night;
          col += vec3(0.25, 0.35, 0.7) * pow(md, 60.0) * 0.10 * night;

          float band = smoothstep(0.35, 0.0, abs(dir.y - 0.02));
          col += vec3(0.05, 0.07, 0.12) * band * (1.0 - night) * 0.5;

          // Warm sodium glow from the city lights, hugging the skyline.
          float cityBand = smoothstep(0.24, 0.0, abs(dir.y - 0.015));
          col += vec3(0.30, 0.16, 0.07) * cityBand * night * 0.34;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.frustumCulled = false;
    this.group.add(this.skyMesh);

    this._buildStars();
    this._buildClouds();

    this.hemi = new THREE.HemisphereLight(0x8fb4e8, 0x1a1a1c, 0.7);
    scene.add(this.hemi);

    this.key = new THREE.DirectionalLight(0xffe6cc, 2.5);
    this.key.position.set(120, 220, 80);
    this.key.castShadow = true;
    this._configureShadow();
    scene.add(this.key);
    scene.add(this.key.target);

    this.ambient = new THREE.AmbientLight(0x2a3550, 0.14);
    scene.add(this.ambient);

    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.fog = new THREE.Fog(0x9a7a6e, 220, 1650);
    scene.fog = this.fog;

    this.envMap = null;
    this._envScene = null;

    this.setHour(18.35);
  }

  _configureShadow() {
    const q = this.quality;
    const size = q === 'high' ? 2048 : q === 'medium' ? 1536 : 1024;
    const span = q === 'high' ? 95 : q === 'medium' ? 80 : 62;
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.camera.left = -span;
    this.key.shadow.camera.right = span;
    this.key.shadow.camera.top = span;
    this.key.shadow.camera.bottom = -span;
    this.key.shadow.camera.near = 1;
    this.key.shadow.camera.far = 520;
    this.key.shadow.bias = -0.00035;
    this.key.shadow.normalBias = 0.035;
    if (this.key.shadow.map) {
      this.key.shadow.map.dispose();
      this.key.shadow.map = null;
    }
  }

  setQuality(q) {
    this.quality = q;
    this._configureShadow();
  }

  _buildStars() {
    const rnd = mulberry32(1337);
    const count = 1500;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(0.06 + rnd() * 0.94);
      const r = 3100;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xcfe0ff, size: 2.1, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  _buildClouds() {
    const { canvas, ctx } = createCanvas(256, 128);
    const g = ctx.createRadialGradient(128, 70, 8, 128, 64, 120);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cloudMat = new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.55, depthWrite: false, fog: false,
      color: 0xdfe8f5,
    });
    this.clouds = new THREE.Group();
    const rnd = mulberry32(99);
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      const a = rnd() * Math.PI * 2;
      const r = 900 + rnd() * 1500;
      s.position.set(Math.cos(a) * r, 300 + rnd() * 480, Math.sin(a) * r);
      const sc = 420 + rnd() * 700;
      s.scale.set(sc, sc * (0.32 + rnd() * 0.2), 1);
      s.userData.speed = 1.5 + rnd() * 3;
      this.clouds.add(s);
    }
    this.group.add(this.clouds);
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    const k = blendKey(this.hour);

    // Sun position: rises in the east (+X), sets in the west (-X).
    const dayFrac = (this.hour - 6.2) / 12.6;
    const theta = clamp(dayFrac, 0, 1) * Math.PI;
    const elev = Math.sin(theta);
    const az = lerp(Math.PI / 2, -Math.PI / 2, clamp(dayFrac, 0, 1));
    this.sunDir.set(
      Math.sin(az) * Math.max(0.2, 1 - Math.abs(dayFrac - 0.5) * 0.3),
      Math.max(-0.55, elev * 0.9),
      Math.cos(az) * 0.35,
    ).normalize();

    // Moon rides the opposite arc, so it climbs as the sun drops.
    const nightFrac = ((this.hour + 12) % 24 - 6.2) / 12.6;
    const mTheta = clamp(nightFrac, 0, 1) * Math.PI;
    this.moonDir.set(
      Math.sin(lerp(Math.PI / 2, -Math.PI / 2, clamp(nightFrac, 0, 1))),
      Math.max(0.22, Math.sin(mTheta) * 0.9),
      Math.cos(mTheta) * 0.4,
    ).normalize();

    const sunAbove = this.sunDir.y > 0.02;
    this.lightDir.copy(sunAbove ? this.sunDir : this.moonDir);
    this.night = k.night;

    this.uniforms.topColor.value.copy(k.top);
    this.uniforms.horizonColor.value.copy(k.horizon);
    this.uniforms.sunColor.value.copy(k.sun);
    this.uniforms.sunDir.value.copy(this.sunDir);
    this.uniforms.moonDir.value.copy(this.moonDir);
    this.uniforms.night.value = k.night;

    this.hemi.color.copy(k.hs);
    this.hemi.groundColor.copy(k.hg).lerp(CITY_GLOW, 0.28 * k.night);
    this.hemi.intensity = k.hi * (1 + 0.3 * k.night);

    // Warm bounce light so shadows stay soft and coloured, not dead grey.
    this.ambient.color.copy(k.hs).lerp(k.horizon, 0.32).lerp(CITY_GLOW, 0.4 * k.night);
    this.ambient.intensity = 0.13 + 0.06 * (1 - k.night);

    if (sunAbove) {
      this.key.color.copy(k.sun);
      this.key.intensity = k.sunI;
    } else {
      this.key.color.set('#a8bcff');
      this.key.intensity = 0.38 + (1 - k.night) * 0.4;
    }

    this.fog.color.copy(k.fog);
    this.fog.near = lerp(250, 130, k.night);
    this.fog.far = lerp(1900, 900, k.night);

    this.renderer.toneMappingExposure = k.exp;

    this.starMat.opacity = smoothstep(0.35, 0.9, k.night) * 0.9;
    this.cloudMat.opacity = 0.42 - k.night * 0.28;
    this.cloudMat.color.copy(k.horizon).lerp(WHITE, 0.55);

    if (Math.abs(this.hour - this._envHour) > 0.9 || this._envHour < 0) {
      this._envHour = this.hour;
      this._buildEnv(k);
    }
  }

  _buildEnv(k) {
    const { canvas, ctx } = createCanvas(256, 128);
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#' + k.top.getHexString());
    grad.addColorStop(0.44, '#' + k.horizon.getHexString());
    grad.addColorStop(0.5, '#' + k.fog.getHexString());
    grad.addColorStop(0.62, '#101216');
    grad.addColorStop(1, '#05060a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    const sunX = 128 + Math.sin(this.hour / 24 * Math.PI * 2) * 100;
    const sunY = 52 - this.sunDir.y * 34;
    if (this.sunDir.y > -0.1) {
      const g = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, 34);
      g.addColorStop(0, '#' + k.sun.getHexString());
      g.addColorStop(0.25, 'rgba(255,220,170,0.75)');
      g.addColorStop(1, 'rgba(255,200,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 128);
    }
    // dim city light glow at night
    if (k.night > 0.4) {
      const g = ctx.createLinearGradient(0, 58, 0, 78);
      g.addColorStop(0, 'rgba(70,60,45,0)');
      g.addColorStop(1, 'rgba(255,150,60,0.12)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 58, 256, 20);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const env = this.pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    if (this.envMap) this.envMap.dispose();
    this.envMap = env;
    this.scene.environment = env;
  }

  update(dt, focus) {
    this.uniforms.time.value += dt;
    if (focus) {
      this.skyMesh.position.set(focus.x, 0, focus.z);
      this.stars.position.set(focus.x, 0, focus.z);
      this.clouds.position.set(focus.x, 0, focus.z);
      this.clouds.children.forEach((c) => {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 1700) c.position.x = -1700;
      });
    }
    this.key.position.set(
      focus.x + this.lightDir.x * 180,
      this.lightDir.y * 200 + 40,
      focus.z + this.lightDir.z * 180,
    );
    this.key.target.position.set(focus.x, 0, focus.z);
    this.key.target.updateMatrixWorld();
  }
}
