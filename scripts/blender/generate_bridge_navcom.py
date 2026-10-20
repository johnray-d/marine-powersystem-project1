"""
Standalone Blender Python script to model and export the:
Navigation Bridge COLREG Console & S-Band Radar Suite
Output: public/bridge_navcom_suite.glb

Can be run:
  1. From CLI:
     "D:\\Blender\\blender.exe" --background --python scripts/generate_bridge_navcom.py
  2. Inside Blender GUI:
     Open Blender -> Scripting workspace -> Open this file -> Click "Run Script" (or Alt+P)

Coordinate system in Blender:
  X = Width (-X left, +X right)
  Y = Depth (-Y is FRONT facing camera, +Y is back)
  Z = Height (+Z is UP)
During GLTF export with export_yup=True:
  Blender X -> Three.js X
  Blender Z -> Three.js Y (Up)
  Blender -Y -> Three.js +Z (Front)

Subassemblies defined for 3D explosion & animation:
  1. NavLight_Console_Panel       (Stationary: integrated console desk, dual ARPA/ECDIS screens, stainless rail, helm wheel, telegraph)
  2. Dual_Selector_Switches       (Stationary: COLREG mimic diagram with Main/Reserve toggle switches & LEDs)
  3. Alarm_Buzzer                 (Stationary: audible alarm horn, flashing BNWAS beacon, watch alarms)
  4. Radar_Pedestal               (Stationary: marine white scanner pedestal column, base flange, service door)
  5. Gearbox_Housing              (Stationary: S-band transceiver & reduction gearbox with safety disconnect switch)
  6. Rotating_S-Band_Scanner_Bar  (Rotating: 12-foot slotted waveguide antenna array with red end-caps, pivot=(0.38, 0.06, 0.80))
"""

import bpy
import math
import os
from mathutils import Vector, Euler

# Automatically determine output directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..')) if os.path.basename(SCRIPT_DIR) == 'blender' else os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public', 'models')
os.makedirs(PUBLIC_DIR, exist_ok=True)
EXPORT_PATH = os.path.join(PUBLIC_DIR, 'bridge_navcom_suite.glb')


def reset_scene():
    """Clear scene objects, meshes, and materials for a clean fresh build."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


def make_material(name, rgba, metallic=0.40, roughness=0.38):
    """Create a PBR Principled BSDF material."""
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgba, 1.0)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    if bs:
        if 'Base Color' in bs.inputs:
            bs.inputs['Base Color'].default_value = (*rgba, 1.0)
        if 'Metallic' in bs.inputs:
            bs.inputs['Metallic'].default_value = metallic
        if 'Roughness' in bs.inputs:
            bs.inputs['Roughness'].default_value = roughness
    return m


def get_materials():
    """Marine bridge console & radar PBR color palette."""
    return {
        'pebble_grey':   make_material('PebbleGrey',   (0.65, 0.68, 0.62), 0.35, 0.42),
        'dark_plinth':   make_material('DarkPlinth',   (0.14, 0.17, 0.21), 0.40, 0.48),
        'iron':          make_material('Iron',         (0.24, 0.30, 0.32), 0.45, 0.42),
        'steel':         make_material('Steel',        (0.72, 0.76, 0.78), 0.58, 0.32),
        'stainless':     make_material('Stainless',    (0.82, 0.85, 0.88), 0.62, 0.28),
        'gold_brass':    make_material('GoldBrass',    (0.80, 0.64, 0.28), 0.68, 0.30),
        'white_dial':    make_material('WhiteDial',    (0.90, 0.91, 0.88), 0.10, 0.45),
        'cyan_lcd':      make_material('CyanLcd',      (0.22, 0.75, 0.96), 0.15, 0.20),
        'status_green':  make_material('StatusGreen',  (0.14, 0.78, 0.38), 0.20, 0.32),
        'status_red':    make_material('StatusRed',    (0.86, 0.22, 0.18), 0.25, 0.34),
        'safety_yellow': make_material('SafetyYellow', (0.92, 0.74, 0.20), 0.25, 0.38),
        'rubber':        make_material('RubberBlack',   (0.035, 0.046, 0.053), 0.02, 0.82),
        'copper':        make_material('Copper',        (0.72, 0.34, 0.14), 0.83, 0.24),
        'blue_coat':     make_material('MarineBlueCoating', (0.12, 0.32, 0.48), 0.34, 0.32),
        'orange':        make_material('SafetyOrange',  (0.94, 0.38, 0.07), 0.16, 0.43),
    }


class SubassemblyBuilder:
    """
    Batches geometry for a logical subassembly by material into single-material meshes
    named `<sub_name>` and `<sub_name>__<MatName>`. Sets origins and parents to root.
    """
    def __init__(self, root_empty, sub_name, mats, pivot=None):
        self.root = root_empty
        self.sub_name = sub_name
        self.m = mats
        self.pivot = pivot
        self.by_mat = {}

    def _add(self, obj, mat):
        key = mat.name
        if key not in self.by_mat:
            self.by_mat[key] = (mat, [])
        self.by_mat[key][1].append(obj)
        return obj

    def box(self, size, loc, mat_key, rot=(0.0, 0.0, 0.0)):
        mat = self.m[mat_key] if isinstance(mat_key, str) else mat_key
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
        o = bpy.context.object
        o.scale = size
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return self._add(o, mat)

    def cyl(self, r, depth, loc, mat_key, axis='Z', verts=24, rot=None):
        mat = self.m[mat_key] if isinstance(mat_key, str) else mat_key
        if rot is None:
            if axis == 'X':
                rot = (0.0, math.pi / 2.0, 0.0)
            elif axis == 'Y':
                rot = (math.pi / 2.0, 0.0, 0.0)
            else:
                rot = (0.0, 0.0, 0.0)
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
        o = bpy.context.object
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        return self._add(o, mat)

    def ring(self, r_maj, r_min, loc, mat_key, axis='Z', rot=None):
        mat = self.m[mat_key] if isinstance(mat_key, str) else mat_key
        if rot is None:
            if axis == 'X':
                rot = (0.0, math.pi / 2.0, 0.0)
            elif axis == 'Y':
                rot = (math.pi / 2.0, 0.0, 0.0)
            else:
                rot = (0.0, 0.0, 0.0)
        bpy.ops.mesh.primitive_torus_add(
            major_radius=r_maj, minor_radius=r_min,
            major_segments=24, minor_segments=8,
            location=loc, rotation=rot
        )
        o = bpy.context.object
        return self._add(o, mat)

    def finalize(self, out_list):
        first = True
        for mat_name, (mat, objs) in self.by_mat.items():
            if not objs:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]
            if len(objs) > 1:
                bpy.ops.object.join()
            merged = bpy.context.view_layer.objects.active
            name = self.sub_name if first else f"{self.sub_name}__{mat_name}"
            first = False
            merged.name = name
            merged.data.name = name
            merged.data.materials.clear()
            merged.data.materials.append(mat)
            for p in merged.data.polygons:
                p.use_smooth = True

            if self.pivot is not None:
                bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
                bpy.context.scene.cursor.location = self.pivot
                bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
            else:
                bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

            mod = merged.modifiers.new('Bevel', 'BEVEL')
            mod.width = 0.004
            mod.segments = 2
            mod.limit_method = 'ANGLE'

            merged.parent = self.root
            out_list.append(merged)


def set_material_preview():
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.type = 'SOLID'
                area.spaces.active.shading.color_type = 'MATERIAL'


def build_bridge_navcom_suite():
    """Build the entire 6-part bridge console and radar assembly and export to GLB."""
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Bridge_NavCom_Suite', None)
    bpy.context.collection.objects.link(root)
    parts = []

    # -------------------------------------------------------------------------
    # 1. NavLight_Console_Panel
    # Ergonomic integrated console desk, dual 27" screens, helm wheel & telegraph
    # -------------------------------------------------------------------------
    nc = SubassemblyBuilder(root, 'NavLight_Console_Panel', m)
    cx = -0.18
    # Plinth base and lower cabinet
    nc.box((0.76, 0.46, 0.05), (cx, 0.0, 0.025), 'dark_plinth')
    nc.box((0.72, 0.40, 0.42), (cx, 0.02, 0.26), 'iron')
    # Sloped desktop work surface
    nc.box((0.76, 0.46, 0.16), (cx, -0.02, 0.52), 'pebble_grey', rot=(0.28, 0, 0))
    # Stainless storm grab rail along front edge
    nc.cyl(0.014, 0.74, (cx, -0.26, 0.47), 'stainless', axis='X', verts=16)
    # Dual 27-inch ARPA Radar & ECDIS widescreen monitors
    for mx in [cx - 0.18, cx + 0.18]:
        nc.box((0.28, 0.035, 0.20), (mx, 0.04, 0.68), 'dark_plinth', rot=(0.22, 0, 0))
        nc.box((0.25, 0.010, 0.17), (mx, 0.022, 0.68), 'cyan_lcd', rot=(0.22, 0, 0))
    # Autopilot helm steering wheel & Engine Order Telegraph (EOT) lever
    nc.ring(0.065, 0.012, (cx, -0.22, 0.42), 'dark_plinth', axis='Y')
    nc.cyl(0.022, 0.06, (cx, -0.20, 0.42), 'steel', axis='Y', verts=16)
    nc.box((0.04, 0.08, 0.10), (cx + 0.28, -0.14, 0.56), 'steel', rot=(0.4, 0, 0))
    # Screen bezels, dashboard button rows, knobs and compass repeater
    for mx in [cx - 0.18, cx + 0.18]:
        for j in range(7):
            nc.box((0.019, 0.006, 0.006), (mx - 0.103 + j * 0.033, 0.012, 0.586), 'steel')
        nc.box((0.09, 0.006, 0.012), (mx, 0.011, 0.758), 'orange')
    for j in range(10):
        x = cx - 0.29 + j * 0.062
        nc.cyl(0.009, 0.016, (x, -0.206, 0.59), 'dark_plinth', axis='Z', verts=16)
        nc.cyl(0.005, 0.017, (x, -0.206, 0.603), 'steel', axis='Z', verts=12)
    nc.cyl(0.058, 0.035, (cx + 0.29, -0.18, 0.68), 'dark_plinth', axis='Z', verts=40)
    nc.cyl(0.044, 0.007, (cx + 0.29, -0.18, 0.70), 'white_dial', axis='Z', verts=40)
    for xx in [cx - 0.35, cx + 0.35]:
        nc.box((0.025, 0.38, 0.04), (xx, 0.02, 0.48), 'steel')
    nc.finalize(parts)

    # -------------------------------------------------------------------------
    # 2. Dual_Selector_Switches
    # COLREG 72 navigation lights mimic plate & toggle switch bank
    # -------------------------------------------------------------------------
    ds = SubassemblyBuilder(root, 'Dual_Selector_Switches', m)
    sx, sy, sz = -0.36, -0.14, 0.54
    ds.box((0.30, 0.16, 0.035), (sx, sy, sz), 'dark_plinth', rot=(0.28, 0, 0))
    # Vessel silhouette mimic with port (red) / starboard (green) status LEDs
    ds.box((0.06, 0.10, 0.012), (sx - 0.06, sy - 0.01, sz + 0.02), 'pebble_grey', rot=(0.28, 0, 0))
    ds.cyl(0.009, 0.012, (sx - 0.08, sy - 0.01, sz + 0.025), 'status_red', axis='Z', verts=10)
    ds.cyl(0.009, 0.012, (sx - 0.04, sy - 0.01, sz + 0.025), 'status_green', axis='Z', verts=10)
    # 5 pairs of Main / Standby filament circuit toggle switches
    for i in range(5):
        tx = sx + 0.01 + i * 0.026
        ds.cyl(0.008, 0.028, (tx, sy - 0.03, sz + 0.02), 'steel', rot=(0.28, 0, 0), verts=10)
        ds.cyl(0.008, 0.028, (tx, sy + 0.02, sz + 0.03), 'gold_brass', rot=(0.28, 0, 0), verts=10)
    for i in range(5):
        ds.box((0.022, 0.007, 0.008), (sx + 0.01 + i * 0.026, sy - 0.07, sz + 0.045), 'white_dial')
    ds.finalize(parts)

    # -------------------------------------------------------------------------
    # 3. Alarm_Buzzer
    # Audible failure horn, flashing watch beacon & test/silence pushbuttons
    # -------------------------------------------------------------------------
    ab = SubassemblyBuilder(root, 'Alarm_Buzzer', m)
    ax, ay, az = 0.02, -0.14, 0.55
    ab.box((0.18, 0.12, 0.04), (ax, ay, az), 'iron', rot=(0.28, 0, 0))
    ab.cyl(0.026, 0.036, (ax - 0.04, ay - 0.02, az + 0.03), 'status_red', rot=(0.28, 0, 0), verts=18)
    ab.cyl(0.022, 0.030, (ax + 0.04, ay - 0.02, az + 0.03), 'safety_yellow', rot=(0.28, 0, 0), verts=18)
    ab.finalize(parts)

    # -------------------------------------------------------------------------
    # 4. Radar_Pedestal
    # Tapered white scanner mast pedestal column, deck flange, service hatch
    # -------------------------------------------------------------------------
    rp = SubassemblyBuilder(root, 'Radar_Pedestal', m)
    px, py = 0.38, 0.06
    rp.cyl(0.18, 0.04, (px, py, 0.02), 'steel', axis='Z', verts=24)
    rp.cyl(0.115, 0.54, (px, py, 0.30), 'white_dial', axis='Z', verts=28)
    rp.box((0.09, 0.02, 0.18), (px, py - 0.11, 0.28), 'pebble_grey')  # Inspection door
    for zz in [0.10, 0.42]:
        rp.ring(0.116, 0.008, (px, py, zz), 'steel', axis='Z')
    for j in range(8):
        a = j * 2 * math.pi / 8
        rp.cyl(0.009, 0.020, (px + 0.15 * math.cos(a), py + 0.15 * math.sin(a), 0.035), 'iron', axis='Z', verts=12)
    rp.box((0.062, 0.008, 0.025), (px, py - 0.128, 0.27), 'orange')
    rp.finalize(parts)

    # -------------------------------------------------------------------------
    # 5. Gearbox_Housing
    # S-Band transceiver & harmonic turning gearbox with safety isolator switch
    # -------------------------------------------------------------------------
    gh = SubassemblyBuilder(root, 'Gearbox_Housing', m)
    px, py = 0.38, 0.06
    gh.box((0.22, 0.24, 0.15), (px, py, 0.64), 'pebble_grey')
    for i in range(4):
        gh.box((0.24, 0.015, 0.11), (px, py - 0.08 + i * 0.05, 0.64), 'steel')
    gh.box((0.05, 0.04, 0.06), (px - 0.12, py - 0.06, 0.63), 'safety_yellow')  # Safety switch
    gh.cyl(0.075, 0.06, (px, py, 0.74), 'iron', axis='Z', verts=24)               # Rotary neck joint
    for j in range(6):
        gh.box((0.13, 0.008, 0.008), (px, py - 0.125, 0.592 + j * 0.019), 'dark_plinth')
    for xx in [px - 0.08, px + 0.08]:
        for yy in [py - 0.09, py + 0.09]:
            gh.cyl(0.009, 0.014, (xx, yy, 0.721), 'steel', axis='Z', verts=12)
    gh.box((0.12, 0.008, 0.023), (px, py - 0.128, 0.687), 'orange')
    gh.finalize(parts)

    # -------------------------------------------------------------------------
    # 6. Rotating_S-Band_Scanner_Bar
    # 12-Foot aerodynamic S-Band slotted waveguide antenna array with red tips
    # (Pivot is set at the center of the masthead neck so it spins horizontally)
    # -------------------------------------------------------------------------
    sb = SubassemblyBuilder(root, 'Rotating_S-Band_Scanner_Bar', m, pivot=(0.38, 0.06, 0.80))
    px, py, sz = 0.38, 0.06, 0.80
    sb.box((0.16, 0.14, 0.06), (px, py, sz - 0.02), 'steel')
    sb.box((1.12, 0.09, 0.065), (px, py, sz + 0.02), 'white_dial')
    sb.box((1.02, 0.012, 0.038), (px, py - 0.050, sz + 0.02), 'dark_plinth')  # Waveguide slot face
    for ex in [px - 0.56, px + 0.56]:
        sb.box((0.04, 0.09, 0.08), (ex, py, sz + 0.02), 'status_red')          # Red aerodynamic end-caps
    # Slotted waveguide slots, end-cap rivets and central feed joint
    for j in range(28):
        xx = px - 0.49 + j * 0.036
        sb.box((0.019, 0.003, 0.004), (xx, py - 0.057, sz + 0.021), 'steel')
    sb.cyl(0.048, 0.065, (px, py, sz - 0.055), 'steel', axis='Z', verts=32)
    sb.cyl(0.025, 0.018, (px, py, sz + 0.064), 'dark_plinth', axis='Z', verts=32)
    for xx in [px - 0.52, px + 0.52]:
        sb.cyl(0.006, 0.018, (xx, py - 0.049, sz + 0.021), 'steel', axis='Y', verts=12)
    sb.finalize(parts)

    # -------------------------------------------------------------------------
    # Export to GLB
    # -------------------------------------------------------------------------
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root

    bpy.ops.export_scene.gltf(
        filepath=EXPORT_PATH,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True
    )
    set_material_preview()
    print(f"SUCCESS: Exported {EXPORT_PATH} ({len(parts)} batched mesh objects)")


if __name__ == '__main__':
    build_bridge_navcom_suite()
