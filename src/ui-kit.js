import { h } from './util.js';

const P = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICON = {
  undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: P('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  text: P('<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>'),
  image: P('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
  sparkle: P('<path d="M12 3c.6 4.6 1.9 6.4 6 7-4.1.6-5.4 2.4-6 7-.6-4.6-1.9-6.4-6-7 4.1-.6 5.4-2.4 6-7Z"/>'),
  users: P('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.6c2.6.1 4.3 1.7 5 4.4"/>'),
  download: P('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
  folder: P('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>'),
  save: P('<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="5"/>'),
  file: P('<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>'),
  grid: P('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
  guides: P('<path d="M12 3v18" stroke-dasharray="3 3"/><rect x="3" y="5" width="18" height="14" rx="1"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  lock: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock: P('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
  minus: P('<path d="M5 12h14"/>'),
  up: P('<path d="m6 15 6-6 6 6"/>'),
  down: P('<path d="m6 9 6 6 6-6"/>'),
  left: P('<path d="m15 6-6 6 6 6"/>'),
  right: P('<path d="m9 6 6 6-6 6"/>'),
  copy: P('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  trash: P('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'),
  fit: P('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  move: P('<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  front: P('<rect x="8" y="8" width="12" height="12" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M16 8V4H4v12h4"/>'),
  back: P('<rect x="4" y="4" width="12" height="12" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M8 16v4h12V8h-4"/>'),
  alignL: P('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  alignC: P('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  alignR: P('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  alignJ: P('<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>'),
  vTop: P('<path d="M4 4h16"/><path d="M8 8h8M10 12h4"/>'),
  vMid: P('<path d="M4 12h16" stroke-dasharray="2 2"/><path d="M8 8h8M8 16h8"/>'),
  vBot: P('<path d="M4 20h16"/><path d="M8 16h8M10 12h4"/>'),
  print: P('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7Z"/>'),
  book: P('<path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6Z"/><path d="M12 6v14.5"/>'),
};

export function icon(name) {
  const s = h('span', { class: 'ico', html: ICON[name] || '' });
  return s;
}

export function btn(label, { icon: ic, onClick, cls = '', title, disabled } = {}) {
  const b = h('button', { class: 'btn ' + cls, title: title || (ic && !label ? '' : null), onClick, disabled });
  if (title) b.title = title;
  if (ic) b.append(icon(ic));
  if (label) b.append(h('span', {}, label));
  return b;
}

let toastBox;
export function toast(msg, kind = 'info', ms = 4200) {
  if (!toastBox) { toastBox = h('div', { class: 'toasts' }); document.body.append(toastBox); }
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
}

export function modal(title, body, actions = [], { wide = false, onClose } = {}) {
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  const foot = h('div', { class: 'modal-foot' });
  for (const a of actions) {
    foot.append(btn(a.label, { cls: a.primary ? 'primary' : a.danger ? 'danger' : '', icon: a.icon, onClick: () => a.onClick?.(close) }));
  }
  const box = h('div', { class: 'modal' + (wide ? ' wide' : '') },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'x', onClick: close, title: 'Fechar' }, '×')),
    h('div', { class: 'modal-body' }, body),
    actions.length ? foot : null,
  );
  back.append(box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  return { close, box, foot };
}

export function confirmBox(title, text, okLabel = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    modal(title, h('p', {}, text), [
      { label: 'Cancelar', onClick: (c) => { done = true; resolve(false); c(); } },
      { label: okLabel, primary: !danger, danger, onClick: (c) => { done = true; resolve(true); c(); } },
    ], { onClose: () => { if (!done) resolve(false); } });
  });
}
