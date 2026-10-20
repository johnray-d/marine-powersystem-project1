import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARGO, vesselLayout } from './vessel-layout';
import { createModel } from './models';
import type { Equipment } from './network';
import { propellerAssembly } from './propeller-assembly';
import { transformerAssembly } from './transformer-assembly';
import { driveAssembly } from './drive-assembly';
import { motorAssembly } from './motor-assembly';
import { steeringAssembly } from './steering-assembly';
import { reeferAssembly } from './reefer-assembly';
import { pumpAssembly } from './pump-assembly';
import {
  esbCubicleAssembly,
  batterySystemAssembly,
  airCompressorAssembly,
  ventFanAssembly,
  ballastOwsAssembly,
  galleyBoardAssembly,
  shorePowerAssembly,
  bridgeNavComAssembly
} from './consumer-assemblies';
import { resolvePublicAsset } from './assets';
export { propellerAssembly } from './propeller-assembly';
export { transformerAssembly } from './transformer-assembly';
export { driveAssembly } from './drive-assembly';
export { motorAssembly } from './motor-assembly';
export { steeringAssembly } from './steering-assembly';
export { reeferAssembly } from './reefer-assembly';
export { pumpAssembly } from './pump-assembly';
export {
  esbCubicleAssembly,
  batterySystemAssembly,
  airCompressorAssembly,
  ventFanAssembly,
  ballastOwsAssembly,
  galleyBoardAssembly,
  shorePowerAssembly,
  bridgeNavComAssembly
} from './consumer-assemblies';

const steel = 0x83a7b7;
// Light theme: the translucent shell and wireframe lines were authored as pale glows for a dark scene, so deepen them to stay visible.
function deepen(color: number, k = .42) { return new THREE.Color(color).multiplyScalar(k); }
function material(color: number, opacity = 1) {
  const ghost = opacity < .5;
  return new THREE.MeshStandardMaterial({ color: ghost ? deepen(color) : color, metalness: 0.32, roughness: 0.55,
    transparent: opacity < 1, opacity: ghost ? Math.min(1, opacity * 1.8) : opacity, depthWrite: opacity === 1, side: THREE.DoubleSide });
}
function box(parent: THREE.Group, size: [number, number, number], at: [number, number, number], color: number, opacity = 1) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, opacity));
  mesh.position.set(...at); parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Group, radius: number, length: number, at: [number, number, number], color: number, axis: 'x' | 'y' | 'z' = 'y') {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), material(color));
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(...at); parent.add(mesh); return mesh;
}
function outlineBox(parent: THREE.Group, size: [number, number, number], at: [number, number, number], color = steel, opacity = 0.4) {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), new THREE.LineBasicMaterial({ color: deepen(color), transparent: true, opacity: Math.min(1, opacity * 1.5) }));
  edges.position.set(...at); parent.add(edges);
}
function strut(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number) {
  const d = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(.001, d.length()), 8), material(color));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(mesh); return mesh;
}

function cargo(parent: THREE.Group) {
  // Forty-foot containers use one shared geometry and instancing, including door/rib outlines.
  const bays = CARGO.bays;
  const instances: {x:number; y:number; z:number; color:number}[] = [];
  const colors = [0x397982, 0x53748d, 0x8c745b, 0x66897b];
  for (let b = 0; b < bays.length; b++) {
    box(parent, [3.14, 0.09, 5.45], [bays[b], 0.955, 0], 0x7b99a8, 0.2);
    outlineBox(parent, [3.14, 0.09, 5.45], [bays[b], 0.955, 0], 0x70a8b1, 0.35);
    for (let row = 0; row < CARGO.rows; row++) for (let tier = 0; tier < (b === 3 ? 2 : 3); tier++) {
      // Dedicated slots for Port (reeferUnitA, row 0) and Starboard (reeferUnitB, row 7) reefer containers
      if (b === 3 && (row === 0 || row === 7) && tier === 0) continue;
      instances.push({ x: bays[b], y: 1.35 + tier * 0.68, z: (row - (CARGO.rows-1)/2) * CARGO.rowPitch, color: colors[(b + row + tier) % colors.length] });
    }
  }
  const containerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .1, roughness: .7, transparent: true, opacity: .12, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CARGO.length, CARGO.height, CARGO.width), containerMaterial, instances.length);
  const matrix = new THREE.Matrix4(); const edges: number[] = [];
  for (let i = 0; i < instances.length; i++) {
    const item = instances[i]; matrix.makeTranslation(item.x, item.y, item.z); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, new THREE.Color(item.color));
    const corners = [[-1.52,-.325,-.305],[1.52,-.325,-.305],[1.52,.325,-.305],[-1.52,.325,-.305],[-1.52,-.325,.305],[1.52,-.325,.305],[1.52,.325,.305],[-1.52,.325,.305]];
    for (const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]) {
      for (const j of [a,b]) edges.push(item.x + corners[j][0], item.y + corners[j][1], item.z + corners[j][2]);
    }
    // Corrugation and door split on the outermost rows, where those details can be seen.
    if (Math.abs(item.z) > 2.25) for (let rib = -1.38; rib < 1.4; rib += 0.17) {
      const z = item.z + Math.sign(item.z) * 0.31;
      edges.push(item.x + rib,item.y - .28,z,item.x + rib,item.y + .28,z);
    }
  }
  parent.add(mesh);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(edges,3));
  parent.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x3d6978,transparent:true,opacity:0.3})));
}

export function createVessel(): THREE.Group {
  const ship = new THREE.Group();

  // Container stacks on weather deck
  cargo(ship);

  // Load the upgraded Blender 3D ship hull model
  const loader = new GLTFLoader();
  const modelUrl = resolvePublicAsset('blender-hull-V7.glb');

  loader.load(
    modelUrl,
    (gltf) => {
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            // Disable transmission if present so standard alpha blending works reliably
            if ('transmission' in mat) {
              (mat as THREE.MeshPhysicalMaterial).transmission = 0;
            }

            const matName = mat.name || '';
            const meshName = child.name || '';

            // 1. Translucent hull plating (underwater red oxide, navy cyan topsides, rudder blade, bossings)
            if (
              matName.includes('Hull_Under') ||
              matName.includes('Hull_Topsides') ||
              matName.includes('Topsides') ||
              (meshName === 'ShipHull' && (matName.includes('RedOxide') || matName.includes('NavyCyan'))) ||
              meshName.includes('Bossing') ||
              meshName.includes('Boss_Fairing') ||
              meshName === 'SemiBalanced_Rudder'
            ) {
              mat.transparent = true;
              mat.opacity = 0.12;
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
            }
            // 2. Waterline stripe (crisp boot-topping band)
            else if (matName.includes('Waterline')) {
              mat.transparent = true;
              mat.opacity = 0.20;
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
            }
            // 3. Superstructure & accommodation house (translucent so interior switchboards/generators are visible)
            else if (matName.includes('Superstructure') || meshName.includes('Accommodation')) {
              mat.transparent = true;
              mat.opacity = 0.12;
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
            }
            // 4. Equipment foundation pads (solid & clearly legible under machinery)
            else if (matName.includes('Equipment_Foundation_Pad') || meshName.startsWith('Pad_')) {
              mat.transparent = false;
              mat.opacity = 1.0;
              mat.depthWrite = true;
            }
            // 5. Decks and cargo bay pads (clearly legible)
            else if (
              matName.includes('Deck_Marine_Slate') ||
              meshName.includes('CargoBay_Pad') ||
              meshName.includes('House_Deck')
            ) {
              mat.transparent = true;
              mat.opacity = 0.20;
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
            }
            // 6. Internal deck flats and watertight bulkheads (machinery platforms)
            else if (
              matName.includes('Internal_Deck_Bulkhead') ||
              meshName.includes('TankTop') ||
              meshName.includes('Mezzanine') ||
              meshName.includes('Bulkhead')
            ) {
              mat.transparent = true;
              mat.opacity = 0.15;
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
            }
            // 7. Navigation bridge windows
            else if (matName.includes('Window') || meshName.includes('Window')) {
              mat.transparent = true;
              mat.opacity = 0.15;
              mat.depthWrite = false;
            }
            // 8. Funnel casing & accents
            else if (matName.includes('Funnel') || meshName.includes('Funnel')) {
              mat.transparent = true;
              mat.opacity = 0.20;
              mat.depthWrite = false;
              mat.side = THREE.DoubleSide;
            }
            // 9. Deck hardware, winches, bollards, rails & thruster grates
            else {
              mat.transparent = true;
              mat.opacity = matName.includes('Rail') ? 0.25 : 0.35;
              mat.depthWrite = false;
            }
          });
        }
      });
      ship.add(gltf.scene);
    },
    undefined,
    (error) => {
      console.error('Failed to load 3D ship hull model (/blender-hull-V7.glb):', error);
    }
  );

  // 3D SOLAS Compartments, Fire Bulkheads, and Arc Relief Duct (Phase 5)
  addCompartmentEnclosures(ship);

  return ship;
}

function addCompartmentEnclosures(parent: THREE.Group) {
  // 1. [A-60 FIRE BULKHEAD] Engine Control Room & Main Switchboard Boundary
  const a60Group = new THREE.Group();
  outlineBox(a60Group, [5.8, 1.85, 3.6], [-7.5, -0.15, 0], 0xf59e0b, 0.45);
  box(a60Group, [5.8, 1.85, 3.6], [-7.5, -0.15, 0], 0xd97706, 0.08);
  parent.add(a60Group);

  // 2. [ARC PRESSURE RELIEF DUCT] → OPEN AIR
  const arcDuct = new THREE.Group();
  // Vertical duct rising from 6.6 kV switchgear (y = 0.4) to above weather deck (y = 2.45)
  box(arcDuct, [0.65, 2.05, 0.65], [-7.75, 1.42, 0], 0x334155, 0.85);
  outlineBox(arcDuct, [0.65, 2.05, 0.65], [-7.75, 1.42, 0], 0x94a3b8, 0.75);
  // Exhaust hood / louvers on weather deck
  box(arcDuct, [0.85, 0.28, 0.85], [-7.75, 2.52, 0], 0x1e293b, 0.95);
  // Arc warning plaque (yellow/black band)
  box(arcDuct, [0.67, 0.15, 0.67], [-7.75, 2.25, 0], 0xfacc15, 0.95);
  parent.add(arcDuct);

  // 3. [WATERTIGHT BULKHEAD] Bow Thruster Collision Bulkhead (Trimmed & Resized for V7 Hull)
  const wtBulkhead = new THREE.Group();
  // Lower tank-top bulkhead plate fitting neatly between keel and lower machinery flat
  box(wtBulkhead, [0.06, 1.15, 3.0], [18.6, -2.05, 0], 0x334155, 0.35);
  outlineBox(wtBulkhead, [0.06, 1.15, 3.0], [18.6, -2.05, 0], 0x38bdf8, 0.55);
  // Horizontal stiffener channels
  box(wtBulkhead, [0.09, 0.04, 2.9], [18.6, -2.35, 0], 0x1e293b, 0.65);
  box(wtBulkhead, [0.09, 0.04, 2.9], [18.6, -1.75, 0], 0x1e293b, 0.65);
  // Vertical structural framing
  for (const z of [-1.0, 0, 1.0]) {
    box(wtBulkhead, [0.08, 1.1, 0.04], [18.6, -2.05, z], 0x1e293b, 0.65);
  }
  // Watertight access door frame
  box(wtBulkhead, [0.08, 0.55, 0.36], [18.6, -2.05, 0], 0x475569, 0.6);
  outlineBox(wtBulkhead, [0.08, 0.55, 0.36], [18.6, -2.05, 0], 0x38bdf8, 0.75);
  parent.add(wtBulkhead);

  // 4. EMERGENCY GENERATOR ROOM (ABOVE BULKHEAD DECK)
  const esbRoom = new THREE.Group();
  outlineBox(esbRoom, [3.4, 1.55, 1.7], [-10.85, 2.35, -1.35], 0xf97316, 0.5);
  box(esbRoom, [3.4, 1.55, 1.7], [-10.85, 2.35, -1.35], 0xea580c, 0.07);
  parent.add(esbRoom);
}


/** Slewing deck crane: x is the direction the boom points, y is up. */
function craneModel(g:THREE.Group){
  const yellow=0xe0ac38,cream=0xe8e0c8,dark=0x3b4854,mid=0x5b6975,chrome=0xc3ced4,glass=0x2f86a8,red=0xc9473a,rope=0x20272d;
  const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
  // Flanged foundation ring with bolts, tapered pedestal, weld bands, access door and ladder.
  cylinder(g,.4,.06,[0,.03,0],dark);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;cylinder(g,.016,.06,[Math.cos(a)*.34,.09,Math.sin(a)*.34],chrome);}
  const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(.25,.33,.92,28),material(yellow));pedestal.position.set(0,.52,0);g.add(pedestal);
  const radiusAt=(y:number)=>.33-(y-.06)*.087;
  for(const y of [.3,.66])cylinder(g,radiusAt(y)+.006,.02,[0,y,0],dark);
  box(g,[.02,.34,.2],[radiusAt(.36)+.004,.36,0],dark);
  for(const z of [-.07,.07])strut(g,V(-radiusAt(.5)-.01,.12,z),V(-radiusAt(.9)-.01,.95,z),.008,chrome);
  for(let y=.16;y<.95;y+=.1)box(g,[.03,.014,.15],[-radiusAt(y)-.012,y,0],chrome);
  // Slewing ring and platform with handrails.
  cylinder(g,.34,.08,[0,1.02,0],dark);cylinder(g,.31,.03,[0,1.075,0],mid);
  box(g,[1.06,.06,.66],[-.12,1.09,0],mid);
  for(const x of [-.62,-.37,-.12,.13,.38])for(const z of [-.32,.32])strut(g,V(x,1.12,z),V(x,1.3,z),.008,chrome);
  for(const y of [1.22,1.3])for(const z of [-.32,.32])strut(g,V(-.65,y,z),V(.41,y,z),.006,chrome);
  // Machinery house with louvres, roof, exhaust stack and counterweight.
  box(g,[.62,.44,.54],[-.38,1.34,0],yellow);box(g,[.66,.035,.58],[-.38,1.575,0],mid);
  for(const z of [-.272,.272])for(let i=0;i<5;i++)box(g,[.34,.02,.012],[-.46,1.2+i*.065,z],dark);
  box(g,[.012,.3,.3],[-.07,1.35,0],mid);
  strut(g,V(-.55,1.59,-.17),V(-.55,1.9,-.17),.04,dark);cylinder(g,.052,.03,[-.55,1.91,-.17],mid);
  box(g,[.14,.1,.18],[-.5,1.64,.13],mid);
  box(g,[.3,.38,.52],[-.78,1.31,0],mid);for(const y of [1.2,1.42])box(g,[.31,.045,.53],[-.78,y,0],yellow);
  // Operator cab with sloping glazing, roof light and floodlight.
  box(g,[.34,.34,.26],[.15,1.29,.34],cream);
  box(g,[.012,.22,.2],[.328,1.33,.34],glass,.7);
  for(const z of [.2,.48])box(g,[.2,.18,.012],[.15,1.33,z],glass,.7);
  box(g,[.38,.03,.3],[.15,1.475,.34],mid);box(g,[.04,.03,.07],[.3,1.5,.34],chrome);
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(.022,10,8),material(red));beacon.position.set(.05,1.5,.34);g.add(beacon);
  // Lattice boom: x is along the boom, y perpendicular, z across it.
  const angle=34*Math.PI/180,heel={x:.2,y:1.32},L=2.3,panels=7;
  const at=(s:number,y:number,z:number)=>V(heel.x+s*Math.cos(angle)-y*Math.sin(angle),heel.y+s*Math.sin(angle)+y*Math.cos(angle),z);
  const half=(s:number)=>.105-(s/L)*.05,wide=(s:number)=>.13-(s/L)*.07;
  for(let i=0;i<=panels;i++){
    const s=L*i/panels,h=half(s),w=wide(s);
    const ring=[at(s,h,-w),at(s,h,w),at(s,-h,w),at(s,-h,-w)];
    for(let k=0;k<4;k++)strut(g,ring[k],ring[(k+1)%4],.008,yellow);
    if(i===panels)break;
    const s2=L*(i+1)/panels,h2=half(s2),w2=wide(s2);
    for(const [y1,z1] of [[h,-w],[h,w],[-h,w],[-h,-w]] as [number,number][]){
      const y2=y1>0?h2:-h2,z2=z1>0?w2:-w2;strut(g,at(s,y1,z1),at(s2,y2,z2),.012,yellow);
    }
    const flip=i%2?1:-1;
    strut(g,at(s,h,-w*flip),at(s2,h2,w2*flip),.006,yellow);
    strut(g,at(s,-h,-w*flip),at(s2,-h2,w2*flip),.006,yellow);
    strut(g,at(s,h*flip,-w),at(s2,h2*-flip,-w2),.006,yellow);
    strut(g,at(s,h*flip,w),at(s2,h2*-flip,w2),.006,yellow);
  }
  // Heel casting and pins, boom head with twin sheaves and beacon.
  const foot=box(g,[.16,.22,.34],[0,0,0],mid);foot.position.copy(at(0,0,0));foot.rotation.z=angle;
  for(const z of [-.14,.14])cylinder(g,.035,.05,[heel.x,heel.y,z],chrome,'z');
  const head=box(g,[.16,.19,.24],[0,0,0],mid);head.position.copy(at(L,0,0));head.rotation.z=angle;
  for(const z of [-.06,.06]){const sheave=cylinder(g,.075,.03,[0,0,z],chrome,'z');sheave.position.copy(at(L+.04,.035,z));}
  const tip=new THREE.Mesh(new THREE.SphereGeometry(.02,10,8),material(red));tip.position.copy(at(L+.02,.15,0));g.add(tip);
  // Twin hydraulic luffing rams (barrel and chrome rod) and their pin brackets.
  for(const z of [-.12,.12]){
    const lower=V(.58,1.15,z),upper=at(.95,-half(.95),z),joint=lower.clone().lerp(upper,.5);
    box(g,[.1,.05,.06],[lower.x,lower.y-.015,z],mid);
    strut(g,lower,joint,.036,mid);strut(g,joint.clone().lerp(lower,.1),upper,.02,chrome);
    cylinder(g,.03,.05,[upper.x,upper.y,z],chrome,'z');
  }
  // Hoist rope: from the house over rope guides to the head sheaves, then two falls to the hook block.
  const winch=V(-.05,1.52,0),guideA=at(.45,half(.45)+.09,0),guideB=at(1.3,half(1.3)+.08,0),headTop=at(L+.04,.115,0);
  strut(g,winch,guideA,.007,rope);strut(g,guideA,guideB,.007,rope);strut(g,guideB,headTop,.007,rope);
  for(const s of [.45,1.3]){const base=at(s,half(s),0),top=at(s,half(s)+.09,0);strut(g,base,top,.01,mid);cylinder(g,.03,.05,[top.x,top.y,top.z],chrome,'z').position.copy(top);}
  const sheaveBottom=at(L+.04,-.04,0),hookTop=V(sheaveBottom.x,sheaveBottom.y-.95,0);
  for(const z of [-.06,.06])strut(g,V(sheaveBottom.x,sheaveBottom.y,z),V(hookTop.x,hookTop.y,z*.6),.007,rope);
  box(g,[.11,.15,.1],[hookTop.x,hookTop.y-.07,0],yellow);box(g,[.12,.03,.12],[hookTop.x,hookTop.y-.15,0],dark);
  cylinder(g,.04,.03,[hookTop.x,hookTop.y-.06,0],chrome,'z');
  strut(g,V(hookTop.x,hookTop.y-.15,0),V(hookTop.x,hookTop.y-.24,0),.014,dark);
  const hook=new THREE.Mesh(new THREE.TorusGeometry(.05,.014,8,20,Math.PI*1.5),material(dark));hook.position.set(hookTop.x,hookTop.y-.29,0);hook.rotation.z=Math.PI*.75;g.add(hook);
}

/** Forty-foot refrigerated container. The refrigeration end faces +x; its fan spins when powered. */
function reeferContainer(g:THREE.Group){
  const white=0xe9eef0,rib=0xc5d0d6,dark=0x3a4650,steelC=0xaab8c0,blue=0x2f6fb0;
  box(g,[3.0,.62,.58],[0,.325,0],white);
  for(const z of [-.2905,.2905])for(let x=-1.4;x<1.4;x+=.1)box(g,[.018,.5,.006],[x,.325,z],rib);
  box(g,[2.2,.07,.594],[-.25,.5,0],blue);
  for(const sx of [-1,1])for(const y of [.035,.615])for(const sz of [-1,1])box(g,[.09,.07,.07],[sx*1.475,y,sz*.27],dark);
  // Door end with locking bars.
  box(g,[.012,.56,.54],[-1.505,.325,0],0xdbe3e7);
  for(const z of [-.17,-.06,.06,.17])cylinder(g,.008,.52,[-1.514,.325,z],steelC);
  // Refrigeration end: frame, condenser fan with guard, coil louvres, controller, status light and power inlet.
  box(g,[.04,.6,.56],[1.5,.325,0],0xdfe6ea);
  const fanPos:[number,number,number]=[1.535,.43,-.12];
  const guard=new THREE.Mesh(new THREE.TorusGeometry(.12,.012,8,24),material(dark));guard.position.set(...fanPos);guard.rotation.y=Math.PI/2;g.add(guard);
  const inner=new THREE.Mesh(new THREE.TorusGeometry(.07,.006,6,20),material(steelC));inner.position.set(fanPos[0]+.012,fanPos[1],fanPos[2]);inner.rotation.y=Math.PI/2;g.add(inner);
  box(g,[.006,.24,.008],[fanPos[0]+.014,fanPos[1],fanPos[2]],steelC);box(g,[.006,.008,.24],[fanPos[0]+.014,fanPos[1],fanPos[2]],steelC);
  const fan=new THREE.Group();fan.position.set(fanPos[0]+.002,fanPos[1],fanPos[2]);fan.userData.spin=true;
  cylinder(fan,.025,.02,[0,0,0],dark,'x');
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5,blade=box(fan,[.008,.1,.04],[0,Math.cos(a)*.06,Math.sin(a)*.06],steelC);blade.rotation.x=a;}
  g.add(fan);
  box(g,[.02,.2,.4],[1.525,.15,-.04],dark);for(let i=0;i<9;i++)box(g,[.012,.008,.38],[1.54,.065+i*.021,-.04],steelC);
  box(g,[.03,.17,.15],[1.535,.46,.19],dark);box(g,[.006,.035,.09],[1.552,.5,.19],0x4fe3c0);
  for(const dz of [-.04,0,.04])cylinder(g,.008,.01,[1.552,.43,.19+dz],steelC,'x');
  const light=new THREE.Mesh(new THREE.SphereGeometry(.02,10,8),material(0x7a2a2a));light.position.set(1.552,.55,.19);light.userData.statusLight=true;g.add(light);
  cylinder(g,.045,.035,[1.54,.28,0],dark,'x');cylinder(g,.032,.05,[1.575,.28,0],0xd27a2c,'x');
}

function loadModel(e:Equipment):THREE.Group {
  const g=new THREE.Group();
  if(e.kind==='propeller'||e.id==='prop')return propellerAssembly.group;
  if(e.id==='crane'){craneModel(g);return g;}
  if(e.id==='reeferUnit' || e.id==='reeferUnitA' || e.id==='reeferUnitB'){reeferContainer(g);return g;}
  if(e.id==='steering'||e.id==='eSteer'){
    box(g,[1.6,.15,.9],[0,0,0],0x3d596b);cylinder(g,.28,.4,[0,.24,0],0xa6c2cb);
    for(const z of [-.28,.28]){cylinder(g,.10,1.0,[0,.26,z],0x66ada8,'x');box(g,[.14,.25,.22],[.6,.2,z],0xbed2d8);}return g;
  }
  if(e.id==='nav'){
    for(const z of [-.62,0,.62]){box(g,[.65,.5,.5],[0,.25,z],0x486c82);const screen=box(g,[.04,.3,.38],[.35,.6,z],0x6dbfb8);screen.rotation.z=-.22;box(g,[.4,.045,.43],[.24,.52,z],0x9cafbc);}return g;
  }
  if(e.id==='galley440'){
    // 440 V Galley Primary Switchboard & Heavy Thermal Battery (Ovens, Fryers)
    box(g,[0.75,1.2,0.42],[-0.5,0.6,0],0x1e293b); // 440V Galley Distribution Switchboard
    cylinder(g,0.04,0.035,[-0.5,0.85,0.22],0x22c55e,'z'); // ACB Closed Indicator
    box(g,[1.3,0.78,0.72],[0.45,0.39,0],0x94a3b8); // Heavy cooking block
    box(g,[1.34,0.06,0.76],[0.45,0.79,0],0xcbd5e1); // Stainless top
    for(const x of [0.15,0.55])for(const z of [-0.18,0.18])cylinder(g,0.12,0.025,[x,0.83,z],0x334155);
    // Outdoor Emergency Shunt Trip Pushbutton Station
    box(g,[0.14,0.22,0.12],[-1.0,0.65,0.38],0xfacc15); // Safety yellow station
    cylinder(g,0.048,0.035,[-1.0,0.65,0.46],0xdc2626,'z'); // Red mushroom head
    return g;
  }
  if(e.id==='galleySmall'||e.id==='galley'){
    box(g,[1.3,0.7,0.65],[0,0.35,0],0xaabac2);box(g,[1.35,0.05,0.7],[0,0.725,0],0xd6dce0);
    box(g,[0.45,0.3,0.35],[-0.3,0.88,0],0x475569); // Food processor / microwave
    return g;
  }
  if(e.id==='lights'||e.id==='eLights'||e.id==='outlets'){
    const count=e.id==='lights'?4:e.id==='outlets'?3:2;
    for(let i=0;i<count;i++){
      const x=i*.46;
      if(e.id==='outlets'){box(g,[.25,.32,.07],[x,0,0],0xc5d4d6);for(const dx of [-.045,.045])box(g,[.02,.065,.018],[x+dx,0,.045],0x243947);}
      else{box(g,[.28,.06,.16],[x,0,0],0x879fa9);box(g,[.23,.035,.125],[x,-.04,0],0xe6dcb8);}
    }return g;
  }
  // Deck shore inlet and secondary steering/control cabinets.
  box(g,[.66,.95,.43],[0,.48,0],e.kind==='future'?0x9d967f:0x4f8e9b);
  box(g,[.53,.81,.035],[0,.5,.235],0x7d9aab);box(g,[.2,.15,.025],[0,.7,.261],0x243e51);
  for(const x of [-.17,.17])cylinder(g,.08,.04,[x,.29,.27],0xd3b277,'z');
  return g;
}

export function createVesselEquipment(e:Equipment):THREE.Group {
  const placement=vesselLayout[e.id];
  const root=new THREE.Group();root.position.set(...placement.position);root.userData.eqId=e.id;
  const EQ_SCALE = 0.75;
  const size: [number, number, number] = [
    placement.size[0] * EQ_SCALE,
    placement.size[1] * EQ_SCALE,
    placement.size[2] * EQ_SCALE
  ];
  if(e.id==='prop'||e.kind==='propeller'){
    propellerAssembly.group.scale.setScalar(EQ_SCALE);
    root.add(propellerAssembly.group);
    root.userData.height=placement.size[1] * EQ_SCALE;
    root.userData.propellerAssembly=propellerAssembly;
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='txA'||e.id==='txB'||e.id==='txReeferA'||e.id==='txReeferB'||e.id==='txConA'||e.id==='txConB'||e.kind==='transformer'||e.model==='transformer'){
    const txGroup = transformerAssembly.createEquipmentGroup(e.id, size);
    txGroup.rotation.y = placement.rotation || 0;
    root.add(txGroup);
    root.userData.height = size[1];
    root.userData.transformerAssembly = transformerAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='drive'||e.kind==='drive'){
    const driveGroup = driveAssembly.createEquipmentGroup(e.id, size);
    driveGroup.rotation.y = placement.rotation || 0;
    root.add(driveGroup);
    root.userData.height = size[1];
    root.userData.driveAssembly = driveAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='motor'||e.kind==='motor'){
    const motorGroup = motorAssembly.createEquipmentGroup(e.id, size);
    motorGroup.rotation.y = placement.rotation || 0;
    root.add(motorGroup);
    root.userData.height = size[1];
    root.userData.motorAssembly = motorAssembly;
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='steering'){
    const steeringGroup = steeringAssembly.createEquipmentGroup(e.id, size);
    steeringGroup.rotation.y = placement.rotation || 0;
    root.add(steeringGroup);
    root.userData.height = size[1];
    root.userData.steeringAssembly = steeringAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='reefer'||e.id==='reeferA'||e.id==='reeferB'||e.model==='reefer'||e.kind==='reefer'){
    const reeferGroup = reeferAssembly.createEquipmentGroup(e.id, size);
    reeferGroup.rotation.y = placement.rotation || 0;
    root.add(reeferGroup);
    root.userData.height = size[1];
    root.userData.reeferAssembly = reeferAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='ballast'){
    const ballastGroup = ballastOwsAssembly.createEquipmentGroup(e.id, size);
    ballastGroup.rotation.y = placement.rotation || 0;
    root.add(ballastGroup);
    root.userData.height = size[1];
    root.userData.ballastOwsAssembly = ballastOwsAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='airCompressor'){
    const compGroup = airCompressorAssembly.createEquipmentGroup(e.id, size);
    compGroup.rotation.y = placement.rotation || 0;
    root.add(compGroup);
    root.userData.height = size[1];
    root.userData.airCompressorAssembly = airCompressorAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='ventFan'){
    const fanGroup = ventFanAssembly.createEquipmentGroup(e.id, size);
    fanGroup.rotation.y = placement.rotation || 0;
    root.add(fanGroup);
    root.userData.height = size[1];
    root.userData.ventFanAssembly = ventFanAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='eBus'){
    const esbGroup = esbCubicleAssembly.createEquipmentGroup(e.id, size);
    esbGroup.rotation.y = placement.rotation || 0;
    root.add(esbGroup);
    root.userData.height = size[1];
    root.userData.esbCubicleAssembly = esbCubicleAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='eRadio'){
    const battGroup = batterySystemAssembly.createEquipmentGroup(e.id, size);
    battGroup.rotation.y = placement.rotation || 0;
    root.add(battGroup);
    root.userData.height = size[1];
    root.userData.batterySystemAssembly = batterySystemAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='galley440'){
    const galleyGroup = galleyBoardAssembly.createEquipmentGroup(e.id, size);
    galleyGroup.rotation.y = placement.rotation || 0;
    root.add(galleyGroup);
    root.userData.height = size[1];
    root.userData.galleyBoardAssembly = galleyBoardAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='shore'){
    const shoreGroup = shorePowerAssembly.createEquipmentGroup(e.id, size);
    shoreGroup.rotation.y = placement.rotation || 0;
    root.add(shoreGroup);
    root.userData.height = size[1];
    root.userData.shorePowerAssembly = shorePowerAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.id==='nav'){
    const navGroup = bridgeNavComAssembly.createEquipmentGroup(e.id, size);
    navGroup.rotation.y = placement.rotation || 0;
    root.add(navGroup);
    root.userData.height = size[1];
    root.userData.bridgeNavComAssembly = bridgeNavComAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  if(e.kind==='pump'||e.model==='pump'||['cooling','cooling1','cooling2','fire','fire1','fire2','bilge','eFire'].includes(e.id)){
    const pumpGroup = pumpAssembly.createEquipmentGroup(e.id, size);
    pumpGroup.rotation.y = placement.rotation || 0;
    root.add(pumpGroup);
    root.userData.height = size[1];
    root.userData.pumpAssembly = pumpAssembly;
    if(placement.space!=='external'&&placement.space!=='cargo'){
      const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
    }
    root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
    return root;
  }
  const model=e.model?createModel(e.model).group:loadModel(e);
  model.rotation.y=placement.rotation||0;model.updateMatrixWorld(true);
  let bounds=new THREE.Box3().setFromObject(model);const raw=bounds.getSize(new THREE.Vector3());
  const scale=Math.min(size[0]/raw.x,size[1]/raw.y,size[2]/raw.z);
  model.scale.setScalar(scale);model.updateMatrixWorld(true);bounds=new THREE.Box3().setFromObject(model);
  const center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);
  root.add(model);root.userData.height=bounds.max.y-bounds.min.y;
  if(placement.space!=='external'&&placement.space!=='cargo'&&e.id!=='bow'&&e.kind!=='thruster'){
    const base=box(root,[Math.min(size[0]+.09*EQ_SCALE,2.2*EQ_SCALE),.035*EQ_SCALE,size[2]+.07*EQ_SCALE],[0,-.025*EQ_SCALE,0],0x375b70,.7);base.userData.foundation=true;
  }
  root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
  return root;
}
