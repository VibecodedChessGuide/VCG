/* ================= PLAY WITH FRIENDS (face to face, no engine, no hints) =================
   The device lies flat between two players. White sits at the bottom, Black at the top.
   Each player has their own controls facing them; Black's side is rotated 180 degrees.
   The engine is never used here. It only comes in when someone taps Review game. */
// Pieces turn to face whoever is to move (the board itself never flips). Meant for a phone lying flat
// between two players, so it defaults on for touch devices and off for PC. The button below changes it.
let fRot = (() => {
  try{ const v = localStorage.getItem("fRot"); if(v==="1"||v==="0") return v==="1"; }catch(e){}
  return !!(window.matchMedia && matchMedia("(pointer:coarse)").matches);
})();
const fRotated = () => fRot && fg && fg.turn()==="b";
let fg = null, fSel = null, fLast = null, fOver = false, fDrag = null, fHide = null, fAnim = null;
let fPromo = null, fResult = null, fMsg = "", fOffer = null, fArmed = null, fArmT = null;
const fNames = () => ({w: $("fnw").value.trim() || "White", b: $("fnb").value.trim() || "Black"});
const fOpp = c => c==="w" ? "b" : "w";
function fDisarm(){ clearTimeout(fArmT); fArmed = null; }
function fArm(key){ fDisarm(); fArmed = key; fArmT = setTimeout(() => { fArmed = null; fStrips(); }, 3000); fStrips(); }

function fFace(){
  if(!fRotated()) return;
  const urls = new Set(["w","b"].flatMap(c => ["p","n","b","r","q","k"].map(t => PIECE_URL(c, t))));
  fBoard.querySelectorAll("image").forEach(im => {
    if(!urls.has(im.getAttribute("href"))) return;
    const x = +im.getAttribute("x"), y = +im.getAttribute("y");
    im.setAttribute("transform", `rotate(180 ${x+50} ${y+50})`);
  });
}
function fRotPaint(){
  const b = $("frot"); if(!b) return;
  b.setAttribute("aria-pressed", fRot ? "true" : "false");
  b.setAttribute("aria-checked", fRot ? "true" : "false");
  $("friendsPanel").classList.toggle("norot", !fRot); // off: Black's name and buttons read upright too
}
function fRender(boardOnly){
  if(!fg) return;
  const dots = (fSel && !fOver && !fPromo) ? fg.moves({square:fSel, verbose:true}) : [];
  drawBoard(fBoard, fg.fen(), [], fLast ? [fLast.from, fLast.to] : [], {flip:false, sel:fSel, dots, hideSq:fHide, anim:fAnim});
  fAnim = null; fFace(); fRotPaint();
  if(!boardOnly) fStrips();
}
const fEsc = s => String(s).replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const F_GLYPH = {p:"\u265F", n:"\u265E", b:"\u265D", r:"\u265C", q:"\u265B"};
const F_VAL = {p:1, n:3, b:3, r:5, q:9};
const F_ICON = {
  offer: '<span aria-hidden="true">\u00bd</span>',
  resign: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4.5h12l-3 4 3 4H6"/></svg>',
  review: '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" style="width:1rem;height:1rem;vertical-align:-.18rem;margin-right:.35rem;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>'
};
const F_IMG_FALLBACK = t => `onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'gl',textContent:'${F_GLYPH[t]}\uFE0E'}))"`;
function fBtn(act, label, cls){
  return `<button type="button" data-act="${act}"${cls ? ` class="${cls}"` : ""}>${label}</button>`;
}
function fIconBtn(act, label){
  if(fArmed===act) return `<button type="button" class="ic arm" data-act="${act}" aria-label="${label}: tap again to confirm">${label}?</button>`;
  return `<button type="button" class="ic" data-act="${act}" aria-label="${label}" title="${label}">${F_ICON[act]}</button>`;
}
function fPieceBtn(c, t, name){
  return `<button type="button" class="pc" data-act="p:${t}" aria-label="${name}"><img alt="" src="${PIECE_URL(c, t)}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${F_GLYPH[t]}\uFE0E'}))"></button>`;
}
function fSizeName(inp){
  const n = Math.max(inp.value.length, (inp.placeholder||"").length, 3);
  inp.style.width = (n + .6) + "ch";
}
function fAvatars(){
  ["w","b"].forEach(c => {
    const box = $("fa-" + c), im = box.querySelector("img"), u = PIECE_URL(c, "k");
    if(im.dataset.u === u) return;
    im.dataset.u = u; box.classList.remove("noimg");
    im.onerror = () => box.classList.add("noimg");
    im.src = u;
  });
}
/* captured pieces + material lead, read from the position so undone or promoted games stay right */
function fMaterial(){
  const start = {p:8, n:2, b:2, r:2, q:1}, have = {w:{p:0,n:0,b:0,r:0,q:0}, b:{p:0,n:0,b:0,r:0,q:0}};
  fg.fen().split(" ")[0].split("").forEach(ch => {
    const t = ch.toLowerCase(); if(!(t in F_VAL)) return;
    have[ch===t ? "b" : "w"][t]++;
  });
  const out = {}; let score = {w:0, b:0};
  ["w","b"].forEach(c => {
    score[c] = Object.keys(F_VAL).reduce((a,t) => a + F_VAL[t]*have[c][t], 0);
    out[c] = {};   // what color c has taken, i.e. the opponent's missing pieces
  });
  ["w","b"].forEach(c => { const o = fOpp(c); Object.keys(F_VAL).forEach(t => { out[c][t] = Math.max(0, start[t] - have[o][t]); }); });
  return {taken: out, lead: {w: score.w - score.b, b: score.b - score.w}};
}
function fCapHtml(c, mat){
  const o = fOpp(c);
  let h = ["p","n","b","r","q"].map(t => {
    const k = mat.taken[c][t]; if(!k) return "";
    return `<span class="g">${Array.from({length:k}, () => `<img alt="" src="${PIECE_URL(o, t)}" ${F_IMG_FALLBACK(t)}>`).join("")}</span>`;
  }).join("");
  if(mat.lead[c] > 0) h += `<span class="lead">+${mat.lead[c]}</span>`;
  return h;
}
/* clocks count up: the time each player has used */
let fClock = {w:0, b:0, last:0};
const fFmt = ms => { const t = Math.floor(ms/1000), h = Math.floor(t/3600), m = Math.floor(t%3600/60), s = t%60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`; };
function fClockPaint(){ ["w","b"].forEach(c => { const el = $("fk-" + c); if(el) el.textContent = fFmt(fClock[c]); }); }
function fClockTick(){
  const now = performance.now(), dt = Math.min(1000, now - fClock.last); fClock.last = now;
  if(!fg || fOver || $("friendsPanel").classList.contains("hide")) return;
  fClock[fg.turn()] += dt; fClockPaint();
}
setInterval(fClockTick, 250);
function fStrips(){
  if(!fg) return;
  fAvatars(); fClockPaint();
  const n = fNames(), mover = fOver ? null : fg.turn(), mat = fMaterial();
  const winner = fOver ? (fResult==="1-0" ? "w" : fResult==="0-1" ? "b" : null) : null;
  ["w","b"].forEach(c => {
    const el = $("fs-" + c), opp = n[fOpp(c)];
    let say = false, msg = "", btns = "";
    if(fOver){
      say = true;
      const i = fMsg.indexOf(". ");
      const head = i<0 ? fMsg : fMsg.slice(0, i+1), rest = i<0 ? "" : fMsg.slice(i+2);
      if(winner===c) msg = `<b>You win</b><span>${fEsc(head.replace(/\.$/, ""))}</span>`;
      else msg = `<b>${fEsc(head)}</b>` + (rest ? `<span>${fEsc(rest)}</span>` : "");
      btns = (fg.history().length ? fBtn("review", F_ICON.review + "Review", "primary") : "") + fBtn("new", "New");
    } else if(fPromo && fg.turn()===c){
      say = true; msg = `<b>Promote to</b>`;
      btns = fPieceBtn(c,"q","Queen") + fPieceBtn(c,"r","Rook") + fPieceBtn(c,"b","Bishop") + fPieceBtn(c,"n","Knight") +
             `<button type="button" class="pc x" data-act="p:x" aria-label="Cancel">\u2715</button>`;
    } else if(fOffer===fOpp(c)){
      say = true; msg = `<b>Draw?</b><span>${fEsc(opp)} offers</span>`;
      btns = fBtn("accept", "Accept", "primary") + fBtn("decline", "Decline");
    } else if(fOffer===c){
      say = true; msg = `<b>Draw offered</b>`;
      btns = fBtn("cancel", "Cancel");
    } else {
      btns = fIconBtn("offer", "Offer draw") + fIconBtn("resign", "Resign");
    }
    el.classList.toggle("turn", mover===c);
    el.classList.toggle("say", say);
    el.classList.toggle("over", fOver);
    $("fa-" + c).classList.toggle("crown", winner===c);
    $("fc-" + c).innerHTML = fCapHtml(c, mat) + (mover===c && fg.in_check() ? `<span class="chk">Check</span>` : "");
    $("fm-" + c).innerHTML = msg;
    $("fb-" + c).innerHTML = btns;
  });
}
function fStart(){
  fDisarm();
  fg = new Chess(); fSel = null; fLast = null; fOver = false; fHide = null; fAnim = null;
  fPromo = null; fResult = null; fMsg = ""; fOffer = null; fDrag = null; rc = null;
  fClock = {w:0, b:0, last:performance.now()};
  snd("start"); fRender();
}
function fEnd(res, msg, kind){
  fDisarm();
  fOver = true; fResult = res; fSel = null; fPromo = null; fOffer = null; fMsg = msg;
  try{ const n = fNames(); fg.header("Event", "Friendly game", "White", n.w, "Black", n.b, "Result", res); }catch(e){}
  fRender();
  setTimeout(() => snd(kind), 350);
}
function fCheckEnd(){
  const n = fNames();
  if(fg.in_checkmate()){ const w = fOpp(fg.turn()); fEnd(w==="w" ? "1-0" : "0-1", "Checkmate. " + n[w] + " wins.", "end"); return true; }
  if(fg.game_over()){
    const why = fg.in_stalemate() ? "Stalemate." : fg.insufficient_material() ? "Draw by insufficient material." : fg.in_threefold_repetition() ? "Draw by repetition." : "Draw.";
    fEnd("1/2-1/2", why + " It's a draw.", "draw"); return true;
  }
  return false;
}
function fPlay(from, to, promo, animate){
  const m = fg.move({from, to, promotion: promo || "q"});
  if(!m) return;
  fLast = m; fSel = null; fPromo = null; fOffer = null; fDisarm();
  fAnim = animate ? {from:m.from, to:m.to} : null;
  snd(sndKind(m, true));
  if(fCheckEnd()) return;
  fRender();
}
function fTry(from, to, animate){
  const mv = fg.moves({square:from, verbose:true}).filter(m => m.to===to);
  if(!mv.length) return;
  if(mv[0].promotion){ fPromo = {from, to, animate}; fSel = null; fRender(); return; }
  fPlay(from, to, null, animate);
}

/* board input: tap-tap or drag, for whoever is to move */
const fBoard = $("fboard");
function fEndDrag(){
  const gh = fBoard.querySelector("#fghost"); if(gh) gh.remove();
  fDrag = null; rc = null; fHide = null;
}
function fGhost(gh, pt, color){
  gh.setAttribute("x", pt.x-65); gh.setAttribute("y", pt.y-65);
  if(fRotated()) gh.setAttribute("transform", `rotate(180 ${pt.x} ${pt.y})`);
}
fBoard.addEventListener("pointerdown", e => {
  if(e.button!==0 || !fg || fOver || fPromo) return;
  const s = sqAt(fBoard, e, false); if(!s) return;
  e.preventDefault();
  if(fSel && fSel!==s && fg.moves({square:fSel, verbose:true}).some(m => m.to===s)){ fTry(fSel, s, true); return; }
  const p = fg.get(s);
  if(p && p.color===fg.turn()){
    fDrag = {from:s, wasSel:fSel===s, color:p.color};
    rc = {svg:fBoard, r:fBoard.getBoundingClientRect()};
    fSel = s; fHide = s; fRender(true);
    const gh = document.createElementNS(NS, "image");
    gh.setAttribute("id", "fghost"); gh.setAttribute("href", PIECE_URL(p.color, p.type));
    gh.setAttribute("width", 130); gh.setAttribute("height", 130);
    gh.style.pointerEvents = "none";
    fGhost(gh, svgPt(fBoard, e), p.color);
    fBoard.appendChild(gh);
    try{ fBoard.setPointerCapture(e.pointerId); }catch(err){}
  } else { fSel = null; fRender(true); }
});
fBoard.addEventListener("pointermove", e => {
  if(!fDrag) return;
  const gh = fBoard.querySelector("#fghost");
  if(gh) fGhost(gh, svgPt(fBoard, e), fDrag.color);
});
function fDropEnd(e, cancel){
  if(!fDrag) return;
  const d = fDrag, t = cancel ? null : sqAt(fBoard, e, false);
  fEndDrag();
  const legal = t && t!==d.from && fg.moves({square:d.from, verbose:true}).some(m => m.to===t);
  if(legal){ fTry(d.from, t, false); return; }
  if(d.wasSel && t===d.from) fSel = null;
  fRender(true);
}
fBoard.addEventListener("pointerup", e => { if(e.button===0) fDropEnd(e, false); });
fBoard.addEventListener("pointercancel", e => fDropEnd(e, true));

/* each player's buttons */
function fAct(c, act){
  if(!fg) return;
  const n = fNames();
  if(act.startsWith("p:")){
    if(!fPromo) return;
    const pr = fPromo, k = act.slice(2);
    if(k==="x"){ fPromo = null; fSel = null; fRender(); return; }
    fPlay(pr.from, pr.to, k, pr.animate); return;
  }
  if(act==="review"){
    if(!fOver) return;
    $("pgn").value = fg.pgn();
    $("side").value = "wb";
    showTab("review"); run(); return;
  }
  if(act==="new"){ fStart(); return; }
  if(fOver) return;
  if(act==="resign"){
    if(fArmed!==c+act){ fArm(c+act); return; }
    fEnd(c==="w" ? "0-1" : "1-0", n[c] + " resigned. " + n[fOpp(c)] + " wins.", "end"); return;
  }
  if(act==="offer"){ fDisarm(); fOffer = c; fStrips(); return; }
  if(act==="cancel" || act==="decline"){ fOffer = null; fStrips(); return; }
  if(act==="accept"){ fEnd("1/2-1/2", "Draw agreed.", "draw"); return; }
}
$("frot").addEventListener("click", () => {
  fRot = !fRot;
  try{ localStorage.setItem("fRot", fRot ? "1" : "0"); }catch(e){}
  fRotPaint(); if(fg) fRender(true);
});
fRotPaint();
["w","b"].forEach(c => {
  $("fb-" + c).addEventListener("click", e => {
    const b = e.target.closest("button[data-act]"); if(b) fAct(c, b.dataset.act);
  });
  $("fn" + c).addEventListener("input", e => { fSizeName(e.target); if(fg) fStrips(); });
  fSizeName($("fn" + c));
});

