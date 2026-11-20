/* ================= Opponent bots (play only) =================
   These engines are opponents, never evaluators. Analysis, review, hints and the detector
   keep using the Stockfish worker in engine.js. Each bot gets its own UCI worker here. */
let playWk = null, playWkId = "", playLoading = null, playLoadingId = "", playGen = 0;

function playBotWorker(){ return playWk && !playWk.dead ? playWk : null; }
function stopPlayBotEngine(){
  playGen++;
  if(playWk){
    try{ if(playWk.abort) playWk.abort(); }catch(e){}
    try{ playWk.w.terminate(); }catch(e){}
    playWk.dead = true;
  }
  playWk = null; playWkId = ""; playLoading = null; playLoadingId = "";
}
async function ensurePlayBotEngine(){
  const b = PLAY_BOT();
  if(!b || !b.url) return null;
  if(playWk && !playWk.dead && playWkId === b.id) return playWk;
  if(playLoading){
    if(playLoadingId === b.id) return playLoading;
    stopPlayBotEngine();
  }
  const gen = playGen;
  const p = (async () => {
    setP("Loading " + b.name + "…");
    let wk = null;
    try{ wk = await newWorker(null, b); }
    catch(e){
      if(gen === playGen) setP("Could not load " + b.name + ". The analysis engine will play this game.");
      return null;
    }
    if(gen !== playGen){ try{ wk.w.terminate(); }catch(e){} wk.dead = true; return null; }
    for(const cmd of b.setup || []) wk.w.postMessage(cmd);
    playWk = wk; playWkId = b.id;
    setP(b.name + " is ready.");
    return wk;
  })();
  playLoading = p; playLoadingId = b.id;
  p.finally(() => { if(playLoading === p){ playLoading = null; playLoadingId = ""; } });
  return p;
}
function playBotDepth(level, b){
  const d = (b || PLAY_BOT()).depths || {};
  return d[level] || d.casual || 4;
}
function playBotPosition(fen, moves, b){
  b = b || PLAY_BOT();
  if(b.startpos){
    const list = (moves || []).map(m => m.slice(0, 4) + (m.slice(4, 5) || "").toLowerCase());
    return "position startpos" + (list.length ? " moves " + list.join(" ") : "");
  }
  return "position fen " + fen;
}
function playBotSearch(fen, level, moves){
  const b = PLAY_BOT();
  if(!b || !b.url) return Promise.resolve(null);
  // startpos-only bots cannot be given a custom (sandbox) start position, so Stockfish answers for them there
  if(b.startpos && gameStartFen) return Promise.resolve(null);
  return ensurePlayBotEngine().then(wk => {
    if(!wk || playWkId !== b.id) return null;
    const run = () => {
      for(const cmd of b.pre || []) wk.w.postMessage(cmd);
      return runSearchRaw(wk, fen, playBotDepth(level, b), null, null, playBotPosition(fen, moves, b));
    };
    const p = (wk.lock || Promise.resolve()).then(run);
    wk.lock = p.catch(() => {});
    return p;
  }).then(r => {
    if(!r){
      if(playWk && playWk.dead){ stopPlayBotEngine(); setP(b.name + " stopped responding. Stockfish will take over its next move."); }
      return null;
    }
    return (!r.best || r.best === "(none)") ? null : r.best;
  });
}
function renderPlayBotOptions(){
  const sel = $("pbotsel");
  if(!sel) return;
  sel.innerHTML = PLAY_BOTS.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
  sel.value = playBotId;
}
function renderPlayBots(){
  const el = $("pbotlist");
  if(!el) return;
  el.innerHTML = PLAY_BOTS.map(b => {
    const sub = b.url
      ? `${b.desc} · ${(b.size / 1024).toFixed(0)} KB`
      : b.desc;
    return `<button class="botrow${b.id === playBotId ? " sel" : ""}" data-playbot="${b.id}"><span class="bname">${b.name}</span><small class="bsub">${sub}</small></button>`;
  }).join("");
}
function selectPlayBot(id){
  const b = PLAY_BOTS.find(x => x.id === id);
  if(!b) return;
  if(b.id === playBotId && (!b.url || playBotWorker() || (playLoading && playLoadingId === b.id))){ renderPlayBots(); renderPlayBotOptions(); return; }
  playBotId = b.id;
  try{ localStorage.setItem(PLAY_BOT_KEY, playBotId); }catch(e){}
  stopPlayBotEngine();
  $("plevel").value = b.url ? (b.level || "casual") : (BOT().level || "casual");
  renderPlayBots(); renderPlayBotOptions();
  if(typeof setNames === "function" && pg) setNames();
  if(typeof renderPlay === "function" && pg) renderPlay();
  if(b.url) idle(() => ensurePlayBotEngine());
}
function initPlayBots(){
  renderPlayBotOptions(); renderPlayBots();
  const sel = $("pbotsel");
  if(sel) sel.onchange = () => selectPlayBot(sel.value);
  const list = $("pbotlist");
  if(list) list.onclick = e => {
    const r = e.target.closest("[data-playbot]");
    if(r) selectPlayBot(r.dataset.playbot);
  };
}
initPlayBots();
