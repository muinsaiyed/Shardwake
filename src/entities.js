import * as THREE from 'three';
import { makeGlassMaterial, glassGeometry } from './look.js';

// ---------------------------------------------------------------------------
// Shared materials / geometry (all procedural)
// ---------------------------------------------------------------------------
export const COLORS = {
  crystal: 0xffb640,
  switchIdle: 0x3dffa8,
  switchOn: 0xe8fff4,
  hazard: 0xff3b4e,
  overdrive: 0xff4fd8,
  nova: 0xb28cff,
  stasis: 0x39e6ff,
};

const cache = new Map();
const _lp = new THREE.Vector3();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

let ENV = null;
export function setEnvMap(env) { ENV = env; }

export function glassMat(tint) {
  return cached('glass' + tint, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.35), transparent: true, opacity: 0.3, roughness: 0.02, metalness: 0.0,
    envMap: ENV, envMapIntensity: 0.35, depthWrite: false, side: THREE.FrontSide,
    emissive: tint, emissiveIntensity: 0.07,
  }));
}
export function glassEdgeMat(tint) {
  return cached('edge' + tint, () => {
    const c = new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.3).multiplyScalar(1.3);
    return new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95, toneMapped: false });
  });
}
export function boxGeo(w, h, d) {
  const k = `box${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
  return cached(k, () => new THREE.BoxGeometry(w, h, d));
}
function edgesGeo(w, h, d) {
  const k = `edg${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
  return cached(k, () => new THREE.EdgesGeometry(boxGeo(w, h, d)));
}
export function metalMat() {
  return cached('metal', () => new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.85, roughness: 0.32, envMap: ENV, envMapIntensity: 1.2 }));
}
export function hazardMat() {
  return cached('hazard', () => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#16181f'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ff3b4e';
    for (let i = -128; i < 256; i += 44) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 20, 0); g.lineTo(i + 20 - 128, 128); g.lineTo(i - 128, 128); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.3, metalness: 0.5, roughness: 0.5, envMap: ENV, envMapIntensity: 0.5 });
  });
}
export function neonMat(color, intensity = 2.5) {
  return cached('neon' + color + '_' + intensity, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }));
}
function glowSprite(color, size) {
  const tex = cached('glowtex', () => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.25, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
  const m = cached('glowmat' + color, () => new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
  const s = new THREE.Sprite(m); s.scale.setScalar(size); return s;
}
function iconTexture(kind) {
  return cached('icon' + kind, () => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'overdrive') { // infinity loop
      g.beginPath();
      for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; const x = 64 + 40 * Math.sin(a), y = 64 + 20 * Math.sin(a) * Math.cos(a); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    } else if (kind === 'nova') { // starburst
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(64 + 14 * Math.cos(a), 64 + 14 * Math.sin(a)); g.lineTo(64 + 44 * Math.cos(a), 64 + 44 * Math.sin(a)); g.stroke(); }
      g.beginPath(); g.arc(64, 64, 12, 0, 7); g.fill();
    } else { // hourglass
      g.beginPath(); g.moveTo(34, 24); g.lineTo(94, 24); g.lineTo(34, 104); g.lineTo(94, 104); g.closePath(); g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}

// ---------------------------------------------------------------------------
// Parts: collision primitives owned by entities
// ---------------------------------------------------------------------------
// kind: 'glass' | 'metal' | 'crystal' | 'switch' | 'power'
function makePart(ent, kind, mesh, opts = {}) {
  const p = {
    ent, kind, mesh, alive: true,
    half: opts.half || null, radius: opts.radius || 0,
    solid: opts.solid ?? (kind === 'glass' || kind === 'metal'),
    novaBreak: opts.novaBreak ?? false,
    inv: new THREE.Matrix4(), quat: new THREE.Quaternion(), wpos: new THREE.Vector3(),
    data: opts.data || {},
  };
  ent.parts.push(p);
  return p;
}

export class Entity {
  constructor(game, z) {
    this.game = game;
    this.z = z;
    this.group = new THREE.Group();
    this.group.position.z = z;
    this.parts = [];
    this.t = 0;
    this.dead = false;
  }
  update(_dt, _ctx) {}
  onHit(_part, _ball, _point) {}
  onCrash(_part) {}
  // Adds a breakable glass cell at local position.
  glassCell(parent, x, y, w, h, d, tint, z = 0) {
    const k = `g${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
    const m = new THREE.Mesh(cached(k, () => glassGeometry(w, h, d)), makeGlassMaterial(tint));
    m.position.set(x, y, z);
    m.renderOrder = 2;
    parent.add(m);
    return makePart(this, 'glass', m, { half: new THREE.Vector3(w / 2, h / 2, d / 2), data: { tint, w, h } });
  }
  metalBox(parent, x, y, w, h, d, opts = {}) {
    const m = new THREE.Mesh(boxGeo(w, h, d), opts.hazard ? hazardMat() : metalMat());
    m.position.set(x, y, opts.z || 0);
    parent.add(m);
    if (opts.trim !== false) { // neon trim lines to read as solid/danger
      const col = opts.trimColor ?? COLORS.hazard;
      const tb = new THREE.Mesh(boxGeo(w + 0.02, 0.06, d + 0.02), neonMat(col));
      tb.position.y = h / 2 - 0.08; m.add(tb);
      const bb = tb.clone(); bb.position.y = -h / 2 + 0.08; m.add(bb);
    }
    return makePart(this, 'metal', m, { half: new THREE.Vector3(w / 2, h / 2, d / 2), novaBreak: opts.novaBreak ?? true });
  }
  breakGlass(part, point, vel) {
    if (!part.alive) return;
    part.alive = false;
    const m = part.mesh;
    const wp = m.getWorldPosition(new THREE.Vector3());
    const { w, h, tint } = part.data;
    const area = w * h;
    this.game.fx.shatter(wp, point || wp, w / 2, h / 2, tint, vel, area);
    m.visible = false;
    if (m.parent) m.parent.remove(m);
  }
  // Break the struck cell plus any neighbouring cells within a small radius of
  // the impact, so hits near a seam crack both sides like real glass would.
  fracture(part, point, vel, radius = 0.4) {
    this.breakGlass(part, point, vel);
    if (!point) return;
    for (const p of this.parts) {
      if (!p.alive || p.kind !== 'glass') continue;
      _lp.copy(point).applyMatrix4(p.inv);
      const h = p.half;
      const dx = Math.max(Math.abs(_lp.x) - h.x, 0), dy = Math.max(Math.abs(_lp.y) - h.y, 0), dz = Math.max(Math.abs(_lp.z) - h.z, 0);
      if (dx * dx + dy * dy + dz * dz < radius * radius) this.breakGlass(p, point, vel);
    }
  }
  removePart(part) {
    part.alive = false;
    part.mesh.visible = false;
  }
}

// --- Glass panel made of a grid of cells ------------------------------------
export class GlassPanel extends Entity {
  constructor(game, z, { x = 0, y = 0.4, w = 2.4, h = 2.4, cols = 1, rows = 1, tint = 0xbfe8ff, depth = 0.12, move = null, spin = 0, tilt = 0 }) {
    super(game, z);
    this.base = new THREE.Vector3(x, y, 0);
    this.pivot = new THREE.Group();
    this.pivot.position.copy(this.base);
    this.pivot.rotation.z = tilt;
    this.group.add(this.pivot);
    const cw = w / cols, ch = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      this.glassCell(this.pivot, -w / 2 + cw * (i + 0.5), -h / 2 + ch * (j + 0.5), cw - 0.02, ch - 0.02, depth, tint);
    }
    this.move = move; this.spin = spin;
  }
  update(dt, ctx) {
    this.t += dt;
    if (this.move) {
      const { axis = 'x', amp = 1, beats = 2, phase = 0 } = this.move;
      const s = Math.sin((ctx.beat / beats) * Math.PI * 2 + phase) * amp;
      this.pivot.position[axis] = this.base[axis] + s;
    }
    if (this.spin) this.pivot.rotation.z += this.spin * dt * ctx.bps;
  }
  onHit(part, ball, point) { this.fracture(part, point, ball.vel); }
  onCrash() { // shatter everything near the player's path
    for (const p of this.parts) if (p.alive && Math.abs(p.wpos.x) < 2 && Math.abs(p.wpos.y) < 2) this.breakGlass(p, null, new THREE.Vector3(0, 0, -8));
  }
}

// --- Rotating fan of glass blades ------------------------------------------
export class GlassFan extends Entity {
  constructor(game, z, { x = 0, y = 0.4, blades = 3, len = 2.6, width = 0.8, tint = 0xc9b8ff, rate = 0.25 }) {
    super(game, z);
    this.hub = new THREE.Group();
    this.hub.position.set(x, y, 0);
    this.group.add(this.hub);
    this.glassCell(this.hub, 0, 0, 0.9, 0.9, 0.2, tint);
    for (let b = 0; b < blades; b++) {
      const arm = new THREE.Group();
      arm.rotation.z = (b / blades) * Math.PI * 2;
      this.hub.add(arm);
      const segs = 2;
      for (let s = 0; s < segs; s++) this.glassCell(arm, 0, 0.55 + (len / segs) * (s + 0.5), width, len / segs - 0.03, 0.12, tint);
    }
    this.rate = rate;
  }
  update(dt, ctx) { this.hub.rotation.z = ctx.beat * this.rate * Math.PI * 2 * 0.5; }
  onHit(part, ball, point) { this.fracture(part, point, ball.vel); }
  onCrash() { for (const p of this.parts) if (p.alive && Math.hypot(p.wpos.x, p.wpos.y) < 1.8) this.breakGlass(p, null, new THREE.Vector3(0, 0, -8)); }
}

// --- Rotating glass cube (tumbling) ----------------------------------------
export class GlassCube extends Entity {
  constructor(game, z, { x = 0, y = 0.3, size = 1.8, tint = 0xbfe8ff }) {
    super(game, z);
    this.pivot = new THREE.Group(); this.pivot.position.set(x, y, 0); this.group.add(this.pivot);
    const s = size / 2;
    for (const [px, py] of [[-s / 2, -s / 2], [s / 2, -s / 2], [-s / 2, s / 2], [s / 2, s / 2]]) this.glassCell(this.pivot, px, py, s - 0.02, s - 0.02, size, tint);
  }
  update(dt, ctx) { this.pivot.rotation.z += dt * 0.9 * ctx.timeScale; this.pivot.rotation.x = Math.sin(ctx.beat * 0.25) * 0.5; }
  onHit(part, ball, point) { this.fracture(part, point, ball.vel); }
  onCrash() { for (const p of this.parts) this.breakGlass(p, null, new THREE.Vector3(0, 0, -8)); }
}

// --- Metal lattice with glass windows --------------------------------------
export class Lattice extends Entity {
  // Full-width frame: metal bars on a grid, glass fills every opening.
  constructor(game, z, { cols = 3, rows = 3, width = 8, height = 5.6, y0 = -2.2, tint = 0xbfe8ff, openCenter = false }) {
    super(game, z);
    const cw = width / cols, ch = height / rows, bar = 0.28;
    // Bars that would cross the rail line are omitted, so only glass ever blocks the path.
    for (let i = 0; i <= cols; i++) {
      const bx = -width / 2 + i * cw;
      if (Math.abs(bx) > 0.75) this.metalBox(this.group, bx, y0 + height / 2, bar, height, 0.35, { trimColor: 0x6a7a99, novaBreak: false });
    }
    for (let j = 0; j <= rows; j++) {
      const by = y0 + j * ch;
      if (Math.abs(by) > 0.75) this.metalBox(this.group, 0, by, width, bar, 0.35, { trimColor: 0x6a7a99, novaBreak: false });
    }
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = -width / 2 + cw * (i + 0.5), cy = y0 + ch * (j + 0.5);
      if (openCenter && Math.abs(cx) < 0.1 && Math.abs(cy) < ch / 2) continue;
      this.glassCell(this.group, cx, cy, cw - bar, ch - bar, 0.1, tint);
    }
  }
  onHit(part, ball, point) { if (part.kind === 'glass') this.fracture(part, point, ball.vel); }
  onCrash(part) {
    for (const p of this.parts) if (p.kind === 'glass' && p.alive && Math.abs(p.wpos.x) < 2 && Math.abs(p.wpos.y) < 2) this.breakGlass(p, null, new THREE.Vector3(0, 0, -8));
    if (part.kind === 'metal') part.solid = false; // don't double-penalize on the same bar
  }
}

// --- Ammo crystal -----------------------------------------------------------
export class Crystal extends Entity {
  constructor(game, z, { x = 0, y = 0.5, big = false, orbit = null }) {
    super(game, z);
    const r = big ? 0.55 : 0.38;
    const geo = cached('crystalGeo' + big, () => { const g = new THREE.OctahedronGeometry(r, 0); g.scale(1, 1.55, 1); return g; });
    const mat = cached('crystalMat', () => new THREE.MeshStandardMaterial({ color: 0xffc766, emissive: 0xff9a1f, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.08, flatShading: true, envMap: ENV, envMapIntensity: 2.2, transparent: true, opacity: 0.82 }));
    const coreGeo = cached('crystalCore' + big, () => { const g = new THREE.OctahedronGeometry(r * 0.45, 0); g.scale(1, 1.55, 1); return g; });
    this.body = new THREE.Mesh(geo, mat);
    this.core = new THREE.Mesh(coreGeo, neonMat(0xffb040, 1.6));
    const edges = new THREE.LineSegments(cached('crystalEdges' + big, () => new THREE.EdgesGeometry(geo)), cached('crystalEdgeMat', () => new THREE.LineBasicMaterial({ color: new THREE.Color(0xffc56a).multiplyScalar(1.3), toneMapped: false, transparent: true, opacity: 0.9 })));
    this.body.add(edges);
    this.holder = new THREE.Group();
    this.holder.position.set(x, y, 0);
    this.holder.add(this.body, this.core);
    const halo = new THREE.Mesh(cached('crystalHalo', () => new THREE.TorusGeometry(1, 0.012, 4, 48)), neonMat(COLORS.crystal, 2));
    halo.scale.setScalar(big ? 0 : r * 1.9); halo.rotation.x = Math.PI / 2.6; this.holder.add(halo); this.halo = halo;
    this.glowSize = big ? 3.2 : 2.2;
    this.glow = glowSprite(COLORS.crystal, this.glowSize);
    this.holder.add(this.glow);
    if (big) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 6, 40), neonMat(COLORS.crystal, 2));
      this.holder.add(ring); this.ring = ring;
    }
    this.group.add(this.holder);
    this.base = new THREE.Vector3(x, y, 0);
    this.orbit = orbit;
    this.big = big;
    this.value = big ? 5 : 3;
    this.part = makePart(this, 'crystal', this.holder, { radius: r * 1.9, solid: false });
    this.missed = false;
  }
  update(dt, ctx) {
    this.t += dt;
    this.body.rotation.y += dt * 2.2; this.core.rotation.y -= dt * 3.1;
    if (this.halo) this.halo.rotation.z += dt * 1.7;
    if (this.ring) this.ring.rotation.y += dt * 1.3;
    let px = this.base.x, py = this.base.y + Math.sin(this.t * 2.4 + this.z) * 0.12;
    if (this.orbit) {
      const a = (ctx.beat / this.orbit.beats) * Math.PI * 2 + (this.orbit.phase || 0);
      px += Math.cos(a) * this.orbit.r; py += Math.sin(a) * this.orbit.r;
    }
    this.holder.position.set(px, py, 0);
    // Shrink the halo as it nears the camera so close passes don't flood the screen.
    const near = Math.max(0.25, Math.min(1, (ctx.camZ - this.z - 2) / 8));
    this.glow.scale.setScalar(this.glowSize * near);
  }
  onHit(part) {
    if (!part.alive) return;
    part.alive = false;
    const wp = this.holder.getWorldPosition(new THREE.Vector3());
    this.holder.visible = false;
    this.game.collectCrystal(this, wp);
  }
}

// --- Switch (shoot to activate) ---------------------------------------------
function makeSwitchMesh() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(cached('swBase', () => new THREE.CylinderGeometry(0.62, 0.62, 0.18, 32).rotateX(Math.PI / 2)), metalMat());
  const btn = new THREE.Mesh(cached('swBtn', () => new THREE.CylinderGeometry(0.42, 0.42, 0.2, 32).rotateX(Math.PI / 2)),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.switchIdle).multiplyScalar(1.8), toneMapped: false }));
  btn.position.z = 0.1;
  const ring = new THREE.Mesh(cached('swRing', () => new THREE.TorusGeometry(0.72, 0.045, 8, 40)), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.switchIdle).multiplyScalar(2), toneMapped: false, transparent: true }));
  g.add(base, btn, ring);
  const glow = glowSprite(COLORS.switchIdle, 2.4); glow.position.z = 0.2; g.add(glow);
  return { g, btn, ring, glow };
}
function addSwitch(ent, parent, x, y, z = 0.3) {
  const s = makeSwitchMesh();
  s.g.position.set(x, y, z);
  parent.add(s.g);
  const part = makePart(ent, 'switch', s.g, { radius: 0.85, solid: false });
  part.data = { ...s, on: false };
  return part;
}
function pressSwitch(part) {
  if (part.data.on) return false;
  part.data.on = true;
  part.data.btn.material.color.set(COLORS.switchOn).multiplyScalar(1.5);
  part.data.btn.position.z = 0.02;
  part.data.ring.material.opacity = 0.25;
  part.data.glow.visible = false;
  part.alive = false;
  return true;
}
function pulseSwitches(parts, t) {
  for (const p of parts) if (p.kind === 'switch' && !p.data.on) {
    const k = 1 + Math.sin(t * 8) * 0.12;
    p.data.ring.scale.setScalar(k);
  }
}

// --- Door operated by one or more switches ---------------------------------
export class Door extends Entity {
  constructor(game, z, { switches = [[0, 2.0]], width = 8.6, height = 6.2, y0 = -2.2 }) {
    super(game, z);
    this.leftG = new THREE.Group(); this.rightG = new THREE.Group();
    this.group.add(this.leftG, this.rightG);
    const hw = width / 2;
    this.left = this.metalBox(this.leftG, -hw / 2, y0 + height / 2, hw, height, 0.4, { hazard: true, novaBreak: false });
    this.right = this.metalBox(this.rightG, hw / 2, y0 + height / 2, hw, height, 0.4, { hazard: true, novaBreak: false });
    // frame
    const fm = neonMat(COLORS.hazard, 1.6);
    const frame = new THREE.Mesh(boxGeo(width + 0.4, 0.15, 0.5), fm); frame.position.set(0, y0 + height + 0.1, 0); this.group.add(frame);
    this.switches = switches.map(([x, y]) => addSwitch(this, this.group, x, y, 0.35));
    this.open = 0; this.opening = false;
  }
  update(dt, ctx) {
    this.t += dt;
    pulseSwitches(this.parts, this.t);
    if (this.opening && this.open < 1) {
      this.open = Math.min(1, this.open + dt * 1.8 * ctx.timeScale);
      const e = 1 - Math.pow(1 - this.open, 3);
      this.leftG.position.x = -e * 4.6; this.rightG.position.x = e * 4.6;
      for (const s of this.switches) s.mesh.position.x = s.mesh.userData.x0 + Math.sign(s.mesh.userData.x0 || 1) * e * 4.6;
    }
  }
  startOpen() {
    if (this.opening) return;
    this.opening = true;
    for (const s of this.switches) { s.mesh.userData.x0 = s.mesh.position.x; if (!s.data.on) pressSwitch(s); }
    this.game.audio.door();
  }
  onHit(part, ball) {
    if (part.kind === 'switch') {
      if (pressSwitch(part)) {
        this.game.onSwitch(part);
        if (this.switches.every((s) => s.data.on)) this.startOpen();
      }
    } else if (part.kind === 'metal' && ball.nova) this.startOpen();
  }
  onCrash() { this.left.solid = this.right.solid = false; this.startOpen(); }
}

// --- Crusher: metal block pumping through the path; switch parks it ---------
export class Crusher extends Entity {
  constructor(game, z, { switchAt = [3.0, 2.2], size = 2.6 }) {
    super(game, z);
    this.block = new THREE.Group(); this.group.add(this.block);
    this.blockPart = this.metalBox(this.block, 0, 0, size, size, 1.2, { hazard: true });
    // guide rails
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(boxGeo(0.18, 7, 0.18), metalMat()); rail.position.set(sx * (size / 2 + 0.2), 1.3, 0); this.group.add(rail);
      const lamp = new THREE.Mesh(boxGeo(0.06, 6.8, 0.06), neonMat(COLORS.hazard, 2)); lamp.position.set(sx * (size / 2 + 0.2), 1.3, 0.12); this.group.add(lamp); (this.lamps ||= []).push(lamp);
    }
    const post = new THREE.Mesh(boxGeo(0.4, 6, 0.4), metalMat()); post.position.set(switchAt[0], switchAt[1] - 3.3, 0); this.group.add(post);
    this.sw = addSwitch(this, this.group, switchAt[0], switchAt[1], 0.3);
    this.parked = false; this.y = 0; this.size = size;
  }
  update(dt, ctx) {
    this.t += dt;
    pulseSwitches(this.parts, this.t);
    if (this.parked || !this.blockPart.alive) {
      this.y += (3.9 - this.y) * Math.min(1, dt * 6);
    } else {
      // Keyed to arrival: the block is centered on the path exactly when the player arrives.
      const tau = Math.max(0, (ctx.camZ - this.z) / ctx.baseSpeed);
      const w = Math.PI * ctx.bps * 0.5;
      this.y = 3.6 * Math.abs(Math.sin(w * tau));
    }
    this.block.position.y = this.y;
  }
  park() {
    if (this.parked) return;
    this.parked = true;
    if (this.sw.alive) pressSwitch(this.sw);
    for (const l of this.lamps) l.material = neonMat(COLORS.switchIdle, 2);
    this.game.audio.door();
  }
  onHit(part, ball) {
    if (part.kind === 'switch') { if (pressSwitch(part)) { this.game.onSwitch(part); this.parked = false; this.park(); } }
    else if (part === this.blockPart && ball.nova) { this.game.fx.metalBurst(this.blockPart.wpos); this.removePart(part); this.park(); }
  }
  onCrash(part) { part.solid = false; this.park(); }
}

// --- Pendulum: swinging metal slab; switch locks it aside -------------------
export class Pendulum extends Entity {
  constructor(game, z, { switchAt = [-3.0, 2.4], len = 5.2, amp = 1.1 }) {
    super(game, z);
    this.pivot = new THREE.Group(); this.pivot.position.set(0, len, 0); this.group.add(this.pivot);
    const arm = new THREE.Mesh(boxGeo(0.14, len - 0.8, 0.14), metalMat()); arm.position.y = -(len - 0.8) / 2; this.pivot.add(arm);
    const bobG = new THREE.Group(); bobG.position.y = -len; this.pivot.add(bobG);
    this.bob = this.metalBox(bobG, 0, 0, 2.2, 1.6, 1.0, { hazard: true });
    const cap = new THREE.Mesh(boxGeo(0.8, 0.3, 0.8), metalMat()); cap.position.y = 0.2; this.pivot.add(cap);
    const post = new THREE.Mesh(boxGeo(0.4, 6, 0.4), metalMat()); post.position.set(switchAt[0], switchAt[1] - 3.3, 0); this.group.add(post);
    this.sw = addSwitch(this, this.group, switchAt[0], switchAt[1], 0.3);
    this.amp = amp; this.locked = false; this.theta = 0;
  }
  update(dt, ctx) {
    this.t += dt;
    pulseSwitches(this.parts, this.t);
    if (this.locked || !this.bob.alive) this.theta += (1.45 - this.theta) * Math.min(1, dt * 4);
    else {
      const tau = Math.max(0, (ctx.camZ - this.z) / ctx.baseSpeed);
      this.theta = this.amp * Math.sin(Math.PI * ctx.bps * 0.5 * tau);
    }
    this.pivot.rotation.z = this.theta;
  }
  onHit(part, ball) {
    if (part.kind === 'switch') { if (pressSwitch(part)) { this.game.onSwitch(part); this.locked = true; this.game.audio.door(); } }
    else if (part === this.bob && ball.nova) { this.game.fx.metalBurst(this.bob.wpos); this.removePart(part); this.locked = true; }
  }
  onCrash(part) { part.solid = false; this.locked = true; }
}

// --- Power-up capsule ---------------------------------------------------------
export class PowerUp extends Entity {
  constructor(game, z, { x = 0, y = 1.2, kind = 'overdrive' }) {
    super(game, z);
    this.kind = kind;
    const col = COLORS[kind];
    this.holder = new THREE.Group(); this.holder.position.set(x, y, 0); this.group.add(this.holder);
    const cage = new THREE.LineSegments(cached('pwCage', () => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.62, 0))), new THREE.LineBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2), toneMapped: false }));
    const core = new THREE.Mesh(cached('pwCore', () => new THREE.IcosahedronGeometry(0.4, 1)), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.2 }));
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind), color: 0xffffff, transparent: true, depthTest: false }));
    icon.scale.setScalar(0.6); icon.renderOrder = 5;
    this.holder.add(core, cage, icon, glowSprite(col, 3.4));
    this.cage = cage; this.core = core; this.base = new THREE.Vector3(x, y, 0);
    this.part = makePart(this, 'power', this.holder, { radius: 1.0, solid: false });
  }
  update(dt) {
    this.t += dt;
    this.cage.rotation.x += dt * 1.1; this.cage.rotation.y += dt * 1.7;
    this.holder.position.y = this.base.y + Math.sin(this.t * 3) * 0.15;
  }
  onHit(part) {
    if (!part.alive) return;
    part.alive = false; this.holder.visible = false;
    this.game.collectPower(this.kind, this.holder.getWorldPosition(new THREE.Vector3()));
  }
}

// --- Finish: the Core Lens ----------------------------------------------------
export class CoreLens extends Entity {
  constructor(game, z) {
    super(game, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.18, 12, 90), neonMat(0xfff1c8, 3));
    ring.position.y = 0.6; this.group.add(ring); this.ring = ring;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.05, 8, 90), neonMat(COLORS.crystal, 3));
    ring2.position.y = 0.6; this.group.add(ring2); this.ring2 = ring2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.3, 64), new THREE.MeshBasicMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    disc.position.y = 0.6; this.group.add(disc);
    const g = glowSprite(0xffe0a0, 9); g.position.y = 0.6; this.group.add(g);
  }
  update(dt) { this.ring.rotation.z += dt * 0.3; this.ring2.rotation.z -= dt * 0.7; this.ring2.rotation.x = Math.sin(this.ring.rotation.z) * 0.3; }
}
