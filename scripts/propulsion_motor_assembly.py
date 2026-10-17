"""Marine electric propulsion motor. Blender 4.x/5.x.
Run in Blender > Scripting. GLB exports beside this script (or home folder for unsaved blend).

Axis: X. Output shaft extends along +X. Rear cooling fan along -X.
Units are illustrative meters, not design-certified dimensions.
"""
import bpy, math, os
from mathutils import Vector
from math import sin, cos, pi

# Determine output paths
script_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
workspace_dir = os.path.abspath(os.path.join(script_dir, '..'))
public_dir = os.path.join(workspace_dir, 'public')
if not os.path.isdir(public_dir):
    public_dir = script_dir

EXPORT_GLB_PATH = os.path.join(public_dir, 'marine_propulsion_motor.glb')
EXPORT_GLB_ALT = os.path.join(public_dir, 'marine_motor.glb')

# --- CLEAN SCENE ---
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

PARTS = []

# --- MATERIALS (version-safe transmission) ---
def material(name, rgba, metallic=0, roughness=.4):
    m = bpy.data.materials.new(name)
    col = (*rgba, 1) if len(rgba) == 3 else rgba
    m.diffuse_color = col
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = col
    bs.inputs['Metallic'].default_value = metallic
    bs.inputs['Roughness'].default_value = roughness
    if 'Transmission Weight' in bs.inputs:
        bs.inputs['Transmission Weight'].default_value = 0
    elif 'Transmission' in bs.inputs:
        bs.inputs['Transmission'].default_value = 0
    return m

mat_body    = material('PBR_Motor_Body',     (.18, .28, .40), .70, .44)
mat_dark    = material('PBR_Dark_Steel',     (.13, .16, .19), .84, .35)
mat_steel   = material('PBR_Polished_Steel', (.58, .65, .72), .90, .20)
mat_copper  = material('PBR_Copper_Winding', (.78, .35, .12), .92, .30)
mat_teal    = material('PBR_Teal_Terminal',  (.20, .58, .50), .35, .52)
mat_gold    = material('PBR_Bearing_Bronze', (.68, .52, .24), .78, .28)

# --- HELPERS ---
def finish(obj, name, mat, rotating=False):
    obj.name = name
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

def cyl(name, x, r, depth, mat, rot=False, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=r, depth=depth, location=(x, 0, 0))
    o = bpy.context.object
    o.rotation_euler[1] = pi / 2
    return finish(o, name, mat, rot)

def ring(name, x0, x1, inner, outer, mat, rot=False, segments=96, start=0, end=2*pi):
    verts, faces, n = [], [], segments
    for x, r in ((x0, inner), (x0, outer), (x1, inner), (x1, outer)):
        for i in range(n + 1):
            a = start + (end - start) * i / n
            verts.append((x, r * cos(a), r * sin(a)))
    for i in range(n):
        # ring 0: 0..n, ring 1: n+1..2n+1, ring 2: 2n+2..3n+2, ring 3: 3n+3..4n+3
        v0 = i
        v1 = i + 1
        v_outer0 = n + 1 + i
        v_outer1 = n + 1 + i + 1
        
        v2_0 = 2 * n + 2 + i
        v2_1 = 2 * n + 2 + i + 1
        v3_0 = 3 * n + 3 + i
        v3_1 = 3 * n + 3 + i + 1
        
        faces.extend((
            (v0, v1, v_outer1, v_outer0),             # End face at x0 (inner to outer)
            (v2_0, v3_0, v3_1, v2_1),                 # End face at x1 (inner to outer)
            (v_outer0, v_outer1, v3_1, v3_0),         # Outer cylindrical wall
            (v0, v2_0, v2_1, v1),                     # Inner cylindrical bore
        ))
    if end - start < 2*pi - .01:
        for j in (0, n):
            faces.append((j, n + 1 + j, 3*n + 3 + j, 2*n + 2 + j))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    return finish(o, name, mat, rot)

def box(name, loc, scale, mat, rot=False, rot_euler=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    if rot_euler:
        o.rotation_euler = rot_euler
    return finish(o, name, mat, rot)

def torus(name, loc, major_r, minor_r, mat, rot=False):
    bpy.ops.mesh.primitive_torus_add(
        location=loc, major_radius=major_r, minor_radius=minor_r,
        major_segments=64, minor_segments=16,
    )
    o = bpy.context.object
    o.rotation_euler[1] = pi / 2
    return finish(o, name, mat, rot)

def bevel(o, width=.01, segments=3):
    mod = o.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    o.modifiers.new('WeightedNormals', 'WEIGHTED_NORMAL')

# ============================================================
# MOTOR FRAME + CIRCUMFERENTIAL COOLING RIBS
# ============================================================
frame = cyl('Motor_Frame', 0, .95, 2.4, mat_body)
bevel(frame, .015)

for i in range(15):
    x = -1.06 + i * 0.14
    ring(f'Cooling_Rib_{i+1}', x, x + .075, .95, 1.02, mat_body)

# ============================================================
# END BELLS
# ============================================================
bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=.95, radius2=.52, depth=.35, location=(1.375, 0, 0))
o = bpy.context.object
o.rotation_euler[1] = pi / 2
finish(o, 'End_Bell_Front', mat_body, False)
bevel(o, .015)

bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=.52, radius2=.95, depth=.35, location=(-1.375, 0, 0))
o = bpy.context.object
o.rotation_euler[1] = pi / 2
finish(o, 'End_Bell_Rear', mat_body, False)
bevel(o, .015)

ring('End_Bell_Front_Rim', 1.20, 1.24, .90, .97, mat_body)
ring('End_Bell_Rear_Rim', -1.24, -1.20, .90, .97, mat_body)

# ============================================================
# MOUNTING FEET + ANCHOR BOLTS
# ============================================================
for i, x in enumerate((-0.75, 0.75)):
    box(f'Mounting_Foot_{i+1}', (x, 0, -.92), (.55, .95, .12), mat_dark)
    for j, y in enumerate((-.35, .35)):
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.055, depth=.22, location=(x, y, -.84))
        o = bpy.context.object
        finish(o, f'Mounting_Bolt_{i+1}{"ab"[j]}', mat_steel, False)

# ============================================================
# STATOR (fixed)
# ============================================================
cyl('Stator_Core', 0, .78, 2.2, mat_dark)
for i in range(10):
    x = -.95 + i * .21
    ring(f'Stator_Winding_Coil_{i+1}', x, x + .18, .74, .80, mat_copper)

# ============================================================
# ROTOR (shaft/key/taper rotate; core kept fixed for clean explosion)
# ============================================================
cyl('Rotor_Core', 0, .55, 2.30, mat_dark, False)
cyl('Rotor_Shaft', 0.85, .14, 1.80, mat_steel, True)      # x: -0.05 .. 1.75
cyl('Rotor_Shaft_Aft', -0.90, .14, .90, mat_steel, True)  # x: -1.35 .. -0.45
cyl('Shaft_Output_Taper', 1.95, .10, .35, mat_steel, True)
box('Shaft_Key', (1.62, .14, 0), (.20, .045, .04), mat_gold, True)

# ============================================================
# BEARINGS (fixed)
# ============================================================
torus('Bearing_Front', (1.05, 0, 0), .19, .075, mat_gold, False)
torus('Bearing_Rear', (-1.05, 0, 0), .19, .075, mat_gold, False)

# ============================================================
# TERMINAL BOX + LID + CABLE GLANDS
# ============================================================
tbox = box('Terminal_Box', (0, 0, 1.08), (.30, .42, .28), mat_teal, False)
bevel(tbox, .015)

tbox_lid = box('Terminal_Box_Lid', (0, 0, 1.24), (.33, .45, .05), mat_dark, False)
bevel(tbox_lid, .01)

for i, y in enumerate((-.20, 0, .20)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.035, depth=.12, location=(-.26, y, 1.08))
    o = bpy.context.object
    o.rotation_euler[1] = pi / 2
    finish(o, f'Terminal_Gland_{i+1}', mat_dark, False)

# ============================================================
# LIFTING EYES
# ============================================================
for i, x in enumerate((-.35, .35)):
    bpy.ops.mesh.primitive_torus_add(
        location=(x, 0, 1.00), rotation=(0, pi / 2, 0),
        major_radius=.07, minor_radius=.018,
        major_segments=24, minor_segments=8,
    )
    o = bpy.context.object
    finish(o, f'Lifting_Eye_{i+1}', mat_steel, False)

# ============================================================
# COOLING FAN (hub + 6 blades rotating) + WIRE GUARD (fixed)
# ============================================================
cyl('Cooling_Fan_Hub', -1.62, .28, .14, mat_dark, True)
for i in range(6):
    a = 2 * pi * i / 6
    box(
        f'Fan_Blade_{i+1}',
        (-1.62, cos(a) * .20, sin(a) * .20),
        (.05, .17, .10),
        mat_steel, True,
        rot_euler=(a, 0, 0),
    )

bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=.42, depth=.20, location=(-1.82, 0, 0))
o = bpy.context.object
o.rotation_euler[1] = pi / 2
finish(o, 'Fan_Guard', mat_steel, False)
wmod = o.modifiers.new('Wireframe', 'WIREFRAME')
wmod.thickness = .018

# ============================================================
# FORWARD SUPPORT BRACKET
# ============================================================
box('Support_Bracket', (1.55, 0, -.60), (.12, .28, .55), mat_dark, False)

# ============================================================
# VIEWPORT / LIGHTING / CAMERA
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
    direction = Vector((-.1, 0, 0)) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

area('Studio_Key',  (-3, -4, 5), 1200, 5)
area('Studio_Fill', (2, 4, 3), 850, 4)
area('Studio_Rim',  (0, -1, -4), 600, 3)

camdata = bpy.data.cameras.new('Camera')
cam = bpy.data.objects.new('Camera', camdata)
bpy.context.collection.objects.link(cam)
cam.location = (-4.6, -6.7, 3.5)
direction = Vector((-.1, 0, 0)) - cam.location
cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
camdata.type = 'ORTHO'
camdata.ortho_scale = 6.8
bpy.context.scene.camera = cam

for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            sp = a.spaces.active
            sp.shading.type = 'SOLID'
            sp.shading.color_type = 'MATERIAL'
            sp.region_3d.view_distance = 6.5

# ============================================================
# EXPORT (only mechanical parts — lights/camera excluded)
# ============================================================
bpy.ops.object.select_all(action='DESELECT')
for o in PARTS:
    o.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]

# Apply transforms to meshes to ensure exact vertex positions in GLB
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

bpy.ops.export_scene.gltf(
    filepath=EXPORT_GLB_PATH,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
)
print(f'EXPORTED: {EXPORT_GLB_PATH} ({len(PARTS)} mechanical parts)')

# Also export companion copy if needed
if EXPORT_GLB_ALT != EXPORT_GLB_PATH:
    import shutil
    shutil.copyfile(EXPORT_GLB_PATH, EXPORT_GLB_ALT)
    print(f'COPIED TO: {EXPORT_GLB_ALT}')
