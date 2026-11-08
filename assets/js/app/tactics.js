/* ---------- Tactics: forks, pins, hanging pieces ---------- */
function withTurn(fen, color){ const p = fen.split(" "); p[1] = color; p[3] = "-"; return p.join(" "); }

function forkTargets(fenBefore, uci){
  try{
    const g = new Chess(fenBefore);
    const m = uciToMove(g, uci);
    if(!m) return null;
    const h = new Chess(withTurn(g.fen(), m.color));
    const seen = {};
    h.moves({square:m.to, verbose:true}).forEach(x => {
      if(x.captured && (VAL[x.captured]>=3 || x.captured==="k")) seen[x.to] = NAMES[x.captured] + " on " + x.to;
    });
    return Object.values(seen);
  }catch(e){ return null; }
}

const factsCache = new Map();
function boardFacts(fen){
  const hit = factsCache.get(fen); if(hit) return hit;
  const unprotected = [], defended = [], pinned = [];
  try{
    const g = new Chess(fen), board = g.board();
    const capt = {}, pinGame = {};
    // every capture available to color c, grouped by target square (one move generation per color)
    const capturesOf = c => {
      if(!capt[c]){
        const map = {};
        new Chess(withTurn(fen, c)).moves({verbose:true}).forEach(m => { if(m.captured) (map[m.to] = map[m.to] || []).push(m); });
        capt[c] = map;
      }
      return capt[c];
    };
    for(let r=0;r<8;r++) for(let f=0;f<8;f++){
      const p = board[r][f]; if(!p || p.type==="k") continue;
      const s = "abcdefgh"[f] + (8-r), enemy = p.color==="w" ? "b" : "w";

      const att = capturesOf(enemy)[s];
      if(att && att.length){
        // Simulate each capture, then see whether any of our pieces can legally recapture.
        let guarded = false;
        for(const atk of att){
          const sim = new Chess(withTurn(fen, enemy));
          sim.move({from:atk.from, to:atk.to, promotion:atk.promotion});
          if(sim.moves({verbose:true}).some(m => m.to===s && m.captured)){ guarded = true; break; }
        }
        (guarded ? defended : unprotected).push({sq:s, type:p.type, color:p.color});
      }

      const t = pinGame[p.color] || (pinGame[p.color] = new Chess(withTurn(fen, p.color)));
      if(t.__chk === undefined) t.__chk = t.in_check();
      if(!t.__chk){
        t.remove(s);
        if(t.in_check()) pinned.push({sq:s, type:p.type, color:p.color});
        t.put({type:p.type, color:p.color}, s);
      }
    }
  }catch(e){}
  const res = {unprotected, defended, pinned};
  factsCache.set(fen, res);
  if(factsCache.size > 300) factsCache.delete(factsCache.keys().next().value);
  return res;
}
function factsText(f){
  const nm = x => (x.color==="w"?"White":"Black") + " " + NAMES[x.type] + " on " + x.sq;
  const parts = [];
  if(f.unprotected.length) parts.push("Attacked and undefended (red glow): " + f.unprotected.map(nm).join(", ") + ".");
  if(f.defended.length) parts.push("Attacked but defended (yellow glow): " + f.defended.map(nm).join(", ") + ".");
  if(f.pinned.length) parts.push("Pinned to the king (purple glow): " + f.pinned.map(nm).join(", ") + ".");
  return parts.length ? parts.join(" ") : "No attacked pieces or pins right now.";
}

