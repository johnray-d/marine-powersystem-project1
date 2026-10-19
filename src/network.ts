export type NodeKind = 'generator' | 'emergency-generator' | 'bus' | 'emergency-bus' | 'transformer' | 'drive' | 'motor' | 'propeller' | 'thruster' | 'pump' | 'load' | 'future';
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
  n('dg1','Diesel-generator 1','DG 1','generator',VOLTAGES.hv,'Engine room','A diesel engine turns an alternator to make electrical power.','Source → generator breaker → main bus A','Running; breaker closed','The engine supplies mechanical energy; the alternator converts it to electricity. This engine does not turn the propeller shaft.',80,80,'generator',true),
  n('dg2','Diesel-generator 2','DG 2','generator',VOLTAGES.hv,'Engine room','Second main electrical source.','Source → generator breaker → main bus A','Standby; breaker open','Any available generator can feed its bus section when its breaker is closed.',80,145,'generator',true),
  n('dg3','Diesel-generator 3','DG 3','generator',VOLTAGES.hv,'Engine room','Third main electrical source.','Source → generator breaker → main bus B','Standby; breaker open','Bus B can be supplied independently of bus A when the tie is open.',880,80,'generator',true),
  n('dg4','Diesel-generator 4','DG 4','generator',VOLTAGES.hv,'Engine room','Fourth main electrical source.','Source → generator breaker → main bus B','Standby; breaker open','This is a representative four-set arrangement, not a particular ship design.',880,145,'generator',true),
  n('busA','Main switchboard · A','BUS A','bus',VOLTAGES.hv,'Engine control room','Receives main generators and distributes medium-voltage power.','DG 1/2 → bus A → propulsion and transformer A','Energized when DG 1 feeds it','A busbar is a common electrical connection inside a switchboard.',260,125,'hv-board',true),
  n('busB','Main switchboard · B','BUS B','bus',VOLTAGES.hv,'Engine control room','Second section of the main medium-voltage switchboard.','DG 3/4 → bus B → thrusters and transformer B','Joined to bus A by closed tie','Opening the bus tie separates the two sections.',700,125,'hv-board',true),
  n('drive','Propulsion drive / converter','DRIVE','drive',VOLTAGES.hv,'Aft machinery space','Conditions electrical supply and controls motor speed and torque.','Bus A → drive → propulsion motor','Feeder closed','The drive sits between the switchboard and motor. It is shown as a functional block; no power-electronic calculations are performed.',215,265,'drive',true),
  n('motor','Electric propulsion motor','MOTOR','motor',VOLTAGES.hv,'Aft machinery space','Turns the propeller shaft using electrical power from the drive.','Drive → motor → propeller','Available when drive is powered','The diesel generators supply electricity; this motor drives the main propeller.',215,355,'motor',true),
  n('prop','Main propeller','PROP','propeller','Mechanical','Stern','Converts motor shaft rotation into thrust.','Motor → propeller','Turns when propulsion motor is supplied','The propeller is mechanically linked to the electric motor only.',215,440,'propeller',true),
  n('bow','Bow thruster','BOW','thruster',VOLTAGES.hv,'Forward tunnel','Helps maneuver the bow sideways at low speed.','Bus B → feeder → thruster drive/motor','Feeder open','A simplified thruster assembly represents its motor, shaft, and propeller.',880,265,'thruster',true),
  n('txA','Main transformer A','TX A','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space','Steps power down for main low-voltage distribution.',`Bus A → transformer A → ${VOLTAGES.lv} board`,'Connected','Its windings transfer energy magnetically while changing the voltage level.',330,245,'transformer',true),
  n('txB','Main transformer B','TX B','transformer',`${VOLTAGES.hv} / ${VOLTAGES.lv}`,'Machinery space','Second path to low-voltage distribution.',`Bus B → transformer B → ${VOLTAGES.lv} board`,'Connected',`The two transformer inputs are shown as separate paths to the same provisional ${VOLTAGES.lv} board.`,770,245,'transformer'),
  n('lvBus','Main LV switchboard',VOLTAGES.lv,'bus',VOLTAGES.lv,'Machinery space','Distributes provisional low-voltage power to machinery and services.',`Transformers → ${VOLTAGES.lv} board → feeders`,'Available when either transformer is supplied','This voltage and grouping are provisional teaching assumptions.',550,320,'lv-board',true),
  n('reefer','Reefer distribution','REEFERS','load',VOLTAGES.lv,'Container bays','Feeds grouped refrigerated-container outlets.',`${VOLTAGES.lv} board → reefer feeder → container sockets`,'Feeder open','Reefer sockets are grouped to keep the first-version diagram readable.',405,450,'reefer',true),
  n('reeferUnit','Reefer container · refrigeration unit','REEFER 1','load',VOLTAGES.lv,'Forward cargo bay, outer row','Refrigeration unit of one refrigerated container. Its compressor, condenser fan and controller keep the cargo cold.',`${VOLTAGES.lv} board → reefer feeder → container socket → refrigeration unit`,'Socket breaker closed; supplied when the reefer feeder is closed','A dry container needs no power, but a reefer must be supplied for the whole voyage or its cargo spoils. When the unit is powered its condenser fan turns and its status light turns green.',405,520,undefined,true),
  n('crane','Cargo crane','CRANE','load',VOLTAGES.lv,'Cargo deck','Representative electrically supplied cargo crane.',`${VOLTAGES.lv} board → crane feeder`,'Feeder open','Not every container ship carries its own crane; this is a teaching example.',520,450),
  n('fire','Fire pump','FIRE PUMP','pump',VOLTAGES.lv,'Machinery space','Main-service pump for the ship fire main.',`${VOLTAGES.lv} board → fire-pump feeder`,'Feeder open','This normal fire pump is distinct from the emergency fire pump.',635,450,'pump'),
  n('ballast','Ballast pump','BALLAST','pump',VOLTAGES.lv,'Lower machinery space','Moves ballast water for vessel trim and stability.',`${VOLTAGES.lv} board → ballast feeder`,'Feeder open','The simulator only shows whether supply is connected, not whether a pump is commanded to run.',750,450,'pump'),
  n('bilge','Bilge pump','BILGE','pump',VOLTAGES.lv,'Lower machinery space','Moves collected water from bilge spaces.',`${VOLTAGES.lv} board → bilge feeder`,'Feeder open','Real bilge systems have controls and safeguards beyond this connectivity model.',860,450,'pump'),
  n('cooling','Cooling pump','COOLING','pump',VOLTAGES.lv,'Machinery space','Circulates cooling water for machinery.',`${VOLTAGES.lv} board → cooling feeder`,'Feeder open','Cooling is a representative auxiliary load.',975,450,'pump'),
  n('steering','Steering gear','STEERING','load',VOLTAGES.lv,'Aft steering compartment','Moves the rudder for steering.',`${VOLTAGES.lv} board → steering feeder`,'Feeder open','The emergency scenario includes a separate essential steering service branch.',285,535),
  n('tx220','Consumer transformer','TX CON','transformer',`${VOLTAGES.lv} / ${VOLTAGES.consumer}`,'Accommodation','Steps power down to the provisional consumer board.',`${VOLTAGES.lv} board → transformer → ${VOLTAGES.consumer} board`,'Connected','Voltage labels are centralized so confirmed references can replace these assumptions.',555,535,'transformer'),
  n('consumer','Consumer distribution',VOLTAGES.consumer,'bus',VOLTAGES.consumer,'Accommodation','Distributes power to ordinary domestic and service loads.',`Consumer transformer → ${VOLTAGES.consumer} board → loads`,`Available when ${VOLTAGES.lv} board is powered`,'This is a simplified single consumer board.',555,615,'lv-board'),
  n('galley','Galley','GALLEY','load',VOLTAGES.consumer,'Accommodation','Representative galley appliances.',`${VOLTAGES.consumer} board → galley feeder`,'Feeder open','Galley equipment is grouped as one representative load.',350,700),
  n('lights','Cabin lights (group)','LIGHTS','load',VOLTAGES.consumer,'Accommodation','Four representative lighting circuits.',`${VOLTAGES.consumer} board → lighting feeder`,'Feeder open','This group represents cabin, corridor, deck, and machinery-space lights.',495,700),
  n('outlets','Service outlets (group)','OUTLETS','load',VOLTAGES.consumer,'Accommodation','Three representative convenience-outlet circuits.',`${VOLTAGES.consumer} board → outlet feeder`,'Feeder open','This group represents cabin, workshop, and bridge outlets.',640,700),
  n('eg','Emergency generator','EM GEN','emergency-generator',VOLTAGES.lv,'Upper deck, separated space','Independent source for selected essential services.','Emergency generator → emergency breaker → emergency board','Standby; breaker open','In this simplified lesson, start it and close its breaker after loss of main power.',80,585,'generator',true),
  n('eBus','Emergency switchboard','EM BUS','emergency-bus',VOLTAGES.lv,'Protected upper-deck space','Distributes emergency-generator power to selected essentials.','Emergency generator → emergency board → essential feeders','Dead until emergency generator connects','The emergency board has no automatic backfeed from the main board in V1.',115,665,'lv-board',true),
  n('eFire','Emergency fire pump','EM FIRE','pump',VOLTAGES.lv,'Separated emergency location','Provides a separate fire-main pumping option.','Emergency board → emergency fire-pump feeder','Feeder closed','Its separate location and supply illustrate resilience.',80,755,'pump'),
  n('eSteer','Essential steering service','EM STEER','load',VOLTAGES.lv,'Aft steering compartment','Representative emergency steering support circuit.','Emergency board → essential steering feeder','Feeder closed','Actual steering requirements depend on vessel design and rules.',220,755),
  n('nav','Bridge / navigation','BRIDGE','load',VOLTAGES.lv,'Bridge','Representative essential bridge and navigation supply.','Emergency board → bridge feeder','Feeder closed','Real navigation supplies can include batteries and UPS units not shown here.',360,755),
  n('eLights','Emergency lighting','EM LIGHT','load',VOLTAGES.lv,'Escape routes','Representative essential lighting circuit.','Emergency board → lighting feeder','Feeder closed','Emergency lighting is kept separate from the ordinary lighting group.',500,755),
  n('shore','Shore connection (Cold Ironing)','SHORE','future',VOLTAGES.hv,'Port side deck','6.6 kV port cold-ironing shore connection box with phase-sequence and generator interlock.','Shore box → shore breaker → main bus A','Disconnected at sea; interlocked with main DGs','In port, shore power can supply the main 6.6 kV bus once all ship main generator breakers are open (black transfer) or synchronized.',80,220,undefined,true)
];

const edge = (id: string, from: string, to: string, name: string, breaker = false, normalClosed = true, model?: ModelType, purpose?: string, lesson?: string): Connection => ({id,from,to,name,breaker,normalClosed,model,purpose,lesson});
export const connections: Connection[] = [
  edge('gb1','dg1','busA','DG 1 breaker',true,true,'breaker'), edge('gb2','dg2','busA','DG 2 breaker',true,false,'breaker'),
  edge('gb3','dg3','busB','DG 3 breaker',true,false,'breaker'), edge('gb4','dg4','busB','DG 4 breaker',true,false,'breaker'),
  edge('shoreBreaker','shore','busA','Shore-connection breaker',true,false,'breaker','Connects 6.6 kV port cold-ironing supply to Main Bus A when main generators are isolated.','Interlocked with main generator breakers so ship generators and shore supply are not inadvertently cross-connected out of phase.'),
  edge('tie','busA','busB','Bus-tie vacuum breaker',true,true,'breaker','Joins or separates the two main bus sections.','A closed tie can energize both sections from one running generator. Open it to isolate the sections.'),
  edge('propFeed','busA','drive','Propulsion feeder breaker',true,false,'breaker'), edge('driveMotor','drive','motor','Drive output'), edge('shaft','motor','prop','Propeller shaft'),
  edge('bowFeed','busB','bow','Bow-thruster feeder breaker',true,false,'breaker'),
  edge('txAFeed','busA','txA','Transformer A feeder breaker',true,true,'breaker'), edge('txBFeed','busB','txB','Transformer B feeder breaker',true,true,'breaker'),
  edge('txAOut','txA','lvBus','Transformer A output'), edge('txBOut','txB','lvBus','Transformer B output'),
  edge('reeferFeed','lvBus','reefer','Reefer feeder breaker',true,false,'breaker'), edge('reeferPlug','reefer','reeferUnit','Reefer container socket breaker',true,true,'breaker','Switches the supply to one reefer container through its socket and plug.','Opening this breaker isolates only this container. The reefer feeder and the other sockets are unaffected.'), edge('craneFeed','lvBus','crane','Cargo-crane feeder breaker',true,false,'breaker'),
  edge('fireFeed','lvBus','fire','Fire-pump feeder breaker',true,false,'breaker'), edge('ballastFeed','lvBus','ballast','Ballast-pump feeder breaker',true,false,'breaker'),
  edge('bilgeFeed','lvBus','bilge','Bilge-pump feeder breaker',true,false,'breaker'), edge('coolingFeed','lvBus','cooling','Cooling-pump feeder breaker',true,false,'breaker'),
  edge('steerFeed','lvBus','steering','Steering-gear feeder breaker',true,false,'breaker'),
  edge('tx220Feed','lvBus','tx220','Consumer-transformer feeder breaker',true,true,'breaker'), edge('tx220Out','tx220','consumer','Consumer transformer output'),
  edge('galleyFeed','consumer','galley','Galley feeder breaker',true,false,'breaker'), edge('lightFeed','consumer','lights','Ordinary-lighting feeder breaker',true,false,'breaker'), edge('outletFeed','consumer','outlets','Service-outlet feeder breaker',true,false,'breaker'),
  edge('egBreaker','eg','eBus','Emergency generator breaker',true,false,'breaker'),
  edge('eFireFeed','eBus','eFire','Emergency fire-pump feeder',true,true,'breaker'), edge('eSteerFeed','eBus','eSteer','Essential steering feeder',true,true,'breaker'),
  edge('navFeed','eBus','nav','Bridge / navigation feeder',true,true,'breaker'), edge('eLightFeed','eBus','eLights','Emergency-lighting feeder',true,true,'breaker')
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
      // Only the bus tie is bidirectional in this introductory model.
      const next = c.from === here ? c.to : c.id === 'tie' && c.to === here ? c.from : null;
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
  {id:'main', title:'01 · Energize the main bus', instruction:`DG 1 is running with its breaker and the bus tie closed. Both ${VOLTAGES.hv} sections are live.`, apply:():SimState => initialState(), focus:'busA'},
  {id:'propulsion', title:'02 · Supply propulsion', instruction:'Trace DG 1 → bus A → propulsion feeder → drive → electric motor → propeller.', apply:():SimState => {const s=initialState();s.closed.propFeed=true;s.closed.coolingFeed=true;s.closed.steerFeed=true;return s;}, focus:'drive'},
  {id:'tie', title:'03 · Open the bus tie', instruction:'With only DG 1 running, bus B loses power when the tie opens. Start DG 3 and close its breaker to restore bus B independently.', apply:():SimState => {const s=initialState();s.closed.tie=false;return s;}, focus:'tie'},
  {
    id:'emergency',
    title:'04 · SOLAS Blackout Waterfall',
    instruction:'Total blackout: all main feeders shed via UVR so loads do NOT energize simultaneously. The 5-stage SOLAS sequential waterfall restores ESB (0–10s), Stage 1 Aux (10–20s), Stage 2 Cooling/Fuel (20–30s), Stage 3 Essential (30–45s), and Heavy Loads (>45s).',
    apply:():SimState => {
      const s=initialState();
      for(const id of ['dg1','dg2','dg3','dg4']){
        s.running[id]=false;
        s.closed[`gb${id.slice(2)}`]=false;
      }
      for(const b of ['propFeed','bowFeed','txAFeed','txBFeed','reeferFeed','craneFeed','fireFeed','ballastFeed','bilgeFeed','coolingFeed','steerFeed','tx220Feed','galleyFeed','lightFeed','outletFeed']){
        s.closed[b]=false;
      }
      s.running.eg=true;
      s.closed.egBreaker=true;
      return s;
    },
    focus:'eBus'
  },
  {id:'parallel', title:'05 · Parallel & sync DG 2', instruction:'DG 2 is running on standby while DG 1 feeds the bus. Use the Synchroscope (Auto-Sync or manual 12 o’clock close) to parallel DG 2 and share kW load.', apply:():SimState => {const s=initialState();s.running.dg2=true;s.closed.gb2=false;s.closed.propFeed=true;s.closed.coolingFeed=true;return s;}, focus:'dg2'},
  {id:'heavyload', title:'06 · Heavy sea load & PMS', instruction:'DG 1 and DG 3 are paralleled across the bus tie supplying propulsion, pumps, reefers, and hotel loads. Adjust propulsion throttle or trip a generator to test PMS load shedding.', apply:():SimState => {const s=initialState();s.running.dg1=true;s.closed.gb1=true;s.running.dg3=true;s.closed.gb3=true;s.closed.propFeed=true;s.closed.coolingFeed=true;s.closed.steerFeed=true;s.closed.fireFeed=true;s.closed.bilgeFeed=true;s.closed.reeferFeed=true;s.closed.lightFeed=true;s.closed.galleyFeed=true;return s;}, focus:'busA'}
] as const;


