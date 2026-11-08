/* ================= DETECTOR: engine-match + sudden-jump flags ================= */
const DET = {
  INVESTIGATE: 0.75,   // first-choice match rate at or above this needs investigation
  MIN_MOVES: 8,        // fewer counted moves than this is too small a sample
  MIN_GAMES: 6,        // fewer games than this for one player is too small a sample
  WIN: 10,             // max rolling window (counted moves) for in-game jump detection
  GAME_JUMP: 0.40,     // in-game: later window beats an earlier window by this much
  GAME_JUMP_TO: 0.70,  // ...and the later window must be at least this accurate
  SERIES_JUMP: 0.25,   // across games: this game beats the player's earlier average by this much
  SERIES_TO: 0.50,     // ...and reaches at least this match rate
  DECIDED: 700,        // positions this lopsided (centipawns for the mover) are not counted
  OBVIOUS_GAP: 200,    // best move beats the 2nd best by this much: an only-move, not counted
  COMPLEX_SPREAD: 60,  // best vs 3rd best within this: several good options (a telling position)
  TOP3: 0.90,          // engine-like profile: top-3 match at least this...
  PROFILE_ACPL: 15,    // ...with average centipawn loss at most this...
  MIN_PROFILE: 10,     // ...over at least this many counted moves, and no mistakes
  FP_STRONG: 80,       // motif fingerprint score at or above this is engine-like
  FP_QUIET: 0.70,      // ...and needs this match rate in quiet positions (at least 6)
  FP_COMPLEX: 0.70,    // ...or this match rate in complex positions (at least 4)
  FP_STREAK: 8,        // ...or a perfect first-choice streak this long
  MPV: 3,
  MAX_GAMES: 30
};
let dRunning = 0;
const dcache = new Map();
const pct = x => Math.round(x*100) + "%";
// 95% Wilson interval for a rate k/n: tells how much a short game can really say
function wilson(k, n){
  if(!n) return [0, 0];
  const z = 1.96, p = k/n, d = 1 + z*z/n, c = p + z*z/(2*n), w = z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n));
  return [Math.max(0, (c-w)/d), Math.min(1, (c+w)/d)];
}

// The motif is what the move does on the board, not just whether it matched a line.
const DET_MOTIF_LABEL = {quiet:"quiet move", check:"check", capture:"capture", castle:"castling", promotion:"promotion", mate:"checkmate"};
function detMotif(m){
  if(!m) return "quiet";
  if(/#/.test(m.san)) return "mate";
  if(/\+/.test(m.san)) return "check";
  if(m.promotion) return "promotion";
  if(m.flags.includes("k") || m.flags.includes("q")) return "castle";
  if(m.captured) return "capture";
  return "quiet";
}
// The tactical idea behind a move, when it has one (fork for now).
function detFork(fen, m){
  if(!m || typeof forkTargets !== "function") return "";
  try{
    const ft = forkTargets(fen, m.from + m.to + (m.promotion||""));
    return ft && ft.length >= 2 ? "forks " + ft.join(" and ") : "";
  }catch(e){ return ""; }
}

// Fingerprint = style behind the matches. Top-3 matching alone is weak evidence,
// so this weighs quiet and complex positions, loss and streaks as well.
function detFpMotif(r){
  return (r.quietN >= 6 && r.quietRate >= DET.FP_QUIET)
    || (r.cx >= 4 && r.cxRate >= DET.FP_COMPLEX)
    || (r.quietCxN >= 4 && r.quietCxRate >= DET.FP_QUIET)
    || r.streak >= DET.FP_STREAK;
}
function detFingerprint(r){
  const checks = [];
  if(r.n < DET.MIN_PROFILE) return {score:null, label:"Needs " + (DET.MIN_PROFILE - r.n) + " more counted moves", checks};
  let score = r.rate*30 + r.t3rate*10 + Math.max(0, 1 - r.acpl/80)*15
    + (r.quietN >= 6 ? (r.quietRate || 0)*15 : 0)
    + (r.cx >= 4 ? (r.cxRate || 0)*10 : 0)
    + (r.quietCxN >= 4 ? (r.quietCxRate || 0)*10 : 0)
    + Math.min(1, r.streak/12)*10;
  score = Math.round(Math.max(0, Math.min(100, score)));
  // No motif signal, or too much loss, means the fingerprint cannot be called strong.
  if(!detFpMotif(r)) score = Math.min(score, 64);
  else if(r.acpl > DET.PROFILE_ACPL) score = Math.min(score, 79);
  const label = score>=DET.FP_STRONG ? "Strong" : score>=65 ? "Moderate" : score>=50 ? "Mixed" : "Human-like";
  checks.push({ok: r.acpl <= DET.PROFILE_ACPL, txt:"Avg loss " + Math.round(r.acpl) + "cp"});
  if(r.quietN >= 6) checks.push({ok: r.quietRate >= DET.FP_QUIET, txt:"Quiet match " + pct(r.quietRate) + " (" + r.quietHits + "/" + r.quietN + ")"});
  if(r.cx >= 4) checks.push({ok: r.cxRate >= DET.FP_COMPLEX, txt:"Complex match " + pct(r.cxRate) + " (" + r.cxHits + "/" + r.cx + ")"});
  if(r.quietCxN >= 4) checks.push({ok: r.quietCxRate >= DET.FP_QUIET, txt:"Quiet+complex " + pct(r.quietCxRate) + " (" + r.quietCxHits + "/" + r.quietCxN + ")"});
  if(r.n >= 12) checks.push({ok: r.streak >= DET.FP_STREAK, txt:"Perfect streak " + r.streak});
  return {score, label, checks};
}

// Top-N analysis of one position. Scores in .lines are from the mover's side; .cp/.mate are from White's side (like analyze()).
// MultiPV is switched on only for this search and always reset, so Review and Play keep seeing a single line.
function detAnalyze(fen, depth, wk, mpv){
  mpv = mpv || DET.MPV;
  const key = fen + "|" + depth + "|" + mpv, hit = dcache.get(key);
  if(hit) return Promise.resolve(hit);
  const g = new Chess(fen);
  if(g.game_over()) return analyze(fen, depth, wk);
  const sign = g.turn()==="w" ? 1 : -1, by = {};
  const setMpv = v => { try{ wk.w.postMessage("setoption name MultiPV value " + v); }catch(e){} };
  setMpv(mpv);
  return runSearch(wk, fen, depth, 20, l => {
    if(!l.startsWith("info") || !l.includes(" pv ") || /bound/.test(l)) return;
    const sc = l.match(/score (cp|mate) (-?\d+)/); if(!sc) return;
    const mp = l.match(/multipv (\d+)/), v = parseInt(sc[2], 10), pv = l.split(" pv ")[1].trim().split(/\s+/);
    by[mp ? +mp[1] : 1] = {uci:pv[0], pv, mate: sc[1]==="mate" ? v : null, cp: sc[1]==="cp" ? v : (v>0?1:-1) * (10000 - Math.abs(v)*10)};
  }).then(res => {
    setMpv(1);
    if(!res) return null;
    const lines = Object.keys(by).map(Number).sort((x,y) => x-y).map(k => by[k]);
    if(!lines.length && res.best && res.best!=="(none)") lines.push({uci:res.best, pv:[res.best], mate:null, cp:0});
    if(!lines.length) return null;
    const top = lines[0];
    const r = {fen, cp:top.cp*sign, mate: top.mate!=null ? top.mate*sign : null, best:top.uci, pv:top.pv, lines};
    dcache.set(key, r);
    if(dcache.size > 800) dcache.delete(dcache.keys().next().value);
    return r;
  });
}

// The person the detector should focus on: the named player, or the one with the most games.
function detFocus(subs, player){
  if(!subs.length) return null;
  const p = player.trim().toLowerCase();
  if(p){
    const matched = subs.filter(x => x.name.toLowerCase().includes(p));
    return {name: player.trim(), games: new Set(matched.map(x => x.fi)).size};
  }
  const groups = [], seen = new Set();
  subs.forEach(x => {
    const k = x.name.trim().toLowerCase();
    if(seen.has(k)) return;
    seen.add(k);
    groups.push({name: x.name.trim(), games: new Set(subs.filter(y => y.name.trim().toLowerCase() === k).map(y => y.fi)).size});
  });
  return groups.reduce((a,b) => b.games > a.games ? b : a, groups[0]);
}

// Pick the subject(s) to score for one parsed game.
function detSubjects(game, idx, player, side){
  const out = [], p = player.trim().toLowerCase();
  const add = (color, name) => out.push({color, name, game, idx, elo: parseInt(color==="w" ? game.whiteElo : game.blackElo, 10) || null});
  if(p){
    const w = game.white.toLowerCase().includes(p), b = game.black.toLowerCase().includes(p);
    if(w) add("w", game.white);
    if(b) add("b", game.black);
    return out;
  }
  if(side==="w" || side==="wb") add("w", game.white);
  if(side==="b" || side==="wb") add("b", game.black);
  return out;
}

// rolling in-game jump: the biggest rise from an earlier window to a later, non-overlapping one
function detJump(flags, W){
  const n = flags.length;
  if(n < W*2) return null;
  const pre = [0]; flags.forEach(f => pre.push(pre[pre.length-1] + f));
  const rate = a => (pre[a+W] - pre[a]) / W;
  let best = null;
  for(let a=0; a<=n-2*W; a++) for(let b=a+W; b<=n-W; b++){
    const j = rate(b) - rate(a);
    if(!best || j > best.jump) best = {a, b, from:rate(a), to:rate(b), jump:j, W};
  }
  if(best && best.jump >= DET.GAME_JUMP && best.to >= DET.GAME_JUMP_TO) return best;
  return null;
}

// Score one side of one game from the analysed positions.
function detScore(sub, fens, pv){
  const list = sub.moves, entries = [];
  const sp = String(fens[0] || "").trim().split(/\s+/);
  const startTurn = sp[1] === "b" ? 1 : 0, startNo = parseInt(sp[5], 10) || 1;
  list.forEach((m, i) => {
    if(m.color !== sub.color) return;
    const before = pv[i], after = pv[i+1];
    if(!before || !after || !before.best) return;
    const mover = m.color==="w" ? 1 : -1, uci = m.from + m.to + (m.promotion||"");
    const lines = before.lines || [];
    const match = uci === before.best;
    const top3 = match || lines.slice(0, 3).some(l => l.uci === uci);
    const L = k => lines[k] ? clip(lines[k].cp, 2000) : null;
    const gap = L(1) != null ? L(0) - L(1) : null;               // best vs 2nd best (mover's view)
    const spread = L(2) != null ? L(0) - L(2) : null;            // best vs 3rd best
    const complex = spread != null && spread <= DET.COMPLEX_SPREAD;
    const prev = i > 0 ? list[i-1] : null;
    const recapture = !!(m.captured && prev && prev.captured && prev.to === m.to);
    const only = gap != null && gap >= DET.OBVIOUS_GAP;
    const obvious = recapture || only;
    let legal = 99; try{ legal = new Chess(fens[i]).moves().length; }catch(e){}
    let book = null; try{ book = lookupFen(fens[i+1]); }catch(e){}
    const mine = before.mate != null ? (before.mate*mover > 0 ? 1e5 : -1e5) : before.cp*mover;
    let skip = null;
    if(legal <= 1) skip = "forced";
    else if(book) skip = "book";
    else if(Math.abs(mine) >= DET.DECIDED) skip = "decided";
    else if(obvious) skip = "obvious";
    let loss = Math.max(0, (clip(before.cp) - clip(after.cp)) * mover);
    if(match) loss = 0;
    let rank = match ? 1 : 0;
    if(!rank) for(let k=0;k<Math.min(3,lines.length);k++){ if(lines[k].uci===uci){ rank = k+1; break; } }
    const motif = detMotif(m), fork = detFork(fens[i], m), topSan = [];
    for(const l of lines.slice(0, 3)){
      try{ const mm = uciToMove(new Chess(fens[i]), l.uci); if(mm) topSan.push(mm.san); }catch(e){}
    }
    let bestQuiet = false;
    try{ const bm = uciToMove(new Chess(fens[i]), before.best); bestQuiet = !!bm && detMotif(bm) === "quiet"; }catch(e){}
    const turnIdx = i + startTurn;
    const no = (startNo + Math.floor(turnIdx/2)) + (turnIdx % 2 ? "..." : ".");
    entries.push({ply:i+1, no, san:m.san, match, top3, complex, only, rank, motif, fork, bestQuiet, topSan, loss:Math.min(400, loss), skip});
  });
  const used = entries.filter(e => !e.skip), n = used.length;
  const hits = used.filter(e => e.match).length, t3 = used.filter(e => e.top3).length;
  const cx = used.filter(e => e.complex), flags = used.map(e => e.match ? 1 : 0);
  const skips = {book:0, forced:0, decided:0, obvious:0};
  entries.forEach(e => { if(e.skip) skips[e.skip]++; });
  const acpl = n ? used.reduce((t,e) => t + e.loss, 0)/n : 0;
  const W = Math.max(5, Math.min(DET.WIN, Math.floor(n/3)));
  const quietUsed = used.filter(e => e.bestQuiet), forceUsed = used.filter(e => !e.bestQuiet);
  const quietHits = quietUsed.filter(e => e.match).length, forceHits = forceUsed.filter(e => e.match).length;
  const quietCx = used.filter(e => e.bestQuiet && e.complex), quietCxHits = quietCx.filter(e => e.match).length;
  let run = 0, streak = 0;
  used.forEach(e => { if(e.match){ run++; if(run > streak) streak = run; } else run = 0; });
  const motifHits = {quiet:0, check:0, capture:0, castle:0, promotion:0, mate:0};
  used.forEach(e => { if(e.match) motifHits[e.motif]++; });
  const r = {entries, used, n, hits, rate: n ? hits/n : 0, ci: wilson(hits, n), t3, t3rate: n ? t3/n : 0,
    acpl, big: used.filter(e => e.loss >= 100).length, cx: cx.length, cxHits: cx.filter(e => e.match).length,
    quietN: quietUsed.length, quietHits, quietRate: quietUsed.length ? quietHits/quietUsed.length : null,
    forceN: forceUsed.length, forceHits, forceRate: forceUsed.length ? forceHits/forceUsed.length : null,
    cxRate: cx.length ? cx.filter(e => e.match).length/cx.length : null,
    quietCxN: quietCx.length, quietCxHits, quietCxRate: quietCx.length ? quietCxHits/quietCx.length : null,
    streak, motifHits, forkHits: used.filter(e => e.match && e.fork).length,
    onlyMatches: entries.filter(e => e.only && e.match).length,
    skips, skipped: entries.length - n, flags, W, jump: detJump(flags, W)};
  r.fp = detFingerprint(r);
  return r;
}

// every flag a player-game can carry
function detFlags(r, sub, seriesNote){
  const tiny = r.n < DET.MIN_MOVES;
  const inv = !tiny && r.rate >= DET.INVESTIGATE;
  const prof = !tiny && !inv && r.n >= DET.MIN_PROFILE && r.t3rate >= DET.TOP3 && r.acpl <= DET.PROFILE_ACPL && r.big === 0;
  const fp = !tiny && r.n >= DET.MIN_PROFILE && r.fp.score != null && r.fp.score >= DET.FP_STRONG && detFpMotif(r);
  return {tiny, inv, prof, fp, gj: !!r.jump, sj: !!seriesNote,
    red: inv || prof || fp, any: inv || prof || fp || !!r.jump || !!seriesNote};
}

function detChart(r){
  const W = r.W, flags = r.flags, n = flags.length;
  const w = 600, h = 130, padL = 30, padR = 8, padT = 8, padB = 18;
  const X = i => padL + (n<=1 ? 0 : i/(n-1)) * (w-padL-padR);
  const Y = v => padT + (1-v) * (h-padT-padB);
  let s = "";
  [0, .25, .5, .75, 1].forEach(v => { s += `<line x1="${padL}" x2="${w-padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="#8a8784" stroke-width="1" opacity="${v===.75?0:.25}"/><text x="${padL-4}" y="${Y(v)+3}" font-size="9" text-anchor="end" fill="#a8a7a5">${v*100}</text>`; });
  s += `<line x1="${padL}" x2="${w-padR}" y1="${Y(DET.INVESTIGATE)}" y2="${Y(DET.INVESTIGATE)}" stroke="#fa412d" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${w-padR}" y="${Y(DET.INVESTIGATE)-3}" font-size="9" text-anchor="end" fill="#fa412d">75% line</text>`;
  if(r.jump){
    const x0 = X(r.jump.b), x1 = X(Math.min(n-1, r.jump.b + W - 1));
    s += `<rect x="${x0}" y="${padT}" width="${Math.max(2, x1-x0)}" height="${h-padT-padB}" fill="#f7a531" opacity=".18"/>`;
  }
  if(n >= W){
    const pts = [];
    for(let i=W-1; i<n; i++){ let c = 0; for(let k=i-W+1; k<=i; k++) c += flags[k]; pts.push(`${X(i).toFixed(1)},${Y(c/W).toFixed(1)}`); }
    s += `<polyline points="${pts.join(" ")}" fill="none" stroke="#6aa6e6" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  flags.forEach((f, i) => { s += `<circle cx="${X(i).toFixed(1)}" cy="${h-padB+6}" r="2.2" fill="${f ? "#81b64c" : "#6d6b69"}"/>`; });
  return `<svg class="dchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Rolling engine match rate over ${W} moves">${s}</svg>`;
}

// one chip per move the player made: first choice, top 3, other, or not counted
function detMoves(r){
  const chips = r.entries.map(e => {
    const no = e.no || (Math.ceil(e.ply/2) + (e.ply%2 ? "." : "..."));
    const c = e.skip ? "sk" : e.match ? "t1" : e.top3 ? "t3" : "ms";
    let tip = e.skip ? "Not counted: " + e.skip : e.match ? "Engine's first choice" : e.top3 ? "In the engine's top 3" : "Lost about " + Math.round(e.loss) + " centipawns";
    if(e.topSan && e.topSan.length) tip += " | Top 3: " + e.topSan.join(", ");
    if(e.motif) tip += " | Motif: " + DET_MOTIF_LABEL[e.motif] + (e.fork ? " (" + e.fork + ")" : "");
    if(e.rank) tip += " | Rank " + e.rank;
    return `<button type="button" class="dm ${c}${(!e.skip && e.loss >= 100) ? " bad" : ""}" title="${esc(tip)}" data-info="${esc(tip)}">${no}${esc(e.san)}</button>`;
  }).join("");
  return `<div class="dmoves">${chips}</div>
    <div class="dmd hide" aria-live="polite"></div>
    <div class="dlegend"><span><i class="t1"></i>First choice</span><span><i class="t3"></i>Top 3</span><span><i class="ms"></i>Other</span><span><i class="sk"></i>Not counted</span></div>`;
}

function detCard(r, label, sub, f, seriesNote){
  const cls = f.tiny ? "low" : f.red ? "inv" : f.any ? "jump" : "";
  let flags = "";
  if(f.tiny) flags += `<span class="dflag low">Too few moves</span>`;
  if(f.inv) flags += `<span class="dflag inv">Needs investigation</span>`;
  if(f.prof) flags += `<span class="dflag inv">Engine-like precision</span>`;
  if(f.fp && !f.prof) flags += `<span class="dflag inv">Engine-like motif fingerprint</span>`;
  if(f.gj) flags += `<span class="dflag jump">Sudden jump in game</span>`;
  if(f.sj) flags += `<span class="dflag jump">Jump vs earlier games</span>`;
  if(!f.tiny && !f.any) flags += `<span class="dflag ok">No flag</span>`;
  const [lo, hi] = r.ci;
  let why = "";
  if(f.inv) why += `<p><b>${pct(r.rate)}</b> of the counted moves (${r.hits} of ${r.n}) were Stockfish's first choice, at or above the ${pct(DET.INVESTIGATE)} line (95% range ${pct(lo)}-${pct(hi)}).</p>`;
  if(f.prof) why += `<p>Under the ${pct(DET.INVESTIGATE)} line on first choices (${pct(r.rate)}), but <b>${pct(r.t3rate)}</b> of moves were in Stockfish's top 3, the average loss was only <b>${Math.round(r.acpl)}</b> centipawns, and there was not one mistake in ${r.n} moves. That is how an engine plays.</p>`;
  if(f.fp && !f.inv && !f.prof) why += `<p>First choices stay under the ${pct(DET.INVESTIGATE)} line, but the motif fingerprint is engine-like: quiet-move match <b>${r.quietN ? pct(r.quietRate) : "-"}</b>${r.quietN ? ` (${r.quietHits}/${r.quietN})` : ""}, complex-position match <b>${r.cx ? pct(r.cxRate) : "-"}</b>, longest perfect streak <b>${r.streak}</b>. Reproducing quiet and complex engine moves is the harder part for a human.</p>`;
  if(f.gj){
    const fa = r.used[r.jump.a].ply, fb = r.used[r.jump.b].ply;
    why += `<p>Engine-move accuracy jumped from <b>${pct(r.jump.from)}</b> (around ply ${fa}) to <b>${pct(r.jump.to)}</b> (around ply ${fb}) over ${r.jump.W}-move windows, a rise of ${Math.round(r.jump.jump*100)} points.</p>`;
  }
  if(f.sj) why += `<p>${seriesNote}</p>`;
  if(r.n > 0 && r.n < 20) why += `<p>Only ${r.n} moves were counted, so treat these numbers with care.</p>`;
  const sk = r.skipped ? `Not counted (${r.skipped}): ${[["book",r.skips.book],["forced",r.skips.forced],["decided",r.skips.decided],["obvious",r.skips.obvious]].filter(x => x[1]).map(x => x[1] + " " + x[0]).join(", ")}.` : "";
  const cxTxt = r.cx >= 4 ? ` In ${r.cx} positions with several good options the engine's first choice was played ${r.cxHits} time${r.cxHits===1?"":"s"}.` : "";
  const fp = r.fp, mh = r.motifHits;
  const fpCls = fp.label === "Strong" ? "strong" : fp.label === "Moderate" ? "moderate" : "";
  const fpBadge = fp.label === "Strong" ? "strong" : fp.label === "Moderate" ? "mid" : "";
  const fpChecks = fp.checks.map(c => `<span class="dfpchk ${c.ok?"ok":"no"}">${esc(c.txt)}</span>`).join("");
  const mlist = [["quiet","quiet"],["check","checks"],["capture","captures"],["castle","castles"],["promotion","promotions"],["mate","mates"]]
    .filter(x => mh[x[0]]).map(x => mh[x[0]] + " " + x[1]);
  const mline = mlist.length ? `Motifs behind first-choice hits: ${mlist.join(", ")}.${r.forkHits ? ` Forks: ${r.forkHits}.` : ""}${r.onlyMatches ? ` Only-moves found (not counted): ${r.onlyMatches}.` : ""}` : "";
  const fpBlock = r.n ? `<div class="dfp ${fpCls}">
    <div class="dfphead"><b>Motif fingerprint</b><span class="dfpbadge ${fpBadge}">${esc(fp.label)}${fp.score != null ? " " + fp.score + "/100" : ""}</span></div>
    <div class="dstats dfpstats">
      <div class="dstat"><strong>${r.quietN ? pct(r.quietRate) : "-"}</strong><small>Quiet-move match${r.quietN ? ` (${r.quietHits}/${r.quietN})` : ""}</small></div>
      <div class="dstat"><strong>${r.forceN ? pct(r.forceRate) : "-"}</strong><small>Forcing-move match${r.forceN ? ` (${r.forceHits}/${r.forceN})` : ""}</small></div>
      <div class="dstat"><strong>${r.cx ? pct(r.cxRate) : "-"}</strong><small>Complex-position match${r.cx ? ` (${r.cxHits}/${r.cx})` : ""}</small></div>
      <div class="dstat"><strong>${r.streak}</strong><small>Longest perfect streak</small></div>
    </div>
    ${fpChecks ? `<div class="dfpchks">${fpChecks}</div>` : ""}
    ${mline ? `<p class="dnote">${mline}</p>` : ""}
  </div>` : "";
  return `<div class="card dcard ${cls}">
    <div class="dhead"><div><b>${esc(label)}</b><small>${esc(sub)}</small></div><div class="dflags">${flags}</div></div>
    <div class="dstats">
      <div class="dstat ${f.inv?"inv":(!f.tiny?"ok":"")}"><strong>${r.n ? pct(r.rate) : "-"}</strong><small>First-choice match</small></div>
      <div class="dstat ${f.prof?"inv":""}"><strong>${r.n ? pct(r.t3rate) : "-"}</strong><small>Top-3 match</small></div>
      <div class="dstat"><strong>${r.n ? Math.round(r.acpl) : "-"}</strong><small>Avg centipawn loss</small></div>
      <div class="dstat"><strong>${r.hits}/${r.n}</strong><small>First choices / counted</small></div>
    </div>
    ${fpBlock}
    ${r.n >= 2*r.W ? detChart(r) : ""}
    ${detMoves(r)}
    ${why ? `<div class="dwhy ${f.red?"":"jump"}">${why}</div>` : ""}
    <p class="dnote">${sk}${cxTxt}</p>
  </div>`;
}

function detSeriesChart(rows){
  const n = rows.length, w = 600, h = 140, padL = 30, padR = 10, padT = 10, padB = 20;
  const X = i => padL + (n<=1 ? .5 : i/(n-1)) * (w-padL-padR);
  const Y = v => padT + (1-v) * (h-padT-padB);
  let s = "";
  [0, .25, .5, .75, 1].forEach(v => { s += `<line x1="${padL}" x2="${w-padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="#8a8784" opacity="${v===.75?0:.25}"/><text x="${padL-4}" y="${Y(v)+3}" font-size="9" text-anchor="end" fill="#a8a7a5">${v*100}</text>`; });
  s += `<line x1="${padL}" x2="${w-padR}" y1="${Y(DET.INVESTIGATE)}" y2="${Y(DET.INVESTIGATE)}" stroke="#fa412d" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  const ok = rows.filter(r => !r.f.tiny);
  if(ok.length > 1) s += `<polyline points="${ok.map(r => `${X(r.i).toFixed(1)},${Y(r.res.rate).toFixed(1)}`).join(" ")}" fill="none" stroke="#6aa6e6" stroke-width="2" opacity=".7"/>`;
  rows.forEach(r => {
    if(r.f.tiny) return;
    s += `<circle cx="${X(r.i).toFixed(1)}" cy="${Y(r.res.rate).toFixed(1)}" r="5" fill="${r.f.red ? "#fa412d" : r.f.any ? "#f7a531" : "#81b64c"}" stroke="#262421" stroke-width="1.5"/>`;
  });
  s += `<text x="${padL}" y="${h-4}" font-size="9" fill="#a8a7a5">older games</text><text x="${w-padR}" y="${h-4}" font-size="9" text-anchor="end" fill="#a8a7a5">newer games</text>`;
  return `<svg class="dchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Match rate across games">${s}</svg>`;
}

async function runDetector(){
  const st = $("dstatus");
  if(!engineReady){ st.textContent = "Stockfish is not ready yet."; return; }
  const text = $("dpgn").value.trim();
  if(!text){ st.textContent = "Paste a PGN, import a file, or use the game from Review."; return; }
  let games = parsePgnGames(text);
  if(!games.length){
    const g = new Chess();
    if(!g.load_pgn(fixPgnFen(text), {sloppy:true}) || !g.history().length){ st.textContent = "That PGN could not be read. Check the moves and try again."; return; }
    const hd = g.header();
    games = [{white:hd.White||"White", black:hd.Black||"Black", date:hd.Date||"", pgn:text, index:0, event:hd.Event||"", result:hd.Result||"", whiteElo:hd.WhiteElo||"", blackElo:hd.BlackElo||""}];
  }
  // oldest first, so a rise over time reads left to right
  const ordered = games.slice().sort((a,b) => (a.date||"").localeCompare(b.date||"") || a.index - b.index);
  const player = $("dplayer").value, side = $("dside").value, depth = parseInt($("ddepth").value, 10);
  const subs = [], fenSets = [];
  let capped = false;
  for(const [gi, game] of ordered.entries()){
    if(fenSets.length >= DET.MAX_GAMES){ capped = true; break; }
    const ss = detSubjects(game, gi, player, side);
    if(!ss.length) continue;
    const g = new Chess();
    if(!g.load_pgn(fixPgnFen(game.pgn), {sloppy:true})) continue;
    const list = g.history({verbose:true});
    if(!list.length) continue;
    const startFen = ((g.header && g.header()) || {}).FEN;
    const rep = startFen ? new Chess(startFen) : new Chess(), fens = [rep.fen()];
    list.forEach(m => { rep.move(m.san); fens.push(rep.fen()); });
    const colors = new Set(ss.map(x => x.color));
    const fi = fenSets.push({fens, list, game, colors}) - 1;
    ss.forEach(x => subs.push({...x, moves:list, fi}));
  }
  if(!subs.length){
    st.textContent = player.trim() ? `No game in that PGN has a player matching "${player.trim()}".` : "No playable games found in that PGN.";
    return;
  }
  const focus = detFocus(subs, player);
  if(focus && focus.games < DET.MIN_GAMES){
    st.textContent = `Found ${focus.games} game${focus.games===1?"":"s"} for ${focus.name}. For a reliable result, paste more than ${DET.MIN_GAMES-1} games by the same player (as White or Black), then run again.`;
    return;
  }
  const token = ++dRunning;
  $("dgo").disabled = true; $("dbar").style.display = "block"; $("dbarfill").style.width = "0";
  // positions before a scored player's move get a top-3 search; the rest only need one line (for the eval after the move)
  const tasks = [];
  fenSets.forEach((fs, fi) => fs.fens.forEach((f, i) => tasks.push({fi, i, multi: i < fs.list.length && fs.colors.has(fs.list[i].color)})));
  const out = fenSets.map(fs => new Array(fs.fens.length));
  let nextT = 0, done = 0, failed = false, rpT = 0;
  const CH = 2;
  const run1 = (t, wk) => t.multi ? detAnalyze(fenSets[t.fi].fens[t.i], depth, wk) : analyze(fenSets[t.fi].fens[t.i], depth, wk);
  const loop = async wk => {
    if(!wk) return;
    while(token===dRunning && !failed && !wk.dead){
      const st0 = nextT; if(st0 >= tasks.length) return; nextT += CH;
      for(let k=st0; k<Math.min(st0+CH, tasks.length); k++){
        if(token!==dRunning || failed) return;
        const t = tasks[k];
        let r = await onW(wk, () => run1(t, wk));
        if(!r && wk !== main && main && !main.dead) r = await onW(main, () => run1(t, main));
        if(!r){ failed = true; return; }
        out[t.fi][t.i] = r; done++;
        if(!rpT) rpT = requestAnimationFrame(() => {
          rpT = 0; if(token!==dRunning) return;
          st.textContent = `Checking position ${done} of ${tasks.length}…`;
          $("dbarfill").style.width = (done/tasks.length*100) + "%";
        });
      }
    }
  };
  const nw = Math.min(maxW(), Math.ceil(tasks.length/CH)), jobs = [];
  for(let i=0;i<nw;i++) jobs.push(getWorker(i).then(loop));
  await Promise.all(jobs);
  cancelAnimationFrame(rpT); rpT = 0;
  if(token!==dRunning) return;
  $("dbar").style.display = "none"; $("dgo").disabled = false;
  if(failed){
    st.textContent = "The engine stopped responding. Restarting it…";
    await recoverEngine();
    if(token===dRunning) st.textContent = engineReady ? "Engine restarted. Tap Run detector to try again." : "The engine could not restart. Reload the page.";
    return;
  }

  subs.forEach(x => { x.res = detScore(x, fenSets[x.fi].fens, out[x.fi]); });

  // series: group by player name, compare each game with that player's earlier games
  const byPlayer = new Map();
  subs.forEach(x => { const k = x.name.toLowerCase(); if(!byPlayer.has(k)) byPlayer.set(k, []); byPlayer.get(k).push(x); });
  byPlayer.forEach(list => {
    const prev = [];
    list.forEach(x => {
      if(x.res.n < DET.MIN_MOVES) return;
      if(prev.length >= 2){
        const base = prev.reduce((t,v) => t + v, 0) / prev.length;
        if(x.res.rate - base >= DET.SERIES_JUMP && x.res.rate >= DET.SERIES_TO){
          x.seriesNote = `This game's match rate (<b>${pct(x.res.rate)}</b>) is ${Math.round((x.res.rate-base)*100)} points above ${esc(x.name)}'s average over the ${prev.length} earlier game${prev.length===1?"":"s"} here (<b>${pct(base)}</b>).`;
        }
      }
      prev.push(x.res.rate);
    });
  });
  subs.forEach(x => { x.f = detFlags(x.res, x, x.seriesNote); });

  const cnt = fn => subs.filter(x => !x.f.tiny && fn(x.f)).length;
  const nFlag = cnt(f => f.any);
  let h = `<div class="card dsum"><h2>Result</h2>
    <div class="dstats">
      <div class="dstat ${cnt(f => f.inv)?"inv":"ok"}"><strong>${cnt(f => f.inv)}</strong><small>Over ${pct(DET.INVESTIGATE)} (needs investigation)</small></div>
      <div class="dstat ${cnt(f => f.fp)?"inv":"ok"}"><strong>${cnt(f => f.fp)}</strong><small>Engine-like motif fingerprints</small></div>
      <div class="dstat ${cnt(f => f.prof)?"inv":"ok"}"><strong>${cnt(f => f.prof)}</strong><small>Engine-like precision</small></div>
      <div class="dstat ${cnt(f => f.gj || f.sj)?"inv":"ok"}"><strong>${cnt(f => f.gj || f.sj)}</strong><small>Sudden jumps</small></div>
      <div class="dstat"><strong>${subs.length}</strong><small>Player-games checked</small></div>
    </div>
    <p class="dnote">${nFlag ? `${nFlag} of ${subs.length} flagged. A flag is a reason to look closer, not proof of cheating.` : "Nothing flagged."} Book moves, forced moves, positions already decided (about ±7 pawns) and obvious moves (recaptures and only-moves) are not counted, because anyone plays those. Top-3 matching alone is weak evidence, so each card also builds a motif fingerprint from quiet-move and complex-position precision, centipawn loss and perfect streaks. Stockfish at this depth is the reference, so a stronger or different engine can disagree even when a player did use one.${capped ? ` Only the first ${DET.MAX_GAMES} games were checked.` : ""}</p>`;
  if(fenSets.length > 1 && subs.length > 1) h += detSeriesChart(subs.map((x, i) => ({i, res:x.res, f:x.f})));
  h += `</div>`;
  subs.forEach(x => {
    const g = x.game, opp = x.color==="w" ? g.black : g.white;
    const label = x.name + (x.color==="w" ? " (White)" : " (Black)") + (x.elo ? " · " + x.elo : "");
    const sub = ["vs " + opp, g.date && g.date.indexOf("?")<0 ? g.date : "", g.event, g.result].filter(Boolean).join(" · ");
    h += detCard(x.res, label, sub, x.f, x.seriesNote);
  });
  $("dresults").innerHTML = h;
  $("dresults").classList.remove("hide");
  st.textContent = `Done. ${subs.length} player-game${subs.length===1?"":"s"} checked at depth ${depth} (top ${DET.MPV} moves) with ${BOT().name}.`;
  $("dform").classList.add("hide"); $("dedit").classList.remove("hide");
  $("dresults").scrollIntoView({behavior:"smooth", block:"start"});
}
$("dgo").onclick = async () => { try{ await runDetector(); }catch(err){ console.error(err); $("dstatus").textContent = "Something went wrong while checking that game. Try again."; $("dgo").disabled = false; $("dbar").style.display = "none"; } };
$("dedit").onclick = () => { $("dform").classList.remove("hide"); $("dedit").classList.add("hide"); };
$("dresults").addEventListener("click", e => {
  const chip = e.target.closest && e.target.closest(".dm");
  if(!chip || !chip.dataset.info) return;
  const card = chip.closest(".dcard"), box = card && card.querySelector(".dmd");
  if(!box) return;
  box.textContent = chip.dataset.info;
  box.classList.remove("hide");
});
$("dfromrev").onclick = () => {
  const t = $("pgn").value.trim();
  if(!t){ $("dstatus").textContent = "Nothing loaded in Review yet. Load a game there first, or paste a PGN here."; return; }
  $("dpgn").value = t;
  $("dstatus").textContent = "Loaded the game from Review. Tap Run detector.";
};
$("dimport").onclick = () => $("dfile").click();
$("dfile").onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => { $("dpgn").value = String(r.result).trim(); $("dstatus").textContent = "Loaded " + f.name + ". Tap Run detector."; };
  r.onerror = () => { $("dstatus").textContent = "Could not read that file."; };
  r.readAsText(f); e.target.value = "";
};

