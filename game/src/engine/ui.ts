// Tiny DOM toolkit for HUDs, menus and dialogs layered over the game canvas.
import { audio } from './audio';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & {
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  onClick?: (e: MouseEvent) => void;
};

/** Hyperscript: h('div', {class:'x', onClick}, 'text', child) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k.startsWith('on') && typeof v === 'function') {
        const ev = k.slice(2).toLowerCase();
        el.addEventListener(ev, v as EventListener);
      } else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export interface ButtonOpts {
  cls?: string;
  title?: string;
  disabled?: boolean;
  sound?: boolean;
}

export function button(label: Child | Child[], onClick: () => void, opts: ButtonOpts = {}): HTMLButtonElement {
  const b = h('button', { class: 'btn ' + (opts.cls ?? ''), title: opts.title, 'aria-label': opts.title }, ...(Array.isArray(label) ? label : [label]));
  if (opts.disabled) b.disabled = true;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.unlock();
    if (opts.sound !== false) audio.sfx('click');
    onClick();
  });
  return b;
}

class UI {
  root!: HTMLElement;
  private layers: HTMLElement[] = [];
  private toastBox!: HTMLElement;

  init(root: HTMLElement) {
    this.root = root;
    this.toastBox = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(this.toastBox);
  }

  /** Create a layer (full-screen, pointer-transparent container). Removed by clearLayers(). */
  layer(cls = ''): HTMLElement {
    const l = h('div', { class: 'layer ' + cls });
    this.root.append(l);
    this.layers.push(l);
    return l;
  }
  removeLayer(l: HTMLElement) {
    l.remove();
    this.layers = this.layers.filter((x) => x !== l);
  }
  clearLayers() {
    for (const l of this.layers) l.remove();
    this.layers = [];
  }

  toast(msg: string, opts: { icon?: string; kind?: 'info' | 'good' | 'bad' | 'gold'; ms?: number } = {}) {
    const t = h('div', { class: 'toast ' + (opts.kind ?? 'info') }, opts.icon ? h('span', { class: 'toast-icon' }, opts.icon) : null, h('span', null, msg));
    this.toastBox.append(t);
    while (this.toastBox.children.length > 4) this.toastBox.firstElementChild?.remove();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 400);
    }, opts.ms ?? 2600);
  }

  /** Modal dialog. Resolves with the id of the button pressed (or 'dismiss'). */
  modal(o: {
    title?: string;
    body?: Child | Child[];
    buttons?: { id: string; label: string; primary?: boolean; danger?: boolean }[];
    dismissable?: boolean;
    cls?: string;
  }): Promise<string> {
    return new Promise((resolve) => {
      const close = (id: string) => {
        wrap.classList.remove('in');
        setTimeout(() => wrap.remove(), 220);
        resolve(id);
      };
      const btns = (o.buttons ?? [{ id: 'ok', label: 'OK', primary: true }]).map((b) =>
        button(b.label, () => close(b.id), { cls: b.primary ? 'primary' : b.danger ? 'danger' : '' }),
      );
      const card = h('div', { class: 'modal ' + (o.cls ?? ''), role: 'dialog', 'aria-modal': 'true' },
        o.title ? h('h2', null, o.title) : null,
        h('div', { class: 'modal-body' }, ...(Array.isArray(o.body) ? o.body : [o.body])),
        h('div', { class: 'modal-buttons' }, ...btns),
      );
      const wrap = h('div', { class: 'modal-wrap' }, card);
      if (o.dismissable) wrap.addEventListener('click', (e) => { if (e.target === wrap) close('dismiss'); });
      document.body.append(wrap);
      requestAnimationFrame(() => wrap.classList.add('in'));
    });
  }

  async confirm(title: string, text: string, yes = 'Yes', no = 'Cancel'): Promise<boolean> {
    const r = await this.modal({ title, body: h('p', null, text), buttons: [{ id: 'no', label: no }, { id: 'yes', label: yes, primary: true }] });
    return r === 'yes';
  }
}

export const ui = new UI();

/** A labelled progress bar component. */
export function progressBar(cls = ''): { el: HTMLElement; set: (v: number, label?: string) => void; marks: (fracs: number[]) => void } {
  const fill = h('div', { class: 'bar-fill' });
  const text = h('div', { class: 'bar-text' });
  const marksEl = h('div', { class: 'bar-marks' });
  const el = h('div', { class: 'bar ' + cls }, fill, marksEl, text);
  return {
    el,
    set(v: number, label?: string) {
      fill.style.width = Math.max(0, Math.min(1, v)) * 100 + '%';
      if (label !== undefined) text.textContent = label;
    },
    marks(fracs: number[]) {
      marksEl.innerHTML = '';
      for (const f of fracs) marksEl.append(h('i', { style: `left:${f * 100}%` }));
    },
  };
}

/** Circular cooldown button for abilities. */
export function abilityButton(icon: string, label: string, onPress: () => void, cls = ''): {
  el: HTMLButtonElement;
  setCooldown: (frac: number) => void;
  setEnabled: (b: boolean) => void;
  setLevel: (n: number) => void;
} {
  const ring = h('div', { class: 'ab-ring' });
  const lvl = h('div', { class: 'ab-lvl' });
  const el = h('button', { class: 'ability ' + cls, 'aria-label': label, title: label },
    ring, h('div', { class: 'ab-icon' }, icon), h('div', { class: 'ab-label' }, label), lvl);
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    audio.unlock();
    if (el.disabled) { audio.sfx('error'); return; }
    onPress();
  });
  return {
    el,
    setCooldown(frac: number) {
      const deg = Math.max(0, Math.min(1, frac)) * 360;
      ring.style.background = frac > 0 ? `conic-gradient(rgba(0,0,0,0.55) ${deg}deg, transparent ${deg}deg)` : 'none';
      el.classList.toggle('cooling', frac > 0);
    },
    setEnabled(b: boolean) { el.disabled = !b; },
    setLevel(n: number) { lvl.textContent = n > 0 ? String(n) : ''; },
  };
}
