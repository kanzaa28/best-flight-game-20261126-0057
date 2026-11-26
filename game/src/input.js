// input.js — keyboard + mouse, turned into one clean input state per frame.
// One job: read the pilot. Keys: W/S throttle, arrows or A/D pitch and bank,
// mouse steers when moved, wheel trims throttle, SPACE drops cargo.

export function createInput() {
  return {
    keys: new Set(),
    // Derived each frame by readInput():
    throttleUp: false,
    throttleDown: false,
    throttleSet: null,
    pitchUp: false,
    pitchDown: false,
    bankLeft: false,
    bankRight: false,
    mouseActive: false,
    mouseX: 0, // -1 (left) .. 1 (right), from centre
    mouseY: 0, // -1 (down) .. 1 (up), from centre
    mouseIdle: 0, // seconds since the mouse last moved
    dropPressed: false,
    restartPressed: false,
    pausePressed: false,
    missionPressed: null, // 'rings' | 'cargo' | 'landing'
    startPressed: false,
    mutePressed: false,
    // Edge-triggered keys, consumed by the game each frame:
    _dropEdge: false,
    _restartEdge: false,
    _pauseEdge: false,
    _startEdge: false,
    _muteEdge: false,
    _missionEdge: null,
  };
}

export function attachInput(input, element) {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    input.keys.add(event.code);
    if (event.code === 'Space') {
      input._dropEdge = true;
      event.preventDefault();
    }
    if (event.code === 'KeyR') input._restartEdge = true;
    if (event.code === 'KeyP' || event.code === 'Escape') input._pauseEdge = true;
    if (event.code === 'Enter') input._startEdge = true;
    if (event.code === 'KeyM') input._muteEdge = true;
    if (event.code === 'Digit1') input._missionEdge = 'rings';
    if (event.code === 'Digit2') input._missionEdge = 'cargo';
    if (event.code === 'Digit3') input._missionEdge = 'landing';
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
  });

  element.addEventListener('mousemove', (event) => {
    const rect = element.getBoundingClientRect();
    input.mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    input.mouseY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    input.mouseActive = true;
    input.mouseIdle = 0;
  });
  element.addEventListener('mouseleave', () => {
    input.mouseActive = false;
  });
  element.addEventListener('wheel', (event) => {
    event.preventDefault();
    // Wheel trims the throttle: one notch = 10%.
    input._wheelDelta = (input._wheelDelta || 0) + (event.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });
  element.addEventListener('mousedown', () => {
    // A click is a start gesture on the title screen.
    input._startEdge = true;
  });
}

// Read the current frame's input from keys + mouse. Call once per frame.
export function readInput(input, dt) {
  const k = input.keys;
  input.throttleUp = k.has('KeyW');
  input.throttleDown = k.has('KeyS');
  input.pitchUp = k.has('ArrowUp');
  input.pitchDown = k.has('ArrowDown');
  input.bankLeft = k.has('ArrowLeft') || k.has('KeyA');
  input.bankRight = k.has('ArrowRight') || k.has('KeyD');

  // Mouse steering fades out after 2.5 s without movement, so the keyboard
  // takes over cleanly instead of fighting a stale mouse position.
  input.mouseIdle += dt;
  if (input.mouseIdle > 2.5) input.mouseActive = false;

  if (input._wheelDelta) {
    input.throttleSet = null; // flight.js clamps; main.js applies the trim
    input._wheelTrim = (input._wheelTrim || 0) + input._wheelDelta;
    input._wheelDelta = 0;
  }

  input.dropPressed = input._dropEdge;
  input.restartPressed = input._restartEdge;
  input.pausePressed = input._pauseEdge;
  input.startPressed = input._startEdge;
  input.mutePressed = input._muteEdge;
  input.missionPressed = input._missionEdge;
  input._dropEdge = false;
  input._restartEdge = false;
  input._pauseEdge = false;
  input._startEdge = false;
  input._muteEdge = false;
  input._missionEdge = null;
  return input;
}
