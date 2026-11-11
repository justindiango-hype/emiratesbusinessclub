// Emirates Business Club: the gold particle scene.
// One set of particles morphs through: dust -> globe -> Dubai skyline -> network -> logo -> dust.
// All movement is computed on the GPU in the vertex shader.

import {
  WebGLRenderer, Scene, PerspectiveCamera, BufferGeometry, BufferAttribute, Points, ShaderMaterial,
  AdditiveBlending, Vector2, Vector3, Matrix3, Matrix4, Euler, Mesh, SphereGeometry, BackSide,
  EffectComposer, RenderPass, UnrealBloomPass,
} from '../vendor/three.bundle.min.js';

const DEG = Math.PI / 180;
const DUBAI = { lat: 25.2048, lon: 55.2708 };
const CITIES = [
  [51.5, -0.1], [40.7, -74.0], [-23.5, -46.6], [6.5, 3.4], [-26.2, 28.0], [19.1, 72.9],
  [1.35, 103.8], [35.7, 139.7], [-33.9, 151.2], [47.5, 19.0], [55.75, 37.6], [41.0, 29.0],
  [30.0, 31.2], [31.2, 121.5], [34.0, -118.2], [43.7, -79.4], [48.85, 2.35], [-1.3, 36.8],
  [22.3, 114.2], [52.5, 13.4], [-34.6, -58.4], [37.6, 127.0],
];

function latLonToVec(lat, lon, r = 1) {
  const a = lat * DEG, o = lon * DEG;
  return [r * Math.cos(a) * Math.sin(o), r * Math.sin(a), r * Math.cos(a) * Math.cos(o)];
}

function loadMask(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const lum = new Uint8Array(c.width * c.height);
      for (let i = 0; i < lum.length; i++) lum[i] = d[i * 4];
      resolve({ w: c.width, h: c.height, lum });
    };
    img.onerror = reject;
    img.src = src;
  });
}

// Deterministic random so the scene looks the same on every load.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick n pixels from a mask, weighted by brightness (optionally only columns x0..x1).
function sampleMask(mask, n, rand, x0 = 0, x1 = 1) {
  const { w, h, lum } = mask;
  const cx0 = Math.floor(x0 * w), cx1 = Math.ceil(x1 * w);
  const idx = [], cum = [];
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = cx0; x < cx1; x++) {
      const v = lum[y * w + x];
      if (v > 12) { total += v; idx.push(y * w + x); cum.push(total); }
    }
  }
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const r = rand() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
    const p = idx[lo];
    out[i * 2] = ((p % w) + rand() - cx0) / (cx1 - cx0);
    out[i * 2 + 1] = (Math.floor(p / w) + rand()) / h;
  }
  return { pts: out, aspect: (cx1 - cx0) / h };
}

const VERT = /* glsl */ `
  uniform float uStage, uIntro, uTime, uPx, uAspect, uDim, uDense, uIcon, uIconMix;
  uniform mat3 uRot;
  uniform float uGScale;
  uniform vec3 uGOffset;
  uniform vec2 uMouse;
  uniform float uMotion;
  attribute vec3 aGlobe, aSky, aNet, aLogo, aDust, aIconA, aIconB;
  attribute vec4 aRand;
  attribute float aKind;
  varying float vAlpha;
  varying float vHot;

  float ease(float t) { return t * t * (3.0 - 2.0 * t); }
  // Each particle leaves at a slightly different moment so a shape "flows" into the next.
  float stagger(float f) { return ease(clamp((f - aRand.x * 0.38) / 0.62, 0.0, 1.0)); }

  void main() {
    vec3 gn = uRot * aGlobe;
    vec3 globe = gn * uGScale + uGOffset;
    float facing = smoothstep(-0.05, 0.35, gn.z);
    float aG = mix(0.0, 1.0, facing) * mix(0.14, 1.0, aKind);

    float ti = stagger(uIntro);
    vec3 p0 = mix(aDust, globe, ti);
    float a0 = mix(0.5, aG, ti);

    float s = uStage;
    vec3 pos; float alpha; float t = 0.0;
    if (s < 1.0) { pos = p0; alpha = a0; }
    else if (s < 2.0) { t = stagger(s - 1.0); pos = mix(globe, aSky, t); alpha = mix(aG, 0.85 * uDense, t); }
    else if (s < 3.0) { t = stagger(s - 2.0); pos = mix(aSky, aNet, t); alpha = 0.85 * uDense; }
    else if (s < 4.0) { t = stagger(s - 3.0); pos = mix(aNet, aLogo, t); alpha = mix(0.85, 0.95 * uDense, t) * uDense; }
    else { t = stagger(min(s - 4.0, 1.0)); pos = mix(aLogo, aDust, t); alpha = mix(0.95 * uDense * uDense, 0.42 * uDim, t); }

    // Mid-flight swirl: zero at both ends of a transition, widest in the middle.
    float mid = sin(3.14159 * t);
    if (s < 1.0) mid = sin(3.14159 * ti);

    // Icons beside the "why join" cards: a share of the dust gathers into the current icon.
    float chosen = step(aRand.y, 0.42);
    float tw = stagger(uIcon) * chosen;
    float tm = stagger(uIconMix);
    vec3 icon = mix(aIconA, aIconB, tm);
    pos = mix(pos, icon, tw);
    alpha = mix(alpha, 0.8 * uDense, tw);
    mid = max(mid * (1.0 - tw), sin(3.14159 * stagger(uIcon)) * chosen * 0.8 + sin(3.14159 * tm) * tw * 0.45);
    vec3 swirl = vec3(
      sin(aRand.y * 6.283 + uTime * 0.35),
      cos(aRand.z * 6.283 + uTime * 0.27),
      sin(aRand.w * 6.283 - uTime * 0.31));
    pos += swirl * mid * 0.55 * uMotion;
    // Gentle life when a shape is at rest.
    pos += swirl * 0.006 * uMotion;
    // Dust drifts slowly.
    float dusty = (s >= 4.0 ? t : 0.0) + (s < 1.0 ? 1.0 - ti : 0.0);
    pos.y += dusty * (1.0 - tw) * sin(uTime * 0.12 + aRand.x * 6.283) * 0.18 * uMotion;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clip = projectionMatrix * mv;

    // Particles under the cursor light up. They do not move.
    vec2 ndc = clip.xy / clip.w;
    vec2 diff = (ndc - uMouse) * vec2(uAspect, 1.0);
    float lit = smoothstep(0.26, 0.0, length(diff));
    lit *= lit;

    float sparkle = step(0.94, aRand.w);
    float twinkle = 0.75 + 0.25 * sin(uTime * 1.7 + aRand.x * 40.0);
    vHot = max(sparkle, lit * 0.85);
    vAlpha = alpha * mix(1.0, twinkle * 1.3, sparkle) * (1.0 + lit * 1.5);
    float size = mix(0.7, 1.5, aRand.z) * mix(1.0, 1.9, sparkle) * (1.0 + lit * 0.45);
    gl_PointSize = uPx * size / -mv.z;
    gl_Position = clip;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  // With post-processing the picture is gamma-encoded at the end, so we hand over linear light.
  #ifdef LINEAR_OUT
  vec3 toOut(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
  #else
  vec3 toOut(vec3 c) { return c; }
  #endif
  varying float vAlpha;
  varying float vHot;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    a *= a;
    vec3 gold = vec3(0.86, 0.62, 0.26);
    vec3 pale = vec3(1.0, 0.9, 0.68);
    vec3 col = mix(gold, pale, vHot * 0.8 + a * 0.25);
    gl_FragColor = vec4(toOut(col * a * vAlpha), 1.0);
  }
`;

const ARC_VERT = /* glsl */ `
  uniform float uTime, uPx, uReveal, uOpacity;
  uniform mat3 uRot;
  uniform float uGScale;
  uniform vec3 uGOffset;
  attribute float aU, aOff;
  varying float vA;
  void main() {
    vec3 n = uRot * position;
    vec3 pos = n * uGScale + uGOffset;
    float facing = smoothstep(-0.35, 0.2, normalize(n).z);
    float size = 1.0;
    float a;
    if (aU < 0.0) {
      // Dubai beacon
      float pulse = 0.5 + 0.5 * sin(uTime * 2.2);
      a = uReveal * 0.9; size = 4.5 + pulse * 3.0;
    } else {
      float head = fract(uTime * 0.16 + aOff);
      float dd = head - aU;
      float tail = smoothstep(0.28, 0.0, dd) * step(0.0, dd);
      a = (0.13 + tail * 0.95) * step(aU, uReveal);
      size = 0.75 + tail * 0.9;
    }
    vA = a * facing * uOpacity;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = uPx * size / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const ARC_FRAG = /* glsl */ `
  precision mediump float;
  // With post-processing the picture is gamma-encoded at the end, so we hand over linear light.
  #ifdef LINEAR_OUT
  vec3 toOut(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
  #else
  vec3 toOut(vec3 c) { return c; }
  #endif
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(toOut(vec3(1.0, 0.86, 0.58) * a * a * vA), 1.0);
  }
`;

const ATMO_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const ATMO_FRAG = /* glsl */ `
  precision mediump float;
  #ifdef LINEAR_OUT
  vec3 toOut(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
  #else
  vec3 toOut(vec3 c) { return max(c, vec3(0.0)); }
  #endif
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    // How far the view ray passes from the globe's centre, in globe radii (1.0 = the globe's edge).
    // Derived from the real view ray, so the glow sits on the edge at any screen width.
    float c = clamp(abs(dot(normalize(vP), normalize(vN))), 0.0, 1.0);
    float d = 1.16 * sqrt(max(0.0, 1.0 - c * c));
    float outer = pow(clamp(1.0 - (d - 1.0) / 0.16, 0.0, 1.0), 2.2);
    float inner = exp(-max(0.0, 1.0 - d) * 20.0);
    float halo = d >= 1.0 ? outer : inner;
    gl_FragColor = vec4(toOut(vec3(0.78, 0.52, 0.18) * halo * 0.4 * uOpacity), 1.0);
  }
`;

export async function createScene(canvas, { reducedMotion = false } = {}) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 700;
  const forced = new URLSearchParams(location.search).get('quality'); // ?quality=high or ?quality=low to test
  const lowPower = forced ? forced === 'low' : coarse || small || (navigator.hardwareConcurrency || 8) <= 4;
  const COUNT = lowPower ? 26000 : 60000;

  const defines = lowPower ? {} : { LINEAR_OUT: 1 };
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(lowPower ? 0x0a0908 : 0x010101, 1);
  const maxDpr = lowPower ? 1.5 : 1.75;

  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);

  const [land, sky, people, logo, iconSheet] = await Promise.all([
    loadMask('assets/data/land.png'),
    loadMask('assets/data/skyline.png'),
    loadMask('assets/data/people.png'),
    loadMask('assets/data/logo-mask.png'),
    loadMask('assets/data/icons.png'),
  ]);

  const rand = rng(20261111);
  const portrait = () => innerWidth / innerHeight < 0.8;
  const startedPortrait = portrait();

  // ---------- particle targets ----------
  const aGlobe = new Float32Array(COUNT * 3);
  const aSky = new Float32Array(COUNT * 3);
  const aNet = new Float32Array(COUNT * 3);
  const aLogo = new Float32Array(COUNT * 3);
  const aDust = new Float32Array(COUNT * 3);
  const aRand = new Float32Array(COUNT * 4);
  const aKind = new Float32Array(COUNT);

  // Globe: evenly spread points on a sphere, kept where the real-world map says "land".
  {
    const landCount = Math.floor(COUNT * 0.8);
    let i = 0, k = 0;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const candidates = Math.floor(landCount / 0.285);
    while (i < landCount && k < candidates * 3) {
      const y = 1 - (2 * ((k % candidates) + 0.5 + (k >= candidates ? rand() : 0))) / candidates;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * k;
      const x = Math.sin(th) * r, z = Math.cos(th) * r;
      k++;
      const lat = Math.asin(y) / DEG, lon = Math.atan2(x, z) / DEG;
      const px = Math.min(land.w - 1, Math.floor(((lon + 180) / 360) * land.w));
      const py = Math.min(land.h - 1, Math.floor(((90 - lat) / 180) * land.h));
      if (land.lum[py * land.w + px] < 128) continue;
      aGlobe[i * 3] = x; aGlobe[i * 3 + 1] = y; aGlobe[i * 3 + 2] = z;
      aKind[i] = 1; i++;
    }
    // Remaining points: faint ocean, so the sphere reads as a solid body.
    for (; i < COUNT; i++) {
      const y = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      aGlobe[i * 3] = Math.sin(th) * r; aGlobe[i * 3 + 1] = y; aGlobe[i * 3 + 2] = Math.cos(th) * r;
      aKind[i] = 0;
    }
  }

  // Shuffle order so land/ocean particles are mixed across the other shapes.
  const order = new Uint32Array(COUNT);
  for (let i = 0; i < COUNT; i++) order[i] = i;
  for (let i = COUNT - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }

  // Skyline (on narrow portrait screens, only the centre around the Burj Khalifa).
  {
    const s = startedPortrait ? sampleMask(sky, COUNT, rand, 0.3, 0.7) : sampleMask(sky, COUNT, rand);
    const halfW = 1, halfH = halfW / s.aspect;
    for (let n = 0; n < COUNT; n++) {
      const i = order[n];
      aSky[i * 3] = (s.pts[n * 2] * 2 - 1) * halfW;
      aSky[i * 3 + 1] = (1 - s.pts[n * 2 + 1] * 2) * halfH;
      aSky[i * 3 + 2] = (rand() - 0.5) * 0.05;
    }
  }

  // Logo
  {
    const s = sampleMask(logo, COUNT, rand);
    const halfW = 1, halfH = halfW / s.aspect;
    for (let n = 0; n < COUNT; n++) {
      const i = order[n];
      aLogo[i * 3] = (s.pts[n * 2] * 2 - 1) * halfW;
      aLogo[i * 3 + 1] = (1 - s.pts[n * 2 + 1] * 2) * halfH;
      aLogo[i * 3 + 2] = (rand() - 0.5) * 0.02;
    }
  }

  // People: a group of founders standing together, two of them shaking hands.
  // On narrow portrait screens only the centre of the group is used.
  const peopleCrop = startedPortrait ? [0.3, 0.7] : [0, 1];
  let peopleAspect = 1;
  {
    const s = sampleMask(people, COUNT, rand, peopleCrop[0], peopleCrop[1]);
    peopleAspect = s.aspect;
    const halfW = 1, halfH = halfW / s.aspect;
    for (let n = 0; n < COUNT; n++) {
      const i = order[n];
      aNet[i * 3] = (s.pts[n * 2] * 2 - 1) * halfW;
      aNet[i * 3 + 1] = (1 - s.pts[n * 2 + 1] * 2) * halfH;
      aNet[i * 3 + 2] = (rand() - 0.5) * 0.04;
    }
  }

  for (let i = 0; i < COUNT; i++) {
    aDust[i * 3] = (rand() - 0.5) * 13;
    aDust[i * 3 + 1] = (rand() - 0.5) * 8;
    aDust[i * 3 + 2] = -5 + rand() * 8.5;
    aRand[i * 4] = rand(); aRand[i * 4 + 1] = rand(); aRand[i * 4 + 2] = rand(); aRand[i * 4 + 3] = rand();
  }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(aDust, 3)); // only used for bounds
  geo.setAttribute('aDust', new BufferAttribute(aDust, 3));
  geo.setAttribute('aGlobe', new BufferAttribute(aGlobe, 3));
  geo.setAttribute('aSky', new BufferAttribute(aSky, 3));
  geo.setAttribute('aNet', new BufferAttribute(aNet, 3));
  geo.setAttribute('aLogo', new BufferAttribute(aLogo, 3));
  geo.setAttribute('aRand', new BufferAttribute(aRand, 4));
  geo.setAttribute('aKind', new BufferAttribute(aKind, 1));

  // Icons: five square pictures side by side in one image. Each becomes a set of particle targets.
  const ICONS = 5;
  const iconBase = [];
  for (let k = 0; k < ICONS; k++) {
    const sm = sampleMask(iconSheet, COUNT, rand, k / ICONS, (k + 1) / ICONS);
    const arr = new Float32Array(COUNT * 3);
    for (let n = 0; n < COUNT; n++) {
      const i = order[n];
      arr[i * 3] = sm.pts[n * 2] * 2 - 1;
      arr[i * 3 + 1] = 1 - sm.pts[n * 2 + 1] * 2;
      arr[i * 3 + 2] = (rand() - 0.5) * 0.04;
    }
    iconBase.push(arr);
  }
  const aIconA = new Float32Array(COUNT * 3), aIconB = new Float32Array(COUNT * 3);
  geo.setAttribute('aIconA', new BufferAttribute(aIconA, 3));
  geo.setAttribute('aIconB', new BufferAttribute(aIconB, 3));
  const icon = { a: 0, b: 0, mix: 0, weight: 0, want: -1, cx: 0, cy: 0, size: 1 };
  function writeIcon(which, k) {
    const src = iconBase[k], dst = which === 'a' ? aIconA : aIconB;
    for (let i = 0; i < COUNT * 3; i += 3) {
      dst[i] = src[i] * icon.size + icon.cx; dst[i + 1] = src[i + 1] * icon.size + icon.cy; dst[i + 2] = src[i + 2];
    }
    geo.attributes[which === 'a' ? 'aIconA' : 'aIconB'].needsUpdate = true;
  }

  const shared = {
    uTime: { value: 0 },
    uPx: { value: 1 },
    uRot: { value: new Matrix3() },
    uGScale: { value: 1 },
    uGOffset: { value: new Vector3() },
  };
  const mat = new ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, defines,
    uniforms: {
      ...shared,
      uStage: { value: 0 }, uIntro: { value: reducedMotion ? 1 : 0 }, uAspect: { value: 1 }, uDim: { value: 1 },
      uMouse: { value: new Vector2(9, 9) }, uDense: { value: 1 }, uIcon: { value: 0 }, uIconMix: { value: 0 }, uMotion: { value: reducedMotion ? 0 : 1 },
    },
    blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;

  // The skyline, network and logo are authored at half-width 1 and scaled to fit the screen.
  // We bake the fit into the attributes on resize-free terms by scaling in JS per stage below.
  scene.add(points);

  // ---------- flight arcs into Dubai ----------
  const arcPts = [], arcU = [], arcOff = [];
  const dub = new Vector3(...latLonToVec(DUBAI.lat, DUBAI.lon));
  CITIES.forEach(([lat, lon], ci) => {
    const a = new Vector3(...latLonToVec(lat, lon));
    const ang = a.angleTo(dub);
    const steps = Math.floor(90 + ang * 110);
    const off = rand();
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const sinA = Math.sin(ang);
      const w1 = Math.sin((1 - u) * ang) / sinA, w2 = Math.sin(u * ang) / sinA;
      const lift = 1 + Math.sin(Math.PI * u) * (0.06 + ang * 0.11);
      arcPts.push((a.x * w1 + dub.x * w2) * lift, (a.y * w1 + dub.y * w2) * lift, (a.z * w1 + dub.z * w2) * lift);
      arcU.push(u); arcOff.push(off + ci * 0.137);
    }
  });
  arcPts.push(dub.x * 1.005, dub.y * 1.005, dub.z * 1.005); arcU.push(-1); arcOff.push(0);
  const arcGeo = new BufferGeometry();
  arcGeo.setAttribute('position', new BufferAttribute(new Float32Array(arcPts), 3));
  arcGeo.setAttribute('aU', new BufferAttribute(new Float32Array(arcU), 1));
  arcGeo.setAttribute('aOff', new BufferAttribute(new Float32Array(arcOff), 1));
  const arcMat = new ShaderMaterial({
    vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, defines,
    uniforms: { ...shared, uReveal: { value: 0 }, uOpacity: { value: 0 } },
    blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
  const arcs = new Points(arcGeo, arcMat);
  arcs.frustumCulled = false;
  scene.add(arcs);

  // ---------- atmosphere glow ----------
  const atmoMat = new ShaderMaterial({
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, defines, uniforms: { uOpacity: { value: 0 } },
    side: BackSide, blending: AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });
  const atmo = new Mesh(new SphereGeometry(1.16, 48, 48), atmoMat);
  scene.add(atmo);

  // ---------- post-processing (desktop only) ----------
  let composer = null, bloom = null;
  if (!lowPower) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.55, 0.05);
    composer.addPass(bloom);
  }

  // ---------- layout-dependent values ----------
  const fit = { halfW: 1, halfH: 1, sky: 1, net: 1, logo: 1 };
  const skyAspect = startedPortrait ? (sky.w * 0.4) / sky.h : sky.w / sky.h;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
    camera.aspect = w / h; camera.updateProjectionMatrix();
    fit.halfH = Math.tan((camera.fov * DEG) / 2) * camera.position.z;
    fit.halfW = fit.halfH * camera.aspect;
    mat.uniforms.uAspect.value = camera.aspect;
    // point size in device pixels, scaled with viewport height so density looks the same everywhere
    shared.uPx.value = Math.min(h, w * 1.3) * dpr * (lowPower ? 0.0125 : 0.0105);
    // small, dense shapes (phone screens) get dimmer particles so they don't burn out to white
    mat.uniforms.uDense.value = Math.min(1, 0.35 + 0.65 * Math.min(1, fit.halfW / 1.6));
    fit.sky = Math.min(fit.halfW * 0.94, fit.halfH * 0.62 * skyAspect);
    fit.logo = Math.min(fit.halfW * 0.8, 1.9);
    fit.net = startedPortrait ? fit.halfW * 0.94 : Math.min(fit.halfW * 0.6, fit.halfH * 0.56 * peopleAspect);
    applyFit();
  }

  // Scale the unit-sized shapes to the viewport. Cheap: runs only on resize.
  const base = { sky: aSky.slice(), net: aNet.slice(), logo: aLogo.slice() };
  function applyFit() {
    const wide = camera.aspect > 1.05;
    const skyY = -fit.halfH * (wide ? 0.2 : 0.4), logoY = fit.halfH * 0.12;
    const netX = wide ? fit.halfW * 0.34 : 0, netY = wide ? -fit.halfH * 0.04 : -fit.halfH * 0.42;
    for (let i = 0; i < COUNT * 3; i += 3) {
      aSky[i] = base.sky[i] * fit.sky; aSky[i + 1] = base.sky[i + 1] * fit.sky + skyY; aSky[i + 2] = base.sky[i + 2];
      aNet[i] = base.net[i] * fit.net + netX; aNet[i + 1] = base.net[i + 1] * fit.net + netY; aNet[i + 2] = base.net[i + 2];
      aLogo[i] = base.logo[i] * fit.logo; aLogo[i + 1] = base.logo[i + 1] * fit.logo + logoY; aLogo[i + 2] = base.logo[i + 2];
    }
    geo.attributes.aSky.needsUpdate = true;
    geo.attributes.aNet.needsUpdate = true;
    geo.attributes.aLogo.needsUpdate = true;
    // icons sit in the right half of the screen, beside the cards
    icon.size = Math.min(fit.halfH * 0.46, fit.halfW * 0.3);
    icon.cx = fit.halfW * 0.5; icon.cy = -fit.halfH * 0.02;
    writeIcon('a', icon.a); writeIcon('b', icon.b);
  }

  // ---------- animation state ----------
  const state = { stage: 0, target: 0, intro: reducedMotion ? 1 : 0, dim: 1, mouseX: 0, mouseY: 0, mx: 0, my: 0, hasMouse: false, running: true };
  const euler = new Euler(0, 0, 0, 'XYZ');
  const m4 = new Matrix4();
  let spin = -0.35, last = performance.now(), time = 0;
  const dubaiYaw = -DUBAI.lon * DEG;
  const dubaiTilt = DUBAI.lat * DEG;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function frame(now) {
    if (!state.running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time += dt;
    // smooth the scroll-driven stage so fast scrolling still flows
    state.stage += (state.target - state.stage) * Math.min(1, dt * (reducedMotion ? 30 : 5.5));
    const s = state.stage;

    // globe: hero pose (0) -> zoomed on Dubai (1)
    const g = sm(0.05, 0.95, Math.min(s, 1));
    if (!reducedMotion) spin += dt * 0.07 * (1 - g);
    // shortest way round from the idle spin to Dubai-facing
    let dy = dubaiYaw - spin; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = spin + dy * g + state.mx * 0.12;
    const tilt = lerp(0.32, dubaiTilt, g) + state.my * -0.08;
    euler.set(tilt, yaw, 0);
    m4.makeRotationFromEuler(euler);
    shared.uRot.value.setFromMatrix4(m4);

    const wide = camera.aspect > 1.05;
    const heroScale = wide ? Math.min(1.45, fit.halfH * 0.74) : Math.min(fit.halfW * 0.8, fit.halfH * 0.42);
    const heroX = wide ? fit.halfW * 0.48 : 0;
    const heroY = wide ? -0.02 : -fit.halfH * 0.52;
    const zoomScale = wide ? Math.min(fit.halfH * 0.98, fit.halfW * 0.66) : fit.halfW * 1.0;
    const zoomY = wide ? -fit.halfH * 0.2 : -fit.halfH * 0.4;
    const gs = lerp(heroScale, zoomScale, g);
    shared.uGScale.value = gs;
    shared.uGOffset.value.set(lerp(heroX, wide ? -fit.halfW * 0.2 : 0, g), lerp(heroY, zoomY, g), 0);

    const globeVis = state.intro * (1 - sm(1.0, 1.45, s));
    atmo.position.copy(shared.uGOffset.value);
    atmo.scale.setScalar(gs);
    atmoMat.uniforms.uOpacity.value = globeVis * 0.9;
    arcMat.uniforms.uReveal.value = sm(0.3, 0.95, s);
    arcMat.uniforms.uOpacity.value = sm(0.2, 0.5, s) * (1 - sm(1.0, 1.3, s));
    arcs.visible = arcMat.uniforms.uOpacity.value > 0.001;
    atmo.visible = globeVis > 0.001;

    state.mx += (state.mouseX - state.mx) * Math.min(1, dt * 3);
    state.my += (state.mouseY - state.my) * Math.min(1, dt * 3);
    camera.position.x = state.mx * 0.12;
    camera.position.y = state.my * 0.08;
    camera.lookAt(0, 0, 0);

    shared.uTime.value = time;
    mat.uniforms.uStage.value = Math.min(s, 5);
    mat.uniforms.uIntro.value = state.intro;
    mat.uniforms.uDim.value = state.dim;
    // icons: fade the gathering in or out, and morph from one icon to the next
    const wantOn = icon.want >= 0 ? 1 : 0;
    icon.weight += (wantOn - icon.weight) * Math.min(1, dt * (reducedMotion ? 30 : 2.6));
    if (icon.want >= 0 && icon.want !== icon.b && icon.mix >= 1) { icon.a = icon.b; writeIcon('a', icon.a); icon.mix = 0; }
    if (icon.want >= 0 && icon.want !== icon.b && icon.mix === 0) {
      if (icon.weight < 0.05) { icon.a = icon.want; writeIcon('a', icon.a); }
      icon.b = icon.want; writeIcon('b', icon.b);
    }
    if (icon.b !== icon.a) icon.mix = Math.min(1, icon.mix + dt * (reducedMotion ? 30 : 0.95));
    mat.uniforms.uIcon.value = icon.weight;
    mat.uniforms.uIconMix.value = icon.mix;
    if (state.hasMouse) mat.uniforms.uMouse.value.set(state.mouseX, state.mouseY);
    if (bloom) bloom.strength = lerp(0.5, 0.32, sm(3.2, 4, s)) * lerp(1, 0.7, sm(4.2, 5, s));

    if (composer) composer.render(); else renderer.render(scene, camera);
  }

  function setRunning(on) {
    if (on === state.running) return;
    state.running = on;
    if (on) { last = performance.now(); requestAnimationFrame(frame); }
  }
  document.addEventListener('visibilitychange', () => setRunning(!document.hidden));
  if (!coarse) {
    addEventListener('pointermove', (e) => {
      state.hasMouse = true;
      state.mouseX = (e.clientX / innerWidth) * 2 - 1;
      state.mouseY = -((e.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
  }
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  resize();
  requestAnimationFrame(frame);

  return {
    /** 0 globe · 1 globe on Dubai · 2 skyline · 3 network · 4 logo · 5 dust */
    setStage(v) { state.target = v; },
    /** 0..1: dust gathering into the globe on first load */
    setIntro(v) { state.intro = v; },
    /** how bright the background dust is once the story is over */
    setDim(v) { state.dim = v; },
    jump(v) { state.target = v; state.stage = v; },
    /** stop drawing while something covers the whole screen */
    pause(on) { setRunning(!on && !document.hidden); },
    /** which icon the dust gathers into beside the cards: 0 to 4, or -1 for none */
    setIcon(k) { icon.want = k; },
    state,
    particleCount: COUNT,
  };
}
