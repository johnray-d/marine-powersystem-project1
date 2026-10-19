/** Display dimensions, in consistent scene units (approximately four metres each).
 * These are illustrative proportions, not a dimensional ship design.
 * Coordinates: X = stern to bow, Y = height, Z = port to starboard.
 */
export interface VesselPlacement {
  position: [number, number, number]; // Centre in plan, bottom of equipment in height.
  size: [number, number, number]; // Maximum assembled width, height, depth.
  rotation?: number;
  // 'cargo' equipment is a container that sits inside a stack of the cargo bays.
  space: 'hull' | 'house' | 'deck' | 'external' | 'cargo';
}

type Table = [number, number][];

export const SHIP = {
  mainDeck: 0.9,
  keel: -2.65,
  waterline: -1.25,
  house: { minX: -13.5, maxX: -7.3, halfWidth: 2.65, roof: 4.7 },
  // Plan outline of the main deck: x (stern to bow) and half-beam. The bow is flared and raked.
  stations: [
    [-17.4, 1.65], [-16.2, 2.55], [-13.5, 3.1], [-9, 3.35],
    [9.5, 3.35], [11, 3.3], [12.5, 3.08], [14, 2.62], [15.2, 2.05], [16.2, 1.48], [17, 1.05], [17.8, 0.58], [18.4, 0.22], [18.7, 0.04]
  ] as Table,
  // Half-width of the flat of the bottom. It stays wide under the bow thruster, then closes into the forefoot.
  bottom: [
    [-17.4, 0.5], [-16.2, 1.45], [-13.5, 2.2], [-9, 2.5],
    [9.5, 2.5], [12, 2.4], [14.2, 1.85], [15.5, 1.2], [16.5, 0.5], [17.3, 0.08]
  ] as Table,
  // Keel line: flat for most of the length, rising under the stern run and into the forefoot.
  keelLine: [[-17.4, -2.15], [-16.6, -2.65], [14.8, -2.65], [16.6, -1.95], [17.5, -1.5]] as Table
};

export const CARGO = { bays: [-4.4, -1.15, 2.1, 9.9], length: 3.04, width: .61, height: .65, rowPitch: .66, rows: 8 };

function lerpTable(table: Table, x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i], [x0, y0] = table[i - 1];
    if (x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return table[table.length - 1][1];
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export const hullStart = SHIP.stations[0][0];
export const hullEnd = SHIP.stations[SHIP.stations.length - 1][0];
/** Height of the keel line at x. */
export function keelAt(x: number): number { return lerpTable(SHIP.keelLine, x); }

/** Half-beam of the hull at plan position x and height. Returns 0 outside the hull or below the local keel line. */
export function halfBeamAt(x: number, height = SHIP.mainDeck): number {
  if (x < hullStart || x > hullEnd) return 0;
  const keel = keelAt(x);
  if (height < keel - 1e-6) return 0;
  const t = clamp01((height - keel) / (SHIP.mainDeck - keel));
  const deckWidth = lerpTable(SHIP.stations, x);
  const flat = Math.min(deckWidth, lerpTable(SHIP.bottom, x));
  // Midships the sides rise with a rounded bilge; towards the bow they flare outwards instead.
  const w = smooth(9, 14.5, x);
  const shape = (1 - Math.pow(1 - t, 2.4)) * (1 - w) + Math.pow(t, 1.35) * w;
  return flat + (deckWidth - flat) * shape;
}

export const vesselLayout: Record<string, VesselPlacement> = {
  dg1: { position: [-8.8, -1.72, -1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  dg2: { position: [-5.9, -1.72, -1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  dg3: { position: [-8.8, -1.72, 1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  dg4: { position: [-5.9, -1.72, 1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  busA: { position: [-8.7, -0.3, -0.7], size: [1.35, 0.92, 0.62], space: 'hull' },
  busB: { position: [-6.8, -0.3, 0.7], size: [1.35, 0.92, 0.62], space: 'hull' },
  drive: { position: [-11.3, -1.7, -1.25], size: [1.4, 1.15, 0.65], rotation: Math.PI, space: 'hull' },
  motor: { position: [-13.5, -2.599, 0], size: [1.55, 0.85, 0.80], rotation: Math.PI, space: 'hull' },
  prop: { position: [-17.38, -2.22, 0], size: [0.65, 1.0, 1.0], space: 'external' },
  bow: { position: [14.1, -2.55, 0], size: [0.95, 1.72, 2.55], rotation: Math.PI / 2, space: 'hull' },

  // Dual Main Step-Down Transformers (6.6 kV / 440 V, 2.5 MVA)
  txA: { position: [-4.0, -1.72, -1.12], size: [1.08, 1.0, 0.85], space: 'hull' },
  txB: { position: [-4.0, -1.72, 1.12], size: [1.08, 1.0, 0.85], space: 'hull' },

  // Dual Reefer Distribution Transformers (6.6 kV / 440 V, 1.5 MVA)
  txReeferA: { position: [3.5, -0.30, -1.15], size: [1.0, 0.95, 0.8], space: 'hull' },
  txReeferB: { position: [3.5, -0.30, 1.15], size: [1.0, 0.95, 0.8], space: 'hull' },

  // Dual 440 V Main Switchboards
  lvBusA: { position: [-4.25, -0.30, -0.9], size: [1.35, 0.82, 0.56], space: 'hull' },
  lvBusB: { position: [-4.25, -0.30, 0.9], size: [1.35, 0.82, 0.56], space: 'hull' },

  // Dual Reefer Distribution Boards
  reeferA: { position: [7.75, 0.94, -2.3], size: [0.62, 0.67, 0.39], rotation: Math.PI, space: 'deck' },
  reeferB: { position: [7.75, 0.94, 2.3], size: [0.62, 0.67, 0.39], rotation: Math.PI, space: 'deck' },

  // Dual Auxiliary / Control Transformers (440 V / 220 V, 500 kVA)
  txConA: { position: [-10.5, 1.02, -1.45], size: [0.56, 0.55, 0.4], space: 'house' },
  txConB: { position: [-10.5, 1.02, 1.45], size: [0.56, 0.55, 0.4], space: 'house' },

  // Dual 220 V Sub-Boards
  consumerA: { position: [-9.4, 1.02, -1.45], size: [0.72, 0.63, 0.34], space: 'house' },
  consumerB: { position: [-9.4, 1.02, 1.45], size: [0.72, 0.63, 0.34], space: 'house' },

  // 440 V Machinery Loads
  fire1: { position: [-1.85, -1.72, -1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  fire2: { position: [-1.85, -1.72, 1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  cooling1: { position: [-0.15, -1.72, -1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  cooling2: { position: [-0.15, -1.72, 1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  ballast: { position: [1.85, -1.72, -1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  bilge: { position: [2.15, -1.72, 1.8], size: [0.61, 0.42, 0.4], space: 'hull' },
  steering: { position: [-14.65, -0.35, 1.15], size: [0.95, 0.51, 0.61], space: 'hull' },
  crane: { position: [6.6, 0.96, 0], size: [3.2, 3.0, 0.9], space: 'deck' },

  // 220 V Domestic & Service Loads
  nav: { position: [-8.5, 3.45, 0], size: [1.02, 0.5, 1.7], space: 'house' },
  lightsA: { position: [-11.4, 3.15, -1.0], size: [1.6, 0.16, 0.18], space: 'house' },
  lightsB: { position: [-11.4, 3.15, 1.0], size: [1.6, 0.16, 0.18], space: 'house' },
  galley: { position: [-12.2, 1.02, 1.25], size: [0.85, 0.45, 0.5], space: 'house' },

  // 440 V Emergency Switchboard & Emergency Loads
  eg: { position: [-12.0, 2.20, -1.3], size: [1.34, 0.68, 0.65], space: 'house' },
  eBus: { position: [-9.7, 2.20, -1.3], size: [0.78, 0.66, 0.35], space: 'house' },
  eFire: { position: [11.75, -1.72, 0.95], size: [0.67, 0.48, 0.43], space: 'hull' },
  eSteer: { position: [-14.65, -0.35, -1.15], size: [0.56, 0.57, 0.37], space: 'hull' },
  eLights: { position: [-12.7, 3.2, -0.05], size: [0.58, 0.13, 0.16], space: 'house' },
  eRadio: { position: [-8.8, 3.45, 1.25], size: [0.85, 0.45, 0.6], space: 'house' },
  shore: { position: [6.7, 0.94, -2.55], size: [0.6, 0.67, 0.38], space: 'deck' }
};

// ============================================================================
// PHASE 3: SOLAS BLACKOUT RECOVERY 5-STAGE SEQUENTIAL WATERFALL
// ============================================================================
export interface SolasWaterfallStage {
  stageNumber: 1 | 2 | 3 | 4 | 5;
  id: string;
  timeWindowLabel: string;
  startSec: number;
  endSec: number;
  shortTitle: string;
  description: string;
  sourcesToStart: string[];
  breakersToClose: string[];
}

export interface SolasWaterfallStatus {
  active: boolean;
  completed: boolean;
  elapsedSec: number;
  totalDurationSec: number;
  progressPercent: number;
  currentStageIndex: number; // 0..4 (-1 when inactive)
  currentStage: SolasWaterfallStage | null;
  timeScale: number; // Default 2.5x so users can observe the 50s SOLAS sequence smoothly, or toggle 1x/5x
}

/**
 * All main 6.6 kV and 440 V load feeder breakers that must open upon blackout
 * so loads NEVER energize simultaneously upon main breaker closure.
 */
export const MAIN_BLACKOUT_SHED_BREAKERS: string[] = [
  'propFeed',
  'bowFeed',
  'txAFeed',
  'txBFeed',
  'reeferAFeed',
  'reeferBFeed',
  'conAAcb',
  'conBAcb',
  'fire1Feed',
  'fire2Feed',
  'cooling1Feed',
  'cooling2Feed',
  'ballastFeed',
  'bilgeFeed',
  'steerFeed',
  'craneFeed',
  'navFeed',
  'lightAFeed',
  'lightBFeed',
  'galleyFeed'
];

export const SOLAS_WATERFALL_STAGES: SolasWaterfallStage[] = [
  {
    stageNumber: 1,
    id: 'stage-1-esb',
    timeWindowLabel: 'T = 0s – 10s',
    startSec: 0,
    endSec: 10,
    shortTitle: 'ESB & Emergency DG',
    description: 'T = 0s–10s: Emergency DG auto-start → ESB supply (Steering Gear, Emergency Lighting, Nav, Radio)',
    sourcesToStart: ['eg'],
    breakersToClose: ['egBreaker', 'eSteerFeed', 'eLightFeed', 'eRadioFeed', 'eFireFeed']
  },
  {
    stageNumber: 2,
    id: 'stage-2-aux1',
    timeWindowLabel: 'T = 10s – 20s',
    startSec: 10,
    endSec: 20,
    shortTitle: 'Main DG & Stage 1 Aux',
    description: 'T = 10s–20s: Primary DG start → 6.6 kV Bus A & B → TX A & TX B → Stage 1 Aux (SW Cooling & Steering Gear)',
    sourcesToStart: ['dg1'],
    breakersToClose: ['gb1', 'tie', 'txAFeed', 'txBFeed', 'cooling1Feed', 'cooling2Feed', 'steerFeed']
  },
  {
    stageNumber: 3,
    id: 'stage-3-aux2',
    timeWindowLabel: 'T = 20s – 30s',
    startSec: 20,
    endSec: 30,
    shortTitle: 'Stage 2 Control & Nav',
    description: 'T = 20s–30s: Stage 2 Auxiliaries: Close Control Transformers (TX CON A & B), 220 V Bus Tie, Nav Bridge & Lighting',
    sourcesToStart: [],
    breakersToClose: ['conAAcb', 'conBAcb', 'consumerTie', 'navFeed', 'lightAFeed', 'lightBFeed']
  },
  {
    stageNumber: 4,
    id: 'stage-4-ess',
    timeWindowLabel: 'T = 30s – 45s',
    startSec: 30,
    endSec: 45,
    shortTitle: 'Stage 3 Essential Loads',
    description: 'T = 30s–45s: Stage 3 Essential Service Loads (Fire Pumps, Ballast & Bilge Pumps)',
    sourcesToStart: [],
    breakersToClose: ['fire1Feed', 'fire2Feed', 'ballastFeed', 'bilgeFeed']
  },
  {
    stageNumber: 5,
    id: 'stage-5-heavy',
    timeWindowLabel: 'T > 45s',
    startSec: 45,
    endSec: 55,
    shortTitle: 'Heavy & Non-Essential',
    description: 'T > 45s: Non-Essential & Heavy Motors (Dual Reefer Transformers A & B, Deck Crane, Propulsion VFD & Bow Thruster)',
    sourcesToStart: [],
    breakersToClose: ['reeferAFeed', 'reeferBFeed', 'craneFeed', 'bowFeed', 'propFeed', 'galleyFeed']
  }
];

export function createInitialWaterfallStatus(): SolasWaterfallStatus {
  return {
    active: false,
    completed: false,
    elapsedSec: 0,
    totalDurationSec: 55,
    progressPercent: 0,
    currentStageIndex: -1,
    currentStage: null,
    timeScale: 2.5
  };
}

