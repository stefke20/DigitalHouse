// Inventory of electrical installation symbols as used on Belgian "situatieschema's"
// (AREI / RGIE conventions). Pictograms are simplified redraws on a 24x24 grid so that each
// device type stays visually distinct. Always compare with the legend on your own drawing.
import * as db from './db.js';

const C = (cx, cy, r, x = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${x}/>`;
const P = (d, x = '') => `<path d="${d}" ${x}/>`;
const T = (t, x, y, s = 8) => `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="700">${t}</text>`;
const cross = (cx, cy, r) => P(`M${cx - r * .7} ${cy - r * .7}l${r * 1.4} ${r * 1.4}M${cx + r * .7} ${cy - r * .7}l${-r * 1.4} ${r * 1.4}`);
const swBase = C(7, 17, 3.2) + P('M9.3 14.7L17 7');
const dome = (cx, cy, r = 6) => P(`M${cx - r} ${cy}a${r} ${r} 0 0 1 ${2 * r} 0z`);

export const CATEGORIES = {
  light: { nl: 'Verlichting', en: 'Lighting', color: '#fbbf24' },
  switch: { nl: 'Schakelaars', en: 'Switches', color: '#60a5fa' },
  socket: { nl: 'Stopcontacten', en: 'Sockets', color: '#34d399' },
  comm: { nl: 'Communicatie', en: 'Communication', color: '#a78bfa' },
  safety: { nl: 'Veiligheid & sturing', en: 'Safety & control', color: '#f87171' },
  panel: { nl: 'Bord & toestellen', en: 'Panels & appliances', color: '#94a3b8' },
  custom: { nl: 'Eigen symbolen', en: 'Custom', color: '#f472b6' },
};

// model = how the 3D viewer draws it. mount = where it sits. h = default height above floor (m)
export const SYMBOLS = [
  // ---- lighting
  { id: 'light_ceiling', cat: 'light', nl: 'Lichtpunt (plafond)', fr: 'Point lumineux (plafond)', en: 'Ceiling light point', mount: 'ceiling', h: 2.5, model: 'lamp', svg: C(12, 12, 7.5) + cross(12, 12, 7.5) },
  { id: 'light_wall', cat: 'light', nl: 'Wandlichtpunt', fr: 'Applique murale', en: 'Wall light point', mount: 'wall', h: 2.0, model: 'wlamp', svg: C(12, 10, 6.5) + cross(12, 10, 6.5) + P('M4 20.5h16', 'stroke-width="2.6"') },
  { id: 'light_tl', cat: 'light', nl: 'TL-armatuur', fr: 'Tube fluorescent / réglette', en: 'Fluorescent / LED batten', mount: 'ceiling', h: 2.5, model: 'tube', svg: `<rect x="2" y="8" width="20" height="8"/>` + P('M2 12h20') },
  { id: 'light_spot', cat: 'light', nl: 'Inbouwspot', fr: 'Spot encastré', en: 'Recessed spot', mount: 'ceiling', h: 2.5, model: 'spot', svg: C(12, 12, 6, 'stroke-dasharray="2.4 1.6"') + cross(12, 12, 4.5) },
  { id: 'light_emergency', cat: 'light', nl: 'Noodverlichting', fr: 'Éclairage de secours', en: 'Emergency light', mount: 'wall', h: 2.3, model: 'wlamp', svg: C(12, 12, 7.5) + cross(12, 12, 7.5) + P('M12 4.5a7.5 7.5 0 0 1 0 15z', 'fill="currentColor"') },
  { id: 'light_outdoor', cat: 'light', nl: 'Buitenlamp', fr: 'Éclairage extérieur', en: 'Outdoor light', mount: 'wall', h: 2.3, model: 'wlamp', svg: C(11, 10, 6) + cross(11, 10, 6) + P('M3 20h16M20 6l2-2M21 11h2M20 16l2 2') },
  // ---- switches
  { id: 'sw_single', cat: 'switch', nl: 'Enkelpolige schakelaar', fr: 'Interrupteur simple allumage', en: 'Single-pole switch', mount: 'wall', h: 1.05, model: 'switch', rockers: 1, svg: swBase + P('M15 5l4 4') },
  { id: 'sw_double', cat: 'switch', nl: 'Dubbele schakelaar (2 lichtpunten)', fr: 'Interrupteur double allumage', en: 'Double switch (2 circuits)', mount: 'wall', h: 1.05, model: 'switch', rockers: 2, svg: swBase + P('M13 5.2l4 4M16 3l4 4') },
  { id: 'sw_dp', cat: 'switch', nl: 'Dubbelpolige schakelaar', fr: 'Interrupteur bipolaire', en: 'Double-pole switch', mount: 'wall', h: 1.05, model: 'switch', rockers: 1, svg: C(6, 17, 3) + P('M8.2 14.8L16 7M10.4 18.4L18.4 10.4M15 5l4 4') },
  { id: 'sw_two_way', cat: 'switch', nl: 'Wisselschakelaar', fr: 'Va-et-vient', en: 'Two-way switch', mount: 'wall', h: 1.05, model: 'switch', rockers: 1, svg: swBase + P('M15 5l4 4M13.5 12.5l4 4') },
  { id: 'sw_cross', cat: 'switch', nl: 'Kruisschakelaar', fr: 'Permutateur', en: 'Intermediate (cross) switch', mount: 'wall', h: 1.05, model: 'switch', rockers: 1, svg: swBase + P('M15 5l4 4M19 5l-4 4M13.5 12.5l4 4') },
  { id: 'sw_push', cat: 'switch', nl: 'Drukknop', fr: 'Bouton-poussoir', en: 'Push button', mount: 'wall', h: 1.05, model: 'button', svg: C(12, 12, 7.5) + C(12, 12, 3, 'fill="currentColor"') },
  { id: 'sw_push_ind', cat: 'switch', nl: 'Drukknop met controlelamp', fr: 'Bouton-poussoir lumineux', en: 'Illuminated push button', mount: 'wall', h: 1.05, model: 'button', svg: C(12, 12, 7.5) + C(12, 12, 3, 'fill="currentColor"') + P('M12 2v3M12 19v3M2 12h3M19 12h3') },
  { id: 'sw_dimmer', cat: 'switch', nl: 'Dimmer', fr: 'Variateur', en: 'Dimmer', mount: 'wall', h: 1.05, model: 'dimmer', svg: swBase + P('M15 5l4 4') + P('M13 21l8-4v4z', 'fill="currentColor"') },
  { id: 'sw_timer', cat: 'switch', nl: 'Tijdschakelaar / trappenhuisautomaat', fr: 'Minuterie', en: 'Timer switch', mount: 'wall', h: 1.05, model: 'button', svg: C(12, 12, 8) + P('M12 7v5l3.5 2') },
  { id: 'sw_pull', cat: 'switch', nl: 'Trekschakelaar', fr: 'Interrupteur à tirette', en: 'Pull-cord switch', mount: 'ceiling', h: 2.4, model: 'pull', svg: swBase + P('M15 5l4 4') + P('M17.5 9v10') + C(17.5, 20.5, 1.5) },
  { id: 'sw_shutter', cat: 'switch', nl: 'Rolluikschakelaar', fr: 'Interrupteur volet roulant', en: 'Shutter switch', mount: 'wall', h: 1.05, model: 'switch', rockers: 2, svg: `<rect x="4" y="3" width="16" height="18" rx="2"/>` + P('M12 6l-3.5 4h7zM12 18l-3.5-4h7z') },
  { id: 'sw_motion', cat: 'switch', nl: 'Bewegingsmelder', fr: 'Détecteur de mouvement', en: 'Motion sensor', mount: 'ceiling', h: 2.5, model: 'detector', svg: C(12, 16, 3.5) + P('M5 11a10 10 0 0 1 14 0M8 8.2a6 6 0 0 1 8 0') },
  // ---- sockets (Belgian standard is the earthed 2P+E socket, type E with fixed earth pin)
  { id: 'sock_single', cat: 'socket', nl: 'Stopcontact 2P+A', fr: 'Prise 2P+T', en: 'Socket outlet (earthed)', mount: 'wall', h: 0.3, model: 'socket', gangs: 1, svg: dome(12, 17, 7) + P('M12 17V5M9.5 5h5') },
  { id: 'sock_double', cat: 'socket', nl: 'Dubbel stopcontact', fr: 'Prise double', en: 'Double socket', mount: 'wall', h: 0.3, model: 'socket', gangs: 2, svg: dome(7, 17, 5) + dome(17, 17, 5) + P('M7 17V6M17 17V6M5 6h4M15 6h4') },
  { id: 'sock_triple', cat: 'socket', nl: 'Drievoudig stopcontact', fr: 'Prise triple', en: 'Triple socket', mount: 'wall', h: 0.3, model: 'socket', gangs: 3, svg: dome(5, 17, 3.6) + dome(12, 17, 3.6) + dome(19, 17, 3.6) + P('M5 17V8M12 17V8M19 17V8') },
  { id: 'sock_worktop', cat: 'socket', nl: 'Stopcontact werkblad', fr: 'Prise plan de travail', en: 'Worktop socket', mount: 'wall', h: 1.1, model: 'socket', gangs: 2, svg: dome(12, 17, 7) + P('M12 17V5M9.5 5h5') + P('M2 21h20', 'stroke-width="2.4"') },
  { id: 'sock_ip44', cat: 'socket', nl: 'Waterdicht stopcontact (IP44)', fr: 'Prise étanche (IP44)', en: 'Waterproof socket (IP44)', mount: 'wall', h: 0.3, model: 'socket', gangs: 1, tint: '#9ca3af', svg: dome(12, 17, 7) + P('M12 17V5M9.5 5h5') + P('M3.5 19a9.5 9.5 0 0 1 17 0', 'stroke-dasharray="2 1.5"') },
  { id: 'sock_dedicated', cat: 'socket', nl: 'Stopcontact eigen kring (toestel)', fr: 'Prise circuit spécialisé', en: 'Dedicated-circuit socket', mount: 'wall', h: 0.3, model: 'socket', gangs: 1, tint: '#fde68a', svg: dome(12, 17, 7) + P('M12 17V5M9.5 5h5') + C(12, 12.5, 1.5, 'fill="currentColor"') },
  { id: 'sock_power', cat: 'socket', nl: 'Krachtstopcontact 3P+N+A', fr: 'Prise de force 3P+N+T', en: 'Three-phase power socket', mount: 'wall', h: 1.1, model: 'power', svg: C(12, 12, 8) + P('M12 4v5M6 9l4 2M18 9l-4 2M8 18l3-4M16 18l-3-4') },
  { id: 'sock_floor', cat: 'socket', nl: 'Vloerstopcontact', fr: 'Prise de sol', en: 'Floor socket', mount: 'floor', h: 0.01, model: 'floorbox', svg: `<rect x="3" y="3" width="18" height="18"/>` + dome(12, 16, 5) + P('M12 16V8') },
  { id: 'sock_ev', cat: 'socket', nl: 'Laadpunt elektrische wagen', fr: 'Borne de recharge VE', en: 'EV charging point', mount: 'wall', h: 1.2, model: 'ev', svg: `<rect x="5" y="3" width="14" height="18" rx="2"/>` + P('M13 6l-3 6h4l-3 6') },
  // ---- communication
  { id: 'data_rj45', cat: 'comm', nl: 'Datacontact (RJ45)', fr: 'Prise RJ45', en: 'Data outlet (RJ45)', mount: 'wall', h: 0.3, model: 'data', tint: '#38bdf8', svg: P('M3 4h18L12 20z') + T('D', 12, 12.5, 7) },
  { id: 'data_tel', cat: 'comm', nl: 'Telefoonaansluiting', fr: 'Prise téléphone', en: 'Telephone outlet', mount: 'wall', h: 0.3, model: 'data', tint: '#e5e7eb', svg: P('M3 4h18L12 20z') + T('T', 12, 12.5, 7) },
  { id: 'data_tv', cat: 'comm', nl: 'TV / coax-aansluiting', fr: 'Prise TV / coax', en: 'TV / coax outlet', mount: 'wall', h: 0.3, model: 'data', tint: '#a3a3a3', svg: `<rect x="3" y="5" width="18" height="12" rx="1.5"/>` + P('M8 21h8M12 17v4') },
  { id: 'comm_intercom', cat: 'comm', nl: 'Parlofoon / videofoon', fr: 'Interphone', en: 'Intercom', mount: 'wall', h: 1.5, model: 'panelbox', svg: `<rect x="5" y="3" width="14" height="18" rx="2"/>` + C(12, 10, 3) + P('M9 17h6') },
  { id: 'comm_bellbtn', cat: 'comm', nl: 'Beldrukknop', fr: 'Bouton de sonnette', en: 'Doorbell push', mount: 'wall', h: 1.2, model: 'button', svg: C(12, 12, 8) + P('M8.5 16.5h7l-1-1.5v-3a2.5 2.5 0 0 0-5 0v3z') },
  { id: 'comm_bell', cat: 'comm', nl: 'Deurbel / zoemer', fr: 'Sonnerie', en: 'Bell / buzzer', mount: 'ceiling', h: 2.2, model: 'bell', svg: P('M6 18h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v5.5z') + P('M10.5 20.5h3') },
  { id: 'comm_thermo', cat: 'comm', nl: 'Thermostaat', fr: 'Thermostat', en: 'Thermostat', mount: 'wall', h: 1.5, model: 'button', svg: C(12, 12, 8) + T('T', 12, 15.3, 10) },
  // ---- safety & control
  { id: 'safe_smoke', cat: 'safety', nl: 'Rookmelder', fr: 'Détecteur de fumée', en: 'Smoke detector', mount: 'ceiling', h: 2.5, model: 'detector', tint: '#fff', svg: C(12, 12, 8) + C(12, 12, 3, 'fill="currentColor"') + P('M6 6l2 2M18 6l-2 2') },
  { id: 'safe_co', cat: 'safety', nl: 'CO-melder', fr: 'Détecteur de CO', en: 'CO detector', mount: 'wall', h: 1.8, model: 'detector', tint: '#fff', svg: C(12, 12, 8) + T('CO', 12, 14.8, 7.5) },
  { id: 'safe_earth', cat: 'safety', nl: 'Aardingsklem / potentiaalvereffening', fr: 'Borne de terre', en: 'Earthing terminal', mount: 'wall', h: 0.3, model: 'box', svg: P('M12 3v9M5 12h14M7.5 16h9M10 20h4') },
  // ---- panels & appliances
  { id: 'panel_board', cat: 'panel', nl: 'Verdeelbord', fr: 'Tableau de répartition', en: 'Distribution board', mount: 'wall', h: 1.2, model: 'board', svg: `<rect x="3" y="3" width="18" height="18"/>` + P('M3 9h18M7 9v12M12 9v12M17 9v12') },
  { id: 'panel_meter', cat: 'panel', nl: 'Elektriciteitsmeter', fr: 'Compteur électrique', en: 'Electricity meter', mount: 'wall', h: 1.5, model: 'board', svg: `<rect x="3" y="6" width="18" height="12"/>` + T('kWh', 12, 14.5, 6.5) },
  { id: 'panel_junction', cat: 'panel', nl: 'Aftakdoos', fr: 'Boîte de dérivation', en: 'Junction box', mount: 'ceiling', h: 2.3, model: 'box', svg: `<rect x="6" y="6" width="12" height="12"/>` + cross(12, 12, 5.5) },
  { id: 'panel_trafo', cat: 'panel', nl: 'Transformator', fr: 'Transformateur', en: 'Transformer', mount: 'wall', h: 1.8, model: 'box', svg: C(9, 12, 5.5) + C(15, 12, 5.5) },
  { id: 'panel_fan', cat: 'panel', nl: 'Ventilator / mechanische ventilatie', fr: 'Ventilateur / VMC', en: 'Extractor fan / ventilation', mount: 'ceiling', h: 2.5, model: 'fan', svg: C(12, 12, 8) + P('M12 12c0-4 1-6 4-6M12 12c3 3 3 5 0 8M12 12c-4 0-6-2-6-5') },
  { id: 'panel_motor', cat: 'panel', nl: 'Motor (poort, rolluik)', fr: 'Moteur', en: 'Motor (gate, shutter)', mount: 'wall', h: 2.2, model: 'box', svg: C(12, 12, 8) + T('M', 12, 15.5, 10) },
  { id: 'panel_boiler', cat: 'panel', nl: 'Boiler / warmwatertoestel', fr: 'Chauffe-eau', en: 'Water heater', mount: 'wall', h: 1.6, model: 'cyl', svg: `<rect x="6" y="2.5" width="12" height="19" rx="3"/>` + T('B', 12, 15, 9) },
  { id: 'panel_inverter', cat: 'panel', nl: 'Omvormer (zonnepanelen)', fr: 'Onduleur (photovoltaïque)', en: 'Solar inverter', mount: 'wall', h: 1.4, model: 'board', svg: `<rect x="3" y="4" width="18" height="16"/>` + P('M3 20L21 4M6 9q2-3 4 0t4 0M12 16h7') },
];

let custom = [];
export const allSymbols = () => SYMBOLS.concat(custom);
export const getSymbol = id => allSymbols().find(s => s.id === id);
export async function loadCustomSymbols() {
  const rows = await db.getAll('symbols');
  custom = rows.map(r => ({ ...r, cat: 'custom', model: r.model || 'box', imgUrl: URL.createObjectURL(r.blob) }));
  imgCache.clear();
  return custom;
}
export async function saveCustomSymbol(s) { await db.put('symbols', s); await loadCustomSymbols(); }
export async function removeCustomSymbol(id) { await db.del('symbols', id); await loadCustomSymbols(); }

export function svgMarkup(sym, size = 24, color = 'currentColor') {
  if (sym.imgUrl) return `<img src="${sym.imgUrl}" width="${size}" height="${size}" style="object-fit:contain">`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${sym.svg}</svg>`;
}

// cached bitmaps for canvas drawing (editor) and textures (3D)
const imgCache = new Map();
export function symbolImage(sym, color = '#ffffff') {
  const key = sym.id + color;
  if (imgCache.has(key)) return imgCache.get(key);
  const img = new Image();
  img.src = sym.imgUrl || ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup(sym, 96, color)));
  imgCache.set(key, img);
  return img;
}
