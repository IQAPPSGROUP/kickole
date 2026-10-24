# KICKOLÉ boot STYLES: styles-sheet.png + styles-locker.png (390x844 @2x). Run: python3 gen_styles.py
# Same card style / locked look as gen.py. Each boot drawn in a 120x80 box, toe right, ground y=76.
import cairosvg
from xml.sax.saxutils import escape as X
from gen import F,BG,TILE,EDGE,ACC,TXT,SUB,lock,wrap
GREY='#6E7A73'
# Edit unlock hints here. (label, main, dark, light)
STYLES=[("Classic","#2B2B2B","#4A4A4A","#8A8A8A"),("Wellies","#2E8B3E","#1A5A26","#4FB060"),
 ("Cowboy","#8B5A2B","#5A3415","#E0B070"),("Hi-tops","#D62828","#F2F2F2","#FFFFFF"),
 ("Snow boots","#2F6FB0","#1E3F66","#F4F1EA"),("Space boots","#F2F2F2","#8A9096","#C9CED3"),
 ("Knight","#9AA3AB","#5E666E","#D5DBE0"),("Gold","#D4A62A","#8A6A14","#FFF0A8")]
HINTS={"Classic":"Starter","Wellies":"100 kick-ups in total","Cowboy":"Land your first Rainbow",
 "Hi-tops":"5 different tricks in one run","Snow boots":"Beat your best score 3 times",
 "Space boots":"Hit a x5 combo","Knight":"1,000 kick-ups in total","Gold":"2,500 kick-ups in total"}
def P(d,f,o): return f'<path d="{d}" fill="{f}" stroke="{o}" stroke-width="2" stroke-linejoin="round"/>'
CL="M6 60 C6 46 16 38 30 38 L40 38 C44 26 54 22 64 24 L68 44 C84 48 100 52 110 58 C114 62 112 68 106 70 L10 70 C7 70 6 66 6 60 Z"
def studs(c): return ''.join(f'<rect x="{x}" y="70" width="7" height="6" rx="2" fill="{c}"/>' for x in (16,34,70,88,100))
def draw(n,m,d,l,o):
    if n in("Classic","Gold"):
        s=P(CL,m,o)+f'<rect x="6" y="66" width="106" height="6" rx="3" fill="{d}"/>'+studs(d if n=="Gold" else l)
        if n=="Gold": s+=f'<path d="M48 44 C60 40 80 46 96 54" fill="none" stroke="{l}" stroke-width="4" stroke-linecap="round"/><circle cx="58" cy="32" r="3" fill="{l}"/>'
        return s
    if n=="Wellies":
        return (P("M24 4 L58 4 L58 46 C78 48 100 52 108 62 C111 68 108 72 102 72 L22 72 C20 60 22 30 24 4 Z",m,o)+
          f'<rect x="22" y="4" width="38" height="7" rx="2" fill="{d}"/><rect x="20" y="70" width="90" height="7" rx="3" fill="{d}"/><rect x="28" y="16" width="4" height="40" rx="2" fill="{l}"/>')
    if n=="Cowboy":
        return (P("M22 4 L38 12 L58 4 L56 44 C78 46 100 52 116 66 C112 70 104 70 96 70 L40 70 L40 76 L22 76 L22 4 Z",m,o)+
          f'<rect x="22" y="66" width="18" height="10" fill="{d}"/><path d="M30 18 C40 26 48 22 50 16 M30 30 C40 38 48 34 50 28" fill="none" stroke="{l}" stroke-width="2" stroke-dasharray="3 3"/>'
          f'<path d="M40 74 L100 74" stroke="{d}" stroke-width="4"/>')
    if n=="Hi-tops":
        return (P("M24 12 L62 12 L64 44 C84 46 104 52 110 60 C112 64 110 66 106 66 L22 66 Z",m,o)+
          P("M18 64 L112 64 C114 70 112 76 106 76 L20 76 C16 76 16 66 18 64 Z",d,o)+
          ''.join(f'<circle cx="{52+i*3}" cy="{20+i*7}" r="2.4" fill="{l}"/>' for i in range(4))+f'<circle cx="34" cy="30" r="6" fill="{d}"/>')
    if n=="Snow boots":
        return (P("M24 22 L60 22 L60 46 C80 48 102 54 108 62 C110 66 108 68 104 68 L22 68 Z",m,o)+
          ''.join(f'<circle cx="{22+i*8}" cy="{18+(i%2)*3}" r="7" fill="{l}" stroke="{o}" stroke-width="1"/>' for i in range(6))+
          P("M18 66 L112 66 L112 74 L18 74 Z",d,o)+''.join(f'<rect x="{22+i*12}" y="74" width="7" height="3" fill="{d}"/>' for i in range(8)))
    if n=="Space boots":
        return (P("M18 10 C18 4 64 4 64 10 L66 40 C90 40 112 50 112 62 C112 70 104 72 96 72 L22 72 C14 72 14 64 16 56 Z",m,o)+
          f'<path d="M20 26 L64 26 M18 42 L104 48 M17 56 L110 60" fill="none" stroke="{l}" stroke-width="2.5"/>'+P("M14 68 L114 68 C114 76 110 78 104 78 L20 78 C14 78 12 74 14 68 Z",d,o))
    if n=="Knight":
        s=''.join(P(f"M24 {4+i*13} L60 {4+i*13} L60 {18+i*13} L24 {18+i*13} Z",m if i%2==0 else l,o) for i in range(4))
        return (s+P("M24 54 L62 50 C80 52 104 56 118 70 L24 72 Z",m,o)+P("M62 50 C76 52 88 56 94 62 L62 66 Z",l,o)+
          f'<rect x="22" y="70" width="80" height="6" rx="2" fill="{d}"/><circle cx="30" cy="11" r="1.8" fill="{d}"/><circle cx="54" cy="11" r="1.8" fill="{d}"/>')
def boot(x,y,s,st,locked):
    n,m,d,l=st; o='#111'
    if locked: m=d=l=GREY; o='none'
    return f'<g transform="translate({x} {y}) scale({s})">{draw(n,m,d,l,o)}</g>'
def card(x,y,st,locked,w=165,h=180):
    n=st[0]; s=[f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{TILE}" stroke="{EDGE}"/>',boot(x+(w-120)/2,y+20,1.0,st,locked),
     f'<text x="{x+w/2}" y="{y+124}" text-anchor="middle" {F} font-size="16" font-weight="bold" fill="{TXT}">{X(n)}</text>']
    if locked:
        s.append(lock(x+w-24,y+22))
        for i,t in enumerate(wrap(HINTS[n])): s.append(f'<text x="{x+w/2}" y="{y+148+i*17}" text-anchor="middle" {F} font-size="13" fill="{SUB}">{X(t)}</text>')
    else:
        s.append(f'<text x="{x+w/2}" y="{y+150}" text-anchor="middle" {F} font-size="13" fill="{SUB}">{"Starter" if n=="Classic" else "Unlocked"}</text>')
        s.append(f'<circle cx="{x+w-24}" cy="{y+24}" r="12" fill="{ACC}"/><path d="M{x+w-30} {y+24} l4 4 l8 -9" fill="none" stroke="#111" stroke-width="2.6" stroke-linecap="round"/>')
    return ''.join(s)
if __name__=="__main__":
    W=760; s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="900"><rect width="100%" height="100%" fill="{BG}"/><text x="{W/2}" y="44" text-anchor="middle" {F} font-size="26" font-weight="bold" fill="{TXT}">KICKOLÉ boot styles: unlocked / locked</text>']
    for i,b in enumerate(STYLES):
        c,r=i%4,i//4; s+= [card(20+c*185,70+r*415,b,False), card(20+c*185,70+r*415+195,b,True)]
    s.append('</svg>'); cairosvg.svg2png(bytestring=''.join(s).encode(),write_to='styles-sheet.png',scale=2)
    p=[f'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="{BG}"/>',
     f'<text x="20" y="62" {F} font-size="26" font-weight="bold" fill="{TXT}">Your boots</text>',
     f'<text x="20" y="86" {F} font-size="14" fill="{SUB}">Earn new boots by playing. Nothing to buy.</text>']
    p+=[card(20+(i%2)*185,100+(i//2)*186,b,i>1) for i,b in enumerate(STYLES)]
    p.append('</svg>'); cairosvg.svg2png(bytestring=''.join(p).encode(),write_to='styles-locker.png',scale=2)
