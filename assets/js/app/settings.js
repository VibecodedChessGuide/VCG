/* settings popover: close on outside tap, Escape, or when switching tabs */
(function(){
  const d = document.getElementById("settings");
  if(!d) return;
  document.addEventListener("pointerdown", e => { if(d.open && !d.contains(e.target)) d.open = false; });
  document.addEventListener("keydown", e => { if(e.key === "Escape" && d.open){ d.open = false; d.querySelector("summary").focus(); } });
  document.querySelector(".tabs").addEventListener("click", () => { d.open = false; });
})();
