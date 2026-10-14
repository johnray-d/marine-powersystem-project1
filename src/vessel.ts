import * as THREE from 'three';
import { SHIP, CARGO, halfBeamAt, vesselLayout } from './vessel-layout';
import { createModel } from './models';
import type { Equipment } from './network';

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
function line(parent: THREE.Group, points: THREE.Vector3[], color: number, opacity = 0.5) {
  const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: deepen(color), transparent: true, opacity: Math.min(1, opacity * 1.5) }));
  parent.add(mesh); return mesh;
}
function outlineBox(parent: THREE.Group, size: [number, number, number], at: [number, number, number], color = steel, opacity = 0.4) {
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), new THREE.LineBasicMaterial({ color: deepen(color), transparent: true, opacity: Math.min(1, opacity * 1.5) }));
  edges.position.set(...at); parent.add(edges);
}
function deck(parent: THREE.Group, height: number, opacity: number) {
  const outline = [...SHIP.stations.map(([x]) => new THREE.Vector2(x, halfBeamAt(x, height))),
    ...[...SHIP.stations].reverse().map(([x]) => new THREE.Vector2(x, -halfBeamAt(x, height)))];
  const shape = new THREE.Shape(outline);
  const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material(0x7097a5, opacity)); mesh.position.y = height; parent.add(mesh);
  const points = outline.map(v => new THREE.Vector3(v.x, height, -v.y)); points.push(points[0].clone());
  line(parent, points, 0x8abac8, 0.46);
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
      instances.push({ x: bays[b], y: 1.35 + tier * 0.68, z: (row - (CARGO.rows-1)/2) * CARGO.rowPitch, color: colors[(b + row + tier) % colors.length] });
    }
  }
  const containerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .1, roughness: .7, transparent: true, opacity: .26, depthWrite: false });
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
  const verts: number[] = [];
  const heights = [SHIP.mainDeck, -0.8, SHIP.keel];
  for (let h = 0; h < heights.length - 1; h++) for (let i = 1; i < SHIP.stations.length; i++) for (const side of [-1,1]) {
    const x1=SHIP.stations[i-1][0], x2=SHIP.stations[i][0], y1=heights[h], y2=heights[h+1];
    const a=new THREE.Vector3(x1,y1,side*halfBeamAt(x1,y1)), b=new THREE.Vector3(x2,y1,side*halfBeamAt(x2,y1));
    const c=new THREE.Vector3(x1,y2,side*halfBeamAt(x1,y2)), d=new THREE.Vector3(x2,y2,side*halfBeamAt(x2,y2));
    for (const p of [a,b,c,b,d,c]) verts.push(p.x,p.y,p.z);
  }
  const hullGeometry = new THREE.BufferGeometry(); hullGeometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); hullGeometry.computeVertexNormals();
  ship.add(new THREE.Mesh(hullGeometry,material(0x45869b,0.14)));
  deck(ship,SHIP.mainDeck,0.045); deck(ship,SHIP.keel,0.13);
  // Flat stern transom, hull frames, bilge line, and longitudinal stringers.
  box(ship,[0.05,3.5,2.6],[-17.36,-0.85,0],0x578799,0.12);
  for(let x=-16;x<17;x+=1.6){
    const points=[new THREE.Vector3(x,.9,-halfBeamAt(x)),new THREE.Vector3(x,-.8,-halfBeamAt(x,-.8)),new THREE.Vector3(x,-2.6,-halfBeamAt(x,-2.6)),new THREE.Vector3(x,-2.6,halfBeamAt(x,-2.6)),new THREE.Vector3(x,-.8,halfBeamAt(x,-.8)),new THREE.Vector3(x,.9,halfBeamAt(x))];
    line(ship,points,0x73a7b7,0.22);
  }
  for(const y of [-1.9,-.4]) for(const side of [-1,1]) line(ship,SHIP.stations.map(([x])=>new THREE.Vector3(x,y,side*halfBeamAt(x,y))),0x548da1,0.3);
  // Machinery floor, upper switchgear platforms and separated compartments.
  box(ship,[12.8,.035,4.65],[-8.4,-1.76,0],0x547487,0.08);
  box(ship,[6.65,.035,2.1],[-6.85,-.33,-.3],0x6b9baf,0.07);
  for(const x of [-14.5,-3,11]){
    box(ship,[.035,2.45,halfBeamAt(x,-1.5)*2],[x,-.37,0],0x8badb9,0.035);
    line(ship,[new THREE.Vector3(x,-1.65,-2.1),new THREE.Vector3(x,.75,-2.1),new THREE.Vector3(x,.75,2.1),new THREE.Vector3(x,-1.65,2.1)],0x75aeb5,0.28);
  }
  // Railings follow the deck perimeter, with stanchions and two horizontal rails.
  for(const side of [-1,1]){
    for(const y of [1.1,1.25]) line(ship,SHIP.stations.map(([x])=>new THREE.Vector3(x,y,side*Math.max(.02,halfBeamAt(x)-.08))),0xa1c6cf,.45);
    for(let x=-17;x<17.5;x+=.8)line(ship,[new THREE.Vector3(x,.9,side*(halfBeamAt(x)-.08)),new THREE.Vector3(x,1.26,side*(halfBeamAt(x)-.08))],0x91b9c3,.45);
  }
  // Aft accommodation block, deck divisions, bridge wings, windows and exterior ladders.
  box(ship,[6.2,3.1,5.3],[-10.4,2.45,0],0xa7d4de,.055);
  outlineBox(ship,[6.2,3.1,5.3],[-10.4,2.45,0],0x92c9d5,.37);
  for(const y of [.98,2.12,3.3,4.02]){
    box(ship,[6.3,.06,5.42],[-10.4,y,0],0x92becb,.10);
    outlineBox(ship,[6.3,.06,5.42],[-10.4,y,0],0x83bdca,.35);
  }
  box(ship,[2.4,.73,6.1],[-8.55,3.77,0],0x99d9e2,.07);
  outlineBox(ship,[2.4,.73,6.1],[-8.55,3.77,0],0xacdce4,.45);
  for(let z=-2.65;z<=2.65;z+=.55)box(ship,[.035,.30,.42],[-7.32,3.87,z],0x397d9d,.52);
  for(const side of [-1,1])for(const y of [1.5,2.65,3.7])for(let x=-12.6;x<-8.0;x+=.75){
    box(ship,[.43,.23,.025],[x,y,side*2.665],0x72a8bf,.33);
  }
  for(const z of [-2.72,2.72]){
    line(ship,[new THREE.Vector3(-12.9,1,z),new THREE.Vector3(-12.9,4.15,z)],0xb0ced5,.6);
    line(ship,[new THREE.Vector3(-12.65,1,z),new THREE.Vector3(-12.65,4.15,z)],0xb0ced5,.6);
    for(let y=1.05;y<4.1;y+=.18)line(ship,[new THREE.Vector3(-12.9,y,z),new THREE.Vector3(-12.65,y,z)],0xb0ced5,.6);
  }
  box(ship,[1.45,1.22,1.15],[-12.2,4.45,.7],0x547e90,.28);
  for(let x=-12.65;x<-11.6;x+=.29)cylinder(ship,.09,.28,[x,5.18,.7],0x446477);
  cylinder(ship,.035,1.9,[-8.7,4.98,0],0xa9d1db);
  box(ship,[1.3,.09,.13],[-8.7,5.45,0],0xb6d8dd,.8);
  cylinder(ship,.16,.10,[-8.7,5.91,0],0xc5e1e6);
  // Forecastle, anchor handling drums, fairleads and mooring bollards.
  box(ship,[2.9,.1,2.45],[15,1.02,0],0x769ead,.20);
  for(const z of [-.75,.75]){
    box(ship,[.85,.11,.45],[15.2,1.13,z],0x537384,.8);
    cylinder(ship,.15,.40,[15.2,1.32,z],0x9ab7c1,'z');
    for(const x of [13.55,16.2]){cylinder(ship,.055,.15,[x,1.12,z],0xacc4cc);box(ship,[.2,.025,.07],[x,1.2,z],0xacc4cc);}
  }
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),material(0x43768e,.19));bulb.scale.set(1.45,.53,.55);bulb.position.set(16.7,-1.82,0);ship.add(bulb);
  box(ship,[.38,1.3,.10],[-18.45,-1.45,0],0x7b9ead,.55);
  cargo(ship);
  return ship;
}

function propeller():THREE.Group {
  const group=new THREE.Group();cylinder(group,.14,.47,[0,0,0],0xc7aa72,'x');
  const shape=new THREE.Shape();shape.moveTo(.04,.09);shape.bezierCurveTo(.32,.08,.53,.43,.36,.65);shape.bezierCurveTo(.19,.77,.05,.53,.04,.09);
  const blade=new THREE.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:2,steps:1});blade.rotateY(Math.PI/2);
  for(let i=0;i<5;i++){const mesh=new THREE.Mesh(blade,material(0xc5a66a));mesh.rotation.x=i*Math.PI*2/5;group.add(mesh);}
  return group;
}

function loadModel(e:Equipment):THREE.Group {
  const g=new THREE.Group();
  if(e.kind==='propeller')return propeller();
  if(e.id==='crane'){
    cylinder(g,.3,.9,[0,.45,0],0xd7ab66);box(g,[.65,.8,.5],[0,1.22,0],0xdfb678);
    const boom=box(g,[2.8,.18,.20],[1.0,2.15,0],0xd9aa61);boom.rotation.z=.22;
    line(g,[new THREE.Vector3(-.28,1.35,0),new THREE.Vector3(.1,2.9,0),new THREE.Vector3(2.35,2.44,0)],0xd6dce0,.9);
    line(g,[new THREE.Vector3(2.35,2.44,0),new THREE.Vector3(2.35,1.2,0)],0xc6d8df,1);
    cylinder(g,.075,.18,[2.35,1.18,0],0xcbd8dc);box(g,[.38,.45,.45],[.22,1.37,0],0x458697,.9);
    return g;
  }
  if(e.id==='steering'){
    box(g,[1.6,.15,.9],[0,0,0],0x3d596b);cylinder(g,.28,.4,[0,.24,0],0xa6c2cb);
    for(const z of [-.28,.28]){cylinder(g,.10,1.0,[0,.26,z],0x66ada8,'x');box(g,[.14,.25,.22],[.6,.2,z],0xbed2d8);}return g;
  }
  if(e.id==='nav'){
    for(const z of [-.62,0,.62]){box(g,[.65,.5,.5],[0,.25,z],0x486c82);const screen=box(g,[.04,.3,.38],[.35,.6,z],0x6dbfb8);screen.rotation.z=-.22;box(g,[.4,.045,.43],[.24,.52,z],0x9cafbc);}return g;
  }
  if(e.id==='galley'){
    box(g,[1.8,.7,.8],[0,.35,0],0xaabac2);box(g,[1.86,.07,.86],[0,.73,0],0xd6dce0);
    for(const x of [-.5,.25])for(const z of [-.18,.18])cylinder(g,.14,.025,[x,.78,z],0x344957);
    box(g,[.62,.4,.035],[-.3,.32,.42],0x405969);return g;
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
  const model=e.model?createModel(e.model).group:loadModel(e);
  model.rotation.y=placement.rotation||0;model.updateMatrixWorld(true);
  let bounds=new THREE.Box3().setFromObject(model);const raw=bounds.getSize(new THREE.Vector3());
  const scale=Math.min(placement.size[0]/raw.x,placement.size[1]/raw.y,placement.size[2]/raw.z);
  model.scale.setScalar(scale);model.updateMatrixWorld(true);bounds=new THREE.Box3().setFromObject(model);
  const center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);
  root.add(model);root.userData.height=bounds.max.y-bounds.min.y;
  if(placement.space!=='external'){
    const base=box(root,[Math.min(placement.size[0]+.09,2.2),.035,placement.size[2]+.07],[0,-.025,0],0x375b70,.7);base.userData.foundation=true;
  }
  root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
  return root;
}
