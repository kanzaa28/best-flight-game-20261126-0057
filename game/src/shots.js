// shots.js — staged scenes for the screenshots and the autopilot that
// playtests the game headlessly. One job: set up a readable frame, and fly
// the plane like a careful pilot. Nothing here runs in normal play except
// through the ?shot= / ?autopilot= query parameters.

import { RUNWAY, clamp } from './config.js';
import { currentTarget } from './missions.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Place the plane mid-flight, steady and level, heading at a target point.
function placeInFlight(state, x, y, z, heading, speed, throttle) {
  state.x = x;
  state.y = y;
  state.z = z;
  state.heading = heading;
  state.pitch = 0;
  state.bank = 0;
  state.speed = speed;
  state.throttle = throttle;
  state.onGround = false;
  state.airborne = true;
  state.crashed = false;
  state.verticalSpeed = 0;
}

// Staged scenes, one per screenshot. Each sets the mission, the plane and
// the camera target so the frame reads at a glance when shrunk.
export function applyShot(game, name) {
  const { state, mission, startMission } = game;
  if (name === 'cover') {
    startMission('rings');
    // Chase view: plane low over the sea, ring 0 ahead, home island behind.
    placeInFlight(state, 120, 96, -40, 0.35, 58, 0.72);
    mission.elapsed = 47;
    game.snapCamera = true;
  } else if (name === 'rings') {
    startMission('rings');
    // Right on top of ring 1, its glow filling the frame ahead — ring 0
    // already flown, so the frame shows progress, not a cold start.
    placeInFlight(state, 470, 108, -330, 0.5, 56, 0.7);
    mission.ringsPassed = 1;
    mission.ringIndex = 1;
    mission.score = 100;
    mission.elapsed = 72;
    const done = mission.rings[0];
    done.userData.torus.material.color.setHex(0x7dff9a);
    done.userData.halo.material.color.setHex(0x7dff9a);
    game.snapCamera = true;
  } else if (name === 'drop') {
    startMission('cargo');
    // Over Lantern Isle, crate already falling toward the beacon. The drop
    // is staged, so restore the crate count: the objective still reads the
    // first beacon and the frame shows the crate in the air.
    placeInFlight(state, 690, 130, 320, -0.98, 52, 0.6);
    const crate = game.dropCrateNow();
    if (crate) {
      // Abeam the plane, left of the flight path, so the falling crate
      // reads clearly beside the fuselage instead of hiding behind it.
      crate.group.position.set(722, 115, 317);
      crate.group.scale.set(2, 2, 2);
      crate.group.visible = true;
    }
    mission.cratesLeft = 3;
    mission.message = 'Supplies away for Lantern Isle';
    mission.messageUntil = game.time + 6;
    mission.elapsed = 125;
    game.snapCamera = true;
  } else if (name === 'landing') {
    startMission('landing');
    // On final: runway ahead, gear down, throttle back.
    mission.landing.climbed = true;
    mission.landing.circled = true;
    placeInFlight(state, RUNWAY.x + 260, 62, RUNWAY.z + 6, Math.PI, 34, 0.3);
    mission.elapsed = 211;
    game.snapCamera = true;
  }
  game.frozen = true;
}

// --- Autopilot -------------------------------------------------------------
// Flies the current mission: take off, steer to the target with the mouse
// channel, manage throttle for a target speed, drop over a zone, flare for
// landing. Returns { input, drop } for the main loop to apply.

export function autopilotInput(game, dt) {
  const { state, mission } = game;
  const input = {
    throttleUp: false,
    throttleDown: false,
    throttleSet: null,
    pitchUp: false,
    pitchDown: false,
    bankLeft: false,
    bankRight: false,
    mouseActive: true,
    mouseX: 0,
    mouseY: 0,
  };
  let drop = false;

  // Takeoff roll: full throttle, rotate once fast enough. The mouse channel
  // stays off here: a centred mouse would cancel the pitch-up command.
  if (state.onGround && !state.airborne) {
    input.throttleSet = 1;
    input.mouseActive = false;
    if (state.speed > 27) input.pitchUp = true;
    return { input, drop };
  }

  const target0 = currentTarget(mission);
  if (!target0) return { input, drop };

  // Landing final: fly the approach fix first (on the centreline, east of
  // the strip), then the threshold itself, so the touchdown happens on the
  // strip instead of on the grass past it.
  const landingFinal =
    mission.mission &&
    mission.mission.id === 'landing' &&
    mission.landing.circled;
  let target = target0;
  if (landingFinal) {
    const distCenter = Math.hypot(state.x - RUNWAY.x, state.z - RUNWAY.z);
    if (distCenter > 320) target = { x: RUNWAY.x + 260, y: 62, z: RUNWAY.z };
    else target = { x: RUNWAY.x + 30, y: RUNWAY.elevation + 3, z: RUNWAY.z };
  }
  const desiredSpeed = landingFinal ? 30 : 55;

  // Heading: bank toward the bearing error.
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const desiredHeading = Math.atan2(-dz, dx);
  const err = wrapAngle(desiredHeading - state.heading);
  input.mouseX = clamp(-err * 1.6, -1, 1);

  // Altitude: pitch toward the target height.
  const altErr = target.y - state.y;
  let pitchCmd = clamp(-altErr * 0.045, -0.9, 0.9);
  if (landingFinal) {
    const dist = Math.hypot(dx, dz);
    if (dist < 260) pitchCmd = clamp(pitchCmd, -0.5, 0.25);
  }
  input.mouseY = pitchCmd;

  // Throttle: hold the target speed, ease off on final.
  const speedErr = desiredSpeed - state.speed;
  let thr = 0.55 + speedErr * 0.03;
  if (landingFinal) {
    const dist = Math.hypot(dx, dz);
    if (dist < 260) thr = Math.min(thr, 0.28);
  }
  input.throttleSet = clamp(thr, 0.1, 1);

  // Cargo: release when almost over the beacon.
  if (mission.mission && mission.mission.id === 'cargo' && mission.cratesLeft > 0) {
    const zone = mission.zones[mission.zones.length - mission.cratesLeft];
    if (zone && Math.hypot(zone.x - state.x, zone.z - state.z) < 12 && state.y < 160) {
      drop = true;
    }
  }
  return { input, drop };
}
