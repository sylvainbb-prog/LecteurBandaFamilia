
/* =====================================================================
   ACCORDEUR « boule à facettes »
   - note entendue dans la notation de l'instrument (ex. sax alto : Fa♯) + son réel en Ut (icône piano : La)
   - trop haut : la boule s'éclaire au-dessus (d'autant plus haut que c'est faux) ; trop bas : en dessous
   - juste : rayons dorés, paillettes, la boule tourne
   ===================================================================== */
const FR_NOTES=["Do","Do♯","Ré","Mi♭","Mi","Fa","Fa♯","Sol","Sol♯","La","Si♭","Si"];
const NS={rot:0,ok:0,sp:[],dt:0,c:0,sil:true};
const TU={target:null,disp:null,on:false,stream:null,an:null,buf:null,raf:0,lastDet:0,hist:[],cents:null,shown:null,f:0,midi:null,okSince:0,okFx:0,rot:0,spark:[],lastT:0,silence:0,vib:false};
function a4(){ const v=parseFloat(store("banda.a4")); return v>=415&&v<=466?v:440; }
function setA4(v){ v=Math.max(430,Math.min(450,Math.round(v))); store("banda.a4",String(v)); $("a4v").textContent=v; const s=$("a4set"); if(s) s.textContent=v; }
function tunerInstrument(){
  let name="", tot=null, drum=false;
  if(S.model&&S.model.parts[S.myPart]){ const P=S.model.parts[S.myPart]; name=P.name; drum=!!P.isDrum;
    const t=P.transpose; if(t) tot=(t.chr||0)+12*(t.oct||0); else if(P.inferredTranspose) tot=P.inferredTranspose.chr; }
  else name=store("banda.part")||"";
  if(tot===null){ const r=TRANSP_BY_NAME.find(x=>x[0].test(name)); tot=r?r[2]:0; }
  if(/drum|batterie|percu/i.test(name)) drum=true;
  const keyb=/piano|accord|clavier|orgue|synth|guitare|basse|bass\b/i.test(name)&&!/sax|sousa/i.test(name);
  let how=null;
  if(/sax/i.test(name)) how="le bec";
  else if(/fl[uû]te|piccolo/i.test(name)) how="la tête";
  else if(/clarinet/i.test(name)) how="le barillet";
  else if(/tromp|trumpet|trombon|sousa|tuba|cor\b|horn|bugle|euph|baryton/i.test(name)) how="la coulisse d'accord";
  const inKey={0:"Ut",10:"Si♭",3:"Mi♭",5:"Fa",9:"La",2:"Ré"}[((tot%12)+12)%12]||"";
  return {name:name||"Instrument en Ut",tot,drum,keyb,how,inKey,transp:(tot%12)!==0};
}
function frName(m){ return FR_NOTES[((m%12)+12)%12]; }
function frOct(m){ return Math.floor(m/12)-2; }   // Do3 = do du milieu du piano
/* détection de hauteur : méthode McLeod (NSDF) */
function detectPitch(x,sr){
  const n=x.length; let e=0; for(let i=0;i<n;i++) e+=x[i]*x[i];
  const rms=Math.sqrt(e/n); if(rms<0.006) return null;
  const minLag=Math.floor(sr/2100), maxLag=Math.min(Math.floor(n/2),Math.floor(sr/38));
  const nsdf=new Float32Array(maxLag+2);
  for(let tau=minLag;tau<=maxLag+1;tau++){ let acf=0,m=0; for(let i=0;i<n-tau;i++){ const a=x[i],b=x[i+tau]; acf+=a*b; m+=a*a+b*b; } nsdf[tau]=m>0?2*acf/m:0; }
  let peaks=[], pos=false, cur=-1;
  for(let tau=minLag+1;tau<=maxLag;tau++){
    if(nsdf[tau]>0&&nsdf[tau-1]<=0){ pos=true; cur=-1; }
    if(nsdf[tau]<=0&&nsdf[tau-1]>0){ if(cur>0) peaks.push(cur); pos=false; }
    if(pos&&(cur<0||nsdf[tau]>nsdf[cur])) cur=tau;
  }
  if(pos&&cur>0) peaks.push(cur);
  if(!peaks.length) return null;
  const mx=Math.max(...peaks.map(t=>nsdf[t])); if(mx<0.6) return null;
  const tau=peaks.find(t=>nsdf[t]>=0.88*mx);
  const a=nsdf[tau-1],b=nsdf[tau],c=nsdf[tau+1], d=(a-2*b+c), sh=d!==0?0.5*(a-c)/d:0;
  return {f:sr/(tau+sh),clarity:b,rms};
}
async function openTuner(){
  const dlg=$("tunerDlg"); const I=tunerInstrument(); TU.I=I;
  $("tuIns").innerHTML=I.name+(I.transp?" · instrument en "+I.inKey:"")+(I.drum?" · (pas d'accord pour la batterie)":"");
  $("a4v").textContent=a4();
  $("tuConcert").style.display=I.transp?"":"none";
  $("tuNote").textContent="–"; $("tuOct").textContent=""; $("tuCents").textContent=""; $("tuHint").textContent="Jouez une note tenue…"; $("tuFreq").textContent="";
  if(S.playing&&SY.role!=="f") pause();
  const micP=micStream();            // demandé immédiatement, dans le geste de l'utilisateur
  micP.catch(()=>{});
  dlg.showModal(); TU.on=true; TU.target=null; TU.disp=null; TU.hist=[]; NS.sp=[]; NS.ok=0;
  sizeBall(); cancelAnimationFrame(TU.raf); TU.lastT=performance.now(); TU.raf=requestAnimationFrame(tunerFrame);
  try{
    const ac=audio(); await resumeAC();
    TU.stream=await micP;
    if(!TU.on){ TU.stream.getTracks().forEach(t=>t.stop()); return; }
    const src=ac.createMediaStreamSource(TU.stream), hp=ac.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=30;
    const an=ac.createAnalyser(); an.fftSize=4096; src.connect(hp); hp.connect(an);
    TU.src=src; TU.an=an; TU.buf=new Float32Array(an.fftSize);
  }catch(e){ $("tuHint").textContent=micError(e); $("tuHint").classList.add("err"); micDone(); }
}
function closeTuner(){
  TU.on=false; cancelAnimationFrame(TU.raf);
  if(TU.stream) TU.stream.getTracks().forEach(t=>t.stop()); TU.stream=null;
  try{ TU.src&&TU.src.disconnect(); }catch(e){} TU.an=null;
  const d=$("tunerDlg"); if(d.open) d.close();
  $("tuHint").classList.remove("err"); micDone();
}
function sizeBall(){ const c=$("tuBall"), r=c.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1); c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); }
function tunerFrame(now){
  if(!TU.on) return;
  const dt=Math.min(0.1,(now-TU.lastT)/1000); TU.lastT=now;
  if(TU.an&&now-TU.lastDet>45){ TU.lastDet=now; tunerDetect(); }
  // affichage lissé : calme, ne s'affole pas au moindre souffle
  if(TU.target===null) TU.disp=null; else TU.disp=TU.disp===null?TU.target:TU.disp+(TU.target-TU.disp)*Math.min(1,dt*4.5);
  const inTol=TU.disp!==null&&Math.abs(TU.disp)<=NEON.TOL;
  if(inTol){ if(!TU.okSince) TU.okSince=now; } else TU.okSince=0;
  const okT=inTol&&now-TU.okSince>350?1:0;
  NS.ok+=(okT-NS.ok)*Math.min(1,dt*5); NS.dt=dt; NS.c=TU.disp===null?0:TU.disp; NS.sil=TU.disp===null;
  const cv=$("tuBall"), ctx=cv.getContext("2d"), W=cv.width, H=cv.height;
  if(W&&H){ const bg=ctx.createRadialGradient(W/2,H*.4,0,W/2,H*.45,Math.max(W,H)*.75); bg.addColorStop(0,"#0d0b1a"); bg.addColorStop(1,"#020205");
    ctx.globalCompositeOperation="source-over"; ctx.fillStyle=bg; ctx.fillRect(0,0,W,H); NEON.draw(ctx,W,H,NS,now/1000); }
  // textes
  if(TU.disp!==null){ const c=TU.disp, I=TU.I, ok=NS.ok>.5, rc=Math.round(c);
    $("tuCents").textContent=(rc>=0?"+":"−")+Math.abs(rc)+" cents";
    $("tuCents").className="tu-cents "+(ok?"ok":c>NEON.TOL?"hi":c<-NEON.TOL?"lo":"near");
    const how=I.how?" "+I.how:"";
    $("tuHint").textContent=ok?"Juste !":Math.abs(c)<=NEON.TOL?"Presque… tenez la note":c>0?(I.keyb||I.drum?"Trop haut":"Trop haut ↑ – tirez"+how):(I.keyb||I.drum?"Trop bas":"Trop bas ↓ – poussez"+how);
    if(ok&&!TU.vib){ TU.vib=true; try{ navigator.vibrate&&navigator.vibrate(25); }catch(e){} }
    if(!ok) TU.vib=false;
  }
  TU.raf=requestAnimationFrame(tunerFrame);
}
function tunerDetect(){
  TU.an.getFloatTimeDomainData(TU.buf);
  const r=detectPitch(TU.buf,AC.sampleRate), I=TU.I;
  if(!r){ TU.silence++; if(TU.silence>12){ TU.target=null; TU.hist=[]; $("tuHint").textContent="Jouez une note tenue…"; $("tuCents").textContent=""; } return; }
  TU.silence=0;
  const midiF=69+12*Math.log2(r.f/a4());
  TU.hist.push(midiF); if(TU.hist.length>5) TU.hist.shift();
  const med=[...TU.hist].sort((a,b)=>a-b)[Math.floor(TU.hist.length/2)];
  const n=Math.round(med), cents=(med-n)*100;
  if(TU.midi!==n){ TU.midi=n; TU.disp=cents; }   // nouvelle note : pas de glissement depuis l'ancienne
  TU.target=cents;
  const fRef=a4()*Math.pow(2,(n-69)/12), fNow=a4()*Math.pow(2,(med-69)/12);
  const w=n-I.tot;   // note écrite pour l'instrument
  $("tuNote").textContent=I.drum?frName(n):frName(w); $("tuOct").textContent=I.drum?frOct(n):frOct(w);
  $("tuCName").textContent=frName(n)+frOct(n);
  const hz=x=>x.toFixed(1).replace(".",",")+" Hz";
  if(I.keyb||I.drum) $("tuFreq").innerHTML=frName(n)+frOct(n)+" attendu <b>"+hz(fRef)+"</b> · entendu <b>"+hz(fNow)+"</b>";
  else $("tuFreq").textContent=hz(fNow)+" (son réel)";
}
window.addEventListener("resize",()=>{ if(TU.on) sizeBall(); });
/* --- branchements --- */
$("tuneBtn").onclick=openTuner; $("lpTune").onclick=openTuner;
$("tuClose").onclick=closeTuner; $("tunerDlg").addEventListener("close",()=>{ if(TU.on) closeTuner(); });
$("a4m").onclick=()=>setA4(a4()-1); $("a4p").onclick=()=>setA4(a4()+1);
$("a4sm").onclick=()=>setA4(a4()-1); $("a4sp").onclick=()=>setA4(a4()+1); $("a4set").textContent=a4();
$("latBtn").onclick=()=>runLatency(); $("latReset").onclick=()=>{ setLead(null); toast("Retard du son : automatique"); };
$("outSel").onchange=e=>chooseOutput(e.target.value);
$("airBtn").onclick=()=>{ try{ OUT.el.webkitShowPlaybackTargetPicker(); }catch(e){} };
{ const sb=$("settingsBtn"), old=sb.onclick; sb.onclick=e=>{ old&&old(e); latInfo(); fillOutputs(); }; }
