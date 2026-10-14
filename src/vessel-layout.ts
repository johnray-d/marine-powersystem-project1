/** Display dimensions, in consistent scene units (approximately four metres each).
 * These are illustrative proportions, not a dimensional ship design.
 * Coordinates: X = stern to bow, Y = height, Z = port to starboard.
 */
export interface VesselPlacement {
  position: [number, number, number]; // Centre in plan, bottom of equipment in height.
  size: [number, number, number]; // Maximum assembled width, height, depth.
  rotation?: number;
  space: 'hull' | 'house' | 'deck' | 'external';
}

export const SHIP = {
  mainDeck: 0.9,
  keel: -2.65,
  house: { minX: -13.5, maxX: -7.3, halfWidth: 2.65, roof: 4.7 },
  stations: [
    [-17.4, 1.65], [-16.2, 2.55], [-13.5, 3.1], [-9, 3.35],
    [9.5, 3.35], [13, 2.9], [15.6, 1.9], [17.2, 0.85], [18.2, 0.04]
  ] as [number, number][]
};

export const CARGO = { bays: [-4.4, -1.15, 2.1, 9.9], length: 3.04, width: .61, height: .65, rowPitch: .66, rows: 8 };

export function halfBeamAt(x: number, height = SHIP.mainDeck): number {
  const stations = SHIP.stations;
  if (x < stations[0][0] || x > stations[stations.length - 1][0]) return 0;
  for (let i = 1; i < stations.length; i++) {
    const [end, width] = stations[i];
    const [start, previous] = stations[i - 1];
    if (x <= end) {
      const topWidth = previous + (width - previous) * (x - start) / (end - start);
      const verticalFactor = 0.64 + 0.36 * Math.max(0, Math.min(1, (height - SHIP.keel) / (SHIP.mainDeck - SHIP.keel)));
      return topWidth * verticalFactor;
    }
  }
  return 0;
}

export const vesselLayout: Record<string, VesselPlacement> = {
  dg1: { position: [-8.8, -1.72, -1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  dg2: { position: [-5.9, -1.72, -1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  dg3: { position: [-8.8, -1.72, 1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  dg4: { position: [-5.9, -1.72, 1.25], size: [2.05, 1.12, 0.98], space: 'hull' },
  busA: { position: [-8.7, -0.3, -0.7], size: [1.35, 0.92, 0.62], space: 'hull' },
  busB: { position: [-6.8, -0.3, -0.7], size: [1.35, 0.92, 0.62], space: 'hull' },
  drive: { position: [-11.3, -1.7, 1.25], size: [1.4, 1.15, 0.65], space: 'hull' },
  motor: { position: [-13.5, -2.02, 0], size: [2.0, 1.17, 1.08], rotation: Math.PI, space: 'hull' },
  prop: { position: [-17.8, -2.22, 0], size: [0.65, 1.52, 1.52], space: 'external' },
  // Bow thruster sits on the hull floor. The stern thruster is as low as it can go while clearing the propeller shaft line (y about -1.52).
  bow: { position: [14.1, -2.55, 0], size: [0.95, 1.72, 2.55], rotation: Math.PI / 2, space: 'hull' },
  stern: { position: [-15.7, -1.34, 0], size: [0.75, 1.38, 1.85], rotation: Math.PI / 2, space: 'hull' },
  txA: { position: [-4.0, -1.72, -1.12], size: [1.08, 1.0, 0.85], space: 'hull' },
  txB: { position: [-4.0, -1.72, 1.12], size: [1.08, 1.0, 0.85], space: 'hull' },
  lvBus: { position: [-4.25, -0.30, 0], size: [1.45, 0.82, 0.56], space: 'hull' },
  reefer: { position: [4.45, 0.94, 2.3], size: [0.62, 0.67, 0.39], rotation: Math.PI, space: 'deck' },
  crane: { position: [6.6, 0.96, 0], size: [2.9, 3.5, 0.65], space: 'deck' },
  fire: { position: [-1.85, -1.72, -1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  ballast: { position: [0.15, -1.72, -1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  bilge: { position: [2.15, -1.72, -1.8], size: [0.61, 0.42, 0.4], space: 'hull' },
  cooling: { position: [-1.85, -1.72, 1.8], size: [0.7, 0.48, 0.45], space: 'hull' },
  steering: { position: [-14.65, -0.35, 1.15], size: [0.95, 0.51, 0.61], space: 'hull' },
  eSteer: { position: [-14.65, -0.35, -1.15], size: [0.56, 0.57, 0.37], space: 'hull' },
  tx220: { position: [-11.5, 1.02, -1.45], size: [0.56, 0.55, 0.4], space: 'house' },
  consumer: { position: [-9.4, 1.02, -1.45], size: [0.72, 0.63, 0.34], space: 'house' },
  galley: { position: [-12.2, 1.02, 1.25], size: [0.85, 0.45, 0.5], space: 'house' },
  lights: { position: [-11.4, 3.15, 1.0], size: [1.6, 0.16, 0.18], space: 'house' },
  outlets: { position: [-9.5, 2.17, 1.1], size: [0.9, 0.23, 0.11], space: 'house' },
  eg: { position: [-12.0, 2.20, -1.3], size: [1.34, 0.68, 0.65], space: 'house' },
  eBus: { position: [-9.7, 2.20, -1.3], size: [0.78, 0.66, 0.35], space: 'house' },
  eFire: { position: [11.75, -1.72, 0.95], size: [0.67, 0.48, 0.43], space: 'hull' },
  nav: { position: [-8.5, 3.45, 0], size: [1.02, 0.5, 1.7], space: 'house' },
  eLights: { position: [-12.7, 3.2, -0.05], size: [0.58, 0.13, 0.16], space: 'house' },
  shore: { position: [6.7, 0.94, -2.55], size: [0.6, 0.67, 0.38], space: 'deck' }
};
