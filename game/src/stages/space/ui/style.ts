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
.toast.scan { pointer-events:auto; cursor:pointer; width:100%; padding:10px 12px; border-color:rgba(120,240,255,.65); background:linear-gradient(180deg, rgba(8,30,44,.96), rgba(4,14,26,.96)); box-shadow:0 8px 26px rgba(0,0,0,.5), 0 0 18px rgba(80,220,255,.18); }
.toast.scan > span { flex:1; min-width:0; }
.sc { display:flex; flex-direction:column; gap:5px; }
.sc-h { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:15px; }
.sc-h b { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sc-pay { color:#ffd166; font-weight:800; white-space:nowrap; }
.sc-re { color:var(--ink-dim); font-size:12px; white-space:nowrap; }
.sc-sub { font-size:12.5px; color:var(--ink-dim); }
.sc-chips { display:flex; flex-wrap:wrap; gap:5px; }
.sc-chip { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; padding:2px 8px; border-radius:999px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); }
.sc-chip.ok { border-color:rgba(62,230,196,.55); color:#9ff5e2; }
.sc-chip.dim { color:var(--ink-dim); font-weight:600; }
.sc-chip .sp-dot, .sc-row .sp-dot { width:9px; height:9px; margin:0; }
.sc-lives { display:flex; flex-direction:column; gap:3px; }
.sc-life { font-size:13.5px; font-weight:700; }
.sc-life i, .sc-new { font-style:normal; margin-left:7px; font-size:11px; font-weight:800; padding:1px 6px; border-radius:6px; background:#ffd166; color:#04101e; }
.sc-life em { font-style:normal; margin-left:7px; font-size:11px; font-weight:700; color:#3ee6c4; }
.sc-find { font-size:12.5px; font-weight:600; color:#ffd166; }
.sc-find.bad { color:#ff9a8a; }
.sc-row { display:grid; grid-template-columns:minmax(0,1fr) auto 10px auto auto 18px; gap:7px; align-items:center; font-size:12.5px; }
.sc-row b { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:13px; }
.sc-t { color:#ffd166; letter-spacing:-1px; }
.sc-n { color:var(--ink-dim); white-space:nowrap; }
.sp-alert.good { background:rgba(90,64,6,.82); border-color:rgba(255,209,102,.9); animation:none; }
@keyframes spPulse { 50% { box-shadow:0 0 0 4px rgba(255,80,80,.18); } }
.sp-bl { position:absolute; left:calc(10px + var(--safe-l)); bottom:calc(14px + var(--safe-b)); display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
.sp-viewbtn { width:62px; height:62px; border-radius:50%; font-size:28px; padding:0; border:2px solid rgba(92,200,255,.6); background:radial-gradient(circle at 35% 30%, rgba(150,220,255,.35), rgba(8,20,40,.9)); }
.sp-viewbtn .sp-vl { position:absolute; bottom:-15px; font-size:11px; font-weight:600; text-shadow:0 1px 3px #000; }
.sp-viewbtn { position:relative; }
.sp-explored { display:flex; gap:5px; align-items:center; font-size:11px; font-weight:600; color:var(--ink-dim); background:rgba(4,12,24,.78); border:1px solid var(--line); border-radius:10px; padding:4px 8px; pointer-events:none; white-space:nowrap; }
.sp-explored i { display:inline-grid; place-items:center; width:15px; height:15px; border-radius:50%; border:2px solid #3ee6c4; color:#3ee6c4; background:#04101e; font-style:normal; font-size:8px; font-weight:800; }
.sp-explored i.full { border-color:#ffd166; color:#ffd166; margin-left:4px; }
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
.sp-ev { border:1px solid rgba(255,90,90,.6); background:rgba(120,10,16,.28); border-radius:14px; padding:9px 10px; margin-bottom:10px; display:flex; flex-direction:column; gap:7px; }
.sp-ev.good { border-color:rgba(255,209,102,.75); background:rgba(90,64,6,.3); }
.sp-ev-h { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:15px; }
.sp-ev-t { color:var(--ink-dim); font-size:12px; font-weight:700; white-space:nowrap; }
.sp-ev-d { font-size:13px; color:var(--ink-dim); line-height:1.35; }
.sp-ev .sp-item { padding:7px 8px; }
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
.sp-debug { position:absolute; left:calc(10px + var(--safe-l)); bottom:calc(166px + var(--safe-b)); display:flex; flex-direction:column-reverse; gap:6px; align-items:flex-start; }
.sp-debug .btn { min-height:44px; font-size:12px; padding:6px 10px; background:rgba(120,40,140,.7); }
.sp-mini { font-size:12px; color:var(--ink-faint); }
.xl-stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
.xl-stat { display:flex; flex-direction:column; align-items:center; gap:1px; background:rgba(255,255,255,.05); border:1px solid var(--line); border-radius:12px; padding:6px 4px; font-size:10.5px; color:var(--ink-faint); text-align:center; line-height:1.2; }
.xl-stat .xl-si { font-size:18px; }
.xl-stat b { color:var(--ink); font-size:16px; }
.xl-row { padding:6px; }
.xl-row.picked { border-color:rgba(62,230,196,.7); background:rgba(62,230,196,.1); }
.xl-btns { display:flex; flex-direction:column; gap:4px; flex:0 0 auto; }
.xl-btns .btn { min-width:96px; }
.xl-tag { display:inline-block; margin-left:6px; font-size:10px; font-weight:700; color:#d6b8ff; border:1px solid #b98cff; border-radius:6px; padding:0 5px; vertical-align:2px; }
.xl-splice { display:flex; flex-direction:column; gap:8px; align-items:stretch; padding:10px; border-radius:14px; border:1px dashed rgba(185,140,255,.7); background:rgba(155,123,255,.1); font-size:13px; color:var(--ink-dim); }
.xl-splice b { color:var(--ink); }
.xl-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(84px, 1fr)); gap:6px; }
.xl-grid.small { grid-template-columns:repeat(auto-fill, minmax(66px, 1fr)); }
.xl-cell { display:flex; flex-direction:column; align-items:center; gap:2px; background:rgba(255,255,255,.05); border:1px solid var(--line); border-radius:10px; padding:4px; font-size:10.5px; color:var(--ink-dim); min-width:0; }
.xl-cell span { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.xl-cell.hy { border-color:rgba(185,140,255,.7); }
.xl-new { font-size:9px; font-weight:800; color:#04101e; background:var(--sun); border-radius:5px; padding:0 4px; vertical-align:1px; }
.xl-known { font-size:10px; }
.sf-hud .sf-top { position:absolute; left:0; right:0; top:0; padding:calc(8px + var(--safe-t)) calc(10px + var(--safe-r)) 0 calc(10px + var(--safe-l)); display:flex; gap:8px; align-items:center; }
.sf-hud .sf-back { flex:0 0 auto; font-weight:700; }
.sf-hud .sf-title { flex:1; min-width:0; display:flex; flex-direction:column; line-height:1.15; background:rgba(4,12,24,.72); border:1px solid var(--line); border-radius:12px; padding:5px 10px; }
.sf-hud .sf-title b { font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf-hud .sf-sub { font-size:11px; color:var(--ink-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf-hud .sf-cargo { flex:0 0 auto; font-size:12px; font-weight:700; }
.sf-hud .sf-life { position:absolute; left:calc(10px + var(--safe-l)); top:calc(64px + var(--safe-t)); max-width:calc(100vw - 172px - var(--safe-l) - var(--safe-r)); display:flex; flex-wrap:wrap; gap:4px; align-items:center; background:rgba(4,12,24,.72); border:1px solid var(--line); border-radius:12px; padding:4px; }
.sf-hud .sf-life:empty { display:none; }
.sf-hud .sf-none { font-size:12px; font-weight:600; padding:2px 6px; }
.sf-hud .sf-sp { position:relative; width:38px; height:33px; border-radius:9px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.07); cursor:pointer; display:flex; align-items:center; justify-content:center; }
.sf-hud .sf-sp canvas { width:36px; height:30px; display:block; pointer-events:none; }
.sf-hud .sf-sp.pl { background:rgba(110,220,140,.13); }
.sf-hud .sf-sp.an { background:rgba(255,160,110,.13); }
.sf-hud .sf-life.dense { gap:3px; padding:3px; }
.sf-hud .sf-life.dense .sf-sp { width:32px; height:28px; border-radius:8px; }
.sf-hud .sf-life.dense .sf-sp canvas { width:30px; height:25px; }
.sf-hud .sf-life.dense .sf-sp i { font-size:7px; padding:1.5px 2.5px; }
.sf-hud .sf-life.dense .sf-glyph { font-size:16px; }
.sf-hud .sf-sp.hid canvas { filter:drop-shadow(0 0 1.2px rgba(175,220,255,.95)); }
.sf-hud .sf-sp.new { border-color:rgba(255,209,102,.75); }
.sf-hud .sf-sp.rare { border-color:#ffd166; box-shadow:0 0 8px rgba(255,209,102,.55); }
.sf-hud .sf-sp.gone { opacity:.5; }
.sf-hud .sf-sp i { position:absolute; right:-4px; top:-5px; font-style:normal; font-size:8px; font-weight:800; line-height:1; padding:2px 3px; border-radius:6px; background:#2a3a52; color:#d4e4f7; pointer-events:none; }
.sf-hud .sf-sp.new i { background:#ffd166; color:#04101e; }
.sf-hud .sf-sp.got i { background:#3ee6c4; color:#04101e; }
.sf-hud .sf-glyph { font-size:20px; line-height:1; pointer-events:none; }
.sf-hud .sf-sp.hid .sf-glyph { filter:brightness(0) drop-shadow(0 0 1.2px rgba(175,220,255,.95)); }
.sf-hud .sf-sp.pop { animation:sfPop .55s ease-out; }
@keyframes sfPop { 0% { transform:scale(.6); } 55% { transform:scale(1.22); } 100% { transform:scale(1); } }
.sf-hud .sf-mini { position:absolute; right:calc(10px + var(--safe-r)); top:calc(64px + var(--safe-t)); width:132px; height:85px; border-radius:10px; border:1px solid rgba(255,255,255,.35); box-shadow:0 4px 14px rgba(0,0,0,.4); background:#000; cursor:crosshair; }
.sf-hud .sf-acts { position:absolute; right:calc(12px + var(--safe-r)); bottom:calc(18px + var(--safe-b)); display:flex; flex-direction:column; align-items:flex-end; gap:10px; }
.sf-hud .sf-scan { width:56px; height:56px; font-size:25px; border-radius:50%; background:radial-gradient(circle at 35% 30%, rgba(140,240,220,.45), rgba(6,30,40,.92)); border:2px solid rgba(62,230,196,.7); }
.sf-hud .sf-scan.cool { opacity:.45; }
.sf-hud .sf-ctx { font-size:16px; padding:14px 18px; border-radius:16px; max-width:calc(100vw - 40px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf-hud .sf-ctx .xl-new { margin-left:8px; }
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
  .sp-debug { bottom:auto; top:calc(150px + var(--safe-t)); flex-direction:column; }
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
