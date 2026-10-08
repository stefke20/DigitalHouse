export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
export function toast(msg, type = '') {
  const t = h('div', { class: 'toast ' + type }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 4200);
}
export function modal(content, { onClose } = {}) {
  const back = h('div', { class: 'modal-back' });
  const m = h('div', { class: 'modal' }, content);
  back.append(m);
  const close = () => { back.remove(); onClose && onClose(); };
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.body.append(back);
  return { close, el: m };
}
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export function fmtBytes(n) { return n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' kB'; }
export function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
