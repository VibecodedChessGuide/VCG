/* ================= REVIEW MODE ================= */
let moves = [], pos = [], review = [], sel = 1, running = 0, rflip = false, reviewAnim = null;
let chipEls = [], selChip = null, graphKey = null;

function judge(i){ return judgePair(pos[i], pos[i+1], moves[i]); }

function show(){
  if(!moves.length) return;
  const i = sel - 1, mv = moves[i], rv = review[i], before = pos[i], after = pos[i+1];
  let fen = after.fen, arrows = [];
  const nextMv = moves[i+1];
  if(nextMv) arrows.push([nextMv.from, nextMv.to, "var(--arP)", {}]);
  setEvalBar("evalbar", after, rflip);
  if(rv.cls==="good" || predN()===0 || !after.pv.length) predState.review = null;
  else if(!predState.review || predState.review.sel!==sel || predState.review.n!==predN()) buildPred("review", after.fen, after.pv, predN(), mv.color, sel);
  const pst = predStep("review"), pov = predOver("review");
  if(pst){ fen = pst.fen; arrows = predArrow(pst); }
  else if(pov){ fen = pov.fen; arrows = overviewArrows(pov); }
  const facts = showFacts ? boardFacts(fen) : null;
  const anim = pst ? predAnim : (reviewAnim && !pov ? reviewAnim : null);
  predAnim = null;
  reviewAnim = null;
  drawBoard($("board"), fen, arrows, pst ? [pst.from, pst.to] : [mv.from, mv.to], {flip:rflip, facts, anim, badge: (pst||pov) ? null : {sq:mv.to, kind:rv.kind},
    nums: pov ? overviewNums(pov, rflip) : null,
    captures: pst ? stepCaptures(pst) : pov ? overviewCaptures(pov) : null});
  $("rfacts").textContent = facts ? factsText(facts) : "";
  const moveNo = Math.floor(i/2)+1 + (mv.color==="w" ? "." : "...");
  setHTML($("explain"), explainHtml(before, after, mv, rv, moveNo) + predHtml("review"));
  if(selChip) selChip.classList.remove("sel");
  selChip = chipEls[sel-1] || null;
  if(selChip){
    selChip.classList.add("sel");
    const box = $("moves"), cr = selChip.getBoundingClientRect(), br = box.getBoundingClientRect();
    const top = Math.max(0, box.scrollTop + cr.top - br.top - (box.clientHeight - cr.height) / 2);
    if(box.scrollTo) box.scrollTo({top, behavior: "smooth"});
    else box.scrollTop = top;
  }
  $("prev").disabled = sel <= 1;
  $("next").disabled = sel >= moves.length;
  updateReviewOpen();
  drawGraph();
}
function pick(n){
  stopPred(); reviewAnim = null;
  sel = Math.max(1, Math.min(moves.length, n));
  clearMarks("board"); show();
}
function step(dir){
  const n = sel + dir;
  if(n < 1 || n > moves.length) return;
  const m = dir > 0 ? moves[sel] : moves[sel-1];
  stopPred();
  reviewAnim = dir > 0 ? {from:m.from, to:m.to} : {from:m.to, to:m.from};
  sel = n; clearMarks("board"); show();
}

function drawGraph(){
  const N = pos.length-1, W=600, H=130, g = $("graph");
  const X = i => N===0?0:i/N*W;
  if(graphKey !== review){ // rebuild only for a new analysis; moving the cursor just shifts one line
    graphKey = review;
    const Y = cp => H*(1 - winPct(cp)/100);
    let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="#403d39"/>`;
    const line = pos.map((p,i)=>`${X(i).toFixed(1)},${Y(p.cp).toFixed(1)}`).join(" ");
    s += `<polygon points="0,${H} ${line} ${W},${H}" fill="#ffffff"/>`;
    s += `<line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="#8a8784" stroke-width="1" stroke-dasharray="4 4" opacity=".7"/>`;
    review.forEach((r,i) => {
      if(r.cls==="good") return;
      s += `<circle cx="${X(i+1).toFixed(1)}" cy="${Y(pos[i+1].cp).toFixed(1)}" r="${r.cls==="blunder"?6:4.5}" fill="${BADGES[r.kind].c}" stroke="#262421" stroke-width="1.5"/>`;
    });
    s += `<line id="gsel" y1="0" y2="${H}" stroke="#81b64c" stroke-width="2.5"/>`;
    g.innerHTML = s;
  }
  const l = g.querySelector("#gsel");
  if(l){ l.setAttribute("x1", X(sel)); l.setAttribute("x2", X(sel)); }
}
$("graph").addEventListener("click", e => {
  if(!moves.length) return;
  const r = $("graph").getBoundingClientRect();
  pick(Math.round((e.clientX - r.left)/r.width * (pos.length-1)));
});
function drawMoves(){
  const cells = moves.map((m,j) => `<button class="chip ${review[j].cls}" data-i="${j+1}">${m.san}</button>`);
  if(moves[0].color==="b") cells.unshift("<span></span>");
  let h = "";
  for(let i=0;i<cells.length;i+=2) h += `<div class="mrow"><span class="mno">${i/2+1}.</span>${cells[i]}${cells[i+1]||"<span></span>"}</div>`;
  $("moves").innerHTML = h;
  chipEls = Array.from($("moves").querySelectorAll(".chip")); selChip = null;
}
$("moves").addEventListener("click", e => { const c = e.target.closest(".chip"); if(c) pick(+c.dataset.i); });
function reviewedStats(side){
  const counts = {brilliant:0, great:0, best:0, good:0, book:0, miss:0, inacc:0, mistake:0, blunder:0};
  const fixed = {inacc:0, mistake:0, blunder:0};
  const losses = [];
  let acc = 0, lossSum = 0, bestMoves = 0, n = 0;
  // Elo-only stats: moves played from an already-lost position (<= -6 pawns for the mover)
  // say little about strength because the clipped eval hides further damage.
  const eLosses = [];
  let eAcc = 0, eLossSum = 0, eBest = 0, eN = 0, skipped = 0;
  let brilliants = 0, greatMoves = 0, missedWins = 0, missedMates = 0, missedTactics = 0, soundSacs = 0, badSacs = 0;
  moves.forEach((m,i) => {
    if(side!=="wb" && m.color!==side) return;
    const rv = review[i];
    counts[rv.kind]++;
    if(rv.kind==="brilliant") brilliants++;
    else if(rv.kind==="great") greatMoves++;
    if(rv.sac){ if(rv.sacWorth==="good") soundSacs++; else badSacs++; }
    if(rv.tag==="missed_mate") missedMates++;
    else if(rv.tag==="missed_win") missedWins++;
    else if(rv.tag==="missed_tactic" || rv.tag==="missed_fork") missedTactics++;
    const mover = m.color==="w" ? 1 : -1;
    const d = Math.max(0, (winPct(pos[i].cp) - winPct(pos[i+1].cp)) * mover);
    acc += rv.uci===pos[i].best ? 100 : Math.max(0, Math.min(100, 103.17*Math.exp(-0.04354*d) - 3.17));
    const l = Math.min(400, rv.loss);
    losses.push(l); lossSum += l;
    const eb = pos[i].mate!=null ? (pos[i].mate*mover>0 ? 1e5 : -1e5) : pos[i].cp*mover;
    if(eb <= -600 && side!=="wb"){ skipped++; }
    else{
      const a1 = rv.uci===pos[i].best ? 100 : Math.max(0, Math.min(100, 103.17*Math.exp(-0.04354*d) - 3.17));
      eLosses.push(l); eLossSum += l; eAcc += a1; eN++;
      if(rv.uci===pos[i].best) eBest++;
    }
    if(l >= 300) fixed.blunder++;
    else if(l >= 100) fixed.mistake++;
    else if(l >= 50) fixed.inacc++;
    if(rv.uci===pos[i].best) bestMoves++;
    n++;
  });
  const acpl = n ? lossSum/n : 0;
  const sorted = losses.slice().sort((a,b)=>a-b);
  const median = n ? sorted[Math.floor((n-1)/2)] : 0;
  const variance = n ? losses.reduce((s,l)=>s+(l-acpl)*(l-acpl),0)/n : 0;
  // fall back to all moves if almost nothing was played from a playable position
  const useE = eN >= 3;
  const eAcpl = useE ? eLossSum/eN : acpl;
  const eVar = useE ? eLosses.reduce((t,l)=>t+(l-eAcpl)*(l-eAcpl),0)/eN : variance;
  return {counts, fixed, losses, avg:n?acc/n:0, acpl, median, std:Math.sqrt(variance), bestRate:n?bestMoves/n:0, n,
    e:{n:useE?eN:n, acpl:eAcpl, avg:useE?eAcc/eN:(n?acc/n:0), bestRate:useE?eBest/eN:(n?bestMoves/n:0), std:Math.sqrt(eVar), skipped:useE?skipped:0},
    brilliants, greatMoves, missedWins, missedMates, missedTactics, soundSacs, badSacs};
}
function interp(x, pts){
  if(x <= pts[0][0]) return pts[0][1];
  for(let i=1;i<pts.length;i++){
    if(x <= pts[i][0]){
      const [x0,y0] = pts[i-1], [x1,y1] = pts[i];
      return y0 + (y1-y0)*(x-x0)/(x1-x0);
    }
  }
  return pts[pts.length-1][1];
}
const ACPL_ELO = [
  [8,2480],[10,2430],[12,2370],[15,2270],[18,2180],[20,2110],
  [22,2040],[25,1950],[28,1865],[30,1810],[32,1750],[35,1680],
  [38,1610],[40,1565],[45,1475],[50,1395],[55,1325],[60,1260],
  [65,1200],[70,1145],[75,1095],[80,1050],[90,965],[100,885],
  [120,755],[150,585],[200,400]
];
const ACC_ELO = [
  [40,300],[50,400],[60,550],[65,650],[70,750],[75,870],
  [80,1000],[85,1150],[90,1300],[95,1450],[100,1600]
];
const ERR_ELO = [
  [0,1900],[1,1800],[2,1700],[3,1600],[4,1500],[5,1400],
  [6,1300],[8,1150],[10,1000],[12,850],[15,650],[20,400]
];
const BEST_ELO = [
  [10,500],[20,750],[30,1000],[40,1250],[50,1500],[60,1700],[70,1900],[80,2100],[90,2300]
];
// missed chances per 10 moves (mates count double, wins 1.5x, tactics 0.75x)
const MISS_ELO = [
  [0,2100],[0.5,1950],[1,1800],[1.5,1650],[2,1500],[2.5,1350],
  [3,1200],[4,1000],[5,850],[7,650],[10,400]
];
function estimateElo(color){
  const s = reviewedStats(color);
  if(!s.n) return null;
  const e = s.e;
  const acplElo = interp(e.acpl, ACPL_ELO);
  const accElo = interp(e.avg, ACC_ELO);
  // errors are counted over ALL moves: hanging pieces in a lost position still count
  const errScore = Math.min(20, (s.fixed.blunder*3 + s.fixed.mistake*1.5 + s.fixed.inacc*0.5) / s.n * 40);
  const errElo = interp(errScore, ERR_ELO);
  const bestElo = interp(e.bestRate*100, BEST_ELO);
  const missRate = (s.missedMates*2 + s.missedWins*1.5 + s.missedTactics*0.75) / Math.max(4, e.n) * 10;
  const missElo = interp(missRate, MISS_ELO);
  let perf = 0.45*acplElo + 0.15*accElo + 0.15*errElo + 0.15*bestElo + 0.10*missElo;
  const bonus = Math.min(70, s.brilliants*10 + s.soundSacs*4);
  perf += bonus - Math.min(80, s.badSacs*6);
  // each blunder / mistake is direct evidence of weakness (esp. hung pieces, allowed mates)
  perf -= Math.min(350, s.fixed.blunder*70 + s.fixed.mistake*20);
  const penalty = Math.min(100, Math.max(0, (e.std - 50) * 1.5));
  perf -= penalty;
  const k = 0.55 + 0.25 * Math.min(1, e.n / 40);
  let elo = 1200 + (perf - 1200) * k;
  elo = Math.max(400, Math.min(2300, Math.round(elo/10)*10));
  const width = Math.min(300, Math.max(150, 120 + 500/Math.sqrt(Math.max(10, e.n))));
  const low = Math.max(300, Math.round((elo-width)/50)*50);
  const high = Math.min(2500, Math.round((elo+width)/50)*50);
  return {elo, low, high, n:s.n, en:e.n, skipped:e.skipped, acc:Math.round(e.avg), acpl:Math.round(e.acpl),
    median:Math.round(s.median), std:Math.round(e.std), bestRate:Math.round(e.bestRate*100),
    blunders:s.fixed.blunder, mistakes:s.fixed.mistake, inaccuracies:s.fixed.inacc,
    brilliants:s.brilliants, missedWins:s.missedWins, missedMates:s.missedMates, missedTactics:s.missedTactics,
    soundSacs:s.soundSacs, badSacs:s.badSacs,
    parts:{acpl:Math.round(acplElo), acc:Math.round(accElo), err:Math.round(errElo), best:Math.round(bestElo), miss:Math.round(missElo), bonus:Math.round(bonus)}};
}
function drawSummary(){
  const side = $("side").value, stats = reviewedStats(side), c = stats.counts;
  const who = side==="w" ? "White" : side==="b" ? "Black" : "Both sides";
  const pill = (k, label, col) => `<span class="pill"><i style="background:${col}"></i><b>${c[k]}</b> ${label}</span>`;
  const tip = "Single-game estimate from accuracy, ACPL, error rates, best-move rate, missed wins/mates/tactics, sound vs unsound sacrifices, consistency and sample size. Not an official rating.";
  let elo = "", detail = "";
  if(side==="wb"){
    const w = estimateElo("w"), b = estimateElo("b");
    if(w && b){
      elo = `<div class="elo" title="${tip}"><strong>~${w.elo} / ~${b.elo}</strong><small>White / Black estimated Elo</small></div>`;
      detail = `Single-game ranges: White ~${w.low}–${w.high}, Black ~${b.low}–${b.high} · ${moves.length} moves` +
        ((w.brilliants+b.brilliants) ? ` · ${w.brilliants+b.brilliants} brilliant` : "");
    }
  } else {
    const e = estimateElo(side);
    if(e){
      elo = `<div class="elo" title="${tip}"><strong>~${e.elo}</strong><small>Player • estimated Elo</small></div>`;
      detail = `Single-game range ~${e.low}–${e.high} · ${e.en} of ${e.n} moves used${e.skipped?` (${e.skipped} played from lost positions skipped)`:""} · ${e.acc}% accuracy · ${e.acpl} ACPL` +
        ((e.missedWins+e.missedMates) ? ` · ${e.missedWins+e.missedMates} missed win${(e.missedWins+e.missedMates)===1?"":"s"}` : "") +
        (e.missedTactics ? ` · ${e.missedTactics} missed tactic${e.missedTactics===1?"":"s"}` : "") +
        (e.brilliants ? ` · ${e.brilliants} brilliant` : "");
    }
  }
  $("rsum").innerHTML = `<div class="sumgrid"><div class="acc"><strong>${stats.n ? Math.round(stats.avg) : 0}</strong><small>${who} accuracy</small></div>`+
    elo + `<div class="pills">${pill("brilliant","Brilliant","#1baca6")}${pill("great","Great","#749bbf")}${pill("best","Best","#96bc4b")}${pill("good","Good","#96af8b")}${pill("book","Book","#a88865")}${pill("miss","Missed","#e06c5a")}${pill("inacc","Inaccuracies","#f7c631")}${pill("mistake","Mistakes","#ffa459")}${pill("blunder","Blunders","#fa412d")}</div></div>`+
    (detail ? `<div class="elodetail">${detail}</div>` : "");
}
function drawTally(){
  const side = $("side").value, tags = [];
  review.forEach((r,i) => { if(r.tag && (side==="wb" || moves[i].color===side)) tags.push(r.tag); });
  drawTallyInto($("tally"), tags);
}

const boardImageUrl = fen => "https://chessboardimage.com/" + fen.split(" ")[0].replace(/\//g, "") + ".png";

function buildReport(){
  const side = $("side").value, depth = $("depth").value, strict = $("strict").value;
  const who = side==="w" ? "White" : side==="b" ? "Black" : "Both sides";
  const kinds = {brilliant:"Brilliant", great:"Great", book:"Book", best:"Best", good:"Good", miss:"Missed chance", inacc:"Inaccuracy", mistake:"Mistake", blunder:"Blunder"};
  const stats = reviewedStats(side), counts = stats.counts;
  const flawList = [];
  moves.forEach((m,i) => {
    if(side!=="wb" && m.color!==side) return;
    const rv = review[i];
    if(rv.tag) flawList.push({i, rv});
  });
  const out = [];
  out.push("Act as a chess coach. Analyze the game from the data below.");
  out.push("Please explain:");
  out.push("1. The player's main flaws and recurring mistakes.");
  out.push("2. What the player played and what each of the player's moves was trying to do.");
  out.push("3. What Stockfish wanted the player to play instead.");
  out.push("4. What Stockfish expected the opponent to do after the player's moves, and what the opponent's plan or threat was.");
  out.push("");
  out.push("Use the chessboardimage.com markdown links in this report to display the board position when discussing a move.");
  out.push("Board image URL format: https://chessboardimage.com/<FEN board field with slashes removed>.png (example: https://chessboardimage.com/86k186pp81r1RK1NP88.png).");
  out.push("");
  out.push("# Chess Analysis game report");
  out.push("");
  const result = ($("pgn").value.match(/\[Result "([^"]+)"\]/) || [])[1];
  out.push("- Reviewed side: " + who);
  out.push("- Result: " + (result || "not specified"));
  out.push("- Engine bot: " + BOT().name);
  out.push("- Stockfish depth: " + depth);
  out.push("- Analysis strictness: " + strict);
  out.push("- Moves analyzed: " + moves.length);
  out.push("- Accuracy (" + who + "): " + (stats.n ? Math.round(stats.avg) + "%" : "n/a"));
  out.push("- Average centipawn loss: " + (stats.n ? Math.round(stats.acpl) + " cp" : "n/a"));
  out.push("- Missed chances (" + who + "): " + (stats.missedWins + stats.missedMates + stats.missedTactics) +
    " (" + stats.missedWins + " winning chances, " + stats.missedMates + " mates, " + stats.missedTactics + " tactics)");
  out.push("- Brilliants / sacrifices (" + who + "): " + stats.brilliants + " brilliant, " +
    stats.soundSacs + " sound sacrifices, " + stats.badSacs + " unsound sacrifices");
  if(side==="wb"){
    const w = estimateElo("w"), b = estimateElo("b");
    if(w && b){
      out.push("- Estimated Elo: White ~" + w.elo + " (range " + w.low + "-" + w.high + "), Black ~" + b.elo + " (range " + b.low + "-" + b.high + "); single-game estimates");
      out.push("- White Elo inputs: " + w.n + " moves, " + w.acc + "% accuracy, " + w.acpl + " ACPL, " + w.bestRate + "% engine-best moves, " + w.blunders + " blunders, " + w.mistakes + " mistakes, " + w.inaccuracies + " inaccuracies (fixed 50/100/300 cp thresholds), " + w.std + " cp loss std dev, " + w.missedWins + " missed wins, " + w.missedMates + " missed mates, " + w.missedTactics + " missed tactics, " + w.brilliants + " brilliants, " + w.soundSacs + " sound sacrifices, " + w.badSacs + " unsound sacrifices");
      out.push("- Black Elo inputs: " + b.n + " moves, " + b.acc + "% accuracy, " + b.acpl + " ACPL, " + b.bestRate + "% engine-best moves, " + b.blunders + " blunders, " + b.mistakes + " mistakes, " + b.inaccuracies + " inaccuracies (fixed 50/100/300 cp thresholds), " + b.std + " cp loss std dev, " + b.missedWins + " missed wins, " + b.missedMates + " missed mates, " + b.missedTactics + " missed tactics, " + b.brilliants + " brilliants, " + b.soundSacs + " sound sacrifices, " + b.badSacs + " unsound sacrifices");
      out.push("- Elo model (White): ACPL ~" + w.parts.acpl + ", accuracy ~" + w.parts.acc + ", error rate ~" + w.parts.err + ", best-move rate ~" + w.parts.best + ", missed chances ~" + w.parts.miss + ", brilliant bonus +" + w.parts.bonus + " -> ~" + w.elo);
      out.push("- Elo model (Black): ACPL ~" + b.parts.acpl + ", accuracy ~" + b.parts.acc + ", error rate ~" + b.parts.err + ", best-move rate ~" + b.parts.best + ", missed chances ~" + b.parts.miss + ", brilliant bonus +" + b.parts.bonus + " -> ~" + b.elo);
    }
  } else {
    const e = estimateElo(side);
    if(e){
      out.push("- Estimated Elo (" + who + "): ~" + e.elo + " (range " + e.low + "-" + e.high + "; single-game estimate)");
      out.push("- Elo inputs (" + who + "): " + e.en + " of " + e.n + " moves used (" + e.skipped + " played from already-lost positions are excluded from accuracy/ACPL/best-move stats), " + e.acc + "% accuracy, " + e.acpl + " ACPL, " + e.bestRate + "% engine-best moves, " + e.blunders + " blunders, " + e.mistakes + " mistakes, " + e.inaccuracies + " inaccuracies (fixed 50/100/300 cp thresholds), " + e.std + " cp loss std dev, " + e.missedWins + " missed wins, " + e.missedMates + " missed mates, " + e.missedTactics + " missed tactics, " + e.brilliants + " brilliants, " + e.soundSacs + " sound sacrifices, " + e.badSacs + " unsound sacrifices");
      out.push("- Elo model (" + who + "): ACPL ~" + e.parts.acpl + ", accuracy ~" + e.parts.acc + ", error rate ~" + e.parts.err + ", best-move rate ~" + e.parts.best + ", missed chances ~" + e.parts.miss + ", brilliant bonus +" + e.parts.bonus + " -> ~" + e.elo);
      const o = estimateElo(side==="w" ? "b" : "w");
      if(o) out.push("- Opponent Elo inputs: " + o.n + " moves, " + o.acc + "% accuracy, " + o.acpl + " ACPL, " + o.bestRate + "% engine-best moves, " + o.blunders + " blunders, " + o.mistakes + " mistakes, " + o.inaccuracies + " inaccuracies, " + o.std + " cp loss std dev");
    }
  }
  out.push("- Move quality (" + who + "): Brilliant " + counts.brilliant + ", Great " + counts.great + ", Best " + counts.best + ", Good " + counts.good + ", Book " + counts.book + ", Missed chances " + counts.miss + ", Inaccuracies " + counts.inacc + ", Mistakes " + counts.mistake + ", Blunders " + counts.blunder);
  out.push("- Final FEN: " + pos[pos.length-1].fen);
  out.push("- Final board: ![Final board](" + boardImageUrl(pos[pos.length-1].fen) + ")");
  out.push("- Evaluations are from White's point of view (+ means White is better).");
  out.push("");
  out.push("## PGN");
  out.push($("pgn").value.trim());
  out.push("");
  out.push("## Recurring flaws");
  if(!flawList.length){
    out.push("No flaws tagged.");
  } else {
    const tally = {};
    flawList.forEach(({rv}) => tally[rv.tag] = (tally[rv.tag]||0)+1);
    Object.keys(tally).sort((a,b)=>tally[b]-tally[a]).forEach(t => out.push("- " + TAGS[t] + ": " + tally[t]));
  }
  out.push("");
  out.push("## Flaw details");
  if(!flawList.length){
    out.push("No individual flaws were tagged.");
  } else {
    flawList.forEach(({i,rv}) => {
      const m = moves[i], num = (Math.floor(i/2)+1) + (m.color==="w" ? "." : "...");
      out.push("- " + num + " " + m.san + " - " + TAGS[rv.tag] + ": " + rv.text);
    });
  }
  out.push("");
  out.push("## Move-by-move");
  moves.forEach((m,i) => {
    const before = pos[i], after = pos[i+1], rv = review[i];
    const num = (Math.floor(i/2)+1) + (m.color==="w" ? "." : "...");
    const mine = side==="wb" || m.color===side;
    const whoMove = m.color==="w" ? "White" : "Black";
    out.push("");
    out.push("### " + num + " " + m.san + " (" + whoMove + (mine ? ", reviewed side" : "") + ") - " + kinds[rv.kind]);
    out.push("- Board after the move: ![Board after " + num + " " + m.san + "](" + boardImageUrl(after.fen) + ")");
    out.push("- Evaluation: " + evalText(before) + " -> " + evalText(after) + (rv.loss>0 ? " (lost " + (rv.loss/100).toFixed(2) + " pawns)" : ""));
    out.push("- What the move does: " + describe(before.fen, rv.uci));
    if(before.best){
      out.push("- Stockfish's top choice before the move: " + describe(before.fen, before.best));
      const line = pvToSan(before.fen, before.pv, 6).join(" ");
      if(line) out.push("- Stockfish line before the move: " + line);
    }
    if(after.best){
      const other = m.color==="w" ? "Black" : "White";
      out.push("- Stockfish's expected " + other + " reply after the move: " + describe(after.fen, after.best));
      const line = pvToSan(after.fen, after.pv, 6).join(" ");
      if(line) out.push("- Stockfish line after the move: " + line);
    }
    const op = lookupFen(after.fen);
    if(op) out.push("- Opening: " + op.name + " (" + op.eco + ")");
    if(rv.tag) out.push("- Flaw: " + TAGS[rv.tag] + ": " + rv.text);
    if(rv.kind==="brilliant") out.push("- Brilliant: " + rv.text);
    else if(rv.kind==="great") out.push("- Great: " + rv.text);
    else if(rv.kind==="book") out.push("- Book: " + rv.text);
    else if(rv.sacWorth) out.push("- Sacrifice check: " + (rv.sacWorth==="good" ? "worth it (" + rv.sac.net + " points offered)" : "not worth it") + ".");
  });
  return out.join("\n");
}

async function copyText(t){
  if(navigator.clipboard && window.isSecureContext){
    try{ await navigator.clipboard.writeText(t); return; }catch(e){}
  }
  const ta = document.createElement("textarea");
  ta.value = t; ta.setAttribute("readonly","");
  ta.style.position = "fixed"; ta.style.left = "-9999px"; ta.style.top = "0";
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, ta.value.length);
  const ok = document.execCommand("copy");
  ta.remove();
  if(!ok) throw new Error("copy failed");
}

$("copyreport").onclick = async () => {
  const btn = $("copyreport");
  if(!moves.length || !review.length){ btn.textContent = "Analyze a game first"; }
  else {
    try{ await copyText(buildReport()); btn.textContent = "Copied - paste into ChatGPT"; }
    catch(e){ btn.textContent = "Copy failed - try again"; }
  }
  clearTimeout(btn._t);
  btn._t = setTimeout(() => btn.textContent = "Copy details for ChatGPT", 2500);
};

async function run(){
  try{ await runGame(); }
  catch(err){
    console.error(err);
    $("status").textContent = "Something went wrong while analysing that game. Try again.";
    $("go").disabled = false; $("bar").style.display = "none";
  }
}
async function runGame(){
  $("gamepick").classList.add("hide");
  if(!engineReady){ $("status").textContent = "Stockfish is not ready yet."; return; }
  const text = $("pgn").value.trim();
  const g = new Chess();
  if(!text || !g.load_pgn(fixPgnFen(text), {sloppy:true})){ $("status").textContent = "That PGN could not be read. Check the moves and try again."; return; }
  const list = g.history({verbose:true});
  if(!list.length){ $("status").textContent = "No moves found in that PGN."; return; }

  const token = ++running, depth = parseInt($("depth").value,10);
  $("go").disabled = true; $("bar").style.display = "block"; $("barfill").style.width = "0";
  const startFen = ((g.header && g.header()) || {}).FEN; // games that start from a custom position
  const rep = startFen ? new Chess(startFen) : new Chess(), fens = [rep.fen()];
  list.forEach(m => { rep.move(m.san); fens.push(rep.fen()); });

  const out = new Array(fens.length), CH = 2;
  let nextI = 0, done = 0, rpT = 0, failed = false;
  const loop = async wk => {
    if(!wk) return;
    while(token===running && !failed && !wk.dead){
      const st = nextI; if(st >= fens.length) return; nextI += CH;
      for(let i=st; i<Math.min(st+CH, fens.length); i++){
        if(token!==running || failed) return;
        out[i] = await onW(wk, () => analyze(fens[i], depth, wk));
        if(!out[i] && wk !== main && main && !main.dead) out[i] = await onW(main, () => analyze(fens[i], depth, main)); // helper died: main takes over
        if(!out[i]){ failed = true; return; }
        done++;
        if(!rpT) rpT = requestAnimationFrame(() => {
          rpT = 0;
          if(token!==running) return;
          $("status").textContent = `Analyzing position ${done} of ${fens.length}…`;
          $("barfill").style.width = (done/fens.length*100) + "%";
        });
      }
    }
  };
  const nw = Math.min(maxW(), Math.ceil(fens.length/CH)), jobs = [];
  for(let i=0;i<nw;i++) jobs.push(getWorker(i).then(loop));
  await Promise.all(jobs);
  cancelAnimationFrame(rpT); rpT = 0;
  if(token!==running) return;
  if(failed){
    $("bar").style.display = "none";
    $("status").textContent = "The engine stopped responding. Restarting it…";
    await recoverEngine();
    $("go").disabled = false;
    if(token===running) $("status").textContent = engineReady ? "Engine restarted. Tap Analyze game to try again." : "The engine could not restart. Reload the page.";
    return;
  }
  moves = list; pos = out; computeBook();
  review = moves.map((_,i) => judge(i));
  rflip = $("side").value==="b";
  clearMarks("board"); predState.review = null; reviewAnim = null;
  $("results").classList.remove("hide");
  drawMoves(); drawOpenList(); drawTally(); drawSummary();
  const side = $("side").value;
  const first = review.findIndex((r,i) => r.cls!=="good" && (side==="wb" || moves[i].color===side));
  sel = first>=0 ? first+1 : 1;
  show();
  $("status").textContent = `Done. ${moves.length} moves analyzed at depth ${depth} with ${BOT().name}.`;
  $("go").disabled = false; $("bar").style.display = "none";
  $("rform").classList.add("hide"); $("redit").classList.remove("hide");
  $("results").scrollIntoView({behavior:"smooth"});
}
let demoGames = null, pickerGames = [], pickerSource = "", pickerLoading = false;

function parsePgnGames(text){
  const games = [];
  let headers = [], moves = [];
  const flush = () => {
    if(!moves.length){ headers = []; return; }
    const h = {};
    headers.forEach(([k,v]) => h[k] = v);
    const movetext = moves.join("\n").trim();
    const headerText = headers.map(([k,v]) => `[${k} "${v}"]`).join("\n");
    games.push({
      white:h.White || "?", black:h.Black || "?", event:h.Event || "", site:h.Site || "",
      date:h.Date || "", round:h.Round || "", result:h.Result || "*", eco:h.ECO || "",
      whiteElo:h.WhiteElo || "", blackElo:h.BlackElo || "",
      pgn:(headerText ? headerText + "\n\n" : "") + movetext + "\n",
      index:games.length,
      search:[h.White,h.Black,h.Event,h.Site,h.Date,h.Round,h.Result,h.ECO,h.WhiteElo,h.BlackElo]
        .filter(Boolean).join(" ").toLowerCase()
    });
    headers = []; moves = [];
  };
  for(const raw of fixPgnFen(String(text).replace(/^\uFEFF/,"")).split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    if(line[0] === "["){
      const m = line.match(/^\[([A-Za-z0-9_]+)\s+"(.*)"\]$/);
      if(m){
        if(moves.length) flush();
        headers.push([m[1], m[2]]);
        continue;
      }
    }
    moves.push(line);
  }
  flush();
  return games;
}

function openGamePicker(games, source){
  if(!games.length) return;
  pickerGames = games; pickerSource = source;
  $("gamefilter").value = "";
  $("gamepick").classList.remove("hide");
  renderGameList();
  $("gamepick").scrollIntoView({behavior:"smooth", block:"nearest"});
}

function renderGameList(){
  const terms = $("gamefilter").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = (terms.length ? pickerGames.filter(g => terms.every(t => g.search.includes(t))) : pickerGames.slice())
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));
  const shown = filtered;
  $("gamelist").innerHTML = shown.length ? shown.map(g => {
    const title = g.white + (g.whiteElo ? ` (${g.whiteElo})` : "") + " \u2013 " +
      g.black + (g.blackElo ? ` (${g.blackElo})` : "");
    const sub = [g.event, g.date, g.round ? "R" + g.round : "", g.result, g.eco].filter(Boolean).join(" \u00b7 ");
    return `<button type="button" class="gamerow" data-i="${g.index}"><span class="gmain">${esc(title)}</span><span class="gsub">${esc(sub)}</span></button>`;
  }).join("") : `<div class="empty" style="padding:.67rem">No games match that search.</div>`;
  $("gamelist").scrollTop = 0;
  const total = filtered.length;
  $("gamecount").textContent = total === 0
    ? "0 games in " + pickerSource
    : `${total} matching game${total===1?"":"s"} in ${pickerSource}.`;
}

function chooseGame(g){
  $("pgn").value = g.pgn.trim();
  if(/malakhov/i.test(g.white)) $("side").value = "w";
  else if(/malakhov/i.test(g.black)) $("side").value = "b";
  $("gamepick").classList.add("hide");
  $("status").textContent = `Loaded ${g.white} vs ${g.black}${g.event ? " \u2014 " + g.event : ""}. Tap Analyze game.`;
  $("pgn").scrollIntoView({behavior:"smooth", block:"center"});
}

async function openDemoPicker(){
  if(pickerLoading) return;
  if(demoGames && demoGames.length){
    $("status").textContent = `Choose from ${demoGames.length} demo games.`;
    openGamePicker(demoGames, "Malakhov.pgn");
    return;
  }
  pickerLoading = true;
  const btn = $("sample"), label = btn.textContent;
  btn.disabled = true; btn.textContent = "Loading games\u2026";
  $("status").textContent = "Loading Malakhov.pgn\u2026";
  try{
    const res = await fetch("Malakhov.pgn");
    if(!res.ok) throw new Error("HTTP " + res.status);
    demoGames = parsePgnGames(await res.text());
    if(!demoGames.length) throw new Error("no games found");
    $("status").textContent = `Loaded ${demoGames.length} games from Malakhov.pgn.`;
    openGamePicker(demoGames, "Malakhov.pgn");
  }catch(err){
    $("status").textContent = "Could not load Malakhov.pgn: " + err.message + ". Serve this folder over HTTP and keep the file next to index.html.";
  }finally{
    pickerLoading = false; btn.disabled = false; btn.textContent = label;
  }
}

$("go").onclick = async () => {
  if(!$("pgn").value.trim() && $("chesslink").value.trim()){ if(!(await loadChessCom())) return; }
  const games = parsePgnGames($("pgn").value);
  if(games.length > 1){
    openGamePicker(games, "pasted PGN");
    $("status").textContent = `This PGN contains ${games.length} games. Choose one.`;
    return;
  }
  run();
};
$("import").onclick = () => $("pgnfile").click();
$("pgnfile").onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    const text = String(r.result), games = parsePgnGames(text);
    if(!text.trim()){ $("status").textContent = "That file is empty."; return; }
    if(games.length > 1){
      openGamePicker(games, f.name);
      $("status").textContent = `Found ${games.length} games in ${f.name}. Choose one.`;
    } else if(games.length === 1){
      $("pgn").value = games[0].pgn.trim();
      $("status").textContent = "Loaded " + f.name + ". Tap Analyze game.";
    } else {
      $("pgn").value = text.trim();
      $("status").textContent = "Loaded " + f.name + ". Tap Analyze game.";
    }
  };
  r.onerror = () => { $("status").textContent = "Could not read that file."; };
  r.readAsText(f); e.target.value = "";
};
$("redit").onclick = () => { $("rform").classList.remove("hide"); $("redit").classList.add("hide"); };
$("sample").onclick = openDemoPicker;
$("gamefilter").addEventListener("input", renderGameList);
$("gamepick").addEventListener("keydown", e => { if(e.key === "Escape") $("gamepick").classList.add("hide"); });
$("gameclose").onclick = () => $("gamepick").classList.add("hide");
$("gamelist").addEventListener("click", e => {
  const row = e.target.closest(".gamerow");
  if(!row) return;
  const g = pickerGames[+row.dataset.i];
  if(g) chooseGame(g);
});
$("prev").onclick = () => step(-1);
$("next").onclick = () => step(1);
$("side").onchange = () => { if(moves.length){ rflip = $("side").value==="b"; drawTally(); drawSummary(); show(); } };
attachMarks($("board"), () => rflip, () => { if(moves.length) show(); });
$("board").addEventListener("pointerdown", e => { if(e.button===0 && clearMarks("board") && moves.length) show(); });

