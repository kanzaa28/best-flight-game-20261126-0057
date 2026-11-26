// main.js — MERIDIAN RUN: wires the world, the plane, the flight model,
// the missions, the HUD and the audio together, and runs the game loop.
// One job: the game itself — state machine, chase camera, per-frame glue.

import * as THREE from 'three';
import { GAME_TITLE, GAME_SUBTITLE, clamp } from './config.js';
import { buildWorld, driftClouds, terrainHeightAt } from './terrain.js';
import { buildCourierPlane, animateAircraft } from './aircraft.js';
import {
  createFlightState,
  resetToRunway,
  stepFlight,
  refuelIfParked,
} from './flight.js';
import {
  createMissionManager,
  startMission,
  stepMission,
  dropCrate,
  objectiveText,
  currentTarget,
} from './missions.js';
import {
  createHud,
  updateHud,
  showTitle,
  hideTitle,
  showDebrief,
  hideDebrief,
} from './hud.js';
import {
  createAudio,
  startAudio,
  updateAudio,
  playRingChime,
  playDropThud,
  playCrash,
  playTakeoff,
  playSuccess,
  toggleMute,
} from './audio.js';
import { createInput, attachInput, readInput } from './input.js';
import { applyShot, autopilotInput } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const autopilotName = params.get('autopilot');

function createGame() {
  const canvas = document.getElementById('game-canvas');
  // ?quality=low is the headless playtest mode: no antialiasing, a lower
  // pixel ratio, so software rendering keeps up with the game clock.
  const lowQuality = new URLSearchParams(window.location.search).get('quality') === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowQuality });
  renderer.setPixelRatio(lowQuality ? 0.6 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 6000);
  camera.position.set(-30, 60, 40);

  const world = buildWorld(scene);
  const aircraft = buildCourierPlane();
  scene.add(aircraft.group);
  // The crate template lives off-screen; dropCrate clones it.
  aircraft.crate.position.set(0, -1000, 0);
  scene.add(aircraft.crate);

  const state = createFlightState();
  const mission = createMissionManager(scene);
  const hud = createHud(document);
  const audio = createAudio();
  const input = createInput();
  attachInput(input, canvas);

  const game = {
    renderer,
    scene,
    camera,
    world,
    aircraft,
    state,
    mission,
    hud,
    audio,
    input,
    phase: 'title', // title | flying | paused
    time: 0,
    frozen: false,
    snapCamera: false,
    autopilot: autopilotName || null,
    events: [],
    selectedMission: 'rings',
    debriefShown: false,
  };

  game.startMission = (missionId) => {
    resetToRunway(state);
    state.fuel = 100;
    state.damage = 0;
    startMission(mission, missionId, game.time);
    game.phase = 'flying';
    game.debriefShown = false;
    hideTitle(hud);
    hideDebrief(hud);
    startAudio(audio);
  };

  game.dropCrateNow = () => {
    const crate = dropCrate(mission, aircraft, state, game.time);
    if (!crate) return null;
    return mission.fallingCrates[mission.fallingCrates.length - 1] || null;
  };

  // Title screen mission cards.
  for (const card of document.querySelectorAll('.mission-card')) {
    card.addEventListener('click', () => {
      game.selectedMission = card.dataset.mission;
      game.startMission(game.selectedMission);
    });
  }
  document.getElementById('title-start').addEventListener('click', () => {
    game.startMission(game.selectedMission);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return game;
}

function placeAircraftInWorld(game) {
  const { state, aircraft } = game;
  aircraft.group.position.set(state.x, state.y, state.z);
  // The model flies toward -Z; rotate so -Z matches the heading vector
  // (cos h, -sin h) in (x, z). Yaw, then pitch about the local lateral
  // axis, then roll: positive bank is a right turn, right wing down.
  aircraft.group.rotation.set(0, 0, 0);
  aircraft.group.rotateY(state.heading - Math.PI / 2);
  aircraft.group.rotateX(state.pitch);
  aircraft.group.rotateZ(-state.bank);
}

// Chase camera: behind and above the plane, looking ahead. It never fights
// the pilot — its offset is fixed in the plane's frame, only smoothed.
function updateCamera(game, dt) {
  const { state, camera } = game;
  const back = 17;
  const up = 5.5;
  const fx = Math.cos(state.heading);
  const fz = -Math.sin(state.heading);
  const desired = new THREE.Vector3(
    state.x - fx * back,
    state.y + up,
    state.z - fz * back,
  );
  const ground = terrainHeightAt(desired.x, desired.z) + 3;
  if (desired.y < ground) desired.y = ground;
  if (game.snapCamera) {
    camera.position.copy(desired);
    game.snapCamera = false;
  } else {
    const k = Math.min(1, dt * 4.5);
    camera.position.lerp(desired, k);
  }
  const look = new THREE.Vector3(
    state.x + fx * 26,
    state.y + state.pitch * 18,
    state.z + fz * 26,
  );
  camera.lookAt(look);
}

// Slow orbit around the parked plane for the title screen backdrop.
function titleCamera(game, dt) {
  const { state, camera } = game;
  const angle = game.time * 0.12;
  const r = 26;
  camera.position.set(
    state.x + Math.cos(angle) * r,
    state.y + 9 + Math.sin(game.time * 0.2) * 1.5,
    state.z + Math.sin(angle) * r,
  );
  camera.lookAt(state.x, state.y + 1, state.z);
}

function handleMissionEvents(game, events) {
  for (const event of events) {
    game.events.push({ t: game.time, ...event });
    if (event.type === 'ring') playRingChime(game.audio);
    if (event.type === 'crateLanded') playDropThud(game.audio);
    if (event.type === 'missionComplete') playSuccess(game.audio);
    if (event.type === 'landed') {
      if (event.result.score > 0) playSuccess(game.audio);
      else playDropThud(game.audio);
    }
    if (event.type === 'takeoff') playTakeoff(game.audio);
  }
}

function handleFlightEvents(game, events) {
  for (const event of events) {
    game.events.push({ t: game.time, ...event });
    if (event.type === 'crash') {
      playCrash(game.audio);
      game.mission.message = 'CRASHED — press R to fly again';
      game.mission.messageUntil = game.time + 6;
    }
    if (event.type === 'takeoff') playTakeoff(game.audio);
    if (event.type === 'hardLanding') {
      playDropThud(game.audio);
      game.mission.message = `Hard landing — damage +${Math.round((event.impact - 6) * 9)}%`;
      game.mission.messageUntil = game.time + 3;
    }
    if (event.type === 'fuelEmpty') {
      game.mission.message = 'Fuel empty — glide her in';
      game.mission.messageUntil = game.time + 4;
    }
  }
}

function stepGame(game, dt) {
  const { state, mission, input } = game;
  readInput(input, dt);

  if (input.mutePressed) {
    const muted = toggleMute(game.audio);
    mission.message = muted ? 'Sound off (M to unmute)' : 'Sound on';
    mission.messageUntil = game.time + 2;
  }

  if (game.phase === 'title') {
    if (input.missionPressed) {
      game.selectedMission = input.missionPressed;
      game.startMission(game.selectedMission);
    } else if (input.startPressed) {
      game.startMission(game.selectedMission);
    }
    return;
  }

  if (input.pausePressed) {
    game.phase = game.phase === 'paused' ? 'flying' : 'paused';
    mission.message = game.phase === 'paused' ? 'Paused — P to resume' : '';
    mission.messageUntil = game.time + 2;
    return;
  }
  if (game.phase === 'paused') return;

  // Restart: back to the runway with the same mission.
  if (input.restartPressed) {
    const id = mission.mission ? mission.mission.id : game.selectedMission;
    game.startMission(id);
    return;
  }
  // Switch missions mid-flight with 1 / 2 / 3.
  if (input.missionPressed) {
    game.startMission(input.missionPressed);
    return;
  }

  // Autopilot (headless playtest) overrides the pilot's input.
  let liveInput = input;
  let dropNow = input.dropPressed;
  if (game.autopilot) {
    const auto = autopilotInput(game, dt);
    liveInput = { ...input, ...auto.input };
    dropNow = dropNow || auto.drop;
  }

  // Mouse wheel trims the throttle.
  if (input._wheelTrim) {
    state.throttle = clamp(state.throttle + input._wheelTrim, 0, 1);
    input._wheelTrim = 0;
  }

  const flightEvents = stepFlight(state, liveInput, dt);
  handleFlightEvents(game, flightEvents);

  if (dropNow) game.dropCrateNow();

  const missionEvents = stepMission(mission, state, game.time, dt);
  handleMissionEvents(game, missionEvents);

  // Parked on the strip with the engine idle: the ground crew refuels.
  if (refuelIfParked(state, dt) && mission.mission) {
    mission.message = 'Refuelled — full tanks';
    mission.messageUntil = game.time + 2;
  }

  // Mission over: show the debrief once, keep flying free.
  if (mission.finished && !game.debriefShown) {
    game.debriefShown = true;
    showDebrief(game.hud, mission, state);
  }

  updateAudio(game.audio, state);
}

function frame(game, nowMs) {
  requestAnimationFrame((t) => frame(game, t));
  const now = nowMs / 1000;
  let dt = Math.min(0.05, now - (game._lastNow || now));
  game._lastNow = now;
  if (game.frozen) {
    dt = 0;
  } else {
    game.time += dt;
  }

  if (!game.frozen) {
    stepGame(game, dt);
    driftClouds(game.world.clouds, dt, game.time);
  }

  // Keep the mission's HUD text fresh from the live state.
  game.mission.objective = objectiveText(game.mission);
  game.mission.target = currentTarget(game.mission);

  placeAircraftInWorld(game);
  animateAircraft(game.aircraft, game.state.throttle, game.time, dt || 0.016);
  if (game.phase === 'title') titleCamera(game, dt);
  else updateCamera(game, dt || 0.016);

  if (game.phase !== 'title') {
    updateHud(game.hud, game.state, game.mission, game.time, true);
  }

  game.renderer.render(game.scene, game.camera);
  game.frames = (game.frames || 0) + 1;
  if (game.frames === 45) window.__shotReady = true;
}

function boot() {
  const game = createGame();
  window.__meridianGame = game;
  window.__meridian = {
    game,
    start: (id) => game.startMission(id),
    state: () => game.state,
    mission: () => game.mission,
    events: () => game.events,
    enableAutopilot: (missionId) => {
      game.autopilot = missionId || 'rings';
      game.startMission(missionId || 'rings');
    },
  };

  // Staged screenshot scenes.
  if (shotName) {
    game.phase = 'flying';
    hideTitle(game.hud);
    startAudio(game.audio);
    applyShot(game, shotName);
    // The staged frame is already set; freeze after the camera settles.
    game.frozen = true;
  } else if (autopilotName) {
    game.autopilot = autopilotName;
    game.startMission(autopilotName);
  } else {
    showTitle(game.hud);
  }

  requestAnimationFrame((t) => frame(game, t));
}

document.title = `${GAME_TITLE} — ${GAME_SUBTITLE}`;
boot();
