import { h, toast, modal, uid, debounce, fmtBytes, download } from './util.js';
import * as db from './db.js';
import { LEVEL_PRESETS, newLevel, newProject, sortedLevels, wallLen } from './model.js';
import { SYMBOLS, CATEGORIES, allSymbols, getSymbol, svgMarkup, loadCustomSymbols, saveCustomSymbol, removeCustomSymbol } from './symbols.js';
import { rasterize, isPdf, pdfPageCount } from './files.js';
import { demoProject } from './demo.js';

const view = document.getElementById('view');
let cleanup = null, pendingFiles = [];
const DOC_CATS = { floorplan: 'Grondplan (floor plan)', situatieschema: 'Situatieschema', eendraadschema: 'Eendraadschema (single-line diagram)', keuring: 'Keuringsverslag (AREI inspection)', epc: 'EPC / energy certificate', other: 'Other' };

/* ---------------- data helpers ---------------- */
const imgCache = new Map();
const getImage = docId => {
  if (!imgCache.has(docId)) imgCache.set(docId, db.get('docs', docId).then(d => d ? createImageBitmap(d.blob) : null));
  return imgCache.get(docId);
};
const saveNow = p => { p.updated = Date.now(); return db.put('projects', JSON.parse(JSON.stringify(p))); };
const loadProject = id => db.get('projects', id);
const countSyms = p => p.levels.reduce((n, l) => n + l.symbols.length, 0);
async function storeDoc({ projectId, levelId = null, category, file, blob, role = 'original', name }) {
  const b = blob || file;
  const d = { id: uid('doc'), projectId, levelId, category, role, name: name || file.name, mime: b.type || 'application/octet-stream', size: b.size, blob: b, created: Date.now() };
  await db.put('docs', d); return d;
}
async function addUnderlay(project, level, kind, file, page = 1) {
  const r = await rasterize(file, page);
  const orig = await storeDoc({ projectId: project.id, levelId: level.id, category: kind === 'plan' ? 'floorplan' : 'situatieschema', file });
  const ul = await storeDoc({ projectId: project.id, levelId: level.id, category: kind === 'plan' ? 'floorplan' : 'situatieschema', blob: r.blob, role: 'underlay', name: file.name + '.png' });
  const pxPerM = r.paperPxPerMm ? r.paperPxPerMm * 10 : Math.max(r.w, r.h) / 14; // guess: 1:100 / ~14 m long
  const prev = level.underlays.plan;
  level.underlays[kind] = { docId: ul.id, origId: orig.id, w: r.w, h: r.h, pxPerM, ox: prev && kind === 'elec' ? prev.ox : 0, oy: prev && kind === 'elec' ? prev.oy : 0, calibrated: false, paperPxPerMm: r.paperPxPerMm };
}

/* ---------------- router ---------------- */
async function route() {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const q = new URLSearchParams(qs || ''), parts = path.split('/').filter(Boolean);
  view.className = ''; view.innerHTML = '';
  const nav = parts[0] === 'project' ? 'projects' : parts[0] || 'home';
  document.querySelectorAll('#mainnav a').forEach(a => a.classList.toggle('active', a.dataset.route === (nav === 'new' ? 'home' : nav)));
  try {
    if (!parts.length) return pageHome();
    if (parts[0] === 'new') return pageWizard();
    if (parts[0] === 'projects') return pageProjects();
    if (parts[0] === 'library') return pageLibrary();
    if (parts[0] === 'symbols') return pageSymbols();
    if (parts[0] === 'project') return pageProject(parts[1], parts[2] || '3d', q);
    pageHome();
  } catch (e) { console.error(e); view.append(h('div', { class: 'wrap' }, h('h2', {}, 'Something went wrong'), h('pre', {}, String(e.stack || e)))); }
}
window.addEventListener('hashchange', route);

/* ---------------- landing ---------------- */
function pageHome() {
  const input = h('input', { type: 'file', multiple: true, accept: '.pdf,image/*', style: { display: 'none' }, onchange: () => go(input.files) });
  const go = files => { pendingFiles = [...files]; location.hash = '#/new'; };
  const cta = h('label', { class: 'dropcta' },
    h('div', { class: 'ico' }, '📐'), h('div', { class: 'big' }, 'Click here to upload your plan and start visualizing'),
    h('div', { class: 'muted' }, 'or drop your grondplan (PDF, PNG, JPG) here – every floor can be its own file'), input);
  cta.addEventListener('click', e => { if (e.target === cta || cta.contains(e.target)) { e.preventDefault(); location.hash = '#/new'; } });
  ['dragover', 'dragenter'].forEach(ev => cta.addEventListener(ev, e => { e.preventDefault(); cta.classList.add('over'); }));
  cta.addEventListener('dragleave', () => cta.classList.remove('over'));
  cta.addEventListener('drop', e => { e.preventDefault(); go(e.dataTransfer.files); });
  const step = (n, t, d) => h('div', { class: 'card' }, h('div', { class: 'num' }, n), h('h3', {}, t), h('div', { class: 'muted' }, d));
  view.append(h('div', {},
    h('section', { class: 'hero' },
      h('h1', {}, 'Your house, ', h('em', {}, 'documented'), ' and seen in 3D'),
      h('p', {}, 'A digital library for plans, situatieschema’s and eendraadschema’s. Turn floor plans of every level into one scaled 3D model – with every lamp, switch and socket in its place.'),
      cta,
      h('p', { style: { marginTop: '18px', fontSize: '14px' } }, 'No plan at hand? ', h('a', { href: '#', onclick: async e => { e.preventDefault(); await loadDemo(); } }, 'Open the demo house'), ' · ', h('a', { href: '#/projects' }, 'My Projects'))),
    h('div', { class: 'wrap', style: { paddingTop: 0 } },
      h('div', { class: 'steps' },
        step(1, 'Upload every level', 'Basement, ground floor, first floor… Each level is usually its own document – HouseVault stacks them into one building.'),
        step(2, 'Set the scale & trace', 'Calibrate with one known distance. Walls are detected automatically from clean plans; doors and windows are placed on the walls.'),
        step(3, 'Add the electrical plan', 'Upload the situatieschema and place symbols from the Belgian (AREI) icon library – each type keeps its own identity in 3D.'),
        step(4, 'Explore', 'Orbit, zoom, peel the building layer by layer, cut sections, explode the floors.')))));
}
async function loadDemo() {
  const p = demoProject();
  await saveNow(p);
  await new Promise(r => setTimeout(r, 50));
  location.hash = `#/project/${p.id}/3d`;
}

/* ---------------- wizard ---------------- */
function pageWizard() {
  const rows = [];
  const nameIn = h('input', { value: 'My house', style: { width: '280px' } });
  const list = h('div'), extraList = h('div'), status = h('div', { class: 'muted' }), bar = h('div', { class: 'progress', style: { display: 'none' } }, h('div'));
  function addRow(preset) {
    const r = { preset, file: null, elec: null, page: 1, pages: 1 };
    const nameI = h('input', { value: preset.name, style: { width: '170px' } });
    const fileInfo = h('span', { class: 'muted' }, 'No file chosen');
    const elecInfo = h('span', { class: 'muted' }, 'optional');
    const pageI = h('input', { type: 'number', min: 1, value: 1, style: { width: '64px' }, onchange: () => r.page = +pageI.value || 1 });
    const pageBox = h('div', { style: { display: 'none' } }, h('label', {}, 'PDF page'), pageI);
    const fIn = h('input', { type: 'file', accept: '.pdf,image/*', style: { display: 'none' }, onchange: async () => {
      r.file = fIn.files[0]; fileInfo.textContent = r.file ? r.file.name : 'No file chosen';
      if (r.file && isPdf(r.file)) { try { r.pages = await pdfPageCount(r.file); pageI.max = r.pages; pageBox.style.display = 'flex'; pageBox.style.flexDirection = 'column'; } catch { } } else pageBox.style.display = 'none';
    } });
    const eIn = h('input', { type: 'file', accept: '.pdf,image/*', style: { display: 'none' }, onchange: () => { r.elec = eIn.files[0]; elecInfo.textContent = r.elec ? r.elec.name : 'optional'; } });
    r.getName = () => nameI.value || preset.name;
    r.setFile = f => { const dt = new DataTransfer(); dt.items.add(f); fIn.files = dt.files; fIn.onchange(); };
    r.el = h('div', { class: 'levelrow' },
      h('div', { class: 'form-row' },
        h('div', {}, h('label', {}, 'Level'), nameI),
        h('div', {}, h('label', {}, 'Floor plan (grondplan) *'), h('label', { class: 'filebtn' }, '📄 ', fileInfo, fIn)),
        pageBox,
        h('div', {}, h('label', {}, 'Situatieschema (electrical plan)'), h('label', { class: 'filebtn' }, '⚡ ', elecInfo, eIn)),
        h('button', { class: 'danger small', onclick: () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); } }, 'Remove')));
    rows.push(r); list.append(r.el); return r;
  }
  const extras = [];
  function addExtra(file) {
    const cat = h('select', {}, Object.entries(DOC_CATS).map(([k, v]) => h('option', { value: k, selected: k === 'eendraadschema' }, v)));
    const x = { file, cat }; extras.push(x);
    x.el = h('div', { class: 'form-row' }, h('div', {}, '📎 ' + file.name), h('div', {}, cat), h('button', { class: 'small danger', onclick: () => { extras.splice(extras.indexOf(x), 1); x.el.remove(); } }, '✕'));
    extraList.append(x.el);
  }
  const addSel = h('select', {}, LEVEL_PRESETS.map((p, i) => h('option', { value: i }, p.name)));
  const extraIn = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: () => [...extraIn.files].forEach(addExtra) });
  const go = h('button', { class: 'primary', onclick: submit }, 'Upload & start visualizing →');

  // pre-fill from the landing page drop
  const pre = pendingFiles; pendingFiles = [];
  if (pre.length) { pre.forEach((f, i) => { const r = addRow(LEVEL_PRESETS[Math.min(i + 1, 4)]); r.setFile(f); }); rows[0].preset = LEVEL_PRESETS[1]; }
  else addRow(LEVEL_PRESETS[1]);

  async function submit() {
    const ready = rows.filter(r => r.file);
    if (!ready.length) { toast('Add at least one floor plan file.', 'err'); return; }
    go.disabled = true; bar.style.display = 'block';
    try {
      const p = newProject(nameIn.value.trim() || 'My house');
      let step = 0; const total = ready.length * 2 + extras.length + 1;
      const tick = t => { status.textContent = t; bar.firstChild.style.width = (++step / total * 100) + '%'; };
      for (const r of ready) {
        const lv = newLevel(r.preset, { name: r.getName() });
        tick(`Reading ${lv.name} floor plan…`); await addUnderlay(p, lv, 'plan', r.file, r.page);
        if (r.elec) { tick(`Reading ${lv.name} situatieschema…`); await addUnderlay(p, lv, 'elec', r.elec); } else step++;
        p.levels.push(lv);
      }
      for (const x of extras) { tick('Storing ' + x.file.name); await storeDoc({ projectId: p.id, category: x.cat.value, file: x.file }); }
      tick('Saving project…'); await saveNow(p);
      location.hash = `#/project/${p.id}/plans?setup=1`;
    } catch (e) { console.error(e); toast('Could not process the files: ' + e.message, 'err'); go.disabled = false; }
  }
  view.append(h('div', { class: 'wrap', style: { maxWidth: '900px' } },
    h('h1', {}, 'New project'),
    h('p', { class: 'muted' }, 'Upload one plan per level. Order does not matter – levels are stacked according to their type. You can add more levels or documents later.'),
    h('div', { class: 'form-row' }, h('div', {}, h('label', {}, 'Project name'), nameIn)),
    list,
    h('div', { class: 'form-row' }, addSel, h('button', { onclick: () => addRow(LEVEL_PRESETS[+addSel.value]) }, '+ Add level')),
    h('h3', { style: { marginTop: '26px' } }, 'Other documents (optional)'),
    h('p', { class: 'muted' }, 'Eendraadschema, keuringsverslag, EPC… stored in your library next to the plans.'),
    extraList, h('button', { onclick: () => extraIn.click() }, '+ Add documents', extraIn),
    h('div', { style: { marginTop: '28px', display: 'flex', flexDirection: 'column', gap: '10px' } }, bar, status, h('div', {}, go))));
}

/* ---------------- projects ---------------- */
async function pageProjects() {
  const projects = (await db.getAll('projects')).sort((a, b) => b.updated - a.updated);
  const wrap = h('div', { class: 'wrap' });
  wrap.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' } }, h('h1', { style: { margin: 0, flex: 1 } }, 'My Projects'),
    h('button', { onclick: loadDemo }, 'Open demo house'), h('a', { class: 'btn primary', href: '#/new' }, '+ New project')));
  if (!projects.length) wrap.append(h('div', { class: 'empty' }, h('div', { style: { fontSize: '44px' } }, '🏠'), h('h3', {}, 'No projects yet'), 'Upload a floor plan to create your first 3D house.'));
  const grid = h('div', { class: 'grid' });
  for (const p of projects) {
    const thumb = h('div', { class: 'thumb', onclick: () => location.hash = `#/project/${p.id}/3d` }, p.thumb ? null : 'No preview yet');
    if (p.thumb) thumb.style.backgroundImage = `url(${p.thumb})`;
    const walls = p.levels.reduce((n, l) => n + l.walls.length, 0);
    grid.append(h('div', { class: 'pcard' }, thumb, h('div', { class: 'body' },
      h('h3', { style: { margin: 0 } }, p.name),
      h('div', { class: 'muted' }, `${p.levels.length} level${p.levels.length === 1 ? '' : 's'} · ${walls} walls · ${countSyms(p)} electrical symbols`),
      h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Updated ' + new Date(p.updated).toLocaleString()),
      !walls ? h('span', { class: 'pill', style: { color: '#fbbf24' } }, 'Needs interpretation – open Floor plans') : null,
      h('div', { class: 'actions' },
        h('a', { class: 'btn primary small', href: `#/project/${p.id}/3d` }, '3D view'),
        h('a', { class: 'btn small', href: `#/project/${p.id}/plans` }, 'Floor plans'),
        h('a', { class: 'btn small', href: `#/project/${p.id}/electrical` }, 'Electrical'),
        h('a', { class: 'btn small', href: `#/project/${p.id}/docs` }, 'Documents'),
        h('button', { class: 'small danger', onclick: async () => { if (confirm(`Delete “${p.name}” and all its documents?`)) { await db.deleteProject(p.id); route(); } } }, 'Delete')))));
  }
  wrap.append(grid); view.append(wrap);
}

/* ---------------- project shell ---------------- */
async function pageProject(id, tab, q) {
  const project = await loadProject(id);
  if (!project) { view.append(h('div', { class: 'empty' }, 'Project not found. ', h('a', { href: '#/projects' }, 'Back to My Projects'))); return; }
  view.className = 'fill';
  const save = debounce(() => saveNow(project), 350);
  const nameIn = h('input', { class: 'name', value: project.name, onchange: () => { project.name = nameIn.value || 'My house'; save(); } });
  const tabs = h('div', { class: 'tabs' }, [['3d', '3D view'], ['plans', 'Floor plans'], ['electrical', 'Electrical'], ['docs', 'Documents']].map(([k, t]) => h('a', { href: `#/project/${id}/${k}`, class: k === tab ? 'active' : '' }, t)));
  const body = h('div', { class: 'projbody' });
  const bar = h('div', { class: 'projbar' }, h('a', { href: '#/projects', class: 'muted' }, '← Projects'), nameIn, tabs, h('div', { style: { flex: 1 } }),
    h('button', { class: 'small', onclick: () => exportProject(project) }, '⬇ Export'),
    h('a', { class: 'btn small primary', href: '#/projects', onclick: async () => { await saveNow(project); toast('Saved – your visualization is in My Projects', 'ok'); } }, 'Done'));
  view.append(h('div', { class: 'proj' }, bar, body));
  let inner = null;
  if (tab === '3d') inner = tab3d(project, body, save);
  else if (tab === 'plans' || tab === 'electrical') inner = tabEditor(project, body, save, tab, q);
  else inner = tabDocs(project, body);
  cleanup = () => { inner && inner(); saveNow(project); };
}
async function exportProject(project) {
  const docs = await db.docsOfProject(project.id);
  const toB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
  const out = { format: 'housevault-1', project, docs: await Promise.all(docs.map(async d => ({ ...d, blob: await toB64(d.blob) }))) };
  download(new Blob([JSON.stringify(out)], { type: 'application/json' }), project.name.replace(/\W+/g, '_') + '.housevault.json');
}

/* ---------------- 3D tab ---------------- */
function tab3d(project, body, save) {
  let viewer = null, dead = false;
  const host = h('div', { class: 'v3d' }), side = h('div', { class: 'sidepanel' });
  body.append(host, side);
  import('./view3d.js').then(({ Viewer }) => {
    if (dead) return;
    viewer = new Viewer(host, { getImage });
    viewer.set({ roof: project.settings.roof !== false });
    viewer.setProject(project);
    buildPanel();
    setTimeout(() => { if (!dead && (!project.thumb || (project.thumbAt || 0) < project.updated - 1000)) makeThumb(); }, 700);
  }).catch(e => { console.error(e); host.append(h('div', { class: 'empty' }, 'WebGL is not available in this browser.')); });
  const makeThumb = () => { try { project.thumb = viewer.snapshot(480, 300); project.thumbAt = Date.now(); saveNow(project); } catch (e) { } };

  const levels = sortedLevels(project);
  if (!levels.some(l => l.walls.length)) host.append(h('div', { class: 'hint', style: { left: '12px', top: '12px', bottom: 'auto' } }, 'Nothing to show yet – ', h('a', { href: `#/project/${project.id}/plans` }, 'trace the walls in Floor plans'), '.'));
  function buildPanel() {
    side.innerHTML = '';
    const vis = viewer.opts.visible;
    const refresh = () => { viewer.set({ visible: vis }); buildPanel(); };
    const lay = h('div');
    for (const lv of [...levels].reverse()) {
      lay.append(h('div', { class: 'layer' + (vis.has(lv.id) ? '' : ' off') },
        h('input', { type: 'checkbox', checked: vis.has(lv.id), onchange: e => { e.target.checked ? vis.add(lv.id) : vis.delete(lv.id); refresh(); } }),
        h('span', { class: 'nm' }, lv.name),
        h('button', { title: 'Show only this level', onclick: () => { vis.clear(); vis.add(lv.id); refresh(); } }, 'Solo'),
        h('button', { title: 'Show this level and everything below', onclick: () => { vis.clear(); levels.filter(l => l.order <= lv.order).forEach(l => vis.add(l.id)); refresh(); } }, '↧ Up to')));
    }
    side.append(h('div', {}, h('h4', {}, 'Layers'), lay, h('button', { class: 'small', onclick: () => { levels.forEach(l => vis.add(l.id)); refresh(); } }, 'Show all')));
    const sl = (label, key, min, max, step, val) => h('div', { class: 'row' }, h('label', {}, label), h('input', { type: 'range', min, max, step, value: val, oninput: e => viewer.set({ [key]: +e.target.value }) }));
    const ck = (label, key) => h('div', { class: 'row chk' }, h('label', { for: 'ck' + key }, label), h('input', { type: 'checkbox', id: 'ck' + key, checked: viewer.opts[key], onchange: e => { viewer.set({ [key]: e.target.checked }); if (key === 'roof') { project.settings.roof = e.target.checked; save(); } } }));
    side.append(h('div', {}, h('h4', {}, 'Explore'),
      sl('Explode floors', 'explode', 0, 4, .1, viewer.opts.explode), sl('Section cut', 'clip', 0.05, 1, .01, viewer.opts.clip),
      ck('X-ray walls', 'xray'), ck('Roof', 'roof'), ck('Electrical devices', 'devices'), ck('Symbol markers', 'markers'), ck('Floor plan on floor', 'planTex')));
    // electrical legend, grouped by category
    const counts = {};
    for (const l of levels) if (vis.has(l.id)) for (const s of l.symbols) counts[s.type] = (counts[s.type] || 0) + 1;
    const catCount = {};
    for (const [t, n] of Object.entries(counts)) { const d = getSymbol(t); if (d) catCount[d.cat] = (catCount[d.cat] || 0) + n; }
    const leg = h('div', { class: 'legend' });
    for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) { const d = getSymbol(t); if (!d) continue; leg.append(h('div', { class: 'it', html: svgMarkup(d, 20) + `<span style="flex:1">${d.nl}</span><b>${n}</b>` })); }
    if (Object.keys(counts).length) {
      const cats = h('div');
      for (const [c, n] of Object.entries(catCount)) cats.append(h('div', { class: 'row chk' }, h('label', { for: 'c' + c }, `${CATEGORIES[c].nl} (${n})`), h('input', { type: 'checkbox', id: 'c' + c, checked: !viewer.opts.hiddenCats.has(c), onchange: e => { e.target.checked ? viewer.opts.hiddenCats.delete(c) : viewer.opts.hiddenCats.add(c); viewer.build(); } })));
      side.append(h('div', {}, h('h4', {}, 'Electrical installation'), cats, leg));
    }
    side.append(h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Hover a device to see what it is. Scroll = zoom, left drag = orbit, right drag = pan.'));
  }
  const fb = h('div', { class: 'floatbar' },
    ...[['＋', 'Zoom in', () => viewer.zoom(.75)], ['－', 'Zoom out', () => viewer.zoom(1.33)], ['⤢', 'Fit to screen', () => viewer.fit()]].map(([t, ti, f]) => h('button', { title: ti, onclick: f }, t)), h('div', { class: 'sep' }),
    ...[['Iso', 'iso'], ['Top', 'top'], ['Front', 'front'], ['Side', 'right']].map(([t, v]) => h('button', { title: t + ' view', style: { fontSize: '11px' }, onclick: () => viewer.fit(v) }, t)), h('div', { class: 'sep' }),
    h('button', { title: 'Auto-rotate', onclick: e => { e.currentTarget.classList.toggle('active'); viewer.autoRotate(e.currentTarget.classList.contains('active')); } }, '⟳'),
    h('button', { title: 'Save screenshot', onclick: () => fetch(viewer.snapshot()).then(r => r.blob()).then(b => download(b, project.name + '.png')) }, '📷'));
  host.append(fb);
  window.__viewer = () => viewer;
  return () => { dead = true; if (viewer) { try { makeThumbIfNeeded(); } catch { } viewer.dispose(); } };
  function makeThumbIfNeeded() { }
}

/* ---------------- editor tabs (floor plans / electrical) ---------------- */
function tabEditor(project, body, save, tab, q) {
  const mode = tab === 'electrical' ? 'elec' : 'plan';
  let editor = null; let currentLevel = null;
  const left = h('div', { class: 'ed-left' }), main = h('div', { class: 'ed-main' }), side = h('div', { class: 'sidepanel' });
  const levelBar = h('div', { class: 'ed-levels' }), canvasHost = h('div', { class: 'ed-canvas' }), status = h('div', { class: 'ed-status' });
  main.append(levelBar, canvasHost); body.append(h('div', { class: 'ed' }, left, main, side));
  const { Editor, OPENING_DEFAULTS } = window.__edmod || {};
  import('./editor.js').then(mod => init(mod));
  let toolBtns = {};
  function init({ Editor }) {
    editor = window.__editor = new Editor(canvasHost, {
      project, getImage, onChange: () => { save(); renderSteps(); },
      onSelect: () => renderProps(), onStatus: t => status.textContent = t,
      onTool: t => { if (t === 'calibrate-ready') { showCalib(); return; } calibBox.style.display = 'none'; Object.entries(toolBtns).forEach(([k, b]) => b.classList.toggle('active', k === t)); },
      onLevel: l => { currentLevel = l; renderLevels(); renderSteps(); renderLevelSettings(); renderProps(); },
    });
    canvasHost.append(status, h('div', { class: 'ed-zoom' }, h('button', { title: 'Zoom in', onclick: () => editor.zoomBy(1.3) }, '＋'), h('button', { title: 'Zoom out', onclick: () => editor.zoomBy(1 / 1.3) }, '－'), h('button', { title: 'Fit', onclick: () => editor.fit() }, '⤢')));
    editor.underlay = mode;
    const first = sortedLevels(project)[0];
    if (!project.levels.length) { side.append(h('div', { class: 'banner' }, 'This project has no levels yet. Add one with “+ Level”.')); }
    editor.setLevel(q.get('level') || (first && first.id));
    editor.setTool(mode === 'elec' ? 'select' : 'select');
    editor.setUnderlay(mode === 'elec' && editor.level && editor.level.underlays.elec ? 'elec' : editor.level && editor.level.underlays.plan ? 'plan' : 'none');
    editor.underlayOpacity = mode === 'elec' ? .75 : .6;
    syncUnderlayUI();
  }
  /* toolbar */
  const tools = mode === 'plan'
    ? [['select', '↖', 'Select / move (V)'], ['pan', '✋', 'Pan (H)'], ['calibrate', '📏', 'Calibrate scale'], ['wall', '▭', 'Draw wall (W)'], ['door', '🚪', 'Door (D)'], ['window', '🪟', 'Window (N)'], ['opening', '⛶', 'Doorway / opening'], ['garage', '🅖', 'Garage door'], ['erase', '🗑', 'Erase (E)'], ['moveUnderlay', '🖼', 'Move plan image'], ['alignLevel', '⇱', 'Shift whole level (align with other levels)']]
    : [['select', '↖', 'Select / move (V)'], ['pan', '✋', 'Pan (H)'], ['calibrate', '📏', 'Calibrate situatieschema scale'], ['moveUnderlay', '🖼', 'Move situatieschema image'], ['erase', '🗑', 'Erase (E)']];
  for (const [k, ic, tip] of tools) { const b = h('button', { title: tip, onclick: () => editor && editor.setTool(k) }, ic); toolBtns[k] = b; left.append(b); }
  left.append(h('div', { class: 'sep' }), h('button', { title: 'Undo (Ctrl+Z)', onclick: () => editor && editor.undo() }, '↶'), h('button', { title: 'Redo (Ctrl+Y)', onclick: () => editor && editor.redo() }, '↷'));

  /* level bar */
  function renderLevels() {
    levelBar.innerHTML = '';
    for (const lv of sortedLevels(project)) levelBar.append(h('div', { class: 'lv' + (currentLevel && lv.id === currentLevel.id ? ' active' : ''), onclick: () => editor.setLevel(lv.id) }, lv.name));
    levelBar.append(h('button', { class: 'small', onclick: addLevelModal }, '+ Level'));
    levelBar.append(h('div', { style: { flex: 1 } }));
    const ul = h('select', { onchange: e => { editor.setUnderlay(e.target.value); syncUnderlayUI(); } },
      h('option', { value: 'plan' }, 'Underlay: floor plan'), h('option', { value: 'elec' }, 'Underlay: situatieschema'), h('option', { value: 'none' }, 'Underlay: none'));
    ul.value = editor.underlay; ulSel = ul;
    levelBar.append(ul, h('label', {}, 'Opacity'), h('input', { type: 'range', min: .1, max: 1, step: .05, value: editor.underlayOpacity, style: { width: '90px' }, oninput: e => { editor.underlayOpacity = +e.target.value; editor.draw(); } }),
      h('label', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: editor.showBelow, onchange: e => { editor.showBelow = e.target.checked; editor.draw(); } }), 'Level below'));
  }
  let ulSel = null;
  function syncUnderlayUI() { if (ulSel && editor) ulSel.value = editor.underlay; renderSteps(); }

  /* side panel pieces */
  const stepsBox = h('div'), calibBox = h('div', { class: 'card', style: { display: 'none', padding: '10px' } }), lvBox = h('div'), propsBox = h('div', { class: 'props' }), actions = h('div');
  const paletteBox = h('div');
  side.append(stepsBox, calibBox, actions, lvBox, propsBox);
  if (mode === 'elec') side.append(paletteBox);

  function showCalib() {
    calibBox.style.display = 'block'; calibBox.innerHTML = '';
    const inp = h('input', { type: 'number', step: '0.01', min: '0', placeholder: 'metres', style: { width: '90px' } });
    calibBox.append(h('b', {}, 'Real distance between the two points'), h('div', { class: 'row', style: { marginTop: '8px' } }, inp, h('span', {}, 'm'),
      h('button', { class: 'primary small', onclick: () => { if (editor.applyCalibration(+inp.value)) { calibBox.style.display = 'none'; toast('Scale set', 'ok'); editor.fit(); renderSteps(); } else toast('Enter a distance in metres', 'err'); } }, 'Apply')));
    inp.focus();
  }
  function renderSteps() {
    if (!editor || !currentLevel) return;
    stepsBox.innerHTML = ''; actions.innerHTML = '';
    const l = currentLevel, u = l.underlays[editor.underlay] || null;
    if (mode === 'plan') {
      const done = [!!l.underlays.plan, !!(l.underlays.plan && l.underlays.plan.calibrated), l.walls.length > 0, l.openings.length > 0, true];
      stepsBox.append(h('h4', {}, 'Interpret this level'), h('ol', { class: 'steplist' },
        ...['Upload the floor plan', 'Set the scale (one known distance)', 'Detect or draw the walls', 'Place doors & windows', 'Align levels on top of each other'].map((t, i) => h('li', { class: done[i] ? 'done' : '' }, t))));
      if (q.get('setup') && !l.walls.length) stepsBox.append(h('div', { class: 'banner', style: { marginTop: '8px' } }, 'Start with step 2: pick the 📏 tool, click both ends of a wall or dimension whose length you know, then enter it.'));
      if (!l.underlays.plan) actions.append(h('button', { onclick: () => uploadUnderlayModal(l, 'plan') }, '📄 Upload floor plan'));
      else {
        if (editor.underlay === 'plan' && l.underlays.plan.paperPxPerMm) {
          const den = h('input', { type: 'number', value: 100, min: 1, style: { width: '70px' } });
          actions.append(h('div', { class: 'row' }, h('label', { style: { flex: '0 0 auto' } }, 'PDF printed at 1:'), den, h('button', { class: 'small', onclick: () => { editor.setPaperScale(+den.value); editor.fit(); renderSteps(); } }, 'Apply')));
        }
        const tIn = h('input', { type: 'number', step: '0.01', min: '0.05', value: editor.defaultT || .2, style: { width: '70px' }, onchange: () => editor.defaultT = +tIn.value || .2 });
        actions.append(
          h('button', { class: 'primary', disabled: !l.underlays.plan.calibrated, title: l.underlays.plan.calibrated ? '' : 'Calibrate first', onclick: async e => { if (l.walls.length && !confirm('Replace the current walls and openings with a fresh detection?')) return; e.target.disabled = true; try { const r = await editor.detect(); toast(r.walls.length ? `Detected ${r.walls.length} walls and ${r.openings.length} openings – please review them.` : 'No walls found. Try a cleaner plan or draw the walls manually.', r.walls.length ? 'ok' : 'err'); editor.setUnderlay('plan'); } catch (er) { toast(er.message, 'err'); } renderSteps(); } }, '✨ Detect walls from plan'),
          h('div', { class: 'row' }, h('label', { style: { flex: '0 0 auto' } }, 'New wall thickness (m)'), tIn),
          h('button', { onclick: () => { if (editor.autoAlign()) { editor.fit(); toast('Aligned to another level’s top-left corner – fine-tune with ⇱', 'ok'); } else toast('Needs walls on this and another level', 'err'); } }, '⇱ Auto-align to other level'),
          h('button', { class: 'danger small', onclick: () => { if (confirm('Delete all walls, doors and windows of this level?')) { editor.pushUndo(); l.walls = []; l.openings = []; editor.changed(); editor.draw(); } } }, 'Clear walls'));
      }
      actions.append(h('button', { class: 'primary', style: { marginTop: '6px' }, onclick: async () => { await saveNow(project); toast('Saved – check My Projects for your visualization', 'ok'); location.hash = '#/projects'; } }, 'Finish & visualize →'));
    } else {
      if (!l.underlays.elec) actions.append(h('div', { class: 'banner' }, 'No situatieschema for this level yet. You can still place symbols on the floor plan.'), h('button', { onclick: () => uploadUnderlayModal(l, 'elec') }, '⚡ Upload situatieschema'));
      else if (!l.underlays.elec.calibrated) actions.append(h('div', { class: 'banner' }, 'Calibrate the situatieschema (📏), or use the move tool (🖼) to line it up with the walls. If it is the same drawing as the floor plan, set the same scale.'));
      renderPalette();
    }
  }
  /* palette */
  let selSym = null, pq = '';
  function renderPalette() {
    paletteBox.innerHTML = '';
    const search = h('input', { placeholder: 'Search symbols…', value: pq, oninput: e => { pq = e.target.value; fill(); }, style: { width: '100%' } });
    const pal = h('div'); paletteBox.append(h('h4', {}, 'Symbol palette (Belgium · AREI)'), search, pal, h('button', { class: 'small', style: { marginTop: '8px' }, onclick: () => customSymbolModal(() => renderPalette()) }, '+ Own symbol'));
    function fill() {
      pal.innerHTML = '';
      for (const [c, info] of Object.entries(CATEGORIES)) {
        const items = allSymbols().filter(s => s.cat === c && (!pq || (s.nl + s.en + s.fr).toLowerCase().includes(pq.toLowerCase())));
        if (!items.length) continue;
        pal.append(h('div', { class: 'catlabel' }, info.nl));
        pal.append(h('div', { class: 'palette' }, items.map(s => h('button', { title: `${s.nl}\n${s.en}`, class: selSym === s.id && editor.tool === 'symbol' ? 'active' : '', html: svgMarkup(s, 26) + `<span>${s.nl.split(' ').slice(0, 2).join(' ')}</span>`, onclick: () => { selSym = s.id; editor.setSymbol(s.id); fill(); } }))));
      }
    }
    fill();
  }
  /* level settings */
  function renderLevelSettings() {
    lvBox.innerHTML = ''; const l = currentLevel; if (!l || mode !== 'plan') return;
    const f = (label, key, step = .05, type = 'number') => h('div', { class: 'row' }, h('label', {}, label), h('input', { type, step, value: l[key], onchange: e => { l[key] = type === 'number' ? +e.target.value : e.target.value; if (key === 'order') { /* re-sort */ } editor.changed(); renderLevels(); } }));
    lvBox.append(...[h('h4', {}, 'Level settings'), f('Name', 'name', null, 'text'), f('Wall height (m)', 'height'), f('Floor thickness', 'slab'),
      h('div', { class: 'row' }, h('label', {}, 'Stack position'), h('select', { onchange: e => { l.order = +e.target.value; editor.changed(); renderLevels(); } }, [[-2, 'Below basement'], [-1, 'Basement'], [0, 'Ground floor'], [1, '1st floor'], [2, '2nd floor'], [3, 'Attic / 3rd'], [4, 'Above']].map(([v, t]) => h('option', { value: v, selected: v === l.order }, t)))),
      !l.underlays.elec && l.underlays.plan ? h('button', { class: 'small', onclick: () => uploadUnderlayModal(l, 'elec') }, '⚡ Add situatieschema') : null,
      project.levels.length > 1 ? h('button', { class: 'small danger', style: { marginTop: '6px' }, onclick: () => { if (confirm(`Remove level “${l.name}”?`)) { project.levels = project.levels.filter(x => x !== l); editor.changed(); editor.setLevel(sortedLevels(project)[0].id); } } }, 'Remove level') : null].filter(Boolean));
  }
  /* selection properties */
  function renderProps() {
    propsBox.innerHTML = ''; if (!editor) return;
    const s = editor.sel; if (!s) return;
    const num = (label, key, step = .05) => h('div', { class: 'row' }, h('label', {}, label), h('input', { type: 'number', step, value: +(+s.item[key] || 0).toFixed(3), onchange: e => editor.update({ [key]: +e.target.value }) }));
    const txt = (label, key) => h('div', { class: 'row' }, h('label', {}, label), h('input', { value: s.item[key] || '', onchange: e => editor.update({ [key]: e.target.value }) }));
    const del = h('button', { class: 'small danger', onclick: () => editor.deleteSelected() }, 'Delete');
    if (s.type === 'wall') propsBox.append(h('h4', {}, 'Wall'), num('Thickness (m)', 't', .01), h('div', { class: 'row' }, h('label', {}, 'Height (m)'), h('input', { type: 'number', step: .05, placeholder: 'level height', value: s.item.h || '', onchange: e => editor.update({ h: +e.target.value || undefined }) })), h('div', { class: 'muted' }, `Length ${wallLen(s.item).toFixed(2)} m`), del);
    if (s.type === 'opening') propsBox.append(h('h4', {}, 'Door / window'), h('div', { class: 'row' }, h('label', {}, 'Type'), h('select', { onchange: e => editor.update({ type: e.target.value }) }, ['door', 'window', 'opening', 'garage'].map(t => h('option', { value: t, selected: s.item.type === t }, t)))), num('Width (m)', 'width'), num('Sill height', 'sill'), num('Height (m)', 'height'), num('Position (m)', 'pos'), s.item.detected ? h('div', { class: 'muted' }, 'Auto-detected gap – check the type.') : null, del);
    if (s.type === 'symbol') {
      const def = getSymbol(s.item.type);
      propsBox.append(h('h4', {}, 'Electrical symbol'), h('div', { class: 'row' }, h('div', { html: def ? svgMarkup(def, 28) : '', style: { color: '#fff' } }), h('select', { onchange: e => editor.update({ type: e.target.value }) }, allSymbols().map(d => h('option', { value: d.id, selected: d.id === s.item.type }, d.nl)))),
        txt('Label', 'label'), txt('Circuit', 'circuit'), def && def.mount !== 'ceiling' ? h('div', { class: 'row' }, h('label', {}, 'Height (m)'), h('input', { type: 'number', step: .05, value: s.item.z ?? def.h, onchange: e => editor.update({ z: +e.target.value }) })) : null,
        h('div', { class: 'row' }, h('label', {}, 'Facing (°)'), h('input', { type: 'number', step: 15, value: Math.round(((s.item.angle || 0) * 180 / Math.PI) % 360), onchange: e => editor.update({ angle: +e.target.value * Math.PI / 180 }) })),
        def ? h('div', { class: 'muted' }, `${def.en} · ${def.fr}`) : null, del);
    }
  }
  /* modals */
  function uploadUnderlayModal(l, kind) {
    const f = h('input', { type: 'file', accept: '.pdf,image/*' }), pg = h('input', { type: 'number', value: 1, min: 1, style: { width: '70px' } });
    const go = h('button', { class: 'primary', onclick: async () => { if (!f.files[0]) return; go.disabled = true; try { await addUnderlay(project, l, kind, f.files[0], +pg.value || 1); await saveNow(project); m.close(); await editor.loadBitmaps(); editor.setUnderlay(kind); editor.fit(); renderLevels(); renderSteps(); toast('Uploaded – now set the scale', 'ok'); } catch (e) { toast(e.message, 'err'); go.disabled = false; } } }, 'Upload');
    const m = modal(h('div', {}, h('h3', {}, kind === 'plan' ? `Floor plan for ${l.name}` : `Situatieschema for ${l.name}`), h('div', { class: 'form-row' }, f, h('div', {}, h('label', {}, 'PDF page'), pg)), go));
  }
  function addLevelModal() {
    const sel = h('select', {}, LEVEL_PRESETS.map((p, i) => h('option', { value: i }, p.name))), f = h('input', { type: 'file', accept: '.pdf,image/*' });
    const go = h('button', { class: 'primary', onclick: async () => { const p = LEVEL_PRESETS[+sel.value]; const lv = newLevel(p); go.disabled = true; try { if (f.files[0]) await addUnderlay(project, lv, 'plan', f.files[0]); project.levels.push(lv); await saveNow(project); m.close(); editor.setLevel(lv.id); } catch (e) { toast(e.message, 'err'); go.disabled = false; } } }, 'Add level');
    const m = modal(h('div', {}, h('h3', {}, 'Add a level'), h('div', { class: 'form-row' }, sel, f), go));
  }
  return () => { editor && editor.destroy(); };
}
function customSymbolModal(done) {
  const name = h('input', { placeholder: 'Name' }), cat = h('select', {}, h('option', { value: 'custom' }, 'Custom')), mount = h('select', {}, ['wall', 'ceiling', 'floor'].map(x => h('option', { value: x }, x))), ht = h('input', { type: 'number', step: .05, value: 1.1, style: { width: '80px' } }), f = h('input', { type: 'file', accept: 'image/*' });
  const go = h('button', { class: 'primary', onclick: async () => { if (!f.files[0] || !name.value) return toast('Name and image required', 'err'); await saveCustomSymbol({ id: uid('sym'), nl: name.value, en: name.value, fr: name.value, mount: mount.value, h: +ht.value, blob: f.files[0], model: 'box' }); m.close(); done && done(); } }, 'Save symbol');
  const m = modal(h('div', {}, h('h3', {}, 'Add your own symbol'), h('p', { class: 'muted' }, 'Upload a PNG / SVG of the icon exactly as it appears on your drawing.'), h('div', { class: 'form-row' }, h('div', {}, h('label', {}, 'Name'), name), h('div', {}, h('label', {}, 'Mounted on'), mount), h('div', {}, h('label', {}, 'Height (m)'), ht)), f, h('div', { style: { marginTop: '12px' } }, go)));
}

/* ---------------- documents ---------------- */
function tabDocs(project, body) {
  const wrap = h('div', { class: 'wrap', style: { width: '100%', overflow: 'auto' } });
  body.append(wrap);
  (async () => wrap.append(await docsView(project.id, [project])))();
  return () => { };
}
async function docsView(projectId, projects) {
  const box = h('div');
  const cat = h('select', {}, Object.entries(DOC_CATS).map(([k, v]) => h('option', { value: k }, v)));
  const pSel = h('select', {}, h('option', { value: '' }, '— no project —'), projects.map(p => h('option', { value: p.id, selected: p.id === projectId }, p.name)));
  const f = h('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: async () => { for (const file of f.files) await storeDoc({ projectId: pSel.value || null, category: cat.value, file }); toast('Stored', 'ok'); render(); } });
  async function render() {
    let docs = (await db.getAll('docs')).filter(d => d.role !== 'underlay');
    if (projectId) docs = docs.filter(d => d.projectId === projectId);
    docs.sort((a, b) => b.created - a.created);
    list.innerHTML = '';
    if (!docs.length) list.append(h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'No documents yet.')));
    for (const d of docs) {
      const pr = projects.find(p => p.id === d.projectId);
      list.append(h('tr', {}, h('td', {}, d.name), h('td', {}, h('span', { class: 'pill' }, DOC_CATS[d.category] || d.category)), h('td', {}, pr ? pr.name : '—'), h('td', {}, fmtBytes(d.size)), h('td', {}, new Date(d.created).toLocaleDateString()),
        h('td', { style: { whiteSpace: 'nowrap' } }, h('button', { class: 'small', onclick: () => preview(d) }, 'View'), ' ', h('button', { class: 'small', onclick: () => download(d.blob, d.name) }, '⬇'), ' ', h('button', { class: 'small danger', onclick: async () => { if (confirm('Delete this document?')) { await db.del('docs', d.id); render(); } } }, '✕'))));
    }
  }
  const list = h('tbody');
  box.append(h('div', { class: 'form-row' }, h('div', {}, h('label', {}, 'Category'), cat), projectId ? null : h('div', {}, h('label', {}, 'Project'), pSel), h('button', { class: 'primary', onclick: () => f.click() }, '+ Add documents', f)),
    h('table', {}, h('thead', {}, h('tr', {}, ['Name', 'Category', 'Project', 'Size', 'Added', ''].map(t => h('th', {}, t)))), list));
  render(); return box;
}
function preview(d) {
  const url = URL.createObjectURL(d.blob);
  const el = d.mime.startsWith('image/') ? h('img', { src: url, style: { maxWidth: '85vw', maxHeight: '80vh' } }) : h('iframe', { src: url, style: { width: '80vw', height: '80vh', border: 0, background: '#fff' } });
  modal(h('div', {}, h('h3', {}, d.name), el), { onClose: () => URL.revokeObjectURL(url) });
}
async function pageLibrary() {
  const projects = await db.getAll('projects');
  view.append(h('div', { class: 'wrap' }, h('h1', {}, 'Document Library'), h('p', { class: 'muted' }, 'Every plan, situatieschema, eendraadschema and inspection report you uploaded – in one place. Files stay in your browser (IndexedDB); nothing is sent anywhere.'), await docsView(null, projects)));
}

/* ---------------- symbols page ---------------- */
async function pageSymbols() {
  let cat = 'all', q = '';
  const wrap = h('div', { class: 'wrap' }), grid = h('div', { class: 'symgrid' }), filters = h('div', { class: 'filters' });
  function render() {
    filters.innerHTML = ''; grid.innerHTML = '';
    for (const [k, t] of [['all', 'All'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.nl + ' / ' + v.en])]) filters.append(h('button', { class: 'small' + (cat === k ? ' active' : ''), onclick: () => { cat = k; render(); } }, t));
    for (const s of allSymbols().filter(s => (cat === 'all' || s.cat === cat) && (!q || (s.nl + s.fr + s.en).toLowerCase().includes(q.toLowerCase())))) {
      grid.append(h('div', { class: 'symcard' }, h('div', { class: 'ic', html: svgMarkup(s, 42) }), h('div', { style: { flex: 1 } }, h('h4', {}, s.nl), h('div', { class: 'sub' }, 'FR: ' + s.fr), h('div', { class: 'sub' }, 'EN: ' + s.en),
        h('div', { class: 'sub', style: { marginTop: '4px' } }, h('span', { class: 'pill' }, s.mount), ' ', h('span', { class: 'pill' }, (s.h ?? 0) + ' m')),
        s.blob ? h('button', { class: 'small danger', style: { marginTop: '6px' }, onclick: async () => { await removeCustomSymbol(s.id); render(); } }, 'Remove') : null)));
    }
  }
  const rows = [['Belgium', 'AREI / RGIE (+ NBN)', 'Type E socket (earthed), 230 V; “situatieschema” (floor-plan symbols) and “eendraadschema” are two separate drawings; keuring by an accredited body is mandatory.'],
    ['France', 'NF C 15-100', 'Very similar symbols and sockets (type E), but a different mandatory minimum of devices per room.'],
    ['Netherlands', 'NEN 1010', 'Socket (type F/Schuko) drawn differently; the wall-socket symbol carries an earth contact marker; switches follow other pictograms.'],
    ['Germany', 'DIN VDE 0100 / DIN 18015', 'Schuko sockets; planning symbols follow DIN EN 60617 with local additions, e.g. other signs for Wechsel- and Kreuzschalter.'],
    ['United Kingdom', 'BS 7671 / BS EN 60617', 'Type G sockets with built-in switch; ring-final circuits; light switches often shown with “1 / 2 gang” notations.'],
    ['USA / Canada', 'NEC / ANSI', 'Duplex receptacle drawn as a circle with two lines; switches drawn as “S” with subscripts (S3 = three-way, S4 = four-way); 120 V.']];
  wrap.append(h('h1', {}, 'Symbol Library – Belgium'),
    h('p', { class: 'muted', style: { maxWidth: '760px' } }, 'The electrical symbols HouseVault knows, named in Dutch, French and English. Each type keeps its own identity in the editor and in the 3D model – a single-pole switch is not a double-pole switch and a two-way switch is not an intermediate (cross) switch. The pictograms are simplified redraws based on the common AREI/RGIE conventions: always compare with the legend of your own installer’s drawing, and add your own icon if it differs.'),
    h('div', { class: 'form-row' }, h('input', { placeholder: 'Search symbols…', oninput: e => { q = e.target.value; render(); }, style: { width: '260px' } }), h('button', { onclick: () => customSymbolModal(render) }, '+ Add your own symbol')),
    filters, grid,
    h('h2', { style: { marginTop: '40px' } }, 'Not every country uses the same icons'),
    h('p', { class: 'muted' }, 'Rule-of-thumb overview – standards change, so verify against the current edition before relying on it.'),
    h('table', {}, h('thead', {}, h('tr', {}, ['Country', 'Typical standard', 'What differs'].map(t => h('th', {}, t)))), h('tbody', {}, rows.map(r => h('tr', {}, r.map(c => h('td', {}, c)))))));
  view.append(wrap); render();
}

/* ---------------- boot ---------------- */
loadCustomSymbols().catch(() => { }).finally(route);
