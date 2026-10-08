import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { sortedLevels, elevations, wallExtensions, wallLen, footprintCells } from './model.js';
import { getSymbol, symbolImage, CATEGORIES } from './symbols.js';

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0, ...extra });

export class Viewer {
  constructor(container, { getImage } = {}) {
    this.el = container; this.getImage = getImage;
    this.opts = { visible: null, explode: 0, xray: false, clip: 1, roof: true, devices: true, markers: true, planTex: false, hiddenCats: new Set() };
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
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4560, 1.0));
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
      frame: M(0xf4f4f4), door: M(0x8b5a2b), garage: M(0x7b8794),
      plate: M(0xf5f5f5, { roughness: .5 }), dark: M(0x222831), metal: M(0x8e98a8, { metalness: .5, roughness: .4 }),
      board: M(0x4b5563), lamp: M(0xfff1b0, { emissive: 0xffd45a, emissiveIntensity: .9 }),
    };
    this.tip = document.createElement('div'); this.tip.className = 'tip'; this.tip.style.display = 'none'; container.append(this.tip);
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    r.domElement.addEventListener('pointermove', e => this.hover(e));
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
    this.clear();
    const levels = sortedLevels(p), elev = elevations(p), o = this.opts;
    const xr = o.xray, clipOn = o.clip < 0.999;
    for (const k of ['wall', 'floor', 'roof', 'frame', 'door', 'garage']) {
      const m = this.mats[k];
      m.transparent = xr; m.opacity = xr ? .28 : 1; m.depthWrite = !xr; m.side = (clipOn || xr) ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true;
    }
    this.mats.floor.opacity = xr ? .5 : 1; this.mats.floor.transparent = xr;
    let minY = 0, maxY = 3;
    const topId = levels.length ? levels[levels.length - 1].id : null;
    levels.forEach((lv, idx) => {
      if (!o.visible.has(lv.id)) return;
      const g = new THREE.Group(); g.position.y = idx * o.explode; g.userData.level = lv.id;
      const e = elev[lv.id];
      minY = Math.min(minY, e - lv.slab + g.position.y); maxY = Math.max(maxY, e + lv.height + g.position.y + (lv.id === topId && o.roof ? .3 : 0));
      this.buildWalls(g, lv, e);
      this.buildSlab(g, lv, e, lv.id === topId);
      if (o.devices) this.buildDevices(g, lv, e);
      if (o.planTex && this.getImage && lv.underlays.plan) this.addPlanTexture(g, lv, e, token);
      this.root.add(g);
    });
    this.minY = minY; this.maxY = maxY;
    this.clipPlane.constant = clipOn ? minY + (maxY - minY) * o.clip : 1e4;
    this.renderer.clippingPlanes = clipOn ? [this.clipPlane] : [];
    this.buildGround(minY);
  }
  buildGround(minY) {
    if (this.ground) { this.scene.remove(this.ground); this.ground.traverse(o => o.geometry && o.geometry.dispose()); }
    const g = this.ground = new THREE.Group();
    const pl = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: 0x1c2a3f, roughness: 1 }));
    pl.rotation.x = -Math.PI / 2; pl.position.y = minY - 0.02; pl.receiveShadow = true; g.add(pl);
    const grid = new THREE.GridHelper(80, 80, 0x3b4c6b, 0x27344d); grid.position.y = minY - 0.015; g.add(grid);
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
      const seg = (u0, u1, y0, y1, mat = mats.wall) => {
        if (u1 - u0 < 0.002 || y1 - y0 < 0.002) return null;
        const um = (u0 + u1) / 2;
        return this.box(g, mat, u1 - u0, y1 - y0, t, w.x1 + dx * um, e + (y0 + y1) / 2, w.y1 + dy * um, ry);
      };
      const ops = lv.openings.filter(o => o.wallId === w.id).sort((a, b) => a.pos - b.pos);
      let cur = -e1;
      for (const op of ops) {
        const s = Math.max(0, op.pos - op.width / 2), en = Math.min(L, op.pos + op.width / 2);
        seg(cur, s, 0, H);
        const sill = op.type === 'door' || op.type === 'opening' || op.type === 'garage' ? 0 : op.sill, head = Math.min(H, sill + op.height);
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
        }
        cur = en;
      }
      seg(cur, L + e2, 0, H);
    }
  }
  buildSlab(g, lv, e, isTop) {
    const fp = footprintCells(lv);
    if (!fp) return;
    for (const r of fp.rects) {
      this.box(g, this.mats.floor, r.w, lv.slab, r.h, r.x + r.w / 2, e - lv.slab / 2, r.y + r.h / 2);
      if (isTop && this.opts.roof) {
        const rf = this.box(g, this.mats.roof, r.w + .6, .2, r.h + .6, r.x + r.w / 2, e + lv.height + .1, r.y + r.h / 2);
        rf.receiveShadow = false;
      }
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
      const grp = new THREE.Group();
      const dev = this.deviceMesh(def);
      grp.add(dev);
      const ang = s.angle || 0, mount = def.mount;
      const y = mount === 'ceiling' ? e + lv.height - 0.01 : e + (s.z ?? def.h);
      grp.position.set(s.x, y, s.y);
      grp.rotation.y = mount === 'wall' ? Math.atan2(Math.cos(ang), Math.sin(ang)) : -ang;
      grp.userData = { sym: s, def, level: lv };
      g.add(grp); this.pickables.push(grp);
      if (this.opts.markers) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTexture(def), transparent: true }));
        sp.scale.set(.3, .3, 1);
        const off = mount === 'ceiling' ? -.28 : mount === 'floor' ? .3 : .26;
        sp.position.set(s.x + (mount === 'wall' ? Math.cos(ang) * .06 : 0), y + off, s.y + (mount === 'wall' ? Math.sin(ang) * .06 : 0));
        sp.userData = { sym: s, def, level: lv };
        g.add(sp); this.pickables.push(sp);
      }
    }
  }
  deviceMesh(def) {
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
      default: add(box(.14, .14, .08), M(0x6b7280), 0, 0, .04); // generic / custom
    }
    return g;
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
    this.tip.innerHTML = `<b>${def.nl}</b><br><span style="color:#93a1bd">${def.en} · ${level.name}${sym.label ? ' · ' + sym.label : ''}${sym.circuit ? ' · kring ' + sym.circuit : ''}</span>`;
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
