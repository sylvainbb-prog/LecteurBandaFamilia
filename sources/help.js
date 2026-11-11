/* =====================================================================
   Aide par étiquettes (bouton « ? »), fenêtre de latence à la première
   ouverture, rappel de latence dans « Avant de jouer ».
   Les textes sont dans aide.js (objet AIDE).
   ===================================================================== */
(function(){
  function latStatus(){ const m=measuredLead(); return m!==null?"✔ Latence mesurée : "+Math.round(m)+" ms":""; }

  /* ---------- fenêtre de latence (première ouverture seulement) ---------- */
  const qs=$("qsDlg"), L=AIDE.latence;
  $("qsTitle").textContent=L.titre; $("qsText").innerHTML=L.texte; $("qsLater").innerHTML=L.plusTard;
  const qb=$("qsMeasure"); qb.textContent=L.bouton; $("qsClose").textContent=L.fermer;
  qb.onclick=async()=>{ const r=await runLatency({btn:qb,out:$("qsSt")}); if(r!==null){ $("qsClose").textContent="Terminé"; qb.textContent="Refaire la mesure"; } };
  $("qsClose").onclick=()=>{ store("banda.qsDone","1"); qs.close(); };
  qs.addEventListener("cancel",()=>store("banda.qsDone","1"));
  window.openLatencyIntro=()=>{ $("qsSt").textContent=latStatus(); qs.showModal(); };
  if(store("banda.qsDone")!=="1" && !/[?&](seance|synctest)=/.test(location.search) && !(navigator.webdriver&&!/[?&]qs=1/.test(location.search)))
    setTimeout(()=>{ if(!document.querySelector("dialog[open]")) openLatencyIntro(); },900);

  /* ---------- étiquettes ---------- */
  const layer=$("tipLayer"); let shown=false, hideT=0;
  function visible(el){
    if(!el||el.closest("[hidden]")||!el.getClientRects().length) return null;
    const r=vrect(el); if(r.width<4||r.height<4) return null;
    const cs=getComputedStyle(el); if(cs.visibility==="hidden"||+cs.opacity===0) return null;
    if(r.right<4||r.left>VW()-4||r.bottom<4||r.top>VH()-4) return null;
    // caché derrière une fenêtre ou un tiroir ?
    const c=vptInv(Math.min(VW()-2,Math.max(1,r.left+r.width/2)),Math.min(VH()-2,Math.max(1,r.top+r.height/2)));
    const top=document.elementFromPoint(c.x,c.y); if(top&&!el.contains(top)&&!top.contains(el)&&!layer.contains(top)) return null;
    return r;
  }
  function place(){
    layer.querySelectorAll(".tip,.tipline,.tipring").forEach(x=>x.remove()); closeBubble();
    const vw=VW(), vh=VH(), big=r=>r.width*r.height>vw*vh*0.2;
    // 1. éléments visibles
    const items=[];
    AIDE.etiquettes.forEach(E=>{ let el=null, r=null;
      for(const sel of E.cibles){ for(const c of document.querySelectorAll(sel)){ r=visible(c); if(r){ el=c; break; } } if(el) break; }
      if(el) items.push({E,el,r}); });
    // 2. obstacles : les éléments eux-mêmes (une étiquette ne cache pas un bouton expliqué), et le bouton « ? »
    const obst=items.filter(it=>!big(it.r)).map(it=>({l:it.r.left,r:it.r.right,t:it.r.top,b:it.r.bottom}));
    ["helpBtn","lpHelp"].forEach(id=>{ const r=visible($(id)); if(r) obst.push({l:r.left,r:r.right,t:r.top,b:r.bottom}); });
    const placed=[];
    const inter=(a,b,m)=>a.l<b.r+m&&a.r>b.l-m&&a.t<b.b+m&&a.b>b.t-m;
    const free=(a,self)=>a.l>=4&&a.r<=vw-4&&a.t>=4&&a.b<=vh-4&&!placed.some(b=>inter(a,b,4))&&!obst.some(b=>b!==self&&inter(a,b,2));
    let n=0;
    items.forEach(({E,el,r})=>{
      const t=document.createElement("button"); t.type="button"; t.className="tip"; t.textContent=E.nom; t.style.animationDelay=(n++*0.025)+"s";
      layer.appendChild(t); const w=t.offsetWidth, h=t.offsetHeight, cx=r.left+r.width/2;
      const self=obst.find(o=>o.l===r.left&&o.t===r.top);
      let best=null;
      if(E.position==="dedans"){ for(let k=0;k<8&&!best;k++){ const y=r.top+r.height*0.62+k*(h+6)*(k%2?-1:1)*Math.ceil(k/2); const x=cx-w/2; const a={l:x,r:x+w,t:y,b:y+h}; if(free(a,self)) best={x,y,dir:0}; } }
      else {
        const pref=r.top+r.height/2>vh*0.55?-1:1;
        const dirs=[pref,-pref];
        outer: for(let k=0;k<10;k++) for(const dir of dirs){ if(k>5&&dir!==pref) continue;
          for(const dx of [0,-0.6,0.6,-1.2,1.2]){
            const x=Math.max(6,Math.min(vw-w-6,cx-w/2+dx*w)), y=dir<0?r.top-h-8-k*(h+6):r.bottom+8+k*(h+6);
            const a={l:x,r:x+w,t:y,b:y+h}; if(free(a,self)){ best={x,y,dir}; break outer; } } }
        if(!best){ const dir=pref, x=Math.max(6,Math.min(vw-w-6,cx-w/2)); best={x,y:dir<0?r.top-h-8:r.bottom+8,dir}; }
      }
      if(!best) best={x:cx-w/2,y:r.top+r.height/2,dir:0};
      const x=best.x, y=Math.max(4,Math.min(vh-h-4,best.y)), dir=best.dir;
      placed.push({l:x,r:x+w,t:y,b:y+h}); t.style.left=x+"px"; t.style.top=y+"px";
      if(E.position!=="dedans"){
        if(!big(r)){ const ring=document.createElement("div"); ring.className="tipring"; ring.style.cssText=`left:${r.left-3}px;top:${r.top-3}px;width:${r.width+6}px;height:${r.height+6}px`; layer.insertBefore(ring,layer.firstChild); }
        const ax=Math.max(x+10,Math.min(x+w-10,cx)), ay=dir<0?y+h:y, bx=cx, by=dir<0?r.top-3:r.bottom+3;
        const len=Math.hypot(bx-ax,by-ay); if(len>6){ const ln=document.createElement("div"); ln.className="tipline";
          ln.style.cssText=`left:${ax}px;top:${ay}px;width:${len}px;transform:rotate(${Math.atan2(by-ay,bx-ax)}rad)`; layer.insertBefore(ln,layer.firstChild); }
      }
      t.onclick=ev=>{ ev.stopPropagation(); openBubble(E,t); };
    });
  }
  let bub=null;
  function closeBubble(){ if(bub){ bub.remove(); bub=null; } layer.querySelectorAll(".tip.sel").forEach(x=>x.classList.remove("sel")); }
  function openBubble(E,t){
    const same=bub&&bub._t===t; closeBubble(); if(same) return;
    t.classList.add("sel");
    bub=document.createElement("div"); bub.className="tipbub"; bub._t=t;
    bub.innerHTML='<b>'+E.nom+'</b><div>'+E.texte+'</div>'; layer.appendChild(bub);
    const tr=vrect(t), w=bub.offsetWidth, h=bub.offsetHeight;
    let x=Math.max(8,Math.min(VW()-w-8,tr.left+tr.width/2-w/2));
    let y=tr.top+tr.height/2>VH()/2?tr.top-h-8:tr.bottom+8; y=Math.max(8,Math.min(VH()-h-8,y));
    bub.style.left=x+"px"; bub.style.top=y+"px";
    bub.onclick=ev=>{ ev.stopPropagation(); closeBubble(); };
  }
  function showTips(){ clearTimeout(hideT); shown=true; layer.classList.remove("out"); layer.hidden=false; place(); layer.classList.add("on"); helpBtns(true); }
  function hideTips(){ if(!shown) return; shown=false; helpBtns(false); closeBubble(); layer.classList.remove("on"); layer.classList.add("out");
    hideT=setTimeout(()=>{ layer.hidden=true; layer.classList.remove("out"); layer.querySelectorAll(".tip,.tipline,.tipring").forEach(x=>x.remove()); },180); }
  function helpBtns(on){ ["helpBtn","lpHelp"].forEach(id=>{ const b=$(id); if(b){ b.classList.toggle("on",on); b.setAttribute("aria-pressed",on?"true":"false"); } }); }
  window.toggleTips=()=>shown?hideTips():showTips();
  $("helpBtn").onclick=toggleTips; $("lpHelp").onclick=toggleTips;
  $("setHelp").onclick=()=>{ $("settings").close(); setTimeout(showTips,250); };
  // un clic ailleurs ferme seulement l'explication ; les étiquettes restent
  document.addEventListener("pointerdown",e=>{ if(bub&&!bub.contains(e.target)&&!e.target.closest(".tip")) closeBubble(); },true);
  document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&shown) hideTips(); });
  let rt=0; const re=()=>{ if(!shown) return; clearTimeout(rt); rt=setTimeout(place,400); };
  window.addEventListener("resize",re);
  window.tipsRefresh=re;   // changement d'écran (liste ↔ lecteur)

  /* ---------- rappel de latence dans « Avant de jouer » (séance) ---------- */
  const cd=$("checkDlg"), li=$("latCheck");
  $("latCheckT").textContent=AIDE.rappelLatence.titre; $("latCheckX").textContent=AIDE.rappelLatence.texte;
  const lb=$("latCheckB"); lb.textContent=AIDE.rappelLatence.bouton;
  lb.onclick=async()=>{ const r=await runLatency({btn:lb,out:$("latCheckX")}); if(r!==null) li.querySelector("input").checked=true; };
  const show0=cd.showModal.bind(cd);
  cd.showModal=()=>{ const need=measuredLead()===null; li.hidden=!need; if(need){ $("latCheckX").textContent=AIDE.rappelLatence.texte; li.querySelector("input").checked=false; } show0(); };
})();
