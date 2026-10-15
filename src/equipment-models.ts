import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ModelType } from './network';
import type { PartSpec } from './models';

// Reference-inspired teaching assemblies. Dimensions are illustrative; each group
// has a deliberate disassembly direction and one shared selectable part identity.
type V = [number, number, number];
const green=0x527b69, lightGreen=0x86a494, iron=0x3e4c50, steel=0xb6c2c5,
  copper=0xc88743, gold=0xb49a56, white=0xe5e7df, black=0x243039,
  red=0xba443a, blue=0x417fad, yellow=0xe4bd54,
  terracotta=0xb54328, darkTerracotta=0x8b321c, bronze=0xd4a857,
  goldBronze=0xe0b869, darkBronze=0xc89d51, polishedSteel=0xdbe4ee,
  copperSeal=0xc26d38, motorGreen=0x3b5e4c, pebbleGrey=0xa5ad9e,
  darkPlinth=0x1e242c, cyanLcd=0x38bdf8, statusGreen=0x22c55e, statusRed=0xef4444;
const part=(id:string,name:string,description:string,pos:V,explode:V,color=green):PartSpec=>
  ({id,name,description,pos,explode,color,shape:'box',size:[1,1,1]});

const generator:PartSpec[]=[
  part('base','Common bedplate & resilient mounts','The steel bedplate supports both machines and maintains shaft alignment. Resilient mounts reduce vibration transmitted to the vessel.',[0,-1.05,0],[0,-1.35,0]),
  part('sump','Deep sump / oil pan','Collects lubricating oil returning from the bearings and cylinder walls. The oil is recirculated through pumps, filters and a cooler.',[-1,-.78,0],[0,-.75,0]),
  part('crankshaft','Crankshaft & main bearings','Offset crankpins receive force from the connecting rods and turn it into shaft torque. Main bearings support the crankshaft in the crankcase.',[-1,-.28,0],[0,-.2,.85],steel),
  part('engine','V-engine block / crankcase','The cast structure supports two cylinder banks and encloses the crankshaft. This generic four-stroke V12 layout illustrates a marine generating engine.',[-1,.12,0],[0,0,-2.4]),
  part('pistons','Pistons, rings & connecting rods','Combustion pressure acts on each piston crown. Piston rings seal the gas and control oil; the connecting rod transmits the force to a crankpin.',[-1,.15,0],[0,.8,1.15],steel),
  part('liners','Wet cylinder liners','Replaceable sleeves guide the pistons. Cooling water surrounds the outside of each liner to remove combustion heat.',[-1,.5,0],[0,1.75,.8],steel),
  part('heads','Cylinder heads','Close the cylinder tops and contain the combustion chambers, valve seats, and injector passages. Coolant passages remove heat from the heads.',[-1,.9,0],[0,2.35,.45]),
  part('valves','Fuel injectors & inlet / exhaust valves','The injector meters fuel into the combustion chamber. The inlet valves admit charge air and the exhaust valves release burned gas.',[-1,1.08,0],[0,2.95,.15],gold),
  part('rockers','Rocker covers & valve gear','Removable covers protect the lubricated rocker gear. Rockers transmit camshaft motion to open the valves in the required sequence.',[-1,1.22,0],[0,3.65,0]),
  part('exhaust','Exhaust manifolds','Collect hot gas from both cylinder banks and route it to the turbocharger turbine. The outer shields represent thermal insulation.',[-1,.92,-.82],[-.1,1.5,-1.6],iron),
  part('turbo','Turbocharger assembly','Exhaust gas drives the turbine wheel, which shares a shaft with the intake compressor. The compressor increases the density of air supplied to the engine.',[-2.35,1.35,-.2],[-1.5,2.3,-.7],steel),
  part('cooler','Charge-air cooler & intake manifold','Cools the compressed air leaving the turbocharger before it enters the cylinders. Cooling increases charge-air density.',[-.8,.82,.91],[0,1,2.1],steel),
  part('fuel','Fuel supply rail & injection pipes','Distributes fuel to the cylinder injection equipment. The illustrated pipe routing is representative; fuel systems differ between engine designs.',[-1,1.02,.63],[0,2.5,2.3],copper),
  part('lube','Lubricating-oil pump & filters','Circulates oil to loaded bearings and other moving surfaces. Filter elements remove particles before the oil returns to the engine galleries.',[-1.65,-.22,.9],[-.4,-.2,2],green),
  part('cooling','Jacket-water pump & heat exchanger','Circulates treated fresh water through the engine cooling passages. A heat exchanger transfers the rejected heat to a separate cooling circuit.',[-.25,-.14,.92],[.8,.15,2.5],green),
  part('flywheel','Flywheel & turning gear rim','Stores rotational energy to smooth the torque pulses between firing events. The toothed rim allows a turning device to rotate the stopped engine for inspection.',[.56,-.18,0],[.8,0,0],iron),
  part('coupling','Flexible shaft coupling','Transfers engine torque to the alternator and accommodates small alignment movements. A guard covers the coupling in service.',[.92,-.18,0],[1.3,0,0],black),
  part('stator','Alternator frame, stator & windings','The green frame supports a stationary laminated core and three-phase copper windings. The rotating magnetic field induces the electrical output in these windings.',[1.87,-.18,0],[2.3,.65,-.6],green),
  part('rotor','Alternator rotor & shaft','The engine turns this magnetic rotor inside the stator. Its field sweeps past the stationary windings to produce alternating voltage.',[1.87,-.18,0],[3.5,.1,.8],copper),
  part('exciter','Exciter & end bearing housing','The brushless exciter supplies the rotor field through rotating rectifiers. The end bearing supports the alternator shaft.',[2.67,-.18,0],[4.4,0,0],green),
  part('terminal','Output terminal box & AVR','Insulated terminals connect the three-phase output cables. The automatic voltage regulator adjusts excitation to regulate generator terminal voltage.',[1.82,.64,0],[2.4,1.6,0],green),
  part('control','Local engine control panel','Provides local start/stop commands and displays engine conditions such as oil pressure, cooling-water temperature and speed. Instruments here are illustrative.',[-2.35,.45,.85],[-2,.7,1.5],green)
];

const breaker:PartSpec[]=[
  part('truck','Withdrawable truck & racking screw','The wheeled carriage locates the breaker in its cubicle. The racking mechanism moves it between connected, test and disconnected positions.',[0,-1.02,0],[0,-1,0],gold),
  part('frame','Support frame & phase barriers','The grounded frame carries the mechanism. Insulating barriers help maintain separation between the three live poles.',[0,0,-.25],[0,0,-1.5],steel),
  part('insulation','Pole insulating supports','Insulating supports hold the primary conductors clear of the grounded frame and transmit mechanical loads without an electrical connection.',[0,-.35,-.15],[0,0,-.65],white),
  part('interrupter','Vacuum interrupter bottles','Each sealed ceramic bottle contains a pair of contacts. When they separate, the metal-vapour arc extinguishes at an AC current zero and the gap recovers its insulation.',[0,.47,-.15],[0,1.25,0],white),
  part('fixed','Fixed contacts & upper stems','Stationary contacts connect to the upper primary terminals. One fixed contact faces the moving contact inside each vacuum bottle.',[0,.67,-.15],[0,1.9,0],copper),
  part('moving','Moving contacts & metal bellows','Contact stems move axially to open or close each pole. Metal bellows allow this motion while maintaining the interrupter vacuum seal.',[0,.13,-.15],[0,.7,.8],copper),
  part('terminals','Upper & lower primary disconnects','Six contact clusters connect the three poles to the cubicle conductors when the truck is racked into service. They separate when the truck is withdrawn.',[0,.45,-.55],[0,.5,-1.7],copper),
  part('pushrods','Insulating pushrods & contact springs','Pushrods link the mechanism to the moving stems. Contact-pressure springs provide the force needed to keep closed contacts firmly seated.',[0,-.35,-.15],[0,-.05,.8],gold),
  part('linkage','Operating shaft & linkage','A common shaft and bell cranks transmit mechanism movement to all three poles so they operate together.',[0,-.55,.2],[0,-.35,1.3],iron),
  part('closing','Closing spring','Stores the mechanical energy used to close the breaker rapidly. The motor or manual charging input charges this spring.',[-.45,-.22,.48],[-1.05,.15,1.65],steel),
  part('tripping','Opening / tripping springs','Store energy during closing and drive the contacts open after the trip latch is released.',[.48,-.22,.48],[1.05,.15,1.65],steel),
  part('motor','Spring-charging motor & gear unit','A small motor and reduction gears recharge the closing spring. The manual charging socket provides an alternative mechanical input.',[-.55,-.7,.5],[-1.4,-.5,1],iron),
  part('releases','Closing coil & shunt-trip release','Electromagnetic releases unlatch the stored-energy mechanism in response to a close or trip command. They release springs rather than directly driving the main contacts.',[.45,-.66,.5],[1.4,-.5,1],copper),
  part('auxiliary','Auxiliary switch & secondary plug','Low-voltage contacts report the breaker state. The multipin plug connects the operating coils, motor and indication wiring to the cubicle.',[.95,-.12,.3],[1.75,.7,.7],black),
  part('cover','Front cover, pushbuttons & indicators','The front panel carries mechanical OPEN/CLOSE pushbuttons, contact-position and spring-charge indicators, an operation counter and the manual charging access.',[0,.05,.85],[-3.2,0,1.4],white)
];

const thruster:PartSpec[]=[
  part('tunnel','Thruster tunnel casing & flanges','Transverse cylindrical steel tunnel welded into the bow with external reinforcement ribs, upper mounting neck and flanged collars.',[0,0,0],[0,0,0],terracotta),
  part('bracket','Pedestal mounting bracket & casing','Heavy-duty cast pedestal housing with bolted base flange, triangular gusset plates, coupling window and top motor deck.',[-.25,1.0,0],[-.25,2.6,0],terracotta),
  part('motor','Vertical electric drive motor','High-output vertical marine squirrel-cage induction motor mounted atop the thruster pedestal with finned cooling stator frame.',[-.25,2.15,0],[-.25,5.2,0],motorGreen),
  part('coupling','Splined input shaft & claw coupling','Machined vertical input shaft and interlocking jaw claw coupling transmitting high torque from the motor to the transmission.',[-.25,1.15,0],[-.25,3.8,0],polishedSteel),
  part('vshaft','Vertical drive shaft, seals & bearings','Nickel-chrome alloy vertical drive shaft with double tapered roller bearings, bronze/copper lip seals and mounting flange.',[-.25,.35,0],[-.25,1.8,0],polishedSteel),
  part('pinion','Spiral bevel pinion gear','Driving spiral bevel pinion gear mounted on the bottom of the vertical shaft meshing at 90° with the propeller shaft bevel ring gear.',[-.25,-.25,0],[-.25,.9,0],iron),
  part('pod','Right-angle gear pod housing','Hydrodynamically streamlined torpedo-shaped bevel gearbox housing with rear tail cone and forward ribbed collar in an oil bath.',[0,-.45,0],[0,-.45,-2.2],terracotta),
  part('hshaft','Horizontal propeller shaft & ring gear','Alloy steel propeller drive shaft with longitudinal keyway, driven spiral bevel ring gear and rear thrust bearing.',[.15,-.45,0],[-.9,-.45,-3.4],polishedSteel),
  part('bearing','Propeller thrust bearing & seal','High-load marine thrust bearing and double-lip seal absorbing axial forward and reverse maneuvering thrust.',[.52,-.45,0],[.52,-.45,1.6],bronze),
  part('hub','Propeller boss / hub','Precision-machined Cu3 nickel-aluminum bronze central hub keyed to the horizontal shaft, transferring torque to the 4 blades.',[.82,-.45,0],[.82,-.45,2.7],darkBronze),
  part('blades','4-Blade skewed Kaplan propeller','Four high-skew Kaplan hydrofoil bronze blades engineered to deliver symmetrical bidirectional thrust with minimal cavitation.',[.82,-.45,0],[.82,-.45,2.7],goldBronze),
  part('cap','Fairing nose cone cap & fasteners','Hydrodynamic hub nose cone cap, slotted castle lock nut and corrosion-resistant cap fasteners securing the propeller assembly.',[1.18,-.45,0],[1.18,-.45,3.9],polishedSteel)
];

function boardParts(hv:boolean):PartSpec[]{
  if(hv){
    return [
      part('enclosure','RAL 7032 Switchboard cubicles & plinth','Three-cubicle bolted steel enclosure (Incomer A, Center Bus-Tie, Feeder/Incomer B) with base plinth and internal segregated partitions.',[0,0,0],[0,0,-1.8],pebbleGrey),
      part('canopy','IP22 Drip-proof canopy & top cable tray','Overhead sloped marine drip-proof canopy shield and perforated cable tray protecting against condensation or pipe leaks.',[0,1.42,0],[0,2.3,-.4],steel),
      part('doors','Compartment doors & mimic diagram','Front access doors with chrome handles. Cubicle 1 door is open at 115° showing internal arrangement, while Cubicle 3 door shows the mimic bus line.',[0,0,.72],[-3.6,0,1.4],lightGreen),
      part('meters','Analog meters & selector switches','Door-mounted 6.6 kV / 440 V analog voltmeters, ammeters, frequency meters and phase selector switches on front panels.',[0,.93,.81],[0,1.6,1.8],white),
      part('pms','PMS display & protection relays','Digital microprocessor PMS (Power Management System) screen with cyan LCD telemetry readout and multifunction generator protection relays.',[0,.53,.82],[0,.85,2.1],cyanLcd),
      part('bustie_switch','Bus-tie control switch & indicators','Center bus-tie rotary control switch (OPEN/CLOSE selector) with Red (TRIP/OPEN), Green (CLOSED), and Amber (SYNC) pilot lamps.',[0,-.15,.82],[0,-.3,2.2],statusGreen),
      part('busbars','Main 3-phase copper busbars (L1, L2, L3)','Heavy horizontal and vertical copper busbars with Red (L1), Yellow (L2), Blue (L3), and Black neutral phase insulation.',[0,.82,-.38],[0,1.75,-.75],copper),
      part('insulators','Busbar support insulators','Ribbed red DMC/epoxy compression-molded standoff insulators clamping busbars against short-circuit magnetic forces.',[0,.55,-.38],[0,.85,-1.3],red),
      part('incomer','Withdrawable incomer breaker (ACB/VCB)','Three-pole withdrawable circuit breaker on draw-out racking rails with top arc chutes, rear disconnect stabs and front control fascia.',[-1.12,-.35,.08],[-1.65,-.2,1.2],iron),
      part('bustie_breaker','Withdrawable bus-tie circuit breaker','Center cubicle withdrawable bus-tie breaker allowing parallel operation or split-bus segregation between Bus A and Bus B.',[0,-.35,.08],[0,-.2,1.4],iron),
      part('bustie_copper','Bus-tie copper bridge connections','Heavy copper tie bars and phase links bridging Left Busbar A and Right Busbar B through the center bus-tie breaker.',[0,.25,-.12],[0,.9,1.1],copper),
      part('feeder','Outgoing feeder circuit breakers','Bank of molded-case circuit breakers (MCCBs) with toggle handles switching and protecting outgoing auxiliary distribution circuits.',[1.12,-.35,.08],[1.65,-.2,1.2],iron),
      part('ct','Current & potential transformers (CT/VT)','Toroidal ring CTs around vertical phase risers and epoxy-cast voltage transformers on shelf for metering and synchronizing.',[-.65,-.65,-.25],[1.2,-.2,-1.1],gold),
      part('cable','Cable gland plate & armored feeders','Bottom steel gland plate with brass compression glands and heavy armored marine feeder cables exiting through base plinth.',[0,-1.05,-.18],[0,-1.35,.35],copper),
      part('earth','Protective earth bar (PE) & bonding','Bare copper protective earthing bar bonded to the ship hull with M12 terminal lugs and green/yellow grounding conductor.',[0,-1.25,.42],[0,-1.85,1.5],copper),
      part('wiring','Control wiring ducts & relays','Slotted grey PVC trunking, DIN-rail modular terminal blocks, plug-in auxiliary relays and surge protection devices (SPDs).',[0,.45,.22],[0,1.35,-.1],blue)
    ];
  }
  return [
    part('enclosure','Cubicle frame & segregated compartments','Bolted steel frames support the switchgear. Internal partitions separate busbars, switching equipment, cables and low-voltage control wiring.',[0,0,0],[0,0,-1.7]),
    part('doors','Front doors, handles & mimic diagram','Compartment doors provide access to the equipment. The black mimic lines show the simplified electrical path; handles and inspection windows are shown on the breaker doors.',[0,0,.72],[-3.6,0,1.2],lightGreen),
    part('meters','Analog meters & selector switches','Panel meters represent voltage, current and frequency indication. Selector switches choose the phase or measurement to display. The drawn needles are illustrative.',[0,.93,.81],[0,1.6,1.6],white),
    part('relay','Protection relays & monitoring displays','Protective relays evaluate measured electrical quantities and issue breaker trip commands for configured faults. Displays and settings are illustrative in this connectivity simulator.',[0,.53,.82],[0,.75,2],black),
    part('controls','Control switches & status lamps','Local controls issue open/close commands. Lamps represent running, available and trip indications; these model details are separate from the simulator switching controls.',[0,.14,.82],[0,-.15,2.2],green),
    part('busbars','Three-phase low-voltage busbars','Three separate copper bars carry the phase currents along the board. Insulated supports maintain spacing and support the bars mechanically.',[0,.82,-.42],[0,1.65,-.85],copper),
    part('insulators','Busbar support insulators','Support the live bars and maintain electrical separation from the grounded metal cubicle structure.',[0,.55,-.42],[0,.75,-1.4],white),
    part('incomer','Incoming air circuit breaker','The incoming ACB connects the source to the low-voltage bus. Its air arc chutes divide and cool the arc during interruption.',[-1.12,-.4,.05],[-1.65,-.2,1.1],iron),
    part('tie','Bus-section air circuit breaker','This representative cubicle can connect bus sections or serve a feeder. The simulator single-line diagram defines the actual connections and switching state.',[0,-.4,.05],[0,-.2,1.35],iron),
    part('feeder','Outgoing feeder circuit breakers','Individual moulded-case breakers switch and protect outgoing low-voltage circuits feeding auxiliary loads.',[1.12,-.4,.05],[1.65,-.2,1.1],iron),
    part('ct','Current transformers','Insulated toroidal transformers surround the phase conductors. They supply scaled current signals to meters and protection relays.',[0,-.65,-.32],[1.4,-.2,-1.2],gold),
    part('cable','Cable terminations & gland plate','Cable lugs connect each outgoing conductor to its terminal. Glands secure cables at the enclosure entry; high-voltage terminations also control electrical stress.',[0,-1.05,-.18],[0,-1.25,.3],copper),
    part('earth','Protective earth bar & bonding straps','A dedicated protective earth bar bonds the cubicle metalwork to the vessel earthing system and provides a fault-current return path.',[0,-1.25,.42],[0,-1.8,1.4],copper),
    part('wiring','Control wiring & terminal strips','Numbered terminal strips connect the meters, relays, auxiliary contacts and controls. Wiring ducts keep these low-voltage circuits organized.',[0,.5,.2],[0,1.3,-.1],blue)
  ];
}

export const detailedParts = {generator,breaker,'hv-board':boardParts(true),'lv-board':boardParts(false),thruster};

function material(color:number,opacity=1){return new THREE.MeshStandardMaterial({color,metalness:.45,roughness:.36,transparent:opacity<1,opacity,depthWrite:opacity===1,side:THREE.DoubleSide});}
function mesh(g:THREE.Group,geometry:THREE.BufferGeometry,pos:V,color:number,opacity=1){const m=new THREE.Mesh(geometry,material(color,opacity));m.position.set(...pos);g.add(m);return m;}
function box(g:THREE.Group,s:V,p:V,c=green,opacity=1){return mesh(g,new THREE.BoxGeometry(...s),p,c,opacity);}
function cyl(g:THREE.Group,r:number,l:number,p:V,c=steel,axis:'x'|'y'|'z'='x'){
  const geo=new THREE.CylinderGeometry(r,r,l,20);if(axis==='x')geo.rotateZ(Math.PI/2);if(axis==='z')geo.rotateX(Math.PI/2);return mesh(g,geo,p,c);
}
function ring(g:THREE.Group,r:number,t:number,p:V,c=steel,axis:'x'|'y'|'z'='x'){
  const geo=new THREE.TorusGeometry(r,t,8,32);if(axis==='x')geo.rotateY(Math.PI/2);if(axis==='y')geo.rotateX(Math.PI/2);return mesh(g,geo,p,c);
}
function pipe(g:THREE.Group,points:V[],r:number,c=steel){return mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(32,points.length*2),r,8,false),[0,0,0],c);}
function spring(g:THREE.Group,r:number,h:number,p:V,c=steel){const pts:V[]=[];for(let i=0;i<=120;i++){const a=i/120*Math.PI*18;pts.push([p[0]+Math.cos(a)*r,p[1]+(i/120-.5)*h,p[2]+Math.sin(a)*r]);}pipe(g,pts,.025,c);}
function bolts(g:THREE.Group,r:number,x:number){for(let i=0;i<10;i++){const a=i*Math.PI/5;cyl(g,.025,.045,[x,Math.sin(a)*r,Math.cos(a)*r],steel);}}
function hollow(g:THREE.Group,r:number,l:number,p:V,c=steel,axis:'x'|'y'='x'){
  const geo=new THREE.CylinderGeometry(r,r,l,32,1,true);if(axis==='x')geo.rotateZ(Math.PI/2);mesh(g,geo,p,c);
  for(const sign of [-1,1])ring(g,r,.028,axis==='x'?[p[0]+sign*l/2,p[1],p[2]]:[p[0],p[1]+sign*l/2,p[2]],c,axis);
}
function gauge(g:THREE.Group,x:number,y:number,z:number){
  box(g,[.22,.22,.045],[x,y,z],black);box(g,[.18,.18,.012],[x,y,z+.028],white);
  const needle=box(g,[.009,.09,.008],[x+.018,y+.013,z+.04],black);needle.rotation.z=-.55;
  for(let i=0;i<5;i++){const a=(i/4)*Math.PI;box(g,[.012,.018,.008],[x+Math.cos(a)*.067,y+Math.sin(a)*.067,z+.04],iron);}
}
function screen(g:THREE.Group,x:number,y:number,z:number){box(g,[.38,.24,.07],[x,y,z],black);box(g,[.27,.13,.008],[x-.025,y+.018,z+.04],0x91b9a4);for(let i=0;i<4;i++)box(g,[.025,.018,.01],[x-.11+i*.065,y-.082,z+.042],white);}
function bank(g:THREE.Group,callback:(b:THREE.Group)=>void){for(const side of [-1,1]){const b=new THREE.Group();b.position.z=side*.36;b.rotation.x=side*.4;callback(b);g.add(b);}}
const stations=[-1.12,-.67,-.22,.22,.67,1.12];
function generatorGeometry(id:string,g:THREE.Group){
  switch(id){
    case 'base':
      for(const z of [-.7,.7])box(g,[5.7,.2,.18],[0,0,z],iron);
      for(const x of [-2.45,-1.2,.4,1.65,2.5]){box(g,[.16,.18,1.6],[x,0,0],iron);for(const z of [-.67,.67]){cyl(g,.13,.13,[x,-.16,z],black,'y');cyl(g,.045,.06,[x,.13,z],steel,'y');}}break;
    case 'sump':
      box(g,[2.9,.1,1.05],[0,-.18,0],iron);for(const z of [-.52,.52])box(g,[2.9,.38,.065],[0,0,z],green);for(const x of [-1.42,1.42])box(g,[.065,.38,1.1],[x,0,0],green);
      for(const x of stations){box(g,[.07,.41,1.16],[x,0,0],iron);for(const z of [-.56,.56])cyl(g,.028,.045,[x,.23,z],steel,'y');}break;
    case 'engine':
      for(const z of [-.57,.57]){box(g,[2.95,.62,.09],[0,-.13,z],green);for(const x of stations){box(g,[.34,.36,.045],[x,-.14,z*1.09],lightGreen);for(const dx of [-.12,.12])cyl(g,.018,.04,[x+dx,-.14,z*1.14],steel,'z');}}
      for(const x of [-1.47,1.47])box(g,[.09,.8,1.15],[x,0,0],green);
      bank(g,b=>{for(const x of stations){hollow(b,.215,.42,[x,.32,0],green,'y');ring(b,.24,.025,[x,.55,0],steel,'y');}});break;
    case 'crankshaft':
      cyl(g,.1,3.18,[0,0,0],steel);for(let i=0;i<stations.length;i++){const x=stations[i],s=i%2?1:-1;for(const dx of [-.12,.12]){cyl(g,.21,.07,[x+dx,s*.07,0],iron);box(g,[.07,.32,.16],[x+dx,s*.13,0],steel);}cyl(g,.085,.23,[x,s*.25,0],steel);}for(const x of [-1.4,0,1.4])ring(g,.14,.065,[x,0,0],gold);break;
    case 'pistons':bank(g,b=>{for(const x of stations){cyl(b,.16,.24,[x,.26,0],steel,'y');for(const y of [.3,.35])ring(b,.162,.012,[x,y,0],iron,'y');box(b,[.065,.44,.07],[x,-.04,0],steel);ring(b,.085,.025,[x,-.28,0],steel);}});break;
    case 'liners':bank(g,b=>{for(const x of stations)hollow(b,.18,.43,[x,0,0],steel,'y');});break;
    case 'heads':bank(g,b=>{for(const x of stations){box(b,[.42,.18,.44],[x,0,0],green);for(const z of [-.17,.17])for(const dx of [-.15,.15])cyl(b,.018,.06,[x+dx,.12,z],steel,'y');}});break;
    case 'valves':bank(g,b=>{for(const x of stations){cyl(b,.035,.24,[x,.025,0],copper,'y');for(const z of [-.13,.13]){cyl(b,.015,.25,[x,-.04,z],steel,'y');cyl(b,.055,.025,[x,-.17,z],steel,'y');spring(b,.035,.11,[x,.025,z]);}}});break;
    case 'rockers':bank(g,b=>{for(const x of stations){box(b,[.38,.16,.43],[x,0,0],green);box(b,[.3,.025,.34],[x,.095,0],lightGreen);cyl(b,.027,.025,[x,.12,0],steel,'y');box(b,[.06,.06,.28],[x,-.12,0],steel);}});break;
    case 'exhaust':
      for(const z of [0,1.64]){cyl(g,.13,2.9,[0,0,z],steel);for(const x of stations){pipe(g,[[x,-.15,z*.85],[x,0,z],[x+.07,.03,z]],.065,iron);ring(g,.14,.018,[x,0,z],iron);}}break;
    case 'turbo':
      for(const x of [-.2,.2]){ring(g,.23,.12,[x,0,0],x<0?iron:steel);cyl(g,.13,.18,[x,0,0],steel);bolts(g,.23,x+.13);}cyl(g,.06,.7,[0,0,0],steel);
      pipe(g,[[-.2,.2,0],[-.2,.43,0],[-.2,.52,-.22]],.1,iron);pipe(g,[[.2,.2,0],[.3,.4,.15],[.55,.35,.4]],.12,steel);break;
    case 'cooler':
      box(g,[2.25,.42,.23],[0,0,0],green);for(let x=-1.05;x<1.1;x+=.07)box(g,[.025,.34,.05],[x,0,.15],steel);
      pipe(g,[[-1.2,.05,0],[-1.4,.15,0],[-1.5,.37,-.3]],.1,steel);cyl(g,.08,2.8,[0,-.28,-.16],green);break;
    case 'fuel':cyl(g,.035,2.9,[0,0,0],copper);for(const x of stations)pipe(g,[[x,0,0],[x,.19,-.1],[x,.24,-.3]],.016,copper);break;
    case 'lube':
      cyl(g,.18,.24,[-.38,0,0],green,'z');for(const x of [0,.25]){cyl(g,.09,.36,[x,.02,.05],white,'y');box(g,[.16,.05,.18],[x,.22,.05],iron);}pipe(g,[[-.4,0,0],[-.4,-.2,.1],[.3,-.2,.1]],.035,copper);break;
    case 'cooling':cyl(g,.18,.2,[-.25,0,0],green,'z');cyl(g,.14,.65,[.25,0,0],steel);for(const x of [-.1,.58])ring(g,.17,.025,[x,0,0],iron);pipe(g,[[-.25,.1,0],[-.25,.35,0],[.4,.35,0]],.045,blue);break;
    case 'flywheel':
      cyl(g,.49,.16,[0,0,0],iron);ring(g,.44,.04,[.1,0,0],steel);cyl(g,.16,.25,[0,0,0],steel);bolts(g,.3,.1);
      for(let i=0;i<48;i++){const a=i*Math.PI/24;const t=box(g,[.16,.055,.04],[0,Math.sin(a)*.5,Math.cos(a)*.5],steel);t.rotation.x=-a;}break;
    case 'coupling':cyl(g,.22,.4,[0,0,0],black);for(const x of [-.15,.15]){cyl(g,.26,.07,[x,0,0],steel);bolts(g,.2,x+.04);}break;
    case 'stator':
      hollow(g,.56,1.36,[0,0,0],green);hollow(g,.43,1.24,[0,0,0],iron);
      for(let i=0;i<24;i++){const a=i*Math.PI/12;box(g,[1.23,.04,.05],[0,Math.sin(a)*.4,Math.cos(a)*.4],copper);box(g,[1.22,.04,.04],[0,Math.sin(a)*.57,Math.cos(a)*.57],lightGreen);}
      for(const x of [-.58,.58]){ring(g,.42,.055,[x,0,0],copper);bolts(g,.5,x);for(const z of [-.4,.4])box(g,[.25,.23,.22],[x,-.53,z],green);}break;
    case 'rotor':cyl(g,.08,1.95,[0,0,0],steel);cyl(g,.27,1.04,[0,0,0],iron);for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,[.95,.11,.1],[0,Math.sin(a)*.26,Math.cos(a)*.26],copper);}break;
    case 'exciter':cyl(g,.43,.23,[0,0,0],green);ring(g,.19,.065,[.14,0,0],gold);cyl(g,.15,.17,[.21,0,0],iron);bolts(g,.34,.14);break;
    case 'terminal':box(g,[.75,.36,.55],[0,0,0],green);box(g,[.69,.035,.5],[0,.2,0],lightGreen);for(const x of [-.22,0,.22])cyl(g,.05,.12,[x,-.05,.32],black,'z');break;
    case 'control':box(g,[.42,.6,.17],[0,0,0],green);screen(g,0,.11,.11);for(const x of [-.1,.1])cyl(g,.035,.035,[x,-.18,.12],x<0?red:green,'z');break;
  }
}

function pole(g:THREE.Group,x:number,y=0,z=0){
  cyl(g,.135,.56,[x,y,z],white,'y');for(const dy of [-.3,.3])cyl(g,.15,.05,[x,y+dy,z],copper,'y');cyl(g,.045,.28,[x,y-.44,z],steel,'y');
}
function breakerGeometry(id:string,g:THREE.Group){
  const xs=[-.65,0,.65];
  switch(id){
    case 'truck':box(g,[2.3,.12,1.5],[0,0,0],gold);for(const x of [-1,1])for(const z of [-.55,.55]){cyl(g,.13,.12,[x,-.15,z],iron);ring(g,.09,.025,[x+.065,-.15,z],steel);}cyl(g,.04,1.35,[0,.13,0],steel,'z');for(let z=-.6;z<.7;z+=.055)ring(g,.045,.012,[0,.13,z],steel,'z');break;
    case 'frame':for(const x of [-1.03,1.03])box(g,[.07,1.85,.8],[x,0,0],steel);for(const y of [-.85,.85])box(g,[2.1,.08,.8],[0,y,0],steel);for(const x of [-.33,.33])box(g,[.025,1.4,.65],[x,.16,0],0x9c8164);break;
    case 'insulation':for(const x of xs){hollow(g,.11,.4,[x,0,0],0x987a61,'y');for(let y=-.17;y<.2;y+=.09)ring(g,.14,.025,[x,y,0],white,'y');}break;
    case 'interrupter':for(const x of xs){hollow(g,.16,.58,[x,0,0],white,'y');for(const y of [-.29,.29])ring(g,.16,.025,[x,y,0],copper,'y');}break;
    case 'fixed':for(const x of xs){cyl(g,.055,.25,[x,0,0],copper,'y');cyl(g,.115,.045,[x,-.14,0],steel,'y');}break;
    case 'moving':for(const x of xs){cyl(g,.045,.35,[x,0,0],copper,'y');cyl(g,.115,.045,[x,.19,0],steel,'y');for(let y=-.13;y<.07;y+=.035)ring(g,.065,.015,[x,y,0],steel,'y');}break;
    case 'terminals':for(const x of xs)for(const y of [-.5,.5]){cyl(g,.07,.5,[x,y,0],copper,'z');for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(g,.024,.2,[x+Math.cos(a)*.1,y+Math.sin(a)*.1,-.29],steel,'z');}ring(g,.12,.025,[x,y,-.3],copper,'z');}break;
    case 'pushrods':for(const x of xs){cyl(g,.055,.43,[x,0,0],0xc7b28a,'y');spring(g,.095,.27,[x,-.03,0]);}break;
    case 'linkage':cyl(g,.06,1.95,[0,0,0],steel);for(const x of xs){box(g,[.11,.32,.09],[x,.07,.05],gold);cyl(g,.04,.12,[x,.2,.05],steel);}break;
    case 'closing':case 'tripping':spring(g,id==='closing'?.14:.09,.66,[0,0,0]);for(const y of [-.36,.36])box(g,[.35,.065,.3],[0,y,0],gold);cyl(g,.03,.8,[0,0,0],iron,'y');break;
    case 'motor':cyl(g,.14,.36,[0,0,0],iron);for(const x of [-.14,.14])ring(g,.15,.025,[x,0,0],steel);cyl(g,.19,.08,[.25,.1,0],gold,'z');cyl(g,.07,.1,[.25,.1,.1],iron,'z');break;
    case 'releases':for(const x of [-.14,.14]){box(g,[.18,.23,.22],[x,0,0],copper);cyl(g,.035,.32,[x,.05,0],steel,'y');}break;
    case 'auxiliary':box(g,[.17,.48,.22],[0,0,0],black);for(let y=-.2;y<.24;y+=.07)box(g,[.2,.025,.03],[0,y,.13],gold);box(g,[.24,.17,.16],[0,.37,0],black);for(let i=0;i<6;i++)cyl(g,.01,.045,[-.08+(i%3)*.08,.33+Math.floor(i/3)*.08,.11],steel,'z');pipe(g,[[0,.28,0],[-.2,.3,0],[-.25,.05,0]],.025,blue);break;
    case 'cover':
      box(g,[2.12,1.78,.055],[0,0,0],white);
      for(const x of [-.88,.88]){box(g,[.055,.48,.12],[x,0,.1],black);for(const y of [-.77,.77])cyl(g,.025,.03,[x,y,.05],steel,'z');}
      box(g,[.82,.24,.015],[0,.47,.04],iron);box(g,[.54,.04,.01],[0,.49,.055],white);
      for(const x of [-.28,.28])cyl(g,.08,.065,[x,-.14,.07],x<0?red:green,'z');
      box(g,[.3,.12,.025],[-.3,.16,.05],black);box(g,[.3,.12,.025],[.3,.16,.05],yellow);
      cyl(g,.075,.05,[0,-.49,.06],black,'z');box(g,[.3,.09,.025],[.46,-.48,.05],black);break;
  }
}

function switchUnit(g:THREE.Group,hv:boolean,feeders=false){
  if(hv){box(g,[.82,.07,.8],[0,-.35,0],steel);for(const x of [-.25,0,.25]){pole(g,x,.05,-.12);cyl(g,.035,.26,[x,.32,-.28],copper,'z');}box(g,[.78,.5,.15],[0,-.12,.35],iron);for(const x of [-.2,.2])cyl(g,.035,.03,[x,-.1,.44],x<0?red:green,'z');}
  else if(feeders){for(const x of [-.24,0,.24])for(const y of [-.23,.23]){box(g,[.2,.36,.3],[x,y,.05],black);box(g,[.05,.1,.07],[x,y,.24],steel);for(const z of [-.12,.22])box(g,[.13,.025,.03],[x,y+.2,z],copper);}}
  else{box(g,[.78,.7,.68],[0,0,0],black);box(g,[.65,.56,.04],[0,0,.37],iron);screen(g,-.09,.11,.41);for(const x of [-.16,.16])cyl(g,.04,.04,[x,-.17,.41],x<0?red:green,'z');for(const x of [-.23,0,.23]){for(let z=-.25;z<.3;z+=.07)box(g,[.17,.025,.035],[x,.4,z],steel);cyl(g,.04,.2,[x,-.45,-.15],copper,'y');}}
}

function thrusterGeometry(id:string,g:THREE.Group){
  switch(id){
    case 'tunnel':
      cyl(g,.88,2.78,[0,0,0],terracotta,'x');
      cyl(g,.83,2.82,[0,0,0],iron,'x');
      for(const x of [-1.39,1.39]){
        ring(g,.88,.075,[x,0,0],terracotta,'x');
        ring(g,.88,.03,[x,0,0],polishedSteel,'x');
        for(let i=0;i<12;i++){
          const a=i*Math.PI/6;
          cyl(g,.02,.05,[x,Math.cos(a)*.95,Math.sin(a)*.95],steel,'x');
        }
      }
      for(const x of [-.75,0,.75])ring(g,.91,.04,[x,0,0],darkTerracotta,'x');
      cyl(g,.45,.28,[-.25,.86,0],terracotta,'y');
      ring(g,.48,.04,[-.25,.98,0],pebbleGrey,'y');
      break;
    case 'bracket':
      cyl(g,.5,.08,[0,-.02,0],terracotta,'y');
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        cyl(g,.022,.06,[Math.cos(a)*.44,-.02,Math.sin(a)*.44],steel,'y');
      }
      for(const z of [-.28,.28]){
        box(g,[.4,.65,.08],[0,.32,z],terracotta);
        box(g,[.12,.5,.2],[.18,.25,z*.8],pebbleGrey);
        box(g,[.12,.5,.2],[-.18,.25,z*.8],pebbleGrey);
      }
      box(g,[.08,.65,.5],[-.18,.32,0],terracotta);
      box(g,[.55,.08,.55],[0,.68,0],pebbleGrey);
      ring(g,.3,.03,[0,.68,0],steel,'y');
      break;
    case 'motor':
      cyl(g,.34,.9,[0,0,0],motorGreen,'y');
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        box(g,[.02,.82,.04],[Math.cos(a)*.35,0,Math.sin(a)*.35],darkTerracotta);
      }
      cyl(g,.36,.08,[0,-.44,0],steel,'y');
      cyl(g,.36,.08,[0,.44,0],steel,'y');
      cyl(g,.28,.14,[0,.54,0],iron,'y');
      ring(g,.12,.03,[0,.62,0],steel,'y');
      box(g,[.18,.24,.18],[.32,.12,0],motorGreen);
      box(g,[.03,.18,.12],[.42,.12,0],pebbleGrey);
      break;
    case 'coupling':
      cyl(g,.09,.42,[0,.12,0],polishedSteel,'y');
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        box(g,[.015,.28,.02],[Math.cos(a)*.095,.18,Math.sin(a)*.095],iron);
      }
      cyl(g,.18,.14,[0,-.08,0],polishedSteel,'y');
      cyl(g,.18,.14,[0,-.24,0],iron,'y');
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;
        box(g,[.05,.12,.05],[Math.cos(a)*.14,-.16,Math.sin(a)*.14],steel);
      }
      break;
    case 'vshaft':
      cyl(g,.08,.85,[0,0,0],polishedSteel,'y');
      for(const y of [-.22,.22]){
        cyl(g,.17,.12,[0,y,0],iron,'y');
        ring(g,.17,.02,[0,y,0],polishedSteel,'y');
        ring(g,.12,.015,[0,y,0],copperSeal,'y');
      }
      ring(g,.11,.02,[0,-.38,0],copperSeal,'y');
      break;
    case 'pinion':
      cyl(g,.14,.12,[0,.06,0],iron,'y');
      cyl(g,.18,.14,[0,-.04,0],gold,'y');
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        box(g,[.035,.12,.06],[Math.cos(a)*.14,-.04,Math.sin(a)*.14],steel);
      }
      break;
    case 'pod':
      cyl(g,.34,.88,[0,0,0],terracotta,'x');
      cyl(g,.24,.32,[-.52,0,0],terracotta,'x');
      ring(g,.24,.03,[-.64,0,0],darkTerracotta,'x');
      cyl(g,.36,.22,[.48,0,0],darkTerracotta,'x');
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        box(g,[.18,.04,.04],[.48,Math.cos(a)*.36,Math.sin(a)*.36],iron);
      }
      cyl(g,.26,.45,[-.25,.38,0],terracotta,'y');
      break;
    case 'hshaft':
      cyl(g,.09,1.12,[0,0,0],polishedSteel,'x');
      cyl(g,.26,.08,[-.4,0,0],gold,'x');
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6;
        box(g,[.07,.035,.06],[-.4,Math.cos(a)*.23,Math.sin(a)*.23],steel);
      }
      cyl(g,.15,.1,[-.22,0,0],iron,'x');
      box(g,[.35,.02,.02],[.3,.09,0],iron);
      break;
    case 'bearing':
      cyl(g,.22,.14,[0,0,0],bronze,'x');
      ring(g,.22,.025,[0,0,0],gold,'x');
      ring(g,.15,.02,[.06,0,0],copperSeal,'x');
      ring(g,.15,.02,[-.06,0,0],copperSeal,'x');
      break;
    case 'hub':
      cyl(g,.22,.32,[0,0,0],darkBronze,'x');
      ring(g,.22,.03,[.12,0,0],bronze,'x');
      ring(g,.22,.03,[-.12,0,0],bronze,'x');
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;
        cyl(g,.08,.04,[0,Math.cos(a)*.2,Math.sin(a)*.2],bronze,'x');
        for(let b=0;b<4;b++){
          const ba=b*Math.PI/2;
          cyl(g,.012,.03,[.04,Math.cos(a)*.2+Math.cos(ba)*.05,Math.sin(a)*.2+Math.sin(ba)*.05],polishedSteel,'x');
        }
      }
      break;
    case 'blades':
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;
        const bGroup=new THREE.Group();
        bGroup.rotation.x=a;
        const shape=new THREE.Shape();
        shape.moveTo(-.08,.22);
        shape.bezierCurveTo(-.24,.38,-.28,.64,-.14,.79);
        shape.bezierCurveTo(-.03,.85,.18,.82,.26,.68);
        shape.bezierCurveTo(.28,.5,.18,.34,.08,.22);
        shape.closePath();
        const bladeGeo=new THREE.ExtrudeGeometry(shape,{depth:.03,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2});
        bladeGeo.center();
        const posAttr=bladeGeo.attributes.position;
        for(let k=0;k<posAttr.count;k++){
          const bx=posAttr.getX(k),by=posAttr.getY(k),bz=posAttr.getZ(k);
          const t=(by+.3)/.6;
          const twist=0.48-t*.26;
          const rx=bx*Math.cos(twist)-bz*Math.sin(twist);
          const rz=bx*Math.sin(twist)+bz*Math.cos(twist);
          posAttr.setXYZ(k,rx,by+.48,rz);
        }
        bladeGeo.computeVertexNormals();
        const bladeMesh=new THREE.Mesh(bladeGeo,material(goldBronze));
        bGroup.add(bladeMesh);
        cyl(bGroup,.065,.05,[0,.22,0],bronze,'y');
        g.add(bGroup);
      }
      break;
    case 'cap':
      cyl(g,.18,.22,[0,0,0],darkBronze,'x');
      const coneGeo=new THREE.ConeGeometry(.18,.25,24);
      coneGeo.rotateZ(-Math.PI/2);
      mesh(g,coneGeo,[.2,0,0],darkBronze);
      cyl(g,.09,.06,[-.08,0,0],polishedSteel,'x');
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        box(g,[.03,.02,.02],[-.08,Math.cos(a)*.09,Math.sin(a)*.09],iron);
      }
      break;
  }
}

function boardGeometry(id:string,g:THREE.Group,hv:boolean){
  const bays=[-1.12,0,1.12];
  switch(id){
    case 'canopy':
      box(g,[3.56,.06,1.48],[0,0,0],steel);
      for(const z of [-.75,.75])box(g,[3.58,.16,.08],[0,-.06,z],pebbleGrey);
      box(g,[3.4,.04,.45],[0,.12,-.2],steel);
      for(let x=-1.5;x<1.6;x+=.2)box(g,[.03,.02,.42],[x,.14,-.2],iron);
      break;
    case 'enclosure':
      box(g,[3.5,.18,1.42],[0,-1.32,0],darkPlinth);
      box(g,[3.5,.1,1.42],[0,1.32,0],pebbleGrey);
      for(const x of [-1.72,-.56,.56,1.72]){
        box(g,[.055,2.55,1.4],[x,-.04,0],pebbleGrey);
        box(g,[.11,2.58,.07],[x,-.04,.68],steel);
      }
      box(g,[3.46,2.55,.055],[0,-.04,-.68],pebbleGrey);
      for(const y of [-.9,.32])box(g,[3.4,.04,1.34],[0,y,0],steel);
      break;
    case 'doors':
      if(hv){
        // Cubicle 1 open 115°
        const d1=new THREE.Group();
        d1.position.set(-1.68,0,.72);
        d1.rotation.y=-2.0;
        box(d1,[1.07,1.15,.045],[.54,.7,0],pebbleGrey);
        box(d1,[1.07,1.25,.045],[.54,-.58,0],pebbleGrey);
        box(d1,[.045,.28,.1],[1.0,.45,.055],polishedSteel);
        box(d1,[.045,.28,.1],[1.0,-.65,.055],polishedSteel);
        g.add(d1);
        for(const x of [0,1.12]){
          box(g,[1.07,1.15,.045],[x,.7,0],pebbleGrey);
          box(g,[1.07,1.25,.045],[x,-.58,0],pebbleGrey);
          box(g,[.54,.48,.035],[x,-.38,.045],black);
          box(g,[.44,.38,.012],[x,-.38,.07],steel,.25);
          for(const y of [-.65,.45])box(g,[.045,.28,.1],[x+.45,y,.055],polishedSteel);
          for(let y=-1.15;y<-.88;y+=.055)box(g,[.7,.018,.01],[x,y,.03],iron);
          box(g,[.64,.09,.015],[x,1.18,.035],iron);
          box(g,[.02,.38,.012],[x,-.08,.035],black);
          box(g,[.8,.02,.012],[x,.06,.035],black);
          for(const dx of [-.48,.48])for(const y of [-1.15,1.18])cyl(g,.016,.02,[x+dx,y,.035],steel,'z');
        }
      }else{
        for(const x of bays){
          box(g,[1.07,1.15,.045],[x,.7,0],pebbleGrey);
          box(g,[1.07,1.31,.045],[x,-.6,0],pebbleGrey);
          box(g,[.54,.5,.035],[x,-.39,.045],black);
          box(g,[.44,.4,.012],[x,-.39,.07],steel,.2);
          for(const y of [-.65,.45])box(g,[.045,.28,.1],[x+.43,y,.055],black);
          for(let y=-1.18;y<-.9;y+=.055)box(g,[.7,.018,.01],[x,y,.03],iron);
          box(g,[.64,.09,.015],[x,1.18,.035],iron);
          box(g,[.016,.38,.012],[x,-.08,.034],black);
          box(g,[.8,.016,.012],[x,.06,.034],black);
          for(const dx of [-.45,.45])for(const y of [-1.22,1.23])cyl(g,.015,.018,[x+dx,y,.035],steel,'z');
        }
      }
      break;
    case 'meters':
      for(const x of bays){
        for(const dx of [-.28,0,.28])gauge(g,x+dx,0,0);
        for(const dx of [-.2,.2])cyl(g,.045,.045,[x+dx,-.21,0],black,'z');
      }
      break;
    case 'pms': case 'relay':
      for(const x of bays){
        box(g,[.44,.28,.07],[x,0,0],black);
        box(g,[.34,.16,.008],[x,0,.04],cyanLcd);
        for(let i=0;i<4;i++)box(g,[.05,.015,.01],[x-.1+i*.07,.04,.045],white);
        for(let i=0;i<5;i++)cyl(g,.015,.015,[x-.12+i*.06,-.06,.045],white,'z');
      }
      break;
    case 'bustie_switch': case 'controls':
      for(const x of bays){
        cyl(g,.035,.04,[x-.2,.04,0],statusRed,'z');
        cyl(g,.035,.04,[x,.04,0],statusGreen,'z');
        cyl(g,.035,.04,[x+.2,.04,0],yellow,'z');
        cyl(g,.05,.055,[x,-.16,0],black,'z');
        box(g,[.025,.08,.025],[x,-.16,.035],steel);
      }
      break;
    case 'busbars':
      const phaseColors=[statusRed,yellow,blue];
      const zs=[-.22,0,.22];
      for(let i=0;i<3;i++){
        const z=zs[i];
        box(g,[3.3,.08,.095],[0,0,z],copper);
        for(const x of bays){
          box(g,[.1,.085,.1],[x,0,z],phaseColors[i]);
          box(g,[.08,.48,.095],[x,-.24,z],copper);
          cyl(g,.027,.035,[x,.06,z],polishedSteel,'y');
        }
      }
      break;
    case 'insulators':
      for(const x of bays)for(const z of [-.22,0,.22]){
        cyl(g,.065,.32,[x,0,z],red,'y');
        for(const y of [-.1,0,.1])ring(g,.08,.018,[x,y,z],darkTerracotta,'y');
      }
      break;
    case 'incomer':
      switchUnit(g,hv,false);
      break;
    case 'bustie_breaker': case 'tie':
      switchUnit(g,hv,false);
      break;
    case 'bustie_copper':
      for(const z of [-.18,0,.18]){
        box(g,[1.45,.07,.08],[0,0,z],copper);
        for(const x of [-.5,0,.5]){
          box(g,[.07,.35,.08],[x,-.15,z],copper);
          cyl(g,.025,.03,[x,.05,z],polishedSteel,'y');
        }
      }
      break;
    case 'feeder':
      switchUnit(g,hv,true);
      break;
    case 'ct':
      for(const x of bays)for(const dx of [-.24,0,.24]){
        ring(g,.095,.048,[x+dx,0,0],gold,'y');
        cyl(g,.026,.34,[x+dx,0,0],copper,'y');
        box(g,[.12,.15,.12],[x+dx,-.16,-.12],darkTerracotta);
      }
      break;
    case 'cable':
      box(g,[3.3,.06,.72],[0,-.16,0],steel);
      for(const x of bays)for(const dx of [-.24,0,.24]){
        cyl(g,.042,.52,[x+dx,0,0],black,'y');
        cyl(g,.05,.14,[x+dx,.28,0],copper,'y');
        ring(g,.065,.022,[x+dx,-.12,0],gold,'y');
      }
      break;
    case 'earth':
      box(g,[3.3,.07,.07],[0,0,0],copper);
      for(const x of bays){
        cyl(g,.028,.045,[x,.05,0],polishedSteel,'y');
        pipe(g,[[x,0,0],[x,-.08,.15],[x+.2,-.08,.23]],.018,0x779a40);
      }
      break;
    case 'wiring':
      for(const x of bays){
        box(g,[.78,.055,.16],[x,0,0],pebbleGrey);
        for(let i=0;i<10;i++){
          box(g,[.055,.12,.12],[x-.32+i*.07,.05,0],white);
          pipe(g,[[x-.32+i*.07,.1,0],[x-.32+i*.07,.2,-.02],[x+.4,.3,-.06]],.006,blue);
        }
      }
      break;
  }
}

export function buildDetailedPart(type:ModelType,spec:PartSpec):THREE.Group|undefined{
  if(!(type in detailedParts))return;
  const g=new THREE.Group();
  if(type==='generator')generatorGeometry(spec.id,g);
  else if(type==='breaker')breakerGeometry(spec.id,g);
  else if(type==='thruster')thrusterGeometry(spec.id,g);
  else boardGeometry(spec.id,g,type==='hv-board');
  g.updateMatrixWorld(true);
  const batches=new Map<string,{material:THREE.MeshStandardMaterial;geometries:THREE.BufferGeometry[]}>();
  g.traverse(o=>{if(o instanceof THREE.Mesh){
    const m=o.material as THREE.MeshStandardMaterial,key=`${m.color.getHex()}/${m.opacity}`;
    let batch=batches.get(key);
    if(!batch){batch={material:m,geometries:[]};batches.set(key,batch);}else m.dispose();
    batch.geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));o.geometry.dispose();
  }});
  g.clear();
  for(const batch of batches.values()){
    const geometry=mergeGeometries(batch.geometries);
    if(geometry)g.add(new THREE.Mesh(geometry,batch.material));
    batch.geometries.forEach(geometry=>geometry.dispose());
  }
  if(spec.id==='blades')g.userData.spinImpeller=true;
  return g;
}
