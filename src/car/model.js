import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RIMS, SPOILERS, NEONS } from '../data.js';
import { createCanvas } from '../util.js';

let _blobTex = null;
function contactShadowTexture() {
  if (_blobTex) return _blobTex;
  const { canvas, ctx } = createCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.34)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _blobTex = new THREE.CanvasTexture(canvas);
  return _blobTex;
}

function paintMaterial(color, finish) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    metalness: finish === 'matte' ? 0.3 : finish === 'gloss' ? 0.45 : 0.6,
    roughness: finish === 'matte' ? 0.6 : finish === 'gloss' ? 0.16 : 0.28,
    clearcoat: finish === 'matte' ? 0.12 : 1.0,
    clearcoatRoughness: finish === 'matte' ? 0.6 : 0.055,
    envMapIntensity: 1.15,
  });
  return m;
}

function wheelRimGeometry(style, rimR) {
  const spokes = [];
  const count = style === 'multi' ? 8 : style === 'mesh' ? 5 : style === 'deep' ? 5 : 5;
  const depth = style === 'deep' ? 0.2 : 0.13;
  const barrel = new THREE.CylinderGeometry(rimR * 0.96, rimR * 0.96, depth, 24, 1, true);
  barrel.rotateX(Math.PI / 2);
  spokes.push(barrel);

  const lip = new THREE.TorusGeometry(rimR * 0.98, 0.028, 6, 24);
  lip.translate(0, 0, depth * 0.4);
  spokes.push(lip);

  for (let i = 0; i < count; i++) {
    const g = new THREE.BoxGeometry(
      style === 'mesh' ? 0.045 : style === 'multi' ? 0.028 : 0.062,
      rimR * 1.82,
      style === 'mesh' ? 0.05 : 0.07,
    );
    g.translate(0, 0, depth * 0.25);
    g.rotateZ((i / count) * Math.PI);
    spokes.push(g);
  }
  const hub = new THREE.CylinderGeometry(rimR * 0.24, rimR * 0.26, 0.09, 14);
  hub.rotateX(Math.PI / 2);
  hub.translate(0, 0, depth * 0.45);
  spokes.push(hub);

  return mergeGeometries(spokes, false);
}

function bodyShape(s) {
  const L = s.length;
  const half = L / 2;
  const wb = s.wheelbase;
  const wr = s.wheelR;
  const archR = s.arch || wr + 0.085;
  const wheelY = wr + 0.005;
  const bottom = 0.30;
  const belt = s.belt;
  const shape = new THREE.Shape();
  const rearX = -wb / 2;
  const frontX = wb / 2;

  shape.moveTo(-half + 0.07, bottom);
  shape.lineTo(rearX - archR, bottom);
  shape.lineTo(rearX - archR, wheelY);
  shape.absarc(rearX, wheelY, archR, Math.PI, 0, true);
  shape.lineTo(frontX - archR, bottom);
  shape.lineTo(frontX - archR, wheelY);
  shape.absarc(frontX, wheelY, archR, Math.PI, 0, true);
  shape.lineTo(half - 0.05, bottom);

  // nose + hood
  shape.lineTo(half, 0.56);
  shape.lineTo(half - 0.015, belt - 0.24);
  shape.quadraticCurveTo(half - 0.12, belt - 0.10, half * 0.62, belt - 0.035);
  shape.lineTo(half * 0.18, belt);
  shape.lineTo(-half * 0.06, belt);

  // rear deck
  if (s.type === 'super' || s.type === 'hyper') {
    shape.quadraticCurveTo(-half * 0.6, belt - 0.02, -half + 0.2, belt - 0.015);
    shape.lineTo(-half + 0.02, belt - 0.14);
  } else {
    shape.quadraticCurveTo(-half * 0.62, belt - 0.02, -half + 0.18, belt - 0.045);
    shape.lineTo(-half + 0.015, belt - 0.17);
  }
  shape.lineTo(-half + 0.02, bottom + 0.16);
  shape.closePath();
  return shape;
}

function cabinShape(s) {
  const [fb, fr, rr, rb] = s.cabin;
  const belt = s.belt + 0.015;
  const roof = s.roof;
  const shape = new THREE.Shape();
  shape.moveTo(fb, belt);
  shape.quadraticCurveTo(fr + 0.07, roof - 0.045, fr, roof - 0.025);
  shape.lineTo(rr, roof - 0.025);
  shape.quadraticCurveTo(rr - 0.06, roof - 0.03, rb, belt);
  shape.closePath();
  return shape;
}

export function buildCarModel(def, cosmetic = {}, opts = {}) {
  const s = def.shape;
  const simple = !!opts.simple;
  const finish = cosmetic.finish || 'metallic';
  const paintColor = cosmetic.paint || def.color;
  const L = s.length, W = s.width, H = s.height;
  const wb = s.wheelbase;
  const wheelR = s.wheelR;
  const half = L / 2;
  const rideHeight = cosmetic.rideHeight || 0;
  const sig = def.brand === 'BAVARIS' ? 'bmw'
    : def.brand === 'STUTTGAR' ? 'merc'
      : def.brand === 'VOLTA' ? 'ev'
        : def.brand === 'DETROIT' ? 'muscle'
          : def.brand === 'AERO' ? 'hyper'
            : def.brand === 'SAKURA' ? 'jdm' : 'italia';

  const paint = paintMaterial(paintColor, finish);
  const trim = new THREE.MeshStandardMaterial({ color: 0x0b0d0f, metalness: 0.5, roughness: 0.5 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.55, roughness: 0.35 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc7ced6, metalness: 1, roughness: 0.16 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x070c12, metalness: 0.2, roughness: 0.06, transparent: true, opacity: 0.82,
    envMapIntensity: 1.1, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide,
  });
  const head = new THREE.MeshStandardMaterial({
    color: 0xdfeaff, emissive: 0xd6ecff, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.3,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: 0x2a0406, emissive: 0xff1a22, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.2,
  });
  const signal = new THREE.MeshStandardMaterial({
    color: 0x3a1c02, emissive: 0xff8a1a, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2,
  });
  const rimData = RIMS.find((r) => r.id === (cosmetic.rimStyle || 'sport')) || RIMS[0];
  const rim = new THREE.MeshStandardMaterial({
    color: cosmetic.rimColor || rimData.color, metalness: 1, roughness: 0.24, envMapIntensity: 1.4,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.94, metalness: 0.02 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.8, roughness: 0.4 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xb0281c, metalness: 0.4, roughness: 0.4 });
  const interior = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.85 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, roughness: 0.5, metalness: 0.2 });

  const materials = { paint, trim, carbon, chrome, glass, head, tail, signal, rim, tire: tireMat, brake: brakeMat, caliper: caliperMat, interior };

  const batches = new Map();
  const add = (key, geo) => {
    let arr = batches.get(key);
    if (!arr) { arr = []; batches.set(key, arr); }
    arr.push(geo);
  };

  // ── main body ──────────────────────────────────────────────
  const shape = bodyShape(s);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: W - 0.06, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035,
    bevelSegments: 3, curveSegments: 14, steps: 1,
  });
  bodyGeo.translate(0, 0, -(W - 0.06) / 2);
  // Taper the flanks and ends and crown the upper surfaces so the body reads
  // as pressed sheet metal instead of a flat slab.
  {
    const pos = bodyGeo.attributes.position;
    const halfZ = (W - 0.06) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const yN = Math.min(1, Math.max(0, (y - 0.30) / (s.belt - 0.30)));
      const shoulder = 1 - 0.115 * Math.pow(yN, 2.6);
      const xN = Math.min(1, Math.abs(x) / (L / 2));
      const endTaper = 1 - 0.10 * Math.pow(xN, 3.4);
      const zN = Math.min(1, Math.abs(z) / halfZ);
      const topW = Math.min(1, Math.max(0, (y - (s.belt - 0.5)) / 0.5));
      const crown = 0.032 * topW * (1 - zN * zN);
      pos.setY(i, y + crown);
      pos.setZ(i, z * shoulder * endTaper);
    }
    pos.needsUpdate = true;
    bodyGeo.computeVertexNormals();
  }
  add('paint', bodyGeo);

  // fender lips
  const archR = s.arch || wheelR + 0.085;
  for (const x of [-wb / 2, wb / 2]) {
    for (const side of [-1, 1]) {
      const lip = new THREE.TorusGeometry(archR + 0.006, 0.038, 5, 14, Math.PI);
      lip.translate(x, wheelR + 0.005, side * (W / 2 - 0.004));
      add('paint', lip);
    }
  }

  // side skirts
  for (const side of [-1, 1]) {
    const skirt = new THREE.BoxGeometry(wb + 0.5, 0.075, 0.12);
    skirt.translate(0, 0.26, side * (W / 2 - 0.01));
    add('carbon', skirt);
    const seam = new THREE.BoxGeometry(0.015, 0.55, 0.01);
    seam.translate(-0.05, 0.62, side * (W / 2 + 0.005));
    add('trim', seam);
    const handle = new THREE.BoxGeometry(0.22, 0.04, 0.03);
    handle.translate(-0.35, s.belt - 0.14, side * (W / 2 + 0.035));
    add(sig === 'ev' ? 'paint' : 'chrome', handle);
  }

  // ── cabin / glasshouse ────────────────────────────────────
  const cShape = cabinShape(s);
  const cabinW = W * 0.78;
  const cabinGeo = new THREE.ExtrudeGeometry(cShape, {
    depth: cabinW - 0.06, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025,
    bevelSegments: 2, curveSegments: 10, steps: 1,
  });
  cabinGeo.translate(0, 0, -(cabinW - 0.06) / 2);
  add('glass', cabinGeo);

  // roof panel — curved in cross-section like a real pressing
  const [fb, fr, rr, rb] = s.cabin;
  const roofW = cabinW * 0.99;
  const roofGeo = new THREE.BoxGeometry(fr - rr + 0.12, 0.05, roofW, 3, 1, 10);
  {
    const pos = roofGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const zN = Math.min(1, Math.abs(z) / (roofW / 2));
      pos.setY(i, pos.getY(i) + 0.05 * (1 - zN * zN));
    }
  }
  roofGeo.computeVertexNormals();
  roofGeo.translate((fr + rr) / 2, s.roof - 0.02, 0);
  add('paint', roofGeo);

  // A/B/C pillars, chrome window surround and brand-specific details
  const roofY = s.roof - 0.03;
  const luxuryTrim = sig === 'bmw' || sig === 'merc' || sig === 'ev';
  for (const side of [-1, 1]) {
    const zPillar = side * cabinW / 2;

    const aLen = Math.hypot(fr - fb, roofY - s.belt);
    const aPillar = new THREE.BoxGeometry(aLen, 0.055, 0.05);
    aPillar.rotateZ(Math.atan2(roofY - s.belt, fr - fb));
    aPillar.translate((fb + fr) / 2, (s.belt + roofY) / 2, zPillar);
    add('trim', aPillar);

    const cPillar = new THREE.BoxGeometry(Math.hypot(rb - rr, s.belt - roofY), 0.06, 0.05);
    cPillar.rotateZ(Math.atan2(s.belt - roofY, rb - rr));
    cPillar.translate((rr + rb) / 2, (roofY + s.belt) / 2, zPillar);
    add('trim', cPillar);

    const bPillar = new THREE.BoxGeometry(0.07, s.roof - s.belt, 0.045);
    bPillar.translate((fr + rb) / 2 + 0.04, (s.roof + s.belt) / 2 - 0.02, zPillar);
    add('trim', bPillar);

    const roofRail = new THREE.BoxGeometry(fr - rr, 0.04, 0.06);
    roofRail.translate((fr + rr) / 2, s.roof - 0.03, side * (cabinW / 2 + 0.01));
    add('trim', roofRail);

    if (luxuryTrim) {
      const beltTrim = new THREE.BoxGeometry(fb - rb, 0.022, 0.014);
      beltTrim.translate((fb + rb) / 2, s.belt + 0.045, side * (cabinW / 2 + 0.006));
      add('chrome', beltTrim);
      const roofTrim = new THREE.BoxGeometry(fr - rr, 0.018, 0.014);
      roofTrim.translate((fr + rr) / 2, s.roof - 0.075, side * (cabinW / 2 + 0.006));
      add('chrome', roofTrim);
    }
    if (sig === 'bmw') {
      // Hofmeister kink where the rear glass meets the C-pillar
      const kink = new THREE.BoxGeometry(0.26, 0.032, 0.018);
      kink.rotateZ(-0.5);
      kink.translate(rb + 0.1, s.belt + 0.12, side * (cabinW / 2 + 0.008));
      add('chrome', kink);
    }

    const mirrorStalk = new THREE.BoxGeometry(0.09, 0.03, 0.12);
    mirrorStalk.translate(fb - 0.05, s.belt + 0.06, side * (cabinW / 2 + 0.08));
    add('trim', mirrorStalk);
    const mirror = new THREE.BoxGeometry(0.18, 0.1, 0.14);
    mirror.translate(fb - 0.08, s.belt + 0.1, side * (cabinW / 2 + 0.17));
    add('paint', mirror);
    const mirrorGlass = new THREE.BoxGeometry(0.15, 0.075, 0.01);
    mirrorGlass.translate(fb - 0.12, s.belt + 0.1, side * (cabinW / 2 + 0.245));
    add('glass', mirrorGlass);
    const sigLamp = new THREE.BoxGeometry(0.14, 0.015, 0.02);
    sigLamp.translate(fb - 0.06, s.belt + 0.062, side * (cabinW / 2 + 0.252));
    add('signal', sigLamp);
  }
  // wiper parked at the base of the windscreen
  const wiper = new THREE.BoxGeometry(0.028, 0.014, cabinW * 0.52);
  wiper.translate(fb - 0.11, s.belt + 0.06, cabinW * 0.06);
  add('trim', wiper);
  // shark fin
  const fin = new THREE.BoxGeometry(0.28, 0.1, 0.05);
  fin.translate(rr + 0.16, s.roof + 0.035, 0);
  add('paint', fin);

  // interior
  if (!simple) {
    const dash = new THREE.BoxGeometry(0.3, 0.18, cabinW * 0.75);
    dash.translate(fb - 0.22, s.belt - 0.08, 0);
    add('interior', dash);
    const console = new THREE.BoxGeometry(0.7, 0.2, 0.22);
    console.translate((fb + rb) / 2 - 0.15, s.belt - 0.2, 0);
    add('interior', console);
    for (const side of [-1, 1]) {
      const seat = new THREE.BoxGeometry(0.5, 0.5, 0.42);
      seat.translate(-0.12, s.belt - 0.15, side * 0.33);
      add('interior', seat);
      const seatBack = new THREE.BoxGeometry(0.16, 0.55, 0.4);
      seatBack.translate(-0.36, s.belt + 0.02, side * 0.33);
      add('interior', seatBack);
    }
    const wheel = new THREE.TorusGeometry(0.17, 0.025, 5, 12);
    wheel.rotateY(Math.PI / 2);
    wheel.translate(fb - 0.44, s.belt + 0.02, -0.32);
    add('trim', wheel);
  }

  // ── front end ─────────────────────────────────────────────
  const frontX = half - 0.005;
  const grilleStyle = s.grille || 'mesh';
  const grilleY = s.belt - 0.4;
  if (grilleStyle === 'kidney') {
    // Signature twin kidney: upright, canted inward, chrome surround with
    // vertical double slats — the way a modern BMW front actually reads.
    for (const side of [-1, 1]) {
      const frame = new THREE.BoxGeometry(0.05, 0.3, 0.2);
      frame.rotateY(side * 0.1);
      frame.translate(frontX + 0.012, grilleY, side * 0.145);
      add('chrome', frame);
      const inset = new THREE.BoxGeometry(0.04, 0.26, 0.165);
      inset.rotateY(side * 0.1);
      inset.translate(frontX + 0.036, grilleY, side * 0.145);
      add('trim', inset);
      for (const k of [-0.048, 0.048]) {
        const slat = new THREE.BoxGeometry(0.02, 0.24, 0.02);
        slat.translate(frontX + 0.058, grilleY, side * 0.145 + k);
        add('chrome', slat);
      }
    }
    const lower = new THREE.BoxGeometry(0.055, 0.11, W * 0.56);
    lower.translate(frontX + 0.01, 0.34, 0);
    add('trim', lower);
  } else if (grilleStyle === 'panamericana') {
    const frame = new THREE.BoxGeometry(0.06, 0.36, 1.0);
    frame.translate(frontX + 0.005, grilleY, 0);
    add('chrome', frame);
    const back = new THREE.BoxGeometry(0.035, 0.31, 0.95);
    back.translate(frontX + 0.03, grilleY, 0);
    add('trim', back);
    for (let i = 0; i < 9; i++) {
      const slat = new THREE.BoxGeometry(0.026, 0.29, 0.03);
      slat.translate(frontX + 0.052, grilleY, -0.4 + i * 0.1);
      add('chrome', slat);
    }
  } else if (grilleStyle === 'blade') {
    const slot = new THREE.BoxGeometry(0.05, 0.14, 1.05);
    slot.translate(frontX + 0.005, grilleY - 0.05, 0);
    add('trim', slot);
    for (const side of [-1, 1]) {
      const intake = new THREE.BoxGeometry(0.05, 0.22, 0.32);
      intake.translate(frontX + 0.005, 0.32, side * 0.62);
      add('trim', intake);
    }
  } else if (grilleStyle === 'ev') {
    // Closed EV face: no radiator, just a slim lower intake and a chrome lip.
    const slot = new THREE.BoxGeometry(0.05, 0.1, W * 0.46);
    slot.translate(frontX + 0.01, grilleY - 0.13, 0);
    add('trim', slot);
    const lip = new THREE.BoxGeometry(0.03, 0.02, W * 0.5);
    lip.translate(frontX + 0.035, grilleY - 0.06, 0);
    add('chrome', lip);
    for (const side of [-1, 1]) {
      const fog = new THREE.BoxGeometry(0.04, 0.05, 0.16);
      fog.translate(frontX + 0.02, grilleY - 0.16, side * W * 0.33);
      add('trim', fog);
    }
  } else {
    const mesh = new THREE.BoxGeometry(0.06, 0.3, 0.92);
    mesh.translate(frontX + 0.005, grilleY - 0.02, 0);
    add('trim', mesh);
    for (let i = 0; i < 5; i++) {
      const rib = new THREE.BoxGeometry(0.02, 0.28, 0.03);
      rib.translate(frontX + 0.04, grilleY - 0.02, -0.34 + i * 0.17);
      add('carbon', rib);
    }
  }

  // headlights
  const lightY = s.belt - 0.2;
  const lightZ = W * 0.33;
  const style = s.lights || 'ring';
  if (style === 'ring') {
    for (const side of [-1, 1]) {
      const housing = new THREE.BoxGeometry(0.05, 0.115, 0.4);
      housing.translate(frontX - 0.006, lightY, side * lightZ);
      add('trim', housing);
      const lens = new THREE.BoxGeometry(0.012, 0.096, 0.37);
      lens.translate(frontX + 0.048, lightY, side * lightZ);
      add('glass', lens);
      for (const zOff of [-0.076, 0.076]) {
        const ring = new THREE.TorusGeometry(0.052, 0.0075, 5, 16);
        ring.rotateY(Math.PI / 2);
        ring.translate(frontX + 0.056, lightY, side * lightZ + zOff);
        add('head', ring);
      }
      const brow = new THREE.BoxGeometry(0.02, 0.011, 0.31);
      brow.translate(frontX + 0.058, lightY + 0.05, side * lightZ);
      add('head', brow);
    }
  } else if (style === 'bar') {
    // Full-width LED blade with slim outer lamps (EV signature)
    for (const side of [-1, 1]) {
      const lamp = new THREE.BoxGeometry(0.05, 0.085, 0.34);
      lamp.translate(frontX + 0.02, lightY, side * lightZ);
      add('trim', lamp);
      const lens = new THREE.BoxGeometry(0.035, 0.042, 0.3);
      lens.translate(frontX + 0.05, lightY, side * lightZ);
      add('head', lens);
    }
    const strip = new THREE.BoxGeometry(0.032, 0.024, W * 0.74);
    strip.translate(frontX + 0.048, lightY, 0);
    add('head', strip);
  } else if (style === 'slash') {
    for (const side of [-1, 1]) {
      const housing = new THREE.BoxGeometry(0.06, 0.16, 0.5);
      housing.translate(frontX + 0.02, lightY, side * lightZ);
      add('trim', housing);
      const bar = new THREE.BoxGeometry(0.04, 0.05, 0.42);
      bar.translate(frontX + 0.055, lightY, side * lightZ);
      add('head', bar);
      const tick = new THREE.BoxGeometry(0.04, 0.13, 0.05);
      tick.translate(frontX + 0.055, lightY + 0.05, side * (lightZ + 0.16));
      add('head', tick);
    }
  } else if (style === 'quad') {
    for (const side of [-1, 1]) {
      const housing = new THREE.BoxGeometry(0.06, 0.2, 0.5);
      housing.translate(frontX + 0.02, lightY, side * lightZ);
      add('trim', housing);
      for (const zOff of [-0.15, 0, 0.15]) {
        const dot = new THREE.CylinderGeometry(0.055, 0.055, 0.035, 12);
        dot.rotateZ(Math.PI / 2);
        dot.translate(frontX + 0.055, lightY, side * lightZ + zOff);
        add('head', dot);
      }
    }
  } else if (style === 'round') {
    for (const side of [-1, 1]) {
      const housing = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 16);
      housing.rotateZ(Math.PI / 2);
      housing.translate(frontX + 0.015, lightY, side * lightZ);
      add('trim', housing);
      for (const zOff of [-0.07, 0.07]) {
        const lens = new THREE.CylinderGeometry(0.065, 0.065, 0.03, 14);
        lens.rotateZ(Math.PI / 2);
        lens.translate(frontX + 0.05, lightY, side * lightZ + zOff);
        add('head', lens);
      }
    }
  } else {
    // laser slashes
    for (const side of [-1, 1]) {
      const housing = new THREE.BoxGeometry(0.05, 0.1, 0.44);
      housing.translate(frontX + 0.02, lightY, side * lightZ);
      add('trim', housing);
      const bar = new THREE.BoxGeometry(0.035, 0.035, 0.4);
      bar.rotateX(0.12 * side);
      bar.translate(frontX + 0.05, lightY, side * lightZ);
      add('head', bar);
    }
  }

  // lower splitter + intakes
  const splitter = new THREE.BoxGeometry(0.5, 0.06, W * 0.92);
  splitter.translate(half - 0.22, 0.22, 0);
  add('carbon', splitter);
  for (const side of [-1, 1]) {
    const intake = new THREE.BoxGeometry(0.06, 0.12, 0.3);
    intake.translate(half - 0.02, 0.33, side * W * 0.36);
    add('trim', intake);
  }

  // hood vents for low cars
  if (s.type === 'super' || s.type === 'hyper' || s.type === 'muscle') {
    for (const side of [-1, 1]) {
      const vent = new THREE.BoxGeometry(0.5, 0.03, 0.16);
      vent.translate(half * 0.55, s.belt - 0.005, side * 0.28);
      add('carbon', vent);
    }
  }

  // ── rear end ──────────────────────────────────────────────
  const rearX = -half + 0.005;
  const tailY = s.belt - 0.2;
  if (sig === 'ev') {
    const bar = new THREE.BoxGeometry(0.05, 0.032, W * 0.9);
    bar.translate(rearX - 0.005, tailY, 0);
    add('tail', bar);
    for (const side of [-1, 1]) {
      const cap = new THREE.BoxGeometry(0.05, 0.058, 0.16);
      cap.translate(rearX - 0.005, tailY, side * W * 0.4);
      add('tail', cap);
    }
  } else if (sig === 'bmw') {
    // horizontal blade + vertical drop, the G20-style L signature
    for (const side of [-1, 1]) {
      const horiz = new THREE.BoxGeometry(0.05, 0.055, W * 0.26);
      horiz.translate(rearX - 0.005, tailY + 0.055, side * W * 0.315);
      add('tail', horiz);
      const drop = new THREE.BoxGeometry(0.05, 0.15, 0.05);
      drop.translate(rearX - 0.005, tailY - 0.02, side * W * 0.415);
      add('tail', drop);
    }
    const bridge = new THREE.BoxGeometry(0.04, 0.018, W * 0.34);
    bridge.translate(rearX - 0.005, tailY + 0.055, 0);
    add('tail', bridge);
  } else if (sig === 'merc') {
    for (const side of [-1, 1]) {
      const lamp = new THREE.BoxGeometry(0.05, 0.048, W * 0.3);
      lamp.translate(rearX - 0.005, tailY, side * W * 0.28);
      add('tail', lamp);
    }
  } else {
    const bar = new THREE.BoxGeometry(0.05, 0.05, W * 0.66);
    bar.translate(rearX - 0.005, tailY, 0);
    add('tail', bar);
  }
  for (const side of [-1, 1]) {
    const reverse = new THREE.BoxGeometry(0.04, 0.05, 0.08);
    reverse.translate(rearX - 0.01, 0.48, side * W * 0.34);
    add('plate', reverse);
    const reflector = new THREE.BoxGeometry(0.035, 0.03, 0.12);
    reflector.translate(rearX - 0.012, 0.33, side * W * 0.38);
    add('signal', reflector);
  }
  const badge = new THREE.CylinderGeometry(0.052, 0.052, 0.014, 20);
  badge.rotateZ(Math.PI / 2);
  badge.translate(rearX - 0.02, s.belt - 0.06, 0);
  add('chrome', badge);
  const plateGeo = new THREE.BoxGeometry(0.03, 0.13, 0.42);
  plateGeo.translate(rearX - 0.02, 0.5, 0);
  add('plate', plateGeo);
  const diffuser = new THREE.BoxGeometry(0.3, 0.1, W * 0.82);
  diffuser.translate(-half + 0.16, 0.24, 0);
  add('carbon', diffuser);
  const exhaustCount = s.exhaust ?? 2;
  for (let i = 0; i < exhaustCount; i++) {
    const ang = (i / Math.max(1, exhaustCount - 1) - 0.5) * 1.1;
    const pipe = new THREE.CylinderGeometry(0.048, 0.052, 0.18, 10);
    pipe.rotateZ(Math.PI / 2);
    pipe.translate(-half - 0.05, 0.3, (exhaustCount === 1 ? 0 : ang) * W * 0.3);
    add('chrome', pipe);
  }

  // spoiler
  const spoilerId = cosmetic.spoiler || s.wing || 'lip';
  const spoilerDef = SPOILERS.find((sp) => sp.id === spoilerId) || SPOILERS[1];
  if (spoilerDef.id === 'lip' || spoilerDef.id === 'none') {
    if (spoilerDef.id === 'lip') {
      const lip = new THREE.BoxGeometry(0.22, 0.04, W * 0.68);
      lip.translate(-half + 0.13, s.belt + 0.02, 0);
      add('carbon', lip);
    }
  } else if (spoilerDef.id === 'duck') {
    const duck = new THREE.BoxGeometry(0.34, 0.075, W * 0.76);
    duck.rotateZ(-0.16);
    duck.translate(-half + 0.2, s.belt + 0.07, 0);
    add('paint', duck);
  } else if (spoilerDef.id === 'gt') {
    const wing = new THREE.BoxGeometry(0.4, 0.035, W * 0.86);
    wing.translate(-half + 0.28, s.belt + 0.34, 0);
    add('carbon', wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.BoxGeometry(0.07, 0.33, 0.05);
      strut.translate(-half + 0.27, s.belt + 0.17, side * W * 0.32);
      add('carbon', strut);
    }
  }

  // ── neon underglow ────────────────────────────────────────
  let neonMesh = null;
  const neonDef = NEONS.find((n) => n.id === (cosmetic.neon || 'none'));
  if (neonDef && neonDef.hex) {
    const neonMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(neonDef.hex).multiplyScalar(1.5),
      transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(W * 1.3, L * 1.1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0.05, 0);
    neonMesh = new THREE.Mesh(geo, neonMat);
    neonMesh.renderOrder = 2;
  }

  // ── assemble ──────────────────────────────────────────────
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.y = -Math.PI / 2;
  root.add(model);

  // Soft contact shadow: keeps the car planted between shadow-map refreshes
  // and at night when the directional shadow is barely visible.
  const blobGeo = new THREE.PlaneGeometry(W * 1.12, L * 1.06);
  blobGeo.rotateX(-Math.PI / 2);
  const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({
    map: contactShadowTexture(), transparent: true, opacity: 0.55,
    depthWrite: false, color: 0x000000,
  }));
  blob.position.y = 0.045;
  blob.renderOrder = 1;
  root.add(blob);

  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.5 + rideHeight;
  model.add(bodyPivot);

  const matMap = {
    paint, trim, carbon, chrome, glass, head, tail, signal, rim, tire: tireMat,
    brake: brakeMat, caliper: caliperMat, interior, plate,
  };

  for (const [key, geos] of batches) {
    const mat = matMap[key];
    if (!mat || !geos.length) continue;
    const prepared = geos.map((g) => {
      if (!g.index) return g;
      const flat = g.toNonIndexed();
      g.dispose();
      return flat;
    });
    let merged;
    try {
      merged = prepared.length === 1 ? prepared[0] : mergeGeometries(prepared, false);
    } catch (err) {
      console.warn('car merge failed', key, err);
      continue;
    }
    if (!merged) continue;
    merged.translate(0, -0.5 - rideHeight, 0);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = !simple;
    mesh.receiveShadow = false;
    bodyPivot.add(mesh);
    if (prepared.length > 1) prepared.forEach((g) => g.dispose());
  }

  if (neonMesh) {
    bodyPivot.add(neonMesh);
    neonMesh.position.y = -0.5 - rideHeight;
  }

  // wheels
  const wheels = [];
  const rimGeo = wheelRimGeometry(rimData.id, wheelR * 0.69);
  const tireGeo = new THREE.TorusGeometry(wheelR - 0.09, 0.095, 8, 22);
  const discGeo = (() => {
    const d = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.025, 18);
    d.rotateX(Math.PI / 2);
    return d;
  })();
  const caliperGeo = (() => {
    const c = new THREE.BoxGeometry(0.09, 0.2, 0.08);
    c.translate(wheelR * 0.4, 0, 0.02);
    return c;
  })();

  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const steer = new THREE.Group();
      steer.position.set(front ? wb / 2 : -wb / 2, wheelR, side * (W / 2 - 0.1));
      const spin = new THREE.Group();
      steer.add(spin);

      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = !simple;
      spin.add(tire);

      const rimMesh = new THREE.Mesh(rimGeo, rim);
      spin.add(rimMesh);

      if (!simple) {
        const disc = new THREE.Mesh(discGeo, brakeMat);
        disc.position.z = -0.01;
        spin.add(disc);
        const caliper = new THREE.Mesh(caliperGeo, caliperMat);
        caliper.position.z = -0.02;
        caliper.rotation.z = 0.7;
        spin.add(caliper);
      }

      if (side < 0) spin.rotation.y = Math.PI;

      model.add(steer);
      wheels.push({ steer, spin, front, side, radius: wheelR, x: front ? wb / 2 : -wb / 2, z: side * (W / 2 - 0.1) });
    }
  }

  return {
    root, model, body: bodyPivot, wheels, materials,
    neonMesh, dims: { length: L, width: W, height: H, wheelbase: wb, wheelR },
    rideHeight,
  };
}

export function disposeCarModel(car) {
  car.root.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m?.dispose());
    }
  });
}
