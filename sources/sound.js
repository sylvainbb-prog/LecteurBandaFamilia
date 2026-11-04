
/* =====================================================================
   SORTIE AUDIO AUTOMATIQUE + RETARD DU SON (auto-latence)
   - le son suit la sortie choisie par le système (Bluetooth, AirPlay, casque…)
   - le retard de la sortie est mesuré au micro, puis le son est envoyé d'autant plus tôt :
     ce qu'on entend tombe pile sur l'horloge commune (et donc sur la barre de lecture et sur les autres téléphones)
   ===================================================================== */
const OUT={el:null,dest:null,mode:"direct",key:null,unlocked:false};
function isIOS(){ return /iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1); }
function setupOutput(){
  // Safari 16.4+ : session audio « lecture » (comme une appli de musique) → suit le Bluetooth / AirPlay, ignore le bouton silence
  try{ if(navigator.audioSession) navigator.audioSession.type="playback"; }catch(e){}
  // iPhone / iPad : le son passe par un lecteur média caché, géré par iOS comme Apple Music
  if(isIOS() && AC.createMediaStreamDestination){
    try{
      OUT.dest=AC.createMediaStreamDestination(); master.connect(OUT.dest);
      const el=document.createElement("audio"); el.setAttribute("playsinline",""); el.setAttribute("x-webkit-airplay","allow");
      el.srcObject=OUT.dest.stream; el.style.display="none"; document.body.appendChild(el);
      OUT.el=el; OUT.mode="media"; return;
    }catch(e){ OUT.el=null; }
  }
  master.connect(AC.destination); OUT.mode="direct";
}
function outputPlay(){
  try{ if(navigator.audioSession&&!OUT.mic) navigator.audioSession.type="playback"; }catch(e){}
  if(!OUT.el) return;
  const pr=OUT.el.play();
  if(pr&&pr.catch) pr.then(()=>{ OUT.unlocked=true; }).catch(()=>{   // lecteur refusé : on repasse en sortie directe
    if(OUT.mode==="media"){ try{ master.disconnect(OUT.dest); }catch(e){} master.connect(AC.destination); OUT.mode="direct"; OUT.el=null; } });
}
// premier geste : on « déverrouille » le son
["pointerdown","keydown"].forEach(t=>document.addEventListener(t,()=>{ if(AC&&OUT.el&&!OUT.unlocked) outputPlay(); },{capture:true}));
document.addEventListener("visibilitychange",()=>{ if(!document.hidden&&OUT.el&&S.playing) outputPlay(); });

/* ---------- retard de la sortie ---------- */
function autoLead(){ if(!AC) return 0; return Math.min(0.6,(AC.outputLatency||0)+(AC.baseLatency||0)); }
function measuredLead(){ const v=store("banda.lead"); if(v===null||v==="") return null; const m=parseFloat(v); return isFinite(m)&&m>=0?m:null; }
function leadSec(){ const m=measuredLead(); return m!==null?m/1000:autoLead(); }
function peerLeadMax(){ let m=0; for(const c of SY.peers.values()) if(c.acc) m=Math.max(m,(c.lead||0)/1000,(c.leadMax||0)/1000); return Math.min(m,3); }   // tous les téléphones de l'arbre (les hôtes remontent le retard de leurs invités)
function setLead(ms){
  if(ms===null){ try{ localStorage.removeItem("banda.lead"); }catch(e){} }
  else { store("banda.lead",String(Math.round(ms))); if(OUT.key){ const map=leadMap(); map[OUT.key]=Math.round(ms); store("banda.leadMap",JSON.stringify(map)); } }
  latInfo();
  if(SY.role==="f") try{ send({t:"lead",lead:Math.round(leadSec()*1000)}); }catch(e){}
}
function leadMap(){ try{ return JSON.parse(store("banda.leadMap")||"{}")||{}; }catch(e){ return {}; } }
function latInfo(){
  const el=$("latInfo"); if(!el) return; const m=measuredLead();
  el.innerHTML=m!==null?"Retard du son : <b>"+Math.round(m)+" ms</b> (mesuré)"+(OUT.key?" · "+OUT.key:""):
    "Retard du son : <b>automatique</b>"+(AC?" ("+Math.round(autoLead()*1000)+" ms annoncés par l'appareil)":"");
}
async function outKey(){
  try{ const ds=await navigator.mediaDevices.enumerateDevices(); const o=ds.filter(d=>d.kind==="audiooutput");
    const def=o.find(d=>d.deviceId==="default")||o[0]; return def&&def.label?def.label.replace(/^(Par défaut|Default)\s*-\s*/i,""):""; }catch(e){ return ""; }
}
async function onDeviceChange(){
  // Chrome / Edge : on suit la sortie par défaut du système
  try{ if(AC&&AC.setSinkId&&OUT.mode==="direct"&&!OUT.chosen) await AC.setSinkId(""); }catch(e){}
  const k=await outKey(); if(k===OUT.key) return;
  const first=OUT.key===null; OUT.key=k;
  if(first) return;
  const map=leadMap();
  if(k&&map[k]!==undefined){ store("banda.lead",String(map[k])); latInfo(); toast("Sortie audio : "+k+" · retard "+map[k]+" ms",3000); }
  else if(measuredLead()!==null){ try{ localStorage.removeItem("banda.lead"); }catch(e){} latInfo(); toast("Nouvelle sortie audio"+(k?" : "+k:"")+" – mesurez le retard du son dans les Paramètres",4500); }
  if(SY.role==="f") try{ send({t:"lead",lead:Math.round(leadSec()*1000)}); }catch(e){}
}
if(navigator.mediaDevices&&navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange",onDeviceChange);
outKey().then(k=>{ OUT.key=k; const map=leadMap(); if(k&&map[k]!==undefined) store("banda.lead",String(map[k])); latInfo(); });

/* ---------- choix manuel de la sortie (ordinateur) ---------- */
async function fillOutputs(){
  const box=$("outRow"), sel=$("outSel"); if(!box) return;
  let opts=[];
  try{ const ds=await navigator.mediaDevices.enumerateDevices(); opts=ds.filter(d=>d.kind==="audiooutput"&&d.label); }catch(e){}
  const canSink=!!(window.AudioContext&&AudioContext.prototype.setSinkId);
  const air=!!(OUT.el&&OUT.el.webkitShowPlaybackTargetPicker);
  $("airBtn").style.display=air?"":"none";
  if(canSink&&opts.length>1){ sel.style.display=""; sel.innerHTML='<option value="">Sortie du système (automatique)</option>'+opts.filter(o=>o.deviceId!=="default"&&o.deviceId!=="communications").map(o=>`<option value="${o.deviceId}">${o.label.replace(/</g,"&lt;")}</option>`).join(""); sel.value=OUT.chosen||""; }
  else sel.style.display="none";
  box.style.display=(air||sel.style.display==="")?"":"none";
}
async function chooseOutput(id){
  const ac=audio(); OUT.chosen=id||null;
  try{ await ac.setSinkId(id||""); }catch(e){ toast("Impossible de changer de sortie ici"); return; }
  const o=$("outSel").selectedOptions[0]; OUT.key=id?(o?o.textContent:id):await outKey();
  const map=leadMap(); if(OUT.key&&map[OUT.key]!==undefined) store("banda.lead",String(map[OUT.key])); else { try{ localStorage.removeItem("banda.lead"); }catch(e){} }
  latInfo();
}

/* ---------- mesure automatique du retard : bips émis, réécoutés au micro ---------- */
function fftc(re,im,inv){   // FFT complexe en place (taille puissance de 2)
  const n=re.length;
  for(let i=1,j=0;i<n;i++){ let b=n>>1; for(;j&b;b>>=1) j^=b; j^=b; if(i<j){ let t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; } }
  for(let len=2;len<=n;len<<=1){
    const a=(inv?2:-2)*Math.PI/len, wr=Math.cos(a), wi=Math.sin(a);
    for(let i=0;i<n;i+=len){ let cr=1,ci=0;
      for(let k=0;k<len/2;k++){ const ur=re[i+k],ui=im[i+k], xr=re[i+k+len/2], xi=im[i+k+len/2];
        const vr=xr*cr-xi*ci, vi=xr*ci+xi*cr; re[i+k]=ur+vr; im[i+k]=ui+vi; re[i+k+len/2]=ur-vr; im[i+k+len/2]=ui-vi;
        const nr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=nr; } } }
  if(inv) for(let i=0;i<n;i++){ re[i]/=n; im[i]/=n; }
}
function chirp(sr){
  const T=0.045, L=Math.floor(T*sr), d=new Float32Array(L), f0=1200, f1=5200;
  for(let i=0;i<L;i++){ const t=i/sr, w=Math.pow(Math.sin(Math.PI*i/L),2); d[i]=w*Math.sin(2*Math.PI*(f0*t+(f1-f0)*t*t/(2*T))); }
  return d;
}
/* micro : sur iPhone, la session audio doit passer en « lecture + enregistrement » AVANT la demande,
   sinon Safari refuse le micro sans même poser la question */
async function micStream(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ const e=new Error("nomedia"); e.name="NoMedia"; throw e; }
  OUT.mic=true;
  try{ if(navigator.audioSession) navigator.audioSession.type="play-and-record"; }catch(e){}
  try{ return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); }
  catch(e){
    if(e.name==="OverconstrainedError"||e.name==="TypeError"){ try{ return await navigator.mediaDevices.getUserMedia({audio:true}); }catch(e2){ OUT.mic=false; throw e2; } }
    OUT.mic=false; throw e;
  }
}
function micDone(){ OUT.mic=false; try{ if(navigator.audioSession) navigator.audioSession.type="playback"; }catch(e){} if(OUT.el) outputPlay(); }
function micError(e){
  const ios=isIOS();
  if(e&&e.name==="NoMedia") return "Ce navigateur ne donne pas accès au micro. Ouvrez l'application dans Safari (iPhone) ou Chrome (Android).";
  if(e&&(e.name==="NotAllowedError"||e.name==="SecurityError")) return ios?"Micro refusé. Sur iPhone : touchez « aA » dans la barre d'adresse › Réglages du site web › Micro › Autoriser (ou Réglages › Safari › Micro), puis réessayez.":"Micro refusé : autorisez le micro pour ce site (icône à gauche de l'adresse), puis réessayez.";
  if(e&&e.name==="NotFoundError") return "Aucun micro trouvé sur cet appareil.";
  if(e&&e.name==="NotReadableError") return "Le micro est déjà utilisé par une autre application (appel, dictaphone…).";
  return "Micro indisponible ("+((e&&e.name)||"erreur")+").";
}
function resumeAC(){ const ac=audio(); return Promise.race([ac.resume().catch(()=>{}),new Promise(r=>setTimeout(r,500))]); }
async function recorder(ac,src){
  const chunks=[];
  if(ac.audioWorklet&&window.AudioWorkletNode){
    try{
      if(!recorder.loaded){
        const code="class R extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c)this.port.postMessage({t:currentTime,d:c.slice(0)});return true;}}registerProcessor('banda-rec',R);";
        await ac.audioWorklet.addModule(URL.createObjectURL(new Blob([code],{type:"application/javascript"}))); recorder.loaded=true; }
      const n=new AudioWorkletNode(ac,"banda-rec",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      n.port.onmessage=e=>chunks.push(e.data);
      const g=ac.createGain(); g.gain.value=0; src.connect(n); n.connect(g); g.connect(ac.destination);
      return {chunks,stop(){ try{ src.disconnect(n); n.disconnect(); g.disconnect(); }catch(e){} }};
    }catch(e){ console.warn("worklet",e); }
  }
  const sp=ac.createScriptProcessor(2048,1,1), g=ac.createGain(); g.gain.value=0;
  sp.onaudioprocess=e=>{ const d=e.inputBuffer.getChannelData(0); chunks.push({t:e.playbackTime-2*2048/ac.sampleRate,d:new Float32Array(d)}); };
  src.connect(sp); sp.connect(g); g.connect(ac.destination);
  return {chunks,stop(){ try{ src.disconnect(sp); sp.disconnect(); g.disconnect(); }catch(e){} }};
}
async function measureLatency(onStep){
  const micP=micStream(); micP.catch(()=>{});   // demandé tout de suite, dans le geste
  const ac=audio(); await resumeAC(); outputPlay();
  if(S.playing) pause();
  let stream;
  try{ stream=await micP; }catch(e){ const x=new Error("micro"); x.mic=e; throw x; }
  try{
  const track=stream.getAudioTracks()[0];
  const src=ac.createMediaStreamSource(stream); const rec=await recorder(ac,src);
  const sr=ac.sampleRate, h=chirp(sr), buf=ac.createBuffer(1,h.length,sr); buf.getChannelData(0).set(h);
  const offs=[0,0.55,1.35,1.9,2.95,3.5], t0=ac.currentTime+0.5, g=ac.createGain(); g.gain.value=0.9; g.connect(master);
  offs.forEach(o=>{ const b=ac.createBufferSource(); b.buffer=buf; b.connect(g); b.start(t0+o); });
  const total=offs[offs.length-1]+2.9;
  await new Promise(r=>{ const st=performance.now(); const iv=setInterval(()=>{ const x=(performance.now()-st)/1000/(total+0.5); if(onStep) onStep(Math.min(1,x)); if(x>=1){ clearInterval(iv); r(); } },100); });
  rec.stop(); g.disconnect();
  let inLat=0.012; try{ const sl=track.getSettings().latency; if(typeof sl==="number"&&sl>0&&sl<0.2) inLat=sl; }catch(e){}
  stream.getTracks().forEach(t=>t.stop());
  return analyseLatency(rec.chunks,h,t0,offs,sr,inLat);
  } finally { try{ stream.getTracks().forEach(t=>t.stop()); }catch(e){} micDone(); }
}
function analyseLatency(chunks,h,t0,offs,sr,inLat){
  if(!chunks.length) throw new Error("rien");
  // chaque bloc est rangé à sa date (des blocs peuvent manquer : on laisse un blanc au lieu de décaler la suite)
  const r0=chunks[0].t, last=chunks[chunks.length-1]; const n=Math.round((last.t-r0)*sr)+last.d.length;
  const y=new Float32Array(n); chunks.forEach(c=>{ const p=Math.round((c.t-r0)*sr); if(p>=0&&p+c.d.length<=n) y.set(c.d,p); });
  let N=1; while(N<n+h.length) N<<=1;
  const ar=new Float64Array(N), ai=new Float64Array(N), br=new Float64Array(N), bi=new Float64Array(N);
  ar.set(y); br.set(h); fftc(ar,ai,false); fftc(br,bi,false);
  for(let i=0;i<N;i++){ const r=ar[i]*br[i]+ai[i]*bi[i], im=ai[i]*br[i]-ar[i]*bi[i]; ar[i]=r; ai[i]=im; }   // y ⋆ h
  fftc(ar,ai,true);
  const env=new Float32Array(n); for(let i=0;i<n;i++) env[i]=Math.abs(ar[i]);
  const ms=Math.floor(sr/1000), nb=Math.floor(n/ms), bins=new Float32Array(nb);
  for(let b=0;b<nb;b++){ let m=0; for(let i=b*ms;i<(b+1)*ms;i++) if(env[i]>m) m=env[i]; bins[b]=m; }
  const sorted=Array.from(bins).sort((a,b)=>a-b), noise=sorted[Math.floor(nb*0.5)]||1e-9;
  let best=-1,bl=0;
  for(let lag=0;lag<=2500;lag++){ let sc=0;
    for(const o of offs){ const b=Math.round((t0+o-r0)*1000)+lag; if(b>=0&&b<nb) sc+=Math.sqrt(bins[b]); }
    if(sc>best){ best=sc; bl=lag; } }
  const lags=[];
  for(const o of offs){
    const c=Math.round((t0+o-r0+bl/1000)*sr); let bi2=-1,bv=0;
    for(let i=Math.max(0,c-12*ms);i<Math.min(n,c+12*ms);i++) if(env[i]>bv){ bv=env[i]; bi2=i; }
    if(bi2>=0 && bv>noise*8) lags.push((r0+bi2/sr)-(t0+o));
  }
  if(lags.length<4) throw new Error("faible");
  lags.sort((a,b)=>a-b); const med=lags[Math.floor(lags.length/2)];
  const good=lags.filter(l=>Math.abs(l-med)<0.006);
  if(good.length<4) throw new Error("instable");
  const rt=good.reduce((a,b)=>a+b,0)/good.length;
  return {ms:Math.max(0,(rt-inLat)*1000), rt:rt*1000, n:good.length};
}
async function runLatency(){
  const btn=$("latBtn"), info=$("latInfo"); if(btn.disabled) return;
  btn.disabled=true; const old=btn.textContent;
  try{
    let r;
    try{ r=await measureLatency(x=>{ btn.textContent="Écoute… "+Math.round(x*100)+" %"; }); }
    catch(e){ if(e.message!=="faible"&&e.message!=="instable") throw e;   // un raté (bruit, à-coup du téléphone) : on refait une fois
      r=await measureLatency(x=>{ btn.textContent="2e essai… "+Math.round(x*100)+" %"; }); }
    setLead(r.ms); toast("Retard mesuré : "+Math.round(r.ms)+" ms",3500);
  }catch(e){
    const m={micro:micError(e.mic),faible:"Je n'ai pas bien entendu les bips : montez le volume, rapprochez le téléphone de l'enceinte, et recommencez dans le calme.",instable:"Mesure instable (bruit ?) : recommencez dans le calme.",rien:"Le micro n'a rien enregistré."}[e.message]||("Mesure impossible : "+e.message);
    toast(m,5000);
  } finally { btn.disabled=false; btn.textContent=old; latInfo(); }
}
