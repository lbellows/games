import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260930);
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });

// Fonts are drawn onto canvas textures, so wait (briefly) for Fredoka.
await Promise.race([
  document.fonts.load('700 100px Fredoka').catch(() => {}),
  new Promise((r) => setTimeout(r, 1500)),
]);

// ---------------------------------------------------------------------------
// Renderer, scene, camera, lights
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color(0x8fd8ff);
const NIGHT_SKY = new THREE.Color(0x1d2159);
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(scene.background.clone(), 70, 150);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xffffff, 0x88cc66, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d6, 1.7);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 140 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function mesh(geo, material, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Collision world: circles and axis-aligned boxes with a top height.
// Anything the player is above (within STEP) is floor; anything else is wall.
// ---------------------------------------------------------------------------
const solids = [];
const WALL = 100;
const STEP = 0.45;
const PR = 0.5; // player radius
const addCircle = (x, z, r, top = WALL) => { const s = { c: true, x, z, r, top }; solids.push(s); return s; };
const addBox = (x, z, hw, hd, top = WALL) => { const s = { c: false, x, z, hw, hd, top }; solids.push(s); return s; };

function collide(p) {
  for (const s of solids) {
    if (s.off || p.y >= s.top - STEP) continue;
    if (s.c) {
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), m = s.r + PR;
      if (d < m) {
        if (d < 1e-4) p.x += m;
        else { p.x += (dx / d) * (m - d); p.z += (dz / d) * (m - d); }
      }
    } else {
      const cx = clamp(p.x, s.x - s.hw, s.x + s.hw), cz = clamp(p.z, s.z - s.hd, s.z + s.hd);
      const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d > 1e-4) {
        if (d < PR) { p.x += (dx / d) * (PR - d); p.z += (dz / d) * (PR - d); }
      } else {
        const px = s.hw - Math.abs(p.x - s.x) + PR, pz = s.hd - Math.abs(p.z - s.z) + PR;
        if (px < pz) p.x += Math.sign(p.x - s.x || 1) * px;
        else p.z += Math.sign(p.z - s.z || 1) * pz;
      }
    }
  }
}

function groundAt(p) {
  let g = 0;
  for (const s of solids) {
    if (s.off || p.y < s.top - STEP) continue;
    const inside = s.c
      ? Math.hypot(p.x - s.x, p.z - s.z) < s.r + 0.15
      : Math.abs(p.x - s.x) <= s.hw + 0.15 && Math.abs(p.z - s.z) <= s.hd + 0.15;
    if (inside && s.top > g) g = s.top;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const melonTex = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#7fd35a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#1f6b2c'; g.lineWidth = 10; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const x0 = (i + 0.5) * (w / 12);
    g.beginPath();
    for (let y = 0; y <= h; y += 4) g.lineTo(x0 + Math.sin(y * 0.18 + i) * 4, y);
    g.stroke();
  }
});

const sliceTex = canvasTex(256, 140, (g) => {
  g.fillStyle = '#3dbb5a'; g.beginPath(); g.arc(128, 10, 118, 0, Math.PI); g.fill();
  g.fillStyle = '#f4ffe8'; g.beginPath(); g.arc(128, 10, 104, 0, Math.PI); g.fill();
  g.fillStyle = '#ff5d73'; g.beginPath(); g.arc(128, 10, 94, 0, Math.PI); g.fill();
  g.fillStyle = '#2b2250';
  for (const [x, y] of [[80, 40], [128, 60], [176, 40], [104, 80], [152, 80], [128, 30]]) {
    g.beginPath(); g.ellipse(x, y, 5, 8, 0, 0, Math.PI * 2); g.fill();
  }
});

function letterTex(letter, color) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    g.lineWidth = 16; g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeRect(14, 14, 228, 228);
    g.font = '700 170px Fredoka, "Arial Rounded MT Bold", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.3)'; g.strokeText(letter, 128, 140);
    g.fillStyle = '#fff'; g.fillText(letter, 128, 140);
  });
}

// ---------------------------------------------------------------------------
// World layout
// ---------------------------------------------------------------------------
const WORLD_R = 56;
const ROAD_R = 45;
const HOUSE = new THREE.Vector3(0, 0, -16);
const DOOR = new THREE.Vector3(0, 0, -11);
const POND = new THREE.Vector3(18, 0, 10);
const POND_R = 6;
const BUS_HOME = new THREE.Vector3(-ROAD_R, 0, 0);
const PATCH = new THREE.Vector3(22, 0, -26);
const PLAYGROUND = new THREE.Vector3(-13, 0, 15);
const SPAWN = new THREE.Vector3(0, 0, -1);

const WHEEL_SPOTS = [[-8, 6], [11, -3], [-26, -24], [-30, 22]];
const DUCK_SPOTS = [[-30, -14], [-10, 36], [8, 34], [36, 22], [36, -8]];
const BLOCK_SPOTS = [[-10, -3], [-26, 10], [-4, 26], [26, 30], [33, -2]];
const BLOCKS = [['A', '#ff5d73'], ['B', '#ff9f1c'], ['C', '#3dbb5a'], ['D', '#3a86ff'], ['E', '#9b5de5']];
const STUMPS = [[28, -20, 1.0], [30.5, -23.2, 2.0], [31.5, -27, 3.0], [29, -30.2, 4.0]];
const MELON_SPOTS = [
  [17, -23, 0], [20, -23, 0], [23, -23, 0], [17, -27, 0], [20, -27, 0], [23, -30, 0],
  ...STUMPS.map(([x, z, h]) => [x, z, h]),
];

const PATHS = [
  [DOOR.x, DOOR.z, 0, 0],
  [0, 0, POND.x - 6, POND.z - 3],
  [0, 0, -ROAD_R + 3, 0],
  [DOOR.x, DOOR.z, PATCH.x - 6, PATCH.z + 3],
  [0, 0, PLAYGROUND.x + 2, PLAYGROUND.z - 2],
];

function distToSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

const KEEP_CLEAR = [
  [HOUSE.x, HOUSE.z, 10], [POND.x, POND.z, POND_R + 4], [PATCH.x, PATCH.z, 11], [PLAYGROUND.x, PLAYGROUND.z, 6],
  [SPAWN.x, SPAWN.z, 4], [0, 0, 4],
  ...[...WHEEL_SPOTS, ...DUCK_SPOTS, ...BLOCK_SPOTS].map(([x, z]) => [x, z, 3]),
];
function isClear(x, z, extra = 0) {
  const r = Math.hypot(x, z);
  if (r > WORLD_R - 2 || (r > ROAD_R - 4 && r < ROAD_R + 4)) return false;
  for (const [kx, kz, kr] of KEEP_CLEAR) if (Math.hypot(x - kx, z - kz) < kr + extra) return false;
  for (const p of PATHS) if (distToSeg(x, z, ...p) < 2 + extra) return false;
  return true;
}

// Ground
const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), std(0x7ed957));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Road ring for the bus
const road = new THREE.Mesh(new THREE.RingGeometry(ROAD_R - 2.2, ROAD_R + 2.2, 96), std(0xb8a58c));
road.rotation.x = -Math.PI / 2;
road.position.y = 0.02;
road.receiveShadow = true;
scene.add(road);
const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }), 60);
{
  const o = new THREE.Object3D();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    o.position.set(Math.cos(a) * ROAD_R, 0.04, Math.sin(a) * ROAD_R);
    o.rotation.set(-Math.PI / 2, 0, -a);
    o.updateMatrix();
    dash.setMatrixAt(i, o.matrix);
  }
  scene.add(dash);
}

// Dirt paths (instanced stepping discs)
{
  const pts = [];
  for (const [ax, az, bx, bz] of PATHS) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.1);
    for (let i = 0; i <= n; i++) pts.push([lerp(ax, bx, i / n), lerp(az, bz, i / n)]);
  }
  pts.push([0, 0]);
  const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1.4, 20), std(0xe8c98f), pts.length);
  const o = new THREE.Object3D();
  pts.forEach(([x, z], i) => {
    o.position.set(x, 0.03, z);
    o.rotation.set(-Math.PI / 2, 0, 0);
    o.scale.setScalar(i === pts.length - 1 ? 3 : 1);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.receiveShadow = true;
  scene.add(im);
}

// House
const windowMat = std(0x9ee7ff, { emissive: 0xffc94d, emissiveIntensity: 0 });
const houseGroup = new THREE.Group();
{
  const g = houseGroup;
  g.position.copy(HOUSE);
  scene.add(g);
  mesh(new THREE.BoxGeometry(10, 5, 8), std(0xfff4d6), 0, 2.5, 0, g);
  const roof = mesh(new THREE.ConeGeometry(7.6, 3.6, 4), std(0xe8505b), 0, 6.8, 0, g);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.85);
  mesh(new THREE.BoxGeometry(1.2, 3, 1.2), std(0xc0616b), 3, 7.2, -1.5, g);
  mesh(new THREE.BoxGeometry(1.9, 3.1, 0.25), std(0x7a4a2a), 0, 1.55, 4.05, g);
  mesh(new THREE.SphereGeometry(0.12, 8, 8), std(0xffd23f), 0.6, 1.5, 4.25, g);
  for (const x of [-3, 3]) {
    mesh(new THREE.BoxGeometry(1.8, 1.8, 0.2), windowMat, x, 2.8, 4.02, g);
    mesh(new THREE.BoxGeometry(2.1, 0.2, 0.4), std(0xffffff), x, 1.85, 4.1, g);
  }
  for (const z of [-2, 2]) for (const x of [-5.02, 5.02]) {
    const w = mesh(new THREE.BoxGeometry(0.2, 1.6, 1.6), windowMat, x, 2.8, z, g);
    w.castShadow = false;
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.42), new THREE.MeshBasicMaterial({ map: sliceTex, transparent: true }));
  sign.position.set(0, 4.25, 4.02);
  g.add(sign);
  // front step
  mesh(new THREE.BoxGeometry(3, 0.3, 1.4), std(0xd8d2c4), 0, 0.15, 4.7, g);
  addBox(HOUSE.x, HOUSE.z, 5, 4);
}
const houseLight = new THREE.PointLight(0xffc36b, 0, 0, 2);
houseLight.position.set(DOOR.x, 3, DOOR.z + 1.5);
scene.add(houseLight);

// Pond
{
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND_R, 48), std(0x4fc3f7, { roughness: 0.25, emissive: 0x1a6fa0, emissiveIntensity: 0.25 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, 0.05, POND.z);
  scene.add(water);
  const rim = new THREE.Mesh(new THREE.RingGeometry(POND_R, POND_R + 0.8, 48), std(0xc9d3dc));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(POND.x, 0.04, POND.z);
  scene.add(rim);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.4, r = 2 + (i % 3) * 1.1;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16, 0.3, Math.PI * 1.8), std(0x2e9e4f));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(POND.x + Math.cos(a) * r, 0.07, POND.z + Math.sin(a) * r);
    scene.add(pad);
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const s = mesh(new THREE.SphereGeometry(0.35 + rand() * 0.25, 8, 6), std(0xaab4bd), POND.x + Math.cos(a) * (POND_R + 0.4), 0.1, POND.z + Math.sin(a) * (POND_R + 0.4));
    s.scale.y = 0.6;
  }
  addCircle(POND.x, POND.z, POND_R);
}

// Playground: slide, sandbox, swings
{
  const g = new THREE.Group();
  g.position.copy(PLAYGROUND);
  g.rotation.y = 0.5;
  scene.add(g);
  mesh(new THREE.BoxGeometry(2, 0.2, 2), std(0x3a86ff), 0, 2.6, 0, g);
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6), std(0xff5d73), x, 1.3, z, g);
  const slide = mesh(new THREE.BoxGeometry(1.4, 0.15, 4.2), std(0xffd23f), 0, 1.35, 2.7, g);
  slide.rotation.x = 0.62;
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), std(0xffffff), 0, 0.5 + i * 0.5, -1.2, g);
  // sandbox
  mesh(new THREE.BoxGeometry(4, 0.3, 4), std(0xf2d98d), -5, 0.15, -1, g);
  addCircle(PLAYGROUND.x, PLAYGROUND.z, 1.5);
  // swings
  const sw = new THREE.Group();
  sw.position.set(PLAYGROUND.x + 6, 0, PLAYGROUND.z - 4);
  scene.add(sw);
  for (const x of [-2, 2]) {
    const l1 = mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4), std(0x9b5de5), x, 1.6, -0.6, sw); l1.rotation.x = 0.35;
    const l2 = mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4), std(0x9b5de5), x, 1.6, 0.6, sw); l2.rotation.x = -0.35;
  }
  const bar = mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.2), std(0x9b5de5), 0, 3.2, 0, sw);
  bar.rotation.z = Math.PI / 2;
  for (const x of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.8, 0.1, 0.4), std(0xff9f1c), x, 0.8, 0, sw);
    for (const dx of [-0.35, 0.35]) mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4), std(0x666666), x + dx, 2, 0, sw);
  }
  addBox(sw.position.x - 2, sw.position.z, 0.2, 0.8);
  addBox(sw.position.x + 2, sw.position.z, 0.2, 0.8);
}

// Melon patch fence and stumps
{
  for (const [x, z, h] of STUMPS) {
    mesh(new THREE.CylinderGeometry(1.2, 1.35, h, 20), std(0x8d5a3b), x, h / 2, z);
    const top = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.04, 20), std(0xe0aa6a), x, h + 0.02, z);
    top.castShadow = false;
    addCircle(x, z, 1.2, h);
  }
  // soil rows
  for (const z of [-23, -27, -30]) {
    const row = mesh(new THREE.BoxGeometry(10, 0.12, 1.8), std(0x9b6b43), 20, 0.06, z);
    row.castShadow = false;
  }
  // scarecrow
  const s = new THREE.Group();
  s.position.set(14, 0, -30);
  scene.add(s);
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 3), std(0x8d5a3b), 0, 1.5, 0, s);
  const arm = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4), std(0x8d5a3b), 0, 2.2, 0, s); arm.rotation.z = Math.PI / 2;
  mesh(new THREE.BoxGeometry(1, 1, 0.5), std(0xff5d73), 0, 2.1, 0, s);
  mesh(new THREE.SphereGeometry(0.42, 12, 10), std(0xf2d98d), 0, 3.05, 0, s);
  mesh(new THREE.ConeGeometry(0.6, 0.6, 12), std(0xffd23f), 0, 3.55, 0, s);
  addCircle(14, -30, 0.5);
}

// Bus
const bus = { g: new THREE.Group(), wheels: [], bricks: [], theta: Math.PI, driving: false, speed: 0 };
{
  const g = bus.g;
  scene.add(g);
  const yellow = std(0xffc93c);
  mesh(new THREE.BoxGeometry(6.4, 2.2, 2.6), yellow, 0, 1.9, 0, g);
  mesh(new THREE.BoxGeometry(6.2, 0.3, 2.4), std(0xffe08a), 0, 3.15, 0, g);
  mesh(new THREE.BoxGeometry(6.42, 0.15, 2.62), std(0x2b2250), 0, 1.45, 0, g);
  const glass = std(0x9ee7ff, { roughness: 0.2 });
  for (let i = 0; i < 4; i++) for (const z of [-1.31, 1.31]) mesh(new THREE.BoxGeometry(1.1, 0.8, 0.05), glass, -2.2 + i * 1.4, 2.35, z, g);
  mesh(new THREE.BoxGeometry(0.05, 0.9, 2.2), glass, 3.21, 2.35, 0, g);
  for (const x of [-3.25, 3.25]) mesh(new THREE.BoxGeometry(0.2, 0.3, 2.6), std(0x888888), x, 0.95, 0, g);
  for (const z of [-0.85, 0.85]) {
    mesh(new THREE.SphereGeometry(0.22, 12, 10), std(0xffffff, { emissive: 0xfff2a8, emissiveIntensity: 0.6 }), 3.2, 1.35, z, g);
  }
  // smile under the windshield
  const smile = mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 20, Math.PI), std(0x2b2250), 3.22, 1.2, 0, g);
  smile.rotation.set(0, Math.PI / 2, Math.PI);
  for (const [x, z] of [[-2.1, -1.35], [2.1, -1.35], [-2.1, 1.35], [2.1, 1.35]]) {
    const w = makeWheel();
    w.position.set(x, 0.62, z);
    w.visible = false;
    g.add(w);
    bus.wheels.push(w);
    const b = mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), std(0xb0876b), x, 0.4, z * 0.75, g);
    bus.bricks.push(b);
  }
  bus.solid = addBox(BUS_HOME.x, BUS_HOME.z, 1.4, 3.3);
  placeBus();
  // bus stop sign
  const stop = new THREE.Group();
  stop.position.set(BUS_HOME.x + 3.5, 0, BUS_HOME.z - 5);
  scene.add(stop);
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), std(0x888888), 0, 1.5, 0, stop);
  const plate = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 8), std(0x3a86ff), 0, 3.1, 0, stop);
  plate.rotation.x = Math.PI / 2;
  addCircle(stop.position.x, stop.position.z, 0.2);
}
function placeBus() {
  const t = bus.theta;
  bus.g.position.set(Math.cos(t) * ROAD_R, 0, Math.sin(t) * ROAD_R);
  bus.g.rotation.y = Math.atan2(-Math.cos(t), -Math.sin(t));
}

function makeWheel() {
  const g = new THREE.Group();
  mesh(new THREE.TorusGeometry(0.45, 0.2, 12, 24), std(0x333333), 0, 0, 0, g);
  const hub = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.28, 16), std(0xdddddd), 0, 0, 0, g);
  hub.rotation.x = Math.PI / 2;
  const cap = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 12), std(0xff5d73), 0, 0, 0, g);
  cap.rotation.x = Math.PI / 2;
  return g;
}

// Trees, bushes, flowers
const treeTop = [0x4cc35a, 0x5fd16b, 0x3fae52];
const candyTop = [0xff9ec7, 0xffc1e3, 0xffd23f];
let trees = 0;
for (let tries = 0; tries < 800 && trees < 70; tries++) {
  const a = rand() * Math.PI * 2, r = 8 + rand() * (WORLD_R + 20);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  const outside = r > WORLD_R + 1;
  if (!outside && !isClear(x, z, 1.5)) continue;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const s = 0.8 + rand() * 0.6;
  g.scale.setScalar(s);
  scene.add(g);
  mesh(new THREE.CylinderGeometry(0.3, 0.42, 2.4, 8), std(0x9a6a45), 0, 1.2, 0, g);
  const candy = rand() < 0.25;
  const pal = candy ? candyTop : treeTop;
  const col = pal[Math.floor(rand() * pal.length)];
  mesh(new THREE.SphereGeometry(1.6, 14, 12), std(col), 0, 3.4, 0, g);
  if (!candy) {
    mesh(new THREE.SphereGeometry(1.1, 12, 10), std(col), 0.9, 2.8, 0.3, g);
    mesh(new THREE.SphereGeometry(1.0, 12, 10), std(col), -0.8, 3.0, -0.4, g);
  }
  if (!outside) addCircle(x, z, 0.5 * s);
  trees++;
}
function bush(x, z, s = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  scene.add(g);
  const m = std(0x46b85a);
  mesh(new THREE.SphereGeometry(0.8, 12, 10), m, 0, 0.5, 0, g);
  mesh(new THREE.SphereGeometry(0.6, 12, 10), m, 0.7, 0.4, 0.2, g);
  mesh(new THREE.SphereGeometry(0.6, 12, 10), m, -0.6, 0.4, -0.2, g);
  return g;
}
for (const [x, z] of DUCK_SPOTS) bush(x + 1.4, z - 0.6, 1.1);
for (let i = 0; i < 25; i++) {
  const x = (rand() - 0.5) * 100, z = (rand() - 0.5) * 100;
  if (isClear(x, z, 1)) bush(x, z, 0.7 + rand() * 0.5);
}
{
  const n = 260;
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), n);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4), std(0x2e9e4f), n);
  const cols = [0xff5d73, 0xffd23f, 0xffffff, 0x9b5de5, 0xff9f1c, 0x3a86ff].map((c) => new THREE.Color(c));
  const o = new THREE.Object3D();
  let k = 0;
  for (let tries = 0; tries < 2000 && k < n; tries++) {
    const x = (rand() - 0.5) * 110, z = (rand() - 0.5) * 110;
    if (!isClear(x, z, -1.5)) continue;
    o.position.set(x, 0.2, z); o.scale.setScalar(1); o.updateMatrix(); stems.setMatrixAt(k, o.matrix);
    o.position.y = 0.42; o.updateMatrix(); heads.setMatrixAt(k, o.matrix);
    heads.setColorAt(k, cols[k % cols.length]);
    k++;
  }
  heads.count = stems.count = k;
  scene.add(heads, stems);
}

// Fence around the world
{
  const n = 150;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), std(0xffffff), n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    o.position.set(Math.cos(a) * (WORLD_R + 0.8), 0.7, Math.sin(a) * (WORLD_R + 0.8));
    o.rotation.y = -a;
    o.updateMatrix();
    posts.setMatrixAt(i, o.matrix);
  }
  posts.castShadow = true;
  scene.add(posts);
  for (const y of [0.55, 1.05]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(WORLD_R + 0.8, 0.07, 6, 180), std(0xffffff));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = y;
    scene.add(rail);
  }
}

// Sky dressing: clouds, rainbow, sun, moon, stars
const clouds = [];
for (let i = 0; i < 12; i++) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, fog: false, transparent: true, opacity: 0.95 });
  for (let j = 0; j < 4; j++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(2 + rand() * 2, 12, 10), m);
    s.position.set(j * 2.4 - 3.6, rand() * 1.2, rand() * 1.5);
    g.add(s);
  }
  const a = rand() * Math.PI * 2, r = 50 + rand() * 60;
  g.position.set(Math.cos(a) * r, 28 + rand() * 12, Math.sin(a) * r);
  g.userData.m = m;
  scene.add(g);
  clouds.push(g);
}
const rainbowMats = [];
{
  const cols = [0xff5d73, 0xff9f1c, 0xffd23f, 0x3dbb5a, 0x3a86ff, 0x9b5de5];
  cols.forEach((c, i) => {
    const m = new THREE.MeshBasicMaterial({ color: c, fog: false, transparent: true, opacity: 0.85 });
    rainbowMats.push(m);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(60 - i * 2.4, 1.2, 8, 64, Math.PI), m);
    arc.position.set(20, -8, 150);
    arc.rotation.y = Math.PI;
    scene.add(arc);
  });
}
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe066, fog: false, transparent: true });
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), sunMat);
sunBall.position.set(-90, 80, 120);
scene.add(sunBall);
const moonMat = new THREE.MeshBasicMaterial({ color: 0xfff6c7, fog: false, transparent: true, opacity: 0 });
const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 16), moonMat);
moon.position.set(60, 70, 110);
scene.add(moon);
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, fog: false, transparent: true, opacity: 0 });
{
  const pts = [];
  for (let i = 0; i < 500; i++) {
    const a = rand() * Math.PI * 2, e = 0.15 + rand() * 1.3, r = 180;
    pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(geo, starMat));
}
const fireflies = [];
for (let i = 0; i < 40; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0 }));
  const a = rand() * Math.PI * 2, r = 5 + rand() * 40;
  m.userData = { x: Math.cos(a) * r, z: Math.sin(a) * r, p: rand() * 10 };
  scene.add(m);
  fireflies.push(m);
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------
function makeKid() {
  const g = new THREE.Group();
  const skin = std(0xffd7b5), shirt = std(0x55c1ff), shorts = std(0x2f5bd3), shoe = std(0xff5a5a), hair = std(0xffd84d);
  const pivot = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); g.add(p); return p; };
  const legL = pivot(-0.17, 0.62), legR = pivot(0.17, 0.62);
  for (const leg of [legL, legR]) {
    mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 10), skin, 0, -0.28, 0, leg);
    mesh(new THREE.SphereGeometry(0.17, 12, 10), shoe, 0, -0.55, 0.06, leg).scale.set(1, 0.7, 1.4);
  }
  mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.3, 16), shorts, 0, 0.7, 0, g);
  mesh(new THREE.CapsuleGeometry(0.36, 0.3, 6, 16), shirt, 0, 1.02, 0, g);
  // little melon badge on the shirt
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff5d73 }));
  badge.position.set(0, 1.12, 0.37);
  badge.rotation.z = Math.PI;
  g.add(badge);
  const armL = pivot(-0.46, 1.2), armR = pivot(0.46, 1.2);
  for (const [arm, s] of [[armL, -1], [armR, 1]]) {
    arm.rotation.z = s * 0.25;
    mesh(new THREE.CapsuleGeometry(0.1, 0.28, 4, 10), shirt, 0, -0.2, 0, arm);
    mesh(new THREE.SphereGeometry(0.11, 10, 8), skin, 0, -0.45, 0, arm);
  }
  const head = new THREE.Group();
  head.position.y = 1.78;
  g.add(head);
  mesh(new THREE.SphereGeometry(0.56, 24, 18), skin, 0, 0, 0, head);
  for (const x of [-0.55, 0.55]) mesh(new THREE.SphereGeometry(0.12, 10, 8), skin, x, 0, 0, head);
  for (const x of [-0.2, 0.2]) {
    mesh(new THREE.SphereGeometry(0.1, 12, 10), std(0x2b2250, { roughness: 0.3 }), x, 0.05, 0.48, head);
    mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), x + 0.03, 0.09, 0.57, head);
    mesh(new THREE.SphereGeometry(0.1, 10, 8), std(0xffa3a3), x * 1.65, -0.14, 0.42, head).scale.set(1, 0.6, 0.4);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 16, Math.PI), std(0xc0394b), 0, -0.17, 0.52, head);
  mouth.rotation.z = Math.PI;
  mesh(new THREE.SphereGeometry(0.585, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), hair, 0, 0.02, -0.04, head);
  const tuft = mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 16, Math.PI * 1.5), hair, 0, 0.62, 0.05, head);
  tuft.rotation.y = Math.PI / 2;
  return { g, legL, legR, armL, armR, head };
}

function makeDuck(s, color = 0xffe066) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const m = std(color);
  mesh(new THREE.SphereGeometry(0.5, 16, 12), m, 0, 0.45, 0, body).scale.set(1, 0.8, 1.2);
  mesh(new THREE.ConeGeometry(0.18, 0.4, 8), m, 0, 0.62, -0.62, body).rotation.x = -2.2;
  mesh(new THREE.SphereGeometry(0.34, 16, 12), m, 0, 0.98, 0.36, body);
  mesh(new THREE.ConeGeometry(0.12, 0.3, 10), std(0xff9a1f), 0, 0.93, 0.74, body).rotation.x = Math.PI / 2;
  for (const x of [-0.14, 0.14]) mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0x2b2250), x, 1.06, 0.62, body);
  for (const x of [-0.46, 0.46]) mesh(new THREE.SphereGeometry(0.22, 10, 8), m, x, 0.5, -0.05, body).scale.set(0.4, 0.7, 1.1);
  g.scale.setScalar(s);
  g.userData.body = body;
  scene.add(g);
  return g;
}

const kid = makeKid();
scene.add(kid.g);

const mama = makeDuck(1.3, 0xffffff);
mama.position.set(POND.x, 0.05, POND.z);

// ---------------------------------------------------------------------------
// Collectables & guide
// ---------------------------------------------------------------------------
const wheelItems = WHEEL_SPOTS.map(([x, z]) => {
  const w = makeWheel();
  w.position.set(x, 1, z);
  w.visible = false;
  scene.add(w);
  return w;
});

const ducklings = DUCK_SPOTS.map(([x, z]) => {
  const d = makeDuck(0.55);
  d.position.set(x, 0, z);
  d.visible = false;
  d.userData.state = 'lost';
  return d;
});

const blocks = BLOCKS.map(([letter, color], i) => {
  const tex = letterTex(letter, color);
  const b = mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), BLOCK_SPOTS[i][0], 1.1, BLOCK_SPOTS[i][1]);
  b.visible = false;
  b.userData = { letter, color, taken: false };
  return b;
});

const melonGeo = new THREE.SphereGeometry(0.55, 24, 16);
const melonMat = new THREE.MeshStandardMaterial({ map: melonTex, roughness: 0.5 });
const melons = MELON_SPOTS.map(([x, z, h]) => {
  const m = mesh(melonGeo, melonMat, x, h + 0.5, z);
  m.scale.set(1.25, 0.95, 0.95);
  m.rotation.y = rand() * Math.PI;
  m.visible = false;
  m.userData.base = h + 0.5;
  return m;
});

const guide = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb300, emissiveIntensity: 0.6 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 16), m);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 0.5;
  guide.add(cone);
  scene.add(guide);
}
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 0.7, 30, 20, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
);
scene.add(beam);
const beamRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
beamRing.rotation.x = -Math.PI / 2;
scene.add(beamRing);

// Sparkle particles
const particles = [];
const pGeo = new THREE.SphereGeometry(0.12, 6, 6);
function burst(pos, color = 0xffd23f, n = 20) {
  for (let i = 0; i < n; i++) {
    let p = particles.find((q) => q.userData.life <= 0);
    if (!p) {
      p = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ transparent: true }));
      p.userData = { v: new THREE.Vector3(), life: 0 };
      scene.add(p);
      particles.push(p);
    }
    p.material.color.set(i % 3 === 0 ? 0xffffff : color);
    p.position.copy(pos);
    p.userData.v.set((rand() - 0.5) * 7, 3 + rand() * 5, (rand() - 0.5) * 7);
    p.userData.life = 0.9;
    p.visible = true;
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    const u = p.userData;
    if (u.life <= 0) continue;
    u.life -= dt;
    u.v.y -= 14 * dt;
    p.position.addScaledVector(u.v, dt);
    p.material.opacity = Math.max(0, u.life / 0.9);
    p.scale.setScalar(0.5 + u.life);
    if (u.life <= 0) p.visible = false;
  }
}

// ---------------------------------------------------------------------------
// Audio: tiny synth, background tune (Twinkle Twinkle, public domain), speech
// ---------------------------------------------------------------------------
let actx = null, master = null, musicGain = null, muted = false;
function initAudio() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = 0.6;
  master.connect(actx.destination);
  musicGain = actx.createGain();
  musicGain.gain.value = 0.35;
  musicGain.connect(master);
}
function tone(freq, t0, dur, { type = 'triangle', vol = 0.2, to = null, dest = null } = {}) {
  if (!actx) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(dest || master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const sfx = {
  pickup() { const t = actx?.currentTime; if (t == null) return; [72, 76, 79, 84].forEach((n, i) => tone(midi(n), t + i * 0.06, 0.25, { vol: 0.18 })); },
  jump() { const t = actx?.currentTime; if (t == null) return; tone(320, t, 0.18, { type: 'sine', vol: 0.15, to: 640 }); },
  quack() { const t = actx?.currentTime; if (t == null) return; tone(620, t, 0.12, { type: 'square', vol: 0.06, to: 420 }); tone(560, t + 0.14, 0.12, { type: 'square', vol: 0.05, to: 380 }); },
  peep(vol) { const t = actx?.currentTime; if (t == null) return; tone(1400, t, 0.08, { type: 'sine', vol, to: 1800 }); tone(1500, t + 0.1, 0.08, { type: 'sine', vol, to: 1900 }); },
  honk() { const t = actx?.currentTime; if (t == null) return; for (const dt of [0, 0.3]) { tone(330, t + dt, 0.22, { type: 'square', vol: 0.09 }); tone(415, t + dt, 0.22, { type: 'square', vol: 0.07 }); } },
  wrong() { const t = actx?.currentTime; if (t == null) return; tone(300, t, 0.25, { type: 'sine', vol: 0.15, to: 200 }); },
  complete() { const t = actx?.currentTime; if (t == null) return; [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.52], [84, 0.64]].forEach(([n, d]) => tone(midi(n), t + d, 0.35, { vol: 0.16 })); },
};

// Twinkle Twinkle Little Star: [midi, beats]
const TUNE = [
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
  [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
  [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
];
const BEAT = 0.5;
let musicNext = 0, musicIdx = 0, musicTimer = null;
function startMusic() {
  if (!actx || musicTimer) return;
  musicNext = actx.currentTime + 0.2;
  musicTimer = setInterval(() => {
    while (musicNext < actx.currentTime + 0.4) {
      const [n, b] = TUNE[musicIdx];
      tone(midi(n + 12), musicNext, b * BEAT * 0.95, { type: 'sine', vol: 0.12, dest: musicGain });
      if (musicIdx % 2 === 0) tone(midi(n - 12), musicNext, b * BEAT * 1.6, { type: 'triangle', vol: 0.08, dest: musicGain });
      musicNext += b * BEAT;
      musicIdx = (musicIdx + 1) % TUNE.length;
      if (musicIdx === 0) musicNext += BEAT * 2;
    }
  }, 100);
}

function say(text) {
  if (muted || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.pitch = 1.25;
  speechSynthesis.speak(u);
}

function setMuted(m) {
  muted = m;
  $('muteBtn').textContent = m ? '🔇' : '🔊';
  if (master) master.gain.value = m ? 0 : 0.6;
  if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function renderHUD() {
  const q = QUESTS[quest.i];
  if (!q) return;
  $('strip').innerHTML = QUESTS.map((x, i) => `<span class="${i < quest.i || (i === quest.i && quest.done) ? 'done' : i === quest.i ? 'now' : ''}">${i < quest.i ? '✔' : x.icon}</span>`).join('');
  $('qtitle').textContent = q.title;
  $('qdesc').textContent = q.desc();
  $('qprog').innerHTML = q.progress();
}

function confetti() {
  const cols = ['#ff5d73', '#ffd23f', '#3dbb5a', '#3a86ff', '#9b5de5', '#ff9f1c'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = `${2.5 + Math.random() * 2.5}s`;
    c.style.animationDelay = `${Math.random() * 1.2}s`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 6000);
  }
}

// ---------------------------------------------------------------------------
// Player state & input
// ---------------------------------------------------------------------------
const P = { pos: SPAWN.clone(), vy: 0, onGround: true, facing: 0, walkT: 0, moving: false };
const SPEED = 7.5, JUMP = 9.8, GRAV = 26;
let camYaw = Math.PI, camPitch = 0.42, camDist = 10;
const keys = new Set();
let jumpQueued = false;
const joy = { x: 0, y: 0, id: null };

addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Space' && !e.repeat) jumpQueued = true;
  if (e.code === 'KeyM' && !e.repeat) setMuted(!muted);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Drag to orbit camera (mouse or touch, anywhere that isn't a control)
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  camYaw -= (e.clientX - drag.x) * 0.006;
  camPitch = clamp(camPitch + (e.clientY - drag.y) * 0.004, 0.12, 1.1);
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);
renderer.domElement.addEventListener('wheel', (e) => { camDist = clamp(camDist + e.deltaY * 0.01, 6, 18); }, { passive: true });

// Touch joystick
const stick = $('stick'), knob = $('knob');
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  const R = r.width / 2;
  let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
  const d = Math.hypot(dx, dy);
  if (d > R) { dx *= R / d; dy *= R / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / R;
  joy.y = -dy / R;
}
stick.addEventListener('pointerdown', (e) => { joy.id = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);
$('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); jumpQueued = true; });
const isTouch = matchMedia('(pointer: coarse)').matches;
addEventListener('touchstart', () => { if (state === 'play') $('touch').hidden = false; }, { passive: true });

$('muteBtn').addEventListener('click', () => setMuted(!muted));

// ---------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------
const quest = { i: -1, done: false, nextAt: 0, wrongAt: 0 };
const near = (obj, r = 1.6) => {
  const dx = obj.position.x - P.pos.x, dz = obj.position.z - P.pos.z, dy = obj.position.y - (P.pos.y + 0.9);
  return dx * dx + dz * dz < r * r && Math.abs(dy) < 1.8;
};
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function nearest(list) {
  let best = null, bd = Infinity;
  for (const o of list) { const d = flatDist(o.position, P.pos); if (d < bd) { bd = d; best = o; } }
  return best;
}
const pips = (n, total, on, off = '⚪') => on.repeat(n) + off.repeat(total - n);

let wheelsGot = 0, melonsGot = 0, nextLetter = 0;
const following = [];

const QUESTS = [
  {
    icon: '🚌',
    title: 'The Wheels on the Bus',
    desc: () => (wheelsGot < 4 ? 'Oh no, the bus lost its wheels! Find all 4.' : 'You found them all! Take the wheels to the yellow bus.'),
    speak: 'Oh no! The bus lost its wheels. Can you find four wheels?',
    progress: () => pips(wheelsGot, 4, '🛞'),
    start() { wheelItems.forEach((w) => (w.visible = true)); },
    update(t) {
      for (const w of wheelItems) {
        if (!w.visible) continue;
        w.rotation.y = t * 2;
        w.position.y = 1 + Math.sin(t * 3 + w.position.x) * 0.2;
        if (near(w)) {
          w.visible = false;
          wheelsGot++;
          burst(w.position, 0xffd23f);
          sfx.pickup();
          if (wheelsGot < 4) { toast(`Wheel ${wheelsGot} of 4!`); say(String(wheelsGot)); }
          else { toast('All 4 wheels! Now find the bus 🚌'); say('Four wheels! Now take them to the bus.'); }
          renderHUD();
        }
      }
      if (wheelsGot === 4 && flatDist(P.pos, bus.g.position) < 4.8) {
        bus.wheels.forEach((w) => (w.visible = true));
        bus.bricks.forEach((b) => (b.visible = false));
        burst(bus.g.position.clone().setY(2), 0xffc93c, 40);
        sfx.honk();
        toast('Beep beep! 🚌');
        say('The wheels on the bus go round and round!');
        setTimeout(() => { bus.driving = true; bus.solid.off = true; }, 1800);
        completeQuest();
      } else if (wheelsGot < 4 && flatDist(P.pos, bus.g.position) < 4.8 && t > quest.wrongAt) {
        quest.wrongAt = t + 3;
        toast(`The bus needs ${4 - wheelsGot} more wheel${4 - wheelsGot > 1 ? 's' : ''}!`);
      }
    },
    target: () => (wheelsGot < 4 ? nearest(wheelItems.filter((w) => w.visible))?.position : bus.g.position),
  },
  {
    icon: '🐥',
    title: 'Five Little Ducks',
    desc: () => (following.length < 5 ? 'Five little ducks went out one day… Find them and they will follow you!' : 'Lead all 5 ducklings back to Mama Duck at the pond.'),
    speak: 'Five little ducks went out one day. Can you find them and bring them home to Mama Duck?',
    progress: () => pips(following.length, 5, '🐥'),
    start() { ducklings.forEach((d) => (d.visible = true)); },
    update(t, dt) {
      for (const d of ducklings) {
        if (d.userData.state !== 'lost') continue;
        d.userData.body.position.y = Math.abs(Math.sin(t * 4 + d.position.x)) * 0.35;
        d.rotation.y = Math.sin(t + d.position.z) * 0.8;
        if (near(d, 1.8)) {
          d.userData.state = 'follow';
          following.push(d);
          burst(d.position.clone().setY(0.8), 0xffe066, 14);
          sfx.quack();
          sfx.pickup();
          const left = 5 - following.length;
          toast(left ? `Quack! ${following.length} duckling${following.length > 1 ? 's' : ''} found` : 'All 5 ducklings! Go to the pond 🦆');
          say(left ? `${following.length}` : 'All five little ducks! Take them to the pond.');
          renderHUD();
        }
      }
      // peeps get louder as you get close to a lost duckling
      if (t > (quest.peepAt || 0)) {
        quest.peepAt = t + 2.5;
        const d = nearest(ducklings.filter((x) => x.userData.state === 'lost'));
        if (d) { const dist = flatDist(d.position, P.pos); if (dist < 22) sfx.peep(0.06 * (1 - dist / 22) + 0.01); }
      }
      if (flatDist(P.pos, POND) < POND_R + 3.2 && following.length) {
        if (following.length === 5) {
          following.forEach((d, i) => { d.userData.state = 'swim'; d.userData.a = (i / 5) * Math.PI * 2; });
          sfx.quack();
          toast('Quack quack! Mama Duck is so happy 🦆');
          say('And all of the five little ducks came back!');
          completeQuest();
        } else if (t > quest.wrongAt) {
          quest.wrongAt = t + 3;
          toast(`Mama Duck is waiting for ${5 - following.length} more!`);
        }
      }
    },
    target: () => (following.length < 5 ? nearest(ducklings.filter((d) => d.userData.state === 'lost'))?.position : POND),
  },
  {
    icon: '🔤',
    title: 'ABC Blocks',
    desc: () => (nextLetter < 5 ? `Find the letter blocks in order. Next up: ${BLOCKS[nextLetter][0]}!` : 'A, B, C, D, E!'),
    speak: 'Let\'s find the A B C blocks! First, find the letter A.',
    progress: () => BLOCKS.map(([l, c], i) => `<span class="letter ${i < nextLetter ? 'got' : i === nextLetter ? 'next' : ''}" style="background:${c}">${l}</span>`).join(''),
    start() { blocks.forEach((b) => (b.visible = true)); },
    update(t) {
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!b.visible) continue;
        b.rotation.y = t * (i === nextLetter ? 1.6 : 0.5);
        b.position.y = 1.1 + Math.sin(t * 2.5 + i) * (i === nextLetter ? 0.3 : 0.1);
        if (!near(b, 1.7)) continue;
        if (i === nextLetter) {
          b.visible = false;
          nextLetter++;
          burst(b.position, new THREE.Color(b.userData.color).getHex(), 24);
          sfx.pickup();
          say(b.userData.letter);
          if (nextLetter < 5) toast(`${b.userData.letter}! Now find ${BLOCKS[nextLetter][0]}`);
          else { toast('A B C D E! 🎉'); setTimeout(() => say('A, B, C, D, E! Great job!'), 700); completeQuest(); }
          renderHUD();
        } else if (t > quest.wrongAt) {
          quest.wrongAt = t + 1.5;
          sfx.wrong();
          toast(`That's ${b.userData.letter}. Find ${BLOCKS[nextLetter][0]} first!`);
          say(`That's ${b.userData.letter}. Find ${BLOCKS[nextLetter][0]} first!`);
        }
      }
    },
    target: () => blocks[nextLetter]?.position,
  },
  {
    icon: '🍉',
    title: 'Melon Patch',
    desc: () => 'Pick 10 watermelons! Some are up on the tree stumps. Jump to reach them!',
    speak: 'Yum yum! Pick ten watermelons. Jump up the tree stumps to get the high ones!',
    progress: () => `🍉 ${melonsGot} / 10`,
    start() { melons.forEach((m) => (m.visible = true)); },
    update(t) {
      for (const m of melons) {
        if (!m.visible) continue;
        m.position.y = m.userData.base + Math.abs(Math.sin(t * 3 + m.position.x)) * 0.15;
        if (near(m, 1.5)) {
          m.visible = false;
          melonsGot++;
          burst(m.position, 0xff5d73, 18);
          sfx.pickup();
          say(String(melonsGot));
          if (melonsGot < 10) toast(`${melonsGot} melon${melonsGot > 1 ? 's' : ''}!`);
          else { toast('Ten watermelons! Yummy 🍉'); say('Ten watermelons! Yummy yummy!'); completeQuest(); }
          renderHUD();
        }
      }
    },
    target: () => nearest(melons.filter((m) => m.visible))?.position,
  },
  {
    icon: '🌙',
    title: 'Bedtime',
    desc: () => 'The stars are coming out. Walk home to the front door for bedtime!',
    speak: 'Twinkle twinkle little star. It\'s getting dark! Time to go home for bed.',
    progress: () => '⭐ 🏠 🛏️',
    start() { night.target = 1; },
    update() {
      if (flatDist(P.pos, DOOR) < 2.2) win();
    },
    target: () => DOOR,
  },
];

function startQuest(i) {
  quest.i = i;
  quest.done = false;
  QUESTS[i].start();
  renderHUD();
  toast(`${QUESTS[i].icon} ${QUESTS[i].title}`, 2600);
  setTimeout(() => say(QUESTS[i].speak), 300);
}

function completeQuest() {
  quest.done = true;
  sfx.complete();
  burst(P.pos.clone().setY(2), 0xffffff, 30);
  renderHUD();
  quest.nextAt = clock.elapsedTime + 3.2;
}

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------
const night = { k: 0, target: 0 };
const kidLight = new THREE.PointLight(0xfff0c0, 0, 14, 1.5);
scene.add(kidLight);
function applyNight() {
  const k = night.k;
  scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, k);
  scene.fog.color.copy(scene.background);
  sun.intensity = lerp(1.7, 0.35, k);
  sun.color.setHex(0xfff3d6).lerp(new THREE.Color(0x8fa0ff), k);
  hemi.intensity = lerp(1.1, 0.45, k);
  sunMat.opacity = 1 - k;
  sunBall.visible = k < 0.99;
  moonMat.opacity = k;
  starMat.opacity = k;
  windowMat.emissiveIntensity = 1.6 * k;
  houseLight.intensity = 60 * k;
  kidLight.intensity = 6 * k;
  for (const m of rainbowMats) m.opacity = 0.85 * (1 - k);
  for (const c of clouds) c.userData.m.opacity = 0.95 - 0.6 * k;
}

// ---------------------------------------------------------------------------
// Game flow
// ---------------------------------------------------------------------------
let state = 'title';
let startTime = 0;
const clock = new THREE.Clock();

function win() {
  if (state !== 'play') return;
  state = 'won';
  const secs = Math.round(clock.elapsedTime - startTime);
  $('winTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('hud').hidden = true;
  $('touch').hidden = true;
  $('win').hidden = false;
  sfx.complete();
  confetti();
  say('Goodnight! Sweet dreams!');
}

$('startBtn').addEventListener('click', () => {
  initAudio();
  actx?.resume();
  startMusic();
  $('title').hidden = true;
  $('hud').hidden = false;
  if (isTouch) $('touch').hidden = false;
  state = 'play';
  startTime = clock.elapsedTime;
  camYaw = Math.PI;
  startQuest(0);
});
$('againBtn').addEventListener('click', () => location.reload());

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
const tmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camRay = new THREE.Raycaster();
const camDir = new THREE.Vector3();

function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (state === 'play') {
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    if (keys.has('KeyQ')) camYaw += 2 * dt;
    if (keys.has('KeyE')) camYaw -= 2 * dt;
    ix += joy.x;
    iz += joy.y;
  }
  const len = Math.hypot(ix, iz);
  if (len > 1) { ix /= len; iz /= len; }
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = -fz, rz = fx;
  const mx = rx * ix + fx * iz, mz = rz * ix + fz * iz;
  P.moving = len > 0.1;
  P.pos.x += mx * SPEED * dt;
  P.pos.z += mz * SPEED * dt;
  collide(P.pos);
  const r = Math.hypot(P.pos.x, P.pos.z);
  if (r > WORLD_R) { P.pos.x *= WORLD_R / r; P.pos.z *= WORLD_R / r; }

  if (jumpQueued && P.onGround && state === 'play') { P.vy = JUMP; P.onGround = false; sfx.jump(); }
  jumpQueued = false;
  P.vy -= GRAV * dt;
  P.pos.y += P.vy * dt;
  const g = groundAt(P.pos);
  if (P.pos.y <= g) { P.pos.y = g; P.vy = 0; P.onGround = true; }
  else if (P.pos.y > g + 0.05) P.onGround = false;

  if (P.moving) {
    const want = Math.atan2(mx, mz);
    let d = want - P.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    P.facing += d * Math.min(1, dt * 12);
  }

  // animation
  kid.g.position.copy(P.pos);
  kid.g.rotation.y = P.facing;
  if (!P.onGround) {
    kid.legL.rotation.x = -0.6; kid.legR.rotation.x = 0.3;
    kid.armL.rotation.x = kid.armR.rotation.x = -2.4;
  } else if (P.moving) {
    P.walkT += dt * 13 * Math.min(1, len);
    const s = Math.sin(P.walkT);
    kid.legL.rotation.x = s * 0.8; kid.legR.rotation.x = -s * 0.8;
    kid.armL.rotation.x = -s * 0.7; kid.armR.rotation.x = s * 0.7;
    kid.g.position.y += Math.abs(Math.cos(P.walkT)) * 0.12;
  } else {
    for (const l of [kid.legL, kid.legR, kid.armL, kid.armR]) l.rotation.x *= 1 - Math.min(1, dt * 10);
    kid.head.rotation.z = Math.sin(clock.elapsedTime * 1.5) * 0.06;
  }
}

function updateDucks(t, dt) {
  // Mama paddles in a small circle
  mama.position.set(POND.x + Math.cos(t * 0.4) * 1.5, 0.05 + Math.sin(t * 2) * 0.04, POND.z + Math.sin(t * 0.4) * 1.5);
  mama.rotation.y = -t * 0.4;
  let leader = P.pos, gap = 1.5;
  for (const d of following) {
    const u = d.userData;
    if (u.state === 'follow') {
      tmp.set(leader.x - d.position.x, 0, leader.z - d.position.z);
      const dist = tmp.length();
      if (dist > gap) {
        const step = Math.min(dist - gap, 10 * dt * Math.min(1, dist / gap));
        d.position.addScaledVector(tmp.normalize(), step);
        d.rotation.y = Math.atan2(tmp.x, tmp.z);
        u.body.position.y = Math.abs(Math.sin(t * 14 + d.position.x)) * 0.18;
        u.body.rotation.z = Math.sin(t * 14) * 0.15;
      } else {
        u.body.position.y *= 0.8;
      }
      leader = d.position;
      gap = 1.05;
    } else if (u.state === 'swim') {
      u.a += dt * 0.5;
      const tx = mama.position.x + Math.cos(u.a) * 2.6, tz = mama.position.z + Math.sin(u.a) * 2.6;
      tmp.set(tx - d.position.x, 0, tz - d.position.z);
      d.position.x += tmp.x * Math.min(1, dt * 2);
      d.position.z += tmp.z * Math.min(1, dt * 2);
      d.position.y = lerp(d.position.y, 0.05, dt * 3);
      d.rotation.y = u.a + Math.PI;
      u.body.position.y = Math.sin(t * 2 + u.a) * 0.03;
      u.body.rotation.z = 0;
    }
  }
}

function updateBus(dt) {
  if (!bus.driving) return;
  bus.speed = Math.min(6, bus.speed + dt * 2);
  bus.theta += (bus.speed / ROAD_R) * dt;
  placeBus();
  for (const w of bus.wheels) w.rotation.z -= (bus.speed / 0.62) * dt;
  bus.g.children[0].position.y = 1.9 + Math.sin(bus.theta * 80) * 0.03;
}

function updateGuide(t) {
  const q = QUESTS[quest.i];
  const target = state === 'play' && q && !quest.done ? q.target() : null;
  const show = !!target;
  beam.visible = beamRing.visible = show;
  guide.visible = show && flatDist(target, P.pos) > 2.5;
  if (!show) return;
  beam.position.set(target.x, 15, target.z);
  beamRing.position.set(target.x, (target.y > 1.5 ? target.y - 0.55 : 0) + 0.06, target.z);
  beamRing.scale.setScalar(1 + Math.sin(t * 4) * 0.15);
  guide.position.set(P.pos.x, P.pos.y + 3.1 + Math.sin(t * 5) * 0.15, P.pos.z);
  guide.rotation.y = Math.atan2(target.x - P.pos.x, target.z - P.pos.z);
}

function updateCamera(dt) {
  camTarget.set(P.pos.x, P.pos.y + 1.6, P.pos.z);
  const cp = Math.cos(camPitch);
  tmp.set(
    camTarget.x + Math.sin(camYaw) * cp * camDist,
    camTarget.y + Math.sin(camPitch) * camDist,
    camTarget.z + Math.cos(camYaw) * cp * camDist,
  );
  // pull the camera in front of the house instead of seeing through its walls
  camDir.subVectors(tmp, camTarget).normalize();
  camRay.set(camTarget, camDir);
  camRay.far = camDist;
  const hit = camRay.intersectObject(houseGroup, true)[0];
  if (hit) tmp.copy(camTarget).addScaledVector(camDir, Math.max(1.5, hit.distance - 0.4));
  camera.position.lerp(tmp, 1 - Math.exp(-8 * dt));
  camera.lookAt(camTarget);
  // keep the shadow camera centred on the player
  sun.position.set(P.pos.x + 30, 50, P.pos.z + 20);
  sun.target.position.set(P.pos.x, 0, P.pos.z);
  kidLight.position.set(P.pos.x, P.pos.y + 3, P.pos.z);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (state === 'title') camYaw += dt * 0.15;
  updatePlayer(dt);

  if (state === 'play') {
    const q = QUESTS[quest.i];
    if (q && !quest.done) q.update(t, dt);
    if (quest.done && quest.nextAt && t > quest.nextAt && quest.i < QUESTS.length - 1) {
      quest.nextAt = 0;
      startQuest(quest.i + 1);
    }
  }
  updateDucks(t, dt);
  updateBus(dt);
  updateParticles(dt);
  updateGuide(t);

  if (night.k !== night.target) {
    night.k = clamp(night.k + Math.sign(night.target - night.k) * dt / 4, 0, 1);
    applyNight();
  }
  if (night.k > 0) {
    for (const f of fireflies) {
      const u = f.userData;
      f.position.set(u.x + Math.sin(t * 0.7 + u.p) * 2, 1 + Math.sin(t * 1.3 + u.p) * 0.6, u.z + Math.cos(t * 0.5 + u.p) * 2);
      f.material.opacity = night.k * (0.5 + 0.5 * Math.sin(t * 3 + u.p));
    }
  }
  for (const c of clouds) {
    c.position.x += dt * 1.2;
    if (c.position.x > 120) c.position.x = -120;
  }

  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Snap the camera into place for the first frame, then go.
camera.position.set(0, 8, -20);
$('loading').hidden = true;
requestAnimationFrame(tick);

// Test hook for automated checks (harmless in play).
window.__game = { P, quest, QUESTS, state: () => state, wheelItems, ducklings, blocks, melons, bus, following, DOOR, POND };
