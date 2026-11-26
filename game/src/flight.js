// flight.js — the flight model: throttle, lift, drag, stall, banking turns,
// fuel burn and damage. One job: move the plane honestly through the air.
// Position is metres; heading 0 = east (+X), pitch + = nose up.

import { FLIGHT, RUNWAY, clamp, lerp } from './config.js';
import { terrainHeightAt } from './terrain.js';

export function createFlightState() {
  return {
    // Parked at the west end of Meridian Field, facing down the runway.
    x: RUNWAY.x - RUNWAY.length / 2 + 12,
    y: RUNWAY.elevation + 2.2,
    z: RUNWAY.z,
    heading: 0,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    fuel: 100,
    damage: 0,
    onGround: true,
    airborne: false,
    crashed: false,
    // Last touchdown quality, for the landing mission.
    lastTouchdown: null,
    // Smooth-turn bookkeeping: how long the current turn has been gentle.
    gentleTurnTime: 0,
    distanceFlown: 0,
  };
}

// Reset to the runway after a crash or a mission restart.
export function resetToRunway(state) {
  const fresh = createFlightState();
  fresh.fuel = state.fuel;
  fresh.damage = state.damage;
  Object.assign(state, fresh);
}

// One physics step. `input` comes from input.js; `events` collects what
// happened this step (takeoff, touchdown, terrainHit, stallWarning, fuelEmpty).
export function stepFlight(state, input, dt) {
  const events = [];
  if (state.crashed) return events;
  dt = Math.min(dt, 0.05);

  // --- Throttle: W/S or Up/Down keys, plus mouse wheel in input.js.
  if (input.throttleUp) state.throttle = clamp(state.throttle + dt * 0.9, 0, 1);
  if (input.throttleDown) state.throttle = clamp(state.throttle - dt * 0.9, 0, 1);
  if (input.throttleSet !== null && input.throttleSet !== undefined) {
    state.throttle = clamp(input.throttleSet, 0, 1);
  }

  // --- Fuel: burns with throttle; empty tanks mean the engine quits.
  const burn = FLIGHT.fuelBurnIdle + (FLIGHT.fuelBurn - FLIGHT.fuelBurnIdle) * state.throttle;
  state.fuel = Math.max(0, state.fuel - burn * dt);
  if (state.fuel <= 0 && state.throttle > 0) {
    state.throttle = 0;
    events.push({ type: 'fuelEmpty' });
  }
  const thrust = state.throttle * (state.fuel > 0 ? 1 : 0);

  // --- Controls: bank from A/D or arrows, pitch from W/S arrows or mouse.
  let bankTarget = 0;
  if (input.bankLeft) bankTarget -= 1;
  if (input.bankRight) bankTarget += 1;
  if (input.mouseActive) bankTarget = clamp(input.mouseX * 1.6, -1, 1);
  const targetBank = bankTarget * FLIGHT.maxBank;
  state.bank = lerp(state.bank, targetBank, Math.min(1, dt * 3.2));

  let pitchTarget = 0;
  if (input.pitchUp) pitchTarget += 1;
  if (input.pitchDown) pitchTarget -= 1;
  if (input.mouseActive) pitchTarget = clamp(-input.mouseY * 1.4, -1, 1);
  // Pitch authority grows with airspeed: at taxi speed the stick does nothing.
  const pitchAuthority = clamp((state.speed - 8) / 30, 0, 1);
  const targetPitch = pitchTarget * 0.5 * pitchAuthority;
  state.pitch = lerp(state.pitch, targetPitch, Math.min(1, dt * 2.4));

  // --- Turn: heading follows the bank, faster when banked hard.
  const turnRate = FLIGHT.turnRate * Math.sin(state.bank);
  state.heading -= turnRate * dt;

  // --- Speed: thrust minus drag, minus the climb penalty, plus a dive bonus.
  const drag = FLIGHT.drag * state.speed * state.speed;
  const climbPenalty = Math.max(0, Math.sin(state.pitch)) * 14;
  const diveBonus = Math.max(0, -Math.sin(state.pitch)) * 10;
  const accel = thrust * FLIGHT.accel - drag - climbPenalty + diveBonus;
  state.speed = clamp(state.speed + accel * dt, 0, FLIGHT.maxSpeed);

  // --- Vertical: lift needs speed; below stall speed the nose drops.
  const stalled = state.speed < FLIGHT.stallSpeed && !state.onGround;
  let climb = 0;
  if (!state.onGround) {
    if (stalled) {
      climb = -7 - (FLIGHT.stallSpeed - state.speed) * 0.4;
      events.push({ type: 'stallWarning' });
    } else {
      climb = Math.sin(state.pitch) * FLIGHT.climbRate * clamp(state.speed / FLIGHT.cruiseSpeed, 0.4, 1.4);
      // Gentle sink at low throttle even when not stalled.
      climb += (thrust - 0.45) * 2.2;
    }
  }
  state.verticalSpeed = climb;

  // --- Move.
  const prevY = state.y;
  const forwardX = Math.cos(state.heading);
  const forwardZ = -Math.sin(state.heading);
  state.x += forwardX * state.speed * dt;
  state.z += forwardZ * state.speed * dt;
  state.y += climb * dt;
  state.distanceFlown += state.speed * dt;

  // --- Ground and terrain.
  const ground = terrainHeightAt(state.x, state.z);
  const clearance = state.y - ground;
  const wasAirborne = state.airborne;

  if (state.onGround) {
    // Rolling on the ground: stay glued unless fast enough to lift.
    state.y = ground + FLIGHT.terrainMargin;
    if (state.speed > FLIGHT.liftSpeed && state.pitch > 0.05) {
      state.onGround = false;
      state.airborne = true;
      state.y += 0.5;
      events.push({ type: 'takeoff' });
    }
  } else {
    if (clearance <= FLIGHT.terrainMargin) {
      // Touchdown or impact. Vertical speed at contact decides the outcome.
      const impact = Math.abs(climb);
      const onRunway = isOnRunway(state.x, state.z);
      const touchdown = {
        verticalSpeed: climb,
        speed: state.speed,
        onRunway,
        headingError: runwayHeadingError(state.heading),
        bank: Math.abs(state.bank),
      };
      state.lastTouchdown = touchdown;
      if (impact > FLIGHT.crashDamageSpeed || state.speed > 85) {
        state.crashed = true;
        state.damage = 100;
        events.push({ type: 'crash', reason: 'terrain', impact });
      } else {
        if (impact > FLIGHT.hardLandingSpeed) {
          state.damage = Math.min(100, state.damage + (impact - FLIGHT.hardLandingSpeed) * 9);
          events.push({ type: 'hardLanding', impact });
        }
        state.onGround = true;
        state.airborne = false;
        state.y = ground + FLIGHT.terrainMargin;
        state.pitch = 0;
        state.bank = 0;
        events.push({ type: 'touchdown', touchdown });
      }
    }
    if (wasAirborne && !state.airborne) {
      // Landed — handled above.
    }
  }

  // Out of the world: the sea is far below, the isles are far away.
  if (Math.abs(state.x) > 1900 || Math.abs(state.z) > 1900) {
    events.push({ type: 'outOfBounds' });
    // Gently turn the pilot back toward home instead of ending the flight.
    state.heading = Math.atan2(state.z, -state.x);
  }

  // --- Smooth-turn reward bookkeeping: banked, steady, no stall.
  if (!state.onGround && Math.abs(state.bank) > 0.25 && !stalled) {
    state.gentleTurnTime += dt;
  } else {
    state.gentleTurnTime = Math.max(0, state.gentleTurnTime - dt * 2);
  }

  return events;
}

export function isOnRunway(x, z) {
  const dx = Math.abs(x - RUNWAY.x);
  const dz = Math.abs(z - RUNWAY.z);
  return dx <= RUNWAY.length / 2 && dz <= RUNWAY.width / 2 + 2;
}

export function runwayHeadingError(heading) {
  // Runway runs east-west: ideal headings are 0 (east) or PI (west).
  const h = ((heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const errEast = Math.min(h, Math.PI * 2 - h);
  const errWest = Math.abs(h - Math.PI);
  return Math.min(errEast, errWest);
}

// Landing grade from a touchdown record, for the landing mission.
export function gradeLanding(touchdown) {
  if (!touchdown) return null;
  if (!touchdown.onRunway) return { grade: 'OFF STRIP', score: 0 };
  const vs = Math.abs(touchdown.verticalSpeed);
  const aligned = touchdown.headingError < 0.26; // ~15 degrees
  const level = touchdown.bank < 0.2;
  const slow = touchdown.speed < 45;
  if (vs < 2.5 && aligned && level && slow) return { grade: 'PERFECT', score: 500 };
  if (vs < 4.5 && aligned && slow) return { grade: 'GOOD', score: 300 };
  if (vs < 6) return { grade: 'ROUGH', score: 120 };
  return { grade: 'HARD', score: 0 };
}

// Refuel: parked on the runway, engine idle, hold still a moment.
export function refuelIfParked(state, dt) {
  if (state.onGround && state.speed < 2 && isOnRunway(state.x, state.z) && state.throttle < 0.05) {
    state.fuel = Math.min(100, state.fuel + 12 * dt);
    return state.fuel >= 100;
  }
  return false;
}
