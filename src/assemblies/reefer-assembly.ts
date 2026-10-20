import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from '../vessel/assets';

export interface ReeferComponentMeta {
  name: string;
  category: 'Enclosure' | 'IncomingFeeder' | 'OutletProtection' | 'ReeferSockets' | 'CableRoute' | 'EarthTerminal';
  explodeOffset: THREE.Vector3;
  description: string;
}

export const REEFER_DESCRIPTIONS: Record<string, string> = {
  Reefer_Distribution_Cabinet: 'Heavy marine-grade steel enclosure housing 440 V distribution, protection, and socket panels.',
  Cabinet_Door_Trim: 'Gasketed watertight access door framing the reefer breaker and socket modules.',
  Cabinet_Handle: 'Heavy-duty marine lever latch for secured enclosure access during maintenance.',
  Incoming_Feeder: 'Main 440 V three-phase supply terminal block fed directly from the LV distribution board.',
  Outlet_Protection: 'Group circuit breaker panel providing overcurrent and short-circuit protection for reefer feeds.',
  Protection_Switch: 'Individual thermal-magnetic molded case circuit breaker (MCCB) isolating a container circuit.',
  Protection_Reset: 'Emergency trip test and manual reset actuator for individual container socket circuit.',
  Reefer_Sockets: 'Heavy cast industrial marine faceplate housing four 32 A / 440 V CEE-standard refrigerated container receptacles.',
  Socket_Ring: 'Watertight brass locking screw ring with captive cover sealing disconnected sockets to IP67.',
  Socket_Plug: 'Flame-retardant 4-pin 32 A 440 V 3P+E power socket insert with self-cleaning contacts.',
  Socket_Label: 'High-visibility engraved 440 V 60 Hz warning nameplate identifying the container bay feed.',
  Deck_Cable_Route: 'Ventilated deck transit and cable trunking guiding heavy armored power cables down to deck level.',
  Vent_Slat: 'Marine louvered vent slat providing internal convective cooling for high-current terminal connections.',
  Earth_Terminal_Bar: 'Solid electrolytic copper busbar providing low-impedance equipotential hull grounding.',
  Earth_Insulator: 'High-dielectric ceramic standoff insulator isolating the earth bar from stray electrolytic currents.'
};

export function getReeferExplodeOffset(name: string): THREE.Vector3 {
  const v = new THREE.Vector3();
  if (name === 'Reefer_Distribution_Cabinet') {
    return v.set(0, 0, 0);
  }
  if (name.includes('Cabinet_Door') || name.includes('Cabinet_Handle')) {
    return v.set(0, 0, 0.4);
  }
  if (name === 'Incoming_Feeder') {
    return v.set(-0.9, 0.5, 1.4);
  }
  if (name === 'Outlet_Protection') {
    return v.set(0.8, 0.5, 1.4);
  }
  if (name.startsWith('Protection_Switch')) {
    return v.set(0.8, 0.5, 1.8);
  }
  if (name.startsWith('Protection_Reset')) {
    return v.set(0.8, 0.5, 1.95);
  }
  if (name === 'Reefer_Sockets') {
    return v.set(0, -0.3, 1.5);
  }
  if (name.startsWith('Socket_Ring')) {
    return v.set(0, -0.3, 1.9);
  }
  if (name.startsWith('Socket_Plug')) {
    return v.set(0, -0.3, 2.2);
  }
  if (name.startsWith('Socket_Label')) {
    return v.set(0, -0.3, 1.8);
  }
  if (name === 'Deck_Cable_Route') {
    return v.set(0.8, -0.9, 1.2);
  }
  if (name.startsWith('Vent_Slat')) {
    return v.set(0.8, -0.9, 1.6);
  }
  if (name === 'Earth_Terminal_Bar') {
    return v.set(-0.9, -0.9, 1.2);
  }
  if (name.startsWith('Earth_Insulator')) {
    return v.set(-0.9, -0.9, 0.8);
  }
  return v.set(0, 0, 1.2);
}

export function getReeferCategory(name: string): ReeferComponentMeta['category'] {
  if (name.includes('Cabinet')) return 'Enclosure';
  if (name.includes('Feeder')) return 'IncomingFeeder';
  if (name.includes('Protection')) return 'OutletProtection';
  if (name.includes('Socket')) return 'ReeferSockets';
  if (name.includes('Cable') || name.includes('Vent')) return 'CableRoute';
  return 'EarthTerminal';
}

export function getReeferDescription(name: string): string {
  for (const [key, desc] of Object.entries(REEFER_DESCRIPTIONS)) {
    if (name.startsWith(key)) return desc;
  }
  return 'Component of the marine reefer container distribution panel.';
}

interface AnimatedReeferMesh {
  mesh: THREE.Mesh;
  name: string;
  category: ReeferComponentMeta['category'];
  originalPos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

interface ReeferInstance {
  equipmentId: string;
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  proxyMesh?: THREE.Mesh;
  animatedParts: AnimatedReeferMesh[];
}

/**
 * Controller for the 3D explodable Marine Reefer Distribution Panel.
 * Conforms to the blender-threejs-hybrid-modeler pattern:
 *  - Headless Blender GLB loading
 *  - Synchronous collision proxy geometry for layout verification
 *  - Multi-axis exploded view with smooth lerp interpolation
 *  - Component inspection and specification metadata
 */
export class ReeferExplodedAssembly {
  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;
  public isLoaded: boolean = false;

  private masterScene: THREE.Group | null = null;
  private instances: Map<string, ReeferInstance> = new Map();
  private pendingRequests: {
    equipmentId: string;
    targetSize: [number, number, number];
    rootGroup: THREE.Group;
    contentGroup: THREE.Group;
  }[] = [];

  constructor(url = '/reefer_distribution.glb') {
    if (typeof window !== 'undefined') {
      this.loadModel(url).catch((err) => {
        console.warn('ReeferExplodedAssembly: initial load deferred or failed:', err);
      });
    }
  }

  public async loadModel(url = '/reefer_distribution.glb'): Promise<void> {
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
      console.warn(`Failed to load reefer model from ${cleanUrl}, retrying with fallback:`, err);
      try {
        const altUrl = resolvePublicAsset('/marine_reefer.glb');
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
        console.error('All reefer GLB load attempts failed:', err2);
      }
    }
  }

  public createEquipmentGroup(equipmentId: string, targetSize: [number, number, number]): THREE.Group {
    const rootGroup = new THREE.Group();
    rootGroup.name = `reefer_root_${equipmentId}`;

    const contentGroup = new THREE.Group();
    contentGroup.name = `reefer_content_${equipmentId}`;
    rootGroup.add(contentGroup);

    // 1. Synchronous collision proxy geometry sized to placement.size
    const proxyGeom = new THREE.BoxGeometry(targetSize[0], targetSize[1], targetSize[2]);
    const proxyMat = new THREE.MeshStandardMaterial({
      color: 0x4f8e9b,
      roughness: 0.5,
      metalness: 0.5,
      transparent: true,
      opacity: 0.0 // invisible once model loads, provides synchronous layout bounds
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

    const animatedParts: AnimatedReeferMesh[] = [];

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

      contentGroup.add(mesh);

      const offset = getReeferExplodeOffset(mesh.name);
      animatedParts.push({
        mesh,
        name: mesh.name,
        category: getReeferCategory(mesh.name),
        originalPos: mesh.position.clone(),
        explodeOffset: offset
      });
    }

    // Remove proxy mesh once full model is attached
    if (proxyMesh && proxyMesh.parent) {
      proxyMesh.parent.remove(proxyMesh);
      proxyMesh.geometry.dispose();
    }

    this.instances.set(equipmentId, {
      equipmentId,
      rootGroup,
      contentGroup,
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

  private applyExplosionToInstance(instance: ReeferInstance, factor: number): void {
    const dest = new THREE.Vector3();
    for (const part of instance.animatedParts) {
      dest.copy(part.originalPos).addScaledVector(part.explodeOffset, factor);
      part.mesh.position.copy(dest);
    }
  }
}

export const reeferAssembly = new ReeferExplodedAssembly();
