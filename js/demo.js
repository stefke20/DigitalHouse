import { newProject, newLevel, LEVEL_PRESETS } from './model.js';
import { uid } from './util.js';

const wall = (x1, y1, x2, y2, t = .1) => ({ id: uid('w'), x1, y1, x2, y2, t });
const P = LEVEL_PRESETS;
// distance of a point along wall w from its start
const on = (w, x, y) => Math.hypot(x - w.x1, y - w.y1);

function box(lv, t, x0, y0, x1, y1) {
  const ws = [wall(x0, y0, x1, y0, t), wall(x1, y0, x1, y1, t), wall(x1, y1, x0, y1, t), wall(x0, y1, x0, y0, t)];
  lv.walls.push(...ws); return ws; // top, right, bottom, left
}
const op = (lv, w, pos, width, type = 'window', sill = .9, height = 1.3) => lv.openings.push({ id: uid('o'), wallId: w.id, pos, width, type, sill, height });
const sym = (lv, type, x, y, angle = 0, extra = {}) => lv.symbols.push({ id: uid('s'), type, x, y, angle, ...extra });
const D = Math.PI / 2; // facing +y (south)  | 0 = +x (east) | PI = west | -D = north

export function demoProject() {
  const p = newProject('Demo house (Belgian)');
  /* ---------- basement ---------- */
  const b = newLevel(P[0]);
  const [bt, br, bb, bl] = box(b, .3, 0, 0, 10, 8);
  const bm = wall(5, .15, 5, 4.2, .14); b.walls.push(bm);
  const bm2 = wall(5, 4.2, 10 - .15, 4.2, .14); b.walls.push(bm2);
  op(b, bm, 2.6, .9, 'door', 0, 2.0); op(b, bm2, 2.5, .9, 'door', 0, 2.0);
  op(b, bt, 2.5, .8, 'window', 1.6, .5); op(b, bb, 2.5, .8, 'window', 1.6, .5); op(b, bb, 7.5, .8, 'window', 1.6, .5);
  sym(b, 'panel_board', 5.08, 2.0, -D / -1 * 0 + 0, { z: 1.3, label: 'Hoofdbord' });
  sym(b, 'panel_meter', .17, 1.5, 0, { z: 1.5 });
  sym(b, 'light_tl', 2.5, 2, 0, { label: 'Berging' }); sym(b, 'light_tl', 7.5, 2, 0); sym(b, 'light_tl', 2.5, 6, 0); sym(b, 'light_tl', 7.5, 6, 0);
  sym(b, 'sw_single', 4.9, 4.9, Math.PI, { label: 'Berging' });
  sym(b, 'sock_single', .17, 5, 0); sym(b, 'sock_single', 9.83, 6, Math.PI); sym(b, 'sock_dedicated', .17, 6.5, 0, { label: 'Wasmachine', circuit: '7' });
  sym(b, 'sock_dedicated', .17, 7.2, 0, { label: 'Droogkast', circuit: '8' });
  sym(b, 'panel_boiler', 9.5, 7.4, -D, { z: 1.0 });
  sym(b, 'safe_smoke', 5, 6, 0);
  /* ---------- ground floor ---------- */
  const g = newLevel(P[1]);
  const [gt, gr, gb, gl] = box(g, .3, 0, 0, 10, 8);
  const v6 = wall(6, .15, 6, 5, .1), h5 = wall(.15, 5, 9.85, 5, .1), v4 = wall(4, 5, 4, 7.85, .1);
  g.walls.push(v6, h5, v4);
  op(g, gt, 3, 2.2); op(g, gt, 8, 1.2, 'window', 1.0, 1.1);
  op(g, gl, 2.5, 2.0, 'window', .1, 2.1); op(g, gr, 2.5, 1.4); op(g, gb, 2, 1.4); op(g, gb, 5.2, 1.0);
  op(g, gb, 7.5, 1.0, 'door', 0, 2.2);
  op(g, v6, 2.5, 1.6, 'opening', 0, 2.1);
  op(g, h5, 3, .9, 'door', 0, 2.05); op(g, h5, 8, .9, 'door', 0, 2.05); op(g, v4, 1.5, .9, 'door', 0, 2.05);
  // lights
  sym(g, 'light_ceiling', 3, 2.5, 0, { label: 'Living', circuit: '1' }); sym(g, 'light_ceiling', 8, 2.5, 0, { label: 'Keuken', circuit: '2' });
  sym(g, 'light_spot', 7, 1, 0, { circuit: '2' }); sym(g, 'light_spot', 9, 1, 0, { circuit: '2' }); sym(g, 'light_spot', 7, 4, 0, { circuit: '2' }); sym(g, 'light_spot', 9, 4, 0, { circuit: '2' });
  sym(g, 'light_ceiling', 2, 6.5, 0, { label: 'Bureau', circuit: '1' }); sym(g, 'light_ceiling', 7, 6.5, 0, { label: 'Hal', circuit: '1' });
  sym(g, 'light_wall', 1.0, .17, D, { z: 1.9, circuit: '1' }); sym(g, 'light_outdoor', 7.5, 7.83, -D, { z: 2.3, circuit: '3' });
  sym(g, 'light_emergency', 6.2, 7.0, 0, { z: 2.3 });
  // switches
  sym(g, 'sw_two_way', 6.9, 7.83, -D, { z: 1.05, label: 'Hal', circuit: '1' });
  sym(g, 'sw_double', 3.3, 4.94, -D, { circuit: '1' }); sym(g, 'sw_single', 7.4, 4.94, -D, { circuit: '2' });
  sym(g, 'sw_two_way', 4.06, 6.0, 0, { circuit: '1' }); sym(g, 'sw_dimmer', 5.94, 1.0, Math.PI, { circuit: '1' });
  sym(g, 'sw_motion', 7.0, 6.9, 0); sym(g, 'sw_shutter', 2.0, .17, D, { circuit: '1' });
  // sockets
  sym(g, 'sock_double', .17, 1.0, 0, { circuit: '4' }); sym(g, 'sock_double', 5.1, .17 + 0, D, { circuit: '4' }); sym(g, 'sock_single', 5.94, 3.2, Math.PI, { circuit: '4' });
  sym(g, 'sock_double', 3, 4.94, -D, { z: .3, circuit: '4' }); sym(g, 'sock_triple', .17, 3.9, 0, { circuit: '4' });
  sym(g, 'sock_worktop', 8.2, .17, D, { z: 1.1, circuit: '5' }); sym(g, 'sock_worktop', 9.4, .17, D, { z: 1.1, circuit: '5' });
  sym(g, 'sock_dedicated', 9.83, 1.5, Math.PI, { label: 'Koelkast', circuit: '6', z: .3 }); sym(g, 'sock_dedicated', 6.06, 1.0, 0, { label: 'Vaatwasser', circuit: '6', z: .3 });
  sym(g, 'sock_power', 9.83, 3.5, Math.PI, { label: 'Kookplaat', circuit: '9', z: .6 });
  sym(g, 'sock_single', .17, 6.5, 0, { circuit: '4' }); sym(g, 'sock_double', 2.5, 7.83, -D, { circuit: '4' });
  sym(g, 'sock_ip44', 9.83, 7.0, Math.PI, { label: 'Terras', circuit: '3' });
  // data / comm / safety
  sym(g, 'data_rj45', 2.5, 5.06, D, { z: .3 }); sym(g, 'data_tv', .17, 2.0, 0, { z: .3 }); sym(g, 'data_rj45', 3.94, 6.8, Math.PI, { z: 1.1, label: 'Bureau' });
  sym(g, 'comm_bellbtn', 8.2, 8.17, D, { z: 1.2 }); sym(g, 'comm_bell', 6.5, 6.2, 0); sym(g, 'comm_intercom', 6.8, 7.83, -D, { z: 1.5 });
  sym(g, 'comm_thermo', 5.94, 3.9, Math.PI, { z: 1.5 });
  sym(g, 'safe_smoke', 3, 3.5, 0); sym(g, 'safe_smoke', 7, 6.0, 0);
  sym(g, 'panel_board', 4.06, 7.3, 0, { label: 'Verdeelbord' });
  sym(g, 'panel_fan', 9, 4.4, 0, { circuit: '10' });
  /* ---------- first floor ---------- */
  const f = newLevel(P[2]);
  const [ft, fr, fb, fl] = box(f, .3, 0, 0, 10, 8);
  const fh = wall(.15, 4, 9.85, 4, .1), fv1 = wall(5, .15, 5, 4, .1), fv2 = wall(3.5, 4, 3.5, 7.85, .1), fv3 = wall(6.5, 4, 6.5, 7.85, .1);
  f.walls.push(fh, fv1, fv2, fv3);
  op(f, ft, 2.5, 1.6); op(f, ft, 7.5, 1.6); op(f, fb, 1.75, 1.4); op(f, fb, 5, 1.0, 'window', .9, 1.1); op(f, fb, 8.2, 1.4); op(f, fl, 2.0, 1.2); op(f, fr, 2.0, 1.2);
  op(f, fh, 2.5, .9, 'door', 0, 2.05); op(f, fh, 7.5, .9, 'door', 0, 2.05); op(f, fh, 5, .9, 'door', 0, 2.05);
  op(f, fv2, 1.5, .9, 'door', 0, 2.05); op(f, fv3, 1.5, .9, 'door', 0, 2.05);
  sym(f, 'light_ceiling', 2.5, 2, 0, { label: 'Slaapkamer 1', circuit: '11' }); sym(f, 'light_ceiling', 7.5, 2, 0, { label: 'Slaapkamer 2', circuit: '11' });
  sym(f, 'light_ceiling', 1.7, 6, 0, { label: 'Slaapkamer 3', circuit: '11' }); sym(f, 'light_spot', 5, 6, 0, { circuit: '12' }); sym(f, 'light_ceiling', 8.2, 6, 0, { label: 'Badkamer', circuit: '12' });
  sym(f, 'light_ceiling', 5.0, 2.2, 0, { circuit: '11', label: 'Overloop' }); sym(f, 'light_wall', 8.3, 7.83, -D, { z: 1.9, circuit: '12', label: 'Spiegel' });
  sym(f, 'sw_single', 1.0, 3.94, -D, { circuit: '11' }); sym(f, 'sw_single', 6.0, 3.94, -D, { circuit: '11' }); sym(f, 'sw_two_way', 4.3, 3.94, -D, { circuit: '11' }); sym(f, 'sw_two_way', 5.6, 4.06, D, { circuit: '11' });
  sym(f, 'sw_single', 3.56, 5.0, 0, { circuit: '11' }); sym(f, 'sw_single', 6.56, 5.0, 0, { circuit: '12' }); sym(f, 'sw_pull', 8.2, 6, 0, { circuit: '12' });
  sym(f, 'sock_double', .17, 1.0, 0, { circuit: '13' }); sym(f, 'sock_double', 5.06, 1.0, 0, { circuit: '13' }); sym(f, 'sock_double', 9.83, 3.0, Math.PI, { circuit: '14' });
  sym(f, 'sock_double', .17, 6.0, 0, { circuit: '13' }); sym(f, 'sock_single', 3.44, 6.0, Math.PI, { circuit: '13' }); sym(f, 'sock_ip44', 8.2, 7.83, -D, { circuit: '12', z: 1.2 });
  sym(f, 'sock_double', 6.56, 6.5, 0, { circuit: '14', z: .3 }); sym(f, 'data_rj45', .17, 2.0, 0, { z: .3 }); sym(f, 'data_rj45', 9.83, 1.0, Math.PI, { z: .3 });
  sym(f, 'safe_smoke', 5, 3, 0); sym(f, 'safe_smoke', 2.5, 3, 0); sym(f, 'safe_smoke', 7.5, 3, 0);
  p.levels.push(b, g, f);
  for (const l of p.levels) for (const s of l.symbols) if (s.z == null) delete s.z;
  return p;
}

/* ---------------- industrial demo: warehouse + production hall + office block ---------------- */
import { INDUSTRIAL_PRESETS as IP } from './model.js';
export function demoIndustrial() {
  const p = newProject('Demo industrial building');
  p.settings.type = 'industrial'; p.settings.roofType = 'gable'; p.settings.roofPitch = 7;
  const N = -D, S = D, Wd = Math.PI, E = 0;
  /* ----- ground floor: 48 x 30 m ----- */
  const g = newLevel(IP[1]);
  const [gt, gr, gb, gl] = box(g, .3, 0, 0, 48, 30);
  const fw = wall(34, .15, 34, 29.85, .3), ow = wall(.15, 18, 14, 18, .2), ov = wall(14, 18, 14, 29.85, .2), op1 = wall(7, 18.2, 7, 29.85, .1);
  ow.h = ov.h = op1.h = 3; g.walls.push(fw, ow, ov, op1);
  for (let x = 5; x <= 43; x += 7) op(g, gt, x, 3, 'window', 5.2, 1.4);
  for (const x of [17, 21, 25, 29]) op(g, gb, x, 2.5, 'dock', 1.2, 2.8);
  op(g, gb, 41, 4, 'sectional', 0, 4.2); op(g, gb, 3.5, 1.4, 'door', 0, 2.2); op(g, gb, 10.5, 2.4, 'window', .9, 1.6); op(g, gb, 3.5, 2.4, 'window', 4.2, 1.6); op(g, gb, 10.5, 2.4, 'window', 4.2, 1.6);
  op(g, gl, 22, 1.6, 'window', .9, 1.4); op(g, gl, 26, 1.6, 'window', .9, 1.4);
  op(g, gr, 15, 4.5, 'sectional', 0, 4.5); op(g, gr, 26, 1.0, 'door', 0, 2.2);
  op(g, fw, 12, 3.2, 'opening', 0, 4); op(g, fw, 22, 1.2, 'door', 0, 2.1);
  op(g, ow, 5.5, 1.0, 'door', 0, 2.1); op(g, ov, 7, 1.0, 'door', 0, 2.1); op(g, op1, 3, 1.0, 'door', 0, 2.1);
  for (const x of [20, 27]) for (const y of [6, 12, 24]) g.columns.push({ id: uid('c'), x, y, w: .5, d: .5 });
  for (const y of [8, 22]) g.columns.push({ id: uid('c'), x: 41, y, w: .6, d: .6, round: true });
  g.rooms.push({ id: uid('r'), text: 'Magazijn', x: 24, y: 9 }, { id: uid('r'), text: 'Productie', x: 41, y: 15 }, { id: uid('r'), text: 'Kantoren', x: 7, y: 24 }, { id: uid('r'), text: 'Laadperrons', x: 24, y: 27 });
  // electrical – lighting
  for (const x of [6, 13, 20, 27]) for (const y of [4, 10, 15]) sym(g, 'ind_highbay', x, y, 0, { circuit: 'L1' });
  for (const x of [20, 27, 31]) sym(g, 'ind_highbay', x, 24, 0, { circuit: 'L2' });
  for (const x of [38, 44]) for (const y of [5, 12, 19, 26]) sym(g, 'ind_highbay', x, y, 0, { circuit: 'L3' });
  for (const x of [24, 28]) sym(g, 'ind_dock_light', x, 29.85, -D, { z: 3.4, circuit: 'L2' });
  sym(g, 'light_ceiling', 3.5, 22, 0, { label: 'Kantoor 1' }); sym(g, 'light_ceiling', 10.5, 22, 0, { label: 'Kantoor 2' }); sym(g, 'light_ceiling', 10.5, 26.5, 0); sym(g, 'light_ceiling', 3.5, 27, 0);
  // power distribution
  sym(g, 'ind_main_board', 31.5, 28.8, -D, { label: 'TGBT', circuit: 'HS' }); sym(g, 'ind_trafo', 45.4, 28.4, Wd, { label: 'Trafo 630 kVA' }); sym(g, 'ind_ups', 33, 25.5, 0 + Math.PI, { label: 'UPS' });
  sym(g, 'ind_tray', 2, 8, 0, { z: 6.2, len: 31 }); sym(g, 'ind_tray', 36, 3, D, { z: 6.4, len: 24 });
  sym(g, 'ind_busbar', 35.5, 14, 0, { z: 6.5, len: 12 }); sym(g, 'ind_crane', 3, 3, 0, { z: 7, len: 28 });
  for (const y of [5, 10, 15, 22]) sym(g, 'ind_cee32', 33.85, y, Wd, { z: 1.2, circuit: 'K' + y });
  sym(g, 'ind_cee63', 34.15, 20, E, { z: 1.2, circuit: 'K63' }); for (const y of [4, 14, 22]) sym(g, 'ind_cee16', 47.85, y, Wd, { z: 1.1 });
  for (const y of [5, 9]) sym(g, 'ind_motor', 44, y, E, { label: 'Pomp ' + (y > 6 ? 2 : 1) });
  sym(g, 'ind_motor', 40, 24, E, { label: 'Compressor' });
  sym(g, 'ind_vfd', 47.85, 7, Wd, { z: 1.5 }); sym(g, 'ind_estop', 47.85, 11, Wd, { z: 1.3 }); sym(g, 'ind_estop', 34.15, 12, E, { z: 1.3 }); sym(g, 'ind_sub_board', 47.85, 18, Wd, { z: 1.4, label: 'OVB Productie' });
  sym(g, 'ind_ev_dc', 20, 33, -D, { label: 'Snellader' });
  sym(g, 'ind_generator', 46, 1.6, S, { label: 'Noodgenerator' });
  for (const x of [8, 12]) sym(g, 'sock_double', x, 18.2 + .1, S, { z: .3 }); sym(g, 'data_rj45', 2.2, 24, E, { z: .3 }); sym(g, 'sw_single', 5.3, 18.3, S, {});
  // fire & security
  for (const [x, y] of [[8, 6], [20, 18], [28, 6], [38, 15], [44, 24]]) sym(g, 'fire_sprinkler', x, y, 0, {});
  for (const [x, y] of [[10, 9], [24, 14], [41, 4], [24, 22]]) sym(g, 'fire_heat', x, y, 0);
  sym(g, 'fire_callpoint', 33.85, 22.9, Wd, { z: 1.4 }); sym(g, 'fire_callpoint', 14.15, 22, E, { z: 1.4 }); sym(g, 'fire_callpoint', 47.85, 25, Wd, { z: 1.4 });
  sym(g, 'fire_panel', 5.1, 18.3, S, { z: 1.5, label: 'Brandcentrale' }); sym(g, 'fire_horn', 33.85, 18, Wd, { z: 2.8 }); sym(g, 'fire_horn', 47.85, 14, Wd, { z: 2.8 });
  for (const [x, y, a] of [[.15, 14, E], [34.15, 6, E], [47.85, 20, Wd], [33.85, 8, Wd]]) sym(g, 'fire_extinguisher', x, y, a, {});
  sym(g, 'fire_hose', 20, 17.85 + 0, -D, {}); sym(g, 'fire_hose', 47.85, 22, Wd, {});
  for (const [x, y, a] of [[3.5, 29.85, -D], [47.85, 26, Wd], [34.15, 22, E]]) sym(g, 'fire_exit', x, y, a, { z: 2.6 });
  for (const [x, y, a] of [[-.15, -.15, -D], [48.15, 30.15, D], [48.15, -.15, -D], [-.15, 30.15, D]]) sym(g, 'sec_camera', x, y, a, { z: 4.5 });
  sym(g, 'sec_reader', 1.9, 29.85, -D, {});
  /* ----- mezzanine / offices over the office block ----- */
  const f = newLevel(IP[2], { elev: 3.3 });
  const [ft, fr, fb, fl] = box(f, .3, 0, 18, 14, 30);
  const fm = wall(7, 18.15, 7, 29.85, .1); f.walls.push(fm);
  op(f, fb, 3.5, 2.4, 'window', .9, 1.6); op(f, fb, 10.5, 2.4, 'window', .9, 1.6); op(f, fl, 24, 2.4, 'window', .9, 1.6); op(f, fm, 4, 1.0, 'door', 0, 2.1);
  f.rooms.push({ id: uid('r'), text: 'Directie', x: 3.5, y: 24 }, { id: uid('r'), text: 'Vergaderzaal', x: 10.5, y: 24 });
  for (const [x, y] of [[3.5, 24], [10.5, 24]]) sym(f, 'light_ceiling', x, y, 0, { circuit: 'K1' });
  for (const [x, y] of [[3.5, 21], [10.5, 21], [3.5, 27], [10.5, 27]]) sym(f, 'light_tl', x, y, 0);
  for (const y of [20, 27]) sym(f, 'sock_double', .15 + .15, y, E, { circuit: 'K2' });
  sym(f, 'data_rj45', 13.7, 24, Wd, { z: .3 }); sym(f, 'ind_sub_board', 7.1, 19.5, E, { label: 'OVB Kantoren' }); sym(f, 'fire_exit', 6.9, 22, Wd, { z: 2.4 }); sym(f, 'fire_panel', 7.1, 28.5, E, {});
  sym(f, 'safe_smoke', 3.5, 27, 0); sym(f, 'safe_smoke', 10.5, 27, 0);
  p.levels.push(g, f);
  for (const l of p.levels) for (const s of l.symbols) if (s.z == null) delete s.z;
  return p;
}
