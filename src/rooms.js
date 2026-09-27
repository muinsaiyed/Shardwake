import * as THREE from 'three';
import { GlassPanel, GlassFan, GlassCube, Lattice, Crystal, Door, Crusher, Pendulum, PowerUp, CoreLens, boxGeo, neonMat, metalMat } from './entities.js';

export const ROOM_LEN = 210;
export const FLOOR_Y = -2.2;

// Each sector: palette, music track, travel speed, decor builder and obstacle layout.
// Layout distances are relative to the sector start (metres travelled).
export const ROOMS = [
  {
    name: 'VESTIBULE', track: 'vestibule', speed: 8.5,
    palette: { fog: 0x0c1a22, sky: 0x9fd8ff, ground: 0x0a1116, accent: 0x7fe9ff, glass: 0xbfe8ff, floor: '#0d1c24', line: '#3fb8d6', zenith: 0x030a10, nebA: 0x1d5a6e, nebB: 0x4a3a6a, floorTint: 0x04090c, ripple: 0, shadow: 0x06303c, high: 0xfff0dc },
    decor: decorFrames,
    layout(P) {
      P.add(20, Crystal, { x: 0, y: 0.8 });
      P.add(32, Crystal, { x: -1.4, y: 0.2 }); P.add(32, Crystal, { x: 1.4, y: 0.2 });
      P.add(46, GlassPanel, { x: 0, y: 0.2, w: 2.6, h: 2.6 });
      P.add(58, Crystal, { x: 0, y: 1.9, big: true });
      P.add(70, GlassPanel, { x: -2.6, y: 0.4, w: 1.6, h: 3.6, cols: 1, rows: 2 });
      P.add(70, GlassPanel, { x: 2.6, y: 0.4, w: 1.6, h: 3.6, cols: 1, rows: 2 });
      P.add(74, GlassPanel, { x: 0, y: 0.3, w: 2.4, h: 2.4, cols: 2, rows: 2 });
      P.add(88, Crystal, { x: -2, y: 1 }); P.add(88, Crystal, { x: 0, y: 1.6 }); P.add(88, Crystal, { x: 2, y: 1 });
      P.add(104, GlassPanel, { x: 0, y: 0.6, w: 8.4, h: 5.6, cols: 4, rows: 3 });
      P.add(120, GlassPanel, { x: -1.3, y: 0.3, w: 2.4, h: 3.6, rows: 2, move: { axis: 'x', amp: 1.2, beats: 4 } });
      P.add(120, GlassPanel, { x: 1.3, y: 0.3, w: 2.4, h: 3.6, rows: 2, move: { axis: 'x', amp: 1.2, beats: 4, phase: Math.PI } });
      P.add(132, Crystal, { x: -1, y: -0.6 }); P.add(136, Crystal, { x: 1, y: 1.6 });
      P.add(150, GlassCube, { x: 0, y: 0.2, size: 2.0 });
      for (let i = -3; i <= 3; i++) P.add(166, GlassPanel, { x: i * 1.2, y: 0.6, w: 0.5, h: 5.2, rows: 2 });
      P.add(172, Crystal, { x: 0, y: 2.2 });
      P.add(190, Door, { switches: [[0, 2.2]] });
      P.add(200, Crystal, { x: 0, y: 0.6, big: true });
    },
  },
  {
    name: 'ORRERY HALL', track: 'orrery', speed: 10,
    palette: { fog: 0x140b2a, sky: 0xc0a8ff, ground: 0x0e0818, accent: 0xb48cff, glass: 0xd8ccff, floor: '#130b24', line: '#8a5cff', zenith: 0x05020e, nebA: 0x6a2c9a, nebB: 0xc23a7a, floorTint: 0x07040f, ripple: 0, shadow: 0x2a0c4a, high: 0xffd6f0 },
    decor: decorRings,
    layout(P) {
      P.add(16, Crystal, { x: 0, y: 0.5, orbit: { r: 1.6, beats: 4 } });
      P.add(28, GlassFan, { blades: 3, rate: 0.25 });
      P.add(40, Crystal, { x: -1.8, y: 1.4 }); P.add(40, Crystal, { x: 1.8, y: 1.4 });
      P.add(54, GlassFan, { blades: 4, rate: -0.2, tint: 0xffc8f0 });
      P.add(66, PowerUp, { x: 0, y: 1.3, kind: 'overdrive' });
      P.add(80, GlassPanel, { x: 0, y: 0.6, w: 8.4, h: 5.6, cols: 6, rows: 4 });
      P.add(90, GlassPanel, { x: 0, y: 0.6, w: 8.4, h: 5.6, cols: 6, rows: 4, tint: 0xffc8f0 });
      P.add(100, GlassPanel, { x: 0, y: 0.6, w: 8.4, h: 5.6, cols: 6, rows: 4 });
      P.add(112, Crystal, { x: 0, y: 0.3, big: true, orbit: { r: 1.2, beats: 2 } });
      P.add(126, Lattice, { cols: 3, rows: 3 });
      P.add(138, Crystal, { x: -2.4, y: -0.8 }); P.add(140, Crystal, { x: 2.4, y: 2.2 });
      P.add(152, GlassFan, { blades: 2, len: 3.2, width: 1.2, rate: 0.3 });
      P.add(160, GlassPanel, { x: 0, y: 0.4, w: 3.2, h: 1.2, move: { axis: 'y', amp: 1.6, beats: 2 } });
      P.add(170, Crystal, { x: 0, y: 0.5, orbit: { r: 2, beats: 4 } }); P.add(170, Crystal, { x: 0, y: 0.5, orbit: { r: 2, beats: 4, phase: Math.PI } });
      P.add(186, Door, { switches: [[-2.2, 2.0], [2.2, 2.0]] });
      P.add(198, Crystal, { x: 0, y: 1.2 });
    },
  },
  {
    name: 'FOUNDRY LENS', track: 'foundry', speed: 11.5,
    palette: { fog: 0x14161c, sky: 0xe8eef8, ground: 0x0b0c10, accent: 0xffa46a, glass: 0xa8f0ff, floor: '#14171d', line: '#7c8aa0', zenith: 0x040507, nebA: 0x5a2a14, nebB: 0x1c3450, floorTint: 0x060708, ripple: 0, shadow: 0x0c1c30, high: 0xffd2a0 },
    decor: decorHex,
    layout(P) {
      P.add(16, Crystal, { x: 1.5, y: 1.2 });
      P.add(30, Crusher, { switchAt: [3.0, 2.0] });
      P.add(40, Crystal, { x: -2, y: 0.4 }); P.add(44, Crystal, { x: 2, y: 0.4 });
      P.add(56, Lattice, { cols: 4, rows: 3 });
      P.add(70, PowerUp, { x: 0, y: 1.0, kind: 'nova' });
      P.add(84, Crusher, { switchAt: [-3.0, 2.2] });
      P.add(92, Lattice, { cols: 3, rows: 4, tint: 0xffd0a8 });
      P.add(104, Crystal, { x: 0, y: 1.8, big: true });
      P.add(116, GlassPanel, { x: -1.5, y: 0.4, w: 2.8, h: 4.4, rows: 2, move: { axis: 'x', amp: 1.4, beats: 2 } });
      P.add(122, GlassPanel, { x: 1.5, y: 0.4, w: 2.8, h: 4.4, rows: 2, move: { axis: 'x', amp: 1.4, beats: 2, phase: Math.PI } });
      P.add(134, Crystal, { x: -1.2, y: -0.8 }); P.add(134, Crystal, { x: 1.2, y: -0.8 });
      P.add(148, Crusher, { switchAt: [3.0, 2.4] });
      P.add(152, Crystal, { x: 0, y: 3.0 });
      P.add(166, GlassCube, { x: 0, y: 0.2, size: 2.2, tint: 0xa8f0ff });
      P.add(176, Crystal, { x: 2.2, y: 1.8 });
      P.add(190, Door, { switches: [[-2.8, 1.0], [0, 2.4], [2.8, 1.0]] });
      P.add(200, Crystal, { x: 0, y: 0.8 });
    },
  },
  {
    name: 'TIDAL ATRIUM', track: 'atrium', speed: 13,
    palette: { fog: 0x06201f, sky: 0x9fffe8, ground: 0x041210, accent: 0x4dffd2, glass: 0xb8fff0, floor: '#062420', line: '#2fe0b8', zenith: 0x010807, nebA: 0x0f6a5a, nebB: 0x7a2a5a, floorTint: 0x020c0b, ripple: 1, shadow: 0x003a30, high: 0xffe0d0 },
    decor: decorPillars,
    layout(P) {
      P.add(18, Crystal, { x: 0, y: 0.6, orbit: { r: 1.4, beats: 2 } });
      P.add(32, Pendulum, { switchAt: [-3.0, 2.4] });
      P.add(44, Crystal, { x: 1.6, y: 1.8 }); P.add(46, Crystal, { x: -1.6, y: -0.4 });
      P.add(58, PowerUp, { x: 0, y: 1.4, kind: 'stasis' });
      P.add(70, GlassFan, { blades: 3, rate: 0.35, tint: 0xb8fff0 });
      P.add(78, GlassFan, { blades: 3, rate: -0.35, tint: 0xffb8e0 });
      P.add(88, Crystal, { x: 0, y: 2.2, big: true });
      P.add(100, Pendulum, { switchAt: [3.0, 2.2], amp: 1.2 });
      P.add(108, GlassPanel, { x: 0, y: 0.6, w: 8.4, h: 5.6, cols: 5, rows: 4, tint: 0xb8fff0 });
      P.add(118, Crystal, { x: -2.2, y: 1 }); P.add(118, Crystal, { x: 2.2, y: 1 });
      P.add(130, Lattice, { cols: 5, rows: 3, tint: 0xffb8e0 });
      P.add(142, GlassPanel, { x: 0, y: 0.2, w: 2.6, h: 2.6, cols: 2, rows: 2, spin: 0.5, tilt: 0.4 });
      P.add(150, Crystal, { x: 0, y: 0.5, orbit: { r: 2.2, beats: 4 } }); P.add(150, Crystal, { x: 0, y: 0.5, orbit: { r: 2.2, beats: 4, phase: Math.PI } });
      P.add(162, Crusher, { switchAt: [-3.0, 2.0] });
      P.add(172, GlassPanel, { x: 0, y: 0.6, w: 8.4, h: 5.6, cols: 6, rows: 4, move: null });
      P.add(184, Crystal, { x: 0, y: 1.0, big: true });
      P.add(196, Door, { switches: [[-3, 2.6], [-1, 1.2], [1, 1.2], [3, 2.6]] });
    },
  },
];

export const CORE_DIST = ROOMS.length * ROOM_LEN + 30;
export function buildFinale(game) { return [{ z: -CORE_DIST, make: () => new CoreLens(game, -CORE_DIST) }]; }

// Returns spawn records {z, make} for one room.
export function roomSpawns(game, index) {
  const room = ROOMS[index];
  const start = index * ROOM_LEN;
  const out = [];
  room.layout({
    add(d, Cls, opts = {}) {
      const z = -(start + d);
      if (Cls === GlassPanel || Cls === Lattice || Cls === GlassFan || Cls === GlassCube) opts.tint ??= room.palette.glass;
      out.push({ z, make: () => new Cls(game, z, opts) });
    },
  });
  return out;
}

// ---------------------------------------------------------------------------
// Decor builders. Each returns { group, update(dt, ctx) }.
// ---------------------------------------------------------------------------
function floorTexture(bg, line, style) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.globalAlpha = 0.8;
  if (style === 'hex') {
    g.lineWidth = 2;
    const r = 32;
    for (let yy = -1; yy < 6; yy++) for (let xx = -1; xx < 6; xx++) {
      const cx = xx * r * 1.5 + 0, cy = yy * r * Math.sqrt(3) + (xx % 2 ? r * Math.sqrt(3) / 2 : 0);
      g.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.stroke();
    }
  } else if (style === 'circle') {
    g.lineWidth = 2;
    for (let r = 20; r < 180; r += 30) { g.beginPath(); g.arc(128, 128, r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke();
  } else if (style === 'water') {
    g.lineWidth = 1.5;
    for (let y = 8; y < 256; y += 16) { g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 20 + y) * 3); g.stroke(); }
  } else {
    g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
    g.lineWidth = 1; g.globalAlpha = 0.25;
    for (let i = 64; i < 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function makeFloor(group, z0, len, pal, style, rep = 4) {
  const tex = floorTexture(pal.floor, pal.line, style);
  tex.repeat.set(30 / rep, len / rep);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(30, len), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.position.set(0, FLOOR_Y + 0.005, z0 - len / 2);
  group.add(m);
  return m;
}

function instanced(geo, mat, mats) {
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// Seeded random so decor is stable between runs.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Sector 1: stark square portals, floating white monoliths.
function decorFrames(z0, len, pal) {
  const group = new THREE.Group();
  makeFloor(group, z0, len, pal, 'grid');
  const bars = [], neon = [];
  for (let d = 0; d < len; d += 10) {
    const z = z0 - d;
    bars.push(M(-5.2, 1.2, z, 0, 0, 0, 0.5, 6.8, 0.5), M(5.2, 1.2, z, 0, 0, 0, 0.5, 6.8, 0.5), M(0, 4.6, z, 0, 0, 0, 10.9, 0.5, 0.5));
    neon.push(M(-4.92, 1.2, z, 0, 0, 0, 0.06, 6.2, 0.06), M(4.92, 1.2, z, 0, 0, 0, 0.06, 6.2, 0.06), M(0, 4.32, z, 0, 0, 0, 9.8, 0.06, 0.06));
  }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  group.add(instanced(unit, new THREE.MeshStandardMaterial({ color: 0x9fb8c2, roughness: 0.6, metalness: 0.1 }), bars));
  group.add(instanced(unit, neonMat(pal.accent, 1.5), neon));
  const r = rng(11), cubes = [];
  for (let i = 0; i < 46; i++) {
    const side = r() < 0.5 ? -1 : 1, s = 0.8 + r() * 3.5;
    cubes.push(M(side * (9 + r() * 16), -1 + r() * 14, z0 - r() * len, r() * 3, r() * 3, r() * 3, s, s * (1 + r() * 3), s));
  }
  group.add(instanced(unit, new THREE.MeshStandardMaterial({ color: 0xcfe6ee, roughness: 0.4, metalness: 0.3, emissive: 0x0f2a33 }), cubes));
  return { group, update() {} };
}

// Sector 2: huge tilted rotating rings and distant planets.
function decorRings(z0, len, pal) {
  const group = new THREE.Group();
  makeFloor(group, z0, len, pal, 'circle', 6);
  const rings = [];
  const geo = new THREE.TorusGeometry(5.8, 0.09, 8, 72);
  for (let d = 4; d < len; d += 14) {
    const ring = new THREE.Mesh(geo, neonMat((d / 14) % 2 < 1 ? pal.accent : 0xff7ad9, 1.8));
    ring.position.set(0, 1.0, z0 - d);
    ring.userData.spin = ((d / 14) % 2 < 1 ? 1 : -1) * 0.25;
    ring.rotation.x = 0.12; group.add(ring); rings.push(ring);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.35, 6, 6), metalMat());
    outer.position.copy(ring.position); outer.rotation.z = d * 0.1; group.add(outer); rings.push(outer);
    outer.userData.spin = -ring.userData.spin * 0.5;
  }
  const r = rng(23), planets = [];
  const sph = new THREE.SphereGeometry(1, 24, 16);
  for (let i = 0; i < 8; i++) {
    const s = 2 + r() * 6;
    const p = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: [0x6b4cff, 0xff7ad9, 0x9ad8ff][i % 3], roughness: 0.7, emissive: [0x1a0f44, 0x3a0f2c, 0x10263a][i % 3] }));
    const side = i % 2 ? 1 : -1;
    p.position.set(side * (16 + r() * 16), 4 + r() * 12, z0 - r() * len);
    p.scale.setScalar(s); group.add(p);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.03, 4, 60), neonMat(0xffffff, 1.2));
    band.rotation.x = 1.2 + r(); p.add(band);
  }
  return { group, update(dt, ctx) { for (const x of rings) x.rotation.z += x.userData.spin * dt * ctx.timeScale; } };
}

// Sector 3: heavy hex frames and pistons thumping on the beat.
function decorHex(z0, len, pal) {
  const group = new THREE.Group();
  makeFloor(group, z0, len, pal, 'hex', 5);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bars = [], lamps = [];
  const R = 6.2, cy = 1.2;
  for (let d = 0; d < len; d += 9) {
    const z = z0 - d;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6, a2 = a + Math.PI / 3;
      const x1 = R * Math.cos(a), y1 = R * Math.sin(a), x2 = R * Math.cos(a2), y2 = R * Math.sin(a2);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + cy, ang = Math.atan2(y2 - y1, x2 - x1), l = Math.hypot(x2 - x1, y2 - y1);
      if (my < FLOOR_Y) continue;
      bars.push(M(mx, my, z, 0, 0, ang, l, 0.7, 0.9));
      lamps.push(M(mx * 0.93, (my - cy) * 0.93 + cy, z + 0.46, 0, 0, ang, l * 0.8, 0.05, 0.05));
    }
  }
  group.add(instanced(unit, metalMat(), bars));
  group.add(instanced(unit, neonMat(0xff6a3d, 2.2), lamps));
  const pistons = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0x3a404c, metalness: 0.8, roughness: 0.45, envMapIntensity: 0.5 }), Math.ceil(len / 6) * 2);
  const base = [];
  for (let d = 3, i = 0; d < len; d += 6) for (const side of [-1, 1]) { base.push({ x: side * 8.5, z: z0 - d, ph: i * 0.37 }); i++; }
  pistons.count = base.length;
  group.add(pistons);
  const mm = new THREE.Matrix4();
  return {
    group,
    update(dt, ctx) {
      const b = ctx.beat;
      base.forEach((p, i) => {
        const y = 1 + Math.pow(Math.abs(Math.sin((b + p.ph) * Math.PI * 0.5)), 6) * 3;
        mm.compose(new THREE.Vector3(p.x, y, p.z), new THREE.Quaternion(), new THREE.Vector3(1.6, 6, 1.6));
        pistons.setMatrixAt(i, mm);
      });
      pistons.instanceMatrix.needsUpdate = true;
    },
  };
}

// Sector 4: towering pillars with floating halos over a rippling floor.
function decorPillars(z0, len, pal) {
  const group = new THREE.Group();
  const floor = makeFloor(group, z0, len, pal, 'water', 3);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const cols = [], halos = [];
  for (let d = 0; d < len; d += 8) for (const side of [-1, 1]) {
    cols.push(M(side * 6.2, 6, z0 - d, 0, 0, 0, 0.9, 16.4, 0.9));
    halos.push({ x: side * 6.2, z: z0 - d, ph: d * 0.2 });
  }
  group.add(instanced(unit, new THREE.MeshStandardMaterial({ color: 0x0f3a36, roughness: 0.35, metalness: 0.6, emissive: 0x03110f }), cols));
  const hgeo = new THREE.TorusGeometry(0.9, 0.05, 6, 32);
  const hm = new THREE.InstancedMesh(hgeo, neonMat(pal.accent, 2), halos.length);
  group.add(hm);
  const arches = [];
  const ageo = new THREE.TorusGeometry(6.2, 0.18, 6, 48, Math.PI);
  for (let d = 16; d < len; d += 32) {
    const a = new THREE.Mesh(ageo, neonMat(0xff7ab8, 1.6)); a.position.set(0, 3.5, z0 - d); group.add(a); arches.push(a);
  }
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  return {
    group,
    update(dt, ctx) {
      halos.forEach((h, i) => {
        mm.compose(new THREE.Vector3(h.x, 3 + ((ctx.time * 0.8 + h.ph) % 10), h.z), q, new THREE.Vector3(1, 1, 1));
        hm.setMatrixAt(i, mm);
      });
      hm.instanceMatrix.needsUpdate = true;
      floor.material.map.offset.y -= dt * 0.05 * ctx.timeScale;
    },
  };
}

// Glowing ring marking each sector boundary.
export function makeGate(z, colA, colB) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.14, 8, 80), neonMat(colA, 2.4));
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(6.1, 0.06, 8, 80), neonMat(colB, 2.4));
  ring.position.y = ring2.position.y = 1.0;
  g.add(ring, ring2);
  const plate = new THREE.Mesh(boxGeo(12, 0.1, 1.2), neonMat(colB, 1.2)); plate.position.y = FLOOR_Y + 0.02; g.add(plate);
  g.position.z = z;
  return g;
}
