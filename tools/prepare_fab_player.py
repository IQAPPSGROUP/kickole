"""Prepare the purchased Fab footballers for the game contract.

Fab Standard licence, Personal tier, licensed to Rob Stancombe t/a IQ Apps Group.
The raw download is not in this repository. Point FAB_PLAYER_SRC at the folder
that contains source_4.zip (male, Godot rig) and source.zip (female, FBX rig):

    FAB_PLAYER_SRC=/path/to/kickole-fab-models blender --background --python tools/prepare_fab_player.py

Writes intermediate GLBs (arms posed down on the full rig, then reduced to the
contract bones) to $FAB_PREP_DIR (default /tmp/fab/prepared).
tools/build_fab_player.ts turns those into the runtime GLBs. Do not commit
the zips, FBX files, or these intermediates.
"""
from __future__ import annotations

import os
import sys
import zipfile
from collections import defaultdict

import bpy
from mathutils import Matrix, Vector

SRC = os.environ.get("FAB_PLAYER_SRC", "/cursor/stores/bot/kickole-fab-models")
OUT = os.environ.get("FAB_PREP_DIR", "/tmp/fab/prepared")
os.makedirs(OUT, exist_ok=True)

# Anatomical left is +X while the character faces Blender -Y (glTF +Z).
# The game's _L is world -X, so source left becomes _R.
MALE_KEEP = {
    "Hips": "Hips",
    "Spine": "Spine",
    "Chest": "Spine2",
    "Neck": "Neck",
    "Head": "Head",
    "LeftUpperArm": "UpperArm_R",
    "LeftLowerArm": "LowerArm_R",
    "LeftHand": "Hand_R",
    "RightUpperArm": "UpperArm_L",
    "RightLowerArm": "LowerArm_L",
    "RightHand": "Hand_L",
    "LeftUpperLeg": "UpperLeg_R",
    "LeftLowerLeg": "LowerLeg_R",
    "LeftFoot": "Foot_R",
    "LeftToes": "Toe_R",
    "RightUpperLeg": "UpperLeg_L",
    "RightLowerLeg": "LowerLeg_L",
    "RightFoot": "Foot_L",
    "RightToes": "Toe_L",
}
FEMALE_KEEP = {
    "root.x": "Hips",
    "spine_01.x": "Spine",
    "spine_02.x": "Spine2",
    "neck.x": "Neck",
    "head.x": "Head",
    "arm_stretch.l": "UpperArm_R",
    "forearm_stretch.l": "LowerArm_R",
    "hand.l": "Hand_R",
    "arm_stretch.r": "UpperArm_L",
    "forearm_stretch.r": "LowerArm_L",
    "hand.r": "Hand_L",
    "thigh_stretch.l": "UpperLeg_R",
    "leg_stretch.l": "LowerLeg_R",
    "foot.l": "Foot_R",
    "toes_01.l": "Toe_R",
    "thigh_stretch.r": "UpperLeg_L",
    "leg_stretch.r": "LowerLeg_L",
    "foot.r": "Foot_L",
    "toes_01.r": "Toe_L",
}


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def ensure_extract(zip_name: str, dest: str) -> None:
    marker = os.path.join(dest, ".ok")
    if os.path.exists(marker):
        return
    os.makedirs(dest, exist_ok=True)
    with zipfile.ZipFile(os.path.join(SRC, zip_name)) as archive:
        archive.extractall(dest)
    open(marker, "w").close()


def armature():
    arms = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    if len(arms) != 1:
        raise RuntimeError(f"expected one armature, found {[a.name for a in arms]}")
    return arms[0]


def meshes():
    return [obj for obj in bpy.data.objects if obj.type == "MESH" and len(obj.data.polygons) > 40 and not obj.name.startswith("Icosphere")]


def base_color_image(mat: bpy.types.Material):
    if not mat or not mat.use_nodes:
        return None
    for link in mat.node_tree.links:
        if link.to_node.type == "BSDF_PRINCIPLED" and link.to_socket.name == "Base Color" and link.from_node.type == "TEX_IMAGE":
            return link.from_node.image
    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            return node.image
    return None


def nearest_keep(arm, name: str, keep: dict[str, str]) -> str | None:
    bones = arm.data.bones
    if name not in bones:
        return "Hips" if "Hips" in keep.values() or any(v == "Hips" for v in keep.values()) else None
    bone = bones[name]
    while bone is not None:
        if bone.name in keep:
            return keep[bone.name]
        bone = bone.parent
    return "Hips"


def pose_arms_down(arm) -> None:
    """Hang the arms while the shoulder and twist bones still exist, then bake that into the mesh."""
    names = {bone.name for bone in arm.pose.bones}
    if "LeftUpperArm" in names:
        pairs = [("LeftUpperArm", "LeftLowerArm", "LeftHand", 1.0), ("RightUpperArm", "RightLowerArm", "RightHand", -1.0)]
    elif "arm_stretch.l" in names:
        pairs = [("arm_stretch.l", "forearm_stretch.l", "hand.l", 1.0), ("arm_stretch.r", "forearm_stretch.r", "hand.r", -1.0)]
    else:
        raise RuntimeError(f"no arm bones in {sorted(names)[:12]}")
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in arm.pose.bones:
        for constraint in list(pose_bone.constraints):
            pose_bone.constraints.remove(constraint)
    for upper, lower, hand, sign in pairs:
        bone = arm.pose.bones[upper]
        child = arm.pose.bones[lower]
        direction = child.head - bone.head
        target = Vector((sign * 0.25, 0.04, -1.0))
        turn = direction.normalized().rotation_difference(target.normalized())
        head = bone.matrix.to_translation()
        bone.matrix = Matrix.Translation(head) @ turn.to_matrix().to_4x4() @ Matrix.Translation(-head) @ bone.matrix
        bpy.context.view_layer.update()
        forearm = arm.pose.bones[lower]
        palm = arm.pose.bones[hand]
        along = palm.head - forearm.head
        axis = along.cross(Vector((0.0, -1.0, 0.0)))
        if axis.length > 1e-6:
            bend = Matrix.Rotation(0.35, 4, axis)
            origin = forearm.matrix.to_translation()
            forearm.matrix = Matrix.Translation(origin) @ bend @ Matrix.Translation(-origin) @ forearm.matrix
            bpy.context.view_layer.update()
        world = arm.matrix_world @ arm.pose.bones[hand].head
        print("posed", hand, tuple(round(v, 3) for v in world))
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in meshes():
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for mod in list(obj.modifiers):
            if mod.type == "ARMATURE":
                bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply()
    bpy.ops.object.mode_set(mode="OBJECT")


def retarget_weights(arm, keep: dict[str, str]) -> None:
    for obj in meshes():
        grouped: list[dict[str, float]] = [defaultdict(float) for _ in obj.data.vertices]
        for vertex in obj.data.vertices:
            for group in vertex.groups:
                src = obj.vertex_groups[group.group].name
                dest = nearest_keep(arm, src, keep)
                if dest is None or group.weight <= 0:
                    continue
                grouped[vertex.index][dest] += group.weight
        for group in list(obj.vertex_groups):
            obj.vertex_groups.remove(group)
        created: dict[str, bpy.types.VertexGroup] = {}
        for index, weights in enumerate(grouped):
            ranked = sorted(weights.items(), key=lambda item: -item[1])[:4]
            total = sum(weight for _, weight in ranked)
            if total <= 1e-8:
                dest = "Hips"
                ranked = [(dest, 1.0)]
                total = 1.0
            for name, weight in ranked:
                if name not in created:
                    created[name] = obj.vertex_groups.new(name=name)
                created[name].add([index], weight / total, "REPLACE")
        print(obj.name, "groups", sorted(created))


def delete_extra_bones(arm, keep: dict[str, str]) -> None:
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    keep_src = set(keep)
    for bone in list(arm.data.edit_bones):
        if bone.name not in keep_src:
            arm.data.edit_bones.remove(bone)
    for bone in arm.data.edit_bones:
        bone.name = keep[bone.name]
    bpy.ops.object.mode_set(mode="OBJECT")
    print("bones", [b.name for b in arm.data.bones])


def pixel_buffer(image):
    w, h = image.size
    pixels = list(image.pixels)
    return w, h, pixels


def sample(buf, u: float, v: float):
    w, h, pixels = buf
    x = max(0, min(w - 1, int(u * (w - 1))))
    y = max(0, min(h - 1, int(v * (h - 1))))
    i = (y * w + x) * 4
    return pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]


def face_uv(obj, poly):
    uv = obj.data.uv_layers.active
    if uv is None:
        return 0.5, 0.5
    acc = Vector((0, 0))
    for loop in poly.loop_indices:
        acc += uv.data[loop].uv
    acc /= max(1, len(poly.loop_indices))
    return acc.x, acc.y


def make_material(name: str, image, alpha: str) -> bpy.types.Material:
    # Keep one glTF material per role and source image. The runtime builder
    # atlases every `Role@@image` back into a single Role material.
    tag = "none" if image is None else image.name
    name = f"{name}@@{tag}"
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = "BLEND" if alpha == "BLEND" else "OPAQUE"
    mat.use_backface_culling = False
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.45 if name != "Boots" else 0.4
    bsdf.inputs["Metallic"].default_value = 0.0
    if image is not None:
        tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        image.colorspace_settings.name = "sRGB"
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha == "BLEND":
            mat.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    colors = {
        "Skin": (0.8, 0.62, 0.5, 1),
        "Hair": (0.15, 0.1, 0.08, 1),
        "Eyes": (0.9, 0.9, 0.95, 1),
        "InnerMouth": (0.55, 0.2, 0.22, 1),
        "Shirt": (0.95, 0.82, 0.2, 1),
        "Shirt_Trim": (0.1, 0.16, 0.4, 1),
        "Shorts": (0.1, 0.16, 0.4, 1),
        "Socks": (0.92, 0.93, 0.95, 1),
        "Boots": (0.12, 0.12, 0.12, 1),
        "Boots_Sole": (0.05, 0.05, 0.05, 1),
    }
    mat.diffuse_color = colors.get(name, (1, 1, 1, 1))
    return mat


def assign_faces(obj, buckets: dict[str, list[int]], images: dict[str, object], alpha: dict[str, str]) -> None:
    obj.data.materials.clear()
    index: dict[str, int] = {}
    for name, faces in buckets.items():
        if not faces:
            continue
        mat = make_material(name, images.get(name), alpha.get(name, "OPAQUE"))
        obj.data.materials.append(mat)
        index[name] = len(obj.material_slots) - 1
    for name, faces in buckets.items():
        if name not in index:
            continue
        slot = index[name]
        for face in faces:
            obj.data.polygons[face].material_index = slot


def kind_present(buckets: dict[str, list[int]], *names: str) -> bool:
    return any(buckets.get(name) for name in names)


def face_neighbors(obj) -> dict[int, set[int]]:
    edges: dict[tuple[int, int], list[int]] = defaultdict(list)
    for poly in obj.data.polygons:
        for key in poly.edge_keys:
            edges[key].append(poly.index)
    neighbors: dict[int, set[int]] = defaultdict(set)
    for faces in edges.values():
        if len(faces) == 2:
            neighbors[faces[0]].add(faces[1])
            neighbors[faces[1]].add(faces[0])
    return neighbors


def smooth_regions(obj, buckets: dict[str, list[int]], names: set[str]) -> dict[str, list[int]]:
    """Drop one-triangle spikes so a tint cannot speckle the neighbouring piece."""
    neighbors = face_neighbors(obj)
    owner: dict[int, str] = {}
    for name, faces in buckets.items():
        for face in faces:
            owner[face] = name
    for _ in range(5):
        updated = dict(owner)
        for face, name in owner.items():
            if name not in names:
                continue
            votes: dict[str, int] = defaultdict(int)
            for other in neighbors.get(face, ()):
                other_name = owner.get(other)
                if other_name in names:
                    votes[other_name] += 1
            if not votes:
                continue
            best = max(votes, key=votes.get)
            if best != name and votes[best] >= 2 and votes[best] > votes.get(name, 0):
                updated[face] = best
        owner = updated
    cleaned: dict[str, list[int]] = defaultdict(list)
    for face, name in owner.items():
        cleaned[name].append(face)
    return cleaned


def add_clean_trim(obj, buckets: dict[str, list[int]]) -> dict[str, list[int]]:
    """Collar trim is only triangles that sit entirely above the neckline."""
    shirt = list(buckets.get("Shirt") or [])
    if len(shirt) < 40:
        return buckets
    world = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    top = max(max(world[index].z for index in obj.data.polygons[face].vertices) for face in shirt)
    cut = top - 0.04
    trim: list[int] = []
    keep: list[int] = []
    for face in shirt:
        poly = obj.data.polygons[face]
        zs = [world[index].z for index in poly.vertices]
        xs = [abs(world[index].x) for index in poly.vertices]
        if min(zs) >= cut and max(xs) < 0.14:
            trim.append(face)
        else:
            keep.append(face)
    if len(trim) < 16:
        return buckets
    buckets = dict(buckets)
    buckets["Shirt"] = keep
    buckets["Shirt_Trim"] = list(buckets.get("Shirt_Trim") or []) + trim
    return buckets


def classify_body(obj, role: str, split_eyes: bool, crown_hair: bool = False) -> None:
    """role is head, cloth, limbs, hands, shorts, shirt, eyes, mouth."""
    image = None
    if obj.material_slots and obj.material_slots[0].material:
        image = base_color_image(obj.material_slots[0].material)
    # TORSO has two slots. Pick per face below.
    images_by_slot = []
    for slot in obj.material_slots:
        images_by_slot.append(base_color_image(slot.material) if slot.material else None)
    bufs = {}
    for img in images_by_slot:
        if img and img.name not in bufs:
            bufs[img.name] = pixel_buffer(img)

    buckets: dict[str, list[int]] = defaultdict(list)
    tex_for: dict[str, object] = {}

    def remember(name: str, img):
        if img is not None and name not in tex_for:
            tex_for[name] = img

    zs = [(obj.matrix_world @ poly.center).z for poly in obj.data.polygons]
    z0, z1 = (min(zs), max(zs)) if zs else (0, 1)
    head_z = []
    for poly in obj.data.polygons:
        slot_name = ""
        if obj.material_slots:
            slot_mat = obj.material_slots[poly.material_index].material
            slot_name = slot_mat.name if slot_mat else ""
        if slot_name in ("HEAD", "HEAD.001") or role == "head":
            head_z.append((obj.matrix_world @ poly.center).z)
    hz0, hz1 = (min(head_z), max(head_z)) if head_z else (z0, z1)
    for poly in obj.data.polygons:
        center = obj.matrix_world @ poly.center
        img = images_by_slot[poly.material_index] if images_by_slot else None
        slot_name = ""
        if obj.material_slots:
            slot_mat = obj.material_slots[poly.material_index].material
            slot_name = slot_mat.name if slot_mat else ""
        kind = role
        if slot_name in ("HEAD", "HEAD.001") or role == "head":
            kind = "head"
        elif slot_name == "CLOTHING" or role == "cloth":
            kind = "cloth"
        elif slot_name == "EYES" or role == "eyes":
            kind = "eyes"
        elif "InnerMouth" in slot_name or "Mouth" in slot_name or role == "mouth":
            kind = "mouth"
        elif role == "limbs":
            kind = "limbs"

        if kind == "eyes":
            buckets["Eyes"].append(poly.index)
            remember("Eyes", img)
            continue
        if kind == "mouth":
            buckets["InnerMouth"].append(poly.index)
            remember("InnerMouth", img)
            continue
        if kind == "head":
            u, v = face_uv(obj, poly)
            lum = 0.5
            if img is not None and img.name in bufs:
                r, g, b, _a = sample(bufs[img.name], u, v)
                lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            # The face photograph stays on Skin, including beard, brows and neck.
            # Only the scalp, behind the face, becomes Hair, so a dark tint cannot
            # paint a mask across the cheeks.
            front = center.y < -0.02
            back = center.y > 0.02
            scalp = center.z > z0 + (z1 - z0) * 0.72
            eye_band = z0 + (z1 - z0) * 0.55 < center.z < z0 + (z1 - z0) * 0.82
            if split_eyes and front and eye_band and 0.012 < abs(center.x) < 0.075 and lum > 0.55:
                buckets["Eyes"].append(poly.index)
                remember("Eyes", img)
            elif crown_hair and center.z > hz0 + (hz1 - hz0) * 0.82 and -0.02 < center.y < 0.03:
                # Crown only. The photographed face and the back of the skull stay Skin.
                buckets["Hair"].append(poly.index)
                remember("Hair", img)
            elif (not crown_hair) and back and scalp:
                buckets["Hair"].append(poly.index)
                remember("Hair", img)
            else:
                buckets["Skin"].append(poly.index)
                remember("Skin", img)
            continue
        if kind == "cloth":
            # One clothing shell. A face joins shorts only when every vertex is
            # below the hem, so a triangle cannot carry shorts colour up the shirt.
            zs = [(obj.matrix_world @ obj.data.vertices[vi].co).z for vi in poly.vertices]
            name = "Shorts" if max(zs) < 0.98 else "Shirt"
            buckets[name].append(poly.index)
            remember(name, img)
            continue
        if kind == "shirt":
            buckets["Shirt"].append(poly.index)
            remember("Shirt", img)
            continue
        if kind == "shorts":
            buckets["Shorts"].append(poly.index)
            remember("Shorts", img)
            continue
        if kind == "hands":
            buckets["Skin"].append(poly.index)
            remember("Skin", img)
            continue
        # Limbs: boots, sock cuff, remaining skin. Arms are the high or wide parts.
        lateral = abs(center.x)
        if center.z < 0.115 and lateral < 0.4:
            normal = (obj.matrix_world.to_3x3() @ poly.normal).normalized()
            name = "Boots_Sole" if normal.z < -0.45 else "Boots"
        elif 0.115 <= center.z < 0.40 and lateral < 0.32:
            name = "Socks"
        else:
            name = "Skin"
        buckets[name].append(poly.index)
        remember(name, img)

    alpha = {"Eyes": "BLEND"}
    if kind_present(buckets, "Shirt", "Shorts", "Hair", "Skin", "Eyes"):
        smooth = {"Shirt", "Shorts", "Skin", "Eyes"}
        if not crown_hair:
            smooth.add("Hair")
        buckets = smooth_regions(obj, buckets, smooth)
    if "Shirt" in buckets and buckets["Shirt"]:
        buckets = add_clean_trim(obj, buckets)
        tex_for.setdefault("Shirt_Trim", tex_for.get("Shirt"))
    assign_faces(obj, buckets, tex_for, alpha)
    print(obj.name, {name: len(faces) for name, faces in buckets.items() if faces})


def level_cloth_hem() -> None:
    """Split torso triangles on one horizontal plane and paint each side a single colour.

    A triangle that crosses the waist used to take the shirt tint for its whole face,
    so navy and yellow met on a diagonal. The cut is only the torso: sleeves stay shirt.
    """
    import bmesh

    cut = 0.96
    for obj in meshes():
        def role_of(index: int) -> str:
            if not obj.material_slots:
                return ""
            material = obj.material_slots[index].material
            return material.name.split("@@")[0] if material else ""

        roles = {role_of(poly.material_index) for poly in obj.data.polygons}
        if "Shirt" not in roles or "Shorts" not in roles:
            continue
        world = obj.matrix_world
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.faces.ensure_lookup_table()
        selected = []
        for face in bm.faces:
            if role_of(face.material_index) not in ("Shirt", "Shorts"):
                continue
            points = [world @ vertex.co for vertex in face.verts]
            if max(abs(point.x) for point in points) > 0.27:
                continue
            zs = [point.z for point in points]
            if min(zs) >= cut or max(zs) <= cut:
                continue
            selected.append(face)
        if selected:
            geom = []
            seen: set[int] = set()
            for face in selected:
                geom.append(face)
                for edge in face.edges:
                    if id(edge) not in seen:
                        seen.add(id(edge))
                        geom.append(edge)
                for vertex in face.verts:
                    if id(vertex) not in seen:
                        seen.add(id(vertex))
                        geom.append(vertex)
            local_co = world.inverted() @ Vector((0.0, 0.0, cut))
            local_no = (world.inverted().transposed().to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
            bmesh.ops.bisect_plane(bm, geom=geom, dist=0.0001, plane_co=local_co, plane_no=local_no)
            bm.to_mesh(obj.data)
            print("bisected hem", obj.name, len(selected))
        bm.free()
        obj.data.update()
        shirt_i = next((i for i, slot in enumerate(obj.material_slots) if role_of(i) == "Shirt"), None)
        shorts_i = next((i for i, slot in enumerate(obj.material_slots) if role_of(i) == "Shorts"), None)
        if shirt_i is None or shorts_i is None:
            continue
        moved = 0
        for poly in obj.data.polygons:
            if role_of(poly.material_index) not in ("Shirt", "Shorts"):
                continue
            center = world @ poly.center
            if abs(center.x) > 0.27:
                continue
            target = shirt_i if center.z >= cut else shorts_i
            if poly.material_index != target:
                poly.material_index = target
                moved += 1
        print("level hem", obj.name, moved, "at", cut)


def tuck_shorts_inside_shirt() -> None:
    """The shorts waistband intersects the shirt and reads as navy shards.
    Shorts-only vertices that rise into the shirt are pulled inside the hem.
    Vertices shared with the shirt stay put, so the hem edge itself does not move.
    """
    floor = None
    for obj in meshes():
        for poly in obj.data.polygons:
            slot = obj.material_slots[poly.material_index].material if obj.material_slots else None
            role = slot.name.split("@@")[0] if slot else ""
            if role != "Shirt":
                continue
            for index in poly.vertices:
                z = (obj.matrix_world @ obj.data.vertices[index].co).z
                floor = z if floor is None else min(floor, z)
    if floor is None:
        return
    limit = floor - 0.008
    for obj in meshes():
        world = obj.matrix_world
        inverse = world.inverted()
        roles_for: dict[int, set[str]] = defaultdict(set)
        for poly in obj.data.polygons:
            slot = obj.material_slots[poly.material_index].material if obj.material_slots else None
            role = slot.name.split("@@")[0] if slot else ""
            for index in poly.vertices:
                roles_for[index].add(role)
        moved = 0
        for index, roles in roles_for.items():
            if "Shorts" not in roles or "Shirt" in roles or "Shirt_Trim" in roles:
                continue
            point = world @ obj.data.vertices[index].co
            if point.z <= limit:
                continue
            point.z = limit
            point.x *= 0.94
            point.y *= 0.94
            obj.data.vertices[index].co = inverse @ point
            moved += 1
        if moved:
            obj.data.update()
            print("tucked shorts", obj.name, moved, "below", round(limit, 3))


def prepare(body: str) -> None:
    clear_scene()
    if body == "male":
        path = "/tmp/fab/GODOT RIG.glb"
        if not os.path.exists(path):
            ensure_extract("source_4.zip", "/tmp/fab/male-src")
            path = "/tmp/fab/male-src/GODOT RIG.glb"
        bpy.ops.import_scene.gltf(filepath=path)
        keep = MALE_KEEP
        roles = {
            "ARMS AND LEGS": "limbs",
            "EYES": "eyes",
            "LOWER JAW": "mouth",
            "TONGUE": "mouth",
            "UPPER JAW": "mouth",
            "TORSO": "cloth",
        }
    else:
        dest = "/tmp/fab/b"
        ensure_extract("source.zip", dest)
        bpy.ops.import_scene.fbx(filepath=os.path.join(dest, "NORMAL RIG.fbx"))
        keep = FEMALE_KEEP
        roles = {}
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and (obj.name.startswith("Icosphere") or len(obj.data.polygons) <= 40):
            bpy.data.objects.remove(obj, do_unlink=True)
    arm = armature()
    pose_arms_down(arm)
    retarget_weights(arm, keep)
    delete_extra_bones(arm, keep)
    for obj in meshes():
        role = roles.get(obj.name)
        if role is None:
            # Female FBX names are unstable. Classify from the material image name.
            image = base_color_image(obj.material_slots[0].material) if obj.material_slots and obj.material_slots[0].material else None
            label = (image.name if image else "").upper()
            if "HEAD" in label:
                role = "head"
            elif "SHIRT" in label or "TSHIRT" in label:
                role = "shirt"
            elif "SHORT" in label:
                role = "shorts"
            elif "HAND" in label:
                role = "hands"
            elif "LEG" in label:
                role = "limbs"
            else:
                role = "limbs"
        classify_body(obj, role, split_eyes=body == "female", crown_hair=body == "male")
    tuck_shorts_inside_shirt()
    level_cloth_hem()
    for obj in meshes():
        mods = [m for m in obj.modifiers if m.type == "ARMATURE"]
        if not mods:
            mod = obj.modifiers.new("Armature", "ARMATURE")
            mod.object = arm
        obj.parent = arm
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for obj in meshes():
        obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    out = os.path.join(OUT, f"{body}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_skins=True,
        export_animations=False,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    print("wrote", out)


if __name__ == "__main__":
    bodies = [arg for arg in sys.argv if arg in ("male", "female")] or ["male", "female"]
    for body in bodies:
        prepare(body)
    print("PREPARE DONE")
