// The Tribal HUD (DOM): food/population chips, totem progress, tribe badges, the bottom command
// bar, a contextual row for the selection, info panels, ability buttons and the debug panel.
import { abilityButton, h } from '../../engine/ui';
import { audio } from '../../engine/audio';
import { createStageHud, chip, type StageHud } from '../common';
import { COST, MAX_PETS, NUM_TRIBES, relationFace, type ToolId, type Tribe } from './types';
import type { TribalStage } from './stage';
import { TOOL_ORDER, TOOLS, INSTRUMENTS, unlockLevel } from './tools';
import { castAbility, type ActiveAbility } from './abilities';

const CSS = `
.tb-hud { --wood: linear-gradient(180deg, rgba(118,76,38,.94), rgba(64,39,18,.96)); }
.tb-cmd { position:absolute; left:0; right:0; bottom:0; display:flex; gap:6px; justify-content:center; padding:10px calc(8px + var(--safe-r)) calc(8px + var(--safe-b)) calc(8px + var(--safe-l)); pointer-events:none; background:linear-gradient(180deg, transparent, rgba(24,14,4,.55) 45%); }
.tb-cmd > * { pointer-events:auto; }
.tb-btn { position:relative; flex:1 1 0; max-width:86px; min-width:54px; height:62px; padding:0; border-radius:16px; border:1px solid rgba(255,226,180,.28); background:var(--wood); color:#fff4de; font:600 11px/1.1 var(--font); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; box-shadow:0 3px 0 rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.18); cursor:pointer; touch-action:manipulation; }
.tb-btn .i { font-size:24px; line-height:1; }
.tb-btn .c { position:absolute; top:3px; right:5px; font-size:10px; font-weight:700; color:#ffd166; }
.tb-btn:active { transform:translateY(2px) scale(.97); box-shadow:0 1px 0 rgba(0,0,0,.35); }
.tb-btn.off { opacity:.5; }
.tb-btn.social { background:linear-gradient(180deg, #33a86a, #1c6b41); }
.tb-btn.attack { background:linear-gradient(180deg, #d24c3f, #87251d); }
.tb-ctx { position:absolute; left:calc(8px + var(--safe-l)); right:calc(8px + var(--safe-r)); bottom:calc(82px + var(--safe-b)); display:flex; gap:6px; align-items:center; pointer-events:none; }
.tb-ctx > * { pointer-events:auto; }
.tb-sq { flex:0 0 auto; width:52px; height:48px; border-radius:14px; border:1px solid rgba(255,226,180,.25); background:rgba(36,22,8,.82); color:#fff4de; font:600 10px/1 var(--font); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; cursor:pointer; padding:0; touch-action:manipulation; }
.tb-sq .i { font-size:18px; }
.tb-sq:active { transform:scale(.95); }
.tb-sum { flex:1; min-width:0; height:48px; border-radius:14px; background:rgba(24,14,4,.66); border:1px solid rgba(255,226,180,.18); display:flex; align-items:center; gap:6px; padding:0 10px; font-size:13px; font-weight:600; color:#fff4de; overflow:hidden; white-space:nowrap; }
.tb-sum span.t { overflow:hidden; text-overflow:ellipsis; }
.tb-sum.dim { color:rgba(255,244,222,.7); font-weight:500; }
.tb-go { flex:1; min-width:0; height:48px; border-radius:14px; border:0; font:700 15px var(--font); color:#062514; background:linear-gradient(180deg,#7df0a8,#25b866); box-shadow:0 4px 16px rgba(60,220,130,.4); cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:0 10px; }
.tb-go.gold { color:#3a2400; background:linear-gradient(180deg,#ffe08a,#f2b532); box-shadow:0 4px 18px rgba(255,200,60,.5); }
.tb-badges { position:absolute; right:calc(8px + var(--safe-r)); top:calc(150px + var(--safe-t)); display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.tb-badges > * { pointer-events:auto; }
.tb-badge { position:relative; width:46px; height:46px; border-radius:50%; border:3px solid #fff; background:rgba(24,14,4,.78); font-size:21px; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; box-shadow:0 2px 8px rgba(0,0,0,.4); touch-action:manipulation; }
.tb-badge:active { transform:scale(.93); }
.tb-badge .m { position:absolute; left:50%; bottom:-5px; transform:translateX(-50%); width:34px; height:6px; border-radius:3px; background:rgba(0,0,0,.65); overflow:hidden; }
.tb-badge .m i { display:block; height:100%; width:0; background:#ff8fc8; transition:width .3s; }
.tb-badge.raid { animation:tbRaid .7s ease-in-out infinite; }
@keyframes tbRaid { 50% { box-shadow:0 0 0 6px rgba(255,80,60,.55); } }
.tb-abil { position:absolute; right:calc(12px + var(--safe-r)); bottom:calc(150px + var(--safe-b)); display:flex; flex-direction:column; gap:24px; }
.tb-panel { position:absolute; left:calc(8px + var(--safe-l)); right:calc(8px + var(--safe-r)); bottom:calc(82px + var(--safe-b)); max-height:min(56vh, 420px); overflow-y:auto; background:rgba(30,19,8,.94); border:1px solid rgba(255,220,170,.28); border-radius:18px; padding:12px; color:#fff4de; box-shadow:0 10px 30px rgba(0,0,0,.5); animation:tbUp .18s ease-out; }
@keyframes tbUp { from { transform:translateY(12px); opacity:0; } }
.tb-panel h3 { font-size:17px; display:flex; align-items:center; gap:8px; margin:0 0 6px; }
.tb-panel .x { margin-left:auto; }
.tb-panel .rowb { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
.tb-panel .rowb .btn { flex:1; min-height:46px; }
.tb-panel .ln { font-size:13px; color:rgba(255,244,222,.8); margin:4px 0; display:flex; align-items:center; gap:8px; }
.tb-panel .ln .bar { flex:1; min-width:0; height:14px; }
.tb-adm .bar-fill, .tb-panel .adm .bar-fill { background:linear-gradient(90deg,#d64f9a,#ff8fc8); }
.tb-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
.tb-tile { min-height:66px; border-radius:12px; border:1px solid rgba(255,226,180,.22); background:rgba(255,255,255,.06); color:#fff4de; font:600 12px/1.15 var(--font); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer; padding:4px; text-align:center; }
.tb-tile .i { font-size:22px; }
.tb-tile .s { font-size:10px; color:#ffd166; font-weight:700; }
.tb-tile.lock { opacity:.45; }
.tb-tile.have { border-color:#7bd389; background:rgba(123,211,137,.15); }
.tb-tile.have .s { color:#7bd389; }
.tb-tile:active { transform:scale(.96); }
.tb-list { display:flex; flex-direction:column; gap:6px; }
.tb-li { display:flex; align-items:center; gap:10px; min-height:52px; border-radius:12px; border:1px solid rgba(255,226,180,.2); background:rgba(255,255,255,.06); color:#fff4de; font:600 14px var(--font); padding:6px 10px; cursor:pointer; text-align:left; }
.tb-li .f { font-size:24px; }
.tb-li .sub { font-size:11px; color:rgba(255,244,222,.65); font-weight:500; }
.tb-li .dot { width:12px; height:12px; border-radius:50%; flex:0 0 auto; }
.tb-li:disabled { opacity:.45; }
.tb-target { position:absolute; left:calc(8px + var(--safe-l)); right:calc(84px + var(--safe-r)); bottom:calc(140px + var(--safe-b)); display:flex; gap:8px; align-items:center; justify-content:space-between; background:rgba(120,20,10,.9); border:1px solid rgba(255,160,120,.6); color:#fff; border-radius:16px; padding:6px 6px 6px 14px; font-weight:600; font-size:14px; animation:tbUp .2s ease-out; }
.tb-debug { position:absolute; left:calc(8px + var(--safe-l)); top:calc(150px + var(--safe-t)); display:flex; flex-direction:column; gap:6px; }
.tb-debug button { min-width:60px; min-height:44px; border-radius:12px; border:1px dashed rgba(255,255,255,.45); background:rgba(60,0,80,.7); color:#fff; font:600 12px var(--font); cursor:pointer; }
.chip.tb-food.flash { animation:tbFlash .5s ease 2; }
@keyframes tbFlash { 50% { background:rgba(220,50,40,.85); } }
.tb-concert { position:absolute; left:calc(8px + var(--safe-l)); right:calc(8px + var(--safe-r)); bottom:calc(8px + var(--safe-b)); color:#fff4de; display:flex; flex-direction:column; gap:8px; animation:tbUp .25s ease-out; pointer-events:none; }
.tb-concert > * { pointer-events:auto; }
.tb-c-card { padding:10px 12px; border-radius:20px; background:rgba(30,18,8,.88); border:1px solid rgba(255,220,170,.3); display:flex; flex-direction:column; gap:8px; }
.tb-c-head { display:flex; align-items:center; gap:8px; }
.tb-c-title { flex:1; font-weight:700; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tb-c-meter { display:flex; align-items:center; gap:8px; }
.tb-c-meter .bar { flex:1; height:20px; min-width:0; }
.tb-c-face { font-size:26px; }
.tb-c-combo { min-width:34px; font-weight:700; color:#ffd166; text-align:right; }
.tb-c-sub { font-size:11px; color:rgba(255,244,222,.65); text-align:center; }
.tb-c-lane { height:112px; pointer-events:none !important; }
.tb-c-btns { display:flex; gap:10px; justify-content:center; }
.tb-c-btn { position:relative; width:86px; height:86px; border-radius:50%; border:4px solid var(--c); background:radial-gradient(circle at 35% 30%, rgba(255,255,255,.3), rgba(40,24,10,.95)); color:#fff; cursor:pointer; padding:0; display:flex; flex-direction:column; align-items:center; justify-content:center; touch-action:none; box-shadow:0 4px 0 rgba(0,0,0,.4); }
.tb-c-btn .i { font-size:34px; line-height:1; }
.tb-c-btn .l { font-size:11px; font-weight:700; }
.tb-c-btn .n { position:absolute; top:-4px; right:-4px; background:var(--c); color:#2b1a0e; border-radius:10px; padding:1px 6px; font-size:11px; font-weight:700; }
.tb-c-btn .k { position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); font-size:9px; opacity:.5; }
.tb-c-btn.hit { transform:scale(.9); box-shadow:0 0 0 8px rgba(255,255,255,.25); }
.tb-c-result { text-align:center; font-weight:700; font-size:17px; padding:6px; border-radius:12px; animation:tbUp .25s ease-out; }
.tb-c-result.win { background:rgba(60,200,110,.3); }
.tb-c-result.lose { background:rgba(255,140,90,.2); }
@media (min-width: 700px) { .tb-panel, .tb-concert { left:50%; right:auto; width:520px; transform:translateX(-50%); } }
`;

function injectCss() {
  if (document.getElementById('tb-css')) return;
  const s = document.createElement('style');
  s.id = 'tb-css';
  s.textContent = CSS;
  document.head.append(s);
}

function wbtn(icon: string, label: string, onClick: () => void, cls = 'tb-btn', cost?: string): HTMLButtonElement {
  const b = h('button', { class: cls, 'aria-label': label, title: label }, h('div', { class: 'i' }, icon), h('div', null, label), cost ? h('div', { class: 'c' }, cost) : null);
  b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); onClick(); });
  return b;
}

export class TribalHud {
  root: HTMLElement;
  private st: TribalStage;
  private base: StageHud;
  private food: ReturnType<typeof chip>;
  private popc: ReturnType<typeof chip>;
  private badges: { el: HTMLElement; meter: HTMLElement; t: Tribe | null; key: string }[] = [];
  private cmd: HTMLElement;
  private stanceBtn: HTMLButtonElement;
  private buyBtn: HTMLButtonElement;
  private buildBtn: HTMLButtonElement;
  private giftBtn: HTMLButtonElement;
  private ctx: HTMLElement;
  private sum: HTMLElement;
  private go: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private abilWrap: HTMLElement;
  private abil: { a: ActiveAbility; b: ReturnType<typeof abilityButton> }[] = [];
  private panel: HTMLElement | null = null;
  private panelKind = '';
  private panelRefresh: (() => void) | null = null;
  private target: HTMLElement;
  private concertMode = false;
  private cache = new Map<string, string>();
  private goAction: (() => void) | null = null;

  constructor(st: TribalStage) {
    injectCss();
    this.st = st;
    const game = st.game;
    this.base = createStageHud(game, 'tribal', { onPause: () => { st.paused = true; }, onResume: () => { st.paused = false; } });
    this.root = this.base.root;
    this.root.classList.add('tb-hud');
    this.food = chip('🍎', '0');
    this.food.el.classList.add('tb-food');
    this.popc = chip('👥', '0');
    this.base.right.append(this.food.el, this.popc.el);
    this.base.progress.marks([0.25, 0.5, 0.75]);
    // badges
    const bw = h('div', { class: 'tb-badges' });
    const homeB = h('button', { class: 'tb-badge', style: 'border-color:#3ee6c4', 'aria-label': 'Home village', title: 'Home village' }, '🏠');
    homeB.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('tap'); st.focus(st.home.x, st.home.y + 40); this.showHome(); });
    bw.append(homeB);
    this.badges.push({ el: homeB, meter: h('div'), t: null, key: '' });
    for (const t of st.tribes) {
      const m = h('div', { class: 'm' }, h('i'));
      const b = h('button', { class: 'tb-badge', style: `border-color:${t.color}`, 'aria-label': t.name, title: t.name }, relationFace(t).icon, m);
      b.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('tap'); st.focus(t.x, t.y + 60); this.showTribe(t); });
      bw.append(b);
      this.badges.push({ el: b, meter: m.firstElementChild as HTMLElement, t, key: '' });
    }
    // command bar
    this.stanceBtn = wbtn('🤝', 'Social', () => st.setStance(st.stance === 'social' ? 'attack' : 'social'), 'tb-btn social');
    this.buyBtn = wbtn('🥚', 'Member', () => st.buyMember(), 'tb-btn', String(COST.member));
    this.buildBtn = wbtn('🛖', 'Tool hut', () => this.togglePanel('build', () => this.showBuild()), 'tb-btn', String(COST.hut));
    this.giftBtn = wbtn('🎁', 'Gift', () => this.togglePanel('gift', () => this.showGift()), 'tb-btn', String(COST.gift));
    const outfitBtn = wbtn('👕', 'Outfit', () => { this.closePanel(); st.outfitter(false); });
    this.cmd = h('div', { class: 'tb-cmd' }, this.stanceBtn, this.buyBtn, this.buildBtn, this.giftBtn, outfitBtn);
    // context row
    const allBtn = h('button', { class: 'tb-sq', 'aria-label': 'Select all' }, h('div', { class: 'i' }, '👥'), 'All');
    allBtn.addEventListener('click', (e) => { e.stopPropagation(); this.closePanel(); st.selectAll(); });
    const idleBtn = h('button', { class: 'tb-sq', 'aria-label': 'Select idle' }, h('div', { class: 'i' }, '💤'), 'Idle');
    idleBtn.addEventListener('click', (e) => { e.stopPropagation(); this.closePanel(); st.selectIdle(); });
    this.sum = h('div', { class: 'tb-sum dim' }, h('span', { class: 't' }, ''));
    this.go = h('button', { class: 'tb-go', style: 'display:none' }) as HTMLButtonElement;
    this.go.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); this.goAction?.(); });
    this.clearBtn = h('button', { class: 'tb-sq', 'aria-label': 'Deselect' }, h('div', { class: 'i' }, '✖️'), 'Clear');
    this.clearBtn.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('tap'); st.selectOnly(null); this.closePanel(); });
    this.ctx = h('div', { class: 'tb-ctx' }, allBtn, idleBtn, this.sum, this.go, this.clearBtn);
    // abilities
    this.abilWrap = h('div', { class: 'tb-abil' });
    for (const a of st.abilities) {
      const b = abilityButton(a.def.icon, a.def.name, () => castAbility(st, a), 'special');
      b.el.title = `${a.def.name}: ${a.def.desc}`;
      this.abilWrap.append(b.el);
      this.abil.push({ a, b });
    }
    // target mode banner
    this.target = h('div', { class: 'tb-target', style: 'display:none' }, h('span', null, '💣 Tap where to throw the fire bombs'),
      (() => { const c = h('button', { class: 'btn icon small', 'aria-label': 'Cancel' }, '✕'); c.addEventListener('click', (e) => { e.stopPropagation(); st.targetMode = null; this.refresh(true); }); return c; })());
    this.root.append(bw, this.abilWrap, this.ctx, this.cmd, this.target);
    if (game.debug) {
      const dbg = h('div', { class: 'tb-debug' });
      const add = (label: string, fn: () => void) => { const b = h('button', null, label); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); dbg.append(b); };
      add('+100🍎', () => st.debugFood(100));
      add('🤝 Ally', () => st.debugResolve('ally'));
      add('🔥 Defeat', () => st.debugResolve('defeat'));
      add('🏆 Win', () => st.debugWin());
      this.root.append(dbg);
    }
    this.refresh(true);
  }

  destroy() { this.panel?.remove(); }
  layout() { /* CSS handles layout */ }

  private set(key: string, val: string, apply: () => void) {
    if (this.cache.get(key) === val) return;
    this.cache.set(key, val);
    apply();
  }

  flashFood() {
    this.food.el.classList.remove('flash');
    void this.food.el.offsetWidth;
    this.food.el.classList.add('flash');
  }

  setConcertMode(on: boolean) {
    this.concertMode = on;
    if (on) this.closePanel();
    for (const el of [this.cmd, this.ctx, this.abilWrap]) el.style.display = on ? 'none' : '';
    this.refresh(true);
  }

  refresh(force: boolean) {
    const st = this.st;
    if (force) this.cache.clear();
    this.set('food', String(Math.floor(st.food)), () => this.food.set(Math.floor(st.food)));
    const pop = `${st.pop()}/${st.popCap}`;
    this.set('pop', pop, () => this.popc.set(pop));
    const res = st.resolved;
    this.set('prog', String(res), () => this.base.progress.set(res / NUM_TRIBES, `🗿 Totem ${res}/${NUM_TRIBES}`));
    const obj = st.objective();
    this.set('obj', obj, () => this.base.setObjective(obj));
    // badges
    const raiding = new Set<number>();
    for (const u of st.units) if (u.raid && !u.dead) raiding.add(u.team);
    for (const b of this.badges) {
      if (!b.t) continue;
      const f = relationFace(b.t);
      const key = f.icon + Math.round(b.t.admiration / 5) + (raiding.has(b.t.id) ? 'r' : '');
      if (b.key !== key) {
        b.key = key;
        b.el.firstChild!.textContent = f.icon;
        b.meter.style.width = b.t.state === 'active' ? `${b.t.admiration}%` : '0%';
        b.el.classList.toggle('raid', raiding.has(b.t.id));
        b.el.style.opacity = b.t.state === 'defeated' ? '0.6' : '1';
      }
    }
    // command bar
    this.set('stance', st.stance, () => {
      const soc = st.stance === 'social';
      this.stanceBtn.className = 'tb-btn ' + (soc ? 'social' : 'attack');
      this.stanceBtn.children[0].textContent = soc ? '🤝' : '⚔️';
      this.stanceBtn.children[1].textContent = soc ? 'Social' : 'Attack';
    });
    this.set('buy', String(st.food >= COST.member && st.pop() < st.popCap), () => this.buyBtn.classList.toggle('off', !(st.food >= COST.member && st.pop() < st.popCap)));
    this.set('build', String(st.food >= COST.hut), () => this.buildBtn.classList.toggle('off', st.food < COST.hut));
    this.set('gift', String(st.food >= COST.gift), () => this.giftBtn.classList.toggle('off', st.food < COST.gift));
    // abilities
    for (const { a, b } of this.abil) {
      const frac = a.def.cooldown ? a.cd / a.def.cooldown : 0;
      this.set('ab' + a.def.id, frac.toFixed(2) + (st.targetMode === a.def.id ? 't' : ''), () => {
        b.setCooldown(frac);
        b.el.style.boxShadow = st.targetMode === a.def.id ? '0 0 0 4px #ff5a4f' : '';
      });
    }
    this.set('target', String(!!st.targetMode), () => { this.target.style.display = st.targetMode ? '' : 'none'; });
    // context row: found city > start concert > selection summary
    let goLabel = '', goCls = 'tb-go', go: (() => void) | null = null;
    if (st.resolved >= NUM_TRIBES && !st.finished) { goLabel = '🏙️ Found a city'; goCls = 'tb-go gold pulse'; go = () => st.foundCity(); }
    else if (!st.concert) {
      const ready = st.tribes.find((t) => t.state === 'active' && st.bandAt(t).some((u) => u.tool && INSTRUMENTS.includes(u.tool)));
      if (ready) { goLabel = `🎶 Start concert · ${ready.name}`; go = () => st.startConcert(ready); }
    }
    this.goAction = go;
    this.set('go', goLabel + goCls, () => {
      this.go.textContent = goLabel;
      this.go.className = goCls;
      this.go.style.display = goLabel ? '' : 'none';
      this.sum.style.display = goLabel ? 'none' : '';
    });
    const sel = st.selected();
    let text: string;
    if (st.targetMode) text = 'Choose a target on the map';
    else if (!sel.length) text = st.time < 40 ? 'Tap a tribe member to select' : 'Tap members, or All / Idle';
    else {
      const tools = new Map<string, number>();
      let hp = 0, mhp = 0;
      for (const u of sel) {
        const k = u.chief ? '🪶' : u.tool ? TOOLS[u.tool].icon : '✋';
        tools.set(k, (tools.get(k) ?? 0) + 1);
        hp += u.hp; mhp += u.maxHp;
      }
      text = `${sel.length} selected · ${[...tools].map(([k, n]) => k + n).join(' ')} · ❤️${Math.round((hp / mhp) * 100)}%`;
    }
    this.set('sum', text + sel.length, () => {
      (this.sum.firstChild as HTMLElement).textContent = text;
      this.sum.classList.toggle('dim', !sel.length);
      this.clearBtn.style.opacity = sel.length ? '1' : '0.45';
    });
    if (this.panel && this.panelRefresh) this.panelRefresh();
  }

  // ------------------------------------------------------------------ panels
  closePanel() {
    this.panel?.remove();
    this.panel = null;
    this.panelKind = '';
    this.panelRefresh = null;
    this.abilWrap.style.visibility = '';
  }

  private togglePanel(kind: string, open: () => void) {
    if (this.panelKind === kind) { this.closePanel(); return; }
    open();
  }

  private openPanel(kind: string, ...children: (HTMLElement | null)[]): HTMLElement {
    this.closePanel();
    if (this.concertMode) return h('div');
    const close = h('button', { class: 'btn icon small x', 'aria-label': 'Close' }, '✕');
    close.addEventListener('click', (e) => { e.stopPropagation(); audio.sfx('tap'); this.closePanel(); });
    const p = h('div', { class: 'tb-panel' }, ...children);
    const head = p.querySelector('h3');
    if (head) head.append(close); else p.prepend(close);
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.append(p);
    this.panel = p;
    this.panelKind = kind;
    this.abilWrap.style.visibility = 'hidden';
    return p;
  }

  showTribe(t: Tribe) {
    const st = this.st;
    const face = h('span', null, '');
    const state = h('span', { class: 'ln' });
    const adm = h('div', { class: 'bar adm' }, h('div', { class: 'bar-fill' }), h('div', { class: 'bar-text' }));
    const hut = h('div', { class: 'bar hp' }, h('div', { class: 'bar-fill' }), h('div', { class: 'bar-text' }));
    const info = h('div', { class: 'ln' });
    const btnRow = h('div', { class: 'rowb' });
    const gift = h('button', { class: 'btn' }, `🎁 Gift · ${COST.gift} 🍎`);
    gift.addEventListener('click', (e) => { e.stopPropagation(); st.sendGift(t); });
    const play = h('button', { class: 'btn primary' }, '🎶 Start concert');
    play.addEventListener('click', (e) => { e.stopPropagation(); st.startConcert(t); });
    btnRow.append(gift, play);
    const tip = h('div', { class: 'ln', style: 'font-size:12px;opacity:.75' });
    this.openPanel('tribe:' + t.id,
      h('h3', null, h('span', { style: `width:14px;height:14px;border-radius:50%;background:${t.color};display:inline-block` }), t.name, face),
      state, h('div', { class: 'ln' }, '💗', adm), h('div', { class: 'ln' }, '🛖', hut), info, tip, btnRow);
    this.panelRefresh = () => {
      const f = relationFace(t);
      face.textContent = f.icon;
      state.textContent = t.state === 'active' ? `${f.label} · ${t.design.name} folk` : t.state === 'allied' ? 'Allied with you. They send food gifts.' : 'Their village lies in ashes.';
      state.style.color = f.color;
      (adm.firstChild as HTMLElement).style.width = `${t.admiration}%`;
      (adm.lastChild as HTMLElement).textContent = `Admiration ${Math.round(t.admiration)}%`;
      (hut.firstChild as HTMLElement).style.width = `${Math.max(0, t.hutHp / t.hutMax) * 100}%`;
      (hut.lastChild as HTMLElement).textContent = `Hut ${Math.max(0, Math.round(t.hutHp))}/${t.hutMax}`;
      const m = st.tribeMembers(t).length;
      info.textContent = t.state === 'active' ? `👥 ${m} members · 🍎 ${Math.floor(t.food)} food${t.weapon ? ' · warriors carry ' + TOOLS[t.weapon].icon : ''}` : '';
      const band = st.bandAt(t);
      const ready = band.some((u) => u.tool && INSTRUMENTS.includes(u.tool));
      tip.textContent = t.state !== 'active' ? '' : t.relation <= -15
        ? 'They won\'t listen to music yet: send gifts until they are neutral, or attack in ⚔️ stance.'
        : ready ? `Your band is here (${band.length}). Start the concert!` : 'Select members with instruments, 🎶 stance, then tap their hut.';
      btnRow.style.display = t.state === 'active' ? '' : 'none';
      play.style.display = ready && !st.concert ? '' : 'none';
      gift.toggleAttribute('disabled', st.food < COST.gift);
    };
    this.panelRefresh();
  }

  showToolHut(slot: number) {
    const st = this.st;
    const th = st.toolHuts[slot];
    if (!th) return;
    const def = TOOLS[th.tool];
    const count = h('div', { class: 'ln' });
    const tear = h('button', { class: 'btn danger' }, '🔨 Tear down · +10 🍎');
    tear.addEventListener('click', (e) => { e.stopPropagation(); st.demolishToolHut(slot); this.closePanel(); });
    this.openPanel('tool:' + slot, h('h3', null, def.icon, `${def.name} hut`), h('div', { class: 'ln' }, def.desc), count,
      h('div', { class: 'ln', style: 'font-size:12px;opacity:.75' }, st.selected().length ? '' : 'Select members, then tap this hut to equip them.'),
      h('div', { class: 'rowb' }, tear));
    this.panelRefresh = () => {
      const n = st.members().filter((u) => u.tool === th.tool).length;
      count.textContent = `${n} member${n === 1 ? '' : 's'} carry a ${def.name.toLowerCase()}.`;
    };
    this.panelRefresh();
  }

  showBuild() {
    const st = this.st;
    const grid = h('div', { class: 'tb-grid' });
    const head = h('div', { class: 'ln' });
    const tiles: { tool: ToolId; el: HTMLElement; s: HTMLElement }[] = [];
    for (const tool of TOOL_ORDER) {
      const def = TOOLS[tool];
      const s = h('div', { class: 's' });
      const el = h('button', { class: 'tb-tile', title: def.desc }, h('div', { class: 'i' }, def.icon), h('div', null, def.name), s);
      el.addEventListener('click', (e) => { e.stopPropagation(); if (st.buildToolHut(tool)) this.closePanel(); });
      grid.append(el);
      tiles.push({ tool, el, s });
    }
    this.openPanel('build', h('h3', null, '🛖 Build a tool hut'), head, grid,
      h('div', { class: 'ln', style: 'font-size:12px;opacity:.75' }, '🎶 Instruments win tribes over · ⚔️ weapons defeat them · 🎣🧺 gather faster · 🌿 heal'));
    this.panelRefresh = () => {
      const used = st.toolHuts.filter(Boolean).length;
      head.textContent = `${used}/6 slots used · each hut costs ${COST.hut} 🍎`;
      const un = st.unlockedTools();
      for (const t of tiles) {
        const have = st.toolHuts.some((x) => x?.tool === t.tool);
        const lock = !un.includes(t.tool);
        t.el.className = 'tb-tile' + (have ? ' have' : lock ? ' lock' : '');
        const lv = unlockLevel(st.diet, t.tool);
        t.s.textContent = have ? '✓ Built' : lock ? `🔒 ${lv} tribe${lv === 1 ? '' : 's'}` : `${COST.hut} 🍎`;
      }
    };
    this.panelRefresh();
  }

  showGift() {
    const st = this.st;
    const list = h('div', { class: 'tb-list' });
    const rows: { t: Tribe; el: HTMLButtonElement; f: HTMLElement; sub: HTMLElement }[] = [];
    for (const t of st.tribes) {
      const f = h('span', { class: 'f' });
      const sub = h('div', { class: 'sub' });
      const el = h('button', { class: 'tb-li' }, h('span', { class: 'dot', style: `background:${t.color}` }), f, h('div', { style: 'flex:1;min-width:0' }, h('div', null, t.name), sub), h('span', { style: 'color:#ffd166;font-size:12px' }, `🎁 ${COST.gift}`)) as HTMLButtonElement;
      el.addEventListener('click', (e) => { e.stopPropagation(); st.sendGift(t); });
      list.append(el);
      rows.push({ t, el, f, sub });
    }
    this.openPanel('gift', h('h3', null, '🎁 Send a gift'), h('div', { class: 'ln' }, 'Gifts raise relations and admiration. Wary tribes must be won back before they will hear your music.'), list);
    this.panelRefresh = () => {
      for (const r of rows) {
        const f = relationFace(r.t);
        r.f.textContent = f.icon;
        r.sub.textContent = r.t.state === 'active' ? `${f.label} · admiration ${Math.round(r.t.admiration)}%` : f.label;
        r.el.disabled = r.t.state !== 'active' || st.food < COST.gift;
      }
    };
    this.panelRefresh();
  }

  showHome() {
    const st = this.st;
    const info = h('div', { class: 'ln' });
    const pets = h('div', { class: 'ln' });
    const bonus = h('div', { class: 'ln' });
    const buy = h('button', { class: 'btn primary' }, `🥚 New member · ${COST.member} 🍎`);
    buy.addEventListener('click', (e) => { e.stopPropagation(); st.buyMember(); });
    const outfit = h('button', { class: 'btn' }, '👕 Outfitter');
    outfit.addEventListener('click', (e) => { e.stopPropagation(); this.closePanel(); st.outfitter(false); });
    this.openPanel('home', h('h3', null, '🏠', st.homeName), info, pets, bonus, h('div', { class: 'rowb' }, buy, outfit));
    this.panelRefresh = () => {
      info.textContent = `👥 ${st.pop()}/${st.popCap} members · 🗿 ${st.resolved}/${NUM_TRIBES} tribes · 🍎 ${Math.floor(st.food)}`;
      pets.textContent = `🐾 ${st.pets().length}/${MAX_PETS} pets · 🥚 ${Math.floor(st.eggNode.amount)} eggs in the basket`;
      const b = st.bonus;
      bonus.textContent = `Outfit: 🧺 Gather ${b.gather} · ⚔️ Combat ${b.combat} · 🎶 Social ${b.social} · ❤️ Health ${b.health}`;
      buy.toggleAttribute('disabled', st.food < COST.member || st.pop() >= st.popCap);
    };
    this.panelRefresh();
  }
}
