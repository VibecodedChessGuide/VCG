/* ================= Look: board + pieces ================= */
$("boardsel").innerHTML = Object.keys(BOARDS).map(k => `<option value="${k}">${BOARDS[k].name} board</option>`).join("");
$("piecesel").innerHTML = Object.keys(PIECESETS).map(k => `<option value="${k}">${PIECESETS[k].name} pieces</option>`).join("");
renderBots();
$("ebots").onclick = e => { const r = e.target.closest(".botrow"); if(r) selectBot(r.dataset.bot); };
$("boardsel").value = boardId; $("piecesel").value = pieceId; $("plevel").value = BOT().level;
function preloadPieces(){
  for(const c of "wb") for(const t of "pnbrqk"){ const u = PIECE_URL(c,t), im = new Image(); im.onerror = () => imgFailUrl(u); im.src = u; }
}
function redrawAll(){
  if(pg) renderPlay(); else drawBoard($("pboard"), new Chess().fen(), [], [], {});
  if(moves.length) show();
  if(typeof oSel!=="undefined" && oSel && !$("odetail").classList.contains("hide")) drawOpenDetail();
}
$("boardsel").onchange = () => { boardId = $("boardsel").value; redrawAll(); };
$("piecesel").onchange = () => { pieceId = $("piecesel").value; preloadPieces(); redrawAll(); };
$("strict").onchange = () => {
  if(!moves.length) return;
  review = moves.map((_,i) => judge(i));
  drawMoves(); drawTally(); drawSummary(); show();
};


