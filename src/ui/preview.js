import * as THREE from 'three';
import { buildCarModel, disposeCarModel } from '../car/model.js';

function stageTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  g.addColorStop(0, 'rgba(96, 122, 158, 0.34)');
  g.addColorStop(0.5, 'rgba(58, 76, 102, 0.12)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CarPreview {
  constructor(canvas, sky) {
    this.canvas = canvas;
    this.sky = sky;
    this.visible = false;
    this.yaw = 0.32;
    this.dragging = false;
    this.dragIdle = 0;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 90);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshBasicMaterial({ map: stageTexture(), transparent: true, depthWrite: false, toneMapped: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    this.scene.add(floor);

    const catcher = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.ShadowMaterial({ opacity: 0.46 }),
    );
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.y = 0.001;
    catcher.receiveShadow = true;
    this.scene.add(catcher);

    this.scene.add(new THREE.HemisphereLight(0xd4e4ff, 0x0d1117, 1.05));
    const key = new THREE.DirectionalLight(0xfff1dc, 3.4);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -5;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 2.8);
    rim.position.set(-7, 4.5, -6);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 1.15);
    fill.position.set(-3, 2.6, 8);
    this.scene.add(fill);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.car = null;
    this.dims = { length: 4.7, width: 1.9, height: 1.4 };
    this.distance = 11;
    this.targetY = 0.58;

    this._bindDrag();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this._resizeObserver.observe(canvas.parentElement);
  }

  _bindDrag() {
    const onDown = (e) => {
      this.dragging = true;
      this.dragIdle = 0;
      this._px = e.clientX;
      this.canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this._px;
      this._px = e.clientX;
      this.yaw += dx * 0.012;
      this.dragIdle = 0;
    };
    const onUp = () => { this.dragging = false; };
    this.canvas.addEventListener('pointerdown', onDown);
    this.canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this.canvas.addEventListener('pointerleave', onUp);
  }

  _frame() {
    const aspect = this.camera.aspect || 1;
    const radius = Math.max(this.dims.length * 0.55, 2.5);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    this.distance = (radius / tan) * Math.max(1, 1 / aspect) * 1.12;
  }

  setCar(def, cosmetic, keepYaw = false) {
    if (this.car) {
      this.pivot.remove(this.car.root);
      disposeCarModel(this.car);
    }
    this.car = buildCarModel(def, cosmetic, {});
    this.pivot.add(this.car.root);
    this.dims = this.car.dims;
    this.scene.environment = this.sky?.envMap || null;
    this._frame();
    if (!keepYaw) this.yaw = 0.32;
  }

  setVisible(v) {
    this.visible = !!v;
    if (this.visible) this.resize();
  }

  resize() {
    if (!this.canvas.parentElement) return;
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    if (w < 4 || h < 4) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._frame();
  }

  update(dt) {
    if (!this.visible) return;
    if (!this.dragging) {
      this.dragIdle += dt;
      if (this.dragIdle > 1.8) this.yaw += 0.14 * dt;
    }
    this.pivot.rotation.y = this.yaw;

    const az = -0.6;
    const el = 0.19;
    const d = this.distance;
    this.camera.position.set(
      Math.sin(az) * Math.cos(el) * d,
      this.targetY + Math.sin(el) * d,
      Math.cos(az) * Math.cos(el) * d,
    );
    if (this.dims.length > 5.4) this.camera.position.y += 0.12;
    this.camera.lookAt(0, this.targetY * 0.92, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._resizeObserver?.disconnect();
    if (this.car) {
      this.pivot.remove(this.car.root);
      disposeCarModel(this.car);
      this.car = null;
    }
    this.renderer.dispose();
  }
}
