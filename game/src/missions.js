// missions.js — the three sorties: Ring Run, Cargo Drop, Runway Landing.
// One job: objectives, scoring and mission state. The flight model stays in
// flight.js; the scenery stays in terrain.js.

import * as THREE from 'three';
import { MISSIONS, RUNWAY, SCORE, clamp } from './config.js';
import { buildRing, terrainHeightAt } from './terrain.js';
import { gradeLanding } from './flight.js';

// Ring circuit: eight rings threaded over the isles, in order.
function ringPositions() {
  return [
    { x: 220, z: -120, y: 80 },
    { x: 520, z: -380, y: 100 },
    { x: 420, z: -700, y: 115 },
    { x: -120, z: -760, y: 115 },
    { x: -480, z: -520, y: 105 },
    { x: -700, z: 120, y: 100 },
    { x: -260, z: 820, y: 95 },
    { x: 180, z: 420, y: 90 },
  ];
}

// Drop zones: glowing beacons on three far isles.
function dropZones() {
  return [
    { x: 760, z: 420, r: 26, name: 'Lantern Isle' },
    { x: -700, z: 380, r: 26, name: 'Twin Peaks' },
    { x: 980, z: -60, r: 26, name: 'Far Beacon' },
  ];
}

export function createMissionManager(scene) {
  return {
    scene,
    mission: null, // the chosen mission definition
    active: false,
    finished: false,
    score: 0,
    startTime: 0,
    elapsed: 0,
    // Ring Run state
    rings: [],
    ringIndex: 0,
    ringsPassed: 0,
    smoothBonusPaid: 0,
    // Cargo Drop state
    zones: [],
    zoneMarkers: [],
    cratesLeft: 0,
    fallingCrates: [],
    dropsScored: [],
    // Landing state
    landing: { climbed: false, circled: false, landed: null },
    message: '',
    messageUntil: 0,
  };
}

export function startMission(manager, missionId, now) {
  const def = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
  clearMissionVisuals(manager);
  manager.mission = def;
  manager.active = true;
  manager.finished = false;
  manager.score = 0;
  manager.startTime = now;
  manager.elapsed = 0;
  manager.rings = [];
  manager.ringIndex = 0;
  manager.ringsPassed = 0;
  manager.smoothBonusPaid = 0;
  manager.zones = [];
  manager.zoneMarkers = [];
  manager.cratesLeft = 0;
  manager.fallingCrates = [];
  manager.dropsScored = [];
  manager.landing = { climbed: false, circled: false, landed: null };
  manager.message = `${def.name} — ${def.tag}`;
  manager.messageUntil = now + 4;

  if (def.id === 'rings') {
    const spots = ringPositions();
    for (let i = 0; i < spots.length; i++) {
      const ring = buildRing(14);
      ring.position.set(spots[i].x, spots[i].y, spots[i].z);
      ring.userData.index = i;
      manager.scene.add(ring);
      manager.rings.push(ring);
    }
  }
  if (def.id === 'cargo') {
    manager.zones = dropZones();
    manager.cratesLeft = manager.zones.length;
    for (const zone of manager.zones) {
      const groundY = terrainHeightAt(zone.x, zone.z);
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(zone.r - 3, zone.r, 40),
        new THREE.MeshBasicMaterial({
          color: 0x7dff9a,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
        }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(zone.x, groundY + 1.5, zone.z);
      manager.scene.add(marker);
      manager.zoneMarkers.push(marker);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 60, 8),
        new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.25 }),
      );
      beacon.position.set(zone.x, groundY + 32, zone.z);
      manager.scene.add(beacon);
      manager.zoneMarkers.push(beacon);
    }
  }
  return def;
}

function clearMissionVisuals(manager) {
  for (const ring of manager.rings) manager.scene.remove(ring);
  for (const marker of manager.zoneMarkers) manager.scene.remove(marker);
  for (const crate of manager.fallingCrates) manager.scene.remove(crate.group);
  manager.fallingCrates = [];
}

export function endMission(manager, reason) {
  manager.active = false;
  manager.finished = true;
  return reason;
}

// Drop a crate from the plane. Returns the crate group (or null).
// `now` is game time in seconds, for the message banner's deadline.
export function dropCrate(manager, aircraft, state, now) {
  if (!manager.active || manager.mission.id !== 'cargo') return null;
  if (manager.cratesLeft <= 0) return null;
  manager.cratesLeft -= 1;
  const crate = aircraft.crate.clone();
  crate.visible = true;
  crate.position.set(state.x, state.y - 2, state.z);
  crate.userData.vy = 0;
  crate.userData.zone = manager.zones[manager.zones.length - manager.cratesLeft - 1];
  manager.scene.add(crate);
  manager.fallingCrates.push({ group: crate, zone: crate.userData.zone, vy: 0 });
  manager.message = `Crate away — ${manager.cratesLeft} left`;
  manager.messageUntil = now + 3;
  return crate;
}

// Score a landed crate by distance to its beacon.
function scoreDrop(manager, crate, x, z, now) {
  const zone = crate.zone;
  const d = Math.hypot(x - zone.x, z - zone.z);
  const points = Math.round(clamp(1 - d / (zone.r * 3.2), 0, 1) * SCORE.dropMax);
  manager.score += points;
  manager.dropsScored.push({ zone: zone.name, distance: Math.round(d), points });
  manager.message =
    points >= 240
      ? `Bullseye on ${zone.name}! +${points}`
      : points > 0
        ? `Crate down near ${zone.name} (+${points}, ${Math.round(d)} m off)`
        : `Crate missed ${zone.name} — ${Math.round(d)} m off`;
  manager.messageUntil = now + 4;
  if (manager.cratesLeft === 0 && manager.fallingCrates.length === 0) {
    endMission(manager, 'cargo-complete');
  }
}

// Current objective text for the HUD.
export function objectiveText(manager) {
  if (!manager.mission) return 'Pick a mission on the title screen';
  if (manager.finished) return 'Sortie complete — press R to fly again';
  if (manager.mission.id === 'rings') {
    return `Ring ${manager.ringIndex + 1} of ${manager.rings.length} — fly through the glowing ring`;
  }
  if (manager.mission.id === 'cargo') {
    const next = manager.zones[manager.zones.length - manager.cratesLeft];
    if (!next) return 'All crates away — watch them land';
    return `Drop over ${next.name} — ${manager.cratesLeft} crate${manager.cratesLeft > 1 ? 's' : ''} left (SPACE to release)`;
  }
  const l = manager.landing;
  if (!l.climbed) return 'Climb to 120 m, then circle past the beacon';
  if (!l.circled) return 'Now bring her back to Meridian Field';
  return 'On final — slow, level, on the strip';
}

// The mission's current navigation target (for the autopilot and the HUD arrow).
export function currentTarget(manager) {
  if (!manager.active || !manager.mission) return null;
  if (manager.mission.id === 'rings') {
    const ring = manager.rings[manager.ringIndex];
    return ring ? { x: ring.position.x, y: ring.position.y, z: ring.position.z } : null;
  }
  if (manager.mission.id === 'cargo') {
    const zone = manager.zones[manager.zones.length - manager.cratesLeft];
    return zone ? { x: zone.x, y: 90, z: zone.z } : null;
  }
  if (manager.mission.id === 'landing') {
    if (!manager.landing.climbed) return { x: 300, y: 120, z: -200 };
    if (!manager.landing.circled) return { x: RUNWAY.x + 260, y: 70, z: RUNWAY.z };
    return { x: RUNWAY.x, y: RUNWAY.elevation + 6, z: RUNWAY.z };
  }
  return null;
}

// Per-frame mission update. Returns events for the HUD/audio.
export function stepMission(manager, state, now, dt) {
  const events = [];
  if (!manager.active || !manager.mission) return events;
  manager.elapsed = now - manager.startTime;

  // Ring glow pulse.
  for (const ring of manager.rings) {
    const s = 1 + Math.sin(now * 3 + ring.userData.index) * 0.06;
    ring.scale.set(s, s, s);
    ring.lookAt(state.x, state.y, state.z);
  }

  if (manager.mission.id === 'rings') {
    const ring = manager.rings[manager.ringIndex];
    if (ring) {
      const d = Math.hypot(
        state.x - ring.position.x,
        state.y - ring.position.y,
        state.z - ring.position.z,
      );
      if (d < 13) {
        // Passed through the ring.
        ring.userData.torus.material.color.setHex(0x7dff9a);
        ring.userData.halo.material.color.setHex(0x7dff9a);
        manager.ringsPassed += 1;
        manager.score += SCORE.ring;
        events.push({ type: 'ring', index: manager.ringIndex, score: manager.score });
        manager.message = `Ring ${manager.ringIndex + 1} — +${SCORE.ring}`;
        manager.messageUntil = now + 2.5;
        manager.ringIndex += 1;
        if (manager.ringIndex >= manager.rings.length) {
          const bonus = Math.max(0, SCORE.ringTimeBonus - Math.floor(manager.elapsed) * 2);
          manager.score += bonus;
          events.push({ type: 'missionComplete', score: manager.score, bonus });
          manager.message = `Circuit complete! Time bonus +${bonus} — total ${manager.score}`;
          manager.messageUntil = now + 6;
          endMission(manager, 'rings-complete');
        }
      }
    }
    // Smooth-turn bonus: hold a gentle bank for 4 s without stalling.
    if (state.gentleTurnTime > 4 && manager.smoothBonusPaid < manager.ringsPassed + 1) {
      manager.smoothBonusPaid += 1;
      manager.score += SCORE.smoothTurnBonus;
      state.gentleTurnTime = 0;
      events.push({ type: 'smoothTurn', score: manager.score });
    }
  }

  if (manager.mission.id === 'cargo') {
    // Falling crates: gravity + parachute drag, score on ground contact.
    for (let i = manager.fallingCrates.length - 1; i >= 0; i--) {
      const crate = manager.fallingCrates[i];
      crate.vy = Math.min(crate.vy + 9 * dt, 7); // chute caps the fall
      crate.group.position.y -= crate.vy * dt;
      crate.group.rotation.y += dt * 0.8;
      const groundY = terrainHeightAt(crate.group.position.x, crate.group.position.z);
      if (crate.group.position.y <= groundY + 1) {
        scoreDrop(manager, crate, crate.group.position.x, crate.group.position.z, now);
        manager.scene.remove(crate.group);
        manager.fallingCrates.splice(i, 1);
        events.push({ type: 'crateLanded' });
      }
    }
    if (manager.cratesLeft === 0 && manager.fallingCrates.length === 0 && !manager.finished) {
      events.push({ type: 'missionComplete', score: manager.score });
      endMission(manager, 'cargo-complete');
    }
  }

  if (manager.mission.id === 'landing') {
    const l = manager.landing;
    if (!l.climbed && state.y > 120) {
      l.climbed = true;
      manager.message = '120 m — now circle back to the field';
      manager.messageUntil = now + 3;
      events.push({ type: 'climbed' });
    }
    if (l.climbed && !l.circled && state.x > RUNWAY.x + 200 && state.y < 110) {
      l.circled = true;
      manager.message = 'Beacon passed — final approach';
      manager.messageUntil = now + 3;
      events.push({ type: 'circled' });
    }
    if (state.lastTouchdown && !l.landed && state.onGround && l.climbed && l.circled) {
      const result = gradeLanding(state.lastTouchdown);
      l.landed = result;
      manager.score += result.score;
      events.push({ type: 'landed', result, score: manager.score });
      manager.message =
        result.score > 0
          ? `${result.grade} landing! +${result.score} — total ${manager.score}`
          : `${result.grade} — no points. Press R and try again.`;
      manager.messageUntil = now + 6;
      endMission(manager, 'landing-complete');
    }
  }

  return events;
}
