// Discover repeated symbols on a situatieschema: find symbol-sized blobs of ink (walls removed), group look-alikes,
// and let the user name each group once ("these 14 are double sockets").
export function discoverSymbols(bmp, pxPerM, walls, { maxClusters = 14 } = {}) {
  const sw = bmp.width, sh = bmp.height, f = Math.max(1, Math.floor(pxPerM / 60)), W = Math.floor(sw / f), H = Math.floor(sh / f), q = pxPerM / f;
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sw, sh); ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, sw, sh).data, gray = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let m = 255; for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) { const k = ((y * f + dy) * sw + x * f + dx) * 4, g = (d[k] * 3 + d[k + 1] * 6 + d[k + 2]) / 10; if (g < m) m = g; } gray[y * W + x] = m; }
  const hist = new Array(256).fill(0); for (const g of gray) hist[g]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let sB = 0, wB = 0, best = 0, th = 128;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = W * H - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  th = Math.min(185, Math.max(80, th));
  const ink = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) ink[i] = gray[i] < th ? 1 : 0;
  // erase the walls (they would glue wall devices to the wall)
  for (const w of walls) {
    const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); if (L < 1e-6) continue;
    const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L, hw = (w.t / 2 + .05) * q;
    const x1 = w.x1 * q, y1 = w.y1 * q, len = L * q;
    const bx0 = Math.max(0, Math.floor(Math.min(w.x1, w.x2) * q - hw - 2)), bx1 = Math.min(W - 1, Math.ceil(Math.max(w.x1, w.x2) * q + hw + 2)), by0 = Math.max(0, Math.floor(Math.min(w.y1, w.y2) * q - hw - 2)), by1 = Math.min(H - 1, Math.ceil(Math.max(w.y1, w.y2) * q + hw + 2));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const px = x - x1, py = y - y1, u = px * ux + py * uy, v = -px * uy + py * ux; if (u >= -hw && u <= len + hw && Math.abs(v) <= hw) ink[y * W + x] = 0; }
  }
  // connected components (8-neighbourhood)
  const seen = new Uint8Array(W * H), comps = [], stack = [], lo = .12 * q, hi = .9 * q;
  for (let k0 = 0; k0 < W * H; k0++) {
    if (!ink[k0] || seen[k0]) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, big = false; stack.push(k0); seen[k0] = 1;
    while (stack.length) {
      const k = stack.pop(), x = k % W, y = (k / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x1 - x0 > hi * 2 || y1 - y0 > hi * 2) big = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (a < 0 || b < 0 || a >= W || b >= H) continue; const kk = b * W + a; if (ink[kk] && !seen[kk]) { seen[kk] = 1; stack.push(kk); } }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (big || w < lo || h < lo || w > hi || h > hi || Math.max(w, h) / Math.min(w, h) > 3.5 || n < 10) continue;
    const fill = n / (w * h); if (fill < .08 || fill > .9) continue;
    comps.push({ x0, y0, w, h, cx: (x0 + w / 2) * f, cy: (y0 + h / 2) * f });
  }
  // descriptor: 16x16 ink density of the bounding box
  const desc = cp => {
    const out = new Float32Array(256);
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      let s = 0, cnt = 0; const ya = Math.floor(cp.y0 + j * cp.h / 16), yb = Math.max(ya + 1, Math.floor(cp.y0 + (j + 1) * cp.h / 16)), xa = Math.floor(cp.x0 + i * cp.w / 16), xb = Math.max(xa + 1, Math.floor(cp.x0 + (i + 1) * cp.w / 16));
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { s += ink[y * W + x]; cnt++; }
      out[j * 16 + i] = s / cnt;
    }
    return out;
  };
  const corr = (a, b) => { let ma = 0, mb = 0; for (let i = 0; i < 256; i++) { ma += a[i]; mb += b[i]; } ma /= 256; mb /= 256; let ab = 0, aa = 0, bb = 0; for (let i = 0; i < 256; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; } return aa && bb ? ab / Math.sqrt(aa * bb) : 0; };
  const clusters = [];
  for (const cp of comps) {
    cp.d = desc(cp); let hit = null;
    for (const cl of clusters) { const r = cl.rep; if (Math.abs(r.w - cp.w) / r.w < .25 && Math.abs(r.h - cp.h) / r.h < .25 && corr(r.d, cp.d) >= .85) { hit = cl; break; } }
    if (hit) hit.items.push({ px: cp.cx, py: cp.cy }); else clusters.push({ rep: cp, items: [{ px: cp.cx, py: cp.cy }] });
  }
  return clusters.filter(c => c.items.length >= 2).sort((a, b) => b.items.length - a.items.length).slice(0, maxClusters).map(cl => {
    const r = cl.rep, t = document.createElement('canvas'), pad = 6 * f; const sx = Math.max(0, r.x0 * f - pad), sy = Math.max(0, r.y0 * f - pad), sw2 = r.w * f + 2 * pad, sh2 = r.h * f + 2 * pad;
    t.width = 56; t.height = 56; const x = t.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 56, 56); const k = Math.min(52 / sw2, 52 / sh2); x.drawImage(c, sx, sy, sw2, sh2, (56 - sw2 * k) / 2, (56 - sh2 * k) / 2, sw2 * k, sh2 * k);
    return { count: cl.items.length, items: cl.items, thumb: t.toDataURL(), sizeM: [r.w / q, r.h / q] };
  });
}
