import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from './assets';

export interface PropellerComponentMeta {
  name: string;
  category: 'Propeller' | 'Shafting' | 'Seals' | 'Structure';
  explodeOffset: THREE.Vector3; // Vector direction and distance when 100% exploded
  description: string;
}

/**
 * Explosion mapping registry defining exploded displacement offsets along the shaft
 * centerline or radial axes for all propeller and stern tube sub-assemblies.
 */
export const PROPELLER_EXPLOSION_MAP: Record<string, PropellerComponentMeta> = {
  // --- Forward Propeller Stack (Explodes -X, pulling aft into open water) ---
  Shaft_Retaining_Nut: {
    name: 'Thrust Retaining Nut',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-2.8, 0, 0),
    description: 'High-tensile locking nut securing the propeller hub onto the tailshaft taper.'
  },
  Thrust_Washer: {
    name: 'Thrust Washer',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-2.5, 0, 0),
    description: 'Distributes axial thrust loads from the hub to the tail shaft shoulder.'
  },
  Hub_Aft_Nose: {
    name: 'Propeller Hub Fairing Cap (Nose)',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-2.8, 0, 0),
    description: 'Streamlined bronze end cap reducing vortex cavitation at the hub termination.'
  },
  Hub_Aft_Collar: {
    name: 'Hub Aft Retaining Collar',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-2.4, 0, 0),
    description: 'Machined collar locking the propeller fairing cone to the central boss.'
  },
  Hub_Fastener_Ring: {
    name: 'Hub Fastener Ring',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-2.6, 0, 0),
    description: 'High-tensile retaining ring with axial locking studs.'
  },
  Propeller_Hub: {
    name: 'Propeller Hub / Boss',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-1.8, 0, 0),
    description: 'Cast Nickel-Aluminum-Bronze (Cu3) central boss keyed to the tapered tailshaft.'
  },
  Propeller_Key: {
    name: 'Propeller Drive Key',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-0.9, 0.45, 0), // Lifts radially up out of keyway
    description: 'Transmits rotational torque from the propulsion motor shaft to the propeller hub.'
  },
  Shaft_Aft_Taper: {
    name: 'Shaft Aft Taper Cone',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(-1.0, 0, 0),
    description: 'Precision 1:12 ground taper fitting directly into the propeller hub bore.'
  },

  // --- Individual Blades (Explode radially outward perpendicular to the shaft) ---
  Propeller_Blade_1: {
    name: 'Blade 1',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-1.8, 1.2, 0.0),
    description: 'Skewed Kaplan-profile nickel-aluminum bronze blade.'
  },
  Propeller_Blade_2: {
    name: 'Blade 2',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-1.8, 0.37, 1.14),
    description: 'Skewed Kaplan-profile nickel-aluminum bronze blade.'
  },
  Propeller_Blade_3: {
    name: 'Blade 3',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-1.8, -0.97, 0.70),
    description: 'Skewed Kaplan-profile nickel-aluminum bronze blade.'
  },
  Propeller_Blade_4: {
    name: 'Blade 4',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-1.8, -0.97, -0.70),
    description: 'Skewed Kaplan-profile nickel-aluminum bronze blade.'
  },
  Propeller_Blade_5: {
    name: 'Blade 5',
    category: 'Propeller',
    explodeOffset: new THREE.Vector3(-1.8, 0.37, -1.14),
    description: 'Skewed Kaplan-profile nickel-aluminum bronze blade.'
  },

  // --- Shaft Seals & Mechanical Face Seals (Explode along X into hull inspection space) ---
  Oil_Seal_Aft: {
    name: 'Aft Oil Seal (Lip Seal)',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(0.5, 0, 0),
    description: 'Simplex elastomeric radial lip seal keeping seawater out of the stern tube.'
  },
  Oil_Seal_Fwd: {
    name: 'Forward Oil Seal',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(1.7, 0, 0),
    description: 'Secondary nitrile oil seal sealing the pressurized stern tube oil bath.'
  },
  Oil_Seal: {
    name: 'Stern Tube Oil Seal',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(0.85, 0, -0.3),
    description: 'Elastomeric oil-retaining seal maintaining stern tube hydrostatic barrier.'
  },
  Stepping_Box_Seal: {
    name: 'Stepping Box Seal',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(0.9, 0, 0),
    description: 'Mechanical compression seal housing preventing lubricating oil loss.'
  },
  Stepping_Ring_Seal: {
    name: 'Stepping Ring Seal',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(1.3, 0, 0),
    description: 'Machined bronze support ring guiding axial shaft movement.'
  },
  Stepping_Ring_Seal_1: {
    name: 'Aft Stepping Ring Seal Stage 1',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.75, 0, -0.3),
    description: 'Multi-stage bronze sealing ring stage 1.'
  },
  Stepping_Ring_Seal_2: {
    name: 'Aft Stepping Ring Seal Stage 2',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.55, 0, -0.3),
    description: 'Multi-stage bronze sealing ring stage 2.'
  },
  Stepping_Ring_Seal_3: {
    name: 'Aft Stepping Ring Seal Stage 3',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.35, 0, -0.3),
    description: 'Multi-stage bronze sealing ring stage 3.'
  },
  Seal_Retainer_1: {
    name: 'Seal Retainer Ring 1',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.65, 0, -0.3),
    description: 'Stainless clamping collar holding the primary shaft seal.'
  },
  Seal_Retainer_2: {
    name: 'Seal Retainer Ring 2',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.45, 0, -0.3),
    description: 'Stainless clamping collar holding the intermediate shaft seal.'
  },
  Seal_Retainer_3: {
    name: 'Seal Retainer Ring 3',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.25, 0, -0.3),
    description: 'Stainless clamping collar holding the forward shaft seal.'
  },
  Sealing_Housing: {
    name: 'Sealing Housing Flange',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.4, 0, 0.4),
    description: 'Flanged intermediate bronze casting containing the mechanical seal pack.'
  },
  Sealing_Housing_Trim: {
    name: 'Sealing Housing Trim Ring',
    category: 'Seals',
    explodeOffset: new THREE.Vector3(-0.45, 0, 0.4),
    description: 'Machined edge trim ring for sealing face alignment.'
  },

  // --- Shafting, Liners & Bearings ---
  Liner_Keeling_Ring: {
    name: 'Shaft Liner (Keeling Ring)',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(2.1, 0, 0),
    description: 'Shrunk-fit bronze wear sleeve shielding the steel shaft from galvanic corrosion.'
  },
  Sterntube_Bearing: {
    name: 'Sterntube White-Metal Bearing',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(2.6, 0, 0),
    description: 'White-metal journal bearing carrying the cantilevered weight of the propeller.'
  },
  Stern_Tube_Bearing_Aft: {
    name: 'Aft Stern Tube Bearing',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(-0.6, 0, -0.45),
    description: 'Bronze journal bearing supporting the aft tailshaft section.'
  },
  Stern_Tube_Bearing_Forward: {
    name: 'Forward Stern Tube Bearing',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(0.65, 0, -0.45),
    description: 'Forward guide bearing supporting the shaft near the bulkhead stuffing box.'
  },
  Stern_Tube_Bearing_Sleeve: {
    name: 'Stern Tube Bearing Sleeve',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(0.1, 0, -0.45),
    description: 'Cast steel sleeve enclosing the journal bearing bushes.'
  },
  Propeller_Shaft: {
    name: 'Main Propulsion Tailshaft',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(-0.15, 0, 0),
    description: 'Forged alloy steel tailshaft transmitting torque from the motor to the propeller.'
  },

  // --- Couplings & Forward Drive Interface ---
  Slott_Coupling: {
    name: 'Slott Coupling',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(3.4, 0, 0),
    description: 'Rigid flanged coupling connecting the tail shaft to the intermediate propulsion shaft.'
  },
  Shaft_Coupling_Flange: {
    name: 'Shaft Coupling Flange',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(1.15, 0, 0),
    description: 'Machined integral forged flange bolted to the intermediate shaft.'
  },
  Coupling_Face: {
    name: 'Coupling Mating Face',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(1.35, 0, 0),
    description: 'Ground thrust face transmitting forward and astern propulsion loads.'
  },
  Shaft_End_Collar: {
    name: 'Shaft End Guide Collar',
    category: 'Shafting',
    explodeOffset: new THREE.Vector3(1.55, 0, 0),
    description: 'Precision centering spigot aligning the shaft segments.'
  },

  // --- Stationary Hull Casting & Stern Tube (Anchor at 0, 0, 0) ---
  Stern_Tube: {
    name: 'Stern Tube Casting',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0, 0, 0),
    description: 'Cast-steel after-peak structural stern tube sleeve.'
  },
  Stern_Tube_Housing_Cutaway: {
    name: 'Stern Tube Housing (Cutaway)',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0.1, 0, 0.65),
    description: 'Cast-iron stern tube housing with 90° engineering cutaway exposing internal bearings.'
  },
  Stern_Tube_Liner_Cutaway: {
    name: 'Stern Tube Liner (Cutaway)',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0.1, 0, 0.65),
    description: 'Anti-corrosion red oxide liner fitted inside the stern tube.'
  },
  Stern_Tube_Cut_Edge_Aft: {
    name: 'Stern Tube Cut Edge Aft',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0.1, 0, 0.65),
    description: 'Milled cross-sectional boundary highlight of aft housing.'
  },
  Stern_Tube_Cut_Edge_Fwd: {
    name: 'Stern Tube Cut Edge Forward',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0.1, 0, 0.65),
    description: 'Milled cross-sectional boundary highlight of forward housing.'
  },
  Shaft_Bracket_Cutaway: {
    name: 'Shaft Bracket & Bulkhead (Cutaway)',
    category: 'Structure',
    explodeOffset: new THREE.Vector3(0, 0, 0),
    description: 'Cast-steel after-peak structural bossing with a 90° cutaway inspection window.'
  }
};

/**
 * High-performance 3D explodable propeller & stern tube assembly.
 * Manages separate rotating vs. stationary mechanical groups and smooth explosion interpolation.
 */
export class PropellerExplodedAssembly {
  public group: THREE.Group = new THREE.Group();
  public rotatingGroup: THREE.Group = new THREE.Group();
  public stationaryGroup: THREE.Group = new THREE.Group();

  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;
  public isLoaded: boolean = false;

  private partOriginalTransforms: Map<THREE.Mesh, { pos: THREE.Vector3; rot: THREE.Euler }> = new Map();
  private animatedParts: {
    mesh: THREE.Mesh;
    name: string;
    originalPos: THREE.Vector3;
    explodeOffset: THREE.Vector3;
  }[] = [];

  private proxyMesh: THREE.Mesh;

  constructor(url = '/marine_propeller_assembly.glb') {
    this.group.name = 'PropellerExplodedAssembly';
    this.rotatingGroup.name = 'PropellerRotor';
    this.stationaryGroup.name = 'SternTubeStator';

    // Hook userData for compatibility with raycaster selection and legacy spin checkers
    this.rotatingGroup.userData.spinProp = true;
    this.rotatingGroup.userData.eqId = 'prop';
    this.stationaryGroup.userData.eqId = 'prop';
    this.group.userData.spinProp = true;
    this.group.userData.eqId = 'prop';

    this.group.add(this.rotatingGroup);
    this.group.add(this.stationaryGroup);

    // Initial proxy cylinder ensuring instant non-empty bounds during synchronous layout verification
    const proxyGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.65, 16);
    proxyGeom.rotateZ(Math.PI / 2);
    const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
    this.proxyMesh.userData.eqId = 'prop';
    this.group.add(this.proxyMesh);

    // Assembly origin is at (0, 0, 0) relative to root so hub sits at root position (X=-17.38, Y=-2.22, Z=0)
    this.group.position.set(0, 0, 0);

    // Asynchronously load the GLB model in browser environment
    if (typeof window !== 'undefined') {
      this.loadModel(url).catch((err) => {
        console.warn('PropellerExplodedAssembly: initial load deferred or failed:', err);
      });
    }
  }

  /**
   * Helper to categorize whether a mesh belongs to the rotating tailshaft/propeller group
   * or the stationary stern tube / bearing casting group.
   */
  private isRotatingComponent(name: string): boolean {
    return (
      /^(Propeller_|Hub_|Shaft_Coupling|Coupling_|Shaft_End|Thrust_Washer|Blade_Bolt|Shaft_Retaining|Slott_Coupling|Propeller_Key|Propeller_Shaft|Shaft_Aft|Liner_Keeling)/.test(
        name
      ) && !/^(Stern_Tube|Shaft_Bracket|Housing_Reinforcement|Sealing_Housing|Stepping_|Seal_Retainer|Oil_Seal|Sterntube_Bearing)/.test(name)
    );
  }

  /**
   * Determine explosion offset vector from the registry, with geometric fallback
   */
  private getExplodeOffset(name: string): THREE.Vector3 {
    if (PROPELLER_EXPLOSION_MAP[name]) {
      return PROPELLER_EXPLOSION_MAP[name].explodeOffset.clone();
    }

    // Dynamic radial offset for blade arrays of any size
    if (name.startsWith('Propeller_Blade_')) {
      const idx = parseInt(name.split('_').pop() || '1', 10) - 1;
      const angle = (2 * Math.PI * idx) / 5 + Math.PI / 8;
      return new THREE.Vector3(-1.8, Math.sin(angle) * 1.15, -Math.cos(angle) * 1.15);
    }
    if (name.startsWith('Coupling_Bolt_')) {
      return new THREE.Vector3(1.45, 0, 0);
    }
    if (name.startsWith('Blade_Bolt_')) {
      return new THREE.Vector3(-2.2, 0, 0);
    }
    if (name.startsWith('Housing_Reinforcement_')) {
      return new THREE.Vector3(0.1, 0, 0.65);
    }

    if (name.includes('Bearing')) return new THREE.Vector3(0.8, 0, -0.4);
    if (name.includes('Seal')) return new THREE.Vector3(-0.6, 0, -0.3);
    if (name.includes('Coupling')) return new THREE.Vector3(1.2, 0, 0);
    if (name.includes('Hub') || name.includes('Nose')) return new THREE.Vector3(-1.8, 0, 0);

    return new THREE.Vector3(0, 0, 0);
  }

  /**
   * Asynchronously loads the 3D GLB model and sets up materials and groups
   */
  public async loadModel(url = 'marine_propeller_assembly.glb'): Promise<void> {
    const loader = new GLTFLoader();
    const cleanUrl = resolvePublicAsset(url);

    const gltf = await loader.loadAsync(cleanUrl);
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    // Measure raw model bounds to scale diameter precisely to 1.0m matching vesselLayout aperture and tailshaft
    const rawBox = new THREE.Box3().setFromObject(scene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const targetDiameter = 1.0;
    const modelScale = rawSize.y > 0 ? targetDiameter / rawSize.y : 0.436;

    // In the GLB, Propeller_Hub center is at x = -1.50. Offset groups by +1.50 * modelScale
    // so the propeller hub sits exactly at (0, 0, 0) inside this.group, locking it to the vessel's grey tailshaft.
    this.rotatingGroup.position.set(1.50 * modelScale, 0, 0);
    this.stationaryGroup.position.set(1.50 * modelScale, 0, 0);

    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });

    for (const mesh of meshes) {
      const isRotating = this.isRotatingComponent(mesh.name);
      const targetGroup = isRotating ? this.rotatingGroup : this.stationaryGroup;

      // Use .add() instead of .attach() so mesh keeps its local rest position from GLB
      mesh.userData.eqId = 'prop';
      targetGroup.add(mesh);

      // Hide external test-stand bracket & cutaway casing on the ship so only the propeller
      // and internal mechanical seals/bearings fit into the vessel hull
      if (/^(Stern_Tube_Housing|Shaft_Bracket|Housing_Reinforcement|Stern_Tube_Cut_Edge|Stern_Tube_Liner)/.test(mesh.name)) {
        mesh.visible = false;
      }

      // Store resting assembled CAD position
      const originalPos = mesh.position.clone();
      this.partOriginalTransforms.set(mesh, {
        pos: originalPos,
        rot: mesh.rotation.clone()
      });

      const explodeOffset = this.getExplodeOffset(mesh.name);
      this.animatedParts.push({
        mesh,
        name: mesh.name,
        originalPos,
        explodeOffset
      });

      // Enhance materials: double-sided rendering with crisp highlights
      if (mesh.material) {
        const matList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        matList.forEach((m) => {
          m.side = THREE.DoubleSide;
          if ('depthWrite' in m) (m as THREE.MeshStandardMaterial).depthWrite = true;
        });
      }
    }

    // Apply scaling so overall blade diameter is 1.0m
    this.rotatingGroup.scale.setScalar(modelScale);
    this.stationaryGroup.scale.setScalar(modelScale);

    // Keep proxyMesh as an invisible raycast hit target ensuring reliable propeller clicks
    this.proxyMesh.userData.eqId = 'prop';

    this.isLoaded = true;
    this.setExplosionFactor(this.targetExplosionFactor);
  }

  /**
   * Set the explosion separation factor (0.0 = Assembled, 1.0 = Fully exploded)
   */
  public setExplosionFactor(factor: number): void {
    this.targetExplosionFactor = THREE.MathUtils.clamp(factor, 0, 1);
    this.currentExplosionFactor = this.targetExplosionFactor;

    for (const p of this.animatedParts) {
      const targetPos = p.originalPos.clone().addScaledVector(p.explodeOffset, this.currentExplosionFactor);
      p.mesh.position.copy(targetPos);
    }
  }

  /**
   * Smoothly interpolate explosion displacement in the requestAnimationFrame loop
   */
  public updateExplosion(delta: number): void {
    if (!this.animatedParts.length) return;
    const lerpSpeed = Math.min(1, delta * 12);
    this.currentExplosionFactor = THREE.MathUtils.lerp(
      this.currentExplosionFactor,
      this.targetExplosionFactor,
      lerpSpeed
    );

    for (const p of this.animatedParts) {
      const targetPos = p.originalPos.clone().addScaledVector(p.explodeOffset, this.targetExplosionFactor);
      p.mesh.position.lerp(targetPos, lerpSpeed);
    }
  }

  /**
   * Continuous tailshaft rotation around the X-axis centerline
   * @param delta Frame delta time in seconds
   * @param rpm Rotational speed in revolutions per minute (default 45)
   */
  public updateRotation(delta: number, rpm = 45): void {
    // Only spin the shaft, hub, and blades; stern tube casting remains stationary
    const radPerSec = (rpm * 2 * Math.PI) / 60;
    this.rotatingGroup.rotation.x += radPerSec * delta;
  }
}

/**
 * Singleton instance shared across vessel layout, scene animation, and UI inspection controls
 */
export const propellerAssembly = new PropellerExplodedAssembly();
