/* ================= Engine (worker pool) ================= */
// One worker boots first so you can play right away. Extra workers start in the background and are
// used for parallel game review and for computing the engine's reply while the analysis checks your move.
const BIG_BUILD = 50e6; // engines above this size are heavy: cap parallel copies and start helpers lazily
let auxOff = false; // set after a worker dies (usually out of memory): stay on a single engine copy
const maxW = () => auxOff ? 1 : Math.max(1, Math.min(BOT().size > BIG_BUILD ? 2 : 4, (navigator.hardwareConcurrency || 2) - 1, (navigator.deviceMemory || 4) < 4 ? 2 : 4));
const workerP = [], cache = new Map();
let engineGen = 0, engineNote = "";
const booting = new Set();

// Multi-threaded Stockfish builds need SharedArrayBuffer (COOP/COEP isolation). When that is
// unavailable, fall back to the single-threaded build of the same engine automatically.
const SAB = typeof SharedArrayBuffer !== "undefined";
const botUrl = b => (SAB || !b.single) ? b.url : b.single;

let progP = null, progT = 0, dlDone = false;
function engineProgress(p){
  if(engineReady) return; // ignore late progress messages once the engine is up
  progP = p;
  if(!progT) progT = setTimeout(() => { progT = 0; if(progP) paintProgress(progP); }, 150);
}
function paintProgress(p){
  const pct = Math.max(0, Math.min(100, Math.round((p.percent || 0) * 100)));
  const fin = pct >= 100;
  if(fin) dlDone = true;
  const txt = fin
    ? "Download complete. Starting " + BOT().name + "… (unpacking a large engine can take a few seconds)"
    : "Downloading " + BOT().name + "… " + pct + "%" +
      (p.speedText ? " · " + p.speedText : "") + (p.etaText ? " · " + p.etaText + " left" : "");
  for(const id of ["eprog","pprog"]){ const b = $(id); if(b){ b.style.display = "block"; b.classList.toggle("indet", fin); } }
  for(const id of ["eprogfill","pprogfill"]){ const f = $(id); if(f) f.style.width = pct + "%"; }
  for(const id of ["eprogtxt","pprogtxt"]){ const t = $(id); if(t){ t.style.display = "block"; t.textContent = txt; } }
  $("esstatus").textContent = txt;
  $("pstatus").textContent = txt;
  $("status").textContent = txt;
  $("dstatus").textContent = txt;
}
function engineProgressReset(prog){
  clearTimeout(progT); progT = 0; progP = null; dlDone = false;
  for(const id of ["eprog","pprog"]){ const b = $(id); if(b){ b.style.display = "block"; b.classList.toggle("indet", !prog); } }
  for(const id of ["eprogfill","pprogfill"]){ const f = $(id); if(f) f.style.width = prog ? "0%" : ""; }
  for(const id of ["eprogtxt","pprogtxt"]){ const t = $(id); if(t){ t.style.display = "block"; t.textContent = "Downloading " + BOT().name + (prog ? "…" : "… (large engine file, please wait)"); } }
}
function engineProgressHide(){
  clearTimeout(progT); progT = 0; progP = null;
  for(const id of ["eprog","pprog"]){ const b = $(id); if(b){ b.style.display = "none"; b.classList.remove("indet"); } }
  for(const id of ["eprogtxt","pprogtxt"]){ const t = $(id); if(t){ t.style.display = "none"; t.textContent = ""; } }
}

function bootWorker(url, onProgress, prog){
  return new Promise((res, rej) => {
    let w;
    try{ w = new Worker(url); }
    catch(e){ return rej(e); }
    booting.add(w);
    let t = null;
    const finish = fn => { clearTimeout(t); booting.delete(w); fn(); };
    const fail = () => { try{ w.terminate(); }catch(e){} finish(() => rej(new Error("timeout"))); };
    const arm = () => { clearTimeout(t); t = setTimeout(fail, 90000); };
    if(onProgress && prog && typeof MessageChannel !== "undefined"){
      const ch = new MessageChannel();
      ch.port1.onmessage = e => { if(e.data && typeof e.data.percent === "number"){ arm(); onProgress(e.data); } };
      w.postMessage({progressPort: ch.port2}, [ch.port2]);
    }
    arm();
    w.onmessage = e => {
      if(!String(e.data).includes("uciok")) return;
      const wk = {w, chain:Promise.resolve(), skill:null, dead:false, abort:null};
      w.onerror = w.onmessageerror = () => { wk.dead = true; if(wk.abort) wk.abort(); };
      finish(() => res(wk));
    };
    w.onerror = err => { try{ w.terminate(); }catch(e){} finish(() => rej(err)); };
    w.postMessage("uci");
  });
}
async function newWorker(onProgress){
  const b = BOT(), url = botUrl(b);
  if(onProgress) engineProgressReset(!!b.prog);
  try{ return await bootWorker(url, onProgress, !!b.prog); }
  catch(e){
    if(b.single && url !== b.single){
      const fb = BOTS.find(x => x.url === b.single) || {};
      engineNote = b.name + " multi-threaded build unavailable; using " + (fb.name || "single-threaded build") + ".";
      if(onProgress) engineProgressReset(!!fb.prog);
      return await bootWorker(b.single, onProgress, !!fb.prog);
    }
    throw e;
  }
}
function getWorker(i){
  return workerP[i] || (workerP[i] = (i===0 ? newWorker(engineProgress) : getWorker(0).then(() => newWorker(null)))
    .catch(e => { if(i===0) throw e; return null; }));
}
// each worker runs one job at a time
function onW(wk, fn){ const p = wk.chain.then(fn); wk.chain = p.catch(() => {}); return p; }
const enqueue = fn => main ? onW(main, fn) : Promise.resolve(null);
function setSkill(wk, v){ if(wk.skill!==v){ wk.skill = v; wk.w.postMessage("setoption name Skill Level value " + v); } }
function stopEngine(){
  engineGen++;
  for(const w of booting){ try{ w.terminate(); }catch(e){} }
  booting.clear();
  if(main){ try{ main.w.terminate(); }catch(e){} main.dead = true; if(main.abort) main.abort(); main = null; }
  if(aux){ try{ aux.w.terminate(); }catch(e){} aux.dead = true; if(aux.abort) aux.abort(); aux = null; }
  engineReady = false;
  spec = null;
  cache.clear(); dcache.clear();
  workerP.length = 0;
}
function renderBots(){
  const el = $("ebots"); if(!el) return;
  el.innerHTML = BOTS.map(b => `<button class="botrow${b.id===botId?" sel":""}" data-bot="${b.id}"><span class="bname">${b.name}</span><small class="bsub">Open-source Stockfish build · ${(b.size/1048576).toFixed(1)} MB${b.single?" · auto single-thread fallback":""}</small></button>`).join("");
}
async function selectBot(id){
  const b = BOTS.find(x => x.id === id);
  if(!b || (id === botId && engineReady)) return;
  botId = id; engineNote = ""; auxOff = false; gameId++;
  renderBots();
  $("esel").textContent = "Selected engine: " + b.name;
  $("plevel").value = b.level;
  $("pnew").disabled = true;
  $("esstatus").textContent = "Loading " + b.name + "…";
  $("pstatus").textContent = "Loading " + b.name + "…";
  $("status").textContent = "Loading " + b.name + "…";
  engineProgressReset(!!b.prog);
  stopEngine();
  pg = null; over = true; awaiting = null; fb = null; hint = null; thinking = false;
  await startEngine(engineGen);
}
$("plevel").onchange = () => { BOT().level = $("plevel").value; };

function bootAux(gen){
  if(auxOff || maxW() < 2 || aux) return;
  idle(() => getWorker(1).then(w => {
    if(!w) return;
    if(gen === engineGen) aux = w;
    else { try{ w.w.terminate(); }catch(e){} }
  }));
}
let recovering = null;
function recoverEngine(){
  if(recovering) return recovering;
  const msg = "The engine stopped responding. Restarting it…";
  $("pstatus").textContent = msg; $("status").textContent = msg; $("esstatus").textContent = msg;
  auxOff = true;
  stopEngine();
  recovering = startEngine(engineGen).finally(() => { recovering = null; });
  return recovering;
}
async function startEngine(gen){
  gen = gen === undefined ? engineGen : gen;
  try{
    main = await getWorker(0);
    if(gen !== engineGen){ try{ main.w.terminate(); }catch(e){} main = null; return; }
    engineReady = true;
    engineProgressHide();
    const note = engineNote ? " (" + engineNote + ")" : "";
    const done = (dlDone ? "Download complete. " : "") + BOT().name + " ready" + note;
    $("esstatus").textContent = done + ".";
    $("status").textContent = done + ". Paste a game, import a file, or choose a demo game.";
    $("pstatus").textContent = done + ". Pick a side and start.";
    $("pnew").disabled = false;
    if(!$("dresults") || $("dresults").classList.contains("hide")) $("dstatus").textContent = done + ". Paste a game and tap Run detector.";
    if(BOT().size <= BIG_BUILD) bootAux(gen); // big builds wait until a game or review actually needs a helper
  }catch(e){
    if(gen !== engineGen) return;
    engineProgressHide();
    const m = "Could not load " + BOT().name + ". Check your connection and reload.";
    $("esstatus").textContent = m;
    $("status").textContent = m; $("pstatus").textContent = m;
  }
}

// Every search goes through runSearch and can never wait forever. After a soft timeout it asks the
// engine to stop (which returns the best move found so far). If the engine still stays silent, the
// worker is marked dead and the job resolves null, so callers can restart the engine instead of hanging.
const SEARCH_BASE_MS = 20000, SEARCH_PER_DEPTH_MS = 2500, STOP_GRACE_MS = 3000, STALL_MS = 8000;
function runSearch(wk, fen, depth, skill, onInfo){
  return new Promise(resolve => {
    if(!wk || wk.dead) return resolve(null);
    let done = false, t = 0, st = 0, stopped = false;
    const finish = v => { if(done) return; done = true; clearTimeout(t); clearTimeout(st); if(wk.abort === abort) wk.abort = null; resolve(v); };
    const abort = () => { wk.dead = true; finish(null); };
    const askStop = () => {
      if(stopped) return; stopped = true;
      try{ wk.w.postMessage("stop"); }catch(err){}
      clearTimeout(t);
      t = setTimeout(() => { wk.dead = true; finish(null); }, STOP_GRACE_MS);
    };
    // stall watchdog: any output from the engine resets it; silence means the worker is stuck or was killed
    const arm = () => { clearTimeout(st); if(!stopped) st = setTimeout(askStop, STALL_MS); };
    wk.abort = abort;
    wk.w.onmessage = e => {
      const l = String(e.data);
      if(l.startsWith("bestmove")) finish({best:l.split(/\s+/)[1]});
      else { arm(); if(onInfo) onInfo(l); }
    };
    t = setTimeout(askStop, SEARCH_BASE_MS + depth * SEARCH_PER_DEPTH_MS);
    arm();
    setSkill(wk, skill);
    wk.w.postMessage("position fen " + fen);
    wk.w.postMessage("go depth " + depth);
  });
}
// resolves null when the engine stopped responding
function analyze(fen, depth, wk){
  wk = wk || main;
  const key = fen + "|" + depth, hit = cache.get(key);
  if(hit) return Promise.resolve(hit);
  const g = new Chess(fen);
  if(g.game_over()){
    let cp = 0, mate = null;
    if(g.in_checkmate()){ cp = g.turn()==="w" ? -10000 : 10000; mate = cp>0?0.5:-0.5; }
    return Promise.resolve({fen, cp, mate, best:null, pv:[]});
  }
  const sign = g.turn()==="w" ? 1 : -1;
  let cp = 0, mate = null, pv = [];
  return runSearch(wk, fen, depth, 20, l => {
    if(l.startsWith("info") && l.includes(" pv ") && !/bound/.test(l)){
      const m = l.match(/score (cp|mate) (-?\d+)/);
      if(m){
        const v = parseInt(m[2],10) * sign;
        if(m[1]==="cp"){ cp = v; mate = null; }
        else { mate = v; cp = (v>0?1:-1) * (10000 - Math.abs(v)*10); }
      }
      pv = l.split(" pv ")[1].trim().split(/\s+/);
    }
  }).then(res => {
    if(!res) return null;
    const best = res.best;
    if(!pv.length && best && best!=="(none)") pv = [best];
    const r = {fen, cp, mate, best: (!best || best==="(none)") ? null : best, pv};
    cache.set(key, r);
    if(cache.size > 800) cache.delete(cache.keys().next().value);
    return r;
  });
}
// resolves the best move in UCI form, or null when the engine stopped responding
async function engineSearch(fen, skill, depth, wk){
  const r = await runSearch(wk || main, fen, depth, skill);
  return r ? r.best : null;
}

