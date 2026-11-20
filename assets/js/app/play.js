/* ================= PLAY MODE ================= */
let pg = null, humanColor = "w", pFlip = false, selSq = null, lastMove = null;
let analysisBefore = null, thinking = false, awaiting = null, over = false, gameId = 0;
let fb = null, hint = null, ptags = [], optMode = false;
const OPT_DELAY_MS = 900; // Optimisation mode throttles the engine's move pace
let hideSq = null, hoverSq = null, pendingAnim = null, spec = null;
let gameStartFen = null; // set when the game began from a sandbox position instead of the normal start

function setP(t){ $("pstatus").textContent = t; }
const canMove = () => pg && !over && !thinking && !awaiting && pg.turn()===humanColor;

function renderPlay(boardOnly){
  if(sb){ renderSandbox(); return; }
  if(!pg) return;
  const pst = predStep("play"), pov = predOver("play");
  const fen = pst ? pst.fen : pov ? pov.fen : pg.fen();
  let arrows = [];
  if(fb && fb.arrowsOn) arrows = fb.arrows;
  else if(hint) arrows = hint.items.filter(x => x.uci).map(x => [x.uci.slice(0,2), x.uci.slice(2,4), x.color, {}]);
  if(pst) arrows = predArrow(pst);
  else if(pov) arrows = overviewArrows(pov);
  const facts = showFacts ? boardFacts(fen) : null;
  const dots = (selSq && !thinking && !awaiting && !over && !pst) ? pg.moves({square:selSq, verbose:true}) : [];
  drawBoard($("pboard"), fen, arrows, pst ? [pst.from, pst.to] : (lastMove ? [lastMove.from, lastMove.to] : []), {
    flip:pFlip, sel:pst?null:selSq, dots, facts, hideSq, anim: pst ? predAnim : pendingAnim,
    badge: (!pst && !pov && fb && fb.arrowsOn) ? fb.badge : null,
    nums: pov ? overviewNums(pov, pFlip) : null,
    captures: pst ? stepCaptures(pst) : pov ? overviewCaptures(pov) : null
  });
  pendingAnim = null; predAnim = null;
  $("pfacts").textContent = facts ? factsText(facts) : "";
  const ph = $("phints");
  ph.classList.toggle("hide", !hint || optMode);
  if(hint) setHTML(ph, hint.items.map(x => `<div class="hl${x.uci ? "" : " none"}"><i style="background:${x.color}"></i><span><b>${x.label}:</b> ${esc(x.text)}</span></div>`).join(""));
  if(boardOnly) return;
  const h = pg.history(); let t = "";
  h.forEach((m,i) => { t += (i%2===0 ? (i/2+1)+". " : "") + m + " "; });
  $("phist").textContent = t;
  setHTML($("pcoach"), fb ? fb.html + (fb.predOn ? predHtml("play") : "") : `<span class="empty">Your move. The analysis will review it once you play.</span>`);
  $("ptake").classList.toggle("hide", !awaiting);
  $("pcont").classList.toggle("hide", !awaiting);
  $("ptoggle").classList.toggle("hide", !!awaiting);
  $("preview").classList.toggle("hide", !!gameStartFen || !(over || (pg.history().length>=2 && !thinking)));
  $("phint").disabled = !(pg && !over && !thinking && !awaiting && pg.turn()===humanColor);
  $("presign").disabled = over || !pg;
  drawTallyInto($("ptally"), ptags);
  if(gameStartFen) $("popen").classList.add("hide"); else updatePlayOpen();
}
function setNames(){
  const lvl = $("plevel").options[$("plevel").selectedIndex].text;
  const oppCol = humanColor==="w" ? "b" : "w";
  $("ptop").innerHTML = `<span class="sw ${oppCol}"></span>${PLAY_BOT().name} · ${lvl}`;
  $("pbot").innerHTML = `<span class="sw ${humanColor}"></span>You`;
}

async function startGame(startFen){
  if(!engineReady) return;
  if(sb) leaveSandboxUI();
  const id = ++gameId;
  bootAux(engineGen);
  humanColor = $("pcolor").value; pFlip = humanColor==="b";
  gameStartFen = (typeof startFen === "string") ? startFen : null; // a click event can arrive here too, so check the type
  pg = gameStartFen ? new Chess(gameStartFen) : new Chess(); selSq = null; lastMove = null; fb = null; hint = null;
  ptags = []; awaiting = null; over = false; thinking = false; hideSq = null; hoverSq = null; pendingAnim = null;
  clearMarks("pboard"); predState.play = null; spec = null;
  setNames(); snd("start");
  setEvalBar("pevalbar", {cp:0, mate:null}, pFlip);
  renderPlay();
  if(PLAY_BOT().url) idle(() => ensurePlayBotEngine());
  else if(nnueActive) idle(() => ensureOpponentEngine());
  if(pg.turn()!==humanColor) await engineMove(id);
  else {
    beginHumanTurn();
    if(gameStartFen) Promise.resolve(analysisBefore).then(a => { // show the real evaluation of a sandbox start
      if(a && id===gameId && typeof a.cp==="number" && pg.history().length===0) setEvalBar("pevalbar", a, pFlip);
    }).catch(() => {});
  }
}
function beginHumanTurn(){
  analysisBefore = enqueue(() => analyze(pg.fen(), FD));
  thinking = false; renderPlay();
  setP(pg.in_check() ? "Check. Your move." : "Your move.");
}
async function engineMove(id){
  const pbot = PLAY_BOT(), botGame = !!pbot.url;
  thinking = true; setP(pbot.name + " is thinking…"); renderPlay();
  const lvl = $("plevel").value, L = LEVELS[lvl], fen = pg.fen();
  const uciMoves = () => pg.history({verbose:true}).map(m => m.from + m.to + (m.promotion || ""));
  let u = (spec && spec.fen===fen && spec.lvl===lvl && (botGame ? spec.bot===playBotId : spec.net===nnueActive)) ? await spec.p : null;
  spec = null;
  if(id!==gameId || over) return;
  if(!u || u==="(none)"){
    if(botGame){
      setP(pbot.name + " is thinking…");
      u = await playBotSearch(fen, lvl, uciMoves());
      if(id!==gameId || over) return;
    } else {
      if(nnueActive && !opponentWorker()) setP("Loading opponent network...");
      const ow = nnueActive ? await ensureOpponentEngine() : null;
      if(id!==gameId || over) return;
      setP("Stockfish is thinking…");
      if(ow) u = await onW(ow, () => engineSearch(fen, L.skill, L.depth, ow));
      if(!u) u = await enqueue(() => engineSearch(fen, L.skill, L.depth));
    }
  }
  if((!u || u==="(none)") && (!main || main.dead)){
    await recoverEngine();
    if(id!==gameId || over) return;
    if(engineReady) u = await enqueue(() => engineSearch(fen, L.skill, L.depth));
  }
  if((!u || u==="(none)") && botGame){
    // Safety net: if the opponent bot fails, let Stockfish answer rather than stall the game.
    setP("Stockfish is taking over this move…");
    u = await enqueue(() => engineSearch(fen, L.skill, L.depth));
  }
  if(id!==gameId || over) return;
  if(optMode) await new Promise(r => setTimeout(r, OPT_DELAY_MS));
  if(id!==gameId || over) return;
  let m = uciToMove(pg, u);
  if(!m){ const legal = pg.moves({verbose:true}); if(legal.length) m = pg.move(legal[Math.floor(Math.random()*legal.length)]); }
  if(m){ lastMove = m; pendingAnim = {from:m.from, to:m.to}; snd(sndKind(m,false)); }
  thinking = false;
  if(pg.game_over()){ finish(); return; }
  beginHumanTurn();
}
async function humanMove(from, to, animate=true){
  const id = gameId;
  try{ await humanMoveInner(from, to, animate); }
  catch(err){
    console.error("humanMove failed:", err);
    if(id !== gameId) return;
    thinking = false; awaiting = null; spec = null;
    if(pg && !over && pg.turn() !== humanColor){
      try{ await engineMove(id); return; }catch(e2){ console.error(e2); thinking = false; }
    }
    renderPlay(); setP("The engine hit a snag. Your move, or tap New game.");
  }
}
async function humanMoveInner(from, to, animate=true){
  const id = gameId, bp = analysisBefore;
  thinking = true; hint = null;
  const fenBeforeMove = pg.fen();
  const m = pg.move({from, to, promotion:"q"});
  if(!m){ thinking = false; return; }
  lastMove = m; selSq = null;
  predState.play = null; // drop any old predicted line now, so its engine searches stop queueing ahead of this move
  pendingAnim = animate ? {from:m.from, to:m.to} : null;
  clearMarks("pboard");
  snd(sndKind(m,true));
  const fenAfter = pg.fen(), ply = pg.history().length;
  const pbot = PLAY_BOT();
  if(pbot.url && !pg.game_over()){
    const lvl = $("plevel").value;
    const moves = pg.history({verbose:true}).map(x => x.from + x.to + (x.promotion || ""));
    spec = {fen:fenAfter, lvl, bot:playBotId, p:playBotSearch(fenAfter, lvl, moves).catch(() => null)};
  } else {
    const ow = opponentWorker();
    const sw = nnueActive ? ow : ((aux && !aux.dead) ? aux : null);
    if(sw && !pg.game_over()){
      const lvl = $("plevel").value, L = LEVELS[lvl];
      spec = {fen:fenAfter, lvl, net:nnueActive, p:onW(sw, () => engineSearch(fenAfter, L.skill, L.depth, sw)).catch(() => null)};
    }
  }
  renderPlay(); setP("Checking your move…");
  let before = await (bp || enqueue(() => analyze(fenBeforeMove, FD)));
  if(!before) before = await enqueue(() => analyze(fenBeforeMove, FD));
  const after = before ? await enqueue(() => analyze(fenAfter, FD)) : null;
  if(id!==gameId || over) return;
  if(!before || !after) return skipAnalysis(id);
  const rv = judgePair(before, after, m);
  const moveNo = Math.ceil(ply/2) + (m.color==="w" ? "." : "...");
  setEvalBar("pevalbar", after, pFlip);
  predState.play = null;
  const n = predN();
  if((rv.cls!=="good" && rv.cls!=="brilliant" && rv.cls!=="great" && rv.cls!=="book") && n>0 && !pg.game_over()){
    setP("Predicting this move…");
    const deep = await enqueue(() => analyze(fenAfter, Math.min(14, Math.max(FD, n+2))));
    if(id!==gameId || over) return;
    buildPred("play", fenAfter, (deep && deep.pv.length > after.pv.length) ? deep.pv : after.pv, n, m.color);
  }
  fb = {html:explainHtml(before, after, m, rv, moveNo, true), arrows:feedbackArrows(before, m, rv, true), arrowsOn:true, badge:{sq:m.to, kind:rv.kind}, predOn:!!predState.play};
  if(rv.tag) ptags.push(rv.tag);
  if(pg.game_over()){ thinking = false; finish(); return; }
  if(rv.cls!=="good" && rv.cls!=="brilliant" && rv.cls!=="great" && rv.cls!=="book"){
    awaiting = {before, after, tagged:!!rv.tag};
    thinking = false; renderPlay();
    setP("That cost you. Take it back and try again, or continue.");
    return;
  }
  renderPlay();
  await engineMove(id);
}
async function skipAnalysis(id){
  await recoverEngine();
  if(id!==gameId || over) return;
  fb = {html:`<span class="empty">This move was not analysed because the engine had to restart.</span>`, arrows:[], arrowsOn:false, badge:null, predOn:false};
  if(pg.game_over()){ thinking = false; finish(); return; }
  if(!engineReady){ thinking = false; renderPlay(); setP("The engine could not restart. Reload the page."); return; }
  await engineMove(id);
}
function takeback(){
  if(!awaiting) return;
  pg.undo();
  const h = pg.history({verbose:true});
  lastMove = h.length ? h[h.length-1] : null;
  if(awaiting.tagged) ptags.pop();
  analysisBefore = Promise.resolve(awaiting.before);
  setEvalBar("pevalbar", awaiting.before, pFlip);
  awaiting = null; fb = null; selSq = null; predState.play = null; spec = null;
  renderPlay(); setP("Your move.");
}
async function continueGame(){
  if(!awaiting) return;
  awaiting = null; thinking = true;
  if(fb) fb.predOn = false;
  predState.play = null;
  await engineMove(gameId);
}
function finish(){
  over = true; thinking = false;
  let msg = "Game over.";
  if(pg.in_checkmate()) msg = "Checkmate. " + (pg.turn()==="w" ? "Black" : "White") + " wins.";
  else if(pg.in_stalemate()) msg = "Stalemate. It's a draw.";
  else if(pg.insufficient_material()) msg = "Draw by insufficient material.";
  else if(pg.in_threefold_repetition()) msg = "Draw by repetition.";
  else if(pg.in_draw()) msg = "Draw.";
  renderPlay(); setP(msg + " Tap Review game for the full breakdown.");
  setTimeout(() => snd(pg.in_checkmate() ? "end" : "draw"), 350);
}

/* ---- pointer input: tap-tap or drag and drop ---- */
let drag = null;
const NS = "http://www.w3.org/2000/svg";
function endDrag(){
  if(!drag) return;
  const gh = $("pboard").querySelector("#ghost"); if(gh) gh.remove();
  drag = null; rc = null; hideSq = null; hoverSq = null;
}
$("pboard").addEventListener("pointerdown", e => {
  if(e.button!==0) return;
  const svg = $("pboard");
  const hadMarks = clearMarks("pboard");
  const s = sqAt(svg, e, pFlip);
  if(!s) return;
  if(sb){ e.preventDefault(); sandboxTap(s, e.shiftKey); return; }
  if(!canMove()){ if(hadMarks && pg) renderPlay(true); return; }
  e.preventDefault();
  if(fb) fb.arrowsOn = false;
  hint = null;
  if(selSq && selSq!==s && pg.moves({square:selSq, verbose:true}).some(m => m.to===s)){ humanMove(selSq, s, true); return; }
  const p = pg.get(s);
  if(p && p.color===humanColor){
    drag = {from:s, wasSel:selSq===s};
    rc = {svg, r:svg.getBoundingClientRect()};
    selSq = s; hideSq = s; hoverSq = s;
    renderPlay(true);
    const gh = document.createElementNS(NS, "image");
    gh.setAttribute("id", "ghost");
    gh.setAttribute("href", PIECE_URL(p.color, p.type));
    gh.setAttribute("width", 130); gh.setAttribute("height", 130);
    gh.style.pointerEvents = "none";
    const pt = svgPt(svg, e);
    gh.setAttribute("x", pt.x-65); gh.setAttribute("y", pt.y-65);
    svg.appendChild(gh);
    svg.setPointerCapture(e.pointerId);
    paintOverlay(svg, pFlip);
  } else {
    selSq = null; renderPlay(true);
  }
});
$("pboard").addEventListener("pointermove", e => {
  if(!drag) return;
  const svg = $("pboard"), gh = svg.querySelector("#ghost"), pt = svgPt(svg, e);
  if(gh){ gh.setAttribute("x", pt.x-65); gh.setAttribute("y", pt.y-65); }
  const t = sqAt(svg, e, pFlip);
  if(t!==hoverSq){ hoverSq = t; paintOverlay(svg, pFlip); }
});
function dropEnd(e, cancel){
  if(!drag) return;
  const d = drag, t = cancel ? null : sqAt($("pboard"), e, pFlip);
  endDrag();
  const legal = t && t!==d.from && pg.moves({square:d.from, verbose:true}).some(m => m.to===t);
  if(legal){ humanMove(d.from, t, false); return; }
  if(d.wasSel && t===d.from) selSq = null;
  renderPlay(true);
}
$("pboard").addEventListener("pointerup", e => { if(e.button===0) dropEnd(e, false); });
$("pboard").addEventListener("pointercancel", e => dropEnd(e, true));
attachMarks($("pboard"), () => pFlip, () => { if(sb) renderSandbox(); else if(pg) renderPlay(true); else paintOverlay($("pboard"), pFlip); });


/* ================= SANDBOX: set up any position, then play it =================
   Pick a piece from the palette, then tap squares to place it. Air clears a square.
   "Play from here" starts a normal game against the selected bot from that position. */
let sb = null; // {board:{sq:"wp"}} while the sandbox is open
let sbPick = "wp";
const SB_PIECES = [
  ["", "Air"],
  ["wp","Pawn"],["wn","Knight"],["wb","Bishop"],["wr","Rook"],["wq","Queen"],["wk","King"],
  ["bp","Pawn"],["bn","Knight"],["bb","Bishop"],["br","Rook"],["bq","Queen"],["bk","King"]
];
const PCOACH_INIT = $("pcoach").innerHTML;
function sbFromFen(fen){
  const b = {};
  new Chess(fen).board().forEach((row, r) => row.forEach((c, f) => { if(c) b["abcdefgh"[f] + (8-r)] = c.color + c.type; }));
  return b;
}
function sbGrid(){
  const rows = [];
  for(let r=0;r<8;r++){
    const row = [];
    for(let f=0;f<8;f++){ const v = sb.board["abcdefgh"[f] + (8-r)]; row.push(v ? {color:v[0], type:v[1]} : null); }
    rows.push(row);
  }
  return rows;
}
function sbFen(turn){
  let place = "";
  for(let r=0;r<8;r++){
    let run = 0;
    for(let f=0;f<8;f++){
      const v = sb.board["abcdefgh"[f] + (8-r)];
      if(!v) run++;
      else { if(run){ place += run; run = 0; } place += v[0]==="w" ? v[1].toUpperCase() : v[1]; }
    }
    if(run) place += run;
    if(r<7) place += "/";
  }
  const at = (sq, v) => sb.board[sq] === v;
  let cas = "";
  if(at("e1","wk") && at("h1","wr")) cas += "K";
  if(at("e1","wk") && at("a1","wr")) cas += "Q";
  if(at("e8","bk") && at("h8","br")) cas += "k";
  if(at("e8","bk") && at("a8","br")) cas += "q";
  return place + " " + (turn || $("sbturn").value) + " " + (cas || "-") + " - 0 1";
}
function sbProblem(){
  const vals = Object.entries(sb.board);
  const count = v => vals.filter(([, x]) => x === v).length;
  if(count("wk") !== 1 || count("bk") !== 1) return "Each side needs exactly one king.";
  if(vals.some(([sq, x]) => x[1]==="p" && (sq[1]==="1" || sq[1]==="8"))) return "Pawns can't stand on the first or last rank.";
  const LIMITS = {p:8,n:10,b:10,r:10,q:9};
  const NAMES = {p:"pawns",n:"knights",b:"bishops",r:"rooks",q:"queens"};
  for(const c of ["w","b"]){
    const mine = vals.filter(([, x]) => x[0]===c);
    if(mine.length>16) return "Too many " + (c==="w"?"white":"black") + " pieces. Stockfish allows at most 16 per side.";
    for(const [t,max] of Object.entries(LIMITS)){
      const n = mine.filter(([, x]) => x[1]===t).length;
      if(n>max) return "Too many " + NAMES[t] + ". Stockfish allows at most " + max + " per side.";
    }
  }
  const g = new Chess();
  if(!g.load(sbFen())) return "That position isn't valid. Check the kings and pawns.";
  const other = new Chess();
  if(other.load(sbFen($("sbturn").value==="w" ? "b" : "w")) && other.in_check()) return "The side that isn't to move is in check, which can't happen. Change whose turn it is or move a piece.";
  if(g.game_over()) return "That position is already a finished game (checkmate, stalemate or no mating material). Change it to play.";
  return null;
}
function renderSBPalette(){
  setHTML($("sbpal"), SB_PIECES.map(([v, label]) => {
    const name = v ? (v[0]==="w" ? "White " : "Black ") + label : "Air";
    const icon = v ? `<img src="${PIECE_URL(v[0],v[1])}" alt="">` : `<span class="air">\u00D7</span>`;
    return `<button type="button" data-sbpiece="${v}" title="${name}" aria-label="${name}" aria-pressed="${v===sbPick}"${v===sbPick ? ` class="sel"` : ""}>${icon}<span>${label}</span></button>`;
  }).join(""));
}
function renderSandbox(){
  if(!sb) return;
  drawBoard($("pboard"), "", [], [], {flip:pFlip, pieces:sbGrid()});
  $("pfacts").textContent = ""; $("phist").textContent = "";
  $("popen").classList.add("hide");
  ["ptake","pcont","preview"].forEach(id => $(id).classList.add("hide"));
  setHTML($("pcoach"), `<span class="empty">Sandbox: build any position, then tap Play from here. Pick your side and whose turn it is first.</span>`);
}
function sandboxTap(sq, erase){
  const v = erase ? "" : sbPick;
  if(v) sb.board[sq] = v; else delete sb.board[sq];
  setP("Sandbox. Tap a square to place the selected piece.");
  renderSandbox();
}
function enterSandbox(){
  if(sb) return;
  gameId++; spec = null; hint = null; thinking = false; selSq = null; hideSq = null; hoverSq = null;
  endDrag(); clearMarks("pboard");
  sb = {board: sbFromFen(pg ? pg.fen() : new Chess().fen())};
  $("sbturn").value = pg ? pg.turn() : "w";
  $("sbside").value = $("pcolor").value;
  document.querySelector(".c-setup").classList.add("sbmode");
  $("sbbox").classList.remove("hide");
  $("psandbox").textContent = "Exit sandbox"; $("psandbox").setAttribute("aria-pressed", "true");
  renderSBPalette();
  setP("Sandbox. Tap a square to place the selected piece.");
  renderSandbox();
}
function leaveSandboxUI(){
  sb = null;
  document.querySelector(".c-setup").classList.remove("sbmode");
  $("sbbox").classList.add("hide");
  $("psandbox").textContent = "Sandbox"; $("psandbox").setAttribute("aria-pressed", "false");
}
function exitSandbox(){
  if(!sb) return;
  leaveSandboxUI();
  if(!pg){
    drawBoard($("pboard"), new Chess().fen(), [], [], {flip:pFlip});
    setHTML($("pcoach"), PCOACH_INIT);
    setP("Pick a bot and tap New game."); return;
  }
  renderPlay();
  if(over){ setP("Game over. Tap New game to play again."); return; }
  if(awaiting){ setP("That cost you. Take it back and try again, or continue."); return; }
  if(pg.turn()===humanColor) beginHumanTurn(); else engineMove(gameId);
}
function sandboxPlay(){
  if(!sb) return;
  if(!engineReady){ setP("The engine is still loading. Try again in a moment."); return; }
  const err = sbProblem();
  if(err){ setP(err); return; }
  const fen = sbFen(), side = $("sbside").value;
  $("pcolor").value = side;
  startGame(fen);
}
$("psandbox").onclick = () => { if(sb) exitSandbox(); else enterSandbox(); };
$("sbpal").onclick = e => {
  const b = e.target.closest("[data-sbpiece]");
  if(!b || !sb) return;
  sbPick = b.dataset.sbpiece;
  renderSBPalette();
  setP(sbPick ? "Selected " + b.title + ". Tap a square to place it." : "Air selected. Tap a square to clear it.");
};
$("sbclear").onclick = () => { if(sb){ sb.board = {}; renderSandbox(); } };
$("sbstart").onclick = () => { if(sb){ sb.board = sbFromFen(new Chess().fen()); $("sbturn").value = "w"; renderSandbox(); } };
$("sbflip").onclick = () => { if(sb){ pFlip = !pFlip; renderSandbox(); } };
$("sbplay").onclick = sandboxPlay;

$("pnew").onclick = () => startGame();
$("ptake").onclick = takeback;
$("pcont").onclick = continueGame;
$("ptoggle").onclick = toggleFacts;
$("rtoggle").onclick = toggleFacts;
$("psound").onclick = () => { soundOn = !soundOn; $("psound").textContent = "Sound: " + (soundOn?"on":"off"); if(soundOn) snd("self"); };
$("optmode").onclick = () => { optMode = !optMode; $("optmode").textContent = "Optimisation: " + (optMode?"on":"off"); if(pg) renderPlay(); };
/* Hint = three ideas from the engine's top lines: an attacking move, a defensive move, and a tactic. */
const HINT_KINDS = [["off","Offensive","var(--arR)"],["def","Defensive","var(--blue)"],["tac","Tactical","var(--arO)"]];
function hintTriple(fen, lines){
  const g0 = new Chess(fen), me = g0.turn(), en = me==="w" ? "b" : "w";
  const f0 = boardFacts(fen), sum = a => a.reduce((t,x) => t + VAL[x.type], 0);
  const nm = x => NAMES[x.type] + " on " + x.sq;
  const mine0 = f0.unprotected.filter(x => x.color===me), theirs0 = f0.unprotected.filter(x => x.color===en);
  const pins0 = f0.pinned.filter(x => x.color===en).length;
  const top = lines[0].cp, cands = [];
  lines.forEach((l, rank) => {
    if(top - l.cp > 120 && !(l.mate>0)) return; // stay close to the engine's best
    const g = new Chess(fen), m = uciToMove(g, l.mv); if(!m) return;
    const fa = boardFacts(g.fen());
    const mine1 = fa.unprotected.filter(x => x.color===me), theirs1 = fa.unprotected.filter(x => x.color===en);
    const moved = sq => sq===m.from ? m.to : sq;
    const rescued = mine0.filter(e => !mine1.some(x => x.sq===moved(e.sq)));
    const targets = theirs1.filter(x => !theirs0.some(e => e.sq===x.sq));
    const ft = forkTargets(fen, l.mv) || [];
    const pins = fa.pinned.filter(x => x.color===en).length - pins0;
    const mate = /#/.test(m.san), check = /[+#]/.test(m.san), capV = m.captured ? VAL[m.captured] : 0;
    cands.push({l, m, rank, rescued, targets, ft, pins, mate, check, capV,
      def: sum(mine0) - sum(mine1),
      off: sum(targets) + (check ? 1 : 0) + capV,
      tac: (ft.length>=2 ? 4 : 0) + (mate ? 6 : 0) + (check ? 1.5 : 0) + Math.max(0, pins)*2 + (capV>=3 ? capV*0.5 : 0) + (targets.length>=2 ? 2 : 0)});
  });
  const pick = (list, key, min) => list.filter(c => c[key] > min).sort((a,b) => b[key]-a[key] || a.rank-b.rank)[0] || null;
  const tac = pick(cands, "tac", 1.4);
  const def = pick(cands.filter(c => c!==tac), "def", 0);
  const off = pick(cands.filter(c => c!==tac && c!==def), "off", 0) || cands.filter(c => c!==tac && c!==def)[0] || null;
  const tacText = c => c.mate ? c.m.san + " delivers checkmate"
    : c.ft.length>=2 ? c.m.san + " forks " + c.ft.join(" and ")
    : c.pins>0 ? c.m.san + " pins an enemy piece to its king"
    : c.check ? c.m.san + " gives check and forces a reply"
    : c.m.captured ? c.m.san + " wins the " + NAMES[c.m.captured] : describe(fen, c.l.mv);
  const out = {
    off: off ? {uci:off.l.mv, text: off.targets.length ? off.m.san + " attacks the " + off.targets.map(nm).join(" and ") : describe(fen, off.l.mv)}
             : {text:"No attacking move stands out here."},
    def: def ? {uci:def.l.mv, text: def.m.san + " rescues your " + def.rescued.map(nm).join(" and ")}
             : {text: mine0.length ? "Your " + mine0.map(nm).join(" and ") + " is loose, but no good fix is near the top of the engine's list." : "Nothing of yours is under attack right now."},
    tac: tac ? {uci:tac.l.mv, text:tacText(tac)} : {text:"No forcing tactic here. A quiet plan works best."}
  };
  return {items: HINT_KINDS.map(([k, label, color]) => ({label, color, uci: out[k].uci || null, text: out[k].text}))};
}
$("phint").onclick = async () => {
  if(thinking || awaiting || over || !pg) return;
  const id = gameId, fen = pg.fen();
  $("phint").disabled = true;
  if(optMode){
    setP("Finding the best move…");
    let b = null;
    try{ b = await analysisBefore; }catch(e){}
    if(id!==gameId || !pg || pg.fen()!==fen) return;
    if(!b || b.fen!==fen || !b.best){
      let lines = null;
      try{ lines = await lsearch(fen, 12, 1); }catch(e){}
      if(id!==gameId || !pg || pg.fen()!==fen) return;
      if(lines && lines[0]) b = {best: lines[0].mv};
    }
    if(!b || !b.best){ setP("No hint available right now. Your move."); renderPlay(); return; }
    hint = {items:[{label:"Best move", color:"var(--arG)", uci:b.best, text:""}]};
    if(fb) fb.arrowsOn = false;
    renderPlay();
    const g = new Chess(fen), m = uciToMove(g, b.best);
    setP("Best move: " + (m ? m.san : b.best) + ".");
    return;
  }
  setP("Looking for attacking, defensive and tactical ideas…");
  let lines = null;
  try{ lines = await lsearch(fen, 10, 8); }catch(e){}
  if(id!==gameId || !pg || pg.fen()!==fen) return;
  if(!lines || !lines.length){
    const b = await analysisBefore;
    if(id!==gameId || !pg) return;
    if(!b || !b.best){ setP("No hint available right now. Your move."); renderPlay(); return; }
    hint = {items:[{label:"Engine's pick", color:"var(--arG)", uci:b.best, text:describe(fen, b.best)}]};
  } else {
    const res = await brainCall("hint", {fen, lines});
    if(id!==gameId || !pg || pg.fen()!==fen) return;
    hint = res || hintTriple(fen, lines);
  }
  if(fb) fb.arrowsOn = false;
  renderPlay(); setP("Three ideas for your move. Pick the one that fits the position.");
};
$("presign").onclick = () => { if(!pg||over) return; awaiting = null; over = true; thinking = false; renderPlay(); setP("You resigned. Tap Review game to see where it went wrong."); };
$("preview").onclick = () => {
  if(!pg) return;
  $("pgn").value = pg.pgn();
  $("side").value = humanColor;
  showTab("review");
  run();
};

