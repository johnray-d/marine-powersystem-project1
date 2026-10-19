export type NodeKind = 'generator' | 'emergency-generator' | 'bus' | 'emergency-bus' | 'transformer' | 'drive' | 'motor' | 'propeller' | 'thruster' | 'pump' | 'reefer' | 'load' | 'future';
export type ModelType = 'generator' | 'breaker' | 'hv-board' | 'transformer' | 'lv-board' | 'drive' | 'motor' | 'thruster' | 'reefer' | 'pump' | 'propeller';
export interface Equipment {
  id: string;
  name: string;
  short: string;
  kind: NodeKind;
  voltage: string;
  zone: string;
  purpose: string;
  path: string;
  normal: string;
  lesson: string;
  model?: ModelType;
  sx: number; sy: number;
  label3d?: boolean;
}
export interface Connection {
  id: string;
  from: string;
  to: string;
  name: string;
  breaker?: boolean;
  normalClosed?: boolean;
  model?: ModelType;
  purpose?: string;
  lesson?: string;
}
export interface SimState {
  running: Record<string, boolean>;
  closed: Record<string, boolean>;
}

// ============================================================================
// PHASE 1: PROTECTIVE RELAY ENGINE (ANSI 32, ANSI 40, ANSI 51 IDMT)
// ============================================================================
export interface RelayState {
  reversePowerTimer: number;      // ANSI 32: Reverse Power timer (trips at > 3.0s when P < -0.05 * P_rated)
  lossOfFieldTimer: number;       // ANSI 40: Loss of Excitation timer (trips at >= 1.5s when Q < -0.20 * Q_rated & V < 85% V_nom)
  overcurrentTimer: number;       // ANSI 51: IDMT elapsed overcurrent timer (s)
  idmtTripTimeSec: number | null; // ANSI 51: Calculated inverse trip time t = k / ((I / I_s)^alpha - 1)
  idmtProgress: number;           // ANSI 51: Normalized thermal/IDMT trip accumulator (0..1)
  lastTripCode: string | null;    // Last active relay trip code
  lastTripReason: string | null;  // Human-readable trip message
  fieldLossInjected: boolean;     // Simulates AVR / field excitation collapse for ANSI 40 testing
}

export interface FeederRelayState {
  breakerId: string;
  name: string;
  currentAmps: number;
  pickupAmps: number;
  overcurrentTimer: number;
  idmtTripTimeSec: number | null;
  idmtProgress: number;
  overcurrentInjected: boolean;
  lastTripReason: string | null;
}

export interface GeneratorProtectionInput {
  id: string;
  short: string;
  breakerId: string;
  activePowerKW: number;
  ratedPowerKW: number;
  reactivePowerKVAR: number;
  ratedVAR: number;
  busVoltageKV: number;
  nominalVoltageKV: number;
  currentAmps: number;
  pickupCurrentAmps: number;
  isBreakerClosed: boolean;
  relays: RelayState;
}

export function createInitialRelayState(): RelayState {
  return {
    reversePowerTimer: 0,
    lossOfFieldTimer: 0,
    overcurrentTimer: 0,
    idmtTripTimeSec: null,
    idmtProgress: 0,
    lastTripCode: null,
    lastTripReason: null,
    fieldLossInjected: false
  };
}

/**
 * IEC 60255 Standard Inverse IDMT (Inverse Definite Minimum Time) Overcurrent Equation:
 *   t = k / ((I / I_s)^alpha - 1)
 * Standard Inverse constants: k = 0.14, alpha = 0.02, scaled by Time Multiplier Setting (tms).
 */
export function calculateIdmtTripTime(
  currentAmps: number,
  pickupCurrentAmps: number,
  k = 0.14,
  alpha = 0.02,
  tms = 0.25
): number {
  const ratio = currentAmps / Math.max(1, pickupCurrentAmps);
  if (ratio <= 1.0) return Infinity;
  const denominator = Math.pow(ratio, alpha) - 1;
  if (denominator <= 1e-9) return Infinity;
  return (k * tms) / denominator;
}

/**
 * Evaluates ANSI 32 (Reverse Power), ANSI 40 (Loss of Excitation / Field),
 * and ANSI 51 (IDMT Overcurrent) for a marine generator per simulation step.
 */
export function updateProtectiveRelays(
  dg: GeneratorProtectionInput,
  deltaTime: number,
  onTrip?: (dg: GeneratorProtectionInput, alarmMessage: string, ansiCode: string) => void
): void {
  if (!dg.isBreakerClosed) {
    dg.relays.reversePowerTimer = 0;
    dg.relays.lossOfFieldTimer = 0;
    dg.relays.overcurrentTimer = 0;
    dg.relays.idmtTripTimeSec = null;
    dg.relays.idmtProgress = Math.max(0, dg.relays.idmtProgress - deltaTime * 0.25);
    return;
  }

  // 1. ANSI 32: Reverse Power Protection (P < -0.05 * P_rated for > 3.0 seconds)
  if (dg.activePowerKW < -0.05 * dg.ratedPowerKW) {
    dg.relays.reversePowerTimer += deltaTime;
    if (dg.relays.reversePowerTimer > 3.0) {
      dg.relays.reversePowerTimer = 0;
      dg.relays.lastTripCode = 'ANSI-32';
      dg.relays.lastTripReason = 'ANSI 32: Reverse Power Trip';
      onTrip?.(
        dg,
        `ANSI 32: Reverse Power Trip on ${dg.short} (${Math.round(dg.activePowerKW)} kW < -5% rated for >3.0s).`,
        'ANSI-32'
      );
      return;
    }
  } else {
    dg.relays.reversePowerTimer = Math.max(0, dg.relays.reversePowerTimer - deltaTime * 0.5);
  }

  // 2. ANSI 40: Loss of Excitation / Field (Q < -0.20 * Q_rated AND V < 85% nominal [5.61 kV on 6.6 kV bus] for >= 1.5s)
  const voltageLimitKV = 0.85 * dg.nominalVoltageKV; // 5.61 kV for 6.6 kV system
  if (dg.reactivePowerKVAR < -0.20 * dg.ratedVAR && dg.busVoltageKV < voltageLimitKV) {
    dg.relays.lossOfFieldTimer += deltaTime;
    if (dg.relays.lossOfFieldTimer >= 1.5) {
      dg.relays.lossOfFieldTimer = 0;
      dg.relays.lastTripCode = 'ANSI-40';
      dg.relays.lastTripReason = 'ANSI 40: Loss of Field';
      onTrip?.(
        dg,
        `ANSI 40: Loss of Field on ${dg.short} (Q = ${Math.round(dg.reactivePowerKVAR)} kVAr, V = ${dg.busVoltageKV.toFixed(2)} kV < ${voltageLimitKV.toFixed(2)} kV for 1.5s).`,
        'ANSI-40'
      );
      return;
    }
  } else {
    dg.relays.lossOfFieldTimer = Math.max(0, dg.relays.lossOfFieldTimer - deltaTime * 0.5);
  }

  // 3. ANSI 51: IDMT Inverse-Time Overcurrent Curve: t = k / ((I / I_s)^alpha - 1)
  if (dg.currentAmps > dg.pickupCurrentAmps) {
    const tripTime = calculateIdmtTripTime(dg.currentAmps, dg.pickupCurrentAmps, 0.14, 0.02, 0.25);
    dg.relays.idmtTripTimeSec = Number.isFinite(tripTime) ? Number(tripTime.toFixed(2)) : null;
    dg.relays.overcurrentTimer += deltaTime;
    if (Number.isFinite(tripTime) && tripTime > 0) {
      dg.relays.idmtProgress += deltaTime / tripTime;
      if (dg.relays.idmtProgress >= 1.0) {
        dg.relays.idmtProgress = 0;
        dg.relays.overcurrentTimer = 0;
        dg.relays.lastTripCode = 'ANSI-51';
        dg.relays.lastTripReason = 'ANSI 51: IDMT Overcurrent Trip';
        onTrip?.(
          dg,
          `ANSI 51: IDMT Overcurrent Trip on ${dg.short} (I = ${Math.round(dg.currentAmps)} A, I/Is = ${(dg.currentAmps / dg.pickupCurrentAmps).toFixed(2)}×, t_trip = ${tripTime.toFixed(2)}s).`,
          'ANSI-51'
        );
        return;
      }
    }
  } else {
    dg.relays.idmtTripTimeSec = null;
    dg.relays.overcurrentTimer = 0;
    dg.relays.idmtProgress = Math.max(0, dg.relays.idmtProgress - deltaTime * 0.2);
  }
}

/**
 * Evaluates ANSI 51 IDMT Overcurrent Curve for outgoing feeder breakers.
 */
export function updateFeederIdmtRelay(
  feeder: FeederRelayState,
  isBreakerClosed: boolean,
  deltaTime: number,
  onTrip?: (feeder: FeederRelayState, alarmMessage: string) => void
): void {
  if (!isBreakerClosed) {
    feeder.overcurrentTimer = 0;
    feeder.idmtTripTimeSec = null;
    feeder.idmtProgress = Math.max(0, feeder.idmtProgress - deltaTime * 0.3);
    return;
  }

  if (feeder.currentAmps > feeder.pickupAmps) {
    const tripTime = calculateIdmtTripTime(feeder.currentAmps, feeder.pickupAmps, 0.14, 0.02, 0.18);
    feeder.idmtTripTimeSec = Number.isFinite(tripTime) ? Number(tripTime.toFixed(2)) : null;
    feeder.overcurrentTimer += deltaTime;
    if (Number.isFinite(tripTime) && tripTime > 0) {
      feeder.idmtProgress += deltaTime / tripTime;
      if (feeder.idmtProgress >= 1.0) {
        feeder.idmtProgress = 0;
        feeder.overcurrentTimer = 0;
        feeder.overcurrentInjected = false;
        feeder.lastTripReason = `ANSI 51: Feeder IDMT Trip (${tripTime.toFixed(2)}s)`;
        onTrip?.(
          feeder,
          `ANSI 51: IDMT Overcurrent tripped ${feeder.name} (I = ${Math.round(feeder.currentAmps)} A, I/Is = ${(feeder.currentAmps / feeder.pickupAmps).toFixed(2)}×, t = ${tripTime.toFixed(2)}s).`
        );
      }
    }
  } else {
    feeder.idmtTripTimeSec = null;
    feeder.overcurrentTimer = 0;
    feeder.idmtProgress = Math.max(0, feeder.idmtProgress - deltaTime * 0.25);
  }
}

// ============================================================================
// PHASE 2: HIGH-RESISTANCE EARTHING (HRE) & ANSI 67N DIRECTIONAL EARTH FAULT
// ============================================================================
export type EarthingArchitecture = 'IT' | 'HRE';

export interface HvEarthingTelemetry {
  architecture: EarthingArchitecture;
  architectureLabel: string;
  nerResistanceOhms: number | null; // 381 Ω in HRE mode (V_LN / 10 A = 3810 V / 10 A)
  neutralDisplacementV: number;     // V_N = 3810 V during phase-to-earth fault
  groundFaultCurrentAmps: number;   // 10.0 A limited by NER in HRE mode
  ansi67nActive: boolean;           // ANSI 67N Directional Earth Fault Relay pickup
  faultedPhase: string | null;      // e.g., 'Phase A (L1-Earth)'
  transientOvervoltageRisk: string; // 'Damped (<= 1.73x V_ph)' in HRE vs 'High (up to 3.0x V_ph arcing)' in IT
}

/**
 * Computes 6.6 kV bus earthing telemetry for Unearthed IT vs High-Resistance Earthed (HRE) systems.
 * In HRE mode: V_LN = 6600 / sqrt(3) ≈ 3810 V, R_NER = 381 Ω => I_ef = 10.0 A, triggering ANSI 67N.
 */
export function calculateHvEarthingState(
  architecture: EarthingArchitecture,
  earthFaultActive: boolean,
  busLive: boolean
): HvEarthingTelemetry {
  const nominalPhaseVoltageV = Math.round(6600 / Math.sqrt(3)); // 3810 V
  const nerOhms = 381; // 3810 V / 10 A = 381 Ω Neutral Earthing Resistor

  if (!earthFaultActive || !busLive) {
    return {
      architecture,
      architectureLabel:
        architecture === 'HRE'
          ? 'High-Resistance Earthed (HRE) System'
          : 'Unearthed IT System',
      nerResistanceOhms: architecture === 'HRE' ? nerOhms : null,
      neutralDisplacementV: 0,
      groundFaultCurrentAmps: 0,
      ansi67nActive: false,
      faultedPhase: null,
      transientOvervoltageRisk:
        architecture === 'HRE'
          ? 'NER Damped (≤ 1.73× V_ph)'
          : 'Capacitive Arc Risk (up to 3.0× V_ph)'
    };
  }

  if (architecture === 'HRE') {
    const faultCurrentAmps = Number((nominalPhaseVoltageV / nerOhms).toFixed(1)); // 10.0 A
    return {
      architecture: 'HRE',
      architectureLabel: 'High-Resistance Earthed (HRE) System',
      nerResistanceOhms: nerOhms,
      neutralDisplacementV: nominalPhaseVoltageV, // 3810 V
      groundFaultCurrentAmps: faultCurrentAmps,   // 10.0 A
      ansi67nActive: true,
      faultedPhase: 'Phase L1 (Bus A Feeder)',
      transientOvervoltageRisk: 'NER Damped (≤ 1.73× V_ph)'
    };
  }

  return {
    architecture: 'IT',
    architectureLabel: 'Unearthed IT System',
    nerResistanceOhms: null,
    neutralDisplacementV: nominalPhaseVoltageV, // 3810 V neutral shift
    groundFaultCurrentAmps: 0.4,                // Uncontrolled capacitive charging current
    ansi67nActive: false,
    faultedPhase: 'Phase L1 (Non-directional IMD)',
    transientOvervoltageRisk: 'HIGH: Arcing Overvoltage (up to 3.0× V_ph)'
  };
}

// Electrical topology is independent from the drawing coordinates and Three.js geometry.
// Edit labels here when confirmed ship reference material becomes available.
export const VOLTAGES = { hv: '6.6 kV', lv: '440 V', consumer: '220 V' };

const n = (id: string, name: string, short: string, kind: NodeKind, voltage: string, zone: string, purpose: string, path: string, normal: string, lesson: string, sx: number, sy: number, model?: ModelType, label3d = false): Equipment =>
  ({ id, name, short, kind, voltage, zone, purpose, path, normal, lesson, sx, sy, model, label3d });

export const equipment: Equipment[] = [
  // --- 6.6 kV Generation Sources (Level 1: Y = 135) ---
  n('dg1','Diesel-generator 1 (Port)','DG 1','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW main synchronous diesel generator supplying Port Bus A.','Source → generator breaker gb1 → main bus A','Running; breaker closed','The prime mover provides mechanical energy; the 6.6 kV alternator produces medium-voltage electricity.',160,135,'generator',true),
  n('dg2','Diesel-generator 2 (Port)','DG 2','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW second main electrical source for Port Bus A.','Source → generator breaker gb2 → main bus A','Standby; breaker open','Any available generator can feed its bus section when synchronized and closed.',310,135,'generator',true),
  n('shore','Shore connection (Cold Ironing)','SHORE','future',VOLTAGES.hv,'Port deck','6.6 kV port cold-ironing shore connection box with phase-sequence and interlock protection.','Shore box → shore breaker → main bus A','Disconnected at sea; interlocked with DGs','In port, shore power can supply Main Bus A once generator breakers are open (black transfer) or synchronized.',460,135,undefined,true),
  n('dg3','Diesel-generator 3 (Starboard)','DG 3','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW third main electrical source supplying Starboard Bus B.','Source → generator breaker gb3 → main bus B','Standby; breaker open','Bus B can be supplied independently of Bus A when the bus tie is open.',1190,135,'generator',true),
  n('dg4','Diesel-generator 4 (Starboard)','DG 4','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW fourth main electrical source for Starboard Bus B.','Source → generator breaker gb4 → main bus B','Standby; breaker open','Symmetrical 4-generator dual-bus redundancy ensures high vessel availability.',1340,135,'generator',true),

  // --- 6.6 kV Main High-Voltage Switchboards (Level 1 Busbars: Y = 220) ---
  n('busA','6.6 kV Main Switchboard · Bus A (Port)','BUS A','bus',VOLTAGES.hv,'Engine control room','Receives DG 1/2 and shore supply; distributes 6.6 kV power to Port machinery.','DG 1/2 → Bus A → TX A, TX REEFER A, Propulsion Drive 1','Energized when DG 1 feeds it','Medium-voltage switchgear busbar feeding transformers and heavy propulsion.',385,220,'hv-board',true),
  n('busB','6.6 kV Main Switchboard · Bus B (Starboard)','BUS B','bus',VOLTAGES.hv,'Engine control room','Receives DG 3/4; distributes 6.6 kV power to Starboard machinery and Bow Thruster.','DG 3/4 → Bus B → TX B, TX REEFER B, Bow Thruster','Joined to Bus A by 6.6 kV Bus Tie','Opening the 6.6 kV Bus Tie separates the grid into two isolated islands.',1115,220,'hv-board',true),

  // --- 6.6 kV / 440 V Dual Main Step-Down Transformers (2.5 MVA each, Y = 360) ---
  n('txA','Main Step-Down Transformer A (Port)','TX A','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space (Port)','2.5 MVA step-down transformer stepping 6.6 kV Bus A down to 440 V Bus A.',`Bus A → TX A VCB → TX A → 440 V Bus A`,'Connected; 2.5 MVA rated','Magnetic induction transfers power while reducing voltage from 6.6 kV to 440 V.',180,360,'transformer',true),
  n('txB','Main Step-Down Transformer B (Starboard)','TX B','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space (Starboard)','2.5 MVA step-down transformer stepping 6.6 kV Bus B down to 440 V Bus B.',`Bus B → TX B VCB → TX B → 440 V Bus B`,'Connected; 2.5 MVA rated','Starboard redundant transformer guaranteeing 100% low-voltage power if TX A is isolated.',1320,360,'transformer',true),

  // --- 6.6 kV / 440 V Dual Reefer Distribution Transformers (1.5 MVA each, Y = 360) ---
  n('txReeferA','Reefer Transformer A (Port)','TX REEFER A','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Forward machinery space (Port)','1.5 MVA step-down transformer stepping 6.6 kV Bus A down to Reefer Distribution Board A.','Bus A → REEFER A VCB → TX REEFER A → Reefer Panel A','Connected; 1.5 MVA rated','Dedicated step-down transformer isolating cyclical refrigerated container compressor surges.',330,360,'transformer',true),
  n('txReeferB','Reefer Transformer B (Starboard)','TX REEFER B','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Forward machinery space (Starboard)','1.5 MVA step-down transformer stepping 6.6 kV Bus B down to Reefer Distribution Board B.','Bus B → REEFER B VCB → TX REEFER B → Reefer Panel B','Connected; 1.5 MVA rated','Starboard dedicated reefer transformer providing symmetrical cargo container cooling capacity.',1170,360,'transformer',true),

  // --- 6.6 kV Drives & Heavy Consumers (Y = 345 to 418) ---
  n('drive','Propulsion VFD Drive 1','DRIVE 1','drive',VOLTAGES.hv,'Aft machinery space','Conditions 6.6 kV supply and controls propulsion motor speed and torque via PWM inverter.','Bus A → DRIVE 1 VCB → Drive 1 → Propulsion Motor','Feeder closed','Water-cooled variable frequency converter for main electric shaft propulsion.',520,345,'drive',true),
  n('motor','Electric Propulsion Motor','MOTOR','motor',VOLTAGES.hv,'Aft machinery space','6.6 kV synchronous electric propulsion motor driving the propeller shaft.',`Drive 1 → Propulsion Motor → Propeller shaft`,'Available when Drive 1 is powered','Directly turns the main shaft without mechanical reduction gears.',520,385,'motor',true),
  n('prop','Main Propeller','PROP','propeller','Mechanical','Stern','Fixed-pitch bronze propeller converting motor shaft rotation into vessel thrust.','Motor → Propeller','Turns when propulsion motor is supplied','Mechanically linked to the propulsion motor shaft.',520,418,'propeller',true),
  n('bow','Bow Thruster VFD Drive 2','BOW THRUSTER','thruster',VOLTAGES.hv,'Forward tunnel','6.6 kV variable-speed transverse thruster for harbor maneuvering.',`Bus B → THRUSTER VCB → Bow Thruster`,'Feeder open','Large motor assembly with integral right-angle bevel gear and tunnel propeller.',980,345,'thruster',true),

  // --- 440 V Main Low-Voltage Switchboards (Level 2 Busbars: Y = 440) ---
  n('lvBusA','440 V Main Switchboard · Bus A (Port)','440V BUS A','bus',VOLTAGES.lv,'Engine room (Port)','Distributes 440 V 3-phase power to Port engine room auxiliaries and Control TX A.',`TX A → 440 V Bus A → Port pumps & TX CON A`,'Live when TX A or 440 V Bus Tie is closed','Main low-voltage switchboard section with 440 V bus tie to Starboard Bus B.',385,440,'lv-board',true),
  n('lvBusB','440 V Main Switchboard · Bus B (Starboard)','440V BUS B','bus',VOLTAGES.lv,'Engine room (Starboard)','Distributes 440 V 3-phase power to Starboard machinery, crane, and Control TX B.',`TX B → 440 V Bus B → Starboard pumps & TX CON B`,'Live when TX B or 440 V Bus Tie is closed','Starboard low-voltage switchboard section joined by the 440 V Bus Tie.',1115,440,'lv-board',true),

  // --- 440 V / 220 V Dual Auxiliary / Control Transformers (500 kVA each, Y = 565) ---
  n('txConA','Control Transformer A (Port)','TX CON A','transformer',`${VOLTAGES.lv} / ${VOLTAGES.consumer}`,'Accommodation (Port)','500 kVA transformer stepping 440 V Bus A down to 220 V Sub-Board A.','440 V Bus A → CON A ACB → TX CON A → 220 V Sub A','Connected; 500 kVA rated','Provides isolated 220 V single-phase and 3-phase power for Bridge and Port lighting.',110,565,'transformer',true),
  n('txConB','Control Transformer B (Starboard)','TX CON B','transformer',`${VOLTAGES.lv} / ${VOLTAGES.consumer}`,'Accommodation (Starboard)','500 kVA transformer stepping 440 V Bus B down to 220 V Sub-Board B.','440 V Bus B → CON B ACB → TX CON B → 220 V Sub B','Connected; 500 kVA rated','Starboard control transformer feeding Galley and Starboard accommodation.',1390,565,'transformer',true),

  // --- 440 V Port Auxiliary Machinery (Level 2 Loads: Y = 545) ---
  n('fire1','Fire Pump 1 (Port)','FIRE PUMP 1','pump',VOLTAGES.lv,'Machinery space (Port)','Main service pump for vessel fire main from Port 440 V bus.','440 V Bus A → Fire Pump 1 feeder','Feeder open','Normal centrifugal fire pump supplying deck wash and fire hydrants.',210,545,'pump',true),
  n('reeferA','Reefer Distribution Board A (Port)','REEFER PANEL A','reefer',VOLTAGES.lv,'Cargo bay deck (Port)','Feeds grouped refrigerated-container sockets on Port cargo bays.',`TX REEFER A → Reefer Panel A → Container sockets`,'Supplied by TX REEFER A','Dedicated 440 V container refrigeration switchboard.',330,545,'reefer',true),
  n('cooling1','SW Cooling Pump 1 (Port)','SW COOLING 1','pump',VOLTAGES.lv,'Machinery space (Port)','Circulates seawater to central coolers for Port machinery.','440 V Bus A → SW Cooling 1 feeder','Feeder closed','Continuous duty essential auxiliary pump.',430,545,'pump',true),
  n('ballast','Ballast Pump','BALLAST PUMP','pump',VOLTAGES.lv,'Lower machinery space','Transfers seawater between ballast tanks for vessel trim, heel, and draft.','440 V Bus A → Ballast feeder','Feeder open','High-capacity centrifugal ballast pump.',515,545,'pump',true),
  n('steering','Main Steering Gear','STEERING GEAR','load',VOLTAGES.lv,'Aft steering compartment','Hydraulic power unit for main rudder movement during normal passage.','440 V Bus A → Steering feeder','Feeder closed','Dual-ram electro-hydraulic steering gear.',595,545,undefined,true),
  n('bilge','Machinery Bilge Pump','BILGE PUMP','pump',VOLTAGES.lv,'Lower machinery space','Evacuates oily water from engine room bilge wells to separator.','440 V Bus A → Bilge feeder','Feeder open','Reciprocating positive-displacement pump.',665,545,'pump',true),

  // --- 440 V Starboard Auxiliary Machinery (Level 2 Loads: Y = 545) ---
  n('fire2','Fire Pump 2 (Starboard)','FIRE PUMP 2','pump',VOLTAGES.lv,'Machinery space (Starboard)','Secondary main fire pump powered from Starboard 440 V bus for full redundancy.','440 V Bus B → Fire Pump 2 feeder','Feeder open','Independent fire main pump.',870,545,'pump',true),
  n('cooling2','SW Cooling Pump 2 (Starboard)','SW COOLING 2','pump',VOLTAGES.lv,'Machinery space (Starboard)','Circulates seawater to central coolers for Starboard machinery.','440 V Bus B → SW Cooling 2 feeder','Feeder closed','Continuous duty seawater cooling pump.',970,545,'pump',true),
  n('reeferB','Reefer Distribution Board B (Starboard)','REEFER PANEL B','reefer',VOLTAGES.lv,'Cargo bay deck (Starboard)','Feeds grouped refrigerated-container sockets on Starboard cargo bays.',`TX REEFER B → Reefer Panel B → Container sockets`,'Supplied by TX REEFER B','Symmetrical starboard container refrigeration switchboard.',1170,545,'reefer',true),
  n('crane','Deck Cargo Crane','DECK CRANE','load',VOLTAGES.lv,'Cargo deck','Electro-hydraulic deck crane for container handling and stores loading.','440 V Bus B → Deck Crane feeder','Feeder open','High inrush heavy machinery load.',1270,545,undefined,true),

  // --- 220 V Sub-Boards (Level 3 Busbars: Y = 640) ---
  n('consumerA','220 V Sub-Board · Bus A (Port)','220V SUB A','bus',VOLTAGES.consumer,'Accommodation (Port)','220 V distribution sub-board for Bridge navigation and Port lighting.','TX CON A → 220 V Sub A → Bridge / Lights A','Live when TX CON A or 220 V Tie closed','Low-voltage distribution board with cross-tie to Sub B.',385,640,'lv-board',true),
  n('consumerB','220 V Sub-Board · Bus B (Starboard)','220V SUB B','bus',VOLTAGES.consumer,'Accommodation (Starboard)','220 V distribution sub-board for Ship Galley and Starboard lighting.','TX CON B → 220 V Sub B → Galley / Lights B','Live when TX CON B or 220 V Tie closed','Low-voltage distribution board with cross-tie to Sub A.',1115,640,'lv-board',true),

  // --- 220 V Domestic & Service Loads (Level 3 Loads: Y = 725) ---
  n('nav','Bridge Navigation & Power','NAV BRIDGE','load',VOLTAGES.consumer,'Navigation Bridge','Bridge control consoles, radars, ECDIS, and navigational electronics.','220 V Sub A → Bridge feeder','Feeder closed','Essential bridge navigational and automation supply.',240,725,undefined,true),
  n('lightsA','Accommodation Lighting A (Port)','ACCOM LIGHT A','load',VOLTAGES.consumer,'Accommodation (Port)','Cabin, corridor, and machinery space lighting circuits on Port side.','220 V Sub A → Lighting A feeder','Feeder closed','Domestic and service lighting branch.',460,725,undefined,true),
  n('galley','Ship Galley & Outlets','GALLEY / OUTLETS','load',VOLTAGES.consumer,'Accommodation (Starboard)','Cooking ranges, galley refrigeration, and domestic 220 V convenience outlets.','220 V Sub B → Galley feeder','Feeder open','High-demand domestic hotel load shed during heavy sea state.',1040,725,undefined,true),
  n('lightsB','Accommodation Lighting B (Starboard)','ACCOM LIGHT B','load',VOLTAGES.consumer,'Accommodation (Starboard)','Cabin, corridor, and deck lighting circuits on Starboard side.','220 V Sub B → Lighting B feeder','Feeder closed','Domestic and service lighting branch.',1260,725,undefined,true),

  // --- 440 V SOLAS Emergency Switchboard (ESB) & Loads (Level 4: Y = 730 to 840) ---
  n('eBus','440 V Emergency Switchboard (ESB)','440V ESB','emergency-bus',VOLTAGES.lv,'Upper deck (Protected space)','Distributes emergency generator power to SOLAS essential circuits during blackout.','Emergency DG → EDG CB → ESB → Essential feeders','Standby; energized during blackout','Physically separated above the waterline for flood and fire survivability.',750,730,'lv-board',true),
  n('eg','Emergency Diesel Generator (440 V)','EMERGENCY DG','emergency-generator',VOLTAGES.lv,'Upper deck emergency compartment','440 V / 600 kW autonomous diesel generator auto-starting within 10s of blackout.','Emergency generator → EDG CB → ESB','Standby; breaker open','Autonomous starting via dual air/hydraulic starters with dedicated fuel supply.',750,840,'generator',true),
  n('eFire','Emergency Fire Pump','EM FIRE PUMP','pump',VOLTAGES.lv,'Forward separated compartment','Independent fire pump capable of operating during complete machinery space flooding.','ESB → Emergency Fire Pump feeder','Feeder closed','Complies with SOLAS II-2 fire safety regulations.',570,840,'pump',true),
  n('eSteer','Steering Gear (Emergency Supply)','STEERING EM\'CY','load',VOLTAGES.lv,'Aft steering compartment','Alternative auxiliary electrical supply for rudder operation during main power failure.','ESB → Emergency Steering feeder','Feeder closed','Mandatory SOLAS Chapter II-1 redundancy requirement.',660,840,undefined,true),
  n('eLights','Emergency Lighting (SOLAS)','EM LIGHTING','load',VOLTAGES.lv,'Escape routes & Bridge','Illuminates escape trunks, boat decks, lifeboats, and command centers.','ESB → Emergency Lighting feeder','Feeder closed','Essential emergency escape illumination.',840,840,undefined,true),
  n('eRadio','GMDSS Radio & Nav/Com','RADIO & NAV/COM','load',VOLTAGES.lv,'Navigation Bridge','GMDSS satellite communication, VHF distress radios, and emergency GPS.','ESB → Radio feeder','Feeder closed','Emergency radio communications and distress alerting.',930,840,undefined,true)
];

const edge = (id: string, from: string, to: string, name: string, breaker = false, normalClosed = true, model?: ModelType, purpose?: string, lesson?: string): Connection =>
  ({ id, from, to, name, breaker, normalClosed, model, purpose, lesson });

export const connections: Connection[] = [
  // --- 6.6 kV Generation Circuit Breakers ---
  edge('gb1','dg1','busA','DG 1 breaker',true,true,'breaker'),
  edge('gb2','dg2','busA','DG 2 breaker',true,false,'breaker'),
  edge('shoreBreaker','shore','busA','Shore-connection breaker',true,false,'breaker','Connects 6.6 kV port cold-ironing supply to Main Bus A when main generators are isolated.','Interlocked with main generator breakers so ship generators and shore supply are not inadvertently cross-connected out of phase.'),
  edge('gb3','dg3','busB','DG 3 breaker',true,false,'breaker'),
  edge('gb4','dg4','busB','DG 4 breaker',true,false,'breaker'),

  // --- 6.6 kV Bus Tie ---
  edge('tie','busA','busB','6.6 kV Bus-Tie vacuum breaker',true,true,'breaker','Joins or separates the two main 6.6 kV bus sections.','A closed tie can energize both sections from one running generator. Open it to isolate the sections in split-bus mode.'),

  // --- 6.6 kV Feeders (Drives & Transformers) ---
  edge('propFeed','busA','drive','DRIVE 1 VCB',true,true,'breaker'),
  edge('driveMotor','drive','motor','Drive 1 output'),
  edge('shaft','motor','prop','Propeller shaft'),
  edge('bowFeed','busB','bow','THRUSTER VCB',true,false,'breaker'),

  // Dual Main Step-Down Transformers (6.6 kV / 440 V, 2.5 MVA)
  edge('txAFeed','busA','txA','TX A VCB',true,true,'breaker'),
  edge('txAOut','txA','lvBusA','TX A 440 V output'),
  edge('txBFeed','busB','txB','TX B VCB',true,true,'breaker'),
  edge('txBOut','txB','lvBusB','TX B 440 V output'),

  // Dual Reefer Distribution Transformers (6.6 kV / 440 V, 1.5 MVA)
  edge('reeferAFeed','busA','txReeferA','REEFER A VCB',true,true,'breaker'),
  edge('txReeferAOut','txReeferA','reeferA','TX REEFER A output'),
  edge('reeferBFeed','busB','txReeferB','REEFER B VCB',true,true,'breaker'),
  edge('txReeferBOut','txReeferB','reeferB','TX REEFER B output'),

  // --- 440 V Bus Tie ---
  edge('lvTie','lvBusA','lvBusB','440 V Bus-Tie circuit breaker',true,true,'breaker','Joins Port 440 V Bus A and Starboard 440 V Bus B.','Allows low-voltage power to cross-feed across sides if one main transformer trips.'),

  // --- 440 V Bus A Feeders & Control Transformer A ---
  edge('conAAcb','lvBusA','txConA','CON A ACB',true,true,'breaker'),
  edge('txConAOut','txConA','consumerA','TX CON A 220 V output'),
  edge('fire1Feed','lvBusA','fire1','Fire Pump 1 feeder',true,false,'breaker'),
  edge('cooling1Feed','lvBusA','cooling1','SW Cooling 1 feeder',true,true,'breaker'),
  edge('ballastFeed','lvBusA','ballast','Ballast Pump feeder',true,false,'breaker'),
  edge('steerFeed','lvBusA','steering','Steering Gear feeder',true,true,'breaker'),
  edge('bilgeFeed','lvBusA','bilge','Bilge Pump feeder',true,false,'breaker'),

  // --- 440 V Bus B Feeders & Control Transformer B ---
  edge('conBAcb','lvBusB','txConB','CON B ACB',true,true,'breaker'),
  edge('txConBOut','txConB','consumerB','TX CON B 220 V output'),
  edge('fire2Feed','lvBusB','fire2','Fire Pump 2 feeder',true,false,'breaker'),
  edge('cooling2Feed','lvBusB','cooling2','SW Cooling 2 feeder',true,true,'breaker'),
  edge('craneFeed','lvBusB','crane','Deck Crane feeder',true,false,'breaker'),

  // --- 220 V Bus Tie ---
  edge('consumerTie','consumerA','consumerB','220 V Bus-Tie circuit breaker',true,true,'breaker','Joins 220 V Sub-Board A and 220 V Sub-Board B.','Provides domestic and bridge lighting cross-feed redundancy.'),

  // --- 220 V Feeders ---
  edge('navFeed','consumerA','nav','Bridge Nav feeder',true,true,'breaker'),
  edge('lightAFeed','consumerA','lightsA','Lighting A feeder',true,true,'breaker'),
  edge('galleyFeed','consumerB','galley','Galley feeder',true,true,'breaker'),
  edge('lightBFeed','consumerB','lightsB','Lighting B feeder',true,true,'breaker'),

  // --- 440 V Emergency Switchboard (ESB) Connections ---
  edge('egBreaker','eg','eBus','Emergency DG breaker (EDG CB)',true,false,'breaker'),
  edge('eFireFeed','eBus','eFire','Emergency Fire Pump feeder',true,true,'breaker'),
  edge('eSteerFeed','eBus','eSteer','Emergency Steering feeder',true,true,'breaker'),
  edge('eLightFeed','eBus','eLights','Emergency Lighting feeder',true,true,'breaker'),
  edge('eRadioFeed','eBus','eRadio','Radio & Nav/Com feeder',true,true,'breaker'),
  edge('esbTieFeed','lvBusA','eBus','Normal ESB Supply breaker',true,true,'breaker','Feeds Emergency Switchboard from 440 V Bus A during normal navigation.','Opens automatically on blackout via undervoltage release before EDG starts.'),
  edge('txConAEsbTie','eBus','consumerA','TX CON A ESB Tie CB (Norm. Open)',true,false,'breaker','Emergency cross-feed from ESB to 220 V Sub-Board A.','Normally open; can be closed in emergency to supply essential bridge power.')
];

export const byId = Object.fromEntries(equipment.map(item => [item.id, item])) as Record<string, Equipment>;
export const edgeById = Object.fromEntries(connections.map(item => [item.id, item])) as Record<string, Connection>;
export const sourceIds = ['dg1','dg2','dg3','dg4','eg'];
export const allSupplyIds = ['dg1','dg2','dg3','dg4','eg','shore'];

export function initialState(): SimState {
  return {
    running: Object.fromEntries(allSupplyIds.map(id => [id, id === 'dg1'])),
    closed: Object.fromEntries(connections.filter(c => c.breaker).map(c => [c.id, !!c.normalClosed]))
  };
}

export function powered(state: SimState): Set<string> {
  const live = new Set<string>();
  const queue = allSupplyIds.filter(id => state.running[id]);
  queue.forEach(id => live.add(id));
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    for (const c of connections) {
      if (c.breaker && !state.closed[c.id]) continue;
      // Flow is directional through converters, transformers, and loads.
      // Bus ties (6.6 kV tie, 440 V lvTie, 220 V consumerTie) are bidirectional.
      const isTie = c.id === 'tie' || c.id === 'lvTie' || c.id === 'consumerTie';
      const next = c.from === here ? c.to : (isTie && c.to === here ? c.from : null);
      if (!next || live.has(next) || (allSupplyIds.includes(next) && !state.running[next])) continue;
      live.add(next);
      queue.push(next);
    }
  }
  return live;
}

export function connectionState(c: Connection, state: SimState, live: Set<string>): 'open'|'live'|'dead' {
  if (c.breaker && !state.closed[c.id]) return 'open';
  return live.has(c.from) && live.has(c.to) ? 'live' : 'dead';
}

export const scenarios = [
  {
    id: 'main',
    title: '01 · Symmetrical Dual-Bus Energization',
    instruction: 'DG 1 is online with 6.6 kV Bus Tie closed, energizing both 6.6 kV Bus A & B. TX A & TX B step power down to 440 V Bus A & B, with dual reefer and control transformers active.',
    apply: (): SimState => initialState(),
    focus: 'busA'
  },
  {
    id: 'propulsion',
    title: '02 · Propulsion & Sea Running',
    instruction: 'Trace DG 1 → 6.6 kV Bus A → DRIVE 1 VCB → Drive 1 → Propulsion Motor → Propeller, supported by SW Cooling 1 and Steering Gear.',
    apply: (): SimState => {
      const s = initialState();
      s.closed.propFeed = true;
      s.closed.cooling1Feed = true;
      s.closed.cooling2Feed = true;
      s.closed.steerFeed = true;
      return s;
    },
    focus: 'drive'
  },
  {
    id: 'tie',
    title: '03 · Split-Bus Operation (Open Bus Ties)',
    instruction: 'Opening the 6.6 kV Bus Tie isolates Port and Starboard grids. Start DG 3 on Bus B to maintain independent dual-bus operation (DP Class 2/3 requirement).',
    apply: (): SimState => {
      const s = initialState();
      s.closed.tie = false;
      s.closed.lvTie = false;
      s.closed.consumerTie = false;
      return s;
    },
    focus: 'tie'
  },
  {
    id: 'emergency',
    title: '04 · SOLAS Blackout Waterfall',
    instruction: 'Total blackout: all main feeders shed via UVR so loads do NOT energize simultaneously. The 5-stage SOLAS sequential waterfall restores ESB (0–10s), Main DG & Aux 1 (10–20s), Aux 2 (20–30s), Essential (30–45s), and Heavy Loads (>45s).',
    apply: (): SimState => {
      const s = initialState();
      for (const id of ['dg1', 'dg2', 'dg3', 'dg4']) {
        s.running[id] = false;
        s.closed[`gb${id.slice(2)}`] = false;
      }
      for (const b of [
        'propFeed', 'bowFeed', 'txAFeed', 'txBFeed', 'reeferAFeed', 'reeferBFeed',
        'conAAcb', 'conBAcb', 'fire1Feed', 'fire2Feed', 'cooling1Feed', 'cooling2Feed',
        'ballastFeed', 'bilgeFeed', 'steerFeed', 'craneFeed', 'navFeed',
        'lightAFeed', 'lightBFeed', 'galleyFeed'
      ]) {
        s.closed[b] = false;
      }
      s.running.eg = true;
      s.closed.egBreaker = true;
      return s;
    },
    focus: 'eBus'
  },
  {
    id: 'parallel',
    title: '05 · Parallel & Sync DG 2',
    instruction: 'DG 2 is running on standby while DG 1 feeds Bus A. Use the Synchroscope (Auto-Sync or manual 12 o’clock close) to parallel DG 2 and share kW load.',
    apply: (): SimState => {
      const s = initialState();
      s.running.dg2 = true;
      s.closed.gb2 = false;
      s.closed.propFeed = true;
      s.closed.cooling1Feed = true;
      return s;
    },
    focus: 'dg2'
  },
  {
    id: 'heavyload',
    title: '06 · Heavy Sea Load & Symmetrical Redundancy',
    instruction: 'DG 1 and DG 3 are paralleled across the bus tie supplying both Port and Starboard propulsion, reefers, pumps, and accommodation loads. Test PMS load shedding.',
    apply: (): SimState => {
      const s = initialState();
      s.running.dg1 = true;
      s.closed.gb1 = true;
      s.running.dg3 = true;
      s.closed.gb3 = true;
      s.closed.propFeed = true;
      s.closed.cooling1Feed = true;
      s.closed.cooling2Feed = true;
      s.closed.steerFeed = true;
      s.closed.fire1Feed = true;
      s.closed.ballastFeed = true;
      s.closed.reeferAFeed = true;
      s.closed.reeferBFeed = true;
      s.closed.conAAcb = true;
      s.closed.conBAcb = true;
      s.closed.lightAFeed = true;
      s.closed.lightBFeed = true;
      s.closed.galleyFeed = true;
      return s;
    },
    focus: 'busA'
  }
] as const;


