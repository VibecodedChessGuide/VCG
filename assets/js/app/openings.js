/* ================= Openings (names from the Lichess chess-openings dataset, CC0) ================= */
const OPEN = new Map(), OPEN_LIST = [], GSIDE = {}, GMIN = {};
let bookAt = [], lastOpenName = "";
const OPEN_FALLBACK = [
  ["C50","Italian Game","1. e4 e5 2. Nf3 Nc6 3. Bc4"], ["C53","Italian Game: Giuoco Piano","1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5"],
  ["C51","Italian Game: Evans Gambit","1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4"], ["C55","Italian Game: Two Knights Defense","1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6"],
  ["C60","Ruy Lopez","1. e4 e5 2. Nf3 Nc6 3. Bb5"], ["C68","Ruy Lopez: Exchange Variation","1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6"],
  ["C44","Scotch Game","1. e4 e5 2. Nf3 Nc6 3. d4"], ["C45","Scotch Game: Scotch Gambit","1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4"],
  ["C47","Four Knights Game","1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6"], ["C44","Ponziani Opening","1. e4 e5 2. Nf3 Nc6 3. c3"],
  ["C25","Vienna Game","1. e4 e5 2. Nc3"], ["C23","Bishop's Opening","1. e4 e5 2. Bc4"], ["C22","Center Game","1. e4 e5 2. d4 exd4 3. Qxd4"],
  ["C30","King's Gambit","1. e4 e5 2. f4"], ["C33","King's Gambit Accepted","1. e4 e5 2. f4 exf4"], ["C30","King's Gambit Declined","1. e4 e5 2. f4 Bc5"],
  ["C21","Danish Gambit","1. e4 e5 2. d4 exd4 3. c3"], ["C40","Latvian Gambit","1. e4 e5 2. Nf3 f5"], ["C40","Elephant Gambit","1. e4 e5 2. Nf3 d5"],
  ["C42","Petrov's Defense","1. e4 e5 2. Nf3 Nf6"], ["C41","Philidor Defense","1. e4 e5 2. Nf3 d6"],
  ["B20","Sicilian Defense","1. e4 c5"], ["B21","Sicilian Defense: Smith-Morra Gambit","1. e4 c5 2. d4 cxd4 3. c3"],
  ["B21","Sicilian Defense: Smith-Morra Gambit Accepted","1. e4 c5 2. d4 cxd4 3. c3 dxc3"],
  ["B23","Sicilian Defense: Closed","1. e4 c5 2. Nc3"], ["B30","Sicilian Defense: Old Sicilian","1. e4 c5 2. Nf3 Nc6"],
  ["B50","Sicilian Defense: Modern Variations","1. e4 c5 2. Nf3 d6"], ["B40","Sicilian Defense: French Variation","1. e4 c5 2. Nf3 e6"],
  ["B90","Sicilian Defense: Najdorf Variation","1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6"],
  ["B70","Sicilian Defense: Dragon Variation","1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6"],
  ["C00","French Defense","1. e4 e6"], ["C03","French Defense: Tarrasch Variation","1. e4 e6 2. d4 d5 3. Nd2"],
  ["C11","French Defense: Classical Variation","1. e4 e6 2. d4 d5 3. Nc3 Nf6"], ["C02","French Defense: Advance Variation","1. e4 e6 2. d4 d5 3. e5"],
  ["B10","Caro-Kann Defense","1. e4 c6"], ["B12","Caro-Kann Defense: Advance Variation","1. e4 c6 2. d4 d5 3. e5"],
  ["B18","Caro-Kann Defense: Classical Variation","1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5"],
  ["B01","Scandinavian Defense","1. e4 d5"], ["B01","Scandinavian Defense: Mieses-Kotroc Variation","1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5"],
  ["B07","Pirc Defense","1. e4 d6 2. d4 Nf6 3. Nc3"], ["B06","Modern Defense","1. e4 g6"], ["B02","Alekhine's Defense","1. e4 Nf6"],
  ["B00","Nimzowitsch Defense","1. e4 Nc6"], ["B00","Owen Defense","1. e4 b6"],
  ["D06","Queen's Gambit","1. d4 d5 2. c4"], ["D30","Queen's Gambit Declined","1. d4 d5 2. c4 e6"],
  ["D20","Queen's Gambit Accepted","1. d4 d5 2. c4 dxc4"], ["D10","Slav Defense","1. d4 d5 2. c4 c6"],
  ["D43","Semi-Slav Defense","1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6"],
  ["E60","King's Indian Defense","1. d4 Nf6 2. c4 g6"], ["E20","Nimzo-Indian Defense","1. d4 Nf6 2. c4 e6 3. Nc3 Bb4"],
  ["E11","Bogo-Indian Defense","1. d4 Nf6 2. c4 e6 3. Nf3 Bb4+"], ["E12","Queen's Indian Defense","1. d4 Nf6 2. c4 e6 3. Nf3 b6"],
  ["D80","Grünfeld Defense","1. d4 Nf6 2. c4 g6 3. Nc3 d5"], ["A43","Benoni Defense","1. d4 c5 2. d5"],
  ["A56","Benoni Defense: Czech Benoni","1. d4 Nf6 2. c4 c5 3. d5 e5"], ["A53","Old Indian Defense","1. d4 Nf6 2. c4 d6"],
  ["D02","London System","1. d4 d5 2. Nf3 Nf6 3. Bf4"], ["A46","Colle System","1. d4 Nf6 2. Nf3 e6 3. e3"],
  ["A45","Trompowsky Attack","1. d4 Nf6 2. Bg5"], ["E00","Catalan Opening","1. d4 Nf6 2. c4 e6 3. g3"],
  ["A10","English Opening","1. c4"], ["A20","English Opening: Reversed Sicilian","1. c4 e5"],
  ["A04","Zukertort Opening","1. Nf3"], ["A07","King's Indian Attack","1. Nf3 d5 2. g3"], ["A06","Réti Opening","1. Nf3 d5 2. c4"],
  ["A80","Dutch Defense","1. d4 f5"], ["A02","Bird Opening","1. f4"], ["A52","Indian Defense: Budapest Gambit","1. d4 Nf6 2. c4 e5"],
  ["A57","Benko Gambit","1. d4 Nf6 2. c4 c5 3. d5 b5"], ["D00","Blackmar-Diemer Gambit","1. d4 d5 2. e4"], ["A40","Englund Gambit","1. d4 e5"]
];
const ECO_VOL = {A:"flank and irregular openings", B:"semi-open games (1.e4 without ...e5)", C:"open games and the French", D:"closed games and the Queen's Gambit", E:"Indian defences"};
const BLURB = {
  "italian game":"White aims the bishop at f7 and builds a centre with c3 and d3 or d4. Steady development with quick castling.",
  "ruy lopez":"White pressures the knight that guards e5. Slow, strategic play, and one of the most studied openings in chess.",
  "scotch game":"White opens the centre at once with d4, trading the slow build-up for space and active pieces.",
  "vienna game":"White develops the b1 knight first and keeps f4 in reserve for a quick attack.",
  "four knights game":"Both sides develop both knights. Simple, symmetrical and mostly quiet.",
  "ponziani opening":"White prepares d4 with c3. A little rare and easy to understand.",
  "bishop's opening":"White develops the bishop first, eyeing f7 and keeping the choice between f4 and Nf3.",
  "center game":"White opens the centre early with d4, often bringing the queen out.",
  "king's gambit":"White offers the f-pawn to pull Black's e-pawn away and take the centre. Sharp and risky for both sides.",
  "king's gambit accepted":"Black takes the f-pawn. White gets open lines and a big centre, but a drafty king.",
  "king's gambit declined":"Black refuses the pawn and develops freely, keeping the extra tension for later.",
  "danish gambit":"White gives one or two pawns for rapid development and open lines toward Black's king.",
  "evans gambit":"White offers the b-pawn to build a strong centre and open lines against Black's king.",
  "scotch gambit":"White develops the bishop to c4 instead of recapturing, aiming for quick piece play.",
  "latvian gambit":"Black plays an early ...f5, aggressive and sharp, but White can often punish it with accurate play.",
  "elephant gambit":"Black strikes in the centre at once with ...d5. Risky, and usually good against careless play.",
  "petrov's defense":"Black mirrors White by attacking e4. Very solid, and often drawish if White plays quietly.",
  "petrov's defence":"Black mirrors White by attacking e4. Very solid, and often drawish if White plays quietly.",
  "two knights defense":"Black counterattacks with Nf6 instead of defending e5, often leading to sharp play.",
  "philidor defense":"Black defends e5 with d6. Solid but a little passive, with a cramped position to untangle.",
  "sicilian defense":"Black fights for the centre from the side with ...c5, so the position is unbalanced with winning chances for both. The most popular reply to 1.e4.",
  "smith-morra gambit":"White gives a pawn against the Sicilian for fast development and open files.",
  "french defense":"Black builds a pawn chain with ...e6 and ...d5, then hits White's centre. Solid, but the c8 bishop can get stuck.",
  "caro-kann defense":"Black supports ...d5 with ...c6, keeping a sturdy structure and a free bishop.",
  "scandinavian defense":"Black challenges e4 immediately with ...d5. Simple ideas, but the queen often comes out early.",
  "pirc defense":"Black lets White build a big centre, then attacks it with pieces and ...c5 or ...e5.",
  "modern defense":"Black fianchettoes the bishop on g7 and strikes at the centre later.",
  "alekhine's defense":"Black provokes White's pawns forward with ...Nf6, hoping to attack the overextended centre.",
  "nimzowitsch defense":"Black attacks e4 with the b1 knight, an unorthodox setup.",
  "owen defense":"Black plays ...b6 and fianchettoes the bishop to control the long diagonal.",
  "queen's gambit":"White offers the c-pawn to win control of the centre. Black can't keep the pawn for long, so it isn't a true gambit.",
  "queen's gambit declined":"Black holds d5 with ...e6. Solid, with a slightly passive light-squared bishop.",
  "queen's gambit accepted":"Black takes the pawn and gives it back later to free the position.",
  "slav defense":"Black supports d5 with ...c6 and keeps the light-squared bishop free. Very solid.",
  "semi-slav defense":"Black combines ...c6 and ...e6. Sound, but it leads to sharp, heavily analysed play.",
  "king's indian defense":"Black lets White take the centre, then attacks it from the flanks and goes after White's king. Dynamic and double-edged.",
  "nimzo-indian defense":"Black pins the c3 knight with ...Bb4 to fight for e4. Flexible and respected at every level.",
  "bogo-indian defense":"Black checks with ...Bb4+ and may trade bishop for knight. An easy, solid setup.",
  "queen's indian defense":"Black fianchettoes the queen's bishop to control e4 with a solid structure.",
  "grünfeld defense":"Black allows a big pawn centre, then hits it with pieces and ...c5. Sharp and theory-heavy.",
  "benoni defense":"Black strikes with ...c5, gives up the centre and plays for the queenside and active pieces.",
  "old indian defense":"Black plays ...d6 and ...e5 for a sturdy but slightly passive centre.",
  "dutch defense":"Black plays ...f5 to control e4 and fight for the initiative, at the cost of some weakness around the king.",
  "benko gambit":"Black gives a pawn on the queenside in return for open files and long-term pressure.",
  "budapest gambit":"Black sacrifices a pawn with ...e5 for fast piece play.",
  "indian defense":"Black develops the knight to f6 first and decides on a pawn structure later.",
  "englund gambit":"Black sacrifices a pawn right after 1.d4 e5. Risky, and mostly effective against careless opponents.",
  "blackmar-diemer gambit":"White sacrifices a pawn after 1.d4 d5 2.e4 for quick development and attacking chances.",
  "london system":"White plays Bf4 and a compact pawn setup against almost anything. Easy to learn.",
  "colle system":"A compact setup with e3 and Nbd2, then e4 to break in the centre.",
  "trompowsky attack":"White plays Bg5 early to unbalance the game and avoid main-line theory.",
  "catalan opening":"White fianchettoes the bishop on g2 and presses on the long diagonal.",
  "english opening":"White controls d5 from the flank with c4. It can transpose into many other openings.",
  "zukertort opening":"White develops with Nf3 and keeps the pawn structure flexible.",
  "réti opening":"White hits the centre from the flanks with pieces and pawns instead of occupying it.",
  "king's indian attack":"White sets up with Nf3, g3, Bg2 and d3, then attacks on the kingside.",
  "bird opening":"White controls e5 with f4. It is a Dutch Defense with the colours reversed."
};
const normFam = f => String(f).toLowerCase().replace(/[’]/g,"'").replace(/defence/g,"defense").trim();
const fenKey = fen => fen.split(" ").slice(0,3).join(" ");
const lookupFen = fen => OPEN.get(fenKey(fen)) || null;
const esc = t => String(t).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pgnToks = pgn => pgn.split(/\s+/).map(t => t.replace(/^\d+\.+/, "")).filter(Boolean);

function gambitTitle(name){
  for(const p of name.split(/:\s*/)) if(/Gambit/i.test(p)) return p.replace(/\s+(Accepted|Declined)\b.*$/i,"").replace(/[,:\s]+$/,"").trim();
  return null;
}
const isReplyName = name => /\b(Accepted|Declined)\b/.test(name);
function buildSides(list){
  list.forEach(([eco, name, pgn]) => {
    const gt = gambitTitle(name);
    if(!gt || isReplyName(name)) return;
    const ply = pgnToks(pgn).length;
    if(GMIN[gt]===undefined || ply < GMIN[gt]){ GMIN[gt] = ply; GSIDE[gt] = ply%2 ? "White" : "Black"; }
  });
}
function classify(eco, name, toks){
  const parts = name.split(/:\s*/), family = parts[0].trim(), variation = parts.slice(1).join(": ");
  const m1 = toks[0] || "", m2 = toks[1] || "";
  let structure = "Flank opening";
  if(m1==="e4") structure = m2==="e5" ? "Open game" : "Semi-open game";
  else if(m1==="d4") structure = m2==="d5" ? "Closed game" : "Semi-closed or Indian system";
  const first = m1 ? "1." + m1 : "";
  const gt = gambitTitle(name);
  const sideOf = t => GSIDE[t] || (toks.length%2 ? "White" : "Black");
  let kind, side = "", tag, cls = "";
  if(gt && /counter[- ]?gambit/i.test(name)){ kind = "counter"; side = sideOf(gt); tag = side + " counter-gambit"; cls = "gam"; }
  else if(gt && isReplyName(name)){ kind = "reply"; side = sideOf(gt)==="White" ? "Black" : "White"; tag = "Reply to a gambit"; cls = "def"; }
  else if(gt === "Queen's Gambit"){ kind = "opening"; side = "White"; tag = "Opening"; }
  else if(gt){ kind = "gambit"; side = sideOf(gt); tag = side + " gambit"; cls = "gam"; }
  else if(/Defen[cs]e/i.test(name)){ kind = "defence"; side = "Black"; tag = first ? "Defence to " + first : "Defence"; cls = "def"; }
  else if(/\b(Attack|System|Setup|Formation)\b/i.test(family)){ kind = "system"; tag = "System"; }
  else { kind = "opening"; tag = "Opening"; }
  const fam = normFam(family), g = gt ? normFam(gt) : "";
  const blurb = (kind==="gambit" || kind==="counter") ? (BLURB[g] || BLURB[fam] || "") : (BLURB[fam] || (g && BLURB[g]) || "");
  return {eco, name, family, variation, structure, first, gt, kind, side, tag, cls, blurb};
}
function typeTip(o){
  if(o.kind==="gambit") return `A gambit: ${o.side} gives up material, usually a pawn, for faster development or the initiative.`;
  if(o.kind==="counter") return `A counter-gambit: ${o.side} answers by offering material back instead of defending passively.`;
  if(o.kind==="reply") return `How ${o.side} answers a gambit: take the material or decline it.`;
  if(o.kind==="defence") return `A defence: Black's way of answering ${o.first || "White's first move"}.`;
  if(o.kind==="system") return "A setup to aim for against many replies, rather than one fixed line.";
  return "A well-known line from the first few moves.";
}
function openChips(o){ return `<span class="ecochip">${o.eco}</span><span class="ecochip ${o.cls}">${esc(o.tag)}</span>`; }
function openLine(o, since){
  const vol = ECO_VOL[o.eco[0]];
  return `<span class="lbl">Opening:</span> ${esc(o.name)} ${openChips(o)}`+
    `<div class="tip">${esc(typeTip(o))}${o.blurb ? " " + esc(o.blurb) : ""}</div>`+
    `<div class="tip fine">${esc(o.structure)}${vol ? "; ECO " + o.eco[0] + " covers " + vol : ""}.${since ? " Reached on " + esc(since) + "." : ""}</div>`;
}
const prefFen = new Map(); // "e4 e5 Nf3" -> FEN, so shared opening prefixes are only replayed once
function fenFor(toks){
  let k = toks.length;
  while(k>0 && !prefFen.has(toks.slice(0,k).join(" "))) k--;
  const g = k>0 ? new Chess(prefFen.get(toks.slice(0,k).join(" "))) : new Chess();
  for(let i=k;i<toks.length;i++){
    if(!g.move(toks[i])) throw 0;
    prefFen.set(toks.slice(0,i+1).join(" "), g.fen());
  }
  return g.fen();
}
function addOpenings(list, done){
  buildSides(list);
  const items = list.map((x,idx) => [x[0], x[1], x[2], pgnToks(x[2]), idx]).sort((a,b) => a[3].length - b[3].length);
  let i = 0, fens = null;
  const step = () => {
    const t0 = performance.now();
    while(i < items.length && performance.now() - t0 < 5){
      const k = i++, [eco, name, pgn, toks, idx] = items[k];
      try{
        const fen = (fens && fens[k]) || fenFor(toks), o = classify(eco, name, toks);
        o.pgn = pgn; o.toks = toks; o.ply = toks.length; o.fen = fen; o.idx = idx;
        o.hay = (name + " " + eco + " " + o.tag + " " + pgn).toLowerCase();
        OPEN_LIST.push(o);
        const fk = fenKey(fen), cur = OPEN.get(fk);
        if(!cur || cur.idx > idx) OPEN.set(fk, o); // first line in the dataset wins, as before
      }catch(e){}
    }
    if(i < items.length) setTimeout(step, 0);
    else {
      prefFen.clear();
      OPEN_LIST.sort((a,b) => a.ply - b.ply || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      if(done) done();
    }
  };
  // replaying thousands of lines through chess.js happens in a background worker; if that is unavailable, step() does it itself
  brainCall("fens", {toks: items.map(x => x[3])}).then(f => { fens = Array.isArray(f) ? f : null; step(); });
}
const OPEN_CACHE = "chesscoach.openings.v1";
function readOpenCache(){
  try{
    const j = JSON.parse(localStorage.getItem(OPEN_CACHE));
    if(j && Date.now() - j.t < 30*864e5 && Array.isArray(j.l) && j.l.length > 1000) return j.l;
  }catch(e){}
  return null;
}
async function loadOpenings(){
  let list = readOpenCache() || [];
  if(!list.length){
    try{
      const parts = await Promise.all(["a","b","c","d","e"].map(x =>
        fetch("assets/openings/" + x + ".tsv").then(r => { if(!r.ok) throw 0; return r.text(); })));
      parts.forEach(t => t.split("\n").slice(1).forEach(l => { const c = l.split("\t"); if(c.length>=3 && c[2].trim()) list.push([c[0], c[1], c[2].trim()]); }));
      if(list.length > 1000){ try{ localStorage.setItem(OPEN_CACHE, JSON.stringify({t:Date.now(), l:list})); }catch(e){} }
    }catch(e){ list = []; }
  }
  const online = list.length > 0;
  if(!online) list = OPEN_FALLBACK;
  addOpenings(list, () => { OPEN_ONLINE = online; refreshOpenings(); });
}
let OPEN_ONLINE = false;
function refreshOpenings(){
  if(typeof tRender==="function" && !$("otrain").classList.contains("hide") && !tCur) tRender();
  if(pg) updatePlayOpen();
  if(moves.length){ computeBook(); drawOpenList(); updateReviewOpen(); }
  renderOpenList();
}
function updatePlayOpen(){
  const el = $("popen");
  if(!pg || !OPEN.size){ el.classList.add("hide"); return; }
  const g = new Chess(); let last = null;
  pg.history().slice(0, 40).forEach((san, i) => { g.move(san); const o = lookupFen(g.fen()); if(o) last = {o, ply:i+1}; });
  if(!last){ el.classList.add("hide"); return; }
  setHTML(el, openLine(last.o, ""));
  el.classList.remove("hide");
  if(lastOpenName !== last.o.name){ lastOpenName = last.o.name; el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); }
}
function computeBook(){ bookAt = pos.map(p => lookupFen(p.fen)); }
const plyLabel = j => Math.ceil(j/2) + (j%2 ? ". " : "... ") + moves[j-1].san;
function lastBookIdx(){ for(let j=bookAt.length-1; j>0; j--) if(bookAt[j]) return j; return 0; }
function updateReviewOpen(){
  const el = $("ropen");
  let j = sel;
  while(j>0 && !bookAt[j]) j--;
  if(j<=0 || !bookAt[j]){ el.classList.add("hide"); return; }
  setHTML(el, openLine(bookAt[j], plyLabel(j)));
  el.classList.remove("hide");
}
function drawOpenList(){
  const el = $("openlist"), items = []; let prev = "";
  for(let j=1; j<bookAt.length; j++){
    if(bookAt[j] && bookAt[j].name!==prev){ items.push(`<button class="chip obtn" data-j="${j}">${esc(plyLabel(j))}: ${esc(bookAt[j].name)}</button>`); prev = bookAt[j].name; }
  }
  const lb = lastBookIdx();
  if(lb>0 && lb<moves.length) items.push(`<button class="chip obtn" data-j="${lb+1}" title="First move after the last named opening position">Past the named lines: ${esc(plyLabel(lb+1))}</button>`);
  el.innerHTML = items.join("");
  el.classList.toggle("hide", !items.length);
}
document.addEventListener("click", e => { const b = e.target.closest(".obtn"); if(b) pick(+b.dataset.j); });

/* ---- Openings explorer tab ---- */
let oShown = [], oSel = null, oIdx = 0;
function renderOpenList(){
  const box = $("olist"), cnt = $("ocount");
  if(!OPEN_LIST.length){ cnt.textContent = "Loading openings…"; box.innerHTML = ""; return; }
  const q = $("oq").value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const kind = $("okind").value, side = $("oside").value, first = $("ofirst").value;
  const res = OPEN_LIST.filter(o => {
    if(kind!=="all" && !(kind==="gambit" ? (o.kind==="gambit" || o.kind==="counter") : o.kind===kind)) return false;
    if(side!=="any" && o.side!==side) return false;
    if(first!=="any"){ const m = o.toks[0]; if(first==="other" ? ["e4","d4","c4","Nf3"].includes(m) : m!==first) return false; }
    if(q.length && !q.every(t => o.hay.includes(t))) return false;
    return true;
  });
  oShown = res.slice(0, 80);
  cnt.textContent = (res.length ? `${res.length} found` + (res.length>80 ? ", showing the 80 shortest lines. Search to narrow down." : ".") : "No openings match. Try fewer words or a different filter.")
    + (OPEN_ONLINE ? "" : " (Offline: showing a short built-in list.)");
  box.innerHTML = oShown.map((o,i) => `<button data-o="${i}"><span>${esc(o.name)}</span><small>${o.eco}, ${esc(o.tag)}</small></button>`).join("");
}
function openDetail(o){ oSel = o; oIdx = o.toks.length; $("orepcolor").value = (o.side==="Black" || (o.side!=="White" && o.toks.length%2===0 && o.kind==="defence")) ? "b" : "w"; $("orepnote").textContent = ""; $("odetail").classList.remove("hide"); drawOpenDetail(); $("odetail").scrollIntoView({block:"nearest", behavior:"smooth"}); }
function drawOpenDetail(){
  if(!oSel) return;
  const g = new Chess(); let mv = null;
  oSel.toks.slice(0, oIdx).forEach(t => { mv = g.move(t); });
  drawBoard($("obboard"), g.fen(), [], mv ? [mv.from, mv.to] : [], {});
  $("olines").innerHTML = oSel.toks.map((t,i) => (i%2===0 ? (i/2+1) + ". " : "") + (i+1===oIdx ? `<b>${esc(t)}</b>` : esc(t))).join(" ");
  $("otext").innerHTML = openLine(oSel, "");
  $("ostart").disabled = $("oprev").disabled = oIdx<=0;
  $("onext").disabled = $("oend").disabled = oIdx>=oSel.toks.length;
  repSyncAdd();
}
const oGo = n => { if(oSel){ oIdx = Math.max(0, Math.min(oSel.toks.length, n)); drawOpenDetail(); } };
$("olist").onclick = e => { const b = e.target.closest("button[data-o]"); if(b) openDetail(oShown[+b.dataset.o]); };
$("ostart").onclick = () => oGo(0); $("oprev").onclick = () => oGo(oIdx-1);
$("onext").onclick = () => oGo(oIdx+1); $("oend").onclick = () => oGo(1e9);
let oTimer = 0;
$("oq").oninput = () => { clearTimeout(oTimer); oTimer = setTimeout(renderOpenList, 150); };
["okind","oside","ofirst"].forEach(id => $(id).onchange = renderOpenList);

