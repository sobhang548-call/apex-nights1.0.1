import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/buffergeometryutils.js';
import {
  ROAD_LINES, RING, ROAD_WIDTH, WORLD_BOUNDS, GARAGE, DEALER, LANDMARKS,
} from '../data.js';
import { mulberry32, clamp, lerp, createCanvas } from '../util.js';

const BLOCK_HALF = 68;
const CELL = 60;
const N_BLOCKS = 11;

function facadeCanvas(style, seed) {
  const rnd = mulberry32(seed);
  const { canvas, ctx } = createCanvas(256, 384);
  const { canvas: eCanvas, ctx: ectx } = createCanvas(256, 384);
  ectx.fillStyle = '#000'; ectx.fillRect(0, 0, 256, 384);

  const palettes = {
    glass:   { base: '#121b25', win: '#1d3040', lit: '#cfe7ff', cols: 3, rows: 3, band: true },
    modern:  { base: '#7b8189', win: '#141d27', lit: '#ffd79e', cols: 2, rows: 3, band: false },
    brick:   { base: '#503630', win: '#12181f', lit: '#ffc579', cols: 2, rows: 3, band: false },
    metal:   { base: '#3b4046', win: '#0f151b', lit: '#b9dcff', cols: 4, rows: 2, band: false },
    old:     { base: '#5f5a50', win: '#151a20', lit: '#ffd79e', cols: 2, rows: 3, band: false },
  };
  const p = palettes[style] || palettes.modern;
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, 256, 384);

  // subtle facade grain
  for (let i = 0; i < 1200; i++) {
    const g = Math.floor(rnd() * 30);
    ctx.fillStyle = `rgba(${g},${g},${g},0.06)`;
    ctx.fillRect(rnd() * 256, rnd() * 384, 2, 2);
  }

  // floor separation lines
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 2;
  for (let r = 0; r <= p.rows; r++) {
    const y = (r / p.rows) * 384;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }

  const cols = p.cols, rows = p.rows;
  const cellW = 256 / cols, cellH = 384 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const padX = p.band ? 3 : 9;
      const padY = 9;
      const x = c * cellW + padX;
      const y = r * cellH + padY;
      const w = cellW - padX * 2;
      const h = cellH - padY * 2;

      ctx.fillStyle = p.win;
      ctx.fillRect(x, y, w, h);
      // window reflection gradient
      const grd = ctx.createLinearGradient(x, y, x + w, y + h);
      grd.addColorStop(0, 'rgba(150,190,220,0.20)');
      grd.addColorStop(0.5, 'rgba(60,90,110,0.05)');
      grd.addColorStop(1, 'rgba(10,15,20,0.25)');
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(8,12,16,0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      // random lit windows (baked dim, plus strong for emissive)
      const litRoll = rnd();
      if (litRoll < 0.42) {
        const warm = rnd();
        const litColor = warm < 0.65 ? p.lit : '#a9d6ff';
        ctx.fillStyle = litColor;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.globalAlpha = 1;
        ectx.fillStyle = litColor;
        ectx.globalAlpha = 0.45 + rnd() * 0.55;
        ectx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ectx.globalAlpha = 1;
        // blinds
        if (rnd() < 0.4) {
          ectx.fillStyle = 'rgba(0,0,0,0.45)';
          ectx.fillRect(x + 2, y + 2, w - 4, (h - 4) * 0.4);
        }
      }
    }
  }

  // mullions for glass towers
  if (style === 'glass') {
    ctx.strokeStyle = 'rgba(10,14,20,0.65)';
    ctx.lineWidth = 3;
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * 256;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 384); ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const eTex = new THREE.CanvasTexture(eCanvas);
  eTex.wrapS = eTex.wrapT = THREE.RepeatWrapping;
  eTex.colorSpace = THREE.SRGBColorSpace;
  return { map: tex, emissive: eTex };
}

function asphaltTexture(seed = 7) {
  const { canvas, ctx } = createCanvas(512, 512);
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#24282d';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16000; i++) {
    const v = 20 + Math.floor(rnd() * 45);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 4},${0.25 + rnd() * 0.4})`;
    const s = rnd() < 0.9 ? 1 : 2;
    ctx.fillRect(rnd() * 512, rnd() * 512, s, s);
  }
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(12,14,16,${0.18 + rnd() * 0.2})`;
    ctx.lineWidth = 1 + rnd() * 2;
    ctx.beginPath();
    let x = rnd() * 512, y = rnd() * 512;
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(58, 58);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function concreteTexture(seed = 13) {
  const { canvas, ctx } = createCanvas(256, 256);
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#868b90';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 110 + Math.floor(rnd() * 50);
    ctx.fillStyle = `rgba(${v},${v},${v},0.25)`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  ctx.strokeStyle = 'rgba(40,44,48,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * 256;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function grassTexture(seed = 21) {
  const { canvas, ctx } = createCanvas(256, 256);
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#2c3a28';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const g = 40 + Math.floor(rnd() * 45);
    ctx.fillStyle = `rgba(${Math.floor(g * 0.6)},${g},${Math.floor(g * 0.5)},0.4)`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const { canvas, ctx } = createCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,220,160,0.55)');
  g.addColorStop(0.6, 'rgba(255,180,90,0.14)');
  g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function signTexture(text, sub, color = '#ffb020') {
  const { canvas, ctx } = createCanvas(1024, 160);
  ctx.clearRect(0, 0, 1024, 160);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 32;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 82px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillText(text, 512, sub ? 64 : 82);
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  if (sub) {
    ctx.font = '600 26px Bahnschrift, "Segoe UI", sans-serif';
    ctx.letterSpacing = '8px';
    ctx.fillText(sub, 512, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function billboardTexture() {
  const { canvas, ctx } = createCanvas(512, 256);
  const g = ctx.createLinearGradient(0, 0, 512, 256);
  g.addColorStop(0, '#131a24');
  g.addColorStop(1, '#070a0e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, 484, 228);
  // chevrons
  ctx.fillStyle = 'rgba(255,176,32,0.16)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    const x = 40 + i * 92;
    ctx.moveTo(x, 200); ctx.lineTo(x + 44, 150); ctx.lineTo(x + 88, 200);
    ctx.lineTo(x + 66, 200); ctx.lineTo(x + 44, 174); ctx.lineTo(x + 22, 200);
    ctx.closePath(); ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 74px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillText('APEX', 256, 88);
  ctx.fillStyle = '#ffb020';
  ctx.font = 'italic 900 52px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillText('NIGHTS', 256, 140);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 18px Bahnschrift, "Segoe UI", sans-serif';
  ctx.fillText('THE CITY IS YOUR TRACK', 256, 190);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function scaleBoxUVs(geo, w, h, d, offset = 0) {
  const uv = geo.attributes.uv;
  const faces = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [du, dv] = faces[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * (du / 6) + offset, uv.getY(i) * (dv / 10.8));
    }
  }
  uv.needsUpdate = true;
}

function slabGeometry(w, d, x, y, z, uvScale = 1) {
  const geo = new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (w / 8) * uvScale, uv.getY(i) * (d / 8) * uvScale);
  }
  geo.translate(x, y, z);
  return geo;
}

export class World {
  constructor(scene, renderer, sky, quality = 'medium') {
    this.scene = scene;
    this.renderer = renderer;
    this.sky = sky;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.colliders = [];
    this.hash = new Map();
    this.lampPositions = [];
    this.lampLightIds = [];
    this.night = 0;
    this._lampTimer = 0;
    this._time = 0;
    this.blocks = [];
    this.buildings = [];
    this.landmarkLights = [];
    this.props = [];
  }

  async build(onCityProgress = () => {}) {
    this._initMaterials();
    this._buildGround();
    this._buildMarkings();
    await this._buildCity(onCityProgress);
    this._buildStreetLights();
    this._buildTrafficLights();
    this._buildWaterfront();
    this._buildLandmarks();
    this._buildCityLandmarks();
    this._buildBackdrop();
    this._buildPark();
    this._buildParkingLot();
    this._buildProps();
    this._buildSigns();
    this._buildLampLights();
    this._buildCollisionHash();

    this.dealerTurntable = new THREE.Group();
    this.dealerTurntable.position.set(DEALER.x + 26, 0.12, DEALER.z);
    this.group.add(this.dealerTurntable);
  }

  _initMaterials() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const asphalt = asphaltTexture();
    asphalt.anisotropy = Math.min(8, maxAniso);
    this.asphaltTex = asphalt;
    const concrete = concreteTexture();
    const grass = grassTexture();
    this.grassTex = grass;

    const glow = glowTexture();
    this.glowTex = glow;

    this.mats = {
      asphalt: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.94, metalness: 0.02, color: 0xffffff }),
      concrete: new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9, metalness: 0.02, color: 0xcfd3d7 }),
      concreteDark: new THREE.MeshStandardMaterial({ color: 0x4a4e53, roughness: 0.95 }),
      grass: new THREE.MeshStandardMaterial({ map: grass, roughness: 1, color: 0x8fa383 }),
      white: new THREE.MeshStandardMaterial({ color: 0xd7dadd, roughness: 0.8 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xc9a13c, roughness: 0.8 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x26292d, roughness: 0.95 }),
      metalDark: new THREE.MeshStandardMaterial({ color: 0x24282d, roughness: 0.55, metalness: 0.7 }),
      metalMid: new THREE.MeshStandardMaterial({ color: 0x555b62, roughness: 0.45, metalness: 0.75 }),
      glassTower: new THREE.MeshPhysicalMaterial({
        color: 0x8fb6c9, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.34,
        envMapIntensity: 1.5, side: THREE.DoubleSide,
      }),
      storefront: new THREE.MeshStandardMaterial({
        color: 0x0a0c0e, emissive: 0xffb46a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.4,
      }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x33502f, roughness: 0.9, flatShading: true }),
      water: new THREE.MeshPhysicalMaterial({
        color: 0x1d5560, roughness: 0.06, metalness: 0.25, transparent: true,
        opacity: 0.88, envMapIntensity: 1.8, clearcoat: 1, clearcoatRoughness: 0.02,
      }),
      railing: new THREE.MeshStandardMaterial({ color: 0x8b9299, roughness: 0.4, metalness: 0.8 }),
      lampHead: new THREE.MeshStandardMaterial({ color: 0x1a1a17, emissive: 0xffd9a0, emissiveIntensity: 0 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x5b4433, roughness: 0.9 }),
      containerA: new THREE.MeshStandardMaterial({ color: 0x8a3b2e, roughness: 0.8, metalness: 0.35 }),
      containerB: new THREE.MeshStandardMaterial({ color: 0x2e4a63, roughness: 0.8, metalness: 0.35 }),
      containerC: new THREE.MeshStandardMaterial({ color: 0x6b6b3a, roughness: 0.8, metalness: 0.35 }),
      hill: new THREE.MeshStandardMaterial({ color: 0x242c26, roughness: 1, flatShading: true }),
      mountain: new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 1, flatShading: true }),
      billboard: null,
      sign: null,
      displayGlass: new THREE.MeshPhysicalMaterial({
        color: 0x9fc6d4, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28,
        envMapIntensity: 1.6, side: THREE.DoubleSide,
      }),
      neonCyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x25e0ff).multiplyScalar(2.4), toneMapped: false }),
      neonAmber: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb020).multiplyScalar(2.2), toneMapped: false }),
      neonMagenta: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2fa0).multiplyScalar(2.2), toneMapped: false }),
      neonViolet: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7c6bff).multiplyScalar(2.2), toneMapped: false }),
      tailGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(1.8), toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({
        map: glow, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, color: 0xffc27a, toneMapped: false,
      }),
    };

    this.facadeMats = {};
    for (const style of ['glass', 'modern', 'brick', 'metal', 'old']) {
      const tex = facadeCanvas(style, style.charCodeAt(0) * 97 + 11);
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        emissiveMap: tex.emissive,
        emissive: 0xffe0bb,
        emissiveIntensity: 0,
        roughness: style === 'glass' ? 0.28 : 0.82,
        metalness: style === 'glass' ? 0.55 : 0.06,
        envMapIntensity: style === 'glass' ? 1.3 : 0.4,
      });
      this.facadeMats[style] = mat;
    }

    this.mats.billboard = new THREE.MeshBasicMaterial({ map: billboardTexture(), toneMapped: false });
    this.mats.neonSigns = { garage: null, dealer: null };
  }

  _buildGround() {
    const groundGeo = new THREE.PlaneGeometry(6000, 6000);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
      map: this.grassTex, roughness: 1, color: 0x515d45,
    }));
    ground.position.y = -0.18;
    ground.receiveShadow = true;
    this.group.add(ground);

    const asphaltGeo = new THREE.PlaneGeometry(2200, 2200);
    asphaltGeo.rotateX(-Math.PI / 2);
    const asphalt = new THREE.Mesh(asphaltGeo, this.mats.asphalt);
    asphalt.position.y = 0;
    asphalt.receiveShadow = true;
    this.group.add(asphalt);
    this.asphaltMesh = asphalt;

    // outer ring road surface is part of the asphalt plane; greenbelt strips
    const beltGeo = [];
    for (const s of [-1, 1]) {
      const g1 = new THREE.PlaneGeometry(120, 1960);
      g1.rotateX(-Math.PI / 2);
      g1.translate(s * 940, 0.01, 0);
      beltGeo.push(g1);
      const g2 = new THREE.PlaneGeometry(1960, 120);
      g2.rotateX(-Math.PI / 2);
      g2.translate(0, 0.01, s * 940);
      beltGeo.push(g2);
    }
    // Cut-outs would be ideal; keep it simple by covering only corners.
    const belt = new THREE.Mesh(mergeGeometries(beltGeo.map((g) => {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 16, uv.getY(i) * 16);
      return g;
    }), false), this.mats.grass);
    belt.position.y = 0.005;
    belt.receiveShadow = true;
    // this.group.add(belt);
  }

  _addBatch(batches, key, geo, cast = true, receive = true) {
    let b = batches.get(key);
    if (!b) { b = { geos: [], cast, receive }; batches.set(key, b); }
    b.geos.push(geo);
    return b;
  }

  _flushBatches(batches, opts = {}) {
    const result = [];
    for (const [key, b] of batches) {
      if (!b.geos.length) continue;
      const mat = this.mats[key] || this.facadeMats[key];
      if (!mat) continue;
      let merged;
      try {
        merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      } catch (err) {
        console.warn('merge failed for', key, err);
        continue;
      }
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = b.cast && !opts.noShadow;
      mesh.receiveShadow = b.receive;
      this.group.add(mesh);
      result.push(mesh);
      if (b.geos.length > 1) b.geos.forEach((g) => g.dispose());
    }
    return result;
  }

  _buildMarkings() {
    const batches = new Map();
    const dummy = new THREE.Object3D();
    const dashMats = [];
    const yellow = [];
    const crossMats = [];

    const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 3.4);
    const crossGeo = new THREE.BoxGeometry(0.6, 0.02, 3.2);

    const inCity = (v) => Math.abs(v) <= 880.1;

    for (const line of ROAD_LINES) {
      // vertical roads (x = line), segments between z intersections
      for (let k = 0; k < ROAD_LINES.length - 1; k++) {
        const z0 = ROAD_LINES[k], z1 = ROAD_LINES[k + 1];
        const cz = (z0 + z1) / 2;
        const len = (z1 - z0) - ROAD_WIDTH;
        const yStrip = new THREE.BoxGeometry(0.12, 0.02, len);
        yStrip.translate(line - 0.22, 0.023, cz);
        yellow.push(yStrip);
        const yStrip2 = new THREE.BoxGeometry(0.12, 0.02, len);
        yStrip2.translate(line + 0.22, 0.023, cz);
        yellow.push(yStrip2);

        for (const off of [-5.8, 5.8]) {
          for (let zz = z0 + 20; zz < z1 - 16; zz += 9) {
            dummy.position.set(line + off, 0.022, zz);
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            dashMats.push(dummy.matrix.clone());
          }
        }
      }
      // horizontal roads
      for (let k = 0; k < ROAD_LINES.length - 1; k++) {
        const x0 = ROAD_LINES[k], x1 = ROAD_LINES[k + 1];
        const cx = (x0 + x1) / 2;
        const len = (x1 - x0) - ROAD_WIDTH;
        const yStrip = new THREE.BoxGeometry(len, 0.02, 0.12);
        yStrip.translate(cx, 0.023, line - 0.22);
        yellow.push(yStrip);
        const yStrip2 = new THREE.BoxGeometry(len, 0.02, 0.12);
        yStrip2.translate(cx, 0.023, line + 0.22);
        yellow.push(yStrip2);

        for (const off of [-5.8, 5.8]) {
          for (let xx = x0 + 20; xx < x1 - 16; xx += 9) {
            dummy.position.set(xx, 0.022, line + off);
            dummy.rotation.set(0, Math.PI / 2, 0);
            dummy.updateMatrix();
            dashMats.push(dummy.matrix.clone());
          }
        }
      }
    }

    // Ring road lane dashes
    const ringLaneOffsets = [-8.5, 0, 8.5];
    for (const s of [-1, 1]) {
      for (let a = -ROAD_LINES[ROAD_LINES.length - 1]; a < ROAD_LINES[ROAD_LINES.length - 1]; a += 9) {
        for (const off of ringLaneOffsets) {
          if (off === 0) continue;
          dummy.position.set(a, 0.022, s * RING + off);
          dummy.rotation.set(0, Math.PI / 2, 0);
          dummy.updateMatrix();
          dashMats.push(dummy.matrix.clone());
          dummy.position.set(s * RING + off, 0.022, a);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          dashMats.push(dummy.matrix.clone());
        }
      }
    }

    // Crosswalks
    for (const x of ROAD_LINES) {
      for (const z of ROAD_LINES) {
        for (let s = 0; s < 4; s++) {
          const horiz = s >= 2;
          for (let i = 0; i < 6; i++) {
            const spread = -8.25 + i * 3.3;
            dummy.position.set(0, 0, 0);
            dummy.rotation.set(0, 0, 0);
            if (s === 0) dummy.position.set(x + spread, 0.024, z - 16);
            if (s === 1) dummy.position.set(x + spread, 0.024, z + 16);
            if (s === 2) { dummy.position.set(x - 16, 0.024, z + spread); dummy.rotation.y = Math.PI / 2; }
            if (s === 3) { dummy.position.set(x + 16, 0.024, z + spread); dummy.rotation.y = Math.PI / 2; }
            if (Math.abs(dummy.position.x) > 900 || Math.abs(dummy.position.z) > 900) continue;
            dummy.updateMatrix();
            crossMats.push(dummy.matrix.clone());
          }
        }
      }
    }

    const dashMesh = new THREE.InstancedMesh(dashGeo, this.mats.white, dashMats.length);
    dashMats.forEach((m, i) => dashMesh.setMatrixAt(i, m));
    dashMesh.instanceMatrix.needsUpdate = true;
    dashMesh.receiveShadow = true;
    this.group.add(dashMesh);

    const crossMesh = new THREE.InstancedMesh(crossGeo, this.mats.white, crossMats.length);
    crossMats.forEach((m, i) => crossMesh.setMatrixAt(i, m));
    crossMesh.instanceMatrix.needsUpdate = true;
    crossMesh.receiveShadow = true;
    this.group.add(crossMesh);

    const yMerged = mergeGeometries(yellow, false);
    const yMesh = new THREE.Mesh(yMerged, this.mats.yellow);
    yMesh.receiveShadow = true;
    this.group.add(yMesh);
    yellow.forEach((g) => g.dispose());

    // lane edge lines on ring
    const edgeGeos = [];
    for (const s of [-1, 1]) {
      const g1 = new THREE.BoxGeometry(1960, 0.02, 0.16);
      g1.translate(0, 0.024, s * RING - 15.4); edgeGeos.push(g1);
      const g2 = new THREE.BoxGeometry(1960, 0.02, 0.16);
      g2.translate(0, 0.024, s * RING + 15.4); edgeGeos.push(g2);
      const g3 = new THREE.BoxGeometry(0.16, 0.02, 1960);
      g3.translate(s * RING - 15.4, 0.024, 0); edgeGeos.push(g3);
      const g4 = new THREE.BoxGeometry(0.16, 0.02, 1960);
      g4.translate(s * RING + 15.4, 0.024, 0); edgeGeos.push(g4);
    }
    const edges = new THREE.Mesh(mergeGeometries(edgeGeos, false), this.mats.white);
    edges.receiveShadow = true;
    this.group.add(edges);
  }

  _district(cx, cz) {
    if (Math.abs(cx) <= 330 && Math.abs(cz) <= 330) return 'downtown';
    if (cx < -300 && cz > 300) return 'industrial';
    if (cx > 480) return 'waterfront';
    if (Math.abs(cx) < 650 && Math.abs(cz) < 650) return 'midtown';
    return 'oldtown';
  }

  async _buildCity(onProgress = () => {}) {
    const batches = new Map();
    const colliders = [];
    const rnd = mulberry32(4242);
    this.blocks = [];
    let builtBlocks = 0;

    const addBuilding = (cx, cz, w, d, h, style, opts = {}) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      scaleBoxUVs(geo, w, h, d, rnd());
      geo.translate(cx, h / 2 + 0.05, cz);
      this._addBatch(batches, style, geo);

      const roof = new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5);
      roof.translate(cx, h + 0.3, cz);
      this._addBatch(batches, 'roof', roof, false, true);

      // rooftop units
      if (rnd() < 0.75) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const uw = 2 + rnd() * 5, ud = 2 + rnd() * 4, uh = 0.8 + rnd() * 1.6;
          const ug = new THREE.BoxGeometry(uw, uh, ud);
          ug.translate(cx + (rnd() - 0.5) * (w - 8), h + 0.55 + uh / 2, cz + (rnd() - 0.5) * (d - 8));
          this._addBatch(batches, 'metalMid', ug);
        }
      }
      if (h > 55 && rnd() < 0.55) {
        const ag = new THREE.CylinderGeometry(0.12, 0.2, 6 + rnd() * 14, 5);
        ag.translate(cx + (rnd() - 0.5) * w * 0.4, h + 6, cz + (rnd() - 0.5) * d * 0.4);
        this._addBatch(batches, 'metalDark', ag);
      }
      if (h > 70 && rnd() < 0.5) {
        const beacon = new THREE.SphereGeometry(0.35, 6, 6);
        beacon.translate(cx, h + 0.8, cz);
        this._addBatch(batches, 'tailGlow', beacon, false, false);
      }
      colliders.push({
        minX: cx - w / 2, maxX: cx + w / 2,
        minZ: cz - d / 2, maxZ: cz + d / 2,
        tag: opts.tag || 'building',
      });
      this.buildings.push({ x: cx, z: cz, w, d, h, style });
    };

    for (let i = 0; i < N_BLOCKS; i++) {
      for (let j = 0; j < N_BLOCKS; j++) {
        const cx = -800 + i * 160;
        const cz = -800 + j * 160;
        const isGarage = Math.abs(cx - (-640)) < 1 && Math.abs(cz - 480) < 1;
        const isDealer = Math.abs(cx - 640) < 1 && Math.abs(cz - (-480)) < 1;
        const isPark = Math.abs(cx) < 1 && Math.abs(cz - 160) < 1;
        const isLot = Math.abs(cx - (-480)) < 1 && Math.abs(cz - 480) < 1;
        const landmark = LANDMARKS.find((l) => Math.abs(cx - l.x) < 1 && Math.abs(cz - l.z) < 1);
        this.blocks.push({ x: cx, z: cz, kind: landmark ? landmark.id : isPark ? 'park' : isGarage ? 'garage' : isDealer ? 'dealer' : isLot ? 'lot' : 'city' });
        if (isGarage || isDealer || isPark || isLot || landmark) continue;

        // sidewalk slab
        const walk = slabGeometry(BLOCK_HALF * 2, BLOCK_HALF * 2, cx, 0.05, cz, 1);
        this._addBatch(batches, 'concrete', walk, false, true);

        // curb
        for (const s of [-1, 1]) {
          const c1 = new THREE.BoxGeometry(BLOCK_HALF * 2, 0.1, 0.5);
          c1.translate(cx, 0.06, cz + s * BLOCK_HALF);
          this._addBatch(batches, 'concreteDark', c1, false, true);
          const c2 = new THREE.BoxGeometry(0.5, 0.1, BLOCK_HALF * 2);
          c2.translate(cx + s * BLOCK_HALF, 0.06, cz);
          this._addBatch(batches, 'concreteDark', c2, false, true);
        }

        const district = this._district(cx, cz);
        const sx = BLOCK_HALF * 2 - 28;
        const sz = BLOCK_HALF * 2 - 28;
        const baseX = cx, baseZ = cz;

        if (district === 'downtown') {
          const count = rnd() < 0.5 ? 1 : 2;
          if (count === 1) {
            const w = sx * (0.62 + rnd() * 0.2);
            const d = sz * (0.62 + rnd() * 0.2);
            const h = 50 + Math.pow(rnd(), 1.4) * 105;
            const style = rnd() < 0.65 ? 'glass' : 'modern';
            addBuilding(baseX, baseZ, w, d, h, style);
            if (h > 80 && rnd() < 0.6) {
              addBuilding(baseX, baseZ, w * 0.62, d * 0.62, h * (1.16 + rnd() * 0.22), style);
            }
          } else {
            for (const s of [-1, 1]) {
              const w = sx * 0.42, d = sz * (0.55 + rnd() * 0.25);
              const h = 40 + rnd() * 95;
              addBuilding(baseX + s * sx * 0.24, baseZ + (rnd() - 0.5) * 14, w, d, h, rnd() < 0.6 ? 'glass' : 'modern');
            }
          }
        } else if (district === 'industrial') {
          const count = 2;
          for (let k = 0; k < count; k++) {
            const s = k === 0 ? -1 : 1;
            const w = sx * 0.46, d = sz * (0.6 + rnd() * 0.3);
            const h = 8 + rnd() * 8;
            addBuilding(baseX + s * sx * 0.25, baseZ + (rnd() - 0.5) * 12, w, d, h, rnd() < 0.7 ? 'metal' : 'brick');
          }
        } else if (district === 'waterfront') {
          const n = 2;
          for (let k = 0; k < n; k++) {
            const w = sx * (0.4 + rnd() * 0.12);
            const d = sz * (0.36 + rnd() * 0.2);
            const h = 9 + rnd() * 26;
            const px = baseX + (k === 0 ? -1 : 1) * sx * 0.22;
            const pz = baseZ + (rnd() - 0.5) * sz * 0.3;
            addBuilding(px, pz, w, d, h, rnd() < 0.55 ? 'modern' : 'brick');
          }
        } else if (district === 'midtown') {
          const n = rnd() < 0.6 ? 2 : 3;
          for (let k = 0; k < n; k++) {
            const s = k % 2 === 0 ? -1 : 1;
            const w = sx * (0.36 + rnd() * 0.12);
            const d = sz * (0.34 + rnd() * 0.18);
            const h = 18 + rnd() * 42;
            addBuilding(baseX + s * sx * 0.23, baseZ + (k === 2 ? 0 : (rnd() - 0.5) * sz * 0.42), w, d, h, rnd() < 0.4 ? 'modern' : 'old');
          }
        } else {
          const n = 2 + Math.floor(rnd() * 3);
          for (let k = 0; k < n; k++) {
            const gx = (k % 2 === 0 ? -1 : 1);
            const gz = (k < 2 ? -1 : 1);
            const w = sx * (0.3 + rnd() * 0.12);
            const d = sz * (0.3 + rnd() * 0.12);
            const h = 8 + rnd() * 24;
            addBuilding(baseX + gx * sx * 0.24, baseZ + gz * sz * 0.24, w, d, h, rnd() < 0.5 ? 'brick' : rnd() < 0.5 ? 'old' : 'modern');
          }
        }

        // Storefront glow band on street-facing edge
        if (district !== 'industrial' && rnd() < 0.55) {
          const side = Math.floor(rnd() * 4);
          const y = 2.2;
          let g;
          if (side === 0) { g = new THREE.PlaneGeometry(20 + rnd() * 12, 3.2); g.translate(cx + (rnd() - 0.5) * 30, y, cz - BLOCK_HALF + 9); }
          if (side === 1) { g = new THREE.PlaneGeometry(20 + rnd() * 12, 3.2); g.rotateY(Math.PI); g.translate(cx + (rnd() - 0.5) * 30, y, cz + BLOCK_HALF - 9); }
          if (side === 2) { g = new THREE.PlaneGeometry(20 + rnd() * 12, 3.2); g.rotateY(Math.PI / 2); g.translate(cx - BLOCK_HALF + 9, y, cz + (rnd() - 0.5) * 30); }
          if (side === 3) { g = new THREE.PlaneGeometry(20 + rnd() * 12, 3.2); g.rotateY(-Math.PI / 2); g.translate(cx + BLOCK_HALF - 9, y, cz + (rnd() - 0.5) * 30); }
          if (g) this._addBatch(batches, 'storefront', g, false, false);
        }

        // Neon accents on taller blocks
        if ((district === 'downtown' || district === 'midtown') && rnd() < 0.32) {
          const key = rnd() < 0.5 ? 'neonCyan' : rnd() < 0.5 ? 'neonMagenta' : 'neonAmber';
          const h = 14 + rnd() * 26;
          const g = new THREE.PlaneGeometry(1.2, h);
          const side = Math.floor(rnd() * 4);
          const y = 10 + h / 2 + rnd() * 12;
          if (side === 0) { g.translate(cx, y, cz - BLOCK_HALF + 2); }
          if (side === 1) { g.rotateY(Math.PI); g.translate(cx, y, cz + BLOCK_HALF - 2); }
          if (side === 2) { g.rotateY(Math.PI / 2); g.translate(cx - BLOCK_HALF + 2, y, cz); }
          if (side === 3) { g.rotateY(-Math.PI / 2); g.translate(cx + BLOCK_HALF - 2, y, cz); }
          this._addBatch(batches, key, g, false, false);
        }

        builtBlocks++;
        if (builtBlocks % 4 === 0) {
          onProgress(builtBlocks / (N_BLOCKS * N_BLOCKS));
          await new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (!done) {
                done = true;
                resolve();
              }
            };
            requestAnimationFrame(() => setTimeout(finish, 0));
            setTimeout(finish, 80);
          });
        }
      }
    }

    // a few billboards
    const billboards = [
      { x: -400, y: 28, z: -160, ry: 0 },
      { x: 240, y: 26, z: 400, ry: Math.PI },
      { x: 560, y: 24, z: 0, ry: -Math.PI / 2 },
      { x: -80, y: 30, z: 720, ry: Math.PI / 2 },
      { x: 800, y: 22, z: -240, ry: 0 },
    ];
    for (const b of billboards) {
      const g = new THREE.PlaneGeometry(30, 15);
      g.rotateY(b.ry);
      g.translate(b.x, b.y, b.z);
      this._addBatch(batches, 'billboard', g, false, false);
      for (const s of [-1, 1]) {
        const post = new THREE.BoxGeometry(0.5, 14, 0.5);
        post.translate(b.x + Math.cos(b.ry) * s * 8, b.y - 14, b.z - Math.sin(b.ry) * s * 8);
        this._addBatch(batches, 'metalDark', post);
      }
    }

    onProgress(1);
    this._flushBatches(batches);
    this.colliders.push(...colliders);
  }

  _buildStreetLights() {
    const poleGeo = mergeGeometries([
      (() => { const g = new THREE.CylinderGeometry(0.08, 0.12, 7.4, 6); g.translate(0, 3.7, 0); return g; })(),
      (() => { const g = new THREE.BoxGeometry(2.1, 0.1, 0.1); g.translate(1.0, 7.3, 0); return g; })(),
      (() => { const g = new THREE.BoxGeometry(0.9, 0.14, 0.26); g.translate(1.9, 7.24, 0); return g; })(),
    ], false);
    const headGeo = new THREE.BoxGeometry(0.8, 0.06, 0.2);
    headGeo.translate(1.9, 7.15, 0);

    const matrices = [];
    const dummy = new THREE.Object3D();
    const pushLamp = (x, z, yaw) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
      const hx = x + Math.cos(yaw) * 1.9;
      const hz = z - Math.sin(yaw) * 1.9;
      this.lampPositions.push({ x: hx, z: hz });
    };

    for (const line of ROAD_LINES) {
      for (let z = -850; z <= 850; z += 64) {
        const nearIntersection = ROAD_LINES.some((rz) => Math.abs(rz - z) < 22);
        if (nearIntersection) continue;
        pushLamp(line - 10.8, z, 0);
        pushLamp(line + 10.8, z, Math.PI);
      }
      for (let x = -850; x <= 850; x += 64) {
        const nearIntersection = ROAD_LINES.some((rx) => Math.abs(rx - x) < 22);
        if (nearIntersection) continue;
        pushLamp(x, line - 10.8, Math.PI / 2);
        pushLamp(x, line + 10.8, -Math.PI / 2);
      }
    }
    // ring highway lamps
    for (let a = -960; a <= 960; a += 70) {
      pushLamp(a, RING - 18, Math.PI / 2);
      pushLamp(a, RING + 18, -Math.PI / 2);
      pushLamp(a, -RING - 18, Math.PI / 2);
      pushLamp(a, -RING + 18, -Math.PI / 2);
      pushLamp(RING - 18, a, 0);
      pushLamp(RING + 18, a, Math.PI);
      pushLamp(-RING + 18, a, 0);
      pushLamp(-RING - 18, a, Math.PI);
    }

    const poles = new THREE.InstancedMesh(poleGeo, this.mats.metalDark, matrices.length);
    matrices.forEach((m, i) => poles.setMatrixAt(i, m));
    poles.instanceMatrix.needsUpdate = true;
    poles.castShadow = true;
    poles.receiveShadow = true;
    this.group.add(poles);

    this.lampHeads = new THREE.InstancedMesh(headGeo, this.mats.lampHead, matrices.length);
    matrices.forEach((m, i) => this.lampHeads.setMatrixAt(i, m));
    this.lampHeads.instanceMatrix.needsUpdate = true;
    this.group.add(this.lampHeads);

    // light pools on the ground (additive), only visible at night
    const poolGeo = new THREE.PlaneGeometry(16, 16);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMesh = new THREE.InstancedMesh(poolGeo, this.mats.pool, this.lampPositions.length);
    this.lampPositions.forEach((p, i) => {
      dummy.position.set(p.x, 0.035, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poolMesh.setMatrixAt(i, dummy.matrix);
    });
    poolMesh.instanceMatrix.needsUpdate = true;
    this.group.add(poolMesh);
    this.poolMesh = poolMesh;

    // glowing halos
    const pos = new Float32Array(this.lampPositions.length * 3);
    this.lampPositions.forEach((p, i) => {
      pos[i * 3] = p.x; pos[i * 3 + 1] = 7.05; pos[i * 3 + 2] = p.z;
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lampPoints = new THREE.Points(pg, new THREE.PointsMaterial({
      map: this.glowTex, color: 0xffd2a0, size: 10, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.group.add(this.lampPoints);
  }

  _buildTrafficLights() {
    const batches = new Map();
    const lights = [];
    let idx = 0;
    for (const x of [-560, -240, 80, 400, 720]) {
      for (const z of [-560, -240, 80, 400, 720]) {
        idx++;
        if (idx % 2 !== 0) continue;
        const px = x + 11, pz = z + 11;
        const pole = new THREE.CylinderGeometry(0.09, 0.11, 5.4, 6);
        pole.translate(px, 2.7, pz);
        this._addBatch(batches, 'metalDark', pole);
        const head = new THREE.BoxGeometry(0.35, 1.0, 0.35);
        head.translate(px, 5.2, pz);
        this._addBatch(batches, 'metalDark', head);
        const lamp = new THREE.SphereGeometry(0.11, 6, 6);
        lamp.translate(px, 5.05, pz + 0.18);
        lights.push(lamp);
      }
    }
    this._flushBatches(batches);
    if (lights.length) {
      const m = new THREE.Mesh(mergeGeometries(lights, false), new THREE.MeshBasicMaterial({
        color: new THREE.Color(0x4dffa6).multiplyScalar(2.0), toneMapped: false,
      }));
      this.group.add(m);
      lights.forEach((g) => g.dispose());
    }
  }

  _buildWaterfront() {
    const waterGeo = new THREE.PlaneGeometry(2400, 2800);
    const waterMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        sunDir: { value: new THREE.Vector3(0.5, 0.4, 0.2) },
        sunColor: { value: new THREE.Color('#ffb27a') },
        horizon: { value: new THREE.Color('#9a7a6e') },
        deep: { value: new THREE.Color('#05141d') },
        night: { value: 0.2 },
      },
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
        uniform float time;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform vec3 horizon;
        uniform vec3 deep;
        uniform float night;
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(V, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
          float w1 = sin(vWorld.x * 0.055 + time * 0.9) * 0.5 + 0.5;
          float w2 = cos(vWorld.z * 0.043 - time * 0.7) * 0.5 + 0.5;
          vec3 base = deep + vec3(0.02, 0.06, 0.08) * (w1 * w2);
          vec3 col = mix(base, horizon * (0.55 + night * 0.15), 0.25 + fres * 0.65);
          vec3 R = reflect(-normalize(sunDir), normalize(vec3(w1 - 0.5, 1.0, w2 - 0.5)));
          float spec = pow(max(dot(R, V), 0.0), 90.0);
          col += sunColor * spec * (0.65 - night * 0.45);
          float dist = length(vWorld.xz - cameraPosition.xz);
          col = mix(col, horizon * (0.8 - night * 0.4), smoothstep(300.0, 1600.0, dist) * 0.75);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.waterMat = waterMat;
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(2330, -0.35, 0);
    this.group.add(water);

    // seawall + promenade railing
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 2700), this.mats.concreteDark);
    wall.position.set(1118, 0.3, 0);
    wall.castShadow = true; wall.receiveShadow = true;
    this.group.add(wall);
    this.colliders.push({ minX: 1112, maxX: 1126, minZ: -1350, maxZ: 1350, tag: 'seawall' });

    const walk = new THREE.Mesh(new THREE.BoxGeometry(90, 0.16, 2700), this.mats.concrete);
    walk.position.set(1063, 0.06, 0);
    walk.receiveShadow = true;
    this.group.add(walk);

    const railGeos = [];
    for (const s of [-1, 1]) {
      const rail = new THREE.BoxGeometry(0.12, 0.12, 2680);
      rail.translate(1108, 1.25, 0);
      railGeos.push(rail);
      for (let z = -1320; z <= 1320; z += 18) {
        const post = new THREE.BoxGeometry(0.08, 1.2, 0.08);
        post.translate(1108, 0.7, z);
        railGeos.push(post);
      }
    }
    const rails = new THREE.Mesh(mergeGeometries(railGeos, false), this.mats.railing);
    this.group.add(rails);

    // container stacks along the docks
    const rnd = mulberry32(300);
    const batches = new Map();
    for (let k = 0; k < 26; k++) {
      const x = 1020 + rnd() * 60;
      const z = -1250 + rnd() * 2500;
      if (Math.abs(z) < 120) continue;
      const w = 6, d = 2.5, h = 2.6;
      const geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(x, 1.3, z);
      const key = rnd() < 0.4 ? 'containerA' : rnd() < 0.5 ? 'containerB' : 'containerC';
      this._addBatch(batches, key, geo);
      if (rnd() < 0.35) {
        const g2 = new THREE.BoxGeometry(w, h, d);
        g2.translate(x, 3.9, z);
        this._addBatch(batches, key, g2);
      }
      this.colliders.push({ minX: x - 3, maxX: x + 3, minZ: z - 1.4, maxZ: z + 1.4, tag: 'container' });
    }
    // docks
    for (const z of [-420, 640]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(100, 0.5, 26), this.mats.wood);
      pier.position.set(1170, 0.15, z);
      pier.receiveShadow = true;
      this.group.add(pier);
    }
    this._flushBatches(batches);
  }

  _buildLandmarks() {
    const batches = new Map();
    const add = (key, geo, cast = true, receive = true) => this._addBatch(batches, key, geo, cast, receive);

    // ── APEX GARAGE ─────────────────────────────────────────
    const gx = -640, gz = 480;
    // forecourt
    const fore = new THREE.PlaneGeometry(126, 66);
    fore.rotateX(-Math.PI / 2);
    fore.translate(gx, 0.065, gz - 33);
    add('concrete', fore, false, true);
    // parking bay lines
    for (let i = 0; i < 3; i++) {
      const line = new THREE.BoxGeometry(0.16, 0.02, 26);
      line.translate(gx - 34 + i * 28, 0.08, gz - 52);
      add('yellow', line, false, true);
    }
    // building shell
    const wallH = 11;
    add('metalDark', (() => { const g = new THREE.BoxGeometry(18, wallH, 82); g.translate(gx - 54, wallH / 2, gz + 26); return g; })());
    add('metalDark', (() => { const g = new THREE.BoxGeometry(18, wallH, 82); g.translate(gx + 54, wallH / 2, gz + 26); return g; })());
    add('metalDark', (() => { const g = new THREE.BoxGeometry(126, wallH, 16); g.translate(gx, wallH / 2, gz + 60); return g; })());
    add('metalDark', (() => { const g = new THREE.BoxGeometry(36, wallH, 16); g.translate(gx - 45, wallH / 2, gz - 6); return g; })());
    add('metalDark', (() => { const g = new THREE.BoxGeometry(36, wallH, 16); g.translate(gx + 45, wallH / 2, gz - 6); return g; })());
    add('metalDark', (() => { const g = new THREE.BoxGeometry(126, 4.2, 16); g.translate(gx, wallH - 2.1, gz - 6); return g; })());
    // roof
    add('roof', (() => { const g = new THREE.BoxGeometry(128, 0.8, 84); g.translate(gx, wallH + 0.2, gz + 27); return g; })());
    // interior floor + ceiling lights
    const floor = new THREE.PlaneGeometry(108, 68);
    floor.rotateX(-Math.PI / 2);
    floor.translate(gx, 0.09, gz + 26);
    add('concreteDark', floor, false, true);
    for (let i = 0; i < 4; i++) {
      const strip = new THREE.BoxGeometry(60, 0.12, 1.2);
      strip.translate(gx, 9.8, gz + 12 + i * 14);
      add('lampHead', strip, false, false);
    }
    // lift platform
    add('metalMid', (() => { const g = new THREE.BoxGeometry(18, 0.4, 10); g.translate(gx + 22, 0.35, gz + 26); return g; })());
    add('metalMid', (() => { const g = new THREE.BoxGeometry(1.2, 4.6, 1.2); g.translate(gx + 14, 2.4, gz + 26); return g; })());
    add('metalMid', (() => { const g = new THREE.BoxGeometry(1.2, 4.6, 1.2); g.translate(gx + 30, 2.4, gz + 26); return g; })());
    // workbench
    add('wood', (() => { const g = new THREE.BoxGeometry(26, 1.2, 3); g.translate(gx - 28, 0.7, gz + 52); return g; })());
    add('metalDark', (() => { const g = new THREE.BoxGeometry(22, 2.2, 2); g.translate(gx - 28, 2.3, gz + 53); return g; })());
    this._flushBatches(batches);

    const gLowSign = new THREE.Mesh(new THREE.PlaneGeometry(44, 6.8), new THREE.MeshBasicMaterial({
      map: signTexture('APEX GARAGE', 'PERFORMANCE · TUNING · DETAILING', '#ffb020'),
      transparent: true, toneMapped: false, depthWrite: false,
    }));
    gLowSign.position.set(gx, 8.3, gz - 14.4);
    gLowSign.rotation.y = Math.PI;
    this.group.add(gLowSign);

    const neonStrip = new THREE.Mesh(
      new THREE.BoxGeometry(104, 0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb020).multiplyScalar(2.4), toneMapped: false }),
    );
    neonStrip.position.set(gx, wallH + 0.7, gz - 14.1);
    this.group.add(neonStrip);
    const neonStrip2 = neonStrip.clone();
    neonStrip2.position.set(gx - 62.6, wallH * 0.5, gz - 13.8);
    neonStrip2.rotation.z = Math.PI / 2;
    neonStrip2.scale.set(1, 1, 1);
    this.group.add(neonStrip2);

    const garageLight = new THREE.PointLight(0xffc27a, 26, 70, 1.6);
    garageLight.position.set(gx, 8, gz + 26);
    this.group.add(garageLight);
    const foreLight = new THREE.PointLight(0xffd9a8, 18, 55, 1.8);
    foreLight.position.set(gx, 7.2, gz - 44);
    this.group.add(foreLight);

    this.colliders.push(
      { minX: gx - 63, maxX: gx - 45, minZ: gz - 15, maxZ: gz + 67, tag: 'garage' },
      { minX: gx + 45, maxX: gx + 63, minZ: gz - 15, maxZ: gz + 67, tag: 'garage' },
      { minX: gx - 63, maxX: gx + 63, minZ: gz + 52, maxZ: gz + 68, tag: 'garage' },
      { minX: gx - 63, maxX: gx - 27, minZ: gz - 14, maxZ: gz + 2, tag: 'garage' },
      { minX: gx + 27, maxX: gx + 63, minZ: gz - 14, maxZ: gz + 2, tag: 'garage' },
      { minX: gx - 38, maxX: gx - 18, minZ: gz + 50, maxZ: gz + 55, tag: 'garage' },
      { minX: gx + 12, maxX: gx + 32, minZ: gz + 19, maxZ: gz + 33, tag: 'lift' },
    );
    this._mapFootprint(gx, gz + 27, 126, 84, 11, 'metal');

    // ── APEX MOTORS ────────────────────────────────────────
    const dx = 640, dz = -480;
    const dealerBatches = new Map();
    const add2 = (key, geo, cast = true, receive = true) => this._addBatch(dealerBatches, key, geo, cast, receive);
    const showFloor = new THREE.PlaneGeometry(110, 64);
    showFloor.rotateX(-Math.PI / 2);
    showFloor.translate(dx - 8, 0.07, dz);
    add2('concrete', showFloor, false, true);
    // platform
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.3, 40), this.mats.concreteDark);
    platform.position.set(DEALER.x + 26, 0.2, DEALER.z);
    platform.receiveShadow = true;
    this.group.add(platform);
    const platformRing = new THREE.Mesh(new THREE.TorusGeometry(9.6, 0.09, 6, 60), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x25e0ff).multiplyScalar(2.2), toneMapped: false,
    }));
    platformRing.rotation.x = Math.PI / 2;
    platformRing.position.set(DEALER.x + 26, 0.38, DEALER.z);
    this.group.add(platformRing);

    // glass showroom
    const bw = 84, bd = 92, bh = 13;
    add2('metalDark', (() => { const g = new THREE.BoxGeometry(bw, 0.9, bd); g.translate(dx + 30, 12.6, dz); return g; })());
    for (const s of [-1, 1]) {
      add2('metalDark', (() => { const g = new THREE.BoxGeometry(0.9, bh, bd); g.translate(dx + 30 + s * bw / 2, bh / 2, dz); return g; })());
      add2('metalDark', (() => { const g = new THREE.BoxGeometry(bw, bh, 0.9); g.translate(dx + 30, bh / 2, dz + s * bd / 2); return g; })());
    }
    const glassWest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, bd - 10), this.mats.displayGlass);
    glassWest.position.set(dx - 12, 5.4, dz);
    this.group.add(glassWest);
    const glassN = new THREE.Mesh(new THREE.BoxGeometry(bw - 10, 10, 0.3), this.mats.displayGlass);
    glassN.position.set(dx + 30, 5.4, dz - bd / 2 + 5);
    this.group.add(glassN);
    const glassS = glassN.clone();
    glassS.position.z = dz + bd / 2 - 5;
    this.group.add(glassS);
    const dealerCeil = new THREE.Mesh(new THREE.BoxGeometry(bw - 12, 0.1, bd - 12), this.mats.lampHead);
    dealerCeil.position.set(dx + 30, 11.9, dz);
    this.group.add(dealerCeil);
    this._flushBatches(dealerBatches);

    const dSign = new THREE.Mesh(new THREE.PlaneGeometry(44, 6.8), new THREE.MeshBasicMaterial({
      map: signTexture('APEX MOTORS', 'FINE PERFORMANCE AUTOMOBILES', '#25e0ff'),
      transparent: true, toneMapped: false, depthWrite: false,
    }));
    dSign.position.set(dx - 12.6, 9.2, dz);
    dSign.rotation.y = -Math.PI / 2;
    this.group.add(dSign);
    const dNeon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, bd - 8), new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x25e0ff).multiplyScalar(2.4), toneMapped: false,
    }));
    dNeon.position.set(dx - 12.4, 12.9, dz);
    this.group.add(dNeon);

    const dealerLight = new THREE.PointLight(0xbfe9ff, 24, 80, 1.5);
    dealerLight.position.set(dx + 30, 9, dz);
    this.group.add(dealerLight);

    this.colliders.push(
      { minX: dx - 15, maxX: dx + 75, minZ: dz - 46, maxZ: dz + 46, tag: 'dealer' },
    );
    this._mapFootprint(dx + 30, dz, 84, 92, 13, 'glass');
  }

  _makeSign(text, sub, color, x, y, z, ry, w = 44, h = 6.9) {
    const mat = new THREE.MeshBasicMaterial({
      map: signTexture(text, sub, color),
      transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this.group.add(mesh);
    return mesh;
  }

  _buildCityLandmarks() {
    this._buildAirport();
    this._buildBusTerminal();
    this._buildMarket();
    this._buildTower();
    this._buildMall();
    this._buildSubwayStations();
    this._buildAirfields();
  }

  _mapFootprint(x, z, w, d, h = 10, style = 'modern') {
    this.buildings.push({ x, z, w, d, h, style, poi: true });
  }

  _buildAirport() {
    const cx = 640, cz = 640;
    const b = new Map();
    const add = (k, g, c = true, r = true) => this._addBatch(b, k, g, c, r);
    const box = (w, h, d, x, y, z, k) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); add(k, g); };

    const apron = new THREE.PlaneGeometry(132, 132);
    apron.rotateX(-Math.PI / 2);
    apron.translate(cx, 0.062, cz);
    add('asphalt', apron, false, true);

    const runway = new THREE.PlaneGeometry(30, 124);
    runway.rotateX(-Math.PI / 2);
    runway.translate(cx + 26, 0.078, cz + 4);
    add('concreteDark', runway, false, true);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BoxGeometry(0.5, 0.02, 6);
      g.translate(cx + 26, 0.092, cz - 50 + i * 12);
      add('white', g, false, true);
    }
    for (let i = -2; i <= 2; i++) {
      const g = new THREE.BoxGeometry(6, 0.02, 0.4);
      g.translate(cx + 26 + i * 6.4, 0.092, cz + 62);
      add('white', g, false, true);
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 15; i++) {
        const g = new THREE.BoxGeometry(0.35, 0.12, 0.35);
        g.translate(cx + 26 + s * 14.4, 0.1, cz - 54 + i * 8);
        add('lampHead', g, false, false);
      }
    }

    // terminal
    box(30, 11, 84, cx - 44, 5.5, cz + 6, 'metalDark');
    box(32, 0.8, 86, cx - 44, 11.4, cz + 6, 'roof');
    for (let i = 0; i < 4; i++) {
      box(8, 3, 2, cx - 42, 12.4, cz - 26 + i * 20, 'metalMid');
    }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7.6, 76), this.mats.displayGlass);
    glass.position.set(cx - 28.7, 4.5, cz + 6);
    this.group.add(glass);
    for (let i = 0; i < 7; i++) {
      box(0.6, 8, 0.25, cx - 28.6, 4.4, cz - 31 + i * 12, 'metalMid');
    }
    box(16, 3, 4.4, cx - 21, 6.4, cz - 12, 'metalMid');
    this._makeSign('APEX CITY AIRPORT', 'TERMINAL 1 · ALL FLIGHTS', '#7cd6ff', cx - 28.2, 13.9, cz + 6, Math.PI / 2, 46, 7.2);

    // control tower
    const shaft = new THREE.CylinderGeometry(2.9, 3.7, 30, 10);
    shaft.translate(cx - 58, 15, cz + 46);
    add('concrete', shaft);
    const cab = new THREE.CylinderGeometry(5.4, 4.6, 4.4, 12);
    cab.translate(cx - 58, 32.2, cz + 46);
    add('glassTower', cab);
    const cabRoof = new THREE.CylinderGeometry(6, 6, 0.7, 12);
    cabRoof.translate(cx - 58, 34.8, cz + 46);
    add('metalDark', cabRoof);
    const beacon = new THREE.SphereGeometry(0.55, 6, 6);
    beacon.translate(cx - 58, 35.7, cz + 46);
    add('tailGlow', beacon, false, false);

    // hangar
    box(30, 9, 22, cx + 40, 4.5, cz - 40, 'metal');
    box(32, 0.8, 24, cx + 40, 9.4, cz - 40, 'roof');
    box(0.4, 7, 16, cx + 25.2, 3.6, cz - 40, 'metalDark');

    // parked airliner
    const px = cx + 26, pz = cz + 22;
    const fus = new THREE.CylinderGeometry(2.3, 2.3, 30, 12);
    fus.rotateX(Math.PI / 2);
    fus.translate(px, 5.2, pz);
    add('white', fus);
    const nose = new THREE.ConeGeometry(2.3, 3.4, 12);
    nose.rotateX(Math.PI / 2);
    nose.translate(px, 5.2, pz + 16.7);
    add('white', nose);
    const tailCone = new THREE.ConeGeometry(2.3, 4, 12);
    tailCone.rotateX(-Math.PI / 2);
    tailCone.translate(px, 5.7, pz - 17);
    add('white', tailCone);
    for (const s of [-1, 1]) {
      const strip = new THREE.BoxGeometry(0.18, 0.55, 23);
      strip.translate(px + s * 2.25, 6.1, pz);
      add('metalDark', strip);
      const stripe = new THREE.BoxGeometry(0.1, 0.3, 26);
      stripe.translate(px + s * 2.32, 4.9, pz);
      add('neonCyan', stripe, false, false);
    }
    box(34, 0.35, 5.6, px, 5, pz + 1, 'white');
    box(12, 0.25, 3, px, 5.9, pz - 13.5, 'white');
    box(0.35, 5, 5, px, 7.7, pz - 13.6, 'white');
    for (const s of [-1, 1]) {
      const eng = new THREE.CylinderGeometry(1.0, 1.0, 4.2, 10);
      eng.rotateX(Math.PI / 2);
      eng.translate(px + s * 6.5, 4.3, pz + 2);
      add('metalDark', eng);
    }

    this._flushBatches(b);

    const blueLight = new THREE.PointLight(0x9fdcff, 0, 90, 1.6);
    blueLight.position.set(cx - 30, 10, cz);
    this.group.add(blueLight);
    this.landmarkLights.push({ light: blueLight, base: 26 });

    this.colliders.push(
      { minX: cx - 59, maxX: cx - 29, minZ: cz - 36, maxZ: cz + 48, tag: 'airport' },
      { minX: cx - 62, maxX: cx - 54, minZ: cz + 42, maxZ: cz + 50, tag: 'airport' },
      { minX: cx + 24, maxX: cx + 56, minZ: cz - 52, maxZ: cz - 28, tag: 'airport' },
      { minX: px - 16, maxX: px + 16, minZ: pz - 14, maxZ: pz + 14, tag: 'aircraft' },
    );
    this._mapFootprint(cx - 44, cz + 6, 30, 84, 11, 'metal');
    this._mapFootprint(cx + 40, cz - 40, 30, 22, 9, 'metal');
    this._mapFootprint(cx - 58, cz + 46, 7, 7, 35, 'modern');
  }

  _buildBusTerminal() {
    const cx = -480, cz = -480;
    const b = new Map();
    const add = (k, g, c = true, r = true) => this._addBatch(b, k, g, c, r);
    const box = (w, h, d, x, y, z, k) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); add(k, g); };

    const apron = new THREE.PlaneGeometry(132, 132);
    apron.rotateX(-Math.PI / 2);
    apron.translate(cx, 0.06, cz);
    add('concrete', apron, false, true);
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BoxGeometry(0.14, 0.02, 22);
      g.translate(cx - 44 + i * 22, 0.082, cz - 2);
      add('white', g, false, true);
    }

    box(96, 10, 26, cx, 5, cz - 44, 'metalDark');
    box(98, 0.8, 28, cx, 10.4, cz - 44, 'roof');
    const glass = new THREE.Mesh(new THREE.BoxGeometry(88, 7, 0.4), this.mats.displayGlass);
    glass.position.set(cx, 4.4, cz - 30.7);
    this.group.add(glass);
    box(104, 0.55, 18, cx, 8.2, cz - 22, 'roof');
    for (let i = 0; i < 6; i++) {
      box(0.7, 8.2, 0.7, cx - 45 + i * 18, 4.1, cz - 14, 'metalMid');
    }
    this._makeSign('APEX CENTRAL', 'BUS TERMINAL · BAYS 1-12', '#ffb020', cx, 11.8, cz - 30.4, 0, 44, 6.9);

    // parked buses
    for (let i = 0; i < 3; i++) {
      const bx = cx - 34 + i * 34;
      const bz = cz - 20;
      box(11, 2.9, 2.7, bx, 1.95, bz, 'white');
      box(11.2, 0.18, 2.8, bx, 3.45, bz, 'metalDark');
      box(9.6, 1.15, 2.78, bx, 2.5, bz, 'metalDark');
      box(0.25, 1.0, 2.4, bx + 5.4, 2.2, bz, 'storefront');
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const wheel = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 10);
          wheel.rotateX(Math.PI / 2);
          wheel.translate(bx + sx * 3.4, 0.52, bz + sz * 1.28);
          add('metalDark', wheel);
        }
      }
    }

    this._flushBatches(b);

    const busLight = new THREE.PointLight(0xffd9a0, 0, 80, 1.7);
    busLight.position.set(cx, 8, cz - 22);
    this.group.add(busLight);
    this.landmarkLights.push({ light: busLight, base: 22 });

    this.colliders.push(
      { minX: cx - 48, maxX: cx + 48, minZ: cz - 58, maxZ: cz - 30, tag: 'bus-terminal' },
      { minX: cx - 40, maxX: cx - 28, minZ: cz - 22, maxZ: cz - 18, tag: 'bus' },
      { minX: cx - 6, maxX: cx + 6, minZ: cz - 22, maxZ: cz - 18, tag: 'bus' },
      { minX: cx + 28, maxX: cx + 40, minZ: cz - 22, maxZ: cz - 18, tag: 'bus' },
    );
    this._mapFootprint(cx, cz - 44, 100, 30, 10, 'metal');
  }

  _buildMarket() {
    const cx = -160, cz = 480;
    const b = new Map();
    const add = (k, g, c = true, r = true) => this._addBatch(b, k, g, c, r);
    const box = (w, h, d, x, y, z, k) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); add(k, g); };

    const lot = new THREE.PlaneGeometry(132, 132);
    lot.rotateX(-Math.PI / 2);
    lot.translate(cx, 0.058, cz);
    add('asphalt', lot, false, true);

    box(104, 9, 56, cx, 4.5, cz - 22, 'modern');
    box(106, 0.8, 58, cx, 9.4, cz - 22, 'roof');
    for (let i = 0; i < 5; i++) {
      box(4 + (i % 2), 1.2, 3, cx - 40 + i * 20, 10.4, cz - 38 + (i % 2) * 10, 'metalMid');
    }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(96, 6.6, 0.4), this.mats.displayGlass);
    glass.position.set(cx, 3.9, cz + 6.2);
    this.group.add(glass);
    box(100, 0.5, 5, cx, 6.9, cz + 9, 'metalDark');
    this._makeSign('FRESHMART 24', 'OPEN ALL NIGHT · GROCERIES', '#5fe08a', cx, 10.9, cz + 9.2, 0, 46, 7.2);
    // doors
    box(10, 4.4, 0.5, cx, 2.2, cz + 6.4, 'metalDark');
    // parking stalls
    for (let i = 0; i < 8; i++) {
      const g = new THREE.BoxGeometry(0.15, 0.02, 11);
      g.translate(cx - 52 + i * 14, 0.082, cz + 38);
      add('white', g, false, true);
    }
    this._flushBatches(b);

    const marketLight = new THREE.PointLight(0xa8ffc8, 0, 75, 1.7);
    marketLight.position.set(cx, 8, cz + 10);
    this.group.add(marketLight);
    this.landmarkLights.push({ light: marketLight, base: 22 });

    this.colliders.push({ minX: cx - 52, maxX: cx + 52, minZ: cz - 50, maxZ: cz + 8, tag: 'market' });
    this._mapFootprint(cx, cz - 22, 104, 56, 9, 'modern');
  }

  _buildTower() {
    const cx = 160, cz = 0;
    const b = new Map();
    const add = (k, g, c = true, r = true) => this._addBatch(b, k, g, c, r);
    const box = (w, h, d, x, y, z, k) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); add(k, g); };

    const plaza = new THREE.PlaneGeometry(132, 132);
    plaza.rotateX(-Math.PI / 2);
    plaza.translate(cx, 0.058, cz);
    add('concrete', plaza, false, true);

    box(64, 14, 64, cx, 7, cz, 'modern');
    box(66, 0.7, 66, cx, 14.4, cz, 'roof');
    const lobby = new THREE.Mesh(new THREE.BoxGeometry(48, 7, 48), this.mats.displayGlass);
    lobby.position.set(cx, 7, cz);
    this.group.add(lobby);
    box(24, 0.5, 8, cx, 6.4, cz + 34, 'metalDark');
    box(0.4, 6, 0.4, cx - 10, 3, cz + 37, 'metalMid');
    box(0.4, 6, 0.4, cx + 10, 3, cz + 37, 'metalMid');

    box(38, 120, 38, cx, 74, cz, 'glass');
    box(30, 60, 30, cx, 164, cz, 'glass');
    box(22, 50, 22, cx, 219, cz, 'glass');
    box(14, 16, 14, cx, 252, cz, 'glass');
    box(40, 0.6, 40, cx, 134.4, cz, 'roof');
    box(32, 0.6, 32, cx, 194.4, cz, 'roof');
    box(24, 0.6, 24, cx, 244.4, cz, 'roof');
    box(16, 0.6, 16, cx, 260.4, cz, 'roof');
    const spire = new THREE.CylinderGeometry(0.4, 1.2, 42, 8);
    spire.translate(cx, 281, cz);
    add('metalMid', spire);
    const beacon = new THREE.SphereGeometry(0.7, 6, 6);
    beacon.translate(cx, 302.5, cz);
    add('tailGlow', beacon, false, false);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        box(0.7, 208, 0.7, cx + sx * 19.2, 114, cz + sz * 19.2, 'neonCyan');
      }
    }
    for (const [w, y] of [[30, 134], [22, 194], [14, 244]]) {
      box(w, 0.5, 0.5, cx, y, cz + w / 2, 'neonCyan');
      box(w, 0.5, 0.5, cx, y, cz - w / 2, 'neonCyan');
    }

    this._makeSign('APEX TOWER', 'OBSERVATION DECK · LEVEL 60', '#25e0ff', cx, 10.4, cz + 32.6, 0, 46, 7.2);
    this._flushBatches(b);

    const towerLight = new THREE.PointLight(0x9fe9ff, 0, 95, 1.6);
    towerLight.position.set(cx, 16, cz + 26);
    this.group.add(towerLight);
    this.landmarkLights.push({ light: towerLight, base: 28 });

    this.colliders.push({ minX: cx - 32, maxX: cx + 32, minZ: cz - 32, maxZ: cz + 32, tag: 'tower' });
    this._mapFootprint(cx, cz, 64, 64, 14, 'modern');
  }

  _buildMall() {
    const cx = 486, cz = 160;
    const b = new Map();
    const add = (k, g, c = true, r = true) => this._addBatch(b, k, g, c, r);
    const box = (w, h, d, x, y, z, k) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); add(k, g); };

    const plaza = new THREE.PlaneGeometry(132, 132);
    plaza.rotateX(-Math.PI / 2);
    plaza.translate(cx - 6, 0.058, cz);
    add('concrete', plaza, false, true);

    box(100, 13, 70, cx, 6.5, cz, 'modern');
    box(102, 0.8, 72, cx, 13.3, cz, 'roof');

    const vault = new THREE.CylinderGeometry(18, 18, 62, 20, 1, true, Math.PI, Math.PI);
    vault.rotateX(Math.PI / 2);
    vault.translate(cx, 13, cz);
    add('glassTower', vault);
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.TorusGeometry(18.2, 0.22, 5, 20, Math.PI);
      rib.translate(cx, 13, cz - 28 + i * 14);
      add('metalDark', rib, true, false);
    }
    for (let i = 0; i < 4; i++) {
      box(72, 3.4, 8, cx, 3.2, cz - 26 + i * 18, 'concreteDark');
    }
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 26), this.mats.displayGlass);
    entrance.position.set(cx - 50.2, 4.5, cz);
    this.group.add(entrance);
    box(10, 0.5, 28, cx - 56, 8.2, cz, 'metalDark');
    this._makeSign('APEX GALERIA', 'SHOPPING · DINING · CINEMA', '#ff5d9e', cx - 50.4, 11.6, cz, -Math.PI / 2, 48, 7.4);
    for (const s of [-1, 1]) {
      const strip = new THREE.BoxGeometry(0.5, 0.5, 70);
      strip.translate(cx + s * 50.6, 13.7, cz);
      add('neonMagenta', strip, false, false);
    }
    this._flushBatches(b);

    const mallLight = new THREE.PointLight(0xffb0d8, 0, 85, 1.6);
    mallLight.position.set(cx - 46, 9, cz);
    this.group.add(mallLight);
    this.landmarkLights.push({ light: mallLight, base: 24 });

    this.colliders.push({ minX: cx - 50, maxX: cx + 50, minZ: cz - 35, maxZ: cz + 35, tag: 'mall' });
    this._mapFootprint(cx, cz, 100, 70, 13, 'modern');
  }

  _buildSubwayStations() {
    const yawById = { 'subway-central': 0, 'subway-north': 0, 'subway-coast': -Math.PI / 2 };
    for (const lm of LANDMARKS) {
      if (!lm.id.startsWith('subway')) continue;
      this._buildSubwayStation(lm.x, lm.z, lm.name, lm.sub, lm.color, yawById[lm.id] || 0);
    }
  }

  _buildSubwayStation(cx, cz, name, sub, color, yaw = 0) {
    const b = new Map();
    const add = (k, g, c = true, r = true) => this._addBatch(b, k, g, c, r);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toWorld = (x, z) => ({ x: cx + x * cos - z * sin, z: cz + x * sin + z * cos });
    const box = (w, h, d, x, y, z, k) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (yaw) g.rotateY(yaw);
      const p = toWorld(x, z);
      g.translate(p.x, y, p.z);
      add(k, g);
    };
    const aabb = (x0, x1, z0, z1, tag) => {
      const pts = [toWorld(x0, z0), toWorld(x1, z0), toWorld(x0, z1), toWorld(x1, z1)];
      this.colliders.push({
        minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
        minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)), tag,
      });
    };

    const plaza = new THREE.PlaneGeometry(132, 132);
    plaza.rotateX(-Math.PI / 2);
    plaza.translate(cx, 0.058, cz);
    add('concrete', plaza, false, true);
    box(3.2, 0.02, 34, 0, 0.076, 26, 'yellow');

    // stairwell descending below street level
    const hole = new THREE.PlaneGeometry(17, 10);
    hole.rotateX(-Math.PI / 2);
    hole.rotateY(yaw);
    const holePos = toWorld(0, -2.5);
    hole.translate(holePos.x, 0.079, holePos.z);
    add('concreteDark', hole, false, true);
    for (let i = 0; i < 7; i++) {
      const top = 0.98 - i * 0.13;
      box(16.2, top + 0.06, 1.14, 0, (top + 0.06) / 2, 2.2 - i * 1.14, 'concrete');
    }
    for (const s of [-1, 1]) {
      box(1.2, 1.25, 13.6, s * 9.4, 0.63, -1.7, 'concreteDark');
      box(0.1, 0.08, 13.6, s * 9.4, 1.32, -1.7, 'metalMid');
    }
    box(20, 3, 0.9, 0, 1.5, -9.4, 'metalDark');

    // canopy
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) box(0.65, 5.6, 0.65, sx * 16, 2.8, sz * 11, 'metalMid');
    }
    box(36, 0.55, 26, 0, 5.9, 0, 'roof');
    for (let i = 0; i < 5; i++) box(0.4, 0.28, 26, -14 + i * 7, 5.6, 0, 'metalDark');
    const skylight = new THREE.Mesh(new THREE.BoxGeometry(10, 0.12, 20), this.mats.displayGlass);
    const skyPos = toWorld(0, 0);
    skylight.position.set(skyPos.x, 5.6, skyPos.z);
    skylight.rotation.y = yaw;
    this.group.add(skylight);
    box(36, 2.8, 0.6, 0, 5.0, 12.7, 'metalDark');
    const signPos = toWorld(0, 13.05);
    this._makeSign(name, sub, color, signPos.x, 5.0, signPos.z, -yaw, 18, 2.8);

    // transit roundel pylon
    box(0.8, 8.4, 0.8, -20, 4.2, 12, 'metalDark');
    const roundelMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.45), toneMapped: false,
    });
    const ringPos = toWorld(-20, 12.5);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.3, 8, 26), roundelMat);
    ring.position.set(ringPos.x, 8.6, ringPos.z);
    ring.rotation.y = yaw;
    this.group.add(ring);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3, 0.58, 0.2), roundelMat);
    bar.position.set(ringPos.x, 8.6, ringPos.z);
    bar.rotation.y = yaw;
    this.group.add(bar);

    // vents and benches
    box(7, 1.1, 4.5, 21, 0.6, -13, 'metalMid');
    box(7, 1.1, 4.5, -23, 0.6, -13, 'metalMid');
    for (const s of [-1, 1]) {
      box(5.2, 0.18, 1.4, 22, 0.66, 2, 'wood');
      box(0.3, 0.65, 1.2, 22 + s * 1.9, 0.33, 2, 'metalDark');
    }

    this._flushBatches(b);

    const light = new THREE.PointLight(new THREE.Color(color).getHex(), 0, 58, 1.8);
    const lp = toWorld(0, 6);
    light.position.set(lp.x, 4.9, lp.z);
    this.group.add(light);
    this.landmarkLights.push({ light, base: 17 });

    aabb(-10, 10, -10, 2.9, 'subway');
    aabb(-20.6, -19.4, 11.4, 12.6, 'subway');
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) aabb(sx * 16 - 0.5, sx * 16 + 0.5, sz * 11 - 0.5, sz * 11 + 0.5, 'subway');
    }

    const swap = Math.abs(sin) > 0.5;
    const fp = toWorld(0, 0);
    this.buildings.push({
      x: fp.x, z: fp.z, w: swap ? 26 : 36, d: swap ? 36 : 26, h: 6.5, style: 'modern', poi: true,
    });
  }

  _buildAirfields() {
    const yawById = { 'airfield-north': 0, 'airfield-south': Math.PI / 2 };
    for (const lm of LANDMARKS) {
      if (!lm.id.startsWith('airfield')) continue;
      this._buildAirfield(lm.x, lm.z, lm.name, lm.sub, yawById[lm.id] || 0);
    }
  }

  _buildAirfield(cx, cz, name, sub, yaw = 0) {
    const b = new Map();
    const add = (k, g, c = true, r = true) => this._addBatch(b, k, g, c, r);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toWorld = (x, z) => ({ x: cx + x * cos - z * sin, z: cz + x * sin + z * cos });
    const box = (w, h, d, x, y, z, k) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (yaw) g.rotateY(yaw);
      const p = toWorld(x, z);
      g.translate(p.x, y, p.z);
      add(k, g);
    };
    const slab = (w, d, x, z, y, k) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      if (yaw) g.rotateY(yaw);
      const p = toWorld(x, z);
      g.translate(p.x, y, p.z);
      add(k, g, false, true);
    };
    const aabb = (x0, x1, z0, z1, tag) => {
      const pts = [toWorld(x0, z0), toWorld(x1, z0), toWorld(x0, z1), toWorld(x1, z1)];
      this.colliders.push({
        minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
        minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)), tag,
      });
    };

    slab(132, 132, 0, 0, 0.061, 'asphalt');
    slab(26, 128, 42, 0, 0.079, 'concreteDark');
    slab(14, 100, 22, 0, 0.075, 'concreteDark');

    for (let i = 0; i < 9; i++) box(0.6, 0.02, 5.4, 42, 0.092, -52 + i * 13, 'white');
    for (const s of [-1, 1]) {
      for (let i = -2; i <= 2; i++) box(2.8, 0.02, 0.55, 42 + i * 4.4, 0.092, s * 60, 'white');
      for (let i = 0; i < 16; i++) box(0.35, 0.16, 0.35, 42 + s * 13.5, 0.1, -60 + i * 8, 'lampHead');
    }
    // taxiway centreline and apron stands
    box(0.5, 0.02, 96, 22, 0.09, 0, 'yellow');
    box(14, 0.02, 0.5, 22, 0.09, -48, 'yellow');
    box(14, 0.02, 0.5, 22, 0.09, 48, 'yellow');
    for (let i = 0; i < 3; i++) {
      const sx = -22 - i * 10;
      box(0.45, 0.02, 16, sx, 0.09, 20, 'yellow');
      box(6, 0.02, 0.45, sx + 3, 0.09, 12, 'yellow');
    }

    // terminal
    box(28, 9.5, 40, -44, 4.75, 24, 'concrete');
    box(30, 0.8, 42, -44, 9.9, 24, 'roof');
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.6, 32), this.mats.displayGlass);
    const gp = toWorld(-29.8, 24);
    glass.position.set(gp.x, 4.1, gp.z);
    glass.rotation.y = yaw;
    this.group.add(glass);
    box(14, 0.5, 24, -22, 6.6, 24, 'metalMid');
    for (const sz of [-1, 1]) {
      box(0.5, 6.2, 0.5, -16, 3.1, 24 + sz * 12, 'metalMid');
      box(0.5, 6.2, 0.5, -28, 3.1, 24 + sz * 12, 'metalMid');
    }
    const signPos = toWorld(-29.6, 24);
    this._makeSign(name, sub, '#7cd6ff', signPos.x, 8.2, signPos.z, yaw + Math.PI / 2, 30, 4.6);

    // control tower
    for (const [r0, r1, h, y, k] of [[2.8, 3.5, 24, 12, 'concrete'], [4.8, 4.2, 4.2, 26.1, 'glassTower'], [5.4, 5.4, 0.6, 28.4, 'metalDark']]) {
      const g = new THREE.CylinderGeometry(r0, r1, h, 12);
      const p = toWorld(-54, -20);
      g.translate(p.x, y, p.z);
      add(k, g);
    }
    {
      const p = toWorld(-54, -20);
      const beacon = new THREE.SphereGeometry(0.5, 6, 6);
      beacon.translate(p.x, 29.2, p.z);
      add('tailGlow', beacon, false, false);
    }

    // hangar
    box(32, 8.5, 24, -40, 4.25, -36, 'metal');
    box(34, 0.8, 26, -40, 9.0, -36, 'metalMid');
    box(0.4, 7.2, 18, -23.8, 3.6, -36, 'metalDark');

    // parked business jet
    const place = (g) => {
      if (yaw) g.rotateY(-yaw);
      g.translate(cx, 0, cz);
      return g;
    };
    const jet = new THREE.CylinderGeometry(1.5, 1.5, 14, 14);
    jet.rotateX(Math.PI / 2);
    jet.translate(12, 3.5, -22);
    add('white', place(jet));
    const nose = new THREE.ConeGeometry(1.5, 2.8, 14);
    nose.rotateX(Math.PI / 2);
    nose.translate(12, 3.5, -13.4);
    add('white', place(nose));
    const tail = new THREE.ConeGeometry(1.5, 3, 14);
    tail.rotateX(-Math.PI / 2);
    tail.translate(12, 3.9, -30.2);
    add('white', place(tail));
    add('white', place(new THREE.BoxGeometry(18, 0.35, 3.2).translate(12, 3.5, -22)));
    add('white', place(new THREE.BoxGeometry(0.32, 4.4, 4).translate(12, 5.9, -29.4)));
    add('white', place(new THREE.BoxGeometry(7, 0.26, 2.2).translate(12, 4.3, -29.6)));
    add('white', place(new THREE.BoxGeometry(2.6, 0.18, 0.6).translate(12, 6.1, -31.4)));
    for (const s of [-1, 1]) {
      add('neonCyan', place(new THREE.BoxGeometry(0.1, 0.3, 10).translate(12 + s * 1.53, 3.7, -22)));
      add('metalDark', place(new THREE.BoxGeometry(0.26, 0.26, 3.4).translate(12 + s * 5.4, 3.2, -30)));
      const eng = new THREE.CylinderGeometry(0.85, 0.85, 4.2, 10);
      eng.rotateX(Math.PI / 2);
      eng.translate(12 + s * 5.4, 2.5, -18);
      add('metalDark', place(eng));
    }
    // boarding stair cart next to the jet
    add('metalMid', place(new THREE.BoxGeometry(1.6, 0.3, 1.6).translate(8.6, 0.7, -16.4)));
    add('metalDark', place(new THREE.BoxGeometry(0.16, 1.6, 0.16).translate(8.6, 0.35, -16.4)));

    // windsock
    const pole = new THREE.CylinderGeometry(0.1, 0.14, 5, 6);
    const wp = toWorld(24, 58);
    pole.translate(wp.x, 2.5, wp.z);
    add('metalMid', pole);
    const sock = new THREE.ConeGeometry(1.05, 3.4, 8);
    sock.rotateZ(-Math.PI / 2);
    sock.rotateY(yaw);
    const wsp = toWorld(26.6, 58);
    sock.translate(wsp.x, 5, wsp.z);
    add('yellow', sock);

    // fuel tanks
    for (const dz of [-3.4, 3.4]) {
      const tank = new THREE.CylinderGeometry(2, 2, 4.6, 12);
      const p = toWorld(-50, -50 + dz);
      tank.translate(p.x, 2.3, p.z);
      add('metalMid', tank);
    }

    this._flushBatches(b);

    const light = new THREE.PointLight(0x9fdcff, 0, 85, 1.6);
    const lp = toWorld(-26, 24);
    light.position.set(lp.x, 11, lp.z);
    this.group.add(light);
    this.landmarkLights.push({ light, base: 20 });

    aabb(-58, -30, 4, 44, 'airfield');
    aabb(-56, -24, -48, -24, 'airfield');
    aabb(-58, -50, -24, -16, 'airfield');
    aabb(1, 23, -31, -13, 'aircraft');
    aabb(-53, -47, -55, -45, 'fuel');

    const swap = Math.abs(sin) > 0.5;
    const fp = (w, d, x, z, h) => {
      const p = toWorld(x, z);
      this.buildings.push({ x: p.x, z: p.z, w: swap ? d : w, d: swap ? w : d, h, style: 'modern', poi: true });
    };
    fp(28, 40, -44, 24, 9.5);
    fp(32, 24, -40, -36, 8.5);
    fp(7, 7, -54, -20, 30);
  }

  _buildProps() {
    const rnd = mulberry32(777);
    this.props = [];
    const add = (type, x, z, yaw = rnd() * Math.PI * 2) => this.props.push({ type, x, z, yaw });

    // garage forecourt
    for (let i = 0; i < 5; i++) add('cone', -672 + i * 8, 414, 0);
    for (let i = 0; i < 4; i++) add('cone', -620 + i * 8, 452, 0);
    add('barrel', -600, 420, 0);
    add('bin', -586, 432, 0.6);
    add('crate', -590, 424, 0.3);

    // dealer forecourt
    for (let i = 0; i < 5; i++) add('cone', 598, -516 + i * 8, 0);
    add('board', 612, -514, 0.2);
    add('bin', 604, -538, 0);
    add('tire', 622, -520, 0.4);

    // sidewalk clutter around city blocks
    const clutter = [
      [-320, 160], [160, 320], [400, -160], [-560, -240], [240, -560],
      [-240, 640], [560, 400], [-400, -720], [720, -240], [-160, -320],
    ];
    for (const [bx, bz] of clutter) {
      const side = (rnd() * 4) | 0;
      const t = (rnd() - 0.5) * 70;
      const off = 61 + rnd() * 4;
      let x = bx;
      let z = bz;
      if (side === 0) { x = bx + off; z = bz + t; }
      else if (side === 1) { x = bx - off; z = bz + t; }
      else if (side === 2) { x = bx + t; z = bz + off; }
      else { x = bx + t; z = bz - off; }
      add(rnd() < 0.55 ? 'bin' : 'board', x, z);
      if (rnd() < 0.65) add('crate', x + (rnd() - 0.5) * 5, z + (rnd() - 0.5) * 5);
      if (rnd() < 0.4) add('tire', x + (rnd() - 0.5) * 6, z + (rnd() - 0.5) * 6);
    }

    // roadworks lane taper
    for (let i = 0; i < 8; i++) add('cone', -69.5, 46 + i * 10, 0);
    add('barrier', -69.5, 128, Math.PI / 2);
    add('barrier', -69.5, 140, Math.PI / 2);
    add('barrel', -69.5, 154, 0);
    add('barrel', -72.5, 154, 0);

    for (let i = 0; i < 8; i++) add('cone', 546 + i * 9, -311.5, 0);
    add('barrier', 520, -311.5, 0);
    add('barrier', 532, -311.5, 0);

    // dockside freight
    for (let i = 0; i < 5; i++) add('crate', 1002 + (rnd() - 0.5) * 6, -160 + i * 26, rnd());
    for (let i = 0; i < 4; i++) add('pallet', 1012, -140 + i * 30, rnd());
    for (let i = 0; i < 4; i++) add('barrel', 1088 + (rnd() - 0.5) * 4, -90 + i * 34);
    for (let i = 0; i < 3; i++) add('bin', 1008, 40 + i * 22);

    // park
    add('bin', 58, 168);
    add('bin', -58, 152);
    add('board', 40, 218, 0.7);

    // airport apron
    for (let i = 0; i < 4; i++) add('cone', 620, 560 + i * 8, 0);
    for (let i = 0; i < 3; i++) add('pallet', 596, 588 + i * 7, 0);
    add('barrel', 606, 598);
    add('crate', 590, 584, 0.4);

    // bus terminal plaza
    for (let i = 0; i < 4; i++) add('cone', -452 + i * 6, -430, 0);
    add('bin', -420, -446);
    add('board', -404, -452, 0.5);

    // supermarket + mall plazas
    add('crate', -170, 500, 0.2);
    add('crate', -164, 504, 0.8);
    add('bin', -150, 494);
    for (let i = 0; i < 4; i++) add('cone', 418, 196 + i * 7, 0);
    add('board', 424, 220, 0.4);
    add('bin', 430, 222);
  }

  _buildBackdrop() {
    const rnd = mulberry32(555);
    const mountains = [];
    const hills = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.1;
      const r = 2100 + rnd() * 700;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (x > 1200) continue;
      const h = 220 + rnd() * 520;
      const g = new THREE.ConeGeometry(500 + rnd() * 420, h, 6);
      g.translate(x, h / 2 - 40, z);
      g.rotateY(rnd() * Math.PI);
      mountains.push(g);
    }
    const mMesh = new THREE.Mesh(mergeGeometries(mountains, false), this.mats.mountain);
    this.group.add(mMesh);

    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 1250 + rnd() * 500;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (x > 1100) continue;
      const h = 20 + rnd() * 70;
      const g = new THREE.ConeGeometry(90 + rnd() * 150, h, 7);
      g.translate(x, h / 2 - 8, z);
      hills.push(g);
    }
    const hMesh = new THREE.Mesh(mergeGeometries(hills, false), this.mats.hill);
    hMesh.receiveShadow = true;
    this.group.add(hMesh);
  }

  _buildPark() {
    const cx = 0, cz = 160;
    const batches = new Map();
    const grass = slabGeometry(126, 126, cx, 0.055, cz, 1);
    this._addBatch(batches, 'grass', grass, false, true);
    const path1 = new THREE.PlaneGeometry(10, 126);
    path1.rotateX(-Math.PI / 2);
    path1.translate(cx, 0.09, cz);
    this._addBatch(batches, 'concrete', path1, false, true);
    const path2 = new THREE.PlaneGeometry(126, 10);
    path2.rotateX(-Math.PI / 2);
    path2.translate(cx, 0.09, cz);
    this._addBatch(batches, 'concrete', path2, false, true);

    // fountain
    const basin = new THREE.CylinderGeometry(10, 10.6, 1.1, 28);
    basin.translate(cx, 0.55, cz);
    this._addBatch(batches, 'concrete', basin, true, true);
    const water = new THREE.CylinderGeometry(9.2, 9.2, 0.06, 28);
    water.translate(cx, 1.02, cz);
    this._addBatch(batches, 'water', water, false, false);
    const fountainCore = new THREE.CylinderGeometry(1.2, 1.8, 3.2, 12);
    fountainCore.translate(cx, 2.5, cz);
    this._addBatch(batches, 'concrete', fountainCore, true, true);
    // benches
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const b = new THREE.BoxGeometry(5, 0.5, 1.4);
        b.translate(cx + s * 30, 1.0, cz + t * 14);
        this._addBatch(batches, 'wood', b);
      }
    }
    this._flushBatches(batches);
    this.colliders.push({ minX: cx - 11, maxX: cx + 11, minZ: cz - 11, maxZ: cz + 11, tag: 'fountain' });

    // trees in park
    this._addTrees(24, () => ({
      x: cx + (Math.random() - 0.5) * 104,
      z: cz + (Math.random() - 0.5) * 104,
    }), 1.1);
  }

  _buildParkingLot() {
    const cx = -480, cz = 480;
    const batches = new Map();
    const g = new THREE.PlaneGeometry(126, 126);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0.055, cz);
    this._addBatch(batches, 'asphalt', g, false, true);
    for (let i = 0; i < 7; i++) {
      for (const s of [-1, 1]) {
        const line = new THREE.BoxGeometry(0.15, 0.02, 16);
        line.translate(cx - 48 + i * 16, 0.08, cz + s * 46);
        this._addBatch(batches, 'white', line, false, true);
      }
    }
    this._flushBatches(batches);
    this._addTrees(8, () => ({
      x: cx + (Math.random() - 0.5) * 120,
      z: cz + (Math.random() - 0.5) * 120,
    }), 0.9);
  }

  _addTrees(count, posFn, scale = 1) {
    const rnd = mulberry32(9001);
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 2.4, 5);
    trunkGeo.translate(0, 1.2, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1.7, 0);
    leafGeo.translate(0, 3.1, 0);

    const trunks = new THREE.InstancedMesh(trunkGeo, this.mats.trunk, count);
    const leaves = new THREE.InstancedMesh(leafGeo, this.mats.leaf, count);
    leaves.castShadow = true;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = posFn(i);
      const s = scale * (0.8 + rnd() * 0.6);
      dummy.position.set(p.x, 0.05, p.z);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.26 + rnd() * 0.08, 0.3 + rnd() * 0.25, 0.20 + rnd() * 0.12);
      leaves.setColorAt(i, color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.group.add(trunks);
    this.group.add(leaves);

    // street trees along some sidewalks
    const streetCount = 180;
    const sTrunks = new THREE.InstancedMesh(trunkGeo, this.mats.trunk, streetCount);
    const sLeaves = new THREE.InstancedMesh(leafGeo, this.mats.leaf, streetCount);
    sLeaves.castShadow = true;
    let placed = 0;
    const rr = mulberry32(4242);
    for (let attempt = 0; attempt < 700 && placed < streetCount; attempt++) {
      const horiz = rr() < 0.5;
      const line = ROAD_LINES[Math.floor(rr() * ROAD_LINES.length)];
      const along = (rr() * 2 - 1) * 830;
      const side = rr() < 0.5 ? -1 : 1;
      const x = horiz ? along : line + side * 13.4;
      const z = horiz ? line + side * 13.4 : along;
      if (Math.abs(x) > 840 || Math.abs(z) > 840) continue;
      if (Math.abs(x + 640) < 70 && Math.abs(z - 480) < 90) continue;
      if (Math.abs(x - 600) < 70 && Math.abs(z + 480) < 80) continue;
      const s = 0.7 + rr() * 0.5;
      dummy.position.set(x, 0.05, z);
      dummy.rotation.set(0, rr() * Math.PI * 2, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      sTrunks.setMatrixAt(placed, dummy.matrix);
      sLeaves.setMatrixAt(placed, dummy.matrix);
      color.setHSL(0.25 + rr() * 0.08, 0.28 + rr() * 0.2, 0.18 + rr() * 0.1);
      sLeaves.setColorAt(placed, color);
      placed++;
    }
    sTrunks.count = placed;
    sLeaves.count = placed;
    sTrunks.instanceMatrix.needsUpdate = true;
    sLeaves.instanceMatrix.needsUpdate = true;
    if (sLeaves.instanceColor) sLeaves.instanceColor.needsUpdate = true;
    this.group.add(sTrunks);
    this.group.add(sLeaves);
  }

  _buildSigns() {
    // Freeway-style entrance signs on the ring
    const signTex = signTexture('APEX CITY', 'EXIT 12', '#25e0ff');
    const mat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    for (const [x, z, ry] of [[0, -1010, 0], [1010, 0, Math.PI / 2], [-1010, 0, -Math.PI / 2]]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(34, 5.3), mat);
      s.position.set(x, 8.5, z);
      s.rotation.y = ry;
      this.group.add(s);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 8, 6), this.mats.metalDark);
      post.position.set(x + 14, 4, z);
      this.group.add(post);
    }
  }

  _buildLampLights() {
    this.lampLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 34, 1.8);
      l.castShadow = false;
      this.group.add(l);
      this.lampLights.push(l);
    }
  }

  _buildCollisionHash() {
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
      const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const key = ix + ',' + iz;
          let arr = this.hash.get(key);
          if (!arr) { arr = []; this.hash.set(key, arr); }
          arr.push(c);
        }
      }
    }
  }

  addCollider(c) {
    this.colliders.push(c);
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = ix + ',' + iz;
        let arr = this.hash.get(key);
        if (!arr) { arr = []; this.hash.set(key, arr); }
        arr.push(c);
      }
    }
  }

  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) this.colliders.splice(i, 1);
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.hash.get(ix + ',' + iz);
        if (!arr) continue;
        const k = arr.indexOf(c);
        if (k >= 0) arr.splice(k, 1);
      }
    }
  }

  surfaceAt(x, z) {
    // forecourts
    if (x > -706 && x < -574 && z > 410 && z < 465) return { type: 'paved', grip: 0.97 };
    if (x > 582 && x < 706 && z > -540 && z < -420) return { type: 'paved', grip: 0.97 };
    if (x > 0 && z > 0) { /* noop */ }

    // parking lot block
    if (Math.abs(x + 480) < 64 && Math.abs(z - 480) < 64) return { type: 'paved', grip: 0.96 };
    // park
    if (Math.abs(x) < 64 && Math.abs(z - 160) < 64) return { type: 'grass', grip: 0.7 };

    // ring road
    if ((Math.abs(Math.abs(z) - RING) < 17 && Math.abs(x) < 1017) ||
        (Math.abs(Math.abs(x) - RING) < 17 && Math.abs(z) < 1017)) {
      return { type: 'road', grip: 1 };
    }
    if (Math.abs(x) > 1017 || Math.abs(z) > 1017) {
      return { type: 'asphalt', grip: 0.92 };
    }
    // grid roads
    for (const line of ROAD_LINES) {
      if (Math.abs(x - line) < 12.6 || Math.abs(z - line) < 12.6) {
        return { type: 'road', grip: 1 };
      }
    }
    return { type: 'sidewalk', grip: 0.84 };
  }

  findNearestRoad(x, z) {
    let best = null, bestD = Infinity;
    const clampCity = (v) => clamp(v, -880, 880);
    for (const lx of ROAD_LINES) {
      const d = Math.abs(x - lx);
      if (d < bestD) { bestD = d; best = { x: lx, z: clampCity(z), yaw: 0 }; }
    }
    for (const lz of ROAD_LINES) {
      const d = Math.abs(z - lz);
      if (d < bestD) { bestD = d; best = { x: clampCity(x), z: lz, yaw: Math.PI / 2 }; }
    }
    // ring
    if (Math.abs(x - RING) < bestD) { bestD = Math.abs(x - RING); best = { x: RING, z: clamp(z, -980, 980), yaw: 0 }; }
    if (Math.abs(x + RING) < bestD) { bestD = Math.abs(x + RING); best = { x: -RING, z: clamp(z, -980, 980), yaw: 0 }; }
    if (Math.abs(z - RING) < bestD) { bestD = Math.abs(z - RING); best = { x: clamp(x, -980, 980), z: RING, yaw: Math.PI / 2 }; }
    if (Math.abs(z + RING) < bestD) { bestD = Math.abs(z + RING); best = { x: clamp(x, -980, 980), z: -RING, yaw: Math.PI / 2 }; }
    return best;
  }

  collideCircle(pos, radius, vel = null) {
    let impact = 0;
    const seen = new Set();
    const ix0 = Math.floor((pos.x - radius) / CELL);
    const ix1 = Math.floor((pos.x + radius) / CELL);
    const iz0 = Math.floor((pos.z - radius) / CELL);
    const iz1 = Math.floor((pos.z + radius) / CELL);
    let nx = 0, nz = 0;

    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const arr = this.hash.get(ix + ',' + iz);
        if (!arr) continue;
        for (const c of arr) {
          if (seen.has(c)) continue;
          seen.add(c);
          const cx = clamp(pos.x, c.minX, c.maxX);
          const cz = clamp(pos.z, c.minZ, c.maxZ);
          let dx = pos.x - cx, dz = pos.z - cz;
          let d2 = dx * dx + dz * dz;
          if (d2 > radius * radius) continue;
          let d = Math.sqrt(d2);
          if (d < 0.0001) {
            // center inside box: push toward nearest face
            const dl = pos.x - c.minX, dr = c.maxX - pos.x;
            const du = pos.z - c.minZ, dd = c.maxZ - pos.z;
            const m = Math.min(dl, dr, du, dd);
            if (m === dl) { dx = -1; dz = 0; d = 0; }
            else if (m === dr) { dx = 1; dz = 0; d = 0; }
            else if (m === du) { dx = 0; dz = -1; d = 0; }
            else { dx = 0; dz = 1; d = 0; }
          } else {
            dx /= d; dz /= d;
          }
          const pen = radius - d;
          pos.x += dx * pen;
          pos.z += dz * pen;
          if (vel) {
            const vn = vel.x * dx + vel.z * dz;
            if (vn < 0) {
              impact = Math.max(impact, -vn);
              vel.x -= vn * dx * 1.25;
              vel.z -= vn * dz * 1.25;
            }
          }
          nx += dx; nz += dz;
        }
      }
    }

    // seawall + bounds
    pos.x = clamp(pos.x, -WORLD_BOUNDS + 6, 1106);
    pos.z = clamp(pos.z, -WORLD_BOUNDS + 6, WORLD_BOUNDS - 6);
    if (vel) {
      if (pos.x > 1105.5) vel.x = Math.min(vel.x, 0);
      if (pos.x < -WORLD_BOUNDS + 6.5) vel.x = Math.max(vel.x, 0);
      if (pos.z < -WORLD_BOUNDS + 6.5) vel.z = Math.max(vel.z, 0);
      if (pos.z > WORLD_BOUNDS - 6.5) vel.z = Math.min(vel.z, 0);
    }
    if (impact > 0) {
      const l = Math.hypot(nx, nz) || 1;
      return { impact, nx: nx / l, nz: nz / l };
    }
    return null;
  }

  update(dt, focus, sky) {
    this._time += dt;
    const night = sky.night;
    this.night = night;

    for (const style of Object.keys(this.facadeMats)) {
      this.facadeMats[style].emissiveIntensity = night * 1.15;
    }
    this.mats.storefront.emissiveIntensity = night * 1.5;
    this.mats.lampHead.emissiveIntensity = 0.15 + night * 5.0;
    this.mats.pool.opacity = clamp(night * 0.55, 0, 0.55);
    this.lampPoints.material.opacity = clamp(night * 0.9, 0, 0.9);
    this.mats.billboard.color.setScalar(1 - night * 0.35);

    // damp night asphalt: sharper reflections of lamps and neon
    this.mats.asphalt.roughness = 0.94 - night * 0.2;
    this.mats.asphalt.metalness = 0.02 + night * 0.14;
    this.mats.concrete.roughness = 0.9 - night * 0.08;
    for (const entry of this.landmarkLights) {
      entry.light.intensity = entry.base * clamp(night * 1.15, 0, 1);
    }

    this.waterMat.uniforms.time.value = this._time;
    this.waterMat.uniforms.night.value = night;
    this.waterMat.uniforms.sunDir.value.copy(sky.sunDir);
    this.waterMat.uniforms.sunColor.value.copy(sky.uniforms.sunColor.value);
    this.waterMat.uniforms.horizon.value.copy(sky.uniforms.horizonColor.value);

    this.dealerTurntable.rotation.y += dt * 0.22;

    this._lampTimer -= dt;
    if (this._lampTimer <= 0) {
      this._lampTimer = 0.35;
      if (night > 0.2 && focus) {
        // nearest four lamps
        const near = [];
        for (const p of this.lampPositions) {
          const dx = p.x - focus.x, dz = p.z - focus.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 60 * 60) near.push({ d2, p });
        }
        near.sort((a, b) => a.d2 - b.d2);
        for (let i = 0; i < this.lampLights.length; i++) {
          const l = this.lampLights[i];
          const n = near[i];
          if (n) {
            l.position.set(n.p.x, 7, n.p.z);
            l.intensity = 26 * night;
          } else {
            l.intensity = 0;
          }
        }
      } else {
        for (const l of this.lampLights) l.intensity = 0;
      }
    }
  }
}
