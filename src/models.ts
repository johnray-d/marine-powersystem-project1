import * as THREE from 'three';
import type { ModelType } from './network';
import { detailedParts, buildDetailedPart } from './equipment-models';

type Shape = 'box'|'cylinder'|'sphere'|'torus'|'blade'|'coil';
export interface PartSpec { id:string; name:string; description:string; shape:Shape; pos:[number,number,number]; size:[number,number,number]; color:number; explode?:[number,number,number]; }
export interface ModelInstance { group:THREE.Group; parts:{spec:PartSpec; group:THREE.Group; base:THREE.Vector3; exploded:THREE.Vector3}[]; }
const p=(id:string,name:string,description:string,shape:Shape,pos:[number,number,number],size:[number,number,number],color:number):PartSpec=>({id,name,description,shape,pos,size,color});
const navy=0x31526b, steel=0xaec5d2, copper=0xe2a05b, teal=0x4ed9c8, amber=0xffbc68, blue=0x629bd5, pale=0xe8eef0, dark=0x23394d;

export const modelParts:Record<ModelType,PartSpec[]> = {
  generator:detailedParts.generator,
  breaker:detailedParts.breaker,
  'hv-board':detailedParts['hv-board'],
  transformer:[
    p('tank','Tank / enclosure','Provides mechanical protection and contains the active assembly.','box',[0,0,0],[2.9,2.2,1.5],navy),
    p('core','Magnetic core','Guides changing magnetic flux between the windings.','box',[0,-0.1,0.12],[1.8,1.65,0.55],steel),
    p('primary','Primary winding','Input coil connected to the higher-voltage side in this step-down example.','coil',[-0.62,0,0.48],[0.65,1.2,0.65],copper),
    p('secondary','Secondary winding','Output coil provides a lower voltage in this simplified transformer.','coil',[0.62,0,0.48],[0.65,1.2,0.65],amber),
    p('insulation','Electrical insulation','Separates windings, core, and enclosure to prevent unwanted contact.','box',[0,0,0.82],[1.65,1.4,0.15],pale),
    p('terminals','Input / output terminals','Insulated bushings carry the electrical connections through the enclosure.','cylinder',[0,1.25,0],[1.8,0.35,0.35],teal),
    p('radiator','Cooling fins','Increase the surface area available to release transformer heat.','box',[-1.52,-.05,0],[.23,1.75,1.2],steel)
  ],
  'lv-board':detailedParts['lv-board'],
  drive:[
    p('cabinet','01 Drive cabinet & frame','Structural support, mounting feet, roof, enclosure and access panels. The front is open for internal inspection.','box',[0,0,0],[3.2,2.35,1.4],navy),
    p('input','02 MV input stage','Incoming 6.6 kV cable glands, vacuum switchgear, fuse carriers, and line reactors.','box',[-0.95,0,0.78],[0.62,1.5,0.25],blue),
    p('dc','03 DC link capacitor bank','Intermediate DC energy storage, capacitors, copper busbars and precharge resistors.','box',[-0.35,0,0.78],[0.65,1.5,0.25],copper),
    p('inverter','04 Inverter power modules','IGBT switching cells, gate drivers, cooling plates and heat-sink fins.','box',[0.35,0,0.78],[0.62,1.5,0.25],teal),
    p('cooling','05 Liquid cooling circuit','Circulating pump, plate heat exchanger, manifold headers, and pressure gauges.','box',[0.95,-0.5,0.4],[0.7,0.45,0.5],steel),
    p('controller','06 Control & protection rack','HMI display, PLC processor rack, optocoupler I/O cards, and emergency stop.','box',[0.95,0.6,0.78],[0.55,0.85,0.25],amber),
    p('output','07 Motor output terminals','Three-phase power cable gland array feeding the propulsion motor.','cylinder',[0.45,-0.9,0.78],[0.6,0.25,0.25],dark)
  ],
  motor:[
    p('frame','01 Stator frame & ribs','Cast-iron cylindrical housing with integral cooling jacket and circumferential cooling fins.','cylinder',[0,0,0],[2.5,1.5,1.5],navy),
    p('stator','02 Stator core & windings','Low-loss silicon steel core carrying 6.6 kV vacuum-pressure impregnated copper coils.','cylinder',[0,0,0],[2.2,1.14,1.14],blue),
    p('rotor','03 Squirrel-cage rotor','Heavy laminated electrical steel rotor producing continuous propulsion torque.','cylinder',[0,0,0],[2.8,0.58,0.58],copper),
    p('shaft','04 Drive output shaft & key','High-tensile alloy shaft with drive key and precision propeller coupling taper.','cylinder',[1.62,0,0],[1.5,0.18,0.18],steel),
    p('bearings','05 Heavy-duty bearings','DE cylindrical roller bearing and NDE deep-groove locating ball bearing.','torus',[-1.05,0,0],[0.8,0.8,0.2],amber),
    p('terminal','06 6.6 kV Terminal box','IP56 marine enclosure with standoff insulators and armoured cable gland array.','box',[-0.35,0.95,0],[0.9,0.4,0.68],teal),
    p('fan','07 Bi-directional cooling fan','Aft shaft-mounted cooling impeller and protective wire guard forcing air over frame ribs.','cylinder',[-1.42,0,0],[.28,1.36,1.36],steel)
  ],
  thruster:detailedParts.thruster,
  reefer:[
    p('cabinet','Reefer distribution cabinet','Houses the group feeder and individual outlet protection.','box',[0,0,0],[2.7,2.35,1.2],navy),
    p('incomer','Incoming feeder','Brings power from the low-voltage switchboard.','box',[-0.72,0.35,0.7],[0.7,0.95,0.25],blue),
    p('breakers','Outlet protection','Separates reefer socket groups for switching and protection.','box',[0.6,0.35,0.7],[1.0,0.95,0.25],amber),
    p('sockets','Reefer sockets','Connection points for refrigerated containers.','box',[0,-0.65,0.75],[1.9,0.55,0.25],teal),
    p('cable','Deck cable route','Carries power from the cabinet toward container bays.','cylinder',[0,-1.45,0],[1.65,0.23,0.23],copper),
    p('earth','Earth terminal bar','Provides protective earthing connections for the reefer outlets and cabinet.','box',[0,-.96,.68],[1.8,.08,.13],steel)
  ],
  pump:[
    p('base','Pump skid','Holds the motor and pump in alignment.','box',[0,-0.75,0],[3.0,0.2,1.3],navy),
    p('motor','Electric motor','Turns the pump when commanded and supplied.','cylinder',[-0.75,0,0],[1.25,0.85,0.85],blue),
    p('coupling','Shaft coupling','Transfers rotation from motor to pump.','cylinder',[0.05,0,0],[0.38,0.25,0.25],copper),
    p('casing','Pump casing','Contains the impeller and directs fluid flow.','sphere',[0.75,0,0],[1.05,1.05,0.8],steel),
    p('impeller','Impeller','Rotating part that adds energy to the liquid.','blade',[0.75,0,0.5],[0.8,0.12,0.18],teal),
    p('ports','Suction / discharge ports','Flanged connections join the pump casing to its suction and discharge pipes.','cylinder',[1.48,0.18,0],[0.85,0.35,0.35],amber),
    p('seal','Shaft seal','Limits leakage where the rotating shaft enters the pump casing.','torus',[.27,0,0],[.32,.32,.045],pale)
  ],
  propeller:[
    p('hub','Propeller hub / boss','Nickel-Aluminum-Bronze boss transmitting propulsion shaft torque.','cylinder',[0,0,0],[0.8,0.48,0.48],amber),
    p('blades','Kaplan skewed blades','Four skewed Kaplan-profile bronze blades producing forward thrust.','blade',[0,0,0],[1.2,0.15,0.15],copper),
    p('tailshaft','Main propulsion tailshaft','Forged alloy steel tailshaft keyed into the propeller hub bore.','cylinder',[1.2,0,0],[1.8,0.22,0.22],steel),
    p('nut','Thrust retaining nut & cap','High-tensile locking nut and fairing nose cap securing the hub.','cylinder',[-0.55,0,0],[0.35,0.32,0.32],dark),
    p('seals','Stern tube lip seals','Multi-stage elastomeric lip seals preventing seawater ingress.','torus',[0.75,0,0],[0.45,0.45,0.08],teal),
    p('bearing','Stern tube bearing','White-metal journal bearing supporting the cantilevered propeller.','cylinder',[1.5,0,0],[0.85,0.38,0.38],pale)
  ]
};

function geometry(spec:PartSpec):THREE.BufferGeometry {
  const [a,b,c]=spec.size;
  switch(spec.shape){
    case 'box':return new THREE.BoxGeometry(a,b,c);
    case 'sphere':return new THREE.SphereGeometry(0.5,20,14).scale(a,b,c);
    case 'torus':return new THREE.TorusGeometry(a/2,c,8,24).rotateY(Math.PI/2);
    case 'coil':return new THREE.TorusGeometry(a/2,0.11,8,32).rotateX(Math.PI/2).scale(1,b/a,1);
    case 'blade':return new THREE.BoxGeometry(a,b,c);
    case 'cylinder':return new THREE.CylinderGeometry(b/2,b/2,a,20).rotateZ(Math.PI/2);
  }
}

function finish(color:number,opacity=1):THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({color,metalness:.42,roughness:.40,transparent:opacity<1,opacity,depthWrite:opacity===1,side:THREE.DoubleSide});
}
function block(parent:THREE.Group,size:[number,number,number],pos:[number,number,number],color:number,opacity=1){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),finish(color,opacity));mesh.position.set(...pos);parent.add(mesh);return mesh;
}
function rod(parent:THREE.Group,radius:number,length:number,pos:[number,number,number],color:number,axis:'x'|'y'|'z'='x'){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,18),finish(color));
  if(axis==='x')mesh.rotation.z=Math.PI/2;if(axis==='z')mesh.rotation.x=Math.PI/2;
  mesh.position.set(...pos);parent.add(mesh);return mesh;
}
function ring(parent:THREE.Group,radius:number,tube:number,pos:[number,number,number],color:number,axis:'x'|'y'|'z'='x'){
  const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,6,24),finish(color));
  if(axis==='x')mesh.rotation.y=Math.PI/2;if(axis==='y')mesh.rotation.x=Math.PI/2;
  mesh.position.set(...pos);parent.add(mesh);return mesh;
}
function bolts(parent:THREE.Group,radius:number,at:number,axis:'x'|'z'='x'){
  for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(parent,.028,.055,axis==='x'?[at,Math.cos(a)*radius,Math.sin(a)*radius]:[Math.cos(a)*radius,Math.sin(a)*radius,at],steel,axis);}
}
function helix(parent:THREE.Group,radius:number,height:number,color:number){
  const points:THREE.Vector3[]=[];
  for(let i=0;i<=240;i++){const angle=i/240*Math.PI*20;points.push(new THREE.Vector3(Math.cos(angle)*radius,(i/240-.5)*height,Math.sin(angle)*radius));}
  parent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),200,.045,6,false),finish(color)));
}
function fan(parent:THREE.Group,radius:number,axis:'x'|'z'='x'){
  for(let i=0;i<5;i++){const pivot=new THREE.Group();const blade=block(pivot,[radius*.8,.11,.12],[radius*.48,0,0],steel);blade.rotation.z=.25;if(axis==='x'){pivot.rotation.y=Math.PI/2;pivot.rotation.x=i*Math.PI*2/5;}else pivot.rotation.z=i*Math.PI*2/5;parent.add(pivot);}
}

function buildPart(type:ModelType,spec:PartSpec):THREE.Group {
  const detailed=buildDetailedPart(type,spec);
  if(detailed){detailed.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.partId=spec.id;});return detailed;}
  const part=new THREE.Group();const id=spec.id;
  const enclosure=['tank','cabinet','enclosure','frame','tunnel'].includes(id);
  if(spec.shape==='coil'){
    rod(part,spec.size[0]*.28,spec.size[1],[0,0,0],pale,'y');helix(part,spec.size[0]*.42,spec.size[1],spec.color);
  }else if(type==='transformer'&&id==='core'){
    for(const y of [-.7,.7])block(part,[1.8,.25,.55],[0,y,0],steel);
    for(const x of [-.62,.62])block(part,[.28,1.2,.55],[x,0,0],steel);
    for(let y=-.78;y<.8;y+=.055)block(part,[1.79,.008,.56],[0,y,0],dark,.2);
  }else if(type==='breaker'&&['insulation','interrupter','fixed','moving'].includes(id)){
    for(const x of [-.78,0,.78]){
      const radius=id==='interrupter'?.21:id==='insulation'?.15:.065;
      const height=id==='interrupter'?.66:id==='insulation'?.65:id==='fixed'?.22:.34;
      rod(part,radius,height,[x,0,0],spec.color,'y');
      if(id==='insulation'||id==='interrupter')for(let y=-height*.43;y<height*.46;y+=.10)ring(part,radius+.025,.028,[x,y,0],id==='insulation'?pale:steel,'y');
      if(id==='interrupter'){rod(part,.235,.06,[x,-.35,0],copper,'y');rod(part,.235,.06,[x,.35,0],copper,'y');}
    }
  }else if(type==='thruster'&&id==='tunnel'){
    const tube=new THREE.CylinderGeometry(.86,.86,2.8,36,1,true);tube.rotateZ(Math.PI/2);
    part.add(new THREE.Mesh(tube,finish(navy,.24)));ring(part,.86,.075,[-1.4,0,0],steel);ring(part,.86,.075,[1.4,0,0],steel);
  }else if(type==='thruster'&&(id==='motor'||id==='gear')){
    const radius=id==='motor'?.35:.14, height=id==='motor'?.94:1.25;
    rod(part,radius,height,[0,0,0],spec.color,'y');
    if(id==='motor')for(let y=-.4;y<.45;y+=.1)ring(part,.365,.018,[0,y,0],steel,'y');
  }else if(spec.shape==='blade'){
    const shape=new THREE.Shape();shape.moveTo(0,.07);shape.bezierCurveTo(.2,.1,.37,.44,.19,.62);shape.bezierCurveTo(.02,.67,-.08,.28,0,.07);
    const blade=new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:true,bevelSize:.015,bevelThickness:.015,bevelSegments:1});
    if(type==='thruster')blade.rotateY(Math.PI/2);
    const scale=spec.size[0]/1.3;
    const rotor=new THREE.Group();
    if(type==='thruster')rotor.userData.spinImpeller=true;
    const bladeCount = type === 'propeller' ? 4 : 5;
    for(let i=0;i<bladeCount;i++){
      const mesh=new THREE.Mesh(blade,finish(spec.color));
      mesh.scale.setScalar(scale);
      if(type==='thruster') mesh.rotation.x=i*Math.PI*2/5;
      else mesh.rotation.z=i*Math.PI*2/bladeCount + (type==='propeller'?Math.PI/8:0);
      rotor.add(mesh);
    }
    part.add(rotor);
  }else if(type==='transformer'&&id==='terminals'){
    for(const x of [-.7,0,.7])for(const z of [-.35,.35]){
      rod(part,.075,.42,[x,0,z],pale,'y');for(let y=-.14;y<.15;y+=.07)ring(part,.10,.022,[x,y,z],pale,'y');rod(part,.035,.12,[x,.26,z],copper,'y');
    }
  }else if(type==='generator'&&id==='cylinders'){
    for(let i=0;i<6;i++){const x=(i-2.5)*.22;block(part,[.18,.24,.65],[x,0,0],navy);rod(part,.036,.025,[x,.14,0],steel,'y');}
  }else if(type==='drive'&&id==='dc'){
    for(const y of [-.42,.15,.55])for(const x of [-.15,.15]){rod(part,.115,.35,[x,y,0],steel,'z');rod(part,.033,.06,[x,y,.21],copper,'z');}
  }else if(type==='reefer'&&id==='sockets'){
    block(part,spec.size,[0,0,0],navy);
    for(const x of [-.7,-.23,.23,.7]){ring(part,.14,.028,[x,0,.16],amber,'z');rod(part,.10,.035,[x,0,.16],dark,'z');for(let i=0;i<3;i++)rod(part,.012,.025,[x+(i-1)*.042,0,.19],copper,'z');}
  }else if(type==='transformer'&&id==='radiator'){
    for(let z=-.52;z<.6;z+=.13)block(part,[.33,1.75,.055],[0,0,z],steel);
    for(const y of [-.72,.72])rod(part,.075,1.25,[0,y,0],steel,'z');
  }else{
    part.add(new THREE.Mesh(geometry(spec),finish(spec.color,enclosure?.25:1)));
  }

  // Detail is attached to its teaching part so it remains selectable when exploded.
  if(['cabinet','enclosure','tank'].includes(id)){
    const [w,h,d]=spec.size;
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,h,d)),new THREE.LineBasicMaterial({color:0x9ebdc9,transparent:true,opacity:.65}));part.add(edges);
    for(const x of [-w*.43,w*.43])for(const y of [-h*.43,h*.43])rod(part,.025,.03,[x,y,d*.5+.015],steel,'z');
    if(id!=='tank')for(let x=-w/2+.25;x<w/2;x+=.65){
      block(part,[.025,h*.83,.018],[x,0,d*.5+.015],steel,.55);
      block(part,[.035,.18,.065],[x+.15,-.02,d*.5+.04],pale);
      for(let y=-h*.4;y<-h*.24;y+=.07)block(part,[.3,.018,.015],[x+.27,y,d*.5+.024],dark);
    }
  }
  if(type==='generator'&&id==='engine'){
    for(let i=0;i<6;i++){const x=(i-2.5)*.21;block(part,[.14,.48,.04],[x,0,.63],navy);rod(part,.023,.035,[x,.29,.65],steel,'z');}
    for(const x of [-.55,.5])rod(part,.075,.32,[x,-.05,-.69],pale,'y');
    block(part,[1.65,.14,1.35],[0,-.48,0],navy);
  }
  if((type==='generator'&&id==='stator')||(type==='motor'&&id==='frame')||(type==='pump'&&id==='motor')){
    const length=spec.size[0],radius=spec.size[1]/2;
    for(let x=-length*.42;x<length*.45;x+=.13)ring(part,radius+.015,.018,[x,0,0],steel);
    ring(part,radius*.95,.045,[-length*.5,0,0],steel);ring(part,radius*.95,.045,[length*.5,0,0],steel);bolts(part,radius*.8,length*.5+.035);
    for(const x of [-length*.32,length*.32])for(const z of [-radius*.6,radius*.6])block(part,[.25,.18,.22],[x,-radius,z],navy);
  }
  if((type==='motor'&&id==='rotor')||(type==='generator'&&id==='rotor')){
    for(let i=0;i<12;i++){const angle=i*Math.PI/6;block(part,[spec.size[0]*.75,.025,.045],[0,Math.cos(angle)*spec.size[1]*.5,Math.sin(angle)*spec.size[1]*.5],amber);}
  }
  if(id==='terminal'){
    for(const x of [-.2,0,.2])rod(part,.05,.10,[x,-.22,.21],dark,'y');
    block(part,[.25,.09,.015],[0,.02,spec.size[2]*.5+.012],pale);
  }
  if(id==='base'||id==='truck'){
    for(const x of [-spec.size[0]*.42,spec.size[0]*.42])for(const z of [-spec.size[2]*.35,spec.size[2]*.35]){rod(part,.047,.035,[x,.13,z],steel,'y');if(id==='truck')rod(part,.10,.10,[x,-.17,z],dark,'z');}
  }
  if(id==='bus'||id==='busbars'){
    for(const y of [-.10,.10])block(part,[spec.size[0],.055,.09],[0,y,.23],copper);
    for(const x of [-.9,0,.9])block(part,[.10,.4,.16],[x,0,-.1],pale);
  }
  if(['compartment','tie','incomer','feeder','breakers','input','inverter'].includes(id)){
    const [w,h,d]=spec.size;
    const count=id==='feeder'||id==='breakers'?4:1;
    for(let i=0;i<count;i++){
      const x=count===1?0:(i-(count-1)/2)*w/count;
      block(part,[Math.min(.23,w/count*.75),.23,.05],[x,.06,d*.5+.035],dark);
      block(part,[.045,.10,.07],[x,.06,d*.5+.085],steel);
      rod(part,.023,.03,[x,.28,d*.5+.04],teal,'z');
    }
    if(type==='drive')for(let y=-h*.4;y<h*.41;y+=.12)block(part,[w*.7,.025,.09],[0,y,-d*.5-.06],steel);
  }
  if(id==='relay'||id==='controller'||id==='meter'){
    const w=spec.size[0],h=spec.size[1],z=spec.size[2]/2+.014;
    block(part,[w*.68,h*.59,.025],[0,h*.04,z],dark);block(part,[w*.49,h*.29,.012],[-w*.07,h*.08,z+.018],teal);
    for(let x=-w*.3;x<w*.35;x+=w*.18)rod(part,.018,.024,[x,-h*.30,z],amber,'z');
  }
  if(type==='motor'&&id==='fan'){
    for(let r=.16;r<.64;r+=.12)ring(part,r,.018,[-.16,0,0],steel);
    fan(part,.56);bolts(part,.56,-.17);
  }
  if(type==='pump'&&id==='casing'){
    ring(part,.44,.065,[0,0,.35],steel,'z');bolts(part,.4,.39,'z');
    rod(part,.14,.42,[0,.57,0],steel,'y');ring(part,.21,.055,[0,.8,0],steel,'y');
  }
  if(type==='pump'&&id==='ports'){ring(part,.24,.055,[.43,0,0],steel);bolts(part,.20,.46);}
  if(type==='breaker'&&id==='mechanism'){
    helix(part,.12,.46,steel);for(const x of [-.53,.53])rod(part,.085,.15,[x,0,.29],dark,'z');block(part,[.38,.11,.05],[0,.13,.29],teal);
  }
  part.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.partId=id;});
  return part;
}

export function createModel(type:ModelType):ModelInstance {
  const group=new THREE.Group();
  const parts=modelParts[type].map((spec,index)=>{
    const part=buildPart(type,spec);const base=new THREE.Vector3(...spec.pos);
    const angle=index*2.399;
    const offset=new THREE.Vector3(Math.cos(angle)*1.05,(index-2)*.31,Math.sin(angle)*.7+1.2);
    if(['tank','cabinet','enclosure','frame','tunnel'].includes(spec.id))offset.set(0,-.2,-1.15);
    if(['cylinders','terminals','terminal','relay','controller','meter'].includes(spec.id))offset.y+=.7;
    if(type==='motor'&&spec.id==='rotor')offset.set(1.8,0,.4);
    if(type==='motor'&&spec.id==='shaft')offset.set(2.8,0,.4);
    if(type==='generator'&&spec.id==='base')offset.set(0,-.8,0);
    const exploded=base.clone().add(spec.explode?new THREE.Vector3(...spec.explode):offset);
    part.position.copy(base);group.add(part);
    return {spec,group:part,base,exploded};
  });
  return {group,parts};
}

// ============================================================================
// PHASE 1: 3D MODEL PROTECTIVE RELAY SPECIFICATIONS (ANSI 32 / 40 / 51)
// ============================================================================
export interface ProtectionRelaySpec {
  ansiCode: '32' | '40' | '51' | '67N' | '25';
  name: string;
  pickupSetting: string;
  timeDelaySetting: string;
  tripAction: string;
}

export const PROTECTION_RELAY_CATALOG: Record<string, ProtectionRelaySpec[]> = {
  generator: [
    {
      ansiCode: '32',
      name: 'Reverse Power Protection',
      pickupSetting: 'P < -5.0% P_rated (-110 kW)',
      timeDelaySetting: '3.0 s definite time',
      tripAction: 'Instant VCB trip ("ANSI 32: Reverse Power Trip") to prevent diesel motoring'
    },
    {
      ansiCode: '40',
      name: 'Loss of Excitation / Field',
      pickupSetting: 'Q < -20% Q_rated (-330 kVAr) & V < 85% V_nom (5.61 kV)',
      timeDelaySetting: '1.5 s definite time',
      tripAction: 'Trip generator VCB ("ANSI 40: Loss of Field") before pole-slipping occurs'
    },
    {
      ansiCode: '51',
      name: 'IDMT Overcurrent Protection',
      pickupSetting: 'I_s = 105% I_rated (253 A @ 6.6 kV)',
      timeDelaySetting: 'IEC Standard Inverse: t = k / ((I / I_s)^0.02 - 1)',
      tripAction: 'Inverse-time thermal overload trip of generator VCB'
    }
  ],
  'hv-board': [
    {
      ansiCode: '51',
      name: 'Bus & Feeder IDMT Overcurrent',
      pickupSetting: 'I_s = 105% I_rated',
      timeDelaySetting: 't = 0.14 * TMS / ((I / I_s)^0.02 - 1)',
      tripAction: 'Selective inverse-time coordination between feeder and generator VCBs'
    },
    {
      ansiCode: '67N',
      name: 'Directional Earth Fault Relay',
      pickupSetting: 'I_ef = 10.0 A (381 Ω NER) · V_N = 3810 V',
      timeDelaySetting: 'Instantaneous alarm / selective feeder indication',
      tripAction: 'Pinpoints faulted 6.6 kV feeder in High-Resistance Earthed (HRE) mode'
    },
    {
      ansiCode: '25',
      name: 'Check Synchronizer Relay',
      pickupSetting: 'ΔV < 5%, Δf < 0.35 Hz, Δθ < ±18°',
      timeDelaySetting: 'Continuous phase/slip window supervision',
      tripAction: 'Blocks out-of-phase breaker closure across live 6.6 kV busbars'
    }
  ],
  breaker: [
    {
      ansiCode: '51',
      name: 'Feeder VCB IDMT Overcurrent',
      pickupSetting: 'I_s = 105% feeder rated current',
      timeDelaySetting: 'IEC Standard Inverse: t = k / ((I / I_s)^alpha - 1)',
      tripAction: 'Shunt-trip release unlatches VCB operating mechanism'
    }
  ]
};

// ============================================================================
// PHASE 4: INTERACTIVE LOTO & HIGH VOLTAGE PERMIT TO WORK (PTW) FLOW
// ============================================================================
export interface LotoStepSpec {
  stepNumber: 1 | 2 | 3 | 4 | 5;
  id: string;
  shortLabel: string;
  actionLabel: string;
  detail: string;
}

export const HV_LOTO_STEPS: LotoStepSpec[] = [
  {
    stepNumber: 1,
    id: 'step1_open_vcb',
    shortLabel: 'Step 1: Trip & Open Feeder VCB',
    actionLabel: 'Trip & Open Feeder VCB',
    detail: 'Interrupt 6.6 kV load current by tripping and opening the upstream Vacuum Circuit Breaker (VCB).'
  },
  {
    stepNumber: 2,
    id: 'step2_rack_out',
    shortLabel: "Step 2: Rack out VCB truck to 'Test/Isolated'",
    actionLabel: "Rack Out VCB Truck",
    detail: "Mechanically rack out the withdrawable VCB carriage to 'Test/Isolated' to establish physical air-gap separation."
  },
  {
    stepNumber: 3,
    id: 'step3_padlock_loto',
    shortLabel: 'Step 3: Apply Padlock & LOTO Tag',
    actionLabel: 'Apply Padlock & LOTO Tag',
    detail: 'Lock racking shutter with ETO personal safety padlock, trap Castell key, and attach HV Danger LOTO Tag.'
  },
  {
    stepNumber: 4,
    id: 'step4_prove_dead',
    shortLabel: 'Step 4: Prove Dead (6.6 kV Capacitive Detector Wand)',
    actionLabel: 'Prove Dead (6.6 kV Wand)',
    detail: 'Execute Test-Prove-Test protocol with calibrated 6.6 kV capacitive voltage detector wand across L1, L2, L3 (0.00 kV).'
  },
  {
    stepNumber: 5,
    id: 'step5_close_cme',
    shortLabel: 'Step 5: Close Circuit Main Earth (CME) Switch',
    actionLabel: 'Close CME Earth Switch',
    detail: 'Close integral Circuit Main Earth (CME) switch to ground all three phases solidly to the ship hull.'
  }
];

/**
 * Maps 6.6 kV equipment IDs (Transformers, Switchboards, Propulsion Motors/Drives, Thrusters, HV Breakers)
 * to the feeder/incomer VCBs that must be opened in Step 1 of the HV LOTO isolation sequence.
 */
export const HV_EQUIPMENT_VCB_MAP: Record<string, { label: string; vcbIds: string[] }> = {
  txA: { label: '6.6 kV / 440 V Main Transformer A', vcbIds: ['txAFeed'] },
  txB: { label: '6.6 kV / 440 V Main Transformer B', vcbIds: ['txBFeed'] },
  busA: { label: '6.6 kV Main Switchboard · Bus A', vcbIds: ['gb1', 'gb2', 'tie', 'shoreBreaker'] },
  busB: { label: '6.6 kV Main Switchboard · Bus B', vcbIds: ['gb3', 'gb4', 'tie'] },
  motor: { label: '6.6 kV Electric Propulsion Motor', vcbIds: ['propFeed'] },
  drive: { label: '6.6 kV Propulsion Frequency Converter', vcbIds: ['propFeed'] },
  bow: { label: '6.6 kV Bow Thruster Motor', vcbIds: ['bowFeed'] },
  dg1: { label: '6.6 kV Diesel-Generator 1 Alternator', vcbIds: ['gb1'] },
  dg2: { label: '6.6 kV Diesel-Generator 2 Alternator', vcbIds: ['gb2'] },
  dg3: { label: '6.6 kV Diesel-Generator 3 Alternator', vcbIds: ['gb3'] },
  dg4: { label: '6.6 kV Diesel-Generator 4 Alternator', vcbIds: ['gb4'] },
  propFeed: { label: '6.6 kV Propulsion Feeder VCB', vcbIds: ['propFeed'] },
  bowFeed: { label: '6.6 kV Bow-Thruster Feeder VCB', vcbIds: ['bowFeed'] },
  txAFeed: { label: '6.6 kV Transformer A Feeder VCB', vcbIds: ['txAFeed'] },
  txBFeed: { label: '6.6 kV Transformer B Feeder VCB', vcbIds: ['txBFeed'] },
  tie: { label: '6.6 kV Bus-Tie Vacuum Circuit Breaker', vcbIds: ['tie'] },
  gb1: { label: '6.6 kV DG 1 Generator VCB', vcbIds: ['gb1'] },
  gb2: { label: '6.6 kV DG 2 Generator VCB', vcbIds: ['gb2'] },
  gb3: { label: '6.6 kV DG 3 Generator VCB', vcbIds: ['gb3'] },
  gb4: { label: '6.6 kV DG 4 Generator VCB', vcbIds: ['gb4'] }
};

export interface EquipmentLotoRecord {
  equipmentId: string;
  ptwNumber: string;
  completedSteps: number; // 0..5
  arcFlashViolation: boolean;
  violationMessage: string | null;
}

export class HvLotoManager {
  private records: Record<string, EquipmentLotoRecord> = {};

  public requiresHvLoto(equipmentId: string): boolean {
    return Boolean(HV_EQUIPMENT_VCB_MAP[equipmentId]);
  }

  public getRecord(equipmentId: string): EquipmentLotoRecord {
    if (!this.records[equipmentId]) {
      const suffix = equipmentId.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.records[equipmentId] = {
        equipmentId,
        ptwNumber: `PTW-HV-6600-${suffix}`,
        completedSteps: 0,
        arcFlashViolation: false,
        violationMessage: null
      };
    }
    return this.records[equipmentId];
  }

  public isFullyIsolated(equipmentId: string, closedBreakers: Record<string, boolean>): boolean {
    if (!this.requiresHvLoto(equipmentId)) return true;
    const rec = this.getRecord(equipmentId);
    const map = HV_EQUIPMENT_VCB_MAP[equipmentId];
    const anyVcbClosed = map.vcbIds.some((id) => !!closedBreakers[id]);
    if (anyVcbClosed && rec.completedSteps > 0) {
      // If upstream VCB was re-closed externally, isolation is invalidated
      rec.completedSteps = 0;
    }
    return !anyVcbClosed && rec.completedSteps >= 5;
  }

  /**
   * Executes the next sequential step (1 -> 5) in the mandatory 5-step HV LOTO isolation flow.
   */
  public executeStep(
    equipmentId: string,
    targetStep: number,
    closedBreakers: Record<string, boolean>
  ): { success: boolean; message: string; stepCompleted: number } {
    const rec = this.getRecord(equipmentId);
    const map = HV_EQUIPMENT_VCB_MAP[equipmentId];
    if (!map) {
      return { success: true, message: 'Low-voltage equipment does not require 6.6 kV PTW.', stepCompleted: 5 };
    }

    if (targetStep !== rec.completedSteps + 1) {
      const expected = HV_LOTO_STEPS[rec.completedSteps];
      return {
        success: false,
        message: `LOTO SEQUENCE INTERLOCK: Must complete ${expected ? expected.shortLabel : 'previous step'} first!`,
        stepCompleted: rec.completedSteps
      };
    }

    if (targetStep === 1) {
      // Step 1: Trip & Open Feeder VCB(s)
      for (const vcbId of map.vcbIds) {
        closedBreakers[vcbId] = false;
      }
      rec.completedSteps = 1;
      rec.arcFlashViolation = false;
      rec.violationMessage = null;
      return {
        success: true,
        message: `[${rec.ptwNumber}] Step 1/5 Complete: Feeder VCB (${map.vcbIds.join(', ')}) tripped & opened.`,
        stepCompleted: 1
      };
    }

    // Ensure VCBs are still open for Steps 2..5
    if (map.vcbIds.some((id) => !!closedBreakers[id])) {
      rec.completedSteps = 0;
      return {
        success: false,
        message: `INTERLOCK BLOCKED: Feeder VCB is still CLOSED! Complete Step 1 (Trip & Open VCB) first.`,
        stepCompleted: 0
      };
    }

    const stepSpec = HV_LOTO_STEPS[targetStep - 1];
    rec.completedSteps = targetStep;
    rec.arcFlashViolation = false;
    rec.violationMessage = null;

    const suffix =
      targetStep === 5
        ? 'PERMIT TO WORK (PTW) AUTHORIZED: 3D HV Enclosure unlocked for safe inspection & exploded view.'
        : `Proceed to Step ${targetStep + 1}/5.`;
    return {
      success: true,
      message: `[${rec.ptwNumber}] ${stepSpec.shortLabel} verified. ${suffix}`,
      stepCompleted: targetStep
    };
  }

  /**
   * Validates whether a 6.6 kV 3D model can be exploded or opened for internal inspection.
   * Triggers an Arc-Flash Violation Warning if the 5-step LOTO sequence is incomplete.
   */
  public verify3dInspectAccess(
    equipmentId: string,
    closedBreakers: Record<string, boolean>
  ): { allowed: boolean; violationMessage?: string } {
    if (!this.requiresHvLoto(equipmentId)) {
      return { allowed: true };
    }
    if (this.isFullyIsolated(equipmentId, closedBreakers)) {
      const rec = this.getRecord(equipmentId);
      rec.arcFlashViolation = false;
      rec.violationMessage = null;
      return { allowed: true };
    }

    const rec = this.getRecord(equipmentId);
    const map = HV_EQUIPMENT_VCB_MAP[equipmentId];
    const nextStep = HV_LOTO_STEPS[rec.completedSteps];
    const msg = `ARC-FLASH VIOLATION WARNING: Attempted to open/explode live 6.6 kV ${map.label} without HV PTW isolation (Step ${rec.completedSteps}/5)! Next required: ${nextStep.shortLabel}.`;
    rec.arcFlashViolation = true;
    rec.violationMessage = msg;
    return { allowed: false, violationMessage: msg };
  }

  public resetEquipmentLoto(equipmentId: string): string {
    const rec = this.getRecord(equipmentId);
    rec.completedSteps = 0;
    rec.arcFlashViolation = false;
    rec.violationMessage = null;
    return `[${rec.ptwNumber}] CME Earth Switch opened, LOTO padlock removed, and VCB truck racked back into 'Service'.`;
  }

  public resetAll(): void {
    this.records = {};
  }
}

export const hvLotoManager = new HvLotoManager();


