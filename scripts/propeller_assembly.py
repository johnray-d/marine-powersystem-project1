"""Marine propeller + stern tube cutaway. Blender 4.x/5.x.
Run in Blender > Scripting. GLB exports beside this script (or home folder for unsaved blend).
Axis: X; aft/propeller at negative X; forward at positive X.
Units are illustrative meters, not design-certified dimensions.
"""
import bpy  # type: ignore
import math
import os
import shutil
from mathutils import Vector  # type: ignore
from math import sin, cos, pi

EXPORT_GLB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "marine_propeller_assembly.glb")
EXPORT_GLB_ALIAS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "marine_propeller.glb")

BLADE_COUNT = 4
# Blade tuning: larger radius and narrower chord produce a slender silhouette.
BLADE_RADIUS = 1.62
BLADE_CHORD_SCALE = 0.73
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)

PARTS=[]
def material(name, rgba, metallic=0, roughness=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgba,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    if bs:
        bs.inputs['Base Color'].default_value=(*rgba,1)
        bs.inputs['Metallic'].default_value=metallic
        bs.inputs['Roughness'].default_value=roughness
    return m
bronze=material('PBR_Bronze_Propeller',(.68,.38,.095),.86,.23)
bronze_edge=material('PBR_Bronze_Hub',(.53,.28,.075),.82,.31)
steel=material('PBR_Polished_Steel',(.55,.64,.70),.88,.20)
steel_dark=material('PBR_Shaft_Steel',(.23,.29,.34),.84,.31)
housing=material('PBR_Cast_Iron',(.14,.17,.19),.67,.48)
red=material('PBR_Red_Cutaway_Liner',(.59,.09,.075),.48,.42)
seal=material('PBR_Black_Seal',(.035,.043,.047),.04,.78)
bearing=material('PBR_Bearing_Bronze',(.66,.50,.23),.76,.29)
white=material('PBR_Cut_Edge',(.75,.76,.72),.15,.66)

def finish(obj,name,mat,rotating=False):
    obj.name=name; obj.data.materials.append(mat)
    for p in obj.data.polygons:p.use_smooth=True
    obj['part_name']=name; obj['rotating']=rotating; PARTS.append(obj)
    return obj

def cyl(name,x,r,depth,mat,rot=False,vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=(x,0,0))
    o=bpy.context.object; o.rotation_euler[1]=pi/2
    return finish(o,name,mat,rot)

def ring(name,x0,x1,inner,outer,mat,rot=False,segments=96,start=0,end=2*pi):
    """Closed annular extrusion, optionally with an open angular inspection sector."""
    verts=[]; faces=[]; n=segments
    for x,r in ((x0,inner),(x0,outer),(x1,inner),(x1,outer)):
        for i in range(n+1):
            a=start+(end-start)*i/n
            verts.append((x,r*cos(a),r*sin(a)))
    stride=n+1
    for i in range(n):
        a=i; b=i+1
        # inner cylindrical wall, outer cylindrical wall, and two end annuli
        faces.extend(((a,b,stride+b,stride+a),
                      (stride+a,stride+b,3*stride+b,3*stride+a),
                      (2*stride+a,3*stride+a,3*stride+b,2*stride+b),
                      (a,2*stride+a,2*stride+b,b)))
    if end-start < 2*pi-.001:
        for j in (0,n):
            faces.append((j,stride+j,3*stride+j,2*stride+j))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,name,mat,rot)

def sphere(name,loc,scale,mat,rot=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=loc)
    o=bpy.context.object; o.scale=scale; return finish(o,name,mat,rot)

def bevel(o,width=.012):
    mod=o.modifiers.new('Machined Edge Highlights','BEVEL');mod.width=width;mod.segments=3
    mod.limit_method='ANGLE';o.modifiers.new('Weighted Normals','WEIGHTED_NORMAL')

# Main rotating shaft, X axis; aft is left.
shaft=cyl('Propeller_Shaft',.50,.135,3.60,steel,True);bevel(shaft,.008)
cyl('Shaft_Aft_Taper',-1.34,.164,.36,steel_dark,True)
cyl('Propeller_Hub',-1.50,.29,.60,bronze_edge,True)
sphere('Hub_Aft_Nose',(-1.88,0,0),(.26,.265,.265),bronze,True)
ring('Hub_Aft_Collar',-1.88,-1.82,.15,.26,bronze_edge,True)
ring('Hub_Fastener_Ring',-1.89,-1.86,.045,.105,steel_dark,True)

# Sculpted propeller blades: swept, cambered, thickness, twist, tapered tips.
# Each blade's root and tip extend radially in the YZ plane, centered on X axis.
def make_blade(k):
    theta=2*pi*k/BLADE_COUNT + pi/8
    radial=Vector((0,cos(theta),sin(theta)))
    tangent=Vector((0,-sin(theta),cos(theta)))
    N=28; M=14; vertices=[]; faces=[]
    for side in (-1,1):
        for i in range(N+1):
            t=i/N; radius=.23+BLADE_RADIUS*t
            # tip rounds away; broad blade with progressive chord taper
            # Narrower, longer, rounded blade planform; avoid oversized paddle tips.
            chord=(.19 + .38 * sin(pi * (.08 + .84*t))**.85) * BLADE_CHORD_SCALE
            chord *= max(.045, (1 - t**10)**.48)
            sweep=-.09-.25*t+.035*sin(pi*t)
            twist=.60*(1-t)-.12*t
            for j in range(M+1):
                u=2*j/M-1
                camber=.045*(1-u*u)*sin(pi*t)**.7
                thick=(.026*(1-t)+.003)*math.sqrt(max(0,1-u*u))
                axial=sweep + chord*u*cos(twist)+camber+side*thick
                tang=chord*u*sin(twist)+.13*t*t
                p=Vector((-1.52+axial,0,0))+radial*radius+tangent*tang
                vertices.append(tuple(p))
    layer=(N+1)*(M+1)
    for side in range(2):
        base=side*layer
        for i in range(N):
            for j in range(M):
                a=base+i*(M+1)+j;b=a+1;c=b+M+1;d=a+M+1
                faces.append((a,b,c,d) if side else (d,c,b,a))
    for i in range(N):
        a0 = i*(M+1); b0 = (i+1)*(M+1)
        faces.append((a0, b0, b0+layer, a0+layer))
        a1 = a0 + M; b1 = b0 + M
        faces.append((a1, a1+layer, b1+layer, b1))
    for j in range(M):
        faces.append((j, j+1, j+1+layer, j+layer))
        tip_a = N*(M+1)+j; tip_b = tip_a + 1
        faces.append((tip_a, tip_a+layer, tip_b+layer, tip_b))
    mesh=bpy.data.meshes.new('BladeMesh');mesh.from_pydata(vertices,[],faces);mesh.update()
    o=bpy.data.objects.new(f'Propeller_Blade_{k+1}',mesh);bpy.context.collection.objects.link(o)
    finish(o,o.name,bronze,True)
    # blade mesh is already smoothly curved; no bevel modifier needed
for k in range(BLADE_COUNT):make_blade(k)

# Cutaway stationary stern tube. 90-degree front-right quadrant removed.
# Angular cut reveals the internal rings, shaft and seals.
# A smaller inspection opening retains more of the surrounding tube wall.
# The housing is intentionally cut away only at the viewer-facing upper quadrant.
start=.38*pi;end=1.93*pi
ring('Stern_Tube_Housing_Cutaway',-.20,1.90,.285,.53,housing,False,96,start,end)
ring('Stern_Tube_Liner_Cutaway',-.18,1.82,.265,.289,red,False,96,start,end)
ring('Stern_Tube_Cut_Edge_Aft',-.23,-.18,.282,.54,white,False,96,start,end)
ring('Stern_Tube_Cut_Edge_Fwd',1.82,1.88,.282,.54,white,False,96,start,end)
# Additional cast stern-tube closure and reinforcement pieces. These restore
# the previously visually incomplete aft/side housing while keeping an inspection slot.
ring('Aft_Gland_Outer_Casing',-.49,-.23,.28,.48,housing,False,96,start,end)
ring('Aft_Gland_Cut_Face',-.50,-.46,.28,.48,white,False,96,start,end)
ring('Aft_Gland_Gasket',-.44,-.40,.265,.295,seal,False,96,start,end)
ring('Forward_Tube_End_Collar',1.88,2.00,.29,.56,housing,False,96,start,end)
ring('Forward_Tube_End_Trim',1.97,2.00,.30,.57,white,False,96,start,end)
# Narrow longitudinal lips cap the two exposed radial edges of the shell.
for side,a in enumerate((start,end),1):
    y,z=math.cos(a),math.sin(a)
    bpy.ops.mesh.primitive_cube_add(size=1,location=(.80,.408*y,.408*z))
    lip=bpy.context.object
    lip.scale=(1.04,.020,.020)
    lip.rotation_euler[0]=a
    finish(lip,f'Housing_Cut_Edge_Rail_{side}',white)
# Bearings are full rings with exposed cross section in the cutaway
ring('Stern_Tube_Bearing_Aft',.10,.57,.148,.263,bearing)
ring('Stern_Tube_Bearing_Forward',1.17,1.64,.148,.263,bearing)
ring('Stern_Tube_Bearing_Sleeve',.64,1.10,.147,.202,steel_dark)
# Multi-stage seals near the aft opening
for i,x in enumerate((-.14,-.02,.09)):
    ring(f'Stepping_Ring_Seal_{i+1}',x,x+.065,.139,.276,seal)
    ring(f'Seal_Retainer_{i+1}',x+.052,x+.071,.142,.277,steel_dark)
ring('Oil_Seal',1.66,1.76,.138,.266,seal)
ring('Sealing_Housing',-.37,-.22,.155,.43,steel_dark)
ring('Sealing_Housing_Trim',-.39,-.36,.15,.44,steel)
ring('Thrust_Washer',-1.15,-1.11,.14,.23,bronze_edge,True)
ring('Shaft_Coupling_Flange',1.98,2.12,.14,.35,steel_dark,True)
ring('Coupling_Face',2.12,2.17,.14,.32,steel,True)
ring('Shaft_End_Collar',2.17,2.23,.14,.20,steel_dark,True)

# Eight coupling bolts at X axis locations.
for i in range(8):
    a=2*pi*i/8
    y=.265*cos(a);z=.265*sin(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.035,depth=.16,location=(2.07,y,z))
    o=bpy.context.object;o.rotation_euler[1]=pi/2;finish(o,f'Coupling_Bolt_{i+1}',steel,True)

# Exterior bracket, cutaway ring with ribs
ring('Shaft_Bracket_Cutaway',1.85,2.02,.53,.66,housing,False,96,start,end)
for i in range(3):
    x=.1+i*.77
    ring(f'Housing_Reinforcement_{i+1}',x,x+.045,.52,.59,housing,False,96,start,end)

# Key / keyway indicator, on top of aft shaft
bpy.ops.mesh.primitive_cube_add(size=1,location=(-1.04,0,.147))
o=bpy.context.object;o.scale=(.37,.06,.035);finish(o,'Propeller_Key',steel_dark,True);bevel(o,.008)

# Cap screws on aft gland to complete the visible sealing hardware.
for i in range(8):
    a=2*pi*i/8
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.027,depth=.055,
        location=(-.515,.395*cos(a),.395*sin(a)))
    fastener=bpy.context.object
    fastener.rotation_euler[1]=pi/2
    finish(fastener,f'Aft_Gland_Bolt_{i+1}',steel_dark)

# Camera / lighting for immediate preview
world=bpy.context.scene.world
if world:
    world.use_nodes=True
    bg=world.node_tree.nodes.get('Background')
    if bg: bg.inputs['Color'].default_value=(.19,.23,.29,1);bg.inputs['Strength'].default_value=.6

def area(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=loc
    direction=Vector((-.1,0,0))-obj.location;obj.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
area('Studio_Key',(-3,-4,5),1200,5)
area('Studio_Fill',(2,4,3),850,4)
area('Studio_Rim',(0,-1,-4),600,3)
camdata=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',camdata);bpy.context.collection.objects.link(cam)
cam.location=(-4.6,-6.7,3.5);direction=Vector((-.1,0,0))-cam.location;cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
camdata.type='ORTHO';camdata.ortho_scale=6.8;bpy.context.scene.camera=cam
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=64
bpy.context.scene.render.resolution_x=1600;bpy.context.scene.render.resolution_y=1000;bpy.context.scene.render.resolution_percentage=100

# Set viewport to material colors (so not gray in Solid mode)
for screen in bpy.data.screens:
    for area_ in screen.areas:
        if area_.type=='VIEW_3D':
            space=area_.spaces.active;space.shading.type='SOLID';space.shading.color_type='MATERIAL'
            space.region_3d.view_distance=6.5

# Export only mechanical components (no lights/camera).
bpy.ops.object.select_all(action='DESELECT')
for o in PARTS:o.select_set(True)
bpy.context.view_layer.objects.active=PARTS[0]
bpy.ops.export_scene.gltf(filepath=EXPORT_GLB_PATH,export_format='GLB',use_selection=True,export_apply=True,export_yup=True)
print(f'EXPORTED: {EXPORT_GLB_PATH} ({len(PARTS)} mechanical parts)')

# Also write alias for marine_propeller.glb
shutil.copyfile(EXPORT_GLB_PATH, EXPORT_GLB_ALIAS)
print(f'COPIED ALIAS: {EXPORT_GLB_ALIAS}')
