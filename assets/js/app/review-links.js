/* ================= Chess.com link loader + share links ================= */
// Chess.com's callback endpoint has no CORS headers, so it goes through public CORS proxies (tried in order).
// api.chess.com/pub does send CORS headers and is called directly. No login or API key is needed anywhere.
const CORS_PROXIES = [
  u => "https://corsproxy.io/?url=" + encodeURIComponent(u),
  u => "https://proxy.corsfix.com/?" + encodeURIComponent(u),
  u => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  u => "https://api.codetabs.com/v1/proxy/?quest=" + encodeURIComponent(u),
  u => "https://api.cors.lol/?url=" + encodeURIComponent(u)
];
async function fetchJson(url, viaProxy){
  const tries = viaProxy ? CORS_PROXIES.map(p => p(url)) : [url];
  let last = null; const errs = [];
  for(const u of tries){
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
    try{
      const r = await fetch(u, {signal:ctl.signal});
      if(!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    }catch(e){ last = e; errs.push(new URL(u).hostname + ": " + (e.name==="AbortError" ? "timeout" : e.message)); }
    finally{ clearTimeout(t); }
  }
  console.warn("chess.com fetch failed:", errs);
  const err = new Error(errs.join("; ") || "request failed"); err.detail = errs; throw err;
}
function parseChessLink(s){
  s = String(s).trim();
  const m = s.match(/\/(live|daily)\/(?:game\/)?(\d{5,})/i);
  if(m) return {type:m[1].toLowerCase(), id:m[2]};
  if(/^\d{5,}$/.test(s)) return {type:"live", id:s};
  return null;
}
const PGN_KEEP = ["Event","Site","Date","White","Black","Result","WhiteElo","BlackElo","FEN","SetUp"];
// Rebuild a PGN with only the useful headers and no clock comments, so it stays short in a link.
function compactPgn(text){
  try{
    const g = new Chess();
    if(!g.load_pgn(text, {sloppy:true})) return text.trim();
    const h = g.header(), out = new Chess(h.FEN || undefined);
    for(const san of g.history()) if(!out.move(san, {sloppy:true})) return text.trim();
    PGN_KEEP.forEach(k => { if(h[k]) out.header(k, h[k]); });
    return out.pgn().trim();
  }catch(e){ return String(text).trim(); }
}
// Fallback: Chess.com's own compact move encoding (2 characters per move). Checked move by move against chess.js.
const CC_ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,*+=:;-<>";
function decodeMoveList(ml, h){
  try{
    const g = new Chess(), sq = i => "abcdefgh"[i%8] + (Math.floor(i/8)+1);
    for(let i=0; i+1<ml.length; i+=2){
      const a = CC_ALPHA.indexOf(ml[i]); let b = CC_ALPHA.indexOf(ml[i+1]), promo;
      if(a<0 || b<0) return null;
      if(b>63){ promo = "qnrbkp"[Math.floor((b-64)/3)]; b = a + (a<16 ? -8 : 8) + ((b-1)%3 - 1); }
      if(b<0 || b>63 || !g.move({from:sq(a), to:sq(b), promotion:promo})) return null;
    }
    PGN_KEEP.forEach(k => { if(h[k]) g.header(k, h[k]); });
    return g.pgn();
  }catch(e){ return null; }
}
// With a username the game is found in the official monthly archives (direct, CORS-friendly, no proxy).
async function findByUsername(user, id, st){
  const base = "https://api.chess.com/pub/player/" + encodeURIComponent(user.toLowerCase()) + "/games";
  const list = ((await fetchJson(base + "/archives", false)).archives || []).slice().reverse().slice(0, 48);
  for(let i=0; i<list.length; i++){
    st.textContent = "Searching " + user + "'s games… month " + (i+1) + " of " + list.length;
    const arch = await fetchJson(list[i], false);
    const f = (arch.games || []).find(x => String(x.url || "").endsWith("/" + id));
    if(f && f.pgn) return f.pgn;
  }
  return null;
}
let chessLoading = false;
// resolves true when the PGN box was filled
async function loadChessCom(){
  if(chessLoading) return false;
  const st = $("status"), btn = $("chessload"), ref = parseChessLink($("chesslink").value);
  if(!ref){ st.textContent = "That doesn't look like a chess.com game link. Paste a link like chess.com/game/live/123456789."; return false; }
  const goWas = $("go").disabled;
  chessLoading = true; btn.disabled = true; $("go").disabled = true;
  st.textContent = "Fetching the game from chess.com…";
  try{
    const user = $("chessuser").value.trim();
    let pgn = null, h = {}, game = {};
    if(user){
      try{ pgn = await findByUsername(user, ref.id, st); }catch(e){ console.warn("username lookup failed", e); }
      if(!pgn) st.textContent = "Not found under " + user + ". Trying chess.com directly…";
    }
    if(!pgn){
    const data = await fetchJson("https://www.chess.com/callback/" + ref.type + "/game/" + ref.id, true);
    game = (data && data.game) || data || {}; h = game.pgnHeaders || {};
    if(!h.White || !h.Black) throw new Error("no game data");
    const parts = String(h.Date || "").split("."), y = +parts[0], m = +parts[1];
    if(y && m){
      // the monthly archive is filed by end time, so a game that crossed midnight can sit in the next month
      for(const [yy, mm] of [[y, m], m===12 ? [y+1, 1] : [y, m+1]]){
        const url = "https://api.chess.com/pub/player/" + encodeURIComponent(String(h.White).toLowerCase()) + "/games/" + yy + "/" + String(mm).padStart(2,"0");
        try{
          let arch;
          try{ arch = await fetchJson(url, false); }catch(e){ arch = await fetchJson(url, true); }
          const f = (arch.games || []).find(x => String(x.url || "").endsWith("/" + ref.id));
          if(f && f.pgn){ pgn = f.pgn; break; }
        }catch(e){}
      }
    }
    if(!pgn && game.moveList) pgn = decodeMoveList(game.moveList, h);
    }
    if(!pgn) throw new Error("no pgn");
    pgn = compactPgn(pgn);
    $("pgn").value = pgn;
    const w = (pgn.match(/\[White "([^"]*)"\]/) || [])[1] || "?", b = (pgn.match(/\[Black "([^"]*)"\]/) || [])[1] || "?";
    if(user){ const u = user.toLowerCase(); if(w.toLowerCase()===u) $("side").value = "w"; else if(b.toLowerCase()===u) $("side").value = "b"; }
    st.textContent = "Loaded " + w + " vs " + b + " from chess.com. Tap Analyze game.";
    return true;
  }catch(e){
    const why = e && e.detail && e.detail.length ? " (" + e.detail.join("; ") + ")" : "";
    st.textContent = "Couldn't load that game." + why + " Chess.com often blocks proxies. Enter your chess.com username in the field below the link, or paste the PGN (chess.com: Share, then PGN).";
    if(!$("chessuser").value.trim()) $("chessuser").focus();
    return false;
  }finally{
    chessLoading = false; btn.disabled = false; $("go").disabled = goWas;
  }
}
$("chessload").onclick = loadChessCom;
$("chesslink").addEventListener("keydown", e => { if(e.key==="Enter"){ e.preventDefault(); loadChessCom(); } });

function b64url(bytes){
  let s = "";
  for(let i=0; i<bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function unb64url(str){
  str = str.replace(/-/g,"+").replace(/_/g,"/");
  while(str.length % 4) str += "=";
  const bin = atob(str), out = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Share links keep the PGN, reviewed side and analysis depth in one deflated base64url payload.
async function packShare(pgn, side, depth){
  if(typeof CompressionStream === "undefined") return null;
  try{
    const data = new TextEncoder().encode(JSON.stringify({p:pgn, s:side, d:depth}));
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
    const buf = await new Response(stream).arrayBuffer();
    return b64url(new Uint8Array(buf));
  }catch(e){ return null; }
}
async function unpackShare(z){
  if(typeof DecompressionStream === "undefined") return null;
  try{
    const stream = new Blob([unb64url(z)]).stream().pipeThrough(new DecompressionStream("deflate"));
    return JSON.parse(await new Response(stream).text());
  }catch(e){ return null; }
}
async function shareUrl(){
  const text = $("pgn").value.trim();
  if(!text) return null;
  const u = new URL(location.href);
  u.search = ""; u.hash = "";
  const pgn = compactPgn(text), side = $("side").value, depth = $("depth").value;
  const plain = new URL(u);
  plain.searchParams.set("pgn", pgn);
  plain.searchParams.set("side", side);
  plain.searchParams.set("depth", depth);
  const z = await packShare(pgn, side, depth);
  if(z){
    const packed = new URL(u);
    packed.searchParams.set("z", z);
    if(packed.href.length < plain.href.length) return packed.href;
  }
  return plain.href;
}
$("sharelink").onclick = async () => {
  const btn = $("sharelink"), label = "Share analysis link";
  let msg = "", url = null;
  btn.disabled = true; btn.textContent = "Preparing link…";
  try{ url = await shareUrl(); }finally{ btn.disabled = false; }
  if(!url) msg = "Analyze a game first";
  else if(navigator.share && matchMedia("(pointer:coarse)").matches){
    try{ await navigator.share({title:"Chess analysis", url}); msg = "Shared"; }
    catch(e){
      if(e && e.name==="AbortError"){ btn.textContent = label; return; }
      try{ await copyText(url); msg = "Link copied"; }catch(e2){ msg = "Share failed - try again"; }
    }
  } else {
    try{ await copyText(url); msg = "Link copied - send it to anyone"; }
    catch(e){ msg = "Copy failed - try again"; }
  }
  btn.textContent = msg;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => btn.textContent = label, 2500);
};

