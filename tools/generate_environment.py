"""Original Kickolé environment kit. Python 3.10+ and Pillow; no Blender required.

Run: python tools/generate_environment.py
Coordinates: metres, +Y up, facades +Z, origin at street level.
Exports standard glTF 2 binary, one atlas/material/draw per asset, baked geometry.
The atlas is original procedural artwork, not photographic reference material.
"""
from pathlib import Path
import hashlib
import io
import json
import math
import random
import struct
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/models/environment'
OUT.mkdir(parents=True, exist_ok=True)
S = 256


def atlas():
    rng = random.Random(1962)
    im = Image.new('RGB', (1024, 1024))
    colors = ['#eee0c4', '#b56443', '#b6ac91', '#8b6547', '#193d48', '#a7533c',
              '#567b7f', '#f1e6c7', '#194d50', '#164e66', '#efc35b', '#335951',
              '#dbac76', '#6c7966', '#8c9b89', '#ebe4cc']
    for tile, color in enumerate(colors):
        t = Image.new('RGB', (S, S), color)
        d = ImageDraw.Draw(t)
        for _ in range(7000):
            x, y = rng.randrange(S), rng.randrange(S)
            base = t.getpixel((x, y)); delta = rng.choice([-17, -9, -4, 4, 8, 15])
            d.point((x, y), fill=tuple(max(0, min(255, c + delta)) for c in base))
        if tile == 0:  # warm plaster: subtle vertical weathering, flaking paint
            for _ in range(80):
                x, y = rng.randrange(S), rng.randrange(S)
                d.line((x, y, x + rng.randrange(-3, 4), min(S, y + rng.randrange(6, 45))), fill='#d3c3a7')
            for _ in range(30):
                x, y = rng.randrange(S), rng.randrange(S)
                d.ellipse((x, y, x + rng.randrange(2, 9), y + 3), fill='#c7b69a')
        if tile == 1:
            for row, y in enumerate(range(0, S, 24)):
                d.rectangle((0, y, S, y + 3), fill='#b99d7b')
                for x in range(-32 if row % 2 else 0, S, 64):
                    d.rectangle((x, y, x + 3, y + 24), fill='#b99d7b')
                    d.line((x + 7, y + 8, x + 55, y + 8), fill='#c57b52', width=2)
        if tile in (2, 14):
            for y in range(0, S, 64):
                for x in range(0, S, 64):
                    d.rectangle((x + 2, y + 2, x + 61, y + 61), outline='#899280', width=2)
        if tile == 3:
            for x in range(0, S, 32):
                d.line((x, 0, x, S), fill='#4b4436', width=3)
                for _ in range(9):
                    y = rng.randrange(S)
                    d.line((x + 7, y, x + 11, min(S, y + 45)), fill='#a58052')
        if tile == 4:
            d.polygon([(12, 12), (85, 12), (235, 244), (160, 244)], fill='#376573')
            d.polygon([(97, 12), (110, 12), (245, 226), (245, 245)], fill='#668987')
            d.rectangle((2, 2, 253, 253), outline='#102d37', width=9)
        if tile in (5, 6):
            for x in range(0, S, 22):
                d.line((x, 0, x, S), fill='#d29c73' if tile == 5 else '#9baba0', width=3)
                d.line((x + 5, 0, x + 5, S), fill='#704c3d' if tile == 5 else '#3c5e62', width=2)
        if tile == 7:  # generic blue ceramic azulejo
            for y in range(0, S, 64):
                for x in range(0, S, 64):
                    d.rectangle((x + 2, y + 2, x + 62, y + 62), outline='#648987', width=2)
                    d.polygon([(x+32,y+8),(x+53,y+32),(x+32,y+56),(x+11,y+32)], fill='#28727f')
                    d.ellipse((x+24,y+24,x+40,y+40), fill='#e4cd92')
        if tile == 9:
            for x in range(0, S, 32): d.line((x, 0, x, S), fill='#97b8b4', width=2)
            for y in range(0, S, 48): d.line((0, y, S, y), fill='#8aa8aa', width=2)
        if tile in (8, 10, 15):
            # Paint at the sign's physical aspect, then pack into the square tile.
            # Mapping it onto a wide facade restores correctly proportioned lettering.
            t=t.resize((1024,256)); d=ImageDraw.Draw(t)
            d.rectangle((12, 7, 1012, 249), outline='#f8df9d' if tile == 8 else '#314e49', width=5)
            # Pillow's bundled font avoids platform-specific font paths.
            font = ImageFont.load_default(size=108)
            small = ImageFont.load_default(size=35)
            text, sub = {8: ('MERCEARIA', 'DO MORRO  •  DESDE 1962'), 10: ('FUTEBOL', 'DE RUA  •  KICKOLÉ'), 15: ('LADEIRA', 'DA ALEGRIA  •  10') }[tile]
            d.text((512, 88), text, font=font, anchor='mm', fill='#f7eaca' if tile == 8 else '#214e4c')
            d.text((512, 164), sub, font=small, anchor='mm', fill='#f7eaca' if tile == 8 else '#214e4c')
            d.line((100, 208, 924, 208), fill='#ecbe57', width=4)
            t=t.resize((S,S),Image.Resampling.LANCZOS)
        if tile == 11:
            for _ in range(95):
                x, y = rng.randrange(S), rng.randrange(S)
                d.ellipse((x, y, x + 14, y + 30), fill=rng.choice(['#518363','#78946a','#a2a567']))
        im.paste(t, ((tile % 4) * S, (tile // 4) * S))
    buf = io.BytesIO(); im.save(buf, format='PNG', optimize=True)
    data = buf.getvalue()
    (OUT / 'street-atlas.png').write_bytes(data)
    return data


def rgb(value):
    value = value.lstrip('#')
    # glTF vertex colours are linear. Texture samples are decoded from sRGB.
    return [((int(value[i:i+2], 16) / 255 + .055) / 1.055) ** 2.4 for i in (0, 2, 4)]


class Mesh:
    def __init__(self, detail=0):
        self.p, self.n, self.uv, self.c, self.idx = [], [], [], [], []
        self.detail = detail
        self.origin = (0, 0, 0)

    def polygon(self, pts, normal, tile=0, color='#ffffff'):
        start = len(self.p) // 3
        tint = rgb(color)
        # Subtle baked directional AO; remains PBR-lit in the game.
        ao = .78 if normal[1] < -.5 else .91 if normal[2] < -.5 else 1
        uv = [(0, 0), (1, 0), (1, 1), (0, 1)]
        for i, p in enumerate(pts):
            self.p.extend(p[j] + self.origin[j] for j in range(3))
            self.n.extend(normal)
            u, v = uv[i % 4]
            # 4 px gutters avoid sampling neighbouring tiles in the mip chain.
            self.uv.extend(((tile % 4 + (4 + u * 248) / 256) / 4,
                            (tile // 4 + (4 + (1 - v) * 248) / 256) / 4))
            self.c.extend(c * ao for c in tint)
        for i in range(1, len(pts) - 1): self.idx.extend((start, start + i, start + i + 1))

    def box(self, x, y, z, w, h, d, tile=0, color='#ffffff'):
        a, b, c, e, f, g = x-w/2, x+w/2, y-h/2, y+h/2, z-d/2, z+d/2
        for pts, n in [([(a,c,g),(b,c,g),(b,e,g),(a,e,g)],(0,0,1)),
                       ([(b,c,f),(a,c,f),(a,e,f),(b,e,f)],(0,0,-1)),
                       ([(b,c,g),(b,c,f),(b,e,f),(b,e,g)],(1,0,0)),
                       ([(a,c,f),(a,c,g),(a,e,g),(a,e,f)],(-1,0,0)),
                       ([(a,e,g),(b,e,g),(b,e,f),(a,e,f)],(0,1,0)),
                       ([(a,c,f),(b,c,f),(b,c,g),(a,c,g)],(0,-1,0))]:
            self.polygon(pts, n, tile, color)

    def rod(self, a, b, r, tile=6, color='#ffffff', segments=None):
        segments = segments or (10 if self.detail == 0 else 6)
        axis = [b[i]-a[i] for i in range(3)]; length = math.sqrt(sum(v*v for v in axis))
        if length < 1e-6: return
        axis = [v/length for v in axis]
        ref = (1,0,0) if abs(axis[0]) < .9 else (0,1,0)
        def cross(u,v): return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        u = cross(axis, ref); norm = math.sqrt(sum(v*v for v in u)); u = [v/norm for v in u]
        v = cross(axis, u)
        rings = []
        for k in range(segments):
            t = k*2*math.pi/segments
            rings.append([r*(u[j]*math.cos(t)+v[j]*math.sin(t)) for j in range(3)])
        for k in range(segments):
            p, q = rings[k], rings[(k+1)%segments]
            n = [(p[j]+q[j])/(2*r) for j in range(3)]
            norm = math.sqrt(sum(t*t for t in n)); n = [t/norm for t in n]
            self.polygon([[a[j]+p[j] for j in range(3)], [a[j]+q[j] for j in range(3)],
                          [b[j]+q[j] for j in range(3)], [b[j]+p[j] for j in range(3)]], n, tile, color)
        # Triangulated caps use explicit triangles (polygon UVs are quad-oriented).
        for k in range(1, segments-1):
            self.polygon([[b[j]+rings[i][j] for j in range(3)] for i in (0,k,k+1)], axis, tile, color)
            self.polygon([[a[j]+rings[i][j] for j in range(3)] for i in (0,k+1,k)], [-t for t in axis], tile, color)

    def cable(self, a, b, sag=.25, color='#344c4b'):
        n = 12 if self.detail == 0 else 5
        def p(t): return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t-math.sin(t*math.pi)*sag,a[2]+(b[2]-a[2])*t]
        for i in range(n): self.rod(p(i/n),p((i+1)/n),.012,6,color,5)


def plant(m, x, y, z, scale=1):
    m.rod((x,y,z),(x,y+.32*scale,z),.17*scale,5,'#e8b38a')
    if m.detail > 1: return
    for i in range(7):
        a = i*2.4
        tip = (x+math.cos(a)*.43*scale,y+(.5+.15*(i%3))*scale,z+math.sin(a)*.43*scale)
        m.rod((x,y+.25*scale,z),tip,.018*scale,11,'#b8d28b',5)
        m.polygon([(x,y+.3*scale,z),(tip[0]+.11*scale,tip[1]-.06*scale,tip[2]),tip,
                   (tip[0]-.11*scale,tip[1]+.06*scale,tip[2])],(0,1,0),11,'#c6dda0')
        # Explicit reverse face (no double-sided material cost for the whole kit).
        m.polygon([(x,y+.3*scale,z),(tip[0]-.11*scale,tip[1]+.06*scale,tip[2]),tip,
                   (tip[0]+.11*scale,tip[1]-.06*scale,tip[2])],(0,-1,0),11,'#9bb984')


def rooftop(m, w=2.3, d=1.8, variant=0):
    if variant % 3 == 1:
        # Terracotta pitch, with real ridge/edge geometry and raised tile channels.
        for side in (-1,1):
            pts=[(-w*.55,.12,side*d*.55),(w*.55,.12,side*d*.55),(w*.55,.62,0),(-w*.55,.62,0)]
            n=(0,d*.55,side*.5); length=math.sqrt(sum(v*v for v in n)); n=tuple(v/length for v in n)
            if side<0: pts.reverse()
            m.polygon(pts,n,5,'#e8a778')
            m.polygon(list(reversed(pts)),tuple(-v for v in n),5,'#987452')
            if m.detail==0:
                for i in range(13):
                    x=-w*.53+i*w*1.06/12
                    m.rod((x,.14,side*d*.55),(x,.64,0),.025,5,'#d9a574',6)
        m.rod((-w*.56,.63,0),(w*.56,.63,0),.055,5,'#e7ae7b')
        m.box(w*.29,.7,-d*.2,.25,.8,.25,1)
        return
    m.box(-w*.24,.15,-d*.12,.7,.25,.65,2)
    m.rod((-w*.24,.28,-d*.12),(-w*.24,.94,-d*.12),.36,6,'#375d68')
    m.rod((-w*.24,.94,-d*.12),(-w*.24,1.01,-d*.12),.39,6,'#486c78')
    if m.detail == 0:
        for y in (.37,.55,.75): m.rod((-w*.24,y,-d*.12),(-w*.24,y+.035,-d*.12),.373,6,'#5c7c82')
        m.rod((-w*.25,.12,-d*.4),(-w*.25,.78,-d*.4),.028,6)
        m.rod((-w*.25,.78,-d*.4),(-w*.25,.78,-d*.22),.028,6)
    m.box(w*.24,.17,.0,.72,.08,.69,9)
    if m.detail < 2:
        m.rod((w*.3,.04,-d*.3),(w*.3,1.35,-d*.3),.018,6)
        for h in (.98,1.14,1.3): m.rod((w*.3-.32,h,-d*.3),(w*.3+.32,h,-d*.3),.012,6)


def window(m, x, y, z, color, shutter=False):
    m.box(x,y,z,.68,.86,.08,3,'#7e9690')
    m.box(x,y,z+.047,.55,.72,.025,4)
    m.box(x,y-.45,z+.05,.79,.065,.19,2)
    if m.detail > 1: return
    m.box(x,y,z+.075,.035,.74,.035,6,'#c4d4bf')
    m.box(x,y,z+.075,.58,.035,.035,6,'#c4d4bf')
    if shutter:
        for dx in (-.46,.46):
            m.box(x+dx,y,z+.08,.22,.83,.045,3,color)
            if m.detail == 0:
                for j in range(8): m.box(x+dx,y-.32+j*.09,z+.11,.2,.026,.02,3,'#c3c1a0')
    elif m.detail == 0:
        for dx in (-.22,-.11,0,.11,.22): m.rod((x+dx,y-.37,z+.13),(x+dx,y+.37,z+.13),.012,6,'#445956',6)


def building(m, variant=0, w=2.3, h=4.0, d=1.8, balcony=True):
    palette = ['#eebd71','#e68d76','#79bcb2','#91b9cb','#d9b1bf','#cbb789']
    col = palette[variant%6]
    z = d/2
    m.box(0,h/2,0,w,h,d,0,col)
    m.box(0,.22,z+.015,w,.44,.04,7)
    m.box(0,h+.04,0,w+.22,.12,d+.22,2)
    m.box(0,h+.22,-d/2,w+.13,.33,.1,0,col)
    for x in (-w/2,w/2): m.box(x,h+.22,0,.10,.33,d,0,col)
    # Exposed brick infill, structural columns and lintels.
    if m.detail < 2:
        m.box(-w*.28,h*.43,z+.022,w*.32,.56,.045,1)
        for x in (-w/2+.055,w/2-.055): m.box(x,h/2,z+.02,.10,h,.08,2)
        m.box(0,h*.51,z+.03,w,.10,.09,2)
        m.box(w/2+.02,h/2,0,.06,h*.83,d*.65,1)
    # Door with recess and transom.
    m.box(-w*.24,.79,z+.035,.66,1.58,.09,2)
    m.box(-w*.24,.75,z+.09,.54,1.43,.035,3,'#72a7a1' if variant%2 else '#bc945f')
    if m.detail == 0:
        m.rod((-w*.24+.19,.68,z+.13),(-w*.24+.19,.82,z+.13),.018,6,'#edc06c')
        m.box(-w*.24,1.34,z+.12,.41,.18,.025,4)
        m.box(-w*.24,.045,z+.17,.78,.09,.38,2)
    window(m,w*.23,1.12,z+.045,col,True)
    for x in (-w*.24,w*.24): window(m,x,h*.76,z+.045,col,variant%2==0)
    # Side-facing inset windows give real depth in the game's oblique camera.
    m.box(w/2+.04,h*.74,0,.055,.70,.58,4)
    if variant%2==0 and balcony:
        m.box(0,h*.54,z+.29,w*.83,.12,.63,2)
        if m.detail < 2:
            for y in (h*.54+.18,h*.54+.67): m.rod((-w*.41,y,z+.59),(w*.41,y,z+.59),.022,6,'#537d79')
            count = 13 if m.detail == 0 else 6
            for i in range(count):
                x = -w*.4+i*w*.8/(count-1)
                m.rod((x,h*.54+.06,z+.59),(x,h*.54+.68,z+.59),.014,6,'#537d79',6)
        plant(m,w*.24,h*.54+.08,z+.26,.55)
    if m.detail < 2:
        # A projecting corrugated sunshade, AC housing, gutter and drain pipe.
        m.box(0,1.82,z+.32,w*.94,.08,.70,5,'#f2d69b' if variant%2 else '#80b8aa')
        if m.detail == 0:
            for i in range(14): m.box(-w*.43+i*w*.86/13,1.87,z+.32,.025,.045,.7,6,'#e8d7ae')
            if balcony:
                m.box(w*.27,2.05,z+.12,.54,.32,.26,6,'#d0d6bf')
                for j in range(5): m.box(w*.27,1.94+j*.05,z+.258,.45,.014,.015,6,'#6b8580')
        m.rod((-w*.45,.12,z+.16),(-w*.45,h+.04,z+.16),.024,6,'#9baaa0')
        m.box(w*.33,1.62,z+.105,.21,.12,.025,15)
    old = m.origin
    m.origin = (old[0],old[1]+h+.1,old[2]); rooftop(m,w,d,variant); m.origin = old


def shop(m):
    building(m,2,2.7,4.2,2.15,False)
    z=1.075
    m.box(0,1.0,z+.15,2.4,1.7,.15,3,'#395d59')
    m.box(-.63,1.0,z+.24,1.0,1.4,.035,4)
    m.box(.56,1.0,z+.24,1.0,1.4,.035,3,'#809f87')
    m.box(0,2.32,z+.16,2.43,.65,.13,8)
    m.box(0,1.91,z+.6,2.65,.1,1.15,0,'#f3dfb0')
    for i in range(9):
        x=-1.18+i*.295
        m.box(x,1.97,z+.6,.145,.03,1.15,0,'#d27f62')
        m.box(x,1.8,z+1.15,.15,.25,.045,0,'#d27f62')
    if m.detail < 2:
        for x in (-1.21,1.21): m.rod((x,.02,z+1.13),(x,1.9,z+1.13),.026,6)
        for i in range(3):
            m.box(-.77+i*.55,.29,z+.6,.46,.5,.43,3)
            for j in range(4): m.rod((-.94+i*.55+j*.11,.57,z+.59),(-.94+i*.55+j*.11,.64,z+.59),.065,0,['#eecb64','#91b26b','#da9270'][i],6)
        plant(m,1.13,0,z+.38,.8)


def stairs(m):
    for i in range(18):
        y=(i+1)*.16
        m.box(0,y/2,-i*.28,1.5,y,.28,2)
        if m.detail == 0: m.box(0,y+.008,-i*.28+.12,1.46,.016,.025,0,'#f6d898')
    for x in (-.84,.84):
        m.box(x,1.40,-2.38,.14,2.8,5.15,0,'#c1b99a')
        m.rod((x,.85,.0),(x,3.65,-4.9),.028,6,'#7d9e95')
        if m.detail < 2:
            for i in range(7): m.rod((x,i*.46,-i*.8),(x,.85+i*.46,-i*.8),.019,6)
    plant(m,1.15,.02,-.2,.85)
    plant(m,-1.12,2.88,-4.8,.7)


def street(m):
    # Standalone set: slatted bench, public litter bin, ceramic planter and lamp.
    for j in range(5): m.box(-.7,.48,-.22+j*.10,1.65,.065,.075,3,'#cbae72')
    for j in range(3): m.box(-.7,.68+j*.12,-.25,1.65,.085,.055,3,'#cbae72')
    for x in (-1.32,-.08):
        m.box(x,.23,0,.07,.46,.48,6,'#325951')
        m.box(x,.68,-.27,.06,.6,.06,6,'#325951')
    m.rod((.63,.04,0),(.63,.72,0),.22,6,'#78b8a6')
    m.rod((.63,.73,0),(.63,.78,0),.25,6,'#304e4d')
    m.box(.63,.58,.22,.17,.10,.015,10)
    plant(m,1.35,0,.0,1)
    m.rod((-2,0,-.4),(-2,3.8,-.4),.045,6,'#45666a')
    m.rod((-2,3.8,-.4),(-1.53,3.8,-.4),.035,6)
    m.box(-1.53,3.74,-.4,.42,.1,.24,0,'#f8dfab')


def hillside(m):
    # Coordinates deliberately keep every triangle behind z=-4, beyond the court.
    # A continuous street plinth and retaining terraces support buildings/planters
    # when this kit is used without the gallery's ground plane.
    m.box(0,-.24,-10.6,20.8,.44,12.0,2)
    for row in range(3):
        level=1.50+row*1.48
        m.box(0,(level-.44)/2,-10.0-row*2.55,20.8-row*2.3,level+.44,2.75,1,'#d6bea0')
    positions=[(-7.4,0,-7.0,1),(-4.9,.25,-6.6,0),(-2.4,.55,-7.1,2),
               (.15,.95,-7.3,4),(4.2,.35,-7.0,3),(6.85,.05,-7.3,5)]
    for i,(x,y,z,v) in enumerate(positions):
        m.origin=(x,y,z)
        m.box(0,-.22,0,2.55,.44,2.8,2)
        if i==0: shop(m)
        else: building(m,v,2.25,3.3+(i%3)*.52,2.0)
    m.origin=(2.1,.0,-5.4); stairs(m)
    # Terraced rear rows climb the hill, with asymmetric stacked house volumes.
    for row in range(3):
        for i in range(9-row):
            x=(i-(8-row)/2)*2.3+(row%2)*.5
            y=1.65+row*1.48+.18*math.sin(i*2)
            z=-10.0-row*2.55+math.sin(i*1.7)*.22
            m.origin=(x,y,z)
            original=m.detail
            m.detail=min(2,original+1)
            building(m,i+row,1.94+(i%3)*.16,2.65+(i%4)*.49,1.95)
            m.detail=original
            m.box(0,-.6,0,2.3,1.2,2.5,1,'#c9b28e')
    m.origin=(0,0,0)
    if m.detail<2:
        for i in range(5):
            a=(-7.8,4.8+i*.13,-5.8); b=(7.4,5.1+i*.13,-6.2)
            m.cable(a,b,.48+i*.03)
        for x in (-7.8,7.4):
            m.rod((x,0,-6),(x,5.7,-6),.065,3,'#b9ab87')
            m.box(x,5.15,-6,.76,.08,.09,6)
        # Laundry above the alley: folded silhouettes with hems and clothespins.
        m.cable((-.6,4.0,-5.7),(4.5,4.4,-6),.25)
        for i in range(9):
            x=-.3+i*.48; y=3.8+i*.04-math.sin(i/8*math.pi)*.2
            col=['#f6e4bd','#84b9ce','#e79b8c','#dfc965'][i%4]
            m.box(x,y,-5.7,.28,.45,.018,0,col)
            if m.detail==0:
                m.box(x,y-.21,-5.68,.27,.025,.012,0,'#e3d7bb')
                for dx in (-.1,.1): m.box(x+dx,y+.23,-5.7,.025,.07,.035,3)
        for x,z in [(-8,-5.3),(7.9,-5.4),(-9,-9),(8.3,-11)]:
            plant(m,x,.0,z,1.9)
    m.origin=(0,0,0)


def export(name, mesh, texture):
    chunks=[]; views=[]; access=[]
    def data(raw):
        offset=sum(len(c) for c in chunks)
        chunks.append(raw+b'\0'*((-len(raw))%4))
        views.append({'buffer':0,'byteOffset':offset,'byteLength':len(raw)})
        return len(views)-1
    def accessor(values, fmt, ctype, kind, bounds=False, normalized=False):
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[kind]
        item={'bufferView':data(struct.pack('<'+fmt*len(values),*values)), 'componentType':ctype,'count':len(values)//n,'type':kind}
        views[item['bufferView']]['target']=34963 if kind=='SCALAR' else 34962
        if normalized: item['normalized']=True
        if bounds:
            item['min']=[min(values[i::n]) for i in range(n)]
            item['max']=[max(values[i::n]) for i in range(n)]
        access.append(item); return len(access)-1
    attrs={'POSITION':accessor(mesh.p,'f',5126,'VEC3',True),
           'NORMAL':accessor(mesh.n,'f',5126,'VEC3'),
           'TEXCOORD_0':accessor([round(v*65535) for v in mesh.uv],'H',5123,'VEC2',normalized=True)}
    # RGB bytes need a four-byte stride for glTF vertex alignment; RGBA is simpler.
    rgba=[c for i in range(len(mesh.c)//3) for c in (*[round(v*255) for v in mesh.c[i*3:i*3+3]],255)]
    attrs['COLOR_0']=accessor(rgba,'B',5121,'VEC4',normalized=True)
    small=len(mesh.p)//3<=65535
    indices=accessor(mesh.idx,'H' if small else 'I',5123 if small else 5125,'SCALAR')
    image=data(texture)
    gltf={'asset':{'version':'2.0','generator':'Kickolé original environment generator'},'scene':0,'scenes':[{'nodes':[0]}],
          'nodes':[{'name':name,'mesh':0,'extras':{'decorative':True,'units':'metres','up':'+Y','front':'+Z','lod':mesh.detail}}],
          'meshes':[{'name':name,'primitives':[{'attributes':attrs,'indices':indices,'material':0}]}],
          'materials':[{'name':'Street_Painted_Atlas','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.85}}],
          'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],
          'images':[{'bufferView':image,'mimeType':'image/png'}],'accessors':access,'bufferViews':views,'buffers':[{'byteLength':sum(len(c) for c in chunks)}]}
    j=json.dumps(gltf,separators=(',',':')).encode(); j+=b' '*((-len(j))%4)
    binary=b''.join(chunks)
    raw=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(binary))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    (OUT/(name+'.glb')).write_bytes(raw)
    pos=gltf['accessors'][0]
    return {'file':name+'.glb','lod':mesh.detail,'triangles':len(mesh.idx)//3,'vertices':len(mesh.p)//3,
            'bytes':len(raw),'drawCalls':1,'bounds':{'min':pos['min'],'max':pos['max']},'sha256':hashlib.sha256(raw).hexdigest()}


def main():
    texture=atlas(); assets=[]
    for level in range(3):
        m=Mesh(level); hillside(m); assets.append(export(f'hillside-lod{level}',m,texture))
    for name,fn in [('townhouse-ochre',lambda m:building(m,0)),('townhouse-coral',lambda m:building(m,1)),
                    ('townhouse-teal',lambda m:building(m,2)),('corner-mercearia',shop),('stepped-alley',stairs),
                    ('rooftop-equipment',rooftop),('street-furniture',street)]:
        m=Mesh(); fn(m); assets.append(export(name,m,texture))
    manifest={'version':1,'seed':1962,'units':'metres','up':'+Y','front':'+Z','provenance':'Original assets created for IQ Apps Group; no third-party models or textures.',
              'texture':{'file':'street-atlas.png','width':1024,'height':1024,'colorSpace':'sRGB'},'assets':assets}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(assets,indent=2))


if __name__=='__main__': main()
