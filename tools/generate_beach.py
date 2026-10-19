"""Kickolé original Brazilian beach kit. Python 3.10+, Pillow 12.3 recommended.

python tools/generate_beach.py
Uses the street kit's glTF writer, but never regenerates or changes street assets.
Metres, +Y up, +Z front; all assembled scenery is behind z=-4.4.
"""
import io
import json
import math
import random
from PIL import Image, ImageDraw, ImageFont
import generate_environment as core

OUT=core.ROOT/'public/models/beach'
OUT.mkdir(parents=True,exist_ok=True)
core.OUT=OUT
Mesh=core.Mesh


def atlas():
    rng=random.Random(20261019)
    im=Image.new('RGB',(1024,1024))
    colors=['#edd4a4','#c4a46c','#e8d5a6','#b29a70','#447d89','#f7eed7','#aebbb1','#ede8cc',
            '#174e4e','#429da9','#eec251','#67965e','#caa573','#c4b690','#9cc9c0','#f3d9b2']
    for tile,col in enumerate(colors):
        t=Image.new('RGB',(256,256),col); d=ImageDraw.Draw(t)
        for _ in range(7500):
            x,y=rng.randrange(256),rng.randrange(256); c=t.getpixel((x,y)); v=rng.choice([-16,-8,-3,3,8,16])
            d.point((x,y),fill=tuple(min(255,max(0,a+v)) for a in c))
        if tile==0:
            for row in range(12):
                p=[(x,int(row*23+math.sin(x/25+row*.8)*3)) for x in range(256)]
                d.line(p,fill='#ddc492',width=1)
            for _ in range(30):
                x,y=rng.randrange(256),rng.randrange(256)
                d.ellipse((x,y,x+2,y+2),fill='#af9772')
        if tile==1:
            for y in range(0,256,20):
                d.line((0,y,256,y+5),fill='#987c52',width=4)
                for x in range(-10,256,9): d.line((x,y,x-7,y+25),fill=rng.choice(['#d9be83','#ae8e58','#ead19b']),width=2)
        if tile in (2,5):
            for x in range(0,256,7): d.line((x,0,x,256),fill='#d7ccb0' if tile==5 else '#bfb08d')
            for y in range(0,256,7): d.line((0,y,256,y),fill='#e7dcc0' if tile==5 else '#d9c59d')
        if tile==3:
            for x in range(0,256,43):
                d.line((x,0,x,256),fill='#786b52',width=3)
                for _ in range(18):
                    y=rng.randrange(256);d.line((x+6,y,x+8,y+40),fill='#d0b88c')
                for y in (12,243): d.ellipse((x+17,y,x+21,y+4),fill='#5e655c')
        if tile==4:
            d.polygon([(15,0),(50,0),(210,256),(160,256)],fill='#8fb7b9')
            d.rectangle((3,3,252,252),outline='#325e68',width=6)
        if tile==7:
            for y in range(-20,290,42):
                pts=[(x,y+int(math.sin(x/36)*17)) for x in range(256)]
                d.line(pts,fill='#294d50',width=12)
                d.line([(x,a+17) for x,a in pts],fill='#c5b896',width=3)
        if tile in (8,10):
            t=t.resize((1024,256)); d=ImageDraw.Draw(t)
            dark='#f9e6ba' if tile==8 else '#174e4e'
            d.rectangle((9,9,1015,247),outline=dark,width=5)
            text,sub=('ÁGUA DE COCO','GELADA • PRAIA DO SOL') if tile==8 else ('KICKOLÉ','FUTEBOL NA PRAIA')
            d.text((512,92),text,font=ImageFont.load_default(size=95),anchor='mm',fill=dark)
            d.text((512,180),sub,font=ImageFont.load_default(size=33),anchor='mm',fill=dark)
            t=t.resize((256,256),Image.Resampling.LANCZOS)
        if tile==9:
            for row in range(18):
                pts=[(x,int(row*17+math.sin(x/21+row)*4)) for x in range(256)]
                d.line(pts,fill=rng.choice(['#60b1b7','#77bbc0','#368b99']),width=2)
        if tile==11:
            for i in range(30): d.line((128,0,i*9-9,256),fill='#a3b576' if i%2 else '#466d4d',width=3)
            d.line((128,0,128,256),fill='#b8c689',width=5)
        if tile in (12,13):
            for y in range(0,256,12): d.line((0,y,256,y+6),fill='#aa9069',width=3)
        if tile==14:
            for y in range(0,256,43):
                d.line((0,y,256,y),fill='#64938e',width=3)
                d.line((0,y+5,256,y+5),fill='#c5dad0',width=2)
        if tile==15:
            for x in range(0,256,64): d.rectangle((x,0,x+30,256),fill='#de9a76')
        im.paste(t,((tile%4)*256,(tile//4)*256))
    b=io.BytesIO();im.save(b,format='PNG',optimize=True);data=b.getvalue()
    (OUT/'beach-atlas.png').write_bytes(data);return data


def face(m,pts,tile=0,color='#ffffff',double=False):
    a,b,c=pts[:3];u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
    n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    length=math.sqrt(sum(a*a for a in n))
    if length<1e-9:return
    n=[a/length for a in n];m.polygon(pts,n,tile,color)
    if double:m.polygon(list(reversed(pts)),[-a for a in n],tile,color)


def sphere(m,x,y,z,rx,ry,rz,tile=0,color='#ffffff'):
    lat,lon=(6,10) if m.detail==0 else (4,6)
    def p(a,b):return(x+rx*math.sin(a)*math.cos(b),y+ry*math.cos(a),z+rz*math.sin(a)*math.sin(b))
    for i in range(lat):
        for j in range(lon):
            a,b=i*math.pi/lat,(i+1)*math.pi/lat;c,d=j*2*math.pi/lon,(j+1)*2*math.pi/lon
            if i==0:face(m,[p(a,c),p(b,d),p(b,c)],tile,color)
            elif i==lat-1:face(m,[p(a,c),p(a,d),p(b,c)],tile,color)
            else:face(m,[p(a,c),p(a,d),p(b,d),p(b,c)],tile,color)


def loop(m,x,y,z,r,tube,tile=13,color='#ffffff',vertical=False):
    steps=24 if m.detail==0 else 12
    for i in range(steps):
        a=i*2*math.pi/steps;b=(i+1)*2*math.pi/steps
        p=(x+r*math.cos(a),y+(r*math.sin(a) if vertical else 0),z+(0 if vertical else r*math.sin(a)))
        q=(x+r*math.cos(b),y+(r*math.sin(b) if vertical else 0),z+(0 if vertical else r*math.sin(b)))
        m.rod(p,q,tube,tile,color,6)


def place(m,fn,x=0,y=0,z=0,rotation=0,scale=1):
    part=Mesh(m.detail);fn(part);start=len(m.p)//3;c,s=math.cos(rotation),math.sin(rotation)
    for i in range(0,len(part.p),3):
        a,b,d=part.p[i:i+3];m.p.extend((x+scale*(a*c+d*s),y+scale*b,z+scale*(-a*s+d*c)))
        a,b,d=part.n[i:i+3];m.n.extend((a*c+d*s,b,-a*s+d*c))
    m.uv.extend(part.uv);m.c.extend(part.c);m.idx.extend(i+start for i in part.idx)


def palm(m,height=4.7,lean=.65):
    segments=16 if m.detail==0 else 8 if m.detail==1 else 5
    def trunk(t):return (lean*t*t,height*t,.12*math.sin(t*2))
    for i in range(segments):
        t=i/segments
        m.rod(trunk(t),trunk((i+1)/segments),.16-.085*t,12,'#e0ca9d',10 if m.detail==0 else 6)
        if m.detail==0:
            a=trunk(t);b=trunk(min(1,t+.01));m.rod(a,b,.167-.085*t,13,'#a98a61',10)
    cx,cy,cz=trunk(1)
    leaves=11 if m.detail==0 else 9 if m.detail==1 else 7
    for j in range(leaves):
        angle=j*2*math.pi/leaves+.2;length=1.8+(j%3)*.16
        def spine(t):return (cx+math.cos(angle)*length*t,cy+.28*math.sin(t*math.pi)-.72*t*t,cz+math.sin(angle)*length*t)
        steps=7 if m.detail==0 else 4 if m.detail==1 else 3
        for k in range(steps):
            t=k/steps;u=(k+1)/steps;p=spine(t);q=spine(u)
            width=.32*math.sin((t+.07)*math.pi)*(1-t*.3)
            w2=.32*math.sin((u+.01)*math.pi)*(1-u*.3) if u<1 else 0
            side=(-math.sin(angle),0,math.cos(angle))
            face(m,[(p[0]-side[0]*width,p[1]-.035,p[2]-side[2]*width),
                    (q[0]-side[0]*w2,q[1]-.035,q[2]-side[2]*w2),q,p],11,'#c0d191',True)
            face(m,[p,q,(q[0]+side[0]*w2,q[1]-.035,q[2]+side[2]*w2),
                    (p[0]+side[0]*width,p[1]-.035,p[2]+side[2]*width)],11,'#abc77f',True)
            if m.detail==0:
                m.rod(p,q,.012,11,'#d5daa1',5)
                # Individual tapered leaflets give the feathered palm silhouette.
                for sign in (-1,1):
                    end=(p[0]+sign*side[0]*width*1.6+.1*math.cos(angle),p[1]-.18,p[2]+sign*side[2]*width*1.6+.1*math.sin(angle))
                    face(m,[p,end,(q[0]+sign*side[0]*w2,q[1]-.04,q[2]+sign*side[2]*w2)],11,'#b8cb83',True)
    if m.detail<2:
        for j in range(4):
            a=j*1.9;sphere(m,cx+math.cos(a)*.16,cy-.12,cz+math.sin(a)*.16,.12,.15,.12,12,'#a9bd70')


def umbrella(m,color='#efbc65'):
    m.rod((0,0,0),(0,2.28,0),.035,3,'#ead9ad')
    n=12 if m.detail<2 else 8
    for i in range(n):
        a=i*2*math.pi/n;b=(i+1)*2*math.pi/n
        mid=((a+b)/2)
        top=(0,2.3,0);p=(math.cos(a)*1.25,1.91,math.sin(a)*1.25);q=(math.cos(b)*1.25,1.91,math.sin(b)*1.25)
        face(m,[top,p,q],5,color if i%2 else '#f8eed4',True)
        p2=(p[0],1.78,p[2]);q2=(q[0],1.78,q[2]);face(m,[p,p2,q2,q],5,color if i%2 else '#f8eed4',True)
        if m.detail==0:m.rod(top,(math.cos(mid)*1.18,1.94,math.sin(mid)*1.18),.012,6,'#ced2b8',5)
    sphere(m,0,2.31,0,.055,.07,.055,6)


def lounger(m):
    for x in (-.32,.32):
        m.rod((x,.05,-.65),(x,.55,.68),.025,6)
        m.rod((x,.05,.65),(x,.55,-.65),.025,6)
        m.rod((x,.48,-.42),(x,.91,-.96),.025,6)
    face(m,[(-.31,.48,.68),(.31,.48,.68),(.31,.48,-.4),(-.31,.48,-.4)],15,'#ffffff',True)
    face(m,[(-.31,.48,-.4),(.31,.48,-.4),(.31,.91,-.96),(-.31,.91,-.96)],15,'#ffffff',True)
    if m.detail==0:
        for z in (-.62,.5):m.rod((-.32,.25,z),(.32,.25,z),.018,6)


def leisure(m):
    umbrella(m)
    place(m,lounger,-.62,0,.44,rotation=-.12)
    place(m,lounger,.62,0,.44,rotation=.12)
    m.rod((0,.02,1.1),(0,.48,1.1),.045,3)
    m.rod((0,.48,1.1),(0,.53,1.1),.29,3)
    if m.detail<2:
        sphere(m,.10,.61,1.10,.085,.08,.085,12,'#bed38c')
        m.rod((.10,.64,1.10),(.12,.80,1.10),.009,5)


def goal(m):
    for x in (-1.5,1.5):
        m.rod((x,0,0),(x,1.85,0),.055,5)
        m.rod((x,0,0),(x,0,-1.0),.04,5)
        m.rod((x,1.85,0),(x,.08,-1.0),.025,5)
    m.rod((-1.5,1.85,0),(1.5,1.85,0),.055,5)
    m.rod((-1.5,.08,-1),(1.5,.08,-1),.035,5)
    n=20 if m.detail==0 else 12 if m.detail==1 else 6
    for i in range(n+1):
        x=-1.5+3*i/n
        m.rod((x,1.81,0),(x,.09,-1),.006,13,'#ecdfb7',4)
    rows=12 if m.detail==0 else 7 if m.detail==1 else 4
    for i in range(rows+1):
        t=i/rows;y=.09+1.72*t;z=-1+t
        m.rod((-1.48,y,z),(1.48,y,z),.006,13,'#ecdfb7',4)
    if m.detail<2:
        for sign in (-1,1):
            for i in range(1,7):
                t=i/7;m.rod((sign*1.5,1.8*t,0),(sign*1.5,.08,-1+t),.005,13,'#ecdfb7',4)


def kiosk(m):
    m.box(0,.12,0,3.4,.24,2.7,3)
    m.box(0,1.25,-.24,2.8,2.3,1.9,3,'#8cbeb3')
    for x in (-1.44,1.44):
        for z in (-1.25,1.22):m.rod((x,.22,z),(x,2.53,z),.065,3,'#f0dfba')
    m.box(0,1.48,.74,2.38,.85,.05,4)
    m.box(0,1.01,1.02,2.75,.12,.68,3,'#f5d79b')
    m.box(0,.64,.93,2.55,.62,.10,7)
    m.box(0,2.10,.79,2.67,.38,.09,8)
    # Hipped thatch roof with two tiers and a raised ridge.
    corners=[(-1.85,2.54,-1.6),(1.85,2.54,-1.6),(1.85,2.54,1.6),(-1.85,2.54,1.6)]
    peaks=[(-.70,3.32,0),(.70,3.32,0)]
    for pts in [[corners[0],peaks[0],peaks[1],corners[1]],[corners[1],peaks[1],corners[2]],
                [corners[2],peaks[1],peaks[0],corners[3]],[corners[3],peaks[0],corners[0]]]:face(m,pts,1,'#f1d194',True)
    m.rod((-.75,3.34,0),(.75,3.34,0),.055,1)
    if m.detail<2:
        count=24 if m.detail==0 else 12
        for i in range(count):
            x=-1.82+i*3.64/(count-1)
            m.rod((x,2.55,1.59),(x,2.40,1.66),.018,1,'#e0bf85',5)
        for x in (-1.10,-.65,-.20):sphere(m,x,1.17,1.08,.12,.13,.12,12,'#d0d59b')
        m.box(.72,1.25,1.0,.48,.37,.33,5,'#e9c584')
        m.box(.72,1.45,1.0,.5,.035,.35,6)
        for x in (-1.65,1.65):
            m.rod((x,.2,1.65),(x,.63,1.65),.035,3)
            m.rod((x,.63,1.65),(x,.69,1.65),.20,3)
    m.box(0,.075,1.6,1.0,.15,.52,3)


def tower(m):
    for x in (-.73,.73):
        for z in (-.66,.66):m.rod((x*1.2,0,z*1.2),(x,2.25,z),.075,3,'#faf0d2')
    m.box(0,1.64,0,1.95,.13,1.8,3)
    m.box(0,2.05,-.24,1.62,.72,1.13,3,'#efbca2')
    m.box(0,2.25,.36,1.31,.43,.03,4)
    m.box(0,1.88,.41,1.56,.29,.05,10)
    for x in (-.88,.88):
        m.rod((x,1.7,.78),(x,2.4,.78),.026,6)
    m.rod((-.88,2.4,.78),(.88,2.4,.78),.026,6)
    m.box(0,2.68,-.12,2.0,.12,2.0,15)
    for x in (-.63,.63):m.rod((x,2.25,-.5),(x,2.62,-.5),.04,3)
    for x in (-.28,.28):m.rod((x,.03,1.63),(x,1.68,.68),.035,3)
    for i in range(7):
        t=i/6;m.rod((-.28,.09+t*1.55,1.60-t*.89),(.28,.09+t*1.55,1.60-t*.89),.03,3)
    if m.detail<2:
        for x in (-.73,.73):m.rod((x,.28,-.7),(x,1.6,.7),.035,3)
        loop(m,.55,2.0,.46,.20,.045,5,'#f2b47f',True)
    m.rod((.75,2.7,-.55),(.75,3.9,-.55),.02,6)
    face(m,[(.75,3.84,-.55),(1.4,3.66,-.55),(.75,3.45,-.55)],5,'#eaa169',True)


def boat(m):
    # Closed angular hull; an open deck remains visibly recessed inside the gunwale.
    sections=[(-1.6,.46,.25),(-1.1,.72,.12),(.8,.65,.10),(1.55,.05,.33)]
    for side in (-1,1):
        for (z,w,y),(q,v,b) in zip(sections,sections[1:]):
            pts=[(side*w,.61,z),(side*v,.65,q),(side*v*.55,b,q),(side*w*.55,y,z)]
            if side<0:pts.reverse()
            face(m,pts,14,'#ffffff',True)
            m.rod((side*w,.63,z),(side*v,.67,q),.045,3,'#e8d3a8')
    for (z,w,y),(q,v,b) in zip(sections,sections[1:]):
        face(m,[(-w*.55,y,z),(w*.55,y,z),(v*.55,b,q),(-v*.55,b,q)],3,'#c7b18a',True)
    face(m,[(-.46,.61,-1.6),(.46,.61,-1.6),(.25,.25,-1.6),(-.25,.25,-1.6)],14, double=True)
    for z in (-.8,.4):m.box(0,.56,z,1.12,.08,.28,3)
    m.box(0,.56,-1.65,.29,.31,.24,6,'#5d7774')
    m.rod((0,.40,-1.71),(0,.08,-1.71),.04,6)
    if m.detail<2:
        for x in (-.18,.18):
            m.rod((x,.72,-.6),(x,.72,1.24),.025,3)
            m.box(x,.72,1.11,.17,.035,.36,3)
        loop(m,.15,.31,-.26,.21,.017,13)
        m.cable((.05,.63,1.5),(.5,.07,2),.08,'#c4b690')


def boardwalk(m):
    n=16 if m.detail==0 else 10 if m.detail==1 else 6
    for i in range(n):m.box(0,.17,-i*4.0/n,1.85,.11,4.0/n-.02,3)
    for x in (-.78,.78):
        m.box(x,.09,-1.88,.12,.18,4.25,3)
        for z in (-.15,-1.9,-3.7):
            m.rod((x,0,z),(x,.85,z),.045,3)
        m.cable((x,.73,-.15),(x,.73,-1.9),.11,'#d4c39b')
        m.cable((x,.73,-1.9),(x,.73,-3.7),.11,'#d4c39b')
    m.box(1.17,.5,-1.6,.38,.85,.38,3,'#8fbcb0')
    m.box(1.17,.95,-1.6,.41,.05,.41,6)


def shoreline(m):
    # Static, opaque water and wave bands; no animated shader or translucent sorting.
    m.box(0,-.16,-10.25,31.5,.28,11.5,0)
    m.box(0,-.095,-16.3,34,.11,1.5,0,'#c3baa0')
    m.box(0,-.17,-25,36,.12,19,9,'#98d5d4')
    strips=5 if m.detail<2 else 2
    segments=44 if m.detail==0 else 24 if m.detail==1 else 12
    for j in range(strips):
        for i in range(segments):
            x=-17+i*34/segments;q=-17+(i+1)*34/segments
            z=-16.1-j*.48+math.sin(x*.57+j)*.16;b=-16.1-j*.48+math.sin(q*.57+j)*.16
            width=.10 if j==0 else .04
            face(m,[(x,-.015-j*.005,z),(q,-.015-j*.005,b),(q,-.015-j*.005,b-width),(x,-.015-j*.005,z-width)],5,'#f5e8c4')
    # Original wave paving promenade at the back of the beach.
    m.box(0,.025,-13.8,29.6,.14,1.45,7)
    for i in range(6):m.box(-12.5+i*5,.16,-14.72,3.8,.16,.15,2)


def beach(m):
    shoreline(m)
    for x,z,height,lean in [(-9,-8.4,4.7,.65),(8.9,-8.7,4.9,-.60),(-11.8,-12,5.1,.7),(11.5,-12.4,4.6,-.6),(-4.2,-12.0,4.3,.35),(4.7,-12.2,4.5,-.3)]:
        place(m,lambda n:palm(n,height,lean),x,0,z,rotation=x*.12)
    place(m,kiosk,-6.3,0,-8.1)
    place(m,tower,6.4,0,-8.4,rotation=-.12)
    place(m,goal,0,0,-5.35)
    for x,z,rot in [(-3.6,-10.1,.20),(3.7,-10.5,-.18),(-10.3,-6.9,.4),(10.5,-7.2,-.4)]:place(m,leisure,x,0,z,rotation=rot,scale=.85)
    place(m,boat,8.8,-.02,-14.4,rotation=-.8)
    place(m,boardwalk,-1.8,0,-9.7)
    # Small dunes, driftwood and seashells frame the beach without entering play.
    if m.detail<2:
        for x,z in [(-12,-7.5),(12,-8.5),(-8,-12.3),(7.8,-11.4)]:
            sphere(m,x,-.13,z,1.1,.27,.68,0,'#f1d7a6')
            for j in range(5):m.rod((x+j*.12,0,z),(x+.18+j*.12,.3+j%2*.1,z+.04),.01,11,'#b2bd7d',4)
        m.rod((-11.7,.08,-6.7),(-10.3,.12,-6.5),.075,3,'#c4b58f')
    if m.detail==0:
        rng=random.Random(74)
        for i in range(26):
            x=rng.uniform(-14,14);z=rng.uniform(-12,-5.6)
            sphere(m,x,.01,z,.04,.018,.055,5,'#fbebd0')


def main():
    texture=atlas();assets=[]
    for detail in range(3):
        m=Mesh(detail);beach(m);a=core.export(f'beach-lod{detail}',m,texture)
        a['reviewFrame']={'center':[0,1.5,-9.3],'span':23};assets.append(a)
    for name,fn in [('palm-cluster',lambda m:(palm(m),place(m,lambda n:palm(n,3.8,-.35),1.5,0,-.35))),
                    ('coconut-kiosk',kiosk),('lifeguard-tower',tower),('umbrella-loungers',leisure),
                    ('beach-goal',goal),('fishing-boat',boat),('boardwalk',boardwalk)]:
        m=Mesh();fn(m);assets.append(core.export(name,m,texture))
    manifest={'version':1,'seed':20261019,'units':'metres','up':'+Y','front':'+Z',
              'provenance':'Original procedural artwork created for IQ Apps Group; no downloaded models or photographic textures.',
              'texture':{'file':'beach-atlas.png','width':1024,'height':1024,'colorSpace':'sRGB'},'assets':assets}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(assets,indent=2))


if __name__=='__main__':main()
