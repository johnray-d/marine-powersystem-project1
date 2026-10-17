import bpy  # type: ignore
import bmesh  # type: ignore
import math
from mathutils import Vector  # type: ignore


# ==============================================================================
# CONFIGURATION & ALIGNMENT WITH vessel-layout.ts
# Blender Axes:
#   X = Longitudinal (Stern -18.75 to Bow +19.0)
#   Y = Transverse Beam (Port -3.35 to Starboard +3.35)
#   Z = Vertical Height (Keel -2.65, Waterline -1.25, Main Deck +0.90)
# ==============================================================================
import os
EXPORT_GLB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "blender-hull-V6.glb")
INCLUDE_SUPERSTRUCTURE = True
INCLUDE_INTERNAL_COMPARTMENTS = True
INCLUDE_DECK_MACHINERY = True

# Clean existing objects and orphan materials
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat)

def clamp01(t):
    return max(0.0, min(1.0, t))

def smoothstep(edge0, edge1, x):
    t = clamp01((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)

def mix(a, b, t):
    return a + (b - a) * t

# ==============================================================================
# 1. CREATE MARITIME TRANSLUCENT & ACCENT MATERIALS
# ==============================================================================
def create_marine_material(name, rgba, roughness=0.20, metallic=0.15, transmission=0.55):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.diffuse_color = rgba
    if hasattr(mat, "blend_method"):
        mat.blend_method = 'BLEND' if rgba[3] < 0.99 else 'OPAQUE'
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = 'BLENDED' if rgba[3] < 0.99 else 'DITHERED'

    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = rgba[3]
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = transmission if rgba[3] < 0.95 else 0.0
        elif "Transmission" in bsdf.inputs:
            bsdf.inputs["Transmission"].default_value = transmission if rgba[3] < 0.95 else 0.0
    return mat

mat_hull_top   = create_marine_material("Hull_Topsides_NavyCyan",   (0.10, 0.36, 0.58, 0.30), roughness=0.16, transmission=0.68)
mat_hull_under = create_marine_material("Hull_Under_RedOxide",      (0.56, 0.19, 0.17, 0.35), roughness=0.22, transmission=0.60)
mat_waterline  = create_marine_material("Hull_Waterline_White",     (0.92, 0.97, 1.00, 0.78), roughness=0.15, transmission=0.20)
mat_deck       = create_marine_material("Deck_Marine_Slate",        (0.26, 0.43, 0.53, 0.44), roughness=0.28, transmission=0.45)
mat_internal   = create_marine_material("Internal_Deck_Bulkhead",   (0.30, 0.50, 0.60, 0.26), roughness=0.25, transmission=0.65)
mat_house      = create_marine_material("Superstructure_Frost",     (0.80, 0.91, 0.96, 0.30), roughness=0.16, transmission=0.70)
mat_window     = create_marine_material("Bridge_Window_Tint",       (0.06, 0.18, 0.28, 0.76), roughness=0.08, transmission=0.35)
mat_coaming    = create_marine_material("Breakwater_OxideRed",      (0.58, 0.22, 0.18, 0.72), roughness=0.32, transmission=0.20)
mat_funnel     = create_marine_material("Funnel_Livery_Orange",     (0.82, 0.31, 0.16, 0.74), roughness=0.26, transmission=0.20)
mat_machinery  = create_marine_material("Deck_Hardware_DarkSteel",  (0.15, 0.22, 0.27, 0.90), roughness=0.35, metallic=0.45, transmission=0.0)
mat_eq_pad     = create_marine_material("Equipment_Foundation_Pad", (0.14, 0.52, 0.64, 0.58), roughness=0.25, transmission=0.30)
mat_rail       = create_marine_material("Safety_Rail_Steel",        (0.52, 0.70, 0.78, 0.75), roughness=0.25, metallic=0.35, transmission=0.15)

# ==============================================================================
# 2. HULL SURFACE MATHEMATICS (EXTENDED STERN COUNTER & TRANSOM)
# ==============================================================================
def stem_x_profile(z):
    bulb_bell = math.exp(-((z - (-1.92)) / 0.52) ** 2)
    neck_dip = math.exp(-((z - (-1.12)) / 0.48) ** 2)
    upper_rake = smoothstep(-1.25, 1.58, z) ** 1.15
    x_base = 17.35 + 1.52 * bulb_bell - 0.32 * neck_dip + 1.62 * upper_rake
    forefoot_tuck = smoothstep(-2.65, -2.18, z)
    return mix(16.25, x_base, forefoot_tuck)

def stern_x_profile(z):
    """
    Extended Stern Silhouette:
    - Keel & skeg exit remains around -16.8 to -17.0 for the propeller disc
    - Upper transom counter extends aft to -19.70 at the main deck so the rudder
      at X = -18.85 has realistic clearance from the propeller and is completely housed under the ship's rear hull.
    """
    transom_overhang = smoothstep(-1.40, 0.45, z) ** 1.15
    skeg_foot = 1.0 - smoothstep(-2.65, -1.65, z)
    return -16.55 - 3.15 * transom_overhang - 0.55 * skeg_foot

def midship_half_beam(z, z_keel, z_sheer):
    v = clamp01((z - z_keel) / max(0.01, z_sheer - z_keel))
    bilge = 1.0 - (1.0 - clamp01(v / 0.28)) ** 2.2
    return 3.35 * bilge

def bow_cross_section_width(v, z):
    bulb_v = clamp01(1.0 - ((z - (-1.92)) / 0.74) ** 2)
    w_bulb = 0.88 * math.sqrt(bulb_v)
    flare_t = smoothstep(-1.45, 1.58, z)
    w_flare = 0.38 + 2.55 * (flare_t ** 0.82)
    waist_blend = smoothstep(-1.55, -0.95, z)
    return mix(w_bulb, w_flare, waist_blend)

def stern_cross_section_width(v, z):
    skeg_w = 0.22 + 0.16 * math.exp(-((z - (-2.22)) / 0.28) ** 2)
    transom_t = smoothstep(-1.65, 0.25, z)
    upper_w = 2.68 * (transom_t ** 0.68)
    return mix(skeg_w, max(skeg_w, upper_w), smoothstep(-2.35, -1.10, z))

def evaluate_hull_point(u, v):
    stern_keel_rise = 0.48 * ((1.0 - smoothstep(0.0, 0.12, u)) ** 1.6)
    bulb_tip_rise = 0.68 * (smoothstep(0.92, 1.0, u) ** 2.0)
    z_keel = -2.65 + stern_keel_rise + bulb_tip_rise

    fc_rise = 0.68 * (smoothstep(0.73, 0.98, u) ** 1.25)
    stern_rise = 0.14 * ((1.0 - smoothstep(0.0, 0.14, u)) ** 1.5)
    z_sheer = 0.90 + fc_rise + stern_rise

    z = mix(z_keel, z_sheer, v)
    x_aft = stern_x_profile(z)
    x_fwd = stem_x_profile(z)

    if u <= 0.70:
        t_main = u / 0.70
        x = mix(x_aft, 11.2, t_main)
    else:
        t_bow = (u - 0.70) / 0.30
        theta = t_bow * (math.pi * 0.5)
        x = mix(11.2, x_fwd, math.sin(theta))

    if v <= 1e-5 or u >= 1.0 - 1e-5:
        return Vector((x, 0.0, z))

    w_mid = midship_half_beam(z, -2.65, z_sheer)

    if u < 0.24:
        t_st = u / 0.24
        theta_st = (1.0 - t_st) * (math.pi * 0.5)
        w_st = stern_cross_section_width(v, z)
        y = mix(w_st, w_mid, smoothstep(0.0, 1.0, t_st))
        transom_keep = smoothstep(-0.85, 0.15, z)
        end_factor = mix(math.cos(theta_st) ** 0.85, 1.0, transom_keep)
        if u < 0.04:
            y *= mix(end_factor, 1.0, u / 0.04)
    elif u <= 0.70:
        y = w_mid
    else:
        t_bow = (u - 0.70) / 0.30
        theta = t_bow * (math.pi * 0.5)
        w_bow = bow_cross_section_width(v, z)
        frame_blend = smoothstep(0.0, 0.55, t_bow)
        w_combined = mix(w_mid, w_bow, frame_blend)

        waist_zone = math.exp(-((z - (-1.05)) / 0.55) ** 2)
        p = mix(0.72, 1.08, waist_zone)
        y = w_combined * (math.cos(theta) ** p)

    # Hawsepipe anchor bolster
    bolster_dx = (x - 16.85) / 0.55
    bolster_dz = (z - 0.55) / 0.32
    bolster_r2 = bolster_dx * bolster_dx + bolster_dz * bolster_dz
    if bolster_r2 < 1.0:
        y += 0.22 * ((1.0 - bolster_r2) ** 2)

    return Vector((x, max(0.0, y), z))

def get_hull_half_width_at(x_target, z_target):
    if x_target <= 11.2:
        u_est = clamp01((x_target - (-19.70)) / (11.2 - (-19.70)) * 0.70)
    else:
        ratio = clamp01((x_target - 11.2) / (18.5 - 11.2))
        u_est = 0.70 + 0.30 * (math.asin(ratio) / (math.pi * 0.5))

    v_est = clamp01((z_target - (-2.65)) / (0.90 - (-2.65)))
    pt = evaluate_hull_point(u_est, v_est)
    return max(0.05, pt.y * 0.93)

# ==============================================================================
# 3. BUILD HULL MESH, WATERLINE STRIPE & WEATHER DECKS
# ==============================================================================
bm = bmesh.new()

NU = 108
NV = 44

u_vals = [0.5 - 0.5 * math.cos((i / NU) * math.pi) for i in range(NU + 1)]
v_vals = [j / NV for j in range(NV + 1)]

stbd_grid = []
port_grid = []

for i, u in enumerate(u_vals):
    s_row = []
    p_row = []
    for j, v in enumerate(v_vals):
        pt = evaluate_hull_point(u, v)
        if j == 0 or i == NU:
            v_center = bm.verts.new(Vector((pt.x, 0.0, pt.z)))
            s_row.append(v_center)
            p_row.append(v_center)
        else:
            s_row.append(bm.verts.new(Vector((pt.x, pt.y, pt.z))))
            p_row.append(bm.verts.new(Vector((pt.x, -pt.y, pt.z))))
    stbd_grid.append(s_row)
    port_grid.append(p_row)

for i in range(NU):
    for j in range(NV):
        v00, v10, v11, v01 = stbd_grid[i][j], stbd_grid[i + 1][j], stbd_grid[i + 1][j + 1], stbd_grid[i][j + 1]
        z_avg = 0.25 * (v00.co.z + v10.co.z + v11.co.z + v01.co.z)
        x_avg = 0.25 * (v00.co.x + v10.co.x + v11.co.x + v01.co.x)

        if -1.32 <= z_avg <= -1.16:
            mat_idx = 3  # Waterline stripe
        elif z_avg < -1.32:
            mat_idx = 1  # Underwater red oxide
        else:
            bolster_dist = ((x_avg - 16.85) / 0.50) ** 2 + ((z_avg - 0.55) / 0.28) ** 2
            mat_idx = 4 if bolster_dist < 0.85 else 0

        unique_s = list(dict.fromkeys([v00, v10, v11, v01]))
        if len(unique_s) >= 3:
            try:
                f = bm.faces.new(unique_s)
                f.material_index = mat_idx
            except ValueError:
                pass

        p00, p10, p11, p01 = port_grid[i][j], port_grid[i + 1][j], port_grid[i + 1][j + 1], port_grid[i][j + 1]
        unique_p = list(dict.fromkeys([p00, p01, p11, p10]))
        if len(unique_p) >= 3:
            try:
                f = bm.faces.new(unique_p)
                f.material_index = mat_idx
            except ValueError:
                pass

# Transom plate (now at extended position X = -18.75)
transom_loop = [port_grid[0][j] for j in range(NV, 0, -1)] + [stbd_grid[0][0]] + [stbd_grid[0][j] for j in range(1, NV + 1)]
try:
    f_transom = bm.faces.new(transom_loop)
    f_transom.material_index = 0
except ValueError:
    pass

# Forecastle Deck
fc_start_i = min(range(NU), key=lambda idx: abs(stbd_grid[idx][NV].co.x - 12.6))
fc_port_verts, fc_stbd_verts = [], []
for i in range(fc_start_i, NU + 1):
    top_s = stbd_grid[i][NV].co
    z_fc = max(0.92, top_s.z - 0.36)
    pt_fc = evaluate_hull_point(u_vals[i], 0.82)
    if i == NU:
        vc = bm.verts.new(Vector((pt_fc.x, 0.0, z_fc)))
        fc_stbd_verts.append(vc)
        fc_port_verts.append(vc)
    else:
        fc_stbd_verts.append(bm.verts.new(Vector((pt_fc.x, pt_fc.y * 0.98, z_fc))))
        fc_port_verts.append(bm.verts.new(Vector((pt_fc.x, -pt_fc.y * 0.98, z_fc))))

for k in range(len(fc_stbd_verts) - 1):
    quad = list(dict.fromkeys([fc_port_verts[k], fc_port_verts[k + 1], fc_stbd_verts[k + 1], fc_stbd_verts[k]]))
    if len(quad) >= 3:
        try:
            f = bm.faces.new(quad)
            f.material_index = 2
        except ValueError:
            pass

# Main Weather Deck
for i in range(0, fc_start_i):
    s0, s1 = stbd_grid[i][NV].co, stbd_grid[i + 1][NV].co
    vp0 = bm.verts.new(Vector((s0.x, -s0.y * 0.99, 0.90)))
    vp1 = bm.verts.new(Vector((s1.x, -s1.y * 0.99, 0.90)))
    vs1 = bm.verts.new(Vector((s1.x, s1.y * 0.99, 0.90)))
    vs0 = bm.verts.new(Vector((s0.x, s0.y * 0.99, 0.90)))
    try:
        f = bm.faces.new([vp0, vp1, vs1, vs0])
        f.material_index = 2
    except ValueError:
        pass

# Forecastle step bulkhead
try:
    step_p0 = bm.verts.new(Vector((stbd_grid[fc_start_i][NV].co.x, -stbd_grid[fc_start_i][NV].co.y * 0.98, 0.90)))
    step_s0 = bm.verts.new(Vector((stbd_grid[fc_start_i][NV].co.x, stbd_grid[fc_start_i][NV].co.y * 0.98, 0.90)))
    f_step = bm.faces.new([step_p0, fc_port_verts[0], fc_stbd_verts[0], step_s0])
    f_step.material_index = 2
except ValueError:
    pass

bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

hull_mesh = bpy.data.meshes.new("ShipHull_Mesh")
bm.to_mesh(hull_mesh)
bm.free()

hull_obj = bpy.data.objects.new("ShipHull", hull_mesh)
bpy.context.collection.objects.link(hull_obj)
for m in [mat_hull_top, mat_hull_under, mat_deck, mat_waterline, mat_funnel]:
    hull_obj.data.materials.append(m)

for poly in hull_mesh.polygons:
    poly.use_smooth = True

smooth_mod = hull_obj.modifiers.new(name="FairingSmooth", type='SMOOTH')
smooth_mod.factor = 0.42
smooth_mod.iterations = 3

solid_mod = hull_obj.modifiers.new(name="HullThickness", type='SOLIDIFY')
solid_mod.thickness = 0.042
solid_mod.offset = -1.0
solid_mod.use_even_offset = True

# ==============================================================================
# 4. HELPER BUILDERS
# ==============================================================================
def add_beveled_box(name, size, loc, mat, bevel_width=0.035, rot=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bev = obj.modifiers.new(name="SoftEdges", type='BEVEL')
    bev.width = bevel_width
    bev.segments = 3
    bev.limit_method = 'ANGLE'
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    return obj

def add_cyl(name, radius, depth, loc, mat, rot=(0.0, 0.0, 0.0), vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    return obj

def add_cone_x(name, r_aft, r_fwd, length, loc, mat, vertices=24):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=r_aft, radius2=r_fwd, depth=length,
        location=loc, rotation=(0.0, math.pi / 2.0, 0.0)
    )
    obj = bpy.context.active_object
    obj.name = name
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    return obj

def add_rail_segment(name, p0, p1, radius, mat):
    a, b = Vector(p0), Vector(p1)
    d = b - a
    rot = Vector((0.0, 0.0, 1.0)).rotation_difference(d.normalized()).to_euler()
    return add_cyl(name, radius, d.length, tuple((a + b) * 0.5), mat, (rot.x, rot.y, rot.z), vertices=12)

# ==============================================================================
# 5. HULL-CONFORMING INTERNAL COMPARTMENTS (ENGINE ROOM & BULKHEADS)
# ==============================================================================
if INCLUDE_INTERNAL_COMPARTMENTS:
    bm_tt = bmesh.new()
    tt_xs = [-14.2 + i * 0.45 for i in range(27)]
    tt_port, tt_stbd = [], []
    for x_val in tt_xs:
        w = min(2.25, get_hull_half_width_at(x_val, -1.72))
        tt_port.append(bm_tt.verts.new(Vector((x_val, -w, -1.76))))
        tt_stbd.append(bm_tt.verts.new(Vector((x_val,  w, -1.76))))
    for k in range(len(tt_xs) - 1):
        bm_tt.faces.new([tt_port[k], tt_port[k + 1], tt_stbd[k + 1], tt_stbd[k]])
    bmesh.ops.recalc_face_normals(bm_tt, faces=bm_tt.faces)
    tt_mesh = bpy.data.meshes.new("Conforming_TankTop_Mesh")
    bm_tt.to_mesh(tt_mesh)
    bm_tt.free()
    tt_obj = bpy.data.objects.new("EngineRoom_Conforming_TankTop", tt_mesh)
    bpy.context.collection.objects.link(tt_obj)
    tt_obj.data.materials.append(mat_internal)
    solid_tt = tt_obj.modifiers.new(name="Thickness", type='SOLIDIFY')
    solid_tt.thickness = 0.04

    add_beveled_box("Switchgear_Mezzanine_Flat", (6.5, 2.3, 0.045), (-6.65, -0.25, -0.33), mat_internal, 0.015)

    for b_idx, bx in enumerate([-14.5, -3.0, 11.0]):
        bm_bh = bmesh.new()
        bh_zs = [-2.50 + j * 0.24 for j in range(15)]
        bh_p, bh_s = [], []
        for z_val in bh_zs:
            w = get_hull_half_width_at(bx, z_val)
            bh_p.append(bm_bh.verts.new(Vector((bx, -w, z_val))))
            bh_s.append(bm_bh.verts.new(Vector((bx,  w, z_val))))
        for k in range(len(bh_zs) - 1):
            bm_bh.faces.new([bh_p[k], bh_p[k + 1], bh_s[k + 1], bh_s[k]])
        bmesh.ops.recalc_face_normals(bm_bh, faces=bm_bh.faces)
        bh_mesh = bpy.data.meshes.new(f"Watertight_Bulkhead_{b_idx+1}_Mesh")
        bm_bh.to_mesh(bh_mesh)
        bm_bh.free()
        bh_obj = bpy.data.objects.new(f"Watertight_Bulkhead_{b_idx+1}", bh_mesh)
        bpy.context.collection.objects.link(bh_obj)
        bh_obj.data.materials.append(mat_internal)
        solid_bh = bh_obj.modifiers.new(name="Thickness", type='SOLIDIFY')
        solid_bh.thickness = 0.035

    eq_pads = [
        ("Pad_DG1",   (-8.8, -1.25, -1.73), (2.10, 1.02, 0.05)),
        ("Pad_DG2",   (-5.9, -1.25, -1.73), (2.10, 1.02, 0.05)),
        ("Pad_DG3",   (-8.8,  1.25, -1.73), (2.10, 1.02, 0.05)),
        ("Pad_DG4",   (-5.9,  1.25, -1.73), (2.10, 1.02, 0.05)),
        ("Pad_Motor", (-13.5, 0.00, -2.04), (2.05, 1.12, 0.05)),
        ("Pad_Drive", (-11.3, 1.25, -1.72), (1.45, 0.70, 0.05)),
        ("Pad_TxA",   (-4.0, -1.12, -1.73), (1.12, 0.90, 0.05)),
        ("Pad_TxB",   (-4.0,  1.12, -1.73), (1.12, 0.90, 0.05)),
        ("Pad_BusA",  (-8.7, -0.70, -0.30), (1.40, 0.66, 0.04)),
        ("Pad_BusB",  (-6.8, -0.70, -0.30), (1.40, 0.66, 0.04)),
        ("Pad_LVBus", (-4.25, 0.00, -0.30), (1.50, 0.60, 0.04)),
        ("Pad_EMGen", (-12.0,-1.30,  2.16), (1.38, 0.70, 0.04))
    ]
    for p_name, p_loc, p_size in eq_pads:
        add_beveled_box(p_name, p_size, p_loc, mat_eq_pad, 0.015)

# ==============================================================================
# 6. CARGO HOLD COAMINGS, FORECASTLE MACHINERY & SAFETY RAILS
# ==============================================================================
for idx, bay_x in enumerate([-4.4, -1.15, 2.1, 9.9]):
    add_beveled_box(f"CargoBay_Pad_{idx+1}", (3.14, 5.45, 0.09), (bay_x, 0.0, 0.955), mat_deck, 0.025)
    for side in [-1, 1]:
        add_beveled_box(f"Hatch_SideLip_{idx+1}_{side}", (3.16, 0.08, 0.14), (bay_x, side * 2.74, 1.02), mat_coaming, 0.015)

for side in [-1, 1]:
    add_cyl(f"Deck_TopRail_{side}", 0.018, 19.6, (2.6, side * 3.24, 1.18), mat_rail, (0.0, math.pi / 2.0, 0.0))
    for rx in range(-7, 13, 2):
        add_cyl(f"Rail_Post_{side}_{rx}", 0.014, 0.30, (float(rx), side * 3.24, 1.04), mat_rail)

for side in [-1, 1]:
    angle_z = side * math.radians(-68)
    add_beveled_box(f"Breakwater_Wing_{side}", (0.08, 2.45, 0.52), (13.48, side * 1.12, 1.24), mat_coaming, 0.02, (0.0, 0.0, angle_z))

if INCLUDE_DECK_MACHINERY:
    for side in [-1, 1]:
        wx, wy, wz = 15.6, side * 0.92, 1.15
        add_beveled_box(f"Windlass_Base_{side}", (1.05, 0.68, 0.07), (wx, wy, wz), mat_machinery, 0.015)
        add_beveled_box(f"Windlass_Gearbox_{side}", (0.44, 0.30, 0.36), (wx - 0.18, wy, wz + 0.20), mat_machinery, 0.02)
        add_cyl(f"Windlass_Drum_{side}", 0.18, 0.48, (wx + 0.16, wy, wz + 0.22), mat_machinery, (math.pi / 2.0, 0.0, 0.0))
        add_cyl(f"Windlass_BrakeWheel_{side}", 0.14, 0.04, (wx - 0.18, wy - side * 0.20, wz + 0.28), mat_funnel, (math.pi / 2.0, 0.0, 0.0))

        ax, ay, az = 16.85, side * 1.62, 0.50
        add_cyl(f"Anchor_Shank_{side}", 0.038, 0.46, (ax, ay, az), mat_machinery, (0.0, math.radians(20), 0.0))
        add_beveled_box(f"Anchor_Crown_{side}", (0.14, 0.34, 0.10), (ax - 0.08, ay, az - 0.22), mat_machinery, 0.015)
        for dy in [-0.12, 0.12]:
            add_beveled_box(f"Anchor_Fluke_{side}_{dy}", (0.08, 0.06, 0.28), (ax - 0.02, ay + dy, az - 0.10), mat_machinery, 0.01, (0.0, math.radians(-18), 0.0))

        for bx, by, bz in [(14.5, side * 2.15, 1.10), (16.4, side * 1.55, 1.22), (-16.2, side * 2.55, 0.92)]:
            add_beveled_box(f"Bollard_Base_{side}_{bx}", (0.26, 0.14, 0.03), (bx, by, bz), mat_machinery, 0.008)
            for dx in [-0.07, 0.07]:
                add_cyl(f"Bollard_Post_{side}_{bx}_{dx}", 0.035, 0.16, (bx + dx, by, bz + 0.09), mat_machinery)

    for side in [-1, 1]:
        add_cyl(f"Foremast_Leg_{side}", 0.032, 1.45, (17.85, side * 0.22, 1.92), mat_house, (math.radians(-side * 8), math.radians(-6), 0.0))
    add_beveled_box("Foremast_Crossbar", (0.06, 0.52, 0.05), (17.92, 0.0, 2.25), mat_house, 0.01)
    add_cyl("Bow_Jackstaff", 0.018, 0.85, (18.65, 0.0, 1.92), mat_rail)

# ==============================================================================
# 7. PROPELLER TAIL SHAFT, UNDER-HULL RUDDER & BOW THRUSTER (NO STERN THRUSTERS)
# ==============================================================================
# A. Propeller Shaft Bossing & Tail Shaft Seat (Propeller Hub attaches here at X = -17.40)
add_cyl("Propeller_Shaft_Bossing", 0.18, 3.2, (-15.4, 0.0, -2.22), mat_hull_under, (0.0, math.pi / 2.0, 0.0))
add_cyl("Stern_Tube_NutRing", 0.22, 0.12, (-16.95, 0.0, -2.22), mat_machinery, (0.0, math.pi / 2.0, 0.0))
add_cone_x("Stern_Tube_Boss_Fairing", 0.20, 0.27, 0.55, (-16.675, 0.0, -2.22), mat_hull_under)
add_cone_x("Propeller_Tail_Shaft", 0.085, 0.125, 0.50, (-17.15, 0.0, -2.22), mat_machinery)

# B. Semi-Balanced Rudder (Positioned comfortably aft at X = -18.85 with realistic clearance from propeller)
RUDDER_X       = -18.85
RUDDER_Z       = -1.55
RUDDER_STOCK_X = RUDDER_X + 0.07

add_beveled_box("SemiBalanced_Rudder", (0.52, 0.11, 1.35), (RUDDER_X, 0.0, RUDDER_Z), mat_hull_under, 0.035)
# Vertical Rudder Stock extends directly up through the hull's lower counter plating
add_cyl("Rudder_Stock", 0.048, 1.15, (RUDDER_STOCK_X, 0.0, -0.45), mat_machinery)
add_cyl("Rudder_Stock_Palm", 0.095, 0.04, (RUDDER_STOCK_X, 0.0, -0.855), mat_machinery)
for side in [-1, 1]:
    add_beveled_box(f"Rudder_Anode_{side}", (0.16, 0.03, 0.10), (RUDDER_X, side * 0.065, -1.95), mat_rail, 0.008)

# C. Bow Thruster Tunnel ONLY (Stern Thrusters completely removed)
add_cyl("BowThruster_Tunnel", 0.48, 2.35, (14.1, 0.0, -2.15), mat_machinery, (math.pi / 2.0, 0.0, 0.0))
for side in [-1, 1]:
    y_end = side * (2.35 * 0.5)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.48, minor_radius=0.035,
        location=(14.1, y_end, -2.15), rotation=(math.pi / 2.0, 0.0, 0.0)
    )
    ring_obj = bpy.context.active_object
    ring_obj.name = f"BowThruster_Collar_{side}"
    ring_obj.data.materials.append(mat_machinery)
    for bar_dx in [-0.48 * 0.48, 0.0, 0.48 * 0.48]:
        bar_h = math.sqrt(max(0.02, 0.48 * 0.48 - bar_dx * bar_dx)) * 1.9
        add_cyl(f"BowThruster_Grate_{side}_{bar_dx:.2f}", 0.015, bar_h, (14.1 + bar_dx, y_end, -2.15), mat_rail)

# ==============================================================================
# 7D. EXTENDED STERN DECK OUTFIT (X = -19.55 to -13.5)
# ==============================================================================
STERN_RAIL_Z = 1.18

def stern_deck_half_width(x):
    u = clamp01((x - (-19.70)) / (11.2 - (-19.70)) * 0.70)
    return evaluate_hull_point(u, 1.0).y

# Handrails extended all the way to the new transom at X = -19.55
stern_post_xs = [-19.55, -18.85, -18.15, -17.45, -16.75, -16.05, -15.35, -14.65, -13.95]
for side in [-1, 1]:
    rail_pts = []
    for rx in stern_post_xs:
        ry = side * (stern_deck_half_width(rx) - 0.14)
        rail_pts.append((rx, ry, STERN_RAIL_Z))
        add_cyl(f"Stern_Rail_Post_{side}_{rx}", 0.014, 0.30, (rx, ry, 1.04), mat_rail)
    for k in range(len(rail_pts) - 1):
        add_rail_segment(f"Stern_Rail_{side}_{k}", rail_pts[k], rail_pts[k + 1], 0.018, mat_rail)

ys_t = stern_deck_half_width(-19.55) - 0.14
add_rail_segment("Stern_Transom_Rail", (-19.55, -ys_t, STERN_RAIL_Z), (-19.55, ys_t, STERN_RAIL_Z), 0.018, mat_rail)
for k in range(1, 6):
    add_cyl(f"Stern_Transom_Post_{k}", 0.014, 0.30, (-19.55, -ys_t + k * (2.0 * ys_t / 6.0), 1.04), mat_rail)

for side in [-1, 1]:
    add_beveled_box(f"Stern_Quarter_Chock_{side}", (0.34, 0.20, 0.12),
                    (-17.20, side * stern_deck_half_width(-17.20), 1.00), mat_machinery, 0.02)

if INCLUDE_DECK_MACHINERY:
    awx, awz = -15.4, 0.93
    add_beveled_box("AftWinch_Base", (1.10, 1.95, 0.06), (awx, 0.0, awz), mat_machinery, 0.012)
    add_beveled_box("AftWinch_Gearbox", (0.52, 0.46, 0.40), (awx, 0.0, awz + 0.23), mat_machinery, 0.02)
    add_cyl("AftWinch_Motor", 0.14, 0.40, (awx + 0.46, 0.0, awz + 0.22), mat_machinery, (0.0, math.pi / 2.0, 0.0))
    for side in [-1, 1]:
        add_cyl(f"AftWinch_Drum_{side}", 0.17, 0.50, (awx, side * 0.62, awz + 0.22), mat_machinery, (math.pi / 2.0, 0.0, 0.0))
        add_cyl(f"AftWinch_FlangeIn_{side}", 0.24, 0.03, (awx, side * 0.36, awz + 0.22), mat_machinery, (math.pi / 2.0, 0.0, 0.0))
        add_cyl(f"AftWinch_FlangeOut_{side}", 0.24, 0.03, (awx, side * 0.88, awz + 0.22), mat_machinery, (math.pi / 2.0, 0.0, 0.0))

    rake = math.radians(-10.0)
    staff_len = 1.50
    s_base = Vector((-19.35, 0.0, 0.93))
    s_axis = Vector((math.sin(rake), 0.0, math.cos(rake)))
    add_cyl("Ensign_Staff_Socket", 0.05, 0.10, tuple(s_base), mat_machinery)
    add_cyl("Ensign_Staff", 0.022, staff_len, tuple(s_base + s_axis * (staff_len * 0.5)), mat_rail, (0.0, rake, 0.0))
    add_cyl("Ensign_Staff_Truck", 0.038, 0.07, tuple(s_base + s_axis * staff_len), mat_machinery, (0.0, rake, 0.0))

    for side in [-1, 1]:
        lbx = -18.35
        lby = side * (stern_deck_half_width(lbx) - 0.20)
        bpy.ops.mesh.primitive_torus_add(
            major_radius=0.24, minor_radius=0.05,
            location=(lbx, lby, STERN_RAIL_Z + 0.30), rotation=(math.pi / 2.0, 0.0, 0.0)
        )
        lb_obj = bpy.context.active_object
        lb_obj.name = f"Lifebuoy_Stern_{side}"
        lb_obj.data.materials.append(mat_funnel)

# ==============================================================================
# 8. SUPERSTRUCTURE, BRIDGE GLAZING, FUNNEL & MAST
# ==============================================================================
if INCLUDE_SUPERSTRUCTURE:
    add_beveled_box("Accommodation_Block", (6.2, 5.3, 3.1), (-10.4, 0.0, 2.45), mat_house, 0.14)
    for idx, deck_z in enumerate([0.98, 2.12, 3.30, 4.02]):
        add_beveled_box(f"House_Deck_{idx+1}", (6.32, 5.44, 0.06), (-10.4, 0.0, deck_z), mat_deck, 0.02)

    add_beveled_box("Navigation_Bridge_Wings", (2.42, 6.14, 0.74), (-8.55, 0.0, 3.77), mat_house, 0.10)
    add_beveled_box("Bridge_Roof_Visor", (2.56, 6.26, 0.06), (-8.50, 0.0, 4.15), mat_deck, 0.02)

    for wz_y in [-2.60, -2.05, -1.50, -0.95, -0.40, 0.15, 0.70, 1.25, 1.80, 2.35]:
        add_beveled_box(f"Bridge_FrontWindow_{wz_y:.2f}", (0.04, 0.44, 0.32), (-7.33, wz_y, 3.84), mat_window, 0.008)

    for side in [-1, 1]:
        for tier_z in [1.52, 2.68]:
            for wx in [-12.4, -11.5, -10.6, -9.7, -8.8]:
                add_beveled_box(f"Cabin_Window_{side}_{tier_z}_{wx}", (0.42, 0.03, 0.24), (wx, side * 2.66, tier_z), mat_window, 0.008)

    add_beveled_box("Funnel_Casing_Main", (1.46, 1.16, 1.05), (-12.2, 0.7, 4.42), mat_funnel, 0.10)
    add_beveled_box("Funnel_Top_Crown", (1.48, 1.18, 0.24), (-12.2, 0.7, 4.98), mat_machinery, 0.04)
    for ex_idx, ex_x in enumerate([-12.62, -12.34, -12.06, -11.78]):
        add_cyl(f"Exhaust_Uptake_{ex_idx+1}", 0.085, 0.32, (ex_x, 0.7, 5.18), mat_machinery)

    add_cyl("Radar_Mast_Pole", 0.042, 1.85, (-8.7, 0.0, 5.02), mat_rail)
    add_beveled_box("Radar_CrossTree_Lower", (0.14, 1.35, 0.06), (-8.7, 0.0, 5.42), mat_rail, 0.015)
    add_beveled_box("Radar_Scanner_Array", (0.12, 0.92, 0.08), (-8.65, 0.0, 5.96), mat_house, 0.02)

# ==============================================================================
# 9. VIEWPORT SHADING SETUP
# ==============================================================================
for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type == 'VIEW_3D':
            for space in area.spaces:
                if space.type == 'VIEW_3D':
                    space.shading.type = 'SOLID'
                    space.shading.color_type = 'MATERIAL'
                    space.shading.show_specular_highlight = True

print("V6 Complete: Rear hull overhang extended over rudder, stern thruster removed, bow thruster preserved!")

if EXPORT_GLB_PATH:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=EXPORT_GLB_PATH,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True
    )
    print(f"Exported detailed GLB to: {EXPORT_GLB_PATH}")