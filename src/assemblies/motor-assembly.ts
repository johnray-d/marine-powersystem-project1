import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from '../vessel/assets';

export interface MotorComponentMeta {
  name: string;
  category: 'Housing' | 'EndBells' | 'Stator' | 'Rotor' | 'Bearings' | 'Terminals' | 'Fan' | 'Mounting';
  explodeOffset: THREE.Vector3;
  description: string;
}

/**
 * Prefix-based fallback descriptions for motor parts.
 */
export const MOTOR_DESCRIPTIONS: Record<string, string> = {
  Motor_Frame: 'Heavy-duty marine cast-iron motor frame with integral cooling jacket and mounting feet.',
  Cooling_Rib: 'Circumferential radial cooling fins maximizing convective heat dissipation into the engine room.',
  End_Bell_Front: 'Machined cast-steel forward end shield housing the DE roller bearing and shaft labyrinth seal.',
  End_Bell_Front_Rim: 'Precision bolted locating flange securing the front end shield to the frame.',
  End_Bell_Rear: 'Aft end shield supporting the NDE deep-groove ball bearing and cooling air intake.',
  End_Bell_Rear_Rim: 'Bolted flange sealing the rear bearing housing against moisture and salt ingress.',
  Stator_Core: 'Low-loss silicon steel laminated magnetic core with semi-closed slots for three-phase windings.',
  Stator_Winding_Coil: 'Vacuum-pressure impregnated (VPI) Class H insulated copper form-wound coils for 6.6 kV operation.',
  Rotor_Core: 'Laminated electrical steel rotor stack with die-cast aluminum/copper short-circuit rotor bars.',
  Rotor_Shaft: 'Forged high-strength alloy steel drive shaft transferring electromagnetic torque to the propeller shaftline.',
  Rotor_Shaft_Aft: 'Aft shaft extension carrying the bi-directional cooling fan and shaft grounding brush ring.',
  Shaft_Output_Taper: 'Precision ground taper and locating shoulder for intermediate shaft rigid coupling.',
  Shaft_Key: 'Hardened parallel drive key transmitting torsional driving shear to the coupling sleeve.',
  Bearing_Front: 'Heavy-duty cylindrical roller bearing accommodating high radial loads and shaft thermal growth.',
  Bearing_Rear: 'Locating deep-groove ball bearing providing precise axial location and vibration dampening.',
  Terminal_Box: 'IP56 marine terminal enclosure with phase segregated standoff insulators and surge arrestors.',
  Terminal_Box_Lid: 'Removable gasketed cover with pressure-relief diaphragm and neoprene moisture seal.',
  Terminal_Gland: 'Armoured cable sealing gland for 3-phase screened propulsion supply cables from the VFD converter.',
  Lifting_Eye: 'Certified forged lifting eyes for shipyard crane rigging, installation, and overhaul.',
  Cooling_Fan_Hub: 'Cast iron hub keyed to the aft shaft driving forced-air ventilation through the frame ribs.',
  Fan_Blade: 'Bi-directional aerodynamic fan blade drawing cool ambient engine room air across the housing.',
  Fan_Guard: 'Welded steel wire mesh guard meeting SOLAS safety standards preventing debris contact.',
  Mounting_Foot: 'Rigid cast base feet with machined shimming surfaces bolted directly to vessel engine bearers.',
  Mounting_Bolt: 'Chockfast-grouted foundation bolt torqued to class requirements for marine shock resistance.',
  Support_Bracket: 'Auxiliary forward pedestal support stabilizing the motor frame against vessel pitching and hogging.'
};

/**
 * Multi-axis explosion vectors for motor components.
 * +X extends forward toward the shaft coupling.
 * -X extends aft toward the cooling fan.
 * +Y extends upward (stator, terminals, lifting eyes).
 * -Y extends downward (rotor core drop, mounting feet & foundation bolts).
 */
export function getMotorExplodeOffset(name: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  if (name === 'Motor_Frame' || name.startsWith('Cooling_Rib')) return v.set(0, 0, 0);
  if (name === 'End_Bell_Front' || name === 'End_Bell_Front_Rim') return v.set(1.7, 0, 0);
  if (name === 'End_Bell_Rear' || name === 'End_Bell_Rear_Rim') return v.set(-1.7, 0, 0);
  if (name === 'Stator_Core') return v.set(0, 1.20, 0);
  if (name.startsWith('Stator_Winding_Coil')) return v.set(0, 1.70, 0);
  if (name === 'Rotor_Core') return v.set(0, -1.15, 0);
  if (name === 'Rotor_Shaft') return v.set(2.20, 0, 0);
  if (name === 'Rotor_Shaft_Aft') return v.set(-2.20, 0, 0);
  if (name === 'Shaft_Output_Taper') return v.set(3.20, 0, 0);
  if (name === 'Shaft_Key') return v.set(2.50, 0.45, 0);
  if (name.startsWith('Bearing_Front')) return v.set(2.0, 0, 0);
  if (name.startsWith('Bearing_Rear')) return v.set(-2.0, 0, 0);
  if (name.startsWith('Terminal_Box_Lid')) return v.set(0, 1.8, 0);
  if (name.startsWith('Terminal_Box')) return v.set(0, 1.4, 0);
  if (name.startsWith('Terminal_Gland')) return v.set(-0.6, 1.4, 0);
  if (name.startsWith('Lifting_Eye')) return v.set(0, 1.6, 0);
  if (name.startsWith('Cooling_Fan_Hub') || name.startsWith('Fan_Blade')) return v.set(-2.5, 0, 0);
  if (name === 'Fan_Guard') return v.set(-3.0, 0, 0);
  if (name.startsWith('Mounting_Foot')) return v.set(0, -0.9, 0);
  if (name.startsWith('Mounting_Bolt')) return v.set(0, -1.3, 0);
  if (name === 'Support_Bracket') return v.set(2.2, -0.7, 0);
  return v.set(0, 0, 0);
}

export function getMotorCategory(name: string): MotorComponentMeta['category'] {
  if (name === 'Motor_Frame' || name.startsWith('Cooling_Rib')) return 'Housing';
  if (name.includes('End_Bell')) return 'EndBells';
  if (name.includes('Stator')) return 'Stator';
  if (name.includes('Bearing')) return 'Bearings';
  if (name.includes('Terminal')) return 'Terminals';
  if (name.includes('Lifting')) return 'Housing';
  if (name.includes('Fan')) return 'Fan';
  if (name.includes('Mounting') || name === 'Support_Bracket') return 'Mounting';
  if (name.includes('Rotor') || name.includes('Shaft')) return 'Rotor';
  return 'Housing';
}

export function getMotorDescription(name: string): string {
  for (const [key, desc] of Object.entries(MOTOR_DESCRIPTIONS)) {
    if (name.startsWith(key)) return desc;
  }
  return 'Component of the 6.6 kV marine electric propulsion motor.';
}

interface AnimatedMotorMesh {
  mesh: THREE.Mesh;
  name: string;
  category: MotorComponentMeta['category'];
  originalPos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

interface MotorInstance {
  equipmentId: string;
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  rotatingGroup: THREE.Group;
  stationaryGroup: THREE.Group;
  proxyMesh?: THREE.Mesh;
  animatedParts: AnimatedMotorMesh[];
}

/**
 * Controller for the 3D explodable Medium-Voltage Marine Electric Propulsion Motor.
 * Conforms to the blender-threejs-hybrid-modeler pattern:
 *  - Headless Blender GLB loading
 *  - Synchronous collision proxy geometry for layout verification
 *  - Multi-axis exploded view with smooth lerp interpolation
 *  - Live rotor, output shaft, and cooling fan kinematics
 */
export class MotorExplodedAssembly {
  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;
  public isLoaded: boolean = false;

  private masterScene: THREE.Group | null = null;
  private instances: Map<string, MotorInstance> = new Map();
  private pendingRequests: {
    equipmentId: string;
    targetSize: [number, number, number];
    rootGroup: THREE.Group;
    contentGroup: THREE.Group;
  }[] = [];

  constructor(url = '/marine_propulsion_motor.glb') {
    if (typeof window !== 'undefined') {
      this.loadModel(url).catch((err) => {
        console.warn('MotorExplodedAssembly: initial load deferred or failed:', err);
      });
    }
  }

  public isRotatingPart(name: string): boolean {
    return (
      name.startsWith('Rotor_Shaft') ||
      name === 'Shaft_Output_Taper' ||
      name === 'Shaft_Key' ||
      name.startsWith('Cooling_Fan_Hub') ||
      name.startsWith('Fan_Blade')
    );
  }

  public async loadModel(url = '/marine_propulsion_motor.glb'): Promise<void> {
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
      console.warn(`Failed to load motor model from ${cleanUrl}, retrying with fallback:`, err);
      try {
        const altUrl = resolvePublicAsset('/marine_motor.glb');
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
        console.error('All motor GLB load attempts failed:', err2);
      }
    }
  }

  public createEquipmentGroup(equipmentId: string, targetSize: [number, number, number]): THREE.Group {
    const rootGroup = new THREE.Group();
    rootGroup.name = `motor_root_${equipmentId}`;

    const contentGroup = new THREE.Group();
    contentGroup.name = `motor_content_${equipmentId}`;
    rootGroup.add(contentGroup);

    // 1. Synchronous collision proxy geometry sized to placement.size
    const proxyGeom = new THREE.BoxGeometry(targetSize[0], targetSize[1], targetSize[2]);
    const proxyMat = new THREE.MeshStandardMaterial({
      color: 0x224466,
      roughness: 0.5,
      metalness: 0.6,
      transparent: true,
      opacity: 0.0 // invisible once model loads, but gives bounds immediately
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

    const animatedParts: AnimatedMotorMesh[] = [];
    const rotatingGroup = new THREE.Group();
    rotatingGroup.name = 'motor_rotating_group';
    const stationaryGroup = new THREE.Group();
    stationaryGroup.name = 'motor_stationary_group';

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

    // Reposition scene so X & Z are centered, and bottom of feet rests at Y = 0
    contentGroup.scale.setScalar(scale);
    contentGroup.position.set(-rawCenter.x * scale, -rawBox.min.y * scale, -rawCenter.z * scale);

    // Separate rotating parts (shaft, taper, key, fan hub & blades) from stationary housing
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

      // Fix material cloning
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material[0].clone();
        } else {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }

      const isRot = this.isRotatingPart(mesh.name) || mesh.userData.rotating === true;
      const targetSubGroup = isRot ? rotatingGroup : stationaryGroup;

      targetSubGroup.add(mesh);

      const offset = getMotorExplodeOffset(mesh.name);
      animatedParts.push({
        mesh,
        name: mesh.name,
        category: getMotorCategory(mesh.name),
        originalPos: mesh.position.clone(),
        explodeOffset: offset
      });
    }

    contentGroup.add(stationaryGroup);
    contentGroup.add(rotatingGroup);

    // Remove proxy mesh once full model is attached
    if (proxyMesh && proxyMesh.parent) {
      proxyMesh.parent.remove(proxyMesh);
      proxyMesh.geometry.dispose();
    }

    this.instances.set(equipmentId, {
      equipmentId,
      rootGroup,
      contentGroup,
      rotatingGroup,
      stationaryGroup,
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

  public updateRotation(dt: number, rpm: number = 250): void {
    const angularSpeed = (rpm * 2 * Math.PI) / 60; // rad/s
    for (const instance of this.instances.values()) {
      if (instance.rotatingGroup) {
        // Rotor shaft in model space extends along +X
        instance.rotatingGroup.rotation.x += dt * angularSpeed;
      }
    }
  }

  private applyExplosionToInstance(instance: MotorInstance, factor: number): void {
    const dest = new THREE.Vector3();
    for (const part of instance.animatedParts) {
      dest.copy(part.originalPos).addScaledVector(part.explodeOffset, factor);
      part.mesh.position.copy(dest);
    }
  }
}

export const motorAssembly = new MotorExplodedAssembly();
