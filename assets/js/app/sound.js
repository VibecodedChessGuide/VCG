/* ================= Sound (chess.com's own files, synth as fallback) ================= */
const SND_BASE = "assets/sounds/";
const SND_FILES = {self:"move-self", opp:"move-opponent", capture:"capture", check:"move-check",
  castle:"castle", promote:"promote", end:"game-end", draw:"game-draw", start:"game-start"};
const sndEls = {};
let sndInit = false;
function initSounds(){
  if(sndInit) return; sndInit = true;
  Object.keys(SND_FILES).forEach(k => {
    const a = new Audio(SND_BASE + SND_FILES[k] + ".mp3");
    a.preload = "auto"; a.volume = .85;
    a.addEventListener("error", () => { a._bad = true; });
    sndEls[k] = a;
  });
}
["pointerdown","keydown"].forEach(ev => addEventListener(ev, initSounds, {once:true, passive:true}));
let actx = null;
function synth(kind){
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if(actx.state==="suspended") actx.resume();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const f = kind==="capture" ? 150 : kind==="check" ? 330 : 220;
    o.type = "triangle";
    o.frequency.setValueAtTime(f*1.7, t);
    o.frequency.exponentialRampToValueAtTime(f, t+.05);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(kind==="capture" ? .5 : .35, t+.005);
    g.gain.exponentialRampToValueAtTime(.0001, t + (kind==="capture" ? .17 : .1));
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t+.2);
  }catch(e){}
}
function snd(kind){
  if(!soundOn) return;
  initSounds();
  const a = sndEls[kind];
  if(a && !a._bad){
    try{
      const c = a.cloneNode(); c.volume = a.volume;
      const p = c.play();
      if(p && p.catch) p.catch(() => synth(kind));
      return;
    }catch(e){}
  }
  synth(kind);
}
// chess.com picks the sound by what the move did
function sndKind(m, mine){
  if(/[+#]/.test(m.san)) return "check";
  if(m.promotion) return "promote";
  if(m.flags.includes("k") || m.flags.includes("q")) return "castle";
  if(m.captured) return "capture";
  return mine ? "self" : "opp";
}

