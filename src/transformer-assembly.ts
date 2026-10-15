import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from './assets';

export interface TransformerComponentMeta {
  name: string;
  category: 'Core' | 'Windings' | 'Insulation' | 'Bushings' | 'Enclosure' | 'Cooling' | 'Busbars' | 'Structure';
  explodeOffset: THREE.Vector3; // Vector direction and distance at 100% explosion
  description: string;
}

/**
 * Explosion mapping registry defining exploded displacement offsets for all 
 * 6.6 kV / 440 V marine distribution transformer sub-assemblies.
 * 
 * Orientation in Three.js (glTF with export_yup=True):
 *  - +Y: Top (Roof lid, bushings, lifting eyes)
 *  - -Y: Bottom (Base skid, foundation mounting feet)
 *  - -Z: Forward (Front access door, inspection window, cable glands)
 *  - +Z: Aft/Back (Rear tank wall, cooling baffles)
 *  - -X: Port (Port radiator fin bank, forced cooling fans)
 *  - +X: Starboard (Starboard radiator fin bank, forced cooling fans)
 */
export const TRANSFORMER_EXPLOSION_MAP: Record<string, TransformerComponentMeta> = {
  // --- Top Lid, Lifting Lugs & Enclosure Roof (+Y upward explosion) ---
  Transformer_Tank_Lid: {
    name: 'Top Enclosure Tank Lid',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0.70, 0),
    description: 'Marine IP23/IP44 drip-proof steel top cover with neoprene sealing gaskets and bushing penetrations.'
  },
  Transformer_Casing_Top_Rim_Aft: {
    name: 'Top Tank Flange Rim Aft',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0.48, 0.08),
    description: 'Reinforced perimeter angle iron stiffening the upper enclosure rim.'
  },
  Transformer_Casing_Top_Rim_Fwd: {
    name: 'Top Tank Flange Rim Forward',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0.48, -0.08),
    description: 'Reinforced perimeter angle iron stiffening the upper enclosure rim.'
  },
  Transformer_Casing_Bottom_Pan: {
    name: 'Bottom Enclosure Drip Pan',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, -0.10, 0),
    description: 'Internal heavy gauge steel base plate preventing ingress of bilge moisture and dirt.'
  },
  Transformer_Casing_Back_Wall: {
    name: 'Rear Enclosure Panel',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0, 0.65),
    description: 'Solid heavy gauge steel enclosure back wall shielding against machinery space air turbulence.'
  },

  // --- Front Access Door, Decals, Window & Cable Gland Array (-Z forward explosion) ---
  Transformer_Front_Access_Door: {
    name: 'Front Inspection & Access Door',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0, -0.68),
    description: 'Hinged and bolted front service panel allowing full visual inspection of windings and core clamps.'
  },
  Transformer_Inspection_Window_Frame: {
    name: 'Inspection Window Frame',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0, -0.74),
    description: 'Milled steel retaining bezel securing the wire-reinforced inspection window.'
  },
  Transformer_Inspection_Window_Grille: {
    name: 'Inspection Window Wire Grille',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0, -0.77),
    description: 'Protective stainless steel expanded metal screen for arc flash and debris containment.'
  },
  Transformer_Hazard_Warning_Decal: {
    name: 'High Voltage Warning Triangle',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, 0, -0.80),
    description: 'Standard maritime ISO safety placard indicating 6,600 V lethal potential.'
  },
  Transformer_Cable_Gland_Box: {
    name: 'Marine Cable Gland Enclosure',
    category: 'Enclosure',
    explodeOffset: new THREE.Vector3(0, -0.12, -0.60),
    description: 'Flameproof bottom cable termination chamber isolating incoming 6.6 kV and outgoing 440 V feeders.'
  },

  // --- Primary 6.6 kV Bushings & Terminals (Explode +Y upward hovering over lid) ---
  Transformer_HV_Bushing_Flange_A: {
    name: 'Phase A 6.6 kV Bushing Flange',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 0.92, 0),
    description: 'Sealing mounting flange bolting Phase A bushing to the tank lid.'
  },
  Transformer_HV_Bushing_Flange_B: {
    name: 'Phase B 6.6 kV Bushing Flange',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 0.92, 0),
    description: 'Sealing mounting flange bolting Phase B bushing to the tank lid.'
  },
  Transformer_HV_Bushing_Flange_C: {
    name: 'Phase C 6.6 kV Bushing Flange',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 0.92, 0),
    description: 'Sealing mounting flange bolting Phase C bushing to the tank lid.'
  },
  Transformer_HV_Terminal_A: {
    name: 'Phase A 6.6 kV Terminal Stud',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 1.25, 0),
    description: 'Machined brass stud connecting incoming high voltage marine cable to the primary winding.'
  },
  Transformer_HV_Terminal_B: {
    name: 'Phase B 6.6 kV Terminal Stud',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 1.25, 0),
    description: 'Machined brass stud connecting incoming high voltage marine cable to the primary winding.'
  },
  Transformer_HV_Terminal_C: {
    name: 'Phase C 6.6 kV Terminal Stud',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 1.25, 0),
    description: 'Machined brass stud connecting incoming high voltage marine cable to the primary winding.'
  },
  Transformer_Neutral_Bushing: {
    name: 'Low-Voltage Neutral Ground Bushing',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 1.05, 0),
    description: 'Glazed porcelain insulator for secondary star-point neutral grounding.'
  },
  Transformer_Neutral_Terminal: {
    name: 'Neutral Ground Terminal Stud',
    category: 'Bushings',
    explodeOffset: new THREE.Vector3(0, 1.20, 0),
    description: 'Solid brass terminal lug connecting neutral busbar to ship hull earthing resistor.'
  },

  // --- Magnetic Core, Clamps & Lifting Eyes ---
  Transformer_Core_Top_Yoke: {
    name: 'Upper Laminated Magnetic Core Yoke',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0.28, 0),
    description: 'High-permeability cold-rolled grain-oriented (CRGO) silicon steel lamination stack.'
  },
  Transformer_Core_Bottom_Yoke: {
    name: 'Lower Laminated Magnetic Core Yoke',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0, 0),
    description: 'Lower horizontal core lamination completing the 3-phase magnetic flux pathway.'
  },
  Transformer_Core_Limb_A: {
    name: 'Core Limb Phase A',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0, 0),
    description: 'Vertical magnetic core column carrying Phase A concentric LV and HV winding coils.'
  },
  Transformer_Core_Limb_B: {
    name: 'Core Limb Phase B',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0, 0),
    description: 'Center magnetic core column carrying Phase B concentric LV and HV winding coils.'
  },
  Transformer_Core_Limb_C: {
    name: 'Core Limb Phase C',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0, 0),
    description: 'Vertical magnetic core column carrying Phase C concentric LV and HV winding coils.'
  },
  Transformer_Core_Clamp_Top: {
    name: 'Upper Core Clamping Channel',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0.38, 0),
    description: 'Rigid steel channel clamping core laminations under high compression to eliminate 100/120 Hz acoustic hum.'
  },
  Transformer_Core_Clamp_Bottom: {
    name: 'Lower Core Clamping Channel',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0, 0),
    description: 'Heavy structural channel transmitting core weight to the marine base skid.'
  },
  Transformer_Core_Lifting_Eye_A: {
    name: 'Core & Coil Lifting Eye Aft',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0.45, 0),
    description: 'Drop-forged steel hoist point for crane lifting of the active core and coil assembly.'
  },
  Transformer_Core_Lifting_Eye_F: {
    name: 'Core & Coil Lifting Eye Forward',
    category: 'Core',
    explodeOffset: new THREE.Vector3(0, 0.45, 0),
    description: 'Drop-forged steel hoist point for crane lifting of the active core and coil assembly.'
  },

  // --- Windings: Concentric Phase A, B, C (HV, Insulation, LV) ---
  // Phase A (-X, slight -Z)
  Transformer_HV_Winding_A: {
    name: 'Phase A Primary 6.6 kV Winding (Resin Cast)',
    category: 'Windings',
    explodeOffset: new THREE.Vector3(-0.28, 0, -0.22),
    description: 'High-voltage vacuum pressure impregnated (VPI) copper coil section with stepped cooling ducts.'
  },
  Transformer_Insulation_Barrier_A: {
    name: 'Phase A Dielectric Nomex Barrier',
    category: 'Insulation',
    explodeOffset: new THREE.Vector3(-0.18, 0, -0.14),
    description: 'High-temperature Class H Nomex/fiberglass barrier tube isolating LV winding from 6.6 kV primary coil.'
  },
  Transformer_LV_Winding_A: {
    name: 'Phase A Secondary 440 V Winding (Copper)',
    category: 'Windings',
    explodeOffset: new THREE.Vector3(-0.08, 0, -0.07),
    description: 'Low-voltage heavy section electrolytic copper foil winding delivering 440 V distribution output.'
  },

  // Phase B (Center, forward -Z)
  Transformer_HV_Winding_B: {
    name: 'Phase B Primary 6.6 kV Winding (Resin Cast)',
    category: 'Windings',
    explodeOffset: new THREE.Vector3(0, 0, -0.32),
    description: 'High-voltage vacuum pressure impregnated (VPI) copper coil section with stepped cooling ducts.'
  },
  Transformer_Insulation_Barrier_B: {
    name: 'Phase B Dielectric Nomex Barrier',
    category: 'Insulation',
    explodeOffset: new THREE.Vector3(0, 0, -0.20),
    description: 'High-temperature Class H Nomex/fiberglass barrier tube isolating LV winding from 6.6 kV primary coil.'
  },
  Transformer_LV_Winding_B: {
    name: 'Phase B Secondary 440 V Winding (Copper)',
    category: 'Windings',
    explodeOffset: new THREE.Vector3(0, 0, -0.10),
    description: 'Low-voltage heavy section electrolytic copper foil winding delivering 440 V distribution output.'
  },

  // Phase C (+X, slight -Z)
  Transformer_HV_Winding_C: {
    name: 'Phase C Primary 6.6 kV Winding (Resin Cast)',
    category: 'Windings',
    explodeOffset: new THREE.Vector3(0.28, 0, -0.22),
    description: 'High-voltage vacuum pressure impregnated (VPI) copper coil section with stepped cooling ducts.'
  },
  Transformer_Insulation_Barrier_C: {
    name: 'Phase C Dielectric Nomex Barrier',
    category: 'Insulation',
    explodeOffset: new THREE.Vector3(0.18, 0, -0.14),
    description: 'High-temperature Class H Nomex/fiberglass barrier tube isolating LV winding from 6.6 kV primary coil.'
  },
  Transformer_LV_Winding_C: {
    name: 'Phase C Secondary 440 V Winding (Copper)',
    category: 'Windings',
    explodeOffset: new THREE.Vector3(0.08, 0, -0.07),
    description: 'Low-voltage heavy section electrolytic copper foil winding delivering 440 V distribution output.'
  },

  // --- Busbars & Tap Changer ---
  Transformer_HV_Busbar_AB: {
    name: 'Primary Delta Interconnect Busbar A-B',
    category: 'Busbars',
    explodeOffset: new THREE.Vector3(0, 0.55, 0.15),
    description: 'Electrolytic copper link completing the 6.6 kV primary delta winding connection.'
  },
  Transformer_HV_Busbar_BC: {
    name: 'Primary Delta Interconnect Busbar B-C',
    category: 'Busbars',
    explodeOffset: new THREE.Vector3(0, 0.55, 0.15),
    description: 'Electrolytic copper link completing the 6.6 kV primary delta winding connection.'
  },
  Transformer_Tap_Changer_Block: {
    name: 'Off-Circuit De-Energized Tap Changer',
    category: 'Busbars',
    explodeOffset: new THREE.Vector3(0, 0.65, 0),
    description: 'Manual rotary tap selection block providing +/- 2.5% and +/- 5% primary voltage ratio regulation.'
  },
  Transformer_LV_Neutral_Bar: {
    name: 'Secondary Neutral Collector Busbar',
    category: 'Busbars',
    explodeOffset: new THREE.Vector3(0, -0.06, 0.15),
    description: 'Solid copper flat bar forming the secondary 440 V star neutral point.'
  },

  // --- Port Radiator & Fans (-X outward explosion) ---
  Transformer_Radiator_Bank_Port: {
    name: 'Port Radiator Header & Baffle',
    category: 'Cooling',
    explodeOffset: new THREE.Vector3(-0.55, 0, 0),
    description: 'Pressed steel cooling panel header ducting ambient engine room air across active elements.'
  },
  Transformer_Fan_Housing_Port_Lower: {
    name: 'Port Lower Cooling Fan Shroud',
    category: 'Cooling',
    explodeOffset: new THREE.Vector3(-0.85, 0, 0),
    description: 'Cast aluminium bell-mouth axial duct directing forced air across the lower coil vents.'
  },
  Transformer_Fan_Housing_Port_Upper: {
    name: 'Port Upper Cooling Fan Shroud',
    category: 'Cooling',
    explodeOffset: new THREE.Vector3(-0.85, 0, 0),
    description: 'Cast aluminium bell-mouth axial duct directing forced air across the upper coil vents.'
  },

  // --- Starboard Radiator & Fans (+X outward explosion) ---
  Transformer_Radiator_Bank_Stbd: {
    name: 'Starboard Radiator Header & Baffle',
    category: 'Cooling',
    explodeOffset: new THREE.Vector3(0.55, 0, 0),
    description: 'Pressed steel cooling panel header ducting ambient engine room air across active elements.'
  },
  Transformer_Fan_Housing_Stbd_Lower: {
    name: 'Starboard Lower Cooling Fan Shroud',
    category: 'Cooling',
    explodeOffset: new THREE.Vector3(0.85, 0, 0),
    description: 'Cast aluminium bell-mouth axial duct directing forced air across the lower coil vents.'
  },
  Transformer_Fan_Housing_Stbd_Upper: {
    name: 'Starboard Upper Cooling Fan Shroud',
    category: 'Cooling',
    explodeOffset: new THREE.Vector3(0.85, 0, 0),
    description: 'Cast aluminium bell-mouth axial duct directing forced air across the upper coil vents.'
  },

  // --- Base Skid & Foundation ---
  Transformer_Base_Skid_Port: {
    name: 'Port Foundation Skid Channel',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0, -0.08, 0),
    description: 'Heavy structural steel channel bolted to the ship double bottom frame.'
  },
  Transformer_Base_Skid_Stbd: {
    name: 'Starboard Foundation Skid Channel',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0, -0.08, 0),
    description: 'Heavy structural steel channel bolted to the ship double bottom frame.'
  },
  Transformer_Base_Crossbeam_Aft: {
    name: 'Aft Base Tie Channel',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0, -0.08, 0),
    description: 'Cross-bracing beam maintaining foundation squareness under vessel pitch and roll.'
  },
  Transformer_Base_Crossbeam_Fwd: {
    name: 'Forward Base Tie Channel',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0, -0.08, 0),
    description: 'Cross-bracing beam maintaining foundation squareness under vessel pitch and roll.'
  },
  Transformer_Earth_Boss: {
    name: 'Hull Protective Earth Lug',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0, -0.08, 0),
    description: 'Machined solid brass bonding stud connecting transformer frame to ship hull potential.'
  }
};

interface FanImpellerGroup {
  fanId: string;
  rotor: THREE.Mesh;
  blades: THREE.Mesh[];
  pivot: THREE.Vector3;
}

interface AnimatedMeshRecord {
  mesh: THREE.Mesh;
  name: string;
  originalPos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

interface TransformerInstance {
  equipmentId: string;
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  proxyMesh?: THREE.Mesh;
  animatedParts: AnimatedMeshRecord[];
  fans: FanImpellerGroup[];
}

/**
 * High-performance 3D explodable Marine 6.6 kV / 440 V Distribution Transformer controller.
 * Manages headless Blender GLB loading, synchronous proxy geometry for collision checking,
 * multi-unit simulator instantiation (txA and txB), cooling fan animations, and smooth exploded views.
 */
export class TransformerExplodedAssembly {
  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;
  public isLoaded: boolean = false;

  private masterScene: THREE.Group | null = null;
  private instances: Map<string, TransformerInstance> = new Map();
  private pendingInstanceRequests: {
    equipmentId: string;
    targetSize: [number, number, number];
    rootGroup: THREE.Group;
    contentGroup: THREE.Group;
  }[] = [];

  constructor(url = '/marine_transformer.glb') {
    if (typeof window !== 'undefined') {
      this.loadModel(url).catch((err) => {
        console.warn('TransformerExplodedAssembly: initial load deferred or failed:', err);
      });
    }
  }

  /**
   * Determine explosion offset vector from the registry or geometric heuristics
   */
  public getExplodeOffset(name: string): THREE.Vector3 {
    if (TRANSFORMER_EXPLOSION_MAP[name]) {
      return TRANSFORMER_EXPLOSION_MAP[name].explodeOffset.clone();
    }

    // Heuristics for stepped bushings and sheds
    if (name.includes('HV_Bushing_Shed_')) {
      return new THREE.Vector3(0, 1.15, 0);
    }
    if (name.includes('Lifting_Lug_')) {
      return new THREE.Vector3(0, 0.70, 0);
    }
    if (name.includes('Anchor_Pad_')) {
      return new THREE.Vector3(0, -0.08, 0);
    }
    if (name.includes('Pillar_')) {
      return new THREE.Vector3(0, 0, 0);
    }
    if (name.includes('Cable_Gland_')) {
      return new THREE.Vector3(0, -0.15, -0.75);
    }
    if (name.includes('Radiator_Fin_P_')) {
      return new THREE.Vector3(-0.65, 0, 0);
    }
    if (name.includes('Radiator_Fin_S_')) {
      return new THREE.Vector3(0.65, 0, 0);
    }
    if (name.includes('Fan_Rotor_Port') || name.includes('Fan_Blade_Port')) {
      return new THREE.Vector3(-0.95, 0, 0);
    }
    if (name.includes('Fan_Rotor_Stbd') || name.includes('Fan_Blade_Stbd')) {
      return new THREE.Vector3(0.95, 0, 0);
    }
    if (name.includes('HV_Disc_A_')) {
      return new THREE.Vector3(-0.28, 0, -0.22);
    }
    if (name.includes('HV_Disc_B_')) {
      return new THREE.Vector3(0, 0, -0.32);
    }
    if (name.includes('HV_Disc_C_')) {
      return new THREE.Vector3(0.28, 0, -0.22);
    }
    if (name.includes('LV_Busbar_Riser_A')) {
      return new THREE.Vector3(-0.08, 0, -0.15);
    }
    if (name.includes('LV_Busbar_Riser_B')) {
      return new THREE.Vector3(0, 0, -0.18);
    }
    if (name.includes('LV_Busbar_Riser_C')) {
      return new THREE.Vector3(0.08, 0, -0.15);
    }
    if (name.includes('Tap_Stud_')) {
      return new THREE.Vector3(0, 0.75, 0);
    }
    if (name.includes('Tie_Rod_')) {
      return new THREE.Vector3(0, 0.20, 0);
    }

    // Default neutral
    return new THREE.Vector3(0, 0, 0);
  }

  /**
   * Asynchronously loads the 3D GLB model and sets up the master template
   */
  public async loadModel(url = '/marine_transformer.glb'): Promise<void> {
    const loader = new GLTFLoader();
    const cleanUrl = resolvePublicAsset(url);

    try {
      const gltf = await loader.loadAsync(cleanUrl);
      this.masterScene = gltf.scene;
      this.masterScene.updateMatrixWorld(true);
      this.isLoaded = true;

      // Populate any pending instances that were requested during synchronous setup
      for (const req of this.pendingInstanceRequests) {
        this.setupInstanceContent(req.equipmentId, req.targetSize, req.rootGroup, req.contentGroup);
      }
      this.pendingInstanceRequests = [];

      this.setExplosionFactor(this.targetExplosionFactor);
    } catch (err) {
      console.warn(`Failed to load transformer model from ${cleanUrl}, will retry with fallback:`, err);
      if (!cleanUrl.endsWith('marine_transformer.glb')) {
        return this.loadModel('marine_transformer.glb');
      }
    }
  }

  /**
   * Set up an instance's cloned geometry, materials, animations, and fan groups
   */
  private setupInstanceContent(
    equipmentId: string,
    targetSize: [number, number, number],
    rootGroup: THREE.Group,
    contentGroup: THREE.Group
  ): void {
    if (!this.masterScene) return;

    // Clone master scene
    const clone = this.masterScene.clone(true);
    clone.updateMatrixWorld(true);

    // Measure raw model bounds
    const rawBox = new THREE.Box3().setFromObject(clone);
    const rawSize = rawBox.getSize(new THREE.Vector3());

    // Scale to fit target slot
    const scale = Math.min(
      targetSize[0] / rawSize.x,
      targetSize[1] / rawSize.y,
      targetSize[2] / rawSize.z
    );
    contentGroup.scale.setScalar(scale);

    // Center on X and Z, align bottom at Y = 0
    const rawCenter = rawBox.getCenter(new THREE.Vector3());
    contentGroup.position.set(-rawCenter.x * scale, -rawBox.min.y * scale, -rawCenter.z * scale);

    const animatedParts: AnimatedMeshRecord[] = [];
    const fanMap: Map<string, { rotor?: THREE.Mesh; blades: THREE.Mesh[]; loc?: THREE.Vector3 }> = new Map();

    const meshes: THREE.Mesh[] = [];
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshes.push(o as THREE.Mesh);
      }
    });

    for (const mesh of meshes) {
      // Improve material shading
      if (mesh.material) {
        const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        matList.forEach((m) => {
          m.side = THREE.DoubleSide;
          if ('depthWrite' in m) (m as THREE.MeshStandardMaterial).depthWrite = true;
        });
      }

      // Record original CAD position
      const originalPos = mesh.position.clone();
      const explodeOffset = this.getExplodeOffset(mesh.name);

      animatedParts.push({
        mesh,
        name: mesh.name,
        originalPos,
        explodeOffset
      });

      // Group fan rotating components
      if (mesh.name.startsWith('Transformer_Fan_Rotor_')) {
        const fanId = mesh.name.replace('Transformer_Fan_Rotor_', '');
        const entry = fanMap.get(fanId) || { blades: [] };
        entry.rotor = mesh;
        entry.loc = mesh.position.clone();
        fanMap.set(fanId, entry);
      } else if (mesh.name.startsWith('Transformer_Fan_Blade_')) {
        const parts = mesh.name.split('_');
        const fanId = `${parts[3]}_${parts[4]}`;
        const entry = fanMap.get(fanId) || { blades: [] };
        entry.blades.push(mesh);
        fanMap.set(fanId, entry);
      }
    }

    contentGroup.add(clone);

    const fans: FanImpellerGroup[] = [];
    fanMap.forEach((val, fanId) => {
      if (val.rotor && val.loc) {
        fans.push({
          fanId,
          rotor: val.rotor,
          blades: val.blades,
          pivot: val.loc
        });
      }
    });

    const instance: TransformerInstance = {
      equipmentId,
      rootGroup,
      contentGroup,
      animatedParts,
      fans
    };

    this.instances.set(equipmentId, instance);

    // Apply current explosion displacement
    for (const p of animatedParts) {
      const targetPos = p.originalPos.clone().addScaledVector(p.explodeOffset, this.currentExplosionFactor);
      p.mesh.position.copy(targetPos);
    }
  }

  /**
   * Creates a complete simulator equipment group for a transformer (txA or txB).
   * Instantly returns a valid THREE.Group with a collision proxy, attaching the 
   * detailed GLB asset asynchronously.
   */
  public createEquipmentGroup(equipmentId: string, targetSize: [number, number, number]): THREE.Group {
    const root = new THREE.Group();
    root.name = `Transformer_${equipmentId}`;
    root.userData.eqId = equipmentId;
    root.userData.isTransformer = true;

    // 1. Synchronous proxy box guaranteeing non-empty bounds for layout verification
    const proxyGeom = new THREE.BoxGeometry(targetSize[0], targetSize[1], targetSize[2]);
    const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
    // Center at Y = height / 2 so bounding box min is Y=0 and max is Y=height
    proxyMesh.position.set(0, targetSize[1] / 2, 0);
    proxyMesh.userData.eqId = equipmentId;
    root.add(proxyMesh);

    // 2. Content group that will hold the scaled GLB
    const contentGroup = new THREE.Group();
    contentGroup.name = `Transformer_${equipmentId}_Content`;
    root.add(contentGroup);

    if (this.isLoaded && this.masterScene) {
      this.setupInstanceContent(equipmentId, targetSize, root, contentGroup);
    } else {
      this.pendingInstanceRequests.push({
        equipmentId,
        targetSize,
        rootGroup: root,
        contentGroup
      });
    }

    return root;
  }

  /**
   * Set explosion separation factor (0.0 = Assembled, 1.0 = Fully exploded)
   */
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

  /**
   * Smoothly interpolate explosion displacement in the requestAnimationFrame loop
   */
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

  /**
   * Continuous axial cooling fan rotation for all 4 forced-air cooling units
   * @param delta Frame delta time in seconds
   * @param rpm Fan speed in revolutions per minute (default 1200 RPM)
   */
  public updateRotation(delta: number, rpm = 1200): void {
    const radPerSec = (rpm * 2 * Math.PI) / 60;
    const rotDelta = radPerSec * delta;

    this.instances.forEach((inst) => {
      for (const fan of inst.fans) {
        // Spin fan rotor around the X axis
        fan.rotor.rotation.x += rotDelta;

        // Spin each blade around the fan's central axis in the Y-Z plane
        for (const blade of fan.blades) {
          blade.rotation.x += rotDelta;
        }
      }
    });
  }
}

/**
 * Singleton instance shared across vessel layout, scene animation, and UI inspection controls
 */
export const transformerAssembly = new TransformerExplodedAssembly();
