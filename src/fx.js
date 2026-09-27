import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

// Pooled glass shards drawn with a single InstancedMesh. They're cheap and short-lived.
export class Shards {
  constructor(scene, envMap, max = 900) {
    this.max = max;
    // A thin irregular triangular prism as the base shard.
    const g = new THREE.BufferGeometry();
    const t = 0.03;
    const v = [
      [0, 0.5, 0], [-0.35, -0.35, 0], [0.45, -0.2, 0],
    ];
    const pos = [];
    const tri = (a, b, c) => pos.push(...a, ...b, ...c);
    const f = v.map((p) => [p[0], p[1], t]), bk = v.map((p) => [p[0], p[1], -t]);
    tri(f[0], f[1], f[2]); tri(bk[0], bk[2], bk[1]);
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; tri(f[i], bk[i], bk[j]); tri(f[i], bk[j], f[j]); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.8,
      envMap, envMapIntensity: 2.4, emissive: 0x6688aa, emissiveIntensity: 0.25, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, _c.set(0xffffff));
    scene.add(this.mesh);

    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), axis: new THREE.Vector3(), rot: 0, spin: 0, size: 1 });
    this.cursor = 0;
    this.floorY = -2.2;
    this._hideAll();
  }

  _hideAll() {
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Burst of shards over a rectangle (a glass cell) around the hit point.
  burst(center, halfW, halfH, color, impactVel, count = 14, sizeScale = 1) {
    _c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const s = this.items[i];
      s.pos.set(center.x + (Math.random() * 2 - 1) * halfW, center.y + (Math.random() * 2 - 1) * halfH, center.z + (Math.random() - 0.5) * 0.1);
      s.vel.set((Math.random() - 0.5) * 5, Math.random() * 3 + 0.5, (Math.random() - 0.5) * 3);
      if (impactVel) s.vel.addScaledVector(impactVel, 0.12 + Math.random() * 0.12);
      s.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      s.rot = Math.random() * 6.28; s.spin = (Math.random() - 0.5) * 20;
      s.size = (0.15 + Math.random() * 0.4) * sizeScale;
      s.max = s.life = 1.1 + Math.random() * 0.9;
      this.mesh.setColorAt(i, _c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    const fy = this.floorY;
    for (let i = 0; i < this.max; i++) {
      const s = this.items[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      s.vel.y -= 14 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < fy) { s.pos.y = fy; s.vel.y *= -0.3; s.vel.x *= 0.6; s.vel.z *= 0.6; s.spin *= 0.5; }
      s.rot += s.spin * dt;
      const k = Math.min(1, s.life / 0.35) * s.size;
      _q.setFromAxisAngle(s.axis, s.rot);
      _s.set(k, k, k);
      _m.compose(s.pos, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() { for (const s of this.items) s.life = 0; this._hideAll(); }
}

// Additive spark particles (impacts, crystal pops, explosions).
export class Sparks {
  constructor(scene, max = 600, size = 0.28) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const tex = makeDotTexture();
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color(), g: 1 });
    this.cursor = 0;
  }
  emit(at, color, count = 20, speed = 6, gravity = 1, life = 0.6) {
    _c.set(color);
    for (let n = 0; n < count; n++) {
      const s = this.items[this.cursor]; this.cursor = (this.cursor + 1) % this.max;
      s.p.copy(at);
      _p.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      s.v.copy(_p);
      s.c.copy(_c); s.g = gravity;
      s.max = s.life = life * (0.5 + Math.random() * 0.5);
    }
  }
  // Single stationary particle (used for ball trails).
  emitAt(at, color, life) {
    const s = this.items[this.cursor]; this.cursor = (this.cursor + 1) % this.max;
    s.p.copy(at); s.v.set(0, 0, 0); s.c.set(color); s.g = 0; s.max = s.life = life;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const s = this.items[i], j = i * 3;
      if (s.life <= 0) { this.col[j] = this.col[j + 1] = this.col[j + 2] = 0; this.pos[j + 1] = -999; continue; }
      s.life -= dt;
      s.v.y -= 9 * s.g * dt;
      s.v.multiplyScalar(1 - 1.5 * dt);
      s.p.addScaledVector(s.v, dt);
      const k = Math.max(0, s.life / s.max);
      this.pos[j] = s.p.x; this.pos[j + 1] = s.p.y; this.pos[j + 2] = s.p.z;
      this.col[j] = s.c.r * k; this.col[j + 1] = s.c.g * k; this.col[j + 2] = s.c.b * k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { for (const s of this.items) s.life = 0; }
}

export function makeDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
