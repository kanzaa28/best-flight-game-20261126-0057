// hud.js — the cockpit instruments: altitude, speed, heading, fuel, damage,
// score, mission objective, throttle and the attitude ball. All DOM + one
// small canvas, so the numbers stay crisp when the screenshot shrinks.
// One job: show the pilot what is happening, and the title/debrief screens.

import { formatHeading, msToKnots } from './config.js';

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createHud(document) {
  const root = document.getElementById('hud');
  const attitudeCanvas = document.getElementById('attitude');
  return {
    root,
    attitude: attitudeCanvas,
    attitudeCtx: attitudeCanvas.getContext('2d'),
    els: {
      alt: document.getElementById('hud-alt'),
      spd: document.getElementById('hud-spd'),
      hdg: document.getElementById('hud-hdg'),
      compass: document.getElementById('hud-compass'),
      fuelBar: document.getElementById('hud-fuel-bar'),
      fuelText: document.getElementById('hud-fuel-text'),
      dmgBar: document.getElementById('hud-dmg-bar'),
      dmgText: document.getElementById('hud-dmg-text'),
      score: document.getElementById('hud-score'),
      timer: document.getElementById('hud-timer'),
      mission: document.getElementById('hud-mission'),
      objective: document.getElementById('hud-objective'),
      throttleBar: document.getElementById('hud-throttle-bar'),
      throttleText: document.getElementById('hud-throttle-text'),
      message: document.getElementById('hud-message'),
      warn: document.getElementById('hud-warn'),
      target: document.getElementById('hud-target'),
    },
    title: document.getElementById('title-screen'),
    debrief: document.getElementById('debrief-screen'),
  };
}

function compassLabel(headingRad) {
  const deg = ((headingRad * 180) / Math.PI % 360 + 360) % 360;
  return COMPASS_POINTS[Math.round(deg / 45) % 8];
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Draw the attitude ball: horizon line tilts with bank, shifts with pitch.
export function drawAttitude(hud, pitch, bank) {
  const ctx = hud.attitudeCtx;
  const w = 110;
  const h = 110;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 52, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-bank);
  const pitchShift = pitch * 70;
  ctx.fillStyle = '#2e4a7a';
  ctx.fillRect(-60, -60 + pitchShift, 120, 60);
  ctx.fillStyle = '#c98a4d';
  ctx.fillRect(-60, pitchShift, 120, 60);
  ctx.strokeStyle = '#ffe9b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-52, pitchShift);
  ctx.lineTo(52, pitchShift);
  ctx.stroke();
  ctx.restore();
  // Fixed aircraft symbol on top.
  ctx.strokeStyle = '#ffe9b8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 22, h / 2);
  ctx.lineTo(w / 2 + 22, h / 2);
  ctx.moveTo(w / 2, h / 2 - 4);
  ctx.lineTo(w / 2, h / 2 + 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,233,184,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 52, 0, Math.PI * 2);
  ctx.stroke();
}

export function updateHud(hud, state, mission, now, flying) {
  const els = hud.els;
  const alt = Math.max(0, Math.round(state.y));
  els.alt.textContent = `${alt} m`;
  els.spd.textContent = `${Math.round(msToKnots(state.speed))} kt`;
  els.hdg.textContent = formatHeading(state.heading);
  els.compass.textContent = compassLabel(state.heading);

  const fuelPct = Math.round(state.fuel);
  els.fuelBar.style.width = `${fuelPct}%`;
  els.fuelBar.style.background = fuelPct > 30 ? '#7dff9a' : fuelPct > 12 ? '#ffb347' : '#ff6b5e';
  els.fuelText.textContent = `FUEL ${fuelPct}%`;

  const dmgPct = Math.round(state.damage);
  els.dmgBar.style.width = `${dmgPct}%`;
  els.dmgText.textContent = `DMG ${dmgPct}%`;

  els.score.textContent = String(mission.score);
  els.timer.textContent = mission.active ? formatTime(mission.elapsed) : '0:00';
  els.mission.textContent = mission.mission ? mission.mission.name : '—';
  els.objective.textContent = missionObjectiveText(mission);

  const thrPct = Math.round(state.throttle * 100);
  els.throttleBar.style.width = `${thrPct}%`;
  els.throttleText.textContent = `THR ${thrPct}%`;

  // Target distance + bearing.
  const target = missionTarget(mission);
  if (target && flying) {
    const d = Math.hypot(target.x - state.x, target.y - state.y, target.z - state.z);
    els.target.textContent = `TGT ${Math.round(d)} m`;
  } else {
    els.target.textContent = '';
  }

  // Message banner (fades after its deadline).
  if (mission.message && now < mission.messageUntil) {
    els.message.textContent = mission.message;
    els.message.style.opacity = '1';
  } else {
    els.message.style.opacity = '0';
  }

  // Warnings: stall, fuel, damage.
  let warn = '';
  if (state.crashed) warn = 'CRASHED — press R to fly again';
  else if (state.fuel <= 0) warn = 'FUEL EMPTY — glide to the runway';
  else if (state.fuel < 12) warn = 'LOW FUEL — land and refuel on the strip';
  else if (!state.onGround && state.speed < 22) warn = 'STALL — nose down, full throttle';
  else if (state.damage > 60) warn = 'HEAVY DAMAGE — land soon';
  els.warn.textContent = warn;
  els.warn.style.opacity = warn ? '1' : '0';

  drawAttitude(hud, state.pitch, state.bank);
}

function missionObjectiveText(mission) {
  if (!mission.mission) return '';
  if (mission.finished) return 'Sortie complete';
  // Imported lazily here to keep this file free of the mission module's
  // scene dependency — the text lives next to the state it describes.
  return mission.objective || '';
}

function missionTarget(mission) {
  return mission.target || null;
}

export function showTitle(hud) {
  hud.title.style.display = 'flex';
  hud.debrief.style.display = 'none';
  hud.root.style.display = 'none';
}

export function hideTitle(hud) {
  hud.title.style.display = 'none';
  hud.root.style.display = 'block';
}

export function showDebrief(hud, mission, state) {
  const lines = [];
  lines.push(`<h2>SORTIE COMPLETE</h2>`);
  lines.push(`<p class="debrief-mission">${mission.mission ? mission.mission.name : ''}</p>`);
  lines.push(`<p class="debrief-score">SCORE <b>${mission.score}</b></p>`);
  const details = [];
  if (mission.mission && mission.mission.id === 'rings') {
    details.push(`Rings ${mission.ringsPassed} / ${mission.rings.length}`);
  }
  if (mission.mission && mission.mission.id === 'cargo') {
    for (const d of mission.dropsScored) details.push(`${d.zone}: ${d.distance} m off, +${d.points}`);
    if (managerDropsLeft(mission) > 0) details.push(`Crates unflown: ${managerDropsLeft(mission)}`);
  }
  if (mission.mission && mission.mission.id === 'landing' && mission.landing.landed) {
    details.push(`Landing: ${mission.landing.landed.grade}`);
  }
  details.push(`Distance flown ${Math.round(state.distanceFlown)} m`);
  details.push(`Fuel left ${Math.round(state.fuel)}% · Damage ${Math.round(state.damage)}%`);
  lines.push(`<p class="debrief-details">${details.join('<br>')}</p>`);
  lines.push(`<p class="debrief-hint">Press R to fly again, or 1 / 2 / 3 for another mission.</p>`);
  hud.debrief.innerHTML = lines.join('');
  hud.debrief.style.display = 'flex';
}

function managerDropsLeft(mission) {
  return mission.cratesLeft || 0;
}

export function hideDebrief(hud) {
  hud.debrief.style.display = 'none';
}
