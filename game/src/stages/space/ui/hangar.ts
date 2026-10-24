// The hangar: building or upgrading a ship part is a little assembly job. Your ship hovers on the docking pad
// between two robot welding arms, the part's blueprint is pinned up beside it with a schematic and specs, and
// you drag each component (or, for a plain upgrade, the part's module crate) onto a glowing socket on the hull.
// The arms seat and weld every piece; once all are in, you pay, the whole bay finishes the job, and the new
// part gets a test run. Consumables built from a blueprint (Bio Shield, Embassy) are fabricated in a cradle.
import { button, h, ui } from '../../../engine/ui';
import { audio } from '../../../engine/audio';
import { TAU, clamp } from '../../../engine/math';
import { TOOLS, type ToolDef } from '../data';
import { COMPONENTS, RARITY_COLOR, RECIPES, type CompId } from '../salvage';
import { blit, glow } from '../art/sprites';
import { drawShip, shipLayout } from '../art/shipArt';
import type { SpaceStage } from '../stage';
import { money } from './common';

interface Part { c: string; icon: string; name: string; need: number; color: string }
interface Socket { part: Part; x: number; y: number; state: 'empty' | 'coming' | 'seated' | 'done'; t: number }
interface Fly { icon: string; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; sock: Socket }
interface Arm { bx: number; side: -1 | 1; x: number; y: number; tx: number; ty: number; queue: Socket[]; cur: Socket | null; phase: 'reach' | 'weld'; timer: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; bounced?: boolean }

/** Where on the hull each kind of part goes: a slice of the ship from tail (0) to nose (1). */
const ZONE: Record<string, [number, number]> = {
  drive: [0.04, 0.34], laser: [0.62, 0.96], missile: [0.55, 0.9], pulse: [0.4, 0.75], shield: [0.3, 0.8],
  cargo: [0.28, 0.72], cell: [0.22, 0.62], hull: [0.12, 0.9], wormkey: [0.4, 0.7], bomb: [0.35, 0.65],
};

/** Open the hangar to build `t`. `commit` pays for it and installs it; `onClose` runs when you leave. */
export function openHangar(st: SpaceStage, t: ToolDef, price: number, commit: () => boolean, onClose?: () => void) {
  const w = st.w;
  const design = st.shipDesign;
  const L = shipLayout(design);
  const fab = t.kind === 'consumable';
  const rec = RECIPES[t.id];
  const parts: Part[] = rec
    ? (Object.entries(rec) as [CompId, number][]).map(([c, n]) => ({ c, icon: COMPONENTS[c].icon, name: COMPONENTS[c].name, need: n, color: RARITY_COLOR[COMPONENTS[c].rarity] }))
    : [{ c: 'module', icon: '📦', name: `${t.name} module`, need: 1, color: '#ffd166' }];
  const zone = ZONE[t.group ?? t.id] ?? [0.2, 0.85];
  const kind = t.group ?? t.id;
  const dock = w.ownerOf(w.s.loc) === 'player' ? (w.s.loc === w.gal.homeStar ? 'Home shipyard' : 'Colony dock') : 'Allied dock';

  // ---------------------------------------------------------------- DOM
  const cv = h('canvas', { class: 'ob-cv yard-cv', 'aria-label': 'Hangar' }) as HTMLCanvasElement;
  const bpCv = h('canvas', { class: 'yard-schem', 'aria-hidden': 'true' }) as HTMLCanvasElement;
  const banner = h('div', { class: 'ob-banner' });
  const partsEl = h('div', { class: 'yard-parts' });
  const tray = h('div', { class: 'yard-tray' });
  const hint = h('div', { class: 'ob-hint' });
  const auto = button('⚙️ Auto-install', () => autoInstall(), { cls: 'small', title: 'Let the arms place every part' });
  const pay = button(`🔧 Build · ${money(price)}`, () => build(), { cls: 'gold yard-pay', disabled: true, title: 'Install every part first' });
  const cur = t.group ? TOOLS.find((x) => x.group === t.group && x.level === w.groupLevel(t.group!, t.group === 'pulse' ? 0 : 1)) : undefined;
  const bp = h('div', { class: 'yard-bp' },
    h('div', { class: 'yard-bp-h' }, h('b', null, `📐 ${fab ? 'Fabrication plan' : 'Blueprint'}`), h('span', null, t.name.toUpperCase())),
    bpCv,
    h('div', { class: 'yard-spec' },
      h('div', null, h('i', null, 'SPEC '), t.desc),
      fab ? h('div', null, h('i', null, 'OUT  '), `1 × ${t.icon} ${t.name}, to your hold`)
        : cur ? h('div', null, h('i', null, 'WAS  '), `${cur.name}: ${cur.desc}`)
        // Level 1 of a group is the stock fitting every ship starts with.
        : t.group && t.group !== 'pulse' ? h('div', null, h('i', null, 'WAS  '), /\s[IVX]+$/.test(t.name) ? `${t.name.replace(/\s[IVX]+$/, '')} I (stock)` : 'The stock fitting')
        : h('div', null, h('i', null, 'NEW  '), 'A new system for your ship'),
      h('div', null, h('i', null, 'COST '), money(price))),
    partsEl);
  let alive = true;
  const close = () => {
    if (!alive) return;
    alive = false;
    root.remove();
    window.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-wrap')) return;
    if (e.key === 'Escape') close();
    else if ((e.key === 'Enter' || e.key === ' ') && !pay.disabled) { e.preventDefault(); pay.click(); }
  };
  const root = h('div', { class: 'sp-focus yard' },
    h('div', { class: 'sp-focus-head' }, h('h2', null, `🛠️ ${fab ? 'Fabricating' : 'Building'} ${t.name}`), h('span', { class: 'yard-dock' }, `${dock} · ${w.star(w.s.loc).name}`),
      button('✕', () => { audio.sfx('click'); close(); }, { cls: 'icon', title: 'Leave the hangar' })),
    h('div', { class: 'yard-main' }, bp, h('div', { class: 'ob-stage' }, cv, banner)),
    h('div', { class: 'yard-bar' }, tray, h('div', { class: 'yard-acts' }, auto, pay)),
    hint);
  document.body.append(root);
  window.addEventListener('keydown', onKey);
  audio.sfx('build', { pitch: 0.7 });

  // ---------------------------------------------------------------- state
  let time = 0, last = performance.now(), shake = 0, flashA = 0, bannerT = 0;
  let sparks: Spark[] = [], flies: Fly[] = [];
  let arcs: { pts: [number, number][]; life: number }[] = [];
  let floats: { x: number; y: number; text: string; color: string; life: number }[] = [];
  let finale: { t: number; fired: boolean; done: boolean } | null = null;
  let dragPart: Part | null = null;
  const sockets: Socket[] = [];
  for (const p of parts) for (let i = 0; i < p.need; i++) sockets.push({ part: p, x: 0, y: 0, state: 'empty', t: 0 });
  // Interleave kinds along the hull so the sockets read as one assembly.
  sockets.sort((a, b) => parts.indexOf(a.part) - parts.indexOf(b.part));
  const order = sockets.map((s, i) => ({ s, k: (i * 0.618) % 1 })).sort((a, b) => a.k - b.k).map((o) => o.s);

  // ---------------------------------------------------------------- geometry
  const geom = () => {
    const cw = cv.clientWidth || 600, ch = cv.clientHeight || 400;
    const floor = ch * 0.78;
    const size = Math.min((cw * (cw < 560 ? 0.72 : 0.56)) / Math.max(30, L.width), (ch * 0.34) / Math.max(20, L.height));
    const shipW = L.width * size, shipH = L.height * size;
    const cx = cw / 2, sy = floor - shipH * 0.55 - Math.max(26, ch * 0.09);
    return { cw, ch, floor, size, shipW, shipH, cx, sy };
  };
  /** Hull centreline height and thickness at a design-space x, from the spine. */
  const hullAt = (x: number) => {
    const sp = [...design.spine].sort((a, b) => a.x - b.x);
    if (!sp.length) return { y: L.top + L.height / 2, r: L.height * 0.3 };
    if (x <= sp[0].x) return { y: sp[0].y, r: sp[0].r };
    for (let i = 1; i < sp.length; i++) {
      if (x <= sp[i].x) {
        const k = (x - sp[i - 1].x) / Math.max(1e-6, sp[i].x - sp[i - 1].x);
        return { y: sp[i - 1].y + (sp[i].y - sp[i - 1].y) * k, r: sp[i - 1].r + (sp[i].r - sp[i - 1].r) * k };
      }
    }
    const e = sp[sp.length - 1];
    return { y: e.y, r: e.r };
  };
  /** Socket positions relative to the ship's centre (or the cradle), recomputed with the layout. */
  const placeSockets = () => {
    const g = geom();
    const n = order.length;
    order.forEach((s, i) => {
      if (fab) {
        const a = -Math.PI / 2 + (i / n) * TAU;
        s.x = Math.cos(a) * g.shipH * 0.55; s.y = Math.sin(a) * g.shipH * 0.42;
        return;
      }
      const f = zone[0] + (zone[1] - zone[0]) * (n === 1 ? 0.5 : i / (n - 1));
      const dx = L.left + f * L.width;
      const hl = hullAt(dx);
      const side = n === 1 ? 0 : i % 2 ? 1 : -1;
      s.x = (dx - L.cx) * g.size;
      s.y = (hl.y - L.groundY + side * hl.r * 0.42) * g.size;
    });
  };
  /** The point things are fitted to: the ship, or the fabrication cradle in front of it. */
  const anchor = () => {
    const g = geom();
    const bob = finale ? 0 : Math.sin(time * 1.4) * 2.5;
    return fab ? { x: g.cx, y: g.floor - g.shipH * 0.62 } : { x: g.cx, y: g.sy + bob };
  };
  const sockPos = (s: Socket) => { const a = anchor(); return { x: a.x + s.x, y: a.y + s.y }; };

  const arms: Arm[] = [-1, 1].map((side) => ({ bx: 0, side: side as -1 | 1, x: 0, y: 0, tx: 0, ty: 0, queue: [], cur: null, phase: 'reach', timer: 0 }));
  const armGeom = (a: Arm) => {
    const g = geom();
    const bx = g.cx + a.side * Math.min(g.cw * 0.44, g.shipW * 0.66 + 40), by = g.floor + 4;
    const reach = Math.hypot(g.shipW * 0.7 + 40, by - (g.sy - g.shipH)) * 0.6;
    return { bx, by, seg: Math.max(60, reach) };
  };
  const idleTarget = (a: Arm) => { const g = geom(); return { x: g.cx + a.side * g.shipW * 0.42, y: g.sy - g.shipH * 0.95 + Math.sin(time * 1.3 + a.side) * 8 }; };

  // ---------------------------------------------------------------- the parts tray
  const left = (p: Part) => sockets.filter((s) => s.part === p && s.state === 'empty').length;
  const chips = new Map<Part, { el: HTMLElement; n: HTMLElement }>();
  const lines = new Map<Part, HTMLElement>();
  for (const p of parts) {
    const n = h('span', { class: 'yard-n' });
    const el = h('div', { class: 'yard-chip', role: 'button', tabindex: '0', style: `--c:${p.color}`, title: `Drag onto a socket, or tap to fit it` }, h('span', { class: 'yard-ic' }, p.icon), h('b', null, p.name), n);
    tray.append(el);
    chips.set(p, { el, n });
    const ln = h('div', { class: 'yard-line' });
    partsEl.append(ln);
    lines.set(p, ln);
    bindDrag(el, p);
  }
  const refresh = () => {
    for (const p of parts) {
      const done = sockets.filter((s) => s.part === p && s.state === 'done').length;
      const placed = p.need - left(p);
      const c = chips.get(p)!;
      c.n.textContent = `${placed}/${p.need}`;
      c.el.classList.toggle('spent', left(p) === 0);
      const ln = lines.get(p)!;
      ln.textContent = `${done >= p.need ? '☑' : '☐'} ${p.icon} ${p.need} × ${p.name}`;
      ln.classList.toggle('ok', done >= p.need);
    }
    const all = sockets.every((s) => s.state === 'done');
    pay.disabled = !all || !!finale;
    auto.disabled = sockets.every((s) => s.state !== 'empty') || !!finale;
    if (!finale) {
      hint.textContent = all ? `Every part is fitted. Pay ${money(price)} to finish the build.`
        : fab ? 'Drag each component into the fabrication cradle (or tap it). When all are in, pay to fabricate.'
        : `Drag each ${rec ? 'component' : 'module'} onto a glowing socket on your ship (or tap it). The arms seat and weld it in.`;
    }
  };

  /** Fit one of a part: from screen point (x, y), into the nearest free socket for it. */
  const install = (p: Part, x: number, y: number, near?: { x: number; y: number }) => {
    const free = sockets.filter((s) => s.part === p && s.state === 'empty');
    if (!free.length || finale) return false;
    const at = near ?? { x, y };
    free.sort((a, b) => { const pa = sockPos(a), pb = sockPos(b); return Math.hypot(pa.x - at.x, pa.y - at.y) - Math.hypot(pb.x - at.x, pb.y - at.y); });
    const s = free[0];
    s.state = 'coming';
    const to = sockPos(s);
    flies.push({ icon: p.icon, x0: x, y0: y, x1: to.x, y1: to.y, t: 0, dur: 0.45, sock: s });
    // The arm with less on its plate takes it (the nearer one on a tie), so both arms work.
    const load = (a: Arm) => a.queue.length + (a.cur ? 1 : 0);
    const arm = load(arms[0]) !== load(arms[1]) ? (load(arms[0]) < load(arms[1]) ? arms[0] : arms[1]) : s.x < 0 ? arms[0] : arms[1];
    arm.queue.push(s);
    audio.sfx('whoosh', { pitch: 1.6, vol: 0.35 });
    refresh();
    return true;
  };
  const chipPoint = (el: HTMLElement) => {
    const r = el.getBoundingClientRect(), c = cv.getBoundingClientRect();
    return { x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top };
  };
  function bindDrag(el: HTMLElement, p: Part) {
    let d: { id: number; x: number; y: number; ghost: HTMLElement | null } | null = null;
    el.addEventListener('pointerdown', (e) => {
      if (!left(p) || finale) { audio.sfx('error'); return; }
      e.preventDefault();
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, ghost: null };
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      if (!d.ghost && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
        d.ghost = h('div', { class: 'yard-ghost', style: `--c:${p.color}` }, p.icon);
        document.body.append(d.ghost);
        dragPart = p;
        audio.sfx('tap');
      }
      if (d.ghost) { d.ghost.style.left = `${e.clientX}px`; d.ghost.style.top = `${e.clientY}px`; }
    });
    const end = (e: PointerEvent, cancel = false) => {
      if (!d || e.pointerId !== d.id) return;
      const c = cv.getBoundingClientRect();
      const x = e.clientX - c.left, y = e.clientY - c.top;
      if (!d.ghost) { if (!cancel) { const cp = chipPoint(el); install(p, cp.x, cp.y); } }
      else {
        d.ghost.remove();
        // Dropped on the ship (or near a socket): it snaps to the nearest free one.
        const g = geom(), a = anchor();
        const onShip = Math.abs(x - a.x) < g.shipW * 0.6 + 30 && Math.abs(y - a.y) < g.shipH * 0.8 + 30;
        const nearSock = sockets.some((s) => s.part === p && s.state === 'empty' && Math.hypot(sockPos(s).x - x, sockPos(s).y - y) < 90);
        if (!cancel && (onShip || nearSock)) install(p, x, y);
        else if (!cancel) { audio.sfx('error'); st.ui.toast(`Drop the ${p.name} on a glowing socket on your ${fab ? 'cradle' : 'ship'}.`, p.icon); }
      }
      dragPart = null;
      d = null;
    };
    el.addEventListener('pointerup', (e) => end(e));
    el.addEventListener('pointercancel', (e) => end(e, true));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const cp = chipPoint(el); install(p, cp.x, cp.y); } });
  }
  const autoInstall = () => {
    let k = 0;
    for (const p of parts) for (let i = left(p); i > 0; i--) {
      setTimeout(() => { if (alive) { const cp = chipPoint(chips.get(p)!.el); install(p, cp.x, cp.y); } }, k++ * 260);
    }
  };

  // ---------------------------------------------------------------- the build
  let asking = false;
  const build = async () => {
    if (finale || asking || !sockets.every((s) => s.state === 'done')) return;
    asking = true;
    const ok = await ui.confirm(`${fab ? 'Fabricate' : 'Build'} ${t.name}?`, `Every part is seated. Pay ${money(price)} to ${fab ? 'fabricate' : 'finish and fit'} ${t.icon} ${t.name}. You have ${money(w.s.money)}.`, `🔧 Pay ${money(price)}`, 'Not yet');
    asking = false;
    if (!ok || !alive || finale) return;
    if (!commit()) { refresh(); return; }
    finale = { t: 0, fired: false, done: false };
    pay.disabled = true;
    auto.remove();
    tray.classList.add('spent');
    hint.textContent = 'The whole bay goes to work…';
    audio.sfx('build');
    audio.sfx('horn', { vol: 0.4 });
  };
  const burst = (x: number, y: number, n: number, speed = 260, col = '#ffd27a') => {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = speed * (0.35 + Math.random() * 0.8);
      const life = 0.35 + Math.random() * 0.5;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col: Math.random() < 0.3 ? '#ffffff' : col });
    }
  };
  const arc = (x0: number, y0: number, x1: number, y1: number) => {
    const pts: [number, number][] = [[x0, y0]];
    for (let i = 1; i < 7; i++) {
      const k = i / 7;
      pts.push([x0 + (x1 - x0) * k + (Math.random() - 0.5) * 18, y0 + (y1 - y0) * k + (Math.random() - 0.5) * 18]);
    }
    pts.push([x1, y1]);
    arcs.push({ pts, life: 0.16 });
  };
  const float = (text: string, color: string) => { const a = anchor(), g = geom(); floats.push({ x: a.x, y: a.y - g.shipH * 0.9, text, color, life: 2 }); };
  /** The part's test run once it is in. */
  const testRun = () => {
    const g = geom(), a = anchor();
    const nose = { x: a.x + (L.right - L.cx) * g.size, y: a.y }, tail = { x: a.x + (L.left - L.cx) * g.size, y: a.y };
    if (fab) { burst(a.x, a.y, 40, 300, '#9dff8a'); flashA = 0.5; audio.sfx('heal'); return; }
    switch (kind) {
      case 'drive': shake = 9; audio.sfx('warp', { pitch: 0.6 }); for (let i = 0; i < 30; i++) burst(tail.x - 20, tail.y, 1, 420, '#7fd8ff'); break;
      case 'laser': audio.sfx('laser', { pitch: 0.6, vol: 0.9 }); beam = { x: nose.x, y: nose.y, t: 0.7 }; break;
      case 'missile': audio.sfx('whoosh', { pitch: 0.8 }); missiles.push({ x: nose.x, y: nose.y - 6, vx: 520, t: 0 }, { x: nose.x, y: nose.y + 6, vx: 470, t: -0.12 }); break;
      case 'pulse': audio.sfx('explode', { pitch: 1.4, vol: 0.5 }); rings.push({ x: a.x, y: a.y, t: 0 }); break;
      case 'shield': audio.sfx('charm'); shieldT = 1.8; break;
      case 'beacon': audio.sfx('sing'); for (let i = 0; i < 4; i++) setTimeout(() => burst(a.x + (Math.random() - 0.5) * g.shipW, a.y - g.shipH * (1 + Math.random()), 30, 300, ['#ff8ad8', '#ffd166', '#7dff9a', '#8fd0ff'][i]), i * 180); break;
      default: rings.push({ x: a.x, y: a.y, t: 0 }); audio.sfx('zap', { pitch: 0.7 });
    }
    if (kind === 'cargo' || kind === 'cell' || kind === 'hull') { rings.push({ x: a.x, y: a.y, t: 0 }); audio.sfx('success'); }
  };
  let beam: { x: number; y: number; t: number } | null = null;
  let shieldT = 0;
  let missiles: { x: number; y: number; vx: number; t: number }[] = [];
  let rings: { x: number; y: number; t: number }[] = [];

  // ---------------------------------------------------------------- frame
  const frame = (now: number) => {
    if (!alive) return;
    if (!root.isConnected) { close(); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    placeSockets();
    // Flying parts land in their sockets with a clunk.
    for (const f of flies) {
      f.t += dt;
      const s = sockPos(f.sock);
      f.x1 = s.x; f.y1 = s.y;
      if (f.t >= f.dur && f.sock.state === 'coming') {
        f.sock.state = 'seated';
        audio.sfx('hit', { pitch: 1.5, vol: 0.5 });
        burst(s.x, s.y, 8, 160);
      }
    }
    flies = flies.filter((f) => f.t < f.dur);
    // The arms: reach for the next seated part, then weld it home.
    for (const a of arms) {
      const ag = armGeom(a);
      a.bx = ag.bx;
      if (finale) {
        if ((a.timer -= dt) <= 0) {
          a.timer = 0.22 + Math.random() * 0.2;
          const g = geom(), an = anchor();
          const tx = an.x + (Math.random() - 0.5) * g.shipW * 0.8, ty = an.y + (Math.random() - 0.5) * g.shipH * 0.6;
          a.tx = (a.side < 0 ? Math.min(tx, an.x + 20) : Math.max(tx, an.x - 20)); a.ty = ty;
        }
        if (finale.t < 2.2 && Math.hypot(a.x - a.tx, a.y - a.ty) < 30 && Math.random() < 0.5) { burst(a.x, a.y, 2); if (Math.random() < 0.08) audio.sfx('zap', { pitch: 1.6, vol: 0.2 }); }
      } else if (!a.cur && a.queue.length) {
        a.cur = a.queue.shift()!;
        a.phase = 'reach';
        a.timer = 0;
      }
      if (!finale && a.cur) {
        const p = sockPos(a.cur);
        a.tx = p.x + a.side * 4; a.ty = p.y - 10;
        a.timer += dt;
        if (a.phase === 'reach' && a.cur.state === 'seated' && a.timer > 0.2) { a.phase = 'weld'; a.timer = 0; audio.sfx('zap', { pitch: 1.3, vol: 0.35 }); }
        if (a.phase === 'weld') {
          if (Math.random() < 0.7) burst(a.x, a.y, 2);
          if (a.timer > 0.5) {
            a.cur.state = 'done';
            a.cur.t = 0;
            audio.sfx('build', { pitch: 1.2, vol: 0.6 });
            a.cur = null;
            refresh();
          }
        }
      } else if (!finale) { const it = idleTarget(a); a.tx = it.x; a.ty = it.y; }
      const k = 1 - Math.exp(-dt * (finale ? 14 : 7));
      if (!a.x && !a.y) { const it = idleTarget(a); a.x = it.x; a.y = it.y; }
      a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k;
    }
    for (const s of sockets) s.t += dt;
    // The finale: arcs crawl over the hull, the arms weld everywhere, then the test run and the banner.
    if (finale) {
      finale.t += dt;
      const g = geom(), an = anchor();
      if (finale.t < 2.2 && Math.random() < 0.35) {
        const p = (): [number, number] => [an.x + (Math.random() - 0.5) * g.shipW * 0.8, an.y + (Math.random() - 0.5) * g.shipH * 0.5];
        const [x0, y0] = p(), [x1, y1] = p();
        arc(x0, y0, x1, y1);
        if (Math.random() < 0.3) audio.sfx('zap', { pitch: 0.8 + Math.random() * 0.6, vol: 0.25 });
      }
      if (finale.t > 2.2 && !finale.fired) {
        finale.fired = true;
        flashA = 0.6;
        testRun();
      }
      if (finale.t > 3.1 && !finale.done) {
        finale.done = true;
        banner.className = 'ob-banner on win';
        banner.textContent = `${t.icon} ${t.name} ${fab ? 'fabricated' : 'installed'}!`;
        bannerT = 2.4;
        float(t.desc, '#ffd166');
        audio.sfx('levelup');
        hint.textContent = fab ? `${t.name} stowed in your hold.` : `${t.name} is part of your ship now. ${t.desc}`;
        pay.replaceWith(button('✓ Done', () => close(), { cls: 'primary yard-pay' }));
      }
    }
    if (bannerT > 0 && (bannerT -= dt) <= 0) banner.classList.remove('on');
    render(dt);
    requestAnimationFrame(frame);
  };

  // ---------------------------------------------------------------- drawing
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), b: 0.3 + Math.random() * 0.7 }));
  const render = (dt: number) => {
    const g0 = geom();
    const { cw, ch, floor, size, shipW, shipH, cx } = g0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    shake = Math.max(0, shake - dt * 22);
    g.save();
    if (shake) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBay(g, cw, ch, floor, cx, shipW);
    const an = anchor();
    // The docking pad and its clamps.
    const pad = g.createRadialGradient(cx, floor + 8, 4, cx, floor + 8, shipW * 0.6);
    pad.addColorStop(0, 'rgba(62,230,196,0.28)');
    pad.addColorStop(1, 'rgba(62,230,196,0)');
    g.fillStyle = pad;
    g.beginPath(); g.ellipse(cx, floor + 8, shipW * 0.62, 18, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(62,230,196,${0.5 + 0.2 * Math.sin(time * 3)})`;
    g.lineWidth = 2;
    g.setLineDash([10, 8]); g.lineDashOffset = -time * 20;
    g.beginPath(); g.ellipse(cx, floor + 8, shipW * 0.5, 13, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
    if (!fab) for (const sx of [-0.26, 0.22]) {
      const x = cx + sx * shipW, top = an.y + shipH * 0.2;
      g.fillStyle = '#2b3242';
      g.fillRect(x - 6, top, 12, floor - top + 4);
      g.fillStyle = '#ffb347';
      for (let y = top + 10; y < floor; y += 22) g.fillRect(x - 6, y, 12, 4);
      g.fillStyle = '#3a4357';
      g.fillRect(x - 16, top - 4, 32, 8);
    }
    // The ship, shimmering while it is worked on.
    const finT = finale?.t ?? 0;
    const thrust = finale?.fired && kind === 'drive' ? 2.2 : 0.15;
    const sh = st.shipDesign;
    if (fab) g.globalAlpha = 0.45;
    drawShip(g, sh, fab ? cx : an.x, fab ? g0.sy : an.y, 0, size, time, { thrust, flash: finale && finT < 2.2 ? (Math.sin(finT * 18) > 0.6 ? 0.35 : 0) : 0, shield: shieldT > 0 ? Math.min(1, shieldT) : 0, engine: '#7fd8ff' });
    g.globalAlpha = 1;
    if (shieldT > 0) shieldT -= dt;
    if (finale?.fired && kind === 'drive' && finT < 3.6) {
      // Test burn: a long blue flame off the stern.
      const tx = an.x + (L.left - L.cx) * size, len = shipW * (0.55 + 0.08 * Math.sin(time * 40));
      const fg = g.createLinearGradient(tx, an.y, tx - len, an.y);
      fg.addColorStop(0, 'rgba(230,250,255,0.95)');
      fg.addColorStop(0.3, 'rgba(127,216,255,0.75)');
      fg.addColorStop(1, 'rgba(60,120,255,0)');
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = fg;
      g.beginPath(); g.moveTo(tx, an.y - shipH * 0.18); g.lineTo(tx - len, an.y); g.lineTo(tx, an.y + shipH * 0.18); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    if (fab) drawCradle(g, an.x, an.y, shipH);
    // Sockets
    for (const s of sockets) {
      const p = sockPos(s), r = Math.max(10, 13 * Math.min(1.3, size * 1.4));
      const match = dragPart === s.part && s.state === 'empty';
      const pul = 0.5 + 0.5 * Math.sin(time * 5 + s.x);
      g.save();
      g.translate(p.x, p.y);
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; (i ? g.lineTo : g.moveTo).call(g, Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath();
      g.fillStyle = s.state === 'done' ? 'rgba(20,60,40,0.85)' : 'rgba(6,12,22,0.78)';
      g.fill();
      g.lineWidth = match ? 3.5 : 2;
      g.strokeStyle = s.state === 'done' ? '#62e07c' : match ? `rgba(120,240,255,${0.6 + 0.4 * pul})` : `rgba(255,179,71,${0.45 + 0.4 * pul})`;
      g.stroke();
      if (s.state === 'empty' && !finale) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = (match ? 0.6 : 0.3) * pul;
        blit(g, glow(match ? '#78f0ff' : '#ffb347', 32), 0, 0, r * 2.2);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      g.font = `${Math.round(r * 1.05)}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = s.state === 'empty' ? 0.3 : s.state === 'coming' ? 0 : 1;
      g.fillText(s.part.icon, 0, 1);
      g.globalAlpha = 1;
      if (s.state === 'done' && s.t < 0.5) {
        g.strokeStyle = `rgba(98,224,124,${1 - s.t * 2})`;
        g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, r * (1 + s.t * 2.5), 0, TAU); g.stroke();
      }
      g.restore();
    }
    // Parts in flight
    for (const f of flies) {
      const k = clamp(f.t / f.dur, 0, 1), e = 1 - (1 - k) ** 2;
      const mx = (f.x0 + f.x1) / 2, my = Math.min(f.y0, f.y1) - 60;
      const x = (1 - e) ** 2 * f.x0 + 2 * (1 - e) * e * mx + e * e * f.x1, y = (1 - e) ** 2 * f.y0 + 2 * (1 - e) * e * my + e * e * f.y1;
      g.globalCompositeOperation = 'lighter';
      blit(g, glow(f.sock.part.color.startsWith('#') ? f.sock.part.color : '#ffd166', 32), x, y, 26);
      g.globalCompositeOperation = 'source-over';
      g.font = '26px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(f.icon, x, y);
    }
    // Arms over everything on the pad
    for (const a of arms) drawArm(g, a);
    // Test-run effects
    if (beam) {
      beam.t -= dt;
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = '#ff7a3a'; g.globalAlpha = Math.max(0, beam.t) * 0.6; g.lineWidth = 14;
      g.beginPath(); g.moveTo(beam.x, beam.y); g.lineTo(cw + 20, beam.y); g.stroke();
      g.strokeStyle = '#ffffff'; g.globalAlpha = Math.max(0, beam.t); g.lineWidth = 3;
      g.stroke();
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (beam.t <= 0) beam = null;
    }
    for (const m of missiles) {
      m.t += dt;
      if (m.t < 0) continue;
      m.x += m.vx * dt; m.vx += 900 * dt;
      g.fillStyle = '#e8eef4';
      g.fillRect(m.x - 10, m.y - 2.5, 20, 5);
      g.globalCompositeOperation = 'lighter';
      blit(g, glow('#ffb347', 32), m.x - 14, m.y, 12);
      g.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.8) sparks.push({ x: m.x - 12, y: m.y, vx: -80, vy: (Math.random() - 0.5) * 40, life: 0.3, max: 0.3, col: '#ffb347' });
    }
    missiles = missiles.filter((m) => m.x < cw + 40);
    for (const r of rings) {
      r.t += dt;
      const k = r.t / 0.9;
      g.strokeStyle = `rgba(143,208,255,${Math.max(0, 1 - k)})`;
      g.lineWidth = 4 * (1 - k * 0.6);
      g.beginPath(); g.ellipse(r.x, r.y, shipW * (0.3 + k * 0.6), shipH * (0.3 + k * 0.9), 0, 0, TAU); g.stroke();
    }
    rings = rings.filter((r) => r.t < 0.9);
    // Arcs, sparks and words
    g.globalCompositeOperation = 'lighter';
    for (const ar of arcs) {
      ar.life -= dt;
      g.strokeStyle = '#bfe9ff';
      g.globalAlpha = Math.max(0, ar.life / 0.16);
      g.lineWidth = 2;
      g.beginPath();
      ar.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    arcs = arcs.filter((ar) => ar.life > 0);
    g.globalAlpha = 1;
    for (const s of sparks) {
      s.life -= dt;
      s.vy += 700 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y > floor + 6 && !s.bounced) { s.y = floor + 6; s.vy *= -0.35; s.vx *= 0.6; s.bounced = true; }
      g.strokeStyle = s.col;
      g.globalAlpha = clamp(s.life / s.max * 1.5, 0, 1);
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); g.stroke();
    }
    sparks = sparks.filter((s) => s.life > 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 16px Fredoka, system-ui, sans-serif';
    for (const fl of floats) {
      fl.life -= dt; fl.y -= 18 * dt;
      g.globalAlpha = clamp(fl.life, 0, 1);
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(fl.text, fl.x, fl.y);
      g.fillStyle = fl.color; g.fillText(fl.text, fl.x, fl.y);
    }
    floats = floats.filter((fl) => fl.life > 0);
    g.globalAlpha = 1;
    g.restore();
    if (flashA > 0) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = flashA;
      g.fillStyle = '#fff4d0';
      g.fillRect(0, 0, cw, ch);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      flashA = Math.max(0, flashA - dt * 2.2);
    }
    drawSchematic(bpCv, kind, fab, time, sockets.filter((s) => s.state === 'done').length / Math.max(1, sockets.length));
  };

  /** The bay: back wall with a starlit door, ceiling lamps, gantries and a perspective floor. */
  const drawBay = (g: CanvasRenderingContext2D, cw: number, ch: number, floor: number, cx: number, shipW: number) => {
    const wall = g.createLinearGradient(0, 0, 0, floor);
    wall.addColorStop(0, '#0a0f1c');
    wall.addColorStop(1, '#121a2c');
    g.fillStyle = wall;
    g.fillRect(0, 0, cw, floor);
    // Bay door: a window onto space, framed in hazard stripes.
    const dw = Math.min(cw * 0.62, shipW * 1.5), dh = floor * 0.62, dx = cx - dw / 2, dy = floor * 0.12;
    g.fillStyle = '#01030a';
    g.fillRect(dx, dy, dw, dh);
    g.fillStyle = '#ffffff';
    for (const s of stars) { g.globalAlpha = s.b * (0.7 + 0.3 * Math.sin(time * 2 + s.x * 40)); g.fillRect(dx + s.x * dw, dy + s.y * dh, 1.5, 1.5); }
    g.globalAlpha = 1;
    const hz = 10;
    g.save();
    g.beginPath(); g.rect(dx - hz, dy - hz, dw + hz * 2, dh + hz * 2); g.rect(dx, dy, dw, dh); g.clip('evenodd');
    for (let i = -20; i < (dw + dh) / 14 + 20; i++) {
      g.fillStyle = i % 2 ? '#1a1d24' : '#e0a92e';
      g.beginPath();
      const x = dx - hz + i * 14;
      g.moveTo(x, dy - hz); g.lineTo(x + 14, dy - hz); g.lineTo(x + 14 - dh - hz * 2, dy + dh + hz); g.lineTo(x - dh - hz * 2, dy + dh + hz);
      g.closePath(); g.fill();
    }
    g.restore();
    // Wall panels and a bay sign
    g.strokeStyle = 'rgba(120,150,200,0.08)';
    g.lineWidth = 1;
    for (let x = (cx % 70) - 70; x < cw; x += 70) { if (x > dx - hz && x < dx + dw + hz) continue; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, floor); g.stroke(); }
    g.fillStyle = 'rgba(62,230,196,0.75)';
    g.font = '700 12px "Share Tech Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(`BAY ${String((w.s.loc % 9) + 1).padStart(2, '0')} · ${fab ? 'FABRICATION' : 'REFIT IN PROGRESS'}`, cx, dy - hz - 8);
    // Ceiling lamps throw cones of light onto the pad.
    g.globalCompositeOperation = 'lighter';
    for (const lx of [cx - shipW * 0.45, cx, cx + shipW * 0.45]) {
      const fl = 0.85 + 0.15 * Math.sin(time * 13 + lx);
      const cone = g.createLinearGradient(0, 0, 0, floor);
      cone.addColorStop(0, `rgba(255,236,190,${0.14 * fl})`);
      cone.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = cone;
      g.beginPath(); g.moveTo(lx - 12, 0); g.lineTo(lx + 12, 0); g.lineTo(lx + shipW * 0.3, floor); g.lineTo(lx - shipW * 0.3, floor); g.closePath(); g.fill();
      blit(g, glow('#ffe9b0', 16), lx, 6, 16);
    }
    g.globalCompositeOperation = 'source-over';
    // Floor with perspective lines, and hazard edging
    const fg = g.createLinearGradient(0, floor, 0, ch);
    fg.addColorStop(0, '#1b2233');
    fg.addColorStop(1, '#0a0d15');
    g.fillStyle = fg;
    g.fillRect(0, floor, cw, ch - floor);
    g.strokeStyle = 'rgba(140,170,220,0.12)';
    for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(cx + i * 40, floor); g.lineTo(cx + i * 160, ch); g.stroke(); }
    for (let k = 1; k < 6; k++) { const y = floor + (ch - floor) * (k / 6) ** 1.6; g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }
    g.fillStyle = '#e0a92e';
    g.fillRect(0, floor - 3, cw, 3);
  };

  /** A ceiling-free, floor-mounted two-bone arm with a welding head. */
  const drawArm = (g: CanvasRenderingContext2D, a: Arm) => {
    const { bx, by, seg } = armGeom(a);
    const dx = a.x - bx, dy = a.y - by;
    const d = clamp(Math.hypot(dx, dy), 10, seg * 2 - 2);
    const base = Math.atan2(dy, dx);
    const bend = Math.acos(clamp(d / (2 * seg), -1, 1));
    // Elbows bend up and outward, away from the ship.
    const ang = base + (a.side < 0 ? -bend : bend);
    const ex = bx + Math.cos(ang) * seg, ey = by + Math.sin(ang) * seg;
    const hx = bx + Math.cos(base) * d, hy = by + Math.sin(base) * d;
    // Pedestal
    g.fillStyle = '#2b3242';
    g.fillRect(bx - 22, by - 14, 44, 18);
    g.fillStyle = '#e0a92e';
    g.fillRect(bx - 22, by - 14, 44, 4);
    const limb = (x0: number, y0: number, x1: number, y1: number, wd: number) => {
      g.strokeStyle = '#1c2230'; g.lineWidth = wd + 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = '#e0a92e'; g.lineWidth = wd;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = wd * 0.3;
      g.stroke();
    };
    limb(bx, by - 10, ex, ey, 12);
    limb(ex, ey, hx, hy, 9);
    for (const [x, y, r] of [[bx, by - 10, 9], [ex, ey, 8]] as const) { g.fillStyle = '#3a4357'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.fillStyle = '#9aa4b2'; g.beginPath(); g.arc(x, y, r * 0.4, 0, TAU); g.fill(); }
    // Welding head, pointing at its work
    const ha = Math.atan2(hy - ey, hx - ex);
    g.save();
    g.translate(hx, hy);
    g.rotate(ha);
    g.fillStyle = '#4a5468';
    g.fillRect(-6, -7, 14, 14);
    g.fillStyle = '#9aa4b2';
    g.fillRect(8, -2.5, 9, 5);
    g.restore();
    const welding = (a.cur && a.phase === 'weld') || (finale && finale.t < 2.2 && Math.hypot(a.x - a.tx, a.y - a.ty) < 30);
    if (welding) {
      const tx = hx + Math.cos(ha) * 18, ty = hy + Math.sin(ha) * 18;
      g.globalCompositeOperation = 'lighter';
      blit(g, glow('#bfe9ff', 32), tx, ty, 18 + Math.random() * 10);
      blit(g, glow('#ffffff', 16), tx, ty, 6);
      g.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.6) sparks.push({ x: tx, y: ty, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 220, life: 0.5, max: 0.5, col: Math.random() < 0.4 ? '#ffffff' : '#ffd27a' });
    }
  };

  /** A fabrication cradle: a pedestal with an energy cage where consumables are assembled. */
  const drawCradle = (g: CanvasRenderingContext2D, x: number, y: number, s: number) => {
    const g0 = geom();
    g.fillStyle = '#2b3242';
    g.fillRect(x - s * 0.7, g0.floor - 18, s * 1.4, 18);
    g.fillStyle = '#e0a92e';
    g.fillRect(x - s * 0.7, g0.floor - 18, s * 1.4, 3);
    g.strokeStyle = `rgba(143,208,255,${0.4 + 0.2 * Math.sin(time * 4)})`;
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, y, s * 0.62, s * 0.48, 0, 0, TAU); g.stroke();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.35 + (finale?.fired ? 0.5 : 0);
    blit(g, glow('#8fd0ff', 64), x, y, s * 0.8);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (finale?.fired) {
      g.font = `${Math.round(s * 0.5)}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = clamp((finale.t - 2.2) * 2, 0, 1);
      g.fillText(t.icon, x, y);
      g.globalAlpha = 1;
    }
  };

  refresh();
  requestAnimationFrame(frame);
  st.game.hint('hangar', 'Ship parts are built in the hangar: drag each component onto a socket on your ship (or tap it), then pay to finish. Leaving before you pay costs nothing.', '🛠️');
}

/** A blueprint schematic for a kind of part, drawn in white on blue, filling in as parts are fitted. */
export function drawSchematic(c: HTMLCanvasElement, kind: string, fab: boolean, time: number, done: number) {
  if (!c.isConnected) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = c.clientWidth || 200, ch = c.clientHeight || 120;
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  const x = cw / 2, y = ch / 2, s = Math.min(cw, ch) * 0.36;
  g.strokeStyle = 'rgba(220,236,255,0.9)';
  g.fillStyle = 'rgba(220,236,255,0.9)';
  g.lineWidth = 1.4;
  g.lineJoin = 'round';
  const line = (pts: number[][], close = false) => { g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(x + a * s, y + b * s) : g.moveTo(x + a * s, y + b * s))); if (close) g.closePath(); g.stroke(); };
  const circ = (a: number, b: number, r: number) => { g.beginPath(); g.arc(x + a * s, y + b * s, r * s, 0, TAU); g.stroke(); };
  switch (fab ? 'fab' : kind) {
    case 'drive':
      line([[-1.3, -0.35], [-0.2, -0.35], [0.3, -0.75], [1.3, -0.95], [1.3, 0.95], [0.3, 0.75], [-0.2, 0.35], [-1.3, 0.35]], true);
      line([[-0.2, -0.35], [-0.2, 0.35]]); line([[0.3, -0.75], [0.3, 0.75]]);
      circ(-0.75, 0, 0.22);
      break;
    case 'cargo':
      line([[-1, -0.4], [0.2, -0.9], [1.2, -0.5], [0, 0], [-1, -0.4]], true); line([[-1, -0.4], [-1, 0.6], [0, 1], [0, 0]]); line([[0, 1], [1.2, 0.5], [1.2, -0.5]]);
      line([[-0.5, -0.2], [-0.5, 0.8]]); line([[0.6, 0.25], [0.6, -0.75]]);
      break;
    case 'cell':
      g.strokeRect(x - 1.1 * s, y - 0.55 * s, 2.1 * s, 1.1 * s); g.strokeRect(x + 1.0 * s, y - 0.22 * s, 0.18 * s, 0.44 * s);
      for (let i = 0; i < 4; i++) g.strokeRect(x + (-0.95 + i * 0.5) * s, y - 0.4 * s, 0.38 * s, 0.8 * s);
      break;
    case 'hull':
      for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) { const cx = -0.9 + q * 0.6 + (r % 2) * 0.3, cy = -0.3 + r * 0.55; line([0, 1, 2, 3, 4, 5].map((k) => [cx + Math.cos(k * TAU / 6) * 0.3, cy + Math.sin(k * TAU / 6) * 0.3]), true); }
      break;
    case 'laser':
      line([[-1.3, -0.25], [0.6, -0.25], [0.6, 0.25], [-1.3, 0.25]], true); line([[0.6, -0.12], [1.3, -0.12]]); line([[0.6, 0.12], [1.3, 0.12]]);
      for (const lx of [-0.8, -0.3, 0.2]) { g.beginPath(); g.ellipse(x + lx * s, y, 0.08 * s, 0.4 * s, 0, 0, TAU); g.stroke(); }
      break;
    case 'missile':
      line([[-1.2, -0.2], [0.8, -0.2], [1.3, 0], [0.8, 0.2], [-1.2, 0.2]], true); line([[-1.2, -0.2], [-1.4, -0.6], [-0.8, -0.2]]); line([[-1.2, 0.2], [-1.4, 0.6], [-0.8, 0.2]]);
      break;
    case 'pulse': case 'shield': case 'wormkey':
      for (const r of [0.25, 0.55, 0.85]) circ(0, 0, r);
      line([[-1.2, 0], [1.2, 0]]); line([[0, -1], [0, 1]]);
      break;
    case 'fab':
      g.strokeRect(x - 0.8 * s, y - 0.8 * s, 1.6 * s, 1.6 * s); circ(0, 0, 0.5);
      line([[-0.8, -0.8], [-0.35, -0.35]]); line([[0.8, -0.8], [0.35, -0.35]]); line([[-0.8, 0.8], [-0.35, 0.35]]); line([[0.8, 0.8], [0.35, 0.35]]);
      break;
    default:
      circ(0, 0, 0.6); for (let k = 0; k < 8; k++) { const a = k * TAU / 8; line([[Math.cos(a) * 0.6, Math.sin(a) * 0.6], [Math.cos(a) * 0.85, Math.sin(a) * 0.85]]); } circ(0, 0, 0.25);
  }
  // Dimension line and a label
  g.globalAlpha = 0.7;
  line([[-1.3, 1.15], [1.3, 1.15]]); line([[-1.3, 1.05], [-1.3, 1.25]]); line([[1.3, 1.05], [1.3, 1.25]]);
  g.font = '9px "Share Tech Mono", ui-monospace, monospace';
  g.textAlign = 'center';
  g.fillText(`${(2.6 + (kind.length % 5) * 0.4).toFixed(1)} m`, x, y + 1.15 * s - 3);
  g.globalAlpha = 1;
  // Fitted parts glow the plan in; a scan line sweeps it.
  const sy = (time * 0.6 % 1) * ch;
  g.fillStyle = 'rgba(160,220,255,0.18)';
  g.fillRect(0, sy - 6, cw, 12);
  g.fillStyle = 'rgba(98,224,124,0.85)';
  g.fillRect(8, ch - 6, (cw - 16) * done, 3);
}
