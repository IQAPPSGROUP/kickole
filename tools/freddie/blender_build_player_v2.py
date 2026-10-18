import bpy, bmesh, math
from mathutils import Vector
OUT='/workspace/kickole/blender/kickole_v2_raw.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/workspace/kickole/work/Superhero_Male_FullBody.gltf')
arm=bpy.data.objects['Armature']
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath='/workspace/kickole/work/Hair_SimpleParted.gltf')
hair=bpy.data.objects['Hair_SimpleParted']
arm2=[o for o in bpy.data.objects if o.type=='ARMATURE' and o!=arm][0]
mw=hair.matrix_world.copy(); hair.parent=arm; hair.matrix_world=mw
for m in hair.modifiers:
    if m.type=='ARMATURE': m.object=arm
bpy.data.objects.remove(arm2)
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
hair.name='Hair'
body=bpy.data.objects['SuperHero_Male']; body.name='Body'
# hair uses body's hair material
hm=bpy.data.materials['MI_Hair_1']
hair.data.materials.clear(); hair.data.materials.append(hm); hm.name='Hair'
bpy.data.materials['MI_Superhero_Male'].name='Skin'
bpy.data.materials['MI_Eyes'].name='Eyes'
def mat(name,hexc,rough=0.75):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes['Principled BSDF']
    c=[int(hexc[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in c]
    p.inputs['Base Color'].default_value=(*c,1); p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=0
    m.use_backface_culling=False
    return m
M={n:mat(n,c,r) for n,c,r in [('Shirt','#FFD93D',0.8),('Shirt_Trim','#1E2A5A',0.8),('Shorts','#1E2A5A',0.8),('Socks','#FFD93D',0.85),('Boots','#FF4F9A',0.5),('Boots_Sole','#222831',0.7)]}

def dup(src,name,ratio=None):
    o=src.copy(); o.data=src.data.copy(); o.name=name; o.data.name=name
    bpy.context.collection.objects.link(o)
    bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=0.0005); bm.to_mesh(o.data); bm.free()
    if ratio:
        d=o.modifiers.new('dc','DECIMATE'); d.ratio=ratio; o.modifiers.move(len(o.modifiers)-1,0)
        with bpy.context.temp_override(object=o,active_object=o): bpy.ops.object.modifier_apply(modifier='dc')
    return o
def bm_of(o):
    bm=bmesh.new(); bm.from_mesh(o.data); return bm
def bisect(bm,co,no,clear=True,geomfilter=None):
    geom=bm.verts[:]+bm.edges[:]+bm.faces[:]
    if geomfilter:
        fs=[f for f in bm.faces if geomfilter(f.calc_center_median())]
        es=set(e for f in fs for e in f.edges); vs=set(v for f in fs for v in f.verts)
        geom=list(vs)+list(es)+fs
    r=bmesh.ops.bisect_plane(bm,geom=geom,plane_co=co,plane_no=no,clear_outer=clear)
    return r
def loose_cleanup(bm,minfaces=30):
    # remove small disconnected islands
    seen=set()
    for f in bm.faces[:]:
        if f in seen or not f.is_valid: continue
        isl=[];st=[f];seen.add(f)
        while st:
            x=st.pop();isl.append(x)
            for e in x.edges:
                for g in e.link_faces:
                    if g not in seen: seen.add(g);st.append(g)
        if len(isl)<minfaces: bmesh.ops.delete(bm,geom=isl,context='FACES')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
def offset(bm,fn):
    bm.normal_update()
    for v in bm.verts: v.co+=v.normal*fn(v.co)
def finish(o,bm,material):
    bm.to_mesh(o.data); bm.free()
    o.data.materials.clear(); o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth=True

def NECK(y): return 1.505+0.45*(y+0.07)   # neckline height: lower at front (-y)
SLEEVE=0.36; HEM=1.0
# ---------- SHIRT
sh=dup(body,'Shirt',0.6); bm=bm_of(sh)
bisect(bm,(0,0,HEM),(0,0,-1))
bisect(bm,(SLEEVE,0,0),(1,0,0)); bisect(bm,(-SLEEVE,0,0),(-1,0,0))
bisect(bm,(0,-0.07,1.505),Vector((0,-0.45,1)).normalized())
loose_cleanup(bm)
# trim rings: insert loops near neckline and cuffs
bisect(bm,(0,-0.07,1.505-0.022),Vector((0,-0.45,1)).normalized(),clear=False,geomfilter=lambda c:abs(c.x)<0.22)
bisect(bm,(SLEEVE-0.022,0,0),(1,0,0),clear=False); bisect(bm,(-SLEEVE+0.022,0,0),(-1,0,0),clear=False)
def sh_off(c):
    base=0.011
    if c.z<1.15: base+=0.014*(1.15-c.z)/0.15
    return base
for f in bm.faces:
    c=f.calc_center_median()
    f.material_index=1 if ((abs(c.x)<0.2 and c.z> NECK(c.y)-0.012) or abs(c.x)>SLEEVE-0.011) else 0
offset(bm,sh_off)
sh.data.materials.clear(); sh.data.materials.append(M['Shirt']); sh.data.materials.append(M['Shirt_Trim'])
bm.to_mesh(sh.data); bm.free()
for p in sh.data.polygons: p.use_smooth=True
# ---------- SHORTS
SH_BOT=0.70; SH_TOP=1.10
so=dup(body,'Shorts',0.6); bm=bm_of(so)
bisect(bm,(0,0,SH_BOT),(0,0,-1)); bisect(bm,(0,0,SH_TOP),(0,0,1))
bisect(bm,(0.3,0,0),(1,0,0)); bisect(bm,(-0.3,0,0),(-1,0,0))
loose_cleanup(bm)
def so_off(c):
    b=0.012
    if c.z<0.88: b+=0.022*(0.88-c.z)/0.18
    return b
offset(bm,so_off); finish(so,bm,M['Shorts'])
# ---------- SOCKS
SK_BOT=0.10; SK_TOP=0.47
sk=dup(body,'Socks',0.6); bm=bm_of(sk)
bisect(bm,(0,0,SK_BOT),(0,0,-1)); bisect(bm,(0,0,SK_TOP),(0,0,1))
bisect(bm,(0.3,0,0),(1,0,0)); bisect(bm,(-0.3,0,0),(-1,0,0))
loose_cleanup(bm)
bisect(bm,(0,0,SK_TOP-0.03),(0,0,1),clear=False)
for f in bm.faces: f.material_index=1 if f.calc_center_median().z>SK_TOP-0.03 else 0
offset(bm,lambda c:0.006)
sk.data.materials.clear(); sk.data.materials.append(M['Socks']); sk.data.materials.append(M['Shirt_Trim'])
bm.to_mesh(sk.data); bm.free()
for p in sk.data.polygons: p.use_smooth=True
# ---------- BOOTS (convex hull of inflated foot, remeshed)
BOOT_TOP=0.135
boots=[]
for side,sx in (('L',1),('R',-1)):
    bmb=bm_of(body); bmb.normal_update()
    pts=[v.co+v.normal*0.013 for v in bmb.verts if v.co.z<BOOT_TOP and v.co.x*sx>0.02]
    bmb.free()
    pts=[Vector((p.x,p.y,max(p.z,-0.004))) for p in pts]
    me=bpy.data.meshes.new('Boot_'+side); ob=bpy.data.objects.new('Boot_'+side,me); bpy.context.collection.objects.link(ob)
    bm=bmesh.new()
    for p in pts: bm.verts.new(p)
    bmesh.ops.convex_hull(bm,input=bm.verts[:])
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    bm.to_mesh(me); bm.free()
    bpy.context.view_layer.objects.active=ob
    r=ob.modifiers.new('rm','REMESH'); r.mode='VOXEL'; r.voxel_size=0.007
    s=ob.modifiers.new('sm','SMOOTH'); s.factor=0.8; s.iterations=6
    d=ob.modifiers.new('dc','DECIMATE'); d.ratio=0.15
    with bpy.context.temp_override(object=ob,active_object=ob):
        for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    bm=bm_of(ob); bm.normal_update()
    yc=sum(v.co.y for v in bm.verts)/len(bm.verts)
    bisect(bm,(0,yc,0.118),Vector((0,0.35,1)).normalized())
    loose_cleanup(bm,10)
    bisect(bm,(0,0,0.016),(0,0,1),clear=False)
    finish(ob,bm,M['Boots']); ob.data.materials.append(M['Boots_Sole'])
    for p in ob.data.polygons:
        if p.center.z<0.016: p.material_index=1
    boots.append(ob)
# weights for boots: data transfer from original body
for ob in boots:
    ob.parent=arm
    dt=ob.modifiers.new('dt','DATA_TRANSFER'); dt.object=body; dt.use_vert_data=True; dt.data_types_verts={'VGROUP_WEIGHTS'}
    dt.vert_mapping='POLYINTERP_NEAREST'; dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
    with bpy.context.temp_override(object=ob,active_object=ob):
        bpy.ops.object.datalayout_transfer(modifier='dt')
        bpy.ops.object.modifier_apply(modifier='dt')
    am=ob.modifiers.new('Armature','ARMATURE'); am.object=arm
# join boots
with bpy.context.temp_override(active_object=boots[0],selected_editable_objects=boots,object=boots[0]):
    bpy.ops.object.join()
boots[0].name='Boots'; boots[0].data.name='Boots'
# ---------- delete covered body faces
def covered(c):
    if c.z<0.115: return True                                  # inside boots
    if 0.13<c.z<SK_TOP-0.03 and abs(c.x)<0.3: return True     # socks
    if SH_BOT+0.03<c.z<SH_TOP-0.02 and abs(c.x)<0.3: return True # shorts
    if HEM+0.03<c.z<NECK(c.y)-0.025 and abs(c.x)<SLEEVE-0.035: return True # shirt
    return False
bm=bm_of(body)
bmesh.ops.delete(bm,geom=[f for f in bm.faces if all(covered(v.co) for v in f.verts)],context='FACES')
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bm.to_mesh(body.data); bm.free()
for o in bpy.data.objects:
    if o.type=='MESH': 
        print('TRIS',o.name,sum(len(p.vertices)-2 for p in o.data.polygons))
bpy.ops.wm.save_as_mainfile(filepath='/workspace/kickole/blender/kickole_v2.blend')
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',export_animations=False,export_image_format='AUTO')
