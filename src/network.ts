export type NodeKind = 'generator' | 'emergency-generator' | 'bus' | 'emergency-bus' | 'transformer' | 'drive' | 'motor' | 'propeller' | 'thruster' | 'pump' | 'reefer' | 'reefer-container' | 'load' | 'future';
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
  // --- 6.6 kV Generation Sources (Level 1: Y = 110) ---
  n('dg1','Diesel-generator 1 (Port)','DG 1','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW main synchronous diesel generator supplying Port Bus A.','Source → generator breaker gb1 → main bus A','Running; breaker closed','The prime mover provides mechanical energy; the 6.6 kV alternator produces medium-voltage electricity.',110,110,'generator',true),
  n('dg2','Diesel-generator 2 (Port)','DG 2','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW second main electrical source for Port Bus A.','Source → generator breaker gb2 → main bus A','Standby; breaker open','Any available generator can feed its bus section when synchronized and closed.',240,110,'generator',true),
  n('shore','High Voltage Shore Power Connection (6.6 kV)','SHORE POWER','future',VOLTAGES.hv,'Port deck','6.6 kV port cold-ironing shore connection box with phase-sequence and interlock protection.','Shore box → shore breaker → main bus A','Disconnected at sea; interlocked with DGs','In port, shore power can supply Main Bus A once generator breakers are open (black transfer) or synchronized.',380,110,undefined,true),
  n('dg3','Diesel-generator 3 (Starboard)','DG 3','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW third main electrical source supplying Starboard Bus B.','Source → generator breaker gb3 → main bus B','Standby; breaker open','Bus B can be supplied independently of Bus A when the bus tie is open.',1190,110,'generator',true),
  n('dg4','Diesel-generator 4 (Starboard)','DG 4','generator',VOLTAGES.hv,'Engine room','6.6 kV / 3.5 MW fourth main electrical source for Starboard Bus B.','Source → generator breaker gb4 → main bus B','Standby; breaker open','Symmetrical 4-generator dual-bus redundancy ensures high vessel availability.',1320,110,'generator',true),

  // --- 6.6 kV Main High-Voltage Switchboards (Level 1 Busbars: Y = 180) ---
  n('busA','6.6 kV Main Switchboard · Bus A (Port)','6.6 kV BUS A (PORT)','bus',VOLTAGES.hv,'Engine control room','Receives DG 1/2 and shore supply; distributes 6.6 kV power to Port machinery.','DG 1/2 → Bus A → TX A, TX REEFER A, Propulsion VFD Drive 1','Energized when DG 1 feeds it','Medium-voltage switchgear busbar feeding transformers and heavy propulsion.',395,180,'hv-board',true),
  n('busB','6.6 kV Main Switchboard · Bus B (Starboard)','6.6 kV BUS B (STARBOARD)','bus',VOLTAGES.hv,'Engine control room','Receives DG 3/4; distributes 6.6 kV power to Starboard machinery and Bow Thruster.','DG 3/4 → Bus B → TX B, TX REEFER B, Bow Thruster VFD Drive 2','Joined to Bus A by 6.6 kV Bus Tie','Opening the 6.6 kV Bus Tie separates the grid into two isolated islands.',1105,180,'hv-board',true),

  // --- 6.6 kV Feeders & Heavy Machinery (Level 1 Drops) ---
  n('drive','Propulsion VFD Drive 1 (5.6 kV / 3-Phase Motor)','PROPULSION VFD 1','drive',VOLTAGES.hv,'Aft machinery space','Conditions 6.6 kV supply and controls propulsion motor speed and torque via PWM inverter.','Bus A → DRIVE 1 VCB → Drive 1 → Propulsion Motor','Feeder closed','Water-cooled variable frequency converter for main electric shaft propulsion.',480,275,'drive',true),
  n('motor','Electric Propulsion Motor (5.6 kV / 3-Phase)','PROP MOTOR','motor',VOLTAGES.hv,'Aft machinery space','5.6 kV synchronous electric propulsion motor driving the propeller shaft.',`Drive 1 → Propulsion Motor → Propeller shaft`,'Available when Drive 1 is powered','Directly turns the main shaft without mechanical reduction gears.',480,340,'motor',true),
  n('prop','Main Propeller Shaft','PROP SHAFT','propeller','Mechanical','Stern','Fixed-pitch bronze propeller converting motor shaft rotation into vessel thrust.','Motor → Propeller','Turns when propulsion motor is supplied','Mechanically linked to the propulsion motor shaft.',480,395,'propeller',true),

  n('txReeferA','TX REEFER A (6.6 kV / 440 V, 1.5 MVA)','TX REEFER A','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Forward machinery space (Port)','1.5 MVA step-down transformer stepping 6.6 kV Bus A down to Reefer Board A.','Bus A → REEFER A VCB → TX REEFER A → Reefer Board A','Connected; 1.5 MVA rated','Dedicated step-down transformer isolating cyclical refrigerated container compressor surges.',580,260,'transformer',true),
  n('reeferA','Reefer Board A (Port Cargo Bays)','REEFER BOARD A','reefer',VOLTAGES.lv,'Cargo bay deck (Port)','Feeds grouped refrigerated-container sockets on Port cargo bays.',`TX REEFER A → Reefer Board A → Container sockets`,'Supplied by TX REEFER A','Dedicated 440 V container refrigeration switchboard.',580,340,'reefer',true),
  n('reeferUnitA','Refrigerated Container Load A (Port Bay 4)','REEFER LOAD A','reefer-container',VOLTAGES.lv,'Port cargo bay deck','40-foot integral refrigerated container plugged into Reefer Board A socket.','Reefer Board A → reefer plug A → container refrigeration unit A','Refrigeration running; fan spinning','Electric semi-hermetic compressor, condenser fan and evaporator keep temperature-sensitive cargo down to -25°C.',580,395,undefined,true),

  n('txA','TX A (6.6 kV / 440 V Dry-Type Cast Resin, 2.5 MVA)','TX A','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space (Port)','2.5 MVA step-down transformer stepping 6.6 kV Bus A down to 440 V Bus A.',`Bus A → TX A VCB → TX A → TX A ACB → 440 V Bus A`,'Connected; 2.5 MVA rated','Magnetic induction transfers power while reducing voltage from 6.6 kV to 440 V.',680,260,'transformer',true),
  n('txB','TX B (6.6 kV / 440 V Dry-Type Cast Resin, 2.5 MVA)','TX B','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space (Starboard)','2.5 MVA step-down transformer stepping 6.6 kV Bus B down to 440 V Bus B.',`Bus B → TX B VCB → TX B → TX B ACB → 440 V Bus B`,'Connected; 2.5 MVA rated','Starboard redundant transformer guaranteeing 100% low-voltage power if TX A is isolated.',820,260,'transformer',true),

  n('txReeferB','TX REEFER B (6.6 kV / 440 V, 1.5 MVA)','TX REEFER B','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Forward machinery space (Starboard)','1.5 MVA step-down transformer stepping 6.6 kV Bus B down to Reefer Board B.','Bus B → REEFER B VCB → TX REEFER B → Reefer Board B','Connected; 1.5 MVA rated','Starboard dedicated reefer transformer providing symmetrical cargo container cooling capacity.',920,260,'transformer',true),
  n('reeferB','Reefer Board B (Starboard Cargo Bays)','REEFER BOARD B','reefer',VOLTAGES.lv,'Cargo bay deck (Starboard)','Feeds grouped refrigerated-container sockets on Starboard cargo bays.',`TX REEFER B → Reefer Board B → Container sockets`,'Supplied by TX REEFER B','Symmetrical starboard container refrigeration switchboard.',920,340,'reefer',true),
  n('reeferUnitB','Refrigerated Container Load B (Starboard Bay 4)','REEFER LOAD B','reefer-container',VOLTAGES.lv,'Starboard cargo bay deck','40-foot integral refrigerated container plugged into Reefer Board B socket.','Reefer Board B → reefer plug B → container refrigeration unit B','Refrigeration running; fan spinning','Symmetrical starboard reefer container load with active condenser cooling fan.',920,395,undefined,true),

  n('bow','Bow Thruster VFD Drive 2 (6.6 kV / 3-Phase Motor)','BOW THRUSTER','thruster',VOLTAGES.hv,'Watertight Bow Compartment','6.6 kV variable-speed transverse thruster located inside watertight compartment for harbor maneuvering.',`Bus B → THRUSTER VCB → Bow Thruster VFD 2`,'Feeder open','Large motor assembly with integral right-angle bevel gear and tunnel propeller.',1250,275,'thruster',true),

  // --- 440 V Main Low-Voltage Switchboards (Level 2 Busbars: Y = 440) ---
  n('lvBusA','440 V Main Switchboard · Bus A (Port)','440 V BUS A','bus',VOLTAGES.lv,'Engine room (Port)','Distributes 440 V 3-phase power to Port engine room auxiliaries, Galley Primary Board, and Control TX A.',`TX A → 440 V Bus A → Galley, Pumps, Crane & TX CON A`,'Live when TX A or 440 V Bus Tie is closed','Main low-voltage switchboard section with 440 V bus tie to Starboard Bus B.',395,440,'lv-board',true),
  n('lvBusB','440 V Main Switchboard · Bus B (Starboard)','440 V BUS B','bus',VOLTAGES.lv,'Engine room (Starboard)','Distributes 440 V 3-phase power to Starboard machinery, Ballast, Bilge, and Control TX B.',`TX B → 440 V Bus B → Starboard pumps & TX CON B`,'Live when TX B or 440 V Bus Tie is closed','Starboard low-voltage switchboard section joined by the 440 V Bus Tie.',1105,440,'lv-board',true),

  // --- 440 V Port Auxiliary Machinery & Galley Primary Board (Level 2 Loads: Y = 530) ---
  n('galley440','440 V Galley Primary Board (Ovens, Deep Fryers)','GALLEY 440V','load',VOLTAGES.lv,'Accommodation / Service corridor','Heavy cooking thermal loads: electric ovens, deep fat fryers, ranges, and exhaust ventilation with outdoor emergency shunt trip.','440 V Bus A → Galley ACB → 440 V Galley Primary Board','Feeder closed; armed for emergency shunt trip','SOLAS II-2 Reg 9.2: Cooking appliances and exhaust ventilation must have emergency remote shutdown outside the galley.',110,530,undefined,true),
  n('fire1','Fire Pump 1 (Port)','FIRE PUMP 1','pump',VOLTAGES.lv,'Machinery space (Port)','Main service pump for vessel fire main from Port 440 V bus.','440 V Bus A → Fire Pump 1 feeder','Feeder open','Normal centrifugal fire pump supplying deck wash and fire hydrants.',230,530,'pump',true),
  n('cooling1','Sea Water Cooling Pump 1 (Port)','SW COOLING 1','pump',VOLTAGES.lv,'Machinery space (Port)','Circulates seawater to central coolers for Port machinery.','440 V Bus A → SW Cooling 1 feeder','Feeder closed','Continuous duty essential auxiliary pump.',350,530,'pump',true),
  n('airCompressor','Main Starting Air Compressor & Receiver Skid','AIR COMPRESSOR','pump',VOLTAGES.lv,'Lower machinery space (Port)','30 bar reciprocating starting air compressor with air bottle skid and auto unloader.','440 V Bus A → Air Compressor feeder','Feeder open','Stage 3 essential auxiliary compressor supplying engine starting air.',230,600,undefined,true),
  n('crane','Deck Cargo Crane Feeder','DECK CRANE','load',VOLTAGES.lv,'Cargo deck','Electro-hydraulic deck crane for container handling and stores loading.','440 V Bus A → Deck Crane feeder','Feeder open','High inrush heavy machinery load.',470,530,undefined,true),

  // --- 440 V / 220 V Dual Auxiliary / Control Transformers (500 kVA each, Y = 560) ---
  n('txConA','TX CON A (440 V / 220 V, 500 kVA)','TX CON A','transformer',`${VOLTAGES.lv} / ${VOLTAGES.consumer}`,'Accommodation (Port)','500 kVA transformer stepping 440 V Bus A down to 220 V Bus A.','440 V Bus A → CON A ACB → TX CON A → 220 V Bus A','Connected; 500 kVA rated','Provides isolated 220 V single-phase and 3-phase power for Bridge and Port lighting.',600,560,'transformer',true),
  n('txConB','TX CON B (440 V / 220 V, 500 kVA)','TX CON B','transformer',`${VOLTAGES.lv} / ${VOLTAGES.consumer}`,'Accommodation (Starboard)','500 kVA transformer stepping 440 V Bus B down to 220 V Bus B.','440 V Bus B → CON B ACB → TX CON B → 220 V Bus B','Connected; 500 kVA rated','Starboard control transformer feeding Galley and Starboard accommodation.',900,560,'transformer',true),

  // --- 440 V Starboard Auxiliary Machinery (Level 2 Loads: Y = 530) ---
  n('fire2','Fire Pump 2 (Starboard)','FIRE PUMP 2','pump',VOLTAGES.lv,'Machinery space (Starboard)','Secondary main fire pump powered from Starboard 440 V bus for full redundancy.','440 V Bus B → Fire Pump 2 feeder','Feeder open','Independent fire main pump.',1030,530,'pump',true),
  n('cooling2','Sea Water Cooling Pump 2 (Starboard)','SW COOLING 2','pump',VOLTAGES.lv,'Machinery space (Starboard)','Circulates seawater to central coolers for Starboard machinery.','440 V Bus B → SW Cooling 2 feeder','Feeder closed','Continuous duty seawater cooling pump.',1150,530,'pump',true),
  n('ventFan','Engine Room Heavy Axial Ventilation Fan','ER VENT FAN','load',VOLTAGES.lv,'Funnel casing / ER trunk','Primary machinery space forced-draft supply ventilation fan interlocked with remote fire shut-off.','440 V Bus B → ER Vent Fan feeder','Feeder closed','Heavy axial fan with quick-closing fire damper and local starter box.',1030,600,undefined,true),
  n('ballast','Ballast Pump','BALLAST PUMP','pump',VOLTAGES.lv,'Lower machinery space','Transfers seawater between ballast tanks for vessel trim, heel, and draft.','440 V Bus B → Ballast feeder','Feeder open','High-capacity centrifugal ballast pump.',1270,530,'pump',true),
  n('bilge','Machinery Bilge Pump','BILGE PUMP','pump',VOLTAGES.lv,'Lower machinery space','Evacuates oily water from engine room bilge wells to separator.','440 V Bus B → Bilge feeder','Feeder open','Reciprocating positive-displacement pump.',1390,530,'pump',true),

  // --- 220 V Sub-Boards (Level 3 Busbars: Y = 650) ---
  n('consumerA','220 V Secondary Busbar · Bus A (Port)','220 V BUS A','bus',VOLTAGES.consumer,'Accommodation (Port)','220 V distribution sub-board for Accommodation lighting and small appliances.','TX CON A → 220 V Bus A → Accom Light & Galley Small Appliances','Live when TX CON A or 220 V Tie closed','Low-voltage distribution board with cross-tie to Sub B.',595,650,'lv-board',true),
  n('consumerB','220 V Secondary Busbar · Bus B (Starboard)','220 V BUS B','bus',VOLTAGES.consumer,'Accommodation (Starboard)','220 V distribution sub-board for Navigation Bridge electronics.','TX CON B → 220 V Bus B → Navigation Bridge','Live when TX CON B or 220 V Tie closed','Low-voltage distribution board with cross-tie to Sub A.',905,650,'lv-board',true),

  // --- 220 V Domestic & Service Loads (Level 3 Loads: Y = 720) ---
  n('lightsA','Accommodation Lighting & Outlets','ACCOM LIGHTING & OUTLETS','load',VOLTAGES.consumer,'Accommodation (Port)','Cabin, corridor, and machinery space domestic lighting circuits.','220 V Bus A → Lighting feeder','Feeder closed','Domestic and service lighting branch.',520,720,undefined,true),
  n('galleySmall','Galley Small Appliances','GALLEY SMALL APPLIANCES','load',VOLTAGES.consumer,'Accommodation (Port/Galley)','Galley prep counters, food processors, microwave ovens, and convenience outlets.','220 V Bus A → Galley Small Appliances feeder','Feeder closed','Domestic 220 V culinary branch circuit.',650,720,undefined,true),
  n('nav','Navigation Bridge Electronics','NAVIGATION BRIDGE ELECTRONICS','load',VOLTAGES.consumer,'Navigation Bridge','Bridge control consoles, radars, ECDIS, and navigational electronics.','220 V Bus B → Bridge feeder','Feeder closed','Essential bridge navigational and automation supply.',900,720,undefined,true),

  // --- 440 V SOLAS Emergency Switchboard (ESB) & Loads (Level 4: Y = 840 to 915) ---
  n('eBus','440 V Emergency Switchboard (ESB)','440 V EMERGENCY SWITCHBOARD (ESB)','emergency-bus',VOLTAGES.lv,'Upper deck emergency compartment','Distributes emergency generator power to SOLAS essential circuits during blackout.','Emergency DG → EDG CB → ESB → Essential feeders','Standby; energized during blackout','Physically separated above the bulkhead deck for flood and fire survivability.',440,840,'lv-board',true),
  n('eg','Emergency Diesel Generator (EDG 440 V)','EMERGENCY DIESEL GENERATOR (EDG 440 V)','emergency-generator',VOLTAGES.lv,'Upper deck emergency compartment','440 V / 600 kW autonomous diesel generator auto-starting within 10s of blackout.','Emergency generator → EDG CB → ESB','Standby; breaker open','Autonomous starting via dual air/hydraulic starters with dedicated fuel supply.',150,780,'generator',true),
  n('eSteer','Emergency Steering Gear Unit','EMERGENCY STEERING GEAR UNIT','load',VOLTAGES.lv,'Aft steering compartment','Alternative auxiliary electrical supply for rudder operation during main power failure.','ESB → Emergency Steering feeder','Feeder closed','Mandatory SOLAS Chapter II-1 redundancy requirement.',260,915,undefined,true),
  n('eFire','Emergency Fire Pump','EMERGENCY FIRE PUMP','pump',VOLTAGES.lv,'Forward separated compartment','Independent fire pump capable of operating during complete machinery space flooding.','ESB → Emergency Fire Pump feeder','Feeder closed','Complies with SOLAS II-2 fire safety regulations.',400,915,'pump',true),
  n('eLights','Emergency Lighting & Exit Signals','EMERGENCY LIGHTING & EXIT SIGNALS','load',VOLTAGES.lv,'Escape routes & Bridge','Illuminates escape trunks, boat decks, lifeboats, and command centers.','ESB → Emergency Lighting feeder','Feeder closed','Essential emergency escape illumination.',540,915,undefined,true),
  n('eRadio','24V DC Battery UPS (GMDSS / Radio / NavCom)','24V DC BATTERY UPS (GMDSS / RADIO / NAVCOM)','load',VOLTAGES.lv,'Navigation Bridge','GMDSS satellite communication, VHF distress radios, and emergency GPS.','ESB → Radio feeder','Feeder closed','Emergency radio communications and distress alerting.',680,915,undefined,true)
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
  edge('tie','busA','busB','6.6 kV Bus-Tie vacuum breaker (VCB)',true,true,'breaker','Joins or separates the two main 6.6 kV bus sections.','A closed tie can energize both sections from one running generator. Open it to isolate the sections in split-bus mode.'),

  // --- 6.6 kV Feeders (Drives & Transformers) ---
  edge('propFeed','busA','drive','PROPULSION VFD 1 VCB',true,true,'breaker'),
  edge('driveMotor','drive','motor','Drive 1 output'),
  edge('shaft','motor','prop','Propeller shaft'),

  // Dual Reefer Distribution Transformers (6.6 kV / 440 V, 1.5 MVA)
  edge('reeferAFeed','busA','txReeferA','TX REEFER A VCB',true,true,'breaker'),
  edge('txReeferAOut','txReeferA','reeferA','TX REEFER A output'),
  edge('reeferPlugA','reeferA','reeferUnitA','Reefer Container A supply cable'),

  // Dual Main Step-Down Transformers (6.6 kV / 440 V, 2.5 MVA)
  edge('txAFeed','busA','txA','TX A VCB',true,true,'breaker'),
  edge('txAOut','txA','lvBusA','TX A 440 V ACB',true,true,'breaker'),

  edge('txBFeed','busB','txB','TX B VCB',true,true,'breaker'),
  edge('txBOut','txB','lvBusB','TX B 440 V ACB',true,true,'breaker'),

  edge('reeferBFeed','busB','txReeferB','TX REEFER B VCB',true,true,'breaker'),
  edge('txReeferBOut','txReeferB','reeferB','TX REEFER B output'),
  edge('reeferPlugB','reeferB','reeferUnitB','Reefer Container B supply cable'),

  edge('bowFeed','busB','bow','BOW THRUSTER VCB',true,false,'breaker'),

  // --- 440 V Bus Tie ---
  edge('lvTie','lvBusA','lvBusB','440 V Bus-Tie circuit breaker (ACB)',true,true,'breaker','Joins Port 440 V Bus A and Starboard 440 V Bus B.','Allows low-voltage power to cross-feed across sides if one main transformer trips.'),

  // --- 440 V Bus A Feeders & Galley Primary Board ---
  edge('galley440Feed','lvBusA','galley440','440 V Galley Primary ACB (Shunt Trip)',true,true,'breaker','Supplies heavy cooking appliances; interlocked with emergency remote shunt trip.','SOLAS II-2 Reg 9.2: Cooking appliances and exhaust ventilation must have emergency remote shutdown outside the galley.'),
  edge('fire1Feed','lvBusA','fire1','Fire Pump 1 feeder (ACB)',true,false,'breaker'),
  edge('cooling1Feed','lvBusA','cooling1','SW Cooling Pump 1 feeder (ACB)',true,true,'breaker'),
  edge('airCompFeed','lvBusA','airCompressor','Air Compressor feeder (ACB)',true,false,'breaker'),
  edge('craneFeed','lvBusA','crane','Deck Crane feeder (ACB)',true,false,'breaker'),
  edge('conAAcb','lvBusA','txConA','TX CON A feeder (ACB)',true,true,'breaker'),
  edge('txConAOut','txConA','consumerA','TX CON A 220 V output'),

  // --- 440 V Bus B Feeders & Control Transformer B ---
  edge('conBAcb','lvBusB','txConB','TX CON B feeder (ACB)',true,true,'breaker'),
  edge('txConBOut','txConB','consumerB','TX CON B 220 V output'),
  edge('fire2Feed','lvBusB','fire2','Fire Pump 2 feeder (ACB)',true,false,'breaker'),
  edge('cooling2Feed','lvBusB','cooling2','SW Cooling Pump 2 feeder (ACB)',true,true,'breaker'),
  edge('ventFanFeed','lvBusB','ventFan','ER Vent Fan feeder (ACB)',true,true,'breaker'),
  edge('ballastFeed','lvBusB','ballast','Ballast Pump feeder (ACB)',true,false,'breaker'),
  edge('bilgeFeed','lvBusB','bilge','Bilge Pump feeder (ACB)',true,false,'breaker'),

  // --- 220 V Bus Tie ---
  edge('consumerTie','consumerA','consumerB','220 V Bus-Tie circuit breaker',true,true,'breaker','Joins 220 V Sub-Board A and 220 V Sub-Board B.','Provides domestic and bridge lighting cross-feed redundancy.'),

  // --- 220 V Feeders ---
  edge('lightAFeed','consumerA','lightsA','Accommodation Lighting & Outlets feeder (MCB)',true,true,'breaker'),
  edge('galleySmallFeed','consumerA','galleySmall','Galley Small Appliances feeder (MCB)',true,true,'breaker'),
  edge('navFeed','consumerB','nav','Navigation Bridge Electronics feeder (MCB)',true,true,'breaker'),

  // --- 440 V Emergency Switchboard (ESB) Connections ---
  edge('esbTieFeed','lvBusA','eBus','ESB Tie Breaker (Interlocked)',true,true,'breaker','Feeds Emergency Switchboard from 440 V Bus A during normal navigation.','Opens automatically on blackout via undervoltage release before EDG starts.'),
  edge('egBreaker','eg','eBus','Emergency DG breaker (EDG CB)',true,false,'breaker'),
  edge('eSteerFeed','eBus','eSteer','Emergency Steering feeder (MCB)',true,true,'breaker'),
  edge('eFireFeed','eBus','eFire','Emergency Fire Pump feeder (MCB)',true,true,'breaker'),
  edge('eLightFeed','eBus','eLights','Emergency Lighting & Exit Signals feeder (MCB)',true,true,'breaker'),
  edge('eRadioFeed','eBus','eRadio','24V DC Battery UPS feeder (MCB)',true,true,'breaker')
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
    instruction: 'Trace DG 1 → 6.6 kV Bus A → PROPULSION VFD 1 VCB → Drive 1 → Propulsion Motor → Propeller, supported by SW Cooling 1 and Steering Gear.',
    apply: (): SimState => {
      const s = initialState();
      s.closed.propFeed = true;
      s.closed.cooling1Feed = true;
      s.closed.cooling2Feed = true;
      s.closed.eSteerFeed = true;
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
        'propFeed', 'bowFeed', 'txAFeed', 'txAOut', 'txBFeed', 'txBOut', 'reeferAFeed', 'reeferBFeed',
        'conAAcb', 'conBAcb', 'fire1Feed', 'fire2Feed', 'cooling1Feed', 'cooling2Feed',
        'craneFeed', 'ballastFeed', 'bilgeFeed', 'galley440Feed', 'navFeed',
        'lightAFeed', 'galleySmallFeed'
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
      s.closed.eSteerFeed = true;
      s.closed.fire1Feed = true;
      s.closed.craneFeed = false;
      s.closed.ballastFeed = true;
      s.closed.reeferAFeed = true;
      s.closed.reeferBFeed = true;
      s.closed.conAAcb = true;
      s.closed.conBAcb = true;
      s.closed.lightAFeed = true;
      s.closed.galleySmallFeed = true;
      s.closed.galley440Feed = true;
      return s;
    },
    focus: 'busA'
  }
] as const;


