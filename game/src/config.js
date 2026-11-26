// MERIDIAN RUN — Dawn Courier over the Kestrel Isles
// config.js — every tuning number, colour and mission definition in one place.
// One job: constants. No rendering, no state, no side effects.

export const GAME_TITLE = 'MERIDIAN RUN';
export const GAME_SUBTITLE = 'Dawn Courier over the Kestrel Isles';

// Dawn palette: one warm style for sky, sea, islands and HUD.
export const PALETTE = {
  skyTop: 0x2e4a7a,
  skyMid: 0xe8906b,
  skyLow: 0xf7c873,
  sun: 0xffd9a0,
  sea: 0x1d5f7a,
  seaDeep: 0x123f56,
  sand: 0xe8cf9a,
  grass: 0x5f8f4a,
  rock: 0x8a7a68,
  runway: 0x3a3f46,
  runwayLine: 0xf5e9c8,
  ring: 0xffb347,
  ringDone: 0x7dff9a,
  hud: '#ffe9b8',
  hudDim: '#b8c8e0',
  danger: '#ff6b5e',
  ok: '#7dff9a',
};

// Flight model tuning (units: metres, seconds, knots for display).
export const FLIGHT = {
  maxThrottle: 1,
  accel: 26, // m/s^2 at full throttle, before drag
  drag: 0.012, // quadratic drag coefficient
  liftSpeed: 24, // m/s: below this the wings give no lift
  cruiseSpeed: 62, // m/s: comfortable cruise
  maxSpeed: 95,
  stallSpeed: 21, // m/s: below this the nose drops
  turnRate: 0.55, // rad/s at full bank
  maxBank: 1.1, // rad
  pitchRate: 0.5,
  climbRate: 10.5, // m/s at full throttle + pull
  fuelCapacity: 100,
  fuelBurn: 0.85, // % per second at full throttle
  fuelBurnIdle: 0.18, // % per second at idle
  crashDamageSpeed: 14, // m/s vertical speed that wrecks the plane on impact
  hardLandingSpeed: 6, // m/s vertical speed that hurts on touchdown
  terrainMargin: 2.2, // m above terrain the wheels clear
};

// The archipelago. Seeded, so every load builds the same islands.
export const WORLD_SEED = 20261126;
export const SEA_LEVEL = 0;
export const WORLD_RADIUS = 1400;

// Islands: x, z, radius, height. Home island (index 0) holds the runway.
export const ISLANDS = [
  { x: 0, z: 0, r: 260, h: 46 }, // Home — Meridian Field
  { x: 520, z: -380, r: 190, h: 64 }, // Kestrel Rock
  { x: -480, z: -520, r: 170, h: 52 }, // Gull Cay
  { x: 760, z: 420, r: 210, h: 38 }, // Lantern Isle
  { x: -700, z: 380, r: 150, h: 58 }, // Twin Peaks
  { x: 180, z: -860, r: 160, h: 44 }, // Coral Spit
  { x: -260, z: 820, r: 180, h: 36 }, // Heron Bank
  { x: 980, z: -60, r: 130, h: 70 }, // Far Beacon
];

// Runway on the home island: along +X, centred near the island's flat top.
export const RUNWAY = {
  x: -40,
  z: 0,
  length: 170,
  width: 16,
  heading: 0, // runway runs east-west
  elevation: 46, // matches the home island's flattened top
};

// Missions: three sorties with different goals.
export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tag: 'Fly the dawn circuit',
    brief:
      'Eight signal rings hang over the isles. Thread every ring in order — smooth turns, steady throttle. Each ring pays 100, and a fast clean circuit pays a time bonus.',
    rings: 8,
    fuelStart: 100,
  },
  {
    id: 'cargo',
    name: 'CARGO DROP',
    tag: 'Supplies for the far isles',
    brief:
      'Three crates for three outposts. Line up over the glowing drop zone and press SPACE to release. Closer to the beacon, bigger the pay — up to 300 a crate. Watch your fuel: the run is long.',
    drops: 3,
    fuelStart: 100,
  },
  {
    id: 'landing',
    name: 'RUNWAY LANDING',
    tag: 'Bring her home gentle',
    brief:
      'Take off, climb to 120 m, circle once past the beacon, then land back on Meridian Field. Touch down slow, level and on the strip — a perfect landing pays 500. Hard hits cost damage.',
    fuelStart: 100,
  },
];

// Scoring.
export const SCORE = {
  ring: 100,
  ringTimeBonus: 240,
  dropMax: 300,
  landingPerfect: 500,
  landingGood: 300,
  landingRough: 120,
  smoothTurnBonus: 25,
};

// Small deterministic RNG (mulberry32) for terrain detail.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Knots for the HUD (1 m/s ≈ 1.944 kt).
export function msToKnots(ms) {
  return ms * 1.94384;
}

export function formatHeading(rad) {
  const deg = ((rad * 180) / Math.PI % 360 + 360) % 360;
  return String(Math.round(deg)).padStart(3, '0');
}
