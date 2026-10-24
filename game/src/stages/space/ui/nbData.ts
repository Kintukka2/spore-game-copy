// Nav-Boy DATA: where you are and what you are doing. Local Map (this system), World Map (the galaxy), Quests
// (missions and alerts; pick one to track it on the HUD), Contacts (the empires you have met), Notes (your
// species' history), Radio (stations that change the music, plus the exchange's news wire) and Market (spice
// prices at a glance, with the trading floor a key away).
import { h } from '../../../engine/ui';
import { audio, type Mood } from '../../../engine/audio';
import { TAU } from '../../../engine/math';
import { SPICE, SPICE_COLORS, STAR_INFO, type SpiceColor } from '../data';
import { archName, relation, stanceInfo } from '../empires';
import { abandon } from '../missions';
import { EVENT_INFO } from '../events';
import { change, CODE, contractPrice, gsi, nextIn } from '../market';
import type { Mission } from '../types';
import { fmtTime, money } from './common';
import { previewSalvage } from '../salvage';
import { picCanvas, picDesign, type NbAct, type NbCtx, type NbCustom, type NbDetail, type NbRow, type NbTab } from './navboy';
import { ph } from './phosphor';

type Row = NbRow & { d: () => NbDetail };

/** Radio stations: each plays one of the game's generative music moods. */
export const STATIONS: { id: string; name: string; freq: string; mood: Mood; genre: string; desc: string }[] = [
  { id: 'deep', name: 'Deep Space Ambient', freq: '88.1', mood: 'space', genre: 'Ambient', desc: 'Slow chords for long jumps. The station most captains leave on.' },
  { id: 'wire', name: 'Exchange Wire', freq: '91.7', mood: 'menu', genre: 'News', desc: 'Spice prices and breaking headlines from the Galactic Spice Exchange, over soft lounge music.' },
  { id: 'soup', name: 'Primordial Soup FM', freq: '95.3', mood: 'cell', genre: 'Bubbles', desc: 'Music for single cells. Your ancestors loved it.' },
  { id: 'wild', name: 'Wild Frontier Radio', freq: '99.9', mood: 'creature', genre: 'Folk', desc: 'Plucked strings from the age of claws and teeth.' },
  { id: 'drum', name: 'Drum Circle 104', freq: '104.0', mood: 'tribal', genre: 'Percussion', desc: 'Fire, drums and chanting, broadcast from a very old village.' },
  { id: 'civic', name: 'Civic Broadcast', freq: '106.5', mood: 'civ', genre: 'Anthems', desc: 'Marching bands and city fanfares from the planet you left behind.' },
  { id: 'hall', name: 'Victory Hall', freq: '108.2', mood: 'victory', genre: 'Fanfare', desc: 'Triumphant brass for captains who have earned it.' },
  { id: 'off', name: 'Radio off', freq: '—', mood: 'none', genre: 'Silence', desc: 'Just the hum of the engines.' },
];
export const stationMood = (id?: string): Mood => STATIONS.find((s) => s.id === id)?.mood ?? 'space';

/** In-game date: one game second is a minute, a stardate ticks over each day. */
export function stardate(t: number) {
  const mins = Math.floor(t);
  return { sd: (2311 + Math.floor(mins / 1440) / 1000).toFixed(3), clock: `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` };
}

export function dataTab(ctx: NbCtx): NbTab {
  const st = ctx.st, w = st.w;
  const page = (id: string, label: string, rows: () => Row[], empty?: string, badge?: () => number) => {
    let cache: Row[] = [];
    return { id, label, empty, badge, rows: () => (cache = rows()), detail: (_r: NbRow, i: number) => cache[i]?.d() ?? {} };
  };

  // ---------------------------------------------------------------- Local Map
  const local = { id: 'local', label: 'Local Map', custom: (host: HTMLElement): NbCustom => localMap(host, ctx) };
  const world = { id: 'world', label: 'World Map', custom: (host: HTMLElement): NbCustom => worldMap(host, ctx) };

  // ---------------------------------------------------------------- Quests
  const giverName = (m: Mission) => (m.giver === 'home' ? 'Homeworld' : m.giver === 'exchange' ? 'Spice Exchange' : w.emap.get(m.giver)?.name ?? 'Unknown');
  const quests = page('quests', 'Quests', () => {
    const rows: Row[] = [];
    const tracked = trackedMission(w);
    const ms = [...w.s.missions].sort((a, b) => Number(!!b.main) - Number(!!a.main));
    if (ms.length) rows.push({ name: 'MISSIONS', head: true, d: () => ({}) });
    for (const m of ms) {
      rows.push({
        icon: m.main ? '⭐' : '📜', name: m.title, mark: m === tracked, val: m.deadline ? fmtTime(m.deadline - w.s.t) : undefined,
        d: () => {
          const acts: NbAct[] = [
            { key: 'E', label: m === trackedMission(w) ? 'Tracked' : 'Track', off: m === trackedMission(w) ? 'Already shown on your HUD.' : undefined, run: () => { w.s.tracked = m.id; audio.sfx('tap'); ctx.note(`Tracking: ${m.title}`); } },
          ];
          if (m.star !== undefined) acts.push({ key: 'L', label: 'Locate', run: () => { ctx.close(); st.showMissionTarget(m); } });
          if (!m.main) acts.push({ key: 'X', label: 'Abandon', ask: `Abandon "${m.title}"? ${m.giver === 'home' || m.giver === 'exchange' ? 'The job is gone.' : `${giverName(m)} will be disappointed.`}`, run: () => { abandon(w, m); audio.sfx('remove'); } });
          return {
            big: m.main ? '⭐' : '📜',
            title: m.title,
            boxes: [['FROM', giverName(m)], ['REWARD', m.reward ? money(m.reward) : '—'], ['TIME', m.deadline ? fmtTime(m.deadline - w.s.t) : '∞']],
            wide: m.bonus ? [['BONUS', previewSalvage(m.bonus).map((b) => `${b.icon} ${b.text}`).join(', ')]] : undefined,
            lines: m.star !== undefined ? [['Where', `${w.star(m.star).name}${m.planet !== undefined ? ` · ${w.planet(m.star, m.planet).name}` : ''}`]] : undefined,
            desc: m.desc,
            acts,
          };
        },
      });
    }
    if (w.s.events.length) rows.push({ name: 'ALERTS', head: true, d: () => ({}) });
    for (const ev of w.s.events) {
      const pl = w.planet(ev.star, ev.planet), info = EVENT_INFO[ev.kind];
      rows.push({
        icon: info.icon, name: `${info.label}: ${pl.name}`, val: fmtTime(ev.until - w.s.t),
        d: () => ({
          big: info.icon,
          title: `${info.label}: ${pl.name}`,
          boxes: [['KIND', info.good ? 'Opportunity' : 'Threat'], ['SYSTEM', w.star(ev.star).name], ['TIME', fmtTime(ev.until - w.s.t)]],
          desc: info.how,
          acts: [{ key: 'E', label: 'Go there', run: () => { ctx.close(); st.gotoEvent(ev); } }],
        }),
      });
    }
    return rows;
  }, 'No missions. Hail an empire and ask for work, take a job from the Spice Exchange, or simply explore.', () => w.s.missions.length + w.s.events.length);

  // ---------------------------------------------------------------- Contacts
  const contacts = page('contacts', 'Contacts', () => {
    const met = w.empires.filter((e) => e.met && !e.dead).sort((a, b) => relation(b) - relation(a));
    return met.map((e) => {
      const s = stanceInfo(e);
      return {
        icon: e.arch === 'hollow' ? '👁️' : e.allied ? '🤝' : e.war ? '🔥' : '👽', name: e.name, val: s.label,
        d: () => ({
          pic: (el: HTMLElement) => picDesign(el, e.creature),
          title: `${e.name} · ${e.species}`,
          boxes: [['REL', String(Math.round(relation(e)))], ['SYSTEMS', String(w.countStars(e.id))], ['ROUTE', e.route !== null ? 'Open' : '—']],
          bars: [['FEELING', (relation(e) + 100) / 200, s.label]],
          lines: [['Archetype', archName(e)], ...[...e.mods].filter((m) => Math.round(m.v) !== 0).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 4).map((m) => [m.label, `${m.v > 0 ? '+' : ''}${Math.round(m.v)}`, m.v > 0] as [string, string, boolean])],
          desc: e.arch === 'hollow' ? 'The grey machines at the edge of everything. They do not trade, and they do not forget.' : `${e.name} hold ${w.countStars(e.id)} systems. ${e.allied ? 'Your allies.' : e.war ? 'You are at war.' : 'Hail them to trade, ask for work, or talk.'}`,
          acts: [
            { key: 'E', label: 'Hail', run: () => { ctx.close(); st.openComm(e); } },
            { key: 'L', label: 'Locate', run: () => { ctx.close(); st.showGalaxy(e.home); st.selectStar(e.home); } },
          ],
        }),
      };
    });
  }, 'You have not met anyone yet. Fly into another empire\'s territory to make contact.');

  // ---------------------------------------------------------------- Notes
  const STAGE_NAME: Record<string, string> = { cell: 'Cell', creature: 'Creature', tribal: 'Tribal', civ: 'Civilization', space: 'Space' };
  const notes = page('notes', 'Notes', () => [...(w.game.state?.history ?? [])].reverse().map((e) => ({
    icon: e.icon ?? '•', name: e.text, val: STAGE_NAME[e.stage] ?? e.stage, dim: e.stage !== 'space',
    d: () => ({
      big: e.icon ?? '📝',
      boxes: [['STAGE', STAGE_NAME[e.stage] ?? e.stage], ['DATE', new Date(e.at).toLocaleDateString()], ['TIME', new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]],
      desc: e.text,
    }),
  })), 'Nothing written yet. Your species\' story fills in as you play.');

  // ---------------------------------------------------------------- Radio
  const radio = page('radio', 'Radio', () => STATIONS.map((s) => ({
    icon: s.id === 'off' ? '🔇' : '📻', name: s.name, val: s.freq, mark: (w.s.radio ?? 'deep') === s.id,
    d: () => {
      const on = (w.s.radio ?? 'deep') === s.id;
      const m = w.s.market;
      return {
        pic: (el: HTMLElement) => picCanvas(el, (g, cw, ch, t) => wave(g, cw, ch, t, s.id === 'off' || !on ? 0 : s.id === 'wire' ? 0.6 : 1, s.freq)),
        boxes: [['FREQ', s.freq], ['GENRE', s.genre], ['STATUS', on ? 'On air' : 'Off']],
        lines: s.id === 'wire' && m ? m.news.slice(0, 4).map((n) => [`${n.icon} ${n.head}`, n.tag]) : undefined,
        desc: s.id === 'wire' && m ? `${s.desc} Next story in ${fmtTime(nextIn(w))}.` : s.desc,
        acts: [{ key: 'E', label: on ? 'Playing' : s.id === 'off' ? 'Turn off' : 'Tune in', off: on ? 'Already tuned in.' : undefined, run: () => { w.s.radio = s.id; st.tuneRadio(); ctx.note(s.id === 'off' ? 'Radio off.' : `Now playing: ${s.name}`); } }],
      };
    },
  })));

  // ---------------------------------------------------------------- Market
  const market = page('market', 'Market', () => {
    const m = w.s.market;
    if (!m) return [];
    const rows: Row[] = [{
      icon: '📈', name: 'Galactic Spice Index', val: gsi(w).toFixed(1),
      d: () => ({
        pic: (el: HTMLElement) => picCanvas(el, (g, cw, ch) => spark(g, cw, ch, SPICE_COLORS.map((c) => m.hist[c]).reduce((acc, hh) => acc.map((v, i) => v + (hh[i] ?? 1)), new Array(m.hist.red.length).fill(0)))),
        boxes: [['GSI', gsi(w).toFixed(1)], ['5 MIN', `${((gsi(w) / gsi(w, 60) - 1) * 100).toFixed(2)}%`], ['NEWS', fmtTime(nextIn(w))]],
        lines: m.news.slice(0, 3).map((n) => [`${n.icon} ${n.head}`, n.tag]),
        desc: 'Every spice, weighted by value. Every empire\'s spice prices follow the exchange, so a rising index means better sales everywhere.',
        acts: [{ key: 'E', label: 'Trading floor', run: () => { ctx.close(); st.openExchange(); } }],
      }),
    }];
    for (const c of SPICE_COLORS) {
      const ch = change(w, c);
      rows.push({
        icon: '●', name: `${SPICE[c].name} (${CODE[c]})`, val: `${money(contractPrice(w, c))} ${ch >= 0 ? '▲' : '▼'}${Math.abs(ch * 100).toFixed(1)}%`,
        d: () => {
          const n = m.news.find((x) => x.fx.some((f) => f.c === c));
          return {
            pic: (el: HTMLElement) => picCanvas(el, (g, cw, chh) => spark(g, cw, chh, m.hist[c].slice(-120))),
            boxes: [['PRICE', money(contractPrice(w, c))], ['5 MIN', `${ch >= 0 ? '+' : '−'}${Math.abs(ch * 100).toFixed(1)}%`], ['HELD', String(m.hold[c].n)]],
            lines: n ? [[`${n.icon} ${n.head}`, n.tag]] : [['No recent news', '—']],
            desc: `${SPICE[c].name} contracts on the exchange. Empire prices for ${SPICE[c].name} move with this index.`,
            acts: [{ key: 'E', label: 'Trading floor', run: () => { ctx.close(); st.openExchange(c as SpiceColor); } }],
          };
        },
      });
    }
    return rows;
  });

  return {
    id: 'data', label: 'DATA',
    head: () => {
      const { sd, clock } = stardate(w.s.t);
      const s = w.star(w.s.loc);
      return [['LOC', st.mode === 'warp' ? 'Hyperspace' : s.name], ['SD', `${sd} · ${clock}`]];
    },
    pages: [local, world, quests, contacts, notes, radio, market],
  };
}

/** The mission the HUD follows: the one you picked, else the first main one, else the first. */
export function trackedMission(w: NbCtx['st']['w']): Mission | undefined {
  return w.s.missions.find((m) => m.id === w.s.tracked) ?? w.s.missions.find((m) => m.main) ?? w.s.missions[0];
}

/** A radio waveform, as on the Pip-Boy. */
function wave(g: CanvasRenderingContext2D, cw: number, ch: number, t: number, amp: number, freq: string) {
  g.strokeStyle = ph(0.25);
  g.lineWidth = 1;
  for (let x = 0; x <= cw; x += cw / 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ch); g.stroke(); }
  for (let y = 0; y <= ch; y += ch / 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(cw, y); g.stroke(); }
  g.beginPath();
  const f = parseFloat(freq) || 90;
  for (let x = 0; x <= cw; x += 2) {
    const u = x / cw;
    const y = ch / 2 + amp * ch * 0.32 * (Math.sin(u * TAU * (f / 30) + t * 5) * 0.6 + Math.sin(u * TAU * 7.3 - t * 9) * 0.25 * Math.sin(t * 1.7) + (Math.random() - 0.5) * 0.12);
    if (x) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.strokeStyle = ph(1);
  g.lineWidth = 2;
  g.shadowColor = ph(0.9);
  g.shadowBlur = 8;
  g.stroke();
  g.shadowBlur = 0;
}

/** A price line. */
function spark(g: CanvasRenderingContext2D, cw: number, ch: number, data: number[]) {
  if (data.length < 2) return;
  const lo = Math.min(...data), hi = Math.max(...data), sp = hi - lo || 1;
  g.strokeStyle = ph(0.18);
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (ch * i) / 4); g.lineTo(cw, (ch * i) / 4); g.stroke(); }
  g.beginPath();
  data.forEach((v, i) => { const x = (i / (data.length - 1)) * cw, y = 8 + (1 - (v - lo) / sp) * (ch - 16); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.strokeStyle = ph(1);
  g.lineWidth = 2;
  g.shadowColor = ph(0.8);
  g.shadowBlur = 8;
  g.stroke();
  g.shadowBlur = 0;
}

// ------------------------------------------------------------------ maps
/** The map pages share a canvas on the left and a panel for the picked place on the right. */
function mapShell(host: HTMLElement) {
  const cv = h('canvas', { class: 'nb-mapcv' }) as HTMLCanvasElement;
  const legend = h('div', { class: 'nb-legend' });
  const side = h('div', { class: 'nb-mapside' });
  host.append(h('div', { class: 'nb-mapw' }, cv, legend), side);
  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = cv.clientWidth, ch = cv.clientHeight;
    if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    return { g, cw, ch };
  };
  /** Fill the side panel: a title, key-value lines and actions. */
  const panel = (title: string, sub: string, lines: [string, string][], acts: NbAct[], run: (a: NbAct) => void) => {
    side.replaceChildren(
      h('div', { class: 'nb-dtitle' }, title), h('div', { class: 'nb-sub2' }, sub),
      h('div', { class: 'nb-lines' }, ...lines.flatMap(([k, v]) => [h('span', null, k), h('b', null, v)])),
      h('div', { class: 'nb-acts row' }, ...acts.map((a) => { const b = h('button', { class: 'nb-act' + (a.off ? ' off' : ''), title: a.off ?? '' }, a.label, h('kbd', null, a.key)); b.addEventListener('click', () => run(a)); return b; })));
  };
  return { cv, legend, side, size, panel };
}

const tri = (g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number) => {
  g.beginPath();
  g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  g.lineTo(x + Math.cos(a + 2.5) * r * 0.8, y + Math.sin(a + 2.5) * r * 0.8);
  g.lineTo(x + Math.cos(a - 2.5) * r * 0.8, y + Math.sin(a - 2.5) * r * 0.8);
  g.closePath();
};
/** Fallout's quest marker: a solid arrow pointing down. */
const questArrow = (g: CanvasRenderingContext2D, x: number, y: number, t: number) => {
  const b = Math.sin(t * 4) * 2;
  g.fillStyle = ph(1);
  g.beginPath(); g.moveTo(x, y - 6 + b); g.lineTo(x - 6, y - 15 + b); g.lineTo(x + 6, y - 15 + b); g.closePath(); g.fill();
};

function localMap(host: HTMLElement, ctx: NbCtx): NbCustom {
  const st = ctx.st, w = st.w;
  const sid = st.sv.star;
  const star = w.star(sid);
  const pls = w.gal.planets(sid);
  const shell = mapShell(host);
  shell.legend.textContent = '▲ You   ▼ Mission   ! Alert   ■ Your colony   ○ Empire world';
  let pick: number | null = st.sv.nearPlanet ?? (pls.length ? 0 : null);
  let t = 0;
  let geo = { cx: 0, cy: 0, k: 1 };
  const act = (a: NbAct) => { if (a.off) { audio.sfx('error'); ctx.note(a.off, true); return; } audio.sfx('click'); a.run(); };
  const acts = (): NbAct[] => {
    if (pick === null) return [];
    const p = pls[pick];
    const away = st.mode !== 'system';
    return [
      { key: 'E', label: 'Fly there', off: away ? 'Enter the system first.' : undefined, run: () => { ctx.close(); st.sv.goToPlanet(p.idx); } },
      { key: 'O', label: 'Open', off: away ? 'Enter the system first.' : undefined, run: () => { ctx.close(); st.openPlanet(sid, p.idx); } },
    ];
  };
  const side = () => {
    if (st.mode === 'warp') { shell.panel('Hyperspace', 'Between the stars', [], [], act); return; }
    if (pick === null) { shell.panel(star.name, STAR_INFO[star.type].name, [['Worlds', 'None']], [], act); return; }
    const p = pls[pick], ps = w.ps(sid, p.idx);
    const owner = ps.owner === 'player' ? 'Your colony' : ps.owner ? w.emap.get(ps.owner)?.name ?? 'Claimed' : 'Unclaimed';
    const ev = w.s.events.find((e) => e.star === sid && e.planet === p.idx);
    const ms = w.s.missions.filter((m) => m.star === sid && (m.planet === undefined || m.planet === p.idx));
    shell.panel(p.name, `${star.name} · ${p.kind === 'gas' ? 'Gas giant' : 'Rocky world'}`, [
      ['T-score', `T${w.tscore(sid, p.idx)}`], ['Owner', owner], ['Spice', p.spice ? SPICE[p.spice].name : 'None'],
      ['Explored', w.explored(sid, p.idx) ? 'Yes' : 'Not yet'],
      ...(ev ? [['Alert', `${EVENT_INFO[ev.kind].icon} ${EVENT_INFO[ev.kind].label}`] as [string, string]] : []),
      ...ms.map((m) => ['Mission', m.title] as [string, string]),
    ], acts(), act);
  };
  const hit = (x: number, y: number) => {
    let best: number | null = null, bd = 18;
    pls.forEach((p, i) => { const pp = w.planetPos(p); const d = Math.hypot(geo.cx + pp.x * geo.k - x, geo.cy + pp.y * geo.k - y); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  shell.cv.addEventListener('click', (e) => { const r = shell.cv.getBoundingClientRect(); const i = hit(e.clientX - r.left, e.clientY - r.top); if (i !== null && i !== pick) { pick = i; audio.sfx('tap'); side(); } });
  side();
  return {
    tick(dt) {
      t += dt;
      const { g, cw, ch } = shell.size();
      const R = Math.max(400, ...pls.map((p) => p.orbit)) + 140;
      geo = { cx: cw / 2, cy: ch / 2, k: Math.min(cw, ch) / 2 / R };
      const { cx, cy, k } = geo;
      g.font = '11px "Share Tech Mono", monospace';
      // The star
      g.shadowColor = ph(0.9);
      g.shadowBlur = 18;
      g.fillStyle = ph(star.type === 'blackhole' ? 0.15 : 0.9);
      g.beginPath(); g.arc(cx, cy, star.type === 'blackhole' ? 9 : 7 + Math.sin(t * 2), 0, TAU); g.fill();
      g.shadowBlur = 0;
      if (star.type === 'blackhole') { g.strokeStyle = ph(0.9); g.beginPath(); g.arc(cx, cy, 13, t, t + 4.5); g.stroke(); }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 0.2; g.strokeStyle = ph(0.35); g.beginPath(); g.moveTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11); g.lineTo(cx + Math.cos(a) * 17, cy + Math.sin(a) * 17); g.stroke(); }
      if (star.type === 'proto') { g.setLineDash([2, 6]); g.strokeStyle = ph(0.5); g.beginPath(); g.arc(cx, cy, 400 * k, 0, TAU); g.stroke(); g.setLineDash([]); }
      // Orbits and worlds
      pls.forEach((p, i) => {
        g.setLineDash([2, 5]);
        g.strokeStyle = ph(0.22);
        g.beginPath(); g.arc(cx, cy, p.orbit * k, 0, TAU); g.stroke();
        g.setLineDash([]);
        const pp = w.planetPos(p), x = cx + pp.x * k, y = cy + pp.y * k, r = Math.max(4, Math.min(14, p.size * k * 1.6));
        const ps = w.ps(st.sv.star, p.idx);
        g.fillStyle = ph(i === pick ? 1 : 0.7);
        if (ps.owner === 'player') g.fillRect(x - r, y - r, r * 2, r * 2);
        else { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
        if (ps.owner && ps.owner !== 'player') { g.strokeStyle = ph(0.8); g.beginPath(); g.arc(x, y, r + 4, 0, TAU); g.stroke(); }
        if (i === pick) { g.strokeStyle = ph(1); g.strokeRect(x - r - 7, y - r - 7, r * 2 + 14, r * 2 + 14); }
        g.fillStyle = ph(i === pick ? 1 : 0.75);
        g.textAlign = 'left';
        g.fillText(p.name, x + r + 6, y + 4);
        if (w.s.events.some((e) => e.star === sid && e.planet === p.idx) && Math.sin(t * 6) > -0.3) { g.font = '700 14px "Share Tech Mono", monospace'; g.fillText('!', x - 3, y - r - 6); g.font = '11px "Share Tech Mono", monospace'; }
        if (w.s.missions.some((m) => m.star === sid && m.planet === p.idx)) questArrow(g, x, y - r, t);
      });
      // You
      if (st.mode === 'system') {
        const pl = st.sv.combat.player;
        g.fillStyle = ph(1);
        tri(g, cx + pl.x * k, cy + pl.y * k, 8, pl.angle);
        if (Math.sin(t * 5) > -0.5) g.fill();
      }
      g.textAlign = 'left';
      g.fillStyle = ph(0.8);
      g.fillText(`${star.name} · ${STAR_INFO[star.type].name}`, 10, 16);
    },
    key(k) {
      if (!pls.length) return false;
      if (k === 'arrowdown' || k === 's' || k === 'arrowup' || k === 'w') {
        pick = ((pick ?? 0) + (k === 'arrowdown' || k === 's' ? 1 : pls.length - 1)) % pls.length;
        audio.sfx('tap', { vol: 0.5 });
        side();
        return true;
      }
      const a = acts().find((x) => x.key.toLowerCase() === k || (k === 'enter' && x.key === 'E'));
      if (a) { act(a); return true; }
      return false;
    },
  };
}

function worldMap(host: HTMLElement, ctx: NbCtx): NbCustom {
  const st = ctx.st, w = st.w;
  const shell = mapShell(host);
  shell.legend.textContent = '▲ You   ⌂ Home   ■ Yours   ○ Empire   ▼ Mission   ! Alert   ✦ Core   · drag to pan, wheel to zoom';
  const stars = w.gal.stars;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of stars) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
  const me = w.star(w.s.loc);
  // Like Fallout's world map, it opens on the whole galaxy.
  let zoom = 1, panX = (minX + maxX) / 2, panY = (minY + maxY) / 2;
  let pick: number = w.s.loc;
  let t = 0, drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  let geo = { cx: 0, cy: 0, k: 1 };
  const toScreen = (x: number, y: number) => ({ x: geo.cx + (x - panX) * geo.k, y: geo.cy + (y - panY) * geo.k });
  const act = (a: NbAct) => { if (a.off) { audio.sfx('error'); ctx.note(a.off, true); return; } audio.sfx('click'); a.run(); };
  const acts = (): NbAct[] => [
    { key: 'E', label: pick === w.s.loc ? 'You are here' : 'Set course', off: pick === w.s.loc ? 'You are already here.' : undefined, run: () => { ctx.close(); st.showGalaxy(pick); st.selectStar(pick); } },
    { key: 'H', label: 'Home', run: () => { pick = w.gal.homeStar; panX = w.star(pick).x; panY = w.star(pick).y; side(); } },
    { key: 'C', label: 'Centre on you', run: () => { pick = w.s.loc; panX = me.x; panY = me.y; side(); } },
  ];
  const side = () => {
    const s = w.star(pick), o = w.ownerOf(pick), e = w.empireOf(pick);
    const owner = o === 'player' ? 'Your empire' : o === 'hollow' ? 'The Hollow' : e ? (e.met ? e.name : 'Unknown empire') : 'Unclaimed';
    const sv = w.surveyed(pick);
    const d = Math.round(w.gal.dist(w.s.loc, pick));
    const ms = w.s.missions.filter((m) => m.star === pick);
    const ev = w.s.events.find((x) => x.star === pick);
    shell.panel(s.name, pick === w.gal.coreId ? 'The galactic core' : STAR_INFO[s.type].name, [
      ['Owner', owner], ['Distance', pick === w.s.loc ? 'Here' : `${d} ly`],
      ['Explored', w.visited(pick) ? `${sv.done}/${sv.total} scanned` : 'Never visited'],
      ...(ev ? [['Alert', `${EVENT_INFO[ev.kind].icon} ${EVENT_INFO[ev.kind].label}`] as [string, string]] : []),
      ...ms.map((m) => ['Mission', m.title] as [string, string]),
    ], acts(), act);
  };
  const cvEl = shell.cv;
  cvEl.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, px: panX, py: panY, moved: false }; cvEl.setPointerCapture(e.pointerId); });
  cvEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) { panX = drag.px - dx / geo.k; panY = drag.py - dy / geo.k; }
  });
  cvEl.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (!d || d.moved) return;
    const r = cvEl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 14;
    for (const s of stars) { const p = toScreen(s.x, s.y); const dd = Math.hypot(p.x - x, p.y - y); if (dd < bd) { bd = dd; best = s.id; } }
    if (best >= 0 && best !== pick) { pick = best; audio.sfx('tap'); side(); }
  });
  cvEl.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); zoom = Math.max(0.8, Math.min(10, zoom * (e.deltaY < 0 ? 1.15 : 0.87))); }, { passive: false });
  side();
  const missionStars = () => new Set(w.s.missions.map((m) => m.star).filter((x): x is number => x !== undefined));
  return {
    tick(dt) {
      t += dt;
      const { g, cw, ch } = shell.size();
      const fit = Math.min(cw / (maxX - minX + 200), ch / (maxY - minY + 200));
      geo = { cx: cw / 2, cy: ch / 2, k: fit * zoom };
      const quest = missionStars();
      const evs = new Set(w.s.events.map((e) => e.star));
      g.font = '10px "Share Tech Mono", monospace';
      for (const s of stars) {
        const p = toScreen(s.x, s.y);
        if (p.x < -20 || p.y < -20 || p.x > cw + 20 || p.y > ch + 20) continue;
        const o = w.ownerOf(s.id), vis = w.visited(s.id);
        const a = vis ? 0.95 : 0.35;
        g.fillStyle = ph(a);
        g.strokeStyle = ph(a);
        if (s.id === w.gal.coreId) { g.font = '700 16px "Share Tech Mono", monospace'; g.textAlign = 'center'; g.fillText('✦', p.x, p.y + 5); g.font = '10px "Share Tech Mono", monospace'; }
        else if (s.id === w.gal.homeStar) { g.beginPath(); g.moveTo(p.x - 5, p.y + 4); g.lineTo(p.x - 5, p.y - 1); g.lineTo(p.x, p.y - 6); g.lineTo(p.x + 5, p.y - 1); g.lineTo(p.x + 5, p.y + 4); g.closePath(); g.fill(); }
        else if (o === 'player') g.fillRect(p.x - 3, p.y - 3, 6, 6);
        else { g.beginPath(); g.arc(p.x, p.y, vis ? 2.2 : 1.5, 0, TAU); g.fill(); }
        if (o && o !== 'player' && o !== 'hollow' && w.empireOf(s.id)?.met) { g.beginPath(); g.arc(p.x, p.y, 5, 0, TAU); g.stroke(); }
        if (o === 'hollow') { g.beginPath(); g.moveTo(p.x - 3, p.y - 3); g.lineTo(p.x + 3, p.y + 3); g.moveTo(p.x + 3, p.y - 3); g.lineTo(p.x - 3, p.y + 3); g.stroke(); }
        if (quest.has(s.id)) questArrow(g, p.x, p.y - 2, t);
        if (evs.has(s.id) && Math.sin(t * 6) > -0.3) { g.fillStyle = ph(1); g.font = '700 13px "Share Tech Mono", monospace'; g.fillText('!', p.x + 5, p.y - 4); g.font = '10px "Share Tech Mono", monospace'; }
        if (zoom > 2.2 && vis) { g.fillStyle = ph(0.6); g.textAlign = 'left'; g.fillText(s.name, p.x + 6, p.y + 3); }
      }
      // You, and the picked star
      const mp = toScreen(me.x, me.y);
      g.fillStyle = ph(1);
      tri(g, mp.x, mp.y - 10, 7, Math.PI / 2);
      if (Math.sin(t * 5) > -0.5) g.fill();
      const pp = toScreen(w.star(pick).x, w.star(pick).y);
      g.strokeStyle = ph(1);
      g.strokeRect(pp.x - 9, pp.y - 9, 18, 18);
      g.textAlign = 'left';
      g.fillStyle = ph(1);
      g.font = '12px "Share Tech Mono", monospace';
      g.fillText(w.star(pick).name, pp.x + 13, pp.y - 8);
    },
    key(k) {
      const step = 60 / geo.k;
      if (k === 'arrowup' || k === 'w') panY -= step;
      else if (k === 'arrowdown' || k === 's') panY += step;
      else if (k === '+' || k === '=') zoom = Math.min(10, zoom * 1.25);
      else if (k === '-') zoom = Math.max(0.8, zoom / 1.25);
      else {
        const a = acts().find((x) => x.key.toLowerCase() === k || (k === 'enter' && x.key === 'E'));
        if (!a) return false;
        act(a);
      }
      return true;
    },
  };
}
