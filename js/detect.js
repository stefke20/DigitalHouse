// Heuristic wall / opening detection on a raster floor plan (axis-aligned walls only).
// Handles: solid-filled walls and double-line walls. Gaps in a wall become door / window / opening candidates.
import { uid } from './util.js';

function otsu(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2;
    if (v > best) { best = v; th = t; }
  }
  return Math.min(190, Math.max(70, th));
}

// merge-by-rows extraction of horizontal bands from a binary mask
function bands(mask, W, H, minLen, tol = 2) {
  let active = []; const out = [];
  for (let y = 0; y < H; y++) {
    const runs = [];
    let s = -1, gap = 0, last = -1;
    for (let x = 0; x <= W; x++) {
      const d = x < W && mask[y * W + x];
      if (d) { if (s < 0) s = x; gap = 0; last = x; }
      else if (s >= 0) {
        gap++;
        if (x >= W || gap > 1) { if (last + 1 - s >= minLen) runs.push([s, last + 1]); s = -1; gap = 0; }
      }
    }
    const next = [];
    for (const [a0, a1] of runs) {
      const r = active.find(r => !r.t && Math.abs(r.a0 - a0) <= tol && Math.abs(r.a1 - a1) <= tol);
      if (r) { r.t = 1; r.c1 = y + 1; r.a0 = Math.min(r.a0, a0); r.a1 = Math.max(r.a1, a1); next.push(r); }
      else next.push({ a0, a1, c0: y, c1: y + 1, t: 1 });
    }
    for (const r of active) if (!r.t) out.push(r);
    for (const r of next) r.t = 0;
    active = next;
  }
  return out.concat(active);
}
function mergeRects(rs, maxThick) {
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      const cOv = Math.min(a.c1, b.c1) - Math.max(a.c0, b.c0);
      const aOv = Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0);
      const sh = Math.min(a.a1 - a.a0, b.a1 - b.a0);
      if (cOv >= -1 && aOv >= 0.7 * sh) {
        const m = { a0: Math.min(a.a0, b.a0), a1: Math.max(a.a1, b.a1), c0: Math.min(a.c0, b.c0), c1: Math.max(a.c1, b.c1) };
        if (m.c1 - m.c0 <= maxThick) { rs[i] = m; rs.splice(j, 1); changed = true; break outer; }
      }
    }
  }
  return rs;
}

/**
 * @param {HTMLCanvasElement|ImageBitmap} src  plan raster
 * @param {number} pxPerM  pixels per metre of the raster
 * @returns {{walls:Array, openings:Array}} in metres, relative to the raster's top-left corner
 */
export function detectWalls(src, pxPerM, { sensitivity = 0 } = {}) {
  const sw = src.width, sh = src.height;
  const f = Math.max(1, Math.floor(pxPerM / 60));       // min-pool factor so thin lines survive
  const W = Math.floor(sw / f), H = Math.floor(sh / f);
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sw, sh); ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  const gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 255;
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
      const k = ((y * f + dy) * sw + x * f + dx) * 4;
      const g = (data[k] * 3 + data[k + 1] * 6 + data[k + 2]) / 10 * (data[k + 3] / 255) + 255 * (1 - data[k + 3] / 255);
      if (g < m) m = g;
    }
    gray[y * W + x] = m;
  }
  const th = otsu(gray) + sensitivity;
  const mask = new Uint8Array(W * H); const maskT = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (gray[y * W + x] < th) { mask[y * W + x] = 1; maskT[x * H + y] = 1; }

  const q = pxPerM / f;                                   // work-grid cells per metre
  const minLen = Math.max(6, Math.round(0.6 * q));
  const thinMax = Math.max(2, Math.round(0.06 * q));
  const solidMax = Math.round(0.6 * q);
  const orient = (rs, o) => {
    rs = mergeRects(rs, solidMax);
    const thin = rs.filter(r => r.c1 - r.c0 <= thinMax), solid = rs.filter(r => r.c1 - r.c0 > thinMax && r.c1 - r.c0 <= solidMax);
    const out = solid.map(r => ({ ...r, o }));
    // pair parallel thin lines into one wall
    const used = new Set();
    const cand = [];
    for (let i = 0; i < thin.length; i++) for (let j = i + 1; j < thin.length; j++) {
      const a = thin[i], b = thin[j];
      const [p, r] = a.c0 <= b.c0 ? [a, b] : [b, a];
      const gap = r.c0 - p.c1;
      const ov = Math.min(a.a1, b.a1) - Math.max(a.a0, b.a0);
      if (gap >= Math.max(2, 0.04 * q) && gap <= 0.55 * q && ov >= 0.75 * Math.min(a.a1 - a.a0, b.a1 - b.a0)) cand.push([gap, i, j]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    for (const [, i, j] of cand) {
      if (used.has(i) || used.has(j)) continue;
      used.add(i); used.add(j);
      const a = thin[i], b = thin[j];
      out.push({ o, a0: Math.min(a.a0, b.a0), a1: Math.max(a.a1, b.a1), c0: Math.min(a.c0, b.c0), c1: Math.max(a.c1, b.c1) });
    }
    return out;
  };
  const hr = orient(bands(mask, W, H, minLen), 'h');
  const vr = orient(bands(maskT, H, W, minLen), 'v').map(r => ({ o: 'v', a0: r.a0, a1: r.a1, c0: r.c0, c1: r.c1 }));
  // convert to metres. for h: a=x, c=y ; for v: a=y, c=x
  let ws = [];
  for (const r of hr.concat(vr)) {
    const t = (r.c1 - r.c0) / q, cc = (r.c0 + r.c1) / 2 / q, a0 = r.a0 / q, a1 = r.a1 / q;
    ws.push(r.o === 'h' ? { o: 'h', x1: a0, x2: a1, y1: cc, y2: cc, t, op: [] } : { o: 'v', x1: cc, x2: cc, y1: a0, y2: a1, t, op: [] });
  }
  // snap wall thickness / axes slightly: merge collinear walls and bridge gaps into openings
  const bx0 = Math.min(...ws.map(w => Math.min(w.x1, w.x2))), bx1 = Math.max(...ws.map(w => Math.max(w.x1, w.x2)));
  const by0 = Math.min(...ws.map(w => Math.min(w.y1, w.y2))), by1 = Math.max(...ws.map(w => Math.max(w.y1, w.y2)));
  let again = true;
  while (again) {
    again = false;
    outer: for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j];
      if (a.o !== b.o) continue;
      const h = a.o === 'h';
      const ax = h ? a.y1 : a.x1, bx = h ? b.y1 : b.x1;
      if (Math.abs(ax - bx) > 0.07 || Math.abs(a.t - b.t) > 0.08) continue;
      const [a0, a1] = h ? [a.x1, a.x2] : [a.y1, a.y2], [b0, b1] = h ? [b.x1, b.x2] : [b.y1, b.y2];
      const gap = Math.max(a0, b0) - Math.min(a1, b1);
      if (gap > 3.6) continue;
      if (gap > 0.04 && gap < 0.4) continue;
      const n0 = Math.min(a0, b0), n1 = Math.max(a1, b1);
      const ops = a.op.concat(b.op);
      if (gap >= 0.4) {
        const g0 = Math.min(a1, b1), g1 = Math.max(a0, b0), w = g1 - g0;
        const axis = (ax + bx) / 2;
        const exterior = (h ? Math.min(Math.abs(axis - by0), Math.abs(axis - by1)) : Math.min(Math.abs(axis - bx0), Math.abs(axis - bx1))) < 0.6;
        let type = 'door', sill = 0, hh = 2.1;
        if (w > 1.2) { type = exterior ? 'window' : 'opening'; if (type === 'window') { sill = 0.9; hh = 1.3; } }
        else if (exterior && w < 0.8) { type = 'window'; sill = 1.0; hh = 1.1; }
        ops.push({ s: g0, e: g1, type, sill, height: hh });
      }
      const m = h ? { o: 'h', x1: n0, x2: n1, y1: (ax + bx) / 2, y2: (ax + bx) / 2, t: Math.max(a.t, b.t), op: ops }
                  : { o: 'v', x1: (ax + bx) / 2, x2: (ax + bx) / 2, y1: n0, y2: n1, t: Math.max(a.t, b.t), op: ops };
      ws[i] = m; ws.splice(j, 1); again = true; break outer;
    }
  }
  // drop tiny walls, trim ends that are covered by a perpendicular wall (corner / T-joint overlap)
  ws = ws.filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) >= 0.5);
  const orig = ws.map(w => ({ ...w }));
  const touch = (px, py, o) => {
    const tol = 0.04;
    return orig.some(v => v.o !== o.o && px >= Math.min(v.x1, v.x2) - v.t / 2 - tol && px <= Math.max(v.x1, v.x2) + v.t / 2 + tol &&
      py >= Math.min(v.y1, v.y2) - v.t / 2 - tol && py <= Math.max(v.y1, v.y2) + v.t / 2 + tol &&
      (v.o === 'v' ? Math.abs(px - v.x1) <= v.t / 2 + tol : Math.abs(py - v.y1) <= v.t / 2 + tol));
  };
  const walls = [], openings = [];
  for (const o of ws) {
    const w = { id: uid('w'), x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, t: Math.round(o.t * 100) / 100 };
    const tr = o.t / 2;
    if (o.o === 'h') {
      const t1 = touch(o.x1, o.y1, o), t2 = touch(o.x2, o.y2, o);
      if (t1) w.x1 += tr; if (t2) w.x2 -= tr;
    } else {
      const t1 = touch(o.x1, o.y1, o), t2 = touch(o.x2, o.y2, o);
      if (t1) w.y1 += tr; if (t2) w.y2 -= tr;
    }
    walls.push(w);
    const start = o.o === 'h' ? o.x1 : o.y1, wstart = o.o === 'h' ? w.x1 : w.y1;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    for (const p of o.op) {
      const width = p.e - p.s, pos = (p.s + p.e) / 2 - wstart;
      if (pos < 0 || pos > len) continue;
      openings.push({ id: uid('o'), wallId: w.id, pos, width: Math.round(width * 100) / 100, sill: p.sill, height: p.height, type: p.type, detected: true });
    }
  }
  return { walls, openings };
}
