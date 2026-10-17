import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from './assets';

export interface SteeringComponentMeta {
  name: string;
  category: 'Bedplate' | 'RudderStock' | 'HydraulicRams' | 'PowerUnit';
  explodeOffset: THREE.Vector3;
  description: string;
}

export const STEERING_DESCRIPTIONS: Record<string, string> = {
  Steering_Base: 'Heavy cast-iron bedplate and foundation frame bolted directly to the ship aft hull structure.',
  Base_Mount: 'Machined steel foundation block securing the bedplate to hull longitudinal stiffeners.',
  Rudder_Stock: 'High-tensile vertical forged rudder stock transmitting torque directly to the rudder blade.',
  Tiller_Head: 'Reinforced tiller boss keyed to the rudder stock upper taper with hydraulic locking collar.',
  Tiller_Crosshead: 'Double-acting horizontal crosshead connecting the hydraulic ram piston rods to the stock.',
  Hydraulic_Ram_Port: 'Port heavy-duty hydraulic cylinder barrel developing turning torque under 210 bar pressure.',
  Hydraulic_Ram_Starboard: 'Starboard hydraulic cylinder barrel providing balanced opposing turning moment.',
  Ram_Bracket: 'Cast-steel anchoring trunnion bracket securing the hydraulic cylinder to the bedplate.',
  Hydraulic_Piston_Port: 'Hard-chromed alloy steel piston rod transmitting port cylinder thrust to the tiller.',
  Hydraulic_Piston_Starboard: 'Hard-chromed alloy steel piston rod transmitting starboard cylinder thrust to the tiller.',
  Hydraulic_Hose: 'Flexible high-pressure wire-braided hydraulic feed line connecting the pump manifold to rams.',
  Steering_Motor: 'Marine IP56 squirrel-cage induction motor driving the main variable-displacement hydraulic pump.',
  Motor_Terminal: 'Electrical connection terminal box for 440 V three-phase power and control cables.',
  Hydraulic_Pump: 'Variable-displacement axial piston pump with swashplate delivering proportional hydraulic flow.'
};

export function getSteeringExplodeOffset(name: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  if (name === 'Steering_Base' || name.startsWith('Base_Mount') || name.startsWith('Ram_Bracket')) {
    return v.set(0, 0, 0);
  }
  if (name === 'Rudder_Stock') return v.set(0, 2.0, 0);
  if (name.includes('Tiller')) return v.set(0, 1.5, 0);
  if (name === 'Hydraulic_Ram_Port') return v.set(-1.2, 0, 0.5);
  if (name === 'Hydraulic_Ram_Starboard') return v.set(1.2, 0, 0.5);
  if (name === 'Hydraulic_Piston_Port') return v.set(-1.5, 1.0, 0.5);
  if (name === 'Hydraulic_Piston_Starboard') return v.set(1.5, 1.0, 0.5);
  if (name.includes('Hose')) return v.set(0, 1.0, 0.5);
  if (name.includes('Motor') || name.includes('Pump')) return v.set(0, 0.6, 1.2);
  return v.set(0, 0, 0.8);
}

export function getSteeringCategory(name: string): SteeringComponentMeta['category'] {
  if (name === 'Steering_Base' || name.startsWith('Base_Mount')) return 'Bedplate';
  if (name.includes('Rudder') || name.includes('Tiller')) return 'RudderStock';
  if (name.includes('Hydraulic_Ram') || name.includes('Piston') || name.includes('Bracket') || name.includes('Hose')) {
    return 'HydraulicRams';
  }
  return 'PowerUnit';
}

export function getSteeringDescription(name: string): string {
  for (const [key, desc] of Object.entries(STEERING_DESCRIPTIONS)) {
    if (name.startsWith(key)) return desc;
  }
  return 'Component of the marine electro-hydraulic steering gear.';
}

interface AnimatedSteeringMesh {
  mesh: THREE.Mesh;
  name: string;
  category: SteeringComponentMeta['category'];
  originalPos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
  isRotating: boolean;
  isPiston: boolean;
}

interface SteeringInstance {
  equipmentId: string;
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  rotorGroup: THREE.Group;
  fixedGroup: THREE.Group;
  proxyMesh?: THREE.Mesh;
  animatedParts: AnimatedSteeringMesh[];
}

/**
 * Controller for the 3D explodable Electro-Hydraulic Marine Steering Gear.
 * Conforms to the blender-threejs-hybrid-modeler pattern:
 *  - Headless Blender GLB loading
 *  - Synchronous collision proxy geometry for layout verification
 *  - Multi-axis exploded view with smooth lerp interpolation
 *  - Rudder helm angle oscillation (±30°) & linear piston reciprocation
 */
export class SteeringExplodedAssembly {
  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;
  public isLoaded: boolean = false;
  public simTime: number = 0.0;

  private masterScene: THREE.Group | null = null;
  private instances: Map<string, SteeringInstance> = new Map();
  private pendingRequests: {
    equipmentId: string;
    targetSize: [number, number, number];
    rootGroup: THREE.Group;
    contentGroup: THREE.Group;
  }[] = [];

  constructor(url = '/marine_steering_gear.glb') {
    if (typeof window !== 'undefined') {
      this.loadModel(url).catch((err) => {
        console.warn('SteeringExplodedAssembly: initial load deferred or failed:', err);
      });
    }
  }

  public async loadModel(url = '/marine_steering_gear.glb'): Promise<void> {
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
      console.warn(`Failed to load steering model from ${cleanUrl}, retrying with fallback:`, err);
      try {
        const altUrl = resolvePublicAsset('/marine_steering.glb');
        const gltf = await loader.loadAsync(altUrl);
        this.masterScene = gltf.scene;
        this.masterScene.updateMatrixWorld(true);
        this.isLoaded = true;

        for (const req of this.pendingRequests) {
          this.setupInstanceContent(req.equipmentId, req.targetSize, req.rootGroup, req.contentGroup);
        }
        this.pendingRequests = [];
        this.setExplosionFactor(this.targetExplosionFactor);
      } catch (err2) {
        console.error('All steering GLB load attempts failed:', err2);
      }
    }
  }

  public createEquipmentGroup(equipmentId: string, targetSize: [number, number, number]): THREE.Group {
    const rootGroup = new THREE.Group();
    rootGroup.name = `steering_root_${equipmentId}`;

    const contentGroup = new THREE.Group();
    contentGroup.name = `steering_content_${equipmentId}`;
    rootGroup.add(contentGroup);

    // 1. Synchronous collision proxy geometry sized to placement.size
    const proxyGeom = new THREE.BoxGeometry(targetSize[0], targetSize[1], targetSize[2]);
    const proxyMat = new THREE.MeshStandardMaterial({
      color: 0x3d596b,
      roughness: 0.5,
      metalness: 0.6,
      transparent: true,
      opacity: 0.0 // invisible once model loads, gives synchronous layout bounds immediately
    });
    const proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
    proxyMesh.position.set(0, targetSize[1] / 2, 0);
    proxyMesh.userData.isProxy = true;
    rootGroup.add(proxyMesh);

    if (this.masterScene) {
      this.setupInstanceContent(equipmentId, targetSize, rootGroup, contentGroup, proxyMesh);
    } else {
      this.pendingRequests.push({
        equipmentId,
        targetSize,
        rootGroup,
        contentGroup
      });
    }

    return rootGroup;
  }

  private setupInstanceContent(
    equipmentId: string,
    targetSize: [number, number, number],
    rootGroup: THREE.Group,
    contentGroup: THREE.Group,
    proxyMesh?: THREE.Mesh
  ): void {
    if (!this.masterScene) return;

    const clonedScene = this.masterScene.clone(true);
    clonedScene.updateMatrixWorld(true);

    const animatedParts: AnimatedSteeringMesh[] = [];
    const rotorGroup = new THREE.Group();
    rotorGroup.name = 'steering_rotor_group';
    const fixedGroup = new THREE.Group();
    fixedGroup.name = 'steering_fixed_group';

    // Measure raw bounding box from the cloned scene
    const rawBox = new THREE.Box3().setFromObject(clonedScene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawCenter = rawBox.getCenter(new THREE.Vector3());

    // Scale proportionally to fit inside targetSize
    const scale = Math.min(
      targetSize[0] / (rawSize.x || 1),
      targetSize[1] / (rawSize.y || 1),
      targetSize[2] / (rawSize.z || 1)
    );

    // Reposition scene so X & Z are centered, and bottom rests at Y = 0
    contentGroup.scale.setScalar(scale);
    contentGroup.position.set(-rawCenter.x * scale, -rawBox.min.y * scale, -rawCenter.z * scale);

    const meshes: THREE.Mesh[] = [];
    clonedScene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        meshes.push(obj as THREE.Mesh);
      }
    });

    for (const mesh of meshes) {
      mesh.userData.eqId = equipmentId;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Safe material clone
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material[0].clone();
        } else {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }

      const isRotating = Boolean(mesh.userData.rotating) || mesh.name.includes('Tiller') || mesh.name.includes('Rudder_Stock');
      const isPiston = mesh.name.includes('Piston');

      // Tiller & rudder stock attach to rotorGroup; rams, brackets, power unit & pistons attach to fixedGroup
      const targetSubGroup = isRotating ? rotorGroup : fixedGroup;
      targetSubGroup.add(mesh);

      const offset = getSteeringExplodeOffset(mesh.name);
      animatedParts.push({
        mesh,
        name: mesh.name,
        category: getSteeringCategory(mesh.name),
        originalPos: mesh.position.clone(),
        explodeOffset: offset,
        isRotating,
        isPiston
      });
    }

    contentGroup.add(fixedGroup);
    contentGroup.add(rotorGroup);

    // Remove proxy mesh once full model is attached
    if (proxyMesh && proxyMesh.parent) {
      proxyMesh.parent.remove(proxyMesh);
      proxyMesh.geometry.dispose();
    }

    this.instances.set(equipmentId, {
      equipmentId,
      rootGroup,
      contentGroup,
      rotorGroup,
      fixedGroup,
      proxyMesh,
      animatedParts
    });

    this.applyExplosionToInstance(this.instances.get(equipmentId)!, this.currentExplosionFactor);
  }

  public setExplosionFactor(factor: number): void {
    this.targetExplosionFactor = THREE.MathUtils.clamp(factor, 0, 1);
  }

  public updateExplosion(dt: number): void {
    const diff = this.targetExplosionFactor - this.currentExplosionFactor;
    if (Math.abs(diff) > 0.0005) {
      this.currentExplosionFactor += diff * Math.min(1, dt * 7.0);
      for (const instance of this.instances.values()) {
        this.applyExplosionToInstance(instance, this.currentExplosionFactor);
      }
    } else if (this.currentExplosionFactor !== this.targetExplosionFactor) {
      this.currentExplosionFactor = this.targetExplosionFactor;
      for (const instance of this.instances.values()) {
        this.applyExplosionToInstance(instance, this.currentExplosionFactor);
      }
    }
  }

  /**
   * Updates rudder oscillation (±30° helm angle) and reciprocating linear piston actuation.
   */
  public updateKinematics(dt: number, speedMultiplier: number = 1.0): void {
    this.simTime += dt * speedMultiplier;
    const helmAngle = Math.sin(this.simTime * 2.0) * (Math.PI / 6); // ±30 degrees

    for (const instance of this.instances.values()) {
      if (instance.rotorGroup) {
        // Smoothly rotate the tiller arm and rudder stock around the vertical Y axis
        instance.rotorGroup.rotation.y = THREE.MathUtils.lerp(instance.rotorGroup.rotation.y, helmAngle, 0.1);
      }

      // Linear piston stroke actuation
      const dest = new THREE.Vector3();
      for (const part of instance.animatedParts) {
        if (part.isPiston) {
          const phase = part.name.includes('Port') ? 1 : -1;
          const pistonX = part.originalPos.x + (phase * Math.sin(this.simTime * 2.0) * 0.15);
          dest.set(pistonX, part.originalPos.y, part.originalPos.z).addScaledVector(part.explodeOffset, this.currentExplosionFactor);
          part.mesh.position.copy(dest);
        }
      }
    }
  }

  private applyExplosionToInstance(instance: SteeringInstance, factor: number): void {
    const dest = new THREE.Vector3();
    for (const part of instance.animatedParts) {
      if (part.isPiston) {
        const phase = part.name.includes('Port') ? 1 : -1;
        const pistonX = part.originalPos.x + (phase * Math.sin(this.simTime * 2.0) * 0.15);
        dest.set(pistonX, part.originalPos.y, part.originalPos.z).addScaledVector(part.explodeOffset, factor);
      } else {
        dest.copy(part.originalPos).addScaledVector(part.explodeOffset, factor);
      }
      part.mesh.position.copy(dest);
    }
  }
}

export const steeringAssembly = new SteeringExplodedAssembly();
