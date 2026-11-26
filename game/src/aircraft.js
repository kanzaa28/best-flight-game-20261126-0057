// aircraft.js — builds the courier plane from three.js primitives: a
// high-wing dawn courier with a spinning prop, tail, nav lights and a
// belly cargo hatch. One job: the aircraft mesh and its moving parts.

import * as THREE from 'three';

// Kestrel Courier K-7: cream fuselage, teal wings, orange stripe.
const COLOURS = {
  fuselage: 0xf2e6c8,
  wing: 0x2e7f86,
  stripe: 0xff7a4d,
  tail: 0x2e7f86,
  prop: 0x2b2b2e,
  glass: 0x9fd8e8,
  wheel: 0x222222,
};

export function buildCourierPlane() {
  const plane = new THREE.Group();
  const fuselageMat = new THREE.MeshLambertMaterial({ color: COLOURS.fuselage });
  const wingMat = new THREE.MeshLambertMaterial({ color: COLOURS.wing });
  const stripeMat = new THREE.MeshLambertMaterial({ color: COLOURS.stripe });
  const glassMat = new THREE.MeshPhongMaterial({
    color: COLOURS.glass,
    shininess: 120,
    specular: 0xffffff,
  });

  // Fuselage: nose cone + body cylinder + tail cone, nose pointing -Z.
  // (The plane flies toward -Z in its local frame; heading rotates the group.)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 12), fuselageMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -3.4);
  plane.add(nose);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.62, 4.6, 12), fuselageMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, -0.4);
  plane.add(body);

  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.6, 12), fuselageMat);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0.15, 3.1);
  plane.add(tailCone);

  // Orange cheatline stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 4.4), stripeMat);
  stripe.position.set(0, -0.1, -0.5);
  plane.add(stripe);

  // Cockpit glass.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 10), glassMat);
  canopy.scale.set(1, 0.75, 1.5);
  canopy.position.set(0, 0.55, -1.6);
  plane.add(canopy);

  // High wing + struts.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.22, 2.1), wingMat);
  wing.position.set(0, 0.75, -0.6);
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 2.1), stripeMat);
    tip.position.set(side * 5.35, 0.75, -0.6);
    plane.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), fuselageMat);
    strut.position.set(side * 1.4, 0.1, -0.6);
    strut.rotation.z = side * 0.5;
    plane.add(strut);
  }

  // Tail: horizontal stabiliser + vertical fin.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), wingMat);
  stab.position.set(0, 0.35, 4.0);
  plane.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 1.4), wingMat);
  fin.position.set(0, 0.9, 4.1);
  plane.add(fin);
  const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 1.4), stripeMat);
  finTip.position.set(0, 1.65, 4.1);
  plane.add(finTip);

  // Propeller: hub + two blades, spins around Z.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 10), new THREE.MeshLambertMaterial({ color: COLOURS.prop }));
  hub.rotation.x = -Math.PI / 2;
  hub.position.set(0, 0, -4.7);
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: COLOURS.prop });
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.1), bladeMat);
    blade.position.set(0, 0, -4.55);
    blade.rotation.z = angle;
    prop.add(blade);
  }
  // Translucent blur disc: from behind, a spinning prop reads as a disc,
  // not as a single dark blade.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 24),
    new THREE.MeshBasicMaterial({
      color: 0x2b2b2e,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  disc.position.set(0, 0, -4.55);
  prop.add(disc);
  prop.position.set(0, 0, 0);
  plane.add(prop);

  // Fixed landing gear: two wheels + tail wheel.
  const wheelMat = new THREE.MeshLambertMaterial({ color: COLOURS.wheel });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), fuselageMat);
    leg.position.set(side * 0.8, -0.9, -1.2);
    leg.rotation.z = side * 0.25;
    plane.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.05, -1.45, -1.2);
    plane.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), wheelMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.55, 3.9);
  plane.add(tailWheel);

  // Nav lights: red left, green right, white tail — they read in the dark.
  const navLights = [];
  const navDefs = [
    { color: 0xff2a2a, pos: [-5.6, 0.75, -0.6] },
    { color: 0x2aff66, pos: [5.6, 0.75, -0.6] },
    { color: 0xffffff, pos: [0, 0.4, 4.5] },
  ];
  for (const def of navDefs) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: def.color }),
    );
    lamp.position.set(def.pos[0], def.pos[1], def.pos[2]);
    plane.add(lamp);
    navLights.push(lamp);
  }

  // Cargo hatch under the belly (opens visually when a crate drops).
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.1, 1.4),
    new THREE.MeshLambertMaterial({ color: COLOURS.stripe }),
  );
  hatch.position.set(0, -0.85, 0.6);
  plane.add(hatch);

  // A dropped crate: box + orange parachute canopy.
  const crate = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.6, 1.6),
    new THREE.MeshLambertMaterial({ color: 0xc98a3d }),
  );
  crate.add(box);
  const chute = new THREE.Mesh(
    new THREE.SphereGeometry(1.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xff7a4d, side: THREE.DoubleSide }),
  );
  chute.position.y = 2.6;
  chute.scale.y = 0.7;
  crate.add(chute);
  crate.visible = false;

  return { group: plane, prop, navLights, hatch, crate };
}

// Spin the prop faster with throttle; blink the nav lights.
export function animateAircraft(aircraft, throttle, time, dt) {
  aircraft.prop.rotation.z -= (4 + throttle * 34) * dt;
  const blink = Math.sin(time * 6) > 0;
  for (const lamp of aircraft.navLights) {
    lamp.visible = blink;
  }
}
