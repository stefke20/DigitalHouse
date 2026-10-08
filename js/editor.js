import { uid, clamp } from './util.js';
import { wallExtensions, wallLen, distPtSeg } from './model.js';
import { getSymbol, symbolImage, CATEGORIES } from './symbols.js';
import { detectWalls } from './detect.js';

export const OPENING_DEFAULTS = {
  door: { width: .9, sill: 0, height: 2.05 }, window: { width: 1.2, sill: .9, height: 1.3 },
  opening: { width: 1.5, sill: 0, height: 2.1 }, garage: { width: 2.4, sill: 0, height: 2.1 },
};

export class Editor {
  constructor(host, { project, getImage, onChange, onSelect, onTool, onStatus, onLevel }) {
    this.project = project; this.getImage = getImage;
    this.cb = { onChange: onChange || (() => { }), onSelect: onSelect || (() => { }), onTool: onTool || (() => { }), onStatus: onStatus || (() => { }), onLevel: onLevel || (() => { }) };
    this.canvas = document.createElement('canvas'); host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.view = { cx: 5, cy: 4, s: 60 };
    this.tool = 'select'; this.symbolId = null; this.symAngle = 0; this.underlay = 'plan'; this.underlayOpacity = .6;
    this.showBelow = true; this.snapGrid = true; this.sel = null; this.hover = null; this.drag = null; this.drawing = null; this.calib = null;
    this.openingType = 'door'; this.undoStack = []; this.redoStack = []; this.bitmaps = {}; this.mouse = { x: 0, y: 0, wx: 0, wy: 0 };
    this.level = null; this.fitted = false;
    this.ro = new ResizeObserver(() => { this.resize(); this.draw(); }); this.ro.observe(host);
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this.pdown(e)); c.addEventListener('pointermove', e => this.pmove(e));
    c.addEventListener('pointerup', e => this.pup(e)); c.addEventListener('pointercancel', e => this.pup(e));
    c.addEventListener('wheel', e => this.wheel(e), { passive: false });
    c.addEventListener('dblclick', () => { if (this.tool === 'wall') this.drawing = null; this.draw(); });
    c.addEventListener('contextmenu', e => { e.preventDefault(); this.drawing = null; this.calib = null; this.draw(); });
    this.keyh = e => this.key(e); window.addEventListener('keydown', this.keyh);
    this.resize();
  }
  destroy() { window.removeEventListener('keydown', this.keyh); this.ro.disconnect(); this.canvas.remove(); }

  /* ---------- state ---------- */
  setLevel(id) {
    this.level = this.project.levels.find(l => l.id === id) || this.project.levels[0] || null;
    this.sel = null; this.drawing = null; this.calib = null; this.cb.onSelect(null);
    this.undoStack = []; this.redoStack = [];
    if (this.level) {
      if (!this.level.underlays[this.underlay]) this.underlay = this.level.underlays.plan ? 'plan' : this.level.underlays.elec ? 'elec' : 'none';
      this.loadBitmaps().then(() => { if (!this.fitted || this._fitFor !== id) { this.fit(); } this.draw(); });
    }
    this.cb.onLevel(this.level); this.draw();
  }
  async loadBitmaps() {
    if (!this.level) return;
    for (const k of ['plan', 'elec']) {
      const u = this.level.underlays[k];
      if (u && !this.bitmaps[u.docId]) this.bitmaps[u.docId] = await this.getImage(u.docId);
    }
  }
  setTool(t) { this.tool = t; this.drawing = null; this.calib = null; this.canvas.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair'; this.cb.onTool(t); this.status(); this.draw(); }
  setSymbol(id) { this.symbolId = id; this.setTool('symbol'); }
  setUnderlay(k) { this.underlay = k; this.draw(); }
  changed() { this.project.updated = Date.now(); this.cb.onChange(); }
  snapshot() { const l = this.level; return JSON.stringify({ id: l.id, walls: l.walls, openings: l.openings, symbols: l.symbols, underlays: l.underlays }); }
  pushUndo() { if (!this.level) return; this.undoStack.push(this.snapshot()); if (this.undoStack.length > 60) this.undoStack.shift(); this.redoStack = []; }
  restore(s) { const o = JSON.parse(s), l = this.project.levels.find(x => x.id === o.id); if (!l) return; Object.assign(l, { walls: o.walls, openings: o.openings, symbols: o.symbols, underlays: o.underlays }); this.sel = null; this.cb.onSelect(null); this.changed(); this.draw(); }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); }

  /* ---------- geometry ---------- */
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    this.W = r.width; this.H = r.height; this.canvas.width = r.width * d; this.canvas.height = r.height * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  w2s(x, y) { return [(x - this.view.cx) * this.view.s + this.W / 2, (y - this.view.cy) * this.view.s + this.H / 2]; }
  s2w(x, y) { return [(x - this.W / 2) / this.view.s + this.view.cx, (y - this.H / 2) / this.view.s + this.view.cy]; }
  zoomBy(f, sx = this.W / 2, sy = this.H / 2) {
    const [wx, wy] = this.s2w(sx, sy);
    this.view.s = clamp(this.view.s * f, 4, 1200);
    const [nx, ny] = this.s2w(sx, sy); this.view.cx += wx - nx; this.view.cy += wy - ny; this.draw();
  }
  fit() {
    const l = this.level; if (!l) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (const w of l.walls) { add(w.x1, w.y1); add(w.x2, w.y2); }
    const u = l.underlays[this.underlay];
    if (u) { add(u.ox, u.oy); add(u.ox + u.w / u.pxPerM, u.oy + u.h / u.pxPerM); }
    if (x0 > x1) { x0 = 0; y0 = 0; x1 = 10; y1 = 8; }
    this.view.cx = (x0 + x1) / 2; this.view.cy = (y0 + y1) / 2;
    this.view.s = clamp(Math.min(this.W / (x1 - x0 + 2), this.H / (y1 - y0 + 2)), 4, 1200);
    this.fitted = true; this._fitFor = l.id; this.draw();
  }
  snapPt(wx, wy, { from = null, noGrid = false } = {}) {
    const l = this.level, tol = 10 / this.view.s;
    let best = null, bd = tol;
    for (const w of l.walls) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) { const d = Math.hypot(x - wx, y - wy); if (d < bd) { bd = d; best = [x, y, 'end']; } }
    if (best) return best;
    if (from) { // ortho assist
      const dx = wx - from[0], dy = wy - from[1];
      if (Math.abs(dy) < Math.abs(dx) * 0.09) wy = from[1]; else if (Math.abs(dx) < Math.abs(dy) * 0.09) wx = from[0];
    }
    for (const w of l.walls) { const r = distPtSeg(wx, wy, w.x1, w.y1, w.x2, w.y2); if (r.d < tol * .8) return [r.qx, r.qy, 'on']; }
    if (this.snapGrid && !noGrid) return [Math.round(wx / .05) * .05, Math.round(wy / .05) * .05, 'grid'];
    return [wx, wy, 'free'];
  }
  nearestWall(wx, wy, maxD) {
    let best = null;
    for (const w of this.level.walls) {
      const r = distPtSeg(wx, wy, w.x1, w.y1, w.x2, w.y2);
      if (r.d <= maxD && (!best || r.d < best.d)) best = { w, ...r, L: wallLen(w) };
    }
    return best;
  }
  wallSnapForSymbol(wx, wy) {
    const n = this.nearestWall(wx, wy, 0.8); if (!n) return null;
    const { w } = n, ux = (w.x2 - w.x1) / n.L, uy = (w.y2 - w.y1) / n.L, nx = -uy, ny = ux;
    const side = ((wx - n.qx) * nx + (wy - n.qy) * ny) >= 0 ? 1 : -1;
    const off = w.t / 2 + .01;
    const t = clamp(n.t, 0, 1);
    return { x: n.qx + nx * side * off, y: n.qy + ny * side * off, angle: Math.atan2(ny * side, nx * side), wall: w, along: t * n.L };
  }

  /* ---------- hit testing ---------- */
  hit(wx, wy) {
    const l = this.level, px = 1 / this.view.s;
    for (let i = l.symbols.length - 1; i >= 0; i--) { const s = l.symbols[i]; if (Math.hypot(s.x - wx, s.y - wy) < Math.max(.2, 10 * px)) return { type: 'symbol', id: s.id, item: s }; }
    for (const o of l.openings) {
      const w = l.walls.find(x => x.id === o.wallId); if (!w) continue;
      const L = wallLen(w), ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
      const cx = w.x1 + ux * o.pos, cy = w.y1 + uy * o.pos;
      const du = Math.abs((wx - cx) * ux + (wy - cy) * uy), dv = Math.abs(-(wx - cx) * uy + (wy - cy) * ux);
      if (du <= o.width / 2 && dv <= w.t / 2 + 6 * px) return { type: 'opening', id: o.id, item: o, wall: w };
    }
    let best = null;
    for (const w of l.walls) { const r = distPtSeg(wx, wy, w.x1, w.y1, w.x2, w.y2); if (r.d <= w.t / 2 + 5 * px && (!best || r.d < best.d)) best = { d: r.d, type: 'wall', id: w.id, item: w }; }
    return best;
  }
  select(h) { this.sel = h; this.cb.onSelect(h); this.draw(); }
  deleteSelected() {
    if (!this.sel) return; this.pushUndo(); const l = this.level, { type, id } = this.sel;
    if (type === 'wall') { l.walls = l.walls.filter(w => w.id !== id); l.openings = l.openings.filter(o => o.wallId !== id); }
    if (type === 'opening') l.openings = l.openings.filter(o => o.id !== id);
    if (type === 'symbol') l.symbols = l.symbols.filter(s => s.id !== id);
    this.select(null); this.changed();
  }
  update(patch) { if (!this.sel) return; this.pushUndo(); Object.assign(this.sel.item, patch); this.changed(); this.draw(); }

  /* ---------- pointer ---------- */
  pos(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  pdown(e) {
    if (!this.level) return;
    this.canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = this.pos(e), [wx, wy] = this.s2w(sx, sy);
    if (e.button === 1 || e.button === 2 || this.tool === 'pan' || this.space) { this.drag = { kind: 'pan', sx, sy, cx: this.view.cx, cy: this.view.cy }; this.canvas.style.cursor = 'grabbing'; return; }
    const t = this.tool;
    if (t === 'select') {
      // wall endpoint handles
      if (this.sel && this.sel.type === 'wall') {
        const w = this.sel.item;
        for (const k of [1, 2]) if (Math.hypot(w['x' + k] - wx, w['y' + k] - wy) < 9 / this.view.s) { this.pushUndo(); this.drag = { kind: 'end', w, k }; return; }
      }
      const h = this.hit(wx, wy); this.select(h);
      if (h) { this.pushUndo(); this.drag = { kind: 'move', h, wx, wy, orig: JSON.parse(JSON.stringify(h.item)), moved: false }; }
      else this.drag = { kind: 'pan', sx, sy, cx: this.view.cx, cy: this.view.cy };
    } else if (t === 'wall') {
      const p = this.snapPt(wx, wy, { from: this.drawing ? [this.drawing.x, this.drawing.y] : null, noGrid: e.altKey });
      if (!this.drawing) this.drawing = { x: p[0], y: p[1] };
      else {
        if (Math.hypot(p[0] - this.drawing.x, p[1] - this.drawing.y) > .05) {
          this.pushUndo();
          const nw = { id: uid('w'), x1: this.drawing.x, y1: this.drawing.y, x2: p[0], y2: p[1], t: this.defaultT || .2 };
          this.level.walls.push(nw); this.changed(); this.select({ type: 'wall', id: nw.id, item: nw });
          this.drawing = { x: p[0], y: p[1] };
        }
      }
    } else if (['door', 'window', 'opening', 'garage'].includes(t)) {
      const n = this.nearestWall(wx, wy, .5);
      if (n) {
        const d = OPENING_DEFAULTS[t]; this.pushUndo();
        const o = { id: uid('o'), wallId: n.w.id, pos: clamp(n.t * n.L, d.width / 2, Math.max(d.width / 2, n.L - d.width / 2)), type: t, ...d };
        this.level.openings.push(o); this.changed(); this.select({ type: 'opening', id: o.id, item: o, wall: n.w });
      }
    } else if (t === 'symbol') {
      const def = getSymbol(this.symbolId); if (!def) return;
      const sn = def.mount === 'wall' ? this.wallSnapForSymbol(wx, wy) : null;
      this.pushUndo();
      const s = { id: uid('s'), type: def.id, x: sn ? sn.x : Math.round(wx / .05) * .05, y: sn ? sn.y : Math.round(wy / .05) * .05, angle: sn ? sn.angle : this.symAngle };
      this.level.symbols.push(s); this.changed(); this.select({ type: 'symbol', id: s.id, item: s });
    } else if (t === 'erase') {
      const h = this.hit(wx, wy); if (h) { this.sel = h; this.deleteSelected(); }
    } else if (t === 'calibrate') {
      const p = this.snapPt(wx, wy, { noGrid: true });
      if (!this.calib || this.calib.b) this.calib = { a: [p[0], p[1]] };
      else { this.calib.b = [p[0], p[1]]; this.cb.onTool('calibrate-ready'); }
    } else if (t === 'moveUnderlay') {
      const u = this.level.underlays[this.underlay]; if (u) { this.pushUndo(); this.drag = { kind: 'ul', u, wx, wy, ox: u.ox, oy: u.oy }; }
    } else if (t === 'alignLevel') {
      this.pushUndo(); this.drag = { kind: 'lvl', wx, wy, last: [wx, wy] };
    }
    this.draw();
  }
  pmove(e) {
    const [sx, sy] = this.pos(e), [wx, wy] = this.s2w(sx, sy);
    this.mouse = { x: sx, y: sy, wx, wy };
    const d = this.drag;
    if (d) {
      if (d.kind === 'pan') { this.view.cx = d.cx - (sx - d.sx) / this.view.s; this.view.cy = d.cy - (sy - d.sy) / this.view.s; }
      else if (d.kind === 'end') { const p = this.snapPt(wx, wy, { noGrid: e.altKey }); d.w['x' + d.k] = p[0]; d.w['y' + d.k] = p[1]; this.changed(); }
      else if (d.kind === 'ul') { d.u.ox = d.ox + wx - d.wx; d.u.oy = d.oy + wy - d.wy; }
      else if (d.kind === 'lvl') { this.shiftLevel(wx - d.last[0], wy - d.last[1]); d.last = [wx, wy]; }
      else if (d.kind === 'move') {
        const dx = wx - d.wx, dy = wy - d.wy, it = d.h.item;
        if (!d.moved && Math.hypot(dx, dy) * this.view.s < 3) return;
        d.moved = true;
        if (d.h.type === 'symbol') {
          const def = getSymbol(it.type), sn = def && def.mount === 'wall' ? this.wallSnapForSymbol(wx, wy) : null;
          if (sn) { it.x = sn.x; it.y = sn.y; it.angle = sn.angle; } else { it.x = Math.round((d.orig.x + dx) / .05) * .05; it.y = Math.round((d.orig.y + dy) / .05) * .05; }
        } else if (d.h.type === 'wall') {
          const sx2 = Math.round(dx / .05) * .05, sy2 = Math.round(dy / .05) * .05;
          it.x1 = d.orig.x1 + sx2; it.x2 = d.orig.x2 + sx2; it.y1 = d.orig.y1 + sy2; it.y2 = d.orig.y2 + sy2;
        } else if (d.h.type === 'opening') {
          const w = d.h.wall, L = wallLen(w), ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L;
          it.pos = clamp(((wx - w.x1) * ux + (wy - w.y1) * uy), it.width / 2, Math.max(it.width / 2, L - it.width / 2));
        }
        this.cb.onSelect(this.sel);
      }
      this.draw(); return;
    }
    if (['door', 'window', 'opening', 'garage', 'symbol', 'wall', 'calibrate', 'erase', 'select'].includes(this.tool)) this.draw();
    this.status();
  }
  pup(e) {
    if (this.drag) {
      const k = this.drag.kind;
      if (['move', 'end', 'ul', 'lvl'].includes(k)) { if (k !== 'move' || this.drag.moved) this.changed(); }
      this.drag = null; this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : this.tool === 'select' ? 'default' : 'crosshair';
    }
    this.draw();
  }
  wheel(e) { e.preventDefault(); const [sx, sy] = this.pos(e); this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0016)), sx, sy); }
  key(e) {
    if (!this.canvas.isConnected || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement && document.activeElement.tagName)) return;
    if (e.key === ' ') { this.space = e.type === 'keydown'; e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelected(); e.preventDefault(); }
    else if (e.key === 'Escape') { this.drawing = null; this.calib = null; this.select(null); this.setTool('select'); }
    else if (e.key.toLowerCase() === 'r') {
      if (this.tool === 'symbol') this.symAngle += Math.PI / 2;
      else if (this.sel && this.sel.type === 'symbol') this.update({ angle: (this.sel.item.angle || 0) + Math.PI / 2 });
      this.draw();
    } else if (!e.ctrlKey && !e.metaKey) {
      const m = { v: 'select', h: 'pan', w: 'wall', d: 'door', n: 'window', e: 'erase' }[e.key.toLowerCase()];
      if (m) this.setTool(m);
    }
  }
  shiftLevel(dx, dy) {
    const l = this.level;
    for (const w of l.walls) { w.x1 += dx; w.x2 += dx; w.y1 += dy; w.y2 += dy; }
    for (const s of l.symbols) { s.x += dx; s.y += dy; }
    for (const u of Object.values(l.underlays)) { u.ox += dx; u.oy += dy; }
  }
  status() {
    const { wx, wy } = this.mouse;
    const hints = { select: 'Click to select · drag to move · Del deletes', wall: 'Click to place wall points · double-click / Esc to finish · Alt = no snap', door: 'Click on a wall to place a door', window: 'Click on a wall to place a window', opening: 'Click on a wall to cut a doorway', garage: 'Click on a wall to place a garage door', symbol: 'Click to place · R rotates · wall devices snap to the nearest wall face', calibrate: 'Click two points with a known distance', moveUnderlay: 'Drag to move the plan image', alignLevel: 'Drag to shift this whole level', erase: 'Click an item to delete it', pan: 'Drag to pan' };
    this.cb.onStatus(`${wx.toFixed(2)} m, ${wy.toFixed(2)} m  ·  ${hints[this.tool] || ''}`);
  }

  /* ---------- scale / detection ---------- */
  applyCalibration(realMeters) {
    const u = this.level.underlays[this.underlay], c = this.calib;
    if (!u || !c || !c.b || !(realMeters > 0)) return false;
    this.pushUndo();
    const k = realMeters / Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    u.pxPerM /= k; u.ox = c.a[0] + (u.ox - c.a[0]) * k; u.oy = c.a[1] + (u.oy - c.a[1]) * k; u.calibrated = true;
    this.calib = null; this.changed(); this.draw(); return true;
  }
  setPaperScale(denom) {
    const u = this.level.underlays[this.underlay]; if (!u || !u.paperPxPerMm) return false;
    this.pushUndo(); u.pxPerM = u.paperPxPerMm * 1000 / denom; u.calibrated = true; this.changed(); this.draw(); return true;
  }
  async detect() {
    const u = this.level.underlays.plan; if (!u) throw new Error('No floor plan uploaded for this level');
    if (!u.calibrated) throw new Error('Set the scale first (Calibrate tool)');
    await this.loadBitmaps();
    const res = detectWalls(this.bitmaps[u.docId], u.pxPerM);
    this.pushUndo();
    for (const w of res.walls) { w.x1 += u.ox; w.x2 += u.ox; w.y1 += u.oy; w.y2 += u.oy; }
    this.level.walls = res.walls; this.level.openings = res.openings;
    this.level.detected = true; this.select(null); this.changed(); this.draw();
    return res;
  }
  autoAlign() {
    const lv = [...this.project.levels].sort((a, b) => a.order - b.order), i = lv.indexOf(this.level);
    const ref = [...lv.slice(0, i).reverse(), ...lv.slice(i + 1)].find(l => l.walls.length);
    const bb = l => ({ x0: Math.min(...l.walls.map(w => Math.min(w.x1, w.x2))), y0: Math.min(...l.walls.map(w => Math.min(w.y1, w.y2))) });
    if (!ref || !this.level.walls.length) return false;
    this.pushUndo(); const a = bb(ref), b = bb(this.level); this.shiftLevel(a.x0 - b.x0, a.y0 - b.y0); this.changed(); this.draw(); return true;
  }

  /* ---------- drawing ---------- */
  draw() {
    const ctx = this.ctx, l = this.level; if (!ctx || !this.W) return;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, this.W, this.H);
    this.drawGrid(ctx);
    if (!l) return;
    const v = this.view;
    ctx.save(); ctx.translate(this.W / 2 - v.cx * v.s, this.H / 2 - v.cy * v.s); ctx.scale(v.s, v.s);
    const u = l.underlays[this.underlay], bmp = u && this.bitmaps[u.docId];
    if (bmp) { ctx.globalAlpha = this.underlayOpacity; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, u.ox, u.oy, u.w / u.pxPerM, u.h / u.pxPerM); ctx.globalAlpha = 1; }
    if (this.showBelow) {
      const lv = [...this.project.levels].sort((a, b) => a.order - b.order), i = lv.indexOf(l);
      if (i > 0) { ctx.globalAlpha = .35; this.drawWalls(ctx, lv[i - 1], '#6b8bd6', true); ctx.globalAlpha = 1; }
    }
    this.drawWalls(ctx, l, bmp && this.underlayOpacity > .35 ? '#2563eb' : '#cbd5e1');
    ctx.restore();
    this.drawSymbols(ctx);
    this.drawOverlay(ctx);
  }
  drawGrid(ctx) {
    const v = this.view; let step = 1; while (step * v.s < 14) step *= 5; while (step * v.s > 90) step /= 5;
    const [x0, y0] = this.s2w(0, 0), [x1, y1] = this.s2w(this.W, this.H);
    ctx.lineWidth = 1;
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = this.w2s(x, 0); ctx.strokeStyle = Math.abs(x % (step * 5)) < 1e-6 ? '#1f2c46' : '#152036'; ctx.beginPath(); ctx.moveTo(Math.round(sx) + .5, 0); ctx.lineTo(Math.round(sx) + .5, this.H); ctx.stroke(); }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const [, sy] = this.w2s(0, y); ctx.strokeStyle = Math.abs(y % (step * 5)) < 1e-6 ? '#1f2c46' : '#152036'; ctx.beginPath(); ctx.moveTo(0, Math.round(sy) + .5); ctx.lineTo(this.W, Math.round(sy) + .5); ctx.stroke(); }
  }
  drawWalls(ctx, l, color, ghost = false) {
    const ext = wallExtensions(l);
    for (const w of l.walls) {
      const L = wallLen(w); if (L < .01) continue;
      const [e1, e2] = ext.get(w.id), a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
      ctx.save(); ctx.translate(w.x1, w.y1); ctx.rotate(a);
      const sel = !ghost && this.sel && this.sel.id === w.id;
      ctx.fillStyle = sel ? '#f59e0b' : color; ctx.fillRect(-e1, -w.t / 2, L + e1 + e2, w.t);
      if (!ghost) {
        for (const o of l.openings) {
          if (o.wallId !== w.id) continue;
          const s = o.pos - o.width / 2, osel = this.sel && this.sel.id === o.id;
          ctx.fillStyle = '#0b1220'; ctx.fillRect(s, -w.t / 2 - .005, o.width, w.t + .01);
          ctx.lineWidth = Math.max(.02, 1.5 / this.view.s); ctx.strokeStyle = osel ? '#f59e0b' : o.type === 'window' ? '#7dd3fc' : o.type === 'door' ? '#fbbf24' : '#94a3b8';
          if (o.type === 'window') { ctx.strokeRect(s, -w.t / 2, o.width, w.t); ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s + o.width, 0); ctx.stroke(); }
          else if (o.type === 'door') { ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, -o.width); ctx.stroke(); ctx.beginPath(); ctx.arc(s, 0, o.width, -Math.PI / 2, 0); ctx.stroke(); }
          else { ctx.setLineDash([.08, .06]); ctx.strokeRect(s, -w.t / 2, o.width, w.t); ctx.setLineDash([]); }
          if (osel) { ctx.strokeStyle = '#f59e0b'; ctx.strokeRect(s, -w.t / 2 - .04, o.width, w.t + .08); }
        }
      }
      ctx.restore();
      if (sel) { ctx.fillStyle = '#fff'; for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) { ctx.beginPath(); ctx.arc(x, y, 6 / this.view.s, 0, 7); ctx.fill(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 / this.view.s; ctx.stroke(); } }
    }
  }
  drawSymbol(ctx, def, sx, sy, angle, { alpha = 1, sel = false } = {}) {
    const r = Math.max(10, .17 * this.view.s), col = (CATEGORIES[def.cat] || CATEGORIES.custom).color;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#0b1220'; ctx.strokeStyle = sel ? '#f59e0b' : col; ctx.lineWidth = sel ? 3 : 1.8;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill(); ctx.stroke();
    const im = symbolImage(def, '#ffffff');
    if (im.complete && im.naturalWidth) ctx.drawImage(im, sx - r * .8, sy - r * .8, r * 1.6, r * 1.6);
    else im.onload = () => this.draw();
    if (def.mount === 'wall') { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - Math.cos(angle) * (r + 1), sy - Math.sin(angle) * (r + 1)); ctx.lineTo(sx + Math.cos(angle) * (r + 5), sy + Math.sin(angle) * (r + 5)); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  drawSymbols(ctx) {
    for (const s of this.level.symbols) {
      const def = getSymbol(s.type); if (!def) continue;
      const [x, y] = this.w2s(s.x, s.y);
      this.drawSymbol(ctx, def, x, y, s.angle || 0, { sel: this.sel && this.sel.id === s.id });
    }
  }
  drawOverlay(ctx) {
    const t = this.tool, m = this.mouse, v = this.view;
    if (!this.level || m.x === undefined) return;
    if (t === 'wall') {
      const p = this.snapPt(m.wx, m.wy, { from: this.drawing ? [this.drawing.x, this.drawing.y] : null });
      const [px, py] = this.w2s(p[0], p[1]);
      if (this.drawing) {
        const [ax, ay] = this.w2s(this.drawing.x, this.drawing.y);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = Math.max(2, (this.defaultT || .2) * v.s); ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke(); ctx.globalAlpha = 1;
        const len = Math.hypot(p[0] - this.drawing.x, p[1] - this.drawing.y);
        ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(len.toFixed(2) + ' m', px + 10, py - 10);
      }
      ctx.strokeStyle = p[2] === 'end' ? '#34d399' : '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, p[2] === 'end' ? 7 : 4, 0, 7); ctx.stroke();
    } else if (['door', 'window', 'opening', 'garage'].includes(t)) {
      const n = this.nearestWall(m.wx, m.wy, .5);
      if (n) {
        const d = OPENING_DEFAULTS[t], pos = clamp(n.t * n.L, d.width / 2, Math.max(d.width / 2, n.L - d.width / 2));
        ctx.save(); ctx.translate(...this.w2s(n.w.x1, n.w.y1)); ctx.rotate(Math.atan2(n.w.y2 - n.w.y1, n.w.x2 - n.w.x1)); ctx.scale(v.s, v.s);
        ctx.fillStyle = '#f59e0b88'; ctx.fillRect(pos - d.width / 2, -n.w.t / 2 - .05, d.width, n.w.t + .1); ctx.restore();
      }
    } else if (t === 'symbol') {
      const def = getSymbol(this.symbolId); if (!def) return;
      const sn = def.mount === 'wall' ? this.wallSnapForSymbol(m.wx, m.wy) : null;
      const [x, y] = sn ? this.w2s(sn.x, sn.y) : this.w2s(Math.round(m.wx / .05) * .05, Math.round(m.wy / .05) * .05);
      this.drawSymbol(ctx, def, x, y, sn ? sn.angle : this.symAngle, { alpha: .8 });
    } else if (t === 'calibrate' && this.calib) {
      const a = this.calib.a, b = this.calib.b || [m.wx, m.wy];
      const [ax, ay] = this.w2s(...a), [bx, by] = this.w2s(...b);
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      for (const [x, y] of [[ax, ay], [bx, by]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fillStyle = '#22d3ee'; ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2) + ' m (current scale)', (ax + bx) / 2 + 8, (ay + by) / 2 - 8);
    }
  }
}
