"""Marine electro-hydraulic steering gear. Blender 4.x/5.x.
Run in Blender > Scripting. GLB exports beside this script (or public directory).

Axis: X is the main cylinder line. Z is up. Rudder stock is at the origin.
Units are illustrative meters, not design-certified dimensions.
"""
import bpy, math, os
from mathutils import Vector
from math import sin, cos, pi

script_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
workspace_dir = os.path.abspath(os.path.join(script_dir, '..'))
public_dir = os.path.join(workspace_dir, 'public')
if not os.path.isdir(public_dir):
    public_dir = script_dir

EXPORT_GLB_PATH = os.path.join(public_dir, 'marine_steering_gear.glb')
EXPORT_GLB_ALT = os.path.join(public_dir, 'marine_steering.glb')

# --- CLEAN SCENE ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

PARTS = []

# --- MATERIALS ---
def material(name, rgba, metallic=0, roughness=.4):
    m = bpy.data.materials.new(name)
    col = (*rgba, 1) if len(rgba) == 3 else rgba
    m.diffuse_color = col
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = col
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    return m

mat_base    = material('PBR_Base_Dark',      (.12, .16, .20), .70, .60)
mat_teal    = material('PBR_Hydraulic_Teal', (.25, .65, .55), .60, .35)
mat_steel   = material('PBR_Polished_Steel', (.58, .65, .72), .90, .20)
mat_dark    = material('PBR_Dark_Steel',     (.15, .18, .22), .84, .35)
mat_brass   = material('PBR_Brass',          (.70, .55, .25), .80, .25)
mat_motor   = material('PBR_Motor_Grey',     (.40, .45, .50), .50, .50)

# --- HELPERS ---
def finish(obj, name, mat, rotating=False):
    obj.name = name
    if hasattr(obj, 'data') and obj.data:
        obj.data.name = name
        if len(obj.data.materials) == 0:
            obj.data.materials.append(mat)
        else:
            obj.data.materials[0] = mat
        for p in obj.data.polygons:
            p.use_smooth = True
    obj['part_name'] = name
    obj['rotating'] = rotating
    PARTS.append(obj)
    return obj

def cyl(name, loc, r, depth, mat, rot=(0,0,0), rot_flag=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, name, mat, rot_flag)

def box(name, loc, scale, mat, rot_flag=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    return finish(o, name, mat, rot_flag)

def bevel(o, width=.02):
    mod = o.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = 3
    mod.limit_method = 'ANGLE'
    o.modifiers.new('WeightedNormals', 'WEIGHTED_NORMAL')

# ============================================================
# 1. BEDPLATE / FOUNDATION
# ============================================================
base = box('Steering_Base', (0, 0, 0.15), (2.2, 1.0, 0.3), mat_base)
bevel(base, .02)

# Mounting Feet Blocks
for x in (-0.8, 0.8):
    for y in (-0.35, 0.35):
        clean_name = f'Base_Mount_{"pos" if x > 0 else "neg"}{abs(int(x*10))}_{"pos" if y > 0 else "neg"}{abs(int(y*100))}'
        box(clean_name, (x, y, 0.0), (0.25, 0.25, 0.1), mat_dark)

# ============================================================
# 2. RUDDER STOCK & QUADRANT (Moving Group)
# ============================================================
# Vertical Rudder Stock
cyl('Rudder_Stock', (0, 0, 0.8), 0.15, 1.3, mat_steel, rot_flag=True)

# Tiller / Quadrant Top
cyl('Tiller_Head', (0, 0, 1.45), 0.25, 0.15, mat_dark, rot_flag=True)

# Horizontal Crosshead (connecting point for rams)
crosshead = box('Tiller_Crosshead', (0, 0, 1.1), (1.4, 0.15, 0.15), mat_dark, rot_flag=True)
bevel(crosshead, .01)

# ============================================================
# 3. HYDRAULIC RAMS (Cylinders fixed, Pistons moving)
# ============================================================
for side, x_dir in [('Port', -1), ('Starboard', 1)]:
    # Cylinder Barrel (Teal)
    x_pos = x_dir * 0.8
    barrel = cyl(f'Hydraulic_Ram_{side}', (x_pos, 0, 0.5), 0.12, 0.8, mat_teal, rot=(0, pi/2, 0))
    bevel(barrel, .01)
    
    # Mounting Bracket
    box(f'Ram_Bracket_{side}', (x_dir * 1.1, 0, 0.3), (0.15, 0.3, 0.3), mat_dark)
    
    # Piston Rod (Silver, extending towards center)
    rod_x = x_dir * 0.4
    cyl(f'Hydraulic_Piston_{side}', (rod_x, 0, 1.1), 0.05, 0.6, mat_steel, rot=(0, pi/2, 0), rot_flag=True)

    # Hydraulic Hoses connecting to pump
    bpy.ops.mesh.primitive_torus_add(
        location=(x_dir * 0.5, 0, 0.5), rotation=(pi/2, 0, 0),
        major_radius=0.2, minor_radius=0.03, major_segments=24, minor_segments=8
    )
    hose = bpy.context.object
    finish(hose, f'Hydraulic_Hose_{side}', mat_brass)

# ============================================================
# 4. POWER UNIT (Motor & Pump)
# ============================================================
# Electric Motor (Vertical)
motor = cyl('Steering_Motor', (-0.6, 0.6, 0.6), 0.18, 0.6, mat_motor)
bevel(motor, .01)
# Motor terminal box
box('Motor_Terminal', (-0.6, 0.8, 0.7), (0.15, 0.1, 0.15), mat_teal)

# Hydraulic Pump (Horizontal)
pump = cyl('Hydraulic_Pump', (-0.4, 0.6, 0.3), 0.15, 0.4, mat_dark, rot=(0, pi/2, 0))
bevel(pump, .01)

# ============================================================
# 5. VIEWPORT / LIGHTING / CAMERA
# ============================================================
world = bpy.context.scene.world
if world:
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (.19, .23, .29, 1)
        bg.inputs['Strength'].default_value = .6

def area(name, loc, power, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    direction = Vector((0, 0, 0.5)) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

area('Studio_Key',  (-3, -4, 5), 1500, 5)
area('Studio_Fill', (3, 3, 3), 1000, 4)
area('Studio_Rim',  (0, -1, -4), 800, 3)

camdata = bpy.data.cameras.new('Camera')
cam = bpy.data.objects.new('Camera', camdata)
bpy.context.collection.objects.link(cam)
cam.location = (4.5, -4.5, 3.5)
direction = Vector((0, 0, 0.5)) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
camdata.type = 'ORTHO'
camdata.ortho_scale = 4.5
bpy.context.scene.camera = cam

for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            sp = a.spaces.active
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'MATERIAL'
            sp.region_3d.view_distance = 5.0

# ============================================================
# EXPORT
# ============================================================
bpy.ops.object.select_all(action='DESELECT')
for o in PARTS:
    o.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

bpy.ops.export_scene.gltf(
    filepath=EXPORT_GLB_PATH,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
)
print(f'EXPORTED: {EXPORT_GLB_PATH} ({len(PARTS)} mechanical parts)')

if EXPORT_GLB_ALT != EXPORT_GLB_PATH:
    import shutil
    shutil.copyfile(EXPORT_GLB_PATH, EXPORT_GLB_ALT)
    print(f'COPIED TO: {EXPORT_GLB_ALT}')
