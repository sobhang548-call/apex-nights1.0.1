import { computeStats } from '../data.js';
import { clamp } from '../util.js';

export function renderStats(el, def, upgrades) {
  if (!el) return;
  const s = computeStats(def, upgrades || {});
  const base = computeStats(def);
  const rows = [
    ['POWER', `${Math.round(s.power)} HP`, s.power / 1150, s.power > base.power + 0.5],
    ['0–100', `${s.accel.toFixed(2)} S`, 1 - (s.accel - 2.1) / 4.4, s.accel < base.accel - 0.005],
    ['TOP SPEED', `${Math.round(s.topSpeed)} KM/H`, s.topSpeed / 400, s.topSpeed > base.topSpeed + 0.5],
    ['GRIP', s.grip.toFixed(2), s.grip / 1.45, s.grip > base.grip + 0.005],
    ['BRAKES', s.brake.toFixed(2), s.brake / 1.42, s.brake > base.brake + 0.005],
    ['HANDLING', s.handling.toFixed(2), s.handling / 1.4, s.handling > base.handling + 0.005],
  ];
  el.innerHTML = rows.map(([label, val, fill, boost]) => `
    <div class="stat-row">
      <span>${label}</span>
      <div class="stat-bar"><div class="stat-fill${boost ? ' boost' : ''}" style="width:${Math.round(clamp(fill, 0.03, 1) * 100)}%"></div></div>
      <span class="stat-val">${val}</span>
    </div>`).join('');
}
