/* ================= Tabs ================= */
function showTab(t){
  document.body.dataset.tab = t;
  $("playPanel").classList.toggle("hide", t!=="play");
  $("friendsPanel").classList.toggle("hide", t!=="friends");
  $("learnPanel").classList.toggle("hide", t!=="learn");
  $("reviewPanel").classList.toggle("hide", t!=="review");
  $("openPanel").classList.toggle("hide", t!=="open");
  $("enginePanel").classList.toggle("hide", t!=="engine");
  $("detectPanel").classList.toggle("hide", t!=="detect");
  $("tabPlay").classList.toggle("on", t==="play");
  $("tabFriends").classList.toggle("on", t==="friends");
  if(t==="friends"){ if(!fg) fStart(); else fRender(); }
  $("tabLearn").classList.toggle("on", t==="learn");
  $("tabReview").classList.toggle("on", t==="review");
  $("tabOpen").classList.toggle("on", t==="open");
  $("tabEngine").classList.toggle("on", t==="engine");
  $("tabDetect").classList.toggle("on", t==="detect");
  if(t!=="learn"){ learnToken++; if(LP===null && !$("lpuz").classList.contains("hide")) lHome(); } // leaving Learn cancels any puzzle being built
  if(t==="learn"){ lLoadPack(); if(!engineReady) startEngine(engineGen); if(!LP && !$("lpuz").classList.contains("hide")) lHome(); lDraw(); }
  if(t==="open") renderOpenList();
  if(t==="engine" && !engineReady) startEngine(engineGen);
  if(t==="detect"){ if(!engineReady) startEngine(engineGen); else for(let i=0;i<maxW();i++) getWorker(i); }
  if(t==="review" && engineReady) for(let i=0;i<maxW();i++) getWorker(i); // warm up helper workers
}
$("tabPlay").onclick = () => showTab("play");
$("tabFriends").onclick = () => showTab("friends");
$("tabLearn").onclick = () => showTab("learn");
$("tabReview").onclick = () => showTab("review");
$("tabOpen").onclick = () => showTab("open");
$("tabEngine").onclick = () => showTab("engine");
$("tabDetect").onclick = () => showTab("detect");
// Full screen toggle (falls back to a focus mode where the API is unavailable, e.g. iPhone Safari)
const fsBtn = $("fsbtn");
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function fsPaint(){
  const on = !!fsEl() || document.body.classList.contains("cssfs");
  fsBtn.innerHTML = on
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z"/></svg><span>Exit full screen</span>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg><span>Full screen</span>';
  fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
}
async function fsToggle(){
  try{
    if(fsEl()){
      if(document.exitFullscreen) await document.exitFullscreen();
      else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
      document.body.classList.remove("cssfs");
    }else if(document.body.classList.contains("cssfs")){
      document.body.classList.remove("cssfs");
    }else{
      const el = document.documentElement;
      if(el.requestFullscreen) await el.requestFullscreen();
      else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else document.body.classList.add("cssfs");
    }
  }catch(e){
    if(!fsEl()) document.body.classList.add("cssfs");
  }
  fsPaint();
}
fsBtn.onclick = fsToggle;
for(const ev of ["fullscreenchange","webkitfullscreenchange"]){
  document.addEventListener(ev, () => { if(!fsEl()) document.body.classList.remove("cssfs"); fsPaint(); });
}
fsPaint();

// Cache engine files (cache-first) so big Stockfish builds download only once.
if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register("sw.js").catch(e => console.warn("Engine cache unavailable:", e));
  if(location.hostname.endsWith("github.io")) navigator.serviceWorker.register("/VCG-engines/sw.js", {scope:"/VCG-engines/"}).catch(() => {});
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
drawBoard($("pboard"), new Chess().fen(), [], [], {});
drawTallyInto($("ptally"), []);
// let the board, pieces and sounds load first, then start the big engine download
let engineBooted = false;
const bootEngine = () => { if(engineBooted) return; engineBooted = true; startEngine(engineGen); };
if(document.readyState === "complete") bootEngine();
else { addEventListener("load", bootEngine, {once:true}); setTimeout(bootEngine, 3000); }
idle(loadOpenings);

// Shared link (?z=... or legacy ?pgn=...): open Review and start the analysis as soon as Stockfish is ready.
(async function(){
  let text = null, sd = null, depth = null, z = null;
  new URLSearchParams(location.search).forEach((v, k) => {
    k = k.toLowerCase();
    if(k==="pgn" && v.trim() && text===null) text = v.trim();
    if(k==="side") sd = v;
    if(k==="depth") depth = v;
    if(k==="z" && v.trim()) z = v.trim();
  });
  if(z){
    const data = await unpackShare(z);
    if(data){
      if(typeof data.p === "string") text = data.p.trim();
      if(data.s) sd = data.s;
      if(data.d) depth = data.d;
    }
  }
  if(text===null) return;
  $("pgn").value = text;
  $("side").value = ["w","b","wb"].includes(sd) ? sd : "wb";
  if(["8","10","13"].includes(String(depth))) $("depth").value = String(depth);
  showTab("review");
  const probe = new Chess();
  if(!probe.load_pgn(text, {sloppy:true}) || !probe.history().length){
    $("status").textContent = "The shared link doesn't contain a readable game. Paste a PGN or a chess.com link below.";
    return;
  }
  $("status").textContent = "Shared game loaded. Waiting for Stockfish to start the analysis…";
  const t0 = Date.now();
  const go = () => {
    if(engineReady) return run();
    if(Date.now() - t0 > 240000){ $("status").textContent = "Stockfish took too long to start. Reload the page to try again."; return; }
    setTimeout(go, 300);
  };
  go();
})();
