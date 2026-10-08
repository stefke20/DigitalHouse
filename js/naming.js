// Human names for devices: "Bathroom ceiling light 1", "Garage socket 2" …
import { roomGrid, roomAt, sortedLevels } from './model.js';
import { getSymbol } from './symbols.js';

const SHORT = {
  light_ceiling: 'ceiling light', light_wall: 'wall light', light_tl: 'fluorescent light', light_spot: 'spot', light_emergency: 'emergency light', light_outdoor: 'outdoor light',
  sw_single: 'switch', sw_double: 'double switch', sw_dp: 'double-pole switch', sw_two_way: 'two-way switch', sw_cross: 'cross switch', sw_push: 'push button', sw_push_ind: 'push button', sw_dimmer: 'dimmer', sw_timer: 'timer switch', sw_pull: 'pull cord', sw_shutter: 'shutter switch', sw_motion: 'motion sensor',
  sock_single: 'socket', sock_double: 'double socket', sock_triple: 'triple socket', sock_worktop: 'worktop socket', sock_ip44: 'outdoor socket', sock_dedicated: 'appliance socket', sock_power: 'power socket', sock_floor: 'floor socket', sock_ev: 'EV charger',
  data_rj45: 'network outlet', data_tel: 'phone outlet', data_tv: 'TV outlet', comm_intercom: 'intercom', comm_bellbtn: 'doorbell button', comm_bell: 'bell', comm_thermo: 'thermostat',
  safe_smoke: 'smoke detector', safe_co: 'CO detector', safe_earth: 'earthing terminal', panel_board: 'distribution board', panel_meter: 'meter', panel_junction: 'junction box', panel_trafo: 'transformer', panel_fan: 'fan', panel_motor: 'motor', panel_boiler: 'water heater', panel_inverter: 'solar inverter',
  ind_highbay: 'high-bay light', ind_tray: 'cable tray', ind_busbar: 'busbar', ind_main_board: 'main switchboard', ind_sub_board: 'sub-board', ind_cee16: 'CEE socket 16 A', ind_cee32: 'CEE socket 32 A', ind_cee63: 'CEE socket 63 A', ind_motor: 'motor', ind_vfd: 'frequency drive', ind_estop: 'emergency stop', ind_trafo: 'transformer cabin', ind_generator: 'generator', ind_ups: 'UPS', ind_crane: 'crane feed', ind_ev_dc: 'fast charger', ind_dock_light: 'dock light',
  fire_callpoint: 'call point', fire_heat: 'heat detector', fire_panel: 'fire panel', fire_horn: 'alarm horn', fire_sprinkler: 'sprinkler', fire_extinguisher: 'fire extinguisher', fire_hose: 'hose reel', fire_exit: 'exit sign', sec_camera: 'camera', sec_reader: 'badge reader',
};
export const shortName = def => SHORT[def.id] || (def.en || def.nl || 'device').toLowerCase();

/** typical power of a lamp in watts (LED era) – used for the "lighting load" figures */
const WATT = { light_ceiling: 9, light_wall: 7, light_tl: 18, light_spot: 5, light_emergency: 3, light_outdoor: 12, ind_highbay: 150, ind_dock_light: 60 };
export const wattOf = def => (def && WATT[def.id]) || 0;

export function roomNameFor(level, grid, s, def) {
  if (!grid) return level.name;
  const wall = def && def.mount === 'wall', a = s.angle || 0;
  const id = roomAt(grid, wall ? s.x + Math.cos(a) * .4 : s.x, wall ? s.y + Math.sin(a) * .4 : s.y);
  if (!id) return level.name + ' outside';
  const near = level.rooms.filter(r => roomAt(grid, r.x, r.y) === id).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)); // open-plan: nearest label wins
  return near.length ? near[0].text : `Room ${id}`;
}

/** give unnamed devices a name "<room> <type> <n>"; force = rename everything */
export function autoName(project, { force = false, level = null } = {}) {
  let n = 0;
  for (const lv of sortedLevels(project)) {
    if (level && lv.id !== level) continue;
    const g = roomGrid(lv), count = new Map();
    for (const s of lv.symbols) {
      const d = getSymbol(s.type); if (!d) continue;
      const room = roomNameFor(lv, g, s, d), key = room + '|' + shortName(d), k = (count.get(key) || 0) + 1; count.set(key, k);
      if (!force && s.label) continue;
      s.label = `${room} ${shortName(d)} ${k}`; n++;
    }
  }
  return n;
}
export const displayName = (s, def) => s.label || (def ? def.nl : s.type);
