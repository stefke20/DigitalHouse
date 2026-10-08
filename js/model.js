import { uid } from './util.js';

export const LEVEL_PRESETS = [
  { kind: 'basement', name: 'Basement', order: -1, height: 2.4 },
  { kind: 'ground', name: 'Ground floor', order: 0, height: 2.6 },
  { kind: 'first', name: 'First floor', order: 1, height: 2.6 },
  { kind: 'second', name: 'Second floor', order: 2, height: 2.6 },
  { kind: 'attic', name: 'Attic', order: 3, height: 2.3 },
  { kind: 'custom', name: 'Other level', order: 4, height: 2.6 },
];

export function newLevel(preset = LEVEL_PRESETS[1], extra = {}) {
  return {
    id: uid('lv'), kind: preset.kind, name: preset.name, order: preset.order, height: preset.height, slab: 0.25,
    underlays: {}, // plan / elec : {docId,w,h,pxPerM,ox,oy,calibrated,paperPxPerMm}
    walls: [], openings: [], symbols: [], ...extra,
  };
}
export function newProject(name) {
  return { id: uid('pr'), name: name || 'My house', created: Date.now(), updated: Date.now(), levels: [], settings: { roof: true }, thumb: null };
}
export const sortedLevels = p => [...p.levels].sort((a, b) => a.order - b.order);

// elevation of the top of each floor slab (= where the walls start)
export function elevations(p) {
  const lv = sortedLevels(p);
  const out = {};
  if (!lv.length) return out;
  let gi = lv.findIndex(l => l.order >= 0);
  if (gi < 0) gi = lv.length - 1;
  out[lv[gi].id] = 0;
  for (let i = gi + 1; i < lv.length; i++) out[lv[i].id] = out[lv[i - 1].id] + lv[i - 1].height + lv[i].slab;
  for (let i = gi - 1; i >= 0; i--) out[lv[i].id] = out[lv[i + 1].id] - lv[i + 1].slab - lv[i].height;
  return out;
}

export const wallLen = w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
export function distPtSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return { d: Math.hypot(px - qx, py - qy), t, qx, qy };
}

// Walls that meet another wall are extended by half their thickness so corners close cleanly.
export function wallExtensions(level) {
  const res = new Map();
  for (const w of level.walls) {
    let e1 = 0, e2 = 0;
    for (const o of level.walls) {
      if (o === w) continue;
      const lim = (w.t + o.t) / 2 + 0.03;
      if (distPtSeg(w.x1, w.y1, o.x1, o.y1, o.x2, o.y2).d <= lim) e1 = w.t / 2;
      if (distPtSeg(w.x2, w.y2, o.x1, o.y1, o.x2, o.y2).d <= lim) e2 = w.t / 2;
    }
    res.set(w.id, [e1, e2]);
  }
  return res;
}

// Which grid cells of a level are "inside the house"? (flood fill from outside, walls dilated to seal gaps)
export function footprintCells(level, cell = 0.1) {
  if (!level.walls.length) return null;
  const ext = wallExtensions(level);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const w of level.walls) {
    x0 = Math.min(x0, w.x1, w.x2); x1 = Math.max(x1, w.x1, w.x2);
    y0 = Math.min(y0, w.y1, w.y2); y1 = Math.max(y1, w.y1, w.y2);
  }
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
  if (W * H > 4e6) return null;
  const wall = new Uint8Array(W * H);
  const dil = 0.06;
  for (const w of level.walls) {
    const [e1, e2] = ext.get(w.id), L = wallLen(w);
    if (L < 1e-6) continue;
    const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
    const hw = w.t / 2 + dil;
    const bx0 = Math.min(w.x1, w.x2) - hw - 0.5, bx1 = Math.max(w.x1, w.x2) + hw + 0.5;
    const by0 = Math.min(w.y1, w.y2) - hw - 0.5, by1 = Math.max(w.y1, w.y2) + hw + 0.5;
    for (let j = Math.max(0, Math.floor((by0 - y0) / cell)); j <= Math.min(H - 1, Math.floor((by1 - y0) / cell)); j++)
      for (let i = Math.max(0, Math.floor((bx0 - x0) / cell)); i <= Math.min(W - 1, Math.floor((bx1 - x0) / cell)); i++) {
        const px = x0 + (i + .5) * cell - w.x1, py = y0 + (j + .5) * cell - w.y1;
        const u = px * ux + py * uy, v = -px * uy + py * ux;
        if (u >= -e1 - dil && u <= L + e2 + dil && Math.abs(v) <= hw) wall[j * W + i] = 1;
      }
  }
  const out = new Uint8Array(W * H); // 1 = exterior
  const stack = [0];
  out[0] = 1;
  while (stack.length) {
    const k = stack.pop(), i = k % W, j = (k / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const n = b * W + a;
      if (out[n] || wall[n]) continue;
      out[n] = 1; stack.push(n);
    }
  }
  // interior = not exterior; shrink back the dilation by only keeping cells that are not within dil of the outside
  const rects = [];
  for (let j = 0; j < H; j++) {
    let s = -1;
    for (let i = 0; i <= W; i++) {
      const inside = i < W && !out[j * W + i];
      if (inside && s < 0) s = i;
      if (!inside && s >= 0) { rects.push({ x: x0 + s * cell, y: y0 + j * cell, w: (i - s) * cell, h: cell }); s = -1; }
    }
  }
  // merge identical consecutive rows
  const merged = [];
  const open = new Map();
  for (const r of rects.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const key = r.x.toFixed(3) + '|' + r.w.toFixed(3);
    const m = open.get(key);
    if (m && Math.abs(m.y + m.h - r.y) < 1e-6) { m.h += r.h; m.last = r.y; }
    else { const n = { ...r }; merged.push(n); open.set(key, n); }
  }
  return { rects: merged, bbox: { x0, y0, x1, y1 } };
}

export function projectBBox(p) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const l of p.levels) for (const w of l.walls) {
    x0 = Math.min(x0, w.x1, w.x2); x1 = Math.max(x1, w.x1, w.x2);
    y0 = Math.min(y0, w.y1, w.y2); y1 = Math.max(y1, w.y1, w.y2);
  }
  return x0 > x1 ? { x0: 0, y0: 0, x1: 10, y1: 8 } : { x0, y0, x1, y1 };
}
