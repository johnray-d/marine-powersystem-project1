"""
Marine centrifugal pump sets (Cooling / Fire / Ballast / Bilge) - Blender 4.x/5.x
Generates high-fidelity GLB models into public/ directory.
Axis: shaft along X, up = Z (export_yup=True -> Three.js Y-up).
"""
import bpy, math, os
from mathutils import Euler

script_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
workspace_dir = os.path.abspath(os.path.join(script_dir, '..', '..')) if os.path.basename(script_dir) == 'blender' else os.path.abspath(os.path.join(script_dir, '..'))
public_dir = os.path.join(workspace_dir, 'public', 'models')
os.makedirs(public_dir, exist_ok=True)

EXPORT_DIR = public_dir
AXIS_Z = 0.9  # shaft centerline height
PREVIEW = 'cooling_pump'

VARIANTS = {
    'cooling_pump': dict(casing=(0.55, 0.66, 0.74, 1), motor=(0.30, 0.50, 0.78, 1), blades=5, fins=8),
    'fire_pump':    dict(casing=(0.78, 0.13, 0.10, 1), motor=(0.30, 0.50, 0.78, 1), blades=6, fins=10),
    'ballast_pump': dict(casing=(0.40, 0.52, 0.62, 1), motor=(0.22, 0.58, 0.52, 1), blades=5, fins=8),
    'bilge_pump':   dict(casing=(0.35, 0.45, 0.55, 1), motor=(0.25, 0.45, 0.60, 1), blades=5, fins=8),
}
PARTS = []

def reset():
    PARTS.clear()
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

def material(name, rgba, metal=0.6, rough=0.35):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = rgba
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    if 'Transmission Weight' in bs.inputs:
        bs.inputs['Transmission Weight'].default_value = 0.0
    elif 'Transmission' in bs.inputs:
        bs.inputs['Transmission'].default_value = 0.0
    m.diffuse_color = rgba
    return m

def finish(obj, name, mat, rotating=False, bev=0.01):
    obj.name = name
    obj.data.name = name
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    if bev:
        md = obj.modifiers.new('Bevel', 'BEVEL')
        md.width = bev
        md.segments = 2
        md.limit_method = 'ANGLE'
    obj['rotating'] = bool(rotating)
    PARTS.append(obj)
    return obj

def cyl(name, r, d, loc, mat, axis='X', rotating=False, verts=48, bev=0.01):
    rot = (0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    return finish(bpy.context.object, name, mat, rotating, bev)

def box(name, size, loc, mat, rot=(0, 0, 0), rotating=False, bev=0.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, name, mat, rotating, bev)

def build(cfg):
    skid_m   = material('Skid',   (0.10, 0.18, 0.28, 1), 0.5, 0.5)
    steel_m  = material('Steel',  (0.62, 0.66, 0.70, 1), 0.9, 0.3)
    casing_m = material('Casing', cfg['casing'], 0.7, 0.35)
    motor_m  = material('Motor',  cfg['motor'], 0.6, 0.4)
    dark_m   = material('Dark',   (0.08, 0.10, 0.13, 1), 0.5, 0.5)
    shaft_m  = material('Shaft',  (0.92, 0.56, 0.10, 1), 0.9, 0.25)
    imp_m    = material('Impeller', (0.10, 0.70, 0.64, 1), 0.5, 0.3)
    seal_m   = material('Seal',   (0.85, 0.75, 0.25, 1), 0.8, 0.3)
    Z = AXIS_Z

    # 01 Pump skid
    box('Pump_Skid', (4.6, 1.4, 0.2), (-0.8, 0, 0.1), skid_m)
    box('Pump_Skid_Pedestal', (1.2, 0.8, 0.2), (-2.0, 0, 0.3), skid_m)
    for i, (sx, sy) in enumerate([(-2.9, 0.55), (-2.9, -0.55), (1.3, 0.55), (1.3, -0.55)], 1):
        cyl(f'Skid_Bolt_{i}', 0.05, 0.1, (sx, sy, 0.25), steel_m, axis='Z', verts=6, bev=0)

    # 02 Electric motor (x -2.8 .. -1.2)
    cyl('Motor_Body', 0.5, 1.6, (-2.0, 0, Z), motor_m)
    n = cfg['fins']
    for i in range(n):
        cyl(f'Motor_Cooling_Fin_{i+1}', 0.545, 0.04, (-2.65 + i * 1.3 / (n - 1), 0, Z), motor_m, bev=0.005)
    cyl('Motor_End_Cap', 0.45, 0.12, (-2.86, 0, Z), dark_m)
    box('Motor_Terminal_Box', (0.4, 0.4, 0.3), (-2.0, 0, Z + 0.65), dark_m)

    # 03 Shaft coupling + shaft (rotating, origin on centerline)
    cyl('Shaft_Coupling', 0.17, 0.3, (-1.05, 0, Z), steel_m, rotating=True)
    cyl('Pump_Shaft', 0.09, 1.65, (-0.375, 0, Z), shaft_m, rotating=True)

    # 04 Pump casing (volute) + rear cover
    cyl('Pump_Casing', 0.65, 0.7, (0.35, 0, Z), casing_m, verts=64)
    cyl('Casing_Cover', 0.5, 0.12, (-0.06, 0, Z), casing_m)

    # 05 Impeller (rotating)
    cyl('Impeller_Hub', 0.14, 0.3, (0.4, 0, Z), imp_m, rotating=True)
    nb = cfg['blades']
    for i in range(nb):
        th = 2 * math.pi * i / nb
        rm = Euler((th, 0, 0)).to_matrix() @ Euler((0, 0.55, 0)).to_matrix()
        loc = (0.4, -0.3 * math.sin(th), Z + 0.3 * math.cos(th))
        box(f'Impeller_Blade_{i+1}', (0.14, 0.06, 0.32), loc, imp_m, rot=rm.to_euler(), rotating=True, bev=0.01)

    # 06 Suction / discharge ports
    cyl('Suction_Port', 0.22, 0.6, (1.0, 0, Z), casing_m)
    cyl('Suction_Flange', 0.34, 0.08, (1.34, 0, Z), steel_m)
    cyl('Discharge_Port', 0.2, 0.5, (0.35, 0, Z + 0.8), casing_m, axis='Z')
    cyl('Discharge_Flange', 0.3, 0.08, (0.35, 0, Z + 1.09), steel_m, axis='Z')

    # 07 Shaft seal
    cyl('Shaft_Seal', 0.2, 0.2, (-0.25, 0, Z), seal_m)

def export(key):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    path = os.path.join(EXPORT_DIR, f'marine_{key}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    for o in PARTS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = PARTS[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_extras=True)
    print(f'EXPORTED: {path} ({len(PARTS)} parts)')

for key in sorted(VARIANTS, key=lambda k: k == PREVIEW):
    reset()
    build(VARIANTS[key])
    export(key)

# Also export general fallback marine_pump.glb from cooling pump
fallback_path = os.path.join(EXPORT_DIR, 'marine_pump.glb')
bpy.ops.export_scene.gltf(filepath=fallback_path, export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True, export_extras=True)
print(f'EXPORTED fallback: {fallback_path}')
