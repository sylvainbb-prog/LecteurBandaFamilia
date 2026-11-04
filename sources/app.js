"use strict";
/* =====================================================================
   Utilities
   ===================================================================== */
const $ = id => document.getElementById(id);
function toast(msg, ms=2600){ const t=$("toast"); t.textContent=msg; t.style.display="block"; clearTimeout(t._h); t._h=setTimeout(()=>t.style.display="none", ms); }
function store(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v);}catch(e){ return null; } }
function folderIdFrom(s){ s=(s||"").trim(); const m=s.match(/folders\/([A-Za-z0-9_-]+)/)||s.match(/[?&]id=([A-Za-z0-9_-]+)/); return m?m[1]:s; }
function cfg(){ const c=window.BANDA_CONFIG||{}; return { apiKey: c.apiKey || store("banda.key") || "", folderId: folderIdFrom(c.folderId || store("banda.folder") || "") }; }

/* =====================================================================
   Google Drive
   ===================================================================== */
async function driveList(folderId){
  const {apiKey}=cfg();
  const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  let files=[], token="";
  do{
    const url=`https://www.googleapis.com/drive/v3/files?q=${q}&key=${apiKey}&pageSize=200&orderBy=name&fields=nextPageToken,files(id,name,mimeType,modifiedTime)${token?"&pageToken="+token:""}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
    const r=await fetch(url);
    if(!r.ok) throw new Error("Drive "+r.status+" : "+(await r.text()).slice(0,200));
    const j=await r.json(); files=files.concat(j.files||[]); token=j.nextPageToken||"";
  }while(token);
  return files;
}
async function driveDownload(id){
  const {apiKey}=cfg();
  const r=await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${apiKey}&supportsAllDrives=true`);
  if(!r.ok) throw new Error("Téléchargement impossible ("+r.status+")");
  return await r.arrayBuffer();
}
const SCORE_EXT=/\.(mxl|musicxml|xml)$/i;
/* ---------- bibliothèque : morceaux hébergés avec l'application (morceaux/songs.json), sinon Google Drive ---------- */
function cleanTitle(n){ return n.replace(SCORE_EXT,"").replace(/^\s*\d+\s*[-–.)]\s*/,"").replace(/\s*[-–]?\s*(v\s?\d+|modif\.?\s*\d+|version\s*\d+|banda\s*v\d+)\s*$/i,"").replace(/_/g," ").replace(/\s+/g," ").trim(); }
function songNum(n){ const m=n.match(/^\s*(\d+)/); return m?m[1]:""; }
function songCard(name,sub,onclick,i,title){
  const b=document.createElement("button"); b.className="song"; b.style.animationDelay=(i*0.03)+"s";
  b.innerHTML=`<span class="num"></span><span class="t"><b></b></span><svg class="go"><use href="#i-chev"/></svg>`;
  b.querySelector(".num").innerHTML=songNum(name)||'<svg class="sm"><use href="#i-note"/></svg>';
  const t=title||cleanTitle(name); b.querySelector("b").textContent=t; b.title=t+(sub?" · "+sub:""); b.dataset.q=(t+" "+name).toLowerCase();
  b.onclick=onclick; return b;
}
async function loadLibrary(){
  const box=$("songs"); box.innerHTML=""; S.lib=[];
  if(/^https?:/.test(location.protocol)){
    // 1) la liste fournie (titres propres)
    let list=[];
    try{ const r=await fetch("morceaux/songs.json",{cache:"no-cache"}); if(r.ok) list=await r.json(); }catch(e){}
    // 2) sur GitHub Pages : on ajoute les fichiers déposés dans « morceaux » qui ne sont pas encore dans la liste
    const gh=location.hostname.match(/^([^.]+)\.github\.io$/);
    if(gh){ try{
      const repo=location.pathname.split("/").filter(Boolean)[0]||gh[1]+".github.io";
      const r=await fetch("https://api.github.com/repos/"+gh[1]+"/"+repo+"/contents/morceaux");
      if(r.ok){ const files=(await r.json()).filter(f=>SCORE_EXT.test(f.name)).map(f=>f.name), present=new Set(files);
        list=list.filter(x=>present.has(x.file));                          // morceau supprimé du dossier : il disparaît de la liste
        const known=new Set(list.map(x=>x.file));
        files.filter(n=>!known.has(n)).forEach(n=>list.push({name:n,title:cleanTitle(n),file:n})); }   // morceau ajouté : il apparaît
    }catch(e){} }
    if(list.length){
      list.sort((a,b)=>(a.name||a.file).localeCompare(b.name||b.file,"fr",{numeric:true}));
      list.forEach((it,i)=>{ const url="morceaux/"+encodeURIComponent(it.file); S.lib.push({title:it.title,url});
        box.appendChild(songCard(it.name||it.file,it.parts?it.parts+" parties":"Partition",()=>openUrlSong(url,it.title),i,it.title)); });
      $("libInfo").textContent=list.length+" morceaux"; filterSongs(); return;
    }
  }
  const {apiKey, folderId}=cfg();
  if(!apiKey || !folderId){ $("libInfo").innerHTML="Aucun morceau trouvé : ouvre un fichier .mxl de l'appareil, ou configure Google Drive dans ⚙."; return; }
  $("libInfo").textContent="Lecture du Drive…";
  try{
    const items=await driveList(folderId);
    const folders=items.filter(f=>f.mimeType==="application/vnd.google-apps.folder");
    const loose=items.filter(f=>SCORE_EXT.test(f.name));
    $("libInfo").textContent=(folders.length+loose.length)+" morceaux";
    let i=0;
    for(const f of folders) box.appendChild(songCard(f.name,"Google Drive",()=>openSongFolder(f),i++));
    for(const f of loose) box.appendChild(songCard(f.name,"Fichier",()=>openDriveFile(f, cleanTitle(f.name)),i++));
    if(!folders.length && !loose.length) $("libInfo").textContent="Dossier vide ou non partagé.";
    filterSongs();
  }catch(e){
    console.error(e);
    $("libInfo").innerHTML="Impossible de lire le Drive : "+e.message+"<br>Vérifie la clé, le partage du dossier « Tous les utilisateurs disposant du lien », ou ouvre la page depuis un lien web.";
  }
}
/* ---------- hors connexion : tout télécharger d'avance (morceaux + sons des instruments) ---------- */
async function prepareOffline(){
  if(!("serviceWorker" in navigator) || !navigator.serviceWorker.controller){ toast("Le mode hors connexion fonctionne une fois l'application mise en ligne (adresse https)",4500); return; }
  if(!S.lib.length){ toast("Aucun morceau à préparer"); return; }
  try{ if(navigator.storage&&navigator.storage.persist) await navigator.storage.persist(); }catch(e){}
  const btn=$("offlineBtn"); btn.disabled=true; const fonts=new Set(); let n=0;
  const q=sfQuality();
  for(const it of S.lib){
    btn.lastChild.textContent=" Morceaux "+(++n)+"/"+S.lib.length;
    try{ const r=await fetch(it.url); const xml=await bufferToXml(await r.arrayBuffer(),it.url); const m=buildModel(xml);
      m.parts.forEach(P=>{ if(!P.hidden) fonts.add(P.isDrum?"percussion":instrumentFor(P)); }); }catch(e){ console.warn(it.url,e); }
  }
  let k=0;
  for(const f of fonts){ btn.lastChild.textContent=" Sons "+(++k)+"/"+fonts.size;
    try{ await fetchFontText(q,f); }catch(e){} }
  btn.disabled=false; btn.lastChild.textContent=" Prêt hors connexion ✓";
  toast("Tout est prêt : les "+S.lib.length+" morceaux et leurs sons fonctionnent sans connexion",4500);
}
async function openUrlSong(url,title){
  showPlayer(); showLoading("Chargement de "+title+"…");
  try{ const r=await fetch(url); if(!r.ok) throw new Error(r.status); await openBuffer(await r.arrayBuffer(), url.split("/").pop(), title); }
  catch(e){ hideLoading(); toast("Morceau introuvable : "+e.message,4000); }
}
function filterSongs(){ const q=($("songSearch").value||"").toLowerCase().trim(); document.querySelectorAll("#songs .song").forEach(b=>b.classList.toggle("off",!!q&&!b.dataset.q.includes(q))); }
async function openSongFolder(f){
  showLoading("Recherche de la partition…");
  try{
    const files=await driveList(f.id);
    const pick=files.find(x=>/\.mxl$/i.test(x.name))||files.find(x=>/\.musicxml$/i.test(x.name))||files.find(x=>/\.xml$/i.test(x.name));
    if(!pick){
      hideLoading();
      const hasMscz=files.some(x=>/\.mscz$/i.test(x.name));
      toast(hasMscz?"Ce dossier n'a que le .mscz : ajoute l'export MusicXML (.mxl).":"Aucune partition dans ce dossier.",4000);
      return;
    }
    await openDriveFile(pick, f.name);
  }catch(e){ hideLoading(); toast(e.message,5000); }
}
async function openDriveFile(file, title){
  showLoading("Téléchargement…");
  try{ const buf=await driveDownload(file.id); await openBuffer(buf, file.name, title); }
  catch(e){ hideLoading(); toast(e.message,5000); }
}

/* =====================================================================
   MusicXML reading (.mxl zip or plain)
   ===================================================================== */
let LAST_LAYOUT=null;   // mise en page des parties séparées (fichier banda-layout.json dans le .mxl)
async function bufferToXml(buf, name){
  LAST_LAYOUT=null;
  const u8=new Uint8Array(buf);
  if(u8[0]===0x50 && u8[1]===0x4b){
    const zip=await JSZip.loadAsync(buf);
    let path=null;
    const cont=zip.file("META-INF/container.xml");
    if(cont){ const c=new DOMParser().parseFromString(await cont.async("string"),"application/xml");
      const rf=c.querySelector("rootfile"); if(rf) path=rf.getAttribute("full-path"); }
    if(!path){ path=Object.keys(zip.files).find(p=>/\.(xml|musicxml)$/i.test(p)&&!p.startsWith("META-INF")); }
    if(!path) throw new Error("Archive MusicXML invalide");
    if(/\.mscx$/i.test(path)) throw new Error("C'est un fichier MuseScore (.mscz) : exporte-le en MusicXML.");
    LAST_LAYOUT=null; const lf=zip.file("banda-layout.json"); if(lf){ try{ LAST_LAYOUT=JSON.parse(await lf.async("string")); }catch(e){} }
    return await zip.file(path).async("string");
  }
  return new TextDecoder("utf-8").decode(u8);
}

/* ---------- transposition helpers ---------- */
const STEPS="CDEFGAB", NAT=[0,2,4,5,7,9,11];
const TRANSP_BY_SOUND=[
  [/saxophone\.alto|alto-saxophone/i,-5,-9],[/saxophone\.baritone|baritone-saxophone/i,-12,-21],
  [/saxophone\.tenor|tenor-saxophone/i,-8,-14],[/saxophone\.soprano/i,-1,-2],
  [/clarinet\.bass/i,-8,-14],[/clarinet(\.bflat)?$|clarinet\.bflat|bb-clarinet/i,-1,-2],
  [/trumpet(\.bflat)?$|trumpet\.bflat|bb-trumpet|cornet|flugelhorn/i,-1,-2],
  [/french-horn|horn\.french/i,-4,-7],[/sousaphone/i,-8,-14]
];
const TRANSP_BY_NAME=[
  [/sax.*alt|alt.*sax/i,-5,-9],[/sax.*bar|bar.*sax|baryton/i,-12,-21],[/sax.*t[ée]n|t[ée]n.*sax|tenor/i,-8,-14],
  [/soprano/i,-1,-2],[/clarinet|clarinette/i,-1,-2],[/trompette|trumpet|bugle|cornet/i,-1,-2],
  [/cor\b|horn/i,-4,-7],[/sousaphone/i,-8,-14]
];
const TREBLE_WRITTEN=/sax|clarinet|clarinette|trompette|trumpet|bugle|cornet|cor\b|horn/i;
function fifthsDelta(dia, chr){ for(let d=-11; d<=11; d++){ if(((d*7-chr)%12+12)%12===0 && ((d*4-dia)%7+7)%7===0) return d; } return 0; }

/* =====================================================================
   Score model
   ===================================================================== */
/* MuseScore recopie dans chaque mesure « % » les textes de la mesure d'origine (repères, nuances…) : on retire ces doublons */
/* mode « défilement » : la partition est déroulée dans l'ordre réellement joué (reprises, 1re/2e fois, D.S., coda),
   pour une lecture parfaitement linéaire. Une mesure jouée plusieurs fois apparaît plusieurs fois. */
function unrollForLine(doc,root){
  const pe=root.querySelector("score-partwise > part"); if(!pe||!S.seq) return;
  const ms=[...pe.querySelectorAll(":scope > measure")];
  // attributs en vigueur au début de chaque mesure (armure, mesure, clé, divisions)
  const state={}, snap=[], mrl=[]; let len=0;
  ms.forEach((me,mi)=>{
    snap[mi]={...state};
    const at=me.querySelector(":scope > attributes");
    if(at) ["divisions","key","time","clef","transpose"].forEach(t=>{ const e=at.querySelector(":scope > "+t); if(e) state[t]=e; });
    const mr=me.querySelector("attributes > measure-style > measure-repeat");
    if(mr){ if(mr.getAttribute("type")==="start") len=parseInt(mr.textContent)||1; else len=0; }
    mrl[mi]=len;
  });
  const seen=new Set(), out=[];
  S.seq.forEach((e,k)=>{
    const c=ms[e.mi].cloneNode(true);
    c.setAttribute("number",String(k+1)); c.removeAttribute("implicit");
    c.querySelectorAll(":scope > print").forEach(x=>x.remove());
    // plus de reprises ni de renvois : on joue tout droit
    c.querySelectorAll(":scope > barline").forEach(b=>{ b.querySelectorAll("repeat,ending,segno,coda").forEach(x=>x.remove()); if(!b.querySelector("bar-style")) b.remove(); else if(b.querySelector("bar-style").textContent==="heavy-light") b.querySelector("bar-style").textContent="light-light"; });
    // repères de structure gardés pour s'y retrouver avec la partie papier :
    //  § et ⊕ toujours ; « D.S. / D.C. » et « To Coda » seulement là où l'on saute vraiment ; « Fine » à la toute fin
    const nx=S.seq[k+1], last=k===S.seq.length-1, MM=S.model.meas;
    const segI=MM.findIndex(m=>m.segno); let codaI=-1; MM.forEach((m,i)=>{ if(m.coda&&i>0) codaI=i; });
    // le D.S. / D.C. n'a lieu qu'une fois : le DERNIER retour depuis cette mesure (les précédents sont de simples reprises)
    let dsK=-1; S.seq.forEach((x,j)=>{ const y=S.seq[j+1]; if(y&&x.mi===e.mi&&y.mi!==x.mi+1&&(y.mi===segI||y.mi===0)) dsK=j; });
    const toSeg=k===dsK, toCoda=!!nx&&nx.mi!==e.mi+1&&nx.mi===codaI;
    c.querySelectorAll(":scope > direction").forEach(d=>{
      const w=[...d.querySelectorAll("words")].map(x=>x.textContent).join(" ");
      if(d.querySelector("direction-type > segno,direction-type > coda")||d.querySelector("sound[segno],sound[coda]")) return;
      if(d.querySelector("sound[tocoda]")||/^\s*(to ?coda|al coda)/i.test(w)){ if(!toCoda) d.remove(); return; }
      if(d.querySelector("sound[dalsegno],sound[dacapo]")||/^\s*d\.?\s?[cs]\.?/i.test(w)){ if(!toSeg) d.remove(); return; }
      if(d.querySelector("sound[fine]")||/^\s*fine\b/i.test(w)){ if(!last) d.remove(); return; }
      if(seen.has(e.mi) && d.querySelector("rehearsal,metronome")) d.remove(); });
    c.querySelectorAll("attributes > measure-style > measure-repeat").forEach(x=>{ const st=x.parentNode; x.remove(); if(!st.children.length) st.remove(); });
    // après un saut : on redonne armure / mesure / clé en vigueur
    const prev=k>0?S.seq[k-1].mi:-1;
    if(k>0 && prev!==e.mi-1){ let at=c.querySelector(":scope > attributes");
      if(!at){ at=doc.createElement("attributes"); c.insertBefore(at,c.firstChild); }
      ["divisions","key","time","transpose","clef"].forEach(t=>{ if(!at.querySelector(":scope > "+t) && snap[e.mi][t]) at.appendChild(snap[e.mi][t].cloneNode(true)); });
      const ORDER=["footnote","level","divisions","key","time","staves","part-symbol","instruments","clef","staff-details","transpose","directive","measure-style"];
      [...at.children].sort((a,b)=>ORDER.indexOf(a.tagName)-ORDER.indexOf(b.tagName)).forEach(x=>at.appendChild(x)); }
    // défilement : jamais de signe % ; on écrit toujours les notes à jouer (MuseScore les exporte déjà dans la mesure)
    seen.add(e.mi); out.push(c);
  });
  ms.forEach(m=>m.remove()); out.forEach(c=>pe.appendChild(c));
}
function cleanRepeatCopies(doc){
  const sig=d=>{ const c=d.cloneNode(true); c.querySelectorAll("*").forEach(e=>{ ["default-x","default-y","relative-x","relative-y"].forEach(a=>e.removeAttribute(a)); }); return c.textContent.replace(/\s+/g," ").trim()+"|"+[...c.querySelectorAll("direction-type > *")].map(e=>e.tagName+":"+[...e.children].map(x=>x.tagName).join(",")).join(";"); };
  doc.querySelectorAll("score-partwise > part").forEach(pe=>{
    const ms=[...pe.querySelectorAll(":scope > measure")]; let len=0;
    const orig=ms.map(me=>new Set([...me.querySelectorAll(":scope > direction")].map(sig)));
    ms.forEach((me,i)=>{
      const mr=me.querySelector("attributes > measure-style > measure-repeat");
      if(mr){ if(mr.getAttribute("type")==="start") len=parseInt(mr.textContent)||1; else if(mr.getAttribute("type")==="stop") len=0; }
      if(!len||i<len) return;
      const have=orig[i-len];
      me.querySelectorAll(":scope > direction").forEach(d=>{ if(have.has(sig(d))) d.remove(); });
    });
  });
}
function buildModel(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,"application/xml");
  cleanRepeatCopies(doc);
  if(doc.querySelector("parsererror")) throw new Error("MusicXML illisible");
  const root=doc.documentElement;
  if(root.nodeName!=="score-partwise") throw new Error("Seul le format MusicXML « partwise » est géré");
  const concert=!!root.querySelector("defaults > concert-score, concert-score");
  const title=(root.querySelector("work > work-title")||root.querySelector("movement-title")||{}).textContent||"";
  const parts=[];
  const scoreParts=[...root.querySelectorAll("part-list > score-part")];
  for(const sp of scoreParts){
    const id=sp.getAttribute("id");
    const name=(sp.querySelector("part-name")||{}).textContent||id;
    const sounds=[...sp.querySelectorAll("instrument-sound")].map(e=>e.textContent).join(" ");
    const mi=sp.querySelector("midi-instrument");
    const program=mi&&mi.querySelector("midi-program")?parseInt(mi.querySelector("midi-program").textContent):1;
    const channel=mi&&mi.querySelector("midi-channel")?parseInt(mi.querySelector("midi-channel").textContent):1;
    const unp={}; sp.querySelectorAll("midi-instrument").forEach(m=>{ const u=m.querySelector("midi-unpitched"); if(u) unp[m.getAttribute("id")]=parseInt(u.textContent)-1; });
    parts.push({id,name,sounds,program,channel,unp,isDrum:channel===10||sounds.includes("drum")||Object.keys(unp).length>2,events:[],transpose:null});
  }
  const partEls=[...root.querySelectorAll(":scope > part")];
  const nMeas=Math.max(...partEls.map(p=>p.querySelectorAll(":scope > measure").length));
  const meas=[];
  for(let i=0;i<nMeas;i++) meas.push({idx:i,number:"",len:0,timeLen:4,beats:4,beatType:4,tempo:null,marks:[],
    repStart:false,repEnd:false,repTimes:2,ending:null,endingStop:false,segno:false,coda:false,tocoda:false,dalsegno:false,dacapo:false,fine:false});
  partEls.forEach((pe,pi)=>{
    const P=parts.find(p=>p.id===pe.getAttribute("id"))||parts[pi];
    const sd=pe.querySelector(":scope > measure staff-details[print-object='no']"); P.hidden=!!sd;
    let div=1, beats=4, btype=4, transp=null, mrep=0, dyn=89;   // nuance courante (89 = mf)
    const ms=[...pe.querySelectorAll(":scope > measure")];
    const openTies={};
    ms.forEach((me,mi)=>{
      const M=meas[mi]; if(!M.number) M.number=me.getAttribute("number")||String(mi+1);
      let t=0, maxT=0, lastStart=0; const evs=[]; let hasNotes=false;
      for(const el of me.children){
        switch(el.nodeName){
          case "attributes":{
            const d=el.querySelector("divisions"); if(d) div=parseFloat(d.textContent);
            const tm=el.querySelector("time"); if(tm&&tm.querySelector("beats")){ beats=parseInt(tm.querySelector("beats").textContent); btype=parseInt(tm.querySelector("beat-type").textContent); }
            const tr=el.querySelector("transpose"); if(tr){ transp={dia:parseInt((tr.querySelector("diatonic")||{}).textContent||0),chr:parseInt((tr.querySelector("chromatic")||{}).textContent||0),oct:parseInt((tr.querySelector("octave-change")||{}).textContent||0)}; P.transpose=transp; }
            const ms_=el.querySelector("measure-style > measure-repeat");
            if(ms_){ if(ms_.getAttribute("type")==="start") mrep=parseInt(ms_.textContent||"1")||1; else mrep=0; }
            break; }
          case "backup": t-=parseFloat(el.querySelector("duration").textContent)/div; break;
          case "forward": t+=parseFloat(el.querySelector("duration").textContent)/div; maxT=Math.max(maxT,t); break;
          case "direction":{
            const s=el.querySelector("sound");
            { const sd=s&&s.getAttribute("dynamics"); if(sd) dyn=parseFloat(sd);
              else { const dy=el.querySelector("dynamics > *"); const DY={ppp:25,pp:36,p:54,mp:71,mf:89,f:106,ff:124,fff:141,sf:120,sfz:120,fp:106};
                if(dy&&DY[dy.nodeName]) dyn=DY[dy.nodeName]; } }
            if(s){ readSound(s,M,t); }
            el.querySelectorAll("rehearsal").forEach(r=>{ const tx=r.textContent.trim(); if(tx&&!M.marks.includes(tx)) M.marks.push(tx); });
            if(el.querySelector("segno")) M.segno=true;
            if(el.querySelector("coda")) M.coda=M.coda||!s||!s.getAttribute("tocoda");
            const words=[...el.querySelectorAll("words")].map(w=>w.textContent).join(" ");
            if(/to\s*coda|vers la coda/i.test(words)) M.tocoda=true;
            if(/d\.?\s*s\.?/i.test(words)&&/coda|fine/i.test(words)) M.dalsegno=true;
            if(/d\.?\s*c\.?/i.test(words)) M.dacapo=true;
            if(/^\s*fine\s*$/i.test(words)) M.fine=true;
            break; }
          case "sound": readSound(el,M,t); break;
          case "barline":{
            const rp=el.querySelector("repeat");
            if(rp){ if(rp.getAttribute("direction")==="forward") M.repStart=true; else { M.repEnd=true; if(rp.getAttribute("times")) M.repTimes=parseInt(rp.getAttribute("times")); } }
            const en=el.querySelector("ending");
            if(en){ const ty=en.getAttribute("type"); if(ty==="start") M.ending=(en.getAttribute("number")||"1").split(/[ ,]+/).map(Number); else M.endingStop=true; }
            if(el.querySelector("segno")) M.segno=true;
            if(el.querySelector("coda")) M.coda=true;
            break; }
          case "note":{
            if(el.querySelector("grace")||el.querySelector("cue")) break;
            const isChord=!!el.querySelector(":scope > chord");
            const dur=el.querySelector(":scope > duration")?parseFloat(el.querySelector(":scope > duration").textContent)/div:0;
            const start=isChord?lastStart:t;
            if(!isChord){ lastStart=t; t+=dur; maxT=Math.max(maxT,t); }
            if(el.querySelector(":scope > rest")) break;
            hasNotes=true;
            let midi=null, drumKey=null;
            const p=el.querySelector(":scope > pitch");
            if(p){
              const st=p.querySelector("step").textContent, al=parseFloat((p.querySelector("alter")||{}).textContent||0), oc=parseInt(p.querySelector("octave").textContent);
              midi=12*(oc+1)+NAT[STEPS.indexOf(st)]+al;
              if(!concert && transp) midi+=transp.chr+12*transp.oct;
            }else{
              const ins=el.querySelector(":scope > instrument");
              if(ins && P.unp[ins.getAttribute("id")]!==undefined) drumKey=P.unp[ins.getAttribute("id")];
              else drumKey=38;
            }
            const ties=[...el.querySelectorAll(":scope > tie")].map(x=>x.getAttribute("type"));
            const key=midi!==null?"p"+midi:"d"+drumKey;
            if(ties.includes("stop") && openTies[key]){
              openTies[key].dur+=dur;
              if(!ties.includes("start")) delete openTies[key];
              break;
            }
            const ev={m:mi,off:start,dur,midi,drum:drumKey,vel:Math.min(1,0.22+dyn/165)};
            if(el.querySelector("accent")) ev.vel=Math.min(1.1,ev.vel+0.15);
            if(el.querySelector("strong-accent")) ev.vel=Math.min(1.15,ev.vel+0.22);
            if(el.querySelector("staccato,staccatissimo")) ev.stacc=true;
            evs.push(ev);
            if(ties.includes("start")) openTies[key]=ev;
            break; }
        }
      }
      // measure repeat : copy the content of the measure(s) before
      if(mrep && !hasNotes && mi>=mrep){
        const src=P.events.filter(e=>e.m===mi-mrep);
        for(const e of src) evs.push({...e,m:mi});
      }
      P.events.push(...evs);
      M.len=Math.max(M.len,maxT);
      M.timeLen=beats*4/btype; M.beats=beats; M.beatType=btype;
    });
  });
  // measure lengths : actual content (pickups) but never empty
  for(const M of meas){ if(M.len<=0.001) M.len=M.timeLen; if(Math.abs(M.len-M.timeLen)<0.01) M.len=M.timeLen; }
  // tempo
  let tempo=120; for(const M of meas){ if(M.tempo) tempo=M.tempo; M.tempo=tempo; }
  // ending ranges
  for(let i=0;i<meas.length;i++){ if(meas[i].ending){ let j=i; while(j<meas.length-1 && !meas[j].endingStop && !meas[j].repEnd && !(j>i&&meas[j].ending)) j++; meas[i].endingEnd=j; } }
  // instrument transposition when the file is written in concert pitch
  parts.forEach(P=>{
    if(!P.transpose){
      const r=TRANSP_BY_SOUND.find(x=>x[0].test(P.sounds))||TRANSP_BY_NAME.find(x=>x[0].test(P.name));
      if(r) P.inferredTranspose={dia:r[1],chr:r[2]};
    }
  });
  return {doc,concert,title,parts,meas};
}
function readSound(s,M,t){
  const tp=s.getAttribute("tempo"); if(tp && (M.tempo===null||t<0.01)) M.tempo=parseFloat(tp);
  if(s.getAttribute("segno")) M.segno=true;
  if(s.getAttribute("coda")) M.coda=true;
  if(s.getAttribute("tocoda")) M.tocoda=true;
  if(s.getAttribute("dalsegno")) M.dalsegno=true;
  if(s.getAttribute("dacapo")==="yes") M.dacapo=true;
  if(s.getAttribute("fine")) M.fine=true;
}

/* ---------- play order (repeats, voltas, D.S. / D.C. al Coda / Fine) ---------- */
function playOrder(meas){
  const order=[]; const N=meas.length;
  const segnoIdx=meas.findIndex(m=>m.segno);
  let codaIdx=-1; meas.forEach((m,i)=>{ if(m.coda && i>0) codaIdx=i; });
  let i=0, afterJump=false, loopStart=0, passes={}, guard=0;
  while(i<N && guard++<20000){
    const M=meas[i];
    if(M.repStart && !afterJump) { if(loopStart!==i){ loopStart=i; if(!passes[i]) passes[i]=1; } }
    if(M.ending){
      const pass=afterJump?Math.max(...M.ending, 99):(passes[loopStart]||1);
      if(!M.ending.includes(pass) && !(afterJump && M.ending.includes(Math.max(...meas.filter(x=>x.ending).flatMap(x=>x.ending))))){
        i=(M.endingEnd??i)+1; continue;
      }
    }
    order.push(i);
    if(afterJump && M.tocoda && codaIdx>i){ i=codaIdx; continue; }
    if(afterJump && M.fine) break;
    if(M.repEnd && !afterJump){
      const p=passes[loopStart]||1;
      if(p<M.repTimes){ passes[loopStart]=p+1; i=loopStart; continue; }
      passes[loopStart]=1; loopStart=i+1;
    }
    if((M.dalsegno||M.dacapo) && !afterJump){ afterJump=true; i=M.dacapo?0:(segnoIdx>=0?segnoIdx:0); continue; }
    i++;
  }
  return order;
}

/* ---------- display XML : one part, written pitch for transposing instruments ---------- */
function displayXml(model, partIndex){
  const doc=model.doc.cloneNode(true);
  const root=doc.documentElement;
  const partEls=[...root.querySelectorAll(":scope > part")];
  // concert key along the score, read from the first non-transposing pitched part
  const refPi=model.parts.findIndex(P=>!P.inferredTranspose&&!P.transpose&&!P.isDrum);
  const refKeys=[];
  if(refPi>=0){ let cur=null; [...partEls[refPi].querySelectorAll(":scope > measure")].forEach((me,mi)=>{ const f=me.querySelector("key > fifths"); if(f) cur=parseInt(f.textContent); refKeys[mi]=cur; }); }
  const refKeyAt=mi=>refKeys[mi]===undefined?null:refKeys[mi];
  // transpose parts written in concert pitch
  partEls.forEach((pe,pi)=>{
    const P=model.parts[pi]; const tr=P&&P.inferredTranspose;
    if(!model.concert || !tr) return;
    const D=-tr.dia, C=-tr.chr, fd=fifthsDelta(tr.dia,tr.chr)*-1;
    pe.querySelectorAll("note > pitch").forEach(p=>{
      const st=p.querySelector("step"), alE=p.querySelector("alter"), oc=p.querySelector("octave");
      const si=STEPS.indexOf(st.textContent), o=parseInt(oc.textContent), al=parseFloat(alE?alE.textContent:0);
      const midi=12*(o+1)+NAT[si]+al;
      const abs=si+o*7+D, nsi=((abs%7)+7)%7, no=Math.floor(abs/7);
      const target=midi+C, nal=target-(12*(no+1)+NAT[nsi]);
      st.textContent=STEPS[nsi]; oc.textContent=no;
      if(nal===0){ if(alE) alE.remove(); }
      else { if(alE) alE.textContent=nal; else { const a=doc.createElement("alter"); a.textContent=nal; st.after(a); } }
    });
    pe.querySelectorAll("note > accidental").forEach(a=>a.remove());
    // written key = concert key (taken from a non-transposing part, more reliable) + interval
    pe.querySelectorAll(":scope > measure").forEach((me,mi)=>{
      me.querySelectorAll("key > fifths").forEach(f=>{
        const ref=refKeyAt(mi); let v=(ref!==null?ref:parseInt(f.textContent))+fd;
        while(v>7) v-=12; while(v<-7) v+=12; f.textContent=v; });
    });
    if(TREBLE_WRITTEN.test(P.name)||TREBLE_WRITTEN.test(P.sounds)){
      pe.querySelectorAll("attributes > clef").forEach(c=>{ const s=c.querySelector("sign"), l=c.querySelector("line"); if(s&&s.textContent==="F"){ s.textContent="G"; if(l) l.textContent="2"; } });
    }
  });
  const ce=root.querySelector("concert-score"); if(ce) ce.remove();
  // chord symbols in transposed parts would be wrong : remove them there
  partEls.forEach((pe,pi)=>{ const P=model.parts[pi]; if(model.concert && P && P.inferredTranspose) pe.querySelectorAll("harmony").forEach(h=>h.remove()); });
  // vue « ma partie » : on ne garde que ma partie ; les indications générales (§, ⊕, D.S., tempo, repères…) des autres parties y sont recopiées à leur place
  {
    const norm=t=>t.replace(/[§⊕\s\u200B]+/g," ").trim().toLowerCase();
    const keyOf=d=>norm(d.textContent)+"|"+[...d.querySelectorAll("direction-type > *")].map(e=>e.tagName).join(",");
    const isSys=d=>d.getAttribute("system")==="only-top"||d.querySelector("segno,coda,rehearsal,metronome")||d.querySelector("sound[dalsegno],sound[dacapo],sound[tocoda],sound[fine],sound[coda],sound[segno]");
    const durOf=e=>{ const d=e.querySelector(":scope > duration"); return d?parseFloat(d.textContent):0; };
    const times=me=>{ const out=[]; let t=0, last=0;
      for(const c of me.children){
        if(c.tagName==="note"){ const ch=c.querySelector(":scope > chord"), gr=c.querySelector(":scope > grace"); const st=ch?last:t; out.push([c,st]); if(!ch&&!gr){ last=t; t+=durOf(c); } }
        else if(c.tagName==="backup"){ t-=durOf(c); out.push([c,t]); }
        else if(c.tagName==="forward"){ out.push([c,t]); t+=durOf(c); }
        else out.push([c,t]);
      }
      return out; };
    const mine=partEls[partIndex], myMs=[...mine.querySelectorAll(":scope > measure")];
    partEls.forEach((pe,pi)=>{ if(pi===partIndex) return;
      [...pe.querySelectorAll(":scope > measure")].forEach((me,mi)=>{
        const tgt=myMs[mi]; if(!tgt) return;
        const have=new Set([...tgt.querySelectorAll(":scope > direction")].map(keyOf));
        times(me).forEach(([c,t])=>{
          if(c.tagName!=="direction"||!isSys(c)) return;
          const k=keyOf(c); if(have.has(k)) return; have.add(k);
          const cl=c.cloneNode(true); const tt=times(tgt);
          const at=tt.find(([x,tx])=>(x.tagName==="note"&&!x.querySelector("chord")&&tx>=t-1e-6));
          if(at) at[0].before(cl); else { const bl=tgt.querySelector(":scope > barline[location=right]"); if(bl) bl.before(cl); else tgt.appendChild(cl); }
        });
      });
    });
    // les crochets de 1re / 2e fois ne sont exportés que dans la 1re partie : on les recopie dans ma partie
    if(partIndex!==0){ const srcMs=[...partEls[0].querySelectorAll(":scope > measure")];
      srcMs.forEach((sm,mi)=>{ const tgt=myMs[mi]; if(!tgt) return;
        sm.querySelectorAll(":scope > barline").forEach(sb=>{ const ends=[...sb.querySelectorAll(":scope > ending")]; if(!ends.length) return;
          const loc=sb.getAttribute("location")||"right";
          let tb=[...tgt.querySelectorAll(":scope > barline")].find(b=>(b.getAttribute("location")||"right")===loc);
          if(!tb){ tb=doc.createElement("barline"); tb.setAttribute("location",loc);
            if(loc==="left"){ const after=[...tgt.children].find(c=>!["print","attributes"].includes(c.tagName)); after?after.before(tb):tgt.appendChild(tb); } else tgt.appendChild(tb); }
          if(tb.querySelector(":scope > ending")) return;
          ends.forEach(en=>{ const c=en.cloneNode(true); const rp=tb.querySelector(":scope > repeat"); rp?rp.before(c):tb.appendChild(c); }); }); }); }
    partEls.forEach((pe,pi)=>{ if(pi!==partIndex) pe.remove(); });
    const myId=mine.getAttribute("id");
    root.querySelectorAll("part-list > score-part").forEach(sp=>{ if(sp.getAttribute("id")!==myId) sp.remove(); });
    root.querySelectorAll("part-list > part-group").forEach(g=>g.remove());
  }
  // titre : jamais « Partition sans titre » ; on prend le titre du cadre MuseScore ou le nom du morceau
  const BAD_T=/^(|partition sans titre|untitled score|titre|title)$/i;
  let wt=root.querySelector("work > work-title"), mt=root.querySelector(":scope > movement-title");
  const creditTitle=[...root.querySelectorAll("credit")].filter(c=>{ const ty=c.querySelector("credit-type"); return ty&&ty.textContent.trim()==="title"; }).map(c=>c.querySelector("credit-words")).filter(Boolean).map(w=>w.textContent.trim())[0];
  const goodTitle=[mt&&mt.textContent.trim(), wt&&wt.textContent.trim()].find(t=>t&&!BAD_T.test(t)) || creditTitle || S.title || "";
  if(mt) mt.remove();
  if(!wt){ let w=root.querySelector(":scope > work"); if(!w){ w=doc.createElement("work"); root.insertBefore(w,root.firstElementChild); } wt=doc.createElement("work-title"); w.appendChild(wt); }
  wt.textContent=goodTitle;
  // keep credits / layout hints out of OSMD's way
  root.querySelectorAll("credit").forEach(c=>c.remove());
  root.querySelectorAll("direction").forEach(d=>{ const w=[...d.querySelectorAll("words")].map(x=>x.textContent).join(" "); if(w.length>60) d.remove(); });
  if(isLine()) unrollForLine(doc,root);
  // mesures « % » : MuseScore exporte les notes recopiées ; on les remplace par le signe de répétition, comme sur la partie imprimée
  S.repMeas={};
  { let len=0; const line0=isLine(); [...root.querySelectorAll("score-partwise > part > measure")].forEach((me,mi)=>{
      const mr=me.querySelector("attributes > measure-style > measure-repeat");
      if(mr){ if(mr.getAttribute("type")==="start") len=parseInt(mr.textContent)||1; else if(mr.getAttribute("type")==="stop") len=0;
        const ms=mr.parentNode; mr.remove(); if(!ms.children.length){ const at=ms.parentNode; ms.remove(); if(at&&!at.children.length) at.remove(); } }
      // défilement : la partition a été « déroulée » et les marques début/fin de répétition retirées ;
      // seule l'étiquette posée mesure par mesure compte (sinon le % se propageait à toutes les mesures suivantes)
      if(line0){ len=me.hasAttribute("data-rep")?(parseInt(me.getAttribute("data-rep"))||0):0; me.removeAttribute("data-rep"); }
      if(!len) return;
      let t=0,mx=0; for(const c of me.children){ const d=c.querySelector(":scope > duration"); const dv=d?parseFloat(d.textContent):0;
        if(c.tagName==="note"){ if(!c.querySelector("chord")&&!c.querySelector("grace")) t+=dv; } else if(c.tagName==="backup") t-=dv; else if(c.tagName==="forward") t+=dv; mx=Math.max(mx,t); }
      [...me.children].forEach(c=>{ if(["note","backup","forward","harmony"].includes(c.tagName)) c.remove(); });
      const n=doc.createElement("note"); n.setAttribute("print-object","no"); const r=doc.createElement("rest"); r.setAttribute("measure","yes"); n.appendChild(r);
      const d=doc.createElement("duration"); d.textContent=mx||1; n.appendChild(d); const v=doc.createElement("voice"); v.textContent="1"; n.appendChild(v);
      const bl=me.querySelector(":scope > barline[location=right]"); if(bl) bl.before(n); else me.appendChild(n);
      S.repMeas[mi]=len;
    }); }
  // mise en page « idem partition imprimée » : mêmes fins de ligne et mêmes silences multiples que la partie imprimée
  const idemSys=[];
  if(layoutMode()==="idem"){
    const L=S.layout&&S.layout.parts&&S.layout.parts[String(partIndex)];
    const myMs=[...root.querySelectorAll("score-partwise > part > measure")];
    let br=L?L.breaks:myMs.map((m,i)=>{ const p=m.querySelector(":scope > print"); return (i>0&&p&&(p.getAttribute("new-system")==="yes"||p.getAttribute("new-page")==="yes"))?i:-1; }).filter(i=>i>0);
    S.idemInfo={fromPart:!!L,systems:br.length+1};
    root.querySelectorAll("print").forEach(p=>{ p.removeAttribute("new-page"); p.removeAttribute("new-system"); });
    br.forEach(i=>{ const m=myMs[i]; if(!m) return; let p=m.querySelector(":scope > print"); if(!p){ p=doc.createElement("print"); m.insertBefore(p,m.firstChild); } p.setAttribute("new-system","yes"); });
    if(L&&L.mmrest) Object.entries(L.mmrest).forEach(([i,n])=>{ const m=myMs[+i]; if(!m) return;
      let at=m.querySelector(":scope > attributes"); if(!at){ at=doc.createElement("attributes"); const p=m.querySelector(":scope > print"); if(p) p.after(at); else m.insertBefore(at,m.firstChild); }
      const ms=doc.createElement("measure-style"), mr=doc.createElement("multiple-rest"); mr.textContent=n; ms.appendChild(mr); at.appendChild(ms); });
  } else
  root.querySelectorAll("print").forEach(p=>{ p.removeAttribute("new-page"); p.removeAttribute("new-system"); });
  // textes au-dessus de la portée : tout en « words » pour qu'OSMD les empile sans chevauchement
  const NOTE_SYM={whole:"𝅝",half:"𝅗𝅥",quarter:"♩",eighth:"♪"};
  const SYM_TXT={coda:"⊕",segno:"§",codaSquare:"⊕"};
  const mkWords=(txt,size)=>{ const w=doc.createElement("words"); w.textContent=txt; w.setAttribute("font-weight","bold"); if(size) w.setAttribute("font-size",size); return w; };
  // symboles MuseScore restés en balises (<sym>coda</sym>…) et mise en forme (<b>, <i>…)
  root.querySelectorAll("words").forEach(w=>{ let t=w.textContent;
    if(/<\/?[a-z]/i.test(t)){ t=t.replace(/<sym>([^<]*)<\/sym>/g,(m,n)=>SYM_TXT[n]!==undefined?SYM_TXT[n]:"").replace(/<[^>]+>/g,""); w.textContent=t.replace(/\s+/g," ").trim(); } });
  // segno / coda : en texte, empilés comme les autres
  root.querySelectorAll("direction-type > segno").forEach(x=>x.replaceWith(mkWords("§","30")));
  root.querySelectorAll("direction-type > coda").forEach(x=>x.replaceWith(mkWords("⊕","30")));
  // D.S., D.C., Fine, To Coda… : OSMD les dessine à part (et les superpose) ; on les rend en texte ordinaire
  root.querySelectorAll("direction-type > words").forEach(w=>{ const t=w.textContent.trim();
    if(/^(d\.?\s?[cs]\.?|da ?capo|dal ?segno|fine|coda|to ?coda|al ?coda)\b/i.test(t)||/\b(al (fine|coda))\b/i.test(t)){
      w.textContent=t.replace(/([A-Za-zÀ-ÿ])(?=[A-Za-zÀ-ÿ.])/g,"$1\u200B"); w.setAttribute("font-weight","bold"); w.setAttribute("font-style","italic"); w.setAttribute("font-size","18");
    } });
  // texte placé après la dernière note d'une mesure (D.S., Fine, To Coda…) : on l'accroche à cette dernière note
  root.querySelectorAll("direction").forEach(dir=>{ if(!dir.querySelector("words")) return;
    let nx=dir.nextElementSibling, hasNote=false;
    while(nx){ if(nx.tagName==="note"){ hasNote=true; break; } if(nx.tagName==="backup") break; nx=nx.nextElementSibling; }
    if(hasNote) return;
    let pv=dir.previousElementSibling, last=null;
    while(pv){ if(pv.tagName==="backup") break; if(pv.tagName==="note"&&!pv.querySelector("grace")){ last=pv; if(!pv.querySelector("chord")) break; } pv=pv.previousElementSibling; }
    if(last) last.before(dir); });
  root.querySelectorAll("direction-type > rehearsal").forEach(r=>{
    const w=doc.createElement("words"); w.textContent="【"+r.textContent.trim()+"】"; w.setAttribute("font-weight","bold"); w.setAttribute("font-size","15");
    const dt=r.parentNode, dir=dt.parentNode;
    r.replaceWith(w);
    // repère seul dans sa propre indication (sinon OSMD le fusionne avec le texte voisin)
    if(dir && dir.querySelectorAll(":scope > direction-type").length>1){ const nd=doc.createElement("direction"); ["placement","system"].forEach(a=>{ if(dir.getAttribute(a)) nd.setAttribute(a,dir.getAttribute(a)); }); nd.appendChild(dt); dir.before(nd); } });
  root.querySelectorAll("direction-type > metronome").forEach(m=>{
    const bu=m.querySelector("beat-unit"), pm=m.querySelector("per-minute"); if(!bu||!pm) return;
    const w=doc.createElement("words"); w.textContent=(NOTE_SYM[bu.textContent.trim()]||"♩")+(m.querySelector("beat-unit-dot")?".":"")+" = "+pm.textContent.trim();
    w.setAttribute("font-weight","bold"); m.replaceWith(w); });
  root.querySelectorAll("direction-type > words").forEach(w=>{ ["default-x","default-y","relative-x","relative-y"].forEach(a=>w.removeAttribute(a)); });
  // une indication découpée en plusieurs morceaux (gras, souligné…) : on la recolle en un seul texte
  root.querySelectorAll("direction").forEach(d=>{ const ws=[...d.querySelectorAll("direction-type > words")].filter(w=>!/^【/.test(w.textContent)); if(ws.length<2) return;
    const first=ws[0]; let txt=first.textContent;
    ws.slice(1).forEach(w=>{ const t=w.textContent; txt+=(w.parentNode===first.parentNode||/^[\s,.;:)!?]/.test(t)||/[\s(]$/.test(txt))?t:"  "+t; const dtp=w.parentNode; w.remove(); if(!dtp.children.length) dtp.remove(); });
    first.textContent=txt.replace(/\s+/g," ").trim(); });
  let out=new XMLSerializer().serializeToString(doc);
  if(!out.startsWith("<?xml")) out='<?xml version="1.0" encoding="UTF-8"?>\n'+out;
  return out;
}

/* =====================================================================
   Audio
   ===================================================================== */
const GM=["acoustic_grand_piano","bright_acoustic_piano","electric_grand_piano","honkytonk_piano","electric_piano_1","electric_piano_2","harpsichord","clavinet","celesta","glockenspiel","music_box","vibraphone","marimba","xylophone","tubular_bells","dulcimer","drawbar_organ","percussive_organ","rock_organ","church_organ","reed_organ","accordion","harmonica","tango_accordion","acoustic_guitar_nylon","acoustic_guitar_steel","electric_guitar_jazz","electric_guitar_clean","electric_guitar_muted","overdriven_guitar","distortion_guitar","guitar_harmonics","acoustic_bass","electric_bass_finger","electric_bass_pick","fretless_bass","slap_bass_1","slap_bass_2","synth_bass_1","synth_bass_2","violin","viola","cello","contrabass","tremolo_strings","pizzicato_strings","orchestral_harp","timpani","string_ensemble_1","string_ensemble_2","synth_strings_1","synth_strings_2","choir_aahs","voice_oohs","synth_choir","orchestra_hit","trumpet","trombone","tuba","muted_trumpet","french_horn","brass_section","synth_brass_1","synth_brass_2","soprano_sax","alto_sax","tenor_sax","baritone_sax","oboe","english_horn","bassoon","clarinet","piccolo","flute","recorder","pan_flute","blown_bottle","shakuhachi","whistle","ocarina","lead_1_square","lead_2_sawtooth","lead_3_calliope","lead_4_chiff","lead_5_charang","lead_6_voice","lead_7_fifths","lead_8_bass_lead","pad_1_new_age","pad_2_warm","pad_3_polysynth","pad_4_choir","pad_5_bowed","pad_6_metallic","pad_7_halo","pad_8_sweep","fx_1_rain","fx_2_soundtrack","fx_3_crystal","fx_4_atmosphere","fx_5_brightness","fx_6_goblins","fx_7_echoes","fx_8_scifi","sitar","banjo","shamisen","koto","kalimba","bagpipe","fiddle","shanai","tinkle_bell","agogo","steel_drums","woodblock","taiko_drum","melodic_tom","synth_drum","reverse_cymbal","guitar_fret_noise","breath_noise","seashore","bird_tweet","telephone_ring","helicopter","applause","gunshot"];
/* =====================================================================
   MOTEUR AUDIO
   - instruments échantillonnés (banque MusyngKite, haute qualité ; FluidR3 en secours ; synthèse en dernier recours)
   - seules les notes utiles du morceau sont décodées, et une seule fois (partagées entre parties et morceaux)
   - placement stéréo façon banda sur scène, réverbération de salle, compresseur doux
   ===================================================================== */
const SF_BASE=(window.BANDA_SF_BASE||"https://gleitz.github.io/midi-js-soundfonts/");
let AC=null, master=null, noiseBuf=null, BUS=null, REVERB=null;
function audio(){
  if(!AC){
    try{ AC=new (window.AudioContext||window.webkitAudioContext)({latencyHint:"playback"}); }catch(e){ AC=new (window.AudioContext||window.webkitAudioContext)(); }
    BUS=AC.createGain(); BUS.gain.value=0.8;
    const comp=AC.createDynamicsCompressor(); comp.threshold.value=-16; comp.knee.value=14; comp.ratio.value=3; comp.attack.value=0.006; comp.release.value=0.22;
    const warm=AC.createBiquadFilter(); warm.type="highshelf"; warm.frequency.value=7500; warm.gain.value=-2.5;   // adoucit le haut du spectre (mp3)
    master=AC.createGain(); master.gain.value=0.9*(S.gVol===undefined?1:S.gVol);
    BUS.connect(warm); warm.connect(comp); comp.connect(master); setupOutput();
    try{ REVERB=AC.createConvolver(); REVERB.buffer=makeIR(2.0); const rg=AC.createGain(); rg.gain.value=0.85; REVERB.connect(rg); rg.connect(warm); }catch(e){ REVERB=null; }
    noiseBuf=AC.createBuffer(1,AC.sampleRate*1.5,AC.sampleRate);
    const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  }
  return AC;
}
/* réponse impulsionnelle d'une salle moyenne : premières réflexions + queue amortie (les aigus s'éteignent plus vite) */
function makeIR(sec){
  const sr=AC.sampleRate, n=Math.floor(sr*sec), b=AC.createBuffer(2,n,sr), pre=Math.floor(sr*0.014);
  for(let ch=0;ch<2;ch++){
    const d=b.getChannelData(ch); let lp=0;
    for(let i=pre;i<n;i++){
      const x=(i-pre)/(n-pre), r=Math.random()*2-1, a=0.25+0.7*x;
      lp=lp*a+r*(1-a);
      d[i]=lp*Math.pow(1-x,2.4)*(1.6-0.6*x);
    }
    [0.019,0.027,0.041,0.053,0.067].forEach((t,k)=>{ const i=Math.floor(sr*(t+ch*0.003)); if(i<n) d[i]+=(k%2?-1:1)*(0.5-k*0.07); });
  }
  return b;
}
/* ---------- banques de sons ---------- */
const FONTS={};
const PCN={C:0,Db:1,D:2,Eb:3,E:4,F:5,Gb:6,G:7,Ab:8,A:9,Bb:10,B:11};
function sfQuality(){ return store("banda.sfq")==="light"?"FluidR3_GM":"MusyngKite"; }
/* sons hébergés avec l'application (dossier « sons/ » du site) en priorité, sinon la banque en ligne */
const SF_LOCAL="sons/";
/* les grosses banques sont découpées en morceaux de moins de 20 Mo (limite d'envoi du site GitHub : 25 Mo par fichier) */
const SF_PART=20e6;
const LOCAL_SF={ready:null,set:new Set(),parts:{}};
LOCAL_SF.ready=fetch(SF_LOCAL+"index.json",{cache:"no-cache"}).then(r=>r.ok?r.json():null).then(j=>{ if(j&&j.fonts) for(const [f,list] of Object.entries(j.fonts)) list.forEach(n=>{
  const nm=typeof n==="string"?n:n.n, k=f+"/"+nm; LOCAL_SF.set.add(k); if(typeof n==="object"&&n.parts>1) LOCAL_SF.parts[k]=n.parts; }); }).catch(()=>{});
function localFontUrls(font,name){ const k=font+"/"+name, n=LOCAL_SF.parts[k]; if(!n) return [SF_LOCAL+font+"/"+name+"-mp3.js"]; return Array.from({length:n},(_,i)=>SF_LOCAL+font+"/"+name+"-mp3.p"+(i+1)+".js"); }
async function fetchFontText(font,name){
  await LOCAL_SF.ready;
  if(LOCAL_SF.set.has(font+"/"+name)){ try{ const txt=await Promise.all(localFontUrls(font,name).map(u=>fetch(u).then(r=>{ if(!r.ok) throw new Error(r.status); return r.text(); }))); return txt.join(""); }catch(e){ console.warn("sons hébergés",font,name,e); } }
  const r=await fetch(SF_BASE+font+"/"+name+"-mp3.js"); if(!r.ok) throw new Error(r.status); return r.text();
}
function loadFont(font,name){
  const key=font+"/"+name;
  if(!FONTS[key]) FONTS[key]=fetchFontText(font,name).then(t=>{
    const notes=new Map(), rx=/"([A-G]b?)(-?\d)"\s*:\s*"data:audio\/[a-z0-9]+;base64,([^"]+)"/g; let m;
    while((m=rx.exec(t))) notes.set(12*(parseInt(m[2])+1)+PCN[m[1]], m[3]);
    if(!notes.size) throw new Error("banque vide");
    return {key,notes,buf:new Map()};
  }).catch(e=>{ delete FONTS[key]; throw e; });
  return FONTS[key];
}
function b64buf(b){ const s=atob(b), u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u.buffer; }
function decodeAB(ab){ return new Promise((res,rej)=>{ try{ const p=AC.decodeAudioData(ab,res,rej); if(p&&p.then) p.then(res,rej); }catch(e){ rej(e); } }); }
function sampleFor(font,midi){
  let src=null;
  if(font.notes.has(midi)) src=midi;
  else for(let d=1;d<=12&&src===null;d++){ if(font.notes.has(midi-d)) src=midi-d; else if(font.notes.has(midi+d)) src=midi+d; }
  if(src===null) return null;
  let e=font.buf.get(src);
  if(!e){ e={b:null}; e.p=decodeAB(b64buf(font.notes.get(src))).then(b=>{ e.b=b; return b; }).catch(()=>null); font.buf.set(src,e); }
  return {e,rate:Math.pow(2,(midi-src)/12)};
}
/* ---------- instruments ---------- */
function instrumentFor(P){
  const n=(P.name+" "+(P.sounds||"")).toLowerCase();
  const T=[[/piccolo/,"piccolo"],[/fl[uû]te|flute/,"flute"],[/sax.*(sopran)|soprano sax/,"soprano_sax"],[/sax.*(alto)|alto sax|sax a\b/,"alto_sax"],
    [/sax.*(t[ée]nor)|tenor sax|sax t\b/,"tenor_sax"],[/sax.*(bar)|bariton|baryton|bari/,"baritone_sax"],[/trombone/,"trombone"],[/sousa|soubasso|tuba|euph|bass bb/,"tuba"],
    [/trompette|trumpet|bugle|cornet/,"trumpet"],[/\bcor\b|horn/,"french_horn"],[/clarinet/,"clarinet"],[/hautbois|oboe/,"oboe"],[/basson|bassoon/,"bassoon"],
    [/accord/,"accordion"],[/piano/,"acoustic_grand_piano"],[/orgue|organ/,"drawbar_organ"],[/basse|bass guitar|electric bass/,"electric_bass_finger"],
    [/guitar|guitare/,"electric_guitar_clean"],[/voix|voice|chant|soprano/,"choir_aahs"],[/steel/,"steel_drums"]];
  for(const [rx,nm] of T) if(rx.test(n)) return nm;
  return GM[Math.max(1,Math.min(128,P.program||1))-1];
}
function familyOf(inst){
  if(/piano|guitar|bass_finger|steel/.test(inst)) return {a:0.003,r:0.28,lvl:0.9,rev:0.12,hum:0.004};
  if(/accordion|organ/.test(inst)) return {a:0.02,r:0.09,lvl:0.7,rev:0.14,hum:0.003};
  if(/tuba/.test(inst)) return {a:0.02,r:0.1,lvl:1.15,rev:0.10,hum:0.005};
  return {a:0.018,r:0.11,lvl:1,rev:0.18,hum:0.006};
}
function panFor(P){
  const n=P.name.toLowerCase();
  const T=[[/piccolo|fl[uû]te|flute/,-0.45],[/clarinet/,-0.35],[/alto.*2|a 2|alto2/,-0.18],[/alto/,-0.3],[/t[ée]nor/,0.05],[/bar/,0.25],
    [/trompette|trumpet/,-0.08],[/trombone/,0.35],[/sousa|tuba|basse|bass/,0],[/piano/,-0.15],[/accord/,0.22],[/guitar/,0.3],[/drum|batterie|perc/,0]];
  for(const [rx,v] of T) if(rx.test(n)) return v;
  return 0;
}
/* chargement des sons du morceau : banque, puis décodage des seules notes jouées */
async function loadSounds(){
  const ac=audio(), q=sfQuality(), other=q==="MusyngKite"?"FluidR3_GM":"MusyngKite";
  const parts=S.model.parts, token=S.loadToken=(S.loadToken||0)+1;
  const need=parts.map((P,i)=>{ const set=new Set(); for(const e of P.events){ if(P.isDrum){ if(e.drum!=null) set.add(e.drum); } else if(e.midi!=null) set.add(Math.round(e.midi)); } return set; });
  const todo=parts.map((P,i)=>i).filter(i=>need[i].size && !parts[i].hidden);
  S.snd={done:0,total:todo.length,hq:0}; soundUI();
  await Promise.all(todo.map(async i=>{
    const P=parts[i], ps=S.parts[i], inst=P.isDrum?"percussion":instrumentFor(P);
    let font=null;
    for(const f of [q,other]){ try{ font=await loadFont(f,inst); break; }catch(e){} }
    if(token!==S.loadToken) return;
    if(font){ ps.font=font; ps.fontName=font.key; await Promise.all([...need[i]].map(m=>{ const r=sampleFor(font,m); return r?r.e.p:null; })); if(font.key.startsWith("MusyngKite")) S.snd.hq++; }
    S.snd.done++; soundUI();
  }));
}
function soundUI(){
  const el=$("sndState"); if(!el||!S.snd) return;
  const {done,total}=S.snd; const ok=done>=total;
  el.classList.toggle("ready",ok); el.title=ok?"Sons d'instruments prêts":"Chargement des sons…";
  const loaded=S.parts?S.parts.filter(p=>p.font).length:0;
  el.querySelector("span").textContent=!ok?"Sons "+done+"/"+total:!loaded?"Sons simplifiés":(S.snd.hq===total?"Sons HD":"Sons");
  if(ok&&!loaded) el.title="Sons d'instruments indisponibles (pas de connexion ?) : sons de synthèse";
}
/* ---------- jeu des notes ---------- */
function velGain(v){ return 0.1+0.9*Math.pow(Math.max(0,Math.min(1.15,v)),1.6); }
function playSample(ps, midi, when, dur, vel){
  const r=ps.font&&sampleFor(ps.font,Math.round(midi)); if(!r||!r.e.b) return false;
  const src=AC.createBufferSource(); src.buffer=r.e.b; src.playbackRate.value=r.rate*Math.pow(2,(midi-Math.round(midi))/12);
  const g=AC.createGain(), env=ps.env, peak=velGain(vel)*env.lvl;
  const end=when+Math.max(dur,env.a+0.03), stopAt=Math.min(when+r.e.b.duration/r.rate, end+env.r*4);
  g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(peak,when+env.a);
  g.gain.setValueAtTime(peak,end); g.gain.setTargetAtTime(0,end,env.r/3);
  src.connect(g); g.connect(ps.gain); src.start(when); src.stop(Math.max(stopAt,when+0.05));
  return true;
}
function playHit(ps, key, when, vel){
  if(!(ps.font && key>=27 && key<=87)) return false;
  const r=sampleFor(ps.font,key); if(!r||!r.e.b||r.rate!==1) return false;
  const src=AC.createBufferSource(); src.buffer=r.e.b;
  const g=AC.createGain(); g.gain.value=velGain(vel)*1.05;
  src.connect(g); g.connect(ps.gain); src.start(when); src.stop(when+Math.min(r.e.b.duration,3));
  return true;
}

function synthNote(dest, midi, when, dur, vel, program){
  const ac=AC, f=440*Math.pow(2,(midi-69)/12);
  const o=ac.createOscillator(), g=ac.createGain(), flt=ac.createBiquadFilter();
  const brass=program>=57&&program<=64, reed=program>=65&&program<=72, pipe=program>=73&&program<=80, bass=program>=33&&program<=40||program===59;
  o.type=pipe?"triangle":reed?"square":brass||bass?"sawtooth":"triangle";
  o.frequency.value=f; flt.type="lowpass"; flt.frequency.value=Math.min(8000,f*(brass?6:reed?5:4)); flt.Q.value=0.7;
  const a=0.015, r=0.08, peak=0.18*vel;
  g.gain.setValueAtTime(0,when); g.gain.linearRampToValueAtTime(peak,when+a);
  g.gain.setValueAtTime(peak*0.85,when+Math.max(a,dur-r)); g.gain.linearRampToValueAtTime(0,when+dur+r);
  o.connect(flt); flt.connect(g); g.connect(dest); o.start(when); o.stop(when+dur+r+0.05);
}
function noise(dest, when, dur, gain, hp, lp){
  const s=AC.createBufferSource(); s.buffer=noiseBuf;
  const g=AC.createGain(), f1=AC.createBiquadFilter(), f2=AC.createBiquadFilter();
  f1.type="highpass"; f1.frequency.value=hp||1000; f2.type="lowpass"; f2.frequency.value=lp||12000;
  g.gain.setValueAtTime(gain,when); g.gain.exponentialRampToValueAtTime(0.001,when+dur);
  s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest); s.start(when); s.stop(when+dur+0.05);
}
function tone(dest, when, f0, f1, dur, gain, type){
  const o=AC.createOscillator(), g=AC.createGain(); o.type=type||"sine";
  o.frequency.setValueAtTime(f0,when); if(f1) o.frequency.exponentialRampToValueAtTime(f1,when+dur);
  g.gain.setValueAtTime(gain,when); g.gain.exponentialRampToValueAtTime(0.001,when+dur);
  o.connect(g); g.connect(dest); o.start(when); o.stop(when+dur+0.05);
}
function drum(dest, key, when, vel){
  const v=0.5+0.5*vel;
  switch(true){
    case key===35||key===36: tone(dest,when,150,45,0.35,0.9*v); noise(dest,when,0.02,0.15*v,800); break;
    case key===38||key===40||key===37: tone(dest,when,220,140,0.12,0.35*v,"triangle"); noise(dest,when,0.18,0.45*v,1500,9000); break;
    case key===39: for(let k=0;k<3;k++) noise(dest,when+k*0.012,0.09,0.35*v,1200,6000); break;
    case key===42||key===44: noise(dest,when,0.05,0.25*v,7000); break;
    case key===46: noise(dest,when,0.3,0.22*v,6000); break;
    case key===49||key===57||key===52: noise(dest,when,1.2,0.28*v,4000); break;
    case key===55: noise(dest,when,0.6,0.24*v,5000); break;
    case key===51||key===59||key===53: noise(dest,when,0.5,0.12*v,6000); tone(dest,when,2600,0,0.4,0.05*v,"square"); break;
    case key===56: tone(dest,when,560,0,0.18,0.18*v,"square"); tone(dest,when,845,0,0.18,0.12*v,"square"); break;
    case key===76||key===77: tone(dest,when,key===76?1200:900,0,0.07,0.45*v,"sine"); break;
    case key===31||key===37: tone(dest,when,2000,0,0.03,0.4*v,"square"); noise(dest,when,0.03,0.2*v,3000); break;
    case key>=41&&key<=50: tone(dest,when,90+(key-41)*18,60+(key-41)*10,0.3,0.6*v); break;
    default: noise(dest,when,0.1,0.2*v,2000);
  }
}
function click(when, strong){ const d=BUS||master; tone(d,when,strong?1650:1250,strong?1500:1100,0.06,strong?0.55:0.35,"sine"); noise(d,when,0.015,strong?0.25:0.15,2500,9000); }

/* =====================================================================
   App state
   ===================================================================== */
const S={model:null,order:[],seq:[],parts:[],myPart:0,playing:false,speed:1,loop:null,osmd:null,steps:[],stepIdx:-1,
  sched:null,instances:[],nextSeq:0,nextCtx:0,rafId:0,startedAt:0,countIn:true,clickOn:false,loadingSf:false,title:""};

async function openBuffer(buf, name, title){
  stop();
  showLoading("Lecture de la partition…");
  let xml;
  try{ xml=await bufferToXml(buf,name); }catch(e){ hideLoading(); toast(e.message,5000); return; }
  let model;
  try{ model=buildModel(xml); }catch(e){ hideLoading(); console.error(e); toast("Partition illisible : "+e.message,5000); return; }
  S.model=model; S.title=title||model.title||name; S.layout=LAST_LAYOUT; S.idemU={};
  S.src={buf,name,title:S.title,sid:songId(buf)};
  $("title").textContent=S.title;
  S.order=playOrder(model.meas);
  buildSequence();
  setupParts();
  showPlayer();
  await renderScore();
  hideLoading();
  loadSounds();
  mediaSession();
  if(SY.role==="m") syncSong();
  if(SY.role==="f") followerSongReady();
}
function songId(buf){ const b=new Uint8Array(buf); let h=2166136261; const st=Math.max(1,Math.floor(b.length/4096)); for(let i=0;i<b.length;i+=st){ h^=b[i]; h=Math.imul(h,16777619)>>>0; } return b.length.toString(36)+"-"+h.toString(36); }
function buildSequence(){
  let t=0; const cnt={}; S.seq=S.order.map((mi,k)=>{ const M=S.model.meas[mi]; const dur=M.len*60/M.tempo; cnt[mi]=(cnt[mi]||0)+1; const e={k,mi,t,dur,M,pass:cnt[mi]}; t+=dur; return e; });
  S.seq.forEach(e=>{ e.passes=cnt[e.mi]; });
  S.total=t;
  S.evByMeasure=new Map();
  S.model.parts.forEach((P,pi)=>{ for(const e of P.events){ if(!S.evByMeasure.has(e.m)) S.evByMeasure.set(e.m,[]); S.evByMeasure.get(e.m).push({...e,p:pi}); } });
  for(const l of S.evByMeasure.values()) l.sort((a,b)=>a.off-b.off);
  drawBar();
}
function setupParts(){
  const sel=$("partSel"); sel.innerHTML="";
  const saved=store("banda.part");
  S.parts=S.model.parts.map((P,i)=>({vol:P.isDrum?0.8:0.85,mute:!!P.hidden,solo:false,gain:null,font:null,env:familyOf(P.isDrum?"percussion":instrumentFor(P))}));
  S.model.parts.forEach((P,i)=>{ if(P.hidden) return; const o=document.createElement("option"); o.value=i; o.textContent=P.name; sel.appendChild(o); });
  let idx=S.model.parts.findIndex(P=>P.name===saved&&!P.hidden); if(idx<0) idx=Math.max(0,S.model.parts.findIndex(P=>!P.hidden));
  S.myPart=idx; sel.value=idx; setKick();
  const ac=audio();
  S.parts.forEach((p,i)=>{ const P=S.model.parts[i];
    p.gain=ac.createGain();
    p.pan=ac.createStereoPanner?ac.createStereoPanner():null; if(p.pan) p.pan.pan.value=panFor(P);
    p.out=p.pan||p.gain; if(p.pan) p.gain.connect(p.pan);
    p.send=ac.createGain(); p.send.gain.value=P.isDrum?0.08:p.env.rev; });
  newSession();
  drawMixer(); applyGains();
  // rehearsal marks
  const mk=$("marks"); mk.innerHTML="";
  const seen=new Set();
  S.seq.forEach(e=>{ for(const t of e.M.marks){ const key=t+"@"+e.mi; if(seen.has(key)) continue; seen.add(key);
    const b=document.createElement("button"); b.textContent=t; b.onclick=()=>seekSeq(e.k); mk.appendChild(b); } });
  $("loopA").value=""; $("loopB").value=""; S.loop=null; S.loopDraft=null; endPick(); $("loopBtn").classList.remove("on"); updateLoopZone();
}
/* barre de volume : le nom de la piste est dans la barre, on glisse pour régler */
function bindBar(bar,get,set){
  const upd=()=>{ const v=get(); bar.querySelector(".vfill").style.width=Math.round(v*100)+"%"; bar.querySelector(".vval").textContent=Math.round(v*100); };
  let dn=false; const at=e=>{ const r=bar.getBoundingClientRect(); set(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))); upd(); };
  bar.addEventListener("pointerdown",e=>{ if(SY.role==="f"&&bar.closest(".lk")) return; dn=true; bar.setPointerCapture(e.pointerId); at(e); });
  bar.addEventListener("pointermove",e=>{ if(dn) at(e); });
  bar.addEventListener("pointerup",()=>{ dn=false; });
  upd(); return upd;
}
function drawMixer(){
  const box=$("mix"); box.innerHTML="";
  let sep=false;
  [...S.model.parts.keys()].sort((a,b)=>(S.model.parts[a].hidden?1:0)-(S.model.parts[b].hidden?1:0)).forEach(i=>{
    const P=S.model.parts[i];
    const st=S.parts[i];
    if(P.hidden && !sep){ sep=true; const h=document.createElement("div"); h.className="muted small"; h.style.marginTop="8px"; h.textContent="Pistes masquées dans la partition (coupées par défaut)"; box.appendChild(h); }
    const anySolo=S.parts.some(p=>p.solo);
    const row=document.createElement("div"); row.className="vrow"+(i===S.myPart?" mine":"")+((st.mute||(anySolo&&!st.solo))?" off":"");
    row.innerHTML=`<div class="vbar"><div class="vfill"></div><span class="vname"></span><span class="vval"></span></div><button class="m" title="Muet">M</button><button class="s" title="Solo">S</button>`;
    row.querySelector(".vname").textContent=P.name+(i===S.myPart?"  (moi)":"");
    const bm=row.querySelector(".m"), bs=row.querySelector(".s");
    bm.classList.toggle("on",st.mute); bs.classList.toggle("on",st.solo);
    bm.onclick=()=>{ st.mute=!st.mute; drawMixer(); applyGains(); };
    bs.onclick=()=>{ st.solo=!st.solo; drawMixer(); applyGains(); };
    bindBar(row.querySelector(".vbar"),()=>st.vol,v=>{ st.vol=v; applyGains(); });
    box.appendChild(row);
  });
  const mine=S.parts[S.myPart]||{};
  $("minusOne").classList.toggle("on",!!mine.mute && !S.parts.some(p=>p.solo));
  $("soloMine").classList.toggle("on",!!mine.solo && S.parts.filter(p=>p.solo).length===1);
}
function defaultMix(){ S.parts.forEach((p,i)=>{ const P=S.model.parts[i]; p.vol=P.isDrum?0.8:0.85; p.mute=!!P.hidden; p.solo=false; }); drawMixer(); applyGains(); }
/* volume général (propre à chaque appareil) */
S.gVol=parseFloat(store("banda.gvol")||"1"); if(!(S.gVol>=0&&S.gVol<=1)) S.gVol=1;
function applyMaster(){ if(!master||!AC) return; const on=!(SY.role==="f"&&!$("sessSound").checked); master.gain.setTargetAtTime(on?0.9*S.gVol:0,AC.currentTime,0.02); }
function applyGains(){
  if(SY.role==="m") syncPushSoon();
  const anySolo=S.parts.some(p=>p.solo);
  S.parts.forEach(p=>{ const v=(p.mute||(anySolo&&!p.solo))?0:p.vol; if(p.gain) p.gain.gain.setTargetAtTime(v,AC.currentTime,0.02); });
}

/* =====================================================================
   Score display (OpenSheetMusicDisplay)
   ===================================================================== */
/* calibrage de mise en page (largeur « comme imprimé », largeur de mesure du défilement) :
   calculé une fois pour toutes (fichier morceaux/calibrage.json, puis mémoire de l'appareil) → un seul dessin au lieu de plusieurs */
const CALIB={map:null,p:null};
function calibLoad(){ if(!CALIB.p) CALIB.p=fetch("morceaux/calibrage.json",{cache:"no-cache"}).then(r=>r.ok?r.json():{}).catch(()=>({})).then(j=>{ let loc={}; try{ loc=JSON.parse(store("banda.calib")||"{}"); }catch(e){} CALIB.map=Object.assign({},j,loc); return CALIB.map; }); return CALIB.p; }
function calibKey(){ const P=S.model&&S.model.parts[S.myPart]; return (S.src?S.src.sid:"")+"|"+(P?P.name:""); }
function calibGet(){ return (CALIB.map||{})[calibKey()]||{}; }
function calibSet(o){ const k=calibKey(); CALIB.map=CALIB.map||{}; CALIB.map[k]=Object.assign({},CALIB.map[k],o);
  try{ const loc=JSON.parse(store("banda.calib")||"{}"); loc[k]=CALIB.map[k]; const ks=Object.keys(loc); if(ks.length>500) delete loc[ks[0]]; store("banda.calib",JSON.stringify(loc)); }catch(e){} }
async function renderScore(){
  await calibLoad();
  if(!window.opensheetmusicdisplay){ $("score").innerHTML="<p style='padding:20px;color:#333'>Affichage de partition indisponible (pas de connexion ?). La lecture audio reste possible.</p>"; return; }
  S.steps=[]; S.geo=null; endPeek();
  const host=$("score"); host.innerHTML=""; host.style.paddingLeft=host.style.paddingRight=host.style.paddingBottom="0px"; host.style.transform=""; host.style.marginTop="";
  const line=isLine();
  $("scoreWrap").classList.toggle("horiz",line);
  const osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(host,{autoResize:false,backend:"svg",drawTitle:!line,drawComposer:false,drawCredits:false,
    drawPartNames:false,autoGenerateMultipleRestMeasuresFromRestMeasures:false,renderSingleHorizontalStaffline:line,followCursor:false,drawingParameters:"compacttight",
    cursorsOptions:[{type:0,color:"#ff2d95",alpha:0.4,follow:false}]});
  S.osmd=osmd;
  const xml=displayXml(S.model,S.myPart);
  try{ await osmd.load(xml); }catch(e){ console.error(e); host.innerHTML="<p style='padding:20px;color:#333'>Cette partition n'a pas pu être affichée.</p>"; return; }
  osmd.Sheet.Instruments.forEach(ins=>{ ins.Visible=true; });   // la partition affichée ne contient plus que ma partie
  const idem=layoutMode()==="idem";
  try{ const R=osmd.EngravingRules; R.TitleBottomDistance=3.5; R.VoltaOffset=3;
    if(line){ R.SheetMaximumWidth=Math.max(32767,S.seq.length*900); R.RenderMeasureNumbers=false; }
    R.NewSystemAtXMLNewSystemAttribute=idem; R.AutoGenerateMultipleRestMeasuresFromRestMeasures=false; }catch(e){}
  const uz=($("zoom").value/100);
  if(idem){
    // largeur logique fixe (en interlignes) : le zoom change la taille, jamais le nombre de mesures par ligne
    const W=$("scoreWrap").clientWidth-2, key=S.myPart; let U=S.idemU[key]||calibGet().U||175, want=(S.idemInfo&&S.idemInfo.systems)||0;
    for(let it=0;it<8;it++){
      host.style.width=Math.round(W*uz)+"px"; osmd.zoom=(W*uz)/(U*10);
      try{ osmd.render(); }catch(e){ console.error(e); }
      let n=0; try{ osmd.GraphicSheet.MusicPages.forEach(pg=>n+=pg.MusicSystems.length); }catch(e){}
      if(!want||n<=want) break; U*=1.12;
    }
    S.idemU[key]=U; if(calibGet().U!==U) calibSet({U});
    if(S.idemInfo&&!S.idemInfo.fromPart) toast("Ce fichier ne contient pas la mise en page de la partie séparée : lignes du conducteur utilisées",4000);
  } else {
    host.style.width="";
    osmd.zoom=uz*(window.innerWidth<700?0.75:1)*(line?(window.innerHeight<500?1.2:1.35):1);
    const cw=line&&calibGet().w;
    if(cw&&landLine()) osmd.zoom=landZoom(cw,uz);
    if(cw){ try{ const R=osmd.EngravingRules; R.SheetMaximumWidth=Math.min(R.SheetMaximumWidth,(S.seq.length*(cw+2)+60)*10*osmd.zoom);
      R.FixedMeasureWidth=true; R.FixedMeasureWidthFixedValue=cw; R.FixedMeasureWidthUseForPickupMeasures=true; }catch(e){} }
    try{ osmd.render(); }catch(e){ console.error(e); }
  }
  if(line&&!calibGet().w){
    // ligne qui défile : mesures de largeur égale (la plus large utile), pour un défilement régulier
    try{
      const ws=[]; osmd.GraphicSheet.MeasureList.forEach(row=>{ const g=(row||[]).find(x=>x&&x.ParentMusicSystem); if(g){ const ps=g.PositionAndShape; ws.push(ps.BorderRight-ps.BorderLeft-(g.beginInstructionsWidth||0)); } });
      ws.sort((a,b)=>a-b); const w=Math.max(14,ws[Math.floor(ws.length*0.9)]||20); calibSet({w});
      if(landLine()) osmd.zoom=landZoom(w,uz);
      osmd.EngravingRules.SheetMaximumWidth=Math.min(osmd.EngravingRules.SheetMaximumWidth,(ws.length*(w+2)+60)*10*osmd.zoom);
      osmd.EngravingRules.FixedMeasureWidth=true; osmd.EngravingRules.FixedMeasureWidthFixedValue=w; osmd.EngravingRules.FixedMeasureWidthUseForPickupMeasures=true;
      osmd.render();
    }catch(e){ console.warn("fixed width",e); }
  }
  if(line){ const pad=Math.round($("scoreWrap").clientWidth/3); host.style.width="max-content";   // la marge de droite s'ajoute après la partition : on peut défiler jusqu'à la dernière note
    host.style.paddingLeft=pad+"px"; host.style.paddingRight=Math.round($("scoreWrap").clientWidth*0.7)+"px"; host.style.paddingBottom="0px"; S.pad=pad; }
  else { S.pad=0; host.style.paddingBottom=$("scoreWrap").clientHeight+"px"; }
  // cursor map : every cursor position, with its x on the score
  S.steps=[];
  try{
    const c=osmd.cursor; c.show(); c.reset();
    let guard=0;
    while(!c.Iterator.EndReached && guard++<200000){
      const meas=c.Iterator.CurrentMeasure;
      const off=meas?(c.Iterator.currentTimeStamp.RealValue-meas.AbsoluteTimestamp.RealValue)*4:0;
      const el=c.cursorElement;
      S.steps.push({mi:c.Iterator.CurrentMeasureIndex,off,x:el?parseFloat(el.style.left)||0:0});
      c.next();
    }
    c.reset(); S.stepIdx=0;
    c.hide();
  }catch(e){ console.warn("cursor",e); }
  decorateSvg(host);
  buildGeometry();
  // défilement : numéro de chaque mesure, et passage (1re / 2e fois) en bleu pour les reprises
  if(line && S.geo) S.geo.meas.forEach((m,k)=>{ const e=S.seq[k]; if(!m||!e||k===0) return;
    const d=document.createElement("div"); d.className="mnum"+(e.passes>1?" rep":"");
    const pv=S.seq[k-1], start=!pv||pv.mi!==e.mi-1||pv.pass!==e.pass||pv.passes<2;   // le passage est écrit au début de chaque passage
    d.textContent=e.M.number+(e.passes>1&&start?" · "+passLabel(e):""); d.style.left=(m.x+S.pad+4)+"px"; d.style.top=(Math.min(m.y-2.6*m.u, m.top-0.6*m.u, S.geo.sys[m.sys].top-2)+24-16)+"px"; host.appendChild(d); });
  // signe « % » des mesures répétées
  if(S.geo&&S.repMeas) Object.entries(S.repMeas).forEach(([mi,len])=>{ const m=S.geo.meas[+mi]; if(!m||m.mr) return;
    const u=m.u, cx=(m.xs+m.x2)/2+6+(line?S.pad:0), cy=m.y+2*u+(line?24:0), w=3.2*u, h=4*u;
    const d=document.createElement("div"); d.className="mrep"; d.style.cssText=`position:absolute;left:${cx-w/2}px;top:${cy-h/2}px;width:${w}px;height:${h}px;pointer-events:none`;
    d.innerHTML=`<svg viewBox="0 0 32 40" width="${w}" height="${h}"><line x1="6" y1="34" x2="26" y2="6" stroke="#000" stroke-width="5" stroke-linecap="round"/><circle cx="7" cy="12" r="3.6"/><circle cx="25" cy="28" r="3.6"/>${len>1?'<text x="16" y="-4" font-size="14" font-weight="bold" text-anchor="middle">'+len+'</text>':''}</svg>`;
    host.appendChild(d); });
  const pc=document.createElement("div"); pc.id="pcur"; host.appendChild(pc);
  const jm=document.createElement("div"); jm.id="jumpMark"; jm.innerHTML="<span>▶ on reprend ici</span>"; host.appendChild(jm);
  applyCurStyle();
  if(line&&S.geo&&S.geo.sys[0]){ const w=$("scoreWrap"), sy=S.geo.sys[0], mid=24+(sy.top+sy.bottom)/2, sh=Math.round(w.clientHeight*0.45-mid);
    if(sh>10&&host.offsetHeight+sh<=w.clientHeight+4) host.style.marginTop=sh+"px"; }   // ligne trop basse pour l'écran : on la centre
  if(line && S.geo && S.geo.sys[0]){ const sy=S.geo.sys[0], w=$("scoreWrap"); w.scrollTop=Math.max(0,(sy.top+sy.bottom)/2-w.clientHeight/2+12); }   // portée centrée en hauteur
  sigReset();
  S.pend=null; lastCur=""; { const w=$("scoreWrap"); S.wideScore=w.scrollWidth>w.clientWidth+4; } updateCursor(true);
  if(line) sigPrepare();
}
/* ===== défilement : clé et armure de la mesure jouée, toujours visibles à gauche =====
   Une petite portée fixe à gauche montre la clé et l'armure en cours ; ses lignes s'effacent en fondu
   vers la droite et la partition qui défile réapparaît en fondu derrière elle. */
const SIG={cache:new Map(),cur:"",on:false,gen:0,top:0,FADE:40};
function sigReset(){ SIG.gen++; SIG.on=false; SIG.cur=""; S.sigAt=null; const b=$("sigBox"); if(b){ b.innerHTML=""; b.style.display="none"; } }
function sigList(){
  const o=S.osmd, ml=o.GraphicSheet.MeasureList, sm=o.Sheet.SourceMeasures; let fifths=0; const arr=[];
  for(let i=0;i<sm.length;i++){
    (sm[i].FirstInstructionsStaffEntries||[]).forEach(se=>{ if(se) (se.Instructions||[]).forEach(ins=>{ if(typeof ins.Key==="number") fifths=ins.Key; }); });
    const g=ml[i]&&ml[i][0], c=g&&g.InitiallyActiveClef;
    arr.push(c?[c.ClefType|0,c.Line|0,c.OctaveOffset|0,fifths].join("_"):(arr[i-1]||null));
  }
  return arr;
}
async function sigRender(sig,zoom){
  const id=sig+"@"+zoom.toFixed(4); if(SIG.cache.has(id)) return SIG.cache.get(id);
  const [ct,line,oct,fifths]=sig.split("_").map(Number), sign=["G","F","C","percussion","TAB"][ct]||"G";
  const xml='<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name print-object="no">x</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions>'
    +(sign==="percussion"?'':'<key><fifths>'+fifths+'</fifths></key>')+'<time print-object="no"><beats>4</beats><beat-type>4</beat-type></time><clef><sign>'+sign+'</sign>'+(sign==="percussion"?'':'<line>'+line+'</line>')+(oct?'<clef-octave-change>'+oct+'</clef-octave-change>':'')
    +'</clef></attributes><note print-object="no"><rest/><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
  const d=document.createElement("div"); d.style.cssText="position:fixed;left:-5000px;top:0;width:1600px;visibility:hidden"; document.body.appendChild(d);
  let r=null;
  try{
    const o=new opensheetmusicdisplay.OpenSheetMusicDisplay(d,{autoResize:false,backend:"svg",drawTitle:false,drawComposer:false,drawCredits:false,drawPartNames:false,renderSingleHorizontalStaffline:true,drawingParameters:"compacttight"});
    await o.load(xml); o.zoom=zoom; o.render();
    const g=o.GraphicSheet.MeasureList[0][0], u=10*zoom, ap=g.PositionAndShape.AbsolutePosition;
    const svg=d.querySelector("svg");
    if(svg) r={svg:svg.cloneNode(true), sx:ap.x*u, w:(g.beginInstructionsWidth||3)*u, sy:g.ParentStaffLine.PositionAndShape.AbsolutePosition.y*u, h:svg.getBoundingClientRect().height};
  }catch(e){ console.warn("armure",e); }
  d.remove(); SIG.cache.set(id,r); return r;
}
async function sigPrepare(){
  const gen=SIG.gen, o=S.osmd; if(!o||!isLine()) return;
  let arr; try{ arr=sigList(); }catch(e){ console.warn(e); return; }
  const zoom=o.zoom; for(const s of new Set(arr.filter(Boolean))){ await sigRender(s,zoom); if(gen!==SIG.gen) return; }
  // position verticale : ligne du haut de la portée principale
  try{ const g=o.GraphicSheet.MeasureList[0][0], svg=$("score").querySelector("svg"), box=$("scoreBox").getBoundingClientRect(), w=$("scoreWrap");
    SIG.top=svg.getBoundingClientRect().top-box.top+w.scrollTop+g.ParentStaffLine.PositionAndShape.AbsolutePosition.y*10*zoom;
    SIG.left=w.getBoundingClientRect().left-box.left; }catch(e){ return; }
  S.sigAt=arr; SIG.zoom=zoom; SIG.on=true; SIG.cur="";
  sigUpdate(curSeq);
}
$("scoreWrap").addEventListener("scroll",()=>{ if(SIG.on&&SIG.cur) $("sigBox").style.top=(SIG.top-$("scoreWrap").scrollTop-SIG.sy)+"px"; },{passive:true});
function sigUpdate(k){
  if(!SIG.on||!S.sigAt) return; const sig=S.sigAt[k]||S.sigAt[0]; if(!sig||sig===SIG.cur) return;
  const r=SIG.cache.get(sig+"@"+SIG.zoom.toFixed(4)); if(!r) return;
  SIG.cur=sig; SIG.sy=r.sy; const box=$("sigBox"), w0=Math.round(r.w+10);
  const lay=document.createElement("div"); lay.className="sigLay";
  const sv=r.svg.cloneNode(true); sv.style.cssText="position:absolute;left:"+(-(r.sx-4)).toFixed(1)+"px;top:0"; lay.appendChild(sv);
  box.style.display="block"; box.style.left=SIG.left+"px"; box.style.width=(w0+SIG.FADE)+"px"; box.style.height=Math.ceil(r.h)+"px";
  box.style.top=(SIG.top-$("scoreWrap").scrollTop-r.sy)+"px";
  const m="linear-gradient(90deg,#000 "+w0+"px,transparent 100%)"; box.style.webkitMaskImage=box.style.maskImage=m;
  const old=[...box.children]; box.appendChild(lay);
  requestAnimationFrame(()=>{ lay.classList.add("on"); old.forEach(x=>{ x.classList.remove("on"); setTimeout(()=>x.remove(),300); }); });
}
/* paysage : zoom pour que MESURES_VISIBLES_PAYSAGE mesures (largeur fixe w, en interlignes) remplissent l'écran à 100 % */
function landZoom(w,uz){ const W=$("scoreWrap").clientWidth||window.innerWidth; return Math.max(0.2,(W/MESURES_VISIBLES_PAYSAGE)/((w+LAND_GAP)*10))*uz; }
const LAND_GAP=2;
function visibleMeasures(){ const G=S.geo; if(!G||!isLine()) return 0; const ms=G.meas.filter(Boolean); if(ms.length<3) return 0;
  const a=ms[1], b=ms[ms.length-1], per=(b.x-a.x)/(ms.length-2); return per>0?$("scoreWrap").clientWidth/per:0; }
/* symboles de structure bien visibles : segno et coda dessinés, repères encadrés, D.S./Coda en gras */
function decorateSvg(host){
  const NS="http://www.w3.org/2000/svg";
  const el=(tag,at,par)=>{ const e=document.createElementNS(NS,tag); for(const k in at) e.setAttribute(k,at[k]); if(par) par.appendChild(e); return e; };
  function coda(g,x,y,z){ const cx=x+z*0.5, cy=y-z*0.36, r=z*0.27, w=Math.max(1.6,z*0.075);
    el("circle",{cx,cy,r,fill:"none",stroke:"#000","stroke-width":w},g);
    el("line",{x1:cx,y1:cy-r*1.6,x2:cx,y2:cy+r*1.6,stroke:"#000","stroke-width":w},g);
    el("line",{x1:cx-r*1.6,y1:cy,x2:cx+r*1.6,y2:cy,stroke:"#000","stroke-width":w},g); return z*1.05; }
  function segno(g,x,y,z){ const t=el("text",{x:x+z*0.2,y:y,"font-family":"'Times New Roman',Times,serif","font-size":z*1.05,"font-style":"italic","font-weight":"bold",fill:"#000"},g); t.textContent="S";
    el("line",{x1:x+z*0.12,y1:y+z*0.02,x2:x+z*0.9,y2:y-z*0.86,stroke:"#000","stroke-width":Math.max(1.6,z*0.07)},g);
    el("circle",{cx:x+z*0.2,cy:y-z*0.52,r:z*0.075,fill:"#000"},g); el("circle",{cx:x+z*0.86,cy:y-z*0.3,r:z*0.075,fill:"#000"},g); return z*1.05; }
  host.querySelectorAll("svg text").forEach(t=>{
    const s=t.textContent; if(!/[§⊕【]/.test(s)) return;
    const x0=parseFloat(t.getAttribute("x"))||0, y=parseFloat(t.getAttribute("y"))||0;
    const fs=parseFloat(t.getAttribute("font-size"))||16;
    const g=el("g",{class:"deco"}); t.parentNode.insertBefore(g,t);
    let x=x0;
    const parts=s.split(/(§|⊕|【[^】]*】)/).filter(x=>x!=="");
    parts.forEach(pc=>{
      if(pc==="§"){ x+=segno(g,x,y,Math.max(fs*1.4,32))+4; return; }
      if(pc==="⊕"){ x+=coda(g,x,y,Math.max(fs*1.4,32))+4; return; }
      const box=/^【/.test(pc); const txt=box?pc.slice(1,-1):pc; if(!txt.trim()){ x+=fs*0.3; return; }
      const tt=t.cloneNode(false); tt.textContent=txt; tt.setAttribute("x",x+(box?6:0)); g.appendChild(tt);
      if(box){ tt.setAttribute("font-weight","bold"); tt.setAttribute("font-style","normal"); tt.setAttribute("font-size",Math.max(fs,18)); }
      let w=fs*txt.length*0.5; try{ w=tt.getComputedTextLength(); }catch(e){}
      if(box){ try{ const bb=tt.getBBox(); const r=el("rect",{x:bb.x-5,y:bb.y-3,width:bb.width+10,height:bb.height+6,rx:2,fill:"#fff",stroke:"#000","stroke-width":1.8}); g.insertBefore(r,tt); }catch(e){} w+=12; }
      x+=w+fs*0.35;
    });
    t.remove();
  });
}
function applyCurStyle(){
  const st=$("curSel").value;
  ["playhead","pcur"].forEach(id=>{ const el=$(id); if(!el) return; el.classList.remove("cur-fine","cur-large","cur-none"); el.classList.add("cur-"+st); });
  lastCur=""; if(S.model) updateCursor(true);
}
function beatPx(mi){
  const G=S.geo, m=G&&G.meas[mi], M=dmeas(mi); if(!m||!M) return 24;
  const n=m.mr?m.mr.n:1;
  return Math.max(40,Math.min(135,1.125*(m.x2-m.xs)/n*(4/M.beatType)/M.len));   // un peu plus d'une pulsation
}
/* ---------- geometry : systems, measures (px, relative to the score drawing) ---------- */
/* point le plus haut des notes d'une mesure (notes aiguës, lignes supplémentaires) */
function noteTop(g,u){
  let t=g.PositionAndShape.AbsolutePosition.y;
  try{ for(const se of g.staffEntries||[]){ const ps=se.PositionAndShape; if(ps) t=Math.min(t,ps.AbsolutePosition.y+ps.BorderMarginTop);
    for(const gve of se.graphicalVoiceEntries||[]){ const pv=gve.PositionAndShape; if(pv) t=Math.min(t,pv.AbsolutePosition.y+pv.BorderMarginTop); } } }catch(e){}
  return t*u;
}
function buildGeometry(){
  const o=S.osmd, G={sys:[],meas:[],mx:{}}; S.geo=G;
  if(!o||!o.GraphicSheet) return;
  const u=10*o.zoom, idx=new Map();
  o.GraphicSheet.MusicPages.forEach(pg=>pg.MusicSystems.forEach(sy=>{ const ps=sy.PositionAndShape;
    idx.set(sy,G.sys.length); G.sys.push({top:(ps.AbsolutePosition.y+ps.BorderMarginTop)*u-6,bottom:(ps.AbsolutePosition.y+ps.BorderMarginBottom)*u+6}); }));
  o.GraphicSheet.MeasureList.forEach((row,mi)=>{
    const g=(row||[]).find(x=>x&&x.ParentMusicSystem&&idx.has(x.ParentMusicSystem));
    if(!g){ G.meas[mi]=null; return; }
    const ps=g.PositionAndShape;
    G.meas[mi]={x:(ps.AbsolutePosition.x+ps.BorderLeft)*u,x2:(ps.AbsolutePosition.x+ps.BorderRight)*u,sys:idx.get(g.ParentMusicSystem),
      xs:(ps.AbsolutePosition.x+ps.BorderLeft+(g.beginInstructionsWidth||0))*u, y:ps.AbsolutePosition.y*u, u, top:noteTop(g,u)};
  });
  for(const st of S.steps){ (G.mx[st.mi]=G.mx[st.mi]||[]).push(st); }
  // mesures regroupées dans un silence multiple : elles partagent la case du silence
  for(let mi=0;mi<G.meas.length;mi++){ if(G.meas[mi]) continue; let p=mi-1; while(p>=0&&!G.meas[p]) p--; if(p<0) continue;
    const base=G.meas[p].mr?G.meas[G.meas[p].mr.start]:G.meas[p]; const st=G.meas[p].mr?G.meas[p].mr.start:p;
    let e=mi; while(e+1<G.meas.length&&!G.meas[e+1]) e++;
    const n=e-st+1; for(let j=st;j<=e;j++) G.meas[j]=Object.assign({},base,{mr:{start:st,n,j:j-st}});
    mi=e; }
  G.sysFirst=[]; G.meas.forEach((m,mi)=>{ if(m && G.sysFirst[m.sys]===undefined) G.sysFirst[m.sys]=mi; });
  // haut réel de chaque ligne : les notes aiguës (lignes supplémentaires) dépassent du cadre calculé par OSMD
  G.meas.forEach(m=>{ if(m&&!m.mr&&isFinite(m.top)) G.sys[m.sys].top=Math.min(G.sys[m.sys].top,m.top-8); });
  // screen "pages" : as many systems as fit in the window
  const H=$("scoreWrap").clientHeight; G.pages=[]; G.pageOf=[];
  let i=0; while(i<G.sys.length){ const top=i===0?0:G.sys[i].top; let j=i; while(j+1<G.sys.length && G.sys[j+1].bottom-top<=H) j++;
    for(let k=i;k<=j;k++) G.pageOf[k]=G.pages.length; G.pages.push({a:i,b:j,top}); i=j+1; }
  // copy of the drawing for the page-turn preview
  const inner=$("turnInner"); inner.innerHTML="";
  if(!isLine()){ const cl=$("score").cloneNode(true); cl.removeAttribute("id"); cl.querySelectorAll("img,#pcur").forEach(x=>x.remove()); inner.appendChild(cl); }
  $("turn").style.display="none";
  $("playhead").style.display=isLine()?"block":"none";
  if(isLine()) $("playhead").style.left=($("scoreWrap").offsetLeft+S.pad)+"px";
}
/* ===== Paysage (téléphone, tablette) =====
   Par défaut, un téléphone en paysage lit en défilement, avec MESURES_VISIBLES_PAYSAGE mesures dans l'écran ;
   le zoom (curseur « Taille » ou deux doigts) reste libre ensuite et est retenu à part pour le paysage.
   Réglage « En paysage » : auto (téléphone = défilement, tablette = affichage standard conseillé), défilement, standard. */
const MESURES_VISIBLES_PAYSAGE=6;
function phoneLandscape(){ return window.matchMedia("(orientation: landscape) and (max-height: 500px) and (pointer: coarse)").matches; }
function touchLandscape(){ return window.matchMedia("(orientation: landscape) and (pointer: coarse)").matches; }
function isTablet(){ return window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width,screen.height)>=600; }
function landPref(){ const v=store("banda.landMode"); return v==="line"||v==="std"?v:"auto"; }
function landLine(){ if(!touchLandscape()) return false; const p=landPref(); return p==="line"||(p==="auto"&&!isTablet()); }
function layoutMode(){ return landLine()?"line":$("layoutSel").value; }
function isLine(){ return layoutMode()==="line"; }
function dmeas(i){ return isLine()?(S.seq[i]&&S.seq[i].M):S.model.meas[i]; }   // mesure du modèle pour une mesure affichée
function dIdx(k){ return isLine()?k:S.seq[k].mi; }
function xAt(mi,off){
  const G=S.geo; if(!G) return 0; const m=G.meas[mi];
  if(m){ const len=dmeas(mi)?dmeas(mi).len:4; const a=m.xs+6, b=m.x2+6; let f=Math.max(0,Math.min(1,off/len)); if(m.mr) f=(m.mr.j+f)/m.mr.n; return a+(b-a)*f; }
  const pts=G.mx[mi]||[];
  const len=S.model.meas[mi]?S.model.meas[mi].len:4;
  if(!pts.length) return m?m.x+(m.x2-m.x)*Math.min(1,off/len):0;
  let i=0; while(i+1<pts.length && pts[i+1].off<=off+1e-6) i++;
  const p0=pts[i]; if(off<p0.off) return p0.x;
  const p1=i+1<pts.length?pts[i+1]:{off:len,x:m?m.x2:p0.x};
  const f=p1.off>p0.off?(off-p0.off)/(p1.off-p0.off):0;
  return p0.x+(p1.x-p0.x)*Math.max(0,Math.min(1,f));
}
function stepFor(mi,off){
  let best=-1;
  for(let i=0;i<S.steps.length;i++){ const s=S.steps[i]; if(s.mi===mi){ if(s.off<=off+1e-6) best=i; } else if(best>=0) break; }
  if(best<0){ for(let i=0;i<S.steps.length;i++){ if(S.steps[i].mi>=mi){ best=i; break; } } }
  return best;
}
function moveCursorTo(idx){
  const c=S.osmd&&S.osmd.cursor; if(!c||idx<0) return;
  if(idx<S.stepIdx){ c.reset(); S.stepIdx=0; }
  while(S.stepIdx<idx && !c.Iterator.EndReached){ c.next(); S.stepIdx++; }
}
/* page mode : stay on the screen page, half page-turn on the last line */
/* mode page : l'écran suit la structure du morceau (reprises, voltas, D.S., coda, boucle).
   Sur la ligne d'où l'on part ailleurs, la ligne d'arrivée est montrée : encadrée si elle est visible,
   sinon en aperçu en haut (le reste flouté), et l'écran s'y place ensuite sans saut. */
function nextK(k){ const lr=loopRange(); if(lr && k>=lr[1] && k>=lr[0]) return lr[0]; return k+1<S.seq.length?k+1:-1; }
const TOP_PAD=40;   // place réservée en haut pour l'étiquette de la partie : rien ne passe dessous
function updatePage(k,force){
  const G=S.geo, e=S.seq[k]; if(!G||!e||!G.meas[e.mi]) return;
  const s=G.meas[e.mi].sys, wrap=$("scoreWrap"), turn=$("turn"), jm=$("jumpMark"), H=wrap.clientHeight;
  const vis=(i,sc)=>G.sys[i].top>=sc+TOP_PAD-2 && G.sys[i].bottom<=sc+H+2;
  let sc=wrap.scrollTop;
  if(!vis(s,sc)){
    if(S.pend && S.pend.T===s) sc=S.pend.sc;          // on arrive là où l'aperçu montrait la ligne : pas de saut
    else sc=s===0?0:G.sys[s].top-TOP_PAD;
    sc=Math.max(0,sc); wrap.scrollTop=sc; sc=wrap.scrollTop;
  }
  S.pend=null;
  // prochaine ligne jouée
  let k2=nextK(k), guard=0;
  while(k2>=0 && guard++<S.seq.length && G.meas[S.seq[k2].mi] && G.meas[S.seq[k2].mi].sys===s) k2=nextK(k2);
  turn.style.display="none"; if(jm) jm.style.display="none";
  if(k2<0||guard>=S.seq.length||!G.meas[S.seq[k2].mi]) return;
  const miT=S.seq[k2].mi, T=G.meas[miT].sys, mT=G.meas[miT], natural=(T===s+1 && miT===G.sysFirst[T]);
  const label=T<s?"↩ on reprend ici":(T>s+1||!natural)?"↪ on continue ici":"la suite";
  if(vis(T,sc)){
    if(!natural && jm){ const sy=G.sys[T]; jm.style.left=(mT.x-3)+"px"; jm.style.top=(sy.top-2)+"px"; jm.style.width=(Math.max(40,(mT.x2-mT.x))+6)+"px"; jm.style.height=(sy.bottom-sy.top+4)+"px";
      jm.querySelector("span").textContent=label; jm.style.display="block"; }
    return;
  }
  // ligne d'arrivée hors écran : aperçu, en haut si la place est libre, sinon juste sous la ligne en cours
  const nx=G.sys[T], hT=nx.bottom-nx.top, curTop=G.sys[s].top-sc, curBot=G.sys[s].bottom-sc;
  const above=curTop>=hT+8+TOP_PAD;
  const y0=above?TOP_PAD:Math.max(TOP_PAD,Math.min(curBot+2, H-hT));
  turn.style.top=y0+"px";
  $("turnPrev").style.height=hT+"px";
  $("turnInner").style.transform="translateY("+(-nx.top)+"px)";
  const skip=miT===G.sysFirst[T]?0:Math.max(0,mT.x-4);
  $("turnSkip").style.width=skip+"px";
  const lb=$("turnLbl"); lb.textContent=(above?"▲ ":"▼ ")+label.replace(/^[↩↪] /,"")+(miT!==G.sysFirst[T]?" (mes. "+S.model.meas[miT].number+")":"");
  lb.style.left=Math.max(6,skip+4)+"px";
  lb.style.top=above?(hT+4)+"px":"-24px";                 // l'étiquette ne cache jamais les notes de l'aperçu
  $("turnBlur").style.height=(above?Math.max(0,curTop-hT-TOP_PAD):Math.max(0,H-y0-hT))+"px";
  turn.style.display="block";
  S.pend={T, sc:nx.top-y0};
}
function updateLineView(mi,off){
  if(SIG.on) sigUpdate(mi);
  const wrap=$("scoreWrap"), x=xAt(mi,off), xi=Math.floor(x);
  wrap.scrollLeft=xi; $("score").style.transform="translateX("+(-(x-xi)).toFixed(2)+"px)";
}
/* =====================================================================
   Transport
   ===================================================================== */
let curSeq=0, curOff=0;
function seqAtTime(sec){ let lo=0,hi=S.seq.length-1; while(lo<hi){ const m=(lo+hi+1)>>1; if(S.seq[m].t<=sec) lo=m; else hi=m-1; } return lo; }
function loopRange(){
  if(!S.loop||!S.seq||!S.seq.length) return null;
  const a=Math.max(0,Math.min(S.seq.length-1,S.loop.a)), b=Math.max(a,Math.min(S.seq.length-1,S.loop.b));
  return [a,b];
}
async function play(noCount){
  if(!S.model) return;
  endPeek();
  const ac=audio(); if(ac.state!=="running") await ac.resume();
  const lr=loopRange();
  if(lr && (curSeq<lr[0]||curSeq>lr[1])){ curSeq=lr[0]; curOff=0; }
  // en séance, le chef laisse un peu d'avance pour que les musiciens reçoivent l'ordre à temps
  outputPlay();
  // en séance, on laisse aux musiciens le temps de recevoir l'ordre (un peu plus quand il passe par un relais)
  const LD=leadSec(), hop=SY.role==="m"&&accepted().length?treeDepthUsed():0, lead0=hop?Math.max(0.3+0.15*hop,peerLeadMax()+0.08+0.06*hop):0.12;
  let start=ac.currentTime+Math.max(lead0,LD+0.08);
  let ci=null;
  if($("countIn").checked && !noCount){
    const M=S.seq[curSeq].M, beat=60/M.tempo/S.speed*(4/M.beatType);
    ci={n:M.beats,beat};
    for(let b=0;b<M.beats;b++) click(start+b*beat-LD,b===0);
    start+=M.beats*beat;
  }
  playAt(curSeq,curOff,start);
  if(SY.role==="m") syncPush({start:true,ci});
}
/* démarre l'ordonnanceur : la position (k,off) sonne exactement au temps audio startCtx */
function playAt(k,off,startCtx){
  S.playing=true; setPlayIcon(true);
  curSeq=k; curOff=off;
  stopTicker();
  S.instances=[]; S.nextSeq=k;
  S.firstOff=off; S.nextCtx=startCtx; S.anchor={k,off,ctx:startCtx};
  startTicker(); schedule();
  cancelAnimationFrame(S.rafId); S.rafId=requestAnimationFrame(tick);
  keepAwake(true);
}
/* position atteinte dt secondes après (k,off), en suivant boucle et tempo ; null si fin du morceau */
function advancePos(k,off,dt){
  const lr=loopRange(); let guard=0;
  if(dt<0) return {k,off,early:-dt};
  while(guard++<100000){
    const e=S.seq[k]; if(!e) return null;
    const qs=60/e.M.tempo/S.speed, rem=(e.M.len-off)*qs;
    if(dt<rem) return {k,off:off+dt/qs};
    dt-=rem; k++; off=0;
    if(k>=S.seq.length || (lr && k>lr[1])){ if(lr) k=lr[0]; else return null; }
  }
  return null;
}
function seqSec(k,off){ const e=S.seq[k]; return e?(e.t+off*60/e.M.tempo)/S.speed:0; }
function pause(){
  if(!S.playing) return;
  const p=currentPos(); if(p){ curSeq=p.k; curOff=p.off; }
  stopAudio();
  if(S.model&&p){ updateUI(curSeq,curOff); updateCursor(true); }   // affichage exactement à l'endroit de l'arrêt
  if(SY.role==="m") syncPush();
}
function newSession(){
  const ac=audio();
  if(S.session){ const old=S.session; old.gain.setTargetAtTime(0,ac.currentTime,0.015); setTimeout(()=>{ try{ old.disconnect(); }catch(e){} },400); }
  if(S.sessionRev){ const old=S.sessionRev; old.gain.setTargetAtTime(0,ac.currentTime,0.05); setTimeout(()=>{ try{ old.disconnect(); }catch(e){} },1500); }
  S.session=ac.createGain(); S.session.connect(BUS);
  S.sessionRev=ac.createGain(); if(REVERB) S.sessionRev.connect(REVERB);
  S.parts.forEach(p=>{ if(p.out){ try{ p.out.disconnect(); }catch(e){} try{ p.send.disconnect(); }catch(e){}
    p.out.connect(S.session); p.out.connect(p.send); p.send.connect(S.sessionRev); } });
}
function stopAudio(){
  S.playing=false; stopTicker(); cancelAnimationFrame(S.rafId); setPlayIcon(false);
  if(AC) newSession();
}
function stop(){ endPeek(); if(S.playing) stopAudio(); curSeq=0; curOff=0; if(S.model){ updateUI(0,0); updateCursor(true);} if(SY.role==="m") syncPush(); }
/* minuterie dans un « worker » : elle n'est pas freinée quand la page ou l'onglet est occupé */
let TICKER=null;
function startTicker(){ stopTicker();
  try{ const src="let h=0;onmessage=e=>{ clearInterval(h); if(e.data>0) h=setInterval(()=>postMessage(0),e.data); };";
    TICKER=new Worker(URL.createObjectURL(new Blob([src],{type:"text/javascript"}))); TICKER.onmessage=()=>{ if(S.playing) schedule(); }; TICKER.postMessage(25);
  }catch(e){ TICKER=null; }
  S.sched=setInterval(schedule,50);   // secours
}
function stopTicker(){ if(TICKER){ try{ TICKER.postMessage(0); TICKER.terminate(); }catch(e){} TICKER=null; } clearInterval(S.sched); }
function schedule(){
  S.clickOn=$("clickOn").checked;
  const ac=AC, now=ac.currentTime, horizon=now+(S.boostUntil>now?4:0.6);   // 0,6 s d'avance (4 s pendant un redessin : rotation)
  const LD=leadSec();   // retard de la sortie (Bluetooth, AirPlay…) : le son est envoyé d'autant plus tôt
  const late=now-0.03;   // notes déjà passées (page bloquée) : on les saute plutôt que de les jouer en retard
  const lr=loopRange();
  while(S.nextCtx-LD<horizon){
    if(S.nextSeq>=S.seq.length || (lr && S.nextSeq>lr[1])){
      if(lr){ S.nextSeq=lr[0]; S.firstOff=0; }   /* boucle : pas de décompte, la musique s'enchaîne */
      else { if(S.instances.length && ac.currentTime>S.nextCtx+0.3){ if(SY.role==="f"){ stopAudio(); } else stop(); if(window.fxSongEnd) fxSongEnd(); } return; }
    }
    const e=S.seq[S.nextSeq], M=e.M, qs=60/M.tempo/S.speed;   // seconds per quarter
    const from=S.firstOff||0; S.firstOff=0;
    const t0=S.nextCtx-from*qs;
    S.instances.push({ctx:t0,k:e.k,qs,len:M.len});
    if(S.instances.length>64) S.instances.shift();
    const evs=S.evByMeasure.get(e.mi)||[];
    const anySolo=S.parts.some(p=>p.solo), silentAll=(SY.role==="f"&&!$("sessSound").checked)||S.gVol<=0.001;
    for(const ev of evs){
      { const pp=S.parts[ev.p]; if(silentAll||!pp||pp.mute||(anySolo&&!pp.solo)||pp.vol<=0.001) continue; }   // pistes muettes : on ne calcule rien
      if(ev.off<from-1e-6) continue;
      const when=t0+ev.off*qs-LD; if(when<late) continue; let dur=Math.max(0.05,ev.dur*qs*(ev.stacc?0.5:0.95));
      const ps=S.parts[ev.p]; if(!ps) continue;
      const hw=when+(Math.random()-0.5)*(ps.env.hum||0), hv=ev.vel*(0.97+Math.random()*0.06);   // jeu « humain » : micro-écarts
      if(ev.drum!==null && ev.drum!==undefined){ if(!playHit(ps,ev.drum,hw,hv)) drum(ps.gain,ev.drum,hw,hv); continue; }
      if(ev.midi===null) continue;
      if(playSample(ps,ev.midi,Math.max(when,hw),dur,hv)) continue;
      synthNote(ps.gain,ev.midi,when,dur,ev.vel,S.model.parts[ev.p].program);
    }
    if(S.clickOn){ const beat=qs*(4/M.beatType); for(let b=0;b*beat<M.len*qs-1e-6;b++){ const w=t0+b*beat-LD; if(w>=S.nextCtx-LD-1e-6&&w>=late) click(w,b===0); } }
    S.nextCtx=t0+M.len*qs; S.nextSeq++;
  }
}
/* horloge lissée : l'horloge audio avance par paquets, on la recale en douceur sur performance.now() */
const CLK={off:null};
function smoothNow(){
  const p=performance.now()/1000, a=AC.currentTime, d=a-p;
  if(CLK.off===null||Math.abs(d-CLK.off)>0.05) CLK.off=d; else CLK.off+=(d-CLK.off)*0.03;
  return p+CLK.off;
}
function currentPos(ahead){
  if(!S.playing||!AC) return null;
  const now=smoothNow()+(ahead||0); let inst=null;
  for(const i of S.instances){ if(i.ctx<=now) inst=i; else break; }
  if(!inst) return {k:S.instances.length?S.instances[0].k:curSeq,off:S.instances.length?0:curOff,pre:true};
  return {k:inst.k,off:Math.min(inst.len,(now-inst.ctx)/inst.qs)};
}
const PERF={n:0,sum:0,last:0,skip:0};
const FRAME_AHEAD=0.016;   // délai d'affichage d'une image (60 i/s)
function tick(){
  const t=performance.now();
  if(PERF.last){ const dt=t-PERF.last; PERF.n++; PERF.sum+=dt;
    if(PERF.n>=90){ const avg=PERF.sum/PERF.n; PERF.n=0; PERF.sum=0;
      if(avg>28 && !document.body.classList.contains("light")){ document.body.classList.add("light"); S.autoLight=true; console.info("Affichage allégé (images lentes : "+avg.toFixed(0)+" ms)"); } } }
  PERF.last=t;
  if(document.body.classList.contains("light") && (PERF.skip=(PERF.skip+1)%2)){ if(S.playing) S.rafId=requestAnimationFrame(tick); return; }   // mode léger : 1 image sur 2
  const p=currentPos((S.curAhead||0)+FRAME_AHEAD);   // le son part en avance du retard de la sortie ; l'image, elle, s'affiche une image plus tard : on l'avance d'autant
  if(p){ updateUI(p.k,p.off); updateCursor(false,p.k,p.off); }
  if(S.playing) S.rafId=requestAnimationFrame(tick);
}
let lastCur="";
function updateCursor(force,k,off){
  if(!S.osmd||!S.steps.length) return;
  if(k===undefined){ k=curSeq; off=curOff; }
  const e=S.seq[k]; if(!e) return;
  if(S.peek && performance.now()>S.peek.until) endPeek();
  const peeking=!!S.peek;
  const large=$("curSel").value==="large";
  if(isLine()){ if(peeking) return; updateLineView(k,off);
    const ph=$("playhead"); if(large){ const w=beatPx(k); ph.style.width=w+"px"; ph.style.marginLeft=(-w/2)+"px"; } else { ph.style.width=""; ph.style.marginLeft=""; }
    return; }
  const G=S.geo, m=G&&G.meas[e.mi], pc=$("pcur");
  if(m && pc){ const sy=G.sys[m.sys]; const x=xAt(e.mi,off)-6;
    const w=large?beatPx(e.mi):3;
    const px=x-(large?w/2:1), ph=sy.bottom-sy.top-8; pc._x=px;
    pc.style.transform="translate3d("+px.toFixed(1)+"px,"+(sy.top+4)+"px,0)";            // déplacement par la carte graphique : pas de redessin de la partition
    if(pc._w!==w){ pc._w=w; pc.style.width=w+"px"; } if(pc._h!==ph){ pc._h=ph; pc.style.height=ph+"px"; } if(pc.style.display!=="block") pc.style.display="block"; }
  if(peeking) return;            // aperçu en cours : le curseur avance, mais l'écran reste sur l'endroit regardé
  const key=k+":"+(m?m.sys:-1);
  if(!force && key===lastCur) return;
  if(m && pc && S.wideScore){ const wrap=$("scoreWrap"), x=pc._x||0; if(x<wrap.scrollLeft+40||x>wrap.scrollLeft+wrap.clientWidth-160) wrap.scrollLeft=Math.max(0,x-wrap.clientWidth*0.25); }
  lastCur=key; updatePage(k,force);
}
function updateUI(k,off){
  const e=S.seq[k]; if(!e) return;
  const sec=e.t+off*60/e.M.tempo;
  const pct=S.total?sec/S.total*100:0;
  $("fill").style.width=pct+"%"; $("head").style.left="calc("+pct+"% - 1px)";
  const beat=Math.floor(off*(e.M.beatType/4))+1;
  const pl=e.passes>1?passLabel(e):"";
  const txt="Mes. "+e.M.number+(pl?"|"+pl:"")+" · temps "+beat;
  if(S._posTxt!==txt){ S._posTxt=txt; $("pos").innerHTML="Mes. "+e.M.number+(pl?' <span class="pass">'+pl+'</span>':"")+" · temps "+beat; }
  if(window.drawBeat) drawBeat(k,off);
}
function seekSeq(k, off=0){
  const was=S.playing; if(was) stopAudio();
  curSeq=Math.max(0,Math.min(S.seq.length-1,k)); curOff=off;
  updateUI(curSeq,curOff); updateCursor(true);
  if(was) play(true); else if(SY.role==="m") syncPush();
}
/* clic sur une mesure : place le curseur (et relance si la lecture est en cours) */
function measureAtPoint(clientX,clientY){
  const G=S.geo, svg=$("score").querySelector("svg"); if(!G||!svg) return -1;
  const r=svg.getBoundingClientRect(), x=clientX-r.left, y=clientY-r.top;
  let best=-1, bd=1e9;
  G.meas.forEach((m,mi)=>{ if(!m) return; const sy=G.sys[m.sys]; if(y<sy.top||y>sy.bottom) return;
    if(x>=m.x-2 && x<=m.x2+2){ const d=Math.abs(x-(m.x+m.x2)/2); if(d<bd){ bd=d; best=mi; } } });
  return best;
}
function gotoMeasure(txt){
  if(!S.model) return;
  const n=String(txt).trim(); if(!n) return;
  let mis=S.model.meas.map((m,i)=>String(m.number)===n?i:-1).filter(i=>i>=0);
  if(!mis.length){ const v=parseInt(n,10); if(!isNaN(v)) mis=S.model.meas.map((m,i)=>parseInt(m.number,10)===v?i:-1).filter(i=>i>=0); }
  const occ=S.seq.filter(x=>mis.includes(x.mi));
  if(!occ.length){ toast("Mesure "+n+" introuvable",1600); return; }
  if(occ.length>1){ const r=$("gotoForm").getBoundingClientRect(); choosePass(occ,r.left+r.width/2,r.top); return; }
  jumpTo(occ[0].k);
}
$("gotoForm").addEventListener("submit",e=>{ e.preventDefault(); const i=$("gotoIn"); gotoMeasure(i.value); i.value=""; i.blur(); });
function passLabel(e){ return e.pass===1?"1re fois":e.pass===e.passes?"dernière fois":e.pass+"e fois"; }
function jumpTo(k){
  const lr=loopRange(); if(lr && (k<lr[0]||k>lr[1])) setLoop(null);
  seekSeq(k,0); closePass();
  const e=S.seq[k]; toast("Mesure "+e.M.number+(e.passes>1?" · "+passLabel(e):"")+(S.playing?"":" – appuie sur ▶"),1500);
}
/* mesure jouée plusieurs fois (reprise) : on choisit le passage */
function choosePass(occ,x,y,act){
  act=act||jumpTo;
  closePass();
  const d=document.createElement("div"); d.id="passPick";
  d.innerHTML=`<div class="pp-t">Mesure ${occ[0].M.number} : quel passage ?</div><div class="pp-b"></div>`;
  occ.forEach(e=>{ const b=document.createElement("button"); b.textContent=passLabel(e); b.onclick=ev=>{ ev.stopPropagation(); closePass(); act(e.k); }; d.querySelector(".pp-b").appendChild(b); });
  document.body.appendChild(d);
  const w=d.offsetWidth, h=d.offsetHeight;
  d.style.left=Math.max(8,Math.min(window.innerWidth-w-8,x-w/2))+"px"; d.style.top=Math.max(8,Math.min(window.innerHeight-h-8,y-h-14))+"px";
  clearTimeout(S.ppT); S.ppT=setTimeout(closePass,8000);
  setTimeout(()=>document.addEventListener("pointerdown",closePassOut,true),0);
}
function closePassOut(ev){ const d=$("passPick"); if(d&&!d.contains(ev.target)) closePass(); }
function closePass(){ const d=$("passPick"); if(d) d.remove(); document.removeEventListener("pointerdown",closePassOut,true); }
function onScoreClick(e){
  if(!S.model||S.dragged||performance.now()-(S.pinchEnd||0)<500) return;
  if(SY.role==="f"){ lockedToast(); return; }
  const mi=measureAtPoint(e.clientX,e.clientY); if(mi<0) return;
  const act=S.pick?pickK:(k=>{ endPeek(); jumpTo(k); });
  if(isLine()){ act(mi); return; }            // en défilement, chaque passage est une mesure distincte
  const occ=S.seq.filter(x=>x.mi===mi); if(!occ.length) return;
  if(occ.length>1){ choosePass(occ,e.clientX,e.clientY,act); return; }
  act(occ[0].k);
}
function drawBar(){
  const bar=$("bar"); bar.querySelectorAll(".tick,.mark").forEach(x=>x.remove());
  if(!S.total) return;
  const seen=new Set();
  S.seq.forEach(e=>{
    const left=e.t/S.total*100;
    if(e.M.marks.length){ const t=document.createElement("div"); t.className="tick"; t.style.left=left+"%"; bar.appendChild(t);
      const key=e.M.marks.join("|")+e.mi; if(!seen.has(key)){ seen.add(key); const m=document.createElement("div"); m.className="mark"; m.style.left=left+"%"; m.textContent=e.M.marks[0]; m.dataset.full=e.M.marks[0]; m.title=e.M.marks[0]; bar.appendChild(m);} }
  });
  layoutMarks();
}
/* repères de la barre : jamais tronqués ni superposés — nom complet si la place le permet, sinon abrégé, sinon simple trait */
function shortMark(t){ const w=t.split(/[\s–\-]+/).filter(Boolean); if(t.length<=3) return t; if(w.length>1) return w.map(x=>x[0]).join("").toUpperCase().slice(0,3); return t.slice(0,3)+"."; }
function layoutMarks(){
  const bar=$("bar"), W=bar.clientWidth; if(!W) return;
  const ms=[...bar.querySelectorAll(".mark")]; let prevRight=-1e9;
  for(const m of ms){
    const x=parseFloat(m.style.left)/100*W;
    let ok=false;
    for(const txt of [m.dataset.full, shortMark(m.dataset.full)]){
      m.textContent=txt; m.style.display=""; m.style.transform="";
      const w=m.offsetWidth; let x0=x; if(x0+w>W-2) x0=W-2-w;          // le dernier repère reste dans la barre
      if(x0>=prevRight+3){ if(x0!==x) m.style.transform="translateX("+(x0-x)+"px)"; prevRight=x0+w; ok=true; break; }
    }
    if(!ok) m.style.display="none";
  }
}
if(window.ResizeObserver) new ResizeObserver(()=>layoutMarks()).observe($("bar"));
function barSeq(x){ const r=$("bar").getBoundingClientRect(); const sec=Math.max(0,Math.min(1,(x-r.left)/r.width))*S.total; return seqAtTime(sec); }
function updateLoopZone(){
  const z=$("loopz"); const lr=loopRange();
  if(!lr||!S.total){ z.style.display="none"; return; }
  const a=S.seq[lr[0]], b=S.seq[lr[1]];
  z.style.display="block"; z.style.left=(a.t/S.total*100)+"%"; z.style.width=((b.t+b.dur-a.t)/S.total*100)+"%";
}
const SUP="⁰¹²³⁴⁵⁶⁷⁸⁹";
function fmtK(k){ const e=S.seq[k]; if(!e) return ""; return e.M.number+(e.passes>1?String(e.pass).split("").map(d=>SUP[+d]).join(""):""); }
function kLabel(k){ const e=S.seq[k]; return e?e.M.number+(e.passes>1?" ("+passLabel(e)+")":""):""; }
/* boucle définie par deux positions de la séquence jouée : le passage (1re / dernière fois) est donc précis */
function setLoop(a,b){ if(a==null||b==null){ setLoopK(null); return; } setLoopK(a,b); }
function setLoopK(a,b){
  if(a==null||b==null){ S.loop=null; $("loopBtn").classList.remove("on"); updateLoopZone(); if(SY.role==="m") syncLoopChanged(); return; }
  if(b<a) [a,b]=[b,a];
  S.loop={a,b}; S.loopDraft=null; $("loopA").value=fmtK(a); $("loopB").value=fmtK(b);
  $("loopBtn").classList.add("on"); updateLoopZone(); endPick();
  const lr=loopRange(); if(lr && !S.playing && SY.role!=="f"){ curSeq=lr[0]; curOff=0; updateUI(curSeq,0); updateCursor(true); }
  if(SY.role==="m") syncLoopChanged();
}
/* « 48 », « 48² », « 48.2 » ou « 48/2 » (2e passage) -> positions possibles dans la séquence */
function parseMeasureInput(v){
  v=String(v||"").trim(); if(!v) return null;
  let pass=null; const sup=v.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/); if(sup){ pass=parseInt(sup[0].split("").map(c=>SUP.indexOf(c)).join("")); v=v.slice(0,-sup[0].length); }
  const m=v.match(/^(\d+[a-zA-Z]?)(?:\s*[.\/·,]\s*(\d+))?$/); if(!m) return null;
  if(m[2]) pass=parseInt(m[2]);
  let occ=S.seq.filter(e=>String(e.M.number)===m[1]);
  if(!occ.length) occ=S.seq.filter(e=>parseInt(e.M.number)===parseInt(m[1]));
  if(pass) occ=occ.filter(e=>e.pass===pass);
  return occ;
}
/* choisir les bornes en touchant la case puis la mesure sur la partition */
function startPick(which){
  if(SY.role==="f"||!S.model) return;
  S.pick=which; document.body.classList.add("picking");
  $("loopA").classList.toggle("picking",which==="a"); $("loopB").classList.toggle("picking",which==="b");
  let h=$("pickHint"); if(!h){ h=document.createElement("div"); h.id="pickHint"; $("scoreBox").appendChild(h); }
  h.textContent=which==="a"?"Touchez la mesure de DÉBUT de la boucle":"Touchez la mesure de FIN de la boucle";
}
function endPick(){ S.pick=null; document.body.classList.remove("picking"); $("loopA").classList.remove("picking"); $("loopB").classList.remove("picking"); const h=$("pickHint"); if(h) h.remove(); }
function pickK(k){
  if(S.pick==="a"){ S.loopDraft={a:k}; $("loopA").value=fmtK(k); if(S.loop) setLoopK(null); startPick("b"); }
  else if(S.pick==="b"){ const a=S.loopDraft&&S.loopDraft.a!=null?S.loopDraft.a:(S.loop?S.loop.a:resolveLoopInput("loopA")); 
    if(a==null){ $("loopB").value=fmtK(k); S.loopDraft={b:k}; startPick("a"); return; }
    setLoopK(a,k); toast("Boucle "+kLabel(Math.min(a,k))+" → "+kLabel(Math.max(a,k)),2200); }
}
function resolveLoopInput(id,after){
  const occ=parseMeasureInput($(id).value); if(!occ||!occ.length) return null;
  if(occ.length===1) return occ[0].k;
  if(after!=null){ const n=occ.find(e=>e.k>=after); if(n) return n.k; }
  return occ[0].k;
}

/* =====================================================================
   UI wiring
   ===================================================================== */
function setPlayIcon(on){ const b=$("playBtn"); b.classList.toggle("on",on); document.body.classList.toggle("playing",!!on); if(on&&window.fxClear) fxClear(); b.querySelector("use").setAttribute("href",on?"#i-pause":"#i-play"); }
function syncLayoutSeg(){ document.querySelectorAll("#layoutSeg button").forEach(b=>b.classList.toggle("on",b.dataset.v===$("layoutSel").value)); }
function showPlayer(){ const was=document.body.classList.contains("inplayer"); document.body.classList.add("inplayer"); $("library").style.display="none"; $("player").classList.add("show"); $("backBtn").style.display="inline-block"; if(!was&&window.fxEnterPlayer) fxEnterPlayer(); if(!was) setTimeout(landSuggest,2500); if(window.tipsRefresh) tipsRefresh(); }
function showLibrary(){ stop(); $("kick").textContent="La Banda Familia · répétitions"; closeSheet(); document.body.classList.remove("inplayer"); $("side").classList.remove("open"); $("player").classList.remove("show"); $("library").style.display="block"; $("backBtn").style.display="none"; $("title").textContent="Nos morceaux"; if(window.fxEnterLibrary) fxEnterLibrary(); if(window.tipsRefresh) tipsRefresh(); }
function showLoading(t){ if($("player").classList.contains("show")){ const l=$("loading"); l.textContent=t; l.style.display="flex"; } else $("libInfo").textContent=t; }
function hideLoading(){ $("loading").style.display="none"; }

$("backBtn").onclick=()=>{ if(SY.role==="f"){ lockedToast("🔒 C'est le chef qui choisit le morceau"); return; } showLibrary(); };
(function(){ const w=$("scoreWrap"); let sx=0,sy=0;
  w.addEventListener("pointerdown",e=>{ sx=e.clientX; sy=e.clientY; S.dragged=false; });
  w.addEventListener("pointermove",e=>{ if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>8) S.dragged=true; });
  w.addEventListener("click",onScoreClick); })();
/* ---------- thèmes ---------- */
function setTheme(t){
  if(!["neon","boule","scene","fete","fiesta","guinguette"].includes(t)) t="neon";
  document.body.dataset.theme=t; store("banda.theme",t);
  const img=(t==="fete"||t==="fiesta")?IMG.white:IMG.ball; $("logoImg").src=img; $("heroImg").src=img;
  document.querySelectorAll("#themes .th").forEach(b=>b.classList.toggle("sel",b.dataset.t===t));
  const tc={neon:"#050507",boule:"#0b0a26",scene:"#1b1c20",fete:"#e0218a",fiesta:"#ff3d7f",guinguette:"#0c1626"}[t];
  if(window.fxThemeChanged) fxThemeChanged(t);
  let m=document.querySelector('meta[name=theme-color]'); if(!m){ m=document.createElement("meta"); m.name="theme-color"; document.head.appendChild(m); } m.content=tc;
}
document.querySelectorAll("#themes .th").forEach(b=>b.onclick=()=>setTheme(b.dataset.t));
setTheme(store("banda.theme")||"neon");
$("playBtn").onclick=()=>{ S.playing?pause():play(); };
$("stopBtn").onclick=stop;
function narrow(){ return window.matchMedia("(max-width: 820px), (max-height: 500px) and (pointer: coarse)").matches; }
$("homeFab").onclick=()=>$("backBtn").click(); $("lpSide").onclick=()=>$("sideToggle").click();
$("lpSet").onclick=()=>$("settingsBtn").click(); $("lpSess").onclick=()=>$("sessBtn").click();
/* rotation du téléphone : on refait la mise en page (paysage = défilement) */
{ let lastLP=landLine(); const mq=window.matchMedia("(orientation: landscape)");
  const onRot=()=>{ const lp=landLine(); landUI(); if(lp===lastLP) return; lastLP=lp; closeSheet(); syncZoom(); landSuggest(); };   // la mise en page est refaite par l'événement « resize »
  mq.addEventListener?mq.addEventListener("change",onRot):mq.addListener(onRot); }
/* réglage « En paysage » */
function landUI(){ document.body.classList.toggle("landline",landLine());
  document.querySelectorAll("#landSeg button").forEach(b=>b.classList.toggle("on",b.dataset.v===landPref()));
  const n=$("landNote"); if(n){ const p=landPref();
    n.textContent=p==="auto"?(isTablet()?"Auto : tablette détectée, affichage standard conseillé en paysage.":"Auto : en paysage, défilement sur "+MESURES_VISIBLES_PAYSAGE+" mesures (la taille reste réglable).")
      :p==="line"?"Toujours en défilement en paysage ("+MESURES_VISIBLES_PAYSAGE+" mesures au départ).":"Toujours l'affichage choisi ci-dessus, même en paysage."; }
  const lb=$("lpView"); if(lb){ lb.classList.toggle("on",!landLine()); lb.title=landLine()?"Passer en affichage standard":"Revenir au défilement"; } }
function setLandPref(v){ if(v==="auto") store("banda.landMode",""); else store("banda.landMode",v);
  try{ if(v==="auto") localStorage.removeItem("banda.landMode"); }catch(e){}
  landUI(); syncZoom(); relayout(); }
document.querySelectorAll("#landSeg button").forEach(b=>b.onclick=()=>setLandPref(b.dataset.v));
if($("lpView")) $("lpView").onclick=()=>{ const toStd=landLine(); setLandPref(toStd?"std":(isTablet()?"line":"auto"));
  toast(toStd?"Affichage standard en paysage · « Auto » dans Réglages › Affichage pour revenir":"Défilement en paysage",3200); };
/* tablette en paysage : on signale une fois que l'affichage standard est utilisé (et qu'on peut passer en défilement) */
function landSuggest(){ if(!touchLandscape()||!isTablet()||landPref()!=="auto"||store("banda.tabHint")==="1"||!document.body.classList.contains("inplayer")) return;
  store("banda.tabHint","1"); toast("Tablette : affichage standard en paysage. Pour le défilement : Réglages › Affichage › En paysage.",5000); }
landUI();
if(store("banda.sideHidden")==="1") document.body.classList.add("sideHidden");
function closeSheet(){ $("side").classList.remove("open"); $("sheetBack").classList.remove("on"); }
$("sheetBack").onclick=closeSheet;
$("sideToggle").onclick=()=>{
  if(narrow()){ const o=!$("side").classList.contains("open"); $("side").classList.toggle("open",o); $("sheetBack").classList.toggle("on",o); return; }
  document.body.classList.toggle("sideHidden"); store("banda.sideHidden",document.body.classList.contains("sideHidden")?"1":"0");
  clearTimeout(rzT); rzT=setTimeout(relayout,340);
};
if(store("banda.light")==="1") document.body.classList.add("light");
$("lightMode").checked=document.body.classList.contains("light");
$("lightMode").onchange=()=>{ document.body.classList.toggle("light",$("lightMode").checked); store("banda.light",$("lightMode").checked?"1":"0"); };
$("mixReset").onclick=()=>{ if(S.model){ defaultMix(); toast("Volumes remis par défaut"); } };
bindBar($("gvol"),()=>S.gVol,v=>{ S.gVol=v; store("banda.gvol",v.toFixed(2)); applyMaster(); });
$("localBtn").onclick=()=>$("localFile").click();
$("localFile").onchange=async e=>{ const f=e.target.files[0]; if(!f) return; showPlayer(); await openBuffer(await f.arrayBuffer(), f.name, f.name.replace(SCORE_EXT,"")); e.target.value=""; };
function setKick(){ const P=S.model&&S.model.parts[S.myPart]; $("kick").textContent=P?"Ma partie : "+P.name:"La Banda Familia · répétitions"; $("partTagTxt").textContent=P?P.name:""; $("partTag").hidden=!P; $("partTag").title=P?"Partie affichée : "+P.name+" – toucher pour changer":""; if(window.beatSync) setTimeout(beatSync,0); }
/* changer de partie en touchant son nom sur la partition */
function openPartMenu(){
  const m=$("partMenu"), sel=$("partSel"); m.innerHTML="";
  [...sel.options].forEach(o=>{ const b=document.createElement("button"); b.type="button"; b.setAttribute("role","option");
    b.textContent=o.textContent; if(o.value===sel.value){ b.className="on"; b.setAttribute("aria-selected","true"); }
    b.onclick=ev=>{ ev.stopPropagation(); closePartMenu(); if(sel.value!==o.value){ sel.value=o.value; sel.dispatchEvent(new Event("change")); } };
    m.appendChild(b); });
  m.hidden=false; $("partTag").setAttribute("aria-expanded","true");
  const cur=m.querySelector(".on"); if(cur) cur.scrollIntoView({block:"nearest"});
}
function closePartMenu(){ $("partMenu").hidden=true; $("partTag").setAttribute("aria-expanded","false"); }
$("partTag").onclick=e=>{ e.stopPropagation(); $("partMenu").hidden?openPartMenu():closePartMenu(); };
document.addEventListener("pointerdown",e=>{ if(!$("partMenu").hidden&&!e.target.closest("#partMenu,#partTag")) closePartMenu(); },true);
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&!$("partMenu").hidden) closePartMenu(); });
$("partSel").onchange=async e=>{ S.myPart=parseInt(e.target.value); setKick(); store("banda.part",S.model.parts[S.myPart].name); drawMixer(); relayout(); };
$("viewSel").onchange=()=>relayout();
$("layoutSel").onchange=()=>relayout();
function zoomKey(){ return landLine()?"banda.zoomLand":"banda.zoom"; }
function syncZoom(){ const z=parseInt(store(zoomKey())); $("zoom").value=(z>=50&&z<=160)?z:100; }
let zt=0; $("zoom").oninput=()=>{ store(zoomKey(),$("zoom").value); clearTimeout(zt); zt=setTimeout(relayout,250); };
syncZoom();
/* zoom à deux doigts (téléphone, tablette) et pincement du pavé tactile / Ctrl + molette (ordinateur).
   Pendant le geste, la partition est simplement agrandie à l'image ; au lâcher, elle est redessinée à la nouvelle taille
   (sans arrêter la musique) et la mesure qui était sous les doigts reste en vue. */
(function(){
  const w=$("scoreWrap"), box=$("scoreBox"), zi=$("zoom");
  const MIN=+zi.min, MAX=+zi.max;
  let pz=null, wheelT=0;
  const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  const mid=t=>({x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2});
  function begin(cx,cy){
    if(!S.osmd) return null;
    const r=w.getBoundingClientRect();
    const mi=isLine()?-1:measureAtPoint(cx,cy);
    const g={z0:+zi.value,scale:1,cx,cy,ox:cx-r.left,oy:cy-r.top,mi};
    box.classList.add("pinching"); w.style.transformOrigin=g.ox+"px "+g.oy+"px";
    return g;
  }
  function show(g,sc){
    g.scale=Math.max(MIN/g.z0,Math.min(MAX/g.z0,sc));
    w.style.transform="scale("+g.scale.toFixed(3)+")";
    zoomTip(Math.round(g.z0*g.scale));
  }
  async function finish(g){
    w.style.transform=""; box.classList.remove("pinching"); S.pinchEnd=performance.now();
    const nz=Math.round(Math.max(MIN,Math.min(MAX,g.z0*g.scale))/5)*5;
    if(Math.abs(nz-g.z0)<5) return;
    zi.value=nz; store(zoomKey(),nz);
    await relayout();
    // garder en vue la mesure qui était sous les doigts (à l'arrêt ; en lecture, la partition suit la musique)
    if(!S.playing && g.mi>=0 && S.geo && S.geo.meas[g.mi]){ const m=S.geo.meas[g.mi], sy=S.geo.sys[m.sys]; w.scrollTop=Math.max(0,sy.top-g.oy+(sy.bottom-sy.top)/2); }
  }
  w.addEventListener("touchstart",e=>{ if(e.touches.length===2){ e.preventDefault(); const c=mid(e.touches); pz=begin(c.x,c.y); if(pz){ pz.d0=dist(e.touches); S.dragged=true; } } },{passive:false});
  w.addEventListener("touchmove",e=>{ if(pz&&e.touches.length===2){ e.preventDefault(); show(pz,dist(e.touches)/pz.d0); } },{passive:false});
  const end=e=>{ if(pz&&e.touches.length<2){ const g=pz; pz=null; finish(g); } };
  w.addEventListener("touchend",end); w.addEventListener("touchcancel",end);
  // Safari iOS : empêcher le zoom de toute la page
  ["gesturestart","gesturechange"].forEach(t=>w.addEventListener(t,e=>e.preventDefault(),{passive:false}));
  // ordinateur : pincement du pavé tactile (= Ctrl + molette)
  let wg=null;
  w.addEventListener("wheel",e=>{ if(!e.ctrlKey) return; e.preventDefault();
    if(!wg) wg=begin(e.clientX,e.clientY); if(!wg) return;
    show(wg,wg.scale*Math.exp(-e.deltaY*0.01));
    clearTimeout(wheelT); wheelT=setTimeout(()=>{ const g=wg; wg=null; finish(g); },300); },{passive:false});
})();
function zoomTip(v){ let t=$("zoomTip"); if(!t){ t=document.createElement("div"); t.id="zoomTip"; $("scoreBox").appendChild(t); }
  t.textContent=v+" %"+(landLine()?" · ≈ "+Math.max(1,Math.round(MESURES_VISIBLES_PAYSAGE*100/v))+" mesures":""); t.classList.add("on"); clearTimeout(zoomTip.t); zoomTip.t=setTimeout(()=>t.classList.remove("on"),700); }
$("speed").oninput=e=>{ $("speedLbl").textContent=e.target.value+" %"; $("tempoLbl").textContent=e.target.value+" %"; };
function nudgeTempo(d){ const r=$("speed"); const v=Math.max(+r.min,Math.min(+r.max,+r.value+d)); if(v===+r.value) return; r.value=v; r.dispatchEvent(new Event("input")); r.dispatchEvent(new Event("change")); }
$("tempoDown").onclick=()=>nudgeTempo(-5); $("tempoUp").onclick=()=>nudgeTempo(5);
document.querySelectorAll("#layoutSeg button").forEach(b=>b.onclick=()=>{ if($("layoutSel").value===b.dataset.v) return; $("layoutSel").value=b.dataset.v; store("banda.layout",b.dataset.v); syncLayoutSeg(); $("layoutSel").dispatchEvent(new Event("change")); });
{ const l=store("banda.layout"); if(l&&["page","idem","line"].includes(l)) $("layoutSel").value=l; syncLayoutSeg(); }
$("songSearch").oninput=filterSongs;
$("offlineBtn").onclick=prepareOffline;
/* installation sur l'écran d'accueil */
let INSTALL=null;
window.addEventListener("beforeinstallprompt",e=>{ e.preventDefault(); INSTALL=e; $("installBtn").style.display="inline-flex"; });
$("installBtn").onclick=async()=>{ if(!INSTALL) return; INSTALL.prompt(); try{ await INSTALL.userChoice; }catch(e){} INSTALL=null; $("installBtn").style.display="none"; };
{ const standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  if(ios&&!standalone&&/^https?:/.test(location.protocol)){ const h=$("installHint"); h.innerHTML="📲 <b>Astuce iPhone / iPad :</b> touchez <b>Partager</b> puis <b>« Sur l'écran d'accueil »</b> pour installer l'application (plein écran, hors connexion)."; h.style.display="block"; } }
$("appVer").textContent="Version "+(window.BANDA_VERSION||"");
if("serviceWorker" in navigator && /^https?:/.test(location.protocol) && !/localhost:8765/.test(location.host)){
  navigator.serviceWorker.register("sw.js").catch(e=>console.warn("sw",e));
} else $("offlineBtn").style.display="none";
/* plein écran (ordinateur, Android ; l'iPhone utilise l'application installée) */
if(document.fullscreenEnabled||document.webkitFullscreenEnabled) document.body.classList.add("canfull");
$("fullBtn").onclick=()=>{ const d=document; if(d.fullscreenElement||d.webkitFullscreenElement){ (d.exitFullscreen||d.webkitExitFullscreen).call(d); } else { const e=d.documentElement; (e.requestFullscreen||e.webkitRequestFullscreen).call(e); } };
/* qualité des sons */
function syncSfq(){ const v=store("banda.sfq")==="light"?"light":"hd"; document.querySelectorAll("#sfqSeg button").forEach(b=>b.classList.toggle("on",b.dataset.v===v)); }
document.querySelectorAll("#sfqSeg button").forEach(b=>b.onclick=()=>{ store("banda.sfq",b.dataset.v); syncSfq(); if(S.model) loadSounds(); });
syncSfq();
$("speed").onchange=e=>{ const was=S.playing; if(was) pause(); S.speed=e.target.value/100; if(was) play(); else if(SY.role==="m") syncPush(); };
$("countIn").onchange=$("clickOn").onchange=()=>{ if(SY.role==="m") syncPush(); };
$("curSel").value="large";
$("curSel").onchange=()=>{ store("banda.cur",$("curSel").value); applyCurStyle(); };
$("curOff").value=store("banda.curoff")||0;
function curOffUI(){ const v=parseInt($("curOff").value)||0; S.curAhead=v/1000; $("curOffLbl").textContent=(v>0?"+":"")+v+" ms"; }
$("curOff").oninput=()=>{ store("banda.curoff",$("curOff").value); curOffUI(); }; curOffUI();
$("minusOne").onclick=()=>{ const on=!S.parts[S.myPart].mute; S.parts.forEach((p,i)=>{ p.solo=false; p.mute=(i===S.myPart)?on:!!S.model.parts[i].hidden; }); drawMixer(); applyGains(); };
$("soloMine").onclick=()=>{ const on=!(S.parts[S.myPart].solo && S.parts.filter(p=>p.solo).length===1); S.parts.forEach((p,i)=>{ p.mute=false; p.solo=on&&i===S.myPart; }); drawMixer(); applyGains(); };
$("allOn").onclick=()=>{ S.parts.forEach((p,i)=>{ p.mute=!!S.model.parts[i].hidden; p.solo=false; }); drawMixer(); applyGains(); };
$("loopBtn").onclick=()=>{ endPick(); if(S.loop){ setLoopK(null); return; }
  const a=resolveLoopInput("loopA"), b=a!=null?resolveLoopInput("loopB",a):null;
  if(a==null||b==null){ const p=currentPos()||{k:curSeq}; const k=p.k, k2=Math.min(S.seq.length-1,k+3); setLoopK(k,k2); toast("Boucle "+kLabel(k)+" → "+kLabel(k2)); } else setLoopK(a,b); };
["loopA","loopB"].forEach(id=>{ const el=$(id), w=id==="loopA"?"a":"b";
  el.addEventListener("pointerdown",()=>startPick(w));
  el.addEventListener("focus",()=>startPick(w));
  el.addEventListener("keydown",ev=>{
    if(ev.key==="Escape"){ endPick(); el.blur(); return; }
    if(ev.key!=="Enter") return; ev.preventDefault();
    const occ=parseMeasureInput(el.value); if(!occ||!occ.length){ toast("Mesure introuvable",1500); return; }
    if(w==="a"){ if(occ.length>1){ const r=el.getBoundingClientRect(); choosePass(occ,r.left+r.width/2,r.top,pickK); return; } pickK(occ[0].k); $("loopB").focus(); }
    else { const a=S.loopDraft&&S.loopDraft.a!=null?S.loopDraft.a:resolveLoopInput("loopA"); let k;
      if(occ.length>1&&a==null){ const r=el.getBoundingClientRect(); choosePass(occ,r.left+r.width/2,r.top,pickK); return; }
      k=(occ.find(e=>a!=null&&e.k>=a)||occ[0]).k; pickK(k); el.blur(); } });
});
// fin du choix : touche Échap, ou un clic ailleurs que sur la partition / les cases
document.addEventListener("pointerdown",ev=>{ if(!S.pick) return; if(ev.target.closest("#scoreWrap,.loopctl,#passPick")) return; endPick(); },true);
// barre d'avancement : elle montre où l'on en est ; la toucher (ou y glisser le doigt) fait seulement VOIR cet endroit.
// La lecture ne bouge que si l'on touche ensuite une mesure.
(function(){
  const bar=$("bar"); let down=false;
  bar.addEventListener("pointerdown",e=>{ if(!S.model) return; down=true; bar.setPointerCapture(e.pointerId); peekAt(barSeq(e.clientX)); });
  bar.addEventListener("pointermove",e=>{ if(down) peekAt(barSeq(e.clientX)); });
  bar.addEventListener("pointerup",()=>{ down=false; if(S.peek&&S.playing) S.peek.until=performance.now()+4000; });
  bar.addEventListener("pointercancel",()=>{ down=false; });
})();
function peekAt(k){
  if(!S.geo||!S.seq[k]) return;
  S.peek={k,until:(S.playing||SY.role==="f")?performance.now()+4000:Infinity};
  const e=S.seq[k], wrap=$("scoreWrap"), G=S.geo;
  $("turn").style.display="none"; const jm=$("jumpMark"); if(jm) jm.style.display="none";
  if(isLine()){ updateLineView(k,0); $("playhead").style.visibility="hidden"; }
  else { const m=G.meas[e.mi]; if(m){ const sy=G.sys[m.sys]; wrap.scrollTop=Math.max(0,sy.top-(m.sys===0?0:TOP_PAD)); } }
  let g=$("peekHead"); if(!g){ g=document.createElement("div"); g.id="peekHead"; g.className="peekhead"; $("bar").appendChild(g); }
  g.style.left=(e.t/S.total*100)+"%";
  let h=$("peekHint"); if(!h){ h=document.createElement("div"); h.id="peekHint"; $("scoreBox").appendChild(h); }
  h.innerHTML="Aperçu : mesure "+e.M.number+(e.passes>1?" ("+passLabel(e)+")":"")+(SY.role==="f"?"":" — <b>touchez une mesure</b> pour y aller")+' <button type="button" id="peekBack">Revenir</button>';
  $("peekBack").onclick=ev=>{ ev.stopPropagation(); endPeek(); };
}
function endPeek(){
  if(!S.peek) return; S.peek=null;
  const g=$("peekHead"); if(g) g.remove(); const h=$("peekHint"); if(h) h.remove();
  $("playhead").style.visibility=""; lastCur=""; S.pend=null;
  if(S.playing){ const p=currentPos(); if(p) updateCursor(true,p.k,p.off); } else updateCursor(true);
}

/* raccourcis clavier : espace lecture/pause · ←/→ mesure précédente/suivante · Début retour au début · +/- tempo · B boucle · R réglages */
document.addEventListener("keydown",e=>{
  if(e.target.tagName==="INPUT"||e.target.tagName==="SELECT"||e.target.tagName==="TEXTAREA"||e.ctrlKey||e.metaKey||e.altKey) return;
  if(!S.model||!$("player").classList.contains("show")) return;
  if(e.key==="r"||e.key==="R"){ $("sideToggle").click(); return; }
  if(SY.role==="f") return;
  const cur=()=>{ const p=currentPos(); return p?p.k:curSeq; };
  switch(e.key){
    case " ": e.preventDefault(); S.playing?pause():play(); break;
    case "ArrowRight": e.preventDefault(); seekSeq(Math.min(S.seq.length-1,cur()+1)); break;
    case "ArrowLeft": e.preventDefault(); seekSeq(Math.max(0,cur()-1)); break;
    case "Home": e.preventDefault(); stop(); break;
    case "+": case "=": nudgeTempo(5); break;
    case "-": nudgeTempo(-5); break;
    case "b": case "B": $("loopBtn").click(); break;
  }
});
/* commandes de l'écran verrouillé / casque (téléphone) */
function mediaSession(){
  if(!("mediaSession" in navigator)) return;
  try{
    navigator.mediaSession.metadata=new MediaMetadata({title:S.title||"La Banda Familia",artist:"AFC La Banda Familia",album:(S.model&&S.model.parts[S.myPart]?S.model.parts[S.myPart].name:""),
      artwork:[{src:"icons/icon-512.png",sizes:"512x512",type:"image/png"}]});
    navigator.mediaSession.setActionHandler("play",()=>{ if(SY.role!=="f"&&!S.playing) play(); });
    navigator.mediaSession.setActionHandler("pause",()=>{ if(SY.role!=="f"&&S.playing) pause(); });
    navigator.mediaSession.setActionHandler("stop",()=>{ if(SY.role!=="f") stop(); });
  }catch(e){}
}
$("settingsBtn").onclick=()=>{ const c=cfg(); $("cfgKey").value=c.apiKey; $("cfgFolder").value=c.folderId; $("settings").showModal(); };
$("cfgSave").onclick=()=>{ store("banda.key",$("cfgKey").value.trim()); store("banda.folder",folderIdFrom($("cfgFolder").value)); setTimeout(loadLibrary,50); };
/* changement de taille / rotation : on redessine SANS arrêter la musique. L'horloge audio n'est jamais touchée :
   on programme quelques secondes de son d'avance pendant que l'affichage se refait, et le curseur se recale tout seul. */
let rzT=0, rzBusy=false, rzAgain=false;
async function relayout(){
  if(!S.osmd) return;
  if(rzBusy){ rzAgain=true; return; }
  rzBusy=true;
  try{
    if(S.playing&&AC){ S.boostUntil=AC.currentTime+6; schedule(); }
    await renderScore();
  } finally {
    rzBusy=false; S.boostUntil=0; if(window.beatSync) beatSync();
    if(S.playing){ const p=currentPos(); if(p) updateCursor(true,p.k,p.off); }
    if(rzAgain){ rzAgain=false; relayout(); }
  }
}
window.addEventListener("resize",()=>{ clearTimeout(rzT); rzT=setTimeout(relayout,350); });

/* =====================================================================
   Séance synchronisée : un chef, des musiciens
   ===================================================================== */
const SY={role:null,code:"",peer:null,peers:new Map(),conn:null,bc:null,id:devId(),epoch:0,opened:false,lastStateAt:0,joinFails:0,everJoined:false,wantChef:false,
  samples:[],offset:null,pending:null,last:null,lastRaw:null,depth:0,target:"",avoid:[],full:false,beacon:0,pingT:0,retry:0,openT:0,wake:null,wantSong:null,ver:0};
const CODE_CH="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/* identifiant de ce téléphone, gardé d'une ouverture à l'autre (pour reprendre sa séance) */
function devId(){ if(/[?&]synctest=1/.test(location.search)) return Math.random().toString(36).slice(2,10);   // tests : plusieurs onglets = plusieurs téléphones
  let d=null; try{ d=localStorage.getItem("banda.dev"); }catch(e){} if(!d){ d=Math.random().toString(36).slice(2,10); try{ localStorage.setItem("banda.dev",d); }catch(e){} } return d; }
/* dernière séance : code, rôle, date — pour « Reprendre la dernière séance » */
function saveLastSession(role){ try{ localStorage.setItem("banda.lastSession",JSON.stringify({code:SY.code,role,dev:SY.id,date:Date.now()})); }catch(e){} }
function lastSession(){ try{ const j=JSON.parse(localStorage.getItem("banda.lastSession")||"null"); if(j&&j.code&&Date.now()-j.date<12*3600e3) return j; }catch(e){} return null; }
const PEER_PREFIX="afc-labanda-familia-";
const TEST_BUS=/[?&]synctest=1/.test(location.search);
if(TEST_BUS) window.Peer=makeMockPeer();
/* faux PeerJS pour les tests automatiques : plusieurs onglets du même navigateur se parlent par BroadcastChannel,
   avec les mêmes événements que PeerJS (open, connection, data, close, erreurs « id pris » et « introuvable »).
   Une liaison qui ne donne plus signe de vie depuis 4 s est déclarée fermée (comme une vraie liaison qui tombe). */
function makeMockPeer(){
  const bus=new BroadcastChannel("mock-peerjs"), peers=new Map();
  bus.onmessage=ev=>{ const m=ev.data;
    if(m.type==="claim"){ for(const p of peers.values()) if(p.id===m.id&&!p.destroyed) bus.postMessage({type:"taken",id:m.id,nonce:m.nonce}); return; }
    for(const p of peers.values()) p._msg(m); };
  class Ev{ constructor(){ this.h={}; } on(e,f){ (this.h[e]=this.h[e]||[]).push(f); return this; } emit(e,...a){ (this.h[e]||[]).forEach(f=>{ try{ f(...a); }catch(err){ console.error(err); } }); } }
  class Conn extends Ev{
    constructor(p,peer,cid){ super(); this.p=p; this.peer=peer; this.cid=cid; this.open=false; this.last=performance.now(); }
    send(d){ if(this.open) bus.postMessage({type:"data",cid:this.cid,to:this.peer,from:this.p.id,d}); }
    close(){ if(this.closed) return; this.closed=true; const was=this.open; this.open=false; bus.postMessage({type:"close",cid:this.cid,to:this.peer}); this.p.conns.delete(this.cid); if(was||true) this.emit("close"); }
    _drop(){ if(this.closed) return; this.closed=true; this.open=false; this.p.conns.delete(this.cid); this.emit("close"); }
  }
  class P extends Ev{
    constructor(id,opts){ super(); if(typeof id!=="string") id="mock-"+Math.random().toString(36).slice(2,10); this.id=id; this.conns=new Map(); this.open=false; this.destroyed=false; const me=Symbol(); peers.set(me,this); this._key=me;
      const nonce=Math.random(); let taken=false; const tk=ev=>{ if(ev.data.type==="taken"&&ev.data.nonce===nonce) taken=true; }; bus.addEventListener("message",tk);
      bus.postMessage({type:"claim",id,nonce});
      setTimeout(()=>{ bus.removeEventListener("message",tk); if(this.destroyed) return; if(taken){ this.emit("error",{type:"unavailable-id"}); return; } this.open=true; this.emit("open",id); },150);
      this.hb=setInterval(()=>{ const now=performance.now(); for(const c of [...this.conns.values()]){ if(c.open) bus.postMessage({type:"hb",cid:c.cid,to:c.peer}); if(now-c.last>4000) c._drop(); } },1000); }
    connect(target){ const cid=Math.random().toString(36).slice(2); const c=new Conn(this,target,cid); this.conns.set(cid,c);
      bus.postMessage({type:"conn",cid,to:target,from:this.id});
      setTimeout(()=>{ if(!c.open&&!c.closed){ this.conns.delete(cid); c.closed=true; this.emit("error",{type:"peer-unavailable"}); } },1500);
      return c; }
    _msg(m){ if(this.destroyed||m.to!==this.id) return;
      if(m.type==="conn"){ const c=new Conn(this,m.from,m.cid); this.conns.set(m.cid,c); this.emit("connection",c); c.open=true; bus.postMessage({type:"ack",cid:m.cid,to:m.from}); setTimeout(()=>c.emit("open"),0); return; }
      const c=this.conns.get(m.cid); if(!c) return; c.last=performance.now();
      if(m.type==="ack"){ c.open=true; c.emit("open"); }
      else if(m.type==="data") c.emit("data",m.d);
      else if(m.type==="close") c._drop(); }
    reconnect(){} disconnect(){}
    destroy(){ if(this.destroyed) return; for(const c of [...this.conns.values()]) c.close(); this.destroyed=true; this.open=false; clearInterval(this.hb); peers.delete(this._key); this.emit("close"); }
  }
  return P;
}
function lockedToast(m){ toast(m||"🔒 Commandé par le chef",1500); }
/* -- écran toujours allumé -- */
async function keepAwake(on){
  try{
    if(on){ if(!SY.wake && navigator.wakeLock){ SY.wake=await navigator.wakeLock.request("screen"); SY.wake.addEventListener("release",()=>{ SY.wake=null; }); } }
    else if(SY.wake){ await SY.wake.release(); SY.wake=null; }
  }catch(e){ /* refusé ou non supporté */ }
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible") return;
  if(SY.role||S.playing) keepAwake(true);
  if(SY.role==="f"){ SY.samples=[]; burstPing(); send({t:"need"}); }
});
/* -- réglages de l'arbre de la séance (modifiables) --------------------------------------------
   Le chef accepte MAX_HOTES téléphones en direct ; chacun d'eux devient « hôte » et relaie la séance
   vers au plus MAX_INVITES_PAR_HOTE autres téléphones. PROFONDEUR_MAX = 2 : chef → hôtes → invités.
   Capacité = MAX_HOTES × (1 + MAX_INVITES_PAR_HOTE) musiciens (4 × 5 = 20 avec les valeurs par défaut).
   Pour tester avec peu de téléphones : ajouter ?arbre=2x2 à l'adresse (2 hôtes de 2 invités).            */
const ARBRE={MAX_HOTES:4, MAX_INVITES_PAR_HOTE:4, PROFONDEUR_MAX:2};
(function(){ const m=location.search.match(/[?&]arbre=(\d+)x(\d+)/); if(m){ ARBRE.MAX_HOTES=+m[1]; ARBRE.MAX_INVITES_PAR_HOTE=+m[2]; } })();
/* Serveurs relais facultatifs pour les réseaux 4G/5G qui bloquent les liaisons directes (TURN).
   Laisser null pour le fonctionnement actuel. Exemple : [{urls:"stun:stun.l.google.com:19302"},{urls:"turn:…",username:"…",credential:"…"}] */
const ICE_SERVERS=null;
function peerOpts(){ const o={debug:1}; if(ICE_SERVERS) o.config={iceServers:ICE_SERVERS}; return o; }
const chefId=()=>PEER_PREFIX+SY.code;

/* -- transport : PeerJS (WebRTC). En test (?synctest=1) un faux PeerJS local (BroadcastChannel) prend sa place. --
   SY.conn  = le lien vers le « parent » (le chef, ou l'hôte qui nous relaie)
   SY.peers = les liens vers nos « enfants » (pour le chef : les hôtes ; pour un hôte : ses invités)            */
function send(msg){ if(SY.conn&&SY.conn.open){ try{ SY.conn.send(msg); }catch(e){} } }                 // vers le parent
function sendTo(id,msg){ const c=SY.peers.get(id); if(c&&c.conn&&c.conn.open){ try{ c.conn.send(msg); }catch(e){} } }   // vers un enfant
function broadcast(msg){ for(const c of SY.peers.values()) if(c.acc&&c.conn&&c.conn.open){ try{ c.conn.send(msg); }catch(e){} } }  // vers tous les enfants
function accepted(){ return [...SY.peers.values()].filter(c=>c.acc); }
function newCode(){ let c=""; for(let i=0;i<4;i++) c+=CODE_CH[Math.floor(Math.random()*CODE_CH.length)]; return c; }
function masterNowMs(){ return performance.now(); }
/* heure du chef vue d'ici : exacte chez le chef, estimée (ping/pong) ailleurs. Un hôte répond à ses invités avec cette
   estimation : les décalages s'additionnent d'un niveau à l'autre, sans toucher au retard de l'enceinte ni au réglage manuel. */
function chefNowMs(){ return SY.role==="m"?performance.now():(SY.offset===null?null:performance.now()+SY.offset); }
function ctxToMs(ctx){ smoothNow(); return (ctx-CLK.off)*1000; }          // temps audio local -> horloge locale (ms)
function masterMsToCtx(ms){ smoothNow(); return (ms-SY.offset)/1000+CLK.off; } // horloge du chef -> temps audio local
function treeTotal(){ let n=0; for(const c of accepted()) n+=1+(c.n||0); return n; }
function treeWho(){ const out=[]; for(const c of accepted()){ out.push({dev:c.dev,part:c.part||"?"}); (c.who||[]).forEach(w=>out.push(w)); } return out; }
function treeParts(){ const out=[]; for(const c of accepted()){ out.push(c.part||"?"); (c.parts||[]).forEach(p=>out.push(p)); } return out; }
function treeDepthUsed(){ return accepted().some(c=>(c.n||0)>0)?2:1; }

/* -- liens enfants (chef et hôtes) -- */
function setupChildConn(conn){
  const c={conn,acc:false,part:"?",lead:0,n:0}; SY.peers.set(conn.peer,c);
  conn.on("data",d=>onChildMsg(d,conn.peer));
  const gone=()=>{ if(SY.peers.get(conn.peer)!==c) return; SY.peers.delete(conn.peer); sessUI(); reportUp(); };
  conn.on("close",gone); conn.on("error",gone);
}
function admit(from,d){
  const c=SY.peers.get(from); if(!c) return;
  Object.assign(c,{part:d.part||"?",lead:d.lead||0,dev:d.dev||null});
  const avoid=d.avoid||[];
  if(SY.role==="m"){
    if(accepted().length<ARBRE.MAX_HOTES) return acceptChild(from,d);
    // chef plein : on envoie chez l'hôte le moins chargé
    const hosts=[...SY.peers.entries()].filter(([id,h])=>h.acc&&(h.n||0)<ARBRE.MAX_INVITES_PAR_HOTE&&!avoid.includes(id)).sort((a,b)=>(a[1].n||0)-(b[1].n||0));
    if(hosts.length){ const [hid,h]=hosts[0]; h.n=(h.n||0)+1; sendTo(from,{t:"redirect",to:hid}); }
    else sendTo(from,{t:"full",max:ARBRE.MAX_HOTES*(1+ARBRE.MAX_INVITES_PAR_HOTE)});
    setTimeout(()=>{ const x=SY.peers.get(from); if(x&&!x.acc){ try{ x.conn.close(); }catch(e){} SY.peers.delete(from); } },1500);
    return;
  }
  // hôte : il accepte tant qu'il a de la place, sinon renvoie vers le chef (qui choisira un autre hôte)
  if(SY.depth>0&&SY.depth<ARBRE.PROFONDEUR_MAX&&accepted().length<ARBRE.MAX_INVITES_PAR_HOTE) return acceptChild(from,d);
  sendTo(from,{t:"redirect",to:chefId(),avoid:[...avoid,SY.peer&&SY.peer.id]});
  setTimeout(()=>{ const x=SY.peers.get(from); if(x&&!x.acc){ try{ x.conn.close(); }catch(e){} SY.peers.delete(from); } },1500);
}
function acceptChild(from,d){
  const c=SY.peers.get(from); c.acc=true;
  sendTo(from,{t:"welcome",depth:(SY.role==="m"?0:SY.depth)+1});
  if(S.src&&d.sid!==S.src.sid) sendSong(from);
  if(SY.role==="m") sendTo(from,stateMsg({})); else if(SY.lastRaw) sendTo(from,SY.lastRaw);
  sessUI(); reportUp(); if(window.fxBurst&&SY.role==="m") fxBurst({n:70});
}
function onChildMsg(d,from){
  const c=SY.peers.get(from); if(!c) return;
  if(d.t==="ping"){ const m=chefNowMs(); if(m!==null) sendTo(from,{t:"pong",c:d.c,m}); return; }
  if(d.t==="hello"){ admit(from,d); return; }
  if(!c.acc) return;
  if(d.t==="lead"){ c.lead=d.lead||0; reportUp(); return; }
  if(d.t==="part"){ c.part=d.part; sessUI(); reportUp(); return; }
  if(d.t==="tree"){ c.n=d.n||0; c.parts=d.parts||[]; c.who=d.who||[]; c.leadMax=d.lead||0; sessUI(); return; }   // un hôte décrit ses invités
  if(d.t==="takeover"){ if(SY.role==="m") askHandoff(d); else send(d); return; }             // demande de direction : remonte jusqu'au chef, qui accepte ou refuse
  if(d.t==="need"){
    if(S.src&&(d.song||(d.sid&&d.sid!==S.src.sid))) sendSong(from);
    if(SY.role==="m") sendTo(from,stateMsg({})); else if(SY.lastRaw) sendTo(from,SY.lastRaw);
    return;
  }
}
/* un hôte résume ses invités au chef : nombre, parties, plus grand retard d'enceinte */
function reportUp(){
  if(SY.role!=="f") return;
  const a=accepted(); send({t:"tree",n:a.length,parts:a.map(c=>c.part||"?"),who:a.map(c=>({dev:c.dev,part:c.part||"?"})),lead:a.reduce((m,c)=>Math.max(m,c.lead||0),0)});
}

/* ---------- chef ---------- */
async function startMaster(){
  const ac=audio(); try{ await ac.resume(); }catch(e){}
  leaveSession(true);
  SY.code=newCode(); SY.epoch=1; claimChef(0,true);
}
/* devenir chef de la séance SY.code : prendre l'identifiant de la séance auprès du serveur de mise en relation.
   Cet identifiant est unique : deux téléphones ne peuvent jamais être chefs en même temps. */
function claimChef(attempt,fresh){
  SY.role="m"; SY.depth=0; SY.opened=false; document.body.classList.remove("follower"); applyMaster();
  if(!window.Peer){ toast("Module de synchronisation indisponible (pas de connexion ?)",4000); SY.role=null; return; }
  const pr=new Peer(chefId(),peerOpts()); SY.peer=pr;
  pr.on("open",()=>{ SY.opened=true; saveLastSession("m"); if(fresh) sessOpened(); else { toast("Vous dirigez maintenant la séance "+SY.code,3500); if(window.fxBurst) fxBurst({n:80}); } sessUI(); syncPush(S.playing?{start:true}:{}); });
  pr.on("close",()=>sessUI());
  pr.on("connection",conn=>setupChildConn(conn));
  pr.on("disconnected",()=>{ if(SY.role==="m"&&SY.peer===pr){ setTimeout(()=>{ try{ pr.reconnect(); }catch(e){} },1500); } sessUI(); });
  pr.on("error",e=>{
    if(e.type==="unavailable-id"){
      try{ pr.destroy(); }catch(_){} if(SY.peer===pr) SY.peer=null;
      if(fresh&&!SY.opened){ SY.code=newCode(); claimChef(0,true); return; }              // code déjà pris par une autre séance : on en tire un autre
      if(SY.opened){ const code=SY.code; toast("Un autre téléphone dirige maintenant la séance : vous redevenez musicien",4500); SY.role=null; startFollower(code); return; }
      // reprise : l'ancien chef occupe encore la séance (téléphone parti sans la fermer). Le serveur la libère en une minute environ.
      if(attempt<45){ $("sessFState")&&($("sessFState").textContent="Prise de la direction… en attente de la libération par l'ancien chef ("+(attempt+1)+")"); sessUI(); SY.retry=setTimeout(()=>{ if(SY.role==="m") claimChef(attempt+1,false); },2000); return; }
      toast("Impossible de prendre la direction : l'ancien chef est toujours là",4500); const code=SY.code; SY.role=null; startFollower(code); return;
    }
    if(e.type==="network"||e.type==="server-error"||e.type==="socket-error") toast("Réseau indisponible pour la séance – nouvel essai…",3000);
    console.warn("peer",e); sessUI();
  });
  sessUI(); keepAwake(true);
  clearInterval(SY.beacon); SY.beacon=setInterval(()=>{ if(SY.role==="m"&&SY.opened) syncPush({beacon:true}); },1000);
}
/* le chef passe la main : il prévient tout le monde, libère la séance, et redevient musicien sans couper sa lecture */
function stepDown(newDev){
  if(SY.role!=="m") return;
  toast("La direction passe à un autre téléphone",3000);
  broadcast({t:"handoff",dev:newDev,ep:SY.epoch+1});
  const code=SY.code;
  setTimeout(()=>{
    clearInterval(SY.beacon);
    for(const c of SY.peers.values()){ try{ c.conn.close(); }catch(e){} } SY.peers.clear();
    if(SY.peer){ try{ SY.peer.destroy(); }catch(e){} SY.peer=null; }
    SY.role=null; SY.opened=false;
    setTimeout(()=>startFollower(code,{quiet:true}),1200);
  },400);
}
/* un musicien prend la direction : avec le chef présent → il demande la main (après confirmation) ;
   chef disparu → il la prend directement */
function chefPresent(){ return SY.role==="f"&&SY.conn&&SY.conn.open&&SY.depth>0&&performance.now()-SY.lastStateAt<5000; }
/* Direction de la séance :
   - chef présent : le musicien DEMANDE, le chef accepte ou refuse (sans réponse en DEMANDE_DIRECTION_S secondes = refus) ;
   - chef muet depuis plus de CHEF_ABSENT_S secondes (batterie, réseau) : n'importe quel musicien peut reprendre la direction. */
const CHEF_ABSENT_S=20, DEMANDE_DIRECTION_S=30;
function chefSilence(){ return (performance.now()-Math.max(SY.lastStateAt||0,SY.followSince||0))/1000; }
function requestChef(){
  if(SY.role!=="f") return;
  if(chefPresent()){
    if(SY.takePending){ toast("Demande déjà envoyée : le chef doit répondre",2500); return; }
    send({t:"takeover",dev:SY.id,part:partName()}); SY.takePending=true; sessUI();
    toast("Demande envoyée au chef : attendez sa réponse…",3000);
    clearTimeout(SY.takeT); SY.takeT=setTimeout(()=>{ if(!SY.takePending) return; SY.takePending=false; sessUI(); if(SY.role==="f") toast("Le chef n'a pas répondu : demande annulée",3500); },(DEMANDE_DIRECTION_S+4)*1000);
    return;
  }
  const sil=chefSilence();
  if(sil<CHEF_ABSENT_S){ toast("Le chef ne répond plus depuis "+Math.round(sil)+" s. S'il ne revient pas, vous pourrez reprendre la direction dans "+Math.ceil(CHEF_ABSENT_S-sil)+" s.",4500); return; }
  becomeChef();
}
/* chef : une demande de direction arrive */
function askHandoff(d){
  const box=$("takeAsk"); if(!box) return;
  if(SY.ask&&SY.ask.dev!==d.dev) answerHandoff(false);           // une seule demande à la fois
  SY.ask={dev:d.dev,part:d.part||"Un musicien",until:performance.now()+DEMANDE_DIRECTION_S*1000};
  $("takeAskTxt").textContent=SY.ask.part+" demande la direction de la séance";
  box.hidden=false; box.classList.remove("out");
  clearInterval(SY.askT); const tick=()=>{ if(!SY.ask) return; const r=Math.ceil((SY.ask.until-performance.now())/1000); if(r<=0) return answerHandoff(false,true); $("takeAskNo").textContent="Refuser ("+r+")"; };
  tick(); SY.askT=setInterval(tick,500);
  if(window.fxBurst){} try{ navigator.vibrate&&navigator.vibrate(120); }catch(e){}
}
function answerHandoff(ok,timeout){
  const a=SY.ask; SY.ask=null; clearInterval(SY.askT); const box=$("takeAsk"); if(box){ box.classList.add("out"); setTimeout(()=>{ if(!SY.ask) box.hidden=true; },200); }
  if(!a||SY.role!=="m") return;
  if(ok) stepDown(a.dev); else broadcast({t:"takeNo",dev:a.dev,timeout:!!timeout});
}
/* chef : confier de lui-même la direction à un musicien de la liste */
function giveChef(w){ if(SY.role!=="m"||!w||!w.dev) return; if(!confirm("Confier la direction de la séance à « "+w.part+" » ?\nVous deviendrez musicien ; la lecture continue.")) return; $("sessDlg").close(); stepDown(w.dev); }
function becomeChef(){
  const code=SY.code; clearTimeout(SY.takeT); SY.takePending=false;
  // on quitte la place de musicien sans arrêter le son ni la partition
  clearInterval(SY.pingT); clearTimeout(SY.retry); clearTimeout(SY.openT);
  if(SY.conn){ const c=SY.conn; SY.conn=null; try{ c.close(); }catch(e){} }
  for(const c of SY.peers.values()){ try{ c.conn.close(); }catch(e){} } SY.peers.clear();
  if(SY.peer){ try{ SY.peer.destroy(); }catch(e){} SY.peer=null; }
  SY.code=code; SY.epoch=Math.max(SY.epoch||0,(SY.last&&SY.last.ep)||0)+1; banner("");
  setTimeout(()=>claimChef(0,false),300);
}
function sessOpened(){ sessUI(); toast("Séance "+SY.code+" ouverte",2500); }
function sendSong(to){ if(!S.src) return; sendTo(to,{t:"song",sid:S.src.sid,name:S.src.name,title:S.src.title,buf:S.src.buf}); }
function syncSong(){ if(!S.src) return; broadcast({t:"song",sid:S.src.sid,name:S.src.name,title:S.src.title,buf:S.src.buf}); syncPush(); }
function stateMsg(extra){
  const st={t:"state",ep:SY.epoch||1,v:++SY.ver,sid:S.src&&S.src.sid,speed:S.speed,loop:S.loop,countIn:$("countIn").checked,click:$("clickOn").checked,
    mix:S.parts.map(p=>[p.mute?1:0,p.solo?1:0,Math.round(p.vol*100)]),playing:S.playing,k:curSeq,off:curOff,at:masterNowMs()};
  if(S.playing){
    if(extra.start && S.anchor){ st.k=S.anchor.k; st.off=S.anchor.off; st.at=ctxToMs(S.anchor.ctx); st.start=true; st.ci=extra.ci||null; }
    else { const p=currentPos(); if(p&&!p.pre){ st.k=p.k; st.off=p.off; st.at=masterNowMs(); }
           else if(S.anchor){ st.k=S.anchor.k; st.off=S.anchor.off; st.at=ctxToMs(S.anchor.ctx); } }
  }
  if(extra.beacon) st.beacon=true;
  return st;
}
function syncPush(extra){ if(SY.role!=="m") return; broadcast(stateMsg(extra||{})); }
let pushT=0; function syncPushSoon(){ clearTimeout(pushT); pushT=setTimeout(()=>syncPush(),60); }
function syncLoopChanged(){ // la boucle change pendant la lecture : nouvelle référence
  if(S.playing){ const p=currentPos(); if(p&&!p.pre){ S.anchor={k:p.k,off:p.off,ctx:smoothNow()}; } syncPush({start:true}); } else syncPush();
}


/* ---------- musicien (et hôte : un musicien qui relaie) ---------- */
async function startFollower(code,opt){
  opt=opt||{};
  code=(code||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(code.length<4){ toast("Code de séance incomplet"); return; }
  const ac=audio(); try{ await ac.resume(); }catch(e){}
  leaveSession(true);
  SY.role="f"; SY.code=code; SY.samples=[]; SY.offset=null; SY.pending=null; SY.last=null; SY.lastRaw=null; SY.depth=0; SY.full=false;
  SY.epoch=0; SY.followSince=performance.now(); SY.takePending=false;
  $("sessSound").checked=false;   // par défaut, seul le chef sort du son (l'ancien chef aussi devient muet)
  if(opt.quiet) toast("Vous n'êtes plus chef : le son de ce téléphone est coupé (« Forcer le son » dans Séance)",4500);
  SY.joinFails=0; SY.everJoined=!!opt.quiet; SY.resume=!!opt.resume; SY.wantChef=!!opt.asChef; SY.opened=false;
  document.body.classList.add("follower");
  setLocalSound(false);
  if(!S.model){ showPlayer(); showLoading("En attente du morceau choisi par le chef…"); }
  if(!window.Peer){ toast("Module de synchronisation indisponible (pas de connexion ?)",4000); SY.role=null; return; }
  const pr=new Peer(peerOpts()); SY.peer=pr;
  pr.on("open",()=>connectTo(chefId()));
  pr.on("connection",conn=>setupChildConn(conn));          // nos propres invités, si le chef fait de nous un hôte
  pr.on("disconnected",()=>{ if(SY.role==="f") setTimeout(()=>{ try{ pr.reconnect(); }catch(e){} },1500); });
  pr.on("error",e=>{ console.warn("peer",e);
    if(e.type==="peer-unavailable"){
      if(SY.target===chefId()){
        SY.joinFails++;
        if(!SY.everJoined&&SY.joinFails>=3){ const msg=SY.resume?"Cette séance n'existe plus (le chef l'a fermée). Demandez le nouveau code au chef ou scannez son QR code.":"Séance "+SY.code+" introuvable : vérifiez le code auprès du chef.";
          $("sessFState").textContent=msg; banner(""); toast(msg,6000); const was=SY.resume; leaveSession(true); if(was){ sessUI(); $("sessDlg").open||$("sessDlg").showModal(); } return; }
        $("sessFState").textContent=SY.everJoined?"Chef injoignable… nouvel essai (vous pouvez « Prendre la direction »)":"Recherche de la séance…";
        if(SY.everJoined) banner("⚠ Chef injoignable – nouvel essai…");
      } else $("sessFState").textContent="Relais indisponible… on repasse par le chef";
      scheduleRetry(); }
    else if(SY.role==="f"){ $("sessFState").textContent="Réseau indisponible… nouvel essai"; scheduleRetry(); }
    sessUI(); });
  sessUI(); keepAwake(true);
}
/* se relier à un parent (le chef, ou l'hôte vers lequel le chef nous a envoyés) */
function connectTo(target,avoid){
  if(SY.role!=="f"||!SY.peer||SY.peer.destroyed||SY.full) return;
  if(SY.conn){ const old=SY.conn; SY.conn=null; try{ old.close(); }catch(e){} }
  SY.target=target; SY.avoid=avoid||[]; SY.depth=0;
  const conn=SY.peer.connect(target,{reliable:true}); SY.conn=conn;
  clearTimeout(SY.openT);
  SY.openT=setTimeout(()=>{ if(SY.conn===conn&&!conn.open){   // liaison qui ne s'établit pas : réseau qui bloque les connexions directes
    $("sessFState").textContent="La liaison ne s'établit pas (téléphone du chef ou relais occupé, ou réseau qui bloque). Nouvel essai… Si cela dure, passez sur le wifi de la banda.";
    banner("⚠ Liaison difficile – nouvel essai…"); try{ conn.close(); }catch(e){} SY.conn=null; scheduleRetry(); } },12000);
  conn.on("open",()=>{ if(SY.conn!==conn) return; clearTimeout(SY.openT); followerConnected(); });
  conn.on("data",d=>{ if(SY.conn===conn) onFollowerMsg(d); });
  conn.on("close",()=>{ if(SY.role!=="f"||SY.conn!==conn) return; SY.conn=null; parentLost(); });
}
/* parent perdu : nos éventuels invités repartent vers le chef, et nous aussi */
function parentLost(){
  for(const c of SY.peers.values()){ try{ c.conn.close(); }catch(e){} } SY.peers.clear();
  SY.depth=0; $("sessFState").textContent="Liaison perdue… reconnexion"; banner("⚠ Liaison perdue – reconnexion…"); sessUI();
  clearTimeout(SY.retry); SY.retry=setTimeout(()=>connectTo(chefId()),400+Math.random()*900);   // petit délai aléatoire : tout le monde n'arrive pas en même temps
}
function scheduleRetry(){ clearTimeout(SY.retry); SY.retry=setTimeout(()=>{ if(SY.role==="f"&&!(SY.conn&&SY.conn.open)) connectTo(chefId()); },2500); }
function followerConnected(){
  banner(""); SY.last=null;
  send({t:"hello",part:partName(),sid:S.src&&S.src.sid,lead:Math.round(leadSec()*1000),dev:SY.id,avoid:SY.avoid});
  SY.samples=[]; burstPing();
  clearInterval(SY.pingT); SY.pingT=setInterval(()=>{ if(SY.role==="f") send({t:"ping",c:performance.now()}); },2000);
  sessUI();
}
function partName(){ return S.model&&S.model.parts[S.myPart]?S.model.parts[S.myPart].name:"?"; }
function burstPing(){ for(let i=0;i<8;i++) setTimeout(()=>{ if(SY.role==="f") send({t:"ping",c:performance.now()}); },i*120); }
function onFollowerMsg(d){
  if(d.t==="redirect"){ connectTo(d.to,d.avoid); return; }
  if(d.t==="full"){ SY.full=true; $("sessFState").textContent="Séance complète ("+d.max+" musiciens au maximum)."; banner("Séance complète"); toast("Séance complète : "+d.max+" musiciens au maximum",5000); return; }
  if(d.t==="handoff"){ broadcast(d); if(d.dev===SY.id) becomeChef(); return; }
  if(d.t==="takeNo"){ broadcast(d); if(d.dev===SY.id&&SY.takePending){ SY.takePending=false; clearTimeout(SY.takeT); sessUI(); toast(d.timeout?"Le chef n'a pas répondu : demande annulée":"Le chef a refusé de vous confier la direction",3500); } return; }                  // c'est nous le nouveau chef ?
  if(d.t==="welcome"){ SY.depth=d.depth||1; SY.everJoined=true; SY.joinFails=0; saveLastSession("f"); $("sessFState").textContent="Connecté à la séance "+SY.code; if(window.fxBurst) fxBurst({n:90}); sessUI(); return; }
  if(d.t==="pong"){
    const r=performance.now(), rtt=r-d.c; if(rtt<0||rtt>3000) return;
    SY.samples.push({rtt,off:d.m-(d.c+r)/2,at:r}); if(SY.samples.length>24) SY.samples.shift();
    const best=SY.samples.reduce((a,b)=>b.rtt<a.rtt?b:a);
    SY.offset=best.off; SY.rtt=best.rtt;
    if(SY.pending&&SY.pending.sid===(S.src&&S.src.sid)){ const p=SY.pending; SY.pending=null; applyState(p); }
    return;
  }
  if(d.t==="song"){
    broadcast(d);                                         // hôte : on relaie tout de suite à nos invités
    if(S.src&&S.src.sid===d.sid) return;
    if(SY.wantSong===d.sid) return; SY.wantSong=d.sid;
    let buf=d.buf; if(buf&&!(buf instanceof ArrayBuffer)){ buf=buf.buffer?buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength):buf; }
    showPlayer(); openBuffer(buf,d.name,d.title).then(()=>{ SY.wantSong=null; });
    return;
  }
  if(d.t==="state"){
    if((d.ep||0)<(SY.epoch||0)) return;                  // ancien chef qui n'a pas compris qu'il a passé la main : ignoré
    SY.epoch=d.ep||SY.epoch; SY.lastStateAt=performance.now();
    broadcast(d); SY.lastRaw=d;                           // hôte : relais immédiat, avant de l'appliquer ici
    if(SY.wantChef){ SY.wantChef=false; setTimeout(requestChef,300); }
    if(SY.last&&d.v<SY.last.v&&!d.beacon) return;
    if(d.sid!==(S.src&&S.src.sid)||SY.offset===null||!S.model){ SY.pending=d; if(d.sid!==(S.src&&S.src.sid)&&!SY.wantSong) send({t:"need",song:true,sid:S.src&&S.src.sid}); return; }
    applyState(d);
  }
}
function followerSongReady(){
  send({t:"part",part:partName()});
  if(SY.pending&&SY.offset!==null&&SY.pending.sid===S.src.sid){ const p=SY.pending; SY.pending=null; applyState(p); }
  else send({t:"need"});
}
function applyState(st){
  SY.last=st;
  // réglages communs
  if(Math.abs(S.speed-st.speed)>1e-6){ if(S.playing) stopAudio(); S.speed=st.speed; $("speed").value=Math.round(st.speed*100); $("speedLbl").textContent=Math.round(st.speed*100)+" %"; $("tempoLbl").textContent=Math.round(st.speed*100)+" %"; }
  $("countIn").checked=!!st.countIn; $("clickOn").checked=!!st.click;
  const lk=JSON.stringify(S.loop||null), nk=JSON.stringify(st.loop||null);
  if(lk!==nk){ if(st.loop) setLoopK(st.loop.a,st.loop.b); else setLoopK(null); }
  SY.chefMix=st.mix;
  if(!ownMix()&&st.mix&&st.mix.length===S.parts.length){ let ch=false; st.mix.forEach((m,i)=>{ const p=S.parts[i]; const mu=!!m[0],so=!!m[1],vo=m[2]/100; if(p.mute!==mu||p.solo!==so||Math.abs(p.vol-vo)>0.005){ p.mute=mu;p.solo=so;p.vol=vo;ch=true; } }); if(ch){ drawMixer(); applyGains(); } }
  // position
  if(!st.playing){
    if(S.playing) stopAudio();
    curSeq=Math.max(0,Math.min(S.seq.length-1,st.k)); curOff=st.off; updateUI(curSeq,curOff); updateCursor(true);
    banner(""); return;
  }
  const ac=audio(), anchorCtx=masterMsToCtx(st.at);
  if(S.playing && !st.start){
    const p=currentPos();
    if(p&&!p.pre){
      const tgt=advancePos(st.k,st.off,smoothNow()-anchorCtx);
      if(!tgt){ return; }
      const err=seqSec(p.k,p.off)-seqSec(tgt.k,tgt.off);
      SY.err=err;
      if(Math.abs(err)<0.035) return;          // déjà calé
    } else return;
  }
  // (re)démarrage calé sur l'horloge du chef
  if(S.playing) stopAudio();
  let k=st.k, off=st.off, at=anchorCtx;
  const minAt=ac.currentTime+0.08;
  if(at<minAt){ const t=advancePos(k,off,minAt-at); if(!t) return; k=t.k; off=t.off; at=minAt; }
  else if(st.ci){ for(let b=0;b<st.ci.n;b++){ const w=at-(st.ci.n-b)*st.ci.beat; if(w-leadSec()>ac.currentTime+0.02) click(w-leadSec(),b===0); } }
  playAt(k,off,at);
}
function setLocalSound(on){ audio(); applyMaster(); }
function banner(t){ const b=$("followBanner"); if(!b) return; b.textContent=t; b.style.display=t?"block":"none"; }
function leaveSession(silent){
  clearInterval(SY.beacon); clearInterval(SY.pingT); clearTimeout(SY.retry); clearTimeout(SY.openT);
  if(SY.conn){ const c=SY.conn; SY.conn=null; try{ c.close(); }catch(e){} }
  for(const c of SY.peers.values()){ try{ c.conn.close(); }catch(e){} }
  if(SY.peer){ try{ SY.peer.destroy(); }catch(e){} SY.peer=null; }
  SY.peers.clear(); const was=SY.role; SY.role=null; SY.code=""; SY.wantChef=false; SY.opened=false; clearTimeout(SY.takeT);
  document.body.classList.remove("follower"); banner("");
  if(was==="f"){ setLocalSound(true); }
  if(!S.playing) keepAwake(false);
  sessUI(); if(!silent&&was) toast("Séance terminée");
}
/* ---------- interface ---------- */
function sessUI(){
  mixUI();
  const b=$("sessBtn"), r=SY.role;
  b.classList.toggle("m",r==="m"); b.classList.toggle("f",r==="f");
  const fOk=r==="f"&&SY.conn&&SY.conn.open&&SY.depth>0, mOk=r==="m"&&SY.peer&&SY.peer.open;
  b.classList.toggle("warn",(r==="f"&&!fOk)||(r==="m"&&!mOk));
  $("sessLbl").textContent=r==="m"?("Chef · "+SY.code+" · "+treeTotal()):r==="f"?("Séance "+SY.code):"Séance";
  $("sessIdle").style.display=r?"none":"block";
  const ls=r?null:lastSession(); $("sessResume").style.display=ls?"block":"none";
  if(ls){ const mn=Math.round((Date.now()-ls.date)/60000); $("sessResumeInfo").innerHTML="Séance <b>"+ls.code+"</b>"+(ls.role==="m"?" (vous étiez chef)":"")+" · il y a "+(mn<1?"moins d'une minute":mn<60?mn+" min":Math.round(mn/60)+" h"); }
  $("sessTake").style.display=r==="f"&&(SY.everJoined||SY.conn)?"inline-block":"none";
  if(r==="f"){ const pres=chefPresent(); $("sessTake").textContent=SY.takePending?"Demande envoyée…":pres?"Demander la direction":"Prendre la direction (chef absent)"; $("sessTake").disabled=!!SY.takePending;
    $("sessTakeTxt").textContent=pres?"Vous voulez diriger ? Le chef doit accepter.":"Le chef ne répond plus ? Après "+CHEF_ABSENT_S+" s sans nouvelles, vous pouvez reprendre la direction."; }
  $("sessMaster").style.display=r==="m"?"block":"none";
  $("sessFollow").style.display=r==="f"?"block":"none";
  $("sessQuit").style.display=r?"inline-block":"none";
  if(r==="m"){
    $("sessCode").textContent=SY.code;
    $("sessCap").textContent="Jusqu'à "+ARBRE.MAX_HOTES*(1+ARBRE.MAX_INVITES_PAR_HOTE)+" musiciens : au-delà de "+ARBRE.MAX_HOTES+", les téléphones se relaient automatiquement la séance, sans rien à faire.";
    const n=treeTotal(); $("sessCount").textContent=n+(n>1?" musiciens connectés":" musicien connecté")+(treeDepthUsed()>1?" ("+accepted().length+" en direct, les autres relayés)":"");
    const L=$("sessList"); L.innerHTML=""; for(const w of treeWho()){ const s=document.createElement("button"); s.type="button"; s.textContent=w.part; s.title="Confier la direction à ce musicien"; s.onclick=()=>giveChef(w); L.appendChild(s); }
    const q=$("sessQr");
    if(q.dataset.code!==SY.code){ q.dataset.code=SY.code; q.innerHTML="";
      if(/^https?:/.test(location.protocol) && window.qrcode){ try{ const url=location.origin+location.pathname+"?seance="+SY.code; const qr=qrcode(0,"M"); qr.addData(url); qr.make(); q.innerHTML=qr.createSvgTag({cellSize:4,margin:2,scalable:true}); }catch(e){} } }
  }
}
$("sessBtn").onclick=()=>{ sessUI(); $("sessDlg").showModal(); };
function withChecklist(fn){ const d=$("checkDlg"); d.returnValue=""; d.onclose=()=>{ if(d.returnValue==="ok") fn(); }; d.showModal(); }
$("sessCreate").onclick=()=>{ $("sessDlg").close(); withChecklist(()=>startMaster().then(()=>{ $("sessDlg").showModal(); })); };
$("sessJoin").onclick=()=>{ const c=$("sessCodeIn").value; $("sessDlg").close(); withChecklist(()=>startFollower(c)); };
$("sessCodeIn").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); $("sessJoin").click(); } });
$("sessQuit").onclick=()=>{ leaveSession(); $("sessDlg").close(); };
/* son forcé chez un musicien : il entend ce qu'il veut (ex. « Trombone seul » dans un ampli), sans toucher au son du chef ni des autres */
function ownMix(){ return SY.role==="f"&&$("sessSound").checked; }
function mixUI(){ const o=ownMix(); document.body.classList.toggle("ownmix",o);
  const l=$("lockMix"); if(l) l.textContent=o?"🔊 Son forcé : vos pistes et volumes ne concernent que ce téléphone.":"🔒 Le son et les pistes sont choisis par le chef."; }
$("sessSound").onchange=()=>{ if(SY.role!=="f") return; const on=$("sessSound").checked;
  if(!on&&SY.chefMix&&SY.chefMix.length===S.parts.length){ SY.chefMix.forEach((m,i)=>{ const p=S.parts[i]; p.mute=!!m[0]; p.solo=!!m[1]; p.vol=m[2]/100; }); drawMixer(); applyGains(); }
  setLocalSound(on); mixUI(); toast(on?"Son forcé sur ce téléphone : choisissez vos pistes dans Réglages › Volumes":"Son coupé sur ce téléphone",3000); };
// musicien : les commandes du chef sont verrouillées
["click","pointerdown","input","change","submit"].forEach(ev=>document.addEventListener(ev,e=>{
  if(SY.role!=="f") return; const t=e.target.closest&&e.target.closest(".lk,.lkm"); if(!t) return;
  if(t.matches(".lkm")&&ownMix()) return;   // son forcé : le musicien règle ses propres pistes
  e.preventDefault(); e.stopPropagation(); if(ev==="click"||ev==="pointerdown") lockedToast();
},true));
$("partSel").addEventListener("change",()=>{ if(SY.role==="f") setTimeout(()=>send({t:"part",part:partName()}),50); });
(function(){ const m=location.search.match(/[?&]seance=([A-Za-z0-9]+)/); if(m){ $("sessCodeIn").value=m[1].toUpperCase(); setTimeout(()=>{ sessUI(); $("sessDlg").showModal(); },300); } })();
loadLibrary();

/* ---------- pack de sons à héberger sur GitHub (outil de l'administrateur) ----------
   télécharge depuis la banque en ligne tous les instruments utiles à une banda, dans les deux qualités,
   et les range dans un fichier sons.zip à décompresser à la racine du dépôt (dossier « sons »). */
const PACK_INST=["piccolo","flute","clarinet","oboe","bassoon","soprano_sax","alto_sax","tenor_sax","baritone_sax","trumpet","trombone","french_horn","tuba",
  "accordion","acoustic_grand_piano","drawbar_organ","electric_bass_finger","electric_guitar_clean","steel_drums","choir_aahs","percussion"];
async function buildSoundPack(){
  const btn=$("packBtn"); if(btn.disabled) return; btn.disabled=true; const old=btn.textContent;
  try{
    if(!window.JSZip) throw new Error("module zip indisponible");
    const inst=new Set(PACK_INST);
    for(const it of S.lib||[]){ try{ const r=await fetch(it.url); const xml=await bufferToXml(await r.arrayBuffer(),it.url); buildModel(xml).parts.forEach(P=>inst.add(P.isDrum?"percussion":instrumentFor(P))); }catch(e){} }
    const zip=new JSZip(), idx={version:1,fonts:{}}, banks=["MusyngKite","FluidR3_GM"], all=[...inst]; let n=0, tot=all.length*banks.length, bytes=0, miss=[];
    for(const b of banks){ idx.fonts[b]=[];
      for(const name of all){ btn.textContent="Téléchargement "+(++n)+"/"+tot+"…";
        try{ const r=await fetch(SF_BASE+b+"/"+name+"-mp3.js"); if(!r.ok) throw 0; const t=await r.text(); bytes+=t.length;
          if(t.length<=SF_PART){ zip.file("sons/"+b+"/"+name+"-mp3.js",t); idx.fonts[b].push(name); }
          else { const k=Math.ceil(t.length/SF_PART); for(let i=0;i<k;i++) zip.file("sons/"+b+"/"+name+"-mp3.p"+(i+1)+".js",t.slice(i*SF_PART,(i+1)*SF_PART)); idx.fonts[b].push({n:name,parts:k}); } }
        catch(e){ miss.push(b+"/"+name); } } }
    zip.file("sons/index.json",JSON.stringify(idx,null,1));
    zip.file("sons/LISEZ-MOI.txt","Sons d'instruments de La Banda Familia (banques MusyngKite et FluidR3, projet midi-js-soundfonts).\nDéposer ce dossier « sons » à la racine du dépôt GitHub, à côté de index.html.\n");
    btn.textContent="Création du fichier…";
    const blob=await zip.generateAsync({type:"blob",compression:"STORE"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="sons.zip"; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },4000);
    toast("sons.zip prêt ("+Math.round(bytes/1048576)+" Mo, "+(tot-miss.length)+" banques)"+(miss.length?" – introuvables : "+miss.join(", "):""),6000);
  }catch(e){ toast("Création du pack impossible : "+(e.message||e),5000); }
  finally{ btn.disabled=false; btn.textContent=old; }
}
$("packBtn").onclick=buildSoundPack;
LOCAL_SF.ready.then(()=>{ const el=$("packInfo"); if(el) el.textContent=LOCAL_SF.set.size?"Sons hébergés avec l'application : "+LOCAL_SF.set.size+" banques ✓":"Pas encore de sons hébergés : les sons viennent du site gratuit midi-js-soundfonts."; });

/* ---------- reprise de la dernière séance, prise de direction ---------- */
$("sessResumeF").onclick=()=>{ const ls=lastSession(); if(!ls) return; $("sessDlg").close(); startFollower(ls.code,{resume:true}); };
$("sessResumeC").onclick=()=>{ const ls=lastSession(); if(!ls) return; $("sessDlg").close(); startFollower(ls.code,{resume:true,asChef:true});
  // personne ne répond (chef parti) : on reprend la direction de sa séance
  setTimeout(()=>{ if(SY.role==="f"&&SY.wantChef&&!chefPresent()&&!(SY.conn&&SY.conn.open)){ SY.wantChef=false; becomeChef(); } },7000); };
$("sessTake").onclick=()=>{ $("sessDlg").close(); requestChef(); };
$("takeAskYes").onclick=()=>answerHandoff(true);
$("takeAskNo").onclick=()=>answerHandoff(false);
