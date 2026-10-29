import {
  UPGRADES, upgradeCost, computeStats, PAINTS, FINISHES, RIMS, SPOILERS, NEONS,
  CAR_BY_ID,
} from '../data.js';
import { formatMoney } from '../util.js';
import { CarPreview } from './preview.js';
import { renderStats } from './specs.js';

const UPGRADE_GROUPS = [
  { title: 'ENGINE & DRIVELINE', ids: ['engine', 'turbo', 'gearbox', 'nitro'] },
  { title: 'CHASSIS & TYRES', ids: ['tires', 'suspension', 'brakes', 'weight'] },
];

const hexEq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export class GarageUI {
  constructor(game) {
    this.game = game;
    this.screen = document.getElementById('garageScreen');
    this.tabs = document.getElementById('garageTabs');
    this.content = document.getElementById('garageContent');
    this.statsEl = document.getElementById('garageStats');
    this.investedEl = document.getElementById('garageInvested');
    this.titleEl = document.getElementById('garageCarTitle');
    this.moneyEl = document.getElementById('garageMoney');
    this.tagEl = document.getElementById('garagePreviewTag');
    this.canvas = document.getElementById('garageCanvas');
    this.tab = 'tune';
    this.dirty = false;
    this.preview = null;

    this.noticeEl = document.createElement('div');
    this.noticeEl.className = 'shop-notice';
    this.content.parentElement.appendChild(this.noticeEl);

    this.tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      this.game.audio.ui();
      this.setTab(btn.dataset.tab);
    });
    this.content.addEventListener('click', (e) => this._onClick(e));
    document.getElementById('garageDone').addEventListener('click', () => this.close());
  }

  open() {
    if (this.game.state === 'garage') return;
    this.game.state = 'garage';
    this.game.hud.hidePrompt();
    this.screen.classList.remove('hidden');
    if (!this.preview) {
      this.preview = new CarPreview(this.canvas, this.game.sky);
      this.game.updateGaragePreview = (dt) => this.preview.update(dt);
    }
    this.preview.setCar(this._def(), this._state().cosmetics);
    this.preview.setVisible(true);
    this.refresh();
    this.setTab(this.tab);
    this.game.audio.ui();
  }

  close() {
    if (this.game.state !== 'garage') return;
    this.screen.classList.add('hidden');
    this.preview?.setVisible(false);
    this.game.state = 'play';
    if (this.dirty) {
      this.game.applySaveToPlayer();
      this.dirty = false;
    }
    this.game.autosave();
    this.noticeEl.classList.remove('show', 'bad');
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
  }

  // ── state helpers ─────────────────────────────────────────
  _def() {
    return CAR_BY_ID[this.game.save.active] || CAR_BY_ID.sp320;
  }

  _state() {
    const save = this.game.save;
    const st = save.owned[save.active];
    if (!st) return { upgrades: {}, cosmetics: {}, invested: 0, paints: [], rims: [], spoilers: [], neons: [] };
    st.paints = st.paints || [st.cosmetics.paint];
    st.rims = st.rims || [st.cosmetics.rimStyle || 'sport'];
    st.spoilers = st.spoilers || [st.cosmetics.spoiler || 'lip'];
    st.neons = st.neons || [st.cosmetics.neon || 'none'];
    return st;
  }

  refresh() {
    const def = this._def();
    const st = this._state();
    this.titleEl.textContent = `${def.brand} ${def.name}`;
    this.moneyEl.textContent = formatMoney(this.game.save.money);
    this.tagEl.textContent = `${def.cls} · ${def.drive}`;
    this.investedEl.textContent = `$${formatMoney(st.invested || 0)}`;
    renderStats(this.statsEl, def, st.upgrades);
    const scroll = this.content.parentElement.scrollTop;
    this._renderPanel(def, st);
    this.content.parentElement.scrollTop = scroll;
  }

  _syncMoney() {
    const money = this.game.save.money;
    this.moneyEl.textContent = formatMoney(money);
    this.game.hud.setMoney(money);
  }

  _notice(text, bad = false) {
    this.noticeEl.textContent = text;
    this.noticeEl.classList.toggle('bad', bad);
    this.noticeEl.classList.add('show');
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => this.noticeEl.classList.remove('show'), 2800);
  }

  /** Returns true when the player can pay (and pays). */
  _charge(cost, st) {
    const save = this.game.save;
    if (cost > 0) {
      if (save.money < cost) {
        this._notice(`NOT ENOUGH CASH · NEED $${formatMoney(cost - save.money)} MORE`, true);
        this.game.audio.deny();
        return false;
      }
      save.money -= cost;
      st.invested = (st.invested || 0) + cost;
      this._syncMoney();
      this.game.audio.buy();
    } else {
      this.game.audio.ui();
    }
    return true;
  }

  _commit(rebuildPreview) {
    this.dirty = true;
    if (rebuildPreview) this.preview?.setCar(this._def(), this._state().cosmetics, true);
    this.refresh();
    this.game.autosave();
  }

  // ── tabs ──────────────────────────────────────────────────
  setTab(tab) {
    this.tab = tab;
    for (const b of this.tabs.querySelectorAll('[data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === tab);
    }
    const scroll = this.content.parentElement.scrollTop;
    this._renderPanel(this._def(), this._state());
    this.content.parentElement.scrollTop = tab === 'tune' ? scroll : 0;
  }

  _renderPanel(def, st) {
    if (this.tab === 'style') this.content.innerHTML = this._styleHTML(def, st);
    else if (this.tab === 'fleet') this.content.innerHTML = this._fleetHTML();
    else this.content.innerHTML = this._tuneHTML(st);
  }

  _tuneHTML(st) {
    return UPGRADE_GROUPS.map((group) => `
      <div class="panel-section-title">${group.title}</div>
      ${group.ids.map((id) => {
        const u = UPGRADES.find((x) => x.id === id);
        const lvl = st.upgrades[id] || 0;
        const maxed = lvl >= u.max;
        const cost = upgradeCost(u, lvl);
        return `
          <div class="upgrade-row">
            <div>
              <div class="up-name">${u.name}</div>
              <div class="up-desc">${u.desc}</div>
              <div class="up-pips">${Array.from({ length: u.max }, (_, i) =>
                `<span class="pip${i < lvl ? ' on' : ''}"></span>`).join('')}</div>
            </div>
            <button class="up-buy${maxed ? ' maxed' : ''}" data-upgrade="${u.id}"
              ${maxed ? 'disabled' : ''}>${maxed ? 'MAXED' : `$${formatMoney(cost)}`}</button>
          </div>`;
      }).join('')}
    `).join('');
  }

  _styleHTML(def, st) {
    const cos = st.cosmetics;
    const paintDef = PAINTS.find((p) => hexEq(p.hex, cos.paint));
    const paintName = paintDef ? paintDef.name : 'CUSTOM';

    const swatches = PAINTS.map((p) => {
      const active = hexEq(p.hex, cos.paint);
      const owned = st.paints.some((x) => hexEq(x, p.hex));
      return `<button class="swatch${active ? ' active' : ''}" style="background:${p.hex}"
        data-paint="${p.hex}" title="${p.name}">
        ${owned ? '' : `<span class="price">$${formatMoney(p.price)}</span>`}
      </button>`;
    }).join('');

    const finishes = FINISHES.map((f) => `
      <button class="option${cos.finish === f.id ? ' active' : ''}" data-option="finish" data-val="${f.id}">
        ${f.name}<span class="opt-price">${cos.finish === f.id ? 'EQUIPPED' : 'INCLUDED'}</span>
      </button>`).join('');

    const rims = RIMS.map((r) => {
      const active = (cos.rimStyle || 'sport') === r.id;
      const owned = st.rims.includes(r.id);
      return `<button class="option${active ? ' active' : ''}" data-option="rim" data-val="${r.id}">
        ${r.name}<span class="opt-price">${owned ? (active ? 'EQUIPPED' : 'OWNED') : `$${formatMoney(r.price)}`}</span>
      </button>`;
    }).join('');

    const spoilers = SPOILERS.map((sp) => {
      const active = (cos.spoiler || 'lip') === sp.id;
      const owned = st.spoilers.includes(sp.id);
      return `<button class="option${active ? ' active' : ''}" data-option="spoiler" data-val="${sp.id}">
        ${sp.name}<span class="opt-price">${owned ? (active ? 'EQUIPPED' : 'OWNED') : `$${formatMoney(sp.price)}`}</span>
      </button>`;
    }).join('');

    const neons = NEONS.map((n) => {
      const active = (cos.neon || 'none') === n.id;
      const owned = st.neons.includes(n.id);
      return `<button class="option${active ? ' active' : ''}" data-option="neon" data-val="${n.id}">
        ${n.name}<span class="opt-price">${owned ? (active ? 'EQUIPPED' : 'OWNED') : `$${formatMoney(n.price)}`}</span>
      </button>`;
    }).join('');

    return `
      <div class="panel-section-title">PAINT · ${paintName}</div>
      <div class="swatches">${swatches}</div>

      <div class="panel-section-title">FINISH</div>
      <div class="option-grid">${finishes}</div>

      <div class="panel-section-title">WHEELS</div>
      <div class="option-grid">${rims}</div>

      <div class="panel-section-title">REAR WING</div>
      <div class="option-grid">${spoilers}</div>

      <div class="panel-section-title">UNDERGLOW</div>
      <div class="option-grid">${neons}</div>
    `;
  }

  _fleetHTML() {
    const save = this.game.save;
    const ids = Object.keys(save.owned);
    const rows = ids.map((id) => {
      const car = CAR_BY_ID[id];
      if (!car) return '';
      const st = save.owned[id];
      const active = save.active === id;
      const power = Math.round(computeStats(car, st.upgrades).power);
      return `
        <div class="fleet-row${active ? ' active' : ''}" data-fleet="${id}">
          <div class="fleet-swatch" style="background:${st.cosmetics.paint}"></div>
          <div>
            <div class="fleet-name">${car.brand} ${car.name}</div>
            <div class="fleet-sub">${car.cls} · ${power} HP · ${car.drive}</div>
          </div>
          ${active ? '<span class="fleet-badge">DRIVING</span>' : ''}
        </div>`;
    }).join('');
    return `
      <div class="panel-section-title">YOUR FLEET · ${ids.length} CAR${ids.length === 1 ? '' : 'S'}</div>
      ${rows}
      <div class="lock-note">Buy more cars at APEX MOTORS. Some models unlock when you win races.</div>
    `;
  }

  // ── interactions ──────────────────────────────────────────
  _onClick(e) {
    const upgradeBtn = e.target.closest('[data-upgrade]');
    if (upgradeBtn) return this.buyUpgrade(upgradeBtn.dataset.upgrade);

    const paintBtn = e.target.closest('[data-paint]');
    if (paintBtn) return this.applyPaint(paintBtn.dataset.paint);

    const optionBtn = e.target.closest('[data-option]');
    if (optionBtn) return this.applyOption(optionBtn.dataset.option, optionBtn.dataset.val);

    const fleetRow = e.target.closest('[data-fleet]');
    if (fleetRow) return this.selectCar(fleetRow.dataset.fleet);
    return null;
  }

  buyUpgrade(id) {
    const u = UPGRADES.find((x) => x.id === id);
    const st = this._state();
    const lvl = st.upgrades[id] || 0;
    if (!u || lvl >= u.max) return;
    const cost = upgradeCost(u, lvl);
    if (!this._charge(cost, st)) return;
    st.upgrades[id] = lvl + 1;
    this._notice(`${u.name} · STAGE ${lvl + 1} INSTALLED`);
    this._commit(false);
  }

  applyPaint(hex) {
    const st = this._state();
    const cos = st.cosmetics;
    if (hexEq(cos.paint, hex)) return;
    const p = PAINTS.find((x) => hexEq(x.hex, hex));
    const owned = st.paints.some((x) => hexEq(x, hex));
    if (!owned) {
      const price = p ? p.price : 800;
      if (!this._charge(price, st)) return;
      st.paints.push(hex);
    } else {
      this.game.audio.ui();
    }
    cos.paint = hex;
    this._notice(`${p ? p.name : 'CUSTOM PAINT'} APPLIED`);
    this._commit(true);
  }

  applyOption(kind, val) {
    const st = this._state();
    const cos = st.cosmetics;
    let price = 0;
    let list = null;
    let label = val;

    if (kind === 'finish') {
      if (cos.finish === val) return;
      cos.finish = val;
      label = (FINISHES.find((f) => f.id === val) || {}).name || val;
    } else if (kind === 'rim') {
      const r = RIMS.find((x) => x.id === val);
      if (!r || (cos.rimStyle || 'sport') === r.id) return;
      list = st.rims;
      price = r.price;
      cos.rimStyle = r.id;
      cos.rimColor = r.color;
      label = r.name;
    } else if (kind === 'spoiler') {
      const sp = SPOILERS.find((x) => x.id === val);
      if (!sp || (cos.spoiler || 'lip') === sp.id) return;
      list = st.spoilers;
      price = sp.price;
      cos.spoiler = sp.id;
      label = sp.name;
    } else if (kind === 'neon') {
      const n = NEONS.find((x) => x.id === val);
      if (!n || (cos.neon || 'none') === n.id) return;
      list = st.neons;
      price = n.price;
      cos.neon = n.id;
      label = n.name;
    } else {
      return;
    }

    if (list && !list.includes(val)) {
      if (!this._charge(price, st)) return;
      list.push(val);
    } else {
      this.game.audio.ui();
    }
    this._notice(`${label} FITTED`);
    this._commit(true);
  }

  selectCar(id) {
    const save = this.game.save;
    if (!save.owned[id] || save.active === id) return;
    save.active = id;
    this.game.audio.ui();
    this.preview?.setCar(this._def(), this._state().cosmetics);
    this.dirty = true;
    this.refresh();
    this.game.autosave();
    this._notice(`NOW DRIVING · ${this._def().brand} ${this._def().name}`);
  }
}
