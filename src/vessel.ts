import * as THREE from 'three';
import { SHIP, CARGO, halfBeamAt, keelAt, hullStart, hullEnd, vesselLayout } from './vessel-layout';
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
function ring(parent: THREE.Object3D, radius: number, tube: number, at: [number, number, number], color: number, axis: 'x' | 'y' | 'z' = 'x') {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 24), material(color));
  if (axis === 'x') mesh.rotation.y = Math.PI / 2;
  if (axis === 'y') mesh.rotation.x = Math.PI / 2;
  mesh.position.set(...at); parent.add(mesh); return mesh;
}
function strut(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number) {
  const d = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(.001, d.length()), 8), material(color));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(mesh); return mesh;
}
/** Plan positions along the hull, sampled with high density through curved bow and stern. */
function hullXs(): number[] {
  const xs: number[] = [];
  for (let x = hullStart; x < -14.0; x += 0.25) xs.push(x);
  for (let x = -14.0; x < 12.0; x += 0.35) xs.push(x);
  for (let x = 12.0; x < hullEnd - 1e-6; x += 0.12) xs.push(x);
  xs.push(hullEnd);
  return xs;
}
function deck(parent: THREE.Group, height: number, opacity: number) {
  const xs = hullXs();
  const outline = [...xs.map(x => new THREE.Vector2(x, halfBeamAt(x, height))),
    ...[...xs].reverse().map(x => new THREE.Vector2(x, -halfBeamAt(x, height)))];
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
      if (b === 3 && row === 7 && tier === 0) continue; // This slot holds the detailed reefer container (equipment 'reeferUnit').
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

// Hull colours: blue topsides and a darker underwater body, both translucent so the machinery stays visible.
const HULL = { top: 0x2f7fb8, under: 0x24445a, waterline: 0x0d5d86 };
function hullMaterial(color: number, opacity: number) {
  return new THREE.MeshStandardMaterial({ color, metalness: .15, roughness: .65, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
}
// Finely sampled vertical levels ensuring smooth bilge curvature and an exact split at the waterline
const UNDER_LEVELS = [-2.65, -2.48, -2.30, -2.12, -1.94, -1.76, -1.58, -1.41, SHIP.waterline];
const TOP_LEVELS = [SHIP.waterline, -1.05, -0.85, -0.65, -0.45, -0.25, -0.05, 0.15, 0.35, 0.55, 0.73, SHIP.mainDeck];
const LEVELS = [...UNDER_LEVELS, ...TOP_LEVELS.slice(1)];
const WATER_INDEX = UNDER_LEVELS.length - 1;

function hullPoint(x: number, level: number, side: number) {
  const y = Math.max(level, keelAt(x));
  return new THREE.Vector3(x, y, side * halfBeamAt(x, y));
}
/** Cross-section at x as an ordered polyline: down one side from `top`, across the bottom, up the other side. */
function hullLoop(x: number, top = LEVELS.length - 1, bottom = 0) {
  const left: THREE.Vector3[] = [], right: THREE.Vector3[] = [];
  for (let j = top; j >= bottom; j--) { left.push(hullPoint(x, LEVELS[j], -1)); right.push(hullPoint(x, LEVELS[j], 1)); }
  return [...left, ...right.reverse()];
}
function hullSide(x: number, side: number) {
  const points: THREE.Vector3[] = [];
  for (let j = LEVELS.length - 1; j >= WATER_INDEX; j--) points.push(hullPoint(x, LEVELS[j], side));
  return points;
}
function strip(xs: number[], polyline: (x: number) => THREE.Vector3[]) {
  const rows = xs.map(polyline), width = rows[0].length, positions: number[] = [];
  for (let i = 1; i < rows.length; i++) for (let j = 1; j < width; j++) {
    const a = rows[i - 1][j - 1], b = rows[i][j - 1], c = rows[i - 1][j], d = rows[i][j];
    for (const p of [a, b, c, b, d, c]) positions.push(p.x, p.y, p.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  return geometry;
}
function rawLine(parent: THREE.Group, points: THREE.Vector3[], color: number, opacity: number) {
  parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
}

/** Hydrodynamic Nabla bulbous bow seamlessly integrated with the hull forefoot and keel */
function createBulbousBow(parent: THREE.Group) {
  const xStart = 14.5, xEnd = 19.3, xNose = 19.3;
  const rings = 28, radials = 32;
  const positions: number[] = [];
  
  const bulbPoint = (x: number, theta: number): THREE.Vector3 => {
    const u = Math.max(0, Math.min(1, (x - xStart) / (xEnd - xStart)));
    const rBase = Math.sin(Math.pow(u, 0.62) * Math.PI);
    const rz = 0.72 * rBase;
    const ry = 0.62 * rBase;
    const nabla = 1 - 0.15 * Math.sin(theta);
    const yc = -1.72 + 0.08 * Math.cos(u * Math.PI);
    return new THREE.Vector3(x, yc + ry * Math.sin(theta) * nabla, rz * Math.cos(theta));
  };

  for (let i = 0; i < rings; i++) {
    const x0 = xStart + (xEnd - xStart) * (i / rings);
    const x1 = xStart + (xEnd - xStart) * ((i + 1) / rings);
    for (let j = 0; j < radials; j++) {
      const th0 = (j / radials) * Math.PI * 2;
      const th1 = ((j + 1) / radials) * Math.PI * 2;
      const p00 = bulbPoint(x0, th0), p10 = bulbPoint(x1, th0);
      const p01 = bulbPoint(x0, th1), p11 = bulbPoint(x1, th1);
      positions.push(p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z);
      positions.push(p10.x, p10.y, p10.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z);
    }
  }

  const noseCenter = new THREE.Vector3(xNose, -1.72, 0);
  for (let j = 0; j < radials; j++) {
    const th0 = (j / radials) * Math.PI * 2;
    const th1 = ((j + 1) / radials) * Math.PI * 2;
    const p0 = bulbPoint(xEnd, th0), p1 = bulbPoint(xEnd, th1);
    positions.push(p0.x, p0.y, p0.z, noseCenter.x, noseCenter.y, noseCenter.z, p1.x, p1.y, p1.z);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, hullMaterial(HULL.under, 0.42));
  parent.add(mesh);

  // Upper faired stem connecting top of bulb into forecastle stem head
  const stemPlate: THREE.Vector3[] = [];
  for (let t = 0; t <= 1; t += 0.05) {
    const x = 17.5 + t * (18.7 - 17.5);
    const y = -1.14 + t * (1.63 - (-1.14));
    stemPlate.push(new THREE.Vector3(x, y, 0));
  }
  rawLine(parent, stemPlate, 0x8abac8, 0.8);
}

/** Raised forecastle with sheer rise, plated solid bulwarks, breakwater, windlasses and bower anchors */
function createForecastle(parent: THREE.Group) {
  const xStart = 12.6, xEnd = 18.7;
  const fcHeight = (x: number) => 1.02 + 0.61 * Math.pow(Math.max(0, (x - xStart) / (xEnd - xStart)), 1.35);
  
  // 1. Forecastle Deck polygon
  const xs: number[] = [];
  for (let x = xStart; x <= xEnd; x += 0.15) xs.push(x);
  if (xs[xs.length - 1] !== xEnd) xs.push(xEnd);

  const deckPts: THREE.Vector3[] = [];
  for (const x of xs) {
    const y = fcHeight(x);
    const z = Math.max(0.04, halfBeamAt(x, y));
    deckPts.push(new THREE.Vector3(x, y, -z));
  }
  for (let i = xs.length - 1; i >= 0; i--) {
    const x = xs[i], y = fcHeight(x), z = Math.max(0.04, halfBeamAt(x, y));
    deckPts.push(new THREE.Vector3(x, y, z));
  }

  const deckPos: number[] = [];
  const n = xs.length;
  for (let i = 1; i < n; i++) {
    const pPort0 = deckPts[i - 1], pPort1 = deckPts[i];
    const pStbd0 = deckPts[deckPts.length - i], pStbd1 = deckPts[deckPts.length - 1 - i];
    deckPos.push(pPort0.x, pPort0.y, pPort0.z, pPort1.x, pPort1.y, pPort1.z, pStbd0.x, pStbd0.y, pStbd0.z);
    deckPos.push(pPort1.x, pPort1.y, pPort1.z, pStbd1.x, pStbd1.y, pStbd1.z, pStbd0.x, pStbd0.y, pStbd0.z);
  }
  const deckGeom = new THREE.BufferGeometry();
  deckGeom.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeom.computeVertexNormals();
  parent.add(new THREE.Mesh(deckGeom, material(0x527b8c, 0.45)));

  // 2. Forecastle Solid Bulwark (Steel wall rising 0.38 above forecastle deck)
  const bwHeight = 0.38;
  for (const side of [-1, 1]) {
    const bwPos: number[] = [];
    for (let i = 1; i < xs.length; i++) {
      const x0 = xs[i - 1], y0 = fcHeight(x0), z0 = side * Math.max(0.04, halfBeamAt(x0, y0));
      const x1 = xs[i], y1 = fcHeight(x1), z1 = side * Math.max(0.04, halfBeamAt(x1, y1));
      const b0 = new THREE.Vector3(x0, y0, z0), t0 = new THREE.Vector3(x0, y0 + bwHeight, z0);
      const b1 = new THREE.Vector3(x1, y1, z1), t1 = new THREE.Vector3(x1, y1 + bwHeight, z1);
      bwPos.push(b0.x, b0.y, b0.z, t0.x, t0.y, t0.z, b1.x, b1.y, b1.z);
      bwPos.push(t0.x, t0.y, t0.z, t1.x, t1.y, t1.z, b1.x, b1.y, b1.z);
    }
    const bwGeom = new THREE.BufferGeometry();
    bwGeom.setAttribute('position', new THREE.Float32BufferAttribute(bwPos, 3));
    bwGeom.computeVertexNormals();
    parent.add(new THREE.Mesh(bwGeom, material(HULL.top, 0.55)));

    // Top cap rail along the bulwark
    const railPts = xs.map(x => {
      const y = fcHeight(x) + bwHeight;
      return new THREE.Vector3(x, y, side * Math.max(0.04, halfBeamAt(x, fcHeight(x))));
    });
    rawLine(parent, railPts, 0x223c4a, 0.85);

    // Stiffener stays every ~0.8 units
    for (let x = xStart + 0.5; x < xEnd - 0.3; x += 0.85) {
      const y = fcHeight(x), z = side * Math.max(0.04, halfBeamAt(x, y));
      const inZ = z - side * 0.12;
      const gusset = [new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + bwHeight * 0.9, z), new THREE.Vector3(x, y, inZ), new THREE.Vector3(x, y, z)];
      rawLine(parent, gusset, 0x486c7d, 0.5);
    }
  }

  // 3. Forward V-shaped Breakwater
  const bwApexX = 13.75, bwApexY = fcHeight(bwApexX), bwH = 0.54;
  for (const side of [-1, 1]) {
    const pA = new THREE.Vector3(bwApexX, bwApexY, 0);
    const pB = new THREE.Vector3(13.15, fcHeight(13.15), side * 2.35);
    const tA = pA.clone().add(new THREE.Vector3(0, bwH, 0));
    const tB = pB.clone().add(new THREE.Vector3(0, bwH, 0));
    const plPos = [pA.x, pA.y, pA.z, tA.x, tA.y, tA.z, pB.x, pB.y, pB.z, tA.x, tA.y, tA.z, tB.x, tB.y, tB.z, pB.x, pB.y, pB.z];
    const plGeom = new THREE.BufferGeometry();
    plGeom.setAttribute('position', new THREE.Float32BufferAttribute(plPos, 3));
    plGeom.computeVertexNormals();
    parent.add(new THREE.Mesh(plGeom, material(0x385565, 0.85)));
    rawLine(parent, [tA, tB], 0x223c4a, 0.9);
    for (let f = 0.25; f <= 0.85; f += 0.3) {
      const bPt = pA.clone().lerp(pB, f);
      const aftPt = bPt.clone().add(new THREE.Vector3(-0.24, 0, 0));
      const topPt = bPt.clone().add(new THREE.Vector3(0, bwH * 0.8, 0));
      rawLine(parent, [bPt, topPt, aftPt, bPt], 0x223c4a, 0.6);
    }
  }

  // 4. Companionway stair from cargo deck (0.90) to forecastle (1.02)
  for (const z of [-0.6, 0.6]) {
    box(parent, [0.38, 0.14, 0.42], [12.5, 0.96, z], 0x3f5c6c, 0.8);
    for (let s = 0; s < 3; s++) box(parent, [0.1, 0.04, 0.38], [12.4 + s * 0.08, 0.92 + s * 0.04, z], 0x6e8e9e);
  }

  // 5. Twin Anchor Windlasses & Mooring Winches
  for (const side of [-1, 1]) {
    const wX = 15.6, wY = fcHeight(wX) + 0.02, wZ = side * 0.95;
    box(parent, [1.1, 0.08, 0.72], [wX, wY + 0.04, wZ], 0x2a3e4d);
    box(parent, [0.45, 0.38, 0.28], [wX - 0.22, wY + 0.24, wZ], 0x385565);
    cylinder(parent, 0.12, 0.26, [wX - 0.22, wY + 0.24, wZ - side * 0.22], 0x223a4a, 'z');
    cylinder(parent, 0.04, 0.64, [wX + 0.12, wY + 0.24, wZ], 0x8aa4b0, 'z');
    cylinder(parent, 0.22, 0.12, [wX + 0.12, wY + 0.24, wZ], 0x607d8b, 'z');
    ring(parent, 0.22, 0.025, [wX + 0.12, wY + 0.24, wZ - 0.06], 0x455a64, 'z');
    ring(parent, 0.22, 0.025, [wX + 0.12, wY + 0.24, wZ + 0.06], 0x455a64, 'z');
    cylinder(parent, 0.16, 0.22, [wX + 0.12, wY + 0.24, wZ + side * 0.26], 0x4c6575, 'z');
    ring(parent, 0.19, 0.02, [wX + 0.12, wY + 0.24, wZ + side * 0.35], 0x364854, 'z');
    ring(parent, 0.14, 0.015, [wX + 0.12, wY + 0.44, wZ - side * 0.12], 0xc7542e, 'y');
    cylinder(parent, 0.018, 0.16, [wX + 0.12, wY + 0.36, wZ - side * 0.12], 0x20323d, 'y');

    const spurlingPt = new THREE.Vector3(wX - 0.38, wY + 0.05, wZ);
    cylinder(parent, 0.08, 0.08, [spurlingPt.x, spurlingPt.y, spurlingPt.z], 0x1d2c37);
    const wildcatPt = new THREE.Vector3(wX + 0.12, wY + 0.46, wZ);
    const hawseDeckPt = new THREE.Vector3(16.7, fcHeight(16.7) + 0.04, side * 0.82);
    cylinder(parent, 0.1, 0.06, [hawseDeckPt.x, hawseDeckPt.y, hawseDeckPt.z], 0x1d2c37);
    rawLine(parent, [spurlingPt, wildcatPt, hawseDeckPt], 0x15222b, 0.9);
    for (let c = 0; c <= 8; c++) {
      const pt = wildcatPt.clone().lerp(hawseDeckPt, c / 8);
      cylinder(parent, 0.03, 0.05, [pt.x, pt.y, pt.z], 0x36444e, 'x');
    }

    const hawseHullX = 17.2, hawseHullY = 0.45, hawseHullZ = side * 1.08;
    cylinder(parent, 0.14, 0.1, [hawseHullX, hawseHullY, hawseHullZ], 0x1e2f3b, 'z');
    ring(parent, 0.15, 0.03, [hawseHullX, hawseHullY, hawseHullZ + side * 0.05], 0x15222b, 'z');
    const shankTop = new THREE.Vector3(hawseHullX, hawseHullY, hawseHullZ + side * 0.06);
    const shankBottom = shankTop.clone().add(new THREE.Vector3(-0.06, -0.42, side * 0.04));
    strut(parent, shankTop, shankBottom, 0.035, 0x1b2832);
    box(parent, [0.12, 0.08, 0.32], [shankBottom.x, shankBottom.y, shankBottom.z], 0x1b2832);
    for (const dz of [-0.14, 0.14]) {
      const flukeBase = new THREE.Vector3(shankBottom.x, shankBottom.y, shankBottom.z + dz);
      const flukeTip = flukeBase.clone().add(new THREE.Vector3(0.08, 0.28, 0));
      strut(parent, flukeBase, flukeTip, 0.03, 0x1b2832);
    }
  }

  // 6. Double Bitt Mooring Bollards
  for (const side of [-1, 1]) {
    for (const x of [14.6, 16.3, 17.8]) {
      const y = fcHeight(x) + 0.01;
      const z = side * (Math.max(0.04, halfBeamAt(x, y)) - 0.22);
      box(parent, [0.24, 0.03, 0.14], [x, y + 0.015, z], 0x223440);
      for (const dx of [-0.07, 0.07]) {
        cylinder(parent, 0.038, 0.16, [x + dx, y + 0.09, z], 0x5a7585, 'y');
        cylinder(parent, 0.046, 0.02, [x + dx, y + 0.17, z], 0x364a57, 'y');
      }
      cylinder(parent, 0.016, 0.26, [x, y + 0.11, z], 0x5a7585, 'x');
    }
  }

  // 7. Jackstaff & Forward Navigation Light
  const jsX = 18.64, jsY = fcHeight(jsX), jsTopY = jsY + 0.88;
  cylinder(parent, 0.018, 0.88, [jsX, jsY + 0.44, 0], 0x8faab8, 'y');
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  lantern.position.set(jsX, jsTopY, 0);
  parent.add(lantern);
  rawLine(parent, [new THREE.Vector3(jsX, jsTopY, 0), new THREE.Vector3(18.2, fcHeight(18.2) + bwHeight, -0.22)], 0x6e8e9e, 0.5);
  rawLine(parent, [new THREE.Vector3(jsX, jsTopY, 0), new THREE.Vector3(18.2, fcHeight(18.2) + bwHeight, 0.22)], 0x6e8e9e, 0.5);
}

/** Athwartships bow thruster tunnel through the hull with collar rings and debris grates */
function createBowThrusterTunnel(parent: THREE.Group) {
  const tX = 14.1, tY = -2.55;
  const halfB = halfBeamAt(tX, tY);
  const radius = 0.52;
  cylinder(parent, radius, halfB * 2 + 0.06, [tX, tY, 0], 0x183344, 'z');
  for (const side of [-1, 1]) {
    const z = side * halfB;
    ring(parent, radius, 0.045, [tX, tY, z], 0x142735, 'z');
    for (const dx of [-0.26, 0, 0.26]) {
      const barLen = Math.sqrt(Math.max(0.04, radius * radius - dx * dx)) * 2 - 0.04;
      cylinder(parent, 0.018, barLen, [tX + dx, tY, z], 0x365061, 'y');
    }
  }
}

export function createVessel(): THREE.Group {
  const ship = new THREE.Group();
  const xs = hullXs();
  // Underwater body (including flat bottom) and topsides bands above the waterline.
  ship.add(new THREE.Mesh(strip(xs, x => hullLoop(x, WATER_INDEX, 0)), hullMaterial(HULL.under, .3)));
  for (const side of [-1, 1]) ship.add(new THREE.Mesh(strip(xs, x => hullSide(x, side)), hullMaterial(HULL.top, .26)));
  deck(ship, SHIP.mainDeck, 0.045);
  // Waterline stripe round the whole hull.
  const waterline = [...xs.map(x => hullPoint(x, SHIP.waterline, -1)), ...[...xs].reverse().map(x => hullPoint(x, SHIP.waterline, 1))];
  waterline.push(waterline[0].clone()); rawLine(ship, waterline, HULL.waterline, .85);
  // Shaped transom, hull frames, and longitudinal stringers.
  const transom = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(hullLoop(hullStart).map(p => new THREE.Vector2(p.z, p.y)))), hullMaterial(HULL.top, .3));
  transom.geometry.rotateY(-Math.PI / 2); transom.position.x = hullStart; ship.add(transom);
  for(let x = -16; x < 17; x += 1.6) line(ship, hullLoop(x), 0x73a7b7, 0.22);
  for(const y of [-2.0, -0.6]) for(const side of [-1, 1]) line(ship, xs.filter(x => keelAt(x) <= y).map(x => new THREE.Vector3(x, y, side * halfBeamAt(x, y))), 0x548da1, 0.3);
  // Machinery floor, upper switchgear platforms and separated compartments.
  box(ship, [12.8, .035, 4.65], [-8.4, -1.76, 0], 0x547487, 0.08);
  box(ship, [6.65, .035, 2.1], [-6.85, -.33, -.3], 0x6b9baf, 0.07);
  for(const x of [-14.5, -3, 11]){
    box(ship, [.035, 2.45, halfBeamAt(x, -1.5) * 2], [x, -.37, 0], 0x8badb9, 0.035);
    line(ship, [new THREE.Vector3(x, -1.65, -2.1), new THREE.Vector3(x, .75, -2.1), new THREE.Vector3(x, .75, 2.1), new THREE.Vector3(x, -1.65, 2.1)], 0x75aeb5, 0.28);
  }
  // Cargo deck sheer bulwark coaming and railings (height 1.22 above waterline -1.25)
  for(const side of [-1, 1]){
    const coamPts: THREE.Vector3[] = [];
    for(let x = -13.5; x <= 12.6; x += 0.4) coamPts.push(new THREE.Vector3(x, 1.22, side * Math.max(.04, halfBeamAt(x, .90) - .04)));
    rawLine(ship, coamPts, 0x2a4657, 0.7);
    for(const y of [1.06, 1.22]) line(ship, hullXs().filter(x => x <= 12.6).map(x => new THREE.Vector3(x, y, side * Math.max(.02, halfBeamAt(x) - .08))), 0xa1c6cf, .45);
    for(let x = -17; x < 12.6; x += .9) line(ship, [new THREE.Vector3(x, .9, side * Math.max(.02, halfBeamAt(x) - .08)), new THREE.Vector3(x, 1.22, side * Math.max(.02, halfBeamAt(x) - .08))], 0x91b9c3, .45);
  }
  // Aft accommodation block, deck divisions, bridge wings, windows and exterior ladders.
  box(ship, [6.2, 3.1, 5.3], [-10.4, 2.45, 0], 0xa7d4de, .055);
  outlineBox(ship, [6.2, 3.1, 5.3], [-10.4, 2.45, 0], 0x92c9d5, .37);
  for(const y of [.98, 2.12, 3.3, 4.02]){
    box(ship, [6.3, .06, 5.42], [-10.4, y, 0], 0x92becb, .10);
    outlineBox(ship, [6.3, .06, 5.42], [-10.4, y, 0], 0x83bdca, .35);
  }
  box(ship, [2.4, .73, 6.1], [-8.55, 3.77, 0], 0x99d9e2, .07);
  outlineBox(ship, [2.4, .73, 6.1], [-8.55, 3.77, 0], 0xacdce4, .45);
  for(let z = -2.65; z <= 2.65; z += .55) box(ship, [.035, .30, .42], [-7.32, 3.87, z], 0x397d9d, .52);
  for(const side of [-1, 1]) for(const y of [1.5, 2.65, 3.7]) for(let x = -12.6; x < -8.0; x += .75){
    box(ship, [.43, .23, .025], [x, y, side * 2.665], 0x72a8bf, .33);
  }
  for(const z of [-2.72, 2.72]){
    line(ship, [new THREE.Vector3(-12.9, 1, z), new THREE.Vector3(-12.9, 4.15, z)], 0xb0ced5, .6);
    line(ship, [new THREE.Vector3(-12.65, 1, z), new THREE.Vector3(-12.65, 4.15, z)], 0xb0ced5, .6);
    for(let y = 1.05; y < 4.1; y += .18) line(ship, [new THREE.Vector3(-12.9, y, z), new THREE.Vector3(-12.65, y, z)], 0xb0ced5, .6);
  }
  box(ship, [1.45, 1.22, 1.15], [-12.2, 4.45, .7], 0x547e90, .28);
  for(let x = -12.65; x < -11.6; x += .29) cylinder(ship, .09, .28, [x, 5.18, .7], 0x446477);
  cylinder(ship, .035, 1.9, [-8.7, 4.98, 0], 0xa9d1db);
  box(ship, [1.3, .09, .13], [-8.7, 5.45, 0], 0xb6d8dd, .8);
  cylinder(ship, .16, .10, [-8.7, 5.91, 0], 0xc5e1e6);
  // Rudder blade aft of propeller
  box(ship, [.38, 1.3, .10], [-18.45, -1.45, 0], 0x7b9ead, .55);
  // High-fidelity bow assemblies:
  createBulbousBow(ship);
  createForecastle(ship);
  createBowThrusterTunnel(ship);
  cargo(ship);
  return ship;
}

function propeller(): THREE.Group {
  const group = new THREE.Group();
  const rotor = new THREE.Group(); rotor.userData.spinProp = true;
  cylinder(rotor, .14, .47, [0, 0, 0], 0xc7aa72, 'x');
  const shape = new THREE.Shape(); shape.moveTo(.04, .09); shape.bezierCurveTo(.32, .08, .53, .43, .36, .65); shape.bezierCurveTo(.19, .77, .05, .53, .04, .09);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: .045, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 2, steps: 1 }); blade.rotateY(Math.PI / 2);
  for(let i = 0; i < 5; i++){ const mesh = new THREE.Mesh(blade, material(0xc5a66a)); mesh.rotation.x = i * Math.PI * 2 / 5; rotor.add(mesh); }
  group.add(rotor);
  return group;
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
  if(e.kind==='propeller')return propeller();
  if(e.id==='crane'){craneModel(g);return g;}
  if(e.id==='reeferUnit'){reeferContainer(g);return g;}
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
  if(placement.space!=='external'&&placement.space!=='cargo'){
    const base=box(root,[Math.min(placement.size[0]+.09,2.2),.035,placement.size[2]+.07],[0,-.025,0],0x375b70,.7);base.userData.foundation=true;
  }
  root.traverse(o=>{if(o instanceof THREE.Mesh)o.userData.eqId=e.id;});
  return root;
}
