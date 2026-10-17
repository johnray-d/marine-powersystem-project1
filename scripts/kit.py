"""
Shared Blender CAD Modeling Kit (kit.py)
Provides standardized primitives, marine PBR materials, procedural grain roughness,
bevel/smooth modifiers, and GLB export helpers for all vessel equipment scripts.
Axis Convention: X = longitudinal/shaft, Y = transverse, Z = vertical up (export_yup=True -> Three.js Y-up).
"""
import bpy  # type: ignore
import math
import os

PARTS = []


def reset_scene():
    """Clear all objects, meshes, and materials from the current Blender scene."""
    PARTS.clear()
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def material(name, rgba, metal=0.6, rough=0.35, coat=0.0):
    """Create a marine Principled BSDF material with optional clearcoat."""
    m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = coat
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.0
        elif "Transmission" in bsdf.inputs:
            bsdf.inputs["Transmission"].default_value = 0.0
    m.diffuse_color = rgba
    return m


def finish(obj, name, mat, rotating=False, bev=0.01, category="Assembly"):
    """Apply smooth shading, bevel modifier, material, and custom metadata properties."""
    obj.name = name
    obj.data.name = name
    if len(obj.data.materials) == 0:
        obj.data.materials.append(mat)
    else:
        obj.data.materials[0] = mat
    for poly in obj.data.polygons:
        poly.use_smooth = True
    if bev and bev > 0:
        md = obj.modifiers.new("Bevel", "BEVEL")
        md.width = bev
        md.segments = 2
        md.limit_method = "ANGLE"
    obj["rotating"] = bool(rotating)
    obj["category"] = str(category)
    PARTS.append(obj)
    return obj


def cyl(name, r, d, loc, mat, axis="X", rotating=False, verts=48, bev=0.01, category="Assembly"):
    """Create a smoothed, beveled cylinder aligned along X, Y, or Z."""
    if axis == "X":
        rot = (0.0, math.pi / 2.0, 0.0)
    elif axis == "Y":
        rot = (math.pi / 2.0, 0.0, 0.0)
    else:
        rot = (0.0, 0.0, 0.0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    return finish(bpy.context.object, name, mat, rotating=rotating, bev=bev, category=category)


def box(name, size, loc, mat, rot=(0.0, 0.0, 0.0), rotating=False, bev=0.015, category="Assembly"):
    """Create a smoothed, beveled box with applied scale."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(obj, name, mat, rotating=rotating, bev=bev, category=category)


def export_glb(filepath, parts=None):
    """Export selected equipment parts to a Y-up GLB with custom properties enabled."""
    target_parts = parts if parts is not None else PARTS
    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in target_parts:
        obj.select_set(True)
    if target_parts:
        bpy.context.view_layer.objects.active = target_parts[0]
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
    )
    print(f"[kit.py] Exported {filepath} ({len(target_parts)} parts)")
