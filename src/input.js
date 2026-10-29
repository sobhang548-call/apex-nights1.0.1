const BLOCK_DEFAULT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
]);

export class Input {
  constructor(canvas) {
    this.down = new Set();
    this.edge = new Set();
    this.canvas = canvas;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this.enabled = true;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.edge.add(e.code);
      this.down.add(e.code);
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.down.clear();
      this.dragging = false;
    });

    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this._lastX;
      this.mouseDY += e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    const end = () => { this.dragging = false; };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  isDown(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  pressed(code) {
    return this.edge.has(code);
  }

  get throttle() {
    return this.isDown('KeyW', 'ArrowUp') ? 1 : 0;
  }
  get brake() {
    return this.isDown('KeyS', 'ArrowDown') ? 1 : 0;
  }
  get steer() {
    let s = 0;
    if (this.isDown('KeyA', 'ArrowLeft')) s += 1;
    if (this.isDown('KeyD', 'ArrowRight')) s -= 1;
    return s;
  }
  get handbrake() {
    return this.isDown('Space');
  }
  get boost() {
    return this.isDown('ShiftLeft', 'ShiftRight');
  }
  get shiftUp() {
    return this.pressed('KeyE');
  }
  get shiftDown() {
    return this.pressed('KeyQ');
  }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.edge.clear();
  }
}
