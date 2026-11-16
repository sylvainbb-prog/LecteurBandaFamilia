/* =====================================================================
   Réglage de la latence « à l'oreille » (sans micro) — pour les enceintes Bluetooth
   sur iPhone, où le micro et l'enceinte ne peuvent pas fonctionner ensemble.
   Métronome à 60, 1er temps aigu ; une bande de 4 temps défile sous une barre fixe ;
   le curseur avance le son jusqu'à ce que le « tic » aigu tombe pile quand le 1 passe la barre.
   ===================================================================== */
(function(){
  const dlg=$("earDlg"), cv=$("earCv"), rg=$("earMs"), lb=$("earVal");
  const BPM=60, BEAT=60/BPM, VIEW=3.2;   // 3,2 s visibles
  let run=false, T0=0, nextB=0, raf=0, tmr=0, flash=0;
  const L=()=>(+rg.value)/1000;
  function show(){ lb.textContent=rg.value+" ms"; }
  function tick(){ if(!run) return; const now=AC.currentTime, hz=now+0.5;
    while(T0+nextB*BEAT<hz){ const t=T0+nextB*BEAT, one=nextB%4===0, w=t-L();
      if(w>now+0.005){ const d=BUS||master; tone(d,w,one?2100:950,one?2000:930,one?0.09:0.06,one?0.7:0.4,"sine"); }
      nextB++; } }
  function draw(){ if(!run) return; raf=requestAnimationFrame(draw);
    const W=cv.clientWidth, H=cv.clientHeight, dpr=Math.min(2,devicePixelRatio||1); if(cv.width!==W*dpr){ cv.width=W*dpr; cv.height=H*dpr; }
    const c=cv.getContext("2d"); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,H);
    const now=(typeof smoothNow==="function"?smoothNow():AC.currentTime)+0.016, pps=W/VIEW, cx=W/2;
    c.fillStyle="#fff"; c.fillRect(0,0,W,H);
    c.strokeStyle="#0002"; c.lineWidth=1; for(let i=0;i<5;i++){ const y=H*0.3+i*H*0.1; c.beginPath(); c.moveTo(0,y); c.lineTo(W,y); c.stroke(); }
    const b0=Math.floor((now-VIEW/2-T0)/BEAT)-1;
    for(let n=Math.max(0,b0);n<b0+VIEW/BEAT+3;n++){ const x=cx+(T0+n*BEAT-now)*pps, one=n%4===0;
      if(x<-30||x>W+30) continue;
      c.fillStyle=one?"#0bb3b8":"#333"; c.fillRect(x-(one?4:1.5),H*(one?0.18:0.28),one?8:3,H*(one?0.64:0.44));
      c.font=(one?"800 22px ":"700 15px ")+"Poppins,system-ui,sans-serif"; c.textAlign="center"; c.fillText(String(n%4+1),x,H*0.14);
      if(Math.abs(x-cx)<pps*0.04&&one) flash=performance.now(); }
    const fl=performance.now()-flash<130;
    c.fillStyle=fl?"#ff2d95":"#ff2d9599"; c.fillRect(cx-(fl?4:2),0,fl?8:4,H);
    if(fl){ c.fillStyle="#ff2d9522"; c.fillRect(0,0,W,H); } }
  async function start(){ const ac=audio(); try{ if(ac.state!=="running") await ac.resume(); }catch(e){} if(typeof outputPlay==="function") outputPlay();
    run=true; T0=ac.currentTime+0.6; nextB=0; clearInterval(tmr); tmr=setInterval(tick,40); tick(); cancelAnimationFrame(raf); draw(); }
  function stopIt(){ run=false; clearInterval(tmr); cancelAnimationFrame(raf); if(AC&&typeof newSession==="function"&&!S.playing) newSession(); }
  window.openEarLatency=()=>{ if(S.playing&&typeof pause==="function") pause();
    const cur=Math.round((measuredLead()!==null?measuredLead():autoLead()*1000)/5)*5; rg.value=Math.max(0,Math.min(600,cur)); show();
    $("earOut").textContent=OUT.key?("Sortie : "+OUT.key):""; try{ $("settings").open&&$("settings").close(); }catch(e){}
    dlg.showModal(); start(); };
  rg.oninput=show;
  $("earM").onclick=()=>{ rg.value=Math.max(0,+rg.value-5); show(); };
  $("earP").onclick=()=>{ rg.value=Math.min(600,+rg.value+5); show(); };
  $("earOk").onclick=()=>{ setLead(+rg.value); toast("Retard du son réglé : "+rg.value+" ms"+(OUT.key?" ("+OUT.key+")":""),3000); dlg.close(); };
  $("earCancel").onclick=()=>dlg.close();
  dlg.addEventListener("close",stopIt);
  $("earBtn").onclick=()=>openEarLatency();
})();
