import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { sortedLevels, elevations, wallExtensions, wallLen, footprintCells, projectBBox, roomGrid, roomAt } from './model.js';
import { getSymbol, symbolImage, CATEGORIES } from './symbols.js';
import { isLamp, isSwitch } from './wiring.js';

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0, ...extra });

export class Viewer {
  constructor(container, { getImage, onLights } = {}) {
    this.el = container; this.getImage = getImage; this.onLights = onLights || (() => { });
    this.lightState = new Map(); this.lamps = []; this.switches = [];
    this.opts = { visible: null, explode: 0, xray: false, clip: 1, roof: true, devices: true, markers: true, rooms: true, planTex: false, hiddenCats: new Set(), night: false, circuit: null, garden: true, facades: true, site: true, areas: true, sunOn: false, month: 6, hour: 15 };
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x131c2e);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
    this.camera.position.set(14, 12, 16);
    this.controls = new OrbitControls(this.camera, r.domElement);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: .09, zoomToCursor: true, screenSpacePanning: true, maxPolarAngle: Math.PI / 2 - 0.01, minDistance: 0.5, maxDistance: 150 });
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x3a4560, 1.0); this.scene.add(this.hemi);
    this.pool = []; for (let i = 0; i < 16; i++) { const pl = new THREE.PointLight(0xffd9a0, 0, 12, 2); this.scene.add(pl); this.pool.push(pl); }
    this.controls.addEventListener('end', () => this.assignPool());
    const sun = this.sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(12, 22, 8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 80 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
    this.mats = {
      wall: M(0xe8e2d6), floor: M(0x9aa3b2), roof: M(0x5b6578), glass: M(0x9fd4ff, { transparent: true, opacity: .35, roughness: .1 }),
      frame: M(0xf4f4f4), door: M(0x8b5a2b), garage: M(0x7b8794), industrial: M(0x64748b, { roughness: .6, metalness: .3 }), dockdoor: M(0xe2e8f0, { roughness: .5 }), column: M(0xb8b4aa, { roughness: .9 }), ext: M(0xe8e2d6),
      plate: M(0xf5f5f5, { roughness: .5 }), dark: M(0x222831), metal: M(0x8e98a8, { metalness: .5, roughness: .4 }),
      board: M(0x4b5563), lamp: M(0xfff1b0, { emissive: 0xffd45a, emissiveIntensity: .9 }),
    };
    this.tip = document.createElement('div'); this.tip.className = 'tip'; this.tip.style.display = 'none'; container.append(this.tip);
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    r.domElement.addEventListener('pointermove', e => this.hover(e));
    r.domElement.addEventListener('pointerdown', e => { this._down = [e.clientX, e.clientY]; });
    r.domElement.addEventListener('pointerup', e => { if (this._down && Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) < 5) this.click(e); this._down = null; });
    r.domElement.addEventListener('pointerleave', () => this.tip.style.display = 'none');
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.alive = true; this.token = 0;
    const loop = () => { if (!this.alive) return; this.controls.update(); r.render(this.scene, this.camera); this.raf = requestAnimationFrame(loop); };
    loop();
    this.resize();
  }
  dispose() { this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect(); this.renderer.dispose(); this.renderer.domElement.remove(); this.tip.remove(); }
  resize() {
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 200;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  set(o) { Object.assign(this.opts, o); this.build(); }

  /* ---------- building the model ---------- */
  setProject(p, fit = true) { this.project = p; if (!this.opts.visible) this.opts.visible = new Set(p.levels.map(l => l.id)); this.build(); if (fit) this.fit(); }
  clear() {
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.userData.ownMat) { (o.material.map) && o.material.map.dispose(); o.material.dispose(); } });
    this.root.clear(); this.pickables = [];
  }
  build() {
    const p = this.project; if (!p) return;
    const token = ++this.token;
    this.clear(); this.lamps = []; this.switches = [];
    const levels = sortedLevels(p), elev = elevations(p), o = this.opts;
    const xr = o.xray, clipOn = o.clip < 0.999;
    for (const k of ['wall', 'ext', 'floor', 'roof', 'frame', 'door', 'garage']) {
      const m = this.mats[k];
      m.transparent = xr; m.opacity = xr ? .28 : 1; m.depthWrite = !xr; m.side = (clipOn || xr) ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true;
    }
    this.mats.floor.opacity = xr ? .5 : 1; this.mats.floor.transparent = xr;
    let minY = 0, maxY = 3;
    const bb = this.bb = projectBBox(p), size = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0, 6);
    this.applyExterior();
    this.size = size; this.k = Math.min(4, Math.max(1, size / 15)); this.center = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2];
    Object.assign(this.sun.shadow.camera, { left: -size * .8 - 8, right: size * .8 + 8, top: size * .8 + 8, bottom: -size * .8 - 8, far: size * 4 + 80 }); this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.set(this.center[0] + size * .5, size * .9 + 12, this.center[1] + size * .35); this.sun.target.position.set(this.center[0], 0, this.center[1]); this.scene.add(this.sun.target);
    this.camera.far = size * 20 + 500; this.camera.updateProjectionMatrix(); this.controls.maxDistance = size * 8 + 100;
    let topId = null, topY = -1e9; for (const l of levels) if (l.walls.length && elev[l.id] + l.height > topY) { topY = elev[l.id] + l.height; topId = l.id; }
    levels.forEach((lv, idx) => {
      if (!o.visible.has(lv.id)) return;
      const g = new THREE.Group(); g.position.y = idx * o.explode; g.userData.level = lv.id;
      const e = elev[lv.id];
      minY = Math.min(minY, e - lv.slab + g.position.y); maxY = Math.max(maxY, e + lv.height + g.position.y + (lv.id === topId && o.roof ? .3 : 0));
      this.buildWalls(g, lv, e);
      this.buildColumns(g, lv, e);
      if (o.rooms) this.buildRooms(g, lv, e);
      this.buildSlab(g, lv, e, lv.id === topId);
      if (o.devices) this.buildDevices(g, lv, e);
      if (o.planTex && this.getImage && lv.underlays.plan) this.addPlanTexture(g, lv, e, token);
      this.root.add(g);
    });
    this.minY = minY; this.maxY = maxY;
    this.topWall = maxY - (o.roof ? .3 : 0);
    if (o.facades !== false) this.buildFacades(token);
    this.clipPlane.constant = clipOn ? minY + (maxY - minY) * o.clip : 1e4;
    this.renderer.clippingPlanes = clipOn ? [this.clipPlane] : [];
    this.buildGround(minY);
    this.applyEnvironment(); this.updateLights();
  }

  /* ---------- exterior: materials, facades, garden ---------- */
  applyExterior() {
    const st = this.project.settings || {}, ext = this.mats.ext;
    ext.color.set(st.wallColor || '#e8e2d6'); this.mats.roof.color.set(st.roofColor || '#5b6578');
    const pat = st.wallPattern || 'plain', key = pat + '|' + ext.color.getHexString();
    if (this._extKey === key) return; this._extKey = key;
    if (ext.map) { ext.map.dispose(); ext.map = null; }
    if (pat !== 'plain') {
      const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
      if (pat === 'brick') {
        x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 8; r++) for (let b = -1; b < 5; b++) { const bx = b * 64 + (r % 2 ? 32 : 0); x.fillStyle = `rgba(255,255,255,${.78 + Math.random() * .22})`; x.fillRect(bx + 2, r * 32 + 2, 60, 28); }
      } else { x.fillStyle = 'rgba(0,0,0,.22)'; for (let r = 0; r < 8; r++) { x.fillRect(0, r * 32, 256, 3); } }
      const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      ext.map = tex; ext.userData.tile = pat === 'brick' ? 1.0 : 1.2;
    }
    ext.needsUpdate = true;
  }
  async buildFacades(token) {
    const f = this.project.facades || {}, bb = this.bb, top = this.topWall || 3;
    let off = .17; // clear the thickest outer wall
    for (const lv of this.project.levels) for (const w of lv.walls) off = Math.max(off, w.t / 2 + .02);
    const cx = (bb.x0 + bb.x1) / 2, cz = (bb.y0 + bb.y1) / 2, W = bb.x1 - bb.x0, D = bb.y1 - bb.y0;
    const sides = { front: [W, cx, bb.y1 + off, 0], back: [W, cx, bb.y0 - off, Math.PI], left: [D, bb.x0 - off, cz, -Math.PI / 2], right: [D, bb.x1 + off, cz, Math.PI / 2] };
    for (const [side, spec] of Object.entries(f)) {
      if (!spec || !spec.docId || !sides[side]) continue;
      const bmp = await this.getImage(spec.docId); if (!bmp || token !== this.token) return;
      const cr = spec.crop || { x0: 0, y0: 0, x1: bmp.width, y1: bmp.height };
      const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(cr.x1 - cr.x0)); c.height = Math.max(8, Math.round(cr.y1 - cr.y0));
      c.getContext('2d').drawImage(bmp, cr.x0, cr.y0, cr.x1 - cr.x0, cr.y1 - cr.y0, 0, 0, c.width, c.height);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const [len, px, pz, ry] = sides[side];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, top), new THREE.MeshStandardMaterial({ map: tex, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.FrontSide }));
      m.userData.ownMat = true; m.position.set(px, top / 2, pz); m.rotation.y = ry; m.receiveShadow = true; this.root.add(m);
    }
  }
  buildColumns(g, lv, e) {
    for (const c of lv.columns || []) {
      const H = c.h || lv.height;
      const m = c.round ? new THREE.Mesh(new THREE.CylinderGeometry(c.w / 2, c.w / 2, H, 24), this.mats.column) : new THREE.Mesh(new THREE.BoxGeometry(c.w, H, c.d || c.w), this.mats.column);
      m.position.set(c.x, e + H / 2, c.y); m.castShadow = m.receiveShadow = true; g.add(m);
    }
  }
  buildRooms(g, lv, e) {
    this._rt = this._rt || new Map();
    const gr = this.opts.areas ? roomGrid(lv) : null;
    for (const r0 of lv.rooms || []) {
      const id = gr ? roomAt(gr, r0.x, r0.y) : 0, rm = id && gr.rooms.get(id), r = { ...r0, text: r0.text + (rm ? ` · ${rm.area.toFixed(1)} m²` : '') };
      let tex = this._rt.get(r.text);
      if (!tex) {
        const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
        x.font = '600 56px Inter, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        const w = Math.min(500, x.measureText(r.text).width + 40); x.fillStyle = 'rgba(11,18,32,.82)'; x.beginPath(); x.roundRect((512 - w) / 2, 24, w, 80, 18); x.fill();
        x.fillStyle = '#fff'; x.fillText(r.text, 256, 66, 480); tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.userData = { w: (w + 0) / 512 }; this._rt.set(r.text, tex);
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      const sc = .55 * this.k; sp.scale.set(sc * 4 * tex.userData.w + .001, sc, 1); sp.position.set(r.x, e + .4 * this.k, r.y); sp.renderOrder = 5; g.add(sp);
    }
  }
  buildGround(minY) {
    if (this.ground) { this.scene.remove(this.ground); this.ground.traverse(o => { o.geometry && o.geometry.dispose(); if (o.material && o.userData.own) { o.material.map && o.material.map.dispose(); o.material.dispose(); } }); }
    const g = this.ground = new THREE.Group(), R = Math.max(60, this.size * 3), step = this.size > 45 ? 5 : 1, bb = this.bb, st = this.project.settings || {};
    const pl = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshStandardMaterial({ color: 0x1c2a3f, roughness: 1 }));
    pl.rotation.x = -Math.PI / 2; pl.position.set(this.center[0], minY - 0.02, this.center[1]); pl.receiveShadow = true; g.add(pl);
    if (this.opts.garden && st.garden !== false) {
      const hole = (shape, x0, y0, x1, y1) => { const p = new THREE.Path(); p.moveTo(x0, -y0); p.lineTo(x0, -y1); p.lineTo(x1, -y1); p.lineTo(x1, -y0); p.closePath(); shape.holes.push(p); };
      const lawn = new THREE.Shape(); lawn.absarc(this.center[0], -this.center[1], R * .62, 0, Math.PI * 2, false); hole(lawn, bb.x0 - .12, bb.y0 - .12, bb.x1 + .12, bb.y1 + .12);
      if (!this._lawnTex) { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#4a8a3c'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${40 + Math.random() * 40},${100 + Math.random() * 60},${30 + Math.random() * 30},.5)`; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 5); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; this._lawnTex = t; }
      const lt = this._lawnTex.clone(); lt.needsUpdate = true; lt.repeat.set(R * .62 / 3, R * .62 / 3);
      const lg = new THREE.ShapeGeometry(lawn, 48); lg.rotateX(-Math.PI / 2);
      const uv = lg.attributes.uv, pos = lg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getZ(i) / 4);
      const lm = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: lt, roughness: 1 })); lm.material.map.repeat.set(1, 1); lm.material.userData = {}; lm.userData.own = true;
      lm.position.y = -0.26; lm.receiveShadow = true; g.add(lm);
      const pave = new THREE.Shape(); const m = 1.3; pave.moveTo(bb.x0 - m, -(bb.y0 - m)); pave.lineTo(bb.x0 - m, -(bb.y1 + m)); pave.lineTo(bb.x1 + m, -(bb.y1 + m)); pave.lineTo(bb.x1 + m, -(bb.y0 - m)); pave.closePath(); hole(pave, bb.x0 - .12, bb.y0 - .12, bb.x1 + .12, bb.y1 + .12);
      const pg = new THREE.ShapeGeometry(pave); pg.rotateX(-Math.PI / 2);
      const pm = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x8b8f98, roughness: .95, polygonOffset: true, polygonOffsetFactor: -1 })); pm.userData.own = true; pm.position.y = -0.255; pm.receiveShadow = true; g.add(pm);
      // trees on a loose ring around the plot (deterministic per project)
      let seed = 0; for (const ch of this.project.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }), leaf = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: .9 });
      const half = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) / 2, n = 18 + Math.round(this.size / 4);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = half * 1.6 + 8 + rnd() * half * 1.6, h = 3.2 + rnd() * 3.6, tx = this.center[0] + Math.cos(a) * d, tz = this.center[1] + Math.sin(a) * d * .8;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(.18, .26, h * .45, 8), trunk); t.position.set(tx, -.26 + h * .22, tz); t.castShadow = true; g.add(t);
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(h * .32, h * .7, 10), leaf); c1.position.set(tx, -.26 + h * .45 + h * .3, tz); c1.castShadow = true; g.add(c1);
      }
    }
    // site plan draped on the ground (from the ground level's "site" underlay)
    if (this.opts.site && st.siteOn !== false) for (const lv of this.project.levels) {
      const u = lv.underlays.site; if (!u || !this.getImage) continue;
      this.getImage(u.docId).then(bmp => {
        if (!bmp || !this.alive || this.ground !== g) return;
        const tex = new THREE.CanvasTexture(bmp); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        const w = u.w / u.pxPerM, hh = u.h / u.pxPerM;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: .92, polygonOffset: true, polygonOffsetFactor: -3 }));
        m.userData.own = true; m.rotation.x = -Math.PI / 2; m.position.set(u.ox + w / 2, -0.25, u.oy + hh / 2); g.add(m);
      });
    }
    const n = Math.round(R * 1.3 / step) * 2, grid = new THREE.GridHelper(n * step, n, 0x3b4c6b, 0x27344d); grid.position.set(this.center[0], minY - 0.015, this.center[1]); grid.visible = !(this.opts.garden && st.garden !== false); g.add(grid);
    this.scene.add(g);
  }
  box(parent, mat, w, h, d, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  buildWalls(g, lv, e) {
    const exts = wallExtensions(lv), mats = this.mats;
    for (const w of lv.walls) {
      const L = wallLen(w); if (L < 0.05) continue;
      const [e1, e2] = exts.get(w.id);
      const dx = (w.x2 - w.x1) / L, dy = (w.y2 - w.y1) / L, ry = -Math.atan2(dy, dx);
      const H = w.h || lv.height, t = w.t;
      const bb = this.bb, mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2, nearX = Math.min(Math.abs(mx - bb.x0), Math.abs(mx - bb.x1)) < .5 && Math.abs(dx) < .02, nearY = Math.min(Math.abs(my - bb.y0), Math.abs(my - bb.y1)) < .5 && Math.abs(dy) < .02;
      const isExt = nearX || nearY, nz = [Math.sin(ry), Math.cos(ry)], outer = ((mx - (bb.x0 + bb.x1) / 2) * nz[0] + (my - (bb.y0 + bb.y1) / 2) * nz[1]) > 0 ? 4 : 5;
      const seg = (u0, u1, y0, y1, mat = mats.wall) => {
        if (u1 - u0 < 0.002 || y1 - y0 < 0.002) return null;
        const um = (u0 + u1) / 2;
        if (isExt && mat === mats.wall) { // outside face + top in the facade material, the rest plaster
          const geo = new THREE.BoxGeometry(u1 - u0, y1 - y0, t), L2 = u1 - u0, H2 = y1 - y0;
          if (mats.ext.map) { const uv = geo.attributes.uv, tile = mats.ext.userData.tile || 1.2; for (const f of [outer, 2]) for (let i = f * 4; i < f * 4 + 4; i++) { uv.setXY(i, uv.getX(i) * (f === 2 ? L2 : L2) / tile, uv.getY(i) * (f === 2 ? t : H2) / tile); } uv.needsUpdate = true; }
          const ms = [mats.wall, mats.wall, mats.ext, mats.wall, mats.wall, mats.wall]; ms[outer] = mats.ext;
          const m = new THREE.Mesh(geo, ms); m.position.set(w.x1 + dx * um, e + (y0 + y1) / 2, w.y1 + dy * um); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); return m;
        }
        return this.box(g, mat, u1 - u0, y1 - y0, t, w.x1 + dx * um, e + (y0 + y1) / 2, w.y1 + dy * um, ry);
      };
      const ops = lv.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
      let cur = -e1;
      for (const op of ops) {
        const s = Math.max(0, op.pos - op.width / 2), en = Math.min(L, op.pos + op.width / 2);
        seg(cur, s, 0, H);
        const sill = ['door', 'opening', 'garage', 'sectional', 'rollup'].includes(op.type) ? 0 : op.sill, head = Math.min(H, sill + op.height);
        seg(s, en, 0, sill); seg(s, en, head, H);
        const um = (s + en) / 2, cx = w.x1 + dx * um, cz = w.y1 + dy * um, ow = en - s;
        if (op.type === 'window') {
          this.box(g, mats.glass, ow - .08, op.height - .08, .03, cx, e + sill + op.height / 2, cz, ry).castShadow = false;
          const f = .05;
          this.box(g, mats.frame, ow, f, t * .7, cx, e + sill + f / 2, cz, ry); this.box(g, mats.frame, ow, f, t * .7, cx, e + head - f / 2, cz, ry);
          this.box(g, mats.frame, f, op.height, t * .7, w.x1 + dx * (s + f / 2), e + sill + op.height / 2, w.y1 + dy * (s + f / 2), ry);
          this.box(g, mats.frame, f, op.height, t * .7, w.x1 + dx * (en - f / 2), e + sill + op.height / 2, w.y1 + dy * (en - f / 2), ry);
          this.box(g, mats.frame, ow - .08, .03, t * .9, cx, e + sill - .015, cz, ry);
        } else if (op.type === 'door' || op.type === 'garage') {
          this.box(g, op.type === 'door' ? mats.door : mats.garage, ow - .06, op.height - .03, .045, cx, e + (op.height - .03) / 2 + .01, cz, ry);
        } else if (op.type === 'sectional' || op.type === 'rollup' || op.type === 'dock') {
          const lm = op.type === 'dock' ? mats.dockdoor : mats.industrial, hh = op.height - .04, y0 = e + sill + .02;
          const panels = Math.max(2, Math.round(hh / .6));
          for (let i = 0; i < panels; i++) this.box(g, lm, ow - .08, hh / panels - .02, .06, cx, y0 + (i + .5) * hh / panels, cz, ry);
        }
        cur = en;
      }
      seg(cur, L + e2, 0, H);
    }
  }
  buildSlab(g, lv, e, isTop) {
    const fp = footprintCells(lv);
    if (!fp) return;
    const st = this.project.settings || {}, gable = st.roofType === 'gable';
    let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
    for (const r of fp.rects) {
      this.box(g, this.mats.floor, r.w, lv.slab, r.h, r.x + r.w / 2, e - lv.slab / 2, r.y + r.h / 2);
      bx0 = Math.min(bx0, r.x); bx1 = Math.max(bx1, r.x + r.w); by0 = Math.min(by0, r.y); by1 = Math.max(by1, r.y + r.h);
      if (isTop && this.opts.roof) {
        if (gable) this.box(g, this.mats.roof, r.w, .15, r.h, r.x + r.w / 2, e + lv.height + .075, r.y + r.h / 2);
        else { const rf = this.box(g, this.mats.roof, r.w + .6, .2, r.h + .6, r.x + r.w / 2, e + lv.height + .1, r.y + r.h / 2); rf.receiveShadow = false; }
      }
    }
    if (isTop && this.opts.roof && gable && bx1 > bx0) {
      const ov = .5, W = bx1 - bx0 + 2 * ov, D = by1 - by0 + 2 * ov, alongX = W >= D, span = alongX ? D : W, len = alongX ? W : D;
      const rise = Math.tan(THREE.MathUtils.degToRad(st.roofPitch || 8)) * span / 2;
      const sh = new THREE.Shape(); sh.moveTo(-span / 2, 0); sh.lineTo(span / 2, 0); sh.lineTo(0, rise); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2);
      const m = new THREE.Mesh(geo, this.mats.roof); m.rotation.y = alongX ? Math.PI / 2 : 0;
      m.position.set((bx0 + bx1) / 2, e + lv.height + .15, (by0 + by1) / 2); m.castShadow = true; g.add(m);
    }
  }
  async addPlanTexture(g, lv, e, token) {
    const u = lv.underlays.plan;
    const bmp = await this.getImage(u.docId); if (!bmp || token !== this.token) return;
    const tex = new THREE.CanvasTexture(bmp); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const w = u.w / u.pxPerM, hh = u.h / u.pxPerM;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: .85, depthWrite: false }));
    m.userData.ownMat = true;
    m.rotation.x = -Math.PI / 2; m.position.set(u.ox + w / 2, e + 0.012, u.oy + hh / 2); m.renderOrder = 1;
    g.add(m);
  }

  /* ---------- electrical devices ---------- */
  markerTexture(def) {
    this._tex = this._tex || new Map();
    if (this._tex.has(def.id)) return this._tex.get(def.id);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const col = (CATEGORIES[def.cat] || CATEGORIES.custom).color;
    const draw = () => {
      const x = c.getContext('2d'); x.clearRect(0, 0, 128, 128);
      x.fillStyle = '#0b1220'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
      x.lineWidth = 8; x.strokeStyle = col; x.stroke();
      const im = symbolImage(def, '#ffffff'); if (im.complete && im.naturalWidth) x.drawImage(im, 26, 26, 76, 76);
      tex.needsUpdate = true;
    };
    draw(); const im = symbolImage(def, '#ffffff'); if (!im.complete) im.addEventListener('load', draw);
    this._tex.set(def.id, tex); return tex;
  }
  buildDevices(g, lv, e) {
    for (const s of lv.symbols) {
      const def = getSymbol(s.type); if (!def || this.opts.hiddenCats.has(def.cat)) continue;
      if (this.opts.circuit && String(s.circuit || '') !== this.opts.circuit) continue;
      const grp = new THREE.Group();
      const dev = this.deviceMesh(def, s);
      grp.add(dev);
      const lampLike = isLamp(def), swLike = isSwitch(def);
      if (lampLike || swLike) { // generous invisible click target
        const hit = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, .3), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, lampLike && def.mount === 'ceiling' ? -.1 : 0, .06); grp.add(hit);
      }
      let lampRec = null;
      if (lampLike) { // own materials so each lamp can light up independently
        const mats = [];
        dev.traverse(o => { if (o.isMesh && o.material === this.mats.lamp) { o.material = this.mats.lamp.clone(); o.material.emissiveIntensity = 0; o.material.color.set(0xd8d2c0); mats.push(o.material); } });
        lampRec = { key: lv.id + '|' + (s.ctl || ''), mats, def, s, glow: null, grp, level: lv };
        this.lamps.push(lampRec);
      }
      if (!def.linear && !['cabinet', 'trafo', 'motor'].includes(def.model)) dev.scale.setScalar(Math.min(2.2, 1 + (this.k - 1) * .35));
      const ang = s.angle || 0, mount = def.mount;
      const y = mount === 'ceiling' ? (s.z != null ? e + s.z : e + lv.height - 0.01) : e + (s.z ?? def.h);
      grp.position.set(s.x, y, s.y);
      grp.rotation.y = mount === 'ceiling' ? -ang : Math.atan2(Math.cos(ang), Math.sin(ang));
      grp.userData = { sym: s, def, level: lv };
      g.add(grp); this.pickables.push(grp);
      if (lampRec) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        const gs = (def.model === 'tube' ? 1.6 : def.model === 'highbay' ? 2.6 : def.model === 'spot' ? .7 : 1.2) * Math.min(2.5, this.k);
        glow.scale.set(gs, gs, 1); glow.position.set(s.x, y - (mount === 'ceiling' ? .12 : 0), s.y); glow.visible = false; glow.raycast = () => { }; g.add(glow); lampRec.glow = glow;
      }
      if (this.opts.markers) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTexture(def), transparent: true }));
        sp.scale.set(.3 * this.k, .3 * this.k, 1);
        const off = (mount === 'ceiling' ? -.28 : mount === 'floor' ? ((def.model === 'cabinet' || def.model === 'trafo') ? 2.4 : .6) : .26) * (mount === 'floor' ? 1 : this.k);
        sp.position.set(s.x + (mount === 'wall' ? Math.cos(ang) * .06 : 0), y + off, s.y + (mount === 'wall' ? Math.sin(ang) * .06 : 0));
        sp.userData = { sym: s, def, level: lv };
        g.add(sp); this.pickables.push(sp);
        if (swLike) this.switches.push({ sp, key: lv.id + '|' + (s.ctl || '') });
      }
    }
  }
  deviceMesh(def, s = {}) {
    const m = this.mats, g = new THREE.Group();
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0) => { const k = new THREE.Mesh(geo, mat); k.position.set(x, y, z); k.rotation.set(rx, ry, 0); k.castShadow = true; g.add(k); return k; };
    const tint = def.tint ? M(def.tint, { roughness: .5 }) : m.plate;
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r, h, s = 24) => new THREE.CylinderGeometry(r, r, h, s);
    const X = Math.PI / 2;
    switch (def.model) {
      case 'lamp': add(cyl(.17, .05), m.lamp, 0, -.025, 0); break;
      case 'spot': add(cyl(.05, .02), m.lamp, 0, -.01, 0); break;
      case 'tube': add(box(1.2, .05, .08), m.lamp, 0, -.025, 0); break;
      case 'wlamp': add(new THREE.SphereGeometry(.1, 20, 12, 0, 7, 0, X), m.lamp, 0, 0, .0, X, 0); break;
      case 'switch': {
        add(box(.085, .085, .012), tint, 0, 0, .006);
        const n = def.rockers || 1;
        for (let i = 0; i < n; i++) add(box(.06 / (n > 1 ? 1.3 : 1) * (n > 1 ? .95 : 1), .06 / n * (n > 1 ? 1.05 : 1.2), .008), m.plate, 0, n > 1 ? (i - .5) * .032 : 0, .015).material = M(0xdcdcdc);
        break; }
      case 'button': add(box(.085, .085, .012), tint, 0, 0, .006); add(cyl(.026, .014), m.metal, 0, 0, .017, X); break;
      case 'dimmer': add(box(.085, .085, .012), tint, 0, 0, .006); add(cyl(.026, .02), m.metal, 0, 0, .02, X); break;
      case 'socket': {
        const n = def.gangs || 1;
        for (let i = 0; i < n; i++) {
          const x = (i - (n - 1) / 2) * .08;
          add(box(.08, .08, .014), tint, x, 0, .007);
          add(cyl(.026, .006), M(0xffffff), x, 0, .016, X);
          add(cyl(.004, .008, 8), m.dark, x - .01, 0, .02, X); add(cyl(.004, .008, 8), m.dark, x + .01, 0, .02, X);
        }
        break; }
      case 'power': add(cyl(.075, .05), M(0xd33a2c), 0, 0, .025, X); break;
      case 'floorbox': add(box(.16, .012, .16), m.metal, 0, .006, 0); break;
      case 'ev': add(box(.22, .32, .1), M(0x1f2937), 0, 0, .05); add(cyl(.02, .01), M(0x22c55e, { emissive: 0x22c55e }), 0, .1, .1, X); break;
      case 'data': add(box(.08, .08, .014), m.plate, 0, 0, .007); add(box(.035, .03, .01), tint, 0, 0, .017); break;
      case 'panelbox': add(box(.18, .26, .04), m.dark, 0, 0, .02); add(box(.12, .08, .01), M(0x60a5fa, { emissive: 0x2563eb }), 0, .05, .045); break;
      case 'bell': add(new THREE.SphereGeometry(.07, 16, 10, 0, 7, X, X), m.metal, 0, 0, 0); break;
      case 'detector': add(cyl(.055, .03), tint, 0, -.015, 0); break;
      case 'pull': add(cyl(.004, .5, 6), m.dark, 0, -.25, 0); add(new THREE.SphereGeometry(.015, 8, 8), m.dark, 0, -.5, 0); break;
      case 'fan': add(cyl(.11, .05), m.plate, 0, -.025, 0); add(cyl(.07, .052), m.dark, 0, -.026, 0); break;
      case 'board': add(box(.45, .65, .14), m.board, 0, 0, .07); add(box(.4, .58, .01), M(0x9ca3af), 0, 0, .145); break;
      case 'cyl': add(cyl(.2, .8), M(0xf3f4f6), 0, 0, .2); break;
      case 'highbay': add(new THREE.ConeGeometry(.28, .3, 24, 1, true), M(0xc9d1dc, { side: THREE.DoubleSide, metalness: .5 }), 0, -.15, 0).rotation.x = Math.PI; add(cyl(.12, .05), m.lamp, 0, -.28, 0); break;
      case 'tray': case 'busbar': { const L = s.len || def.len || 4; add(box(L, def.model === 'tray' ? .08 : .14, def.model === 'tray' ? .4 : .14), def.model === 'tray' ? m.metal : M(0xd97706), 0, -.05, 0); break; }
      case 'cabinet': add(box(def.id === 'ind_ups' ? .6 : 1.2, 2.0, .6), M(0x9ca3af, { metalness: .3 }), 0, 1.0, .3); add(box(def.id === 'ind_ups' ? .4 : .9, .3, .02), M(0x2563eb, { emissive: 0x1d4ed8, emissiveIntensity: .5 }), 0, 1.5, .61); break;
      case 'trafo': add(box(2.4, 2.2, 1.8), M(0x94a3b8, { metalness: .3 }), 0, 1.1, .9); add(box(1.8, .2, .02), M(0xfacc15), 0, 1.8, 1.81); break;
      case 'motor': add(cyl(.22, .55), M(0x2563eb, { metalness: .4 }), 0, .35, 0, X, 0); add(box(.5, .08, .4), m.dark, 0, .04, 0); break;
      case 'estop': add(cyl(.05, .04), M(0xf2c200), 0, 0, .02, X); add(cyl(.032, .04), M(0xd11a1a), 0, 0, .055, X); break;
      case 'callpoint': add(box(.09, .09, .035), M(0xd11a1a), 0, 0, .0175); add(box(.05, .05, .01), M(0xffffff), 0, 0, .04); break;
      case 'sprinkler': add(cyl(.012, .1, 8), M(0xb45309), 0, -.05, 0); add(cyl(.04, .01, 12), M(0xb45309), 0, -.11, 0); break;
      case 'extinguisher': add(cyl(.07, .35), M(0xd11a1a), 0, 0, .1); add(cyl(.02, .06), m.dark, 0, .2, .1); break;
      case 'hosereel': add(cyl(.2, .1), M(0xd11a1a), 0, 0, .06, X); add(cyl(.09, .11), m.dark, 0, 0, .06, X); break;
      case 'sign': add(box(.4, .2, .025), M(0x16a34a, { emissive: 0x22c55e, emissiveIntensity: .7 }), 0, 0, .0125); break;
      case 'camera': add(box(.08, .08, .22), M(0xe5e7eb), 0, 0, .11); add(cyl(.03, .04), m.dark, 0, 0, .23, X); break;
      default: add(box(.14, .14, .08), M(0x6b7280), 0, 0, .04); // generic / custom
    }
    return g;
  }

  /* ---------- lighting simulation ---------- */
  glowTexture() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,230,170,1)'); gr.addColorStop(.25, 'rgba(255,210,140,.45)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return this._glow = new THREE.CanvasTexture(c);
  }
  groupLevel(key) { return this.lightState.get(key) || 0; }
  setGroup(levelId, ctl, v) { this.lightState.set(levelId + '|' + (ctl || ''), v); this.updateLights(); this.onLights(); }
  toggleGroup(levelId, ctl) { this.setGroup(levelId, ctl, this.groupLevel(levelId + '|' + (ctl || '')) > 0 ? 0 : 1); }
  allLights(on) { for (const l of this.lamps) this.lightState.set(l.key, on ? 1 : 0); this.updateLights(); this.onLights(); }
  /** lamp groups of the visible levels: [{levelId, ctl, name, count, level, dimmer}] */
  groupsInfo() {
    const out = new Map();
    for (const l of this.lamps) {
      const k = l.key; let o = out.get(k);
      if (!o) { const ctl = l.s.ctl || ''; o = { key: k, levelId: l.level.id, ctl, count: 0, levelName: l.level.name, name: ctl ? (l.level.groupNames && l.level.groupNames[ctl]) || ctl : 'Lights without a switch', dimmer: false }; out.set(k, o); }
      o.count++;
    }
    for (const lv of this.project.levels) for (const s of lv.symbols) if (s.type === 'sw_dimmer') { const o = out.get(lv.id + '|' + (s.ctl || '')); if (o) o.dimmer = true; }
    return [...out.values()].map(o => ({ ...o, value: this.groupLevel(o.key) }));
  }
  updateLights() {
    for (const l of this.lamps) {
      const v = this.groupLevel(l.key);
      for (const m of l.mats) { m.emissiveIntensity = v * 1.6; m.color.set(v > 0 ? 0xfff4d0 : 0xd8d2c0); }
      if (l.glow) { l.glow.visible = v > 0; l.glow.material.opacity = Math.min(1, .25 + .6 * v) * (this.opts.night ? 1 : .55); }
    }
    for (const s of this.switches) s.sp.material.color.set(this.groupLevel(s.key) > 0 ? 0xffe9a0 : 0xffffff);
    this.assignPool();
  }
  assignPool() {
    const t = this.controls.target, lit = this.lamps.filter(l => this.groupLevel(l.key) > 0 && l.grp.parent && l.grp.parent.visible);
    for (const l of lit) { l._d = l.grp.getWorldPosition(this._v ||= new THREE.Vector3()).distanceToSquared(t); }
    lit.sort((a, b) => a._d - b._d);
    const range = 7 * Math.min(2.2, this.k);
    this.pool.forEach((pl, i) => {
      const l = lit[i];
      if (!l) { pl.intensity = 0; return; }
      l.grp.getWorldPosition(pl.position); pl.position.y -= .25;
      pl.intensity = (l.def.model === 'highbay' ? 90 : l.def.model === 'spot' ? 9 : 15) * this.groupLevel(l.key) * Math.min(2.5, this.k * this.k * .6 + .4);
      pl.distance = range * (l.def.model === 'highbay' ? 1.8 : 1);
    });
  }
  applyEnvironment() {
    const n = this.opts.night;
    this.hemi.intensity = n ? .1 : 1; this.sun.intensity = n ? .03 : 1.6;
    this.scene.background.set(n ? 0x04070d : 0x131c2e);
    if (!n && this.opts.sunOn) {
      const sp = this.sunPosition(); this._sunInfo = sp;
      const up = Math.max(0, Math.sin(sp.el)), d = this.size * 2 + 30;
      this.sun.position.set(this.center[0] + sp.x * d, Math.max(2, sp.y * d), this.center[1] + sp.z * d);
      this.sun.intensity = sp.el > 0 ? 0.3 + 2.3 * Math.sqrt(up) : 0; this.hemi.intensity = sp.el > 0 ? .25 + .6 * Math.sqrt(up) : .12;
      this.sun.color.set(sp.el < .25 ? 0xffb070 : 0xfff4e0);
      this.scene.background.set(sp.el > 0 ? (sp.el < .25 ? 0x3a3550 : 0x6a8fc0) : 0x070b14);
    } else { this._sunInfo = null; this.sun.position.set(this.center[0] + this.size * .5, this.size * .9 + 12, this.center[1] + this.size * .35); }
    this.mats.glass.opacity = this.opts.xray ? .2 : (n ? .6 : .35);
  }

  /** unit vector towards the sun in scene coordinates (x east, z south of the plan) + elevation (rad) */
  sunPosition() {
    const lat = (this.project.settings.lat ?? 50.85) * Math.PI / 180, north = (this.project.settings.north || 0) * Math.PI / 180;
    const N = Math.round((this.opts.month - 1) * 30.4 + 15), dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + N) / 365), H = (this.opts.hour - 12) * 15 * Math.PI / 180;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI; // from north, clockwise
    az -= north; // plan "up" may not point to true north
    const c = Math.cos(el); return { x: Math.sin(az) * c, y: Math.sin(el), z: -Math.cos(az) * c, el, az };
  }
  click(e) {
    if (!this.pickables || !this.pickables.length) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    for (const h of this.ray.intersectObjects(this.pickables, true)) {
      let o = h.object; while (o && !o.userData.def) o = o.parent;
      if (!o) continue;
      const { sym, def, level } = o.userData;
      if (isSwitch(def) || isLamp(def)) {
        let ctl = sym.ctl || '';
        if (def.id === 'sw_double' && sym.ctl2 && o.isGroup) { const p = o.worldToLocal(h.point.clone()); if (p.y < 0) ctl = sym.ctl2; }
        this.toggleGroup(level.id, ctl); return;
      }
    }
  }
  hover(e) {
    if (!this.pickables || !this.pickables.length) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hits = this.ray.intersectObjects(this.pickables, true);
    let hit = null;
    for (const h of hits) { let o = h.object; while (o && !o.userData.def) o = o.parent; if (o) { hit = o; break; } }
    if (!hit) { this.tip.style.display = 'none'; return; }
    const { sym, def, level } = hit.userData;
    const clickable = isSwitch(def) || isLamp(def);
    this.tip.innerHTML = `<b>${def.nl}</b>${clickable ? ' <span style="color:#fbbf24">· click to switch</span>' : ''}<br><span style="color:#93a1bd">${def.en} · ${level.name}${sym.label ? ' · ' + sym.label : ''}${sym.circuit ? ' · kring ' + sym.circuit : ''}</span>`;
    this.tip.style.display = 'block';
    this.tip.style.left = (e.clientX - r.left + 14) + 'px'; this.tip.style.top = (e.clientY - r.top + 14) + 'px';
  }

  /* ---------- camera helpers ---------- */
  bounds() {
    const b = new THREE.Box3();
    this.root.traverse(o => { if (o.isMesh && !o.userData.ownMat) b.expandByObject(o); });
    return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5)) : b;
  }
  fit(view = 'iso') {
    const b = this.bounds(), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
    const R = Math.max(s.x, s.y, s.z, 3) * 0.5;
    const d = R / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.25 + R * .3;
    const dirs = { iso: [1, .8, 1.1], top: [0, 1, 0.0001], front: [0, .12, 1], back: [0, .12, -1], left: [-1, .12, 0], right: [1, .12, 0] };
    const v = new THREE.Vector3(...(dirs[view] || dirs.iso)).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(v, d);
    this.controls.update();
  }
  zoom(f) {
    const off = this.camera.position.clone().sub(this.controls.target);
    this.camera.position.copy(this.controls.target).addScaledVector(off, f);
  }
  autoRotate(on) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = 1.2; }
  snapshot(w, h) {
    const r = this.renderer, size = r.getSize(new THREE.Vector2());
    if (w) { r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    r.render(this.scene, this.camera);
    const url = r.domElement.toDataURL('image/png');
    if (w) this.resize();
    return url;
  }
}
