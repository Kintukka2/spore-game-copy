// Space-stage CSS, injected once. Builds on the design tokens in styles.css.
const CSS = `
body.sp-active .toasts { top:calc(180px + var(--safe-t)); z-index:28; }
body.sp-active.sp-panel-open .toasts { top:auto; bottom:calc(14px + var(--safe-b)); }
.sp-top { position:absolute; left:0; right:0; top:0; padding:calc(8px + var(--safe-t)) calc(10px + var(--safe-r)) 0 calc(10px + var(--safe-l)); display:flex; flex-direction:column; gap:6px; pointer-events:none; }
.sp-top > * { pointer-events:auto; }
.sp-row { display:flex; gap:6px; align-items:center; }
.sp-rank { position:relative; width:44px; height:44px; border-radius:50%; border:2px solid rgba(255,209,102,.7); background:radial-gradient(circle at 35% 30%, rgba(255,230,160,.35), rgba(30,22,6,.9)); display:flex; align-items:center; justify-content:center; font-size:21px; cursor:pointer; flex:0 0 auto; padding:0; color:#fff; }
.sp-rank .sp-rk { position:absolute; bottom:-7px; left:50%; transform:translateX(-50%); font-size:9px; font-weight:700; background:#2a1f05; color:#ffd166; border-radius:6px; padding:1px 4px; white-space:nowrap; border:1px solid rgba(255,209,102,.5); }
.sp-money { flex:1; min-width:0; height:44px; justify-content:flex-start; font-size:16px; font-weight:700; color:#ffe7a0; cursor:pointer; overflow:hidden; white-space:nowrap; }
.sp-money .sp-cargo { margin-left:auto; font-size:12px; font-weight:600; color:var(--ink-dim); }
.sp-bars { display:flex; gap:6px; }
.sp-bars .bar { flex:1; height:20px; min-width:0; }
.bar.energy .bar-fill { background:linear-gradient(90deg,#2a7fd9,#5cc8ff); }
.sp-track { display:flex; gap:8px; align-items:center; background:rgba(4,10,22,.62); border:1px solid var(--line); border-radius:12px; padding:6px 10px; font-size:13px; color:var(--ink-dim); min-height:44px; cursor:pointer; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
.sp-track b { color:var(--ink); font-weight:600; white-space:nowrap; }
.sp-track .sp-tdesc { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1; }
.sp-alerts { display:flex; gap:6px; flex-wrap:wrap; }
.sp-alert { display:inline-flex; gap:6px; align-items:center; background:rgba(120,10,16,.75); border:1px solid rgba(255,90,90,.8); color:#fff; border-radius:999px; padding:0 14px; font-size:13px; font-weight:600; min-height:44px; cursor:pointer; animation: spPulse 1.2s ease-in-out infinite; }
.sp-alert.eco { background:rgba(20,80,30,.8); border-color:rgba(120,240,140,.8); }
@keyframes spPulse { 50% { box-shadow:0 0 0 4px rgba(255,80,80,.18); } }
.sp-bl { position:absolute; left:calc(10px + var(--safe-l)); bottom:calc(14px + var(--safe-b)); display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
.sp-viewbtn { width:62px; height:62px; border-radius:50%; font-size:28px; padding:0; border:2px solid rgba(92,200,255,.6); background:radial-gradient(circle at 35% 30%, rgba(150,220,255,.35), rgba(8,20,40,.9)); }
.sp-viewbtn .sp-vl { position:absolute; bottom:-15px; font-size:11px; font-weight:600; text-shadow:0 1px 3px #000; }
.sp-viewbtn { position:relative; }
.sp-abil { position:absolute; right:calc(10px + var(--safe-r)); bottom:calc(20px + var(--safe-b)); display:grid; grid-template-columns:repeat(2, 64px); gap:20px 12px; justify-items:center; align-items:end; }
.sp-abil .ability.small { width:54px; height:54px; }
.sp-abil .ability.small .ab-icon { font-size:22px; }
.sp-abil .ability .ab-count { position:absolute; top:-4px; left:-4px; min-width:20px; height:20px; border-radius:10px; background:#5cc8ff; color:#03202e; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center; }
.sp-ctx { position:absolute; left:calc(10px + var(--safe-l)); bottom:calc(104px + var(--safe-b)); max-width:calc(100% - 180px); }
.sp-ctx .btn { max-width:100%; overflow:hidden; text-overflow:ellipsis; display:block; }
.sp-side { position:absolute; right:calc(10px + var(--safe-r)); top:calc(150px + var(--safe-t)); display:flex; flex-direction:column; gap:10px; }
.sp-card { position:absolute; left:calc(10px + var(--safe-l)); right:calc(10px + var(--safe-r)); bottom:calc(92px + var(--safe-b)); background:var(--glass-strong); border:1px solid var(--line); border-radius:18px; padding:14px; box-shadow:0 12px 40px rgba(0,0,0,.55); animation: spUp .22s ease; max-height:52dvh; overflow:auto; }
@keyframes spUp { from { transform:translateY(16px); opacity:0; } }
.sp-card h3 { font-size:19px; display:flex; align-items:center; gap:8px; }
.sp-card .sp-sub { color:var(--ink-dim); font-size:13px; margin-top:2px; }
.sp-kv { display:grid; grid-template-columns:auto 1fr; gap:4px 10px; font-size:13px; margin:10px 0; color:var(--ink-dim); }
.sp-kv b { color:var(--ink); font-weight:600; }
.sp-dot { display:inline-block; width:11px; height:11px; border-radius:50%; vertical-align:-1px; border:1px solid rgba(255,255,255,.5); }
.sp-actions { display:flex; gap:8px; flex-wrap:wrap; }
.sp-actions .btn { flex:1 1 auto; }
.sp-sheet-wrap { position:fixed; inset:0; z-index:30; background:rgba(2,6,14,.55); display:flex; align-items:flex-end; justify-content:center; animation: spFade .18s ease; }
@keyframes spFade { from { opacity:0; } }
.sp-sheet { width:min(560px,100%); max-height:88dvh; background:linear-gradient(180deg, rgba(14,26,46,.98), rgba(7,14,28,.98)); border:1px solid var(--line); border-bottom:0; border-radius:22px 22px 0 0; display:flex; flex-direction:column; box-shadow:0 -10px 50px rgba(0,0,0,.6); animation: spUp .24s ease; padding-bottom:var(--safe-b); }
.sp-sheet-head { display:flex; align-items:center; gap:10px; padding:12px 12px 8px 16px; }
.sp-sheet-head h2 { flex:1; font-size:20px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sp-sheet-body { overflow-y:auto; padding:4px 14px 16px; -webkit-overflow-scrolling:touch; touch-action:pan-y; display:flex; flex-direction:column; gap:10px; }
.sp-tabs { display:flex; gap:6px; overflow-x:auto; padding:0 14px 8px; scrollbar-width:none; flex:0 0 auto; }
.sp-tabs::-webkit-scrollbar { display:none; }
.sp-tab { font:600 14px var(--font); color:var(--ink-dim); background:rgba(255,255,255,.06); border:1px solid transparent; border-radius:12px; padding:0 12px; min-height:44px; white-space:nowrap; cursor:pointer; display:flex; align-items:center; gap:6px; }
.sp-tab.on { color:var(--ink); background:rgba(62,230,196,.18); border-color:rgba(62,230,196,.5); }
.sp-tab .sp-badge { background:#ff5a4f; color:#fff; border-radius:8px; font-size:11px; padding:1px 5px; }
.sp-panel-body > *, .sp-sheet-body > * { flex-shrink:0; }
.sp-item { display:flex; gap:10px; align-items:center; background:rgba(255,255,255,.05); border:1px solid var(--line); border-radius:14px; padding:10px; }
.sp-item .sp-ic { font-size:26px; width:36px; text-align:center; flex:0 0 auto; }
.sp-item .sp-txt { flex:1; min-width:0; font-size:13px; color:var(--ink-dim); line-height:1.3; }
.sp-item .sp-txt b { color:var(--ink); font-size:15px; display:block; }
.sp-item .btn { flex:0 0 auto; }
.sp-item.locked { opacity:.55; }
.sp-price { color:#ffe7a0; font-weight:700; }
.sp-section { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-faint); font-weight:700; margin-top:4px; }
.sp-meter { position:relative; height:16px; border-radius:8px; background:linear-gradient(90deg,#ff4a4a 0%,#ff7a59 15%,#ffb347 35%,#ffd166 50%,#5cc8ff 65%,#4cd97b 100%); opacity:.9; }
.sp-meter i { position:absolute; top:-4px; width:6px; height:24px; border-radius:3px; background:#fff; box-shadow:0 0 0 2px rgba(0,0,0,.5); transform:translateX(-3px); }
.sp-stance { display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:700; padding:3px 8px; border-radius:999px; color:#081018; }
.sp-mods { font-size:12.5px; color:var(--ink-dim); display:flex; flex-direction:column; gap:2px; }
.sp-mods span.pos { color:#7ff0a8; } .sp-mods span.neg { color:#ff8a7a; }
.sp-pips { display:inline-flex; gap:3px; }
.sp-pips i { width:12px; height:12px; border-radius:3px; background:rgba(255,255,255,.15); }
.sp-pips i.on { background:var(--sun); }
.sp-panel { position:fixed; inset:0; z-index:25; display:flex; flex-direction:column; background:radial-gradient(ellipse at 50% 18%, rgba(24,40,76,.92), rgba(3,6,14,.97) 62%); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); animation: spFade .2s ease; padding-top:var(--safe-t); }
.sp-panel-head { display:flex; align-items:center; gap:8px; padding:8px 10px 0; }
.sp-panel-head h2 { flex:1; font-size:21px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sp-globe { position:relative; display:flex; justify-content:center; align-items:center; height:min(31dvh, 250px); flex:0 0 auto; }
.sp-globe canvas { height:100%; aspect-ratio:1; touch-action:none; }
.sp-tbadge { position:absolute; left:14px; top:6px; display:flex; flex-direction:column; gap:4px; font-size:12px; pointer-events:none; }
.sp-tbadge .chip { font-size:13px; }
.sp-panel-body { flex:1; min-height:0; overflow-y:auto; padding:6px 12px calc(14px + var(--safe-b)); display:flex; flex-direction:column; gap:10px; touch-action:pan-y; }
.sp-stat { display:grid; grid-template-columns:96px 1fr 42px; align-items:center; gap:8px; font-size:13px; color:var(--ink-dim); }
.sp-stat .bar { height:12px; min-width:0; }
.sp-chart { width:min(250px,70vw); aspect-ratio:1; align-self:center; touch-action:none; }
.sp-tools { display:grid; grid-template-columns:repeat(2, 1fr); gap:8px; }
.sp-tools .btn { min-height:52px; white-space:normal; line-height:1.15; font-size:14px; padding:8px; }
.sp-eco { display:flex; flex-direction:column; gap:8px; }
.sp-eco-row { display:flex; gap:6px; align-items:center; }
.sp-eco-row .sp-rl { width:30px; font-weight:700; color:var(--ink-dim); font-size:13px; }
.sp-slot { flex:1; min-height:62px; border-radius:12px; border:2px dashed rgba(255,255,255,.2); background:rgba(255,255,255,.04); display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:11px; color:var(--ink-faint); cursor:pointer; padding:2px; overflow:hidden; }
.sp-slot canvas { width:100%; height:40px; pointer-events:none; }
.sp-slot.full { border-style:solid; border-color:rgba(76,217,123,.55); background:rgba(76,217,123,.08); color:var(--ink-dim); }
.sp-slot.locked { opacity:.35; cursor:default; }
.sp-slot .sp-sn { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.sp-species { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
.sp-spec { display:flex; flex-direction:column; align-items:center; gap:2px; background:rgba(255,255,255,.05); border:1px solid var(--line); border-radius:12px; padding:6px 4px; font-size:11px; color:var(--ink-dim); cursor:pointer; min-height:44px; }
.sp-spec canvas { width:100%; height:52px; pointer-events:none; }
.sp-spec b { color:var(--ink); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
.sp-grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.sp-bld { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-height:58px; border-radius:12px; background:rgba(255,255,255,.06); border:1px solid var(--line); font-size:11px; color:var(--ink-dim); }
.sp-bld .sp-bi { font-size:22px; }
.sp-bld.empty { border-style:dashed; opacity:.6; }
.sp-portrait { width:100%; height:120px; border-radius:14px; background:radial-gradient(circle at 50% 40%, rgba(255,255,255,.12), rgba(0,0,0,.25)); }
.sp-offer { background:rgba(255,209,102,.08); border:1px solid rgba(255,209,102,.4); border-radius:14px; padding:10px; font-size:13px; color:var(--ink-dim); display:flex; flex-direction:column; gap:8px; }
.sp-offer b { color:var(--ink); font-size:15px; }
.sp-debug { position:absolute; left:calc(10px + var(--safe-l)); top:calc(170px + var(--safe-t)); display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
.sp-debug .btn { min-height:44px; font-size:12px; padding:6px 10px; background:rgba(120,40,140,.7); }
.sp-mini { font-size:12px; color:var(--ink-faint); }
.sp-sheet .btn.small, .sp-panel .btn.small, .sp-card .btn.small, .sp-hud-btn { min-height:44px; min-width:44px; }
.sp-cine { position:absolute; inset:0; pointer-events:auto; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding:0 16px calc(36px + var(--safe-b)); }
.sp-say { width:min(460px,100%); background:rgba(255,250,235,.95); color:#2a2010; border-radius:22px; padding:16px 18px; font-size:17px; line-height:1.4; box-shadow:0 10px 50px rgba(255,220,150,.35); position:relative; min-height:86px; }
.sp-say .sp-who { position:absolute; top:-12px; left:18px; background:#ffd166; color:#3a2400; font-weight:700; font-size:13px; border-radius:999px; padding:2px 12px; }
.sp-say .sp-next { position:absolute; right:14px; bottom:8px; font-size:12px; color:#8a7040; }
.sp-credits { position:absolute; inset:0; overflow:hidden; pointer-events:auto; display:flex; justify-content:center; }
.sp-credits-roll { position:absolute; top:100%; width:min(420px,92vw); text-align:center; color:#eef6ff; animation: spRoll 26s linear forwards; }
.sp-credits-roll h1 { font-size:44px; margin:0 0 6px; background:linear-gradient(180deg,#fff,#3ee6c4); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sp-credits-roll h3 { color:#ffd166; margin:28px 0 6px; font-size:14px; letter-spacing:.2em; text-transform:uppercase; }
.sp-credits-roll p { margin:4px 0; color:var(--ink-dim); font-size:15px; }
@keyframes spRoll { to { transform:translateY(calc(-100% - 100dvh)); } }

@media (max-height: 560px) and (min-aspect-ratio: 5/4) {
  .sp-top { right:auto; width:min(560px, 62vw); }
  .sp-side { top:calc(8px + var(--safe-t)); flex-direction:row; }
  .sp-card { left:auto; width:min(400px, 46vw); right:calc(86px + var(--safe-r)); bottom:calc(10px + var(--safe-b)); max-height:calc(100dvh - 70px); }
  .sp-debug { top:calc(196px + var(--safe-t)); }
  body.sp-active .toasts { left:auto; right:calc(12px + var(--safe-r)); transform:none; width:min(36vw, 360px); top:calc(64px + var(--safe-t)); }
  .sp-panel { display:grid; grid-template-columns:minmax(220px, 40%) 1fr; grid-template-rows:auto auto 1fr; }
  .sp-panel-head { grid-column:1 / 3; }
  .sp-globe { grid-column:1; grid-row:2 / 4; height:auto; min-height:0; }
  .sp-globe canvas { width:min(100%, 70dvh); height:auto; }
  .sp-panel > .sp-tabs { grid-column:2; grid-row:2; }
  .sp-panel-body { grid-column:2; grid-row:3; }
  .sp-sheet { max-height:94dvh; }
}

@media (min-width: 900px) {
  .sp-top { right:auto; width:min(640px, 60vw); }
  .sp-card { left:auto; width:420px; right:calc(96px + var(--safe-r)); }
  .sp-panel { display:grid; grid-template-columns:minmax(320px, 42%) minmax(0, 720px); grid-template-rows:auto auto 1fr; justify-content:center; }
  .sp-panel-head { grid-column:1 / 3; }
  .sp-globe { grid-column:1; grid-row:2 / 4; height:auto; min-height:0; align-items:flex-start; padding-top:30px; }
  .sp-globe canvas { width:min(100%, 60dvh); height:auto; }
  .sp-panel > .sp-tabs { grid-column:2; grid-row:2; }
  .sp-panel-body { grid-column:2; grid-row:3; }
}
`;

let injected = false;
export function injectStyle() {
  if (injected) return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-space-stage', '');
  el.textContent = CSS;
  document.head.append(el);
}
