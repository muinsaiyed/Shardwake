// Visual layer: custom shaders and atmosphere (glass, sky, mirror floor,
// finishing pass, dust motes, impact rings). All procedural.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

export const SHARED = { time: { value: 0 } };

// ---------------------------------------------------------------------------
// Glass: fresnel sheen + crisp rim computed from the box's own dimensions,
// a travelling specular glint and a faint thin-film iridescence.
// ---------------------------------------------------------------------------
const glassVert = /* glsl */`
  attribute vec3 halfSize;
  varying vec3 vLocal; varying vec3 vHalf; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vLocal = position; vHalf = halfSize;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    vN = normalize(normalMatrix * normal);
    vV = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const glassFrag = /* glsl */`
  uniform vec3 tint; uniform float uTime; uniform float uCrack;
  varying vec3 vLocal; varying vec3 vHalf; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  #include <fog_pars_fragment>
  vec3 film(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
  void main() {
    vec3 d = vHalf - abs(vLocal);
    float lo = min(d.x, min(d.y, d.z)), hi = max(d.x, max(d.y, d.z));
    float edge = d.x + d.y + d.z - lo - hi;           // distance to nearest face edge (world units)
    float rim = 1.0 - smoothstep(0.006, 0.026, edge);
    float inner = 1.0 - smoothstep(0.0, 0.22, edge);
    vec3 n = normalize(vN); vec3 v = normalize(vV);
    float fres = pow(1.0 - abs(dot(n, v)), 3.0);
    float g = sin((vW.x * 0.55 + vW.y * 0.8) * 2.2 - uTime * 1.6 + vW.z * 0.15);
    float glint = smoothstep(0.975, 1.0, g) * 0.7 + smoothstep(0.992, 1.0, sin((vW.x * 0.55 + vW.y * 0.8) * 2.2 - uTime * 1.6 + vW.z * 0.15 + 0.35)) * 0.6;
    vec3 irid = film(fres * 0.9 + vW.y * 0.05 + vW.x * 0.03 + 0.1);
    vec3 col = tint * 0.06 + tint * inner * 0.22;
    col += mix(tint, irid, 0.6) * fres * 0.75;
    col += vec3(1.0) * glint * 0.55;
    col += mix(tint, vec3(1.0), 0.4) * rim * 1.25;
    float a = 0.05 + fres * 0.4 + inner * 0.08 + rim * 0.9 + glint * 0.25;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <fog_fragment>
  }`;

const glassMats = new Map();
export function makeGlassMaterial(tint) {
  if (glassMats.has(tint)) return glassMats.get(tint);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tint: { value: new THREE.Color(tint) }, uCrack: { value: 0 } }]),
    vertexShader: glassVert, fragmentShader: glassFrag,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  m.uniforms.uTime = SHARED.time;
  glassMats.set(tint, m);
  return m;
}
export function glassGeometry(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = w / 2; arr[i * 3 + 1] = h / 2; arr[i * 3 + 2] = d / 2; }
  g.setAttribute('halfSize', new THREE.BufferAttribute(arr, 3));
  return g;
}

// ---------------------------------------------------------------------------
// Sky dome: horizon matches the fog, above it a slow nebula, stars and a
// bright "destination" bloom straight down the rail.
// ---------------------------------------------------------------------------
export class Sky {
  constructor(scene) {
    this.uniforms = {
      horizon: { value: new THREE.Color() }, zenith: { value: new THREE.Color() },
      nebA: { value: new THREE.Color() }, nebB: { value: new THREE.Color() }, glow: { value: new THREE.Color() },
      uTime: SHARED.time,
    };
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(138, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 horizon, zenith, nebA, nebB, glow; uniform float uTime; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, zenith, smoothstep(0.02, 0.75, h));
          float up = smoothstep(0.0, 0.35, h);
          vec3 q = d * 2.2 + vec3(0.0, 0.0, uTime * 0.012);
          float n1 = fbm(q + fbm(q * 1.7) * 0.8);
          float n2 = fbm(q * 1.4 + 7.3);
          col += nebA * smoothstep(0.45, 0.9, n1) * 0.9 * up;
          col += nebB * smoothstep(0.5, 0.95, n2) * 0.6 * up;
          vec3 sp = floor(d * 260.0);
          float st = step(0.9975, hash(sp)) * up;
          col += vec3(st) * (0.6 + 0.4 * sin(uTime * 3.0 + hash(sp + 3.0) * 30.0));
          float ahead = max(dot(d, normalize(vec3(0.0, 0.08, -1.0))), 0.0);
          col += glow * (pow(ahead, 30.0) * 0.9 + pow(ahead, 5.0) * 0.08);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  set(pal, t, other) {
    const L = (k) => new THREE.Color(pal[k]).lerp(new THREE.Color(other[k]), t);
    this.uniforms.horizon.value.copy(L('fog'));
    this.uniforms.zenith.value.copy(L('zenith'));
    this.uniforms.nebA.value.copy(L('nebA'));
    this.uniforms.nebB.value.copy(L('nebB'));
    this.uniforms.glow.value.copy(L('accent')).multiplyScalar(0.8);
  }
}

// ---------------------------------------------------------------------------
// Mirror floor: a planar reflection, softened with a small blur kernel,
// darkened and tinted, with optional water ripple distortion.
// ---------------------------------------------------------------------------
const MirrorShader = {
  name: 'MirrorFloor',
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    tint: { value: new THREE.Color(0x0a1016) }, ripple: { value: 0 }, strength: { value: 0.65 },
  }]),
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    #include <fog_pars_vertex>
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec3 tint; uniform float ripple, strength, uTime; varying vec4 vUv; varying vec3 vW;
    #include <fog_pars_fragment>
    void main(){
      vec2 uv = vUv.xy / vUv.w;
      vec2 wob = vec2(sin(vW.z * 1.7 + uTime * 1.3) + sin(vW.x * 2.3 - uTime), cos(vW.z * 1.1 - uTime * 0.9)) * 0.006 * ripple;
      uv += wob;
      // Rotated-per-pixel disk blur: glossy without cross-shaped artifacts.
      float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
      mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
      vec3 r = texture2D(tDiffuse, uv).rgb * 0.2;
      for (int i = 0; i < 6; i++) {
        float a = float(i) * 1.0472;
        vec2 o = rot * vec2(cos(a), sin(a) * 1.8) * (0.0025 + 0.0015 * float(i - (i / 2) * 2));
        r += texture2D(tDiffuse, uv + o).rgb * (0.8 / 6.0);
      }
      float side = 1.0 - smoothstep(4.0, 13.0, abs(vW.x));
      gl_FragColor = vec4(tint + r * strength * (0.55 + 0.45 * side), 1.0);
      #include <fog_fragment>
    }`,
};
export class MirrorFloor {
  constructor(scene, y, quality) {
    const geo = new THREE.PlaneGeometry(40, 260);
    const s = quality;
    this.mirror = new Reflector(geo, {
      shader: MirrorShader, clipBias: 0.003, multisample: 0,
      textureWidth: Math.round(innerWidth * s), textureHeight: Math.round(innerHeight * s),
    });
    this.mirror.material.fog = true;
    this.mirror.material.uniforms.uTime = SHARED.time;
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = y;
    scene.add(this.mirror);
    this.plain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.35, metalness: 0.5 }));
    this.plain.rotation.x = -Math.PI / 2; this.plain.position.y = y; this.plain.visible = false;
    scene.add(this.plain);
    this.quality = s;
  }
  follow(camZ) { this.mirror.position.z = this.plain.position.z = camZ - 120; }
  setTint(c, ripple) {
    this.mirror.material.uniforms.tint.value.copy(c);
    this.mirror.material.uniforms.ripple.value = ripple;
    this.plain.material.color.copy(c).multiplyScalar(1.6);
  }
  setEnabled(on) { this.mirror.visible = on; this.plain.visible = !on; }
  resize() {
    this.mirror.getRenderTarget().setSize(Math.round(innerWidth * this.quality), Math.round(innerHeight * this.quality));
  }
}

// ---------------------------------------------------------------------------
// Finishing pass (display space): radial speed blur, chromatic aberration,
// split-tone grading, vignette, grain and flashes.
// ---------------------------------------------------------------------------
export const FinishShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
    uAberr: { value: 0.002 }, uSpeed: { value: 0.3 }, uVignette: { value: 0.55 }, uGrain: { value: 0.022 },
    uShadow: { value: new THREE.Color(0x0a2230) }, uHigh: { value: new THREE.Color(0xffe6c8) },
    uSat: { value: 1.1 }, uContrast: { value: 1.12 },
    uFlash: { value: new THREE.Color(1, 1, 1) }, uFlashAmt: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uAberr, uSpeed, uVignette, uGrain, uSat, uContrast, uFlashAmt;
    uniform vec2 uRes; uniform vec3 uShadow, uHigh, uFlash; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 ca(vec2 uv, vec2 c, float amt){
      return vec3(texture2D(tDiffuse, uv + c * amt).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * amt).b);
    }
    void main(){
      vec2 c = vUv - 0.5; c.x *= uRes.x / uRes.y;
      float r = length(c);
      vec2 dir = vUv - 0.5;
      float blur = uSpeed * smoothstep(0.22, 0.8, r);
      float amt = uAberr * (0.35 + r * 1.6);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float k = 1.0 - float(i) * blur * 0.018;
        col += ca(0.5 + dir * k, dir, amt);
      }
      col /= 6.0;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col += uShadow * (1.0 - smoothstep(0.0, 0.45, l)) * 0.07;
      col *= mix(vec3(1.0), uHigh, smoothstep(0.45, 1.0, l) * 0.25);
      col *= 1.0 - uVignette * smoothstep(0.35, 0.95, r);
      col = mix(col, uFlash, clamp(uFlashAmt * (0.55 + r * 0.6), 0.0, 1.0));
      col += (hash(vUv * uRes + fract(uTime) * 100.0) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// ---------------------------------------------------------------------------
// Dust motes: a wrapping volume of soft points around the camera.
// ---------------------------------------------------------------------------
export class Dust {
  constructor(scene, tex, count = 520) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * 22;
      this.pos[i * 3 + 1] = -2 + Math.random() * 9;
      this.pos[i * 3 + 2] = -Math.random() * 60;
      this.seed[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ size: 0.07, map: tex, color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }
  update(dt, camZ, t) {
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3, s = this.seed[i];
      p[j] += Math.sin(t * 0.3 + s) * dt * 0.15;
      p[j + 1] += Math.cos(t * 0.25 + s) * dt * 0.1;
      if (p[j + 2] > camZ + 2) p[j + 2] -= 62;
      else if (p[j + 2] < camZ - 60) p[j + 2] += 62;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Impact rings: expanding, fading halos at hit points (billboarded).
// ---------------------------------------------------------------------------
export class Rings {
  constructor(scene, n = 16) {
    const geo = new THREE.RingGeometry(0.82, 1, 48);
    this.items = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false; scene.add(m);
      this.items.push({ m, t: 1, size: 1 });
    }
    this.i = 0;
  }
  spawn(pos, color, size = 1.4, camera) {
    const it = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    it.m.position.copy(pos); it.m.quaternion.copy(camera.quaternion);
    it.m.material.color.set(color).multiplyScalar(2.2);
    it.t = 0; it.size = size; it.m.visible = true;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.t >= 1) continue;
      it.t = Math.min(1, it.t + dt * 2.6);
      const e = 1 - Math.pow(1 - it.t, 3);
      it.m.scale.setScalar(0.15 + e * it.size);
      it.m.material.opacity = (1 - it.t) * 0.9;
      if (it.t >= 1) it.m.visible = false;
    }
  }
}
