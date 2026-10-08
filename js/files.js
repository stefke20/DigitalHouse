// Turn uploaded plans (PDF / PNG / JPG / SVG ...) into a raster underlay.
let pdfjs;
async function pdf() {
  if (!pdfjs) {
    pdfjs = await import('../vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}
export const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const MAXPX = 4096;

export async function pdfPageCount(file) {
  const lib = await pdf();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  return doc.numPages;
}
const toBlob = c => new Promise(r => c.toBlob(r, 'image/png'));

function loadImg(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { res(im); };
    im.onerror = () => rej(new Error('Could not read image ' + file.name));
    im.src = url;
  });
}

// returns { blob, w, h, paperPxPerMm|null }
export async function rasterize(file, page = 1) {
  if (isPdf(file)) {
    const lib = await pdf();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const pg = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const v1 = pg.getViewport({ scale: 1 });
    const scale = Math.min(4, MAXPX / Math.max(v1.width, v1.height));
    const vp = pg.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return { blob: await toBlob(c), w: c.width, h: c.height, paperPxPerMm: scale * 72 / 25.4 };
  }
  const im = await loadImg(file);
  let w = im.naturalWidth || 1600, h = im.naturalHeight || 1200;
  const k = Math.min(1, MAXPX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(im, 0, 0, c.width, c.height);
  return { blob: await toBlob(c), w: c.width, h: c.height, paperPxPerMm: null };
}
