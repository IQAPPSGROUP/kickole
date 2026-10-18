"""Generate Kicky's first animated arcade footballer.
Run: blender --background --python tools/generate_kicky_player.py
Output: public/models/kicky-player-rigged.glb
"""
import bpy, math, os
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def mat(name, color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);return m
skin=mat("warm skin",(0.48,.23,.12)); shirt=mat("Brazil yellow",(.95,.65,.035));shorts=mat("deep blue",(.035,.09,.36)); socks=mat("white",(.9,.9,.83));boots=mat("lime boots",(.45,.85,.035));hair=mat("dark hair",(.055,.025,.014))
def part(name, loc, scale, material, parent=None):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=(0,0,0))
 o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
 if parent:o.parent=parent
 o.location=loc
 return o
# Each animated limb is a separate rigid object. This is a lightweight
# articulated character, not a skinned humanoid skeleton.
root=bpy.data.objects.new("PlayerRoot",None);bpy.context.collection.objects.link(root)
part("Torso",(0,0,1.19),(.29,.17,.39),shirt,root)
part("Head",(0,0,1.69),(.18,.17,.21),skin,root)
part("Hair",(0,.01,1.84),(.18,.17,.08),hair,root)
part("Shorts",(0,0,.88),(.27,.19,.18),shorts,root)
parts={}
for side,sign in [("Left",-1),("Right",1)]:
 hip=bpy.data.objects.new(side+"Hip",None);bpy.context.collection.objects.link(hip);hip.parent=root;hip.location=(sign*.145,0,.83)
 part(side+"Leg",(0,0,-.26),(.11,.115,.32),skin,hip)
 part(side+"Sock",(0,0,-.47),(.105,.12,.14),socks,hip)
 part(side+"Boot",(0,-.13,-.59),(.12,.23,.10),boots,hip)
 parts[side+"Hip"]=hip
 shoulder=bpy.data.objects.new(side+"Shoulder",None);bpy.context.collection.objects.link(shoulder);shoulder.parent=root;shoulder.location=(sign*.30,0,1.43)
 part(side+"Arm",(sign*.09,0,-.22),(.10,.105,.28),skin,shoulder)
 parts[side+"Shoulder"]=shoulder
def key(o,frame,rot=None,loc=None):
 if rot is not None:o.rotation_euler=rot;o.keyframe_insert(data_path="rotation_euler",frame=frame)
 if loc is not None:o.location=loc;o.keyframe_insert(data_path="location",frame=frame)
def clip(name,frames,poses):
 # Export separate actions as glTF animations (one action per clip).
 act=bpy.data.actions.new(name);act.use_fake_user=True
 # Blender 4.x action assignment; each object receives an action
 # sharing the clip name with per-object suffix.
 for obj, channel in [(root,"root"),*[(v,k) for k,v in parts.items()]]:
  a=bpy.data.actions.new(name+"__"+channel);a.use_fake_user=True
  obj.animation_data_create();obj.animation_data.action=a
  for frame, data in poses:
   r=data.get(channel,(0,0,0))
   key(obj,frame,rot=r,loc=(0,0,data.get("height",0)) if obj==root else None)
  for fc in a.fcurves:
   for kp in fc.keyframe_points:kp.interpolation="LINEAR"
  # NLA strips are exported as individual animations by glTF exporter.
  track=obj.animation_data.nla_tracks.new();track.name=name
  strip=track.strips.new(name,1,a);strip.action_frame_start=1;strip.action_frame_end=frames
  obj.animation_data.action=None
neutral={}
clip("Idle",48,[(1,{"height":0}),(24,{"height":.025}),(48,{"height":0})])
for side in ("Left","Right"):
 keyname=side+"Hip"
 clip("Kick"+side,24,[(1,{}),(8,{keyname:(-.7,0,0)}),(10,{keyname:(.65,0,0)}),(18,{keyname:(0,0,0)}),(24,{})])
clip("Miss",36,[(1,{}),(12,{"root":(.22,0,0),"LeftShoulder":(-.8,0,0),"RightShoulder":(-.8,0,0)}),(36,{})])
clip("Celebrate",48,[(1,{}),(12,{"height":.13,"LeftShoulder":(0,-1.4,0),"RightShoulder":(0,1.4,0)}),(24,{"height":0,"LeftShoulder":(0,-1.4,0),"RightShoulder":(0,1.4,0)}),(48,{})])
bpy.context.scene.render.fps=30
bpy.context.scene.frame_set(1)
os.makedirs("public/models",exist_ok=True)
bpy.ops.export_scene.gltf(filepath="public/models/kicky-player-rigged.glb",export_format="GLB",export_animations=True,export_nla_strips=True)
print("Exported public/models/kicky-player-rigged.glb")
