// In-browser OCR (tesseract.js, vendored – works offline) + interpretation of the recognised text:
//  * dimension strings ("4.50", "450", "12,30 m") are paired with the dimension line they sit on → plan scale
//  * alphabetic words ("Keuken", "Magazijn", "Loods") become room labels
let tessP, worker, workerLangs;
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load OCR engine')); document.head.append(s); });
}
const base = new URL('../vendor/tesseract/', import.meta.url).href;
async function getWorker(langs, onProgress) {
  if (!window.Tesseract) await (tessP ||= loadScript(base + 'tesseract.min.js'));
  if (worker && workerLangs === langs) { worker.__cb.fn = onProgress; return worker; }
  if (worker) await worker.terminate();
  const cb = { fn: onProgress };
  worker = await window.Tesseract.createWorker(langs, 1, {
    workerPath: base + 'worker.min.js', corePath: base + 'core/', langPath: base + 'lang/', gzip: true,
    logger: m => cb.fn && cb.fn(m),
  });
  await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' }); // sparse text
  worker.__cb = cb; workerLangs = langs;
  return worker;
}
export async function stopOcr() { if (worker) { await worker.terminate(); worker = null; } }

function rotated(src, dir) { // dir: 1 = 90° clockwise, -1 = 90° counter-clockwise
  const c = document.createElement('canvas'); c.width = src.height; c.height = src.width;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  if (dir > 0) { x.translate(src.height, 0); x.rotate(Math.PI / 2); } else { x.translate(0, src.width); x.rotate(-Math.PI / 2); }
  x.drawImage(src, 0, 0); return c;
}
function toCanvas(bmp) {
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0); return c;
}
function wordsOf(data) {
  if (data.words && data.words.length) return data.words;
  const out = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) out.push(w);
  return out;
}
// map point from a rotated pass back to the original image
const back = (pass, W, H, x, y) => pass === 0 ? [x, y] : pass === 1 ? [y, H - x] : [W - y, x];

/** parse a dimension token → {v, unit|null} */
export function parseDim(t) {
  t = t.trim().replace(/[()[\]]/g, '').replace(/[oO](?=\d)|(?<=\d)[oO]/g, '0');
  const m = /^(\d{1,5}(?:[.,]\d{1,3})?)\s*(mm|cm|m)?$/i.exec(t);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return v > 0 ? { v, unit: m[2] ? m[2].toLowerCase() : null } : null;
}

function makeDark(canvas) {
  const W = canvas.width, H = canvas.height, d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const g = new Uint8Array(W * H); const hist = new Array(256).fill(0);
  for (let i = 0; i < W * H; i++) { const v = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10 | 0; g[i] = v; hist[v]++; }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = W * H - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  th = Math.min(185, Math.max(80, th));
  return { W, H, at: (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] < th };
}

/** For a horizontal number: find the dimension-line segment (between ticks) it labels. → length in px or null */
function dimSegment(D, w) {
  const { x0, y0, x1, y1 } = w.bbox, hh = y1 - y0, cx = Math.round((x0 + x1) / 2), at = D.at;
  let best = null;
  const rows = [];
  for (let y = y1 + 1; y <= y1 + Math.max(3, hh * 1.4); y++) rows.push(y);
  for (let y = y0 - 1; y >= y0 - Math.max(3, hh * 1.4); y--) rows.push(y);
  for (const y of rows) {
    if (!at(cx, y) && !at(cx - 3, y) && !at(cx + 3, y)) continue;
    let a = cx, b = cx, gap = 0;
    while (a > 0 && gap <= 2) { a--; gap = at(a, y) ? 0 : gap + 1; } a += gap;
    gap = 0; while (b < D.W - 1 && gap <= 2) { b++; gap = at(b, y) ? 0 : gap + 1; } b -= gap;
    const len = b - a;
    if (len < Math.max(1.5 * (x1 - x0), 3 * hh) || len > D.W * .9) continue;
    // thin-line test: pixels 3px above and below should mostly be light (walls are thick)
    let thin = 0, n = 0; for (let x = a + 2; x < b - 2; x += 6) { if (x > x0 - 2 && x < x1 + 2) continue; n++; if (!at(x, y - 3) && !at(x, y + 3)) thin++; }
    if (n < 3 || thin < n * .6) continue;
    if (!best || len > best.len) best = { a, b, y, len };
  }
  if (!best) return null;
  // ticks: columns where the line is crossed (dark above & below the line within ±5 px) – nearest left/right of the text
  const tick = x => { for (let dx = -4; dx <= 4; dx++) { if (at(x + dx, best.y - 5) || at(x + dx, best.y - 4)) { for (let ex = -4; ex <= 4; ex++) if (at(x + ex, best.y + 4) || at(x + ex, best.y + 5)) return true; } } return false; };
  let L = best.a, R = best.b;
  for (let x = x0 - 3; x > best.a + 4; x--) if (tick(x)) { let e = x; while (e > best.a && tick(e - 1)) e--; L = (x + e) / 2; break; }
  for (let x = x1 + 3; x < best.b - 4; x++) if (tick(x)) { let e = x; while (e < best.b && tick(e + 1)) e++; R = (x + e) / 2; break; }
  const seg = R - L;
  return seg > 1.2 * (x1 - x0) ? seg : null;
}

export function estimateScale(cands) {
  // cands: [{L (px), v, unit, conf}] → find the pxPerM supported by most dimension labels
  const hyps = [];
  for (const c of cands) {
    const units = c.unit === 'mm' ? [.001] : c.unit === 'cm' ? [.01] : c.unit === 'm' ? [1] : [1, .01, .001];
    for (const u of units) {
      const metres = c.v * u; if (metres < .3 || metres > 250) continue;
      const s = c.L / metres; if (s < 4 || s > 800) continue;
      hyps.push({ s, c, u });
    }
  }
  let best = null;
  for (const h of hyps) {
    const group = hyps.filter(o => Math.abs(Math.log(o.s / h.s)) < .035);
    const labels = new Set(group.map(g => g.c));
    const score = labels.size;
    if (!best || score > best.score) best = { score, s: h.s, group };
  }
  if (!best) return null;
  const sorted = best.group.map(g => g.s).sort((a, b) => a - b);
  return { pxPerM: sorted[sorted.length >> 1], votes: best.score, total: cands.length, unit: best.group[0].u === 1 ? 'm' : best.group[0].u === .01 ? 'cm' : 'mm' };
}

/**
 * @param {ImageBitmap} bmp plan raster
 * @param {{langs?:string, thorough?:boolean, onProgress?:(p:{stage:string,pct:number})=>void}} o
 * @returns {Promise<{dims:Array, labels:Array, scale:object|null, words:number}>}  coordinates in image pixels
 */
export async function readPlanText(bmp, { langs = 'nld+eng', thorough = true, onProgress = () => { } } = {}) {
  const src = toCanvas(bmp), W = src.width, H = src.height;
  const passes = thorough ? [0, 1, -1] : [0];
  let stage = 0;
  const wk = await getWorker(langs, m => onProgress({ stage: `Pass ${stage + 1}/${passes.length}: ${m.status}`, pct: (stage + (m.progress || 0)) / passes.length }));
  const dims = [], labels = [], cands = []; let nWords = 0;
  for (let i = 0; i < passes.length; i++) {
    stage = i;
    const p = passes[i] === 0 ? 0 : passes[i] === 1 ? 1 : 2;
    const cv = p === 0 ? src : rotated(src, passes[i]);
    const { data } = await wk.recognize(cv, {}, { blocks: true, text: false });
    const words = wordsOf(data), D = makeDark(cv);
    nWords += words.length;
    for (const w of words) {
      if (!w.bbox || w.confidence < 45) continue;
      const t = w.text.trim(); if (!t) continue;
      const bb = w.bbox, c1 = back(p, W, H, bb.x0, bb.y0), c2 = back(p, W, H, bb.x1, bb.y1);
      const box = { x0: Math.min(c1[0], c2[0]), y0: Math.min(c1[1], c2[1]), x1: Math.max(c1[0], c2[0]), y1: Math.max(c1[1], c2[1]) };
      const dm = parseDim(t);
      if (dm) {
        const L = (bb.x1 - bb.x0) >= (bb.y1 - bb.y0) ? dimSegment(D, w) : null;
        dims.push({ text: t, ...dm, box, L, conf: w.confidence });
        if (L) cands.push({ L, v: dm.v, unit: dm.unit, conf: w.confidence, text: t });
      } else if (p === 0 && /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'./-]{2,}$/.test(t) && w.confidence >= 50) {
        labels.push({ text: t, box, h: bb.y1 - bb.y0 });
      }
    }
  }
  // merge neighbouring words of one line into a phrase ("Slaap kamer 1")
  labels.sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
  const phrases = [];
  for (const l of labels) {
    const p = phrases.find(q => Math.abs(q.box.y0 - l.box.y0) < l.h * .6 && l.box.x0 - q.box.x1 < l.h * 1.2 && l.box.x0 >= q.box.x1 - 2);
    if (p) { p.text += ' ' + l.text; p.box.x1 = l.box.x1; } else phrases.push({ text: l.text, box: { ...l.box }, h: l.h });
  }
  return { dims, labels: phrases.map(p => ({ text: p.text, x: (p.box.x0 + p.box.x1) / 2, y: (p.box.y0 + p.box.y1) / 2 })), scale: estimateScale(cands), words: nWords };
}
