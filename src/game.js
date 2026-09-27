import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SHARED, Sky, MirrorFloor, FinishShader, Dust, Rings } from './look.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Shards, Sparks, makeDotTexture } from './fx.js';
import { setEnvMap, COLORS } from './entities.js';
import { ROOMS, ROOM_LEN, FLOOR_Y, CORE_DIST, roomSpawns, buildFinale, makeGate } from './rooms.js';
import { TRACKS } from './audio.js';

// ---- Tuning ---------------------------------------------------------------
export const START_AMMO = 25;
const CRASH_COST = 10;
const STREAK_PER_TIER = 5;       // consecutive crystals per extra ball (original reportedly uses 10)
const MAX_MULTI = 5;
const THROW_SPEED = 44;          // m/s
const GRAVITY = 9.8;
const BALL_R = 0.2;
const PLAYER_R = 0.42;
const POWER_DUR = { overdrive: 6, nova: 8, stasis: 6 };
const POWER_NAME = { overdrive: 'OVERDRIVE', nova: 'NOVA ROUNDS', stasis: 'STASIS' };
const SPAWN_AHEAD = 140;
const MULTI_PATTERN = [[0, 0], [-1, 0], [1, 0], [0, 1], [0, -1]];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

export class Game {
  constructor(canvas, audio, ui) {
    this.canvas = canvas; this.audio = audio; this.ui = ui;
    this.state = 'title';
    const qs = new URLSearchParams(location.search);
    this.bot = qs.has('bot');
    this.ff = Math.max(1, Math.min(8, Number(qs.get('ff')) || 1)); // debug fast-forward

    // Renderer
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.pixelRatio = Math.min(devicePixelRatio, this.mobile ? 1.5 : 2);
    r.setPixelRatio(this.pixelRatio);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 150);
    this.scene.add(this.camera);
    const pmrem = new THREE.PMREMGenerator(r);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    setEnvMap(this.env);

    this.fog = new THREE.Fog(0x000000, 22, 115);
    this.scene.fog = this.fog;
    this.sky = new Sky(this.scene);
    this.mirror = new MirrorFloor(this.scene, FLOOR_Y, this.mobile ? 0.35 : 0.5);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x111111, 1.2);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(3, 8, 4); this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
    this.headLight = new THREE.PointLight(0xffffff, 18, 30, 1.6); this.camera.add(this.headLight); this.headLight.position.set(0, 1.5, -4);
    this.flashLight = new THREE.PointLight(0xffffff, 0, 10, 2); this.scene.add(this.flashLight);

    // Post-processing
    // MSAA render target so the post chain keeps clean edges.
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: this.mobile ? 2 : 4 }));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.42, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);
    this.fin = this.finish.uniforms;
    this.aberrKick = 0; this.flashAmt = 0;
    this.quality = 3; // 3 = full, 2 = no mirror, 1 = no bloom, 0 = low res

    // FX
    this.shards = new Shards(this.scene, this.env);
    this.shards.floorY = FLOOR_Y;
    this.sparks = new Sparks(this.scene);
    this.trail = new Sparks(this.scene, 900, 0.14);
    this.dust = new Dust(this.scene, makeDotTexture(), this.mobile ? 280 : 520);
    this.rings = new Rings(this.scene);
    this.fx = {
      shatter: (wp, point, hw, hh, tint, vel, area) => this._shatter(wp, point, hw, hh, tint, vel, area),
      metalBurst: (p) => this._metalBurst(p),
    };
    this.shock = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xd9c8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.shock); this.shockT = 1;

    // Balls
    this.ballGeo = new THREE.SphereGeometry(BALL_R, 20, 14);
    this.ballMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.12, envMap: this.env, envMapIntensity: 1.6 });
    this.novaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.nova).multiplyScalar(2.5), toneMapped: false });
    this.balls = []; this.ballPool = [];

    this.entities = []; this.pending = []; this.decor = new Map();
    this.pointer = { down: false, x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.time = 0; this.beat = 0;
    this.shake = 0; this.fovKick = 0; this.invuln = 0; this.power = null; this.speed = 4;
    this.fpsAcc = 0; this.fpsFrames = 0; this.lowFpsStreak = 0;

    this.progress = loadProgress();
    this._bindInput();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.setupTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    window.__game = this; // debug / automated playtest hook
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.fin.uRes.value.set(w, h);
    this.mirror.resize();
    this.camera.aspect = w / h;
    // Keep horizontal field of view reasonable on tall phones.
    this.camera.fov = w / h < 0.8 ? 88 : 72;
    this.baseFov = this.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- setup
  clearWorld() {
    for (const e of this.entities) this.scene.remove(e.group);
    this.entities = []; this.pending = [];
    for (const d of this.decor.values()) this.scene.remove(d.group);
    this.decor.clear();
    for (const b of this.balls) { b.mesh.visible = false; this.ballPool.push(b); }
    this.balls = [];
    this.shards.clear(); this.sparks.clear(); this.trail.clear();
  }

  setupTitle() {
    this.clearWorld();
    this.state = 'title';
    this.dist = 0; this.roomIndex = 0; this.speed = 4; this.timeScale = 1;
    this._ensureDecor(0);
    this._applyPalette(ROOMS[0].palette, ROOMS[0].palette, 0);
    this._titleSpawns();
    this.audio.play('title');
  }

  _titleSpawns() {
    for (const e of this.entities) this.scene.remove(e.group);
    this.entities = [];
    this.pending = roomSpawns(this, 0).filter((r) => r.z > -150).sort((a, b) => b.z - a.z);
  }

  start(fromRoom = 0) {
    this.clearWorld();
    this.state = 'playing';
    this.victory = false;
    this.startRoom = fromRoom;
    this.dist = fromRoom * ROOM_LEN;
    this.roomIndex = -1;
    this.speed = ROOMS[fromRoom].speed;
    this.ammo = START_AMMO;
    this.multi = 1; this.streak = 0;
    this.power = null; this.timeScale = 1;
    this.invuln = 0; this.shake = 0; this.fireCd = 0; this.dyingT = 0;
    this.stats = { throws: 0, throwHits: 0, hits: 0, glass: 0, crystals: 0, crystalsMissed: 0, crashes: 0, switches: 0, bestMulti: 1, time: 0, powerups: 0 };
    for (let i = fromRoom; i < ROOMS.length; i++) this.pending.push(...roomSpawns(this, i));
    this.pending.push(...buildFinale(this));
    this.pending.sort((a, b) => b.z - a.z);
    this.audio.muffle(0);
    this._enterRoom(fromRoom, true);
    this._syncHud(true);
  }

  _enterRoom(i, immediate = false) {
    if (i === this.roomIndex || i >= ROOMS.length) return;
    this.roomIndex = i;
    const room = ROOMS[i];
    this.audio.play(room.track, immediate);
    this.bps = TRACKS[room.track].bpm / 60;
    if (this.state === 'playing') {
      this.ui.sector(i, room.name);
      if (i > 0) { this.audio.sectorEnter(); this.fin.uFlash.value.set(room.palette.accent).lerp(new THREE.Color(0xffffff), 0.5); this.flashAmt = 0.8; this.aberrKick = 0.8; this.fovKick = 1.4; }
      if (i > (this.progress.unlocked || 0)) { this.progress.unlocked = i; saveProgress(this.progress); }
    }
  }

  _ensureDecor(i) {
    if (i < 0 || i >= ROOMS.length || this.decor.has(i)) return;
    const room = ROOMS[i];
    const last = i === ROOMS.length - 1;
    const len = ROOM_LEN + (last ? 70 : 0);
    const d = room.decor(-i * ROOM_LEN, len, room.palette);
    if (!last) d.group.add(makeGate(-(i + 1) * ROOM_LEN, room.palette.accent, ROOMS[i + 1].palette.accent));
    this.scene.add(d.group);
    this.decor.set(i, d);
  }

  // ---------------------------------------------------------------- input
  _bindInput() {
    const c = this.canvas;
    const ndc = (e) => ({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 });
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.audio.init();
      const p = ndc(e);
      this.pointer.down = true; this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.id = e.pointerId;
      if (this.state === 'playing') this.fire(p.x, p.y);
    });
    c.addEventListener('pointermove', (e) => { if (e.pointerId === this.pointer.id || !this.pointer.down) { const p = ndc(e); this.pointer.x = p.x; this.pointer.y = p.y; } });
    const up = (e) => { if (e.pointerId === this.pointer.id) this.pointer.down = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.ui.pause(); });
  }

  // ---------------------------------------------------------------- shooting
  fire(nx, ny) {
    const infinite = this.power?.kind === 'overdrive';
    if (!infinite && this.ammo <= 0) return;
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const ray = this.raycaster.ray;
    const hit = this._rayCast(ray.origin, ray.direction, 90);
    const target = _v.copy(ray.origin).addScaledVector(ray.direction, hit ?? 45);
    const cam = this.camera;
    const right = _v2.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const upv = _v3.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const spawn = _a.copy(cam.position).addScaledVector(ray.direction, 0.9).addScaledVector(upv, -0.3);
    const n = this.multi;
    const rec = { hit: false };
    const spread = 0.38;
    for (let k = 0; k < n; k++) {
      const [ox, oy] = MULTI_PATTERN[k];
      const tgt = _b.copy(target).addScaledVector(right, ox * spread).addScaledVector(upv, oy * spread);
      const disp = tgt.sub(spawn);
      const T = Math.max(0.05, disp.length() / THROW_SPEED);
      const vel = disp.divideScalar(T); vel.y += 0.5 * GRAVITY * T;
      const s = spawn.clone().addScaledVector(right, ox * 0.12).addScaledVector(upv, oy * 0.12);
      this._spawnBall(s, vel.clone(), rec);
    }
    if (!infinite) this.ammo--;
    this.stats.throws++;
    this.audio.throw(nx * 0.5);
    this._syncHud();
  }

  _spawnBall(pos, vel, rec) {
    let b = this.ballPool.pop();
    if (!b) { b = { mesh: new THREE.Mesh(this.ballGeo, this.ballMat), pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3() }; this.scene.add(b.mesh); }
    b.pos.copy(pos); b.vel.copy(vel); b.life = 0; b.rec = rec;
    b.nova = this.power?.kind === 'nova';
    b.mesh.material = b.nova ? this.novaMat : this.ballMat;
    b.mesh.visible = true; b.mesh.position.copy(pos);
    this.balls.push(b);
  }

  // Analytic ray cast against the same colliders the physics uses (for aiming).
  _rayCast(origin, dir, maxT) {
    let best = null;
    _a.copy(origin); _b.copy(origin).addScaledVector(dir, maxT);
    for (const e of this.entities) {
      if (!e.near) continue;
      for (const p of e.parts) {
        if (!p.alive || p.wpos.z > origin.z) continue;
        const h = p.half ? segBox(_a, _b, p, 0) : segSphere(_a, _b, p.wpos, p.radius * 0.8);
        if (h && (best === null || h.t < best)) best = h.t;
      }
    }
    return best === null ? null : best * maxT;
  }

  // ---------------------------------------------------------------- rules
  collectCrystal(ent, wp) {
    this.ammo += ent.value;
    this.stats.crystals++; this.stats.hits++;
    this.streak++;
    this.sparks.emit(wp, COLORS.crystal, 34, 7, 0.4, 0.8);
    this.rings.spawn(wp, COLORS.crystal, ent.big ? 2.8 : 2, this.camera);
    this.audio.crystal(Math.min(this.streak, 12), wp.x / 5);
    if (this.streak % STREAK_PER_TIER === 0 && this.multi < MAX_MULTI) {
      this.multi++;
      this.stats.bestMulti = Math.max(this.stats.bestMulti, this.multi);
      this.audio.streakUp(this.multi);
      this.ui.toast(`${this.multi}× THROW`, '#ffb640');
      this.fovKick = 1;
      this.aberrKick = 0.5;
    }
    this.ui.gain(ent.value);
    this._flash(wp, COLORS.crystal, 4);
    this._syncHud();
  }

  breakStreak(reason) {
    const had = this.streak > 0 || this.multi > 1;
    this.streak = 0; this.multi = 1;
    if (had) { this.audio.streakBreak(); this.ui.streakBroken(reason); }
    this._syncHud();
  }

  onSwitch(part) {
    this.stats.switches++; this.stats.hits++;
    this.audio.switchOn(part.wpos.x / 5);
    this.sparks.emit(part.wpos, COLORS.switchIdle, 30, 5, 0.3, 0.6);
    this.rings.spawn(part.wpos, COLORS.switchIdle, 2.2, this.camera);
    this._flash(part.wpos, COLORS.switchIdle, 4);
  }

  collectPower(kind, wp) {
    this.power = { kind, t: POWER_DUR[kind], dur: POWER_DUR[kind] };
    this.stats.powerups++; this.stats.hits++;
    this.audio.powerup(kind);
    this.sparks.emit(wp, COLORS[kind], 60, 8, 0.2, 0.9);
    this.rings.spawn(wp, COLORS[kind], 3.5, this.camera);
    this.fin.uFlash.value.set(COLORS[kind]); this.flashAmt = 0.35; this.aberrKick = 0.4;
    this.ui.toast(POWER_NAME[kind], '#' + new THREE.Color(COLORS[kind]).getHexString());
    this.audio.muffle(kind === 'stasis' ? 0.55 : 0);
    this._syncHud(true);
  }

  crash(part) {
    this.invuln = 0.6;
    this.ammo = Math.max(0, this.ammo - CRASH_COST);
    this.stats.crashes++;
    this.shake = 0.6;
    this.aberrKick = 1;
    this.fin.uFlash.value.set(0xff2040); this.flashAmt = 0.25;
    this.audio.crash();
    this.ui.hurt();
    part.ent.onCrash(part);
    this.sparks.emit(_v.set(0, 0, this.camera.position.z - 1), 0xff6070, 40, 7, 0.5, 0.5);
    this.breakStreak('crash');
    this.ui.toast(`−${CRASH_COST}`, '#ff3b4e');
    if (this.ammo <= 0) this.gameOver();
  }

  gameOver() {
    if (this.state !== 'playing') return;
    this.state = 'dying'; this.dyingT = 1.3;
    this.audio.gameOver(); this.audio.muffle(0.85, 0.6);
  }

  _finish(victory) {
    this.state = 'results';
    this.victory = victory;
    const dist = Math.floor(this.dist);
    const best = Math.max(this.progress.best || 0, dist);
    const newBest = dist > (this.progress.best || 0);
    this.progress.best = best; saveProgress(this.progress);
    if (victory) { this.audio.victory(); this.audio.play('core'); this.audio.muffle(0); }
    else this.audio.play('title');
    this.ui.results({ victory, dist, best, newBest, stats: this.stats, room: this.roomIndex, ammo: this.ammo });
  }

  // ---------------------------------------------------------------- FX helpers
  _shatter(wp, point, hw, hh, tint, vel, area) {
    this.stats && this.stats.glass++;
    const count = Math.max(8, Math.min(34, Math.round(6 + area * 5)));
    this.shards.burst(wp, hw, hh, tint, vel, count, Math.min(1.4, 0.6 + Math.sqrt(area) * 0.3));
    this.sparks.emit(point, 0xe8f6ff, 14, 6, 0.6, 0.45);
    this.rings.spawn(point, tint, 0.9 + Math.min(1.2, area * 0.3), this.camera);
    this.audio.glass(Math.max(0.4, Math.min(1.4, area / 3)), wp.x / 5);
    this._flash(point, tint, 2.5);
  }
  _metalBurst(p) {
    this.sparks.emit(p, 0xffa060, 50, 9, 1, 0.8);
    this.shards.burst(p, 1, 1, 0x3a404c, new THREE.Vector3(0, 2, -4), 24, 1.2);
    this.audio.explode(p.x / 5);
  }
  _flash(p, color, intensity) {
    this.flashLight.position.copy(p);
    this.flashLight.color.set(color);
    this.flashLight.intensity = Math.min(10, this.flashLight.intensity + intensity);
  }
  _explode(point) {
    const R = 2.9;
    this.shock.position.copy(point); this.shockT = 0;
    this.sparks.emit(point, COLORS.nova, 70, 11, 0.4, 0.8);
    this.sparks.emit(point, 0xffffff, 30, 6, 0.4, 0.5);
    this.audio.explode(point.x / 5);
    this._flash(point, COLORS.nova, 10);
    const fake = { nova: true, vel: new THREE.Vector3(0, 0, -10) };
    for (const e of this.entities) {
      if (!e.near) continue;
      for (const p of e.parts) {
        if (!p.alive) continue;
        const reach = p.half ? Math.max(p.half.x, p.half.y) * 0.6 : p.radius;
        if (p.wpos.distanceTo(point) < R + reach) {
          if (p.kind === 'glass') { e.onHit(p, fake, p.wpos); this.stats.hits++; }
          else if (p.kind === 'metal') { if (p.novaBreak || e.startOpen) e.onHit(p, fake, point); }
          else e.onHit(p, fake, point);
        }
      }
    }
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    if (this.state !== 'paused') for (let k = 0; k < this.ff && this.state !== 'paused'; k++) this.update(dt);
    this.renderer.info.reset();
    this.composer.render();
    this._autoQuality(dt);
  }

  _autoQuality(dt) {
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc < 2) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fps = fps;
    this.fpsAcc = 0; this.fpsFrames = 0;
    if (fps < 42 && this.state === 'playing') {
      if (++this.lowFpsStreak >= 2) {
        this.lowFpsStreak = 0;
        if (this.quality === 3) { this.quality = 2; this.mirror.setEnabled(false); }
        else if (this.quality === 2) { this.quality = 1; this.bloom.enabled = false; }
        else if (this.quality === 1 && this.pixelRatio > 1) { this.quality = 0; this.pixelRatio = 1; this.renderer.setPixelRatio(1); this.resize(); }
      }
    } else this.lowFpsStreak = 0;
  }

  update(dt) {
    this.time += dt;
    const playing = this.state === 'playing' || this.state === 'dying';

    // Time scale: stasis power-up and the post-death slow-mo.
    let ts = this.power?.kind === 'stasis' ? 0.45 : 1;
    if (this.state === 'dying') ts = 0.25;
    this.timeScale += (ts - this.timeScale) * Math.min(1, dt * 6);
    const gdt = dt * this.timeScale;

    if (this.state === 'title') {
      this.dist += 3.2 * dt;
      if (this.dist > 140) { this.dist = 0; this._titleSpawns(); }
      this.bps = TRACKS.title.bpm / 60;
    } else {
      const room = ROOMS[Math.min(this.roomIndex, ROOMS.length - 1)];
      this.speed += (room.speed - this.speed) * Math.min(1, dt * 0.8);
      if (this.state !== 'results') this.dist += this.speed * gdt;
      else if (this.victory) this.dist += (CORE_DIST - 9 - this.dist) * Math.min(1, dt * 0.5);
      const ri = Math.min(ROOMS.length - 1, Math.floor(this.dist / ROOM_LEN));
      if (ri !== this.roomIndex && playing) this._enterRoom(ri);
    }
    this.beat += gdt * (this.bps || 1.6);
    const camZ = -this.dist;

    // Decor streaming + palette blend.
    const ri = Math.min(ROOMS.length - 1, Math.floor(this.dist / ROOM_LEN));
    this._ensureDecor(ri); if (this.dist > (ri + 1) * ROOM_LEN - 150) this._ensureDecor(ri + 1);
    for (const [i, d] of this.decor) {
      if (this.dist > (i + 1) * ROOM_LEN + 25 && i < ROOMS.length - 1) { this.scene.remove(d.group); this.decor.delete(i); }
    }
    const boundary = (ri + 1) * ROOM_LEN;
    const blend = ri < ROOMS.length - 1 ? smoothstep(boundary - 18, boundary + 4, this.dist) : 0;
    this._applyPalette(ROOMS[ri].palette, ROOMS[Math.min(ri + 1, ROOMS.length - 1)].palette, blend);

    // Spawn / despawn entities.
    while (this.pending.length && this.pending[0].z > camZ - SPAWN_AHEAD) {
      const e = this.pending.shift().make();
      this.scene.add(e.group); this.entities.push(e);
    }
    const ctx = { beat: this.beat, bps: this.bps || 1.6, camZ, baseSpeed: ROOMS[Math.max(0, this.roomIndex)].speed, timeScale: this.timeScale, time: this.time };
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (e.z > camZ + 12) { this.scene.remove(e.group); this.entities.splice(i, 1); continue; }
      e.update(gdt, ctx);
    }
    for (const d of this.decor.values()) d.update(gdt, ctx);

    // Camera
    const cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * 0.5;
    cam.position.set(Math.sin(this.time * 0.6) * 0.05 + (Math.random() - 0.5) * sh, Math.sin(this.beat * Math.PI) * 0.025 + (Math.random() - 0.5) * sh, camZ);
    cam.rotation.set(0, 0, Math.sin(this.time * 0.4) * 0.012 + (Math.random() - 0.5) * sh * 0.1);
    this.fovKick = Math.max(0, (this.fovKick || 0) - dt * 2);
    const fovT = this.baseFov + this.fovKick * 6 + (this.power?.kind === 'overdrive' ? 3 : 0);
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov += (fovT - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix(); }
    // Title: push the vanishing point right so the corridor frames the logo.
    const wide = innerWidth / innerHeight > 1.2;
    const off = this.state === 'title' && wide ? -innerWidth * 0.2 : 0;
    this.viewOff = (this.viewOff || 0) + (off - (this.viewOff || 0)) * Math.min(1, dt * 3);
    if (Math.abs(this.viewOff) > 0.5) cam.setViewOffset(innerWidth, innerHeight, this.viewOff, 0, innerWidth, innerHeight);
    else if (cam.view && cam.view.enabled) cam.clearViewOffset();
    this.sun.position.set(3, 8, camZ + 4); this.sun.target.position.set(0, 0, camZ - 10);

    this.scene.updateMatrixWorld();
    this._refreshColliders(camZ);

    if (playing) this._gameplay(dt, gdt, camZ);

    this.shards.update(gdt);
    this.sparks.update(gdt);
    this.trail.update(gdt);
    this.rings.update(gdt);
    this.dust.update(gdt, camZ, this.time);
    SHARED.time.value = this.time;
    this.sky.mesh.position.copy(cam.position);
    this.mirror.follow(camZ);
    // Finishing pass: speed blur, aberration kicks, flashes, stasis desaturation.
    const stasis = this.power?.kind === 'stasis';
    this.aberrKick = Math.max(0, this.aberrKick - dt * 1.8);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 1.6);
    const f = this.fin;
    f.uTime.value = this.time;
    f.uAberr.value = 0.0018 + this.aberrKick * 0.02 + (this.power?.kind === 'overdrive' ? 0.003 : 0);
    f.uSpeed.value = this.state === 'title' ? 0.15 : Math.min(1, this.speed / 13) * 0.55 * this.timeScale + this.aberrKick * 0.8;
    f.uSat.value += ((stasis ? 0.55 : this.state === 'dying' ? 0.2 : 1.1) - f.uSat.value) * Math.min(1, dt * 4);
    f.uFlashAmt.value = this.flashAmt;
    this.flashLight.intensity *= Math.pow(0.0005, dt);
    if (this.shockT < 1) {
      this.shockT = Math.min(1, this.shockT + dt * 3);
      this.shock.scale.setScalar(0.3 + this.shockT * 3.2);
      this.shock.material.opacity = (1 - this.shockT) * 0.6;
    }
  }

  _gameplay(dt, gdt, camZ) {
    this.stats.time += dt;

    // Power-up timer (real time, so stasis doesn't stretch its own duration).
    if (this.power) {
      this.power.t -= dt;
      if (this.power.t <= 0) {
        if (this.power.kind === 'stasis') this.audio.muffle(0);
        this.power = null; this._syncHud(true);
      }
    }
    // Overdrive: hold to stream.
    this.fireCd -= dt;
    if (this.state === 'playing' && this.power?.kind === 'overdrive' && this.pointer.down && this.fireCd <= 0) {
      this.fireCd = 0.085; this.fire(this.pointer.x, this.pointer.y);
    }
    if (this.bot && this.state === 'playing') this._botThink(dt);

    this._updateBalls(gdt, camZ);

    if (this.state === 'playing') {
      // Player collision against solid parts.
      this.invuln -= dt;
      const pp = _v.set(0, 0, camZ);
      if (this.invuln <= 0) {
        outer: for (const e of this.entities) {
          if (!e.near || Math.abs(e.z - camZ) > 8) continue;
          for (const p of e.parts) {
            if (!p.alive || !p.solid || !p.half) continue;
            if (sphereBox(pp, PLAYER_R, p)) { this.crash(p); break outer; }
          }
        }
      }
      // Crystals that slip past break the streak.
      for (const e of this.entities) {
        if (e.near && e.part && e.part.kind === 'crystal' && e.part.alive && !e.missed && e.part.wpos.z > camZ + 0.8) {
          e.missed = true; this.stats.crystalsMissed++;
          this.breakStreak('miss');
        }
      }
      if (this.dist >= CORE_DIST - 12) this._finish(true);
    } else if (this.state === 'dying') {
      this.dyingT -= dt;
      if (this.dyingT <= 0) this._finish(false);
    }
    this._syncHud();
  }

  _refreshColliders(camZ) {
    for (const e of this.entities) {
      e.near = e.z < camZ + 12 && e.z > camZ - 95;
      if (!e.near) continue;
      for (const p of e.parts) {
        if (!p.alive) continue;
        p.mesh.matrixWorld.decompose(p.wpos, p.quat, _scl);
        if (p.half) p.inv.compose(p.wpos, p.quat, _v3.set(1, 1, 1)).invert();
      }
    }
  }

  _updateBalls(gdt, camZ) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.life += gdt;
      b.vel.y -= GRAVITY * gdt;
      let remaining = 1, iter = 0, dead = false;
      while (remaining > 0 && iter++ < 3 && !dead) {
        const p0 = _a.copy(b.pos);
        const p1 = _b.copy(b.pos).addScaledVector(b.vel, gdt * remaining);
        let best = null, bestPart = null;
        const zmin = Math.min(p0.z, p1.z) - 4, zmax = Math.max(p0.z, p1.z) + 4;
        for (const e of this.entities) {
          if (!e.near || e.z < zmin - 6 || e.z > zmax + 6) continue;
          for (const p of e.parts) {
            if (!p.alive || p.wpos.z < zmin || p.wpos.z > zmax) continue;
            const h = p.half ? segBox(p0, p1, p, BALL_R) : segSphere(p0, p1, p.wpos, p.radius);
            if (h && (!best || h.t < best.t)) { best = h; bestPart = p; }
          }
        }
        if (!best) { b.pos.copy(p1); remaining = 0; break; }
        b.pos.lerpVectors(p0, p1, best.t);
        remaining *= 1 - best.t;
        const part = bestPart, kind = part.kind;
        if (!b.rec.hit && kind !== 'metal') { b.rec.hit = true; this.stats.throwHits++; }
        if (b.nova && (kind === 'glass' || kind === 'metal')) {
          this._explode(b.pos.clone()); dead = true; break;
        }
        if (kind === 'glass') {
          part.ent.onHit(part, b, b.pos.clone());
          this.stats.hits++;
          b.vel.multiplyScalar(0.8);
          b.vel.x += (Math.random() - 0.5) * 2; b.vel.y += (Math.random() - 0.5) * 2;
        } else if (kind === 'metal' || kind === 'switch') {
          part.ent.onHit(part, b, b.pos.clone());
          const n = best.n;
          const vn = b.vel.dot(n);
          if (vn < 0) b.vel.addScaledVector(n, -1.55 * vn).multiplyScalar(0.8);
          b.pos.addScaledVector(n, 0.02);
          if (kind === 'metal') { this.audio.metal(b.pos.x / 5); this.sparks.emit(b.pos, 0xffd0a0, 8, 4, 1, 0.3); }
        } else {
          part.ent.onHit(part, b, b.pos.clone()); // crystal / power: pass through
        }
      }
      // Floor bounce
      if (b.pos.y < FLOOR_Y + BALL_R) {
        b.pos.y = FLOOR_Y + BALL_R;
        if (b.vel.y < 0) { b.vel.y *= -0.45; b.vel.x *= 0.85; b.vel.z *= 0.85; }
      }
      b.mesh.position.copy(b.pos);
      this.trail.emitAt(b.pos, b.nova ? COLORS.nova : 0xcfe4ff, 0.22);
      if (dead || b.life > 3.5 || b.pos.z > camZ + 4 || b.pos.z < camZ - 130) {
        b.mesh.visible = false; this.balls.splice(i, 1); this.ballPool.push(b);
      }
    }
  }

  _applyPalette(a, b, t) {
    const c = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t);
    const fog = c(a.fog, b.fog);
    this.fog.color.copy(fog);
    this.hemi.color.copy(c(a.sky, b.sky));
    this.hemi.groundColor.copy(c(a.ground, b.ground));
    this.headLight.color.copy(c(a.accent, b.accent));
    this.sky.set(a, t, b);
    this.mirror.setTint(c(a.floorTint, b.floorTint), a.ripple * (1 - t) + b.ripple * t);
    this.fin.uShadow.value.copy(c(a.shadow, b.shadow));
    this.fin.uHigh.value.copy(c(a.high, b.high));
  }

  _syncHud(force) {
    if (this.state === 'title') return;
    this.ui.hud({
      ammo: this.ammo, infinite: this.power?.kind === 'overdrive', multi: this.multi,
      streak: this.streak % STREAK_PER_TIER, tierSize: STREAK_PER_TIER, maxed: this.multi >= MAX_MULTI,
      dist: Math.floor(this.dist), room: ROOMS[Math.max(0, this.roomIndex)].name,
      power: this.power ? { kind: this.power.kind, name: POWER_NAME[this.power.kind], frac: this.power.t / this.power.dur, color: '#' + new THREE.Color(COLORS[this.power.kind]).getHexString() } : null,
    }, force);
  }

  // Simple autoplayer used by the automated playtest (?bot).
  _botThink(dt) {
    this.botCd = (this.botCd || 0) - dt;
    if (this.botCd > 0) return;
    const camZ = this.camera.position.z;
    let best = null, bestScore = Infinity;
    for (const e of this.entities) {
      if (!e.near) continue;
      for (const p of e.parts) {
        if (!p.alive) continue;
        const dz = camZ - p.wpos.z;
        if (dz < 7 || dz > 34) continue;
        let pri;
        if (p.kind === 'switch') pri = 0;
        else if (p.kind === 'crystal') pri = 1;
        else if (p.kind === 'power') pri = 1;
        else if (p.kind === 'glass' && dz < 24 && sphereBox(_v.set(0, 0, p.wpos.z), 0.7, p)) pri = 2;
        else continue;
        if (p.data.botTargeted && this.time - p.data.botTargeted < 0.6) continue;
        const score = pri * 100 + dz;
        if (score < bestScore) { bestScore = score; best = p; }
      }
    }
    if (!best) return;
    best.data.botTargeted = this.time;
    const s = best.wpos.clone().project(this.camera);
    if (Math.abs(s.x) > 1 || Math.abs(s.y) > 1) return;
    this.fire(s.x, s.y);
    this.botCd = 0.18;
  }
}

// ---------------------------------------------------------------- collision math
function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

const _la = new THREE.Vector3(), _lb = new THREE.Vector3();
// Swept segment vs oriented box (expanded by r). Returns {t, n(world)} or null.
function segBox(p0, p1, part, r) {
  _la.copy(p0).applyMatrix4(part.inv);
  _lb.copy(p1).applyMatrix4(part.inv);
  const h = part.half;
  let tmin = 0, tmax = 1, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    const a = _la.getComponent(i), d = _lb.getComponent(i) - a, e = h.getComponent(i) + r;
    if (Math.abs(d) < 1e-9) { if (a < -e || a > e) return null; continue; }
    let t1 = (-e - a) / d, t2 = (e - a) / d, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const n = new THREE.Vector3();
  if (axis < 0) { // started inside: push out along major axis
    let m = 0, best = -1;
    for (let i = 0; i < 3; i++) { const v = Math.abs(_la.getComponent(i)) / (h.getComponent(i) + r); if (v > best) { best = v; m = i; } }
    n.setComponent(m, Math.sign(_la.getComponent(m)) || 1);
  } else n.setComponent(axis, sign);
  n.applyQuaternion(part.quat);
  return { t: tmin, n };
}
function segSphere(p0, p1, c, r) {
  const d = _v.subVectors(p1, p0), f = _v2.subVectors(p0, c);
  const A = d.dot(d), B = 2 * f.dot(d), C = f.dot(f) - r * r;
  if (C < 0) return { t: 0, n: f.clone().normalize() };
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A < 1e-12) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  return { t, n: _v3.copy(p0).addScaledVector(d, t).sub(c).normalize().clone() };
}
function sphereBox(c, r, part) {
  _la.copy(c).applyMatrix4(part.inv);
  const h = part.half;
  const dx = Math.max(Math.abs(_la.x) - h.x, 0), dy = Math.max(Math.abs(_la.y) - h.y, 0), dz = Math.max(Math.abs(_la.z) - h.z, 0);
  return dx * dx + dy * dy + dz * dz < r * r;
}

// ---------------------------------------------------------------- persistence
function loadProgress() {
  try { return JSON.parse(localStorage.getItem('shardwake.progress')) || { unlocked: 0, best: 0 }; }
  catch { return { unlocked: 0, best: 0 }; }
}
function saveProgress(p) { try { localStorage.setItem('shardwake.progress', JSON.stringify(p)); } catch { /* storage unavailable */ } }
