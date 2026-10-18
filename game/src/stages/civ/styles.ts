// Stage-local CSS, injected once (keeps the stage self-contained).
const CSS = `
.layer.civ-hud { pointer-events: none; }
.civ-hud .objective { max-width: calc(100vw - 200px); top: calc(62px + var(--safe-t)) !important; font-weight: 600; color: var(--ink); background: rgba(6,14,24,0.72); }
.civ-hud .hud-top { gap: 6px; }
.civ-prog { min-width: 60px !important; height: 22px; }
.civ-prog .civ-segs { position: absolute; inset: 0; display: flex; }
.civ-prog .civ-segs i { display: block; height: 100%; transition: width .4s ease; }
.civ-prog .bar-text { font-size: 11.5px; white-space: nowrap; overflow: hidden; }
.civ-money { padding: 4px 10px; min-height: 40px; }
.civ-money .mv { font-size: 15px; font-weight: 700; color: var(--sun); line-height: 1.1; }
.civ-money .iv { font-size: 10.5px; color: var(--ink-dim); font-weight: 600; line-height: 1.1; }
.civ-cities { min-height: 40px; }
.civ-cmd { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px calc(8px + var(--safe-r)) calc(8px + var(--safe-b)) calc(8px + var(--safe-l));
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; pointer-events: none;
  background: linear-gradient(180deg, rgba(4,12,22,0), rgba(4,12,22,0.85) 45%); }
.civ-cbtn { pointer-events: auto; height: 58px; border-radius: 16px; border: 1px solid var(--line); background: rgba(12,26,44,0.9);
  color: var(--ink); font: 600 11.5px var(--font); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  position: relative; cursor: pointer; transition: transform .08s, background .15s; padding: 0; }
.civ-cbtn:active { transform: scale(0.94); }
.civ-cbtn .ci { font-size: 22px; line-height: 1; }
.civ-cbtn.on { border-color: var(--teal); background: rgba(62,230,196,0.22); }
.civ-cbtn .badge { position: absolute; top: 4px; right: 6px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--sun); color: #3a2400;
  font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.civ-ctx, .civ-sheet { position: absolute; left: calc(8px + var(--safe-l)); right: calc(8px + var(--safe-r)); bottom: calc(80px + var(--safe-b));
  display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; max-width: 560px; margin: 0 auto; }
.civ-ctx { max-height: 42vh; overflow-y: auto; }
.civ-sheet { max-height: calc(100% - 150px - var(--safe-b) - var(--safe-t)); }
.civ-sheet .sh-head { display: flex; align-items: center; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.civ-sheet .sh-body { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; min-height: 0; padding-bottom: 2px; }
.civ-row { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); border: 1px solid var(--line); border-radius: 14px; padding: 8px 10px; color: var(--ink); font-family: var(--font); }
.civ-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.7); flex: 0 0 auto; }
.civ-lab { font-size: 11.5px; color: var(--ink-dim); font-weight: 600; margin: 2px 0 3px; }
.civ-bar { position: relative; height: 16px; border-radius: 8px; background: rgba(0,0,0,0.45); border: 1px solid var(--line); overflow: hidden; }
.civ-bar > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; transition: width .2s; }
.civ-bar > span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; text-shadow: 0 1px 2px #000; }
.civ-filters { display: flex; gap: 6px; flex-wrap: wrap; }
.cbtn { font: 600 14px var(--font); min-height: 44px; padding: 8px 12px; }
.cbtn .cost { font-size: 12.5px; opacity: .85; font-weight: 700; margin-left: 4px; }
.civ-row .btn.primary .cost { color: #053a2e; }
.civ-target { position: absolute; top: calc(66px + var(--safe-t)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
  background: var(--glass-strong); border: 1px solid rgba(255,209,102,0.7); border-radius: 16px; padding: 6px 6px 6px 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); white-space: nowrap; }
.civ-power { width: 100%; cursor: pointer; text-align: left; }
.civ-power.off { opacity: 0.62; }
.civ-power.sw { border-color: rgba(255,209,102,0.6); background: linear-gradient(90deg, rgba(255,209,102,0.12), rgba(255,255,255,0.04)); }
.civ-power .cost { color: var(--sun); font-weight: 700; font-size: 13px; }
.civ-ab { position: relative; width: 52px; height: 52px; flex: 0 0 auto; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px;
  background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.25), rgba(10,25,45,0.85)); border: 2px solid rgba(255,255,255,0.35); }
.civ-ab.sw { border-color: var(--sun); }
.civ-ab .civ-cd { position: absolute; inset: 0; border-radius: 50%; }
.civ-debug { position: absolute; left: calc(10px + var(--safe-l)); top: calc(110px + var(--safe-t)); display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.civ-debug .dbg { min-height: 44px; background: rgba(120,40,160,0.75); }
.civ-planner canvas { width: 100%; height: 230px; display: block; border-radius: 12px; background: radial-gradient(ellipse at 50% 45%, #6f9a5e, #3f6a45); touch-action: none; }
.civ-pl-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.civ-pl-stats > div { background: rgba(255,255,255,0.06); border: 1px solid var(--line); border-radius: 10px; padding: 4px 6px; text-align: center; font-size: 11px; color: var(--ink-dim); }
.civ-pl-stats b { display: block; font-size: 15px; color: var(--ink); }
.civ-pl-pick { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.civ-pl-pick .btn { min-height: 48px; font-size: 14px; }
.civ-intro-art { width: 100%; height: 150px; display: block; border-radius: 12px; background: radial-gradient(ellipse at 50% 60%, #49688a, #1b2b40); margin-bottom: 8px; }
@media (min-width: 700px) { .civ-ctx, .civ-sheet { right: auto; width: 520px; } .civ-cmd { max-width: 560px; left: 50%; transform: translateX(-50%); } }
`;

let injected = false;
export function injectCivStyles() {
  if (injected || document.getElementById('civ-styles')) { injected = true; return; }
  const el = document.createElement('style');
  el.id = 'civ-styles';
  el.textContent = CSS;
  document.head.append(el);
  injected = true;
}
