import { uid } from './util.js';
import * as db from './db.js';
import { rasterize } from './files.js';
import { normalizeProject } from './model.js';

/* ---------------- data helpers ---------------- */
const imgCache = new Map();
export const getImage = docId => {
  if (!imgCache.has(docId)) imgCache.set(docId, db.get('docs', docId).then(d => d ? createImageBitmap(d.blob) : null));
  return imgCache.get(docId);
};
export const saveNow = p => { p.updated = Date.now(); return db.put('projects', JSON.parse(JSON.stringify(p))); };
export const loadProject = async id => { const p = await db.get('projects', id); return p && normalizeProject(p); };
export const countSyms = p => p.levels.reduce((n, l) => n + l.symbols.length, 0);
export async function storeDoc({ projectId, levelId = null, category, file, blob, role = 'original', name }) {
  const b = blob || file;
  const d = { id: uid('doc'), projectId, levelId, category, role, name: name || file.name, mime: b.type || 'application/octet-stream', size: b.size, blob: b, created: Date.now() };
  await db.put('docs', d); return d;
}
export async function addUnderlay(project, level, kind, file, page = 1) {
  const r = await rasterize(file, page);
  const orig = await storeDoc({ projectId: project.id, levelId: level.id, category: ({ plan: 'floorplan', elec: 'situatieschema', site: 'site' })[kind], file });
  const ul = await storeDoc({ projectId: project.id, levelId: level.id, category: ({ plan: 'floorplan', elec: 'situatieschema', site: 'site' })[kind], blob: r.blob, role: 'underlay', name: file.name + '.png' });
  const ind = project.settings && project.settings.type === 'industrial';
  const pxPerM = r.paperPxPerMm ? r.paperPxPerMm * (ind ? 5 : 10) : Math.max(r.w, r.h) / (ind ? 70 : 14); // rough guess (1:200 / 1:100) – refined by OCR or calibration
  const prev = level.underlays.plan;
  level.underlays[kind] = { docId: ul.id, origId: orig.id, w: r.w, h: r.h, pxPerM, ox: prev && kind !== 'plan' ? prev.ox : 0, oy: prev && kind !== 'plan' ? prev.oy : 0, calibrated: false, paperPxPerMm: r.paperPxPerMm };
}

