/* ================= Opening trainer ================= */
/* A repertoire is a list of lines you chose. Each line is drilled from move 1: the opponent's moves
   are played for you and you must find yours. Lines are scheduled with SM-2 spaced repetition. */
const REP_KEY = "chesscoach.repertoire.v1", DAY = 864e5;
let REP = [];
try{
  const j = JSON.parse(localStorage.getItem(REP_KEY));
  if(Array.isArray(j)) REP = j.filter(r => r && Array.isArray(r.toks) && r.toks.length && (r.color==="w" || r.color==="b"));
}catch(e){}
const repSave = () => { try{ localStorage.setItem(REP_KEY, JSON.stringify(REP)); }catch(e){} };
const repDue = r => !r.seen || r.due <= Date.now();
const repId = (o, c) => c + ":" + o.toks.join(" ");
const sanLine = toks => toks.map((t,i) => (i%2===0 ? (i/2+1) + ". " : "") + t).join(" ");
const myMoves = r => Math.ceil((r.toks.length - (r.color==="b" ? 1 : 0)) / 2);

function repAdd(o, color){
  const id = repId(o, color);
  if(REP.some(r => r.id===id)) return "dup";
  if(color==="b" && o.toks.length<2) return "short";
  REP.push({id, name:o.name, eco:o.eco, color, toks:o.toks.slice(), ef:2.5, n:0, int:0, due:0, seen:0, fails:0});
  repSave(); tBadge();
  return "ok";
}
function repSyncAdd(){
  if(!oSel) return;
  const has = REP.some(r => r.id === repId(oSel, $("orepcolor").value));
  const b = $("orepadd");
  b.textContent = has ? "In your repertoire" : "Add to repertoire";
  b.disabled = has;
}
$("orepcolor").onchange = repSyncAdd;
$("orepadd").onclick = () => {
  if(!oSel) return;
  const res = repAdd(oSel, $("orepcolor").value);
  $("orepnote").textContent = res==="short" ? "Black needs a line of at least two moves. Pick a longer line."
    : res==="ok" ? "Added. Open the Practice tab to drill it." : "Already in your repertoire.";
  repSyncAdd();
};

/* SM-2 on whole lines. q: 5 clean, 4 used a hint, 3 one miss, 1 two or more misses. */
function repGrade(r, q){
  r.seen = Date.now();
  if(q<3){ r.n = 0; r.int = 0; r.due = Date.now() + 10*60e3; r.fails = (r.fails||0) + 1; }
  else {
    r.n++;
    r.int = r.n===1 ? 1 : r.n===2 ? 6 : Math.min(365, Math.round(r.int * r.ef));
    r.due = Date.now() + r.int*DAY;
  }
  r.ef = Math.max(1.3, r.ef + 0.1 - (5-q)*(0.08 + (5-q)*0.02));
  repSave(); tBadge();
}
function dueText(r){
  if(!r.seen) return ["New", "new"];
  const ms = r.due - Date.now();
  if(ms<=0) return ["Due now", "due"];
  if(ms < 36e5) return ["Due in " + Math.max(1, Math.round(ms/6e4)) + " min", ""];
  if(ms < DAY) return ["Due later today", ""];
  const d = Math.ceil(ms/DAY);
  return [d===1 ? "Due tomorrow" : "Due in " + d + " days", ""];
}
function tBadge(){
  const n = REP.filter(repDue).length;
  $("omTrain").textContent = n ? "Practice (" + n + " due)" : "Practice";
}

/* ---- starter lines, resolved against the loaded opening list ---- */
const STARTERS = [["w","Italian Game"],["w","London System"],["w","Queen's Gambit"],["w","Ruy Lopez"],
                  ["b","Sicilian Defense: Najdorf Variation"],["b","Caro-Kann Defense"],["b","French Defense"],["b","Queen's Gambit Declined"]];
let starterMemo = [], starterN = -1;
function resolveStarter(c, q){
  let best = null;
  for(const o of OPEN_LIST){
    if(o.name!==q && !o.name.startsWith(q + ":")) continue;
    if(c==="b" && o.toks.length<2) continue;
    const d = Math.abs(o.toks.length - 8);
    if(!best || d < best.d) best = {o, d};
  }
  return best && best.o;
}

/* ---- home screen ---- */
function tRender(){
  tBadge();
  const due = REP.filter(repDue);
  $("tsum").textContent = REP.length
    ? (due.length ? due.length + (due.length===1 ? " line" : " lines") + " due" : "Nothing due") + " · " + REP.length + (REP.length===1 ? " line" : " lines") + " in your repertoire"
    : "Your repertoire is empty";
  const st = $("tstart");
  st.disabled = !due.length;
  st.textContent = due.length ? "Drill " + due.length + " due" : "Nothing due";
  $("tall").classList.toggle("hide", !REP.length);
  st.classList.toggle("hide", !REP.length);
  const next = REP.filter(r => !repDue(r)).sort((a,b) => a.due - b.due)[0];
  $("thint0").textContent = !REP.length
    ? "Add a line below, or open the Explore tab, pick an opening and tap Add to repertoire."
    : (!due.length && next ? "Next review: " + dueText(next)[0].toLowerCase() + "." : "");
  // starters only while the repertoire is empty
  const box = $("tstarters");
  if(REP.length || !OPEN_LIST.length){ box.innerHTML = ""; }
  else {
    if(starterN!==OPEN_LIST.length){ starterMemo = STARTERS.map(([c,q]) => [c, resolveStarter(c,q)]).filter(x => x[1]); starterN = OPEN_LIST.length; }
    const found = starterMemo;
    box.innerHTML = found.map(([c,o],i) => `<button class="ghost" type="button" data-st="${i}">+ ${esc(o.name)} <small>${c==="w" ? "White" : "Black"}</small></button>`).join("");
    box._f = found;
  }
  const sorted = REP.slice().sort((a,b) => (repDue(b)-repDue(a)) || a.due - b.due || (a.name < b.name ? -1 : 1));
  $("treplist").innerHTML = sorted.map(r => {
    const [t, cls] = dueText(r);
    return `<div class="rrow"><span class="sw ${r.color}" title="You play ${r.color==="w" ? "White" : "Black"}"></span>`+
      `<span class="rinfo"><span class="rname">${esc(r.name)}</span><span class="rsub"><span class="${cls}">${t}</span> · ${myMoves(r)} moves to find · ${esc(sanLine(r.toks))}</span></span>`+
      `<button type="button" data-p="${esc(r.id)}">Drill</button>`+
      `<button type="button" class="ghost" data-x="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">&#x2715;</button></div>`;
  }).join("");
}
$("tstarters").onclick = e => {
  const b = e.target.closest("button[data-st]"); if(!b) return;
  const [c,o] = $("tstarters")._f[+b.dataset.st]; repAdd(o, c); tRender();
};
$("treplist").onclick = e => {
  const p = e.target.closest("button[data-p]"), x = e.target.closest("button[data-x]");
  if(p){ const r = REP.find(r => r.id===p.dataset.p); if(r) tStartQueue([r]); }
  if(x){
    const r = REP.find(r => r.id===x.dataset.x);
    if(r && confirm("Remove " + r.name + " from your repertoire?")){ REP = REP.filter(q => q!==r); repSave(); tRender(); }
  }
};
$("tstart").onclick = () => { const q = REP.filter(repDue).sort((a,b) => (a.seen?1:0) - (b.seen?1:0) || a.due - b.due); if(q.length) tStartQueue(q); };
$("tall").onclick = () => { const q = REP.slice(); for(let i=q.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); [q[i],q[j]] = [q[j],q[i]]; } if(q.length) tStartQueue(q); };
$("tfind").onclick = () => tSetMode("exp");

function tSetMode(m){
  $("oexplore").classList.toggle("hide", m!=="exp");
  $("otrain").classList.toggle("hide", m!=="train");
  $("omExp").classList.toggle("on", m==="exp"); $("omExp").setAttribute("aria-pressed", m==="exp");
  $("omTrain").classList.toggle("on", m==="train"); $("omTrain").setAttribute("aria-pressed", m==="train");
  if(m==="train") tRender();
  else { tTok++; }
}
$("omExp").onclick = () => tSetMode("exp");
$("omTrain").onclick = () => tSetMode("train");

/* ---- drill ---- */
let tq = [], tCur = null, tg = null, tIdx = 0, tSel = null, tFlip = false, tMis = 0, tShown = 0, tHints = 0, tHintCnt = 0, tHintFlag = false;
let tBusy = false, tDone = false, tTok = 0, tLast = null, tAnim = null, tHide = null, tDrag = null, tWasDue = false, tRequeued = new Set(), tCount = 0;
const tSide = i => i%2===0 ? "w" : "b";
const tStatus = (t, cls) => { const e = $("tstatus"); e.textContent = t; e.className = "status" + (cls ? " " + cls : ""); };
let tExpMemo = null;
function tExpected(){
  if(!tg || tIdx>=tCur.toks.length) return null;
  const k = tTok + ":" + tIdx;
  if(tExpMemo && tExpMemo.k===k) return tExpMemo.m;
  const c = new Chess(tg.fen()), m = c.move(tCur.toks[tIdx]);
  tExpMemo = {k, m}; return m;
}
function tDraw(){
  if(!tg){ drawBoard($("tboard"), new Chess().fen(), [], [], {}); return; }
  const hl = tLast ? [tLast.from, tLast.to] : [], arrows = [];
  const ex = (!tDone && !tBusy) ? tExpected() : null;
  if(ex && tHints>=1) hl.push(ex.from);
  if(ex && tHints>=2) arrows.push([ex.from, ex.to, "var(--arG)"]);
  const dots = (tSel && !tDone && !tBusy) ? tg.moves({square:tSel, verbose:true}) : [];
  drawBoard($("tboard"), tg.fen(), arrows, hl, {flip:tFlip, sel:tSel, dots, hideSq:tHide, anim:tAnim});
  tAnim = null;
  $("tprogfill").style.width = (tCur ? Math.round(tIdx / tCur.toks.length * 100) : 0) + "%";
}
function tStartQueue(list){
  tq = list.slice(); tRequeued = new Set(); tCount = 0;
  $("thome").classList.add("hide"); $("tdrill").classList.remove("hide");
  tNext();
}
function tNext(){
  if(!tq.length){ tBack(); return; }
  tBegin(tq.shift());
  $("tdrill").scrollIntoView({block:"nearest", behavior:"smooth"});
}
function tBegin(r){
  const tok = ++tTok;
  tCur = r; tg = new Chess(); tIdx = 0; tSel = null; tMis = 0; tShown = 0; tHints = 0; tHintCnt = 0; tHintFlag = false; tBusy = true; tDone = false;
  tLast = null; tAnim = null; tHide = null; tDrag = null; tFlip = r.color==="b"; tWasDue = repDue(r) || tRequeued.has(r.id);
  $("ttitle").textContent = r.name;
  $("tmeta").textContent = "You play " + (r.color==="w" ? "White" : "Black") + " · " + myMoves(r) + (myMoves(r)===1 ? " move" : " moves") + " to find" + (tq.length ? " · " + tq.length + " more after this" : "");
  ["tnext","tretry","tinfo"].forEach(id => $(id).classList.add("hide"));
  $("thint").classList.remove("hide"); $("tshow").classList.remove("hide");
  $("thint").disabled = $("tshow").disabled = false;
  tStatus(r.color==="b" ? "White opens…" : "Your move. Play the first move of this line."); tDraw();
  tOpp(tok);
}
/* play the opponent's moves until it is the user's turn, or the line is over */
async function tOpp(tok){
  while(tIdx < tCur.toks.length && tSide(tIdx) !== tCur.color){
    await lSleep(tIdx===0 ? 450 : 500); if(tok!==tTok) return;
    const m = tg.move(tCur.toks[tIdx]); if(!m) break;
    tIdx++; tLast = m; tAnim = {from:m.from, to:m.to}; snd(sndKind(m, false)); tDraw();
  }
  if(tok!==tTok) return;
  if(tIdx >= tCur.toks.length) return tFinish();
  tBusy = false; tHints = 0; tHintFlag = false; tDraw();
  if(tIdx>0) tStatus("Your move.");
}
function tPlay(m, tok){
  tg.move({from:m.from, to:m.to, promotion:m.promotion});
  const mv = tg.history({verbose:true}).slice(-1)[0];
  tIdx++; tSel = null; tHide = null; tLast = mv; tAnim = {from:mv.from, to:mv.to}; tHints = 0; tHintFlag = false;
  snd(sndKind(mv, true)); tDraw();
  if(tIdx >= tCur.toks.length) return tFinish();
  tBusy = true; tStatus("Correct.", "good"); tOpp(tok);
}
function tTry(from, to){
  if(!tg || tBusy || tDone) return;
  const tok = tTok, ex = tExpected(); if(!ex) return;
  if(from===ex.from && to===ex.to) return tPlay(ex, tok);
  const m = tg.move({from, to, promotion:"q"}); if(!m) return;
  tMis++; tBusy = true; tSel = null; tHide = null; tLast = m; tAnim = {from:m.from, to:m.to};
  snd(sndKind(m, true)); tDraw();
  const known = lookupFen(tg.fen());
  tStatus(known && known.name!==tCur.name
    ? "That is a real opening (" + known.name + "), but not the one in this line."
    : "Not the book move for this line.", "bad");
  setTimeout(() => {
    if(tok!==tTok || !tg) return;
    tg.undo(); tLast = (tIdx>0) ? tg.history({verbose:true}).slice(-1)[0] : null; tBusy = false;
    if(tMis>=2){ tHints = 2; tStatus("Second miss. The arrow shows the book move.", "bad"); }
    tDraw();
  }, 900);
}
function tFinish(){
  tDone = true; tBusy = true; tSel = null; tDraw();
  const r = tCur, bad = tMis + tShown + 0.5*tHintCnt, q = bad===0 ? 5 : bad<1 ? 4 : bad<1.5 ? 3 : 1;
  const pl = (n, w) => n + " " + w + (n===1 ? "" : "s");
  const parts = [];
  if(tMis) parts.push("missed " + pl(tMis, "move"));
  if(tShown) parts.push("needed the answer on " + pl(tShown, "move"));
  if(tHintCnt) parts.push("used a hint on " + pl(tHintCnt, "move"));
  const what = parts.join(" and ");
  let msg;
  if(tWasDue || q<3){
    repGrade(r, q);
    if(q<3){
      msg = "You " + what + ". This line comes back in about 10 minutes.";
      if(!tRequeued.has(r.id)){ tRequeued.add(r.id); tq.push(r); }
    } else {
      msg = (q===5 ? "Clean run. " : "You " + what + ". ") + dueText(r)[0] + ".";
    }
  } else {
    msg = (bad ? "You " + what + "." : "Clean run.") + " Extra drill, so the schedule is unchanged.";
  }
  snd("end");
  tStatus(msg, q>=4 ? "good" : q===3 ? "warn" : "bad");
  tCount++;
  const o = lookupFen(tg.fen());
  const info = $("tinfo");
  info.innerHTML = o ? openLine(o, "") : `<span class="lbl">Line:</span> ${esc(r.name)}<div class="tip">${esc(sanLine(r.toks))}</div>`;
  info.classList.remove("hide");
  $("thint").classList.add("hide"); $("tshow").classList.add("hide");
  $("tretry").classList.remove("hide");
  const nx = $("tnext"); nx.classList.remove("hide");
  nx.textContent = tq.length ? "Next line (" + tq.length + " left)" : "Finish";
  nx.focus({preventScroll:true});
}
function tBack(){
  tTok++; tCur = null; tg = null; tq = []; tDone = false;
  $("tdrill").classList.add("hide"); $("thome").classList.remove("hide");
  tRender();
}
$("tback").onclick = tBack;
$("tnext").onclick = tNext;
$("tretry").onclick = () => { if(tCur) tBegin(tCur); };
$("thint").onclick = () => {
  if(!tg || tBusy || tDone) return;
  if(!tHintFlag){ tHintFlag = true; tHintCnt++; }
  tHints = Math.min(2, tHints+1);
  tStatus(tHints===1 ? "Move the highlighted piece." : "Play the move shown by the arrow.");
  tDraw();
};
$("tshow").onclick = () => {
  if(!tg || tBusy || tDone) return;
  const ex = tExpected(); if(!ex) return;
  const tok = tTok; if(tHintFlag){ tHintFlag = false; tHintCnt--; } tShown++; tHints = 2; tBusy = true; tDraw();
  tStatus("The book move is " + ex.san + ".");
  setTimeout(() => { if(tok===tTok && tg && !tDone) tPlay(ex, tok); }, 900);
};

/* board input: tap-tap or drag */
const tb = $("tboard");
tb.addEventListener("pointerdown", e => {
  if(e.button!==0 || !tg || tBusy || tDone || !tCur) return;
  const s = sqAt(tb, e, tFlip); if(!s) return;
  e.preventDefault();
  if(tSel && tSel!==s && tg.moves({square:tSel, verbose:true}).some(m => m.to===s)){ const f = tSel; tTry(f, s); return; }
  const p = tg.get(s);
  if(p && p.color===tCur.color){
    tDrag = {from:s, wasSel:tSel===s};
    rc = {svg:tb, r:tb.getBoundingClientRect()};
    tSel = s; tHide = s; tDraw();
    const gh = document.createElementNS(NS, "image");
    gh.setAttribute("id", "tghost"); gh.setAttribute("href", PIECE_URL(p.color, p.type));
    gh.setAttribute("width", 130); gh.setAttribute("height", 130);
    gh.style.pointerEvents = "none";
    const pt = svgPt(tb, e);
    gh.setAttribute("x", pt.x-65); gh.setAttribute("y", pt.y-65);
    tb.appendChild(gh);
    try{ tb.setPointerCapture(e.pointerId); }catch(err){}
  } else { tSel = null; tDraw(); }
});
tb.addEventListener("pointermove", e => {
  if(!tDrag) return;
  const gh = tb.querySelector("#tghost"), pt = svgPt(tb, e);
  if(gh){ gh.setAttribute("x", pt.x-65); gh.setAttribute("y", pt.y-65); }
});
function tDropEnd(e, cancel){
  if(!tDrag) return;
  const d = tDrag, t = cancel ? null : sqAt(tb, e, tFlip);
  const gh = tb.querySelector("#tghost"); if(gh) gh.remove();
  tDrag = null; rc = null; tHide = null;
  const legal = t && t!==d.from && tg.moves({square:d.from, verbose:true}).some(m => m.to===t);
  if(legal){ tTry(d.from, t); return; }
  if(d.wasSel && t===d.from) tSel = null;
  tDraw();
}
tb.addEventListener("pointerup", e => { if(e.button===0) tDropEnd(e, false); });
tb.addEventListener("pointercancel", e => tDropEnd(e, true));
tBadge();

