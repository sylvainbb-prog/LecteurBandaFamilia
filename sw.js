/* La Banda Familia – fonctionnement hors connexion
   - l'application et ses bibliothèques : en cache dès l'installation
   - les morceaux : la version en ligne si possible, sinon celle du cache
   - les sons d'instruments : téléchargés une fois, puis toujours lus depuis le cache */
const VERSION="2.3";
const APP="banda-app-"+VERSION, SONGS="banda-morceaux", SOUNDS="banda-sons", LIBS="banda-libs";
const SHELL=["./","index.html","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
const CDN=["https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js","https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.9/build/opensheetmusicdisplay.min.js",
  "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js","https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"];
self.addEventListener("install",e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(APP); await c.addAll(SHELL);
    const l=await caches.open(LIBS); await Promise.all(CDN.map(u=>l.match(u).then(h=>h||fetch(u,{mode:"cors"}).then(r=>r.ok&&l.put(u,r)).catch(()=>{}))));
    self.skipWaiting();
  })());
});
self.addEventListener("activate",e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(k.startsWith("banda-app-")&&k!==APP) await caches.delete(k);
    await self.clients.claim();
  })());
});
async function cacheFirst(req,name){ const c=await caches.open(name); const h=await c.match(req); if(h) return h; const r=await fetch(req); if(r.ok||r.type==="opaque") c.put(req,r.clone()); return r; }
async function networkFirst(req,name){ const c=await caches.open(name);
  try{ const r=await fetch(req); if(r.ok) c.put(req,r.clone()); return r; }
  catch(e){ const h=await c.match(req,{ignoreSearch:true}); if(h) return h; throw e; } }
async function staleRevalidate(req,name){ const c=await caches.open(name); const h=await c.match(req);
  const f=fetch(req).then(r=>{ if(r.ok||r.type==="opaque") c.put(req,r.clone()); return r; }).catch(()=>h);
  return h||f; }
self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET") return;
  const u=new URL(req.url);
  if(u.hostname==="gleitz.github.io") return e.respondWith(cacheFirst(req,SOUNDS));
  if(/cdnjs|jsdelivr|unpkg/.test(u.hostname)) return e.respondWith(cacheFirst(req,LIBS));
  if(/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return e.respondWith(staleRevalidate(req,LIBS));
  if(u.hostname==="api.github.com") return e.respondWith(networkFirst(req,SONGS));
  if(u.origin===location.origin){
    if(/\/morceaux\//.test(u.pathname)) return e.respondWith(networkFirst(req,SONGS));
    if(req.mode==="navigate") return e.respondWith(networkFirst(new Request("index.html"),APP).catch(()=>caches.match("index.html")));
    return e.respondWith(networkFirst(req,APP));
  }
});
