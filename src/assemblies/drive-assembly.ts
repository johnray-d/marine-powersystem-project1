import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from '../vessel/assets';

export interface DriveComponentMeta {
  name: string;
  category: 'Cabinet' | 'Input' | 'DCLink' | 'Inverter' | 'Cooling' | 'Control' | 'Output';
  explodeOffset: THREE.Vector3;
  description: string;
}

export const DRIVE_SUBSYSTEM_OFFSETS: Record<string, THREE.Vector3> = {
  '01': new THREE.Vector3(0, 0, 0),        // Enclosure & frame stays anchored
  '02': new THREE.Vector3(-1.4, 0, 0.65),  // Input stage moves left & forward
  '03': new THREE.Vector3(-0.5, 0.3, 1.25), // DC link moves forward & slightly up
  '04': new THREE.Vector3(0.4, -0.4, 1.15), // Inverter power modules move right & forward
  '05': new THREE.Vector3(1.2, 0.5, -0.75), // Cooling system moves right & aft
  '06': new THREE.Vector3(1.5, 0.4, 0.95),  // Control rack moves right & forward
  '07': new THREE.Vector3(0.7, -0.5, 1.2)   // Motor output terminals move forward & down
};

interface AnimatedDriveMesh {
  mesh: THREE.Mesh;
  name: string;
  subsystemId: string;
  originalPos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

interface DriveInstance {
  equipmentId: string;
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  proxyMesh?: THREE.Mesh;
  animatedParts: AnimatedDriveMesh[];
  pumpRotors: THREE.Mesh[];
}

/**
 * Controller for the 3D explodable Medium-Voltage Marine Propulsion Drive / Converter.
 * Conforms to the blender-threejs-hybrid-modeler pattern:
 *  - Headless Blender GLB loading
 *  - Synchronous collision proxy geometry for layout verification
 *  - Multi-axis exploded view with smooth lerp interpolation
 *  - Live pump rotation kinematics
 */
export class DriveExplodedAssembly {
  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;
  public isLoaded: boolean = false;

  private masterScene: THREE.Group | null = null;
  private instances: Map<string, DriveInstance> = new Map();
  private pendingRequests: {
    equipmentId: string;
    targetSize: [number, number, number];
    rootGroup: THREE.Group;
    contentGroup: THREE.Group;
  }[] = [];

  constructor(url = '/marine_drive.glb') {
    if (typeof window !== 'undefined') {
      this.loadModel(url).catch((err) => {
        console.warn('DriveExplodedAssembly: initial load deferred or failed:', err);
      });
    }
  }

  public getExplodeOffset(name: string): { offset: THREE.Vector3; subsystemId: string } {
    const match = (name || '').match(/^(0[1-7])_/);
    if (match && DRIVE_SUBSYSTEM_OFFSETS[match[1]]) {
      return {
        offset: DRIVE_SUBSYSTEM_OFFSETS[match[1]].clone(),
        subsystemId: match[1]
      };
    }
    return {
      offset: new THREE.Vector3(0, 0, 0),
      subsystemId: '01'
    };
  }

  public async loadModel(url = '/marine_drive.glb'): Promise<void> {
    const loader = new GLTFLoader();
    const cleanUrl = resolvePublicAsset(url);

    try {
      const gltf = await loader.loadAsync(cleanUrl);
      this.masterScene = gltf.scene;
      this.masterScene.updateMatrixWorld(true);
      this.isLoaded = true;

      for (const req of this.pendingRequests) {
        this.setupInstanceContent(req.equipmentId, req.targetSize, req.rootGroup, req.contentGroup);
      }
      this.pendingRequests = [];

      this.setExplosionFactor(this.targetExplosionFactor);
    } catch (err) {
      console.warn(`Failed to load drive model from ${cleanUrl}, retrying with fallback:`, err);
      if (!cleanUrl.endsWith('marine_drive.glb')) {
        return this.loadModel('marine_drive.glb');
      }
    }
  }

  private setupInstanceContent(
    equipmentId: string,
    targetSize: [number, number, number],
    rootGroup: THREE.Group,
    contentGroup: THREE.Group
  ): void {
    if (!this.masterScene) return;

    const clone = this.masterScene.clone(true);
    clone.updateMatrixWorld(true);

    const rawBox = new THREE.Box3().setFromObject(clone);
    const rawSize = rawBox.getSize(new THREE.Vector3());

    const scale = Math.min(
      targetSize[0] / rawSize.x,
      targetSize[1] / rawSize.y,
      targetSize[2] / rawSize.z
    );
    contentGroup.scale.setScalar(scale);

    const rawCenter = rawBox.getCenter(new THREE.Vector3());
    contentGroup.position.set(-rawCenter.x * scale, -rawBox.min.y * scale, -rawCenter.z * scale);

    const animatedParts: AnimatedDriveMesh[] = [];
    const pumpRotors: THREE.Mesh[] = [];

    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        if (mesh.material) {
          const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          matList.forEach((m) => {
            m.side = THREE.DoubleSide;
            if ('depthWrite' in m) (m as THREE.MeshStandardMaterial).depthWrite = true;
          });
        }

        const originalPos = mesh.position.clone();
        const { offset, subsystemId } = this.getExplodeOffset(mesh.name);

        animatedParts.push({
          mesh,
          name: mesh.name,
          subsystemId,
          originalPos,
          explodeOffset: offset
        });

        if (mesh.name.includes('Cooling_PumpMotor') || mesh.name.includes('Cooling_Pump')) {
          pumpRotors.push(mesh);
        }
      }
    });

    contentGroup.add(clone);

    const instance: DriveInstance = {
      equipmentId,
      rootGroup,
      contentGroup,
      animatedParts,
      pumpRotors
    };

    this.instances.set(equipmentId, instance);

    for (const p of animatedParts) {
      const targetPos = p.originalPos.clone().addScaledVector(p.explodeOffset, this.currentExplosionFactor);
      p.mesh.position.copy(targetPos);
    }
  }

  public createEquipmentGroup(equipmentId: string, targetSize: [number, number, number]): THREE.Group {
    const root = new THREE.Group();
    root.name = `Drive_${equipmentId}`;
    root.userData.eqId = equipmentId;
    root.userData.isDrive = true;

    // 1. Synchronous proxy geometry guaranteeing non-empty bounds for layout verification
    const proxyGeom = new THREE.BoxGeometry(targetSize[0], targetSize[1], targetSize[2]);
    const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
    proxyMesh.position.set(0, targetSize[1] / 2, 0);
    proxyMesh.userData.eqId = equipmentId;
    root.add(proxyMesh);

    // 2. Content group that will hold the scaled GLB
    const contentGroup = new THREE.Group();
    contentGroup.name = `Drive_${equipmentId}_Content`;
    root.add(contentGroup);

    if (this.isLoaded && this.masterScene) {
      this.setupInstanceContent(equipmentId, targetSize, root, contentGroup);
    } else {
      this.pendingRequests.push({
        equipmentId,
        targetSize,
        rootGroup: root,
        contentGroup
      });
    }

    return root;
  }

  public setExplosionFactor(factor: number): void {
    this.targetExplosionFactor = THREE.MathUtils.clamp(factor, 0, 1);
    this.currentExplosionFactor = this.targetExplosionFactor;

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        const targetPos = p.originalPos.clone().addScaledVector(p.explodeOffset, this.currentExplosionFactor);
        p.mesh.position.copy(targetPos);
      }
    });
  }

  public updateExplosion(delta: number): void {
    if (Math.abs(this.currentExplosionFactor - this.targetExplosionFactor) < 0.001) {
      return;
    }
    const lerpSpeed = Math.min(1, delta * 12);
    this.currentExplosionFactor = THREE.MathUtils.lerp(
      this.currentExplosionFactor,
      this.targetExplosionFactor,
      lerpSpeed
    );

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        const targetPos = p.originalPos.clone().addScaledVector(p.explodeOffset, this.targetExplosionFactor);
        p.mesh.position.lerp(targetPos, lerpSpeed);
      }
    });
  }

  public updateRotation(delta: number, rpm = 1800): void {
    const radPerSec = (rpm * 2 * Math.PI) / 60;
    const rotDelta = radPerSec * delta;

    this.instances.forEach((inst) => {
      for (const pump of inst.pumpRotors) {
        pump.rotation.x += rotDelta;
      }
    });
  }
}

export const driveAssembly = new DriveExplodedAssembly();
