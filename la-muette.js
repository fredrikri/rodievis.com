/* La Muette. Lower down she is on the line: where she calls from, cold, and her, far too close.
   She talks, and nothing is heard. When she stops, words come up; no telling whether they are hers. It rains, and she cries. */
(() => {
'use strict';

const section = document.querySelector('.muette');
const canvas = document.getElementById('muette-live');
if (!section || !canvas) return;
const placeEl = section.querySelector('.muette-place');
const title = section.querySelector('.muette-title');
const lines = Array.from(section.querySelectorAll('.muette-line'));
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!still && lines.length) lines[0].parentNode.classList.add('alive');
const isTouch = matchMedia('(pointer: coarse)').matches;
const isMobile = isTouch && Math.min(innerWidth, innerHeight) < 900;

const PAINTING = '/falling-upwards.webp';
const AUX = '/la-muette-aux.png';
const PLACE = '/images/archive/gaming-tunnel.jpg';
const CROP = [150, 30, 550, 530];        // the part of the painting she lives in: x, y, w, h
const FOCUS = [0.40, 0.62];              // where the eye rests in the place
const FPS = 24;                          // it runs like film
const LOOK = 'neon';                     // 'neon': night, rain, two lights on her skin. 'ink': the rough print, black and blood and cream
const MURMUR = 3;                        // how far her lips part at most, in the painting's own pixels; 0 keeps her mouth closed
const RAIN = 1;                          // how hard it rains; 0 stops the rain
const TEARS = 1;                         // 1 and she cries; 0 dries her eyes
const INK = [20 / 255, 22 / 255, 18 / 255];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (x) => x * x * (3 - 2 * x);
const step01 = (a, b, x) => ease(clamp((x - a) / (b - a), 0, 1));
function dice(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------------------------------------------------------------- what she says, and when */

// she murmurs in phrases; as each phrase ends a line of words comes up, and stays while she listens
const script = [];
const blinks = [];
let LOOP = 1;
(() => {
  const rand = dice(1958);
  let t = 0.9;
  for (const el of lines) {
    const words = el.textContent.trim().split(/\s+/).length;
    const count = Math.round(3 + words * 0.8 + rand() * 2);
    const syll = [], shut = [];
    let c = t + 0.22;
    for (let k = 0; k < count; k++) {
      if (k) {
        const gap = 0.27 + rand() * 0.13;
        if (rand() < 0.3) shut.push(c + gap / 2);                    // now and then her lips meet between two syllables
        c += gap;
        if (rand() < 0.14) c += 0.2 + rand() * 0.2;                  // or she takes a breath
      }
      // each syllable has its width, its height, and its shape: rounded (toward 1), plain, or spread (toward -1)
      const r = rand();
      syll.push([c, 0.17 + rand() * 0.05, 0.4 + rand() * 0.6, r < 0.45 ? 0.4 + rand() * 0.6 : r < 0.75 ? -0.1 + rand() * 0.4 : -0.7 + rand() * 0.4]);
    }
    const t1 = c + 0.42;
    const on = t1 - 0.5 - rand() * 0.25;                             // the words arrive as she finishes
    const off = on + 2.2 + words * 0.27;
    script.push({ t0: t, t1, syll, shut, on, off, el });
    blinks.push(t1 + 0.25 + rand() * 0.3);                           // she blinks when she has said it
    t = off + 0.45 + rand() * 0.9;
  }
  LOOP = t + 0.5;
  for (let b = 3.5; b < LOOP - 1; b += 4.5 + rand() * 3.5) if (!blinks.some((x) => Math.abs(x - b) < 2.2)) blinks.push(b);
})();
const wrap = (t) => ((t % LOOP) + LOOP) % LOOP;
// her lips at any moment: how far apart they are (0 to 1), and how far their corner is drawn forward (rounded, up to 1) or back (spread, down to -1).
// Each syllable is a soft swell; through a phrase her lips never quite close, except where they meet.
function lipsAt(t) {
  const tt = wrap(t);
  for (const p of script) {
    if (tt < p.t0 || tt > p.t1 + 0.1) continue;
    let sum = 0, shape = 0;
    for (const [c, w, h, sh] of p.syll) {
      const x = (tt - c) / w;
      if (x > -1 && x < 1) { let v = h * (0.5 + 0.5 * Math.cos(Math.PI * x)); v = v * v * v; sum += v; shape += v * sh; }
    }
    const first = p.syll[0][0], last = p.syll[p.syll.length - 1][0];
    const held = step01(first - 0.22, first, tt) * (1 - step01(last, last + 0.42, tt));           // she lets the last word go slowly
    const swell = Math.min(1, Math.cbrt(sum));
    let open = held * (0.3 + 0.7 * swell);
    for (const m of p.shut) { const x = (tt - m) / 0.14; if (x > -1 && x < 1) open *= 1 - 0.85 * (0.5 + 0.5 * Math.cos(Math.PI * x)); }
    return [open, held * (sum > 1e-4 ? shape / sum : 0) * Math.min(1, swell * 1.6)];
  }
  return [0, 0];
}
// how much she has been talking lately, 0 to 1
function spoken(t) { let a = 0; for (let i = 0; i < 6; i++) a += lipsAt(t - i * 0.14)[0]; return a / 6; }

// her eye wanders: it leaves you while she talks, and comes back to you when she has said it
const glances = [[0, 0, 0]];                                         // when, and where to: across and down, in the painting's pixels
(() => {
  const rand = dice(7);
  for (const p of script) {
    for (let g = p.t0 + 0.1 + rand() * 0.3; g < p.t1 - 0.5; g += 1.1 + rand() * 1.6) glances.push([g, -1.2 - rand() * 1.5, -0.4 + rand() * 1.1]);
    glances.push([p.t1 - 0.12 + rand() * 0.2, 0.5 + rand() * 0.5, -0.1 + rand() * 0.2]);
    for (let g = p.t1 + 1.6 + rand() * 1.2; g < p.off - 0.4; g += 1.8 + rand() * 1.8) glances.push([g, -0.4 + rand(), -0.3 + rand() * 0.6]);
  }
  glances.push([LOOP - 0.4, 0, 0]);
})();
function gazeAt(t) {
  const tt = wrap(t);
  let i = 0;
  while (i + 1 < glances.length && glances[i + 1][0] <= tt) i++;
  const a = glances[Math.max(0, i - 1)], b = glances[i], k = step01(0, 0.11, tt - b[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
// her lid: a slow blink now and then, and between blinks it is never quite at the same height; it comes down a little when she looks down
function lidAt(t, down) {
  const tt = wrap(t);
  let b = 0;
  for (const tb of blinks) {
    const x = tt - tb;
    if (x <= 0 || x >= 0.5) continue;
    b = Math.max(b, x < 0.13 ? ease(x / 0.13) : x < 0.2 ? 1 : 1 - ease((x - 0.2) / 0.3));
  }
  return Math.max(b, 0.05 + 0.04 * Math.sin(t * 0.83) + 0.03 * Math.sin(t * 0.31 + 1) + 0.07 * Math.max(0, down));
}
// she cries: a tear gathers at her eye as she finishes a phrase, lets go when she blinks, and runs down her face.
// One way goes from the inner corner of her eye past her mouth to her jaw, the other from under her eye down her cheek to her fingertip.
const WAYS = [[400, 190, -0.008, -0.00104, 232], [425, 197, -0.03, -0.0006, 214]];     // where it starts, how its way bends, how far it runs
function tearsAt(t) {
  const tt = wrap(t), tears = new Float32Array(8), ways = new Float32Array(8);
  for (let k = 0; k < 2; k++) {
    const w = WAYS[k];
    ways.set(w.slice(0, 4), k * 4);
    let age = -1;
    for (let i = k; i < script.length - script.length % 2; i += 2) { const a = wrap(tt - script[i].t1 + 1.4); if (a < 9) age = a; }
    if (age < 0) continue;
    const run = clamp((age - 1.8) / 5.6, 0, 1);
    // how far down it has come, how big it is, how much of it is there, how long the wet line behind it
    tears.set([w[1] + w[4] * (0.3 * run + 0.7 * run * run), 3.8 * (0.45 + 0.55 * step01(0, 1.8, age)), TEARS * step01(0, 1.6, age) * (1 - step01(7.4, 9, age)), 14 + 40 * run], k * 4);
  }
  return [tears, ways];
}
// she breathes, and her head is never quite still; it dips a little when she talks. A turn (as cosine and sine), then across and down in the painting's pixels.
function headAt(t) {
  const k = step01(0, 2, t), talk = spoken(t);
  const turn = k * (0.0022 * Math.sin(t * 0.648) + 0.0012 * Math.sin(t * 1.065) - 0.0028 * (talk - 0.2));
  return [Math.cos(turn), Math.sin(turn), k * 0.5 * Math.sin(t * 0.495), k * (0.6 * Math.sin(t * 1.461) + 0.5 * talk)];
}
function sayAt(t) {
  const tt = wrap(t);
  for (const p of script) p.el.classList.toggle('on', t >= 0 && tt >= p.on && tt < p.off);
}

/* ---------------------------------------------------------------- the room goes quiet for her */

let hush = -1;
function setHush(k) {
  k = Math.round(clamp(k, 0, 1) * 50) / 50;
  if (k === hush) return;
  hush = k;
  window.dispatchEvent(new CustomEvent('rodievis:hush', { detail: k }));
}

/* ---------------------------------------------------------------- the picture */

const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
${LOOK === 'neon' ? '#define NEON' : ''}
precision highp float;
out vec4 o;
uniform sampler2D uPlace, uHer, uAux, uGrain;
uniform vec3 uView;         // the piece: width and height in css px, device px per css px
uniform float uBufH;        // height of the drawing buffer, device px
uniform float uSeam;        // css px from the top: above it the place, below it her
uniform vec3 uPlaceFit;     // image px at the top-left of its half, css px per image px
uniform vec2 uPlaceSize;
uniform vec3 uHerFit;       // painting px at the top-left of her half, css px per painting px
uniform vec4 uCrop;         // the part of the painting held in uHer and uAux
uniform vec4 uDrift;        // how far the two sheets of grain have slid
uniform vec2 uSpark;        // where the dust sits on this frame
uniform float uGrainPx, uLid;
uniform vec4 uMouth;        // her lips, in the painting's pixels: the lower one down, their corner forward, the jaw, the upper one up
uniform vec2 uGaze;         // where her eye has gone
uniform vec4 uHead;         // how her head has turned (cosine, sine) and moved
uniform vec4 uTear[2];      // each tear: how far down it has come, how big it is, how much of it is there, how long the wet line behind it
uniform vec4 uWay[2];       // and its way: where it starts, how it bends
uniform vec3 uRain;         // the rain: how big it is drawn, the time, how hard it falls
uniform float uSign;        // 1 when her name is a light of its own, and falls on her
uniform vec2 uFade;         // css px: how long the top comes out of the dark, how long the foot goes back into it
uniform vec3 uInk;

const float W = 0.11;       // how soft the edge of a grain is
#ifdef NEON
const float SKIN = 2.2;     // how wide her skin is read: wider is smoother
const vec2 KEEP = vec2(0.05, 0.14);
#else
const float SKIN = 1.6;
const vec2 KEEP = vec2(0.035, 0.11);
#endif
const vec3 ROSE = vec3(1.00, 0.20, 0.46), SEA = vec3(0.10, 0.78, 0.80);   // the two lights of the night

float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
// light laid over light: it adds up, and never burns out
vec3 screen(vec3 a, vec3 b){ return 1.0 - (1.0 - clamp(a, 0.0, 1.0)) * (1.0 - clamp(b, 0.0, 1.0)); }

vec4 cubic(float v){
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v; vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) / 6.0;
}
// a soft, wide reading of a small picture: it is blown up far past what it holds
vec3 soft(sampler2D tex, vec2 uv, vec2 size, float lod){
  size /= exp2(lod);
  vec2 st = uv * size - 0.5; vec2 f = fract(st); st -= f;
  vec4 xc = cubic(f.x), yc = cubic(f.y);
  vec4 c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(textureLod(tex, off.yw, lod).rgb, textureLod(tex, off.xw, lod).rgb, sx), mix(textureLod(tex, off.yz, lod).rgb, textureLod(tex, off.xz, lod).rgb, sx), sy);
}

// two sheets of grain slide slowly past each other: it never jumps, it crawls
float grain(vec2 p, float size){
  vec2 g = p / (size * 256.0);
  float x = 0.5 * (texture(uGrain, g + uDrift.xy).r + texture(uGrain, g * 1.07 + uDrift.zw).r);
  return x < 0.5 ? 2.0 * x * x : 1.0 - 2.0 * (1.0 - x) * (1.0 - x);    // every tone stays as likely as any other
}
// between two inks there is no blend, only grain: more of one, less of the other
float ink(float t, float a, float b, float n){
  float u = clamp((t - a) / (b - a), 0.0, 1.0);
  return smoothstep(n - W, n + W, u * (1.0 + 2.0 * W) - W);
}

/* the rain: three depths of it, falling a little aslant, every thread in its own lane */
float rain(vec2 p){
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    float f = float(i) * 0.5;
    float lane = uRain.x * mix(34.0, 12.0, f), len = uRain.x * mix(190.0, 72.0, f);
    float x = p.x + p.y * mix(0.11, 0.17, f) + 61.0 * f;
    float id = floor(x / lane);
    float r1 = fract(sin(id * 12.9898 + f * 78.233) * 43758.5453), r2 = fract(sin(id * 39.346 + f * 11.135) * 24634.6345);
    float across = abs(x - (id + 0.5 + (r1 - 0.5) * 0.6) * lane);
    float gap = len * mix(4.0, 9.0, r2);
    float y = mod(p.y - uRain.y * uRain.x * mix(2300.0, 1300.0, f) * (0.8 + 0.4 * r1) + r2 * gap, gap);
    float thread = (1.0 - smoothstep(0.0, uRain.x * mix(1.5, 0.8, f), across)) * smoothstep(0.0, 0.3 * len, y) * (1.0 - smoothstep(0.75 * len, len, y));
    a = max(a, thread * mix(1.0, 0.5, f));
  }
  return a * uRain.z;
}

/* the city behind her, far out of focus: a few lights, each a soft disc that breathes */
float h1(vec2 v){ return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453); }
vec3 city(vec2 p){
  vec3 lights = vec3(0.0);
  float cell = 0.17 * uView.x;
  vec2 id = floor(p / cell);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = id + vec2(float(i), float(j));
    float r1 = h1(c), r2 = h1(c + 17.0), r3 = h1(c + 43.0);
    if (h1(c + 71.0) < 0.3) continue;
    float d = length(p - (c + 0.2 + 0.6 * vec2(r1, r2)) * cell) / (cell * mix(0.14, 0.30, r3));
    float disc = (1.0 - smoothstep(0.72, 1.0, d)) * (0.55 + 0.45 * smoothstep(0.35, 0.9, d));
    lights += (r1 < 0.4 ? ROSE : r1 < 0.75 ? SEA : vec3(1.0, 0.72, 0.36)) * disc * (0.11 + 0.05 * sin(uRain.y * (0.3 + r2) + 6.283 * r3));
  }
  return lights;
}

/* where she calls from: a corridor at night */
vec3 place(vec2 p, float n){
  vec2 q = uPlaceFit.xy + p / uPlaceFit.z;
  vec2 uv = q / uPlaceSize;
  float l = luma(soft(uPlace, uv, uPlaceSize, 0.0));
  float halo = luma(textureLod(uPlace, uv, 4.5).rgb);
#ifdef NEON
  // its blades of light bleed into the air, and the air is not empty
  float t = smoothstep(0.02, 0.9, l) * (1.0 - 0.8 * smoothstep(0.64, 0.95, p.x / uView.x));
  vec3 c = mix(vec3(0.005, 0.012, 0.036), vec3(0.045, 0.190, 0.560), smoothstep(0.0, 0.45, t));
  c = mix(c, vec3(0.300, 0.640, 0.980), smoothstep(0.35, 0.8, t));
  c = mix(c, vec3(0.930, 0.975, 1.000), smoothstep(0.75, 1.0, t));
  c = screen(c, vec3(0.06, 0.24, 0.62) * 0.6 * smoothstep(0.1, 0.7, halo));
  c = screen(c, vec3(0.02, 0.07, 0.16) * luma(textureLod(uPlace, uv, 6.5).rgb));
  c = screen(c, ROSE * 0.42 * uSign * exp(-(uSeam - p.y) / (0.11 * uView.x)));
  return c * (0.95 + 0.10 * n);
#else
  // in one cold colour, printed rough
  float t = smoothstep(0.02, 0.86, l);
  t = pow(t, 0.82) * 0.94 + 0.26 * smoothstep(0.16, 0.62, halo);
  t *= 1.0 - 0.9 * smoothstep(0.64, 0.92, p.x / uView.x);              // the far side stays in the dark
  t = clamp(t, 0.0, 1.0);
  vec3 c = vec3(0.008, 0.012, 0.03);
  c = mix(c, vec3(0.027, 0.105, 0.285), ink(t, 0.00, 0.24, n));
  c = mix(c, vec3(0.110, 0.345, 0.660), ink(t, 0.24, 0.52, n));
  c = mix(c, vec3(0.380, 0.630, 0.860), ink(t, 0.52, 0.80, n));
  c = mix(c, vec3(0.840, 0.920, 0.990), ink(t, 0.80, 1.00, n));
  return c;
#endif
}

/* her eyes close, and open */
float lidOf(vec2 q, vec2 a, vec2 b, float up, float down, float lash){
  float t = (q.x - a.x) / (b.x - a.x);
  if (t <= 0.0 || t >= 1.0) return q.y;
  float arc = 4.0 * t * (1.0 - t), base = mix(a.y, b.y, t);
  float top = base - up * arc, h = (up + down) * arc * uLid;
  float y0 = top - lash;
  if (q.y <= y0 || q.y >= top + h) return q.y;
  return y0 + (q.y - y0) * lash / (lash + h);
}
/* her mouth: a murmur. Both lips move: the lower one sinks, the upper one rises less; their corner is drawn forward when they round
   and back when they spread, and the cheek beside it goes along; the jaw lets go, and the chin follows. */
vec2 mouth(vec2 q, out float dark){
  const vec2 A = vec2(277.0, 335.5), D = vec2(0.887, 0.463), N = vec2(-0.463, 0.887);
  const vec2 V = vec2(0.1, 0.995);                                     // down her face
  const float G = 3.2;                                                 // the dark line between her lips, at rest
  dark = 0.0;
  if (uMouth.x <= 0.0 && uMouth.y == 0.0) return q;
  vec2 r = q - A; float u = dot(r, D), s = dot(r, N);
  if (s < -70.0 || s > 200.0 || u > 230.0) return q;
  // her hand does not move with it: neither the fingertip at her chin nor the fist below
  float free = 1.0 - max(smoothstep(-22.0, 6.0, q.y - 462.0 - 0.25 * (300.0 - q.x)), 1.0 - smoothstep(0.75, 1.5, length((q - vec2(345.0, 462.0)) / vec2(34.0, 44.0))));
  // the corner and the cheek beside it; the front of her lips comes with it
  vec2 c = q - vec2(347.0, 372.0), f = q - vec2(268.0, 343.0);
  q += D * uMouth.y * (free * exp(-dot(c, c) / 1100.0) + 0.35 * exp(-dot(f, f) / 500.0));
  r = q - A; u = dot(r, D); s = dot(r, N);
  float along = (1.0 - smoothstep(38.0, 86.0, u)) * free;
  vec2 up = -V * uMouth.w * along, low = V * uMouth.x * along;         // how far each lip has gone
  float top = dot(up, N), foot = G + dot(low, N);
  if (s <= top) return q - up * exp((s - top) / 16.0);                 // the upper lip, and a little of what is above it
  if (s >= foot) {                                                     // the lower lip, the chin, the jaw
    float below = max(s - 44.0, 0.0), over = max(u - 40.0, 0.0), under = max(s - 80.0, 0.0);
    float jaw = uMouth.z * free * smoothstep(G + 2.0, 44.0, s) * exp(-over * over / 9800.0 - under * under / 5000.0);
    return q - low * exp(-below * below / 1800.0) - V * jaw;
  }
  float k = (s - top) / (foot - top);                                  // between them, the dark opens
  dark = smoothstep(0.3, 2.2, foot - top - G) * (1.0 - pow(abs(2.0 * k - 1.0), 2.5));
  return A + (u - mix(dot(up, D), dot(low, D), k)) * D + k * G * N;
}

/* she cries: each tear is a bead with a light in it and a darker foot, and it leaves a wet line behind it, cold like the rain */
float tears(vec2 q, inout float l){
  float wet = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 d = uTear[i], w = uWay[i];
    if (d.z <= 0.0) continue;
    float dy = q.y - w.y, dh = d.x - w.y, back = d.x - q.y;
    float x = w.x + w.z * dy + w.w * dy * dy;
    if (dy > -2.0 && back > 0.0) wet = max(wet, d.z * (1.0 - smoothstep(0.25 * d.y, 0.7 * d.y, abs(q.x - x))) * smoothstep(-2.0, 2.0, dy) * exp(-back / d.w));
    // the drop itself: round below, drawn out above; clear, with a dark foot and a light in it
    vec2 r = (q - vec2(w.x + w.z * dh + w.w * dh * dh, d.x)) / d.y;
    float m = length(vec2(r.x * (1.0 + 0.9 * clamp(-r.y, 0.0, 1.6)), r.y * (r.y < 0.0 ? 0.55 : 0.9)));
    float bead = (1.0 - smoothstep(0.72, 1.0, m)) * d.z;
    float foot = smoothstep(0.4, 0.92, m) * smoothstep(-0.3, 0.7, r.y);
    l = mix(l, l * (0.92 - 0.6 * foot) + 0.9 * (1.0 - smoothstep(0.05, 0.42, length(r - vec2(-0.2, -0.22)))), bead);
    wet = max(wet, 0.5 * bead);
  }
  return wet;
}

/* her, far too close */
vec3 her(vec2 p, float n){
  vec2 q = uHerFit.xy + vec2(p.x, p.y - uSeam) / uHerFit.z;
  // she breathes, and her head is never quite still: it turns a hair about a point far below her chin
  const vec2 NECK = vec2(440.0, 640.0);
  vec2 h = q - NECK - uHead.zw;
  q = NECK + vec2(h.x * uHead.x + h.y * uHead.y, h.y * uHead.x - h.x * uHead.y);
  q.y = lidOf(q, vec2(389.0, 172.0), vec2(462.0, 184.0), 20.0, 12.5, 13.0);
  q.y = lidOf(q, vec2(276.0, 103.0), vec2(312.0, 103.0), 3.0, 27.0, 9.0);
  // her eye wanders
  vec2 g = q - vec2(414.0, 172.0);
  q -= uGaze * exp(-g.x * g.x / 200.0 - g.y * g.y / 160.0);
  float dark;
  q = mouth(q, dark);
  vec2 uv = (q - uCrop.xy) / uCrop.zw;
  vec3 c = soft(uHer, uv, uCrop.zw, 0.0), cw = soft(uHer, uv, uCrop.zw, SKIN);
  vec3 aux = texture(uAux, uv).rgb;                                    // her, her lips, the phone
  vec2 e = smoothstep(vec2(0.0), vec2(0.02), uv) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - uv);
  // the skin is read wide, so its small weave is lost; a lash, a hair, a mole are read sharp
  float ls = luma(c), lw = luma(cw);
  float l = mix(lw, ls, smoothstep(KEEP.x, KEEP.y, abs(lw - ls)));
#ifdef NEON
  l += clamp(0.45 * (l - luma(textureLod(uHer, uv, 4.2).rgb)), -0.08, 0.07);   // the features, carved a little
#else
  l += clamp(0.8 * (l - luma(textureLod(uHer, uv, 4.2).rgb)), -0.10, 0.09);
#endif
  vec2 crease = q - vec2(343.0, 380.0);
  l *= 1.0 - 0.42 * exp(-dot(crease, crease) / 64.0);                  // the corner of her mouth keeps its shadow
  l *= 1.0 - 0.7 * dark;
  float wet = tears(q, l);

  // her mouth: the only clean colour here
  float tl = smoothstep(0.03, 0.56, ls * (1.0 - 0.7 * dark));
  vec3 lip = mix(vec3(0.085, 0.000, 0.010), vec3(0.560, 0.030, 0.055), smoothstep(0.0, 0.42, tl));
  lip = mix(lip, vec3(0.860, 0.075, 0.095), smoothstep(0.38, 0.74, tl));
  lip = mix(lip, vec3(1.000, 0.420, 0.340), smoothstep(0.80, 1.0, tl));

#ifdef NEON
  /* at night: two lights that never show themselves, rose from the upper left, sea-green from the phone at her cheek */
  float body = aux.r * e.x * e.y;
  vec2 at = vec2(p.x / uView.x, (p.y - uSeam) / max(uView.y - uSeam, 1.0));
  float fromRose = (1.0 - 0.75 * at.x) * (1.0 - 0.55 * at.y), fromSea = (0.25 + 0.75 * at.x) * (0.45 + 0.55 * at.y);
  // which way her skin turns, read from where the light on it falls away
  vec2 dx = vec2(7.0, 0.0) / uCrop.zw, dy = vec2(0.0, 7.0) / uCrop.zw;
  float turn = luma(textureLod(uHer, uv + dx, 3.0).rgb) - luma(textureLod(uHer, uv - dx, 3.0).rgb)
    + 0.6 * (luma(textureLod(uHer, uv + dy, 3.0).rgb) - luma(textureLod(uHer, uv - dy, 3.0).rgb));
  turn *= 1.0 - smoothstep(0.02, 0.3, textureLod(uAux, uv, 3.5).b);                     // the phone is not her skin
  float rimRose = clamp(4.0 * turn, 0.0, 1.0), rimSea = clamp(-4.0 * turn, 0.0, 1.0);
  float tone = smoothstep(0.07, 0.82, l);
  vec3 own = mix(vec3(1.0), cw / max(lw, 0.14), 0.5 * smoothstep(0.1, 0.5, tone));     // some of her own colour stays
  vec3 k = mix(vec3(0.012, 0.045, 0.065), vec3(1.00, 0.90, 0.83) * own, pow(tone, 1.15));
  k = screen(k, ROSE * tone * (0.20 * fromRose + 0.6 * rimRose * (0.35 + 0.65 * fromRose)));
  k = screen(k, SEA * (0.12 + 0.88 * tone) * (0.10 * fromSea + 0.42 * rimSea * (0.35 + 0.65 * fromSea)));
  // the light does not stop at her skin, it stands in the air around it
  k = screen(k, vec3(0.50, 0.13, 0.20) * 0.16 * smoothstep(0.3, 0.8, luma(textureLod(uHer, uv, 5.0).rgb)));
  k = mix(k, vec3(0.74, 0.92, 0.94) * (0.45 + 0.6 * tone), 0.6 * wet);                 // her tears, cold like the rain
  // her eye keeps its own colour
  vec2 iris = (q - vec2(428.0, 178.0)) / vec2(21.0, 13.0);
  k = mix(k, screen(c * c * 2.6 + vec3(0.0, 0.03, 0.05), SEA * 0.10), 0.85 * exp(-dot(iris, iris) * 1.4) * (1.0 - wet));
  // the phone: sea-green, a ridge of light
  float tp = pow(smoothstep(0.3, 0.97, ls), 2.2);
  vec3 ph = mix(vec3(0.008, 0.035, 0.042), vec3(0.04, 0.36, 0.39), smoothstep(0.0, 0.6, tp));
  ph = mix(ph, vec3(0.55, 0.90, 0.88), smoothstep(0.62, 1.0, tp));
  k = mix(k, ph, aux.b);
  k = mix(k, screen(lip, ROSE * 0.25 * rimRose), smoothstep(0.1, 0.9, aux.g));
  // behind her the city, out of focus, and the falling bodies almost lost in it
  if (body < 0.995) {
    vec3 night = vec3(0.008, 0.026, 0.040) + ROSE * 0.035 * fromRose + city(p);
    night += vec3(0.07, 0.17, 0.20) * 0.5 * smoothstep(0.36, 0.74, ls) * e.x * e.y * (1.0 - aux.r);
    k = mix(night, k, body);
  }
  k = screen(k, ROSE * uSign * exp(-(p.y - uSeam) / (0.2 * uView.x)) * (0.07 + 0.3 * tone * body));   // her name lights her from above
  return k * (0.95 + 0.10 * n);
#else
  /* printed rough: black, blood, orange, cream */
  float t = smoothstep(0.22, 0.76, l) * aux.r;
  t = max(t, (1.0 - aux.r) * 0.22 * smoothstep(0.36, 0.74, ls));       // behind her, the falling bodies: almost lost in the black
  t = clamp(t * e.x * e.y, 0.0, 1.0);
  float cool = smoothstep(-0.01, 0.07, max(c.g, c.b) - c.r) * (1.0 - smoothstep(0.42, 0.72, t));
  vec3 k = vec3(0.016, 0.011, 0.008);
  k = mix(k, mix(vec3(0.250, 0.035, 0.018), vec3(0.030, 0.130, 0.115), cool), ink(t, 0.00, 0.20, n));
  k = mix(k, mix(vec3(0.720, 0.150, 0.055), vec3(0.130, 0.360, 0.310), cool), ink(t, 0.20, 0.42, n));
  k = mix(k, vec3(0.925, 0.455, 0.170), ink(t, 0.42, 0.62, n));
  k = mix(k, vec3(0.965, 0.850, 0.610), ink(t, 0.62, 0.82, n));
  k = mix(k, vec3(1.000, 0.960, 0.830), ink(t, 0.82, 1.00, n));
  k = mix(k, vec3(0.60, 0.78, 0.78) * (0.4 + 0.7 * t), 0.62 * wet * aux.r);
  // the phone: almost lost in the black, a ridge of light
  float tp = pow(smoothstep(0.28, 0.88, ls), 1.7) * 0.86;
  vec3 ph = vec3(0.010, 0.016, 0.014);
  ph = mix(ph, vec3(0.030, 0.150, 0.110), ink(tp, 0.00, 0.34, n));
  ph = mix(ph, vec3(0.170, 0.470, 0.350), ink(tp, 0.34, 0.70, n));
  ph = mix(ph, vec3(0.560, 0.840, 0.700), ink(tp, 0.70, 1.00, n));
  k = mix(k, ph, aux.b * e.x * e.y);
  return mix(k, lip * (0.93 + 0.14 * n), ink(aux.g, 0.10, 0.90, n));
#endif
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y) / uView.z;
  bool above = p.y < uSeam;
  float n = above ? grain(p, uGrainPx * 1.3) : grain(p + 61.0, uGrainPx);
  vec3 c = above ? place(p, n) : her(p, n);
  float d = texture(uGrain, p / (uGrainPx * 0.62 * 256.0) + uSpark).g - 0.5;          // the fine dust on top of everything
  float a = smoothstep(0.0, uFade.x, p.y) * (1.0 - smoothstep(uView.y - uFade.y, uView.y, p.y));
#ifdef NEON
  // it rains in front of everything: each thread takes the light it falls through
  if (uRain.z > 0.0) {
    vec3 thread = above ? vec3(0.70, 0.86, 1.00) : mix(vec3(1.00, 0.80, 0.88), vec3(0.74, 0.93, 0.95), smoothstep(0.1, 0.8, p.x / uView.x));
    c = mix(c, mix(thread, vec3(0.50, 0.50, 0.56), smoothstep(0.5, 0.85, luma(c))), 0.5 * smoothstep(0.25, 0.7, rain(p)));
  }
  c *= 1.0 + 0.07 * d;
  c *= 1.0 - 0.22 * pow(abs(2.0 * p.x / uView.x - 1.0), 3.0);                         // the sides fall away
  a = a * a * (3.0 - 2.0 * a);                                                         // out of the dark above, back into it below
#else
  // it rains in front of everything: cold threads, pale against the dark and grey against the light
  if (uRain.z > 0.0) {
    vec3 thread = mix(above ? vec3(0.66, 0.82, 0.98) : vec3(0.76, 0.86, 0.85), vec3(0.42, 0.40, 0.38), smoothstep(0.45, 0.8, luma(c)));
    c = mix(c, thread, 0.55 * smoothstep(0.6 * n, 0.6 * n + 0.3, rain(p)));
  }
  c *= 1.0 + 0.16 * d;
  c += 0.012 * d;
  float lost = grain(p + 17.0, uGrainPx * 1.3);
  a = smoothstep(lost - 0.06, lost + 0.06, a * 1.12 - 0.06);                           // the picture ends as grain, not as an edge
#endif
  o = vec4(mix(uInk, c, a), 1.0);
}`;

const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
let lost = !gl;
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; canvas.classList.remove('is-live'); }, false);

function compile(type, src) {
  const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
  return sh;
}
let program = null;
const U = {};
function build() {
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(program, i); U[info.name] = { loc: gl.getUniformLocation(program, info.name), type: info.type }; }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}
function set(vals) {
  for (const key in vals) {
    const u = U[key]; if (!u) continue; const v = vals[key];
    switch (u.type) {
      case gl.FLOAT: gl.uniform1f(u.loc, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
      default: gl.uniform1i(u.loc, v);
    }
  }
}
function texture(source, mips, repeat) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  if (source.data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source.data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const edge = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, edge); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, edge);
  return tex;
}
function load(src) {
  return new Promise((resolve, reject) => { const im = new Image(); im.decoding = 'async'; im.onload = () => resolve(im); im.onerror = reject; im.src = src; });
}
// only the corner of the painting she lives in is kept
function cut(img) {
  const c = document.createElement('canvas'), k = img.naturalWidth / 1672;
  c.width = CROP[2]; c.height = CROP[3];
  c.getContext('2d').drawImage(img, CROP[0] * k, CROP[1] * k, CROP[2] * k, CROP[3] * k, 0, 0, CROP[2], CROP[3]);
  return c;
}

/* the grain itself: a square of noise that joins its own edges, fine specks over slow clumps, every tone as likely as any other */
const GRAIN = 256;
function makeGrain() {
  const N = GRAIN, n = N * N, rand = dice(77);
  const out = new Uint8Array(n * 4);
  const blur = (src, sigma) => {
    const r = Math.max(1, Math.ceil(sigma * 2.6)), k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) { const w = Math.exp(-i * i / (2 * sigma * sigma)); k.push(w); sum += w; }
    const tmp = new Float32Array(n), dst = new Float32Array(n);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (let i = -r; i <= r; i++) s += src[y * N + ((x + i + N) & (N - 1))] * k[i + r]; tmp[y * N + x] = s / sum; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (let i = -r; i <= r; i++) s += tmp[((y + i + N) & (N - 1)) * N + x] * k[i + r]; dst[y * N + x] = s / sum; }
    return dst;
  };
  const unit = (a) => { let m = 0, v = 0; for (let i = 0; i < n; i++) m += a[i]; m /= n; for (let i = 0; i < n; i++) { a[i] -= m; v += a[i] * a[i]; } v = Math.sqrt(v / n) || 1; for (let i = 0; i < n; i++) a[i] /= v; return a; };
  const noise = () => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rand() - 0.5; return a; };
  const BINS = 4096;
  for (let ch = 0; ch < 2; ch++) {
    const fine = unit(blur(noise(), ch ? 0.45 : 0.6)), clump = unit(blur(noise(), ch ? 1.1 : 1.7));
    const v = new Float32Array(n), hist = new Uint32Array(BINS);
    for (let i = 0; i < n; i++) v[i] = fine[i] * 0.8 + clump[i] * 0.6;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { if (v[i] < lo) lo = v[i]; if (v[i] > hi) hi = v[i]; }
    const sc = (BINS - 1) / (hi - lo);
    for (let i = 0; i < n; i++) hist[Math.round((v[i] - lo) * sc)]++;
    let acc = 0; const cdf = new Float32Array(BINS);
    for (let b = 0; b < BINS; b++) { acc += hist[b]; cdf[b] = (acc - hist[b] * 0.5) / n; }
    for (let i = 0; i < n; i++) out[i * 4 + ch] = Math.round(cdf[Math.round((v[i] - lo) * sc)] * 255);
  }
  for (let i = 0; i < n; i++) out[i * 4 + 3] = 255;
  return { data: out, width: N, height: N };
}

/* ---------------------------------------------------------------- where everything sits */

const tex = { place: null, her: null, aux: null, grain: null };
const geo = { w: 0, h: 0, seam: 0, dpr: 1, place: [0, 0, 1], placeSize: [1, 1], her: [0, 0, 1], grainPx: 1, fade: [60, 180], sign: 0 };
let ready = false, whole = true, shrink = 1;
function measure() {
  const w = section.clientWidth, h = section.clientHeight;
  if (!w || !h) return;
  const seam = placeEl.offsetHeight;
  const cs = getComputedStyle(section);
  const num = (name, d) => { const v = parseFloat(cs.getPropertyValue(name)); return isFinite(v) ? v : d; };
  const X = num('--x', 205), Y = num('--y', 88), CW = num('--w', 400), CH = num('--h', 410);
  geo.w = w; geo.h = h; geo.seam = seam;
  // her: the crop is as tall as her half; if the half was held back, more of the painting shows at the sides
  const hs = Math.max(1, h - seam) / CH;
  geo.her = [X + CW / 2 - w / (2 * hs), Y, hs];
  geo.grainPx = clamp(w / 1250, 0.9, 1.2);
  geo.fade = [Math.min(70, seam * 0.25), clamp(seam * 0.58, 120, 230)];
  geo.sign = section.dataset.name === 'neon' ? 1 : 0;
  if (!gl || lost) return;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  dpr = Math.min(dpr, Math.sqrt((isMobile ? 3.4e6 : 6e6) / (w * h))) * shrink;
  const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096;
  dpr = Math.min(dpr, max / w, max / h);
  const bw = Math.max(2, Math.round(w * dpr)), bh = Math.max(2, Math.round(h * dpr));
  if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  geo.dpr = canvas.width / w;
  // the place covers its half
  const [iw, ih] = geo.placeSize;
  const ps = Math.max(w / iw, seam / ih);
  geo.place = [clamp(FOCUS[0] * iw - w / (2 * ps), 0, iw - w / ps), clamp(FOCUS[1] * ih - seam / (2 * ps), 0, ih - seam / ps), ps];
  whole = true;
}

/* ---------------------------------------------------------------- the loop */

let t00 = -1;                 // she starts when she is first seen
let lastFrame = -1, seen = false, raf = 0;
let lastTick = 0, pace = 0, ticks = 0;
function draw(now) {
  if (lost || !ready || !geo.w) return;
  const rect = section.getBoundingClientRect(), vh = window.innerHeight || 1;
  const frame = Math.floor(now * FPS), tf = frame / FPS;
  const t = t00 < 0 ? -1 : Math.floor((now - t00) * FPS) / FPS;
  const alive = !still && t >= 0;
  const lips = alive ? lipsAt(t) : [0, 0], gaze = alive ? gazeAt(t) : [0, 0];
  if (alive) lips[1] = (lipsAt(t - 0.06)[1] + lips[1] + lipsAt(t + 0.06)[1]) / 3;      // the corner of her mouth takes its time
  const cry = alive && TEARS ? tearsAt(t) : [new Float32Array(8), new Float32Array(8)];
  const slid = (v) => { const x = (tf * v / GRAIN) % 1; return x < 0 ? x + 1 : x; };       // in grains a second: slow

  gl.viewport(0, 0, canvas.width, canvas.height);
  if (whole) gl.disable(gl.SCISSOR_TEST);
  else {
    // only the part of the picture that is on screen, and a little beyond, is printed again
    const top = clamp(-rect.top - 160, 0, geo.h), bottom = clamp(-rect.top + vh + 160, 0, geo.h);
    if (bottom <= top) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, Math.floor(canvas.height - bottom * geo.dpr), canvas.width, Math.ceil((bottom - top) * geo.dpr) + 1);
  }
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.place);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.her);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.aux);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex.grain);
  set({
    uPlace: 0, uHer: 1, uAux: 2, uGrain: 3,
    uView: [geo.w, geo.h, geo.dpr], uBufH: canvas.height, uSeam: geo.seam,
    uPlaceFit: geo.place, uPlaceSize: geo.placeSize, uHerFit: geo.her, uCrop: CROP,
    uDrift: still ? [0, 0, 0.37, 0.61] : [slid(5), slid(3), 0.37 + slid(-4), 0.61 + slid(-6)],
    uSpark: still ? [0, 0] : [hash(frame, 7), hash(frame, 11)],
    uGrainPx: geo.grainPx,
    uMouth: [lips[0] * MURMUR, lips[1] * MURMUR, lips[0] * MURMUR * 0.3, (0.5 * lips[0] + 0.2 * Math.abs(lips[1])) * MURMUR],
    uGaze: gaze, uLid: alive ? lidAt(t, gaze[1]) : 0, uHead: alive ? headAt(t) : [1, 0, 0, 0],
    'uTear[0]': cry[0], 'uWay[0]': cry[1],
    uRain: [clamp(geo.w / 900, 0.6, 1.5), tf % 600, still ? 0 : RAIN * (0.8 + 0.2 * Math.sin(tf * 0.37))],
    uSign: geo.sign, uFade: geo.fade, uInk: INK
  });
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  whole = false;
}
function tick(ms) {
  raf = 0;
  if (!seen || document.hidden) return;
  raf = requestAnimationFrame(tick);
  const now = ms / 1000;
  // if the machine cannot keep up, the picture is printed smaller and blown up a little more
  if (lastTick && ms - lastTick < 250) { pace = pace ? pace * 0.92 + (ms - lastTick) * 0.08 : ms - lastTick; ticks++; }
  lastTick = ms;
  if (!isTouch && ready && ticks > 120 && pace > 26 && shrink > 0.7) { shrink *= 0.8; ticks = 0; pace = 0; measure(); }
  const rect = section.getBoundingClientRect(), vh = window.innerHeight || 1;
  const her = rect.top + geo.seam;
  if (t00 < 0 && her < vh * 0.9 && rect.bottom > 0) t00 = now;
  // the room goes quiet as her half takes the screen, and finds its voice again when she is gone
  setHush(step01(vh * 0.92, vh * 0.3, her) * step01(vh * 0.12, vh * 0.55, rect.bottom));
  sayAt(t00 < 0 ? -1 : now - t00);
  const frame = Math.floor(now * FPS);
  if (frame === lastFrame) return;
  lastFrame = frame;
  draw(now);
}
function wake() { if (!raf && seen && !still && !document.hidden) { lastTick = 0; raf = requestAnimationFrame(tick); } }
function settle() { measure(); if (ready) draw(performance.now() / 1000); }

async function start() {
  build();
  const [painting, aux, place] = await Promise.all([load(PAINTING), load(AUX), load(PLACE)]);
  if (lost) return;
  tex.her = texture(cut(painting), true, false);
  tex.aux = texture(aux, true, false);
  tex.place = texture(place, true, false);
  geo.placeSize = [place.naturalWidth, place.naturalHeight];
  tex.grain = texture(makeGrain(), false, true);
  ready = true;
  settle();
  canvas.classList.add('is-live');
}

// her name waits until it is seen, then arrives
if (title && !still && 'IntersectionObserver' in window) {
  title.classList.add('wait');
  const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { title.classList.remove('wait'); title.classList.add('lit'); io.disconnect(); } }, { threshold: 0.2 });
  io.observe(title);
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    seen = entry.isIntersecting;
    if (seen) wake(); else { setHush(0); for (const p of script) p.el.classList.remove('on'); }
  }, { rootMargin: '40% 0px' }).observe(section);
} else { seen = true; wake(); }
if ('ResizeObserver' in window) new ResizeObserver(settle).observe(section);
else { let timer = 0; window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(settle, 160); }); }
document.addEventListener('visibilitychange', wake);
measure();
if (gl) start().catch(() => { lost = true; canvas.classList.remove('is-live'); });
})();
