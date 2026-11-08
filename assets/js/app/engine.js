/* ================= Engine (worker pool) ================= */
// One worker boots first so you can play right away. Extra workers start in the background and are
// used for parallel game review and for computing the engine's reply while the analysis checks your move.
const BIG_BUILD = 50e6; // engines above this size are heavy: cap parallel copies and start helpers lazily
let auxOff = false; // set after a worker dies (usually out of memory): stay on a single engine copy
// Phones and low-memory devices can't hold two copies of a ~100 MB engine, so there the standby is a tiny Lite build.
const FORCE_FULL_STANDBY = false; // set true to always use a full-size standby
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || ""));
const LOW_RAM = !FORCE_FULL_STANDBY && (IS_MOBILE || (navigator.deviceMemory && navigator.deviceMemory < 8));
const liteStandby = () => LOW_RAM && BOT().size > BIG_BUILD;
const standbyBuild = () => liteStandby() ? (BOTS.find(b => b.id === "sf19ls") || BOTS.find(b => b.size <= BIG_BUILD) || BOT()) : BOT();
const maxW = () => auxOff || liteStandby() ? 1 : Math.max(1, Math.min(BOT().size > BIG_BUILD ? 2 : 4, (navigator.hardwareConcurrency || 2) - 1, (navigator.deviceMemory || 4) < 4 ? 2 : 4));
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
      w.onerror = w.onmessageerror = () => { wk.crashed = true; wk.dead = true; console.warn("[engine] worker crashed"); if(wk.abort) wk.abort(); };
      finish(() => res(wk));
    };
    w.onerror = err => { try{ w.terminate(); }catch(e){} finish(() => rej(err)); };
    w.postMessage("uci");
  });
}
const patchedEngineURLs = new Map();
async function patchedEngineUrl(url){
  if(patchedEngineURLs.has(url)) return patchedEngineURLs.get(url);
  const p = (async () => {
    const res = await fetch(url, {credentials:"same-origin"});
    if(!res.ok) throw new Error("HTTP " + res.status + " while loading the engine.");
    let src = await res.text();
    const marker = 'r.ccall=(e,t,n,a,o)=>{';
    if(src.indexOf(marker) < 0) throw new Error("This engine build cannot load an imported NNUE.");
    const wasm = new URL(url.replace(/\.js(?:[?#].*)?$/i, ".wasm"), location.href).href;
    const fs = 'r.FS={writeFile:function(p,d){var f=de(p,"w",511);return me(f,d,0,d.length)},readFile:function(p){var f=de(p,"r",0),n=f.node.J,o=new Uint8Array(n);f.F.read(f,o,0,n,0);return o}};globalThis.__sfFS=r.FS;';
    src = src.replace(marker, fs + marker);
    const hashExpr = 'a=self.location.hash.substr(1).split(",")';
    if(src.indexOf(hashExpr) < 0) throw new Error("This engine build cannot load an imported NNUE.");
    src = src.replace(hashExpr, 'a=globalThis.__nnueWasm?[encodeURIComponent(globalThis.__nnueWasm)]:self.location.hash.substr(1).split(",")');
    src = 'globalThis.__nnueWasm=' + JSON.stringify(wasm) + ';\n' + src;
    src += '\n(function(){var o=globalThis.onmessage;if(typeof o!=="function")return;globalThis.onmessage=function(e){var d=e&&e.data;if(d&&typeof d==="object"&&d.__nnue){try{globalThis.__sfFS.writeFile(d.path,new Uint8Array(d.data));o({data:"setoption name EvalFile value "+d.path});o({data:"isready"});}catch(err){postMessage("info string NNUE load failed: "+err);}}else{return o(e);}};})();\n';
    return URL.createObjectURL(new Blob([src], {type:"text/javascript"}));
  })();
  patchedEngineURLs.set(url, p);
  p.catch(() => patchedEngineURLs.delete(url));
  return p;
}
async function newWorker(onProgress, bot, opts){
  const b = bot || BOT(), url = botUrl(b), patch = !!(opts && opts.nnue);
  if(onProgress) engineProgressReset(!!b.prog);
  try{ return await bootWorker(patch ? await patchedEngineUrl(url) : url, onProgress, !!b.prog); }
  catch(e){
    if(b.single && url !== b.single){
      const fb = BOTS.find(x => x.url === b.single) || {};
      engineNote = b.name + " multi-threaded build unavailable; using " + (fb.name || "single-threaded build") + ".";
      if(onProgress) engineProgressReset(!!fb.prog);
      return await bootWorker(patch ? await patchedEngineUrl(b.single) : b.single, onProgress, !!fb.prog);
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
  botId = id; engineNote = ""; auxOff = false; respawnFails = 0; gameId++;
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
  if(auxOff || aux) return;
  idle(() => respawnBackup(gen));
}
// ---- Hot standby: two engines. If one dies, the other takes over at once and a replacement is started in the background. ----
let respawnFails = 0;
function respawnBackup(gen){
  if(gen !== engineGen || auxOff || aux) return;
  if(workerP[1]){ workerP[1].then(w => { if(w && !w.dead && gen === engineGen && !aux) aux = w; }); return; }
  const sb = standbyBuild();
  const p = newWorker(null, sb).then(w => {
    if(gen !== engineGen){ try{ w.w.terminate(); }catch(e){} return null; }
    w.lite = sb !== BOT();
    aux = w; respawnFails = 0; return w;
  }).catch(() => {
    if(gen === engineGen){
      console.warn("[engine] standby failed to start (" + (respawnFails+1) + "/3)");
      if(++respawnFails >= 3) auxOff = true; else setTimeout(() => respawnBackup(gen), 3000);
    }
    return null;
  }).then(w => { if(!w && workerP[1] === p) workerP[1] = undefined; return w; });
  workerP[1] = p;
}
// Swap in the standby when `dead` has stopped. Returns the live worker to continue on, or null if none is left.
function failover(dead){
  const alive = () => (main && !main.dead) ? main : null;
  if(!dead) return alive();
  const gen = engineGen;
  if(dead === main){
    if(!(aux && !aux.dead)) return null;
    try{ main.w.terminate(); }catch(e){}
    console.warn("[engine] main engine died: standby promoted, starting a new standby");
    main = aux; aux = null;
    workerP[0] = Promise.resolve(main); workerP[1] = undefined;
    if(main.lite) $("esstatus").textContent = "Running on the backup engine (" + standbyBuild().name + "). Reload to get the full engine back.";
    respawnBackup(gen);
    return main;
  }
  if(dead === aux){
    try{ aux.w.terminate(); }catch(e){}
    console.warn("[engine] standby died: restarting it");
    aux = null; workerP[1] = undefined;
    respawnBackup(gen);
  }
  return alive();
}
let recovering = null;
function recoverEngine(){
  if(recovering) return recovering;
  // a healthy engine is still around: swap it in and restart the dead one in the background (no interruption)
  if(main && main.dead){ if(failover(main)) return Promise.resolve(); }
  else if(main){ if(aux && aux.dead) failover(aux); return Promise.resolve(); }
  if(recovering) return recovering;
  const msg = "The engine stopped responding. Restarting it…";
  $("pstatus").textContent = msg; $("status").textContent = msg; $("esstatus").textContent = msg;
  if((main && main.crashed) || (aux && aux.crashed)) auxOff = true; // only a real crash (usually out of memory) disables helpers
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
    bootAux(gen); // always keep a second engine ready as a hot standby
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
const SEARCH_BASE_MS = 20000, SEARCH_PER_DEPTH_MS = 2500, STOP_GRACE_MS = 8000, STALL_MS = 15000, FIRST_STALL_MS = 45000;
function runSearch(wk, fen, depth, skill, onInfo){
  if(!wk || wk.dead) return Promise.resolve(null);
  const p = (wk.lock || Promise.resolve()).then(() => runSearchRaw(wk, fen, depth, skill, onInfo));
  wk.lock = p.catch(() => {});
  return p;
}
function runSearchRaw(wk, fen, depth, skill, onInfo){
  return new Promise(resolve => {
    if(!wk || wk.dead) return resolve(null);
    let done = false, t = 0, st = 0, stopped = false;
    const t0 = Date.now();
    const kill = why => { console.warn("[engine] worker declared dead (" + why + ") after " + (Date.now()-t0) + "ms, depth " + depth + ", first=" + !wk.warm); wk.dead = true; finish(null); };
    const finish = v => { if(done) return; done = true; clearTimeout(t); clearTimeout(st); if(wk.abort === abort) wk.abort = null; resolve(v); };
    const abort = () => { wk.dead = true; finish(null); };
    const askStop = () => {
      if(stopped) return; stopped = true;
      try{ wk.w.postMessage("stop"); }catch(err){}
      clearTimeout(t);
      t = setTimeout(() => kill("no bestmove after stop"), STOP_GRACE_MS);
    };
    // stall watchdog: any output from the engine resets it; silence means the worker is stuck or was killed
    const arm = () => { clearTimeout(st); if(!stopped) st = setTimeout(() => { console.warn("[engine] stall: no output"); askStop(); }, wk.warm ? STALL_MS : FIRST_STALL_MS); };
    wk.abort = abort;
    wk.w.onmessage = e => {
      const l = String(e.data);
      if(l.startsWith("bestmove")){ wk.warm = true; finish({best:l.split(/\s+/)[1]}); }
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
    if(!res){ const alt = failover(wk); return alt ? onW(alt, () => analyze(fen, depth, alt)) : null; } // same position again on the standby
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
  wk = wk || main;
  let r = await runSearch(wk, fen, depth, skill);
  if(!r){ const alt = failover(wk); if(alt) r = await onW(alt, () => runSearch(alt, fen, depth, skill)); }
  return r ? r.best : null;
}

