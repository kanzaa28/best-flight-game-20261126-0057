// audio.js — all sound is synthesised live with WebAudio: engine drone,
// wind rush, ring chimes, crate thuds and the crash. No audio files, no
// network. One job: make the flight sound like a flight.

export function createAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    muted: false,
    started: false,
  };
}

// Must be called from a user gesture (click / keypress) — browsers block
// audio before one.
export function startAudio(audio) {
  if (audio.started) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);

    // Engine: two detuned saws through a low-pass filter.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 70;
    const engineOsc2 = audio.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 71.5;
    audio.engineFilter = audio.ctx.createBiquadFilter();
    audio.engineFilter.type = 'lowpass';
    audio.engineFilter.frequency.value = 420;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0.0;
    audio.engineOsc.connect(audio.engineFilter);
    engineOsc2.connect(audio.engineFilter);
    audio.engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    engineOsc2.start();
    audio.engineOsc2 = engineOsc2;

    // Wind: looped filtered noise, gain follows airspeed.
    const noiseLen = audio.ctx.sampleRate * 2;
    const noiseBuf = audio.ctx.createBuffer(1, noiseLen, audio.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
    audio.windSrc = audio.ctx.createBufferSource();
    audio.windSrc.buffer = noiseBuf;
    audio.windSrc.loop = true;
    const windFilter = audio.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    audio.windGain = audio.ctx.createGain();
    audio.windGain.gain.value = 0.0;
    audio.windSrc.connect(windFilter);
    windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    audio.windSrc.start();

    audio.started = true;
  } catch (err) {
    // Audio is decoration; a failure must never stop the game.
    audio.started = false;
  }
}

// Per-frame: engine pitch + volume follow throttle, wind follows airspeed.
export function updateAudio(audio, state) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const rpm = 55 + state.throttle * 65;
  audio.engineOsc.frequency.setTargetAtTime(rpm, t, 0.1);
  audio.engineOsc2.frequency.setTargetAtTime(rpm * 1.02 + 1, t, 0.1);
  const engineVol = state.onGround ? 0.02 + state.throttle * 0.05 : 0.04 + state.throttle * 0.07;
  audio.engineGain.gain.setTargetAtTime(audio.muted ? 0 : engineVol, t, 0.1);
  const windVol = Math.min(0.16, (state.speed / 95) * 0.16);
  audio.windGain.gain.setTargetAtTime(audio.muted ? 0 : windVol, t, 0.15);
}

function blip(audio, freq, dur, type, vol, when = 0) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime + when;
  const osc = audio.ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(audio.muted ? 0 : vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playRingChime(audio) {
  blip(audio, 880, 0.35, 'sine', 0.22);
  blip(audio, 1318, 0.5, 'sine', 0.18, 0.09);
}

export function playDropThud(audio) {
  blip(audio, 140, 0.25, 'triangle', 0.3);
  blip(audio, 70, 0.4, 'sine', 0.25, 0.05);
}

export function playCrash(audio) {
  if (!audio.started || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const noiseLen = audio.ctx.sampleRate * 0.7;
  const buf = audio.ctx.createBuffer(1, noiseLen, audio.ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / noiseLen);
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  const gain = audio.ctx.createGain();
  gain.gain.value = audio.muted ? 0 : 0.5;
  src.connect(gain);
  gain.connect(audio.master);
  src.start(t);
  blip(audio, 55, 0.8, 'sawtooth', 0.3);
}

export function playTakeoff(audio) {
  blip(audio, 523, 0.3, 'sine', 0.15);
  blip(audio, 784, 0.4, 'sine', 0.15, 0.12);
}

export function playSuccess(audio) {
  blip(audio, 523, 0.25, 'sine', 0.2);
  blip(audio, 659, 0.25, 'sine', 0.2, 0.12);
  blip(audio, 784, 0.4, 'sine', 0.22, 0.24);
}

export function toggleMute(audio) {
  audio.muted = !audio.muted;
  return audio.muted;
}
