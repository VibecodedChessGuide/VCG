/* ================= Helpers ================= */
const clip = (v, m=1000) => Math.max(-m, Math.min(m, v));
function evalText(p){
  if(p.mate!=null && Math.abs(p.mate)>=1) return (p.mate>0?"Mate in ":"Mated in ") + Math.abs(p.mate);
  if(p.mate!=null) return p.mate>0 ? "Checkmate" : "Checkmated";
  const v = p.cp/100; return (v>0?"+":"") + v.toFixed(1);
}
function uciToMove(g, u){
  if(!u) return null;
  return g.move({from:u.slice(0,2), to:u.slice(2,4), promotion:u[4]||undefined});
}
// Test PGNs often arrive as one long line with a 4-field FEN and no SetUp header.
// Put each header on its own line, pad the FEN, and add SetUp so chess.js can load it.
function fixPgnFen(text){
  let s = String(text).replace(/^\uFEFF/, "");
  s = s.replace(/([^\n])(?=\[[A-Za-z0-9_]+\s+")/g, "$1\n");
  s = s.replace(/(\[[A-Za-z0-9_]+\s+"[^"]*"\])(?=\s*[^\[\s])/g, "$1\n\n");
  s = s.replace(/[ \t]+$/gm, "");
  s = s.replace(/\[FEN\s+"([^"]*)"\]/gi, (all, fen) => {
    const p = fen.trim().split(/\s+/);
    if(p.length === 4) p.push("0", "1");
    else if(p.length === 5) p.push("1");
    return `[FEN "${p.join(" ")}"]`;
  });
  s = s.replace(/^[ \t]*\[SetUp\s+"[^"]*"\][ \t]*\r?\n?/gmi, "");
  return s.replace(/(\[FEN\s+"[^"]*"\])/gi, '$1\n[SetUp "1"]');
}
function pvToSan(fen, pv, n=6){
  const g = new Chess(fen), out = [];
  for(const u of pv.slice(0,n)){ const m = uciToMove(g,u); if(!m) break; out.push(m.san); }
  return out;
}
function describe(fen, u){
  const g = new Chess(fen), m = uciToMove(g,u);
  if(!m) return "";
  const bits = [];
  if(m.flags.includes("k")||m.flags.includes("q")) bits.push("castles to protect the king");
  if(m.captured) bits.push("takes the " + NAMES[m.captured]);
  if(m.promotion) bits.push("promotes");
  if(/#/.test(m.san)) bits.push("delivers checkmate");
  else if(/\+/.test(m.san)) bits.push("gives check");
  const ft = forkTargets(fen, u);
  if(ft && ft.length>=2) bits.push("forks " + ft.join(" and "));
  const backRank = (m.color==="w" ? "1" : "8");
  if((m.piece==="n"||m.piece==="b") && m.from[1]===backRank) bits.push("develops a " + NAMES[m.piece]);
  if(["d4","e4","d5","e5"].includes(m.to) && !bits.length) bits.push("fights for the center");
  if(!bits.length) bits.push("improves the " + NAMES[m.piece] + " on " + m.to);
  return m.san + " " + bits.join(", ");
}

