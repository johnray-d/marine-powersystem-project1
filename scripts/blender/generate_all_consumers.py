"""
Master 3D Marine Electrical Equipment Geometry Generator for Blender 4.x / 5.x LTS.
Builds and exports 8 high-detail, multi-material marine electrical consumer assemblies:
 1. ESB_Cubicle            -> public/esb_cubicle.glb
 2. Battery_System         -> public/battery_system.glb
 3. Air_Compressor_Skid    -> public/air_compressor_skid.glb
 4. Vent_Fan_Assembly      -> public/vent_fan_assembly.glb
 5. Ballast_OWS_Skid       -> public/ballast_ows_skid.glb
 6. Galley_Board_Assembly  -> public/galley_board_assembly.glb
 7. Shore_Power_Reel       -> public/shore_power_reel.glb
 8. Bridge_NavCom_Suite    -> public/bridge_navcom_suite.glb

Axis Convention:
  X = horizontal width (-X left, +X right)
  Y = horizontal depth (-Y is FRONT facing camera -> exports to +Z in Three.js with export_yup=True)
  Z = vertical height (+Z is UP -> exports to +Y in Three.js)
"""
import bpy
import math
import os
from mathutils import Vector, Euler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..')) if os.path.basename(SCRIPT_DIR) == 'blender' else os.path.abspath(os.path.join(SCRIPT_DIR, '..'))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'public', 'models')
os.makedirs(PUBLIC_DIR, exist_ok=True)


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0


def make_material(name, rgba, metallic=0.40, roughness=0.38):
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
    """Marine switchboard & machinery PBR palette matching equipment-models.ts."""
    return {
        'pebble_grey':  make_material('PebbleGrey',  (0.65, 0.68, 0.62), 0.35, 0.42),
        'light_green':  make_material('LightGreen',  (0.53, 0.64, 0.58), 0.35, 0.40),
        'dark_plinth':  make_material('DarkPlinth',  (0.14, 0.17, 0.21), 0.40, 0.48),
        'iron':         make_material('Iron',        (0.24, 0.30, 0.32), 0.45, 0.42),
        'steel':        make_material('Steel',       (0.72, 0.76, 0.78), 0.58, 0.32),
        'stainless':    make_material('Stainless',   (0.82, 0.85, 0.88), 0.62, 0.28),
        'copper':       make_material('Copper',      (0.80, 0.52, 0.24), 0.72, 0.28),
        'gold_brass':   make_material('GoldBrass',   (0.80, 0.64, 0.28), 0.68, 0.30),
        'white_dial':   make_material('WhiteDial',   (0.90, 0.91, 0.88), 0.10, 0.45),
        'cyan_lcd':     make_material('CyanLcd',     (0.22, 0.75, 0.96), 0.15, 0.20),
        'status_green': make_material('StatusGreen', (0.14, 0.78, 0.38), 0.20, 0.32),
        'status_red':   make_material('StatusRed',   (0.86, 0.22, 0.18), 0.25, 0.34),
        'safety_yellow':make_material('SafetyYellow',(0.92, 0.74, 0.20), 0.25, 0.38),
        'phase_blue':   make_material('PhaseBlue',   (0.24, 0.48, 0.68), 0.45, 0.36),
        'motor_green':  make_material('MotorGreen',  (0.28, 0.48, 0.41), 0.42, 0.38),
        'cable_black':  make_material('CableBlack',  (0.10, 0.12, 0.14), 0.20, 0.58),
        'rubber':       make_material('RubberBlack',  (0.035, 0.046, 0.053), 0.02, 0.82),
        'blue_coat':    make_material('MarineBlueCoating', (0.12, 0.32, 0.48), 0.34, 0.32),
        'orange':       make_material('SafetyOrange', (0.94, 0.38, 0.07), 0.16, 0.43),
    }


class SubassemblyBuilder:
    """
    Collects detailed primitive meshes for a single logical subassembly, batches them
    by material into single-material Blender Mesh objects named `<sub_name>` and
    `<sub_name>__<MatName>`, and sets exact origins for stationary or rotating parts.
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
        """Square marine switchboard analog meter facing -Y (front)."""
        self.box((w, 0.016, w), (x, y, z), 'dark_plinth')
        self.box((w * 0.80, 0.006, w * 0.80), (x, y - 0.008, z), 'white_dial')
        self.box((0.004, 0.004, w * 0.36), (x + w * 0.08, y - 0.012, z + w * 0.05), 'dark_plinth', rot=(0, -0.55, 0))
        self.cyl(0.006, 0.006, (x, y - 0.012, z - w * 0.18), 'iron', axis='Y', verts=12)

    def round_gauge(self, x, y, z, r=0.042):
        """Circular pressure / vacuum / ammeter gauge facing -Y."""
        self.cyl(r, 0.018, (x, y, z), 'dark_plinth', axis='Y', verts=20)
        self.cyl(r * 0.82, 0.006, (x, y - 0.008, z), 'white_dial', axis='Y', verts=20)
        self.box((0.004, 0.005, r * 0.65), (x + r * 0.12, y - 0.012, z + r * 0.10), 'status_red', rot=(0, -0.6, 0))

    def lcd_panel(self, x, y, z, w=0.15, h=0.095):
        """Microprocessor protection relay / PMS LCD screen facing -Y."""
        self.box((w, 0.022, h), (x, y, z), 'dark_plinth')
        self.box((w * 0.76, 0.006, h * 0.56), (x - w * 0.04, y - 0.010, z + h * 0.08), 'cyan_lcd')
        for i in range(4):
            bx = x - w * 0.28 + i * (w * 0.18)
            self.box((w * 0.11, 0.006, h * 0.11), (bx, y - 0.011, z - h * 0.28), 'white_dial')

    def pilot_lights(self, x, y, z, dx=0.042):
        """Red (TRIP), Green (CLOSED/RUN), Yellow (SYNC/READY) indicator lamps + rotary switch."""
        self.cyl(0.012, 0.014, (x - dx, y, z + 0.015), 'status_red', axis='Y', verts=14)
        self.cyl(0.012, 0.014, (x,      y, z + 0.015), 'status_green', axis='Y', verts=14)
        self.cyl(0.012, 0.014, (x + dx, y, z + 0.015), 'safety_yellow', axis='Y', verts=14)
        self.cyl(0.018, 0.018, (x, y, z - 0.032), 'dark_plinth', axis='Y', verts=16)
        self.box((0.008, 0.014, 0.028), (x, y - 0.010, z - 0.032), 'steel')

    def louvers(self, x, y, z_bottom, w=0.22, count=5, dz=0.022):
        """Horizontal switchboard door ventilation louver slats facing -Y."""
        for i in range(count):
            self.box((w, 0.006, 0.009), (x, y, z_bottom + i * dz), 'iron')

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


def export_model(root_empty, child_objects, filename):
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.select_all(action='DESELECT')
    root_empty.select_set(True)
    for o in child_objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root_empty
    export_path = os.path.join(PUBLIC_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=export_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True
    )
    print(f"SUCCESS: Exported {filename} ({len(child_objects)} batched meshes) to {export_path}")


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


# ============================================================================
# 1. 440 V Emergency Switchboard (ESB) Cubicle & Interlock Panel
#    Styled to match the 3-bay IEC 60092 marine switchboards (lv-board / hv-board)
# ============================================================================
def build_esb_cubicle():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('ESB_Cubicle', None)
    bpy.context.collection.objects.link(root)
    parts = []
    bays = [-0.42, 0.0, 0.42]

    # 1. ESB_Frame: 3-bay pebble-grey switchboard enclosure, dark plinth, IP22 canopy & SOLAS red header
    f = SubassemblyBuilder(root, 'ESB_Frame', m)
    f.box((1.30, 0.52, 0.07), (0, 0, 0.035), 'dark_plinth')
    f.box((1.28, 0.50, 0.04), (0, 0, 0.94), 'pebble_grey')
    f.box((1.28, 0.025, 0.87), (0, 0.24, 0.505), 'pebble_grey')
    for x in [-0.63, -0.21, 0.21, 0.63]:
        f.box((0.024, 0.49, 0.87), (x, 0, 0.505), 'pebble_grey')
        f.box((0.042, 0.028, 0.88), (x, -0.245, 0.505), 'steel')
    for z in [0.22, 0.60]:
        f.box((1.25, 0.46, 0.018), (0, 0.01, z), 'steel')
    # Top IP22 drip canopy & cable tray
    f.box((1.34, 0.56, 0.025), (0, -0.01, 0.975), 'steel')
    f.box((1.35, 0.03, 0.055), (0, -0.28, 0.96), 'pebble_grey')
    f.box((1.28, 0.015, 0.032), (0, -0.288, 0.962), 'status_red')  # SOLAS Emergency Board red stripe
    f.box((1.22, 0.18, 0.018), (0, 0.08, 1.015), 'steel')
    for x in [-0.5, -0.25, 0.0, 0.25, 0.5]:
        f.box((0.015, 0.17, 0.015), (x, 0.08, 1.025), 'iron')
    f.finalize(parts)

    # 2. ESB_Door: Bay 1 open 110 deg exposing ACB; Bay 2 & Bay 3 closed with windows, handles, mimic & louvers
    d = SubassemblyBuilder(root, 'ESB_Door', m)
    # Bay 1 hinged open door (-X, -Y)
    d.box((0.022, 0.38, 0.36), (-0.64, -0.43, 0.76), 'pebble_grey', rot=(0, 0, -0.35))
    d.box((0.022, 0.38, 0.46), (-0.64, -0.43, 0.33), 'pebble_grey', rot=(0, 0, -0.35))
    d.box((0.025, 0.04, 0.11), (-0.70, -0.58, 0.68), 'steel', rot=(0, 0, -0.35))
    d.box((0.025, 0.04, 0.11), (-0.70, -0.58, 0.36), 'steel', rot=(0, 0, -0.35))
    # Bays 2 & 3 closed doors at front (-Y = -0.255)
    for bx in [0.0, 0.42]:
        d.box((0.39, 0.020, 0.34), (bx, -0.255, 0.76), 'pebble_grey')
        d.box((0.39, 0.020, 0.47), (bx, -0.255, 0.335), 'pebble_grey')
        # Breaker inspection window
        d.box((0.20, 0.016, 0.18), (bx, -0.268, 0.41), 'dark_plinth')
        d.box((0.16, 0.008, 0.14), (bx, -0.275, 0.41), 'steel')
        # Vertical chrome handles
        for hz in [0.38, 0.70]:
            d.box((0.018, 0.036, 0.10), (bx + 0.16, -0.275, hz), 'steel')
        # Bottom ventilation louvers
        d.louvers(bx, -0.268, 0.13, w=0.26, count=5, dz=0.022)
        # Mimic bus diagram lines (SOLAS red & black)
        d.box((0.32, 0.008, 0.010), (bx, -0.268, 0.56), 'status_red')
        d.box((0.010, 0.008, 0.14), (bx, -0.268, 0.49), 'dark_plinth')
        d.box((0.24, 0.032, 0.008), (bx, -0.268, 0.90), 'iron')
    d.finalize(parts)

    # 3. ESB_Busbar_A: Port/Left 3-phase copper busbars + Red/Yellow/Blue phase sleeves + insulators
    ba = SubassemblyBuilder(root, 'ESB_Busbar_A', m)
    phase_mats = ['status_red', 'safety_yellow', 'phase_blue']
    for i, py in enumerate([0.04, 0.11, 0.18]):
        ba.box((0.62, 0.032, 0.030), (-0.30, py, 0.78 - i * 0.045), 'copper')
        ba.box((0.045, 0.038, 0.036), (-0.42, py, 0.78 - i * 0.045), phase_mats[i])
        ba.box((0.030, 0.030, 0.24), (-0.42 + (i - 1) * 0.08, py, 0.64), 'copper')
        ba.cyl(0.022, 0.11, (-0.42 + (i - 1) * 0.08, py, 0.72), 'status_red', axis='Z', verts=16)
    ba.finalize(parts)

    # 4. ESB_Busbar_B: Starboard/Right 3-phase copper busbars + phase sleeves + insulators
    bb = SubassemblyBuilder(root, 'ESB_Busbar_B', m)
    for i, py in enumerate([0.04, 0.11, 0.18]):
        bb.box((0.62, 0.032, 0.030), (0.30, py, 0.78 - i * 0.045), 'copper')
        bb.box((0.045, 0.038, 0.036), (0.42, py, 0.78 - i * 0.045), phase_mats[i])
        bb.box((0.030, 0.030, 0.24), (0.42 + (i - 1) * 0.08, py, 0.64), 'copper')
        bb.cyl(0.022, 0.11, (0.42 + (i - 1) * 0.08, py, 0.72), 'status_red', axis='Z', verts=16)
    bb.finalize(parts)

    # 5. ESB_Tie_ACB: Bay 1 exposed withdrawable ACB on rails + Bay 2 ABT contactor + Bay 3 MCCB bank
    acb = SubassemblyBuilder(root, 'ESB_Tie_ACB', m)
    # Bay 1 withdrawable ACB
    for rx in [-0.54, -0.30]:
        acb.box((0.022, 0.36, 0.024), (rx, -0.06, 0.24), 'steel')
    acb.box((0.28, 0.26, 0.28), (-0.42, -0.04, 0.39), 'dark_plinth')
    acb.box((0.24, 0.020, 0.22), (-0.42, -0.18, 0.39), 'iron')
    acb.lcd_panel(-0.45, -0.19, 0.43, w=0.10, h=0.06)
    acb.cyl(0.015, 0.018, (-0.48, -0.195, 0.33), 'status_red', axis='Y', verts=14)
    acb.cyl(0.015, 0.018, (-0.36, -0.195, 0.33), 'status_green', axis='Y', verts=14)
    acb.box((0.06, 0.015, 0.025), (-0.35, -0.195, 0.43), 'safety_yellow')
    # Top arc chutes
    for px in [-0.50, -0.42, -0.34]:
        acb.box((0.055, 0.16, 0.055), (px, -0.04, 0.55), 'steel')
    # Bay 2 ABT automatic bus transfer contactors + Bay 3 feeder MCCBs
    acb.box((0.26, 0.20, 0.24), (0.0, -0.04, 0.39), 'iron')
    for mx in [0.33, 0.42, 0.51]:
        for mz in [0.32, 0.46]:
            acb.box((0.07, 0.14, 0.11), (mx, -0.06, mz), 'dark_plinth')
            acb.box((0.018, 0.035, 0.035), (mx, -0.14, mz), 'steel')
    acb.finalize(parts)

    # 6. ESB_Metering_Panel: 9 analog gauges, 3 cyan LCD relays & pilot lamps across all 3 bays
    mp = SubassemblyBuilder(root, 'ESB_Metering_Panel', m)
    for bx in bays:
        for gx in [-0.10, 0.0, 0.10]:
            mp.gauge(bx + gx, -0.268, 0.84, w=0.072)
        mp.lcd_panel(bx, -0.268, 0.72, w=0.16, h=0.09)
        mp.pilot_lights(bx, -0.268, 0.63, dx=0.048)
    mp.finalize(parts)

    # 7. ESB_Control_Wiring: Toroidal CTs, DIN terminal strips, bottom gland plate & copper earth bar
    cw = SubassemblyBuilder(root, 'ESB_Control_Wiring', m)
    cw.box((1.18, 0.26, 0.022), (0, 0.02, 0.09), 'steel')
    cw.box((1.16, 0.026, 0.026), (0, -0.14, 0.08), 'copper')
    for bx in bays:
        cw.box((0.28, 0.06, 0.024), (bx, -0.08, 0.56), 'pebble_grey')
        for dx in [-0.08, 0.0, 0.08]:
            cw.ring(0.034, 0.014, (bx + dx, 0.06, 0.26), 'gold_brass', axis='Z')
            cw.cyl(0.018, 0.18, (bx + dx, 0.02, 0.14), 'cable_black', axis='Z', verts=14)
            cw.cyl(0.024, 0.04, (bx + dx, 0.02, 0.10), 'gold_brass', axis='Z', verts=14)
    cw.finalize(parts)

    export_model(root, parts, 'esb_cubicle.glb')


# ============================================================================
# 2. 24 V DC Battery Bank Racks & GMDSS / UPS Charger Cabinet
# ============================================================================
def build_battery_system():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Battery_System', None)
    bpy.context.collection.objects.link(root)
    parts = []

    # 1. Battery_Rack_Frame: Open 2-tier seismic steel rack + acid trays + overhead vent hood
    rf = SubassemblyBuilder(root, 'Battery_Rack_Frame', m)
    rf.box((0.78, 0.48, 0.05), (-0.22, 0, 0.025), 'dark_plinth')
    for rx in [-0.58, 0.14]:
        for ry in [-0.21, 0.21]:
            rf.box((0.032, 0.032, 0.82), (rx, ry, 0.44), 'iron')
    for tz in [0.10, 0.46]:
        rf.box((0.74, 0.44, 0.035), (-0.22, 0, tz), 'iron')
        rf.box((0.75, 0.022, 0.055), (-0.22, -0.22, tz + 0.09), 'safety_yellow')
    # Top ATEX battery exhaust hood
    rf.box((0.78, 0.48, 0.04), (-0.22, 0, 0.86), 'pebble_grey')
    rf.cyl(0.065, 0.09, (-0.22, 0.05, 0.92), 'steel', axis='Z', verts=20)
    rf.finalize(parts)

    # 2. Battery_Cell_01_12: 12 distinct 2V VRLA marine cells (6 per tier) with terminals & sight glasses
    bc = SubassemblyBuilder(root, 'Battery_Cell_01_12', m)
    for tier_z in [0.24, 0.60]:
        for i in range(6):
            cx = -0.50 + i * 0.112
            bc.box((0.096, 0.34, 0.22), (cx, 0.0, tier_z), 'pebble_grey')
            bc.box((0.098, 0.35, 0.028), (cx, 0.0, tier_z + 0.115), 'phase_blue')
            bc.box((0.042, 0.008, 0.09), (cx, -0.172, tier_z), 'white_dial')
            bc.cyl(0.014, 0.035, (cx - 0.024, -0.09, tier_z + 0.14), 'gold_brass', axis='Z', verts=12)
            bc.cyl(0.014, 0.035, (cx + 0.024,  0.09, tier_z + 0.14), 'gold_brass', axis='Z', verts=12)
    bc.finalize(parts)

    # 3. DC_Busbar_Positive: Red insulated positive inter-cell copper links, collector bar & HRC fuse
    pos = SubassemblyBuilder(root, 'DC_Busbar_Positive', m)
    for tier_z in [0.39, 0.75]:
        pos.box((0.64, 0.028, 0.016), (-0.22, -0.09, tier_z), 'copper')
        for i in range(3):
            pos.box((0.12, 0.034, 0.022), (-0.44 + i * 0.224, -0.09, tier_z + 0.005), 'status_red')
    pos.box((0.028, 0.028, 0.42), (0.12, -0.09, 0.56), 'status_red')
    pos.box((0.065, 0.05, 0.08), (0.12, -0.14, 0.56), 'white_dial')
    pos.finalize(parts)

    # 4. DC_Busbar_Negative: Black negative inter-cell links, copper collector & calibrated brass shunt
    neg = SubassemblyBuilder(root, 'DC_Busbar_Negative', m)
    for tier_z in [0.39, 0.75]:
        neg.box((0.64, 0.028, 0.016), (-0.22, 0.09, tier_z), 'copper')
        for i in range(3):
            neg.box((0.12, 0.034, 0.022), (-0.33 + i * 0.224, 0.09, tier_z + 0.005), 'cable_black')
    neg.box((0.028, 0.028, 0.42), (0.12, 0.09, 0.56), 'cable_black')
    neg.box((0.08, 0.04, 0.04), (0.06, -0.14, 0.39), 'gold_brass')
    neg.finalize(parts)

    # 5. Charger_Cabinet: Switchboard-style Pebble-Grey GMDSS Dual Float/Boost Charger Cubicle
    cc = SubassemblyBuilder(root, 'Charger_Cabinet', m)
    cx = 0.41
    cc.box((0.44, 0.48, 0.06), (cx, 0, 0.03), 'dark_plinth')
    cc.box((0.42, 0.46, 0.84), (cx, 0, 0.48), 'pebble_grey')
    cc.box((0.46, 0.50, 0.025), (cx, -0.01, 0.91), 'steel')
    cc.box((0.38, 0.018, 0.78), (cx, -0.235, 0.48), 'pebble_grey')
    cc.box((0.22, 0.016, 0.20), (cx, -0.246, 0.34), 'dark_plinth')
    cc.lcd_panel(cx, -0.246, 0.60, w=0.18, h=0.095)
    cc.pilot_lights(cx, -0.246, 0.49, dx=0.048)
    cc.louvers(cx, -0.246, 0.14, w=0.26, count=4, dz=0.022)
    cc.box((0.018, 0.035, 0.10), (cx + 0.16, -0.255, 0.48), 'steel')
    cc.finalize(parts)

    # 6. Rectifier_Transformer: Internal isolation transformer coils, core & finned SCR heatsink
    rt = SubassemblyBuilder(root, 'Rectifier_Transformer', m)
    rt.box((0.18, 0.14, 0.16), (0.35, -0.14, 0.34), 'iron')
    for dx in [-0.045, 0.045]:
        rt.cyl(0.038, 0.13, (0.35 + dx, -0.16, 0.34), 'copper', axis='Z', verts=20)
    for i in range(5):
        rt.box((0.012, 0.12, 0.14), (0.46 + i * 0.018, -0.16, 0.34), 'steel')
    rt.cyl(0.024, 0.09, (0.48, -0.16, 0.46), 'phase_blue', axis='Z', verts=16)
    rt.finalize(parts)

    # 7. Ammeter_Gauge: Front-door center-zero DC charge/discharge ammeter with rotating needle
    ag = SubassemblyBuilder(root, 'Ammeter_Gauge', m, pivot=(0.41, -0.255, 0.76))
    ag.round_gauge(0.41, -0.250, 0.76, r=0.056)
    ag.finalize(parts)

    export_model(root, parts, 'battery_system.glb')


# ============================================================================
# 3. Main Starting Air Compressor & Air Receiver Bottle Skid
# ============================================================================
def build_air_compressor():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Air_Compressor_Skid', None)
    bpy.context.collection.objects.link(root)
    parts = []

    # 1. Compressor_Frame: Heavy welded I-beam steel base skid, drip coaming, rubber mounts & belt guard
    cf = SubassemblyBuilder(root, 'Compressor_Frame', m)
    cf.box((1.16, 0.60, 0.065), (0, 0, 0.055), 'dark_plinth')
    cf.box((1.18, 0.62, 0.022), (0, 0, 0.09), 'iron')
    cf.box((0.36, 0.36, 0.08), (-0.34, -0.02, 0.13), 'iron')
    cf.box((0.34, 0.34, 0.08), (0.06, -0.02, 0.13), 'iron')
    for sx in [-0.50, 0.0, 0.50]:
        for sy in [-0.25, 0.25]:
            cf.cyl(0.036, 0.04, (sx, sy, 0.02), 'cable_black', axis='Z', verts=16)
            cf.cyl(0.014, 0.03, (sx, sy, 0.105), 'steel', axis='Z', verts=8)
    # Stationary motor pulley, V-belt run & perforated yellow safety guard
    cf.cyl(0.075, 0.045, (-0.18, 0.17, 0.31), 'steel', axis='Y', verts=20)
    cf.box((0.26, 0.035, 0.14), (-0.06, 0.17, 0.33), 'cable_black', rot=(0, 0.15, 0))
    cf.box((0.36, 0.045, 0.22), (-0.05, 0.21, 0.34), 'safety_yellow')
    cf.finalize(parts)

    # 2. Electric_Motor_440V: 30 kW 440 V finned marine motor + terminal box
    em = SubassemblyBuilder(root, 'Electric_Motor_440V', m)
    em.cyl(0.145, 0.34, (-0.34, -0.02, 0.31), 'phase_blue', axis='X', verts=28)
    for i in range(8):
        fx = -0.47 + i * 0.036
        em.cyl(0.162, 0.012, (fx, -0.02, 0.31), 'phase_blue', axis='X', verts=24)
    em.cyl(0.132, 0.05, (-0.53, -0.02, 0.31), 'dark_plinth', axis='X', verts=24)
    em.box((0.11, 0.11, 0.09), (-0.34, -0.08, 0.47), 'iron')
    em.cyl(0.04, 0.14, (-0.14, -0.02, 0.31), 'steel', axis='X', verts=16)
    em.finalize(parts)

    # 3. V_Belt_Drive: Spoked cast-iron compressor flywheel pulley (rotates cleanly around Y -> Three.js Z)
    vb = SubassemblyBuilder(root, 'V_Belt_Drive', m, pivot=(0.06, 0.17, 0.35))
    vb.ring(0.16, 0.024, (0.06, 0.17, 0.35), 'iron', axis='Y')
    vb.cyl(0.048, 0.052, (0.06, 0.17, 0.35), 'steel', axis='Y', verts=20)
    for i in range(6):
        ang = i * (math.pi / 3.0)
        sx = 0.06 + 0.08 * math.cos(ang)
        sz = 0.35 + 0.08 * math.sin(ang)
        vb.box((0.022, 0.032, 0.14), (sx, 0.17, sz), 'safety_yellow', rot=(0, ang, 0))
    vb.finalize(parts)

    # 4. Two_Stage_Cylinder: Cast-iron crankcase, oil sight glass, V-twin LP & HP finned cylinders
    tc = SubassemblyBuilder(root, 'Two_Stage_Cylinder', m)
    tc.box((0.28, 0.26, 0.24), (0.06, -0.02, 0.28), 'motor_green')
    tc.cyl(0.028, 0.015, (0.06, -0.155, 0.25), 'white_dial', axis='Y', verts=16)
    tc.cyl(0.018, 0.03, (-0.04, -0.12, 0.41), 'status_red', axis='Z', verts=12)
    # Stage 1 LP cylinder (angled left) & Stage 2 HP cylinder (angled right)
    for side, r_cyl in [(-1, 0.095), (1, 0.072)]:
        ang = side * 0.36
        cx = 0.06 + side * 0.08
        tc.cyl(r_cyl, 0.22, (cx, -0.02, 0.48), 'iron', rot=(0, ang, 0), verts=24)
        for k in range(5):
            dz = -0.06 + k * 0.032
            tc.cyl(r_cyl + 0.018, 0.010, (cx + math.sin(ang) * dz, -0.02, 0.48 + math.cos(ang) * dz), 'steel', rot=(0, ang, 0), verts=24)
        tc.cyl(r_cyl * 1.06, 0.045, (cx + side * 0.04, -0.02, 0.59), 'motor_green', rot=(0, ang, 0), verts=24)
    # Intake air filter drum
    tc.cyl(0.055, 0.10, (-0.08, -0.10, 0.62), 'dark_plinth', axis='Y', verts=20)
    tc.finalize(parts)

    # 5. Intercooler_Coil: Finned Cu-Ni intercooler serpentine tubes & aftercooler shell
    ic = SubassemblyBuilder(root, 'Intercooler_Coil', m)
    ic.cyl(0.065, 0.26, (0.06, -0.19, 0.46), 'copper', axis='X', verts=20)
    for i in range(8):
        ic.cyl(0.082, 0.008, (-0.04 + i * 0.028, -0.19, 0.46), 'gold_brass', axis='X', verts=18)
    ic.cyl(0.020, 0.18, (-0.03, -0.12, 0.54), 'copper', rot=(0.4, 0.2, 0), verts=14)
    ic.cyl(0.020, 0.18, (0.16, -0.12, 0.54), 'copper', rot=(0.4, -0.2, 0), verts=14)
    ic.cyl(0.022, 0.24, (0.26, -0.10, 0.48), 'copper', axis='X', verts=14)
    ic.finalize(parts)

    # 6. Pressure_Receiver_Bottle: Vertical 30-bar air receiver bottle, stop valve, relief valve & gauge
    pr = SubassemblyBuilder(root, 'Pressure_Receiver_Bottle', m)
    bx, by = 0.40, 0.02
    pr.cyl(0.14, 0.64, (bx, by, 0.42), 'motor_green', axis='Z', verts=28)
    pr.cyl(0.135, 0.08, (bx, by, 0.74), 'status_red', axis='Z', verts=28)
    for bz in [0.24, 0.56]:
        pr.cyl(0.146, 0.025, (bx, by, bz), 'dark_plinth', axis='Z', verts=28)
    # Top main stop valve + red handwheel + brass relief valve + pressure gauge
    pr.cyl(0.032, 0.08, (bx, by, 0.81), 'gold_brass', axis='Z', verts=16)
    pr.ring(0.055, 0.010, (bx, by - 0.05, 0.83), 'status_red', axis='Y')
    pr.cyl(0.018, 0.07, (bx + 0.06, by, 0.80), 'gold_brass', axis='Z', verts=14)
    pr.round_gauge(bx - 0.04, by - 0.145, 0.64, r=0.045)
    pr.finalize(parts)

    # 7. Solenoid_Unloader_Valve: Brass/blue unloader solenoid, moisture trap & front starter control box
    sv = SubassemblyBuilder(root, 'Solenoid_Unloader_Valve', m)
    sv.box((0.08, 0.08, 0.11), (0.20, -0.18, 0.24), 'gold_brass')
    sv.box((0.065, 0.065, 0.07), (0.20, -0.18, 0.32), 'phase_blue')
    sv.cyl(0.032, 0.12, (0.28, -0.18, 0.22), 'steel', axis='Z', verts=16)
    # Local compressor starter panel on front left
    sv.box((0.20, 0.10, 0.24), (-0.34, -0.22, 0.56), 'pebble_grey')
    sv.round_gauge(-0.34, -0.275, 0.61, r=0.034)
    sv.cyl(0.014, 0.016, (-0.38, -0.275, 0.51), 'status_green', axis='Y', verts=12)
    sv.cyl(0.016, 0.018, (-0.30, -0.275, 0.51), 'status_red', axis='Y', verts=12)
    sv.finalize(parts)

    export_model(root, parts, 'air_compressor_skid.glb')


# ============================================================================
# 4. Engine Room Heavy Axial Ventilation Fan & Local Starter Box
# ============================================================================
def build_vent_fan():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Vent_Fan_Assembly', None)
    bpy.context.collection.objects.link(root)
    parts = []
    fz = 0.44

    # 1. Fan_Cylindrical_Casing
    fc = SubassemblyBuilder(root, 'Fan_Cylindrical_Casing', m)
    fc.box((0.76, 0.52, 0.05), (0, 0, 0.025), 'dark_plinth')
    for sx in [-0.26, 0.26]:
        fc.box((0.06, 0.44, 0.26), (sx, 0, 0.16), 'dark_plinth')
    annular_shell(fc, 0.32, 0.286, 0.52, (0, 0, fz), 'pebble_grey')
    annular_shell(fc, 0.288, 0.284, 0.52, (0, 0, fz), 'dark_plinth')
    for ry in [-0.14, 0.0, 0.14]:
        fc.ring(0.325, 0.014, (0, ry, fz), 'steel', axis='Y')
    fc.box((0.20, 0.18, 0.04), (0, 0, fz + 0.32), 'steel')
    fc.ring(0.335, 0.024, (0, -0.27, fz), 'steel', axis='Y')
    fc.ring(0.22, 0.008, (0, -0.285, fz), 'steel', axis='Y')
    fc.finalize(parts)

    # 2. Flange_Rings
    fr = SubassemblyBuilder(root, 'Flange_Rings', m)
    for fy in [-0.26, 0.26]:
        annular_shell(fr, 0.365, 0.287, 0.024, (0, fy, fz), 'iron')
        for i in range(12):
            ang = i * (2.0 * math.pi / 12.0)
            bx = 0.345 * math.cos(ang)
            bz = fz + 0.345 * math.sin(ang)
            fr.cyl(0.010, 0.036, (bx, fy, bz), 'steel', axis='Y', verts=8)
    fr.finalize(parts)

    # 3. Axial_Impeller_Blades
    imp = SubassemblyBuilder(root, 'Axial_Impeller_Blades', m, pivot=(0.0, -0.16, fz))
    imp.cyl(0.095, 0.10, (0, -0.16, fz), 'gold_brass', axis='Y', verts=24)
    imp.cyl(0.065, 0.06, (0, -0.22, fz), 'steel', axis='Y', verts=20)
    for i in range(8):
        aerofoil_blade(imp, (0, -0.16, fz), i * 2 * math.pi / 8, 0.078, 0.276, 'gold_brass', sweep=0.09)
    imp.cyl(0.045, 0.035, (0, -0.266, fz), 'steel', axis='Y', verts=40)
    for j in range(8):
        a = j * 2 * math.pi / 8
        imp.cyl(0.007, 0.012, (0.065 * math.cos(a), -0.221, fz + 0.065 * math.sin(a)), 'steel', axis='Y', verts=10)
    imp.finalize(parts)

    # 4. 440V_Drive_Motor
    dm = SubassemblyBuilder(root, '440V_Drive_Motor', m)
    dm.cyl(0.135, 0.26, (0, 0.06, fz), 'phase_blue', axis='Y', verts=24)
    for i in range(4):
        ang = i * (math.pi / 2.0) + math.pi / 4.0
        sx = 0.21 * math.cos(ang)
        sz = fz + 0.21 * math.sin(ang)
        dm.box((0.022, 0.08, 0.16), (sx, 0.06, sz), 'steel', rot=(0, -ang, 0))
    dm.box((0.10, 0.12, 0.07), (0, 0.06, fz + 0.35), 'iron')
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

    # 5. Local_Starter_Enclosure
    ls = SubassemblyBuilder(root, 'Local_Starter_Enclosure', m)
    lx = 0.45
    ls.box((0.18, 0.24, 0.34), (lx, -0.02, fz), 'pebble_grey')
    ls.box((0.20, 0.26, 0.020), (lx, -0.02, fz + 0.18), 'steel')
    ls.gauge(lx, -0.145, fz + 0.09, w=0.065)
    ls.lcd_panel(lx, -0.145, fz - 0.01, w=0.11, h=0.06)
    ls.pilot_lights(lx, -0.145, fz - 0.09, dx=0.036)
    ls.box((0.10, 0.04, 0.025), (0.35, -0.02, fz), 'iron')
    ls.box((0.168, 0.009, 0.308), (lx, -0.151, fz), 'blue_coat')
    for zz in [fz - 0.115, fz + 0.115]:
        ls.cyl(0.009, 0.038, (lx - 0.089, -0.154, zz), 'steel', axis='Z')
    for zz in [fz - 0.135, fz - 0.120, fz - 0.105]:
        ls.box((0.09, 0.008, 0.005), (lx, -0.160, zz), 'dark_plinth')
    ls.box((0.035, 0.014, 0.012), (lx + 0.075, -0.162, fz), 'orange')
    ls.box((0.14, 0.008, 0.022), (lx, -0.163, fz + 0.145), 'safety_yellow')
    ls.finalize(parts)

    # 6. Fire_Damper_Actuator
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

    export_model(root, parts, 'vent_fan_assembly.glb')


# ============================================================================
# 5. Ballast Pump & Oily Water Separator (OWS) Control Skid
# ============================================================================
def build_ballast_ows():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Ballast_OWS_Skid', None)
    bpy.context.collection.objects.link(root)
    parts = []

    # 1. Ballast_Pump_Casing: Full skid baseplate + gunmetal pump volute, flanges, gauges & piping
    bp = SubassemblyBuilder(root, 'Ballast_Pump_Casing', m)
    bp.box((1.22, 0.62, 0.065), (0, 0, 0.032), 'dark_plinth')
    bp.box((1.24, 0.64, 0.022), (0, 0, 0.068), 'iron')
    px, py = -0.36, -0.02
    bp.cyl(0.18, 0.22, (px, py, 0.22), 'motor_green', axis='Z', verts=28)
    bp.cyl(0.08, 0.18, (px, py - 0.18, 0.20), 'motor_green', axis='Y', verts=20)
    bp.cyl(0.12, 0.025, (px, py - 0.27, 0.20), 'steel', axis='Y', verts=20)
    bp.cyl(0.07, 0.34, (-0.14, py + 0.10, 0.24), 'steel', axis='X', verts=18)
    bp.round_gauge(px - 0.10, py - 0.19, 0.33, r=0.038)
    bp.finalize(parts)

    # 2. Pump_Impeller: Multi-vane bronze impeller & shaft inside pump casing
    pi = SubassemblyBuilder(root, 'Pump_Impeller', m, pivot=(-0.36, -0.02, 0.24))
    pi.cyl(0.125, 0.07, (-0.36, -0.02, 0.24), 'gold_brass', axis='Z', verts=24)
    pi.cyl(0.042, 0.24, (-0.36, -0.02, 0.36), 'steel', axis='Z', verts=18)
    for i in range(6):
        ang = i * (math.pi / 3.0)
        vx = -0.36 + 0.085 * math.cos(ang)
        vy = -0.02 + 0.085 * math.sin(ang)
        pi.box((0.06, 0.016, 0.065), (vx, vy, 0.24), 'gold_brass', rot=(0, 0, ang + 0.4))
    pi.finalize(parts)

    # 3. 440V_Drive_Motor: Vertical 110 kW finned marine motor atop pump pedestal
    dm = SubassemblyBuilder(root, '440V_Drive_Motor', m)
    px, py = -0.36, -0.02
    dm.cyl(0.145, 0.32, (px, py, 0.58), 'phase_blue', axis='Z', verts=28)
    for i in range(7):
        dm.cyl(0.162, 0.012, (px, py, 0.45 + i * 0.038), 'phase_blue', axis='Z', verts=24)
    dm.cyl(0.132, 0.05, (px, py, 0.76), 'dark_plinth', axis='Z', verts=24)
    dm.box((0.10, 0.09, 0.11), (px, py - 0.15, 0.58), 'iron')
    dm.finalize(parts)

    # 4. OWS_Pressure_Vessel: IMO MEPC 107(49) primary separator chamber, manway, sight glasses & dome
    ows = SubassemblyBuilder(root, 'OWS_Pressure_Vessel', m)
    vx, vy = 0.14, 0.04
    ows.cyl(0.185, 0.58, (vx, vy, 0.42), 'pebble_grey', axis='Z', verts=32)
    ows.cyl(0.180, 0.08, (vx, vy, 0.72), 'steel', axis='Z', verts=28)
    ows.cyl(0.095, 0.035, (vx, vy - 0.18, 0.34), 'steel', axis='Y', verts=20)  # Bolted manway
    for sz in [0.48, 0.60]:
        ows.box((0.028, 0.025, 0.08), (vx - 0.11, vy - 0.16, sz), 'white_dial')
    ows.round_gauge(vx + 0.08, vy - 0.17, 0.64, r=0.038)
    ows.finalize(parts)

    # 5. Coalescer_Filter: Secondary fine-stage brass/copper coalescer cylinder & sample valves
    cf = SubassemblyBuilder(root, 'Coalescer_Filter', m)
    fx, fy = 0.44, 0.04
    cf.cyl(0.115, 0.46, (fx, fy, 0.36), 'copper', axis='Z', verts=24)
    cf.cyl(0.130, 0.030, (fx, fy, 0.58), 'gold_brass', axis='Z', verts=24)
    cf.cyl(0.04, 0.08, (fx, fy, 0.63), 'steel', axis='Z', verts=16)
    cf.round_gauge(fx, fy - 0.12, 0.48, r=0.034)
    cf.finalize(parts)

    # 6. Oil_Content_Monitor: Safety yellow 15 ppm Bilge Alarm OCM + 3-way pneumatic diverter valve
    ocm = SubassemblyBuilder(root, 'Oil_Content_Monitor', m)
    ocm.box((0.18, 0.11, 0.22), (0.32, -0.18, 0.54), 'safety_yellow')
    ocm.lcd_panel(0.32, -0.24, 0.57, w=0.13, h=0.075)
    ocm.pilot_lights(0.32, -0.24, 0.48, dx=0.038)
    # 3-way overboard fail-safe valve
    ocm.box((0.09, 0.09, 0.09), (0.44, -0.18, 0.24), 'gold_brass')
    ocm.cyl(0.055, 0.06, (0.44, -0.18, 0.32), 'status_red', axis='Z', verts=18)
    ocm.finalize(parts)

    # 7. Control_Panel: Switchboard-style PLC control console on front of skid
    cp = SubassemblyBuilder(root, 'Control_Panel', m)
    cp.box((0.26, 0.14, 0.38), (-0.06, -0.18, 0.38), 'pebble_grey')
    cp.box((0.28, 0.16, 0.020), (-0.06, -0.18, 0.58), 'steel')
    cp.gauge(-0.12, -0.255, 0.50, w=0.062)
    cp.gauge(-0.01, -0.255, 0.50, w=0.062)
    cp.lcd_panel(-0.06, -0.255, 0.39, w=0.16, h=0.075)
    cp.pilot_lights(-0.06, -0.255, 0.29, dx=0.044)
    cp.finalize(parts)

    export_model(root, parts, 'ballast_ows_skid.glb')


# ============================================================================
# 6. 440 V Galley Primary Distribution Board (Ovens, Deep Fryers) & Shunt Trip
#    Combines a 2-Bay Marine Switchboard (matching lv-board) + Stainless Galley
#    Commercial Ovens, Deep Fryers & Hotplates + Outdoor Yellow/Red Shunt Trip!
# ============================================================================
def build_galley_board():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Galley_Board_Assembly', None)
    bpy.context.collection.objects.link(root)
    parts = []

    # 1. Galley_Panel_Enclosure: 2-Bay Switchboard Cubicle (Left) + Stainless Ovens/Fryers/Range (Right)
    gp = SubassemblyBuilder(root, 'Galley_Panel_Enclosure', m)
    # --- Left Section (x = -0.62 .. +0.02): 2-Bay 440V Galley Switchboard matching lv-board ---
    gp.box((0.66, 0.48, 0.065), (-0.30, 0, 0.032), 'dark_plinth')
    gp.box((0.64, 0.46, 0.80), (-0.30, 0.01, 0.465), 'pebble_grey')
    gp.box((0.68, 0.50, 0.025), (-0.30, -0.01, 0.88), 'steel')  # Top IP22 drip canopy
    for x in [-0.61, -0.30, 0.01]:
        gp.box((0.032, 0.025, 0.81), (x, -0.225, 0.465), 'steel')
    # Bay 1 (-0.46) upper metering fascia + open lower door; Bay 2 (-0.14) closed door with window
    for bx in [-0.46, -0.14]:
        gp.box((0.28, 0.018, 0.26), (bx, -0.23, 0.72), 'pebble_grey')
        gp.gauge(bx - 0.07, -0.242, 0.79, w=0.062)
        gp.gauge(bx + 0.07, -0.242, 0.79, w=0.062)
        gp.lcd_panel(bx, -0.242, 0.68, w=0.14, h=0.07)
        gp.pilot_lights(bx, -0.242, 0.60, dx=0.038)
    # Bay 1 open lower door (hinged left)
    gp.box((0.020, 0.28, 0.46), (-0.61, -0.36, 0.32), 'pebble_grey', rot=(0, 0, -0.32))
    # Bay 2 closed lower door with window, handle, mimic & louvers
    gp.box((0.28, 0.018, 0.46), (-0.14, -0.23, 0.32), 'pebble_grey')
    gp.box((0.15, 0.014, 0.18), (-0.14, -0.242, 0.38), 'dark_plinth')
    gp.box((0.016, 0.032, 0.09), (-0.03, -0.248, 0.36), 'steel')
    gp.louvers(-0.14, -0.242, 0.12, w=0.20, count=4, dz=0.022)

    # --- Right Section (x = +0.05 .. +0.55): Commercial Marine Ovens, Range Hotplates & Deep Fryers ---
    gp.box((0.50, 0.48, 0.055), (0.30, 0, 0.028), 'dark_plinth')
    gp.box((0.48, 0.46, 0.58), (0.30, 0, 0.345), 'stainless')
    gp.box((0.50, 0.49, 0.028), (0.30, -0.01, 0.645), 'steel')  # Stainless range countertop
    # Marine storm sea-rails (fiddles) around range top
    gp.box((0.50, 0.012, 0.035), (0.30, -0.25, 0.67), 'steel')
    # 2 Stacked Commercial Roasting Ovens on left of galley block (x = 0.19)
    for oz in [0.22, 0.46]:
        gp.box((0.22, 0.018, 0.19), (0.19, -0.235, oz), 'iron')
        gp.box((0.16, 0.012, 0.10), (0.19, -0.245, oz - 0.01), 'dark_plinth')
        gp.box((0.18, 0.028, 0.014), (0.19, -0.255, oz + 0.065), 'steel')
    # 4 Cast-Iron Range Hotplates on top left (x = 0.12, 0.25)
    for hx in [0.13, 0.25]:
        for hy in [-0.11, 0.09]:
            gp.cyl(0.048, 0.018, (hx, hy, 0.665), 'dark_plinth', axis='Z', verts=20)
            gp.cyl(0.018, 0.020, (hx, hy, 0.667), 'status_red', axis='Z', verts=14)
    # Twin Deep-Fat Fryer Vats + Wire Basket Handles on right of galley block (x = 0.42)
    gp.box((0.20, 0.018, 0.42), (0.42, -0.235, 0.34), 'pebble_grey')
    for fx in [0.37, 0.47]:
        gp.box((0.075, 0.28, 0.03), (fx, -0.02, 0.665), 'dark_plinth')
        gp.box((0.020, 0.12, 0.06), (fx, -0.22, 0.70), 'steel', rot=(0.35, 0, 0))
        gp.cyl(0.014, 0.016, (fx, -0.245, 0.52), 'status_red', axis='Y', verts=12)
    gp.finalize(parts)

    # 2. Feeder_MCCB_Bank: Internal 3-phase copper busbars + 400A Incomer & 6 Galley Feeder MCCBs
    fb = SubassemblyBuilder(root, 'Feeder_MCCB_Bank', m)
    phase_mats = ['status_red', 'safety_yellow', 'phase_blue']
    for i, pz in enumerate([0.52, 0.48, 0.44]):
        fb.box((0.54, 0.024, 0.022), (-0.30, 0.04, pz), 'copper')
        fb.box((0.035, 0.028, 0.026), (-0.46, 0.04, pz), phase_mats[i])
    # Main 400A Incomer MCCB + 6 Outgoing Branch MCCBs (Ovens, Fryers, Ranges)
    fb.box((0.12, 0.14, 0.18), (-0.50, -0.08, 0.38), 'dark_plinth')
    fb.box((0.024, 0.04, 0.05), (-0.50, -0.16, 0.38), 'status_red')
    for mx in [-0.36, -0.24, -0.12]:
        for mz in [0.24, 0.38]:
            fb.box((0.085, 0.12, 0.11), (mx, -0.08, mz), 'dark_plinth')
            fb.box((0.018, 0.036, 0.032), (mx, -0.15, mz), 'steel')
    fb.finalize(parts)

    # 3. Shunt_Trip_Relay: Electromagnetic Shunt Trip release coil & linkage beside Main Incomer
    st = SubassemblyBuilder(root, 'Shunt_Trip_Relay', m)
    st.box((0.075, 0.11, 0.14), (-0.42, -0.10, 0.38), 'safety_yellow')
    st.cyl(0.024, 0.08, (-0.42, -0.12, 0.38), 'copper', axis='Z', verts=16)
    st.box((0.06, 0.03, 0.03), (-0.46, -0.14, 0.44), 'status_red')
    st.finalize(parts)

    # 4. Outdoor_Shunt_Trip_Box: High-visibility yellow SOLAS remote break-glass station + conduit
    ob = SubassemblyBuilder(root, 'Outdoor_Shunt_Trip_Box', m)
    ox, oy, oz = -0.78, -0.12, 0.48
    ob.box((0.16, 0.13, 0.22), (ox, oy, oz), 'safety_yellow')
    ob.box((0.14, 0.012, 0.19), (ox, oy - 0.065, oz), 'dark_plinth')
    ob.box((0.11, 0.008, 0.035), (ox, oy - 0.072, oz + 0.06), 'status_red')
    ob.cyl(0.010, 0.014, (ox, oy - 0.072, oz - 0.06), 'status_green', axis='Y', verts=12)
    ob.cyl(0.016, 0.14, (-0.66, oy, oz), 'steel', axis='X', verts=12)  # Conduit to switchboard
    ob.finalize(parts)

    # 5. Red_Mushroom_Button: Latching red emergency stop mushroom button on front (-Y)
    mb = SubassemblyBuilder(root, 'Red_Mushroom_Button', m)
    mb.cyl(0.038, 0.022, (-0.78, -0.19, 0.48), ' safety_yellow' if False else 'steel', axis='Y', verts=20)
    mb.cyl(0.034, 0.032, (-0.78, -0.21, 0.48), 'status_red', axis='Y', verts=24)
    mb.finalize(parts)

    # 6. Safety_Cover_Flap: Hinged protective flip-up safety guard frame over mushroom button
    sf = SubassemblyBuilder(root, 'Safety_Cover_Flap', m)
    sf.box((0.10, 0.045, 0.012), (-0.78, -0.21, 0.535), 'safety_yellow', rot=(0.25, 0, 0))
    sf.box((0.012, 0.045, 0.09), (-0.83, -0.21, 0.49), 'safety_yellow')
    sf.box((0.012, 0.045, 0.09), (-0.73, -0.21, 0.49), 'safety_yellow')
    sf.finalize(parts)

    export_model(root, parts, 'galley_board_assembly.glb')


# ============================================================================
# 7. 6.6 kV High-Voltage Shore Power Connection Box & Cable Reel (Cold Ironing)
# ============================================================================
def build_shore_power_reel():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Shore_Power_Reel', None)
    bpy.context.collection.objects.link(root)
    parts = []
    rx, rz = -0.16, 0.44

    # 1. Cable_Reel_Drum: Flanged motorized spooling drum with radial stiffening spokes
    cd = SubassemblyBuilder(root, 'Cable_Reel_Drum', m, pivot=(rx, 0.0, rz))
    cd.cyl(0.14, 0.34, (rx, 0.0, rz), 'iron', axis='Y', verts=24)
    for dy in [-0.17, 0.17]:
        cd.cyl(0.32, 0.022, (rx, dy, rz), 'pebble_grey', axis='Y', verts=36)
        cd.ring(0.32, 0.014, (rx, dy, rz), 'steel', axis='Y')
        for i in range(6):
            ang = i * (math.pi / 3.0)
            sx = rx + 0.16 * math.cos(ang)
            sz = rz + 0.16 * math.sin(ang)
            cd.box((0.028, 0.030, 0.28), (sx, dy, sz), 'steel', rot=(0, ang, 0))
    cd.finalize(parts)

    # 2. HV_Flexible_Cable: Multi-turn coiled 6.6 kV shore cable with red HV phase collars
    hc = SubassemblyBuilder(root, 'HV_Flexible_Cable', m, pivot=(rx, 0.0, rz))
    for i in range(6):
        wy = -0.125 + i * 0.050
        hc.ring(0.23, 0.028, (rx, wy, rz), 'cable_black', axis='Y')
    hc.ring(0.235, 0.030, (rx, -0.025, rz), 'status_red', axis='Y')
    hc.finalize(parts)

    # 3. HV_Connector_Plug: Base skid, A-frame reel supports & IEC 80005-1 6.6 kV plug head
    hp = SubassemblyBuilder(root, 'HV_Connector_Plug', m)
    hp.box((1.14, 0.56, 0.06), (0.04, 0.0, 0.03), 'dark_plinth')
    for sy in [-0.21, 0.21]:
        hp.box((0.12, 0.04, 0.42), (rx, sy, 0.24), 'iron')
    # IEC 80005-1 Plug head & roller fairlead at front (-Y)
    hp.box((0.18, 0.14, 0.12), (rx, -0.22, 0.14), 'status_red')
    hp.cyl(0.048, 0.10, (rx, -0.30, 0.14), 'steel', axis='Y', verts=20)
    for px in [-0.022, 0.0, 0.022]:
        hp.cyl(0.008, 0.04, (rx + px, -0.35, 0.14), 'copper', axis='Y', verts=10)
    hp.finalize(parts)

    # 4. Motorized_Drive: Side-mounted electric spooling gearmotor, cooling fins & brake
    md = SubassemblyBuilder(root, 'Motorized_Drive', m)
    md.cyl(0.11, 0.24, (-0.42, 0.0, rz), 'phase_blue', axis='X', verts=24)
    for i in range(5):
        md.cyl(0.125, 0.010, (-0.34 - i * 0.035, 0.0, rz), 'phase_blue', axis='X', verts=20)
    md.box((0.12, 0.16, 0.22), (-0.26, 0.0, rz), 'iron')
    md.finalize(parts)

    # 5. Junction_Box: Switchboard-style 6.6 kV HVSC Cubicle with meters, synchro LCD & HV warning
    jb = SubassemblyBuilder(root, 'Junction_Box', m)
    jx = 0.36
    jb.box((0.38, 0.46, 0.78), (jx, 0.0, 0.45), 'pebble_grey')
    jb.box((0.42, 0.50, 0.025), (jx, -0.01, 0.85), 'steel')
    for gx in [-0.09, 0.0, 0.09]:
        jb.gauge(jx + gx, -0.235, 0.74, w=0.062)
    jb.lcd_panel(jx, -0.235, 0.62, w=0.16, h=0.085)
    jb.pilot_lights(jx, -0.235, 0.52, dx=0.042)
    jb.box((0.16, 0.014, 0.18), (jx, -0.235, 0.32), 'dark_plinth')
    jb.box((0.08, 0.010, 0.06), (jx, -0.242, 0.44), 'safety_yellow')
    jb.louvers(jx, -0.235, 0.12, w=0.22, count=4, dz=0.022)
    jb.finalize(parts)

    # 6. Mechanical_Interlock_Pin: Brass Kirk/Castell key interlock & rotary handle on HVSC door
    mi = SubassemblyBuilder(root, 'Mechanical_Interlock_Pin', m)
    mi.box((0.06, 0.04, 0.08), (0.23, -0.24, 0.44), 'gold_brass')
    mi.cyl(0.018, 0.045, (0.23, -0.26, 0.45), 'steel', axis='Y', verts=16)
    mi.box((0.014, 0.035, 0.055), (0.23, -0.27, 0.42), 'status_red')
    mi.finalize(parts)

    # 7. Earth_Blade: 3-pole copper CME knife-blade earthing switch & red HV standoff insulators
    eb = SubassemblyBuilder(root, 'Earth_Blade', m)
    eb.box((0.26, 0.03, 0.03), (0.36, -0.12, 0.24), 'copper')
    for dx in [-0.08, 0.0, 0.08]:
        eb.cyl(0.020, 0.08, (0.36 + dx, -0.10, 0.32), 'status_red', axis='Y', verts=14)
        eb.box((0.018, 0.08, 0.10), (0.36 + dx, -0.14, 0.28), 'copper', rot=(0.35, 0, 0))
    eb.finalize(parts)

    export_model(root, parts, 'shore_power_reel.glb')


# ============================================================================
# 8. Navigation Bridge COLREG Light Control Console & Radar Scanner
# ============================================================================
def build_bridge_navcom():
    reset_scene()
    m = get_materials()
    root = bpy.data.objects.new('Bridge_NavCom_Suite', None)
    bpy.context.collection.objects.link(root)
    parts = []

    # 1. NavLight_Console_Panel
    nc = SubassemblyBuilder(root, 'NavLight_Console_Panel', m)
    cx = -0.18
    nc.box((0.76, 0.46, 0.05), (cx, 0.0, 0.025), 'dark_plinth')
    nc.box((0.72, 0.40, 0.42), (cx, 0.02, 0.26), 'iron')
    nc.box((0.76, 0.46, 0.16), (cx, -0.02, 0.52), 'pebble_grey', rot=(0.28, 0, 0))
    nc.cyl(0.014, 0.74, (cx, -0.26, 0.47), 'stainless', axis='X', verts=16)
    for mx in [cx - 0.18, cx + 0.18]:
        nc.box((0.28, 0.035, 0.20), (mx, 0.04, 0.68), 'dark_plinth', rot=(0.22, 0, 0))
        nc.box((0.25, 0.010, 0.17), (mx, 0.022, 0.68), 'cyan_lcd', rot=(0.22, 0, 0))
    nc.ring(0.065, 0.012, (cx, -0.22, 0.42), 'dark_plinth', axis='Y')
    nc.cyl(0.022, 0.06, (cx, -0.20, 0.42), 'steel', axis='Y', verts=16)
    nc.box((0.04, 0.08, 0.10), (cx + 0.28, -0.14, 0.56), 'steel', rot=(0.4, 0, 0))
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

    # 2. Dual_Selector_Switches
    ds = SubassemblyBuilder(root, 'Dual_Selector_Switches', m)
    sx, sy, sz = -0.36, -0.14, 0.54
    ds.box((0.30, 0.16, 0.035), (sx, sy, sz), 'dark_plinth', rot=(0.28, 0, 0))
    ds.box((0.06, 0.10, 0.012), (sx - 0.06, sy - 0.01, sz + 0.02), 'pebble_grey', rot=(0.28, 0, 0))
    ds.cyl(0.009, 0.012, (sx - 0.08, sy - 0.01, sz + 0.025), 'status_red', axis='Z', verts=10)
    ds.cyl(0.009, 0.012, (sx - 0.04, sy - 0.01, sz + 0.025), 'status_green', axis='Z', verts=10)
    for i in range(5):
        tx = sx + 0.01 + i * 0.026
        ds.cyl(0.008, 0.028, (tx, sy - 0.03, sz + 0.02), 'steel', rot=(0.28, 0, 0), verts=10)
        ds.cyl(0.008, 0.028, (tx, sy + 0.02, sz + 0.03), 'gold_brass', rot=(0.28, 0, 0), verts=10)
    for i in range(5):
        ds.box((0.022, 0.007, 0.008), (sx + 0.01 + i * 0.026, sy - 0.07, sz + 0.045), 'white_dial')
    ds.finalize(parts)

    # 3. Alarm_Buzzer
    ab = SubassemblyBuilder(root, 'Alarm_Buzzer', m)
    ax, ay, az = 0.02, -0.14, 0.55
    ab.box((0.18, 0.12, 0.04), (ax, ay, az), 'iron', rot=(0.28, 0, 0))
    ab.cyl(0.026, 0.036, (ax - 0.04, ay - 0.02, az + 0.03), 'status_red', rot=(0.28, 0, 0), verts=18)
    ab.cyl(0.022, 0.030, (ax + 0.04, ay - 0.02, az + 0.03), 'safety_yellow', rot=(0.28, 0, 0), verts=18)
    ab.finalize(parts)

    # 4. Radar_Pedestal
    rp = SubassemblyBuilder(root, 'Radar_Pedestal', m)
    px, py = 0.38, 0.06
    rp.cyl(0.18, 0.04, (px, py, 0.02), 'steel', axis='Z', verts=24)
    rp.cyl(0.115, 0.54, (px, py, 0.30), 'white_dial', axis='Z', verts=28)
    rp.box((0.09, 0.02, 0.18), (px, py - 0.11, 0.28), 'pebble_grey')
    for zz in [0.10, 0.42]:
        rp.ring(0.116, 0.008, (px, py, zz), 'steel', axis='Z')
    for j in range(8):
        a = j * 2 * math.pi / 8
        rp.cyl(0.009, 0.020, (px + 0.15 * math.cos(a), py + 0.15 * math.sin(a), 0.035), 'iron', axis='Z', verts=12)
    rp.box((0.062, 0.008, 0.025), (px, py - 0.128, 0.27), 'orange')
    rp.finalize(parts)

    # 5. Gearbox_Housing
    gh = SubassemblyBuilder(root, 'Gearbox_Housing', m)
    px, py = 0.38, 0.06
    gh.box((0.22, 0.24, 0.15), (px, py, 0.64), 'pebble_grey')
    for i in range(4):
        gh.box((0.24, 0.015, 0.11), (px, py - 0.08 + i * 0.05, 0.64), 'steel')
    gh.box((0.05, 0.04, 0.06), (px - 0.12, py - 0.06, 0.63), 'safety_yellow')
    gh.cyl(0.075, 0.06, (px, py, 0.74), 'iron', axis='Z', verts=24)
    for j in range(6):
        gh.box((0.13, 0.008, 0.008), (px, py - 0.125, 0.592 + j * 0.019), 'dark_plinth')
    for xx in [px - 0.08, px + 0.08]:
        for yy in [py - 0.09, py + 0.09]:
            gh.cyl(0.009, 0.014, (xx, yy, 0.721), 'steel', axis='Z', verts=12)
    gh.box((0.12, 0.008, 0.023), (px, py - 0.128, 0.687), 'orange')
    gh.finalize(parts)

    # 6. Rotating_S-Band_Scanner_Bar
    sb = SubassemblyBuilder(root, 'Rotating_S-Band_Scanner_Bar', m, pivot=(0.38, 0.06, 0.80))
    px, py, sz = 0.38, 0.06, 0.80
    sb.box((0.16, 0.14, 0.06), (px, py, sz - 0.02), 'steel')
    sb.box((1.12, 0.09, 0.065), (px, py, sz + 0.02), 'white_dial')
    sb.box((1.02, 0.012, 0.038), (px, py - 0.050, sz + 0.02), 'dark_plinth')
    for ex in [px - 0.56, px + 0.56]:
        sb.box((0.04, 0.09, 0.08), (ex, py, sz + 0.02), 'status_red')
    for j in range(28):
        xx = px - 0.49 + j * 0.036
        sb.box((0.019, 0.003, 0.004), (xx, py - 0.057, sz + 0.021), 'steel')
    sb.cyl(0.048, 0.065, (px, py, sz - 0.055), 'steel', axis='Z', verts=32)
    sb.cyl(0.025, 0.018, (px, py, sz + 0.064), 'dark_plinth', axis='Z', verts=32)
    for xx in [px - 0.52, px + 0.52]:
        sb.cyl(0.006, 0.018, (xx, py - 0.049, sz + 0.021), 'steel', axis='Y', verts=12)
    sb.finalize(parts)

    export_model(root, parts, 'bridge_navcom_suite.glb')


def main():
    print("=== STARTING HIGH-DETAIL GENERATION OF 8 MARINE CONSUMER 3D ASSEMBLIES ===")
    build_esb_cubicle()
    build_battery_system()
    build_air_compressor()
    build_vent_fan()
    build_ballast_ows()
    build_galley_board()
    build_shore_power_reel()
    build_bridge_navcom()
    print("=== ALL 8 HIGH-DETAIL MARINE CONSUMER GLB MODELS GENERATED SUCCESSFULLY ===")


if __name__ == '__main__':
    main()
