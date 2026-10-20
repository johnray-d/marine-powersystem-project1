import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolvePublicAsset } from './assets';

export interface ComponentMeta {
  name: string;
  category: string;
  description: string;
  explodeOffset: THREE.Vector3;
}

interface AnimatedMeshItem {
  mesh: THREE.Mesh;
  name: string;
  originalPos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
  isRotating?: boolean;
}

interface AssemblyInstance {
  equipmentId: string;
  targetSize: [number, number, number];
  rootGroup: THREE.Group;
  contentGroup: THREE.Group;
  rotatingGroup: THREE.Group;
  stationaryGroup: THREE.Group;
  proxyMesh?: THREE.Mesh;
  animatedParts: AnimatedMeshItem[];
}

/**
 * Base class for the 8 hybrid 3D consumer assemblies conforming to
 * the blender-threejs-hybrid-modeler specification.
 */
export abstract class BaseHybridAssemblyController {
  public currentExplosionFactor: number = 0.0;
  public targetExplosionFactor: number = 0.0;
  public isLoaded: boolean = false;
  public isEnergized: boolean = false;

  protected masterScene: THREE.Group | null = null;
  protected instances: Map<string, AssemblyInstance> = new Map();
  protected abstract modelUrl: string;
  protected abstract componentRegistry: Record<string, ComponentMeta>;
  protected abstract rotatingPartNames: string[];

  constructor() {}

  public async loadModel(customUrl?: string): Promise<THREE.Group> {
    if (this.masterScene) return this.masterScene;
    const url = resolvePublicAsset(customUrl || this.modelUrl);
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          this.masterScene = gltf.scene;
          this.isLoaded = true;

          // Process any instances already instantiated before async GLB load finished
          this.instances.forEach((inst) => {
            this.populateInstanceFromMaster(inst);
          });

          resolve(this.masterScene);
        },
        undefined,
        (error) => {
          console.warn(`[HybridController] Deferred load failed for ${url}:`, error);
          reject(error);
        }
      );
    });
  }

  public createEquipmentGroup(equipmentId: string, targetSize: [number, number, number]): THREE.Group {
    const rootGroup = new THREE.Group();
    rootGroup.name = `Hybrid_${equipmentId}`;
    rootGroup.userData.equipmentId = equipmentId;

    const contentGroup = new THREE.Group();
    contentGroup.name = `Content_${equipmentId}`;
    rootGroup.add(contentGroup);

    const rotatingGroup = new THREE.Group();
    rotatingGroup.name = `Rotating_${equipmentId}`;
    contentGroup.add(rotatingGroup);

    const stationaryGroup = new THREE.Group();
    stationaryGroup.name = `Stationary_${equipmentId}`;
    contentGroup.add(stationaryGroup);

    // Initial bounding collision proxy mesh for instant synchronous layout verification
    const proxyGeom = new THREE.BoxGeometry(targetSize[0], targetSize[1], targetSize[2]);
    const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const proxyMesh = new THREE.Mesh(proxyGeom, proxyMat);
    proxyMesh.position.set(0, targetSize[1] / 2, 0);
    proxyMesh.userData.eqId = equipmentId;
    rootGroup.add(proxyMesh);

    const instance: AssemblyInstance = {
      equipmentId,
      targetSize,
      rootGroup,
      contentGroup,
      rotatingGroup,
      stationaryGroup,
      proxyMesh,
      animatedParts: []
    };

    this.instances.set(equipmentId, instance);

    if (this.masterScene) {
      this.populateInstanceFromMaster(instance);
    } else {
      this.loadModel().catch(() => {});
    }

    return rootGroup;
  }

  protected populateInstanceFromMaster(inst: AssemblyInstance): void {
    if (!this.masterScene) return;
    inst.contentGroup.clear();
    inst.contentGroup.scale.set(1, 1, 1);
    inst.contentGroup.position.set(0, 0, 0);

    const clone = this.masterScene.clone(true);
    clone.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(clone);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawCenter = rawBox.getCenter(new THREE.Vector3());

    const scale = Math.min(
      inst.targetSize[0] / (rawSize.x || 1),
      inst.targetSize[1] / (rawSize.y || 1),
      inst.targetSize[2] / (rawSize.z || 1)
    );

    inst.animatedParts = [];

    const rotating = new THREE.Group();
    rotating.name = 'rotatingGroup';
    const stationary = new THREE.Group();
    stationary.name = 'stationaryGroup';
    inst.contentGroup.add(rotating);
    inst.contentGroup.add(stationary);
    inst.rotatingGroup = rotating;
    inst.stationaryGroup = stationary;

    const childMeshes: THREE.Mesh[] = [];
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.userData.eqId = inst.equipmentId;
        childMeshes.push(child);
      }
    });

    childMeshes.forEach((mesh) => {
      const baseName = mesh.name.split('__')[0];
      const meta = this.componentRegistry[baseName] || this.componentRegistry[mesh.name] || {
        name: baseName,
        category: 'Component',
        description: 'Marine electrical assembly component.',
        explodeOffset: new THREE.Vector3(0, 0, 0)
      };

      const isRot = this.rotatingPartNames.includes(baseName) || this.rotatingPartNames.includes(mesh.name);
      const originalPos = mesh.position.clone();

      inst.animatedParts.push({
        mesh,
        name: baseName,
        originalPos,
        explodeOffset: meta.explodeOffset.clone(),
        isRotating: isRot
      });

      // Keep all parts in stationaryGroup so rotating parts spin cleanly around their own local shaft/mast pivot
      stationary.add(mesh);
    });

    // Scale and align contentGroup so the assembly fits inside targetSize with bottom at Y=0
    inst.contentGroup.scale.setScalar(scale);
    inst.contentGroup.position.set(
      -rawCenter.x * scale,
      -rawBox.min.y * scale,
      -rawCenter.z * scale
    );

    // Remove proxy mesh once master geometry is attached
    if (inst.proxyMesh) {
      inst.rootGroup.remove(inst.proxyMesh);
      inst.proxyMesh.geometry.dispose();
      inst.proxyMesh = undefined;
    }
  }

  public setExplosionFactor(factor: number): void {
    this.targetExplosionFactor = THREE.MathUtils.clamp(factor, 0.0, 1.0);
  }

  public updateExplosion(delta: number): void {
    if (Math.abs(this.currentExplosionFactor - this.targetExplosionFactor) < 0.001) {
      return;
    }
    const lerpSpeed = Math.min(1.0, delta * 12.0);
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

  public abstract updateKinematics(delta: number, rpm: number, energized: boolean): void;

  public getComponentMeta(partName: string): ComponentMeta | undefined {
    const baseName = partName.split('__')[0];
    return this.componentRegistry[baseName] || this.componentRegistry[partName];
  }

  public getAllComponents(): Record<string, ComponentMeta> {
    return this.componentRegistry;
  }
}

// ============================================================================
// 1. 440 V Emergency Switchboard (ESB) Cubicle & Interlock Panel
// ============================================================================
export class ESB_CubicleController extends BaseHybridAssemblyController {
  protected modelUrl = 'esb_cubicle.glb';
  protected rotatingPartNames: string[] = [];

  protected componentRegistry: Record<string, ComponentMeta> = {
    ESB_Frame: {
      name: 'ESB Welded Frame & Base Skid',
      category: 'Enclosure',
      description: 'Heavy structural steel angle frame with bottom mounting channel skids and lifting eyes.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    ESB_Door: {
      name: 'Front Interlocked Gasketed Door',
      category: 'Enclosure',
      description: 'Neoprene-gasketed front access door with mechanical interlock latch and polycarbonate inspection port.',
      explodeOffset: new THREE.Vector3(0, 0, 0.85)
    },
    ESB_Busbar_A: {
      name: '440 V Emergency Busbar Section A',
      category: 'Busbars',
      description: 'Solid electrolytic copper busbars (L1, L2, L3) rated 1200 A supplying emergency steering and emergency fire pump.',
      explodeOffset: new THREE.Vector3(-0.45, 0.35, 0.35)
    },
    ESB_Busbar_B: {
      name: '440 V Emergency Busbar Section B',
      category: 'Busbars',
      description: 'Secondary emergency distribution copper busbars feeding navigation bridge and 24 V DC battery UPS chargers.',
      explodeOffset: new THREE.Vector3(0.45, 0.35, 0.35)
    },
    ESB_Tie_ACB: {
      name: 'Emergency Bus-Tie Air Circuit Breaker',
      category: 'Switchgear',
      description: '4-pole withdrawable air circuit breaker with integral solid-state protection trip unit and racking truck.',
      explodeOffset: new THREE.Vector3(0, -0.15, 0.65)
    },
    ESB_Metering_Panel: {
      name: 'Digital Multifunction Metering & Synchro Panel',
      category: 'Instrumentation',
      description: 'Microprocessor power meter, frequency/voltage digital readouts, phase sequence indicator, and test switches.',
      explodeOffset: new THREE.Vector3(0, 0.55, 0.75)
    },
    ESB_Control_Wiring: {
      name: 'Control Wiring Loom & Terminal Rail',
      category: 'Wiring',
      description: 'Flame-retardant halogen-free control wiring harness, DIN rail terminals, PT/CT test disconnects, and auxiliary fuses.',
      explodeOffset: new THREE.Vector3(0.35, -0.35, 0.45)
    }
  };

  public updateKinematics(_delta: number, _rpm: number, energized: boolean): void {
    this.isEnergized = energized;
  }
}

// ============================================================================
// 2. 24 V DC Battery Bank Racks & GMDSS / UPS Charger Cabinet
// ============================================================================
export class Battery_SystemController extends BaseHybridAssemblyController {
  protected modelUrl = 'battery_system.glb';
  protected rotatingPartNames: string[] = ['Ammeter_Gauge'];

  protected componentRegistry: Record<string, ComponentMeta> = {
    Battery_Rack_Frame: {
      name: 'Acid-Resistant Tiered Battery Rack',
      category: 'Structure',
      description: 'Heavy gauge epoxy-coated steel rack with acid-resistant drip trays and earthquake marine deck clamps.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    Battery_Cell_01_12: {
      name: '12 × 2V VRLA Deep-Cycle Marine Cells',
      category: 'Battery',
      description: 'Valve-regulated lead-acid (AGM) cells connected in series to form a 24 V DC / 600 Ah emergency radio battery bank.',
      explodeOffset: new THREE.Vector3(0, 0.25, 0.50)
    },
    DC_Busbar_Positive: {
      name: 'Positive DC Inter-Cell Copper Busbar',
      category: 'Busbars',
      description: 'Tinned electrolytic copper link bars with red heat-shrink insulation and corrosion-resistant stainless hardware.',
      explodeOffset: new THREE.Vector3(-0.35, 0.45, 0.65)
    },
    DC_Busbar_Negative: {
      name: 'Negative DC Inter-Cell Copper Busbar',
      category: 'Busbars',
      description: 'Solid tinned copper link bars with black protective insulating boots.',
      explodeOffset: new THREE.Vector3(0.35, 0.45, 0.65)
    },
    Charger_Cabinet: {
      name: 'Dual Automatic Float/Boost Charger Enclosure',
      category: 'Charger',
      description: 'Marine IP22 ventilated steel enclosure with automatic temperature compensation and battery fault monitoring.',
      explodeOffset: new THREE.Vector3(0, 0.65, -0.35)
    },
    Rectifier_Transformer: {
      name: 'Galvanic Isolation Transformer & SCR Rectifier',
      category: 'PowerConversion',
      description: 'Step-down isolation transformer with thyristor bridge converting 220 V AC to regulated 27.6 V DC float voltage.',
      explodeOffset: new THREE.Vector3(-0.25, 0.65, 0.25)
    },
    Ammeter_Gauge: {
      name: 'Dual-Scale Center-Zero DC Ammeter',
      category: 'Instrumentation',
      description: 'Analog charge/discharge ammeter with backlit dial face monitoring battery current flow.',
      explodeOffset: new THREE.Vector3(0.25, 0.75, 0.35)
    }
  };

  private needleAngle: number = 0;

  public updateKinematics(delta: number, _rpm: number, energized: boolean): void {
    this.isEnergized = energized;
    const targetAngle = energized ? 0.35 : 0.0;
    this.needleAngle = THREE.MathUtils.lerp(this.needleAngle, targetAngle, delta * 4.0);

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        if (p.isRotating) {
          p.mesh.rotation.z = -this.needleAngle;
        }
      }
    });
  }
}

// ============================================================================
// 3. Main Starting Air Compressor & Air Receiver Bottle Skid
// ============================================================================
export class Air_Compressor_SkidController extends BaseHybridAssemblyController {
  protected modelUrl = 'air_compressor_skid.glb';
  protected rotatingPartNames: string[] = ['V_Belt_Drive'];

  protected componentRegistry: Record<string, ComponentMeta> = {
    Compressor_Frame: {
      name: 'Cast-Iron Rigid Base Skid & Oil Sump',
      category: 'Structure',
      description: 'Cast-iron bedplate with anti-vibration rubber mounts, oil drainage sump, and foundation anchor bolts.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    Electric_Motor_440V: {
      name: '440 V 3-Phase Induction Drive Motor',
      category: 'Motor',
      description: '30 kW TEFC squirrel-cage induction motor rated for continuous duty in 50°C machinery space ambient.',
      explodeOffset: new THREE.Vector3(-0.55, 0.25, 0.35)
    },
    V_Belt_Drive: {
      name: 'High-Torque V-Belt Transmission & Guard',
      category: 'Drive',
      description: 'Matched 4-groove SPB V-belt drive with balanced cast-iron flywheel pulley and perforated steel guard.',
      explodeOffset: new THREE.Vector3(-0.15, 0.30, 0.65)
    },
    Two_Stage_Cylinder: {
      name: 'Two-Stage Air Compression Cylinders',
      category: 'Compressor',
      description: 'Stepped LP (6 bar) and HP (30 bar) compression cylinders with precision honed liners and concentric valve discs.',
      explodeOffset: new THREE.Vector3(0.35, 0.40, 0.35)
    },
    Intercooler_Coil: {
      name: 'Copper Finned Intercooler & Moisture Separator',
      category: 'Cooling',
      description: 'Multi-pass finned copper cooling coil reducing air temperature between stages with automatic condensate dump.',
      explodeOffset: new THREE.Vector3(0.35, 0.65, 0.55)
    },
    Pressure_Receiver_Bottle: {
      name: '30-Bar Main Air Receiver Bottle',
      category: 'Storage',
      description: 'Seamless forged steel pressure vessel rated 30 bar for starting main diesel generators with relief valve.',
      explodeOffset: new THREE.Vector3(0.85, 0.20, -0.45)
    },
    Solenoid_Unloader_Valve: {
      name: 'Automatic Solenoid Unloader & Purge Valve',
      category: 'Pneumatics',
      description: '24 V DC solenoid valve venting cylinder head pressure during startup to reduce initial starting motor torque.',
      explodeOffset: new THREE.Vector3(0.45, -0.20, 0.55)
    }
  };

  public updateKinematics(delta: number, rpm = 1200, energized: boolean): void {
    this.isEnergized = energized;
    if (!energized) return;
    const rotSpeed = (rpm * 2 * Math.PI) / 60;
    const rotDelta = rotSpeed * delta;

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        if (p.isRotating) {
          p.mesh.rotation.z += rotDelta;
        }
      }
    });
  }
}

// ============================================================================
// 4. Engine Room Heavy Axial Ventilation Fan & Local Starter Box
// ============================================================================
export class Vent_Fan_AssemblyController extends BaseHybridAssemblyController {
  protected modelUrl = 'vent_fan_assembly.glb';
  protected rotatingPartNames: string[] = ['Axial_Impeller_Blades'];

  protected componentRegistry: Record<string, ComponentMeta> = {
    Fan_Cylindrical_Casing: {
      name: 'Heavy Steel Aerodynamic Fan Casing',
      category: 'Casing',
      description: 'Hot-dip galvanized cylindrical steel trunking with aerodynamic motor support arms and inspection hatch.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    Flange_Rings: {
      name: 'Drilled Companion Connecting Flanges',
      category: 'Structure',
      description: 'Rolled steel angle flanges welded to casing ends conforming to DIN/JIS marine ducting standards.',
      explodeOffset: new THREE.Vector3(0, 0.70, 0)
    },
    Axial_Impeller_Blades: {
      name: '8-Blade Cast-Aluminum Airfoil Impeller',
      category: 'Impeller',
      description: 'Dynamically balanced seawater-resistant aluminum alloy airfoil blades with adjustable pitch angle.',
      explodeOffset: new THREE.Vector3(0, 0, 0.75)
    },
    '440V_Drive_Motor': {
      name: 'In-Stream IP56 Marine Flange Motor',
      category: 'Motor',
      description: 'Class H insulated marine motor cooled directly by incoming supply airflow with sealed bearings.',
      explodeOffset: new THREE.Vector3(0, 0, -0.65)
    },
    Local_Starter_Enclosure: {
      name: 'Local Star-Delta Starter & Isolator Box',
      category: 'Control',
      description: 'Watertight starter panel with lockable rotary isolator, contactors, overload relay, and remote control terminals.',
      explodeOffset: new THREE.Vector3(0.65, 0, 0)
    },
    Fire_Damper_Actuator: {
      name: 'SOLAS Quick-Closing Fire Damper Actuator',
      category: 'Safety',
      description: 'Spring-return fail-safe actuator interlocked with the fire detection system and outdoor emergency stop.',
      explodeOffset: new THREE.Vector3(-0.65, 0, 0)
    }
  };

  public updateKinematics(delta: number, rpm = 1750, energized: boolean): void {
    this.isEnergized = energized;
    if (!energized) return;
    const rotSpeed = (rpm * 2 * Math.PI) / 60;
    const rotDelta = rotSpeed * delta;

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        if (p.isRotating) {
          p.mesh.rotation.z += rotDelta;
        }
      }
    });
  }
}

// ============================================================================
// 5. Ballast Pump & Oily Water Separator (OWS) Control Skid
// ============================================================================
export class Ballast_OWS_SkidController extends BaseHybridAssemblyController {
  protected modelUrl = 'ballast_ows_skid.glb';
  protected rotatingPartNames: string[] = ['Pump_Impeller'];

  protected componentRegistry: Record<string, ComponentMeta> = {
    Ballast_Pump_Casing: {
      name: 'Cast-Bronze Centrifugal Volute Casing',
      category: 'Pump',
      description: 'Heavy seawater-resistant bronze volute casing with flanged suction and discharge branches.',
      explodeOffset: new THREE.Vector3(-0.45, 0, 0)
    },
    Pump_Impeller: {
      name: 'Double-Curvature Bronze Impeller',
      category: 'Impeller',
      description: 'Enclosed multi-vane bronze impeller keyed to stainless steel pump shaft for high-flow ballast transfer.',
      explodeOffset: new THREE.Vector3(-0.45, 0.35, 0.45)
    },
    '440V_Drive_Motor': {
      name: '440 V Electric Drive Motor',
      category: 'Motor',
      description: 'Vertical flange-mounted induction motor with stainless cooling fins and moisture-sealed terminal box.',
      explodeOffset: new THREE.Vector3(-0.45, 0.65, 0)
    },
    OWS_Pressure_Vessel: {
      name: 'Two-Stage Bilge OWS Coalescer Vessel',
      category: 'Separator',
      description: 'Pressure vessel separating oil and water mixtures down to < 15 ppm conforming to IMO MEPC.107(49).',
      explodeOffset: new THREE.Vector3(0.45, 0, 0)
    },
    Coalescer_Filter: {
      name: 'Oleophilic High-Efficiency Coalescer Pack',
      category: 'Filter',
      description: 'Removable oleophilic coalescing matrix filter element aggregating microscopic oil droplets.',
      explodeOffset: new THREE.Vector3(0.45, 0.55, 0.35)
    },
    Oil_Content_Monitor: {
      name: '15 PPM Bilge Alarm Monitor (OCM)',
      category: 'Instrumentation',
      description: 'Optical measuring sensor analyzing effluent oil content with automatic 3-way discharge diversion valve.',
      explodeOffset: new THREE.Vector3(0.75, 0.25, 0.45)
    },
    Control_Panel: {
      name: 'Automated PLC Skid Control Console',
      category: 'Control',
      description: 'Microprocessor control panel managing automated bilge oil discharge, level switches, and data logging.',
      explodeOffset: new THREE.Vector3(0.15, 0.75, 0.30)
    }
  };

  public updateKinematics(delta: number, rpm = 1800, energized: boolean): void {
    this.isEnergized = energized;
    if (!energized) return;
    const rotSpeed = (rpm * 2 * Math.PI) / 60;
    const rotDelta = rotSpeed * delta;

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        if (p.isRotating) {
          p.mesh.rotation.y += rotDelta;
        }
      }
    });
  }
}

// ============================================================================
// 6. 440 V Galley Primary Distribution Board & Outdoor Emergency Shunt Trip Box
// ============================================================================
export class Galley_Board_AssemblyController extends BaseHybridAssemblyController {
  protected modelUrl = 'galley_board_assembly.glb';
  protected rotatingPartNames: string[] = [];

  protected componentRegistry: Record<string, ComponentMeta> = {
    Galley_Panel_Enclosure: {
      name: 'Galley Primary 440 V Switchboard & Cooking Range',
      category: 'Enclosure',
      description: '2-bay marine switchboard cubicle with commercial stainless steel roasting ovens, range hotplates, and deep fryers.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    Feeder_MCCB_Bank: {
      name: 'Group Thermal-Magnetic Feeder MCCB Bank & 3P Busbars',
      category: 'Switchgear',
      description: '3-phase copper busbars and molded case circuit breakers protecting ovens, deep fryers, and cooking ranges.',
      explodeOffset: new THREE.Vector3(0, 0.20, 0.45)
    },
    Shunt_Trip_Relay: {
      name: 'SOLAS 24V DC Magnetic Shunt Trip Release',
      category: 'Safety',
      description: 'Electromagnetic shunt trip release coil wired to outdoor emergency pushbuttons to instantly trip all cooking power.',
      explodeOffset: new THREE.Vector3(-0.35, 0.35, 0.55)
    },
    Outdoor_Shunt_Trip_Box: {
      name: 'Outdoor Weatherproof Emergency Shunt Trip Station',
      category: 'Safety',
      description: 'High-visibility safety yellow/red station installed outside galley entrance conforming to SOLAS II-2 Reg 9.2.',
      explodeOffset: new THREE.Vector3(-0.45, 0.10, 0.35)
    },
    Red_Mushroom_Button: {
      name: '40mm Latching Emergency Stop Mushroom Button',
      category: 'Actuator',
      description: 'Twist-to-reset red mushroom pushbutton opening control circuit to trigger galley feeder shunt trip.',
      explodeOffset: new THREE.Vector3(-0.45, 0.10, 0.65)
    },
    Safety_Cover_Flap: {
      name: 'Spring-Loaded Protective Safety Flap',
      category: 'Safety',
      description: 'Yellow protective flip-up spring guard preventing inadvertent actuation during heavy seas.',
      explodeOffset: new THREE.Vector3(-0.45, 0.25, 0.85)
    }
  };

  public updateKinematics(_delta: number, _rpm: number, energized: boolean): void {
    this.isEnergized = energized;
  }
}

// ============================================================================
// 7. 6.6 kV High-Voltage Shore Power Connection Box & Cable Reel (Cold Ironing)
// ============================================================================
export class Shore_Power_ReelController extends BaseHybridAssemblyController {
  protected modelUrl = 'shore_power_reel.glb';
  protected rotatingPartNames: string[] = ['Cable_Reel_Drum', 'HV_Flexible_Cable'];

  protected componentRegistry: Record<string, ComponentMeta> = {
    Cable_Reel_Drum: {
      name: 'Motorized Marine Cable Reel Drum',
      category: 'Structure',
      description: 'Heavy spoked drum with continuous slip ring collector chamber and torque control spooling drive.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    HV_Flexible_Cable: {
      name: '6.6 kV Heavy Flexible Cold-Ironing Cable',
      category: 'Cable',
      description: 'Triple-core EPR-insulated, copper screened 6.6 kV flexible trailing cable with integrated fiber-optic cores.',
      explodeOffset: new THREE.Vector3(0, 0.25, 0.45)
    },
    HV_Connector_Plug: {
      name: 'IEC/IEEE 80005-1 Shore Power Connector Head & Skid',
      category: 'Connector',
      description: 'High-voltage shore power coupling plug with interlocked pilot contact pins, fairlead, and skid base.',
      explodeOffset: new THREE.Vector3(-0.25, -0.20, 0.45)
    },
    Motorized_Drive: {
      name: 'Hydraulic/Electric Planetary Spooling Drive',
      category: 'Drive',
      description: 'Variable frequency geared motor maintaining constant cable tension during tidal vessel movement.',
      explodeOffset: new THREE.Vector3(-0.55, 0, 0)
    },
    Junction_Box: {
      name: '6.6 kV Shore Connection Switchboard Cubicle',
      category: 'Enclosure',
      description: 'Switchboard-grade terminal cubicle with synchro metering, protection LCD, and door safety limit switches.',
      explodeOffset: new THREE.Vector3(0.55, 0.25, -0.20)
    },
    Mechanical_Interlock_Pin: {
      name: 'Castell Key Mechanical Safety Interlock Pin',
      category: 'Safety',
      description: 'Trapped-key mechanical interlock preventing connection or disconnection while shore breaker is closed.',
      explodeOffset: new THREE.Vector3(0.55, 0.45, 0.35)
    },
    Earth_Blade: {
      name: 'High-Current Manual Earth Switch Blade',
      category: 'Earthing',
      description: '3-pole knife-blade earthing switch bonding shore supply cable screens directly to the vessel steel hull.',
      explodeOffset: new THREE.Vector3(0.55, 0.15, 0.35)
    }
  };

  public updateKinematics(delta: number, rpm = 8, energized: boolean): void {
    this.isEnergized = energized;
    if (!energized) return;
    const rotSpeed = (rpm * 2 * Math.PI) / 60;
    const rotDelta = rotSpeed * delta;

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        if (p.isRotating) {
          p.mesh.rotation.z += rotDelta;
        }
      }
    });
  }
}

// ============================================================================
// 8. Navigation Bridge COLREG Light Control Console & Radar Scanner
// ============================================================================
export class Bridge_NavCom_SuiteController extends BaseHybridAssemblyController {
  protected modelUrl = 'bridge_navcom_suite.glb';
  protected rotatingPartNames: string[] = ['Rotating_S-Band_Scanner_Bar'];

  protected componentRegistry: Record<string, ComponentMeta> = {
    NavLight_Console_Panel: {
      name: 'COLREG Navigation Light Control Console & ARPA Displays',
      category: 'Console',
      description: 'Ergonomic bridge desk console with dual 27-inch ARPA/ECDIS screens, helm wheel, and changeover panel.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    Dual_Selector_Switches: {
      name: 'Main / Standby Filament Circuit Selector Switches',
      category: 'Switchgear',
      description: 'Rotary selector switches for Masthead, Sidelights, Stern, and Towing lights with bulb failure detection.',
      explodeOffset: new THREE.Vector3(-0.20, 0.35, 0.35)
    },
    Alarm_Buzzer: {
      name: 'Audible Failure Sounder & Lamp Test Switch',
      category: 'Alarm',
      description: 'Acoustic alarm horn and test/silence pushbuttons alerting watch officers of filament failure or power loss.',
      explodeOffset: new THREE.Vector3(0.15, 0.40, 0.30)
    },
    Radar_Pedestal: {
      name: 'Mainmast Radar Scanner Base Pedestal',
      category: 'Radar',
      description: 'Cast marine aluminum pedestal housing high-precision brushless servo drive and optical rotary joints.',
      explodeOffset: new THREE.Vector3(0, 0, 0)
    },
    Gearbox_Housing: {
      name: 'Precision Harmonic Reduction Gearbox',
      category: 'Radar',
      description: 'Sealed low-noise reduction gearbox maintaining constant 24 / 48 RPM rotation in extreme weather.',
      explodeOffset: new THREE.Vector3(0, 0.45, 0)
    },
    'Rotating_S-Band_Scanner_Bar': {
      name: '12-Foot Aerodynamic S-Band Waveguide Scanner',
      category: 'Radar',
      description: 'Slotted waveguide array radar antenna bar providing high-resolution target detection and ARPA tracking.',
      explodeOffset: new THREE.Vector3(0, 0.90, 0)
    }
  };

  public updateKinematics(delta: number, rpm = 24, energized: boolean): void {
    this.isEnergized = energized;
    if (!energized) return;
    const rotSpeed = (rpm * 2 * Math.PI) / 60;
    const rotDelta = rotSpeed * delta;

    this.instances.forEach((inst) => {
      for (const p of inst.animatedParts) {
        if (p.isRotating) {
          p.mesh.rotation.y += rotDelta;
        }
      }
    });
  }
}

// Export singleton instances for easy global access across the simulator
export const esbCubicleAssembly = new ESB_CubicleController();
export const batterySystemAssembly = new Battery_SystemController();
export const airCompressorAssembly = new Air_Compressor_SkidController();
export const ventFanAssembly = new Vent_Fan_AssemblyController();
export const ballastOwsAssembly = new Ballast_OWS_SkidController();
export const galleyBoardAssembly = new Galley_Board_AssemblyController();
export const shorePowerAssembly = new Shore_Power_ReelController();
export const bridgeNavComAssembly = new Bridge_NavCom_SuiteController();
