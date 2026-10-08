// "Drop everything, get a house": turns a bag of classified files into a finished project.
import { newProject, newLevel, presetsFor, sortedLevels } from './model.js';
import { storeDoc, addUnderlay, saveNow, getImage } from './store.js';
import { detectWalls } from './detect.js';
import { classify } from './classify.js';
import { isPdf, pdfPageTexts, rasterize } from './files.js';
import { autoWire } from './wiring.js';

let nid = 0;
/** look at the files → editable list of items (one per file, or per page for multi-page PDFs) */
export async function analyze(files, onProgress = () => { }) {
  const items = [];
  for (const file of files) {
    if (!/\.(pdf|png|jpe?g|gif|webp|bmp|svg|tiff?)$/i.test(file.name) && !file.type.startsWith('image/') && file.type !== 'application/pdf') {
      items.push({ id: ++nid, file, page: 1, name: file.name, ...classify(file.name), type: 'other', sure: true }); continue; // docx, xlsx … → library only
    }
    if (isPdf(file)) {
      onProgress(`Reading ${file.name}…`);
      let texts = []; try { texts = await pdfPageTexts(file); } catch { }
      if (texts.length <= 1) items.push({ id: ++nid, file, page: 1, name: file.name, ...classify(file.name, texts[0] || '') });
      else texts.forEach((t, i) => items.push({ id: ++nid, file, page: i + 1, name: `${file.name} – p.${i + 1}`, ...classify(file.name, t) }));
    } else items.push({ id: ++nid, file, page: 1, name: file.name, ...classify(file.name) });
  }
  // plans with no level hint: spread them over ground, first, second, … in file-name order
  const order = ['ground', 'first', 'second', 'attic'], taken = new Set(items.filter(i => i.type === 'plan' && i.level).map(i => i.level));
  for (const i of items.filter(i => i.type === 'plan' && !i.level).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    i.level = order.find(k => !taken.has(k)) || 'ground'; taken.add(i.level); i.guessed = true;
  }
  return items;
}

function inkBox(bmp) {
  const k = Math.min(1, 500 / Math.max(bmp.width, bmp.height)), t = document.createElement('canvas'); t.width = Math.round(bmp.width * k); t.height = Math.round(bmp.height * k);
  const x = t.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, t.width, t.height); x.drawImage(bmp, 0, 0, t.width, t.height);
  const d = x.getImageData(0, 0, t.width, t.height).data; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < t.height; y++) for (let xx = 0; xx < t.width; xx++) { const i = (y * t.width + xx) * 4; if (d[i] + d[i + 1] + d[i + 2] < 690) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  return x1 > x0 ? { x0: x0 / k, y0: y0 / k, x1: (x1 + 1) / k, y1: (y1 + 1) / k } : { x0: 0, y0: 0, x1: bmp.width, y1: bmp.height };
}
function shiftLevel(l, dx, dy) {
  for (const w of l.walls) { w.x1 += dx; w.x2 += dx; w.y1 += dy; w.y2 += dy; }
  for (const s of [...l.symbols, ...l.columns, ...l.rooms]) { s.x += dx; s.y += dy; }
  for (const u of Object.values(l.underlays)) { u.ox += dx; u.oy += dy; }
}

/**
 * @param {Array} items  from analyze() (user may have edited type / level / side)
 * @returns {Promise<object>} the saved project
 */
export async function buildProject(items, { name = 'My house', ptype = 'residential', onProgress = () => { } } = {}) {
  const p = newProject(name); p.settings.type = ptype;
  if (ptype === 'industrial') { p.settings.roofType = 'gable'; p.settings.roofPitch = 7; }
  const presets = presetsFor(ptype), report = [];
  const note = (text, status = 'ok') => report.push({ text, status });
  const levels = {};
  const lvl = kind => levels[kind] || (levels[kind] = (() => { const l = newLevel(presets.find(x => x.kind === kind) || presets[1]); p.levels.push(l); return l; })());
  const steps = items.length + 4; let done = 0; const tick = t => { onProgress(t, ++done / steps); };

  for (const it of items.filter(i => i.type === 'plan')) {
    const l = lvl(it.level || 'ground');
    if (l.underlays.plan) { tick('Storing ' + it.name); await storeDoc({ projectId: p.id, levelId: l.id, category: 'floorplan', file: it.file }); note(`${it.name}: a second plan for ${l.name} – stored in the library only`, 'warn'); continue; }
    tick(`Reading floor plan: ${it.name}`); await addUnderlay(p, l, 'plan', it.file, it.page);
  }
  if (!p.levels.length) throw new Error('No floor plan found among these files – mark at least one file as a floor plan.');
  const groundLevel = () => sortedLevels(p).find(l => l.order >= 0) || p.levels[0];
  for (const it of items.filter(i => i.type === 'elec')) {
    const l = it.level ? lvl(it.level) : groundLevel();
    if (l.underlays.elec) { await storeDoc({ projectId: p.id, levelId: l.id, category: 'situatieschema', file: it.file }); continue; }
    tick(`Reading situatieschema: ${it.name}`); await addUnderlay(p, l, 'elec', it.file, it.page); note(`Situatieschema for ${l.name} attached as an underlay – place symbols with the teach tool or 🔌 discover`);
  }
  const free = ['front', 'back', 'left', 'right'];
  for (const it of items.filter(i => i.type === 'facade')) {
    tick(`Facade drawing: ${it.name}`);
    const side = it.side && !p.facades[it.side] ? it.side : free.find(s => !p.facades[s]); if (!side) continue;
    const r = await rasterize(it.file, it.page), bmp = await createImageBitmap(r.blob);
    const orig = await storeDoc({ projectId: p.id, category: 'facade', file: it.file }), ul = await storeDoc({ projectId: p.id, category: 'facade', blob: r.blob, role: 'underlay', name: it.name + '.png' });
    p.facades[side] = { docId: ul.id, origId: orig.id, crop: inkBox(bmp) }; note(`Facade drawing “${it.name}” applied to the ${side} side` + (it.side ? '' : ' (side guessed – change it in the 3D tab)'), it.side ? 'ok' : 'warn');
  }
  for (const it of items.filter(i => i.type === 'site')) {
    const g = groundLevel(); if (g.underlays.site) continue;
    tick(`Site plan: ${it.name}`); await addUnderlay(p, g, 'site', it.file, it.page); note(`Site plan “${it.name}” will be shown on the ground – check its scale in Floor plans → Underlay: site plan`, 'warn');
  }
  const catOf = { single: 'eendraadschema', keuring: 'keuring', epc: 'epc', other: 'other' };
  for (const it of items.filter(i => catOf[i.type])) { tick('Storing ' + it.name); await storeDoc({ projectId: p.id, category: catOf[it.type], file: it.file }); }

  /* ---- interpret every level: scale (OCR) → walls → labels ---- */
  const sorted = sortedLevels(p); let scaleFrom = null;
  for (const l of sorted) {
    const u = l.underlays.plan; if (!u) continue;
    tick(`Interpreting ${l.name} (OCR + wall detection)…`);
    const bmp = await getImage(u.docId);
    let ocr = null;
    try { const { readPlanText } = await import('./ocr.js'); ocr = await readPlanText(bmp, { langs: 'nld+eng', thorough: false }); if (!ocr.scale || ocr.scale.votes < 2) ocr = await readPlanText(bmp, { langs: 'nld+eng', thorough: true }); } catch (e) { console.warn('OCR failed', e); }
    if (ocr && ocr.scale && ocr.scale.votes >= 2) { u.pxPerM = ocr.scale.pxPerM; u.calibrated = true; scaleFrom = { px: u.pxPerM, w: u.w, paper: u.paperPxPerMm }; note(`${l.name}: scale read from ${ocr.scale.votes} dimension labels (${u.pxPerM.toFixed(1)} px/m)`); }
    else if (scaleFrom && Math.abs(scaleFrom.w - u.w) / u.w < .1) { u.pxPerM = scaleFrom.px; u.calibrated = true; note(`${l.name}: no readable dimensions – scale copied from another level (same drawing size)`, 'warn'); }
    else note(`${l.name}: could not read a scale – used a rough guess. Calibrate it with the 📏 tool (one known length) for correct sizes`, 'warn');
    const res = detectWalls(bmp, u.pxPerM, { industrial: ptype === 'industrial' });
    for (const w of res.walls) { w.x1 += u.ox; w.x2 += u.ox; w.y1 += u.oy; w.y2 += u.oy; }
    l.walls = res.walls; l.openings = res.openings;
    if (res.walls.length >= 4) note(`${l.name}: ${res.walls.length} walls and ${res.openings.length} doors / windows / openings detected – please review`, u.calibrated ? 'ok' : 'warn');
    else note(`${l.name}: wall detection found little (${res.walls.length}). Draw or fix the walls in Floor plans`, 'warn');
    if (ocr) for (const t of ocr.labels) l.rooms.push({ id: 'r' + Math.random().toString(36).slice(2, 8), text: t.text, x: u.ox + t.x / u.pxPerM, y: u.oy + t.y / u.pxPerM });
    if (ocr && ocr.labels.length) note(`${l.name}: ${ocr.labels.length} room labels read (${ocr.labels.slice(0, 4).map(x => x.text).join(', ')}${ocr.labels.length > 4 ? '…' : ''})`);
  }
  /* ---- stack the levels on top of each other (top-left corner of the outer walls) ---- */
  const ref = sorted.find(l => l.order >= 0 && l.walls.length) || sorted.find(l => l.walls.length);
  if (ref) {
    const corner = l => ({ x: Math.min(...l.walls.map(w => Math.min(w.x1, w.x2))), y: Math.min(...l.walls.map(w => Math.min(w.y1, w.y2))) });
    const rc = corner(ref);
    for (const l of sorted) if (l !== ref && l.walls.length) { const c = corner(l); shiftLevel(l, rc.x - c.x, rc.y - c.y); }
    if (sorted.length > 1) note('Levels stacked on top of each other by aligning their outer-wall corners – check with the ⇱ tool if floors look shifted', 'warn');
    const g = groundLevel(), s = g.underlays.site; // centre the site plan on the building
    if (s) { const bx = (Math.min(...g.walls.map(w => w.x1)) + Math.max(...g.walls.map(w => w.x2))) / 2, by = (Math.min(...g.walls.map(w => w.y1)) + Math.max(...g.walls.map(w => w.y2))) / 2; s.ox = bx - s.w / s.pxPerM / 2; s.oy = by - s.h / s.pxPerM / 2; }
  }
  const aw = autoWire(p);
  tick('Saving…'); p.importReport = report; await saveNow(p);
  return p;
}
