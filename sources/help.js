/* =====================================================================
   Aide « ? », premiers pas (première ouverture) et rappel de latence.
   Les textes sont dans aide.js (objet AIDE).
   ===================================================================== */
(function(){
  const qs=$("qsDlg"); let step=0;
  function latStatus(){ const m=measuredLead(); return m!==null?"✔ Latence mesurée : "+Math.round(m)+" ms":"Latence pas encore mesurée sur cet appareil."; }
  function drawQS(){
    const L=AIDE.premiersPas, s=L[step];
    $("qsIcon").textContent=s.icone||""; $("qsTitle").textContent=s.titre; $("qsText").innerHTML=s.texte;
    const a=$("qsAct"); a.innerHTML="";
    if(s.action==="latence"){
      const b=document.createElement("button"); b.type="button"; b.className="primary"; b.textContent=AIDE.rappelLatence.bouton;
      const st=document.createElement("div"); st.className="small qsst"; st.textContent=latStatus();
      b.onclick=async()=>{ b.disabled=true; b.textContent="Écoute…"; try{ await runLatency(); } finally { b.disabled=false; b.textContent=AIDE.rappelLatence.bouton; st.textContent=latStatus(); } };
      a.append(b,st);
    }
    $("qsDots").innerHTML=L.map((_,i)=>'<i class="'+(i===step?"on":"")+'"></i>').join("");
    $("qsPrev").style.visibility=step?"visible":"hidden";
    const last=step===L.length-1; $("qsNext").textContent=last?"C'est parti !":"Suivant"; $("qsSkip").style.visibility=last?"hidden":"visible";
  }
  function done(){ store("banda.qsDone","1"); if(qs.open) qs.close(); }
  window.openQuickStart=()=>{ step=0; drawQS(); if(!qs.open) qs.showModal(); };
  $("qsNext").onclick=()=>{ if(step<AIDE.premiersPas.length-1){ step++; drawQS(); } else { done(); if(window.fxBurst) fxBurst({n:80}); } };
  $("qsPrev").onclick=()=>{ if(step>0){ step--; drawQS(); } };
  $("qsSkip").onclick=done;
  qs.addEventListener("cancel",()=>store("banda.qsDone","1"));
  // balayage gauche / droite
  let x0=null; qs.addEventListener("touchstart",e=>{ x0=e.touches[0].clientX; },{passive:true});
  qs.addEventListener("touchend",e=>{ if(x0===null) return; const dx=e.changedTouches[0].clientX-x0; x0=null;
    if(Math.abs(dx)>60){ if(dx<0) $("qsNext").click(); else $("qsPrev").click(); } },{passive:true});

  // aide complète
  const hd=$("helpDlg");
  function drawHelp(){ $("helpList").innerHTML=AIDE.sections.map(s=>'<details class="hsec"><summary>'+s.titre+'</summary><div class="htxt">'+s.texte+'</div></details>').join(""); }
  window.openHelp=()=>{ drawHelp(); $("helpVer").textContent="Version "+(window.BANDA_VERSION||""); hd.showModal(); };
  // une seule section ouverte à la fois
  $("helpList").addEventListener("toggle",e=>{ if(e.target.open) hd.querySelectorAll("details[open]").forEach(d=>{ if(d!==e.target) d.open=false; }); },true);
  $("helpQS").onclick=()=>{ hd.close(); openQuickStart(); };
  $("helpBtn").onclick=openHelp;
  $("setHelp").onclick=()=>{ $("settings").close(); openHelp(); };

  // rappel de latence dans « Avant de jouer » (séance), tant qu'elle n'est pas mesurée
  const cd=$("checkDlg"), li=$("latCheck");
  $("latCheckT").textContent=AIDE.rappelLatence.titre; $("latCheckX").textContent=AIDE.rappelLatence.texte;
  const lb=$("latCheckB"); lb.textContent=AIDE.rappelLatence.bouton;
  lb.onclick=async()=>{ lb.disabled=true; lb.textContent="Écoute…"; try{ await runLatency(); } finally { lb.disabled=false; lb.textContent=AIDE.rappelLatence.bouton;
    if(measuredLead()!==null){ $("latCheckX").textContent=latStatus(); li.querySelector("input").checked=true; } } };
  const show0=cd.showModal.bind(cd);
  cd.showModal=()=>{ const need=measuredLead()===null; li.hidden=!need; if(need){ $("latCheckX").textContent=AIDE.rappelLatence.texte; li.querySelector("input").checked=false; } show0(); };

  // première ouverture : premiers pas (pas si on arrive par un lien de séance : on rejoint d'abord)
  if(store("banda.qsDone")!=="1" && !/[?&](seance|synctest)=/.test(location.search) && !(navigator.webdriver&&!/[?&]qs=1/.test(location.search))) setTimeout(()=>{ if(!document.querySelector("dialog[open]")) openQuickStart(); },900);
})();
