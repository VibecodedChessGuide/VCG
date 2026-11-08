/* ================= Board drawing ================= */
function sqCtr(s, flip){
  const f = s.charCodeAt(0)-97, r = 8-parseInt(s[1],10);
  return {x:(flip?7-f:f)*100+50, y:(flip?7-r:r)*100+50};
}

// chess.com style arrows: one solid shape, L-shaped for knight moves
function arrowSVG(p, q, color, opt){
  opt = opt||{};
  const thin = !!opt.thin;
  const hw = thin?3.5:9, hh = thin?14:25, hl = thin?22:36, op = opt.op||.8;
  const adx = Math.abs(q.x-p.x)/100, ady = Math.abs(q.y-p.y)/100;
  const knight = (adx===1&&ady===2)||(adx===2&&ady===1);
  const add = (a,b,k) => ({x:a.x+b.x*k, y:a.y+b.y*k});
  const unit = (a,b) => { const l = Math.hypot(b.x-a.x,b.y-a.y)||1; return {x:(b.x-a.x)/l, y:(b.y-a.y)/l}; };
  const nrm = u => ({x:-u.y, y:u.x});
  let C = null;
  if(knight) C = adx>ady ? {x:q.x,y:p.y} : {x:p.x,y:q.y};
  const u1 = unit(p, knight?C:q), u2 = knight ? unit(C,q) : u1;
  const S = add(p, u1, thin?14:16), B = add(q, u2, -hl);
  const n1 = nrm(u1), n2 = nrm(u2);
  const pt = a => a.x.toFixed(1)+","+a.y.toFixed(1);
  if(opt.dash || thin){
    const line = knight ? [S,C,B] : [S,B];
    return `<g opacity="${op}"><polyline points="${line.map(pt).join(" ")}" fill="none" stroke="${color}" stroke-width="${hw*2}" stroke-linejoin="round"${opt.dash?' stroke-dasharray="14 10"':""}/>`+
      `<polygon points="${pt(q)} ${pt(add(B,n2,hh))} ${pt(add(B,n2,-hh))}" fill="${color}"/></g>`;
  }
  let pts;
  if(knight){
    const cl = add(add(C,n1,hw),n2,hw), cr = add(add(C,n1,-hw),n2,-hw);
    pts = [add(S,n1,hw), cl, add(B,n2,hw), add(B,n2,hh), q, add(B,n2,-hh), add(B,n2,-hw), cr, add(S,n1,-hw)];
  } else {
    pts = [add(S,n1,hw), add(B,n1,hw), add(B,n1,hh), q, add(B,n1,-hh), add(B,n1,-hw), add(S,n1,-hw)];
  }
  return `<polygon opacity="${op}" points="${pts.map(pt).join(" ")}" fill="${color}"/>`;
}

function paintOverlay(svg, flip){
  const el = svg.querySelector("g.ov"); if(!el) return;
  const mk = marks[svg.id] || {ar:[],pv:null};
  let s = "";
  if(svg.id==="pboard" && hoverSq){
    const p = sqCtr(hoverSq, flip);
    s += `<rect x="${p.x-47}" y="${p.y-47}" width="94" height="94" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="6"/>`;
  }
  mk.ar.forEach(x => { s += arrowSVG(sqCtr(x.a,flip), sqCtr(x.b,flip), "var(--arO)", {op:.85}); });
  if(mk.pv) s += arrowSVG(sqCtr(mk.pv.a,flip), sqCtr(mk.pv.b,flip), "var(--arO)", {op:.6});
  el.innerHTML = s;
}

function drawBoard(svg, fen, arrows, hl, o={}){
  const flip = !!o.flip, g = new Chess(fen);
  const cell = (f,r) => ({x:(flip?7-f:f)*100, y:(flip?7-r:r)*100});
  const ctr = s => sqCtr(s, flip);
  const mk = marks[svg.id] || {sq:[],ar:[]};
  const gid = "chk-" + svg.id;
  let s = `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="rgb(255,0,0)"/><stop offset=".25" stop-color="rgb(231,0,0)"/><stop offset=".89" stop-color="rgb(169,0,0)" stop-opacity="0"/></radialGradient>`+
    `<radialGradient id="${gid}o"><stop offset="0" stop-color="rgb(255,150,0)"/><stop offset=".25" stop-color="rgb(255,140,0)"/><stop offset=".89" stop-color="rgb(230,110,0)" stop-opacity="0"/></radialGradient>`+
    `<radialGradient id="${gid}y"><stop offset="0" stop-color="rgb(255,230,0)"/><stop offset=".25" stop-color="rgb(250,215,0)"/><stop offset=".89" stop-color="rgb(220,180,0)" stop-opacity="0"/></radialGradient>`+
    `<radialGradient id="${gid}p"><stop offset="0" stop-color="rgb(190,110,255)"/><stop offset=".25" stop-color="rgb(165,80,240)"/><stop offset=".89" stop-color="rgb(125,45,205)" stop-opacity="0"/></radialGradient></defs>`;
  s += `<rect width="800" height="800" fill="${BOARD().l}"/><path d="${DARK_PATH}" fill="${BOARD().d}"/>`;
  s += `<image href="${BOARD().url}" x="0" y="0" width="800" height="800" preserveAspectRatio="none"${flip?' transform="rotate(180 400 400)"':""}/>`;
  const sqRect = (sq, fill) => { const p = ctr(sq); return `<rect x="${p.x-50}" y="${p.y-50}" width="100" height="100" fill="${fill}"/>`; };
  (hl||[]).forEach(h => { s += sqRect(h, "var(--hl)"); });
  if(o.sel) s += sqRect(o.sel, "var(--hl)");
  mk.sq.forEach(q => { s += sqRect(q, "rgba(235,97,80,.8)"); });

  // coordinates inside the corner squares, like chess.com
  for(let i=0;i<8;i++){
    const f = flip ? 7-i : i, rBot = flip ? 0 : 7;
    const darkB = (rBot+f)%2===1;
    s += `<text x="${i*100+93}" y="793" font-size="21" font-weight="700" text-anchor="end" fill="${darkB?BOARD().l:BOARD().d}">${"abcdefgh"[f]}</text>`;
    const rr = flip ? 7-i : i, fL = flip ? 7 : 0;
    const darkL = (rr+fL)%2===1;
    s += `<text x="7" y="${i*100+24}" font-size="21" font-weight="700" fill="${darkL?BOARD().l:BOARD().d}">${8-rr}</text>`;
  }

  // check glow under the king
  if(g.in_check()){
    g.board().forEach((row,r) => row.forEach((c,f) => {
      if(c && c.type==="k" && c.color===g.turn()){ const p = cell(f,r); s += `<circle cx="${p.x+50}" cy="${p.y+50}" r="50" fill="url(#${gid})"/>`; }
    }));
  }

  if(o.facts){
    const purple = new Set(o.facts.pinned.map(x => x.sq));
    const red = new Set(o.facts.unprotected.map(x => x.sq));
    const yellow = new Set();
    o.facts.defended.forEach(x => {
      if(purple.has(x.sq) || red.has(x.sq) || yellow.has(x.sq)) return;
      yellow.add(x.sq);
      const p = ctr(x.sq);
      s += `<circle cx="${p.x}" cy="${p.y}" r="50" fill="url(#${gid}y)"/>`;
    });
    o.facts.unprotected.forEach(x => {
      if(purple.has(x.sq)) return;
      const p = ctr(x.sq);
      s += `<circle cx="${p.x}" cy="${p.y}" r="50" fill="url(#${gid})"/>`;
    });
    o.facts.pinned.forEach(x => { const p = ctr(x.sq); s += `<circle cx="${p.x}" cy="${p.y}" r="50" fill="url(#${gid}p)"/>`; });
  }

  (o.captures||[]).forEach(c => {
    const p = ctr(c.sq), col = c.mine ? "var(--good)" : "var(--bad)";
    s += `<rect x="${p.x-47}" y="${p.y-47}" width="94" height="94" rx="7" fill="${col}" fill-opacity=".16" stroke="${col}" stroke-width="4" stroke-opacity=".9"/>`;
  });

  g.board().forEach((row, r) => row.forEach((c, f) => {
    if(!c) return;
    const sq = "abcdefgh"[f] + (8-r);
    if(o.hideSq===sq) return;
    const w = c.color==="w", p = cell(f,r);
    let attr = "";
    if(o.anim && o.anim.to===sq){
      const a = ctr(o.anim.from);
      attr = ` class="slide" style="--dx:${a.x-(p.x+50)}px;--dy:${a.y-(p.y+50)}px"`;
    }
    const url = PIECE_URL(c.color,c.type);
    const pe = badImg.has(url)
      ? `<text x="${p.x+50}" y="${p.y+54}" font-size="82" text-anchor="middle" dominant-baseline="central" `+
        `font-family="'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols 2',serif" `+
        `fill="${w?"var(--pieceW)":"var(--pieceB)"}" stroke="${w?"var(--pieceWs)":"var(--pieceBs)"}" stroke-width="${w?3:1.5}" paint-order="stroke">${GLYPH[c.type]}</text>`
      : `<image href="${url}" x="${p.x}" y="${p.y}" width="100" height="100" onerror="imgFail(this)"/>`;
    s += attr ? `<g${attr}>${pe}</g>` : pe;
  }));

  (o.dots||[]).forEach(m => {
    const p = ctr(m.to);
    s += m.captured
      ? `<circle cx="${p.x}" cy="${p.y}" r="45" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="10"/>`
      : `<circle cx="${p.x}" cy="${p.y}" r="17" fill="rgba(0,0,0,.14)"/>`;
  });
  (arrows||[]).forEach(([a,b,color,opt]) => { s += arrowSVG(ctr(a), ctr(b), color, opt); });
  (o.nums||[]).forEach(n => {
    s += `<circle cx="${n.x}" cy="${n.y}" r="15" fill="${n.c}" stroke="#fff" stroke-width="2.5"/>`+
      `<text x="${n.x}" y="${n.y+1}" font-size="${n.t>9?15:18}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="system-ui,sans-serif">${n.t}</text>`;
  });

  if(o.badge && BADGES[o.badge.kind]){
    const b = BADGES[o.badge.kind], p = ctr(o.badge.sq), cx = p.x+34, cy = p.y-34;
    s += `<circle cx="${cx+1.5}" cy="${cy+2.5}" r="18" fill="rgba(0,0,0,.3)"/>`+
      `<image href="${b.i}" x="${cx-18}" y="${cy-18}" width="36" height="36"/>`;
  }
  s += `<g class="ov"></g>`;
  if(svg._s !== s){ svg._s = s; svg.innerHTML = s; }
  paintOverlay(svg, flip);
}

const winPct = cp => 50 + 50*(2/(1+Math.exp(-clip(cp,2000)/400))-1);
function setEvalBar(id, p, flip){
  const bar = $(id), fill = bar.querySelector(".evalfill"), tx = bar.querySelector(".evaltxt");
  fill.style.height = winPct(p.cp) + "%";
  bar.classList.toggle("flip", !!flip);
  const white = p.cp >= 0;
  let txt;
  if(p.mate!=null && Math.abs(p.mate)<1) txt = p.mate>0 ? "1-0" : "0-1";
  else if(p.mate!=null) txt = "M" + Math.abs(p.mate);
  else txt = Math.abs(p.cp/100).toFixed(1);
  tx.textContent = txt;
  const atBottom = flip ? !white : white;
  tx.className = "evaltxt " + (atBottom?"atBottom":"atTop") + " " + (white?"dk":"lt");
}
function drawTallyInto(el, tags){
  const counts = {};
  tags.forEach(t => counts[t] = (counts[t]||0)+1);
  const keys = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  if(!keys.length){ el.innerHTML = `<div class="empty" style="grid-column:1/-1">No flaws recorded yet.</div>`; return; }
  const max = counts[keys[0]];
  el.innerHTML = keys.map(k => `<div>${TAGS[k]}</div><div class="t"><i style="width:${counts[k]/max*100}%"></i></div><div>${counts[k]}</div>`).join("");
}
function toggleFacts(){
  showFacts = !showFacts;
  const t = "Threats: " + (showFacts?"on":"off");
  $("ptoggle").textContent = t; $("rtoggle").textContent = t;
  if(pg) renderPlay();
  if(moves.length) show();
}

/* ================= Square helpers + right-click marks ================= */
let rc = null;
function sqAt(svg, e, flip){
  const r = (rc && rc.svg===svg) ? rc.r : svg.getBoundingClientRect();
  let c = Math.floor((e.clientX-r.left)/r.width*8), rw = Math.floor((e.clientY-r.top)/r.height*8);
  if(c<0||c>7||rw<0||rw>7) return null;
  if(flip){ c = 7-c; rw = 7-rw; }
  return "abcdefgh"[c] + (8-rw);
}
function svgPt(svg, e){
  const r = (rc && rc.svg===svg) ? rc.r : svg.getBoundingClientRect();
  return {x:(e.clientX-r.left)/r.width*800, y:(e.clientY-r.top)/r.height*800};
}
function clearMarks(id){
  const m = marks[id], had = m.sq.length || m.ar.length;
  m.sq = []; m.ar = []; m.pv = null;
  return !!had;
}
function toggleIn(list, val){ const i = list.indexOf(val); if(i>=0) list.splice(i,1); else list.push(val); }
function attachMarks(svg, getFlip, redraw){
  let from = null;
  svg.addEventListener("contextmenu", e => e.preventDefault());
  svg.addEventListener("pointerdown", e => {
    if(e.button!==2) return;
    e.preventDefault();
    rc = {svg, r:svg.getBoundingClientRect()};
    from = sqAt(svg, e, getFlip());
    if(from) svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", e => {
    if(from===null || !(e.buttons & 2)) return;
    const to = sqAt(svg, e, getFlip());
    marks[svg.id].pv = (to && to!==from) ? {a:from, b:to} : null;
    paintOverlay(svg, getFlip());
  });
  svg.addEventListener("pointerup", e => {
    if(e.button!==2 || from===null) return;
    const to = sqAt(svg, e, getFlip()), m = marks[svg.id];
    rc = null;
    m.pv = null;
    if(to){
      if(to===from) toggleIn(m.sq, to);
      else {
        const i = m.ar.findIndex(x => x.a===from && x.b===to);
        if(i>=0) m.ar.splice(i,1); else m.ar.push({a:from, b:to});
      }
    }
    from = null; redraw();
  });
}

