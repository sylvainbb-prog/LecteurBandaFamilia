import re,os,json,shutil,sys
D=os.path.dirname(os.path.abspath(__file__))
src=lambda f:open(os.path.join(D,'src',f),encoding='utf-8').read()
VER=open(os.path.join(D,'VERSION')).read().strip() if os.path.exists(os.path.join(D,'VERSION')) else "1.0"
head=f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>La Banda Familia – répétitions</title>
<meta name="description" content="Lecteur de répétition de la banda AFC La Banda Familia">
<meta name="theme-color" content="#050507">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Banda">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tilt+Neon&family=Poppins:wght@400;500;600;700;800&family=Sacramento&family=Montserrat:wght@400;600;800&family=Inter:wght@400;500;600;800&family=Baloo+2:wght@600;800&family=Nunito:wght@400;600;700;800&family=Lilita+One&family=Pacifico&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<script>
/* CONFIGURATION facultative (Google Drive) : clé API et dossier, sinon les morceaux du dossier « morceaux » sont utilisés */
window.BANDA_CONFIG = {{ apiKey: "", folderId: "" }};
window.BANDA_VERSION = "{VER}";
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.9/build/opensheetmusicdisplay.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
<style>
{src('style.css')}
</style>
</head>
'''
html=head+src('body.html')+"\n<script>\n"+src('img.js')+src('app.js')+src('sound.js')+src('neon.js')+src('tuner.js')+src('beat.js')+src('fx.js')+src('aide.js')+src('help.js')+"\n</script>\n</body>\n</html>\n"
out=sys.argv[1] if len(sys.argv)>1 else os.path.join(D,'dist')
os.makedirs(out,exist_ok=True)
open(os.path.join(out,'index.html'),'w',encoding='utf-8').write(html)
print("index.html",len(html))
# ---- site complet : fichiers statiques, morceaux et liste des morceaux
import zipfile, unicodedata
from lxml import etree
for f in os.listdir(os.path.join(D,'static')):
    s_=os.path.join(D,'static',f); d_=os.path.join(out,f)
    if os.path.isdir(s_): shutil.copytree(s_,d_,dirs_exist_ok=True)
    else: shutil.copy(s_,d_)
sw=open(os.path.join(out,'sw.js')).read().replace('__VERSION__',VER); open(os.path.join(out,'sw.js'),'w').write(sw)
SRC=os.path.join(D,'..','MX','out','mxl')
md=os.path.join(out,'morceaux'); os.makedirs(md,exist_ok=True)
def slug(t):
    t=unicodedata.normalize('NFKD',t).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',t).strip('-')
songs=[]
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.mxl'): continue
    z=zipfile.ZipFile(os.path.join(SRC,f)); main=[n for n in z.namelist() if n.endswith('.xml') and not n.startswith('META')][0]
    r=etree.fromstring(z.read(main))
    title=(r.findtext('work/work-title') or r.findtext('movement-title') or f[:-4]).strip()
    parts=[pe for pe in r.findall('part') if pe.find('measure/attributes/staff-details[@print-object="no"]') is None]
    num=re.match(r'\s*(\d+)',f); num=num.group(1) if num else ''
    fn=(num+'-' if num else '')+slug(title)+'.mxl'
    shutil.copy(os.path.join(SRC,f),os.path.join(md,fn))
    songs.append({"name":(num+' - ' if num else '')+title,"title":title,"file":fn,"parts":len(parts)})
json.dump(songs,open(os.path.join(md,'songs.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(len(songs),'morceaux')
# mise en page pré-calculée (largeurs « comme imprimé » et défilement) : APP/calibrage.json
cal=os.path.join(D,'calibrage.json')
if os.path.exists(cal): shutil.copy(cal,os.path.join(md,'calibrage.json'))
