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
