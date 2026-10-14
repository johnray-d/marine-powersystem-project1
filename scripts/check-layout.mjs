import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { equipment } = await server.ssrLoadModule('/src/network.ts');
  const { vesselLayout, SHIP, CARGO, halfBeamAt } = await server.ssrLoadModule('/src/vessel-layout.ts');
  const { createVesselEquipment } = await server.ssrLoadModule('/src/vessel.ts');
  const bounds = [];
  for (const item of equipment) {
    const placement = vesselLayout[item.id];
    assert(placement, `Missing vessel placement: ${item.id}`);
    const model = createVesselEquipment(item);
    const box = new THREE.Box3().setFromObject(model);
    const tolerance = .015;
    if (placement.space === 'external') {
      assert.equal(item.id, 'prop', 'Only the main propeller is external equipment');
      continue;
    }
    if (placement.space === 'hull') {
      assert(box.min.y >= SHIP.keel, `${item.id}: below keel`);
      assert(box.max.y <= SHIP.mainDeck, `${item.id}: above main deck`);
    }
    if (placement.space === 'house') {
      assert(box.min.x >= SHIP.house.minX && box.max.x <= SHIP.house.maxX, `${item.id}: outside accommodation length`);
      assert(box.min.z >= -SHIP.house.halfWidth && box.max.z <= SHIP.house.halfWidth, `${item.id}: outside accommodation width`);
      assert(box.min.y >= SHIP.mainDeck && box.max.y <= SHIP.house.roof, `${item.id}: outside accommodation height`);
    } else if (placement.space === 'cargo') {
      const halfWidth = (CARGO.rows - 1) * CARGO.rowPitch / 2 + CARGO.width / 2;
      const bayMin = Math.min(...CARGO.bays) - CARGO.length / 2;
      const bayMax = Math.max(...CARGO.bays) + CARGO.length / 2;
      assert(box.min.x >= bayMin - tolerance && box.max.x <= bayMax + tolerance, `${item.id}: outside cargo bays length`);
      assert(box.min.z >= -halfWidth - tolerance && box.max.z <= halfWidth + tolerance, `${item.id}: outside cargo bay width`);
      assert(box.min.y >= SHIP.mainDeck - tolerance, `${item.id}: below main deck`);
    } else {
      for (const x of [box.min.x, box.max.x]) {
        const halfBeam = halfBeamAt(x, Math.min(SHIP.mainDeck, box.min.y));
        assert(Math.max(Math.abs(box.min.z), Math.abs(box.max.z)) <= halfBeam + tolerance, `${item.id}: protrudes through hull at x=${x.toFixed(2)}`);
      }
    }
    if (placement.space === 'deck') {
      const halfWidth = (CARGO.rows - 1) * CARGO.rowPitch / 2 + CARGO.width / 2;
      for (const x of CARGO.bays) {
        const cargo = new THREE.Box3(new THREE.Vector3(x-CARGO.length/2,1.02,-halfWidth),new THREE.Vector3(x+CARGO.length/2,3.1,halfWidth));
        assert(!box.intersectsBox(cargo), `${item.id}: intersects a container stack`);
      }
    }
    bounds.push({ id: item.id, box });
  }
  // The propeller shaft runs from the motor to the propeller along the centreline; nothing else may sit in its path.
  const shaftEnd = id => { const model = createVesselEquipment(equipment.find(e => e.id === id)); const point = model.position.clone(); point.y += model.userData.height * (id === 'motor' ? .45 : .5); return point; };
  const shaftBox = new THREE.Box3().setFromPoints([shaftEnd('motor'), shaftEnd('prop')]).expandByScalar(.06);
  for (const { id, box } of bounds) if (id !== 'motor') assert(!box.intersectsBox(shaftBox), `${id}: intersects the propeller shaft`);
  for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
    const overlap = bounds[i].box.clone().intersect(bounds[j].box).getSize(new THREE.Vector3());
    assert(!(overlap.x > .025 && overlap.y > .025 && overlap.z > .025), `${bounds[i].id} overlaps ${bounds[j].id}`);
  }
  console.log(`Layout passed: ${equipment.length} equipment models checked; all internal equipment fits its space and no equipment overlaps.`);
} finally {
  await server.close();
}
