// terrain.js — builds the world the pilot flies over: dawn sky, sea, the
// Kestrel Isles, the runway on Meridian Field, drifting clouds and the sun.
// One job: static scenery + the heightAt(x, z) query the flight model uses.

import * as THREE from 'three';
import { ISLANDS, PALETTE, RUNWAY, SEA_LEVEL, WORLD_RADIUS, WORLD_SEED, mulberry32 } from './config.js';

// Height of the ground at (x, z). Islands are smooth bumps with a flattened
// top on the home island so the runway sits level; everywhere else is sea.
export function terrainHeightAt(x, z) {
  let height = 0;
  for (let i = 0; i < ISLANDS.length; i++) {
    const isl = ISLANDS[i];
    const dx = x - isl.x;
    const dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= isl.r) continue;
    const t = d / isl.r; // 0 centre -> 1 edge
    let bump = isl.h * (1 - t * t) * (1 - t * t);
    if (i === 0) {
      // Flatten the home island's crown for the runway.
      const flat = 1 - Math.min(1, Math.max(0, (d - 60) / 120));
      bump = bump * (1 - flat) + RUNWAY.elevation * flat;
    }
    if (bump > height) height = bump;
  }
  return height;
}

function islandMesh(isl, index, rng) {
  const segments = 48;
  const geo = new THREE.CircleGeometry(isl.r, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v);
    const z = pos.getZ(v);
    const d = Math.sqrt(x * x + z * z) / isl.r;
    let h = isl.h * (1 - d * d) * (1 - d * d);
    if (index === 0) {
      const flat = 1 - Math.min(1, Math.max(0, (Math.sqrt(x * x + z * z) - 60) / 120));
      h = h * (1 - flat) + RUNWAY.elevation * flat;
    }
    // Rocky ridges: a little seeded noise on the slopes, never on the flat top.
    const rough = (rng() - 0.5) * 3.2 * Math.min(1, Math.max(0, (d - 0.25) * 2));
    pos.setY(v, Math.max(0, h + rough));
  }
  geo.computeVertexNormals();
  // Vertex colours: sand at the waterline, grass above, rock on the peaks,
  // and the home island's flattened airfield top stays grass.
  const colours = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(PALETTE.sand);
  const grass = new THREE.Color(0x6fae52);
  const rock = new THREE.Color(0x6b7a5e);
  const tmp = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    if (index === 0 && y > isl.h * 0.85) tmp.copy(grass);
    else if (y < 4) tmp.copy(sand);
    else if (y < isl.h * 0.7) tmp.copy(grass);
    else tmp.copy(rock).lerp(grass, 0.5);
    // Slight per-vertex variation so the slopes read as terrain, not plastic.
    const shade = 0.92 + rng() * 0.16;
    colours[v * 3] = tmp.r * shade;
    colours[v * 3 + 1] = tmp.g * shade;
    colours[v * 3 + 2] = tmp.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(isl.x, 0, isl.z);
  return mesh;
}

function buildRunway(scene) {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.length, RUNWAY.width),
    new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = RUNWAY.heading;
  strip.position.set(RUNWAY.x, RUNWAY.elevation + 0.15, RUNWAY.z);
  group.add(strip);

  // Centreline dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayLine });
  for (let i = -3; i <= 3; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.9), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(RUNWAY.x + i * 22, RUNWAY.elevation + 0.3, RUNWAY.z);
    group.add(dash);
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.4, RUNWAY.width - 4), dashMat);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(RUNWAY.x + end * (RUNWAY.length / 2 - 4), RUNWAY.elevation + 0.3, RUNWAY.z);
    group.add(bar);
  }
  // Edge lights: warm dots along both edges so the strip reads at dawn.
  const lightGeo = new THREE.SphereGeometry(0.7, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  for (let i = -8; i <= 8; i++) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(
        RUNWAY.x + i * 10,
        RUNWAY.elevation + 0.6,
        RUNWAY.z + side * (RUNWAY.width / 2 + 1.2),
      );
      group.add(lamp);
    }
  }
  // Windsock on a pole beside the strip.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 14, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(RUNWAY.x - RUNWAY.length / 2 + 8, RUNWAY.elevation + 7, RUNWAY.z + 14);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 6, 10, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xff7a4d, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2 + 0.35;
  sock.position.set(RUNWAY.x - RUNWAY.length / 2 + 11, RUNWAY.elevation + 13.4, RUNWAY.z + 14);
  group.add(sock);
  scene.add(group);
  return group;
}

function buildClouds(scene, rng) {
  const group = new THREE.Group();
  // Unlit peach puffs: at dawn the clouds catch the sun and read light.
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffdcc0,
    transparent: true,
    opacity: 0.92,
  });
  for (let i = 0; i < 26; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 4);
    for (let p = 0; p < puffs; p++) {
      const s = 10 + rng() * 22;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), mat);
      puff.scale.y = 0.45;
      puff.position.set((rng() - 0.5) * 50, (rng() - 0.5) * 6, (rng() - 0.5) * 24);
      cloud.add(puff);
    }
    const angle = rng() * Math.PI * 2;
    const radius = 200 + rng() * (WORLD_RADIUS - 100);
    cloud.position.set(
      Math.cos(angle) * radius,
      150 + rng() * 110,
      Math.sin(angle) * radius,
    );
    cloud.userData.drift = 1.2 + rng() * 1.8;
    group.add(cloud);
  }
  scene.add(group);
  return group;
}

function buildSky(scene) {
  // Vertical dawn gradient painted on a canvas, wrapped on the sky dome.
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2e4a7a');
  grad.addColorStop(0.45, '#7a6a9a');
  grad.addColorStop(0.68, '#e8906b');
  grad.addColorStop(0.82, '#f7c873');
  grad.addColorStop(1, '#ffe9b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(WORLD_RADIUS * 2.4, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Low sun disc on the eastern horizon.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(60, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(1900, 190, -700);
  sun.lookAt(0, 60, 0);
  scene.add(sun);
  return sky;
}

// A glowing ring the pilot flies through. Pulses gently; turns green when done.
export function buildRing(radius = 14) {
  const group = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 1.1, 12, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.ring, transparent: true, opacity: 0.95 }),
  );
  group.add(torus);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 2.6, 8, 40),
    new THREE.MeshBasicMaterial({
      color: PALETTE.ring,
      transparent: true,
      opacity: 0.22,
    }),
  );
  group.add(halo);
  group.userData.torus = torus;
  group.userData.halo = halo;
  group.userData.baseRadius = radius;
  return group;
}

export function buildWorld(scene) {
  const rng = mulberry32(WORLD_SEED);
  scene.fog = new THREE.Fog(0xe8a06b, 500, 2600);
  buildSky(scene);

  // Sea: one big plane, slightly glossy at dawn.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_RADIUS * 4.4, WORLD_RADIUS * 4.4),
    new THREE.MeshPhongMaterial({
      color: PALETTE.sea,
      shininess: 90,
      specular: 0x887766,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  scene.add(sea);

  for (let i = 0; i < ISLANDS.length; i++) {
    scene.add(islandMesh(ISLANDS[i], i, rng));
  }
  buildRunway(scene);
  const clouds = buildClouds(scene, rng);

  // Dawn light: warm directional sun + soft blue ambient.
  const sun = new THREE.DirectionalLight(0xffc98a, 1.9);
  sun.position.set(900, 420, -500);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x8fa8cc, 1.0));
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a4a66, 0.5);
  scene.add(hemi);

  return { clouds, sea };
}

export function driftClouds(clouds, dt, time) {
  for (const cloud of clouds.children) {
    cloud.position.x += cloud.userData.drift * dt;
    if (cloud.position.x > WORLD_RADIUS + 200) cloud.position.x = -WORLD_RADIUS - 200;
    cloud.position.y += Math.sin(time * 0.3 + cloud.position.z) * 0.02;
  }
}
