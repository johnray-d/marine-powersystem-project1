"""
Standalone Blender Python script to model and export the:
Engine Room Heavy Axial Ventilation Fan & Local Starter Box
Output: public/vent_fan_assembly.glb

Can be run:
  1. From CLI:
     "D:\\Blender\\blender.exe" --background --python scripts/generate_vent_fan.py
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
  1. Fan_Cylindrical_Casing  (Stationary: duct casing, saddle feet, bellmouth, inspection hatch)
  2. Flange_Rings            (Stationary: front/rear companion flanges with 12-bolt rings)
  3. Axial_Impeller_Blades   (Rotating: 8-blade pitched aerofoil impeller & nose cone, pivot=(0, -0.16, 0.44))
  4. 440V_Drive_Motor        (Stationary: in-stream flange motor, guide-vane struts, terminal box)
  5. Local_Starter_Enclosure (Stationary: switchboard-style Star-Delta starter box, meter, LCD, pilot lamps)
  6. Fire_Damper_Actuator    (Stationary: SOLAS quick-closing spring actuator & linkage)
"""

import bpy
import math
import os
from mathutils import Vector, Euler

# Automatically determine output directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..')) if os.path.basename(SCRIPT_DIR) == 'scripts' else SCRIPT_DIR
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public')
os.makedirs(PUBLIC_DIR, exist_ok=True)
EXPORT_PATH = os.path.join(PUBLIC_DIR, 'vent_fan_assembly.glb')


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
    """Marine machinery & switchboard PBR color palette."""
    return {
        'pebble_grey':   make_material('PebbleGrey',   (0.65, 0.68, 0.62), 0.35, 0.42),
        'dark_plinth':   make_material('DarkPlinth',   (0.14, 0.17, 0.21), 0.40, 0.48),
        'iron':          make_material('Iron',         (0.24, 0.30, 0.32), 0.45, 0.42),
        'steel':         make_material('Steel',        (0.72, 0.76, 0.78), 0.58, 0.32),
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
        'phase_blue':    make_material('PhaseBlue',    (0.24, 0.48, 0.68), 0.45, 0.36),
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

    def gauge(self, x, y, z, w=0.075):
        self.box((w, 0.016, w), (x, y, z), 'dark_plinth')
        self.box((w * 0.80, 0.006, w * 0.80), (x, y - 0.008, z), 'white_dial')
        self.box((0.004, 0.004, w * 0.36), (x + w * 0.08, y - 0.012, z + w * 0.05), 'dark_plinth', rot=(0, -0.55, 0))
        self.cyl(0.006, 0.006, (x, y - 0.012, z - w * 0.18), 'iron', axis='Y', verts=12)

    def lcd_panel(self, x, y, z, w=0.15, h=0.095):
        self.box((w, 0.022, h), (x, y, z), 'dark_plinth')
        self.box((w * 0.76, 0.006, h * 0.56), (x - w * 0.04, y - 0.010, z + h * 0.08), 'cyan_lcd')
        for i in range(4):
            bx = x - w * 0.28 + i * (w * 0.18)
            self.box((w * 0.11, 0.006, h * 0.11), (bx, y - 0.011, z - h * 0.28), 'white_dial')

    def pilot_lights(self, x, y, z, dx=0.042):
        self.cyl(0.012, 0.014, (x - dx, y, z + 0.015), 'status_red', axis='Y', verts=14)
        self.cyl(0.012, 0.014, (x,      y, z + 0.015), 'status_green', axis='Y', verts=14)
        self.cyl(0.012, 0.014, (x + dx, y, z + 0.015), 'safety_yellow', axis='Y', verts=14)
        self.cyl(0.018, 0.018, (x, y, z - 0.032), 'dark_plinth', axis='Y', verts=16)
        self.box((0.008, 0.014, 0.028), (x, y - 0.010, z - 0.032), 'steel')

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


# V2 modeling utilities: watertight hollow rings and lofted pitched blades.
def annular_shell(builder, outer, inner, length, center, material, axis='Y', segments=96):
    """True hollow cylinder (no opaque disc obstructing airflow)."""
    verts = []
    faces = []
    for side in (-1, 1):
        for radius in (outer, inner):
            for j in range(segments):
                a = 2 * math.pi * j / segments
                if axis == 'Y':
                    verts.append((center[0] + radius * math.cos(a), center[1] + side * length / 2, center[2] + radius * math.sin(a)))
                else:
                    verts.append((center[0] + radius * math.cos(a), center[1] + radius * math.sin(a), center[2] + side * length / 2))
    def ring(k, j): return k * segments + j % segments
    for j in range(segments):
        n = (j + 1) % segments
        for a, b in [(0, 2), (1, 3), (0, 1), (2, 3)]:
            faces.append((ring(a, j), ring(a, n), ring(b, n), ring(b, j)))
    mesh = bpy.data.meshes.new('AnnularShell')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('AnnularShell', mesh)
    bpy.context.collection.objects.link(obj)
    return builder._add(obj, builder.m[material])


def aerofoil_blade(builder, center, angle, inner_r, outer_r, mat_key, sweep=0.035, chord_root=0.13, chord_tip=0.075):
    """Lofted blade in the XZ plane with changing chord, pitch and thickness."""
    sections = 10
    around = 12
    vertices = []
    faces = []
    for i in range(sections + 1):
        t = i / sections
        r = inner_r + (outer_r - inner_r) * t
        chord = chord_root * (1 - t) + chord_tip * t
        theta = angle + sweep * t
        radial = Vector((math.cos(theta), 0, math.sin(theta)))
        tang = Vector((-math.sin(theta), 0, math.cos(theta)))
        pitch = math.radians(34 - 15 * t)
        for j in range(around):
            phi = 2 * math.pi * j / around
            u = math.cos(phi)
            thick = 0.012 * (1 - 0.65 * t) * math.sin(phi)
            p = Vector(center) + radial * r + tang * (u * chord / 2 * math.cos(pitch))
            p.y += u * chord / 2 * math.sin(pitch) + thick + 0.007 * (1 - u * u)
            vertices.append(tuple(p))
    for i in range(sections):
        for j in range(around):
            a = i * around + j
            b = i * around + (j + 1) % around
            faces.append((a, b, b + around, a + around))
    faces.append(tuple(reversed(tuple(range(around)))))
    faces.append(tuple(sections * around + j for j in range(around)))
    mesh = bpy.data.meshes.new('BladeLoft')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('BladeLoft', mesh)
    bpy.context.collection.objects.link(obj)
    return builder._add(obj, builder.m[mat_key])


def pipe_between(builder, start, end, radius, material, verts=12):
    a, b = Vector(start), Vector(end)
    d = b - a
    obj = builder.cyl(radius, d.length, (a + b) / 2, material, verts=verts)
    obj.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return obj


def set_material_preview():
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.type = 'SOLID'
                area.spaces.active.shading.color_type = 'MATERIAL'


def build_vent_fan_assembly():
    """Build the entire 6-part assembly and export to GLB."""
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Vent_Fan_Assembly', None)
    bpy.context.collection.objects.link(root)
    parts = []
    fz = 0.44  # Centerline height of the fan duct above the floor

    # -------------------------------------------------------------------------
    # 1. Fan_Cylindrical_Casing
    # Duct trunking on saddle feet, stiffening rings, intake bellmouth & hatch
    # -------------------------------------------------------------------------
    fc = SubassemblyBuilder(root, 'Fan_Cylindrical_Casing', m)
    # Foundation base plate & saddle supports
    fc.box((0.76, 0.52, 0.05), (0, 0, 0.025), 'dark_plinth')
    for sx in [-0.26, 0.26]:
        fc.box((0.06, 0.44, 0.26), (sx, 0, 0.16), 'dark_plinth')
    # Outer cylindrical casing & dark interior bore (hollow shells)
    annular_shell(fc, 0.32, 0.286, 0.52, (0, 0, fz), 'pebble_grey')
    annular_shell(fc, 0.288, 0.284, 0.52, (0, 0, fz), 'dark_plinth')
    # External rolled stiffening bands
    for ry in [-0.14, 0.0, 0.14]:
        fc.ring(0.325, 0.014, (0, ry, fz), 'steel', axis='Y')
    # Top inspection access door
    fc.box((0.20, 0.18, 0.04), (0, 0, fz + 0.32), 'steel')
    # Front bellmouth inlet profile & wire guard rings
    fc.ring(0.335, 0.024, (0, -0.27, fz), 'steel', axis='Y')
    fc.ring(0.22, 0.008, (0, -0.285, fz), 'steel', axis='Y')
    fc.finalize(parts)

    # -------------------------------------------------------------------------
    # 2. Flange_Rings
    # Drilled DIN companion duct flanges at both ends with 12-bolt patterns
    # -------------------------------------------------------------------------
    fr = SubassemblyBuilder(root, 'Flange_Rings', m)
    for fy in [-0.26, 0.26]:
        annular_shell(fr, 0.365, 0.287, 0.024, (0, fy, fz), 'iron')
        for i in range(12):
            ang = i * (2.0 * math.pi / 12.0)
            bx = 0.345 * math.cos(ang)
            bz = fz + 0.345 * math.sin(ang)
            fr.cyl(0.010, 0.036, (bx, fy, bz), 'steel', axis='Y', verts=8)
    fr.finalize(parts)

    # -------------------------------------------------------------------------
    # 3. Axial_Impeller_Blades
    # Cast-bronze hub, spinner nose cone & 8 pitched aerofoil blades
    # (Pivot is set at the shaft center so it can spin around the Y axis)
    # -------------------------------------------------------------------------
    imp = SubassemblyBuilder(root, 'Axial_Impeller_Blades', m, pivot=(0.0, -0.16, fz))
    imp.cyl(0.095, 0.10, (0, -0.16, fz), 'gold_brass', axis='Y', verts=24)
    imp.cyl(0.065, 0.06, (0, -0.22, fz), 'steel', axis='Y', verts=20)
    for i in range(8):
        aerofoil_blade(imp, (0, -0.16, fz), i * 2 * math.pi / 8, 0.078, 0.276, 'gold_brass', sweep=0.09)
    # Nose spinner with stepped concentric metal cap & perimeter retention bolts
    imp.cyl(0.045, 0.035, (0, -0.266, fz), 'steel', axis='Y', verts=40)
    for j in range(8):
        a = j * 2 * math.pi / 8
        imp.cyl(0.007, 0.012, (0.065 * math.cos(a), -0.221, fz + 0.065 * math.sin(a)), 'steel', axis='Y', verts=10)
    imp.finalize(parts)

    # -------------------------------------------------------------------------
    # 4. 440V_Drive_Motor
    # In-stream totally enclosed marine motor on 4 aerodynamic support guide vanes
    # -------------------------------------------------------------------------
    dm = SubassemblyBuilder(root, '440V_Drive_Motor', m)
    dm.cyl(0.135, 0.26, (0, 0.06, fz), 'phase_blue', axis='Y', verts=24)
    for i in range(4):
        ang = i * (math.pi / 2.0) + math.pi / 4.0
        sx = 0.21 * math.cos(ang)
        sz = fz + 0.21 * math.sin(ang)
        dm.box((0.022, 0.08, 0.16), (sx, 0.06, sz), 'steel', rot=(0, -ang, 0))
    dm.box((0.10, 0.12, 0.07), (0, 0.06, fz + 0.35), 'iron')  # Top terminal box
    # Cast motor end bells, ribs, cooling vents, shaft stub and cable glands
    for yy in [-0.07, 0.18]:
        dm.cyl(0.142, 0.018, (0, yy, fz), 'steel', axis='Y', verts=48)
    for j in range(16):
        a = j * 2 * math.pi / 16
        dm.box((0.012, 0.19, 0.016), (0.142 * math.cos(a), 0.07, fz + 0.142 * math.sin(a)), 'blue_coat', rot=(0, a, 0))
    dm.cyl(0.025, 0.10, (0, -0.13, fz), 'steel', axis='Y', verts=32)
    dm.cyl(0.028, 0.04, (0, 0.215, fz), 'copper', axis='Y', verts=24)
    for xx in [-0.03, 0.03]:
        dm.cyl(0.015, 0.035, (xx, 0.06, fz + 0.397), 'rubber', axis='Z')
    dm.finalize(parts)

    # -------------------------------------------------------------------------
    # 5. Local_Starter_Enclosure
    # Star-Delta starter cubicle with analog ammeter, LCD, and pilot lamps
    # -------------------------------------------------------------------------
    ls = SubassemblyBuilder(root, 'Local_Starter_Enclosure', m)
    lx = 0.45
    ls.box((0.18, 0.24, 0.34), (lx, -0.02, fz), 'pebble_grey')
    ls.box((0.20, 0.26, 0.020), (lx, -0.02, fz + 0.18), 'steel')  # Drip canopy
    ls.gauge(lx, -0.145, fz + 0.09, w=0.065)                        # Ammeter
    ls.lcd_panel(lx, -0.145, fz - 0.01, w=0.11, h=0.06)            # Control display
    ls.pilot_lights(lx, -0.145, fz - 0.09, dx=0.036)               # Red/Green/Amber lamps
    ls.box((0.10, 0.04, 0.025), (0.35, -0.02, fz), 'iron')         # Mounting bracket to casing
    # Hinges, gasketed door, isolator handle, labels and ventilation louvres
    ls.box((0.168, 0.009, 0.308), (lx, -0.151, fz), 'blue_coat')
    for zz in [fz - 0.115, fz + 0.115]:
        ls.cyl(0.009, 0.038, (lx - 0.089, -0.154, zz), 'steel', axis='Z')
    for zz in [fz - 0.135, fz - 0.120, fz - 0.105]:
        ls.box((0.09, 0.008, 0.005), (lx, -0.160, zz), 'dark_plinth')
    ls.box((0.035, 0.014, 0.012), (lx + 0.075, -0.162, fz), 'orange')
    ls.box((0.14, 0.008, 0.022), (lx, -0.163, fz + 0.145), 'safety_yellow')
    ls.finalize(parts)

    # -------------------------------------------------------------------------
    # 6. Fire_Damper_Actuator
    # SOLAS fail-safe spring-return pneumatic actuator & mechanical linkage
    # -------------------------------------------------------------------------
    fd = SubassemblyBuilder(root, 'Fire_Damper_Actuator', m)
    dx = -0.43
    fd.box((0.14, 0.18, 0.24), (dx, 0.0, fz), 'status_red')
    fd.cyl(0.045, 0.20, (dx, 0.0, fz + 0.15), 'gold_brass', axis='Z', verts=18)
    fd.box((0.08, 0.02, 0.08), (dx, -0.10, fz + 0.04), 'safety_yellow')
    fd.cyl(0.018, 0.14, (-0.35, 0.0, fz), 'steel', axis='X', verts=14)
    for zz in [fz - 0.06, fz + 0.06]:
        pipe_between(fd, (-0.42, 0.10, zz), (-0.29, 0.10, zz), 0.008, 'steel')
    fd.box((0.12, 0.01, 0.03), (dx, -0.097, fz - 0.065), 'white_dial')
    fd.finalize(parts)

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
    build_vent_fan_assembly()
