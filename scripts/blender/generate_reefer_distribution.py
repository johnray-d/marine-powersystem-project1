"""Marine Reefer Distribution Panel. Blender 4.x/5.x.
Run in Blender > Scripting. GLB exports beside this script (or to public/ folder).

Axis: X is horizontal, Z is vertical (up). The cabinet faces -Y.
Units are illustrative meters, not design-certified dimensions.
"""
import bpy, math, os, shutil
from mathutils import Vector

# Resolve script directory and target export paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..')) if os.path.basename(SCRIPT_DIR) == 'blender' else os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public', 'models')
os.makedirs(PUBLIC_DIR, exist_ok=True)

EXPORT_GLB_PATH = os.path.join(PUBLIC_DIR, 'reefer_distribution.glb')
ALT_GLB_PATH = os.path.join(PUBLIC_DIR, 'marine_reefer.glb')

# --- CLEAN SCENE ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

PARTS = []

# --- MATERIALS ---
def material(name, rgba, metallic=0, roughness=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgba, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    if bs:
        bs.inputs['Base Color'].default_value = (*rgba, 1)
        bs.inputs['Metallic'].default_value = metallic
        bs.inputs['Roughness'].default_value = roughness
    return m

mat_cabinet = material('PBR_Cabinet_Grey',   (.60, .65, .70), .50, .50)
mat_blue    = material('PBR_Feeder_Blue',    (.25, .40, .65), .40, .40)
mat_gold    = material('PBR_Protection_Gold',(.75, .55, .20), .30, .50)
mat_dark    = material('PBR_Socket_Panel',   (.15, .20, .25), .60, .40)
mat_black   = material('PBR_Breaker_Black',  (.05, .05, .05), .10, .80)
mat_copper  = material('PBR_Earth_Copper',   (.70, .40, .15), .90, .30)
mat_steel   = material('PBR_Steel',          (.55, .60, .65), .85, .25)

# --- HELPERS ---
def finish(obj, name, mat, rotating=False):
    obj.name = name
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj['part_name'] = name
    obj['rotating'] = rotating
    PARTS.append(obj)
    return obj

def box(name, loc, scale, mat, rot_flag=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    return finish(o, name, mat, rot_flag)

def cyl(name, loc, r, depth, mat, rot=(0,0,0), rot_flag=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=r, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, name, mat, rot_flag)

def bevel(o, width=.015):
    mod = o.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = 3
    mod.limit_method = 'ANGLE'
    o.modifiers.new('WeightedNormals', 'WEIGHTED_NORMAL')

# ============================================================
# 1. MAIN CABINET
# ============================================================
cabinet = box('Reefer_Distribution_Cabinet', (0, 0, 0), (1.4, 0.6, 1.8), mat_cabinet)
bevel(cabinet, .03)

# Cabinet door outline & handle
box('Cabinet_Door_Trim', (0, -0.31, 0), (1.35, 0.02, 1.75), mat_cabinet)
box('Cabinet_Handle', (0.6, -0.35, 0), (0.05, 0.05, 0.2), mat_steel)

# ============================================================
# 2. INCOMING FEEDER (Blue box top left)
# ============================================================
feeder = box('Incoming_Feeder', (-0.4, -0.35, 0.55), (0.35, 0.15, 0.6), mat_blue)
bevel(feeder, .01)

# ============================================================
# 3. OUTLET PROTECTION (Gold panel with 4 switches)
# ============================================================
protection = box('Outlet_Protection', (0.25, -0.35, 0.55), (0.6, 0.15, 0.6), mat_gold)
bevel(protection, .01)

for i in range(4):
    # Breaker switches (black boxes)
    sw_x = 0.05 + i * 0.13
    box(f'Protection_Switch_{i+1}', (sw_x, -0.44, 0.6), (0.08, 0.04, 0.12), mat_black)
    # Reset button below
    cyl(f'Protection_Reset_{i+1}', (sw_x, -0.44, 0.45), 0.02, 0.04, mat_steel, rot=(math.pi/2, 0, 0))

# ============================================================
# 4. REEFER SOCKETS (Dark panel with 4 circular sockets)
# ============================================================
sockets = box('Reefer_Sockets', (0.05, -0.35, -0.35), (0.9, 0.15, 0.35), mat_dark)
bevel(sockets, .01)

for i in range(4):
    soc_x = -0.3 + i * 0.2
    # Outer ring
    cyl(f'Socket_Ring_{i+1}', (soc_x, -0.44, -0.35), 0.06, 0.04, mat_gold, rot=(math.pi/2, 0, 0))
    # Inner plug
    cyl(f'Socket_Plug_{i+1}', (soc_x, -0.45, -0.35), 0.04, 0.04, mat_black, rot=(math.pi/2, 0, 0))
    # 440V label (tiny box)
    box(f'Socket_Label_{i+1}', (soc_x, -0.44, -0.25), (0.05, 0.01, 0.02), mat_steel)

# ============================================================
# 5. DECK CABLE ROUTE (Vent block bottom right)
# ============================================================
route = box('Deck_Cable_Route', (0.45, -0.35, -0.75), (0.25, 0.15, 0.25), mat_dark)
bevel(route, .01)
# Vent slats
for i in range(4):
    box(f'Vent_Slat_{i+1}', (0.45, -0.43, -0.82 + i*0.04), (0.2, 0.02, 0.01), mat_steel)

# ============================================================
# 6. EARTH TERMINAL BAR (Copper block bottom left)
# ============================================================
earth = box('Earth_Terminal_Bar', (-0.35, -0.35, -0.75), (0.3, 0.1, 0.06), mat_copper)
bevel(earth, .005)
# Insulators
for i in range(3):
    cyl(f'Earth_Insulator_{i+1}', (-0.5 + i*0.15, -0.35, -0.8), 0.02, 0.04, mat_steel)

# ============================================================
# LIGHTING / CAMERA / VIEWPORT
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
    direction = Vector((0, 0, 0)) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

area('Studio_Key',  (-3, -4, 5), 1200, 5)
area('Studio_Fill', (3, -2, 3), 800, 4)
area('Studio_Rim',  (0, 4, 2), 600, 3)

camdata = bpy.data.cameras.new('Camera')
cam = bpy.data.objects.new('Camera', camdata)
bpy.context.collection.objects.link(cam)
cam.location = (2.5, -4.0, 1.5)
direction = Vector((0, 0, 0)) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
camdata.type = 'ORTHO'
camdata.ortho_scale = 3.5
bpy.context.scene.camera = cam
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 64

for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            sp = a.spaces.active
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'MATERIAL'
            sp.region_3d.view_distance = 4.0

# ============================================================
# EXPORT
# ============================================================
bpy.ops.object.select_all(action='DESELECT')
for o in PARTS:
    o.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.export_scene.gltf(
    filepath=EXPORT_GLB_PATH,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
)
print(f'EXPORTED: {EXPORT_GLB_PATH} ({len(PARTS)} mechanical parts)')

# Also copy to marine_reefer.glb for convenience
try:
    shutil.copyfile(EXPORT_GLB_PATH, ALT_GLB_PATH)
    print(f'COPIED TO: {ALT_GLB_PATH}')
except Exception as e:
    print(f'Copy error: {e}')
