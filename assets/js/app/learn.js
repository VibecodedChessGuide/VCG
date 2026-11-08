/* ================= Learn: seeded, engine-built puzzles ================= */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const lsc = l => l.mate!=null ? (l.mate>0 ? 10000-l.mate*10 : -10000-l.mate*10) : l.cp;
const lgap = ls => ls.length>1 ? lsc(ls[0])-lsc(ls[1]) : 9999;
function lMat(g){ let s=0; g.board().forEach(r => r.forEach(c => { if(c) s += (c.color==="w"?1:-1)*VAL[c.type]; })); return s; }
function mvOf(g,u){ return uciToMove(new Chess(g.fen()), u); }

// MultiPV search on the main engine. Lines are from the side-to-move's point of view. null = engine died.
async function lsearch(fen, depth, n){
  if(new Chess(fen).game_over()) return [];
  const wk = main; if(!wk) return null;
  return onW(wk, async () => {
    const map = {};
    wk.w.postMessage("setoption name MultiPV value " + n);
    const r = await runSearch(wk, fen, depth, 20, l => {
      if(!l.startsWith("info") || !l.includes(" pv ") || /bound/.test(l)) return;
      const m = l.match(/score (cp|mate) (-?\d+)/); if(!m) return;
      const mp = l.match(/multipv (\d+)/), idx = mp ? +mp[1] : 1;
      const pv = l.split(" pv ")[1].trim().split(/\s+/), v = +m[2];
      map[idx] = {mv:pv[0], pv, mate: m[1]==="mate" ? v : null,
        cp: m[1]==="cp" ? v : (v>0?1:-1)*(10000-Math.abs(v)*10)};
    });
    try{ wk.w.postMessage("setoption name MultiPV value 1"); }catch(e){}
    if(r===null) return null;
    return Object.keys(map).map(Number).sort((a,b) => a-b).map(k => map[k]);
  });
}
// Search with automatic recovery. If the engine dies, restart it and redo the SAME position (up to 3 times),
// so a crash in the middle of a game never loses the game. Resolves undefined when cancelled, null when it gave up.
async function lS(fen, d, n, tok){
  for(let attempt=0; attempt<3; attempt++){
    if(tok!==undefined && tok!==learnToken) return undefined;
    const r = await lsearch(fen, d, n);
    if(tok!==undefined && tok!==learnToken) return undefined;
    if(r!==null) return r;
    lStatus("Stockfish stopped responding. Restarting it and picking up where we left off… (try " + (attempt+1) + " of 3)", "bad");
    try{ await recoverEngine(); }catch(e){}
    const ok = await lWaitEngine(tok===undefined ? learnToken : tok, 45000);
    if(!ok) return tok!==learnToken ? undefined : null;
  }
  return null;
}

/* ---- theme tests: each gets {g, fen, lines} and returns null or {kind, n} ---- */
const tMate = (n, pred) => ctx => {
  const l = ctx.lines[0]; if(!l || l.mate!==n) return null;
  const m = mvOf(ctx.g, l.mv); if(!m || (pred && !pred(m, ctx))) return null;
  return {kind:"mate", n};
};
const lPieceMate = t => m => m.piece===t;
function backRankPred(m, ctx){
  if(m.piece!=="r" && m.piece!=="q") return false;
  const c = new Chess(ctx.g.fen()); c.move(m);
  const rank = m.color==="w" ? "8" : "1";
  let ksq = null;
  c.board().forEach((row,r) => row.forEach((p,f) => { if(p && p.type==="k" && p.color!==m.color) ksq = "abcdefgh"[f] + (8-r); }));
  return !!ksq && ksq[1]===rank && m.to[1]===rank;
}
const tWin = extra => ctx => {
  const l = ctx.lines[0]; if(!l || l.mate!=null || ctx.lines.length<2) return null;
  if(l.cp<250 || l.cp>1100 || lgap(ctx.lines)<220) return null;
  const sign = ctx.g.turn()==="w" ? 1 : -1;
  if(sign*lMat(ctx.g) > 1) return null; // the win must come from the tactic, not from already being ahead
  const m = mvOf(ctx.g, l.mv); if(!m) return null;
  if(extra && !extra(m, ctx)) return null;
  return {kind:"cp"};
};
const fkPred = (m, ctx) => { if(m.captured) return false; const ft = forkTargets(ctx.fen, ctx.lines[0].mv); return !!ft && ft.length>=2; };
const freePred = (m, ctx) => {
  if(!m.captured || VAL[m.captured]<3) return false;
  const c = new Chess(ctx.fen); c.move(m);
  return !c.moves({verbose:true}).some(x => x.to===m.to && x.captured);
};
const tPromo = ctx => {
  const l = ctx.lines[0]; if(!l || ctx.lines.length<2) return null;
  const m = mvOf(ctx.g, l.mv);
  if(!m || m.promotion!=="q" || lsc(l)<300 || lgap(ctx.lines)<150) return null;
  return {kind:"cp"};
};
const tOnly = ctx => {
  if(ctx.lines.length<2) return null;
  const a = lsc(ctx.lines[0]), b = lsc(ctx.lines[1]);
  if(a<400 || b>120) return null;
  return {kind:"cp"};
};

const LTHEMES = [
  {id:"m1", cat:"Checkmate", name:"Mate in 1", desc:"Find the move that checkmates right now.", prompt:"Find checkmate in one move.", test:tMate(1)},
  {id:"m2", cat:"Checkmate", name:"Mate in 2", desc:"A forced mate in two moves, whatever Black or White replies.", prompt:"Find the forced mate in two.", test:tMate(2)},
  {id:"m3", cat:"Checkmate", name:"Mate in 3", desc:"Look deeper: a forced mate in three.", prompt:"Find the forced mate in three.", test:tMate(3)},
  {id:"back", cat:"Checkmate", name:"Back-rank mate", desc:"The king is stuck behind its own pawns.", prompt:"Checkmate along the back rank.", test:tMate(1, backRankPred)},
  {id:"smoth", cat:"Checkmate", name:"Smothered mate", desc:"A knight mates a king boxed in by its own pieces.", prompt:"Find the smothered mate.", packOnly:true},
  {id:"free", cat:"Tactics", name:"Free piece", desc:"Something is hanging. Take it safely.", prompt:"Win a piece that can't be recaptured.", test:tWin(freePred)},
  {id:"fork", cat:"Tactics", name:"Fork", desc:"One move attacks two valuable things at once.", prompt:"Find the fork.", test:tWin(fkPred)},
  {id:"win", cat:"Tactics", name:"Win material", desc:"Any tactic that wins material.", prompt:"Find the move that wins material.", test:tWin()},
  {id:"pin", cat:"Tactics", name:"Pin", desc:"A piece can't move without exposing something worse.", prompt:"Use the pin.", packOnly:true},
  {id:"skewer", cat:"Tactics", name:"Skewer", desc:"Attack a big piece so it must move and drop what's behind it.", prompt:"Find the skewer.", packOnly:true},
  {id:"disc", cat:"Tactics", name:"Discovered attack", desc:"Move one piece to unleash another.", prompt:"Find the discovered attack.", packOnly:true},
  {id:"defl", cat:"Tactics", name:"Deflection", desc:"Pull a defender away from its job.", prompt:"Deflect the defender.", packOnly:true},
  {id:"trap", cat:"Tactics", name:"Trapped piece", desc:"A piece has no safe squares. Win it.", prompt:"Win the trapped piece.", packOnly:true},
  {id:"qm1", cat:"Endgames", name:"Queen mate in 1", desc:"King and queen against king. Finish it.", prompt:"Mate with the queen.", tpl:"KQK", test:tMate(1, lPieceMate("q"))},
  {id:"qm2", cat:"Endgames", name:"Queen mate in 2", desc:"King and queen against king, two moves.", prompt:"Mate in two with the queen.", tpl:"KQK", test:tMate(2, lPieceMate("q"))},
  {id:"rm1", cat:"Endgames", name:"Rook mate in 1", desc:"King and rook against king. Finish it.", prompt:"Mate with the rook.", tpl:"KRK", test:tMate(1, lPieceMate("r"))},
  {id:"rm2", cat:"Endgames", name:"Rook mate in 2", desc:"King and rook against king, two moves.", prompt:"Mate in two with the rook.", tpl:"KRK", test:tMate(2, lPieceMate("r"))},
  {id:"promo", cat:"Endgames", name:"Pawn promotion", desc:"Get the pawn to the last rank and queen it.", prompt:"Promote the pawn.", tpl:"PROMO", test:tPromo},
  {id:"kpk", cat:"Endgames", name:"King and pawn: only move", desc:"Only one move wins. The others let it slip to a draw.", prompt:"Find the only winning move.", tpl:"KPK", test:tOnly},
  {id:"rook", cat:"Endgames", name:"Rook endgame: only move", desc:"Rook and pawn against rook. One move wins.", prompt:"Find the only winning move.", tpl:"KRPKR", test:tOnly}
];

/* ---- seeded start positions for endgames ---- */
function lPlace(rng, spec){
  for(let tries=0; tries<400; tries++){
    const used = new Set(), pcs = []; let ok = true;
    for(const sp of spec){
      let sq = null;
      for(let k=0; k<60; k++){
        const f = Math.floor(rng()*8);
        const r = sp.t==="p" ? sp.ranks[Math.floor(rng()*sp.ranks.length)] : 1+Math.floor(rng()*8);
        const q = "abcdefgh"[f] + r;
        if(!used.has(q)){ sq = q; break; }
      }
      if(!sq){ ok = false; break; }
      used.add(sq); pcs.push({sq, t:sp.t, c:sp.c});
    }
    if(!ok) continue;
    const ks = pcs.filter(p => p.t==="k");
    if(Math.abs(ks[0].sq.charCodeAt(0)-ks[1].sq.charCodeAt(0))<=1 && Math.abs(ks[0].sq[1]-ks[1].sq[1])<=1) continue;
    return pcs;
  }
  return null;
}
function lFen(pcs, turn){
  const b = Array.from({length:8}, () => Array(8).fill(""));
  pcs.forEach(p => { b[8-(+p.sq[1])][p.sq.charCodeAt(0)-97] = p.c==="w" ? p.t.toUpperCase() : p.t; });
  return b.map(row => { let s = "", e = 0; row.forEach(c => { if(!c) e++; else { if(e){ s += e; e = 0; } s += c; } }); return s + (e||""); }).join("/") + " " + turn + " - - 0 1";
}
function lTemplate(kind, rng){
  const strong = rng()<.5 ? "w" : "b", weak = strong==="w" ? "b" : "w";
  const S = t => ({t, c:strong}), W = t => ({t, c:weak});
  const P = ranks => ({t:"p", c:strong, ranks: ranks.map(r => strong==="w" ? r : 9-r)});
  const specs = {
    KQK:[S("k"),S("q"),W("k")], KRK:[S("k"),S("r"),W("k")],
    PROMO:[S("k"),P([4,5,6]),W("k")], KPK:[S("k"),P([3,4,5]),W("k")],
    KRPKR:[S("k"),S("r"),P([3,4,5,6]),W("k"),W("r")]
  };
  for(let i=0; i<300; i++){
    const pcs = lPlace(rng, specs[kind]); if(!pcs) continue;
    const turn = rng()<.65 ? strong : weak, other = turn==="w" ? "b" : "w";
    const t = new Chess(); if(!t.load(lFen(pcs, turn))) continue;
    const o = new Chess(); if(!o.load(lFen(pcs, other)) || o.in_check()) continue; // side not on move can't be in check
    return {fen:lFen(pcs, turn), strong};
  }
  return {fen:"4k3/8/8/8/8/8/8/4K2Q w - - 0 1", strong:"w"};
}

/* ---- the two sides work TOGETHER: one plays on purpose into what the lesson needs, the other punishes it ---- */
// What the "losing" side aims for, per lesson. mate = walk into a mate in exactly n, blunder = allow a tactic, best = just play well.
const LCOOP = {m1:["mate",1], m2:["mate",2], m3:["mate",3], back:["mate",1], qm1:["mate",1], qm2:["mate",2], rm1:["mate",1], rm2:["mate",2],
  free:["blunder"], fork:["blunder"], win:["blunder"], promo:["best"], kpk:["best"], rook:["best"]};
function lOpenPick(lines, rng){
  const top = lsc(lines[0]), pool = lines.filter(l => top-lsc(l) <= 60);
  return pool[Math.floor(rng()*pool.length)];
}
function lStrongPick(lines, rng){
  if(lines.length>1 && rng()<.2 && lsc(lines[0])-lsc(lines[1])<25) return lines[1];
  return lines[0];
}
// the helper side picks a move that leads where the lesson wants. Resolves undefined if cancelled.
async function lWeakPick(g, lines, theme, coop, rng, tok){
  const top = lsc(lines[0]);
  const nearDrop = (arr, want) => arr.slice().sort((x,y) => Math.abs(top-lsc(x)-want) - Math.abs(top-lsc(y)-want))[0];
  if(coop[0]==="best") return lines[0];
  if(coop[0]==="mate"){
    const n = coop[1];
    const exact = lines.filter(l => l.mate===-n);
    if(exact.length) return exact[Math.floor(rng()*exact.length)];            // walk straight into mate in n
    const above = lines.filter(l => l.mate!=null && l.mate<0 && -l.mate>n);     // a longer mate: get as close as possible
    if(above.length) return above.slice().sort((x,y) => -x.mate - -y.mate)[0];
    const safe = lines.filter(l => !(l.mate!=null && l.mate<0 && -l.mate<n) && l.mate==null);
    if(!safe.length) return lines[0];
    return nearDrop(safe, 350);                                                  // a believable mistake that gives the attacker more
  }
  // material lessons: try believable mistakes and keep the first one the lesson can actually use
  const cands = lines.slice(1).filter(l => l.mate==null && top-lsc(l)>=150 && top-lsc(l)<=900)
    .sort((x,y) => Math.abs(top-lsc(x)-400) - Math.abs(top-lsc(y)-400)).slice(0,5);
  for(const l of cands){
    const c = new Chess(g.fen()); if(!uciToMove(c, l.mv) || c.game_over()) continue;
    const ls2 = await lS(c.fen(), 7, 4, tok);
    if(ls2===undefined || tok!==learnToken) return undefined;
    if(ls2===null) throw new LEngineError("engine");
    if(ls2.length && theme.test({g:c, fen:c.fen(), lines:ls2})) return l;
  }
  return lines[Math.floor(rng()*Math.min(2, lines.length))];                    // nothing usable yet: keep the game healthy
}

/* ---- difficulty: how hard is the idea to spot? ---- */
const LLEVELS = ["Easy","Medium","Hard"];
const lLevelOf = sc => sc<=1 ? 0 : sc<=3 ? 1 : 2;
const lWantVal = () => { const v = $("llevel").value; return v==="easy" ? 0 : v==="medium" ? 1 : v==="hard" ? 2 : -1; };
// Four signals: how deep the engine must look before it settles on the answer, whether the move is
// quiet (no check or capture), how many checks/captures compete for attention, and how crowded the board is.
async function lRate(g, hit, deep, tok){
  const fen = g.fen(), best = deep[0].mv, ok = [];
  for(const d of [2,4,6,8]){
    const r = await lS(fen, d, 1, tok);
    if(r===undefined || tok!==learnToken) return undefined;
    if(r===null) throw new LEngineError("engine");
    ok.push(!!r[0] && (hit.kind==="mate" ? r[0].mate===hit.n : r[0].mv===best));
  }
  let first = -1;
  for(let i=0;i<4;i++) if(ok.slice(i).every(Boolean)){ first = i; break; }
  const depthLvl = first<0 ? 4 : first;
  const m = mvOf(g, best);
  const quiet = !!m && !m.captured && !m.promotion && !/[+#]/.test(m.san);
  const all = g.moves({verbose:true});
  const checks = all.filter(x => /[+#]/.test(x.san)).length, caps = all.filter(x => x.captured).length;
  const pieces = g.board().reduce((n,r) => n + r.filter(Boolean).length, 0);
  const crowd = hit.kind==="mate" ? (checks>=6 ? 2 : checks>=3 ? 1 : 0) : (caps>=6 ? 1 : 0);
  let score = depthLvl + (quiet?1:0) + (hit.kind==="mate" ? Math.max(0,hit.n-1) : 0) + (pieces>=22?1:0) + crowd;
  const why = [];
  if(depthLvl>=3) why.push("the engine needed to look deep to be sure");
  if(quiet) why.push("the key move is quiet: no check or capture");
  if(hit.kind==="mate" && hit.n>1) why.push("it takes " + hit.n + " moves to finish");
  if(crowd>=1) why.push(hit.kind==="mate" ? "many checks to sort through" : "many captures to sort through");
  if(pieces>=22) why.push("a crowded board");
  if(!why.length) why.push("the idea is direct and forcing");
  return {score, level:lLevelOf(score), why:why.join("; ")};
}
const lSleep = ms => new Promise(r => setTimeout(r, ms));
class LEngineError extends Error {}
// ui(game, move, ply, maxPly, note) is called after every move so the board can be shown live
async function lGenerate(theme, seed, tok, ui, want, fb){
  const rng = mulberry(seed);
  let fen, strong = null;
  if(theme.tpl){ const t = lTemplate(theme.tpl, rng); fen = t.fen; strong = t.strong; }
  else fen = new Chess().fen();
  const weak = theme.tpl ? (strong==="w" ? "b" : "w") : (rng()<.5 ? "w" : "b");
  const coop = LCOOP[theme.id] || ["best"];
  const openPly = theme.tpl ? 0 : 8 + Math.floor(rng()*6);
  const maxPly = theme.tpl ? 40 : openPly + 50;
  const g = new Chess(fen);
  const wname = weak==="w" ? "White" : "Black", sname = weak==="w" ? "Black" : "White";
  ui(g, null, 0, maxPly, theme.tpl ? "Setting up the starting position…" : "Both sides open the game normally…");
  await lSleep(250);
  for(let ply=0; ply<maxPly; ply++){
    if(tok!==learnToken) return null;
    if(g.game_over()){ ui(g, null, ply, maxPly, "That game ended early."); await lSleep(400); break; }
    const helping = ply>=openPly && g.turn()===weak;
    const lines = await lS(g.fen(), helping ? 6 : 7, helping ? 12 : 5, tok);
    if(lines===undefined || tok!==learnToken) return null;
    if(lines===null) throw new LEngineError("engine");
    if(!lines.length) break;
    if(theme.test({g, fen:g.fen(), lines})){
      ui(g, null, ply, maxPly, "This position works. Double-checking it with a deeper search…");
      const deep = await lS(g.fen(), 12, 3, tok);
      if(deep===undefined || tok!==learnToken) return null;
      if(deep===null) throw new LEngineError("engine");
      const hit = deep.length && theme.test({g, fen:g.fen(), lines:deep});
      if(hit){
        ui(g, null, ply, maxPly, "Rating how hard it is to spot…");
        const rt = await lRate(g, hit, deep, tok);
        if(rt===undefined || tok!==learnToken) return null;
        const gap = Math.min(1000, lgap(deep));
        const pz = {themeId:theme.id, theme, seed, fen:g.fen(), solver:g.turn(), best:deep[0].mv, pv:deep[0].pv,
          kind:hit.kind, n:hit.n||0, score:lsc(deep[0]), tol:Math.max(40, Math.min(150, gap*0.4)),
          level:rt.level, why:rt.why};
        if(want<0 || rt.level===want) return pz;
        const dist = Math.abs(rt.level-want);
        if(!fb.best || dist<fb.best.dist) fb.best = {dist, pz};
        ui(g, null, ply, maxPly, "That one is " + LLEVELS[rt.level] + ". Looking for a " + LLEVELS[want] + " one…");
        await lSleep(500);
      }
    }
    let pick, note = "";
    if(ply<openPly) pick = lOpenPick(lines, rng);
    else if(!helping) pick = lStrongPick(lines, rng);
    else {
      if(coop[0]!=="best") ui(g, null, ply, maxPly, wname + " is looking for a way to help set it up…");
      pick = await lWeakPick(g, lines, theme, coop, rng, tok);
      if(pick===undefined || tok!==learnToken) return null;
      if(coop[0]!=="best") note = "played on purpose";
    }
    const mv = uciToMove(g, pick.mv);
    if(!mv) break;
    ui(g, mv, ply+1, maxPly, note ? ((mv.color==="w"?"White":"Black") + " plays " + mv.san + " (" + note + ")") : "");
    await lSleep(110);
  }
  return null;
}

/* ---- UI state ---- */
let learnToken = 0, LP = null, lg = null, lsel = null, lHide = null, lbusy = false, lsolved = false;
let lhint = 0, lTries = 0, lMateLeft = 0, lbestNow = null, lastMv = null, lflip = false, ld = null, lAnim = null;
const lRand = () => Math.floor(Math.random()*900000) + 100000;

let LPACK = null, lPackTried = false;
const lShards = {}, lShardBad = {}, lSeen = new Set();
const lPackHas = id => !!(LPACK && LPACK.lessons && LPACK.lessons[id] && !lShardBad[id]);
const lUsePack = t => lPackHas(t.id) && (!t.test || $("lsrc").value!=="engine");
function lRenderList(){
  let h = "", cat = "";
  LTHEMES.forEach(t => {
    if(t.packOnly && !lPackHas(t.id)) return;
    if(t.cat!==cat){ cat = t.cat; h += `<div class="lcat">${cat}</div>`; }
    const c = lPackHas(t.id) ? LPACK.lessons[t.id] : null;
    const n = c ? (c.e + c.m + c.h) : 0;
    h += `<button class="botrow" data-t="${t.id}"><span class="bname">${t.name}</span><small class="bsub">${t.desc}${n ? " · " + n.toLocaleString() + " real puzzles" : ""}</small></button>`;
  });
  h += `<div class="lcat">Memory</div><button class="botrow" data-mem="1"><span class="bname">Memorization</span><small class="bsub">Coordinates, then hard moves from real games, against a 5-minute clock.</small></button>`;
  $("llist").innerHTML = h;
  $("lsrcrow").classList.toggle("hide", !LPACK);
  $("lpacknote").textContent = LPACK
    ? "Real puzzles from the Lichess puzzle database (CC0), taken from games people actually played."
    : "Tip: add the puzzle pack (see build_puzzles.py) for thousands of puzzles from real games. Until then, Stockfish builds each one live.";
}
async function lLoadPack(){
  if(lPackTried) return LPACK;
  lPackTried = true;
  try{
    const r = await fetch("assets/puzzles/index.json", {cache:"no-cache"});
    if(!r.ok) throw new Error("no pack");
    const j = await r.json();
    LPACK = j && j.lessons && j.chunk ? j : null; // needs the chunked layout
  }catch(e){ LPACK = null; }
  lRenderList();
  return LPACK;
}
function lStatus(t, cls){ const e = $("lstatus"); e.textContent = t; e.className = "status" + (cls ? " " + cls : ""); }
function lDraw(){
  const svg = $("lboard");
  if(!lg){ drawBoard(svg, new Chess().fen(), [], [], {}); return; }
  const hl = lastMv ? [lastMv.from, lastMv.to] : [];
  const arrows = [];
  if(lbestNow && lhint>=1 && !lsolved) hl.push(lbestNow.mv.slice(0,2));
  if(lbestNow && lhint>=2) arrows.push([lbestNow.mv.slice(0,2), lbestNow.mv.slice(2,4), "var(--arG)"]);
  const dots = (lsel && !lsolved) ? lg.moves({square:lsel, verbose:true}) : [];
  drawBoard(svg, lg.fen(), arrows, hl, {flip:lflip, sel:lsel, dots, hideSq:lHide, anim:lAnim});
  lAnim = null;
}
function lPromptText(){
  const side = LP.solver==="w" ? "White" : "Black";
  return side + " to move. " + LP.theme.prompt;
}
function lSetMeta(){
  $("lmeta").innerHTML = LP ? (LP.theme.name + " · " + (LP.solver==="w" ? "White" : "Black") + " to move" + ' <span class="dtag d' + LP.level + '">' + LLEVELS[LP.level] + (LP.rating ? " · " + LP.rating : "") + "</span>") : "";
}
function lResetState(){
  if(LP.packed){
    lg = new Chess(LP.fen); lsel = null; lHide = null; lbusy = false; lsolved = false; lhint = 0; lTries = 0; LP.i = 0;
    lbestNow = {mv:LP.sol[0], pv:LP.sol.slice()}; lastMv = {from:LP.setup.from, to:LP.setup.to}; lflip = LP.solver==="b";
    return;
  }
  lg = new Chess(LP.fen); lsel = null; lHide = null; lbusy = false; lsolved = false; lhint = 0; lTries = 0;
  lMateLeft = LP.n; lbestNow = {mv:LP.best, pv:LP.pv}; lastMv = null; lflip = LP.solver==="b";
}
async function lWaitEngine(tok, maxMs){
  const t0 = Date.now();
  while(!engineReady){
    if(tok!==learnToken) return false;
    if(maxMs && Date.now()-t0 > maxMs) return false;
    await lSleep(250);
  }
  return tok===learnToken;
}
function lBuildUI(on){
  $("lwrap").classList.toggle("building", on);
  $("lprog").style.display = on ? "block" : "none";
  ["lhint","lsol","lretry","lgo","lnew"].forEach(id => { $(id).disabled = on; });
  if(!on) $("lprogfill").style.width = "0";
}
async function lNewEngine(theme, seed){
  const tok = ++learnToken;
  $("lhome").classList.add("hide"); $("lpuz").classList.remove("hide");
  $("ltitle").textContent = theme.name;
  LP = null; lg = null; lsel = null; lHide = null; lbusy = true; lsolved = false; lastMv = null; lflip = false; $("lmeta").textContent = "";
  $("lseed").value = seed;
  lBuildUI(true); lDraw();
  lStatus(engineReady ? "Getting ready…" : "Loading Stockfish… the board will appear when it is ready.");
  const fail = (msg) => { if(tok!==learnToken) return; lbusy = false; lBuildUI(false); lStatus(msg, "bad"); };
  try{
    if(!(await lWaitEngine(tok, 90000))){
      if(tok===learnToken) fail("Stockfish didn't start. Check your connection, reload, or pick a Lite engine in the Engine tab.");
      return;
    }
    const GAMES = 8, want = lWantVal(), fb = {best:null}, t0 = Date.now();
    let found = null, note = "";
    for(let a=0; a<GAMES && !found; a++){
      if(fb.best && (a>=3 || Date.now()-t0>60000)) break; // no exact match after a few tries: settle for the closest
      const gs = (seed + a) >>> 0;
      const ui = (g, mv, ply, maxPly, note) => {
        if(tok!==learnToken) return;
        lg = g; lastMv = mv; lsel = null;
        lAnim = mv ? {from:mv.from, to:mv.to} : null;
        $("lprogfill").style.width = Math.min(100, ply/maxPly*100) + "%";
        const who = mv ? (mv.color==="w" ? "White" : "Black") : "";
        lStatus((a ? "Attempt " + (a+1) + " · " : "") + "seed " + gs + " · " + (note || ("move " + Math.ceil(ply/2) + ": " + who + " plays " + mv.san)));
        lDraw();
      };
      found = await lGenerate(theme, gs, tok, ui, want, fb);
      if(tok!==learnToken) return;
      if(!found && a<GAMES-1){ lStatus("That one didn't work out. Trying a fresh position with a new seed…"); await lSleep(500); }
    }
    if(tok!==learnToken) return;
    if(!found && fb.best){
      found = fb.best.pz;
      note = "No " + LLEVELS[want] + " one turned up, so this is the closest (" + LLEVELS[found.level] + "). ";
    }
    if(!found) return fail("Couldn't build one this time. Tap New puzzle to try again.");
    LP = found; $("lseed").value = LP.seed;
    lResetState(); lSetMeta(); lBuildUI(false); lDraw();
    lStatus(note + lPromptText());
    snd("start");
  }catch(err){
    console.error("Learn: building a puzzle failed", err);
    if(err instanceof LEngineError) fail("Stockfish kept stopping, so I couldn't finish this position. Try a Lite engine in the Engine tab, then tap New puzzle.");
    else fail("Something went wrong building this position. Tap New puzzle to try again.");
  }
}
function lNew(theme, seed, avoidSeen){ return lUsePack(theme) ? lNewPack(theme, seed, avoidSeen) : lNewEngine(theme, seed); }
async function lNewPack(theme, seed, avoidSeen){
  const tok = ++learnToken;
  $("lhome").classList.add("hide"); $("lpuz").classList.remove("hide");
  $("ltitle").textContent = theme.name;
  LP = null; lg = null; lsel = null; lHide = null; lbusy = true; lsolved = false; lastMv = null; lflip = false; $("lmeta").textContent = "";
  $("lseed").value = seed;
  lBuildUI(true); lDraw(); $("lprogfill").style.width = "25%";
  lStatus("Picking a puzzle from real games…");
  try{
    // pick a puzzle by seed, then download only the one small chunk file that holds it
    const lc = LPACK.lessons[theme.id], K = LPACK.chunk, keys = ["e","m","h"], want = lWantVal();
    let lv = want<0 ? keys : [keys[want]], note = "";
    let tot = lv.reduce((n,k) => n + (lc[k]||0), 0);
    if(!tot){ lv = keys; tot = keys.reduce((n,k) => n + (lc[k]||0), 0); if(want>=0) note = "No " + LLEVELS[want] + " puzzle in this pack, so here's another level. "; }
    if(!tot) throw new Error("empty shard");
    const rng = mulberry(seed);
    let off = Math.floor(rng()*tot), key = lv[0];
    for(const k of lv){ const c = lc[k]||0; if(off<c){ key = k; break; } off -= c; }
    const ci = Math.floor(off/K), url = "assets/puzzles/" + theme.id + "/" + key + "-" + ci + ".json";
    let chunk = lShards[url];
    if(!chunk){
      const r = await fetch(url);
      if(!r.ok) throw new Error("missing shard");
      chunk = lShards[url] = await r.json();
    }
    if(tok!==learnToken) return;
    $("lprogfill").style.width = "60%";
    if(!chunk.length) throw new Error("empty shard");
    let idx = Math.min(off - ci*K, chunk.length-1);
    if(avoidSeen) for(let k=0; k<chunk.length && lSeen.has(chunk[idx][0]); k++) idx = (idx+1) % chunk.length;
    const pool = chunk;
    const [pid, fen, mstr, rating, themes] = pool[idx];
    const mv = mstr.split(" ");
    const g0 = new Chess(fen);
    const su = uciToMove(g0, mv[0]); // the opponent's last move, played in front of you
    if(!su || mv.length<2) throw new Error("bad puzzle");
    const edges = (LPACK && LPACK.edges) || [1200,1800];
    lSeen.add(pid);
    LP = {packed:true, id:pid, theme, seed, fen:g0.fen(), setup:{from:su.from, to:su.to}, sol:mv.slice(1), best:mv[1], pv:mv.slice(1),
      solver:g0.turn(), kind:"pack", n:0, i:0, rating, themes, level: rating<edges[0] ? 0 : rating<edges[1] ? 1 : 2};
    // show the position as it was, then the opponent's move
    lg = new Chess(fen); lflip = LP.solver==="b"; lastMv = null; lDraw();
    lStatus("A position from a real game…");
    await lSleep(650); if(tok!==learnToken) return;
    uciToMove(lg, mv[0]); lastMv = su; lAnim = {from:su.from, to:su.to};
    snd(sndKind(su, false)); lDraw();
    await lSleep(400); if(tok!==learnToken) return;
    lResetState(); lSetMeta(); lBuildUI(false); lDraw();
    lStatus(note + lPromptText());
  }catch(err){
    console.error("Learn: real puzzle failed", err);
    if(tok!==learnToken) return;
    if(!(err && err.message==="empty shard")) lShardBad[theme.id] = true;
    if(theme.test){ lStatus("Couldn't load that puzzle pack. Building one with Stockfish instead…"); lRenderList(); return lNewEngine(theme, seed); }
    lbusy = false; lBuildUI(false); lStatus("Couldn't load puzzles for this lesson. Check that assets/puzzles is served next to the page.", "bad");
  }
}
// a different move than the book line: accept it if Stockfish says it is just as good
async function lTryPack(from, to){
  const tok = learnToken, prevLast = lastMv, fenB = lg.fen(), exp = LP.sol[LP.i];
  const same = exp.slice(0,2)===from && exp.slice(2,4)===to;
  const m = lg.move({from, to, promotion: same && exp[4] ? exp[4] : "q"}); if(!m) return;
  lsel = null; lHide = null; lastMv = m; lbusy = true; lhint = 0;
  lAnim = {from:m.from, to:m.to}; snd(sndKind(m, true)); lDraw();
  let ok = same || lg.in_checkmate(), alt = false;
  if(!ok && engineReady && !lg.game_over()){
    lStatus("Checking whether that works too…");
    const c = new Chess(fenB); uciToMove(c, exp);
    const [u, e] = await Promise.all([lS(lg.fen(), 10, 1, tok), c.game_over() ? Promise.resolve([]) : lS(c.fen(), 10, 1, tok)]);
    if(tok!==learnToken) return;
    if(u && u.length && e){
      const us = -lsc(u[0]), es = c.in_checkmate() ? 10000 : (e.length ? -lsc(e[0]) : 0);
      ok = es>5000 ? us>=es-5 : clip(us,1000) >= clip(es,1000)-60;
      alt = ok;
    }
  }
  if(tok!==learnToken) return;
  if(!ok){
    lTries++;
    lStatus("Not that one. Try again" + (lTries>=2 ? " — the Hint button can nudge you." : "."), "bad");
    setTimeout(() => { if(tok!==learnToken || !lg) return; lg.undo(); lastMv = prevLast; lbusy = false; lDraw(); }, 750);
    return;
  }
  const finish = (txt) => {
    lsolved = true; lbusy = false; lDraw();
    lStatus(txt + (lTries ? " after " + (lTries+1) + " tries." : " first try.") + " Rated " + LP.rating + " on Lichess. Themes: " + LP.themes.split(" ").slice(0,5).join(", ") + ". Tap New puzzle for another.", "good");
    snd("end");
  };
  if(alt) return finish("Different from the book move, but Stockfish agrees it works. Solved");
  LP.i++;
  if(LP.i>=LP.sol.length || lg.in_checkmate()) return finish(lg.in_checkmate() ? "Checkmate! Solved" : "Correct! Solved");
  lStatus("Correct! Keep going…", "good");
  await lSleep(450); if(tok!==learnToken) return;
  const r = uciToMove(lg, LP.sol[LP.i]);
  if(!r){ lbusy = false; lDraw(); return; }
  LP.i++; lastMv = r; lAnim = {from:r.from, to:r.to}; snd(sndKind(r, false));
  lbestNow = {mv:LP.sol[LP.i], pv:LP.sol.slice(LP.i)};
  lbusy = false; lDraw(); lStatus("Your move.", "good");
}
function lOpen(id){ $("llevel").value = $("llevelH").value; const t = LTHEMES.find(x => x.id===id); if(t) lNew(t, lRand(), true); }
function lHome(){
  learnToken++; LP = null; lg = null; lbusy = false; lBuildUI(false);
  $("lpuz").classList.add("hide"); $("lhome").classList.remove("hide");
}

/* ---- checking moves ---- */
async function lJudge(){
  if(lg.in_checkmate()) return {ok:true, done:true, mated:true};
  if(lg.game_over()) return {ok:false};
  const ls = await lS(lg.fen(), 10, 1, learnToken);
  if(!ls || !ls.length) return null;
  const o = ls[0];
  if(LP.kind==="mate"){
    if(o.mate!=null && o.mate<0 && -o.mate <= lMateLeft-1) return {ok:true, reply:o.mv, left:-o.mate};
    return {ok:false};
  }
  const mine = -lsc(o);
  return {ok: clip(mine,1000) >= clip(LP.score,1000) - LP.tol, done:true};
}
async function lTry(from, to){
  if(LP && LP.packed) return lTryPack(from, to);
  const tok = learnToken, prevLast = lastMv;
  const m = lg.move({from, to, promotion:"q"}); if(!m) return;
  lsel = null; lHide = null; lastMv = m; lbusy = true; lhint = 0; lbestNow = null;
  lAnim = {from:m.from, to:m.to};
  snd(sndKind(m, true)); lDraw(); lStatus("Checking…");
  const v = await lJudge();
  if(tok!==learnToken) return;
  if(v===null){ lg.undo(); lastMv = prevLast; lbusy = false; lDraw(); lStatus("Stockfish had trouble checking that move. Try it again.", "bad"); return; }
  if(!v.ok){
    lTries++;
    lStatus("Not that one. Try again" + (lTries>=2 ? " — the Hint button can nudge you." : "."), "bad");
    setTimeout(() => {
      if(tok!==learnToken || !lg) return;
      lg.undo(); lastMv = prevLast; lbusy = false; lbestNow = null; lDraw();
    }, 750);
    return;
  }
  if(v.done){
    lsolved = true; lbusy = false; lDraw();
    const txt = v.mated ? "Checkmate! Solved" : "Correct! Solved";
    const tries = lTries ? " after " + (lTries+1) + " tries." : " first try.";
    let extra = "";
    if(!v.mated && LP.kind==="cp"){
      const san = pvToSan(LP.fen, LP.pv, 4).join(" ");
      extra = " Best line: " + san + ".";
    }
    lStatus(txt + tries + extra + " Rated " + LLEVELS[LP.level] + ": " + LP.why + ". Tap New puzzle for another.", "good");
    snd("end");
    return;
  }
  // correct first step of a longer mate: the opponent defends, then it's your move again
  lStatus("Correct! Stockfish defends…", "good");
  await new Promise(r => setTimeout(r, 450));
  if(tok!==learnToken) return;
  const r = uciToMove(lg, v.reply);
  if(!r){ lbusy = false; lDraw(); return; }
  lastMv = r; lMateLeft = v.left; lAnim = {from:r.from, to:r.to};
  snd(sndKind(r, false)); lbusy = false; lDraw();
  lStatus("Your move. Mate in " + lMateLeft + " still.", "good");
}
async function lBest(){
  if(lbestNow) return lbestNow;
  const ls = await lS(lg.fen(), 10, 1, learnToken);
  lbestNow = ls && ls[0] ? {mv:ls[0].mv, pv:ls[0].pv} : null;
  return lbestNow;
}
async function lHint(){
  if(!lg || lsolved || lbusy || !LP) return;
  const tok = learnToken;
  const b = await lBest(); if(tok!==learnToken || !b) return;
  lhint = Math.min(2, lhint+1);
  lStatus(lhint===1 ? "Hint: move the highlighted piece. Press Hint again to see where." : "Hint: the arrow shows the move.");
  lDraw();
}
async function lSolution(){
  if(!lg || lsolved || lbusy || !LP) return;
  const tok = learnToken;
  const b = await lBest(); if(tok!==learnToken || !b) return;
  lhint = 2;
  const n = LP.packed ? b.pv.length : (LP.kind==="mate" ? Math.max(1, 2*lMateLeft-1) : 4);
  lStatus("Solution: " + pvToSan(lg.fen(), b.pv, n).join(" ") + ". Tap Retry to play it yourself.");
  lDraw();
}
function lRetry(){
  if(!LP) return;
  lResetState(); lDraw(); lStatus(lPromptText());
}

/* ---- board input: tap-tap or drag ---- */
const lb = $("lboard");
lb.addEventListener("pointerdown", e => {
  if(e.button!==0 || !lg || lbusy || lsolved || !LP) return;
  const s = sqAt(lb, e, lflip); if(!s) return;
  e.preventDefault();
  if(lsel && lsel!==s && lg.moves({square:lsel, verbose:true}).some(m => m.to===s)){ const f = lsel; lTry(f, s); return; }
  const p = lg.get(s);
  if(p && p.color===LP.solver){
    ld = {from:s, wasSel:lsel===s};
    rc = {svg:lb, r:lb.getBoundingClientRect()};
    lsel = s; lHide = s; lDraw();
    const gh = document.createElementNS(NS, "image");
    gh.setAttribute("id", "lghost"); gh.setAttribute("href", PIECE_URL(p.color, p.type));
    gh.setAttribute("width", 130); gh.setAttribute("height", 130);
    gh.style.pointerEvents = "none";
    const pt = svgPt(lb, e);
    gh.setAttribute("x", pt.x-65); gh.setAttribute("y", pt.y-65);
    lb.appendChild(gh);
    try{ lb.setPointerCapture(e.pointerId); }catch(err){}
  } else { lsel = null; lDraw(); }
});
lb.addEventListener("pointermove", e => {
  if(!ld) return;
  const gh = lb.querySelector("#lghost"), pt = svgPt(lb, e);
  if(gh){ gh.setAttribute("x", pt.x-65); gh.setAttribute("y", pt.y-65); }
});
function lDropEnd(e, cancel){
  if(!ld) return;
  const d = ld, t = cancel ? null : sqAt(lb, e, lflip);
  const gh = lb.querySelector("#lghost"); if(gh) gh.remove();
  ld = null; rc = null; lHide = null;
  const legal = t && t!==d.from && lg.moves({square:d.from, verbose:true}).some(m => m.to===t);
  if(legal){ lTry(d.from, t); return; }
  if(d.wasSel && t===d.from) lsel = null;
  lDraw();
}
lb.addEventListener("pointerup", e => { if(e.button===0) lDropEnd(e, false); });
lb.addEventListener("pointercancel", e => lDropEnd(e, true));

$("llist").onclick = e => {
  const b = e.target.closest(".botrow"); if(!b) return;
  if(b.dataset.mem){ if(typeof memOpen==="function") memOpen(); return; }
  lOpen(b.dataset.t);
};
$("lback").onclick = lHome;
$("lhint").onclick = lHint;
$("lsol").onclick = lSolution;
$("lretry").onclick = lRetry;
$("lnew").onclick = () => { const t = LP ? LP.theme : LTHEMES.find(x => x.name===$("ltitle").textContent); if(t) lNew(t, lRand(), true); };
$("lgo").onclick = () => {
  const t = LP ? LP.theme : LTHEMES.find(x => x.name===$("ltitle").textContent); if(!t) return;
  const v = parseInt($("lseed").value, 10);
  lNew(t, Number.isFinite(v) && v>=0 ? v : lRand(), false);
};
$("llevelH").onchange = () => { $("llevel").value = $("llevelH").value; };
$("llevel").onchange = () => { $("llevelH").value = $("llevel").value; };
lRenderList();


