"""
Marine 6.6 kV / 440 V Distribution Transformer 3D Asset Generator
Compatible with Blender 4.x and 5.x LTS headless execution.

Generates a detailed, code-friendly explodable 3D transformer model matching
marine classification society specifications and dimensions allocated in vessel-layout.ts.

Coordinate Alignment:
  - Blender X: Length (-0.52 to +0.52 m)
  - Blender Y: Width / Depth (-0.40 to +0.40 m)
  - Blender Z: Height (0.0 m at deck foundation to ~0.98 m at bushing tips)
  - Three.js Export (export_yup=True): +Z in Blender becomes +Y in Three.js.
"""

import bpy  # type: ignore
import bmesh  # type: ignore
import math
import os
from math import pi, sin, cos
from mathutils import Vector  # type: ignore

# ==============================================================================
# 1. PATH SETUP & SCENE RESET
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORT_GLB_PATH = os.path.join(BASE_DIR, "public", "marine_transformer.glb")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat)

PARTS = []

# ==============================================================================
# 2. PBR MATERIAL FACTORY
# ==============================================================================
def create_material(name, rgba, metallic=0.0, roughness=0.4, is_translucent=False, opacity=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (rgba[0], rgba[1], rgba[2], opacity)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = metallic
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = roughness
        if is_translucent:
            if 'Alpha' in bsdf.inputs:
                bsdf.inputs['Alpha'].default_value = opacity
            mat.blend_method = 'BLEND'
    return mat

mat_enclosure     = create_material('PBR_Marine_Enclosure', (0.84, 0.87, 0.90), metallic=0.20, roughness=0.35)
mat_enclosure_int = create_material('PBR_Enclosure_Interior', (0.76, 0.80, 0.83), metallic=0.15, roughness=0.45)
mat_frame_steel   = create_material('PBR_Structural_Steel', (0.28, 0.35, 0.42), metallic=0.75, roughness=0.35)
mat_core_iron     = create_material('PBR_Magnetic_Core', (0.16, 0.18, 0.22), metallic=0.85, roughness=0.28)
mat_copper_coil   = create_material('PBR_Copper_Winding', (0.82, 0.42, 0.18), metallic=0.88, roughness=0.22)
mat_hv_resin      = create_material('PBR_HV_Resin_Coating', (0.68, 0.30, 0.12), metallic=0.10, roughness=0.30)
mat_bushing       = create_material('PBR_Porcelain_Bushing', (0.38, 0.15, 0.10), metallic=0.05, roughness=0.15)
mat_brass         = create_material('PBR_Machined_Brass', (0.78, 0.62, 0.22), metallic=0.85, roughness=0.25)
mat_insulation    = create_material('PBR_Dielectric_Barrier', (0.92, 0.88, 0.78), metallic=0.05, roughness=0.55)
mat_fan_black     = create_material('PBR_Fan_Cast_Black', (0.08, 0.09, 0.11), metallic=0.30, roughness=0.60)
mat_hazard        = create_material('PBR_Hazard_Yellow', (0.95, 0.78, 0.05), metallic=0.0, roughness=0.35)
mat_radiator      = create_material('PBR_Radiator_Fins', (0.75, 0.79, 0.83), metallic=0.35, roughness=0.40)

def register_object(obj, name, material, rotating=False, category='Structure'):
    obj.name = name
    if material:
        if obj.data.materials:
            obj.data.materials[0] = material
        else:
            obj.data.materials.append(material)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj['part_name'] = name
    obj['rotating'] = rotating
    obj['category'] = category
    PARTS.append(obj)
    return obj

# ==============================================================================
# 3. HELPER PRIMITIVES
# ==============================================================================
def add_box(name, size, location, material, category='Structure', rotating=False):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return register_object(obj, name, material, rotating, category)

def add_cylinder(name, radius, depth, location, rotation=(0, 0, 0), material=None, vertices=32, category='Structure', rotating=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    return register_object(obj, name, material, rotating, category)

# ==============================================================================
# 4. STRUCTURAL BASE SKID & MOUNTING CHANNELS
# ==============================================================================
# Dual marine longitudinal skid channels resting on deck at Z=0 to Z=0.06
add_box('Transformer_Base_Skid_Port', (0.98, 0.08, 0.06), (0.0, -0.32, 0.03), mat_frame_steel, 'Structure')
add_box('Transformer_Base_Skid_Stbd', (0.98, 0.08, 0.06), (0.0, 0.32, 0.03), mat_frame_steel, 'Structure')
add_box('Transformer_Base_Crossbeam_Aft', (0.08, 0.60, 0.05), (-0.44, 0.0, 0.025), mat_frame_steel, 'Structure')
add_box('Transformer_Base_Crossbeam_Fwd', (0.08, 0.60, 0.05), (0.44, 0.0, 0.025), mat_frame_steel, 'Structure')

# Mounting feet with slotted anchor plates
for sx in (-0.42, 0.42):
    for sy in (-0.32, 0.32):
        add_box(f'Transformer_Anchor_Pad_{"F" if sx>0 else "A"}{"S" if sy>0 else "P"}', (0.10, 0.12, 0.015), (sx, sy, 0.065), mat_frame_steel, 'Structure')

# Grounding terminal boss
add_cylinder('Transformer_Earth_Boss', 0.02, 0.03, (-0.46, -0.32, 0.07), material=mat_brass, category='Structure')

# ==============================================================================
# 5. THREE-PHASE LAMINATED MAGNETIC CORE
# ==============================================================================
# Lower yoke beam
add_box('Transformer_Core_Bottom_Yoke', (0.76, 0.16, 0.10), (0.0, 0.0, 0.11), mat_core_iron, 'Core')

# 3 Vertical Core Limbs (Phases A, B, C)
phase_x_coords = (-0.24, 0.0, 0.24)
phase_labels = ('A', 'B', 'C')

for x_pos, label in zip(phase_x_coords, phase_labels):
    add_cylinder(f'Transformer_Core_Limb_{label}', 0.068, 0.44, (x_pos, 0.0, 0.38), material=mat_core_iron, vertices=24, category='Core')

# Upper yoke beam
add_box('Transformer_Core_Top_Yoke', (0.76, 0.16, 0.10), (0.0, 0.0, 0.65), mat_core_iron, 'Core')

# Structural core clamping frame: upper and lower heavy channel plates
add_box('Transformer_Core_Clamp_Bottom', (0.80, 0.20, 0.04), (0.0, 0.0, 0.155), mat_frame_steel, 'Core')
add_box('Transformer_Core_Clamp_Top', (0.80, 0.20, 0.04), (0.0, 0.0, 0.605), mat_frame_steel, 'Core')

# 4 High-tensile clamping tie-rods
for rx in (-0.36, 0.36):
    for ry in (-0.09, 0.09):
        add_cylinder(f'Transformer_Tie_Rod_{"F" if rx>0 else "A"}{"S" if ry>0 else "P"}', 0.009, 0.54, (rx, ry, 0.38), material=mat_frame_steel, vertices=12, category='Core')

# Heavy-duty lifting eyes atop upper clamp
for lx in (-0.28, 0.28):
    add_cylinder(f'Transformer_Core_Lifting_Eye_{"F" if lx>0 else "A"}', 0.022, 0.025, (lx, 0.0, 0.72), rotation=(pi/2, 0, 0), material=mat_frame_steel, category='Core')

# ==============================================================================
# 6. CONCENTRIC PRIMARY (6.6 kV) & SECONDARY (440 V) WINDINGS
# ==============================================================================
# Inside: Secondary 440 V Low Voltage winding cylinder (thick copper foil/bar)
# Middle: Dielectric Nomex / fiberglass insulation barrier sleeve
# Outside: Primary 6.6 kV High Voltage resin-cast multi-section coil with cooling ducts

for x_pos, label in zip(phase_x_coords, phase_labels):
    # 1. Inner LV Secondary Winding (440 V output)
    add_cylinder(f'Transformer_LV_Winding_{label}', 0.082, 0.38, (x_pos, 0.0, 0.38), material=mat_copper_coil, vertices=32, category='Windings')
    
    # 2. Dielectric insulation cylinder between LV and HV
    add_cylinder(f'Transformer_Insulation_Barrier_{label}', 0.092, 0.39, (x_pos, 0.0, 0.38), material=mat_insulation, vertices=32, category='Insulation')
    
    # 3. Outer HV Primary Winding (6.6 kV input) - stepped sections
    add_cylinder(f'Transformer_HV_Winding_{label}', 0.118, 0.36, (x_pos, 0.0, 0.38), material=mat_hv_resin, vertices=32, category='Windings')
    
    # HV coil copper winding disc bands
    for dz in (-0.12, -0.04, 0.04, 0.12):
        add_cylinder(f'Transformer_HV_Disc_{label}_{int(dz*100)}', 0.122, 0.035, (x_pos, 0.0, 0.38 + dz), material=mat_copper_coil, vertices=32, category='Windings')

# ==============================================================================
# 7. BUSBARS, TERMINAL JUMPERS & TAP CHANGER
# ==============================================================================
# Upper HV delta interconnect busbars
add_box('Transformer_HV_Busbar_AB', (0.24, 0.018, 0.02), (-0.12, -0.09, 0.70), mat_copper_coil, 'Busbars')
add_box('Transformer_HV_Busbar_BC', (0.24, 0.018, 0.02), (0.12, -0.09, 0.70), mat_copper_coil, 'Busbars')

# Off-circuit Tap Changer Selector Bar (center top)
add_box('Transformer_Tap_Changer_Block', (0.18, 0.06, 0.04), (0.0, 0.0, 0.72), mat_insulation, 'Busbars')
for tx in (-0.06, 0.0, 0.06):
    add_cylinder(f'Transformer_Tap_Stud_{tx}', 0.008, 0.03, (tx, 0.0, 0.75), material=mat_brass, category='Busbars')

# Lower LV Phase output busbars (heavy copper flats dropping forward)
for x_pos, label in zip(phase_x_coords, phase_labels):
    add_box(f'Transformer_LV_Busbar_Riser_{label}', (0.025, 0.06, 0.28), (x_pos, 0.11, 0.26), mat_copper_coil, 'Busbars')

# Neutral solid copper busbar flat
add_box('Transformer_LV_Neutral_Bar', (0.64, 0.025, 0.02), (0.0, 0.12, 0.11), mat_copper_coil, 'Busbars')

# ==============================================================================
# 8. HIGH-VOLTAGE & LOW-VOLTAGE BUSHINGS
# ==============================================================================
# 3 High Voltage 6.6 kV stepped porcelain insulator bushings atop enclosure (at Z=0.88 to 1.06)
bushing_x = (-0.22, 0.0, 0.22)
for idx, (bx, label) in enumerate(zip(bushing_x, phase_labels)):
    # Bushing base mounting flange
    add_cylinder(f'Transformer_HV_Bushing_Flange_{label}', 0.042, 0.018, (bx, -0.16, 0.89), material=mat_frame_steel, vertices=20, category='Bushings')
    
    # Stepped porcelain sheds
    for step_idx, sz in enumerate((0.02, 0.05, 0.08, 0.11)):
        r = 0.034 - step_idx * 0.003
        add_cylinder(f'Transformer_HV_Bushing_Shed_{label}_{step_idx}', r, 0.022, (bx, -0.16, 0.90 + sz), material=mat_bushing, vertices=24, category='Bushings')
    
    # Terminal stud & copper clamp on top
    add_cylinder(f'Transformer_HV_Terminal_{label}', 0.012, 0.045, (bx, -0.16, 1.04), material=mat_brass, vertices=16, category='Bushings')

# Neutral Bushing / Ground terminal (smaller porcelain bushing on top)
add_cylinder('Transformer_Neutral_Bushing', 0.024, 0.07, (0.36, -0.16, 0.92), material=mat_bushing, vertices=20, category='Bushings')
add_cylinder('Transformer_Neutral_Terminal', 0.009, 0.03, (0.36, -0.16, 0.97), material=mat_brass, vertices=16, category='Bushings')

# ==============================================================================
# 9. ENCLOSURE CASING, TANK & COVERS
# ==============================================================================
# Main outer tank casing (IP23 / IP44 marine enclosure)
# Back wall
add_box('Transformer_Casing_Back_Wall', (0.86, 0.025, 0.80), (0.0, -0.28, 0.46), mat_enclosure, 'Enclosure')
# Bottom pan
add_box('Transformer_Casing_Bottom_Pan', (0.86, 0.56, 0.025), (0.0, 0.0, 0.07), mat_enclosure_int, 'Enclosure')
# Top tank rim frame
add_box('Transformer_Casing_Top_Rim_Aft', (0.86, 0.04, 0.03), (0.0, -0.27, 0.865), mat_enclosure, 'Enclosure')
add_box('Transformer_Casing_Top_Rim_Fwd', (0.86, 0.04, 0.03), (0.0, 0.27, 0.865), mat_enclosure, 'Enclosure')

# 4 Corner vertical structural pillars
for cx in (-0.42, 0.42):
    for cy in (-0.27, 0.27):
        add_box(f'Transformer_Pillar_{"F" if cx>0 else "A"}{"S" if cy>0 else "P"}', (0.04, 0.04, 0.80), (cx, cy, 0.46), mat_enclosure, 'Enclosure')

# Top Tank Lid with bushing collar cutouts (Explodes +Z in Three.js / +Y in Three.js)
add_box('Transformer_Tank_Lid', (0.88, 0.58, 0.022), (0.0, 0.0, 0.88), mat_enclosure, 'Enclosure')

# 4 Heavy lifting lugs welded to top lid corners
for lx in (-0.40, 0.40):
    for ly in (-0.25, 0.25):
        add_box(f'Transformer_Lifting_Lug_{"F" if lx>0 else "A"}{"S" if ly>0 else "P"}', (0.018, 0.045, 0.06), (lx, ly, 0.91), mat_frame_steel, 'Enclosure')

# Front Access & Inspection Door (bolted front panel with window & hazard triangle)
# Explodes forward in Three.js (+Z in Three.js / +Y in Blender)
add_box('Transformer_Front_Access_Door', (0.76, 0.022, 0.68), (0.0, 0.28, 0.44), mat_enclosure, 'Enclosure')

# Front door center ventilation mesh panel / inspection window frame
add_box('Transformer_Inspection_Window_Frame', (0.28, 0.03, 0.24), (0.0, 0.29, 0.54), mat_frame_steel, 'Enclosure')
add_box('Transformer_Inspection_Window_Grille', (0.24, 0.008, 0.20), (0.0, 0.295, 0.54), mat_fan_black, 'Enclosure')

# Warning Hazard Triangle on front access door
add_cylinder('Transformer_Hazard_Warning_Decal', 0.055, 0.008, (0.0, 0.295, 0.36), rotation=(pi/2, 0, 0), material=mat_hazard, vertices=3, category='Enclosure')

# Lower Front Cable Gland Box & Marine Gland Array
add_box('Transformer_Cable_Gland_Box', (0.58, 0.08, 0.12), (0.0, 0.31, 0.14), mat_enclosure, 'Enclosure')
for gx in (-0.18, -0.06, 0.06, 0.18):
    add_cylinder(f'Transformer_Cable_Gland_{gx}', 0.024, 0.05, (gx, 0.36, 0.14), rotation=(pi/2, 0, 0), material=mat_brass, vertices=16, category='Enclosure')

# ==============================================================================
# 10. CORRUGATED RADIATOR COOLING FINS & AXIAL FANS
# ==============================================================================
# Port side radiator fin bank (-X in Blender)
add_box('Transformer_Radiator_Bank_Port', (0.025, 0.48, 0.68), (-0.44, 0.0, 0.44), mat_radiator, 'Cooling')
for fz in range(12):
    fin_y = -0.22 + fz * 0.04
    add_box(f'Transformer_Radiator_Fin_P_{fz+1}', (0.09, 0.012, 0.64), (-0.49, fin_y, 0.44), mat_radiator, 'Cooling')

# Starboard side radiator fin bank (+X in Blender)
add_box('Transformer_Radiator_Bank_Stbd', (0.025, 0.48, 0.68), (0.44, 0.0, 0.44), mat_radiator, 'Cooling')
for fz in range(12):
    fin_y = -0.22 + fz * 0.04
    add_box(f'Transformer_Radiator_Fin_S_{fz+1}', (0.09, 0.012, 0.64), (0.49, fin_y, 0.44), mat_radiator, 'Cooling')

# Forced Air Axial Cooling Fans (2 on port, 2 on starboard side)
fan_configs = [
    ('Port_Lower', (-0.55, -0.12, 0.28), (-pi/2, 0, -pi/2)),
    ('Port_Upper', (-0.55, 0.12, 0.58), (-pi/2, 0, -pi/2)),
    ('Stbd_Lower', (0.55, -0.12, 0.28), (pi/2, 0, pi/2)),
    ('Stbd_Upper', (0.55, 0.12, 0.58), (pi/2, 0, pi/2)),
]

for fan_id, loc, rot in fan_configs:
    # Fan outer square housing & circular shroud
    add_box(f'Transformer_Fan_Housing_{fan_id}', (0.035, 0.16, 0.16), loc, mat_fan_black, 'Cooling')
    
    # Fan hub & rotor (rotating group)
    hub = add_cylinder(f'Transformer_Fan_Rotor_{fan_id}', 0.026, 0.028, loc, rotation=rot, material=mat_fan_black, vertices=16, category='Cooling', rotating=True)
    
    # 4 Fan impeller blades
    is_port = 'Port' in fan_id
    for bi in range(4):
        blade_angle = bi * (pi / 2)
        # Small blade offset
        bx = loc[0] + (0.006 if is_port else -0.006)
        by = loc[1] + cos(blade_angle) * 0.045
        bz = loc[2] + sin(blade_angle) * 0.045
        b_obj = add_box(f'Transformer_Fan_Blade_{fan_id}_{bi+1}', (0.015, 0.05, 0.018), (bx, by, bz), mat_fan_black, 'Cooling', rotating=True)

# ==============================================================================
# 11. VIEWPORT SHADING & GLB EXPORT
# ==============================================================================
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            if space:
                space.shading.type = 'SOLID'
                space.shading.color_type = 'MATERIAL'

print(f"Constructed Marine Transformer with {len(PARTS)} parts.")

# Deselect everything then select all registered parts
bpy.ops.object.select_all(action='DESELECT')
for p in PARTS:
    p.select_set(True)

bpy.context.view_layer.objects.active = PARTS[0]

print(f"Exporting GLB to: {EXPORT_GLB_PATH}")
bpy.ops.export_scene.gltf(
    filepath=EXPORT_GLB_PATH,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True
)

file_size_kb = os.path.getsize(EXPORT_GLB_PATH) / 1024
print(f"SUCCESS: Exported {len(PARTS)} components to {EXPORT_GLB_PATH} ({file_size_kb:.1f} KB)")
