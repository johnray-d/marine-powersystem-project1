import {
  type SimState,
  type RelayState,
  type FeederRelayState,
  type EarthingArchitecture,
  type HvEarthingTelemetry,
  powered,
  edgeById,
  byId,
  createInitialRelayState,
  updateProtectiveRelays,
  updateFeederIdmtRelay,
  calculateHvEarthingState
} from './network';
import {
  SOLAS_WATERFALL_STAGES,
  MAIN_BLACKOUT_SHED_BREAKERS,
  createInitialWaterfallStatus,
  type SolasWaterfallStatus
} from './vessel-layout';


export type LoadPriority = 'essential' | 'non-essential' | 'emergency';
export type StartingMethod = 'VFD' | 'Soft-Starter' | 'Star-Delta' | 'DOL' | 'Feeder' | 'Transformer';

export type BusKey = 'busA' | 'busB' | 'lvBusA' | 'lvBusB' | 'consumerA' | 'consumerB' | 'reeferA' | 'reeferB' | 'eBus';

export interface LoadSpec {
  id: string;
  name: string;
  busId: BusKey | 'lvBus' | 'consumer';
  breakerId: string;
  nominalVoltageV: number;
  ratedKw: number;
  powerFactor: number;
  priority: LoadPriority;
  startingMethod: StartingMethod;
  inrushMultiplier: number;
  preferentialTripStage?: 1 | 2;
}

export const LOAD_SPECS: Record<string, LoadSpec> = {
  drive: {
    id: 'drive',
    name: 'Propulsion VFD Drive 1',
    busId: 'busA',
    breakerId: 'propFeed',
    nominalVoltageV: 6600,
    ratedKw: 3600,
    powerFactor: 0.92,
    priority: 'essential',
    startingMethod: 'VFD',
    inrushMultiplier: 1.15
  },
  bow: {
    id: 'bow',
    name: 'Bow Thruster VFD Drive 2',
    busId: 'busB',
    breakerId: 'bowFeed',
    nominalVoltageV: 6600,
    ratedKw: 950,
    powerFactor: 0.85,
    priority: 'non-essential',
    startingMethod: 'Soft-Starter',
    inrushMultiplier: 2.4,
    preferentialTripStage: 2
  },
  reeferA: {
    id: 'reeferA',
    name: 'Reefer Distribution Board A (Port)',
    busId: 'reeferA',
    breakerId: 'reeferAFeed',
    nominalVoltageV: 440,
    ratedKw: 420,
    powerFactor: 0.84,
    priority: 'non-essential',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.4,
    preferentialTripStage: 1
  },
  reeferB: {
    id: 'reeferB',
    name: 'Reefer Distribution Board B (Starboard)',
    busId: 'reeferB',
    breakerId: 'reeferBFeed',
    nominalVoltageV: 440,
    ratedKw: 420,
    powerFactor: 0.84,
    priority: 'non-essential',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.4,
    preferentialTripStage: 1
  },
  fire1: {
    id: 'fire1',
    name: 'Fire Pump 1 (Port)',
    busId: 'lvBusA',
    breakerId: 'fire1Feed',
    nominalVoltageV: 440,
    ratedKw: 95,
    powerFactor: 0.85,
    priority: 'essential',
    startingMethod: 'DOL',
    inrushMultiplier: 5.5
  },
  fire2: {
    id: 'fire2',
    name: 'Fire Pump 2 (Starboard)',
    busId: 'lvBusB',
    breakerId: 'fire2Feed',
    nominalVoltageV: 440,
    ratedKw: 95,
    powerFactor: 0.85,
    priority: 'essential',
    startingMethod: 'DOL',
    inrushMultiplier: 5.5
  },
  cooling1: {
    id: 'cooling1',
    name: 'SW Cooling Pump 1 (Port)',
    busId: 'lvBusA',
    breakerId: 'cooling1Feed',
    nominalVoltageV: 440,
    ratedKw: 135,
    powerFactor: 0.86,
    priority: 'essential',
    startingMethod: 'DOL',
    inrushMultiplier: 5.0
  },
  cooling2: {
    id: 'cooling2',
    name: 'SW Cooling Pump 2 (Starboard)',
    busId: 'lvBusB',
    breakerId: 'cooling2Feed',
    nominalVoltageV: 440,
    ratedKw: 135,
    powerFactor: 0.86,
    priority: 'essential',
    startingMethod: 'DOL',
    inrushMultiplier: 5.0
  },
  ballast: {
    id: 'ballast',
    name: 'Ballast Pump (Port)',
    busId: 'lvBusA',
    breakerId: 'ballastFeed',
    nominalVoltageV: 440,
    ratedKw: 110,
    powerFactor: 0.85,
    priority: 'non-essential',
    startingMethod: 'Star-Delta',
    inrushMultiplier: 2.2,
    preferentialTripStage: 2
  },
  bilge: {
    id: 'bilge',
    name: 'Machinery Bilge Pump',
    busId: 'lvBusA',
    breakerId: 'bilgeFeed',
    nominalVoltageV: 440,
    ratedKw: 38,
    powerFactor: 0.82,
    priority: 'essential',
    startingMethod: 'DOL',
    inrushMultiplier: 4.5
  },
  steering: {
    id: 'steering',
    name: 'Main Steering Gear',
    busId: 'lvBusA',
    breakerId: 'steerFeed',
    nominalVoltageV: 440,
    ratedKw: 75,
    powerFactor: 0.83,
    priority: 'essential',
    startingMethod: 'DOL',
    inrushMultiplier: 4.0
  },
  crane: {
    id: 'crane',
    name: 'Deck Cargo Crane (Starboard)',
    busId: 'lvBusB',
    breakerId: 'craneFeed',
    nominalVoltageV: 440,
    ratedKw: 240,
    powerFactor: 0.79,
    priority: 'non-essential',
    startingMethod: 'VFD',
    inrushMultiplier: 1.5,
    preferentialTripStage: 1
  },
  nav: {
    id: 'nav',
    name: 'Bridge Navigation Power',
    busId: 'consumerA',
    breakerId: 'navFeed',
    nominalVoltageV: 220,
    ratedKw: 25,
    powerFactor: 0.94,
    priority: 'essential',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.2
  },
  lightsA: {
    id: 'lightsA',
    name: 'Accommodation Lighting A (Port)',
    busId: 'consumerA',
    breakerId: 'lightAFeed',
    nominalVoltageV: 220,
    ratedKw: 45,
    powerFactor: 0.95,
    priority: 'essential',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.2
  },
  galley: {
    id: 'galley',
    name: 'Ship Galley & Outlets (Starboard)',
    busId: 'consumerB',
    breakerId: 'galleyFeed',
    nominalVoltageV: 220,
    ratedKw: 145,
    powerFactor: 0.96,
    priority: 'non-essential',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.1,
    preferentialTripStage: 1
  },
  lightsB: {
    id: 'lightsB',
    name: 'Accommodation Lighting B (Starboard)',
    busId: 'consumerB',
    breakerId: 'lightBFeed',
    nominalVoltageV: 220,
    ratedKw: 45,
    powerFactor: 0.95,
    priority: 'essential',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.2
  },
  eFire: {
    id: 'eFire',
    name: 'Emergency Fire Pump',
    busId: 'eBus',
    breakerId: 'eFireFeed',
    nominalVoltageV: 440,
    ratedKw: 75,
    powerFactor: 0.85,
    priority: 'emergency',
    startingMethod: 'DOL',
    inrushMultiplier: 5.0
  },
  eSteer: {
    id: 'eSteer',
    name: 'Emergency Steering Gear',
    busId: 'eBus',
    breakerId: 'eSteerFeed',
    nominalVoltageV: 440,
    ratedKw: 45,
    powerFactor: 0.83,
    priority: 'emergency',
    startingMethod: 'DOL',
    inrushMultiplier: 4.0
  },
  eLights: {
    id: 'eLights',
    name: 'SOLAS Emergency Lighting',
    busId: 'eBus',
    breakerId: 'eLightFeed',
    nominalVoltageV: 440,
    ratedKw: 18,
    powerFactor: 0.96,
    priority: 'emergency',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.1
  },
  eRadio: {
    id: 'eRadio',
    name: 'GMDSS Radio & Nav/Com',
    busId: 'eBus',
    breakerId: 'eRadioFeed',
    nominalVoltageV: 440,
    ratedKw: 22,
    powerFactor: 0.94,
    priority: 'emergency',
    startingMethod: 'Feeder',
    inrushMultiplier: 1.1
  }
};

export interface GeneratorTelemetry {
  id: string;
  short: string;
  breakerId: string;
  busId: 'busA' | 'busB' | 'eBus';
  nominalVoltageV: number;
  ratedKw: number;
  ratedKva: number;
  ratedKvar: number;
  ratedCurrentAmps: number;
  pickupCurrentAmps: number;
  running: boolean;
  breakerClosed: boolean;
  runupProgress: number; // 0..1 (1 = ready)
  govSetpointHz: number; // No-load frequency reference (default 60.8 Hz for 4% droop around 60 Hz)
  avrSetpointPu: number; // No-load voltage reference (default 1.015 pu)
  frequencyHz: number;
  voltageV: number;
  kw: number;
  kvar: number;
  kva: number;
  powerFactor: number;
  currentAmps: number;
  loadPercent: number;
  relays: RelayState;
  status: 'STOPPED' | 'STARTING' | 'STANDBY' | 'ONLINE' | 'OVERLOAD' | 'REVERSE_POWER' | 'LOSS_OF_FIELD';
}

export interface BusTelemetry {
  id: BusKey;
  label: string;
  nominalVoltageV: number;
  live: boolean;
  voltageV: number;
  voltageDipPercent: number;
  frequencyHz: number;
  kw: number;
  kvar: number;
  kva: number;
  powerFactor: number;
  currentAmps: number;
  essentialKw: number;
  nonEssentialKw: number;
  thdPercent: number;
  insulationKohm: number;
}

export interface SyncTelemetry {
  targetGenId: 'dg1' | 'dg2' | 'dg3' | 'dg4';
  busLive: boolean;
  genReady: boolean;
  alreadyClosed: boolean;
  busFreqHz: number;
  genFreqHz: number;
  slipHz: number;
  busVoltageKv: number;
  genVoltageKv: number;
  voltageDiffPercent: number;
  phaseAngleDeg: number; // -180 to +180 (0 = 12 o'clock in-phase)
  inSyncWindow: boolean;
  autoSyncActive: boolean;
}

export interface SimAlarm {
  id: string;
  time: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  acknowledged: boolean;
}

export class MarinePowerSimEngine {
  public propulsionThrottle = 0.55; // 0.0 to 1.15 (55% = 1,980 kW default)
  public pmsAutoStandby = true;
  public pmsAutoLoadShed = true;
  public pmsAutoEmergency = true;
  public checkSyncInterlock = true;

  public syncTargetGen: 'dg1' | 'dg2' | 'dg3' | 'dg4' = 'dg2';
  public autoSyncGen: string | null = null;
  public recoveryStage: string | null = null;
  public waterfall: SolasWaterfallStatus = createInitialWaterfallStatus();

  public earthFaultHv = false;
  public earthFaultLv = false;
  public earthingArchitecture: EarthingArchitecture = 'HRE';
  public hvEarthing: HvEarthingTelemetry = calculateHvEarthingState('HRE', false, true);

  public generators: Record<string, GeneratorTelemetry> = {};
  public feederRelays: Record<string, FeederRelayState> = {};
  public buses: Record<BusKey, BusTelemetry>;
  public sync: SyncTelemetry;
  public alarms: SimAlarm[] = [];

  // Dual redundant transformers at every voltage transformation tier
  public transformerLoading: Record<
    'txA' | 'txB' | 'txReeferA' | 'txReeferB' | 'txConA' | 'txConB' | 'tx220',
    { kva: number; ratedKva: number; percent: number }
  > = {
    txA: { kva: 0, ratedKva: 2500, percent: 0 },
    txB: { kva: 0, ratedKva: 2500, percent: 0 },
    txReeferA: { kva: 0, ratedKva: 1500, percent: 0 },
    txReeferB: { kva: 0, ratedKva: 1500, percent: 0 },
    txConA: { kva: 0, ratedKva: 500, percent: 0 },
    txConB: { kva: 0, ratedKva: 500, percent: 0 },
    tx220: { kva: 0, ratedKva: 500, percent: 0 } // alias for txConA
  };

  // Backward-compatibility getters
  public get lvBus(): BusTelemetry {
    return this.buses.lvBusA;
  }
  public get consumer(): BusTelemetry {
    return this.buses.consumerA;
  }

  private inrushTimers: Record<string, { extraKw: number; extraKvar: number; decay: number }> = {};
  private standbyStartCooldown = 0;
  private blackoutDetected = false;
  private recoveryTimer = 0;
  private recoveryStepIdx = 0;
  private phaseAngleRad = Math.PI * 0.65; // Start away from 0 so synchroscope movement is visible

  constructor() {
    const initGen = (
      id: string,
      short: string,
      breakerId: string,
      busId: 'busA' | 'busB' | 'eBus',
      nominalVoltageV: number,
      ratedKw: number,
      running: boolean
    ): GeneratorTelemetry => {
      const ratedKva = Math.round(ratedKw / 0.8);
      const ratedKvar = Math.round(ratedKva * 0.6); // sin(acos(0.8)) = 0.6
      const ratedCurrentAmps = (ratedKva * 1000) / (Math.sqrt(3) * nominalVoltageV);
      return {
        id,
        short,
        breakerId,
        busId,
        nominalVoltageV,
        ratedKw,
        ratedKva,
        ratedKvar,
        ratedCurrentAmps: Number(ratedCurrentAmps.toFixed(1)),
        pickupCurrentAmps: Number((ratedCurrentAmps * 1.05).toFixed(1)), // 105% I_rated IDMT pickup I_s
        running,
        breakerClosed: id === 'dg1',
        runupProgress: running ? 1 : 0,
        govSetpointHz: id === 'dg2' ? 60.65 : 60.8,
        avrSetpointPu: 1.012,
        frequencyHz: running ? 60.0 : 0,
        voltageV: running ? nominalVoltageV : 0,
        kw: 0,
        kvar: 0,
        kva: 0,
        powerFactor: 0.85,
        currentAmps: 0,
        loadPercent: 0,
        relays: createInitialRelayState(),
        status: running ? 'ONLINE' : 'STOPPED'
      };
    };

    // 4x 3.5 MW Generators + 1x 600 kW Emergency Generator per single-line diagram
    this.generators = {
      dg1: initGen('dg1', 'DG 1', 'gb1', 'busA', 6600, 3500, true),
      dg2: initGen('dg2', 'DG 2', 'gb2', 'busA', 6600, 3500, false),
      dg3: initGen('dg3', 'DG 3', 'gb3', 'busB', 6600, 3500, false),
      dg4: initGen('dg4', 'DG 4', 'gb4', 'busB', 6600, 3500, false),
      eg: initGen('eg', 'EM GEN', 'egBreaker', 'eBus', 440, 600, false)
    };

    for (const spec of Object.values(LOAD_SPECS)) {
      const ratedKva = spec.ratedKw / spec.powerFactor;
      const ratedAmps = (ratedKva * 1000) / (Math.sqrt(3) * spec.nominalVoltageV);
      this.feederRelays[spec.breakerId] = {
        breakerId: spec.breakerId,
        name: spec.name,
        currentAmps: 0,
        pickupAmps: Number((ratedAmps * 1.05).toFixed(1)),
        overcurrentTimer: 0,
        idmtTripTimeSec: null,
        idmtProgress: 0,
        overcurrentInjected: false,
        lastTripReason: null
      };
    }

    const initBus = (
      id: BusKey,
      label: string,
      nominalVoltageV: number
    ): BusTelemetry => ({
      id,
      label,
      nominalVoltageV,
      live: false,
      voltageV: 0,
      voltageDipPercent: 0,
      frequencyHz: 0,
      kw: 0,
      kvar: 0,
      kva: 0,
      powerFactor: 1.0,
      currentAmps: 0,
      essentialKw: 0,
      nonEssentialKw: 0,
      thdPercent: 0,
      insulationKohm: nominalVoltageV >= 6600 ? 15000 : 3200
    });

    this.buses = {
      busA: initBus('busA', '6.6 kV Main Bus A (Port)', 6600),
      busB: initBus('busB', '6.6 kV Main Bus B (Starboard)', 6600),
      lvBusA: initBus('lvBusA', '440 V Main Bus A (Port)', 440),
      lvBusB: initBus('lvBusB', '440 V Main Bus B (Starboard)', 440),
      reeferA: initBus('reeferA', '440 V Reefer Board A (Port)', 440),
      reeferB: initBus('reeferB', '440 V Reefer Board B (Starboard)', 440),
      consumerA: initBus('consumerA', '220 V Sub-Board A (Port)', 220),
      consumerB: initBus('consumerB', '220 V Sub-Board B (Starboard)', 220),
      eBus: initBus('eBus', '440 V Emergency Bus (ESB)', 440)
    };

    this.sync = {
      targetGenId: 'dg2',
      busLive: true,
      genReady: false,
      alreadyClosed: false,
      busFreqHz: 60.0,
      genFreqHz: 0,
      slipHz: 0,
      busVoltageKv: 6.6,
      genVoltageKv: 0,
      voltageDiffPercent: 0,
      phaseAngleDeg: 117,
      inSyncWindow: false,
      autoSyncActive: false
    };

    this.pushAlarm('INFO', 'PMS-INIT', 'Marine Power Management System V2 initialized. DG 1 online on 6.6 kV Bus A.');
  }

  public pushAlarm(severity: SimAlarm['severity'], code: string, message: string): void {
    // Avoid spamming duplicate unacknowledged code at top of list
    if (this.alarms.length > 0 && this.alarms[0].code === code && this.alarms[0].message === message) {
      return;
    }
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    this.alarms.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      time,
      severity,
      code,
      message,
      acknowledged: false
    });
    if (this.alarms.length > 25) this.alarms.pop();
  }

  public acknowledgeAllAlarms(): void {
    for (const a of this.alarms) a.acknowledged = true;
  }

  /**
   * Validate breaker operation against ETO safety interlocks (Shore Power interlock & ANSI 25 Check-Sync).
   */
  public validateBreakerToggle(
    breakerId: string,
    state: SimState,
    live: Set<string>
  ): { allowed: boolean; reason?: string } {
    const isCurrentlyClosed = !!state.closed[breakerId];
    // Opening a breaker is always permitted
    if (isCurrentlyClosed) return { allowed: true };

    // 1. Shore connection interlock: cannot close shoreBreaker if any main DG breaker is closed on connected bus
    if (breakerId === 'shoreBreaker') {
      if (!state.running.shore) {
        state.running.shore = true; // Energize shore supply cable automatically when shore breaker is requested
      }
      const connectedDgs = ['gb1', 'gb2', ...(state.closed.tie ? ['gb3', 'gb4'] : [])];
      if (connectedDgs.some((gb) => state.closed[gb])) {
        this.pushAlarm(
          'WARNING',
          'INTLK-SHORE',
          'Shore Breaker blocked: Open all connected Main Generator breakers before closing Shore Supply (Cold Ironing interlock).'
        );
        return {
          allowed: false,
          reason:
            'INTERLOCK BLOCKED: Cannot parallel Shore Supply with ship generators directly. Open main generator breakers first.'
        };
      }
      this.pushAlarm('INFO', 'SHORE-ON', '6.6 kV Shore Connection (Cold Ironing) breaker closed onto Main Bus A.');
      return { allowed: true };
    }

    // Prevent closing main DG breaker while shore power is feeding the same bus
    if (['gb1', 'gb2', 'gb3', 'gb4'].includes(breakerId)) {
      const shoreOnThisBus =
        state.closed.shoreBreaker && (breakerId === 'gb1' || breakerId === 'gb2' || state.closed.tie);
      if (shoreOnThisBus) {
        this.pushAlarm(
          'WARNING',
          'INTLK-DG-SHORE',
          `${edgeById[breakerId].name} blocked: Shore power is currently feeding the main bus. Open Shore Breaker first.`
        );
        return {
          allowed: false,
          reason: 'INTERLOCK BLOCKED: Disconnect Shore Supply before closing a ship generator breaker.'
        };
      }

      const genId = `dg${breakerId.slice(2)}` as 'dg1' | 'dg2' | 'dg3' | 'dg4';
      const gen = this.generators[genId];
      if (gen && state.running[genId] && gen.runupProgress < 0.95) {
        this.pushAlarm(
          'WARNING',
          'GEN-RUNUP',
          `${gen.short} is still ramping up (${Math.round(gen.runupProgress * 100)}%). Wait for rated voltage & frequency.`
        );
        return {
          allowed: false,
          reason: `${gen.short} is still ramping up to 6.6 kV / 60 Hz.`
        };
      }

      // Check-Sync (ANSI 25) interlock when closing onto an ALREADY LIVE bus
      const targetBus = gen.busId;
      if (this.checkSyncInterlock && live.has(targetBus) && state.running[genId]) {
        // Select this generator on the synchroscope
        this.syncTargetGen = genId;
        this.updateSynchroscope(0, state, live);
        if (!this.sync.inSyncWindow) {
          this.pushAlarm(
            'CRITICAL',
            'ANSI-25-BLOCK',
            `Check-Sync Relay (ANSI 25) blocked ${gen.short} breaker! Phase Δθ=${Math.round(this.sync.phaseAngleDeg)}°, Δf=${this.sync.slipHz.toFixed(2)} Hz. Use Synchroscope or click Auto-Sync.`
          );
          return {
            allowed: false,
            reason: `ANSI 25 CHECK-SYNC BLOCKED: ${gen.short} is out of phase (Δθ = ${Math.round(this.sync.phaseAngleDeg)}°). Use Auto-Sync or close at 12 o'clock.`
          };
        }
      }
    }

    // Check-sync across Bus Tie if both Bus A and Bus B are independently energized
    if (breakerId === 'tie' && this.checkSyncInterlock && live.has('busA') && live.has('busB')) {
      const df = Math.abs(this.buses.busA.frequencyHz - this.buses.busB.frequencyHz);
      if (df > 0.45) {
        this.pushAlarm(
          'WARNING',
          'ANSI-25-TIE',
          `Bus-Tie Check-Sync blocked: Bus A (${this.buses.busA.frequencyHz.toFixed(2)} Hz) and Bus B (${this.buses.busB.frequencyHz.toFixed(2)} Hz) frequency mismatch.`
        );
        return {
          allowed: false,
          reason: `ANSI 25 TIE BLOCKED: Match Bus A and Bus B frequencies before closing the bus tie.`
        };
      }
    }

    return { allowed: true };
  }

  public notifyBreakerChanged(breakerId: string, isClosed: boolean, live: Set<string>, state?: SimState): void {
    if (!isClosed) return;
    // If main generator breaker is closed manually after a blackout, prevent simultaneous load energization
    // and initiate SOLAS Sequential Waterfall from Stage 2 (T = 10s).
    if (['gb1', 'gb2', 'gb3', 'gb4'].includes(breakerId) && this.blackoutDetected && state && !this.waterfall.active) {
      this.blackoutDetected = false;
      for (const b of MAIN_BLACKOUT_SHED_BREAKERS) {
        if (b !== 'txAFeed' && b !== 'txBFeed') state.closed[b] = false;
      }
      this.startPmsRecovery(state, 10);
      return;
    }

    // Find any load controlled by this breaker to trigger starting inrush current spike
    for (const spec of Object.values(LOAD_SPECS)) {
      if (spec.breakerId === breakerId && live.has(spec.busId) && spec.inrushMultiplier > 1.2) {
        const baseKw = spec.id === 'drive' ? spec.ratedKw * this.propulsionThrottle : spec.ratedKw;
        const baseKvar = baseKw * Math.tan(Math.acos(spec.powerFactor));
        this.inrushTimers[spec.id] = {
          extraKw: baseKw * Math.min(1.6, (spec.inrushMultiplier - 1) * 0.35),
          extraKvar: baseKvar * (spec.inrushMultiplier - 1) * 0.85,
          decay: 1.0
        };
        this.pushAlarm(
          'INFO',
          'INRUSH-START',
          `${spec.name} started (${spec.startingMethod}, ${spec.inrushMultiplier.toFixed(1)}× inrush transient).`
        );
      }
    }
  }

  public nudgeGovernor(genId: string, deltaHz: number): void {
    const g = this.generators[genId];
    if (!g) return;
    g.govSetpointHz = Math.max(58.5, Math.min(62.5, Number((g.govSetpointHz + deltaHz).toFixed(2))));
  }

  public nudgeAvr(genId: string, deltaPu: number): void {
    const g = this.generators[genId];
    if (!g) return;
    g.avrSetpointPu = Math.max(0.75, Math.min(1.10, Number((g.avrSetpointPu + deltaPu).toFixed(3))));
  }

  public toggleFieldLoss(genId: string): string {
    const g = this.generators[genId];
    if (!g) return '';
    g.relays.fieldLossInjected = !g.relays.fieldLossInjected;
    if (g.relays.fieldLossInjected) {
      this.pushAlarm(
        'WARNING',
        'AVR-FAULT-INJ',
        `AVR Field Collapse simulated on ${g.short}: Reactive power Q dropping < -20% Q_rated & terminal voltage sagging < 85% (5.61 kV). ANSI 40 timer active (1.5s).`
      );
      return `Simulated Loss of Excitation (AVR failure) on ${g.short}. ANSI 40 will trip breaker after 1.5s.`;
    } else {
      g.relays.lossOfFieldTimer = 0;
      this.pushAlarm('INFO', 'AVR-RESTORED', `AVR Excitation restored to normal on ${g.short}.`);
      return `AVR Excitation restored on ${g.short}.`;
    }
  }

  public toggleFeederOvercurrent(breakerId: string): string {
    const fr = this.feederRelays[breakerId];
    if (!fr) return '';
    fr.overcurrentInjected = !fr.overcurrentInjected;
    if (fr.overcurrentInjected) {
      this.pushAlarm(
        'WARNING',
        'ANSI-51-PICKUP',
        `ANSI 51 IDMT Overcurrent pickup on ${fr.name} (2.2× I_s). Inverse-time curve integrating...`
      );
      return `Injected 2.2× overload on ${fr.name}. ANSI 51 IDMT curve timer active.`;
    } else {
      fr.overcurrentTimer = 0;
      fr.idmtProgress = 0;
      return `Cleared overload injection on ${fr.name}.`;
    }
  }

  public startAutoSync(genId: 'dg1' | 'dg2' | 'dg3' | 'dg4', state: SimState): string {
    this.syncTargetGen = genId;
    if (!state.running[genId]) {
      state.running[genId] = true;
    }
    this.autoSyncGen = genId;
    this.pushAlarm('INFO', 'AUTO-SYNC', `Auto-Synchronizer (ANSI 25A) engaged for ${byId[genId].short}. Matching speed & phase...`);
    return `Auto-Synchronizer engaged for ${byId[genId].short}. Needle will lock to 12 o'clock and close breaker automatically.`;
  }

  public triggerBlackout(state: SimState): string {
    for (const id of ['dg1', 'dg2', 'dg3', 'dg4']) {
      state.running[id] = false;
      state.closed[`gb${id.slice(2)}`] = false;
    }
    // Shed all main HV & LV load feeders via Undervoltage Release (UVR) so loads NEVER re-energize simultaneously
    for (const b of MAIN_BLACKOUT_SHED_BREAKERS) {
      state.closed[b] = false;
    }
    state.running.shore = false;
    state.closed.shoreBreaker = false;
    this.autoSyncGen = null;
    this.recoveryStage = null;
    this.waterfall = createInitialWaterfallStatus();
    this.blackoutDetected = true;
    this.pushAlarm(
      'CRITICAL',
      'BLACKOUT',
      'MAIN 6.6 kV SWITCHBOARD BLACKOUT! All main generators tripped & main feeders shed via UVR. Emergency generator auto-start initiated.'
    );
    return 'BLACKOUT SIMULATED: Main 6.6 kV bus de-energized & feeders shed. Click "PMS Auto-Recovery" or Scenario 04 for SOLAS 5-Stage Waterfall.';
  }

  public startPmsRecovery(state: SimState, startAtSec = 0): string {
    // Ensure all non-restored main feeders are open before starting sequential waterfall
    for (const b of MAIN_BLACKOUT_SHED_BREAKERS) {
      state.closed[b] = false;
    }
    const timeScale = this.waterfall.timeScale || 2.5;
    this.waterfall = {
      active: true,
      completed: false,
      elapsedSec: startAtSec,
      totalDurationSec: 55,
      progressPercent: Math.round((startAtSec / 55) * 100),
      currentStageIndex: -1,
      currentStage: SOLAS_WATERFALL_STAGES[0],
      timeScale
    };
    this.blackoutDetected = false;
    this.recoveryTimer = startAtSec;
    this.recoveryStepIdx = 1;
    // Immediately execute Stage 1 (and Stage 2 if starting at 10s)
    this.advanceWaterfallStages(state);
    this.pushAlarm(
      'INFO',
      'SOLAS-WATERFALL',
      `SOLAS 5-Stage Sequential Blackout Recovery Waterfall initiated at T = ${startAtSec}s.`
    );
    return this.recoveryStage || 'SOLAS 5-Stage Sequential Waterfall initiated...';
  }

  public setWaterfallTimeScale(scale: number): void {
    this.waterfall.timeScale = scale;
  }

  private advanceWaterfallStages(state: SimState, onStateMutated?: (msg: string) => void): void {
    const t = this.waterfall.elapsedSec;
    let targetStageIdx = 0;
    for (let i = 0; i < SOLAS_WATERFALL_STAGES.length; i++) {
      if (t >= SOLAS_WATERFALL_STAGES[i].startSec) {
        targetStageIdx = i;
      }
    }

    while (this.waterfall.currentStageIndex < targetStageIdx) {
      const nextIdx = this.waterfall.currentStageIndex + 1;
      const stg = SOLAS_WATERFALL_STAGES[nextIdx];
      this.waterfall.currentStageIndex = nextIdx;
      this.waterfall.currentStage = stg;

      for (const src of stg.sourcesToStart) {
        state.running[src] = true;
        if (this.generators[src]) {
          this.generators[src].running = true;
          this.generators[src].runupProgress = 1.0;
        }
      }
      for (const brk of stg.breakersToClose) {
        state.closed[brk] = true;
        this.notifyBreakerChanged(brk, true, powered(state));
      }

      this.recoveryStage = `Stage ${stg.stageNumber}/5 (${stg.timeWindowLabel}): ${stg.description}`;
      this.pushAlarm('INFO', `SOLAS-STG-${stg.stageNumber}`, this.recoveryStage);
      onStateMutated?.(this.recoveryStage);
    }
  }

  public setEarthingArchitecture(arch: EarthingArchitecture): string {
    this.earthingArchitecture = arch;
    const hvLive = this.buses.busA.live || this.buses.busB.live;
    this.hvEarthing = calculateHvEarthingState(this.earthingArchitecture, this.earthFaultHv, hvLive);
    if (arch === 'HRE') {
      if (this.earthFaultHv) {
        this.pushAlarm(
          'CRITICAL',
          'ANSI-67N',
          'ANSI 67N Directional Earth Fault Alarm! High-Resistance Earthed (HRE) 6.6 kV bus: NER (381 Ω) limits fault current I_ef = 10.0 A, Neutral Displacement V_N = 3810 V.'
        );
      } else {
        this.pushAlarm(
          'INFO',
          'HRE-MODE',
          '6.6 kV Switchboard Earthing switched to High-Resistance Earthed (HRE) System (381 Ω NER, 10 A ground fault limit).'
        );
      }
      return 'Switched 6.6 kV busbar earthing to High-Resistance Earthed (HRE) System (NER = 381 Ω, I_ef = 10.0 A limit).';
    } else {
      if (this.earthFaultHv) {
        this.pushAlarm(
          'WARNING',
          'IMD-6.6KV',
          '6.6 kV Unearthed IT System Earth Fault! Insulation = 14 kΩ, Neutral V_N = 3810 V (High capacitive arcing overvoltage risk).'
        );
      } else {
        this.pushAlarm(
          'INFO',
          'IT-MODE',
          '6.6 kV Switchboard Earthing switched to Unearthed IT System (Insulated Neutral with IMD monitoring).'
        );
      }
      return 'Switched 6.6 kV busbar earthing to Unearthed IT System.';
    }
  }

  public toggleEarthFault(level: 'hv' | 'lv'): string {
    if (level === 'hv') {
      this.earthFaultHv = !this.earthFaultHv;
      const hvLive = this.buses.busA.live || this.buses.busB.live;
      this.hvEarthing = calculateHvEarthingState(this.earthingArchitecture, this.earthFaultHv, hvLive);
      if (this.earthFaultHv) {
        if (this.earthingArchitecture === 'HRE') {
          this.pushAlarm(
            'CRITICAL',
            'ANSI-67N',
            'ANSI 67N Directional Earth Fault Alarm! 6.6 kV Phase L1-Earth fault: Neutral displacement V_N = 3810 V, NER fault current limited to I_ef = 10.0 A (381 Ω).'
          );
          return 'Injected 6.6 kV Phase Earth Fault in HRE Mode: V_N = 3810 V, NER current limited to 10.0 A, ANSI 67N Directional Earth Fault Alarm active.';
        } else {
          this.pushAlarm(
            'WARNING',
            'IMD-6.6KV',
            '6.6 kV IT-System Earth Fault detected! Insulation dropped to 14 kΩ, Neutral V_N = 3810 V. Bus remains online (insulated neutral).'
          );
          return 'Injected 6.6 kV Earth Fault (14 kΩ, V_N = 3810 V) in Unearthed IT System.';
        }
      } else {
        this.pushAlarm('INFO', 'IMD-6.6KV-CLR', '6.6 kV Earth Fault cleared. Neutral voltage V_N = 0 V, Insulation restored to 15.0 MΩ.');
        return '6.6 kV Earth Fault cleared (V_N = 0 V, I_ef = 0.0 A).';
      }
    } else {
      this.earthFaultLv = !this.earthFaultLv;
      if (this.earthFaultLv) {
        this.pushAlarm(
          'WARNING',
          'IMD-440V',
          '440 V IT-System Earth Fault detected! Insulation dropped to 8 kΩ. Locate faulted feeder by selective isolation.'
        );
        return 'Injected 440 V Earth Fault (8 kΩ). In an IT system, the first earth fault does not trip the breaker.';
      } else {
        this.pushAlarm('INFO', 'IMD-440V-CLR', '440 V Earth Fault cleared. Insulation restored to 3.2 MΩ.');
        return '440 V Earth Fault cleared.';
      }
    }
  }

  /**
   * Main quasi-steady-state simulation step (called every frame or 50-100ms tick).
   * Returns true if any breaker or generator state was automatically mutated by PMS/Protection.
   */
  public step(dt: number, state: SimState, onStateMutated?: (msg: string) => void): void {
    const clampedDt = Math.min(dt, 0.15);
    const live = powered(state);

    // 1. Update generator start-up / run-up ramps
    for (const [id, gen] of Object.entries(this.generators)) {
      gen.running = !!state.running[id];
      gen.breakerClosed = !!state.closed[gen.breakerId];
      if (gen.running) {
        gen.runupProgress = Math.min(1, gen.runupProgress + clampedDt * 0.55);
      } else {
        gen.runupProgress = Math.max(0, gen.runupProgress - clampedDt * 0.8);
        gen.kw = 0;
        gen.kvar = 0;
        gen.kva = 0;
        gen.currentAmps = 0;
        gen.loadPercent = 0;
        gen.frequencyHz = gen.runupProgress * 60.0;
        gen.voltageV = gen.runupProgress * gen.nominalVoltageV;
        gen.status = 'STOPPED';
      }
    }

    // 2. Decay motor-starting inrush transients
    let totalInrushKvarHv = 0;
    let totalInrushKvarLv = 0;
    for (const [loadId, timer] of Object.entries(this.inrushTimers)) {
      timer.decay = Math.max(0, timer.decay - clampedDt * 0.65);
      if (timer.decay <= 0.01) {
        delete this.inrushTimers[loadId];
      } else {
        const spec = LOAD_SPECS[loadId];
        if (spec.nominalVoltageV >= 6600) totalInrushKvarHv += timer.extraKvar * timer.decay;
        else totalInrushKvarLv += timer.extraKvar * timer.decay;
      }
    }

    // 3. Calculate active & reactive load on each bus from connected & powered equipment
    const busLoads: Record<BusKey, { kw: number; kvar: number; essKw: number; nonEssKw: number }> = {
      busA: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      busB: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      lvBusA: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      lvBusB: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      reeferA: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      reeferB: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      consumerA: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      consumerB: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 },
      eBus: { kw: 0, kvar: 0, essKw: 0, nonEssKw: 0 }
    };

    for (const spec of Object.values(LOAD_SPECS)) {
      const fr = this.feederRelays[spec.breakerId];
      if (!live.has(spec.id)) {
        if (fr) fr.currentAmps = 0;
        continue;
      }
      let kw = spec.id === 'drive' ? spec.ratedKw * this.propulsionThrottle : spec.ratedKw;
      let kvar = kw * Math.tan(Math.acos(spec.powerFactor));
      const inrush = this.inrushTimers[spec.id];
      if (inrush) {
        kw += inrush.extraKw * inrush.decay;
        kvar += inrush.extraKvar * inrush.decay;
      }
      if (fr && fr.overcurrentInjected) {
        kw *= 2.25;
        kvar *= 2.25;
      }
      if (fr) {
        const kva = Math.hypot(kw, kvar);
        fr.currentAmps = (kva * 1000) / (Math.sqrt(3) * spec.nominalVoltageV);
      }
      const targetBus = spec.busId === 'lvBus' ? 'lvBusA' : spec.busId === 'consumer' ? 'consumerA' : spec.busId as BusKey;
      const bucket = busLoads[targetBus];
      if (bucket) {
        bucket.kw += kw;
        bucket.kvar += kvar;
        if (spec.priority === 'non-essential') bucket.nonEssKw += kw;
        else bucket.essKw += kw;
      }
    }

    // 4. Propagate downstream bus loads upstream through dual transformers
    // 4a. 220 V Sub-Boards -> 440 V Buses through Control Transformers TX CON A & B
    const txConAFeeding = live.has('consumerA') && state.closed.conAAcb && live.has('lvBusA');
    if (txConAFeeding) {
      const lossKw = busLoads.consumerA.kw * 0.018;
      const lossKvar = busLoads.consumerA.kvar * 0.04;
      busLoads.lvBusA.kw += busLoads.consumerA.kw + lossKw;
      busLoads.lvBusA.kvar += busLoads.consumerA.kvar + lossKvar;
      busLoads.lvBusA.essKw += busLoads.consumerA.essKw;
      busLoads.lvBusA.nonEssKw += busLoads.consumerA.nonEssKw;
      const kva = Math.hypot(busLoads.consumerA.kw, busLoads.consumerA.kvar);
      this.transformerLoading.txConA = { kva, ratedKva: 500, percent: Math.round((kva / 500) * 100) };
    } else {
      this.transformerLoading.txConA = { kva: 0, ratedKva: 500, percent: 0 };
    }
    this.transformerLoading.tx220 = this.transformerLoading.txConA;

    const txConBFeeding = live.has('consumerB') && state.closed.conBAcb && live.has('lvBusB');
    if (txConBFeeding) {
      const lossKw = busLoads.consumerB.kw * 0.018;
      const lossKvar = busLoads.consumerB.kvar * 0.04;
      busLoads.lvBusB.kw += busLoads.consumerB.kw + lossKw;
      busLoads.lvBusB.kvar += busLoads.consumerB.kvar + lossKvar;
      busLoads.lvBusB.essKw += busLoads.consumerB.essKw;
      busLoads.lvBusB.nonEssKw += busLoads.consumerB.nonEssKw;
      const kva = Math.hypot(busLoads.consumerB.kw, busLoads.consumerB.kvar);
      this.transformerLoading.txConB = { kva, ratedKva: 500, percent: Math.round((kva / 500) * 100) };
    } else {
      this.transformerLoading.txConB = { kva: 0, ratedKva: 500, percent: 0 };
    }

    // 4b. Reefer Panels -> 6.6 kV Buses through Reefer Transformers TX REEFER A & B
    const txReeferAFeeding = live.has('reeferA') && state.closed.reeferAFeed && live.has('busA');
    if (txReeferAFeeding) {
      const lossKw = busLoads.reeferA.kw * 0.015;
      const lossKvar = busLoads.reeferA.kvar * 0.035;
      busLoads.busA.kw += busLoads.reeferA.kw + lossKw;
      busLoads.busA.kvar += busLoads.reeferA.kvar + lossKvar;
      busLoads.busA.nonEssKw += busLoads.reeferA.nonEssKw;
      const kva = Math.hypot(busLoads.reeferA.kw, busLoads.reeferA.kvar);
      this.transformerLoading.txReeferA = { kva, ratedKva: 1500, percent: Math.round((kva / 1500) * 100) };
    } else {
      this.transformerLoading.txReeferA = { kva: 0, ratedKva: 1500, percent: 0 };
    }

    const txReeferBFeeding = live.has('reeferB') && state.closed.reeferBFeed && live.has('busB');
    if (txReeferBFeeding) {
      const lossKw = busLoads.reeferB.kw * 0.015;
      const lossKvar = busLoads.reeferB.kvar * 0.035;
      busLoads.busB.kw += busLoads.reeferB.kw + lossKw;
      busLoads.busB.kvar += busLoads.reeferB.kvar + lossKvar;
      busLoads.busB.nonEssKw += busLoads.reeferB.nonEssKw;
      const kva = Math.hypot(busLoads.reeferB.kw, busLoads.reeferB.kvar);
      this.transformerLoading.txReeferB = { kva, ratedKva: 1500, percent: Math.round((kva / 1500) * 100) };
    } else {
      this.transformerLoading.txReeferB = { kva: 0, ratedKva: 1500, percent: 0 };
    }

    // 4c. Main 440 V Buses -> 6.6 kV Buses through Main Transformers TX A & TX B (2.5 MVA each)
    const txAFeeding = live.has('busA') && state.closed.txAFeed && live.has('lvBusA');
    const txBFeeding = live.has('busB') && state.closed.txBFeed && live.has('lvBusB');

    if (state.closed.lvTie && (txAFeeding || txBFeeding)) {
      const totalLvKw = busLoads.lvBusA.kw + busLoads.lvBusB.kw;
      const totalLvKvar = busLoads.lvBusA.kvar + busLoads.lvBusB.kvar;
      const activeTxCount = (txAFeeding ? 1 : 0) + (txBFeeding ? 1 : 0);
      const shareKw = (totalLvKw * 1.015) / activeTxCount;
      const shareKvar = (totalLvKvar * 1.04) / activeTxCount;
      const shareKva = Math.hypot(shareKw, shareKvar);

      if (txAFeeding) {
        busLoads.busA.kw += shareKw;
        busLoads.busA.kvar += shareKvar;
        busLoads.busA.essKw += (busLoads.lvBusA.essKw + busLoads.lvBusB.essKw) / activeTxCount;
        busLoads.busA.nonEssKw += (busLoads.lvBusA.nonEssKw + busLoads.lvBusB.nonEssKw) / activeTxCount;
        this.transformerLoading.txA = { kva: shareKva, ratedKva: 2500, percent: Math.round((shareKva / 2500) * 100) };
      } else {
        this.transformerLoading.txA = { kva: 0, ratedKva: 2500, percent: 0 };
      }

      if (txBFeeding) {
        busLoads.busB.kw += shareKw;
        busLoads.busB.kvar += shareKvar;
        busLoads.busB.essKw += (busLoads.lvBusA.essKw + busLoads.lvBusB.essKw) / activeTxCount;
        busLoads.busB.nonEssKw += (busLoads.lvBusA.nonEssKw + busLoads.lvBusB.nonEssKw) / activeTxCount;
        this.transformerLoading.txB = { kva: shareKva, ratedKva: 2500, percent: Math.round((shareKva / 2500) * 100) };
      } else {
        this.transformerLoading.txB = { kva: 0, ratedKva: 2500, percent: 0 };
      }
    } else {
      if (txAFeeding) {
        const kvaA = Math.hypot(busLoads.lvBusA.kw * 1.015, busLoads.lvBusA.kvar * 1.04);
        busLoads.busA.kw += busLoads.lvBusA.kw * 1.015;
        busLoads.busA.kvar += busLoads.lvBusA.kvar * 1.04;
        busLoads.busA.essKw += busLoads.lvBusA.essKw;
        busLoads.busA.nonEssKw += busLoads.lvBusA.nonEssKw;
        this.transformerLoading.txA = { kva: kvaA, ratedKva: 2500, percent: Math.round((kvaA / 2500) * 100) };
      } else {
        this.transformerLoading.txA = { kva: 0, ratedKva: 2500, percent: 0 };
      }

      if (txBFeeding) {
        const kvaB = Math.hypot(busLoads.lvBusB.kw * 1.015, busLoads.lvBusB.kvar * 1.04);
        busLoads.busB.kw += busLoads.lvBusB.kw * 1.015;
        busLoads.busB.kvar += busLoads.lvBusB.kvar * 1.04;
        busLoads.busB.essKw += busLoads.lvBusB.essKw;
        busLoads.busB.nonEssKw += busLoads.lvBusB.nonEssKw;
        this.transformerLoading.txB = { kva: kvaB, ratedKva: 2500, percent: Math.round((kvaB / 2500) * 100) };
      } else {
        this.transformerLoading.txB = { kva: 0, ratedKva: 2500, percent: 0 };
      }
    }

    // 5. Solve Generator Governor Droop (Frequency) & AVR Droop (Voltage) per electrical island
    const solveHvIsland = (busIds: ('busA' | 'busB')[], genIds: ('dg1' | 'dg2' | 'dg3' | 'dg4')[]) => {
      const totalKw = busIds.reduce((acc, b) => acc + busLoads[b].kw, 0);
      const totalKvar = busIds.reduce((acc, b) => acc + busLoads[b].kvar, 0);
      const onlineGens = genIds
        .map((id) => this.generators[id])
        .filter((g) => g.running && g.breakerClosed && g.runupProgress >= 0.9);

      const shoreConnected =
        busIds.includes('busA') && state.running.shore && state.closed.shoreBreaker;

      if (shoreConnected) {
        // Shore connection acts as a stiff 60.0 Hz / 6.60 kV port grid
        for (const b of busIds) {
          this.buses[b].live = true;
          this.buses[b].frequencyHz = 60.0;
          this.buses[b].voltageV = 6600;
          this.buses[b].voltageDipPercent = 0;
        }
        return;
      }

      if (onlineGens.length === 0) {
        for (const b of busIds) {
          this.buses[b].live = false;
          this.buses[b].frequencyHz = 0;
          this.buses[b].voltageV = 0;
          this.buses[b].voltageDipPercent = 0;
        }
        return;
      }

      // 4% speed droop: f_bus = (sum(f_nl_i * P_rated_i) - R_gov * 60 * P_total) / sum(P_rated_i)
      const droopR = 0.04;
      const sumRatedKw = onlineGens.reduce((s, g) => s + g.ratedKw, 0);
      const weightedNlHz = onlineGens.reduce((s, g) => s + g.govSetpointHz * g.ratedKw, 0);
      const islandFreqHz = Math.max(
        55.0,
        Math.min(62.5, (weightedNlHz - droopR * 60.0 * totalKw) / sumRatedKw)
      );

      // 2.5% AVR voltage droop + transient starting inrush voltage dip + Loss of Field (ANSI 40) excitation collapse
      const avrDroop = 0.025;
      const sumRatedKva = onlineGens.reduce((s, g) => s + g.ratedKva, 0);
      const inrushDipPu = Math.min(0.085, totalInrushKvarHv / Math.max(2500, sumRatedKva) * 0.045);
      const hasFieldLoss = onlineGens.some((g) => g.relays.fieldLossInjected);
      const avgAvrPu =
        onlineGens.reduce((s, g) => s + (g.relays.fieldLossInjected ? 0.76 : g.avrSetpointPu), 0) /
        onlineGens.length;
      const rawIslandVoltagePu = avgAvrPu - avrDroop * (totalKvar / sumRatedKva) - inrushDipPu;
      const islandVoltagePu = hasFieldLoss
        ? Math.min(0.81, Math.max(0.74, rawIslandVoltagePu)) // Sags below 85% nominal (5.61 kV) during field loss
        : Math.max(0.78, Math.min(1.05, rawIslandVoltagePu));
      const islandVoltageV = islandVoltagePu * 6600;

      // Distribute kW and kVAr across online generators according to their droop curves
      for (const g of onlineGens) {
        const rawKw = ((g.govSetpointHz - islandFreqHz) / (droopR * 60.0)) * g.ratedKw;
        g.kw = rawKw;
        const effectiveAvrPu = g.relays.fieldLossInjected ? 0.76 : g.avrSetpointPu;
        const avrCirculatingKvar = ((effectiveAvrPu - avgAvrPu) / avrDroop) * g.ratedKvar;
        g.kvar = g.relays.fieldLossInjected
          ? -0.32 * g.ratedKvar // Draws negative VARs (< -0.20 * Q_rated) when excitation field collapses
          : totalKvar * (g.ratedKva / sumRatedKva) + avrCirculatingKvar;
        g.kva = Math.hypot(g.kw, g.kvar);
        g.powerFactor = g.kva > 1 ? Math.abs(g.kw) / g.kva : 1.0;
        g.frequencyHz = islandFreqHz;
        g.voltageV = islandVoltageV;
        g.currentAmps = (g.kva * 1000) / (Math.sqrt(3) * Math.max(100, g.voltageV));
        g.loadPercent = Math.round((g.kw / g.ratedKw) * 100);

        if (g.kvar < -0.20 * g.ratedKvar && g.voltageV < 0.85 * g.nominalVoltageV) {
          g.status = 'LOSS_OF_FIELD';
        } else if (g.kw < -0.05 * g.ratedKw) {
          g.status = 'REVERSE_POWER';
        } else if (g.loadPercent > 100 || g.currentAmps > g.pickupCurrentAmps) {
          g.status = 'OVERLOAD';
        } else {
          g.status = 'ONLINE';
        }
      }

      for (const b of busIds) {
        this.buses[b].live = true;
        this.buses[b].frequencyHz = islandFreqHz;
        this.buses[b].voltageV = islandVoltageV;
        this.buses[b].voltageDipPercent = Number(((1.0 - islandVoltageV / 6600) * 100).toFixed(1));
      }
    };

    if (state.closed.tie) {
      solveHvIsland(['busA', 'busB'], ['dg1', 'dg2', 'dg3', 'dg4']);
    } else {
      solveHvIsland(['busA'], ['dg1', 'dg2']);
      solveHvIsland(['busB'], ['dg3', 'dg4']);
    }

    // Update Standby running generators (running but breaker open)
    for (const id of ['dg1', 'dg2', 'dg3', 'dg4'] as const) {
      const g = this.generators[id];
      if (g.running && !g.breakerClosed) {
        g.kw = 0;
        g.kvar = 0;
        g.kva = 0;
        g.currentAmps = 0;
        g.loadPercent = 0;
        g.frequencyHz = g.govSetpointHz * g.runupProgress;
        g.voltageV = 6600 * g.avrSetpointPu * g.runupProgress;
        g.status = g.runupProgress < 0.95 ? 'STARTING' : 'STANDBY';
      }
    }

    // Solve Emergency Generator & Emergency Bus (440 V)
    const eg = this.generators.eg;
    if (eg.running && eg.breakerClosed && eg.runupProgress >= 0.9) {
      const eKw = busLoads.eBus.kw;
      const eKvar = busLoads.eBus.kvar;
      eg.kw = eKw;
      eg.kvar = eKvar;
      eg.kva = Math.hypot(eKw, eKvar);
      eg.powerFactor = eg.kva > 1 ? eKw / eg.kva : 1.0;
      eg.frequencyHz = 60.6 - 0.04 * 60.0 * (eKw / eg.ratedKw);
      eg.voltageV = 440 * (1.01 - 0.025 * (eg.kva / eg.ratedKva));
      eg.currentAmps = (eg.kva * 1000) / (Math.sqrt(3) * eg.voltageV);
      eg.loadPercent = Math.round((eKw / eg.ratedKw) * 100);
      eg.status = eg.loadPercent > 100 ? 'OVERLOAD' : 'ONLINE';
      this.buses.eBus.live = true;
      this.buses.eBus.frequencyHz = eg.frequencyHz;
      this.buses.eBus.voltageV = eg.voltageV;
    } else if (state.closed.esbTieFeed && live.has('lvBusA')) {
      // Normal ESB supply from 440 V Bus A
      this.buses.eBus.live = true;
      this.buses.eBus.frequencyHz = this.buses.lvBusA.frequencyHz;
      this.buses.eBus.voltageV = this.buses.lvBusA.voltageV;
    } else {
      if (eg.running && !eg.breakerClosed) {
        eg.frequencyHz = 60.5 * eg.runupProgress;
        eg.voltageV = 440 * eg.runupProgress;
        eg.status = eg.runupProgress < 0.95 ? 'STARTING' : 'STANDBY';
      }
      this.buses.eBus.live = false;
      this.buses.eBus.frequencyHz = 0;
      this.buses.eBus.voltageV = 0;
    }

    // 6. Populate downstream LV (440 V), Reefer (440 V), and 220 V Sub-Board voltages
    const lvInrushDip = Math.min(0.06, totalInrushKvarLv / 1500 * 0.04);

    // 6a. 440 V Bus A (Port)
    if (live.has('lvBusA')) {
      const upBus = this.buses.busA.live ? this.buses.busA : (state.closed.lvTie && this.buses.busB.live ? this.buses.busB : null);
      if (upBus && upBus.live) {
        const txDrop = (this.transformerLoading.txA.percent / 100) * 0.018;
        this.buses.lvBusA.live = true;
        this.buses.lvBusA.frequencyHz = upBus.frequencyHz;
        this.buses.lvBusA.voltageV = 440 * (upBus.voltageV / 6600) * (1 - txDrop - lvInrushDip);
        this.buses.lvBusA.voltageDipPercent = Number(((1.0 - this.buses.lvBusA.voltageV / 440) * 100).toFixed(1));
      }
    } else {
      this.buses.lvBusA.live = false;
      this.buses.lvBusA.frequencyHz = 0;
      this.buses.lvBusA.voltageV = 0;
      this.buses.lvBusA.voltageDipPercent = 0;
    }

    // 6b. 440 V Bus B (Starboard)
    if (live.has('lvBusB')) {
      const upBus = this.buses.busB.live ? this.buses.busB : (state.closed.lvTie && this.buses.busA.live ? this.buses.busA : null);
      if (upBus && upBus.live) {
        const txDrop = (this.transformerLoading.txB.percent / 100) * 0.018;
        this.buses.lvBusB.live = true;
        this.buses.lvBusB.frequencyHz = upBus.frequencyHz;
        this.buses.lvBusB.voltageV = 440 * (upBus.voltageV / 6600) * (1 - txDrop - lvInrushDip);
        this.buses.lvBusB.voltageDipPercent = Number(((1.0 - this.buses.lvBusB.voltageV / 440) * 100).toFixed(1));
      }
    } else {
      this.buses.lvBusB.live = false;
      this.buses.lvBusB.frequencyHz = 0;
      this.buses.lvBusB.voltageV = 0;
      this.buses.lvBusB.voltageDipPercent = 0;
    }

    // 6c. Reefer Distribution Boards (440 V)
    if (live.has('reeferA') && this.buses.busA.live) {
      this.buses.reeferA.live = true;
      this.buses.reeferA.frequencyHz = this.buses.busA.frequencyHz;
      this.buses.reeferA.voltageV = 440 * (this.buses.busA.voltageV / 6600) * (1 - (this.transformerLoading.txReeferA.percent / 100) * 0.018);
    } else {
      this.buses.reeferA.live = false;
      this.buses.reeferA.frequencyHz = 0;
      this.buses.reeferA.voltageV = 0;
    }

    if (live.has('reeferB') && this.buses.busB.live) {
      this.buses.reeferB.live = true;
      this.buses.reeferB.frequencyHz = this.buses.busB.frequencyHz;
      this.buses.reeferB.voltageV = 440 * (this.buses.busB.voltageV / 6600) * (1 - (this.transformerLoading.txReeferB.percent / 100) * 0.018);
    } else {
      this.buses.reeferB.live = false;
      this.buses.reeferB.frequencyHz = 0;
      this.buses.reeferB.voltageV = 0;
    }

    // 6d. 220 V Sub-Boards (Port Sub A & Starboard Sub B)
    if (live.has('consumerA')) {
      const upLv = this.buses.lvBusA.live ? this.buses.lvBusA : (state.closed.consumerTie && this.buses.lvBusB.live ? this.buses.lvBusB : null);
      if (upLv && upLv.live) {
        this.buses.consumerA.live = true;
        this.buses.consumerA.frequencyHz = upLv.frequencyHz;
        this.buses.consumerA.voltageV = 220 * (upLv.voltageV / 440) * (1 - (this.transformerLoading.txConA.percent / 100) * 0.015);
      } else if (state.closed.txConAEsbTie && this.buses.eBus.live) {
        this.buses.consumerA.live = true;
        this.buses.consumerA.frequencyHz = this.buses.eBus.frequencyHz;
        this.buses.consumerA.voltageV = 220;
      }
    } else {
      this.buses.consumerA.live = false;
      this.buses.consumerA.frequencyHz = 0;
      this.buses.consumerA.voltageV = 0;
    }

    if (live.has('consumerB')) {
      const upLv = this.buses.lvBusB.live ? this.buses.lvBusB : (state.closed.consumerTie && this.buses.lvBusA.live ? this.buses.lvBusA : null);
      if (upLv && upLv.live) {
        this.buses.consumerB.live = true;
        this.buses.consumerB.frequencyHz = upLv.frequencyHz;
        this.buses.consumerB.voltageV = 220 * (upLv.voltageV / 440) * (1 - (this.transformerLoading.txConB.percent / 100) * 0.015);
      }
    } else {
      this.buses.consumerB.live = false;
      this.buses.consumerB.frequencyHz = 0;
      this.buses.consumerB.voltageV = 0;
    }

    // Finalize bus power & THD metrics across all 9 buses
    const allBusKeys: BusKey[] = ['busA', 'busB', 'lvBusA', 'lvBusB', 'reeferA', 'reeferB', 'consumerA', 'consumerB', 'eBus'];
    for (const bId of allBusKeys) {
      const b = this.buses[bId];
      const ld = busLoads[bId];
      b.kw = b.live ? Math.round(ld.kw) : 0;
      b.kvar = b.live ? Math.round(ld.kvar) : 0;
      b.kva = b.live ? Math.round(Math.hypot(ld.kw, ld.kvar)) : 0;
      b.powerFactor = b.kva > 1 ? Number((b.kw / b.kva).toFixed(2)) : 1.0;
      b.currentAmps = b.live && b.voltageV > 10 ? Math.round((b.kva * 1000) / (Math.sqrt(3) * b.voltageV)) : 0;
      b.essentialKw = b.live ? Math.round(ld.essKw) : 0;
      b.nonEssentialKw = b.live ? Math.round(ld.nonEssKw) : 0;

      // VFD harmonic THD calculation
      if (!b.live) {
        b.thdPercent = 0;
      } else if (bId === 'busA' || bId === 'busB') {
        const vfdActive = live.has('drive') ? this.propulsionThrottle * 3.8 : 0;
        const bowActive = live.has('bow') ? 1.4 : 0;
        b.thdPercent = Number((1.2 + vfdActive + bowActive).toFixed(1));
      } else {
        b.thdPercent = Number((1.8 + (live.has('crane') ? 1.6 : 0)).toFixed(1));
      }

      // IT-system insulation resistance (kOhm)
      if (bId === 'busA' || bId === 'busB') {
        b.insulationKohm = this.earthFaultHv ? 14 : 15000;
      } else {
        b.insulationKohm = this.earthFaultLv ? 8 : 3200;
      }
    }

    this.hvEarthing = calculateHvEarthingState(
      this.earthingArchitecture,
      this.earthFaultHv,
      this.buses.busA.live || this.buses.busB.live
    );

    // 7. Update Synchroscope & Auto-Synchronizer
    this.updateSynchroscope(clampedDt, state, live, onStateMutated);

    // 8. Run Protection Relays & PMS Automation (Standby Start, Load Shedding, Blackout & Recovery)
    this.runProtectionAndPms(clampedDt, state, live, onStateMutated);
  }

  private updateSynchroscope(
    dt: number,
    state: SimState,
    live: Set<string>,
    onStateMutated?: (msg: string) => void
  ): void {
    // Auto-select a running standby generator if current syncTargetGen is not in standby
    const standbyCandidate = (['dg1', 'dg2', 'dg3', 'dg4'] as const).find(
      (id) => state.running[id] && !state.closed[`gb${id.slice(2)}`]
    );
    if (standbyCandidate && (!state.running[this.syncTargetGen] || state.closed[`gb${this.syncTargetGen.slice(2)}`])) {
      this.syncTargetGen = standbyCandidate;
    }

    const gen = this.generators[this.syncTargetGen];
    const targetBus = this.buses[gen.busId];
    const busLive = targetBus.live;
    const genReady = gen.running && gen.runupProgress >= 0.95;
    const alreadyClosed = gen.breakerClosed;

    // Auto-Sync Governor Trim & Automatic Breaker Close at 12 o'clock
    if (this.autoSyncGen === this.syncTargetGen && genReady && !alreadyClosed) {
      if (!busLive) {
        // Dead bus: close immediately
        state.closed[gen.breakerId] = true;
        this.autoSyncGen = null;
        this.pushAlarm('INFO', 'DEAD-BUS-CLS', `${gen.short} breaker closed onto dead ${targetBus.label}.`);
        onStateMutated?.(`${gen.short} breaker closed onto dead ${targetBus.label}.`);
      } else {
        // Trim incoming generator frequency to busFreq + 0.12 Hz for smooth clockwise rotation
        const desiredFreq = targetBus.frequencyHz + 0.12;
        gen.govSetpointHz += (desiredFreq - gen.frequencyHz) * Math.min(1, dt * 2.5);
      }
    }

    const slipHz = genReady && busLive ? gen.frequencyHz - targetBus.frequencyHz : 0;
    if (genReady && busLive && !alreadyClosed) {
      this.phaseAngleRad += 2 * Math.PI * slipHz * dt;
      // Wrap between -PI and +PI
      this.phaseAngleRad = ((this.phaseAngleRad + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    } else if (alreadyClosed) {
      this.phaseAngleRad = 0;
    }

    const phaseAngleDeg = (this.phaseAngleRad * 180) / Math.PI;
    const voltageDiffPercent =
      busLive && genReady
        ? Math.abs(((gen.voltageV - targetBus.voltageV) / 6600) * 100)
        : 0;

    const inSyncWindow =
      genReady &&
      (!busLive ||
        (Math.abs(phaseAngleDeg) <= 18 && Math.abs(slipHz) <= 0.35 && voltageDiffPercent <= 5.0));

    if (this.autoSyncGen === this.syncTargetGen && inSyncWindow && busLive && Math.abs(phaseAngleDeg) <= 8) {
      state.closed[gen.breakerId] = true;
      this.autoSyncGen = null;
      this.phaseAngleRad = 0;
      this.pushAlarm(
        'INFO',
        'SYNC-CLOSED',
        `ANSI 25A Auto-Synchronizer closed ${gen.short} breaker at Δθ=${Math.round(phaseAngleDeg)}°, Δf=${slipHz.toFixed(2)} Hz. Load sharing active.`
      );
      onStateMutated?.(`${gen.short} synchronized and paralleled onto ${targetBus.label}!`);
    }

    this.sync = {
      targetGenId: this.syncTargetGen,
      busLive,
      genReady,
      alreadyClosed,
      busFreqHz: targetBus.frequencyHz,
      genFreqHz: gen.frequencyHz,
      slipHz,
      busVoltageKv: targetBus.voltageV / 1000,
      genVoltageKv: gen.voltageV / 1000,
      voltageDiffPercent,
      phaseAngleDeg,
      inSyncWindow,
      autoSyncActive: this.autoSyncGen === this.syncTargetGen
    };
  }

  private runProtectionAndPms(
    dt: number,
    state: SimState,
    live: Set<string>,
    onStateMutated?: (msg: string) => void
  ): void {
    this.standbyStartCooldown = Math.max(0, this.standbyStartCooldown - dt);

    // 1. Generator Protective Relay Engine: ANSI 32 (Reverse Power), ANSI 40 (Loss of Field), ANSI 51 (IDMT Curve)
    for (const id of ['dg1', 'dg2', 'dg3', 'dg4', 'eg'] as const) {
      const g = this.generators[id];
      updateProtectiveRelays(
        {
          id: g.id,
          short: g.short,
          breakerId: g.breakerId,
          activePowerKW: g.kw,
          ratedPowerKW: g.ratedKw,
          reactivePowerKVAR: g.kvar,
          ratedVAR: g.ratedKvar,
          busVoltageKV: g.voltageV / 1000,
          nominalVoltageKV: g.nominalVoltageV / 1000,
          currentAmps: g.currentAmps,
          pickupCurrentAmps: g.pickupCurrentAmps,
          isBreakerClosed: g.running && g.breakerClosed,
          relays: g.relays
        },
        dt,
        (_dg, alarmMessage, ansiCode) => {
          state.closed[g.breakerId] = false;
          g.breakerClosed = false;
          g.relays.fieldLossInjected = false;
          this.pushAlarm('CRITICAL', ansiCode, alarmMessage);
          onStateMutated?.(alarmMessage);
        }
      );
    }

    // 1b. Feeder Breaker ANSI 51 IDMT Overcurrent Relays
    for (const [breakerId, fr] of Object.entries(this.feederRelays)) {
      updateFeederIdmtRelay(fr, !!state.closed[breakerId], dt, (_f, alarmMessage) => {
        state.closed[breakerId] = false;
        this.pushAlarm('CRITICAL', 'ANSI-51-FDR', alarmMessage);
        onStateMutated?.(alarmMessage);
      });
    }

    // 2. PMS Preferential Trip (Load Shedding) when any online DG exceeds 92% load
    const maxGenLoad = Math.max(
      ...(['dg1', 'dg2', 'dg3', 'dg4'] as const)
        .map((id) => this.generators[id])
        .filter((g) => g.running && g.breakerClosed)
        .map((g) => g.loadPercent),
      0
    );

    if (this.pmsAutoLoadShed && maxGenLoad >= 94) {
      // Shed Stage 1 non-essential feeders first, then Stage 2
      const stage1Feeders = ['reeferFeed', 'craneFeed', 'galleyFeed', 'outletFeed', 'ballastFeed'];
      const toShed = stage1Feeders.find((b) => state.closed[b]);
      if (toShed) {
        state.closed[toShed] = false;
        this.pushAlarm(
          'WARNING',
          'PMS-LOAD-SHED',
          `PMS Preferential Trip opened ${edgeById[toShed].name} (Generator load reached ${maxGenLoad}%).`
        );
        onStateMutated?.(`PMS Preferential Trip shed ${edgeById[toShed].name} to prevent overload blackout.`);
      }
    }

    // 3. PMS Automatic Standby Generator Start & Parallel when load >= 82%
    if (this.pmsAutoStandby && maxGenLoad >= 82 && this.standbyStartCooldown <= 0 && !this.autoSyncGen) {
      const nextStandby = (['dg2', 'dg3', 'dg4', 'dg1'] as const).find(
        (id) => !state.closed[`gb${id.slice(2)}`] && (state.closed.tie || this.generators[id].busId === 'busA')
      );
      if (nextStandby) {
        this.standbyStartCooldown = 5.0;
        state.running[nextStandby] = true;
        this.syncTargetGen = nextStandby;
        this.autoSyncGen = nextStandby;
        this.pushAlarm(
          'INFO',
          'PMS-STBY-START',
          `PMS Load-Dependent Start: High load (${maxGenLoad}%) detected. Auto-starting & synchronizing ${byId[nextStandby].short}.`
        );
        onStateMutated?.(`PMS Auto-Standby started ${byId[nextStandby].short} (Load ${maxGenLoad}% > 82%).`);
      }
    }

    // 4. Blackout Detection & Automatic Emergency Generator Start
    const isMainBlackout = !live.has('busA') && !live.has('busB');
    if (isMainBlackout && this.pmsAutoEmergency) {
      if (!state.running.eg) {
        state.running.eg = true;
        this.pushAlarm('WARNING', 'EM-GEN-START', 'Main bus dead: Emergency Generator (EM GEN) auto-started.');
        onStateMutated?.('Blackout detected: Emergency Generator starting automatically...');
      } else if (this.generators.eg.runupProgress >= 0.95 && !state.closed.egBreaker) {
        state.closed.egBreaker = true;
        this.pushAlarm(
          'INFO',
          'EM-BUS-LIVE',
          'Emergency Generator breaker closed. 440 V Emergency Switchboard supplying SOLAS essential services.'
        );
        onStateMutated?.('Emergency Generator online: SOLAS Emergency Switchboard energized.');
      }
    }

    // 5. SOLAS 5-Stage Sequential Blackout Recovery Waterfall State Machine
    if (this.waterfall.active) {
      this.waterfall.elapsedSec = Math.min(
        this.waterfall.totalDurationSec,
        this.waterfall.elapsedSec + dt * this.waterfall.timeScale
      );
      this.waterfall.progressPercent = Math.min(
        100,
        Math.round((this.waterfall.elapsedSec / this.waterfall.totalDurationSec) * 100)
      );
      this.advanceWaterfallStages(state, onStateMutated);

      if (this.waterfall.elapsedSec >= this.waterfall.totalDurationSec) {
        this.waterfall.active = false;
        this.waterfall.completed = true;
        this.waterfall.progressPercent = 100;
        this.recoveryStepIdx = 0;
        this.recoveryStage = 'SOLAS 5-Stage Waterfall Complete (T > 45s): All essential & heavy loads restored.';
        this.pushAlarm(
          'INFO',
          'PMS-REC-DONE',
          'SOLAS 5-Stage Sequential Blackout Recovery complete. All stages (0–10s ESB, 10–20s Stage 1 Aux, 20–30s Stage 2 Cooling/Fuel, 30–45s Stage 3 Essential, >45s Heavy Loads) online.'
        );
        onStateMutated?.(this.recoveryStage);
      }
    }
  }
}

export const simEngine = new MarinePowerSimEngine();
