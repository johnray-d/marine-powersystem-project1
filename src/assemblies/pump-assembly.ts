import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from '../vessel/assets';

export interface PumpComponentMeta {
  name: string;
  category: 'Skid' | 'Motor' | 'Shaft' | 'Casing' | 'Impeller' | 'Ports' | 'Seal';
  explodeOffset: THREE.Vector3;
  description: string;
}

export const PUMP_DESCRIPTIONS: Record<string, string> = {
  Pump_Skid: 'Fabricated steel baseplate keeping motor and pump aligned.',
  Skid_Bolt: 'Foundation bolt securing the skid to the deck.',
  Motor_Cooling_Fin: 'Cooling fin shedding motor heat to the surrounding air.',
  Motor_Terminal_Box: 'Terminal box where the 440 V feeder cable lands.',
  Motor_End_Cap: 'Non-drive-end cover of the motor.',
  Motor_Body: '440 V induction motor driving the pump.',
  Motor_: '440 V induction motor driving the pump.',
  Shaft_Coupling: 'Coupling transmitting torque and absorbing misalignment.',
  Pump_Shaft: 'Shaft carrying torque from the motor to the impeller.',
  Shaft_Seal: 'Mechanical seal stopping leakage where the shaft exits the casing.',
  Pump_Casing: 'Volute casing converting water velocity into pressure.',
  Casing_Cover: 'Rear cover closing the casing and housing the seal.',
  Impeller_Hub: 'Rotating vaned wheel hub accelerating the water.',
  Impeller_Blade: 'Aerodynamic backward-curved impeller blade imparting kinetic velocity.',
  Impeller_: 'Rotating vaned wheel that accelerates the water.',
  Suction_Port: 'Suction port flange where water enters the pump.',
  Suction_Flange: 'Machined marine bolted flange connection to sea chest or suction line.',
  Discharge_Port: 'Discharge port and volute throat delivering pressurised water.',
  Discharge_Flange: 'High-pressure discharge flange connected to ship distribution main.'
};

export function getPumpDescription(name: string): string {
  for (const [k, desc] of Object.entries(PUMP_DESCRIPTIONS)) {
    if (name.startsWith(k)) return desc;
  }
  return 'Component of the marine centrifugal pump assembly.';
}

export function getPumpExplodeOffset(name: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  if (name.startsWith('Skid_Bolt')) return v.set(0, -0.5, 0);
  if (name.startsWith('Pump_Skid')) return v;
  if (name.startsWith('Motor_Cooling_Fin')) {
    const parts = name.split('_');
    const idx = parseInt(parts[parts.length - 1], 10) || 1;
    return v.set(-1.6 + (idx - 4.5) * 0.14, 0.5, 0);
  }
  if (name === 'Motor_Terminal_Box') return v.set(-1.6, 1.3, 0);
  if (name === 'Motor_End_Cap') return v.set(-2.4, 0.4, 0);
  if (name.startsWith('Motor_')) return v.set(-1.6, 0.4, 0);
  if (name === 'Shaft_Coupling') return v.set(-0.9, 0.5, 0);
  if (name === 'Pump_Shaft') return v.set(-0.3, 1.1, 0);
  if (name === 'Shaft_Seal') return v.set(-0.7, 0.7, 0);
  if (name === 'Casing_Cover') return v.set(-0.4, 0, 0);
  if (name === 'Pump_Casing') return v.set(0.6, 0, 0);
  if (name.startsWith('Impeller_')) return v.set(0.3, 0.5, 1.2);
  if (name === 'Suction_Port') return v.set(1.6, 0, 0);
  if (name === 'Suction_Flange') return v.set(2.0, 0, 0);
  if (name === 'Discharge_Port') return v.set(0.6, 0.9, 0);
  if (name === 'Discharge_Flange') return v.set(0.6, 1.4, 0);
  return v;
}

export function getPumpCategory(name: string): PumpComponentMeta['category'] {
  if (name.startsWith('Pump_Skid') || name.startsWith('Skid_Bolt')) return 'Skid';
  if (name.startsWith('Motor_')) return 'Motor';
  if (name === 'Shaft_Coupling' || name === 'Pump_Shaft') return 'Shaft';
  if (name === 'Shaft_Seal') return 'Seal';
  if (name.startsWith('Pump_Casing') || name.startsWith('Casing_Cover')) return 'Casing';
  if (name.startsWith('Impeller_')) return 'Impeller';
  if (name.startsWith('Suction_') || name.startsWith('Discharge_')) return 'Ports';
  return 'Casing';
}

interface AnimatedPumpMesh {
  mesh: THREE.Mesh;
  name: string;
  category: PumpComponentMeta['category'];
  basePos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
  isRotating: boolean;
}

interface PumpInstance {
  equipmentId: string;
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  rotatingGroup: THREE.Group;
  stationaryGroup: THREE.Group;
  proxyMesh?: THREE.Mesh;
  animatedParts: AnimatedPumpMesh[];
  rpm: number;
}

export class PumpExplodedAssembly {
  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;

  private models: Map<string, THREE.Group> = new Map();
  private instances: Map<string, PumpInstance> = new Map();
  private preloadPromise: Promise<void> | null = null;
  private pendingRequests: {
    equipmentId: string;
    variantKey: string;
    targetSize: [number, number, number];
    rootGroup: THREE.Group;
    contentGroup: THREE.Group;
    proxyMesh?: THREE.Mesh;
  }[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.preloadPromise = this.preloadVariants();
    }
  }

  private async preloadVariants(): Promise<void> {
    const loader = new GLTFLoader();
    const files: [string, string][] = [
      ['cooling', '/marine_cooling_pump.glb'],
      ['fire', '/marine_fire_pump.glb'],
      ['ballast', '/marine_ballast_pump.glb'],
      ['bilge', '/marine_bilge_pump.glb']
    ];

    await Promise.all(
      files.map(async ([key, url]) => {
        try {
          const clean = resolvePublicAsset(url);
          const gltf = await loader.loadAsync(clean);
          gltf.scene.updateMatrixWorld(true);
          this.models.set(key, gltf.scene);
        } catch (err) {
          console.warn(`Pump variant ${key} fallback:`, err);
          try {
            const fallbackUrl = resolvePublicAsset('/marine_pump.glb');
            const gltf = await loader.loadAsync(fallbackUrl);
            gltf.scene.updateMatrixWorld(true);
            this.models.set(key, gltf.scene);
          } catch (err2) {
            console.warn(`Could not load fallback pump model for ${key}:`, err2);
          }
        }
      })
    );

    // Process any pending equipment instance requests
    const pending = [...this.pendingRequests];
    this.pendingRequests = [];
    for (const req of pending) {
      this.setupInstanceContent(
        req.equipmentId,
        req.variantKey,
        req.targetSize,
        req.rootGroup,
        req.contentGroup,
        req.proxyMesh
      );
    }
  }

  public getVariantKey(equipmentId: string): string {
    if (equipmentId === 'fire' || equipmentId === 'eFire') return 'fire';
    if (equipmentId === 'ballast') return 'ballast';
    if (equipmentId === 'bilge') return 'bilge';
    return 'cooling';
  }

  public isRotatingPart(name: string): boolean {
    return /^(Impeller_|Pump_Shaft|Shaft_Coupling)/.test(name);
  }

  public createEquipmentGroup(equipmentId: string, targetSize: [number, number, number]): THREE.Group {
    const rootGroup = new THREE.Group();
    rootGroup.name = `pump_root_${equipmentId}`;

    const contentGroup = new THREE.Group();
    contentGroup.name = `pump_content_${equipmentId}`;
    rootGroup.add(contentGroup);

    // Synchronous collision proxy geometry
    const proxyGeom = new THREE.BoxGeometry(targetSize[0], targetSize[1], targetSize[2]);
    const proxyMat = new THREE.MeshStandardMaterial({
      color: 0x2a5070,
      roughness: 0.5,
      metalness: 0.6,
      transparent: true,
      opacity: 0.0
    });
    const proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
    proxyMesh.position.set(0, targetSize[1] / 2, 0);
    proxyMesh.userData.isProxy = true;
    rootGroup.add(proxyMesh);

    const variantKey = this.getVariantKey(equipmentId);
    if (this.models.has(variantKey)) {
      this.setupInstanceContent(equipmentId, variantKey, targetSize, rootGroup, contentGroup, proxyMesh);
    } else {
      this.pendingRequests.push({
        equipmentId,
        variantKey,
        targetSize,
        rootGroup,
        contentGroup,
        proxyMesh
      });
      if (!this.preloadPromise && typeof window !== 'undefined') {
        this.preloadPromise = this.preloadVariants();
      }
    }

    return rootGroup;
  }

  private setupInstanceContent(
    equipmentId: string,
    variantKey: string,
    targetSize: [number, number, number],
    rootGroup: THREE.Group,
    contentGroup: THREE.Group,
    proxyMesh?: THREE.Mesh
  ): void {
    const template = this.models.get(variantKey) || this.models.get('cooling') || this.models.values().next().value;
    if (!template) return;

    const cloned = template.clone(true);
    cloned.updateMatrixWorld(true);

    const rawBox = new THREE.Box3().setFromObject(cloned);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawCenter = rawBox.getCenter(new THREE.Vector3());

    const scale = Math.min(
      targetSize[0] / (rawSize.x || 1),
      targetSize[1] / (rawSize.y || 1),
      targetSize[2] / (rawSize.z || 1)
    );

    // Center X & Z, and seat baseplate at Y = 0
    contentGroup.scale.setScalar(scale);
    contentGroup.position.set(-rawCenter.x * scale, -rawBox.min.y * scale, -rawCenter.z * scale);

    const AXIS_Y = 0.9; // Blender axis height -> Three.js Y
    const rotatingGroup = new THREE.Group();
    rotatingGroup.name = 'pump_rotating_group';
    rotatingGroup.position.set(0, AXIS_Y, 0);

    const stationaryGroup = new THREE.Group();
    stationaryGroup.name = 'pump_stationary_group';

    contentGroup.add(stationaryGroup);
    contentGroup.add(rotatingGroup);
    contentGroup.updateMatrixWorld(true);

    const animatedParts: AnimatedPumpMesh[] = [];
    const meshes: THREE.Mesh[] = [];
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
    });

    for (const mesh of meshes) {
      mesh.userData.eqId = equipmentId;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material[0].clone();
        } else {
          mesh.material = (mesh.material as THREE.Material).clone();
        }
      }

      const isRot = this.isRotatingPart(mesh.name) || mesh.userData.rotating === true || mesh.userData.rotating === 1;
      if (isRot) {
        mesh.position.y -= AXIS_Y;
        rotatingGroup.add(mesh);
      } else {
        stationaryGroup.add(mesh);
      }

      const off = getPumpExplodeOffset(mesh.name);
      animatedParts.push({
        mesh,
        name: mesh.name,
        category: getPumpCategory(mesh.name),
        basePos: mesh.position.clone(),
        explodeOffset: off,
        isRotating: isRot
      });
    }

    if (proxyMesh && proxyMesh.parent) {
      proxyMesh.parent.remove(proxyMesh);
    }

    this.instances.set(equipmentId, {
      equipmentId,
      rootGroup,
      contentGroup,
      rotatingGroup,
      stationaryGroup,
      proxyMesh,
      animatedParts,
      rpm: 120
    });

    this.applyExplosionToInstance(this.instances.get(equipmentId)!, this.targetExplosionFactor);
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

  public updateRotation(dt: number, livePumps?: Set<string>, rpm: number = 300): void {
    const angularSpeed = (rpm * 2 * Math.PI) / 60; // rad/s
    for (const [id, instance] of this.instances.entries()) {
      const isRunning = !livePumps || livePumps.has(id);
      if (isRunning && instance.rotatingGroup) {
        instance.rotatingGroup.rotation.x += dt * angularSpeed;
      }
      this.applyExplosionToInstance(instance, this.currentExplosionFactor);
    }
  }

  private applyExplosionToInstance(inst: PumpInstance, factor: number): void {
    if (!inst.rotatingGroup) return;
    const inv = inst.rotatingGroup.quaternion.clone().invert();
    for (const part of inst.animatedParts) {
      const off = part.explodeOffset.clone().multiplyScalar(factor);
      if (part.isRotating) {
        off.applyQuaternion(inv);
      }
      part.mesh.position.copy(part.basePos).add(off);
    }
  }
}

export const pumpAssembly = new PumpExplodedAssembly();
