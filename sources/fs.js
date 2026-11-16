/* =====================================================================
   Plein écran
   - Android : l'application passe en plein écran au premier « Rejoindre » ou « Lecture » ;
   - iPhone : Safari ne le permet pas → conseil (installer l'application, ou masquer la barre « aA ») ;
   - « Scanner le QR code » dans l'application installée : on rejoint sans passer par Safari.
   ===================================================================== */
(function(){
  const IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const STANDALONE=window.matchMedia("(display-mode: standalone)").matches||window.matchMedia("(display-mode: fullscreen)").matches||navigator.standalone===true;
  const TOUCH=window.matchMedia("(pointer: coarse)").matches;
  let tried=false;
  window.autoFullscreen=()=>{
    if(tried||IOS||STANDALONE||!TOUCH||document.fullscreenElement||!document.documentElement.requestFullscreen) return; tried=true;
    try{ const p=document.documentElement.requestFullscreen({navigationUI:"hide"}); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
  };
  // au toucher (geste requis par le navigateur), avant l'action elle-même
  ["sessJoin","playBtn","sessResumeF"].forEach(id=>{ const b=$(id); if(b) b.addEventListener("pointerdown",()=>autoFullscreen(),true); });
  const cg=$("checkGo"); if(cg) cg.addEventListener("pointerdown",()=>autoFullscreen(),true);

  // iPhone dans Safari, arrivé par le QR code : conseil (une seule fois)
  const tip=$("iosTip");
  if(tip&&IOS&&!STANDALONE&&store("banda.iosTip")!=="1"&&/[?&]seance=/.test(location.search)) tip.style.display="block";
  const tipOk=$("iosTipOk"); if(tipOk) tipOk.onclick=()=>{ store("banda.iosTip","1"); tip.style.display="none"; };

  // scanner le QR code du chef avec l'appareil photo
  const qd=$("qrDlg"), vid=$("qrVid"), cvs=document.createElement("canvas");
  let stream=null, timer=0, det=null;
  const canCam=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  const sb=$("sessScan"); if(sb){ sb.style.display=canCam?"":"none"; sb.onclick=openScan; }
  function loadJsQR(){ return new Promise(res=>{ if(window.jsQR) return res(true); const s=document.createElement("script"); s.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"; s.onload=()=>res(!!window.jsQR); s.onerror=()=>res(false); document.head.appendChild(s); }); }
  window.qrFound=txt=>{   // texte lu : lien de la séance (…?seance=CODE) ou code seul
    const m=String(txt||"").match(/[?&]seance=([A-Za-z0-9]{4,6})/)||String(txt||"").trim().match(/^([A-Za-z0-9]{4,6})$/);
    if(!m){ $("qrMsg").textContent="Ce QR code n'est pas celui d'une séance de la banda."; return false; }
    closeScan(); const code=m[1].toUpperCase(); $("sessCodeIn").value=code;
    if(!$("sessDlg").open){ sessUI(); $("sessDlg").showModal(); }
    toast("Séance "+code+" trouvée",1800); setTimeout(()=>$("sessJoin").click(),250); return true; };
  async function openScan(){
    $("qrMsg").textContent="Visez le QR code affiché sur le téléphone du chef…"; qd.showModal();
    try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false}); }
    catch(e){ $("qrMsg").textContent="Appareil photo indisponible ("+(e.name==="NotAllowedError"?"accès refusé":"erreur")+"). Tapez le code de la séance."; return; }
    vid.srcObject=stream; vid.setAttribute("playsinline",""); try{ await vid.play(); }catch(e){}
    if("BarcodeDetector" in window){ try{ det=new BarcodeDetector({formats:["qr_code"]}); }catch(e){ det=null; } }
    if(!det&&!(await loadJsQR())){ $("qrMsg").textContent="Lecture du QR code impossible hors connexion : tapez le code."; return; }
    clearInterval(timer); timer=setInterval(scan,220);
  }
  async function scan(){
    if(!stream||vid.readyState<2) return;
    try{
      if(det){ const r=await det.detect(vid); if(r&&r[0]) qrFound(r[0].rawValue); return; }
      const w=vid.videoWidth, h=vid.videoHeight; if(!w) return; const sc=Math.min(1,640/w);
      cvs.width=w*sc; cvs.height=h*sc; const c=cvs.getContext("2d",{willReadFrequently:true}); c.drawImage(vid,0,0,cvs.width,cvs.height);
      const img=c.getImageData(0,0,cvs.width,cvs.height), r=jsQR(img.data,img.width,img.height,{inversionAttempts:"dontInvert"}); if(r&&r.data) qrFound(r.data);
    }catch(e){}
  }
  function closeScan(){ clearInterval(timer); if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } vid.srcObject=null; if(qd.open) qd.close(); }
  $("qrClose").onclick=closeScan; qd.addEventListener("close",closeScan);
})();
