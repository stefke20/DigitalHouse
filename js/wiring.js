// Auto-wiring: decide which switch controls which lights. Heuristic: a switch controls the lights of the space it
// faces (rooms joined by doorways count as one space). Results are stored on the symbols (ctl / ctl2) and stay editable.
import { roomGrid, roomAt } from './model.js';
import { getSymbol } from './symbols.js';

export const isLamp = d => !!d && ['lamp', 'wlamp', 'tube', 'spot', 'highbay'].includes(d.model);
export const isSwitch = d => !!d && (d.cat === 'switch' && d.id !== 'sw_shutter');
const MAIN = d => ['lamp', 'tube', 'highbay'].includes(d.model);

export function autoWire(project, { force = false } = {}) {
  let groups = 0, linked = 0;
  for (const lv of project.levels) {
    const g = roomGrid(lv); if (!g) continue;
    lv.groupNames = force ? {} : (lv.groupNames || {});
    const byComp = new Map();
    const slot = id => byComp.get(id) || (byComp.set(id, { lamps: [], sw: [] }), byComp.get(id));
    for (const s of lv.symbols) {
      const d = getSymbol(s.type); if (!d) continue;
      if (isLamp(d)) { const c = roomAt(g, s.x, s.y); if (c) slot(c).lamps.push({ s, d }); }
      else if (isSwitch(d)) {
        const wallDev = d.mount === 'wall', a = s.angle || 0;
        const c = roomAt(g, wallDev ? s.x + Math.cos(a) * .4 : s.x, wallDev ? s.y + Math.sin(a) * .4 : s.y);
        if (c) slot(c).sw.push({ s, d });
      }
    }
    for (const [cid, { lamps, sw }] of byComp) {
      if (!sw.length || !lamps.length) continue;
      const G = 'g' + cid, rm = g.rooms.get(cid);
      const names = lv.rooms.filter(r => roomAt(g, r.x, r.y) === cid).map(r => r.text);
      lv.groupNames[G] = names.length ? names.join(' + ') : `Room ${cid} (${rm.area.toFixed(0)} m²)`;
      const main = lamps.filter(l => MAIN(l.d)), accent = lamps.filter(l => !MAIN(l.d));
      const split = main.length && accent.length && sw.some(x => x.s.type === 'sw_double');
      for (const l of lamps) if (force || !l.s.ctl) { l.s.ctl = split && !MAIN(l.d) ? G + 'b' : G; linked++; }
      if (split) lv.groupNames[G + 'b'] = lv.groupNames[G] + ' (accent)';
      for (const x of sw) if (force || !x.s.ctl) { x.s.ctl = G; if (x.s.type === 'sw_double') x.s.ctl2 = split ? G + 'b' : G; }
      groups++;
    }
  }
  return { groups, linked };
}
export const needsWiring = project => project.levels.some(l => l.symbols.some(s => { const d = getSymbol(s.type); return d && isSwitch(d) && !s.ctl; }) && l.symbols.some(s => isLamp(getSymbol(s.type))));
