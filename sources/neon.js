
/* ---------- moteur graphique « Néon Banda » (planche A validée) ---------- */
const NEON=(function(){
const TOL=5;
/* ---------- moteur de boule ---------- */
const TAU=Math.PI*2;
function hsh(i,j){ const s=Math.sin(i*127.1+j*311.7)*43758.5453; return s-Math.floor(s); }
function norm(v){ const l=Math.hypot(v[0],v[1],v[2])||1; return [v[0]/l,v[1]/l,v[2]/l]; }
const BANDS=18;
const FACETS=(()=>{ const out=[]; for(let i=0;i<BANDS;i++){ const a0=-Math.PI/2+i*Math.PI/BANDS, a1=a0+Math.PI/BANDS, am=(a0+a1)/2;
  const nc=Math.max(6,Math.round(40*Math.cos(am))); for(let j=0;j<nc;j++) out.push({i,j,a0,a1,am,l0:j*TAU/nc,l1:(j+1)*TAU/nc,lm:(j+.5)*TAU/nc,h:hsh(i,j)}); } return out; })();
function sp(lat,lon,rot,tilt){ const x=Math.cos(lat)*Math.sin(lon+rot), y=Math.sin(lat), z=Math.cos(lat)*Math.cos(lon+rot);
  return [x, y*Math.cos(tilt)-z*Math.sin(tilt), y*Math.sin(tilt)+z*Math.cos(tilt)]; }
/* draw : ctx, géométrie, options de style, et fonction couleur par facette */
function drawBall(ctx,cx,cy,R,rot,tilt,colorOf,gap){
  ctx.fillStyle="#050409"; ctx.beginPath(); ctx.arc(cx,cy,R*1.005,0,TAU); ctx.fill();
  const vis=[];
  for(const f of FACETS){
    const n=sp(f.am,f.lm,rot,tilt); if(n[2]<=0.02) continue;
    vis.push([f,n]);
  }
  for(const [f,n] of vis){
    const q=[sp(f.a0,f.l0,rot,tilt),sp(f.a0,f.l1,rot,tilt),sp(f.a1,f.l1,rot,tilt),sp(f.a1,f.l0,rot,tilt)];
    const mx=(q[0][0]+q[2][0])/2, my=(q[0][1]+q[2][1])/2, k=gap*(0.6+0.4*n[2]);
    const r=[2*n[2]*n[0],2*n[2]*n[1],2*n[2]*n[2]-1];
    const c=colorOf(f,n,r);
    ctx.fillStyle=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
    ctx.beginPath();
    q.forEach((p,ix)=>{ const X=cx+R*(p[0]+(mx-p[0])*k), Y=cy-R*(p[1]+(my-p[1])*k); ix?ctx.lineTo(X,Y):ctx.moveTo(X,Y); });
    ctx.closePath(); ctx.fill();
  }
  // ombre du bord + reflet
  const sh=ctx.createRadialGradient(cx,cy,R*0.55,cx,cy,R); sh.addColorStop(0,"rgba(0,0,0,0)"); sh.addColorStop(1,"rgba(0,0,0,.55)");
  ctx.fillStyle=sh; ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fill();
  const hl=ctx.createRadialGradient(cx-R*.38,cy-R*.42,0,cx-R*.38,cy-R*.42,R*.75); hl.addColorStop(0,"rgba(255,255,255,.28)"); hl.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=hl; ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fill();
}
/* éclairage d'une facette par des lampes (réflexion miroir) */
function shade(base,f,n,r,lights,t,sparkle){
  const dif=Math.max(0,n[0]*-.4+n[1]*.55+n[2]*.73);
  let c=[base[0]*(0.25+0.45*dif)+18*f.h, base[1]*(0.25+0.45*dif)+18*f.h, base[2]*(0.25+0.45*dif)+22*f.h];
  for(const L of lights){ const d=Math.max(0,r[0]*L.d[0]+r[1]*L.d[1]+r[2]*L.d[2]); if(d<=0) continue; const p=Math.pow(d,L.e)*L.p*(L.mask?L.mask(f):1);
    c[0]+=L.c[0]*p; c[1]+=L.c[1]*p; c[2]+=L.c[2]*p; }
  const tw=Math.pow(Math.max(0,Math.sin(t*(1.6+f.h*2.4)+f.h*60)),28)*sparkle;
  return c.map(v=>Math.min(255,v+255*tw));
}
/* taches de lumière projetées par la boule sur les murs */
function spots(ctx,W,H,cx,cy,R,rot,tilt,amount,colorOf,filter){
  if(amount<=0.01) return;
  ctx.save(); ctx.globalCompositeOperation="lighter";
  for(let s=0;s<FACETS.length;s+=3){ const f=FACETS[s]; const n=sp(f.am,f.lm,rot,tilt);
    const r=[2*n[2]*n[0],2*n[2]*n[1],2*n[2]*n[2]-1]; if(r[2]>0.2) continue;
    if(filter&&!filter(r,f)) continue;
    const X=cx+r[0]*W*0.62, Y=cy-r[1]*H*0.62; if(X<-20||X>W+20||Y<-20||Y>H+20) continue;
    const c=colorOf(f,r), rad=R*(0.035+0.03*f.h)*(1+0.6*(1+r[2]));
    const g=ctx.createRadialGradient(X,Y,0,X,Y,rad); g.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},${0.9*amount})`); g.addColorStop(1,`rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(X,Y,rad,0,TAU); ctx.fill(); }
  ctx.restore();
}
function glow(ctx,cx,cy,r0,r1,col,a){ if(a<=0.005) return; const g=ctx.createRadialGradient(cx,cy,r0,cx,cy,r1); g.addColorStop(0,`rgba(${col},${a})`); g.addColorStop(1,`rgba(${col},0)`); ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.fillStyle=g; ctx.fillRect(cx-r1,cy-r1,r1*2,r1*2); ctx.restore(); }
function mixc(a,b,t){ return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; }
function string(ctx,cx,cy,R,col){ ctx.strokeStyle=col; ctx.lineWidth=Math.max(1,R*0.012); ctx.beginPath(); ctx.moveTo(cx,0); ctx.lineTo(cx,cy-R); ctx.stroke(); }
function star(ctx,x,y,r,col){ ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(x,y-r*2); ctx.lineTo(x+r*.35,y-r*.35); ctx.lineTo(x+r*2,y); ctx.lineTo(x+r*.35,y+r*.35); ctx.lineTo(x,y+r*2); ctx.lineTo(x-r*.35,y+r*.35); ctx.lineTo(x-r*2,y); ctx.lineTo(x-r*.35,y-r*.35); ctx.closePath(); ctx.fill(); }

const ROSE=[255,45,149], BLEU=[59,108,255], ANIS=[198,244,50], OR=[255,201,74], BLANC=[255,255,255], CYAN=[80,220,255], ROUGE=[255,60,40];

/* ---------- les 4 planches ---------- */
/* ---------- néons du logo AFC : 4 groupes de 2 tubes, pas tout à fait centrés ----------
   angles en degrés (0 = droite, 90 = bas), relevés sur le logo */
const LOGO_ROSE=[255,46,150], LOGO_BLEU=[48,92,200], LOGO_ANIS=[190,232,60];
const NEON_GROUPS=[
  {id:"haut", a0:242, a1:323, cols:[LOGO_ROSE,LOGO_ROSE]},
  {id:"droite", a0:330, a1:415, cols:[LOGO_ANIS,LOGO_BLEU]},   // anis en haut à droite, bleu en bas
  {id:"bas", a0:62, a1:143, cols:[LOGO_ROSE,LOGO_ROSE]},
  {id:"gauche", a0:150, a1:235, cols:[LOGO_ANIS,LOGO_BLEU]}    // anis en bas à gauche, bleu en haut
];
const ROWS=BANDS/2;   // 9 lignes de facettes par hémisphère
function litRows(c){ if(c===null||Math.abs(c)<=TOL) return 0; return Math.min(ROWS,Math.ceil((Math.abs(c)-TOL)/40*ROWS)); }
function neonArc(ctx,cx,cy,rad,a0,a1,col0,col1,on,w,from,to){
  // tube néon : halo coloré + âme blanche ; from/to = portion allumée (0..1) le long de l'arc
  const seg=48, A0=a0*Math.PI/180, A1=a1*Math.PI/180;
  ctx.save(); ctx.lineCap="round";
  // verre éteint
  ctx.strokeStyle="rgba(255,255,255,.08)"; ctx.lineWidth=w*1.4; ctx.beginPath(); ctx.arc(cx,cy,rad,A0,A1); ctx.stroke();
  if(on>0.01&&to>from){
    ctx.globalCompositeOperation="lighter";
    for(let k=0;k<seg;k++){ const u0=k/seg, u1=(k+1)/seg; if(u1<from||u0>to) continue;
      const s0=Math.max(u0,from), s1=Math.min(u1,to), b0=A0+(A1-A0)*s0, b1=A0+(A1-A0)*s1+0.004;
      const col=mixc(col0,col1,(s0+s1)/2).map(v=>v|0);
      for(const [lw,al] of [[w*7,.08],[w*3.6,.22],[w*1.8,.6]]){ ctx.strokeStyle=`rgba(${col},${al*on})`; ctx.lineWidth=lw; ctx.beginPath(); ctx.arc(cx,cy,rad,b0,b1); ctx.stroke(); }
      const core=mixc(col,[255,255,255],.75).map(v=>v|0);
      ctx.strokeStyle=`rgba(${core},${on})`; ctx.lineWidth=w*.7; ctx.beginPath(); ctx.arc(cx,cy,rad,b0,b1); ctx.stroke(); }
  }
  ctx.restore();
}
function neonBanda(variant){ return function(ctx,W,H,s,t){
  const cx=W/2, cy=H*.45, R=Math.min(W,H)*.235, tilt=.24;
  s.rot+=s.dt*(.2+1.1*s.ok);
  const c=s.sil?null:s.c, up=c!==null&&c>TOL, dn=c!==null&&c<-TOL, n=litRows(c), frac=n/ROWS;
  const colUp=LOGO_ROSE, colDn=variant==="bleu"?LOGO_BLEU:LOGO_ROSE;
  // rayons de soleil (juste)
  if(s.ok>.02){ ctx.save(); ctx.translate(cx,cy); ctx.globalCompositeOperation="lighter";
    for(let i=0;i<20;i++){ const an=i/20*TAU+t*.3, len=Math.max(W,H)*(.8+.15*Math.sin(t*2.4+i));
      const g=ctx.createLinearGradient(0,0,Math.cos(an)*len,Math.sin(an)*len); g.addColorStop(0,`rgba(255,226,150,${.38*s.ok})`); g.addColorStop(1,"rgba(255,226,150,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,len,an-.03,an+.03); ctx.closePath(); ctx.fill(); }
    ctx.restore(); }
  // halo général
  glow(ctx,cx,cy,R*.9,R*2.3,s.ok>.5?"255,226,150":up?"255,46,150":dn?colDn.join(","):"90,80,160",s.sil?.04:.1+.3*s.ok+.2*frac);
  // néons : 2 tubes par groupe, centre légèrement décalé à droite et vers le bas comme sur le logo
  const ox=cx+R*.04, oy=cy+R*.02, w=Math.max(1.5,R*.022), rads=[R*1.38,R*1.52];
  const flick=s.ok>.5&&Math.sin(t*37)>.9?.55:1;
  for(const g of NEON_GROUPS){
    for(let k=0;k<2;k++){ const rad=rads[k]+(g.id==="droite"?R*.03:g.id==="gauche"?-R*.02:0);
      let on=0, from=0, to=1;
      if(s.ok>.02){ on=s.ok*flick; }
      if(g.id==="haut"&&up){ on=1; const h=frac/2; from=.5-h; to=.5+h; }       // s'allume depuis le milieu, entièrement si très faux
      if(g.id==="bas"&&dn){ on=1; const h=frac/2; from=.5-h; to=.5+h; }
      const [c0,c1]=g.cols;
      neonArc(ctx,ox,oy,rad,g.a0,g.a1,g.id==="bas"&&dn?colDn:c0,g.id==="bas"&&dn?colDn:c1,on,w,from,to);
    } }
  string(ctx,cx,cy,R,"rgba(220,220,240,.4)");
  // boule : éclairage ligne par ligne depuis l'équateur
  const L=[{d:norm([-.4,.6,.7]),c:[210,210,235],p:.7,e:18}];
  if(s.ok>0) L.push({d:norm([Math.cos(t*.9),.3,.7]),c:[255,214,120],p:2.4*s.ok,e:4},{d:norm([0,0,1]),c:BLANC,p:1.8*s.ok,e:30});
  drawBall(ctx,cx,cy,R,s.rot,tilt,(f,nn,r)=>{
    let col=shade(s.ok>.5?[200,170,110]:[95,92,118],f,nn,r,L,t,.35+1.6*s.ok);
    let lit=0, tint=null;
    if(up&&f.i>=ROWS&&f.i<ROWS+n){ lit=1; tint=colUp; }
    if(dn&&f.i<ROWS&&f.i>=ROWS-n){ lit=1; tint=colDn; }
    if(lit){ const refl=.55+.7*Math.max(0,r[2]+.2)+.5*Math.pow(Math.max(0,r[1]*(up?1:-1)),3);
      col=mixc(col,tint.map(v=>Math.min(255,v*refl+40*f.h)),.88); }
    return col.map(v=>Math.min(255,v));
  },.1);
  // petits halos de lumière (juste)
  spots(ctx,W,H,cx,cy,R,s.rot,tilt,s.ok,(f)=>[[255,214,120],[255,236,190],LOGO_ROSE,LOGO_ANIS][(f.i+f.j)%4],null);
  if(s.ok>.4&&Math.random()<.6) s.sp.push({x:cx+(Math.random()*2-1)*W*.45,y:cy+(Math.random()*2-1)*H*.42,a:0,l:.6+Math.random()*.7,r:R*(.025+Math.random()*.04)});
  ctx.save(); ctx.globalCompositeOperation="lighter";
  s.sp=s.sp.filter(p=>{ p.a+=s.dt; if(p.a>p.l) return false; const al=Math.sin(Math.PI*p.a/p.l); star(ctx,p.x,p.y,p.r*al,`rgba(255,236,190,${al})`); return true; });
  ctx.restore();
  // repères
  ctx.fillStyle="rgba(255,255,255,.45)"; ctx.font=`600 ${Math.round(R*.11)}px Figtree,sans-serif`; ctx.textAlign="right";
  ctx.fillText("▲ trop haut",cx-R*.08,cy-R*1.72); ctx.fillText("▼ trop bas",cx-R*.08,cy+R*1.84);
}; }

return {draw:neonBanda("bleu"), TOL};
})();
