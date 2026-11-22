import { CARS, CAR_BY_ID, BRANDS, emptyCosmetics } from '../data.js';
import { ensureCarState } from '../storage.js';
import { formatMoney } from '../util.js';
import { CarPreview } from './preview.js';
import { renderStats } from './specs.js';

export class DealerUI {
  constructor(game) {
    this.game = game;
    this.screen = document.getElementById('dealerScreen');
    this.listEl = document.getElementById('dealerList');
    this.statsEl = document.getElementById('dealerStats');
    this.priceEl = document.getElementById('dealerPrice');
    this.titleEl = document.getElementById('dealerCarTitle');
    this.moneyEl = document.getElementById('dealerMoney');
    this.tagEl = document.getElementById('dealerPreviewTag');
    this.hintEl = document.getElementById('dealerHint');
    this.buyBtn = document.getElementById('dealerBuy');
    this.selectBtn = document.getElementById('dealerSelect');
    this.canvas = document.getElementById('dealerCanvas');
    this.selected = null;
    this.dirty = false;
    this.preview = null;

    this.noticeEl = document.createElement('div');
    this.noticeEl.className = 'shop-notice';
    this.listEl.parentElement.appendChild(this.noticeEl);

    this.listEl.addEventListener('click', (e) => {
      const row = e.target.closest('[data-car]');
      if (row) this.select(row.dataset.car);
    });
    this.buyBtn.addEventListener('click', () => this.buy());
    this.selectBtn.addEventListener('click', () => this.drive());
  }

  open() {
    if (this.game.state === 'dealer') return;
    this.game.state = 'dealer';
    this.game.hud.hidePrompt();
    this.screen.classList.remove('hidden');
    if (!this.preview) {
      this.preview = new CarPreview(this.canvas, this.game.sky);
      this.game.updateDealerPreview = (dt) => this.preview.update(dt);
    }
    this.preview.setVisible(true);
    const fallback = this.game.save.active;
    this.selected = this.selected && CAR_BY_ID[this.selected] ? this.selected : fallback;
    this.select(this.selected, false);
    this.game.audio.ui();
  }

  close() {
    if (this.game.state !== 'dealer') return;
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

  _cosmeticsFor(car) {
    const st = this.game.save.owned[car.id];
    if (st) return st.cosmetics;
    return { ...emptyCosmetics(car.color), spoiler: car.shape.wing || 'lip' };
  }

  _notice(text, bad = false) {
    this.noticeEl.textContent = text;
    this.noticeEl.classList.toggle('bad', bad);
    this.noticeEl.classList.add('show');
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => this.noticeEl.classList.remove('show'), 2800);
  }

  select(id, sound = true) {
    const car = CAR_BY_ID[id];
    if (!car) return;
    this.selected = id;
    this.preview?.setCar(car, this._cosmeticsFor(car), true);
    this._renderList();
    this._renderDetail(car);
    if (sound) this.game.audio.ui();
  }

  _renderList() {
    const save = this.game.save;
    this.listEl.innerHTML = CARS.map((car) => {
      const owned = !!save.owned[car.id];
      const locked = (car.unlockWins || 0) > (save.wins || 0);
      const selected = this.selected === car.id;
      const cost = owned ? 'IN GARAGE'
        : locked ? `LOCKED · ${car.unlockWins} WINS` : `$${formatMoney(car.price)}`;
      return `
        <div class="dealer-row${selected ? ' active' : ''}" data-car="${car.id}">
          <div class="fleet-swatch" style="background:${car.color}"></div>
          <div>
            <div class="dealer-brand">${car.brand} · ${(BRANDS[car.brand] || {}).country || ''}</div>
            <div class="dealer-name">${car.name}</div>
            <div class="dealer-tag">${car.cls} · ${car.drive} · ${car.transmission || 'manual'}</div>
          </div>
          <div class="dealer-cost${owned ? ' owned' : locked ? ' locked' : ''}">${cost}</div>
        </div>`;
    }).join('');
  }

  _renderDetail(car) {
    const save = this.game.save;
    const st = save.owned[car.id];
    const owned = !!st;
    const wins = save.wins || 0;
    const locked = (car.unlockWins || 0) > wins;
    const active = save.active === car.id;
    const afford = save.money >= car.price;

    this.titleEl.textContent = car.name;
    this.moneyEl.textContent = formatMoney(save.money);
    this.tagEl.textContent = `${car.brand} · ${car.cls} · ${car.transmission || 'manual'}`;

    const priceRow = this.priceEl.parentElement;
    this.priceEl.textContent = owned ? 'OWNED' : formatMoney(car.price);
    priceRow.classList.toggle('owned', owned);
    priceRow.classList.toggle('locked', locked && !owned);

    renderStats(this.statsEl, car, st ? st.upgrades : null);

    this.buyBtn.classList.toggle('hidden', owned);
    this.buyBtn.disabled = locked || !afford;
    this.buyBtn.textContent = locked
      ? `LOCKED · ${car.unlockWins} WINS`
      : `PURCHASE · $${formatMoney(car.price)}`;

    this.selectBtn.classList.toggle('hidden', !owned);
    this.selectBtn.disabled = active;
    this.selectBtn.textContent = active ? 'CURRENT CAR' : 'DRIVE THIS CAR';

    let hint = 'Cars are delivered to your garage instantly.';
    if (owned) {
      hint = active
        ? 'You are driving this car. Tune it at the APEX GARAGE.'
        : 'Already in your fleet. Take the keys to make it your active car.';
    } else if (locked) {
      const need = car.unlockWins - wins;
      hint = `Win ${need} more race${need === 1 ? '' : 's'} to unlock this model.`;
    } else if (!afford) {
      hint = `You need $${formatMoney(car.price - save.money)} more. Win races to earn cash.`;
    } else {
      hint = `${car.tagline} Delivered to your garage instantly.`;
    }
    this.hintEl.textContent = hint;
  }

  buy() {
    const car = CAR_BY_ID[this.selected];
    if (!car) return;
    const save = this.game.save;
    if (save.owned[car.id]) return;
    if ((car.unlockWins || 0) > (save.wins || 0)) {
      this.game.audio.deny();
      this._notice(`LOCKED · WIN ${car.unlockWins - (save.wins || 0)} MORE RACES`, true);
      return;
    }
    if (save.money < car.price) {
      this.game.audio.deny();
      this._notice(`NOT ENOUGH CASH · NEED $${formatMoney(car.price - save.money)} MORE`, true);
      return;
    }
    save.money -= car.price;
    ensureCarState(save, car.id);
    save.active = car.id;
    this.dirty = true;
    this.game.hud.setMoney(save.money);
    this.game.audio.buy();
    this._notice(`DELIVERED · ${car.brand} ${car.name}`);
    this._renderList();
    this._renderDetail(car);
    this.preview?.setCar(car, this._cosmeticsFor(car), true);
    this.game.autosave();
  }

  drive() {
    const car = CAR_BY_ID[this.selected];
    if (!car) return;
    const save = this.game.save;
    if (!save.owned[car.id] || save.active === car.id) return;
    save.active = car.id;
    this.dirty = true;
    this.game.audio.ui();
    this._renderList();
    this._renderDetail(car);
    this._notice(`NOW DRIVING · ${car.brand} ${car.name}`);
    this.game.autosave();
  }
}
