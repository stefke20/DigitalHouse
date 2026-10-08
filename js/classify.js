// Guess what an uploaded file is from its name (and, for PDFs, the text layer): floor plan of which level,
// situatieschema, eendraadschema, facade drawing (which side), site plan, or some other document.
// Dutch / French / English / German keywords.
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-.]+/g, ' ');

const LEVELS = [
  ['basement', /kelder|\bcave\b|sous ?sol|basement|souterrain|ondergrond|untergeschoss|\bkg\b|niveau ?-1|\b-1\b|\bmin ?1\b/],
  ['attic', /zolder|grenier|attic|vliering|dakverdieping|dachgeschoss|derde verdieping|3e verdieping|\b3de\b|etage 3|\+3\b/],
  ['second', /tweede|2e verdieping|\b2de\b|\b2e\b|second|deuxieme|etage 2|verdieping 2|\+2\b|obergeschoss 2|\b2 ?og\b/],
  ['first', /eerste|1e verdieping|\b1ste\b|\b1e\b|first|premier etage|1er etage|etage 1|verdieping 1|\+1\b|bovenverdieping|verdieping|obergeschoss|\b1 ?og\b|\betage\b/],
  ['ground', /gelijkvloers|begane grond|grondverdieping|grondplan|rez ?de ?chaussee|\brdc\b|ground|parterre|erdgeschoss|\beg\b|niveau ?0|\b0\b|plattegrond begane/],
];
const SIDES = [
  ['front', /voorgevel|voorzijde|facade avant|front|vorderansicht|straatzijde|straatgevel/],
  ['back', /achtergevel|achterzijde|facade arriere|back|rear|rueckansicht|tuingevel/],
  ['left', /linker|links|gauche|left|linke ansicht|zijgevel links/],
  ['right', /rechter|rechts|droite|right|rechte ansicht|zijgevel rechts/],
];

export function levelOf(s) { for (const [k, re] of LEVELS) if (re.test(s)) return k; return null; }
export function sideOf(s) { for (const [k, re] of SIDES) if (re.test(s)) return k; return null; }

/** @returns {{type:'plan'|'elec'|'single'|'facade'|'site'|'keuring'|'epc'|'other', level:string|null, side:string|null, sure:boolean}} */
export function classify(fileName, text = '') {
  const n = norm(fileName.replace(/\.[a-z0-9]+$/i, '')), t = norm(text).slice(0, 3000);
  const tests = [
    ['single', /eendraad|unifilaire|single ?line|one ?line|verdeelbordschema|schema unifilaire/],
    ['facade', /gevel|facade|elevation|aanzicht|fassade|ansicht|vue de/],
    ['site', /inplanting|situatieplan|plan de situation|implantation|kadaster|perceel|terrein|tuinplan|tuinaanleg|site ?plan|omgevings|lot ?plan|lageplan/],
    ['elec', /situatieschema|elektr|electr|stopcontact|verlichting|installatieplan|lichtpunt|lichtplan|schema de situation|implantation electr|belichting|plan electrique|elektro/],
    ['epc', /\bepc\b|energieprestatie|\bpeb\b|energy cert/],
    ['keuring', /keuring|controleverslag|inspection|verslag|certificat|rgie|arei|conformiteit|rapport/],
    ['other', /factuur|offerte|garantie|verzekering|akte|vergunning|lastenboek|handleiding|invoice|manual|contract|bestek|polis|plan de securite|brandweer|attest/],
    ['plan', /grondplan|plattegrond|\bplan\b|verdieping|gelijkvloers|kelder|zolder|etage|floor ?plan|basement|ground|attic|rez ?de|erdgeschoss|grundriss/],
  ];
  let type = null, sure = true;
  for (const [k, re] of tests) if (re.test(n)) { type = k; break; }
  if (!type) { for (const [k, re] of tests) if (re.test(t)) { type = k; break; } sure = !!type; }
  if (!type) type = 'plan';
  // a plan page whose own text is about electricity is probably the situatieschema
  if (type === 'plan' && /situatieschema|stopcontact|lichtpunt|schakelaar/.test(t)) type = 'elec';
  const level = levelOf(n) || (type === 'plan' || type === 'elec' ? levelOf(t.slice(0, 600)) : null);
  const side = type === 'facade' ? (sideOf(n) || sideOf(t.slice(0, 600))) : null;
  return { type, level, side, sure };
}
