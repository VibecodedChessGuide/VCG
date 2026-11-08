/* ================= Memorization: square coordinates + move recall ================= */
const MEM_LEVEL_LABEL = {easy:"Easy", medium:"Medium", hard:"Hard"};
const MEM_REVEAL_MS = {easy:10000, medium:6000, hard:3000};
const MEM_EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";
const MEM_SECONDS = 300;

let memMode = "squares";
let memRun = null;
const memSeen = new Set();

function memFmt(ms){
  const s = Math.max(0, Math.ceil(ms/1000));
  return Math.floor(s/60) + ":" + String(s%60).padStart(2, "0");
}
function memSec(ms){ return (ms/1000).toFixed(2) + "s"; }
function memCue(big, small, isBig){
  const e = $("mcue");
  e.className = "mcue" + (isBig ? " big" : "");
  e.innerHTML = big + (small ? "<small>" + small + "</small>" : "");
}
function memStatus(t, cls){
  const e = $("mstatus");
  e.textContent = t;
  e.className = "status" + (cls ? " " + cls : "");
}
function memStats(){
  const st = memRun; if(!st) return;
  $("mhits").textContent = st.hits;
  $("mmisses").textContent = st.misses;
  $("mavg").textContent = st.hits ? (st.sumMs/st.hits/1000).toFixed(2) + "s" : "-";
}
function memTipUpd(){
  $("mtip").textContent = memMode==="squares"
    ? "Every square's name is shown for a few seconds, then the coordinates disappear and the board is normal. A square name appears - tap it as fast as you can. You get 5 minutes; misses are counted."
    : "A position from a real Lichess puzzle appears and the move is described in words. Tap the piece, then its target square, as fast as you can. You get 5 minutes; wrong tries are counted. Hard mode uses the toughest puzzles.";
}

/* ---- drawing helpers ---- */
function memOverlay(extra){
  const svg = $("mboard");
  const old = svg.querySelector("g.memx");
  if(old) old.remove();
  if(extra) svg.insertAdjacentHTML("beforeend", '<g class="memx">' + extra + "</g>");
}
function memLabels(){
  let s = "";
  for(let f=0; f<8; f++) for(let r=0; r<8; r++){
    const sq = "abcdefgh"[f] + (8-r), dark = (f+r)%2===1;
    s += `<text x="${f*100+50}" y="${r*100+51}" font-size="30" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${dark?BOARD().l:BOARD().d}">${sq.toUpperCase()}</text>`;
  }
  return s;
}
function memFb(list){
  let s = "";
  (list||[]).forEach(x => {
    const c = sqCtr(x.sq, false);
    s += `<rect x="${c.x-46}" y="${c.y-46}" width="92" height="92" rx="9" fill="${x.ok?"rgba(129,182,76,.4)":"rgba(250,65,45,.4)"}" stroke="${x.ok?"#81b64c":"#fa412d"}" stroke-width="5"/>`;
  });
  return s;
}
function memDrawSquares(labels, fb){
  const svg = $("mboard");
  drawBoard(svg, MEM_EMPTY_FEN, [], [], {});
  memOverlay((labels ? memLabels() : "") + (fb ? memFb(fb) : ""));
}
function memDrawMove(fb){
  const st = memRun;
  if(!st || !st.chess) return;
  const svg = $("mboard");
  const dots = st.sel ? st.chess.moves({square:st.sel, verbose:true}) : [];
  drawBoard(svg, st.chess.fen(), [], st.last ? [st.last.from, st.last.to] : [], {flip:st.flip, sel:st.sel, dots});
  memOverlay(fb ? memFb(fb) : null);
}

/* ---- session control ---- */
function memStopTimers(st){
  if(st.timer){ clearInterval(st.timer); st.timer = null; }
  if(st.iv){ clearInterval(st.iv); st.iv = null; }
  if(st.to){ clearTimeout(st.to); st.to = null; }
}
function memStop(){
  const st = memRun;
  if(st){ st.done = true; memStopTimers(st); }
  memRun = null;
  $("msession").classList.add("hide");
  $("mresult").classList.add("hide");
  $("msetup").classList.remove("hide");
}
function memHome(){
  memStop();
  $("lmem").classList.add("hide");
  $("lhome").classList.remove("hide");
}
function memSetMode(m){
  memMode = m;
  $("mmSquares").classList.toggle("on", m==="squares");
  $("mmSquares").setAttribute("aria-pressed", m==="squares" ? "true" : "false");
  $("mmMoves").classList.toggle("on", m==="moves");
  $("mmMoves").setAttribute("aria-pressed", m==="moves" ? "true" : "false");
  memTipUpd();
}
function memOpen(){
  learnToken++;
  $("lhome").classList.add("hide");
  $("lpuz").classList.add("hide");
  $("lmem").classList.remove("hide");
  memStop();
  memSetMode(memMode);
}
function memEnterSession(st){
  $("msetup").classList.add("hide");
  $("mresult").classList.add("hide");
  $("msession").classList.remove("hide");
  $("mtimer").textContent = memFmt(MEM_SECONDS*1000);
  $("mmeta").textContent = (st.mode==="squares" ? "Squares" : "Moves") + " | " + MEM_LEVEL_LABEL[st.level];
  memStats();
}

/* ---- end of drill ---- */
function memFinish(){
  const st = memRun;
  if(!st || st.done) return;
  st.done = true;
  memStopTimers(st);
  const n = st.hits + st.misses, acc = n ? st.hits/n : 0;
  const avg = st.hits ? st.sumMs/st.hits : 0;
  let rating;
  if(!st.hits) rating = 200;
  else if(st.mode==="squares") rating = 300 + 2200*acc - Math.max(0, avg-400)/2;
  else rating = 300 + 2200*acc - Math.max(0, avg-1500)*0.12;
  rating = Math.round(Math.max(200, Math.min(2900, rating)));
  const mode = st.mode==="squares" ? "Squares" : "Moves";
  const lvl = MEM_LEVEL_LABEL[st.level];
  const verdict = rating>=2400 ? "Exceptional board vision."
    : rating>=1900 ? "Strong recall."
    : rating>=1400 ? "Solid - keep drilling."
    : rating>=900 ? "Getting there. Keep practising."
    : "Speed comes with repetition.";
  $("mresult").innerHTML =
    "<h2>Drill complete</h2>" +
    '<div class="mrating">' + rating + "<small>Memorization rating | " + mode + " | " + lvl + "</small></div>" +
    '<div class="mstats">' +
      '<div class="mstat"><strong>' + st.hits + "</strong><small>Solved</small></div>" +
      '<div class="mstat"><strong>' + st.misses + "</strong><small>Failures</small></div>" +
      '<div class="mstat"><strong>' + (avg ? memSec(avg) : "-") + "</strong><small>Avg reaction</small></div>" +
    "</div>" +
    '<p class="tip">' + verdict + " Accuracy counts most; reaction time breaks ties." + "</p>" +
    '<div class="row"><button id="magain" class="primary" type="button">Play again</button><button id="mlessons" class="ghost" type="button">Back to lessons</button></div>';
  $("mresult").classList.remove("hide");
  $("msession").classList.add("hide");
  $("msetup").classList.remove("hide");
  $("magain").onclick = memStart;
  $("mlessons").onclick = memHome;
  snd("end");
}

/* ---- shared clock ---- */
function memTick(){
  const st = memRun;
  if(!st || st.done) return;
  const left = st.endAt - performance.now();
  $("mtimer").textContent = memFmt(left);
  if(left <= 0) memFinish();
}

/* ---- squares mode ---- */
function memStartSquares(){
  memStop();
  const st = memRun = {mode:"squares", level:$("mlevel").value, hits:0, misses:0, sumMs:0, queue:[],
    cue:null, cueAt:0, phase:"reveal", done:false, timer:null, iv:null, to:null, endAt:0};
  memEnterSession(st);
  const reveal = MEM_REVEAL_MS[st.level] || 6000, t0 = performance.now();
  memCue("Memorize", "all 64 squares", true);
  memStatus("The coordinates disappear in " + Math.ceil(reveal/1000) + " s. The 5-minute clock starts after that.");
  memDrawSquares(true, null);
  st.iv = setInterval(() => {
    if(st!==memRun || st.done) return;
    const left = reveal - (performance.now() - t0);
    if(left <= 0){
      clearInterval(st.iv); st.iv = null;
      st.phase = "quiz";
      st.endAt = performance.now() + MEM_SECONDS*1000;
      st.timer = setInterval(memTick, 250);
      snd("start");
      memNextSquare(st);
    } else {
      $("mstatus").textContent = "The coordinates disappear in " + Math.ceil(left/1000) + " s. The 5-minute clock starts after that.";
    }
  }, 200);
}
function memNextSquare(st){
  if(st!==memRun || st.done) return;
  if(!st.queue.length){
    st.queue = [];
    for(let f=0; f<8; f++) for(let r=1; r<=8; r++) st.queue.push("abcdefgh"[f] + r);
    for(let i=st.queue.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1)), t = st.queue[i];
      st.queue[i] = st.queue[j]; st.queue[j] = t;
    }
  }
  st.cue = st.queue.pop();
  st.cueAt = performance.now();
  st.phase = "quiz";
  memCue(st.cue.toUpperCase(), "tap the square", true);
  memDrawSquares(false, null);
}
function memTapSquare(st, sq){
  if(st.phase!=="quiz") return;
  const rt = performance.now() - st.cueAt;
  st.phase = "wait";
  if(sq===st.cue){
    st.hits++; st.sumMs += rt; memStats();
    memStatus("Correct - " + memSec(rt) + ".", "good");
    memDrawSquares(false, [{sq, ok:true}]);
    snd("self");
    st.to = setTimeout(() => {
      st.to = null;
      if(st!==memRun || st.done) return;
      memNextSquare(st);
    }, 180);
  } else {
    st.misses++; memStats();
    memStatus("Missed " + st.cue.toUpperCase() + ".", "bad");
    memDrawSquares(false, [{sq, ok:false}, {sq:st.cue, ok:true}]);
    st.to = setTimeout(() => {
      st.to = null;
      if(st!==memRun || st.done) return;
      memNextSquare(st);
    }, 650);
  }
}

/* ---- moves mode (Lichess puzzle packs) ---- */
function memMoveWords(m){
  if(m.flags.includes("k")) return "Castle kingside: king " + m.from + " to " + m.to;
  if(m.flags.includes("q")) return "Castle queenside: king " + m.from + " to " + m.to;
  const pn = NAMES[m.piece];
  if(m.captured) return "Take the " + NAMES[m.captured] + " on " + m.to + " with the " + pn + " on " + m.from;
  let s = "Move the " + pn + " from " + m.from + " to " + m.to;
  if(m.promotion) s += " and promote to a " + NAMES[m.promotion];
  return s;
}
function memPuzzleFrom(rec){
  if(!rec || rec.length < 4) return null;
  const id = rec[0], fen = rec[1], mstr = rec[2] || "", rating = rec[3];
  const mv = mstr.split(" ");
  if(mv.length < 2) return null;
  const g = new Chess(fen);
  if(!uciToMove(g, mv[0])) return null;
  const fen2 = g.fen();
  const probe = new Chess(fen2);
  const m = uciToMove(probe, mv[1]);
  if(!m) return null;
  return {id, fen:fen2, uci:mv[1], san:m.san, rating:rating || "", words:memMoveWords(m)};
}
async function memPickPuzzle(level){
  const pack = LPACK;
  if(!pack) return null;
  const band = level==="easy" ? "e" : level==="medium" ? "m" : "h";
  const ids = Object.keys(pack.lessons).filter(id => (pack.lessons[id][band]||0) > 0);
  if(!ids.length) return null;
  const K = pack.chunk || 40;
  for(let tries=0; tries<8; tries++){
    const theme = ids[Math.floor(Math.random()*ids.length)];
    const count = pack.lessons[theme][band];
    const off = Math.floor(Math.random()*count);
    const ci = Math.floor(off/K);
    const url = "assets/puzzles/" + theme + "/" + band + "-" + ci + ".json";
    let chunk = lShards[url];
    if(!chunk){
      try{
        const r = await fetch(url);
        if(!r.ok) continue;
        chunk = lShards[url] = await r.json();
      }catch(e){ continue; }
    }
    if(!chunk || !chunk.length) continue;
    let idx = off - ci*K;
    if(idx < 0 || idx >= chunk.length) idx = Math.floor(Math.random()*chunk.length);
    const pz = memPuzzleFrom(chunk[idx]);
    if(pz) return pz;
  }
  return null;
}
function memQueueNext(st){
  st.nextP = memPickPuzzle(st.level).catch(() => null);
}
async function memNextPuzzle(st){
  for(let tries=0; tries<8; tries++){
    if(st!==memRun || st.done) return null;
    const pz = st.nextP ? await st.nextP : await memPickPuzzle(st.level);
    st.nextP = null;
    if(!pz) return null;
    if(memSeen.has(pz.id)) continue;
    memSeen.add(pz.id);
    memQueueNext(st);
    return pz;
  }
  return null;
}
function memShowPuzzle(st, pz){
  st.pz = pz;
  st.chess = new Chess(pz.fen);
  st.flip = st.chess.turn()==="b";
  st.sel = null; st.last = null; st.phase = "quiz";
  st.cueAt = performance.now();
  memCue(pz.words, "Lichess " + pz.rating + " | " + MEM_LEVEL_LABEL[st.level], false);
  memStatus("Tap the piece, then its target square.");
  memDrawMove(null);
}
async function memStartMoves(){
  memStop();
  const st = memRun = {mode:"moves", level:$("mlevel").value, hits:0, misses:0, sumMs:0,
    phase:"load", done:false, timer:null, to:null, sel:null, chess:null, pz:null, nextP:null,
    flip:false, last:null, endAt:0};
  memEnterSession(st);
  memCue("Loading", "picking a puzzle from real games...", true);
  memStatus("Loading Lichess puzzles...");
  try{
    const pack = await lLoadPack();
    if(st!==memRun || st.done) return;
    if(!pack){
      memCue("No puzzles", "the puzzle pack failed to load", true);
      memStatus("Couldn't load the puzzle pack. Make sure assets/puzzles is served next to the page.", "bad");
      return;
    }
    const pz = await memNextPuzzle(st);
    if(st!==memRun || st.done) return;
    if(!pz){
      memCue("No puzzles", "nothing in this difficulty", true);
      memStatus("No puzzles found for this difficulty. Try another difficulty.", "bad");
      return;
    }
    st.endAt = performance.now() + MEM_SECONDS*1000;
    st.timer = setInterval(memTick, 250);
    memShowPuzzle(st, pz);
    snd("start");
  }catch(err){
    console.error("Memory: puzzle load failed", err);
    if(st===memRun && !st.done){
      memCue("-", "", true);
      memStatus("Something went wrong loading puzzles. Try again.", "bad");
    }
  }
}
function memWrongMove(st){
  st.misses++; memStats();
  memStatus("Not that move - try again.", "bad");
  st.sel = null;
  memDrawMove(null);
}
function memTapMove(st, sq){
  if(st.phase!=="quiz" || !st.chess) return;
  if(st.sel){
    if(st.sel === sq){ st.sel = null; memDrawMove(null); return; }
    if(st.chess.moves({square:st.sel, verbose:true}).some(m => m.to===sq)){
      const from = st.sel;
      st.sel = null;
      if(from + sq === st.pz.uci.slice(0,4)){
        const m = st.chess.move({from, to:sq, promotion:st.pz.uci[4] || undefined});
        if(m){
          const rt = performance.now() - st.cueAt;
          st.hits++; st.sumMs += rt; memStats();
          st.last = {from, to:sq}; st.phase = "wait";
          memStatus("Correct - " + memSec(rt) + ".", "good");
          memDrawMove(null);
          snd(sndKind(m, true));
          st.to = setTimeout(async () => {
            st.to = null;
            if(st!==memRun || st.done) return;
            st.phase = "load";
            try{
              const pz = await memNextPuzzle(st);
              if(st!==memRun || st.done) return;
              if(!pz){ memFinish(); return; }
              memShowPuzzle(st, pz);
            }catch(e){
              if(st===memRun && !st.done) memFinish();
            }
          }, 220);
          return;
        }
      }
      memWrongMove(st);
      return;
    }
  }
  const p = st.chess.get(sq);
  if(p && p.color===st.chess.turn()){ st.sel = sq; memDrawMove(null); }
  else { st.sel = null; memDrawMove(null); }
}

/* ---- input + buttons ---- */
$("mboard").addEventListener("pointerdown", e => {
  const st = memRun;
  if(!st || st.done || st.phase!=="quiz") return;
  const sq = sqAt($("mboard"), e, st.mode==="moves" ? st.flip : false);
  if(!sq) return;
  e.preventDefault();
  if(st.mode==="squares") memTapSquare(st, sq);
  else memTapMove(st, sq);
});
function memStart(){
  if(memMode==="squares") memStartSquares();
  else memStartMoves();
}
$("mmSquares").onclick = () => memSetMode("squares");
$("mmMoves").onclick = () => memSetMode("moves");
$("mstart").onclick = memStart;
$("mback").onclick = memHome;
$("mstop").onclick = () => {
  if(memRun && !memRun.done && memRun.endAt) memFinish();
  else memStop();
};
memTipUpd();
