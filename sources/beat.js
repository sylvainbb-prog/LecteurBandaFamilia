
/* =====================================================================
   COMPTEUR DE TEMPS « Néon Banda »
   numéro du temps + 4 tubes (un par double croche ; 3 par temps en 6/8, 9/8, 12/8)
   calculé à partir de la même position que la barre de lecture (horloge audio) : son, barre et compteur battent ensemble
   ===================================================================== */
const BEAT={on:false,key:"",lastCheck:0,top:false,dpr:1};
const BC_ROSE=[255,46,150], BC_BLEU=[48,92,200], BC_ANIS=[190,232,60];
const bcol=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
function beatWanted(){
  const v=store("banda.beatBox"); if(v==="1") return true; if(v==="0") return false;
  const P=S.model&&S.model.parts[S.myPart]; return !!(P&&(P.isDrum||/drum|batterie|percu|caisse|charley|cymbal/i.test(P.name)));   // par défaut : percussions
}
/* où le mettre : en défilement, dans le coin de la partition (zone vide sous la portée) ;
   en mode page, la partition occupe tout l'écran : il se range dans la barre du bas, à côté de la position, pour ne rien cacher */
function beatPlace(){
  const c=$("beatBox"), inBar=!isLine();
  const host=inBar?$("posbox"):$("scoreBox");
  if(inBar){ if(c.parentNode!==host.parentNode||c.previousElementSibling!==host) host.after(c); }
  else if(c.parentNode!==host) host.appendChild(c);
  c.classList.toggle("inbar",inBar); if(inBar){ c.classList.remove("top"); BEAT.top=false; }
}
function beatSync(){ BEAT.on=!!S.model&&beatWanted(); $("beatOn").checked=BEAT.on; beatPlace(); $("beatBox").style.display=BEAT.on?"block":"none"; if(BEAT.on){ beatSize(); drawBeat(curSeq,curOff,true); } }
function beatSize(){ const c=$("beatBox"), r=c.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1); if(!r.width) return; c.width=Math.round(r.width*dpr); c.height=Math.round(r.height*dpr); BEAT.key=""; }
function beatPos(k,off){
  const e=S.seq[k]; if(!e) return null; const M=e.M;
  const compound=M.beatType===8&&M.beats%3===0&&M.beats>3;
  const bq=compound?1.5:4/M.beatType, subs=compound?3:4;
  let o=off; if(e.k===0&&M.len<M.timeLen-0.01) o+=M.timeLen-M.len;   // levée : on compte depuis la fin de la mesure
  const b=Math.max(0,o/bq), beat=Math.floor(b+1e-6), ph=b-beat, sub=Math.min(subs-1,Math.floor(ph*subs+1e-6));
  return {beat,ph,sub,subs};
}
function drawBeat(k,off,force){
  if(!BEAT.on) return;
  const c=$("beatBox"); if(!c.width) beatSize(); if(!c.width) return;
  const p=beatPos(k,off); if(!p) return;
  const playing=S.playing, k2=playing?Math.max(0,1-p.ph*3.2):0;
  const key=p.beat+":"+p.sub+":"+(playing?Math.round(k2*12):"s");
  if(!force&&key===BEAT.key) return; BEAT.key=key;
  const ctx=c.getContext("2d"), W=c.width, H=c.height, one=p.beat===0, col=one?BC_ROSE:BC_ANIS;
  ctx.clearRect(0,0,W,H);
  // fond
  const r=H*.2; ctx.fillStyle="rgba(6,5,12,.9)"; ctx.beginPath(); ctx.moveTo(r,0); ctx.arcTo(W,0,W,H,r); ctx.arcTo(W,H,0,H,r); ctx.arcTo(0,H,0,0,r); ctx.arcTo(0,0,W,0,r); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="rgba(255,255,255,.14)"; ctx.lineWidth=Math.max(1,H*.025); ctx.stroke();
  // chiffre en néon
  const txt=String(p.beat+1), fs=Math.round(H*.74), cx=W*.25, cy=H*.54, dim=playing?1:.55;
  ctx.font=`800 ${fs}px Figtree,"Poppins",system-ui,sans-serif`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineJoin="round";
  for(const [lw,a] of [[fs*.16,.22],[fs*.08,.6]]){ ctx.strokeStyle=bcol(col,a*(.55+.45*k2)*dim); ctx.lineWidth=lw; ctx.strokeText(txt,cx,cy); }
  ctx.strokeStyle=`rgba(255,255,255,${.95*dim})`; ctx.lineWidth=Math.max(1,fs*.03); ctx.strokeText(txt,cx,cy);
  // tubes
  const n=p.subs, gx=W*.5, gw=W*.44, cw=gw/n;
  ctx.lineCap="round";
  for(let j=0;j<n;j++){
    const on=playing&&j===p.sub, tcol=j===0?col:BC_BLEU, hh=H*(j===0?.7:.58), yy=(H-hh)/2, bx=gx+j*cw+cw/2, y0=yy+cw*.2, y1=yy+hh-cw*.2;
    ctx.strokeStyle="rgba(255,255,255,.1)"; ctx.lineWidth=cw*.42; ctx.beginPath(); ctx.moveTo(bx,y0); ctx.lineTo(bx,y1); ctx.stroke();
    if(on){ for(const [lw,al] of [[cw*.95,.2],[cw*.52,.55]]){ ctx.strokeStyle=bcol(tcol,al); ctx.lineWidth=lw; ctx.beginPath(); ctx.moveTo(bx,y0); ctx.lineTo(bx,y1); ctx.stroke(); }
      ctx.strokeStyle="rgba(255,255,255,.95)"; ctx.lineWidth=Math.max(1,cw*.16); ctx.beginPath(); ctx.moveTo(bx,y0); ctx.lineTo(bx,y1); ctx.stroke(); }
  }
  // ne jamais cacher la lecture : si la tête de lecture passe sous l'encadré, il change de coin
  const now=performance.now(); if(now-BEAT.lastCheck>200){ BEAT.lastCheck=now; beatDodge(); }
}
function beatDodge(){
  if($("beatBox").classList.contains("inbar")) return;
  const box=$("beatBox"), sb=$("scoreBox").getBoundingClientRect(), bh=box.offsetHeight, bw=box.offsetWidth;
  const cur=isLine()?$("playhead"):$("pcur"); if(!cur) return;
  const cr=cur.getBoundingClientRect(); if(!cr.height) return;
  const m=8, bottom={l:sb.right-bw-m,t:sb.bottom-bh-m-($("turn").style.display==="block"?0:0)}, top={l:sb.right-bw-m,t:sb.top+m};
  const hit=z=>!(cr.right<z.l||cr.left>z.l+bw||cr.bottom<z.t||cr.top>z.t+bh);
  const want=hit(bottom)&&!hit(top);
  if(want!==BEAT.top){ BEAT.top=want; box.classList.toggle("top",want); }
}
$("beatOn").onchange=e=>{ store("banda.beatBox",e.target.checked?"1":"0"); beatSync(); };
window.addEventListener("resize",()=>{ if(BEAT.on) setTimeout(()=>{ beatSize(); drawBeat(curSeq,curOff,true); },400); });
