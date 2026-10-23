// Space-stage CSS, injected once. Builds on the design tokens in styles.css.
const CSS = `
body.sp-active .toasts { top:calc(180px + var(--safe-t)); z-index:28; }
body.sp-active.sp-panel-open .toasts { top:auto; bottom:calc(14px + var(--safe-b)); }
body.sp-active:has(.sp-sheet-wrap) .toasts { z-index:35; top:calc(14px + var(--safe-t)); bottom:auto; }
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
.sp-tools .sp-wide { grid-column:1 / -1; }
.btn.sp-toxic { background:linear-gradient(180deg, #8dff6a, #3fbf3a); color:#062006; border-color:transparent; box-shadow:0 0 18px rgba(125,255,106,.35); }
/* Focused full-screen views (outbreak, trader) */
.sp-focus { position:fixed; inset:0; z-index:40; display:flex; flex-direction:column; padding:var(--safe-t) var(--safe-r) var(--safe-b) var(--safe-l); background:#02050c radial-gradient(ellipse at 50% 35%, #16283c, #02050c 70%); animation:spFade .2s ease; }
.sp-focus-head { display:flex; align-items:center; gap:10px; padding:10px 12px 4px; }
.sp-focus-head h2 { flex:1; min-width:0; font-size:20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ob { background:#020804 radial-gradient(ellipse at 50% 45%, #183c1a, #020804 72%); }
.ob-stats { display:flex; gap:8px; padding:4px 12px; }
.ob-stat { flex:1; display:flex; flex-direction:column; align-items:center; background:rgba(0,0,0,.35); border:1px solid rgba(125,255,106,.35); border-radius:14px; padding:6px 4px; }
.ob-stat b { font-size:22px; line-height:1.1; }
.ob-stat span { font-size:11px; color:var(--ink-dim); }
.ob-stat.t b { color:#ff9a8a; }
.ob-stat.ok b { color:#9dff8a; }
.ob-stat.bad b { color:#ff8a7a; }
.md { background:#05030a radial-gradient(ellipse at 50% 50%, #2a1530, #05030a 72%); }
.md .ob-stat { border-color:rgba(255,154,74,.4); }
.md-cv { cursor:crosshair; }
/* Terraforming view: the world large, its climate at the top, the tools along the bottom. */
.tf { background:#02040c radial-gradient(ellipse at 50% 42%, #10223a, #02040c 72%); }
.tf .ob-stat { border-color:rgba(124,196,255,.3); }
.tf-t { flex:0 0 auto; min-width:92px; justify-content:center; }
.tf-t b { color:#ffd166; }
.ob-stat .tf-stars { font-size:14px; color:#ffd166; }
.ob-stat .tf-sub { font-size:11px; color:#9dff8a; }
.ob-stat .tf-sub.bad { color:#ffcf80; }
.tf-ax { align-items:stretch; gap:7px; padding:6px 12px 9px; min-width:0; }
.tf-ax > span { font-size:12px; color:var(--ink-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ob-stat.tf-ax > span b { font-size:13px; color:var(--ink); }
.tf-track { position:relative; height:10px; border-radius:6px; overflow:visible; }
.tf-track.air { background:linear-gradient(90deg, #5e4a38, #8a8f96 50%, #cfe8ff); }
.tf-track.heat { background:linear-gradient(90deg, #3f7fd0, #9aa0a8 50%, #ff6a2a); }
.tf-band { position:absolute; top:0; bottom:0; background:rgba(76,217,123,.26); }
.tf-band.b1 { left:20%; right:20%; }
.tf-band.b2 { left:30%; right:30%; }
.tf-band.b3 { left:40%; right:40%; background:rgba(76,217,123,.5); }
.tf-mk { position:absolute; top:-4px; width:6px; height:18px; margin-left:-3px; border-radius:3px; background:#fff; box-shadow:0 0 0 2px #3ee6c4, 0 0 8px rgba(255,255,255,.7); }
.tf-chart { position:absolute; right:10px; top:8px; width:clamp(118px, 21vw, 190px); height:clamp(118px, 21vw, 190px); border-radius:14px; background:rgba(2,8,18,.72); border:1px solid rgba(124,196,255,.25); pointer-events:none; }
.tf-cv { cursor:grab; }
.tf-cv:active { cursor:grabbing; }
.tf-tools { display:flex; gap:8px; padding:6px 12px 2px; overflow-x:auto; justify-content:safe center; scrollbar-width:thin; }
.tf-card { position:relative; flex:0 0 auto; width:106px; display:flex; flex-direction:column; align-items:center; gap:3px; padding:8px 6px 7px; border-radius:14px; background:rgba(8,16,30,.85); border:1.5px solid color-mix(in srgb, var(--c) 55%, transparent); color:var(--ink); font:inherit; cursor:pointer; transition:transform .12s, background .15s, opacity .2s, box-shadow .15s; }
.tf-card:hover:not(.off):not(.busy), .tf-card:focus-visible { transform:translateY(-3px); background:color-mix(in srgb, var(--c) 16%, rgba(8,16,30,.9)); box-shadow:0 0 16px color-mix(in srgb, var(--c) 40%, transparent); outline:none; }
.tf-card:active:not(.off):not(.busy) { transform:scale(.96); }
.tf-card.off { opacity:.42; filter:grayscale(.6); }
.tf-card.busy { opacity:.55; cursor:wait; }
.tf-card.queued { border-color:var(--c); box-shadow:0 0 0 2px var(--c), 0 0 18px color-mix(in srgb, var(--c) 45%, transparent); animation:tfQueued 1s ease-in-out infinite; }
@keyframes tfQueued { 50% { box-shadow:0 0 0 2px var(--c), 0 0 4px transparent; } }
.tf-ic { font-size:26px; line-height:1.1; }
.tf-card b { font-size:12.5px; white-space:nowrap; }
.tf-arrow { font-size:12.5px; font-weight:700; color:var(--c); padding:1px 7px; border-radius:8px; background:color-mix(in srgb, var(--c) 15%, transparent); white-space:nowrap; }
.tf-n { font-size:11px; color:var(--ink-dim); }
.tf-key { position:absolute; left:7px; top:4px; font-size:10px; color:var(--ink-faint); }
@media (hover:none) { .tf-key { display:none; } }
.tf-hint { min-height:3.4em; }
.tf .ob-banner { top:14%; font-size:clamp(28px, 5vw, 40px); }
.tf-warn { color:#ffcf80; margin-top:3px; }
.tf-good { color:#9dff8a; margin-top:3px; }
.sp-tools .tf-tag { white-space:nowrap; }
.sp-tools .tf-tag[style] { font-weight:700; }
.tf-ax i { font-style:normal; }
.tf-short { display:none; }
@media (max-width:640px) { .tf-long { display:none; } .tf-short { display:inline; } }
@media (max-width:520px) { .tf-card { width:86px; padding:6px 4px; } .tf-ic { font-size:22px; } .tf-card b { font-size:11.5px; } .tf-arrow { font-size:11.5px; padding:1px 5px; } .tf-t { min-width:68px; } .tf-ax { padding:5px 8px 8px; } .tf-ax > span { font-size:11px; } }
/* Conversations, Fallout style: face close-up, the line across the top, replies in a terminal frame. */
.ft { position:fixed; inset:0; z-index:45; display:flex; flex-direction:column; align-items:center; background:#000; color:var(--ft); font-family:'Share Tech Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; animation:spFade .25s ease; user-select:none; -webkit-user-select:none; touch-action:manipulation; transition:opacity .2s; }
.ft-amber { --ft:#ffb642; --ft-dim:rgba(255,182,66,.5); --ft-bg:rgba(255,182,66,.16); --ft-glow:rgba(255,182,66,.55); }
.ft-green { --ft:#1aff80; --ft-dim:rgba(26,255,128,.5); --ft-bg:rgba(26,255,128,.13); --ft-glow:rgba(26,255,128,.55); }
.ft.out { opacity:0; }
.ft-cv { position:absolute; inset:0; width:100%; height:100%; }
.ft-scan { position:absolute; inset:0; pointer-events:none; background:repeating-linear-gradient(0deg, rgba(0,0,0,.24) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(0,0,0,.75)); }
.ft-top { position:relative; width:100%; padding:calc(20px + var(--safe-t)) 18px 0; display:flex; justify-content:center; pointer-events:none; }
.ft-say { max-width:780px; min-height:4.2em; text-align:center; font-size:clamp(17px, 2.3vw, 22px); line-height:1.4; letter-spacing:.01em; text-shadow:0 0 10px var(--ft-glow), 0 2px 2px #000, 0 0 2px #000; }
.ft-mid { position:relative; flex:1; min-height:0; width:min(780px, calc(100% - 24px)); display:flex; flex-direction:column; justify-content:flex-end; align-items:flex-start; gap:4px; padding-bottom:22px; pointer-events:none; }
.ft-note { font-size:14px; padding:3px 9px; background:rgba(0,0,0,.72); border-left:3px solid var(--ft); text-shadow:0 0 6px var(--ft-glow); animation:ftNote 3.6s ease forwards; }
.ft-note.bad { border-color:#ff6a50; color:#ff8a70; }
.ft-warn { margin:0 4px 10px; padding:8px 10px; border:1px solid #ff6a50; background:rgba(255,80,50,.12); color:#ff9a80; font-size:clamp(14px, 1.8vw, 16px); line-height:1.35; text-shadow:0 0 8px rgba(255,90,60,.5); }
.ft-warn::before { content:'⚠ WARNING  '; letter-spacing:.08em; font-weight:700; }
.ft-warn[hidden] { display:none; }
@keyframes ftNote { 0% { opacity:0; transform:translateX(-8px); } 8%,80% { opacity:1; transform:none; } 100% { opacity:0; } }
.ft-box { position:relative; width:min(780px, calc(100% - 24px)); margin-bottom:calc(16px + var(--safe-b)); padding:20px 10px 10px; background:rgba(0,0,0,.78); border:2px solid var(--ft-dim); box-shadow:inset 0 0 26px var(--ft-bg), 0 0 18px rgba(0,0,0,.9); }
.ft-box::before, .ft-box::after { content:''; position:absolute; width:18px; height:18px; border:3px solid var(--ft); pointer-events:none; }
.ft-box::before { left:-4px; bottom:-4px; border-right:0; border-top:0; }
.ft-box::after { right:-4px; bottom:-4px; border-left:0; border-top:0; }
.ft-tab { position:absolute; left:14px; top:-13px; max-width:60%; display:flex; gap:10px; align-items:baseline; padding:0 8px; background:#000; white-space:nowrap; overflow:hidden; }
.ft-tab b { font-weight:400; font-size:17px; text-transform:uppercase; letter-spacing:.08em; text-shadow:0 0 8px var(--ft-glow); overflow:hidden; text-overflow:ellipsis; }
.ft-tab span { font-size:13px; color:var(--ft-dim); }
.ft-info { position:absolute; right:14px; top:-11px; display:flex; gap:12px; align-items:center; padding:0 8px; background:#000; font-size:13px; white-space:nowrap; }
.ft-info:empty, .ft-caps:empty { display:none; }
.ft-rel { display:flex; gap:6px; align-items:center; text-transform:uppercase; }
.ft-bar { display:inline-block; width:64px; height:8px; border:1px solid var(--ft-dim); padding:1px; }
.ft-bar i { display:block; height:100%; background:var(--ft); box-shadow:0 0 6px var(--ft-glow); }
.ft-opts { display:flex; flex-direction:column; gap:2px; max-height:min(44vh, 400px); overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:var(--ft-dim) transparent; }
.ft-opt { padding:8px 10px; font-size:clamp(15px, 2vw, 18px); line-height:1.3; border:1px solid transparent; cursor:pointer; text-shadow:0 0 6px var(--ft-bg); }
.ft-opt.on { background:var(--ft-bg); border-color:var(--ft); text-shadow:0 0 8px var(--ft-glow); }
.ft-opt.seen:not(.on) { opacity:.6; }
.ft-opt.fail { color:var(--ft-dim); }
.ft-opt.fail .ft-tag { color:#ff7a5c; }
.ft-box:has(.ft-info:empty) .ft-tab { max-width:calc(100% - 28px); }
@media (max-width:520px) { .ft-info .ft-bar { display:none; } .ft-tab { max-width:58%; } .ft-tab b { font-size:15px; } .ft-tab span { display:none; } }
.ob-stage { position:relative; flex:1; min-height:0; }
.ob-cv { position:absolute; inset:0; width:100%; height:100%; touch-action:none; cursor:crosshair; }
.ob-hint { text-align:center; font-size:13px; color:var(--ink-dim); padding:6px 16px calc(14px + var(--safe-b)); }
.ob-banner { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) scale(.6); opacity:0; pointer-events:none; font-size:40px; font-weight:800; text-shadow:0 4px 18px rgba(0,0,0,.8); white-space:nowrap; transition:opacity .25s, transform .35s cubic-bezier(.2,1.6,.4,1); }
.ob-banner.on { opacity:1; transform:translate(-50%,-50%) scale(1); }
.ob-banner.win { color:#b8ff9e; }
.ob-banner.lose { color:#ff8a7a; }
/* Barter, Fallout style */
.bt { justify-content:flex-start; }
.bt-say { min-height:3em; }
.bt-box { display:flex; flex-direction:column; gap:10px; margin:auto 0 calc(16px + var(--safe-b)); max-height:calc(100dvh - 130px); }
.bt-cols { display:grid; grid-template-columns:1fr 1fr; gap:12px; min-height:0; overflow:hidden; }
.bt-col { display:flex; flex-direction:column; min-height:0; border:1px solid var(--ft-dim); }
.bt-head { display:flex; justify-content:space-between; gap:8px; padding:6px 8px; border-bottom:1px solid var(--ft-dim); font-size:14px; text-transform:uppercase; letter-spacing:.06em; }
.bt-head b { font-weight:400; text-shadow:0 0 8px var(--ft-glow); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bt-head span { color:var(--ft-dim); white-space:nowrap; }
.bt-list { overflow-y:auto; min-height:90px; max-height:34dvh; }
.bt-row { display:grid; grid-template-columns:14px 24px 1fr auto; gap:6px; align-items:center; padding:7px 8px; font-size:clamp(13px, 1.8vw, 16px); border:1px solid transparent; cursor:pointer; }
.bt-row.on { background:var(--ft-bg); border-color:var(--ft); }
.bt-row.in .bt-name, .bt-row.in .bt-val { text-shadow:0 0 8px var(--ft-glow); }
.bt-row.in { background:rgba(255,182,66,.08); }
.bt-row.off { color:var(--ft-dim); }
.bt-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bt-val { white-space:nowrap; }
.bt-ic { font-size:16px; text-align:center; }
.bt-empty { padding:10px 8px; color:var(--ft-dim); font-size:14px; }
.bt-desc { min-height:2.6em; font-size:14px; line-height:1.35; color:var(--ft); opacity:.85; }
.bt-total { font-size:15px; padding:6px 8px; border-top:1px solid var(--ft-dim); border-bottom:1px solid var(--ft-dim); }
.bt-total.bad { color:#ff7a5c; }
.bt-keys { display:flex; flex-wrap:wrap; gap:4px 8px; }
.bt-key { padding:6px 10px; }
@media (max-width:560px) { .bt-cols { grid-template-columns:1fr; } .bt-list { max-height:22dvh; min-height:44px; } }
/* The cargo hold, as a Fallout inventory */
.inv { justify-content:center; }
.inv-box { display:flex; flex-direction:column; gap:10px; margin:0; max-height:calc(100dvh - 40px); }
.inv-tabs { display:flex; gap:4px 14px; flex-wrap:wrap; border-bottom:1px solid var(--ft-dim); padding:0 4px 6px; }
.inv-tab { font-size:15px; text-transform:uppercase; letter-spacing:.08em; padding:4px 2px; cursor:pointer; color:var(--ft-dim); border-bottom:2px solid transparent; display:flex; gap:5px; align-items:center; }
.inv-tab.on { color:var(--ft); border-bottom-color:var(--ft); text-shadow:0 0 8px var(--ft-glow); }
.inv-tab i { font-style:normal; font-size:11px; border:1px solid currentColor; border-radius:4px; padding:0 4px; }
.inv-main { display:grid; grid-template-columns:1.15fr 1fr; gap:14px; min-height:0; }
.inv-list { border:1px solid var(--ft-dim); overflow-y:auto; max-height:52dvh; min-height:140px; }
.inv-detail { display:flex; flex-direction:column; gap:8px; min-width:0; }
.inv-pic { height:120px; border:1px solid var(--ft-dim); display:flex; align-items:center; justify-content:center; background:radial-gradient(ellipse at 50% 60%, var(--ft-bg), transparent 70%); }
.inv-cv { width:100%; height:100%; }
.inv-big { font-size:60px; filter:drop-shadow(0 0 10px var(--ft-glow)); }
.inv-name { font-size:18px; text-transform:uppercase; letter-spacing:.05em; text-shadow:0 0 8px var(--ft-glow); }
.inv-stats { display:grid; grid-template-columns:auto 1fr; gap:3px 12px; font-size:14px; }
.inv-stats span { color:var(--ft-dim); }
.inv-stats b { font-weight:400; text-align:right; }
.inv-stats .ok { color:#8dffa8; text-shadow:0 0 6px rgba(141,255,168,.5); }
.inv-ask { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; padding:14px; background:rgba(0,0,0,.72); animation:spFade .15s ease; }
.inv-ask-box { max-width:440px; padding:16px 14px 10px; background:#000; border:2px solid var(--ft); box-shadow:0 0 22px var(--ft-bg), inset 0 0 18px var(--ft-bg); }
.inv-ask-box p { margin:0 4px 12px; font-size:16px; line-height:1.4; text-shadow:0 0 8px var(--ft-glow); }
.inv-ready { font-style:normal; font-size:11px; padding:1px 6px; border:1px solid #8dffa8; color:#8dffa8; letter-spacing:.08em; animation:crBlink 1.2s ease-in-out infinite; }
.inv-desc { font-size:14px; line-height:1.35; opacity:.9; }
@media (max-width:560px) { .inv-main { grid-template-columns:1fr; } .inv-list { max-height:30dvh; min-height:90px; } .inv-pic { height:90px; } .inv-tab { font-size:13px; } }
/* Looting, Fallout style */
.ft-loot { background:rgba(0,0,0,.78); justify-content:center; }
.lb-box { display:flex; flex-direction:column; gap:8px; max-width:520px; margin:0; }
.lb-list { display:flex; flex-direction:column; border:1px solid var(--ft-dim); max-height:40dvh; overflow-y:auto; }
.lb-row { display:grid; grid-template-columns:28px 1fr; gap:6px; align-items:center; padding:7px 10px; font-size:16px; border:1px solid transparent; cursor:pointer; }
.lb-row.on { background:var(--ft-bg); border-color:var(--ft); text-shadow:0 0 8px var(--ft-glow); }
.lb-ic { text-align:center; }
.lb-desc { min-height:2.6em; font-size:14px; opacity:.85; }
.lb-take { text-align:center; }
.lb-box .ft-tab { max-width:calc(100% - 28px); }
/* Opening a mystery crate */
.sp-crate { position:fixed; inset:0; z-index:60; background:radial-gradient(ellipse at 50% 45%, rgba(20,24,46,.96), rgba(0,0,0,.99) 70%); animation:spFade .25s ease; touch-action:none; }
.sp-crate.out { opacity:0; transition:opacity .25s; }
.cr-cv { position:absolute; inset:0; width:100%; height:100%; }
.cr-hint { position:absolute; left:0; right:0; bottom:calc(60px + var(--safe-b)); text-align:center; font-size:14px; font-weight:700; color:var(--ink-dim); transition:opacity .3s; animation:crBlink 1.2s ease-in-out infinite; }
@keyframes crBlink { 50% { opacity:.45; } }
.cr-card { position:absolute; left:50%; bottom:calc(36px + var(--safe-b)); transform:translate(-50%, 30px); opacity:0; pointer-events:none; width:min(90vw, 360px); display:flex; flex-direction:column; gap:6px; align-items:center; text-align:center; background:rgba(8,12,24,.92); border:2px solid var(--rc); box-shadow:0 0 28px color-mix(in srgb, var(--rc) 45%, transparent); border-radius:18px; padding:14px 16px; transition:opacity .35s, transform .45s cubic-bezier(.2,1.4,.4,1); }
.cr-card.on { opacity:1; transform:translate(-50%, 0); pointer-events:auto; }
.cr-rar { font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--rc); }
.cr-card b { font-size:18px; }
.cr-desc { font-size:13px; color:var(--ink-dim); }
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
.lc-row { display:flex; gap:8px; align-items:center; font-size:13.5px; font-weight:600; padding:3px 6px; border-radius:8px; background:rgba(255,255,255,.05); }
.lc-ic { width:22px; text-align:center; flex:0 0 auto; }
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
.sp-recipe { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
.sp-rc { font-size:12px; padding:2px 7px; border-radius:8px; border:1px solid rgba(255,122,92,.5); color:#ffb4a0; background:rgba(255,122,92,.08); white-space:nowrap; }
.sp-rc.ok { border-color:rgba(76,217,123,.5); color:#a8f0bf; background:rgba(76,217,123,.08); }
.sp-rc.unknown { border-color:rgba(200,210,230,.3); border-style:dashed; color:var(--ink-dim); background:none; }
.sp-lock { display:flex; flex-direction:column; gap:6px; align-items:flex-start; padding:10px 12px; border-radius:14px; border:1px solid rgba(255,179,71,.55); background:rgba(255,179,71,.1); color:#ffe1b0; font-size:13.5px; }
.sp-lock b { font-size:15px; color:#ffcf80; }
.sf-hp { position:absolute; left:50%; transform:translateX(-50%); bottom:calc(96px + var(--safe-b)); width:min(240px, 46vw); height:18px; pointer-events:none; }
.sp-blrow { display:flex; gap:12px; align-items:flex-end; }
.sp-labbtn { width:54px; height:54px; font-size:24px; border-color:rgba(124,255,106,.65); background:radial-gradient(circle at 35% 30%, rgba(170,255,160,.35), rgba(8,30,14,.9)); animation:spLabIn .35s ease; }
.sp-labn { position:absolute; top:-4px; right:-4px; min-width:20px; height:20px; border-radius:10px; background:#ff5a6e; color:#fff; font-size:12px; font-weight:700; font-style:normal; display:flex; align-items:center; justify-content:center; padding:0 5px; }
@keyframes spLabIn { from { transform:scale(.4); opacity:0; } }
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
.sf-hud .sf-lab { width:52px; height:52px; font-size:24px; border-radius:50%; background:radial-gradient(circle at 35% 30%, rgba(170,255,160,.4), rgba(8,30,14,.92)); border:2px solid rgba(124,255,106,.7); }
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
