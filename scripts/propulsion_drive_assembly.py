"""Reference-inspired marine propulsion converter teaching assembly.
Run in Blender 4.x / 5.x Scripting. Exports marine_drive.glb to public directory.
Not a certified 6.6kV installation or electrically validated layout.
"""
import bpy, math, os
from mathutils import Vector
from math import pi

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def mat(name, rgb, metal=0, rough=.4, alpha=1):
    m=bpy.data.materials.new(name); m.diffuse_color=(*rgb,alpha); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    if p:
        p.inputs['Base Color'].default_value=(*rgb,alpha)
        p.inputs['Metallic'].default_value=metal
        p.inputs['Roughness'].default_value=rough
        if alpha<1:
            p.inputs['Alpha'].default_value=alpha
            try: m.surface_render_method='DITHERED'
            except: m.blend_method='BLEND'
    return m

steel=mat('01 Powder coated marine enclosure',(.57,.68,.73),.35)
frame=mat('02 Dark structural steel',(.17,.24,.29),.55)
blue=mat('03 Input equipment blue',(.06,.28,.52),.25)
teal=mat('04 Power modules teal',(.04,.52,.49),.35)
copper=mat('05 Copper busbars',(.72,.34,.09),.82,.25)
gold=mat('06 Brass fittings',(.76,.58,.21),.78,.23)
black=mat('07 Insulation and rubber',(.035,.052,.065),.08,.8)
red=mat('08 High voltage orange',(.95,.30,.07),.3)
green=mat('09 Control PCB green',(.035,.24,.18),.1)
glass=mat('10 Transparent cabinet ghost',(.62,.83,.91),.05,.25,.17)
light=mat('11 Label white',(.84,.92,.95),.08)

# Main dimensions in meters, X = cabinet width, Y = depth, Z = height.
# Front is negative Y; open front, translucent back and side walls.
def assign(o, material, part):
    o.name=part; o.data.materials.append(material)
    for p in o.data.polygons: p.use_smooth=True
    return o

def box(name, xyz, dim, material, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz); o=bpy.context.object
    o.dimensions=dim; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    assign(o,material,name)
    if bevel:
        b=o.modifiers.new('Machined edges','BEVEL'); b.width=bevel; b.segments=2
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def cyl(name, xyz, radius, depth, material, axis='Z', vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=xyz)
    o=bpy.context.object
    if axis=='Y': o.rotation_euler[0]=pi/2
    elif axis=='X': o.rotation_euler[1]=pi/2
    assign(o,material,name)
    b=o.modifiers.new('Edge rounding','BEVEL'); b.width=min(.008,depth/8); b.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def rod(name, a,b,r,material,verts=12):
    a,b=Vector(a),Vector(b); d=b-a; mid=(a+b)*.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=mid)
    o=bpy.context.object; o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return assign(o,material,name)

# Frame, back panel, roof, feet. Each independent assembly carries a prefix.
box('01_Cabinet_Base',(0,0,.08),(3.75,1.35,.16),frame)
box('01_Cabinet_Back',(0,.63,1.53),(3.75,.07,2.76),steel)
box('01_Cabinet_Roof',(0,0,2.97),(3.75,1.35,.09),steel)
for x in (-1.84,1.84):
    box('01_Cabinet_Upright',(x,-.61,1.53),(.07,.08,2.87),frame)
    box('01_Cabinet_InnerUpright',(x,.58,1.53),(.07,.08,2.87),frame)
for x in (-1.15,-.28,.55,1.32):
    box('01_Cabinet_Divider',(x,.45,1.53),(.028,.30,2.67),frame)
for x in (-1.35,0,1.35):
    for y in (-.40,.4): box('01_Cabinet_Foot',(x,y,-.055),(.18,.21,.13),black)
# semi-transparent side panels are optional and not used as GLB root for selection
for x in (-1.88,1.88): box('01_Cabinet_GhostSide',(x,0,1.52),(.025,1.28,2.76),glass,.002)

# 02 Input stage: incoming MV terminations, contactor, fuses, line reactor.
box('02_InputStage_Panel',(-1.47,-.43,1.52),(.59,.22,1.98),blue)
box('02_InputStage_Switchgear',(-1.47,-.58,1.88),(.43,.10,.60),black)
for i,x in enumerate((-1.65,-1.47,-1.29)):
    cyl('02_InputStage_CableGland',(x,-.62,.65),.055,.09,gold,'Y')
    rod('02_InputStage_IncomingCable',(x,-.60,.65),(x,-.50,1.18),.026,black)
    box('02_InputStage_FuseCarrier',(x,-.46,1.18),(.11,.11,.34),light)
for z in (2.26,2.40):
    for x in (-1.61,-1.46,-1.31): cyl('02_InputStage_Indicator',(x,-.57,z),.026,.012,red if z==2.4 else teal,'Y',16)
for i,x in enumerate((-1.62,-1.47,-1.32)):
    cyl('02_InputStage_LineReactor',(x,-.13,.76),.12,.32,copper,'Z')
    for j in range(5): cyl('02_InputStage_ReactorWinding',(x,-.13,.62+j*.065),.132,.023,gold,'Z')

# 03 DC link: capacitor bank, laminated copper busbars, precharge elements.
box('03_DCLink_Backplate',(-.65,.26,1.53),(.80,.11,2.22),frame)
for z in (1.02,1.19,1.36,1.53,1.70,1.87):
    for x in (-.89,-.66,-.43):
        cyl('03_DCLink_Capacitor',(x,-.18,z),.09,.30,black,'Y')
        cyl('03_DCLink_CapacitorTerminal',(x,-.36,z),.035,.035,gold,'Y')
for z in (2.28,2.41):
    box('03_DCLink_Busbar',(-.20,-.06,z),(2.80,.055,.055),copper,.008)
    for x in (-1.01,-.35,.40,1.15): cyl('03_DCLink_BusbarStandoff',(x,-.13,z),.06,.16,black,'Y')
for z in (.55,.73):
    box('03_DCLink_PrechargeResistor',(-.65,-.25,z),(.48,.18,.11),gold)

# 04 Inverter power stacks: six replaceable power cells, gate boards, cooling plates.
for bank,x in enumerate((.10,.75,1.40)):
    box('04_Inverter_CoolingPlate',(x,.19,1.48),(.46,.17,2.00),steel)
    for level,z in enumerate((.92,1.50,2.08)):
        box('04_Inverter_IGBTModule',(x,-.13,z),(.44,.35,.43),teal)
        box('04_Inverter_GateDriver',(x,-.335,z),(.34,.055,.25),green)
        for j in range(4):
            box('04_Inverter_HeatSinkFin',(x-.16+j*.105,.10,z),(.027,.23,.40),frame,.003)
        for side in (-1,1): cyl('04_Inverter_Fastener',(x+side*.16,-.36,z),.018,.018,gold,'Y',12)
    for z in (.68,2.28): rod('04_Inverter_CoolantManifold',(x-.16,.35,z),(x+.16,.35,z),.036,copper)

# 05 Cooling: piping, heat exchanger, pump, gauges, valves.
box('05_Cooling_HeatExchanger',(1.38,-.13,.42),(.70,.38,.48),steel)
for i in range(10): box('05_Cooling_HeatExchangerFin',(1.08+i*.067,-.345,.42),(.026,.04,.37),frame,.002)
cyl('05_Cooling_Pump',(1.73,.30,.40),.15,.36,teal,'X')
cyl('05_Cooling_PumpMotor',(1.56,.30,.40),.115,.30,frame,'X')
rod('05_Cooling_SupplyHeader',(.12,.40,.66),(1.60,.40,.66),.036,copper)
rod('05_Cooling_ReturnHeader',(.12,.40,2.60),(1.60,.40,2.60),.036,copper)
for x in (.10,.75,1.40):
    rod('05_Cooling_VerticalSupply',(x,.40,.66),(x,.40,1.00),.025,copper)
    rod('05_Cooling_VerticalReturn',(x,.40,2.16),(x,.40,2.60),.025,copper)
for x in (.20,1.20): cyl('05_Cooling_Valve',(x,.40,2.60),.064,.09,gold,'Z')
cyl('05_Cooling_PressureGauge',(1.63,-.18,.83),.08,.04,light,'Y')

# 06 Control and protections: PLC rack, terminal blocks, HMI, wiring trays.
box('06_Control_Cabinet',(1.47,-.47,1.81),(.56,.23,.87),blue)
box('06_Control_HMI',(1.47,-.605,2.04),(.37,.035,.22),black)
box('06_Control_Display',(1.47,-.628,2.04),(.29,.009,.14),teal,.002)
for i in range(5):
    box('06_Control_IOCard',(1.26+i*.10,-.605,1.64),(.072,.045,.23),green,.003)
for i in range(8):
    box('06_Control_TerminalBlock',(1.22+i*.07,-.60,1.48),(.054,.055,.085),gold,.003)
box('06_Control_EStop',(1.66,-.62,1.86),(.09,.04,.09),red)
box('06_Control_WiringTray',(0,-.47,2.75),(3.30,.14,.13),black)
for i in range(16):
    x=-1.50+i*.20
    rod('06_Control_SignalHarness',(x,-.40,2.68),(x,-.27,2.52),.008,teal,8)

# 07 Output terminals and cabling, three phases.
for i,x in enumerate((.26,.74,1.22)):
    cyl('07_Output_MotorTerminal',(x,-.47,.40),.077,.13,gold,'Y')
    rod('07_Output_PowerCable',(x,-.54,.40),(x,-.82,.27),.045,black)
    cyl('07_Output_CableGland',(x,-.63,.40),.067,.11,steel,'Y')
for x in (-1.67,1.67):
    for z in (.17,2.87): cyl('01_Cabinet_MountingBolt',(x,-.67,z),.034,.025,gold,'Y',12)

# Optional overview camera and studio lighting.
world=bpy.context.scene.world or bpy.data.worlds.new('Studio World'); bpy.context.scene.world=world
world.use_nodes=True; world.node_tree.nodes['Background'].inputs['Color'].default_value=(.13,.17,.22,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
bpy.ops.object.camera_add(location=(5,-7,4)); cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,1.45))-cam.location).to_track_quat('-Z','Y').to_euler()
bpy.context.scene.camera=cam
for loc,power,size in [((1,-4,6),1100,5),((-4,-2,3),800,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc); l=bpy.context.object
    l.data.energy=power; l.data.shape='DISK'; l.data.size=size
    l.rotation_euler=(Vector((0,0,1.5))-l.location).to_track_quat('-Z','Y').to_euler()
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.shading.type='SOLID'
        area.spaces.active.shading.color_type='MATERIAL'
        area.spaces.active.region_3d.view_distance=6.8
        area.spaces.active.region_3d.view_location=(0,0,1.5)

# Export only meshes. Camera and lights stay in Blender.
for o in bpy.context.selected_objects: o.select_set(False)
for o in bpy.data.objects:
    if o.type=='MESH': o.select_set(True)

try:
    script_dir=os.path.dirname(os.path.abspath(__file__))
    workspace_root=os.path.dirname(script_dir)
except NameError:
    workspace_root=bpy.path.abspath('//')

public_dir=os.path.join(workspace_root,'public')
if not os.path.exists(public_dir):
    public_dir=workspace_root

export_path1=os.path.join(public_dir,'marine_drive.glb')
bpy.ops.export_scene.gltf(filepath=export_path1,export_format='GLB',use_selection=True,export_apply=True,export_yup=True)
print('EXPORTED:',export_path1)

export_path2=os.path.join(public_dir,'marine_propulsion_drive_assembly.glb')
bpy.ops.export_scene.gltf(filepath=export_path2,export_format='GLB',use_selection=True,export_apply=True,export_yup=True)
print('EXPORTED:',export_path2)
