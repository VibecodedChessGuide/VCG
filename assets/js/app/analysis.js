/* ================= Background worker =================
   Heavy chess.js work runs on its own thread so the board never stutters. The worker's code is built from the
   same functions the page uses, so there is one copy of the logic. If a worker cannot start (for example when
   the page is opened from a file), brainCall resolves undefined and callers use the main-thread path. */
let brain = null, brainDead = false, brainSeq = 0;
const brainJobs = new Map();
function brainSource(chessUrl){
  const fns = [withTurn, uciToMove, forkTargets, boardFacts, describe, hintTriple, fenFor].map(f => f.toString()).join("\n");
  return "importScripts(" + JSON.stringify(chessUrl) + ");\n" +
    "const NAMES=" + JSON.stringify(NAMES) + ",VAL=" + JSON.stringify(VAL) + ",HINT_KINDS=" + JSON.stringify(HINT_KINDS) + ",factsCache=new Map(),prefFen=new Map();\n" +
    fns + "\n" +
    "onmessage=function(e){var d=e.data,out={id:d.id};try{" +
      "if(d.type==='fens'){out.res=d.toks.map(function(t){try{return fenFor(t);}catch(x){return null;}});prefFen.clear();}" +
      "else if(d.type==='hint'){out.res=hintTriple(d.fen,d.lines);}" +
    "}catch(x){out.res=undefined;}postMessage(out);};";
}
function brainFail(){
  brainDead = true;
  try{ if(brain) brain.terminate(); }catch(e){}
  brain = null;
  brainJobs.forEach(j => j(undefined)); brainJobs.clear();
}
function brainStart(){
  if(brain || brainDead) return;
  try{
    if(typeof Worker==="undefined" || !/^https?:$/.test(location.protocol)) return brainFail();
    const url = new URL("assets/js/chess.min.js", document.baseURI).href;
    brain = new Worker(URL.createObjectURL(new Blob([brainSource(url)], {type:"text/javascript"})));
    brain.onmessage = e => { const j = brainJobs.get(e.data.id); if(j){ brainJobs.delete(e.data.id); j(e.data.res); } };
    brain.onerror = () => brainFail();
  }catch(e){ brainFail(); }
}
function brainCall(type, payload){
  brainStart();
  if(!brain) return Promise.resolve(undefined);
  return new Promise(res => {
    const id = ++brainSeq;
    brainJobs.set(id, res);
    setTimeout(() => { if(brainJobs.delete(id)) res(undefined); }, 20000);
    try{ brain.postMessage(Object.assign({id, type}, payload)); }catch(e){ brainJobs.delete(id); res(undefined); }
  });
}

/* ================= Judging ================= */
/* A sacrifice is material given up on purpose: the moved piece (or another piece the
   opponent can win) is worth more than what the move captures. "sound" means the engine
   still likes the position for the sacrificer, so the gamble is justified. */
function attackersTo(fen, sq, color){
  try{
    return new Chess(withTurn(fen, color)).moves({verbose:true}).filter(m => m.to === sq && m.captured);
  }catch(e){ return []; }
}
function sacrificeInfo(before, after, mv){
  try{
    const mover = mv.color, opp = mover==="w" ? "b" : "w";
    const piece = mv.promotion || mv.piece, val = VAL[piece] || 0;
    if(val < 2) return null;
    const atk = attackersTo(after.fen, mv.to, opp);
    if(!atk.length) return null;
    const def = attackersTo(after.fen, mv.to, mover);
    const atkVals = atk.map(m => m.piece==="k" ? 0 : VAL[m.piece]).sort((a,b)=>a-b);
    const defVals = def.map(m => m.piece==="k" ? 0 : VAL[m.piece]).sort((a,b)=>a-b);
    let directOffered = 0;
    if(!def.length) directOffered = val;
    else if(atkVals[0] < val && (atkVals.length > defVals.length || defVals[0] >= val)) directOffered = val - atkVals[0];
    let offered = directOffered;
    if(after.best){
      const rm = uciToMove(new Chess(after.fen), after.best);
      if(rm && rm.captured && rm.to !== mv.to) offered = Math.max(offered, VAL[rm.captured] || 0);
    }
    const gain = mv.captured ? (VAL[mv.captured] || 0) : 0;
    const net = offered - gain;
    const directNet = directOffered - gain;
    if(net < 2) return null;
    const evalAfter = (after.cp || 0) * (mover==="w" ? 1 : -1);
    const evalBefore = (before.cp || 0) * (mover==="w" ? 1 : -1);
    const mateFor = after.mate != null && after.mate * (mover==="w" ? 1 : -1) > 0;
    return {net, directNet, directOffered, offered, gain, evalAfter, evalBefore, mateFor, piece, sq: mv.to,
      sound: mateFor || evalAfter >= -50,
      worth: mateFor || evalAfter >= -50 || (evalAfter >= evalBefore - 50 && evalAfter > -300)};
  }catch(e){ return null; }
}

function judgePair(before, after, mv){
  const uci = mv.from + mv.to + (mv.promotion||"");
  const mover = mv.color==="w" ? 1 : -1;
  let loss = Math.max(0, (clip(before.cp) - clip(after.cp)) * mover);
  if(uci === before.best) loss = 0;
  const st = STRICTNESS[$("strict").value] || STRICTNESS.low;
  let cls = "good";
  if(loss >= st.blunder) cls = "blunder";
  else if(loss >= st.mistake) cls = "mistake";
  else if(loss >= st.inacc) cls = "inacc";
  const reply = after.best ? uciToMove(new Chess(after.fen), after.best) : null;
  const bm = before.best ? uciToMove(new Chess(before.fen), before.best) : null;
  const sac = sacrificeInfo(before, after, mv);
  const r = {loss, cls, kind: cls==="good" ? (uci===before.best ? "best" : "good") : cls, uci, tag:null, text:"",
    sac, sacWorth: sac ? (sac.worth ? "good" : "bad") : null};

  // Brilliant is deliberately rare: the engine's top choice, a real sacrifice of the
  // moved piece, clearly sound, not a book/forced move, and not already winning.
  const bookBefore = lookupFen(before.fen);
  const onlyMove = (() => { try { return new Chess(before.fen).moves().length <= 1; } catch(e){ return false; } })();
  const notCrushing = before.mate == null && (before.cp || 0) * mover < 200;
  const brilliantSound = sac && (sac.mateFor || sac.evalAfter >= 50);
  if(uci === before.best && sac && sac.directNet >= 2 && brilliantSound && notCrushing && !bookBefore && !onlyMove){
    r.kind = "brilliant"; r.cls = "brilliant";
    r.text = "The player gave up about " + sac.directNet + " point" + (sac.directNet===1?"":"s") + " of material with their " + NAMES[sac.piece] +
      ", and the engine still evaluates the position at " + evalText(after) + ". Worth it.";
    return r;
  }

  const bookAfter = lookupFen(after.fen);
  if(bookAfter){
    r.kind = "book"; r.cls = "book";
    r.text = "Book move: " + (bookAfter.name || "known opening position") + ".";
    return r;
  }
  const greatMove = uci === before.best && cls === "good" && !sac && ((after.cp || 0) - (before.cp || 0)) * mover >= 150;
  if(greatMove){
    r.kind = "great"; r.cls = "great";
    r.text = "Great: " + describe(before.fen, before.best) + " turned the game from " + evalText(before) + " to " + evalText(after) + ".";
    return r;
  }

  // Missing a win or a mate matters even when the centipawn loss looks small.
  const hadMate = before.mate!=null && before.mate*mover>0, hasMate = after.mate!=null && after.mate*mover>0;
  const missedMate = hadMate && Math.abs(before.mate)<=8 && (!hasMate || Math.abs(after.mate)>Math.abs(before.mate)+2);
  const missedWin = !hadMate && before.cp*mover>=250 && after.cp*mover<150;
  if(cls==="good" && (missedMate || missedWin)){
    r.cls = "miss"; r.kind = "miss";
    r.tag = missedMate ? "missed_mate" : "missed_win";
    r.text = missedMate
      ? "The player had a forced mate" + (bm ? " starting with " + bm.san : "") + ", but this move lets it slip. When the enemy king is short of squares, check every check first."
      : "The player was winning by about " + (before.cp*mover/100).toFixed(1) + " pawns, but this move lets the advantage fall to " + (after.cp*mover/100).toFixed(1) + ". The engine's pick was " + (before.best ? describe(before.fen, before.best) : "unavailable") + ".";
    return r;
  }
  if(cls==="good") return r;

  if(after.mate!=null && after.mate*mover<0 && Math.abs(after.mate)<=3){
    r.tag="allowed_mate";
    r.text = "This lets the opponent force checkmate" + (reply ? " (" + reply.san + ")" : "") + ". Before every move, check every check and capture the opponent has.";
    return r;
  }
  if(missedMate){
    r.tag="missed_mate";
    r.text = "The player had a forced checkmate" + (bm ? " starting with " + bm.san : "") + ". When the enemy king is short of squares, look at every check first.";
    return r;
  }
  const rf = reply ? forkTargets(after.fen, after.best) : null;
  if(rf && rf.length>=2 && cls!=="inacc"){
    r.tag="allowed_fork";
    r.text = reply.san + " forks " + rf.join(" and ") + ". Before moving, check which squares an enemy knight or pawn could jump to.";
    return r;
  }
  if(reply && reply.captured && VAL[reply.captured]>=3 && cls!=="inacc"){
    r.tag="hanging";
    r.text = "The move left a " + NAMES[reply.captured] + " to be taken (" + reply.san + "). Before moving, ask: what can the opponent capture right now?";
    return r;
  }
  const bf = bm ? forkTargets(before.fen, before.best) : null;
  if(bf && bf.length>=2){
    r.tag="missed_fork";
    r.text = bm.san + " would have forked " + bf.join(" and ") + ". Look for squares where one piece attacks two targets.";
    return r;
  }
  const pinsBefore = boardFacts(before.fen).pinned.filter(x => x.color===mv.color).map(x => x.sq);
  const newPin = boardFacts(after.fen).pinned.find(x => x.color===mv.color && !pinsBefore.includes(x.sq));
  if(newPin){
    r.tag="pin";
    r.text = "The " + NAMES[newPin.type] + " on " + newPin.sq + " is now pinned to the king and can't move freely. Watch the lines the opponent's bishops, rooks and queen control.";
    return r;
  }
  if(bm && (bm.captured || /[+#]/.test(bm.san))){
    r.tag="missed_tactic";
    r.text = "A forcing move was available: " + bm.san + ". Captures and checks are the first things to scan for.";
    return r;
  }
  if(!hadMate && before.cp*mover>=250 && after.cp*mover<150){
    r.tag="missed_win";
    r.text = "The player was winning by about " + (before.cp*mover/100).toFixed(1) + " pawns, but this move throws most of it away (" + (after.cp*mover/100).toFixed(1) + " now). The engine's pick was " + describe(before.fen, before.best) + ".";
    return r;
  }
  if(sac && !sac.worth){
    r.tag="sac_bad";
    r.text = "This sacrifice does not pay off: the engine says the player comes out worse (" + evalText(after) + "). Not worth it.";
    return r;
  }
  r.tag="drift";
  r.text = "No piece was lost right away, but the position got worse. The engine's idea was " + describe(before.fen, before.best) + ".";
  return r;
}

function explainHtml(before, after, mv, rv, moveNo, live){
  const who = mv.color==="w" ? "White" : "Black";
  const label = {brilliant:"Brilliant move", great:"Great move", book:"Book move", best:"Best move", good:"Good move", miss:"Missed chance", inacc:"Inaccuracy", mistake:"Mistake", blunder:"Blunder"}[rv.kind];
  const vc = (rv.cls==="good" || rv.cls==="brilliant" || rv.cls==="great" || rv.cls==="book") ? "good" : rv.cls==="blunder" ? "bad" : "warn";
  let h = `<p class="verdict ${vc}">${moveNo} ${mv.san} — ${label}</p>`;
  h += `<div class="evals">${who} · eval ${evalText(before)} → ${evalText(after)}${rv.loss>0?` · lost about ${(rv.loss/100).toFixed(1)} pawns`:""}</div>`;
  if(before.best && (!live || rv.cls!=="good")){
    const san = live ? "" : pvToSan(before.fen, before.pv, 6).join(" ");
    h += `<div class="plan"><span class="lbl">${rv.uci===before.best?"The engine agrees:":"What the engine wanted:"}</span> ${describe(before.fen, before.best)}.${san ? `<div class="pv">Line: ${san}</div>` : ""}</div>`;
  }
  const op = (typeof lookupFen==="function") ? lookupFen(after.fen) : null;
  if(op){
    const mine = (op.side==="White" && mv.color==="w") || (op.side==="Black" && mv.color==="b");
    const gnote = ((op.kind==="gambit" || op.kind==="counter") && mine && rv.cls!=="good") ? " The engine would avoid it, but this is a real, playable gambit, so a small eval drop here is normal." : "";
    h += `<div class="plan"><span class="lbl">Opening: ${esc(op.name)}</span> ${openChips(op)} ${esc(typeTip(op))}${op.blurb ? " " + esc(op.blurb) : ""}${gnote}</div>`;
  }
  if(rv.tag) h += `<div class="flaw"><span class="lbl">${TAGS[rv.tag]}.</span> ${rv.text}</div>`;
  else if(rv.kind==="brilliant" && rv.text) h += `<div class="plan"><span class="lbl">Brilliant.</span> ${rv.text}</div>`;
  else if(rv.kind==="great" && rv.text) h += `<div class="plan"><span class="lbl">Great.</span> ${rv.text}</div>`;
  else if(rv.kind==="book" && rv.text) h += `<div class="plan"><span class="lbl">Book.</span> ${rv.text}</div>`;
  if(rv.sacWorth && rv.kind!=="brilliant" && rv.tag!=="sac_bad"){
    const sc = rv.sac;
    h += `<div class="plan"><span class="lbl">Sacrifice check:</span> ` +
      (rv.sacWorth==="good"
        ? `worth it — about ${sc.net} point${sc.net===1?"":"s"} given up, and the engine still rates the position ${evalText(after)}.`
        : `not worth it — the engine says the player ends up worse (${evalText(after)}).`) + `</div>`;
  }
  return h;
}
function feedbackArrows(before, mv, rv, live){
  const out = [];
  if(live && (rv.cls==="good" || rv.cls==="great" || rv.cls==="book")) return out;
  if(!live && before.pv.length>2){
    const g = new Chess(before.fen);
    uciToMove(g, before.pv[0]);
    const b = uciToMove(g, before.pv[1]), c = uciToMove(g, before.pv[2]);
    if(b) out.push([b.from,b.to,"var(--blue)",{thin:true,dash:true,op:.8}]);
    if(c) out.push([c.from,c.to,"var(--blue)",{thin:true,dash:true,op:.8}]);
  }
  if(rv.uci !== before.best && before.best) out.push([before.best.slice(0,2), before.best.slice(2,4), "var(--arG)", {}]);
  out.push([mv.from, mv.to, rv.uci===before.best ? "var(--arG)" : "var(--arR)", {}]);
  return out;
}

/* ================= Predictions: how a bad move can go wrong ================= */
const predState = {play:null, review:null};
const predN = () => Math.max(0, parseInt($("predsel").value, 10) || 0); // no upper limit
function addStep(st, fen, u){
  const g = new Chess(fen), d = describe(fen, u), m = uciToMove(g, u);
  if(!m) return false;
  const color = st.color, other = color==="w" ? "b" : "w";
  if(m.captured) st.mat[m.color] += VAL[m.captured];
  const bal = st.mat[color] - st.mat[other]; // negative = the player has lost more material in this line
  let txt = d.slice(m.san.length).trim();
  txt = txt.charAt(0).toUpperCase() + txt.slice(1);
  st.steps.push({from:m.from, to:m.to, san:m.san, fen:g.fen(), who:m.color===color?"Player":"Opponent", txt, bal, mate:/#/.test(m.san),
    capture: m.captured ? {sq:m.to, mine:m.color===color} : null, snd: sndKind(m, m.color===color)});
  return true;
}
function finalizeEnd(st){
  const g = new Chess(st.steps[st.steps.length-1].fen);
  st.endText = g.in_checkmate() ? "The line ends in checkmate."
    : g.in_stalemate() ? "The line ends in stalemate."
    : g.game_over() ? "The line ends in a draw." : "";
}
function buildPred(ctx, fen, pv, n, color, selKey){
  const st = {steps:[], k:-1, sel:selKey, n, fen, playing:false, color, mat:{w:0,b:0}, extending:false, stopExt:false, endText:""};
  let cur = fen;
  for(const u of pv.slice(0, n)){
    if(!addStep(st, cur, u)) break;
    cur = st.steps[st.steps.length-1].fen;
  }
  if(!st.steps.length){ predState[ctx] = null; return; }
  predState[ctx] = st;
  if(st.steps.length < n && !new Chess(cur).game_over()){
    st.extending = true;
    setTimeout(() => extendPred(ctx, st), 0);
  } else finalizeEnd(st);
}
// keep asking the engine for its best move until the game ends (or n is reached / Stop is pressed)
async function extendPred(ctx, st){
  let since = 0;
  while(predState[ctx]===st && !st.stopExt && st.steps.length < st.n){
    const last = st.steps[st.steps.length-1];
    if(new Chess(last.fen).game_over()) break;
    const wk = (aux && !aux.dead) ? aux : main;
    if(!wk || wk.dead) break;
    const u = await onW(wk, () => engineSearch(last.fen, 20, 8, wk));
    if(predState[ctx]!==st || st.stopExt || !u || u==="(none)") break;
    if(!addStep(st, last.fen, u)) break;
    if(++since >= 6){ since = 0; updatePredBox(ctx); }
  }
  if(predState[ctx]===st){
    st.extending = false;
    finalizeEnd(st);
    updatePredBox(ctx);
  }
}
function updatePredBox(ctx){
  const el = $("predbox-" + ctx);
  if(!el || !predState[ctx]) return;
  const list = el.querySelector(".plist"), top = list ? list.scrollTop : 0;
  const host = el.closest("#pcoach, #explain"); if(host) host._h = null;
  el.innerHTML = predInner(ctx);
  const l2 = el.querySelector(".plist"); if(l2) l2.scrollTop = top;
}
function predStep(ctx){
  const st = predState[ctx];
  return (st && st.k>=0) ? st.steps[st.k] : null;
}
function predChart(ctx, st){
  const n = st.steps.length, W = 300, H = 84, zero = 34, slot = W/n;
  const m = Math.max(3, ...st.steps.map(x => Math.abs(x.bal))), sc = 26/m;
  let c = `<line x1="0" y1="${zero}" x2="${W}" y2="${zero}" stroke="var(--line)" stroke-width="1.5"/>`;
  st.steps.forEach((x,i) => {
    const x0 = i*slot, bw = slot*0.58, bx = x0 + (slot-bw)/2, h = Math.abs(x.bal)*sc;
    if(st.k===i) c += `<rect x="${x0}" y="0" width="${slot}" height="${H}" fill="rgba(129,182,76,.28)"/>`;
    if(x.bal===0) c += `<rect x="${bx}" y="${zero-1.5}" width="${bw}" height="3" rx="1.5" fill="var(--muted)"/>`;
    else c += `<rect x="${bx}" y="${x.bal>0 ? zero-h : zero}" width="${bw}" height="${h}" rx="2" fill="${x.bal<0?"var(--bad)":"var(--good)"}"/>`;
    const every = Math.ceil(n/12);
    if((i+1) % every === 0 || i===0) c += `<text x="${x0+slot/2}" y="${H-5}" font-size="12" font-weight="800" text-anchor="middle" fill="${x.who==="Player"?"var(--blue)":"var(--bad)"}">${i+1}</text>`;
    if(x.mate) c += `<text x="${x0+slot/2}" y="12" font-size="13" font-weight="800" text-anchor="middle" fill="var(--bad)">#</text>`;
    c += `<rect class="pbar" data-ctx="${ctx}" data-k="${i}" x="${x0}" y="0" width="${slot}" height="${H}" fill="transparent"/>`;
  });
  return `<svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Material for the player through the predicted line">${c}</svg>`;
}
function predInner(ctx){
  const st = predState[ctx];
  if(!st) return "";
  const len = st.steps.length;
  let h = `<div class="lbl">Predicting this move: ${len} prediction${len>1?"s":""}</div>`+
    `<div class="evals">The engine's most likely line after the move. Blue is the player, red is the opponent.</div>`+
    `<div class="pctl">`+
      `<button class="pact" data-ctx="${ctx}" data-act="prev" aria-label="Previous step">&#9664;</button>`+
      `<button class="pact primary wide" data-ctx="${ctx}" data-act="play">${st.playing ? "&#10074;&#10074; Pause" : "&#9654; Play line"}</button>`+
      `<button class="pact" data-ctx="${ctx}" data-act="next" aria-label="Next step">&#9654;</button>`+
      `<button class="pact wide" data-ctx="${ctx}" data-act="all">${st.k===-2 ? "Hide line" : "Whole line"}</button>`+
    `</div>`+
    (st.extending ? `<div class="evals">Extending the line to the end of the game… ${len} moves so far. <button class="pact" data-ctx="${ctx}" data-act="stop" style="padding:.27rem .67rem">Stop</button></div>` : "")+
    predChart(ctx, st)+
    `<div class="evals" style="margin:.27rem 0 .4rem">Material for the player through the line. Red bars mean the player is down.${st.endText ? " " + st.endText : ""}</div>`+
    `<div class="plist">`;
  st.steps.forEach((x,i) => {
    const net = x.bal===0 ? "material even" : (x.bal<0 ? "the player is down " + (-x.bal) : "the player is up " + x.bal);
    h += `<button class="pstep ${x.who==="Player"?"me":"opp"}${st.k===i?" on":""}" data-ctx="${ctx}" data-k="${i}">`+
      `<span class="who">${i+1}. ${x.who}: ${x.san}</span><small>${x.txt}${x.mate?" Game over.":""} · ${net}</small></button>`;
  });
  h += `</div>`;
  if(st.k!==-1) h += `<button class="pback primary" data-ctx="${ctx}">Back to the game</button>`;
  return h;
}
function predHtml(ctx){
  return predState[ctx] ? `<div class="preds" id="predbox-${ctx}">${predInner(ctx)}</div>` : "";
}
function focusStep(ctx){
  const el = document.querySelector("#predbox-" + ctx + " .pstep.on"), list = document.querySelector("#predbox-" + ctx + " .plist");
  if(el && list) list.scrollTop = el.offsetTop - list.clientHeight/2 + el.clientHeight/2;
}
const predColor = x => x.who==="Player" ? "var(--blue)" : "var(--arR)";
const predArrow = x => [[x.from, x.to, predColor(x), {}]];
const predOver = ctx => { const st = predState[ctx]; return (st && st.k===-2) ? st : null; };
const overviewArrows = st => st.steps.map(x => [x.from, x.to, predColor(x), {thin:true, op:.85}]);
function arrowMid(p, q){
  const adx = Math.abs(q.x-p.x)/100, ady = Math.abs(q.y-p.y)/100;
  if((adx===1&&ady===2)||(adx===2&&ady===1)){
    const C = adx>ady ? {x:q.x,y:p.y} : {x:p.x,y:q.y};
    return {x:C.x+(q.x-C.x)*.4, y:C.y+(q.y-C.y)*.4};
  }
  return {x:(p.x+q.x)/2, y:(p.y+q.y)/2};
}
const overviewNums = (st, flip) => st.steps.map((x,i) => {
  const m = arrowMid(sqCtr(x.from,flip), sqCtr(x.to,flip));
  return {x:m.x, y:m.y, t:i+1, c:x.who==="Player" ? "#2f6fb5" : "#d6453d"};
});
const stepCaptures = x => x.capture ? [x.capture] : null;
const overviewCaptures = st => st.steps.filter(x => x.capture).map(x => x.capture);
let predAnim = null, predTimer = null;
function rerender(ctx){ if(ctx==="play"){ if(pg) renderPlay(); } else if(moves.length) show(); }
function stopPred(){
  if(predTimer){ clearInterval(predTimer); predTimer = null; }
  ["play","review"].forEach(c => { if(predState[c]) predState[c].playing = false; });
}
function stepTo(ctx, k, animate){
  const st = predState[ctx]; if(!st) return;
  st.k = k;
  predAnim = (animate && k>=0) ? {from:st.steps[k].from, to:st.steps[k].to} : null;
  if(animate && k>=0) snd(st.steps[k].snd);
  rerender(ctx);
  focusStep(ctx);
}
function togglePlay(ctx){
  const st = predState[ctx]; if(!st) return;
  if(st.playing){ stopPred(); rerender(ctx); return; }
  stopPred(); st.playing = true;
  if(st.k >= st.steps.length-1) st.k = -1;
  const adv = () => {
    if(predState[ctx]!==st || !st.playing){ stopPred(); return; }
    if(st.k >= st.steps.length-1){ stopPred(); rerender(ctx); return; }
    stepTo(ctx, st.k<0 ? 0 : st.k+1, true);
  };
  adv();
  predTimer = setInterval(adv, 1100);
}
document.addEventListener("click", e => {
  const b = e.target.closest(".pstep, .pback, .pact, .pbar");
  if(!b) return;
  const ctx = b.dataset.ctx, st = predState[ctx];
  if(!st) return;
  if(b.dataset.act==="stop"){ st.stopExt = true; return; }
  stopPred();
  if(b.classList.contains("pback")) return stepTo(ctx, -1, false);
  if(b.classList.contains("pstep") || b.classList.contains("pbar")){
    const k = +b.dataset.k;
    return stepTo(ctx, st.k===k ? -1 : k, st.k!==k);
  }
  const act = b.dataset.act;
  if(act==="all") stepTo(ctx, st.k===-2 ? -1 : -2, false);
  else if(act==="next") stepTo(ctx, Math.min(st.steps.length-1, st.k<0 ? 0 : st.k+1), true);
  else if(act==="prev") stepTo(ctx, st.k<=0 ? -1 : st.k-1, false);
  else if(act==="play") togglePlay(ctx);
});
const onPredChange = () => { stopPred(); predState.review = null; if(moves.length) show(); };
$("predsel").onchange = onPredChange;

