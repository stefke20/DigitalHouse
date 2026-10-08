import { roomGrid, roomAt, sortedLevels, wallLen } from './model.js';
import { getSymbol } from './symbols.js';

/** floor areas, volumes, daylight ratios per room – derived from the walls (rooms = spaces enclosed by walls) */
export function computeStats(project) {
  const out = { levels: [], gfa: 0, volume: 0, rooms: 0, windows: 0, doors: 0, symbols: 0 };
  for (const lv of sortedLevels(project)) {
    const g = roomGrid(lv), L = { id: lv.id, name: lv.name, height: lv.height, rooms: [], area: 0, wallLen: lv.walls.reduce((a, w) => a + wallLen(w), 0), windows: lv.openings.filter(o => o.type === 'window').length, doors: lv.openings.filter(o => o.type !== 'window').length, symbols: lv.symbols.length };
    if (g) {
      const byId = new Map();
      for (const r of g.rooms.values()) if (!r.exterior && r.area >= 1.5) byId.set(r.id, { id: r.id, area: r.area, names: [], windowArea: 0, cx: r.cx, cy: r.cy });
      for (const t of lv.rooms) { const id = roomAt(g, t.x, t.y); if (byId.has(id)) byId.get(id).names.push(t.text); }
      for (const o of lv.openings) {
        if (o.type !== 'window') continue;
        const w = lv.walls.find(x => x.id === o.wallId); if (!w) continue;
        const l = wallLen(w) || 1, ux = (w.x2 - w.x1) / l, uy = (w.y2 - w.y1) / l, px = w.x1 + ux * o.pos, py = w.y1 + uy * o.pos;
        for (const s of [1, -1]) { const id = roomAt(g, px - uy * s * (w.t / 2 + .35), py + ux * s * (w.t / 2 + .35)); if (byId.has(id)) { byId.get(id).windowArea += o.width * o.height; break; } }
      }
      let k = 0;
      for (const r of [...byId.values()].sort((a, b) => b.area - a.area)) { k++; L.rooms.push({ name: r.names.join(' + ') || `Room ${k}`, area: r.area, daylight: r.windowArea ? r.windowArea / r.area : 0, windowArea: r.windowArea, cx: r.cx, cy: r.cy }); L.area += r.area; }
    }
    out.levels.push(L); out.gfa += L.area; out.volume += L.area * lv.height; out.rooms += L.rooms.length; out.windows += L.windows; out.doors += L.doors; out.symbols += L.symbols;
  }
  return out;
}

export function symbolInventory(project) {
  const rows = [];
  for (const lv of sortedLevels(project)) {
    const g = roomGrid(lv);
    const names = new Map(); if (g) for (const t of lv.rooms) { const id = roomAt(g, t.x, t.y); if (id) names.set(id, (names.get(id) ? names.get(id) + ' + ' : '') + t.text); }
    for (const s of lv.symbols) {
      const d = getSymbol(s.type); if (!d) continue;
      const id = g ? roomAt(g, s.type && d.mount === 'wall' ? s.x + Math.cos(s.angle || 0) * .4 : s.x, d.mount === 'wall' ? s.y + Math.sin(s.angle || 0) * .4 : s.y) : 0;
      rows.push({ level: lv.name, room: names.get(id) || (id ? `Room ${id}` : ''), nl: d.nl, en: d.en, fr: d.fr, cat: d.cat, circuit: s.circuit || '', label: s.label || '', x: s.x, y: s.y, z: s.z ?? d.h, type: s.type });
    }
  }
  return rows;
}
