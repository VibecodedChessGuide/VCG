const ENGINE_BASE = location.hostname.endsWith("github.io") ? "/VCG-engines/assets/js/" : "assets/js/";
const BOTS = [
  {id:"sf19",   name:"Stockfish 19",             level:"max",    url:ENGINE_BASE+"stockfish-19.js",            single:ENGINE_BASE+"stockfish-19-single.js",      size:99076105, prog:1},
  {id:"sf19s",  name:"Stockfish 19 Single",      level:"max",    url:ENGINE_BASE+"stockfish-19-single.js",     size:99169054, prog:1},
  {id:"sf19l",  name:"Stockfish 19 Lite",        level:"casual", url:ENGINE_BASE+"stockfish-19-lite.js",       single:ENGINE_BASE+"stockfish-19-lite-single.js", size:1697617, prog:1},
  {id:"sf19ls", name:"Stockfish 19 Lite Single", level:"casual", url:ENGINE_BASE+"stockfish-19-lite-single.js", size:1845971, prog:1},
  {id:"sf19a",  name:"Stockfish 19 ASM",         level:"max",    url:ENGINE_BASE+"stockfish-19-asm.js",        size:3155627},
  {id:"sf18",   name:"Stockfish 18",             level:"max",    url:ENGINE_BASE+"stockfish-18.js",            single:ENGINE_BASE+"stockfish-18-lite-single.js", size:113007340},
  {id:"sf18l",  name:"Stockfish 18 Lite",        level:"casual", url:ENGINE_BASE+"stockfish-18-lite.js",       single:ENGINE_BASE+"stockfish-18-lite-single.js", size:7093151},
  {id:"sf18ls", name:"Stockfish 18 Lite Single", level:"casual", url:ENGINE_BASE+"stockfish-18-lite-single.js", size:7295411},
  {id:"sf18a",  name:"Stockfish 18 ASM",         level:"max",    url:ENGINE_BASE+"stockfish-18-asm.js",        size:10509235}
];
let botId = "sf19";
const BOT = () => BOTS.find(b => b.id === botId) || BOTS[0];
// Local board and piece images, originally from chess.com's CDN (URL patterns from
// GiorgioMegrelli/chess.com-boards-and-pieces default-config.json).
// l / d are the light and dark square colors, used for coordinates and as a fallback.
const BOARDS = {
  "9rdwe": {name:"Green",     url:"assets/boards/green.png",  l:"#ebecd0", d:"#739552"},
  brown:   {name:"Brown",     url:"assets/boards/brown.png",  l:"#edd6b0", d:"#b88762"},
  blue:    {name:"Dark Blue", url:"assets/boards/blue.png",   l:"#d9e0e6", d:"#7d95ab"},
  purple:  {name:"Purple",    url:"assets/boards/purple.png", l:"#f0f1f0", d:"#8476ba"}
};
const PIECESETS = {
  ejgfv:{name:"Neo", a:1}, neo_wood:{name:"Neo-Wood"}, classic:{name:"Classic"}, alpha:{name:"Alpha"},
  wood:{name:"Wood"}, glass:{name:"Glass"}, game_room:{name:"Game Room"}, modern:{name:"Modern"},
  "3d_plastic":{name:"3D - Plastic"}, "3d_staunton":{name:"3D - Staunton"}, "3d_wood":{name:"Real 3D"},
  metal:{name:"Metal"}, gothic:{name:"Gothic"}, marble:{name:"Marble"}, ocean:{name:"Ocean"}
};
let boardId = "9rdwe", pieceId = "ejgfv";
const BOARD = () => BOARDS[boardId];
// all 32 dark squares as one path (same screen positions whether the board is flipped or not)
const DARK_PATH = (() => { let d = ""; for(let r=0;r<8;r++) for(let f=0;f<8;f++) if((r+f)%2===1) d += "M"+(f*100)+" "+(r*100)+"h100v100h-100z"; return d; })();
const badImg = new Set(); let failRaf = 0;
function imgFailUrl(u){ badImg.add(u); if(!failRaf) failRaf = requestAnimationFrame(() => { failRaf = 0; redrawAll(); }); }
function imgFail(el){ imgFailUrl(el.getAttribute("href")); }
const PIECE_URL = (c,t) => "assets/pieces/" + pieceId + "/" + c + t + ".png";
const $ = id => document.getElementById(id);
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, {timeout:2000}) : setTimeout(f, 300));
// only touch the DOM when the markup actually changed
function setHTML(el, h){ if(el._h !== h){ el._h = h; el.innerHTML = h; } }
const GLYPH = {p:"\u265F\uFE0E",n:"\u265E\uFE0E",b:"\u265D\uFE0E",r:"\u265C\uFE0E",q:"\u265B\uFE0E",k:"\u265A\uFE0E"};
const NAMES = {p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
const VAL = {p:1,n:3,b:3,r:5,q:9,k:0};
const ATT = {p:1,n:3,b:3,r:5,q:9,k:100};
const FD = 10; // analysis search depth
const LEVELS = {
  beginner:{skill:0, depth:3}, casual:{skill:6, depth:6},
  strong:{skill:14, depth:10}, max:{skill:20, depth:12}
};
const TAGS = {
  allowed_mate:"Allowed checkmate", allowed_fork:"Walked into a fork", hanging:"Left material hanging",
  missed_mate:"Missed a checkmate", missed_win:"Missed a winning chance", missed_fork:"Missed a fork",
  pin:"Walked into a pin", missed_tactic:"Missed a tactic", sac_bad:"Unsound sacrifice",
  drift:"Slow positional drift"
};
const BADGES = {
  brilliant:{c:"#1baca6", i:"assets/badges/brilliant.png"},
  great:{c:"#749bbf", i:"assets/badges/great.png"},
  best:{c:"#96bc4b", i:"assets/badges/best.png"}, good:{c:"#96af8b", i:"assets/badges/good.png"},
  book:{c:"#a88865", i:"assets/badges/book.png"},
  miss:{c:"#e06c5a", i:"assets/badges/miss.svg"},
  inacc:{c:"#f7c631", i:"assets/badges/inaccuracy.png"}, mistake:{c:"#ffa459", i:"assets/badges/mistake.png"},
  blunder:{c:"#fa412d", i:"assets/badges/blunder.png"}
};
const STRICTNESS = {
  low:{inacc:Infinity, mistake:150, blunder:300},
  medium:{inacc:50, mistake:100, blunder:250},
  high:{inacc:25, mistake:70, blunder:150}
};

let main = null, aux = null, engineReady = false;
let showFacts = false, soundOn = true;
const marks = {pboard:{sq:[],ar:[],pv:null}, board:{sq:[],ar:[],pv:null}};

