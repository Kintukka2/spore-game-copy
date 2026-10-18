// Stage-local CSS, injected once. Kept here so the stage stays self-contained.
const CSS = `
body.cell-active .toasts { top: calc(170px + var(--safe-t)); }
.cell-vitals { position: absolute; left: calc(10px + var(--safe-l)); top: calc(58px + var(--safe-t)); display: flex; flex-direction: column; gap: 5px; pointer-events: none !important; padding: 7px 10px 8px; border-radius: 14px; background: rgba(2,14,24,0.42); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.cell-vrow { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; line-height: 1; }
.cell-vrow .ic { width: 18px; text-align: center; font-size: 14px; }
.cell-meter { position: relative; width: 132px; height: 11px; border-radius: 999px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.14); overflow: hidden; }
.cell-meter .fill { position: absolute; inset: 0 auto 0 0; width: 100%; border-radius: 999px; background: linear-gradient(90deg, #d23b4f, #ff6b6b); transition: width .2s ease; }
.cell-meter.low .fill { animation: cellLow .7s ease-in-out infinite; }
@keyframes cellLow { 50% { filter: brightness(1.6); } }
.cell-hpnum { min-width: 26px; font-size: 12px; color: var(--ink-dim); text-align: right; }
.cell-diet { background: linear-gradient(90deg, #3fbf6a 0%, #4cd97b 33%, #3d8fe0 36%, #4aa8ff 64%, #e0473e 67%, #ff5a4f 100%); }
.cell-diet .mk { position: absolute; top: -2px; bottom: -2px; width: 5px; margin-left: -2.5px; border-radius: 3px; background: #fff; box-shadow: 0 0 6px rgba(255,255,255,0.9), 0 0 0 1px rgba(0,0,0,0.6); transition: left .35s ease; }
.cell-diet-lbl { font-size: 11px; color: var(--ink-dim); font-weight: 600; letter-spacing: .02em; min-width: 26px; }
.cell-objective { position: absolute; left: calc(10px + var(--safe-l)); top: calc(126px + var(--safe-t)); max-width: min(62vw, 300px); font-size: 13px; font-weight: 600; color: #eaf7ff; padding: 7px 11px; border-radius: 12px; background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.1); pointer-events: none !important; transition: opacity .3s, transform .3s; }
.cell-objective.flash { animation: cellObj .9s ease; }
@keyframes cellObj { 0% { transform: scale(1); } 30% { transform: scale(1.08); background: rgba(62,230,196,0.35); } 100% { transform: scale(1); } }
.cell-dna { font-variant-numeric: tabular-nums; }
.cell-dna.bump { animation: cellBump .35s ease; }
@keyframes cellBump { 40% { transform: scale(1.18); background: rgba(62,230,196,0.35); } }
.ability.mate { width: 70px; height: 70px; border-color: rgba(255,122,184,0.8); background: radial-gradient(circle at 35% 30%, rgba(255,190,220,0.4), rgba(60,10,40,0.85)); }
.ability.mate.locked { filter: grayscale(0.85); opacity: 0.55; }
.ability.mate.ready { animation: cellMate 1.3s ease-in-out infinite; }
@keyframes cellMate { 0%,100% { box-shadow: 0 4px 14px rgba(0,0,0,0.4), 0 0 0 0 rgba(255,122,184,0.7); } 50% { box-shadow: 0 4px 14px rgba(0,0,0,0.4), 0 0 0 12px rgba(255,122,184,0); transform: scale(1.06); } }
.cell-badge { position: absolute; top: -6px; left: -8px; background: #ffd166; color: #3a2400; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 8px; pointer-events: none; }
.cell-brain { position: absolute; left: 50%; bottom: calc(120px + var(--safe-b)); transform: translateX(-50%); font-size: 20px; padding: 16px 26px; min-height: 58px; animation: cellBrain 1.4s ease-in-out infinite; box-shadow: 0 0 30px rgba(255,209,102,0.6); }
@keyframes cellBrain { 50% { transform: translateX(-50%) scale(1.07); box-shadow: 0 0 46px rgba(255,209,102,0.9); } }
.cell-debug { position: absolute; right: calc(10px + var(--safe-r)); top: calc(62px + var(--safe-t)); display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.cell-debug .btn { font-size: 12px; padding: 6px 10px; min-height: 32px; background: rgba(120,40,160,0.55); }
.cell-choice { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: calc(24px + var(--safe-t)) 14px calc(24px + var(--safe-b)); background: radial-gradient(ellipse at 50% 40%, rgba(4,30,40,0.35), rgba(1,8,14,0.82)); transition: opacity .45s ease; text-align: center; }
.cell-choice.out { opacity: 0; pointer-events: none !important; }
.cell-choice h1 { font-size: clamp(24px, 7vw, 34px); line-height: 1.1; text-shadow: 0 4px 20px rgba(0,0,0,0.6); }
.cell-choice .sub { color: var(--ink-dim); font-size: 15px; max-width: 360px; }
.cell-cards { display: flex; gap: 12px; width: min(440px, 100%); }
.cell-card { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 10px 14px; border-radius: 20px; cursor: pointer; color: var(--ink); font-family: var(--font); border: 2px solid rgba(255,255,255,0.18); background: rgba(6,24,36,0.82); box-shadow: 0 12px 34px rgba(0,0,0,0.45); transition: transform .12s ease, border-color .2s; }
.cell-card:active { transform: scale(0.96); }
.cell-card.herb { border-color: rgba(76,217,123,0.65); background: linear-gradient(180deg, rgba(30,90,55,0.85), rgba(6,24,36,0.9)); }
.cell-card.carn { border-color: rgba(255,90,79,0.65); background: linear-gradient(180deg, rgba(110,30,30,0.85), rgba(6,24,36,0.9)); }
.cell-card canvas { width: 100%; height: 110px; }
.cell-card .nm { font-size: 20px; font-weight: 700; }
.cell-card .mouth { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-dim); }
.cell-card .ds { font-size: 13px; color: var(--ink-dim); line-height: 1.35; min-height: 52px; }
.cell-card .go { margin-top: auto; font-size: 15px; font-weight: 700; padding: 9px 16px; border-radius: 999px; background: rgba(255,255,255,0.14); }
.cell-card.herb .go { background: linear-gradient(180deg, #6ff0a0, #1f9a54); color: #032312; }
.cell-card.carn .go { background: linear-gradient(180deg, #ff8a80, #c22f2a); color: #2a0400; }
@media (max-height: 560px) {
  .cell-choice { gap: 8px; justify-content: center; overflow-y: auto; }
  .cell-choice .title-tag, .cell-choice .sub, .cell-choice .faint { display: none; }
  .cell-choice h1 { font-size: 22px; }
  .cell-card { padding: 8px 10px 10px; gap: 3px; }
  .cell-card canvas { height: 72px; }
  .cell-card .ds { min-height: 0; font-size: 12px; }
  .cell-card .go { padding: 7px 14px; }
}
.cell-caption { position: absolute; left: 0; right: 0; bottom: calc(110px + var(--safe-b)); text-align: center; font-size: 19px; font-weight: 600; color: #fff8e6; padding: 0 24px; text-shadow: 0 2px 12px rgba(0,0,0,0.8); opacity: 0; transition: opacity .8s ease; pointer-events: none !important; }
.cell-caption.on { opacity: 1; }
`;

let injected = false;
export function injectCellStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'cell-stage-styles';
  s.textContent = CSS;
  document.head.append(s);
}
