
/* =====================================================================
   EFFETS FESTIFS — uniquement quand la musique ne joue pas
   confettis, feux d'artifice, transitions, pochettes de morceaux, décors de thème
   Tout s'arrête net dès qu'on lance la lecture (fxClear), et rien ne tourne en mode allégé.
   ===================================================================== */
const FX={cv:null,ctx:null,p:[],raf:0,last:0,dpr:1,lastClick:{x:innerWidth/2,y:innerHeight/2}};
function fxAllowed(){ return !S.playing && !document.body.classList.contains("light") && !matchMedia("(prefers-reduced-motion: reduce)").matches; }
function fxColors(){ const cs=getComputedStyle(document.body); const v=n=>(cs.getPropertyValue(n)||"").trim();
  const c=[v("--accent"),v("--accent2"),v("--accent3"),"#ffffff","#ffd84d"].filter(Boolean); return c.length?c:["#ff2d95","#c6ff3d","#3b6bff","#fff"]; }
function fxCanvas(){
  if(FX.cv) return;
  const c=document.createElement("canvas"); c.id="fxLayer"; document.body.appendChild(c); FX.cv=c; FX.ctx=c.getContext("2d"); fxSize();
  addEventListener("resize",fxSize);
}
function fxSize(){ if(!FX.cv) return; FX.dpr=Math.min(2,devicePixelRatio||1); FX.cv.width=innerWidth*FX.dpr; FX.cv.height=innerHeight*FX.dpr; }
function fxClear(){ FX.p=[]; cancelAnimationFrame(FX.raf); FX.raf=0; if(FX.ctx) FX.ctx.clearRect(0,0,FX.cv.width,FX.cv.height); const b=$("bravo"); if(b) b.remove(); }
function fxRun(){ if(!FX.raf){ FX.last=performance.now(); FX.raf=requestAnimationFrame(fxFrame); } }
function fxFrame(now){
  if(!fxAllowed()){ fxClear(); return; }
  const dt=Math.min(.05,(now-FX.last)/1000); FX.last=now;
  const ctx=FX.ctx, d=FX.dpr; ctx.clearRect(0,0,FX.cv.width,FX.cv.height);
  const keep=[];
  for(const q of FX.p){
    q.t+=dt; if(q.t>q.life) { if(q.onEnd) q.onEnd(q); continue; }
    q.vx*=q.drag; q.vy=q.vy*q.drag+q.g*dt; q.x+=q.vx*dt; q.y+=q.vy*dt; q.rot+=q.vr*dt;
    const a=Math.min(1,(q.life-q.t)/.5)*(q.fade?1-q.t/q.life:1);
    ctx.save(); ctx.globalAlpha=Math.max(0,a); ctx.translate(q.x*d,q.y*d); ctx.rotate(q.rot);
    if(q.k==="conf"){ ctx.fillStyle=q.c; const w=q.s*d, h=q.s*d*.45*Math.abs(Math.cos(q.t*q.flip)); ctx.fillRect(-w/2,-h/2,w,h); }
    else if(q.k==="dot"){ ctx.globalCompositeOperation="lighter"; ctx.fillStyle=q.c; ctx.beginPath(); ctx.arc(0,0,q.s*d,0,7); ctx.fill(); }
    else if(q.k==="star"){ ctx.globalCompositeOperation="lighter"; ctx.fillStyle=q.c; const r=q.s*d; ctx.beginPath(); ctx.moveTo(0,-r*2); ctx.lineTo(r*.35,-r*.35); ctx.lineTo(r*2,0); ctx.lineTo(r*.35,r*.35); ctx.lineTo(0,r*2); ctx.lineTo(-r*.35,r*.35); ctx.lineTo(-r*2,0); ctx.lineTo(-r*.35,-r*.35); ctx.closePath(); ctx.fill(); }
    else if(q.k==="rocket"){ ctx.globalCompositeOperation="lighter"; ctx.fillStyle=q.c; ctx.beginPath(); ctx.arc(0,0,2.2*d,0,7); ctx.fill(); }
    ctx.restore();
    keep.push(q);
  }
  FX.p=keep.concat(FX.add||[]); FX.add=null;
  if(FX.p.length) FX.raf=requestAnimationFrame(fxFrame); else { FX.raf=0; ctx.clearRect(0,0,FX.cv.width,FX.cv.height); }
}
function fxPush(q){ (FX.add=FX.add||[]).push(q); }
/* pluie de confettis */
function fxBurst(o={}){
  if(!fxAllowed()) return; fxCanvas();
  const cols=o.colors||fxColors(), n=o.n||120, x=o.x??innerWidth/2, y=o.y??innerHeight*.35, sp=o.spread||1;
  for(let i=0;i<n;i++){ const a=-Math.PI/2+(Math.random()-.5)*Math.PI*1.1*sp, v=260+Math.random()*420;
    FX.p.push({k:Math.random()<.18?"star":"conf",x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,g:520,drag:.985,rot:Math.random()*6,vr:(Math.random()-.5)*10,flip:6+Math.random()*8,
      s:6+Math.random()*7,c:cols[i%cols.length],t:0,life:2.6+Math.random()*1.4}); }
  fxRun();
}
/* feux d'artifice */
function fxFireworks(nb=6){
  if(!fxAllowed()) return; fxCanvas(); const cols=fxColors();
  for(let i=0;i<nb;i++) setTimeout(()=>{ if(!fxAllowed()) return;
    const x=innerWidth*(.15+Math.random()*.7), ty=innerHeight*(.15+Math.random()*.3), c=cols[i%cols.length];
    const g=900, v=Math.sqrt(2*g*(innerHeight+10-ty));
    FX.p.push({k:"rocket",x,y:innerHeight+10,vx:(Math.random()-.5)*60,vy:-v,g,drag:1,rot:0,vr:0,s:2,c,t:0,life:v/g,
      onEnd:q=>{ const m=70; for(let j=0;j<m;j++){ const a=j/m*Math.PI*2, v=140+Math.random()*170;
        fxPush({k:j%5?"dot":"star",x:q.x,y:q.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,g:110,drag:.975,rot:0,vr:0,s:j%5?2.2:3,c:Math.random()<.25?"#ffffff":c,t:0,life:1.4+Math.random()*.6,fade:true}); } }});
    fxRun(); }, i*380+Math.random()*200);
}
/* fin de morceau : bravo ! */
function fxSongEnd(){
  setTimeout(()=>{ if(!fxAllowed()) return;
    fxFireworks(7); setTimeout(()=>fxBurst({n:140,y:innerHeight*.3}),500);
    const b=document.createElement("div"); b.id="bravo"; b.innerHTML="<b>Bravo la banda !</b><span>Fin du morceau</span>"; document.body.appendChild(b);
    setTimeout(()=>{ b.classList.add("out"); setTimeout(()=>b.remove(),600); },3200);
  },250);
}
/* transitions entre l'accueil et un morceau */
document.addEventListener("pointerdown",e=>{ FX.lastClick={x:e.clientX,y:e.clientY}; },true);
function fxEnterPlayer(){
  if(!fxAllowed()||!document.body.animate) return;
  const p=$("player"), {x,y}=FX.lastClick, r=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  p.animate([{clipPath:`circle(0px at ${x}px ${y}px)`},{clipPath:`circle(${r}px at ${x}px ${y}px)`}],{duration:620,easing:"cubic-bezier(.7,0,.2,1)"});
  const fl=document.createElement("div"); fl.className="fxwipe"; fl.style.setProperty("--x",x+"px"); fl.style.setProperty("--y",y+"px"); document.body.appendChild(fl); setTimeout(()=>fl.remove(),900);
}
function fxEnterLibrary(){
  if(!fxAllowed()||!document.body.animate) return;
  $("library").animate([{opacity:0,transform:"scale(.97)"},{opacity:1,transform:"none"}],{duration:420,easing:"cubic-bezier(.2,.8,.2,1)"});
  [...document.querySelectorAll("#songs .song")].forEach((c,i)=>c.animate([{opacity:0,transform:"translateY(14px) scale(.98)"},{opacity:1,transform:"none"}],{duration:420,delay:60+i*35,easing:"cubic-bezier(.2,.8,.2,1)",fill:"backwards"}));
}
/* ---------- pochettes des morceaux : un motif néon unique par titre ---------- */
function hashStr(s){ let h=2166136261; for(const c of s) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
function cover(title){
  const h=hashStr(title), r=n=>{ let x=Math.sin(h*0.0001+n*12.9898)*43758.5453; return x-Math.floor(x); };
  const kind=h%4, cols=["var(--accent)","var(--accent2)","var(--accent3)"], c=i=>cols[(h>>i)%3];
  let g="";
  if(kind===0){ for(let i=0;i<7;i++){ const hh=12+r(i)*34; g+=`<rect x="${5+i*7.3}" y="${50-hh}" width="5" height="${hh}" rx="2.5" fill="${c(i)}"/>`; } }          // égaliseur
  else if(kind===1){ for(let i=0;i<4;i++) g+=`<circle cx="${28+(r(i)-.5)*10}" cy="${28+(r(i+9)-.5)*10}" r="${8+i*6}" fill="none" stroke="${c(i)}" stroke-width="3" opacity="${1-i*.18}"/>`; }   // ondes
  else if(kind===2){ let d="M2 28"; for(let x=2;x<=54;x+=4) d+=` L${x} ${28+Math.sin(x/5+r(1)*6)*(8+r(2)*10)}`; g=`<path d="${d}" fill="none" stroke="${c(1)}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" transform="translate(0 9)" fill="none" stroke="${c(4)}" stroke-width="2" opacity=".6"/>`; }  // vague
  else { for(let i=0;i<9;i++){ const x=8+(i%3)*20, y=8+Math.floor(i/3)*20; g+=`<rect x="${x-6}" y="${y-6}" width="12" height="12" rx="3" fill="${c(i)}" opacity="${.35+r(i)*.65}"/>`; } }   // pads
  return `<svg class="cover" viewBox="0 0 56 56" aria-hidden="true">${g}</svg>`;
}
function decorateCards(){
  document.querySelectorAll("#songs .song:not(.dec)").forEach(b=>{ b.classList.add("dec"); const n=b.querySelector(".num"); if(!n) return;
    const num=n.textContent.trim(); n.innerHTML=cover(b.querySelector("b").textContent||"")+(num?`<span class="nb">${num}</span>`:""); if(num) b.classList.add("numbered"); });
}
new MutationObserver(decorateCards).observe($("songs"),{childList:true});
/* logo : un petit feu d'artifice quand on le touche */
["logoImg","heroImg"].forEach(id=>{ const el=$(id); if(!el) return; el.style.cursor="pointer";
  el.addEventListener("click",e=>{ const r=el.getBoundingClientRect(); fxBurst({x:r.left+r.width/2,y:r.top+r.height/2,n:90,spread:2}); el.animate&&el.animate([{transform:"rotate(0) scale(1)"},{transform:"rotate(360deg) scale(1.12)"},{transform:"rotate(360deg) scale(1)"}],{duration:900,easing:"cubic-bezier(.2,.8,.2,1)"}); }); });
/* ---------- décors des thèmes (guirlandes, fanions) ---------- */
function fxThemeChanged(t){
  document.querySelectorAll("body > .deco").forEach(x=>x.remove());   // seulement les guirlandes du thème (les symboles § ⊕ de la partition ont aussi une classe « deco »)
  if(t==="guinguette"){
    const g=document.createElement("div"); g.className="deco lights"; let h="";
    const n=Math.max(10,Math.round(innerWidth/70));
    for(let i=0;i<n;i++){ const y=10+Math.sin(i/(n-1)*Math.PI)*16; h+=`<i style="left:${(i+.5)/n*100}%;top:${y}px;--d:${(i*0.37)%2.4}s;--c:${["#ffcf6b","#ff7a59","#ffe9a8","#7fd4c1","#ffb547"][i%5]}"></i>`; }
    g.innerHTML=`<svg preserveAspectRatio="none" viewBox="0 0 100 30"><path d="M0 8 Q50 40 100 8" fill="none" stroke="#3a2a1e" stroke-width=".6"/></svg>`+h;
    document.body.appendChild(g);
  }
  if(t==="fiesta"){
    const g=document.createElement("div"); g.className="deco papel"; let h="";
    const n=Math.max(8,Math.round(innerWidth/60)), cols=["#ff3d7f","#ffb800","#00b3a6","#7b4dff","#ff7a1a","#2fb34a"];
    for(let i=0;i<n;i++) h+=`<i style="left:${i/n*100}%;width:${100/n}%;--c:${cols[i%cols.length]};--d:${(i%4)*.25}s"></i>`;
    g.innerHTML=h; document.body.appendChild(g);
  }
}
addEventListener("resize",()=>{ const t=document.body.dataset.theme; if(t==="guinguette"||t==="fiesta"){ clearTimeout(fxThemeChanged.t); fxThemeChanged.t=setTimeout(()=>fxThemeChanged(t),300); } });
fxThemeChanged(document.body.dataset.theme);
decorateCards();
