"""Retired arcade-footballer generator.

This used to write public/models/kicky-player-rigged.glb. That file has been
removed. The game uses the Fab players in public/models/. Running this script
stops before it writes anything. The functions below are the old generator.

Contract (see docs/CHARACTER_GLB.md):
  * Units are metres, feet on Z=0 (Y=0 in glTF), about 1.8 m tall. The character faces Blender -Y, which the
    glTF exporter converts to +Z, i.e. towards the game camera.
  * Bones: Hips, Spine, Head, UpperArm_L/R, UpperLeg_L/R, LowerLeg_L/R, Foot_L/R. "_L" is the screen-left side
    (-X), matching the game's left control zone.
  * Materials: Shirt, Shirt_Trim, Shorts, Socks, Boots, Boots_Sole, Skin, Hair (recoloured by skins at runtime).
  * Clips (30 fps, each exported as its own glTF animation): Idle (loop), KickLeft, KickRight, Miss, Celebrate.
    The kick clips reach foot contact at CONTACT_FRAME / 30 = 0.30 s.
  * One skinned mesh with detailed face, boots and kit accents; no textures: mobile friendly.
"""
import sys

sys.stderr.write(
    "generate_kicky_player.py is retired. "
    "public/models/kicky-player-rigged.glb has been removed. "
    "The game uses the Fab players described in public/models/LICENSE.\n"
)
raise SystemExit(0)

import math
import os

import bpy
from mathutils import Vector

FPS = 30
CONTACT_FRAME = 9  # 0.30 s at 30 fps
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models", "kicky-player-rigged.glb")

# Proportions shared with src/scene/pose.ts so the kick IK matches the primitive character.
HIP_Y, THIGH, SHIN = 0.95, 0.42, 0.45
BALL_Z, CONTACT_H = 0.62, 0.72


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def make_material(name, rgb, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True  # the glTF exporter reads the Principled BSDF, not diffuse_color
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*rgb, 1.0)
    return m


def build_armature():
    arm = bpy.data.armatures.new("PlayerArmature")
    obj = bpy.data.objects.new("PlayerArmature", arm)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones

    def bone(name, head, tail, parent=None):
        b = eb.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = eb[parent]
        return b

    bone("Hips", (0, 0, HIP_Y), (0, 0, 1.05))
    bone("Spine", (0, 0, 1.05), (0, 0, 1.50), "Hips")
    bone("Head", (0, 0, 1.50), (0, 0, 1.80), "Spine")
    for s, x in (("L", -1), ("R", 1)):
        bone(f"UpperArm_{s}", (x * 0.26, 0, 1.45), (x * 0.26, 0, 1.00), "Spine")
        bone(f"UpperLeg_{s}", (x * 0.10, 0, HIP_Y), (x * 0.10, 0, HIP_Y - THIGH), "Hips")
        bone(f"LowerLeg_{s}", (x * 0.10, 0, HIP_Y - THIGH), (x * 0.10, 0, HIP_Y - THIGH - SHIN), f"UpperLeg_{s}")
        bone(f"Foot_{s}", (x * 0.10, 0, 0.08), (x * 0.10, -0.16, 0.04), f"LowerLeg_{s}")
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def build_mesh(armature, mats):
    parts = []

    def part(name, shape, loc, scale, mat, bone, rot=(0, 0, 0)):
        if shape == "sphere":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1)
        else:
            bpy.ops.mesh.primitive_cube_add(size=2)
        o = bpy.context.object
        o.name = name
        o.scale = scale
        o.rotation_euler = rot
        o.location = loc
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        for p in o.data.polygons:
            p.use_smooth = shape == "sphere"
        o.data.materials.append(mats[mat])
        vg = o.vertex_groups.new(name=bone)
        vg.add([v.index for v in o.data.vertices], 1.0, "REPLACE")
        parts.append(o)

    part("Torso", "sphere", (0, 0, 1.25), (0.21, 0.14, 0.30), "Shirt", "Spine")
    part("ShirtTrim", "cube", (0, -0.135, 1.27), (0.05, 0.012, 0.25), "Shirt_Trim", "Spine")
    part("Shorts", "sphere", (0, 0, 0.98), (0.21, 0.15, 0.15), "Shorts", "Hips")
    part("Neck", "sphere", (0, 0, 1.56), (0.06, 0.06, 0.07), "Skin", "Head")
    part("Head", "sphere", (0, 0, 1.67), (0.17, 0.16, 0.17), "Skin", "Head")
    part("Hair", "sphere", (0, 0.025, 1.74), (0.18, 0.17, 0.12), "Hair", "Head")
    part("EyeL", "sphere", (-0.06, -0.15, 1.69), (0.02, 0.015, 0.025), "Hair", "Head")
    part("EyeR", "sphere", (0.06, -0.15, 1.69), (0.02, 0.015, 0.025), "Hair", "Head")
    for s, x in (("L", -1), ("R", 1)):
        part(f"Sleeve_{s}", "sphere", (x * 0.27, 0, 1.38), (0.075, 0.075, 0.09), "Shirt", f"UpperArm_{s}")
        part(f"Arm_{s}", "sphere", (x * 0.27, 0, 1.17), (0.055, 0.055, 0.19), "Skin", f"UpperArm_{s}")
        part(f"Thigh_{s}", "sphere", (x * 0.10, 0, 0.80), (0.095, 0.095, 0.22), "Shorts", f"UpperLeg_{s}")
        part(f"Sock_{s}", "sphere", (x * 0.10, 0, 0.32), (0.065, 0.065, 0.24), "Socks", f"LowerLeg_{s}")
        part(f"Boot_{s}", "sphere", (x * 0.10, -0.06, 0.06), (0.065, 0.14, 0.06), "Boots", f"Foot_{s}")
        part(f"Sole_{s}", "cube", (x * 0.10, -0.06, 0.012), (0.062, 0.14, 0.012), "Boots_Sole", f"Foot_{s}")

    # Premium arcade detailing: all pieces follow their parent bones and reuse
    # the eight contract materials, so recolouring and the rig remain unchanged.
    # Facial features stay above the contact foot silhouette on small screens.
    part("HairFringe", "sphere", (0, -0.116, 1.773), (0.16, 0.075, 0.044), "Hair", "Head")
    for s, x in (("L", -1), ("R", 1)):
        part(f"Brow_{s}", "sphere", (x * 0.064, -0.157, 1.719),
             (0.044, 0.014, 0.012), "Hair", "Head")
        part(f"Cheek_{s}", "sphere", (x * 0.103, -0.124, 1.643),
             (0.034, 0.018, 0.027), "Skin", "Head")
        part(f"ShirtShoulder_{s}", "sphere", (x * 0.174, -0.012, 1.454),
             (0.066, 0.09, 0.045), "Shirt_Trim", "Spine")
        part(f"SleeveCuff_{s}", "sphere", (x * 0.27, -0.005, 1.306),
             (0.077, 0.077, 0.022), "Shirt_Trim", f"UpperArm_{s}")
        part(f"ShortHem_{s}", "sphere", (x * 0.10, -0.005, 0.701),
             (0.099, 0.099, 0.021), "Shirt_Trim", f"UpperLeg_{s}")
        part(f"SockStripe_{s}", "sphere", (x * 0.10, -0.003, 0.463),
             (0.068, 0.068, 0.016), "Shirt_Trim", f"LowerLeg_{s}")
        part(f"BootTongue_{s}", "sphere", (x * 0.10, -0.125, 0.106),
             (0.047, 0.055, 0.014), "Boots_Sole", f"Foot_{s}")
        for lace in range(3):
            part(f"Lace_{s}_{lace}", "cube",
                 (x * 0.10, -0.115 + lace * 0.029, 0.121 - lace * 0.006),
                 (0.036, 0.006, 0.004), "Boots_Sole", f"Foot_{s}")
        for stud in (-0.041, 0.041):
            part(f"Stud_{s}_{stud:+.2f}", "sphere",
                 (x * 0.10 + stud, -0.108, 0.007),
                 (0.014, 0.017, 0.007), "Boots_Sole", f"Foot_{s}")

    part("Nose", "sphere", (0, -0.169, 1.663),
         (0.031, 0.034, 0.033), "Skin", "Head")
    part("Mouth", "sphere", (0, -0.164, 1.603),
         (0.049, 0.012, 0.009), "Hair", "Head")
    part("Collar", "sphere", (0, -0.013, 1.493),
         (0.112, 0.107, 0.022), "Shirt_Trim", "Spine")

    # Add expressive ears and stronger boot silhouettes, bound to existing bones.
    for s, x in (("L", -1), ("R", 1)):
        part(f"Ear_{s}", "sphere", (x * 0.172, -0.006, 1.658),
             (0.033, 0.043, 0.054), "Skin", "Head")
        part(f"BootHeel_{s}", "sphere", (x * 0.10, 0.055, 0.059),
             (0.064, 0.037, 0.045), "Boots_Sole", f"Foot_{s}")
        part(f"BootToeCap_{s}", "sphere", (x * 0.10, -0.171, 0.054),
             (0.060, 0.029, 0.037), "Boots_Sole", f"Foot_{s}")

    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    mesh = bpy.context.object
    mesh.name = "Player"
    mesh.parent = armature
    mod = mesh.modifiers.new("Armature", "ARMATURE")
    mod.object = armature
    return mesh


def solve_leg(target_y, target_z):
    """Same two-bone IK as src/scene/pose.ts: returns (thigh pitch forward, knee bend)."""
    d = max(0.05, HIP_Y - target_y)
    big_d = min(math.hypot(target_z, d), THIGH + SHIN - 0.005)
    interior = math.acos(max(-1, min(1, (THIGH**2 + SHIN**2 - big_d**2) / (2 * THIGH * SHIN))))
    alpha = math.acos(max(-1, min(1, (THIGH**2 + big_d**2 - SHIN**2) / (2 * THIGH * big_d))))
    return math.atan2(target_z, d) + alpha, math.pi - interior


BONES = ["Hips", "Spine", "Head", "UpperArm_L", "UpperArm_R", "UpperLeg_L", "UpperLeg_R", "LowerLeg_L", "LowerLeg_R", "Foot_L", "Foot_R"]
# Pose channels are (x, y, z) euler offsets in bone-local space. For the downward limb bones: -X swings forward,
# +X bends the knee back, +Z swings the limb out to the character's left/-X side (so mirror for the right side).
REST_ARM = 0.22


def kick_pose(side, amount, wind=0.0, follow=0.0):
    """Pose dict for a kick. amount=1 is foot contact, wind>0 pulls the foot back, follow raises it after contact."""
    thigh, knee = solve_leg(CONTACT_H - 0.17 + follow * 0.18, BALL_Z - 0.2 + follow * 0.09)
    other = "R" if side == "L" else "L"
    p = {
        f"UpperLeg_{side}": (-thigh * amount + 0.45 * wind, 0, 0),
        f"LowerLeg_{side}": (knee * amount + 1.0 * wind, 0, 0),
        "Spine": (0.12 * amount, 0, 0.05 * amount * (1 if side == "L" else -1)),
        "Hips": (0, 0, 0),
        f"UpperArm_{other}": (0, 0, (REST_ARM + 0.35 * amount) * (1 if other == "L" else -1)),
    }
    return p


def build_actions(armature):
    pose = armature.pose
    for name in BONES:
        pose.bones[name].rotation_mode = "XYZ"
    armature.animation_data_create()

    def apply(frame, data, hips_z=0.0):
        for name in BONES:
            pb = pose.bones[name]
            rot = list(data.get(name, (0, 0, 0)))
            if name.startswith("UpperArm_") and name not in data:
                rot = [0, 0, REST_ARM * (1 if name.endswith("_L") else -1)]
            pb.rotation_euler = rot
            pb.keyframe_insert("rotation_euler", frame=frame)
        hips = pose.bones["Hips"]
        hips.location = (0, 0, hips_z)
        hips.keyframe_insert("location", frame=frame)

    def clip(name, keys):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        armature.animation_data.action = act
        for frame, data, hz in keys:
            apply(frame, data, hz)
        return act

    arm_up = lambda a: {"UpperArm_L": (0, 0, a), "UpperArm_R": (0, 0, -a)}

    clip("Idle", [
        (0, {"Spine": (0.02, 0, 0)}, 0.0),
        (30, {"Spine": (0.04, 0, 0), "Head": (-0.02, 0, 0)}, 0.012),
        (60, {"Spine": (0.02, 0, 0)}, 0.0),
    ])
    for side in ("L", "R"):
        name = "KickLeft" if side == "L" else "KickRight"
        clip(name, [
            (0, kick_pose(side, 0), 0.0),
            (5, kick_pose(side, 0, wind=1.0), -0.02),
            (CONTACT_FRAME, kick_pose(side, 1.0, follow=0.35), -0.03),
            (13, kick_pose(side, 1.0, follow=1.0), -0.03),
            (24, kick_pose(side, 0), 0.0),
        ])
    clip("Miss", [
        (0, {}, 0.0),
        (10, {"Spine": (0.35, 0, 0), "Head": (0.5, 0, 0), "UpperArm_L": (0.2, 0, 0.05), "UpperArm_R": (0.2, 0, -0.05)}, -0.04),
        (45, {"Spine": (0.32, 0, 0), "Head": (0.55, 0, 0), "UpperArm_L": (0.2, 0, 0.05), "UpperArm_R": (0.2, 0, -0.05)}, -0.04),
    ])
    clip("Celebrate", [
        (0, {}, 0.0),
        (9, {**arm_up(2.7), "Spine": (-0.1, 0, 0), "Head": (-0.15, 0, 0)}, 0.10),
        (18, {**arm_up(2.5), "Spine": (-0.05, 0, 0)}, 0.0),
        (27, {**arm_up(2.7), "Spine": (-0.1, 0, 0)}, 0.08),
        (36, {}, 0.0),
    ])
    armature.animation_data.action = None
    return [a for a in bpy.data.actions]


def export():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    scn = bpy.context.scene
    scn.frame_start, scn.frame_end = 0, 60
    bpy.context.view_layer.objects.active = bpy.data.objects["PlayerArmature"]
    kwargs = dict(
        filepath=OUT, export_format="GLB", export_animations=True, export_cameras=False, export_lights=False,
        export_apply=False, export_yup=True, export_image_format="NONE",
    )
    # Blender 3.6 has no export_animation_mode; 4.x/5.x do. ACTIONS exports every action as its own animation.
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    if "export_animation_mode" in props:
        kwargs["export_animation_mode"] = "ACTIONS"
    if "export_force_sampling" in props:
        kwargs["export_force_sampling"] = True
    if "export_nla_strips" in props and "export_animation_mode" not in props:
        kwargs["export_nla_strips"] = False
    bpy.ops.export_scene.gltf(**kwargs)


def main():
    reset_scene()
    mats = {
        "Skin": make_material("Skin", (0.55, 0.32, 0.2), 0.8),
        "Shirt": make_material("Shirt", (0.07, 0.75, 0.65)),
        "Shirt_Trim": make_material("Shirt_Trim", (0.9, 0.9, 0.85)),
        "Shorts": make_material("Shorts", (0.02, 0.07, 0.09)),
        "Socks": make_material("Socks", (0.07, 0.75, 0.65)),
        "Boots": make_material("Boots", (0.9, 0.95, 0.2), 0.5),
        "Boots_Sole": make_material("Boots_Sole", (0.9, 0.9, 0.85), 0.6),
        "Hair": make_material("Hair", (0.06, 0.03, 0.02), 0.9),
    }
    arm = build_armature()
    build_mesh(arm, mats)
    acts = build_actions(arm)
    print("actions:", [a.name for a in acts])
    export()
    print("Exported", os.path.normpath(OUT))


if __name__ == "__main__":
    sys.stderr.write(
        "generate_kicky_player.py is retired. "
        "public/models/kicky-player-rigged.glb has been removed. "
        "The game uses the Fab players described in public/models/LICENSE.\n"
    )
    raise SystemExit(0)
