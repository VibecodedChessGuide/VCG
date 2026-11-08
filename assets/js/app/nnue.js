const NNUE_DB = "vcg-nnue", NNUE_ACTIVE_KEY = "vcg.nnue.opponent";
let nnueRows = [], nnueActive = "", nnuePending = null, nnueDBP = null;
let oppWk = null, oppNetId = "", oppLoading = null, oppGen = 0, oppFail = "", oppLoadCancel = null;
try{ nnueActive = localStorage.getItem(NNUE_ACTIVE_KEY) || ""; }catch(e){}

function nnueEsc(s){
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
}
function nnueStatus(msg, bad){
  const el = $("nnuemsg");
  if(el){ el.textContent = msg || ""; el.style.color = bad ? "var(--bad)" : ""; }
}
function nnueSize(n){
  if(n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
  if(n >= 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}
function nnueDB(){
  if(nnueDBP) return nnueDBP;
  nnueDBP = new Promise((res, rej) => {
    if(!window.indexedDB) return rej(new Error("This browser cannot save imported networks."));
    let r;
    try{ r = indexedDB.open(NNUE_DB, 1); }catch(e){ return rej(e); }
    r.onupgradeneeded = () => {
      const db = r.result;
      if(!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", {keyPath:"id"});
      if(!db.objectStoreNames.contains("data")) db.createObjectStore("data");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error("Could not open network storage."));
    r.onblocked = () => rej(new Error("Network storage is blocked by another tab."));
  });
  return nnueDBP;
}
function nnueReq(r){
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function nnueAll(){
  const db = await nnueDB();
  const rows = await nnueReq(db.transaction("meta", "readonly").objectStore("meta").getAll());
  rows.sort((a, b) => (b.added || 0) - (a.added || 0));
  return rows;
}
async function nnueData(id){
  const db = await nnueDB();
  return nnueReq(db.transaction("data", "readonly").objectStore("data").get(id));
}
async function nnuePut(meta, data){
  const db = await nnueDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(["meta", "data"], "readwrite");
    tx.objectStore("meta").put(meta);
    tx.objectStore("data").put(data, meta.id);
    tx.oncomplete = () => res(meta);
    tx.onerror = () => rej(tx.error || new Error("Could not save the network."));
    tx.onabort = () => rej(tx.error || new Error("Could not save the network."));
  });
}
async function nnueRemove(id){
  const db = await nnueDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(["meta", "data"], "readwrite");
    tx.objectStore("meta").delete(id);
    tx.objectStore("data").delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error("Could not delete the network."));
    tx.onabort = () => rej(tx.error || new Error("Could not delete the network."));
  });
}
function nnueRowHTML(id, name, meta, active, builtin){
  const use = active ? `<span class="tip">In use</span>` : `<button type="button" class="ghost" data-nnue-use="${nnueEsc(id)}">Use</button>`;
  const del = builtin ? "" : `<button type="button" class="ghost" data-nnue-del="${nnueEsc(id)}">Delete</button>`;
  return `<div class="nnuerow${active ? " sel" : ""}"><div class="ninfo"><div class="nname">${nnueEsc(name)}</div><div class="nmeta">${nnueEsc(meta)}</div></div><div class="nact">${use}${del}</div></div>`;
}
function renderNNUE(){
  const el = $("nnuelist");
  if(!el) return;
  const rows = nnueRows.map(r => nnueRowHTML(r.id, r.name, nnueSize(r.size) + " - added " + new Date(r.added).toLocaleDateString(), r.id === nnueActive, false));
  el.innerHTML = nnueRowHTML("", "Stockfish built-in network", "Default network for the opponent and analysis", !nnueActive, true) + rows.join("");
}
function setActiveNNUE(id){
  id = id || "";
  if(id && !nnueRows.some(r => r.id === id)) return;
  nnueActive = id;
  oppFail = "";
  try{ id ? localStorage.setItem(NNUE_ACTIVE_KEY, id) : localStorage.removeItem(NNUE_ACTIVE_KEY); }catch(e){}
  stopOpponentEngine();
  renderNNUE();
  const rec = nnueRows.find(r => r.id === nnueActive);
  nnueStatus(rec ? "Opponent uses " + rec.name + ". Analysis stays on the built-in network." : "Opponent uses Stockfish's built-in network.");
  if(id) idle(() => ensureOpponentEngine());
}
async function deleteNNUE(id){
  const rec = nnueRows.find(r => r.id === id);
  if(!rec) return;
  if(!confirm('Delete "' + rec.name + '" from imported networks?')) return;
  try{ await nnueRemove(id); }
  catch(e){ nnueStatus(e.message || "Could not delete the network.", true); return; }
  nnueRows = nnueRows.filter(r => r.id !== id);
  if(nnueActive === id) setActiveNNUE("");
  renderNNUE();
  nnueStatus('Deleted "' + rec.name + '".');
}
function nnueChoose(){
  const f = $("nnuefile");
  if(f){ f.value = ""; f.click(); }
}
function nnueFilePicked(e){
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  if(!/\.nnue$/i.test(f.name)){ nnueStatus("Choose a .nnue file.", true); return; }
  if(!f.size){ nnueStatus("That file is empty.", true); return; }
  if(f.size > 128 * 1024 * 1024){ nnueStatus("That network is larger than 128 MB.", true); return; }
  nnuePending = f;
  const base = f.name.replace(/\.nnue$/i, "").trim().slice(0, 64) || "Opponent network";
  $("nnuename").value = base;
  $("nnueform").classList.remove("hide");
  $("nnuename").focus();
  $("nnuename").select();
  nnueStatus("Name this network, then save it.");
}
async function nnueSave(){
  const f = nnuePending;
  if(!f) return;
  const name = $("nnuename").value.trim().replace(/\s+/g, " ").slice(0, 64);
  if(!name){ nnueStatus("Enter a name for the network.", true); $("nnuename").focus(); return; }
  const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  let data;
  try{ data = await f.arrayBuffer(); }
  catch(e){ nnueStatus(e.message || "Could not read the file.", true); return; }
  const meta = {id, name, size:f.size, added:Date.now()};
  try{ await nnuePut(meta, data); }
  catch(e){ nnueStatus(e.message || "Could not save the network.", true); return; }
  nnuePending = null;
  $("nnueform").classList.add("hide");
  $("nnuefile").value = "";
  nnueRows.unshift(meta);
  renderNNUE();
  nnueStatus('Saved "' + name + '". Choose Use to make the opponent load it.');
}
function cancelNNUE(){
  nnuePending = null;
  $("nnueform").classList.add("hide");
  $("nnuefile").value = "";
  nnueStatus("Import cancelled.");
}
function opponentWorker(){ return oppWk && !oppWk.dead ? oppWk : null; }
function stopOpponentEngine(){
  oppGen++;
  if(oppLoadCancel){ try{ oppLoadCancel(); }catch(e){} oppLoadCancel = null; }
  if(oppWk){
    if(oppWk.abort){ try{ oppWk.abort(); }catch(e){} }
    try{ oppWk.w.terminate(); }catch(e){}
    oppWk.dead = true;
  }
  oppWk = null; oppNetId = ""; oppLoading = null;
}
async function nnueActiveRecord(){
  if(!nnueActive) return null;
  let meta = nnueRows.find(r => r.id === nnueActive);
  if(!meta){
    const db = await nnueDB();
    meta = await nnueReq(db.transaction("meta", "readonly").objectStore("meta").get(nnueActive));
  }
  if(!meta) return null;
  let data = await nnueData(nnueActive);
  if(!data) return null;
  if(data instanceof Blob) data = await data.arrayBuffer();
  else if(ArrayBuffer.isView(data)) data = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return {id:nnueActive, name:meta.name, size:meta.size, data};
}
function loadOpponentNNUE(wk, data){
  return new Promise((resolve, reject) => {
    if(!wk || wk.dead || !wk.w) return reject(new Error("The opponent engine is not running."));
    let done = false, cancel = null;
    const oldError = wk.w.onerror;
    const timer = setTimeout(() => finish(new Error("The network took too long to load.")), 60000);
    const finish = err => {
      if(done) return;
      done = true;
      clearTimeout(timer);
      if(oppLoadCancel === cancel) oppLoadCancel = null;
      try{ if(wk.w){ wk.w.onmessage = null; wk.w.onerror = oldError; } }catch(e){}
      err ? reject(err) : resolve();
    };
    cancel = () => finish(new Error("The network load was cancelled."));
    oppLoadCancel = cancel;
    wk.w.onerror = e => {
      if(oldError){ try{ oldError(e); }catch(err){} }
      finish(new Error("The opponent engine stopped while loading the network."));
    };
    wk.w.onmessage = e => {
      const line = String(e.data);
      if(line.includes("readyok")) return finish();
      if(/(failed|error|exception|invalid|not found|unable|cannot|corrupt)/i.test(line)) return finish(new Error(line.replace(/^info string\s*/i, "")));
    };
    try{ wk.w.postMessage({__nnue:1, path:"/tmp/opponent.nnue", data}, [data]); }
    catch(e){ finish(e); }
  });
}
async function ensureOpponentEngine(){
  if(!nnueActive){ stopOpponentEngine(); return null; }
  if(oppWk && !oppWk.dead && oppNetId === nnueActive) return oppWk;
  if(oppFail === nnueActive) return null;
  if(oppLoading) return oppLoading;
  const gen = oppGen;
  const p = (async () => {
    let rec;
    try{ rec = await nnueActiveRecord(); }
    catch(e){ nnueStatus("Could not read the selected network.", true); return null; }
    if(gen !== oppGen) return null;
    if(!rec){ oppFail = nnueActive; nnueStatus("The selected opponent network is missing.", true); return null; }
    nnueStatus("Loading opponent network " + rec.name + "...");
    const b = BOTS.find(x => x.id === "sf19ls") || BOTS.find(x => x.id === "sf19l") || BOT();
    let wk = null;
    try{
      wk = await newWorker(null, b, {nnue:true});
      if(gen !== oppGen){ try{ wk.w.terminate(); }catch(e){} wk.dead = true; return null; }
      await loadOpponentNNUE(wk, rec.data);
      if(gen !== oppGen){ try{ wk.w.terminate(); }catch(e){} wk.dead = true; return null; }
      oppWk = wk; oppNetId = rec.id; oppFail = "";
      nnueStatus("Opponent network: " + rec.name + ". Analysis stays on the built-in network.");
      return wk;
    }
    catch(e){
      if(wk){ try{ wk.w.terminate(); }catch(err){} wk.dead = true; }
      if(gen === oppGen){
        oppFail = rec.id;
        nnueStatus("Could not load " + rec.name + " (" + (e && e.message ? e.message : "unknown error") + "). The built-in network will be used.", true);
      }
      return null;
    }
  })();
  oppLoading = p;
  p.finally(() => { if(oppLoading === p) oppLoading = null; });
  return p;
}
async function initNNUE(){
  const imp = $("nnueimport"); if(imp) imp.onclick = nnueChoose;
  const file = $("nnuefile"); if(file) file.onchange = nnueFilePicked;
  const save = $("nnuesave"); if(save) save.onclick = nnueSave;
  const cancel = $("nnuecancel"); if(cancel) cancel.onclick = cancelNNUE;
  const name = $("nnuename"); if(name) name.onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); nnueSave(); } };
  const list = $("nnuelist");
  if(list) list.onclick = e => {
    const use = e.target.closest("[data-nnue-use]");
    if(use){ setActiveNNUE(use.getAttribute("data-nnue-use")); return; }
    const del = e.target.closest("[data-nnue-del]");
    if(del) deleteNNUE(del.getAttribute("data-nnue-del"));
  };
  try{ nnueRows = await nnueAll(); }
  catch(e){ nnueStatus(e.message || "Could not read saved networks.", true); renderNNUE(); return; }
  if(nnueActive && !nnueRows.some(r => r.id === nnueActive)){
    nnueActive = "";
    try{ localStorage.removeItem(NNUE_ACTIVE_KEY); }catch(e){}
  }
  renderNNUE();
  const rec = nnueRows.find(r => r.id === nnueActive);
  if(rec) nnueStatus("Opponent network: " + rec.name + ". Analysis stays on the built-in network.");
  else if(!nnueRows.length) nnueStatus("Import a Stockfish-format .nnue file to give the opponent its own network.");
  else nnueStatus("Opponent uses Stockfish's built-in network.");
}
initNNUE();
