// "Teach by example": the user boxes ONE symbol on the drawing; we find every look-alike by normalised
// cross-correlation. Works for any symbol style (Belgian, industrial, custom) because the template comes from
// the user's own drawing, not from our icon library.
/**
 * @param {ImageBitmap} bmp underlay raster
 * @param {{x0:number,y0:number,x1:number,y1:number}} box example box in image pixels
 * @returns {Array<{px:number,py:number,score:number}>} centres in image pixels
 */
export function findSimilar(bmp, box, { threshold = .72, maxHits = 500 } = {}) {
  const tw0 = box.x1 - box.x0, th0 = box.y1 - box.y0;
  if (tw0 < 4 || th0 < 4) return [];
  // work resolution: template about 20–32 px, image ≤ 1800 px
  let k = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const want = 24 / Math.max(tw0, th0); if (want > k) k = Math.min(want, 1.5);
  const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 255 - (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11); // ink = high
  const tx = Math.round(box.x0 * k), ty = Math.round(box.y0 * k), tw = Math.max(4, Math.round(tw0 * k)), th = Math.max(4, Math.round(th0 * k));
  const n = tw * th, T = new Float32Array(n);
  let tm = 0; for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) { const v = g[(ty + j) * W + tx + i] ?? 0; T[j * tw + i] = v; tm += v; }
  tm /= n; let tv = 0; for (let i = 0; i < n; i++) { T[i] -= tm; tv += T[i] * T[i]; }
  if (tv < 1) return [];
  const tsd = Math.sqrt(tv);
  // integral images for window mean / variance
  const I = new Float64Array((W + 1) * (H + 1)), I2 = new Float64Array((W + 1) * (H + 1));
  for (let j = 0; j < H; j++) { let r = 0, r2 = 0; for (let i = 0; i < W; i++) { const v = g[j * W + i]; r += v; r2 += v * v; I[(j + 1) * (W + 1) + i + 1] = I[j * (W + 1) + i + 1] + r; I2[(j + 1) * (W + 1) + i + 1] = I2[j * (W + 1) + i + 1] + r2; } }
  const box2 = (A, i, j) => A[(j + th) * (W + 1) + i + tw] - A[j * (W + 1) + i + tw] - A[(j + th) * (W + 1) + i] + A[j * (W + 1) + i];
  const hits = [];
  for (let j = 0; j + th <= H; j++) for (let i = 0; i + tw <= W; i++) {
    const s = box2(I, i, j), s2 = box2(I2, i, j), mean = s / n, vr = s2 - n * mean * mean;
    if (vr < tv * .25 || mean < 1) continue; // blank / far too different in contrast
    // quick reject on a sparse subset
    let q = 0;
    for (let b = 0; b < n; b += 5) { const jj = (b / tw) | 0, ii = b % tw; q += T[b] * (g[(j + jj) * W + i + ii] - mean); }
    if (q * 5 / (tsd * Math.sqrt(vr)) < threshold - .3) continue;
    let dot = 0; for (let jj = 0; jj < th; jj++) { const gi = (j + jj) * W + i, ti = jj * tw; for (let ii = 0; ii < tw; ii++) dot += T[ti + ii] * g[gi + ii]; }
    const score = dot / (tsd * Math.sqrt(vr));
    if (score >= threshold) hits.push({ px: (i + tw / 2) / k, py: (j + th / 2) / k, score });
  }
  hits.sort((a, b) => b.score - a.score);
  const out = [], r = Math.max(tw0, th0) * .6;
  for (const h of hits) { if (out.length >= maxHits) break; if (out.every(o => Math.hypot(o.px - h.px, o.py - h.py) > r)) out.push(h); }
  return out;
}
