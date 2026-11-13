(() => {
'use strict';

const ASPECT = 1672 / 941;
const LOOP = 110;
const IMG = '/falling-upwards.webp';
const AUX = '/falling-upwards-aux.png';

const section = document.querySelector('.canvas');
const canvas = document.getElementById('artwork-live');
const still = section && section.querySelector('.artwork');
const hint = document.getElementById('artwork-hint');
const titleCard = document.getElementById('title-card');
const floodCard = document.getElementById('title-flood');
const faceBtn = document.getElementById('face-toggle');
const cards = [];
function showCard(el, delay, hold) {
  if (!el) return;
  setTimeout(() => {
    el.classList.remove('leave'); el.classList.add('show', 'sliced-in');
    const c = cards.find((x) => x.el === el);
    if (c) c.until = performance.now() / 1000 + hold; else cards.push({ el, until: performance.now() / 1000 + hold });
  }, delay * 1000);
}
function showTitle(delay) { showCard(titleCard, delay, 7.2); }
function showFlood(delay) { showCard(floodCard, delay, 6.6); }
const soundBtn = document.getElementById('sound-toggle');
const pauseBtn = section && section.querySelector('.motion-toggle');
const dots = Array.from(document.querySelectorAll('.artwork-stage'));
const params = new URLSearchParams(location.search);
const viewerTitle = document.getElementById('viewer-title');
if (viewerTitle) {
  const sync = () => { if (viewerTitle.dataset.text !== viewerTitle.textContent) viewerTitle.dataset.text = viewerTitle.textContent; };
  sync();
  if ('MutationObserver' in window) new MutationObserver(sync).observe(viewerTitle, { childList: true, characterData: true, subtree: true });
}
// when the painting cannot move, the still one stays and the controls that would do nothing go away
function fallback() {
  if (canvas) { canvas.classList.remove('is-live'); if (canvas.parentNode) canvas.remove(); }
  if (section) section.classList.add('still');
  for (const el of [soundBtn, pauseBtn, document.getElementById('face-toggle'), document.getElementById('artwork-hint'), section && section.querySelector('.artwork-stages')]) if (el) el.hidden = true;
  for (const el of [titleCard, floodCard]) if (el) el.classList.remove('show', 'sliced-in', 'leave');
}
if (!section || !canvas || !still) return;
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && !params.has('t')) { fallback(); return; }

const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) { fallback(); return; }
let lost = false;
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; started = false; fallback(); }, false);
const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

const isTouch = matchMedia('(pointer: coarse)').matches;
const isMobile = isTouch && Math.min(innerWidth, innerHeight) < 900;
const lockedQuality = params.has('q');

/* ---------------------------------------------------------------- shaders */

const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=mod289(i); vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
`;

// regions of the painting, in painting uv with y up
const REGIONS = `
const float ASPECT = ${ASPECT.toFixed(6)};
const vec2 C_GIRL = vec2(0.26, 0.67),   R_GIRL = vec2(0.24, 0.36);
const vec2 C_PHONE = vec2(0.36, 0.60),  R_PHONE = vec2(0.13, 0.20);
const vec2 C_SMOKER = vec2(0.42, 0.21), R_SMOKER = vec2(0.15, 0.21);
const vec2 C_SWORD = vec2(0.72, 0.56),  R_SWORD = vec2(0.14, 0.31);
const vec2 C_DAGGER = vec2(0.88, 0.25), R_DAGGER = vec2(0.15, 0.19);
const vec2 C_PURPLE = vec2(0.66, 0.87), R_PURPLE = vec2(0.13, 0.17);
const vec2 C_JAWS = vec2(0.53, 0.70),   R_JAWS = vec2(0.13, 0.18);
const vec2 C_BLONDE = vec2(0.86, 0.83), R_BLONDE = vec2(0.09, 0.16);
const vec2 C_BOAT = vec2(0.525, 0.368), R_BOAT = vec2(0.032, 0.028);
const vec2 TIP = vec2(0.490, 0.129);
const vec2 SWORD_A = vec2(0.634, 0.564), SWORD_B = vec2(0.849, 0.809);
const vec2 DAGGER_A = vec2(0.807, 0.304), DAGGER_B = vec2(0.861, 0.230);
float ell(vec2 p, vec2 c, vec2 r, float soft){ float d = length((p - c) / r); return 1.0 - smoothstep(1.0 - soft, 1.0, d); }
vec2 mirrorUV(vec2 p){ vec2 m = mod(p, 2.0); return mix(m, 2.0 - m, step(1.0, m)); }
float lumOf(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

const QUAD_VS = `#version 300 es
precision highp float;
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const PAINT_FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uPaint, uAux, uDye, uVel, uReveal, uTrail;
uniform vec2 uFit, uPan, uParallax, uVelTexel;
uniform float uTime, uDyeMix, uInk, uInkReveal, uReturn, uPlaneAlpha, uExt, uMelt, uFluid, uEffects, uInkLod, uDark, uSlime, uFlash;
uniform vec2 uPointer;
uniform vec4 uRipples[8];
${NOISE}
${REGIONS}

vec2 motion(vec2 p, float t){
  vec2 d = vec2(0.0); float m;
  m = ell(p, C_GIRL, R_GIRL, 0.75);   d += (p - C_GIRL) * (0.006 * sin(t * 0.55)) * m;
  m = ell(p, C_SMOKER, R_SMOKER, 0.75); d += (p - C_SMOKER) * (0.005 * sin(t * 0.47 + 1.0)) * m + vec2(0.0015 * sin(t * 0.3 + 2.0), 0.0) * m;
  m = ell(p, C_SWORD, R_SWORD, 0.75);  d += vec2(0.004 * sin(t * 0.4 + 2.0), 0.003 * sin(t * 0.31)) * m;
  m = ell(p, C_DAGGER, R_DAGGER, 0.75); d += (p - C_DAGGER) * (0.006 * sin(t * 0.5 + 3.0)) * m;
  m = ell(p, C_PURPLE, R_PURPLE, 0.6); d += vec2(0.0015 * sin(p.y * 70.0 + t * 1.6), 0.0012 * sin(p.x * 60.0 - t * 1.3)) * m;
  m = ell(p, C_JAWS, R_JAWS, 0.6);     d.y += (p.y - C_JAWS.y) * 0.035 * (0.5 + 0.5 * sin(t * 0.33)) * m;
  m = ell(p, C_BLONDE, R_BLONDE, 0.75); d += (p - C_BLONDE) * (0.005 * sin(t * 0.43 + 4.0)) * m;
  // the white figures drift upwards, weightless
  m = ell(p, vec2(0.085, 0.88), vec2(0.075, 0.11), 0.85); d += vec2(0.002 * sin(t * 0.25), 0.006 * (0.5 + 0.5 * sin(t * 0.3))) * m;
  m = ell(p, vec2(0.10, 0.63), vec2(0.09, 0.09), 0.85);   d += vec2(0.002 * sin(t * 0.25 + 2.0), 0.005 * (0.5 + 0.5 * sin(t * 0.27 + 2.0))) * m;
  m = ell(p, vec2(0.95, 0.90), vec2(0.06, 0.12), 0.85);   d += vec2(0.002 * sin(t * 0.25 + 4.0), 0.006 * (0.5 + 0.5 * sin(t * 0.33 + 4.0))) * m;
  m = ell(p, vec2(0.95, 0.55), vec2(0.05, 0.10), 0.85);   d += vec2(0.002 * sin(t * 0.25 + 1.0), 0.005 * (0.5 + 0.5 * sin(t * 0.29 + 1.0))) * m;
  // the boat rocks
  m = ell(p, C_BOAT, R_BOAT, 0.5);
  float a = 0.05 * sin(t * 0.8);
  vec2 q = (p - C_BOAT) * vec2(ASPECT, 1.0);
  vec2 rq = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  d += (rq - q) / vec2(ASPECT, 1.0) * m;
  return d;
}

float lumAt(vec2 p, float lod){ return lumOf(textureLod(uPaint, mirrorUV(p), lod).rgb); }
float edgeAt(vec2 p, float lod){
  vec2 e = vec2(1.0 / 1672.0, 1.0 / 941.0) * exp2(lod) * 0.9;
  float tl = lumAt(p + vec2(-e.x, e.y), lod), tc = lumAt(p + vec2(0.0, e.y), lod), tr = lumAt(p + e, lod);
  float ml = lumAt(p - vec2(e.x, 0.0), lod), mr = lumAt(p + vec2(e.x, 0.0), lod);
  float bl = lumAt(p - e, lod), bc = lumAt(p - vec2(0.0, e.y), lod), br = lumAt(p + vec2(e.x, -e.y), lod);
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

void main(){
  float t = uTime;
  vec2 pu = (vUv - 0.5) * uFit + 0.5 + uPan;
  vec2 outside = max(abs(pu - 0.5) - 0.5, 0.0);
  float ext = outside.x + outside.y;
  vec3 aux = texture(uAux, mirrorUV(pu)).rgb;
  float depth = aux.r, water = aux.g, gold = aux.b;

  // parallax, the near things move more
  pu += (depth - 0.5) * uParallax;

  // every figure has its own slow movement
  pu += motion(pu, t) * uEffects;

  // the painting as liquid, when the fluid is not available
  if (uMelt > 0.001) {
    vec2 q = pu * 3.0; float e = 0.02;
    float n = snoise(vec3(q, t * 0.1));
    vec2 g = vec2(snoise(vec3(q + vec2(0.0, e), t * 0.1)) - n, -(snoise(vec3(q + vec2(e, 0.0), t * 0.1)) - n)) / e;
    pu += g * 0.012 * uMelt;
  }

  // water
  vec2 wd = vec2(0.0);
  {
    float n1 = snoise(vec2(pu.x * 30.0, pu.y * 140.0 - t * 0.9));
    float n2 = snoise(vec2(pu.x * 55.0 + t * 0.2, pu.y * 260.0 + t * 1.7));
    wd += vec2(n1 * 0.002 + n2 * 0.0007, n1 * 0.0032 + n2 * 0.0012) * water * uEffects;
    vec2 vel = texture(uVel, vUv).xy * uVelTexel;
    wd += vel * uFluid * (0.03 + 0.3 * water);
    for (int i = 0; i < 8; i++) {
      vec4 rp = uRipples[i];
      float age = t - rp.z;
      if (rp.w > 0.0 && age > 0.0 && age < 4.0) {
        vec2 q = (pu - rp.xy) * vec2(ASPECT, 1.0);
        float r = length(q);
        float ring = r - age * 0.11;
        float w = exp(-ring * ring * 1200.0) * exp(-age * 1.0) * rp.w;
        wd += (q / max(r, 1e-4)) * w * 0.006 * water * sin(ring * 260.0);
      }
    }
    vec2 q = (pu - C_BOAT) * vec2(ASPECT, 1.0);
    float r = length(q);
    float ph = fract(t * 0.11);
    float ring = r - ph * 0.4;
    float w = exp(-ring * ring * 3000.0) * (1.0 - ph) * (1.0 - ph);
    wd += (q / max(r, 1e-4)) * w * 0.0035 * water * uEffects;
  }
  pu += wd;

  float lod = ext * 10.0;
  vec3 col = textureLod(uPaint, mirrorUV(pu), lod).rgb;
  float lum = lumOf(col);

  if (uEffects > 0.001) {
    vec3 fx = vec3(0.0);
    // light on the water
    float sh = snoise(vec2(pu.x * 80.0 + t * 0.1, pu.y * 9.0 - t * 0.25));
    fx += col * water * sh * 0.35;
    // the gold lights flicker like candles
    float fl = 0.5 + 0.5 * snoise(vec2(pu.x * 40.0 + t * 2.3, pu.y * 40.0 + t * 1.1));
    fx += col * gold * (fl * 1.3 - 0.35);
    // smoke rises from the cigarette
    {
      vec2 q = pu - TIP; float h = q.y; float x = q.x * ASPECT;
      if (h > 0.0 && h < 0.55) {
        float xc = 0.03 * sin(h * 14.0 - t * 0.7) + 0.14 * h * h + 0.012 * snoise(vec2(h * 6.0, t * 0.3));
        float width = 0.012 + 0.11 * h;
        float core = exp(-pow((x - xc) / width, 2.0));
        float n = snoise(vec3(x * 20.0, h * 12.0 - t * 0.45, t * 0.15)) * 0.5 + 0.5;
        float n2 = snoise(vec3(x * 45.0, h * 30.0 - t * 0.9, t * 0.25)) * 0.5 + 0.5;
        float smoke = core * smoothstep(0.0, 0.02, h) * exp(-h * 3.2) * (n * 0.8 + n2 * 0.45) * 0.5;
        fx += smoke * vec3(0.75, 0.8, 0.9);
      }
    }
    // the web over the purple faces catches the light as you move
    {
      float m = ell(pu, C_PURPLE, R_PURPLE, 0.5);
      float band = exp(-pow((dot(pu - C_PURPLE, normalize(vec2(1.0, 0.6))) - (uPointer.x - 0.5) * 0.35) / 0.035, 2.0));
      fx += m * smoothstep(0.55, 0.95, lum) * band * 0.55 * vec3(0.95, 0.85, 1.0);
    }
    // a glint runs along the sword, and along the dagger
    {
      vec2 ab = (SWORD_B - SWORD_A) * vec2(ASPECT, 1.0); vec2 ap = (pu - SWORD_A) * vec2(ASPECT, 1.0);
      float s = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0); float dist = length(ap - ab * s);
      float ph = fract(t / 7.0); float gp = ph * 1.4 - 0.2;
      float glint = exp(-pow((s - gp) / 0.07, 2.0)) * exp(-pow(dist / 0.007, 2.0)) * smoothstep(0.4, 0.8, lum) * step(ph, 0.75);
      fx += glint * 1.4 * vec3(1.0, 0.95, 0.8);
      ab = (DAGGER_B - DAGGER_A) * vec2(ASPECT, 1.0); ap = (pu - DAGGER_A) * vec2(ASPECT, 1.0);
      s = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0); dist = length(ap - ab * s);
      ph = fract(t / 9.0 + 0.4); gp = ph * 1.4 - 0.2;
      glint = exp(-pow((s - gp) / 0.1, 2.0)) * exp(-pow(dist / 0.005, 2.0)) * smoothstep(0.4, 0.8, lum) * step(ph, 0.75);
      fx += glint * 1.2 * vec3(1.0, 0.95, 0.8);
    }
    // the jaws pulse red
    {
      float m = ell(pu, C_JAWS, R_JAWS, 0.5);
      float red = smoothstep(0.15, 0.5, col.r - max(col.g, col.b));
      float beat = pow(0.5 + 0.5 * sin(t * 1.3), 6.0);
      fx += col * m * red * beat * 0.4;
    }
    col += fx * uEffects;
  }

  // liquid
  if (uDyeMix > 0.001) {
    vec3 dye = texture(uDye, vUv).rgb;
    col = mix(col, dye, uDyeMix);
  }

  // the dark: the painting exists only where it is lit; where it is not, its highlights glitter faintly
  float light = 1.0;
  if (uDark > 0.001) {
    vec2 R2 = texture(uReveal, vUv).rg;
    float R = R2.r;
    float trail = 1.0 - exp(-texture(uTrail, vUv).r * 0.8);
    light = mix(1.0, pow(smoothstep(0.0, 1.0, R), 1.3), uDark);
    float hand = pow(smoothstep(0.0, 1.0, R2.g), 1.3);
    float tw = snoise(vec2(pu.x * 110.0 + t * 0.6, pu.y * 110.0 - t * 0.45)) * 0.5 + 0.5;
    float glitter = 0.075 * lum * lum * (0.35 + 0.65 * tw * tw);
    vec3 lit = col * light + col * glitter * (1.0 - light);
    lit += vec3(0.10, 0.06, 0.025) * hand * (1.0 - hand) * 2.2 * (0.3 + lum);
    lit += vec3(1.0, 0.9, 0.68) * pow(trail, 1.5) * 0.34 * uSlime * (1.0 - 0.6 * light);
    col = lit;
  }

  // ink: the drawing of the painting, lit on its own; the colours show through where the light is
  if (uInk > 0.001) {
    vec2 q = pu + vec2(snoise(vec2(pu.x * 40.0, pu.y * 40.0 + t * 0.7)), snoise(vec2(pu.x * 40.0 + 5.0, pu.y * 40.0 - t * 0.6))) * 0.0006;
    float lines = smoothstep(0.35, 0.85, edgeAt(q, uInkLod)) * smoothstep(0.15, 0.5, edgeAt(q, uInkLod - 1.0));
    float bright = smoothstep(0.88, 1.0, lumAt(q, 0.5)) * 0.35;
    float ink = max(lines, bright) * (1.0 - 0.45 * water);
    float rev = uInkReveal * 1.6 - length((pu - 0.5) * vec2(ASPECT, 1.0)) * 0.7 - (snoise(pu * 5.0) * 0.5 + 0.5) * 0.5;
    ink *= smoothstep(0.0, 0.3, rev);
    vec3 inkCol = vec3(0.92, 0.95, 1.0) * ink * 1.25 + vec3(0.004, 0.005, 0.01);
    col = mix(col, inkCol, uInk * (1.0 - 0.8 * light));
  }

  // beyond the painting's edge (upright phones): a darkened reflection of it
  if (ext > 0.0) col *= exp(-ext * 8.0) * uExt;

  col *= 1.0 + uFlash * 0.4;
  fragColor = vec4(col * uPlaneAlpha, 1.0);
}`;

const POINTS_VS = `#version 300 es
precision highp float;
in vec2 aUV; in float aRand;
uniform sampler2D uPaint, uAux, uDye, uReveal;
uniform vec2 uFit, uPan;
uniform float uTime, uLift, uRise, uTorus, uTorusMorph, uHome, uColorRestore, uInkPts, uHomeSize, uAwaySize, uInkLod, uDpr, uDark;
uniform mat4 uVP;
out vec3 vCol; out float vRound;
${NOISE}
${REGIONS}
float lumAt(vec2 p, float lod){ return lumOf(textureLod(uPaint, mirrorUV(p), lod).rgb); }
float edgeAt(vec2 p, float lod){
  vec2 e = vec2(1.0 / 1672.0, 1.0 / 941.0) * exp2(lod) * 0.9;
  float tl = lumAt(p + vec2(-e.x, e.y), lod), tc = lumAt(p + vec2(0.0, e.y), lod), tr = lumAt(p + e, lod);
  float ml = lumAt(p - vec2(e.x, 0.0), lod), mr = lumAt(p + vec2(e.x, 0.0), lod);
  float bl = lumAt(p - e, lod), bc = lumAt(p - vec2(0.0, e.y), lod), br = lumAt(p + vec2(e.x, -e.y), lod);
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}
vec4 torus(vec2 uv, float t, float morph){
  float a = uv.x * 6.2831853, b = uv.y * 6.2831853;
  float phi = 0.7853982 + morph;
  vec4 P = vec4(cos(a) * cos(phi), sin(a) * cos(phi), cos(b) * sin(phi), sin(b) * sin(phi));
  float c, s;
  c = cos(t * 0.21); s = sin(t * 0.21); P = vec4(P.x, P.y, P.z * c - P.w * s, P.z * s + P.w * c);
  c = cos(t * 0.09); s = sin(t * 0.09); P = vec4(P.x * c - P.w * s, P.y, P.z, P.x * s + P.w * c);
  c = cos(t * 0.13); s = sin(t * 0.13); P = vec4(P.x * c - P.y * s, P.x * s + P.y * c, P.z, P.w);
  float k = 2.25 / (2.0 - P.w);
  return vec4(P.xyz * k, P.w);
}
void main(){
  vec2 uv = aUV;
  float depth = textureLod(uAux, uv, 0.0).r;
  vec2 suv = (uv - 0.5 - uPan) / uFit + 0.5;
  vec2 ndcHome = suv * 2.0 - 1.0;

  float s = smoothstep(0.0, 1.0, clamp((uLift - aRand * 0.45) / 0.55, 0.0, 1.0));
  float sT = smoothstep(0.0, 1.0, clamp((uTorus - aRand * 0.5) / 0.5, 0.0, 1.0));
  float sH = smoothstep(0.0, 1.0, clamp((uHome - aRand * 0.5) / 0.5, 0.0, 1.0));

  vec3 p = vec3((uv.x - 0.5) * ASPECT, uv.y - 0.5, 0.0);
  p.z += (depth - 0.5) * 0.7 * s;
  float riseK = clamp(uRise / 1.5, 0.0, 1.0);
  float speed = 0.55 + depth * 0.6 + 0.25 * snoise(uv * 4.0);
  p.y += uRise * speed * s;
  p.z += snoise(uv * 3.0 + 1.7) * 0.9 * s * riseK;
  vec3 q = p * 1.1 + vec3(0.0, -uTime * 0.06, uTime * 0.04);
  p += vec3(snoise(q), snoise(q + 31.4), snoise(q + 73.1)) * (0.03 + 0.16 * riseK) * s;

  vec4 tor = torus(uv, uTime, uTorusMorph);
  p = mix(p, tor.xyz, sT);

  vec4 clip = uVP * vec4(p, 1.0);
  float w = max(clip.w, 0.05);
  vec3 ndc3 = clip.xyz / w;
  float away = s * (1.0 - sH);
  vec3 ndc = mix(vec3(ndcHome, 0.0), ndc3, away);
  gl_Position = vec4(ndc, 1.0);
  if (clip.w < 0.05 && away > 0.5) gl_Position = vec4(3.0, 3.0, 3.0, 1.0);

  float size3 = clamp(uAwaySize * (1.0 + 0.6 * (1.0 - riseK) * (1.0 - sT)) / w, 1.3, 16.0) * uDpr;
  gl_PointSize = mix(uHomeSize, size3, away);

  vec3 cPaint = textureLod(uPaint, uv, 0.0).rgb;
  vec3 cDye = textureLod(uDye, suv, 0.0).rgb;
  vec3 col = mix(cDye, cPaint, uColorRestore);
  col *= (1.0 + 0.35 * away) * (1.0 + sT * 0.35 * tor.w);
  float R = textureLod(uReveal, suv, 0.0).r;
  col *= mix(1.0, pow(smoothstep(0.0, 1.0, R), 1.3) + 0.03, uDark * (1.0 - s));
  if (uInkPts > 0.001) {
    float lines = smoothstep(0.35, 0.85, edgeAt(uv, uInkLod)) * smoothstep(0.15, 0.5, edgeAt(uv, uInkLod - 1.0));
    float ink = max(lines, smoothstep(0.88, 1.0, lumOf(cPaint)) * 0.35);
    col = mix(col, vec3(0.92, 0.95, 1.0) * ink * 1.25, uInkPts);
  }
  vCol = col; vRound = away;
}`;

const POINTS_FS = `#version 300 es
precision highp float;
in vec3 vCol; in float vRound; uniform float uAlpha; out vec4 o;
void main(){
  if (vRound > 0.02) { vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; }
  o = vec4(vCol, uAlpha);
}`;

// fluid
const FLUID_HEAD = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform vec2 uTexel;`;
const SPLAT_FS = `${FLUID_HEAD}
uniform sampler2D uTarget; uniform float uAspect, uRadius; uniform vec3 uColor; uniform vec2 uPoint;
void main(){ vec2 p = vUv - uPoint; p.x *= uAspect; vec3 s = exp(-dot(p, p) / uRadius) * uColor; o = vec4(texture(uTarget, vUv).xyz + s, 1.0); }`;
const FORCE_FS = `${FLUID_HEAD}
uniform sampler2D uVelocity; uniform float uTime, uStrength, uAspect;
${NOISE}
void main(){
  vec2 p = vec2(vUv.x * uAspect, vUv.y) * 2.4; float e = 0.02;
  float n = snoise(vec3(p, uTime * 0.12));
  float nx = snoise(vec3(p + vec2(e, 0.0), uTime * 0.12)), ny = snoise(vec3(p + vec2(0.0, e), uTime * 0.12));
  vec2 curl = vec2(ny - n, -(nx - n)) / e;
  o = vec4(texture(uVelocity, vUv).xy + curl * uStrength, 0.0, 1.0);
}`;
const ADVECT_FS = `${FLUID_HEAD}
uniform sampler2D uVelocity, uSource; uniform float uDt, uDissipation;
void main(){ vec2 c = vUv - uDt * texture(uVelocity, vUv).xy * uTexel; o = texture(uSource, c) / (1.0 + uDissipation * uDt); }`;
const DIV_FS = `${FLUID_HEAD}
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y, B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vUv.x - uTexel.x < 0.0) L = -C.x; if (vUv.x + uTexel.x > 1.0) R = -C.x;
  if (vUv.y + uTexel.y > 1.0) T = -C.y; if (vUv.y - uTexel.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;
const CURL_FS = `${FLUID_HEAD}
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y, R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x, B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;
const VORT_FS = `${FLUID_HEAD}
uniform sampler2D uVelocity, uCurl; uniform float uStrength, uDt;
void main(){
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x, B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4; f *= uStrength * C; f.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + f * uDt;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`;
const PRESSURE_FS = `${FLUID_HEAD}
uniform sampler2D uPressure, uDivergence;
void main(){
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x, B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float d = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`;
const GRADIENT_FS = `${FLUID_HEAD}
uniform sampler2D uPressure, uVelocity;
void main(){
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x, B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  o = vec4(texture(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
}`;
const SCALE_FS = `${FLUID_HEAD}
uniform sampler2D uTexture; uniform float uValue;
void main(){ o = uValue * texture(uTexture, vUv); }`;

// the light: what has been seen, and how it fades
const REVEAL_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uPrev, uVel, uTrail; uniform vec3 uPool; uniform vec2 uVelTexel, uTrailTexel;
uniform float uDecay, uUp, uMotion, uMotionLo, uMotionHi, uSlime, uFlood, uAspect, uTime;
${NOISE}
void main(){
  vec2 prev2 = texture(uPrev, vUv).rg;
  float prev = prev2.r;
  vec2 d = (vUv - uPool.xy) * vec2(uAspect, 1.0);
  float wob = snoise(vec2(vUv.x * uAspect * 5.0 + uTime * 0.13, vUv.y * 5.0 - uTime * 0.1));
  float r0 = uPool.z * (1.0 + 0.16 * wob);
  float hand = 1.0 - smoothstep(r0 * 0.2, r0, length(d));
  float handR = hand > prev2.g ? prev2.g + (hand - prev2.g) * uUp : prev2.g * uDecay;
  float target = hand;
  if (uMotion > 0.0) { vec2 v = texture(uVel, vUv).xy; target = max(target, smoothstep(uMotionLo, uMotionHi, length(v)) * uMotion); }
  if (uSlime > 0.0) {
    vec2 e = uTrailTexel * 2.5;
    float t5 = texture(uTrail, vUv).r + texture(uTrail, vUv + vec2(e.x, 0.0)).r + texture(uTrail, vUv - vec2(e.x, 0.0)).r + texture(uTrail, vUv + vec2(0.0, e.y)).r + texture(uTrail, vUv - vec2(0.0, e.y)).r;
    float tr = 1.0 - exp(-t5 * 0.2 * 0.8);
    target = max(target, smoothstep(0.06, 0.5, tr) * uSlime);
  }
  target = max(target, uFlood);
  float r = target > prev ? prev + (target - prev) * uUp : prev * uDecay;
  o = vec4(clamp(r, 0.0, 1.0), clamp(handR, 0.0, 1.0), 0.0, 1.0);
}`;

// the slime: blind agents that feel their way along the painting and leave a trail behind them
const FOOD_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uPaint; uniform vec2 uFit, uPan;
${NOISE}
${REGIONS}
void main(){
  vec2 pu = (vUv - 0.5) * uFit + 0.5 + uPan;
  vec2 e = vec2(0.0035, 0.006);
  float l = lumOf(textureLod(uPaint, mirrorUV(pu), 2.0).rgb);
  float gx = lumOf(textureLod(uPaint, mirrorUV(pu + vec2(e.x, 0.0)), 2.0).rgb) - lumOf(textureLod(uPaint, mirrorUV(pu - vec2(e.x, 0.0)), 2.0).rgb);
  float gy = lumOf(textureLod(uPaint, mirrorUV(pu + vec2(0.0, e.y)), 2.0).rgb) - lumOf(textureLod(uPaint, mirrorUV(pu - vec2(0.0, e.y)), 2.0).rgb);
  o = vec4(l * 0.12 + (abs(gx) + abs(gy)) * 2.5, 0.0, 0.0, 1.0);
}`;
const AGENT_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uAgents, uTrail, uFoodTex; uniform vec2 uSpawn;
uniform float uDt, uTime, uAspect, uReset, uSpeed, uSense, uSenseAngle, uTurn, uFood, uSpawnR;
${NOISE}
float sense(vec2 p, float ang){
  vec2 s = p + vec2(cos(ang) / uAspect, sin(ang)) * uSense;
  float tr = 1.0 - exp(-texture(uTrail, s).r * 0.8);
  return tr + texture(uFoodTex, s).r * uFood;
}
void main(){
  vec4 a = texture(uAgents, vUv);
  float h1 = hash12(vUv * 913.7), h2 = hash12(vUv * 311.3 + 5.1), h3 = hash12(vUv * 77.7 + 9.3);
  if (uReset > 0.5) {
    float ang = h1 * 6.2831853; float rad = sqrt(h2) * uSpawnR;
    o = vec4(uSpawn + vec2(cos(ang) * rad / uAspect, sin(ang) * rad), h3 * 6.2831853, h1);
    return;
  }
  vec2 p = a.xy; float ang = a.z;
  float sL = sense(p, ang + uSenseAngle), sF = sense(p, ang), sR = sense(p, ang - uSenseAngle);
  float rnd = hash12(vUv * 1000.0 + fract(uTime * 0.37) * 100.0);
  float turn = uTurn * uDt;
  if (sF > sL && sF > sR) { ang += (rnd - 0.5) * 0.3 * turn; }
  else if (sF < sL && sF < sR) { ang += (rnd < 0.5 ? -1.0 : 1.0) * turn; }
  else if (sL > sR) { ang += turn; }
  else { ang -= turn; }
  vec2 dir = vec2(cos(ang) / uAspect, sin(ang));
  p += dir * uSpeed * uDt * (0.7 + 0.6 * a.w);
  if (p.x < 0.003 || p.x > 0.997 || p.y < 0.003 || p.y > 0.997) { p = clamp(p, 0.003, 0.997); ang = hash12(vUv * 53.1 + fract(uTime)) * 6.2831853; }
  ang = mod(ang, 6.2831853);
  o = vec4(p, ang, a.w);
}`;
const DEPOSIT_VS = `#version 300 es
precision highp float;
layout(location = 0) in float aIdx; uniform sampler2D uAgents; uniform vec2 uAgentsSize;
void main(){
  vec2 tc = (vec2(mod(aIdx, uAgentsSize.x), floor(aIdx / uAgentsSize.x)) + 0.5) / uAgentsSize;
  vec2 p = texture(uAgents, tc).xy;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;
const DEPOSIT_FS = `#version 300 es
precision highp float; uniform float uDeposit; out vec4 o;
void main(){ o = vec4(uDeposit, 0.0, 0.0, 1.0); }`;
const TRAIL_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTrail; uniform vec2 uTexel; uniform float uDecay;
void main(){
  float s = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) s += texture(uTrail, vUv + vec2(float(x), float(y)) * uTexel).r;
  o = vec4(s / 9.0 * uDecay, 0.0, 0.0, 1.0);
}`;

// post
const BRIGHT_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uScene; uniform vec2 uTexel; uniform float uThreshold;
void main(){
  vec3 c = texture(uScene, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture(uScene, vUv + uTexel * vec2(1.0, -1.0)).rgb
         + texture(uScene, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture(uScene, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  o = vec4(c * smoothstep(uThreshold, uThreshold + 0.35, l), 1.0);
}`;
const BLUR_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uTex; uniform vec2 uDir;
void main(){
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += (texture(uTex, vUv + uDir * 1.3846153846).rgb + texture(uTex, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uTex, vUv + uDir * 3.2307692308).rgb + texture(uTex, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  o = vec4(c, 1.0);
}`;
const POST_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom; uniform float uBloomAmt, uFade, uTime, uGrain; uniform vec2 uRes;
${NOISE}
void main(){
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uBloom, vUv).rgb;
  c += b * uBloomAmt;
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 100.0) - 0.5;
  c += g * uGrain;
  vec2 v = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  c *= 1.0 - 0.3 * smoothstep(0.35, 1.3, length(v));
  c *= uFade;
  o = vec4(c, 1.0);
}`;

/* ---------------------------------------------------------------- gl helpers */

function compile(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
  return sh;
}
class Program {
  constructor(vs, fs) {
    this.p = gl.createProgram();
    gl.attachShader(this.p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(this.p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(this.p);
    if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.p));
    this.u = {};
    const n = gl.getProgramParameter(this.p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(this.p, i);
      const name = info.name.replace('[0]', '');
      this.u[name] = { loc: gl.getUniformLocation(this.p, info.name), type: info.type, size: info.size };
    }
  }
  use() { gl.useProgram(this.p); return this; }
  set(vals) {
    for (const k in vals) {
      const u = this.u[k]; if (!u) continue;
      const v = vals[k];
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
        case gl.INT: case gl.SAMPLER_2D: gl.uniform1i(u.loc, v); break;
      }
    }
    return this;
  }
}

const quadBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
const quadVao = gl.createVertexArray();
gl.bindVertexArray(quadVao);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

function drawQuad(target) {
  if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.width, target.height); }
  else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
  gl.bindVertexArray(quadVao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}

function createTexture(w, h, internal, format, type, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  return tex;
}
function createFBO(w, h, internal, format, type, filter, depth) {
  const texture = createTexture(w, h, internal, format, type, filter);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  let rb = null;
  if (depth) {
    rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return {
    texture, fbo, rb, width: w, height: h, ok, texel: [1 / w, 1 / h],
    attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
    dispose() { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); if (rb) gl.deleteRenderbuffer(rb); }
  };
}
function createDoubleFBO(w, h, internal, format, type, filter) {
  let a = createFBO(w, h, internal, format, type, filter), b = createFBO(w, h, internal, format, type, filter);
  return {
    width: w, height: h, texel: [1 / w, 1 / h], ok: a.ok && b.ok,
    get read() { return a; }, get write() { return b; },
    swap() { const t = a; a = b; b = t; },
    dispose() { a.dispose(); b.dispose(); }
  };
}

function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
function imageTexture(img, mips) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, img);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mips) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  return tex;
}
const blackTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, blackTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; }

/* ---------------------------------------------------------------- math */

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function lookAt(eye, c, up) {
  let zx = eye[0] - c[0], zy = eye[1] - c[1], zz = eye[2] - c[2];
  let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return [xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1];
}
function mul(a, b) {
  const o = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    o[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
  }
  return o;
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ramp = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;

/* ---------------------------------------------------------------- state */

const progs = {};
let paintTex, auxTex;
let scene, bloomA, bloomB;
let fluid = null;
let fluidOK = false;
let reveal = null;
let slime = null;
let slimeStale = true;
let slimeSkip = false;
const pool = { x: 0.5, y: 0.5, r: 0.26 };
const face = { on: false, wanted: false, loading: false, x: 0.5, y: 0.5, size: 0.2, seen: -10, lastDetect: 0, detector: null, video: null, stream: null };
let points = { vao: null, buf: null, count: 0, cols: 0, homeSize: 2 };
let fit = [1, 1], maxPan = [0, 0];
let renderScale = 1;
const quality = { scale: 1, pointFrac: 1, level: 0 };
let portrait = false;

const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, dx: 0, dy: 0, down: false, moved: false, lastMove: 0, lastRipple: 0 };
const look = { parX: 0, parY: 0, panX: 0, panY: 0, tParX: 0, tParY: 0, tPanX: 0, tPanY: 0, yaw: 0, pitch: 0 };
let gyro = { on: false, gamma: 0, beta: 0, asked: false, rx: 0, ry: 0 };
const ripples = new Float32Array(32);
let rippleIdx = 0;

let T = params.has('t') ? parseFloat(params.get('t')) : 0;
let lastT = T - 0.0001;
let paused = false;
let lastNow = 0;
let fade = 0;
let fadeTarget = 1;
let introStart = -1;
let jumpTo = -1;
let dyeStale = true;
let frameEma = 16;
let qualityTimer = 0;
let hintTimer = 0;
let started = false;
let visible = true;
let lastScroll = -10;
window.addEventListener('scroll', () => { lastScroll = performance.now() / 1000; }, { passive: true });

/* ---------------------------------------------------------------- audio */

let audio = null;
const audioOn = () => audio && audio.on;
// lower down she speaks, and the room goes quiet for her
let hush = 0;
window.addEventListener('rodievis:hush', (e) => { hush = clamp(Number(e.detail) || 0, 0, 1); if (audio && audio.on) audio.level(0.5); });
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.37;
  const fb = ctx.createGain(); fb.gain.value = 0.42;
  const fbFilter = ctx.createBiquadFilter(); fbFilter.type = 'lowpass'; fbFilter.frequency.value = 1400;
  delay.connect(fb); fb.connect(fbFilter); fbFilter.connect(delay);
  const wet = ctx.createGain(); wet.gain.value = 0.35; delay.connect(wet); wet.connect(master);
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master); bus.connect(delay);
  // drone
  const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 300; filter.Q.value = 0.9; filter.connect(bus);
  const voices = [[55, 'sine', 0.26], [82.41, 'sine', 0.11], [110.3, 'triangle', 0.05], [164.6, 'sine', 0.035]];
  for (const [f, type, g] of voices) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const gain = ctx.createGain(); gain.gain.value = g;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = f * 0.004;
    lfo.connect(lfoGain); lfoGain.connect(o.frequency); lfo.start();
    o.connect(gain); gain.connect(filter); o.start();
  }
  // water
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
  const waterGain = ctx.createGain(); waterGain.gain.value = 0.02;
  const wl = ctx.createOscillator(); wl.frequency.value = 0.09; const wlg = ctx.createGain(); wlg.gain.value = 0.012;
  wl.connect(wlg); wlg.connect(waterGain.gain); wl.start();
  noise.connect(bp); bp.connect(waterGain); waterGain.connect(bus); noise.start();
  const a = {
    ctx, master, filter, waterGain, bus, on: false, stage: 0,
    chime(freq, gain, dur) {
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.01;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const g2 = ctx.createGain(); g2.gain.value = 0.25;
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(bus);
      o.start(t0); o2.start(t0); o.stop(t0 + dur); o2.stop(t0 + dur);
    },
    ring() {
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 425;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 850; const g2 = ctx.createGain(); g2.gain.value = 0.2;
      const am = ctx.createOscillator(); am.frequency.value = 25; const amg = ctx.createGain(); amg.gain.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0;
      am.connect(amg); amg.connect(g.gain);
      const env = ctx.createGain(); env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(0.09, t0 + 0.03); env.gain.setValueAtTime(0.09, t0 + 0.95); env.gain.linearRampToValueAtTime(0, t0 + 1.05);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(env); env.connect(bus);
      o.start(t0); o2.start(t0); am.start(t0); o.stop(t0 + 1.1); o2.stop(t0 + 1.1); am.stop(t0 + 1.1);
    },
    setStage(s, force) {
      if (s === a.stage && !force) return;
      a.stage = s;
      const cut = [0, 300, 520, 980, 1500, 760, 640, 1300][s];
      filter.frequency.setTargetAtTime(cut, ctx.currentTime, 2.5);
      waterGain.gain.setTargetAtTime([0, 0.022, 0.03, 0.008, 0.004, 0.006, 0.01, 0.016][s], ctx.currentTime, 2);
      if (!force) a.chime([0, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99][s], s === 7 ? 0.11 : 0.07, s === 7 ? 8 : 5);
    },
    enable(on) {
      a.on = on;
      if (on) ctx.resume();
      a.level(on ? 1.5 : 0.4);
    },
    level(tau) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(a.on ? 0.55 * (1 - hush) : 0, ctx.currentTime, tau);
    }
  };
  return a;
}
function toggleSound(on) {
  if (!audio) { audio = makeAudio(); if (!audio) return; audio.setStage(stageOf(T), true); }
  audio.enable(on);
  if (soundBtn) { soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); soundBtn.textContent = on ? 'Chut' : 'Écoute'; }
}

/* ---------------------------------------------------------------- timeline */

function stageOf(t) { return t < 22 ? 1 : t < 40 ? 2 : t < 56 ? 3 : t < 72 ? 4 : t < 82 ? 5 : t < 100 ? 6 : 7; }
const STAGE_START = [0, 0, 22, 40, 56, 72, 82, 100];

function computeState(t) {
  const s = {};
  s.stage = stageOf(t);
  s.effects = t < 40 ? 1 : t < 82 ? 0 : ramp(t, 82, 86);
  s.dyeMix = (t < 22 || t >= 40) ? 0 : ramp(t, 22, 23.5);
  s.melt = (t < 22 || t >= 40) ? 0 : ease(ramp(t, 23, 31)) * (1 - ease(ramp(t, 35, 39)));
  s.planeAlpha = t < 39 ? 1 : t < 40 ? 1 - ramp(t, 39, 40) : t < 74 ? 0 : ramp(t, 74, 76.5);
  s.pointsAlpha = t < 38 ? 0 : t < 40 ? ramp(t, 38, 39.5) : t < 74.5 ? 1 : 1 - ramp(t, 74.5, 77);
  s.lift = t < 40 ? 0 : ramp(t, 40, 50);
  s.rise = t < 40 ? 0 : ease(ramp(t, 41, 56)) * 1.5;
  s.colorRestore = t < 40 ? 0 : ramp(t, 43, 51);
  s.torus = t < 54 ? 0 : ramp(t, 54, 60);
  s.torusMorph = 0.32 * Math.sin((t - 56) * 0.22);
  s.inkPts = t < 69 ? 0 : ramp(t, 69.5, 72.5);
  s.home = t < 70 ? 0 : ramp(t, 71, 75.5);
  s.ink = t < 74 ? 0 : t < 82 ? 1 : 1 - ramp(t, 82, 86.5);
  s.return = 0;
  s.motionLight = (t < 22 || t >= 40) ? 0 : ramp(t, 22, 24.5) * (1 - ramp(t, 38, 40));
  s.slime = t < 82 ? 0 : t < 100 ? 1 : 1 - ramp(t, 100, 102.5);
  s.flood = t < 100 ? 0 : t < 108 ? ease(ramp(t, 100, 101.4)) : 1 - ramp(t, 108, 108.6);
  s.flash = t < 100 ? 0 : ease(ramp(t, 100, 100.9)) * (1 - ease(ramp(t, 100.9, 103.5)));
  s.tau = t < 22 ? 2.8 : t < 40 ? 0.8 : t < 108 ? 2.8 : 0.45;
  s.poolR = t < 22 ? 0.26 : t < 40 ? 0.34 : t < 82 ? 0.26 : t < 100 ? 0.2 : 0.26;
  s.ext = !portrait ? 1 : (t < 40 ? 1 : t < 42 ? 1 - ramp(t, 40, 42) : t < 82 ? 0 : ramp(t, 82, 86));
  const bl = [0, 0.32, 0.28, 0.5, 0.55, 0.7, 0.45, 0.45][s.stage];
  s.bloom = bl;
  s.grain = s.stage >= 3 && s.stage <= 4 ? 0.03 : 0.045;
  const lift01 = ramp(t, 40, 56);
  if (t < 56) { s.camDist = 2.0 + 0.7 * ease(lift01); s.camY = 1.0 * ease(ramp(t, 43, 56)); }
  else if (t < 72) { const k = ease(ramp(t, 56, 61)); s.camDist = lerp(2.7, 3.1, k); s.camY = 1.0 * (1 - k); }
  else { s.camDist = 3.1; s.camY = 0; }
  s.fovMix = t < 56 ? ease(ramp(t, 42, 56)) : 1;
  return s;
}

/* ---------------------------------------------------------------- setup */

function computeFit() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const sa = w / h;
  portrait = sa < 1;
  if (!portrait) {
    fit = sa > ASPECT ? [1, ASPECT / sa] : [sa / ASPECT, 1];
  } else {
    const fx = clamp(0.42 + (sa - 0.5) * 0.6, 0.42, 0.8);
    fit = [fx, fx * ASPECT / sa];
  }
  maxPan = [Math.max(0, (1 - fit[0]) / 2), Math.max(0, (1 - fit[1]) / 2)];
  if (portrait) {
    still.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:' + (100 / fit[0]).toFixed(2) + '%;height:auto;max-width:none;object-fit:fill';
  } else {
    still.style.cssText = '';
  }
}

function buildPoints() {
  const spacing = isMobile ? 3 : 2;
  let cols = Math.round(canvas.width / fit[0] / spacing);
  let rows = Math.round(cols / ASPECT);
  let n = cols * rows;
  const cap = isMobile ? 160000 : 600000;
  if (n > cap) { const k = Math.sqrt(cap / n); cols = Math.floor(cols * k); rows = Math.floor(rows * k); n = cols * rows; }
  if (points.vao && Math.abs(cols - points.cols) / points.cols < 0.1) {
    points.homeSize = (canvas.width / fit[0] / points.cols) * 1.12;
    return;
  }
  const data = new Float32Array(n * 3);
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  for (let i = 0; i < n; i++) {
    const idx = order[i];
    const cx = idx % cols, cy = Math.floor(idx / cols);
    data[i * 3] = (cx + 0.5) / cols;
    data[i * 3 + 1] = (cy + 0.5) / rows;
    data[i * 3 + 2] = rnd();
  }
  if (!points.vao) { points.vao = gl.createVertexArray(); points.buf = gl.createBuffer(); }
  gl.bindVertexArray(points.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, points.buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);
  gl.bindVertexArray(null);
  points.count = n; points.cols = cols;
  points.homeSize = (canvas.width / fit[0] / cols) * 1.12;
}

function simSize(res) {
  const a = canvas.width / canvas.height;
  return a >= 1 ? [Math.round(res * a), res] : [res, Math.round(res / a)];
}
function buildFluid() {
  if (fluid) { fluid.vel.dispose(); fluid.dye.dispose(); fluid.pressure.dispose(); fluid.div.dispose(); fluid.curl.dispose(); }
  const [sw, sh] = simSize(isMobile ? 128 : 192);
  const [dw, dh] = simSize(isMobile ? 640 : 1024);
  const F = gl.RGBA16F, fmt = gl.RGBA, type = gl.HALF_FLOAT;
  const vel = createDoubleFBO(sw, sh, F, fmt, type, gl.LINEAR);
  const dye = createDoubleFBO(dw, dh, F, fmt, type, gl.LINEAR);
  const pressure = createDoubleFBO(sw, sh, F, fmt, type, gl.NEAREST);
  const div = createFBO(sw, sh, F, fmt, type, gl.NEAREST);
  const curl = createFBO(sw, sh, F, fmt, type, gl.NEAREST);
  fluidOK = vel.ok && dye.ok && pressure.ok && div.ok && curl.ok;
  fluid = { vel, dye, pressure, div, curl, aspect: sw / sh };
  dyeStale = true;
}

// on phones the opening section keeps the height it had at load, so the browser's bars sliding away cannot stretch it
let heroLockW = 0;
function lockHero() {
  if (!isTouch) return;
  const w = window.innerWidth;
  if (Math.abs(w - heroLockW) < 2) return;
  heroLockW = w;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  let h = probe.offsetHeight || 0;
  probe.remove();
  h = h > 0 ? Math.min(h, window.innerHeight) : window.innerHeight;
  if (h > 200) section.style.height = h + 'px';
}

function buildReveal() {
  if (reveal) reveal.dispose();
  const w = Math.max(2, Math.round(canvas.width / 2)), h = Math.max(2, Math.round(canvas.height / 2));
  reveal = createDoubleFBO(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  reveal.aspect = canvas.width / canvas.height;
  if (!reveal.ok) throw new Error('no light buffer');
  clearReveal();
}
function clearReveal() {
  if (!reveal) return;
  for (const f of [reveal.read, reveal.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function buildSlime() {
  if (slime) { slime.agents.dispose(); slime.trail.dispose(); }
  const side = isMobile ? 128 : 320;
  const n = side * side;
  const scale = isMobile ? 0.5 : 0.75;
  const tw = Math.min(1440, Math.max(2, Math.round(canvas.width * scale))), th = Math.max(2, Math.round(canvas.height * scale));
  if (slime && slime.food) slime.food.dispose();
  const agents = createDoubleFBO(side, side, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
  const trail = createDoubleFBO(tw, th, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  const food = createFBO(tw, th, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  let vao = slime ? slime.vao : null, buf = slime ? slime.buf : null;
  if (!vao || slime.n !== n) {
    const idx = new Float32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
    if (!vao) { vao = gl.createVertexArray(); buf = gl.createBuffer(); }
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 4, 0); gl.bindVertexArray(null);
  }
  slime = { agents, trail, food, vao, buf, n, side, ok: agents.ok && trail.ok && food.ok, aspect: canvas.width / canvas.height };
  slimeStale = true;
}

function resize() {
  lockHero();
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const cap = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2, 2560 / w, 1600 / h);
  renderScale = cap * quality.scale;
  const cw = Math.max(2, Math.round(w * renderScale)), ch = Math.max(2, Math.round(h * renderScale));
  if (canvas.width === cw && canvas.height === ch && scene) return;
  canvas.width = cw; canvas.height = ch;
  computeFit();
  if (scene) { scene.dispose(); bloomA.dispose(); bloomB.dispose(); }
  scene = createFBO(cw, ch, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, true);
  const bw = Math.max(2, Math.round(cw / 4)), bh = Math.max(2, Math.round(ch / 4));
  bloomA = createFBO(bw, bh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, false);
  bloomB = createFBO(bw, bh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR, false);
  if (!fluid || Math.abs(fluid.aspect - cw / ch) > 0.02) buildFluid();
  buildReveal();
  if (!slime || Math.abs(slime.aspect - cw / ch) > 0.02) buildSlime();
  buildPoints();
}

/* ---------------------------------------------------------------- fluid steps */

function splat(x, y, dx, dy) {
  if (!fluidOK) return;
  const f = fluid;
  progs.splat.use().set({ uTarget: f.vel.read.attach(0), uAspect: f.aspect, uPoint: [x, y], uColor: [dx, dy, 0], uRadius: 0.0025 * (f.aspect > 1 ? f.aspect : 1), uTexel: f.vel.texel });
  drawQuad(f.vel.write); f.vel.swap();
}
function fluidStep(dt, melt, time) {
  if (!fluidOK) return;
  const f = fluid;
  const tex = f.vel.texel;
  if (melt > 0) {
    progs.force.use().set({ uVelocity: f.vel.read.attach(0), uTime: time, uStrength: melt * 55 * dt, uAspect: f.aspect, uTexel: tex });
    drawQuad(f.vel.write); f.vel.swap();
  }
  progs.curl.use().set({ uVelocity: f.vel.read.attach(0), uTexel: tex });
  drawQuad(f.curl);
  progs.vort.use().set({ uVelocity: f.vel.read.attach(0), uCurl: f.curl.attach(1), uStrength: 24, uDt: dt, uTexel: tex });
  drawQuad(f.vel.write); f.vel.swap();
  progs.div.use().set({ uVelocity: f.vel.read.attach(0), uTexel: tex });
  drawQuad(f.div);
  progs.scale.use().set({ uTexture: f.pressure.read.attach(0), uValue: 0.8, uTexel: tex });
  drawQuad(f.pressure.write); f.pressure.swap();
  progs.pressure.use().set({ uDivergence: f.div.attach(0), uTexel: tex });
  const iters = isMobile ? 10 : 22;
  for (let i = 0; i < iters; i++) {
    progs.pressure.set({ uPressure: f.pressure.read.attach(1) });
    drawQuad(f.pressure.write); f.pressure.swap();
  }
  progs.gradient.use().set({ uPressure: f.pressure.read.attach(0), uVelocity: f.vel.read.attach(1), uTexel: tex });
  drawQuad(f.vel.write); f.vel.swap();
  progs.advect.use().set({ uVelocity: f.vel.read.attach(0), uSource: f.vel.read.attach(0), uDt: dt, uDissipation: 0.25, uTexel: tex });
  drawQuad(f.vel.write); f.vel.swap();
}
function advectDye(dt) {
  if (!fluidOK) return;
  const f = fluid;
  progs.advect.use().set({ uVelocity: f.vel.read.attach(0), uSource: f.dye.read.attach(1), uDt: dt, uDissipation: 0.0, uTexel: f.vel.texel });
  drawQuad(f.dye.write); f.dye.swap();
}
function initDye(state, time) {
  if (!fluidOK) return;
  setPaintUniforms(Object.assign({}, state, { dyeMix: 0, ink: 0, planeAlpha: 1, return: 0 }), time, true);
  drawQuad(fluid.dye.write); fluid.dye.swap();
  dyeStale = false;
}

/* ---------------------------------------------------------------- the slime */

function boatOnScreen() {
  return [(0.525 - 0.5 - look.panX) / fit[0] + 0.5, (0.368 - 0.5 - look.panY) / fit[1] + 0.5];
}
function slimeReset(time) {
  if (!slime || !slime.ok) return;
  progs.agent.use().set({ uAgents: slime.agents.read.attach(0), uTrail: bindTex(1, blackTex), uFoodTex: bindTex(2, blackTex), uSpawn: boatOnScreen(), uDt: 0, uTime: time, uAspect: slime.aspect, uReset: 1, uSpawnR: 0.012 });
  drawQuad(slime.agents.write); slime.agents.swap();
  for (const f of [slime.trail.read, slime.trail.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  slimeStale = false;
}
function slimeStep(dt, time, age) {
  if (!slime || !slime.ok) return;
  const grow = Math.min(1, age / 4);
  progs.food.use().set({ uPaint: bindTex(0, paintTex), uFit: fit, uPan: [look.panX, look.panY] });
  drawQuad(slime.food);
  progs.agent.use().set({
    uAgents: slime.agents.read.attach(0), uTrail: slime.trail.read.attach(1), uFoodTex: slime.food.attach(2),
    uSpawn: boatOnScreen(), uDt: dt, uTime: time, uAspect: slime.aspect, uReset: 0,
    uSpeed: 0.12 + 0.09 * grow, uSense: 0.012, uSenseAngle: 0.5, uTurn: 24.0, uFood: 0.5, uSpawnR: 0.012
  });
  drawQuad(slime.agents.write); slime.agents.swap();
  gl.bindFramebuffer(gl.FRAMEBUFFER, slime.trail.read.fbo);
  gl.viewport(0, 0, slime.trail.width, slime.trail.height);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  progs.deposit.use().set({ uAgents: slime.agents.read.attach(0), uAgentsSize: [slime.side, slime.side], uDeposit: (isMobile ? 0.35 : 0.25) * Math.min(2, dt * 60) });
  gl.bindVertexArray(slime.vao);
  gl.drawArrays(gl.POINTS, 0, slime.n);
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND);
  progs.trail.use().set({ uTrail: slime.trail.read.attach(0), uTexel: slime.trail.texel, uDecay: Math.exp(-dt * 3.5) });
  drawQuad(slime.trail.write); slime.trail.swap();
}

/* ---------------------------------------------------------------- render */

function setPaintUniforms(s, time, forDye) {
  const p = progs.paint.use();
  p.set({
    uPaint: bindTex(0, paintTex), uAux: bindTex(1, auxTex),
    uDye: forDye || !fluidOK ? bindTex(2, blackTex) : fluid.dye.read.attach(2),
    uVel: fluidOK ? fluid.vel.read.attach(3) : bindTex(3, blackTex),
    uVelTexel: fluidOK ? fluid.vel.texel : [0, 0],
    uFit: fit, uPan: [look.panX, look.panY], uParallax: [look.parX, look.parY],
    uTime: time, uDyeMix: s.dyeMix, uInk: s.ink, uInkReveal: introStart >= 0 ? clamp((time - introStart) / 6.5, 0, 1) : 1,
    uReturn: s.return, uPlaneAlpha: s.planeAlpha, uExt: s.ext, uMelt: fluidOK ? 0 : s.melt, uFluid: fluidOK ? 1 : 0,
    uEffects: s.effects, uInkLod: 1.6, uPointer: [pointer.x, pointer.y], uRipples: ripples,
    uReveal: forDye ? bindTex(4, blackTex) : reveal.read.attach(4), uTrail: slime && slime.ok && !slimeStale ? slime.trail.read.attach(5) : bindTex(5, blackTex),
    uDark: forDye ? 0 : 1, uSlime: s.slime, uFlash: s.flash
  });
}

function render(now) {
  requestAnimationFrame(render);
  if (!started || !visible || lost) { lastNow = 0; return; }
  const dtRaw = lastNow ? (now - lastNow) / 1000 : 0.016;
  lastNow = now;
  const dt = clamp(dtRaw, 0.001, 0.05);
  const time = now / 1000;

  // adaptive quality
  if (!lockedQuality) {
    if (time - lastScroll > 1.5) frameEma = lerp(frameEma, dtRaw * 1000, 0.05);
    qualityTimer += dtRaw;
    if (qualityTimer > 2.5 && time > 4 && stageOf(T) !== 2) {
      qualityTimer = 0;
      if (frameEma > 26 && quality.level < 4) { quality.level++; applyQuality(); }
      else if (frameEma < 19 && quality.level > 0) { quality.level--; applyQuality(); }
    }
  }

  // time
  if (!paused) {
    lastT = T;
    T = (T + dt) % LOOP;
    if (T < lastT) { lastT = T - 0.0001; showTitle(0.6); }
    if (lastT < 100.3 && T >= 100.3) showFlood(0);
  }
  if (jumpTo >= 0) {
    fadeTarget = 0;
    if (fade < 0.03) {
      lastT = jumpTo - 0.0001; T = jumpTo; jumpTo = -1; fadeTarget = 1;
      if (T >= 40) dyeStale = true;
      if (T >= 82) slimeStale = true;
      clearReveal();
      ripples.fill(0);
    }
  }
  const dtUi = Math.min(dtRaw, 0.25);
  fade = fadeTarget > fade ? Math.min(fadeTarget, fade + dtUi / 1.6) : Math.max(fadeTarget, fade - dtUi / 0.45);

  const s = computeState(T);
  if (introStart >= 0 && time - introStart > 7) introStart = -1;
  if (audio && audio.on) audio.setStage(s.stage);
  dots.forEach((d, i) => d.classList.toggle('on', i + 1 === s.stage));

  // looking around
  look.parX = lerp(look.parX, look.tParX, 0.05); look.parY = lerp(look.parY, look.tParY, 0.05);
  const lk = gyro.on ? 0.045 : 0.06;
  look.panX = lerp(look.panX, look.tPanX, lk); look.panY = lerp(look.panY, look.tPanY, lk);
  look.yaw = lerp(look.yaw, look.tParX * 12 + Math.sin(time * 0.05) * 0.12, 0.04);
  look.pitch = lerp(look.pitch, -look.tParY * 8 + Math.sin(time * 0.037) * 0.06, 0.04);

  // where the light is: the face, the hand, or a slow wandering when nobody moves
  {
    let tx, ty, tr = s.poolR;
    if (face.on && time - face.seen < 1.5) {
      tx = clamp(0.5 + (face.x - 0.5) * 2.2, 0.04, 0.96); ty = clamp(0.5 + (face.y - 0.5) * 2.2, 0.04, 0.96);
      tr *= clamp(face.size / 0.2, 0.75, 2.1);
    } else if (time - pointer.lastMove < 5) {
      tx = pointer.x; ty = pointer.y;
    } else if (gyro.on) {
      tx = 0.5 + gyro.rx * 0.38; ty = 0.5 + gyro.ry * 0.3;
    } else {
      tx = 0.5 + 0.3 * Math.sin(time * 0.11) + 0.08 * Math.sin(time * 0.31); ty = 0.5 + 0.22 * Math.sin(time * 0.07 + 1.3);
    }
    if (portrait) tr *= 1.35 * canvas.width / canvas.height;
    tr *= 1 + 0.07 * Math.sin(time * 0.6);
    const k = face.on ? 0.08 : 0.12;
    pool.x = lerp(pool.x, tx, k); pool.y = lerp(pool.y, ty, k); pool.r = lerp(pool.r, tr, 0.05);
  }

  // liquid
  const enteringLiquid = lastT < 22 && T >= 22;
  if (enteringLiquid || (dyeStale && s.stage >= 2)) initDye(s, time);
  if (fluidOK) {
    fluidStep(dt, s.melt, time);
    if (s.stage === 2) advectDye(dt);
  }

  // the slime
  const enteringSlime = lastT < 82 && T >= 82;
  if (s.slime > 0 && (enteringSlime || slimeStale)) slimeReset(time);
  if (s.slime > 0 && !slimeStale && T < 101) {
    // on a struggling machine the slime moves every other frame
    if (quality.level >= 3 && !slimeSkip) slimeSkip = true;
    else { slimeStep(slimeSkip ? dt * 2 : dt, time, T - 82); slimeSkip = false; }
  }

  // the light
  progs.reveal.use().set({
    uPrev: reveal.read.attach(0), uVel: fluidOK ? fluid.vel.read.attach(1) : bindTex(1, blackTex), uVelTexel: fluidOK ? fluid.vel.texel : [0, 0],
    uTrail: slime && slime.ok && !slimeStale ? slime.trail.read.attach(2) : bindTex(2, blackTex), uTrailTexel: slime && slime.ok ? slime.trail.texel : [0, 0],
    uPool: [pool.x, pool.y, pool.r], uDecay: Math.exp(-dt / s.tau), uUp: 1 - Math.exp(-dt / 0.45), uMotion: s.motionLight, uMotionLo: 28, uMotionHi: 95, uSlime: s.slime, uFlood: s.flood, uAspect: reveal.aspect, uTime: time
  });
  drawQuad(reveal.write); reveal.swap();

  // the painting
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fbo);
  gl.viewport(0, 0, scene.width, scene.height);
  gl.clearColor(0, 0, 0, 1); gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.depthMask(false);
  if (s.planeAlpha > 0.001) {
    setPaintUniforms(s, time, false);
    drawQuad(scene);
  }

  // the points
  if (s.pointsAlpha > 0.001) {
    const sa = canvas.width / canvas.height;
    const fov0 = 2 * Math.atan(fit[1] / 2 / 2.0);
    const fov = lerp(fov0, 0.9, s.fovMix);
    const D = s.camDist;
    const eye = [Math.sin(look.yaw) * D * Math.cos(look.pitch), s.camY + Math.sin(look.pitch) * D, Math.cos(look.yaw) * D * Math.cos(look.pitch)];
    const vp = mul(perspective(fov, sa, 0.05, 40), lookAt(eye, [0, s.camY, 0], [0, 1, 0]));
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    progs.points.use().set({
      uPaint: bindTex(0, paintTex), uAux: bindTex(1, auxTex), uDye: fluidOK && !dyeStale ? fluid.dye.read.attach(2) : bindTex(2, blackTex),
      uFit: fit, uPan: [look.panX, look.panY], uTime: time, uLift: s.lift, uRise: s.rise, uTorus: s.torus, uTorusMorph: s.torusMorph,
      uHome: s.home, uColorRestore: fluidOK && !dyeStale ? s.colorRestore : 1, uInkPts: s.inkPts, uHomeSize: points.homeSize,
      uAwaySize: 6.0, uInkLod: 1.6, uDpr: renderScale, uVP: vp, uAlpha: s.pointsAlpha,
      uReveal: reveal.read.attach(3), uDark: 1 - s.inkPts
    });
    gl.bindVertexArray(points.vao);
    gl.drawArrays(gl.POINTS, 0, Math.floor(points.count * quality.pointFrac));
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
  }

  // glow and the final image
  progs.bright.use().set({ uScene: scene.attach(0), uTexel: scene.texel, uThreshold: s.stage === 5 ? 0.3 : 0.55 });
  drawQuad(bloomA);
  progs.blur.use().set({ uTex: bloomA.attach(0), uDir: [bloomA.texel[0] * 1.5, 0] });
  drawQuad(bloomB);
  progs.blur.use().set({ uTex: bloomB.attach(0), uDir: [0, bloomA.texel[1] * 1.5] });
  drawQuad(bloomA);
  progs.post.use().set({ uScene: scene.attach(0), uBloom: bloomA.attach(1), uBloomAmt: s.bloom, uFade: fade, uTime: time, uGrain: s.grain, uRes: [canvas.width, canvas.height] });
  drawQuad(null);

  // ui
  if (time - pointer.lastMove > 3.5 && !section.classList.contains('quiet')) section.classList.add('quiet');
  if (hint && hintTimer && time > hintTimer) { hint.classList.remove('show'); hintTimer = 0; }
  for (const c of cards) { if (c.until && time > c.until) { c.until = 0; c.el.classList.add('leave'); setTimeout(() => c.el.classList.remove('show', 'leave', 'sliced-in'), 1000); } }
}

function applyQuality() {
  const L = quality.level;
  quality.pointFrac = [1, 0.7, 0.5, 0.5, 0.35][L];
  const sc = isMobile ? 1 : [1, 1, 0.85, 0.7, 0.6][L];
  if (sc !== quality.scale) { quality.scale = sc; resize(); }
}

/* ---------------------------------------------------------------- input */

function updatePointer(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
  pointer.px = pointer.x; pointer.py = pointer.y;
  pointer.x = clamp(x, 0, 1); pointer.y = clamp(y, 0, 1);
  pointer.dx = pointer.moved ? clamp(pointer.x - pointer.px, -0.02, 0.02) : 0;
  pointer.dy = pointer.moved ? clamp(pointer.y - pointer.py, -0.02, 0.02) : 0;
  pointer.moved = true;
  pointer.lastMove = performance.now() / 1000;
  section.classList.remove('quiet');
}
function paintingUV(x, y) { return [(x - 0.5) * fit[0] + 0.5 + look.panX, (y - 0.5) * fit[1] + 0.5 + look.panY]; }
function addRipple(x, y, strength) {
  const [u, v] = paintingUV(x, y);
  ripples.set([u, v, performance.now() / 1000, strength], rippleIdx * 4);
  rippleIdx = (rippleIdx + 1) % 8;
}
function stir() {
  const st = stageOf(T);
  if (st > 2) return;
  const speed = Math.hypot(pointer.dx, pointer.dy);
  if (speed > 0) {
    const f = fluid ? fluid.aspect : 1;
    splat(pointer.x, pointer.y, pointer.dx * 6000 * (f > 1 ? f : 1), pointer.dy * 6000);
  }
  const now = performance.now() / 1000;
  if (st === 1 && speed > 0.002 && now - pointer.lastRipple > 0.09) {
    pointer.lastRipple = now;
    addRipple(pointer.x, pointer.y, clamp(speed * 25, 0.15, 1));
  }
}
canvas.addEventListener('pointermove', (e) => {
  updatePointer(e);
  if (!gyro.on) {
    if (isTouch) {
      if (pointer.down && Math.abs(pointer.dx) > Math.abs(pointer.dy)) {
        look.tPanX = clamp(look.tPanX - pointer.dx * fit[0], -maxPan[0], maxPan[0]);
        look.tPanY = clamp(look.tPanY - pointer.dy * fit[1], -maxPan[1], maxPan[1]);
      }
    } else {
      look.tParX = (pointer.x - 0.5) * 2 * 0.012;
      look.tParY = (pointer.y - 0.5) * 2 * 0.012;
      look.tPanX = clamp((pointer.x - 0.5) * 2 * 0.03, -maxPan[0], maxPan[0]) * (portrait ? 0 : 1);
    }
  }
  stir();
});
canvas.addEventListener('pointerdown', (e) => {
  updatePointer(e); pointer.down = true; pointer.dx = 0; pointer.dy = 0;
  if (!isTouch) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
  askGyro();
  if (stageOf(T) === 1) addRipple(pointer.x, pointer.y, 1);
  // the phone
  const [u, v] = paintingUV(pointer.x, pointer.y);
  const d = Math.hypot((u - 0.36) / 0.12, (v - 0.60) / 0.19);
  if (d < 1 && stageOf(T) <= 2 && s_planeVisible()) {
    if (!audioOn()) toggleSound(true);
    if (audio) setTimeout(() => audio.ring(), 120);
  }
});
function s_planeVisible() { return computeState(T).planeAlpha > 0.5; }
canvas.addEventListener('pointerup', () => { pointer.down = false; });
canvas.addEventListener('pointerleave', () => { pointer.moved = false; });
canvas.addEventListener('pointercancel', () => { pointer.down = false; });

function askGyro() {
  if (!isTouch || gyro.asked) return;
  gyro.asked = true;
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then((r) => { if (r === 'granted') listenGyro(); }).catch(() => {});
  } else if (DOE) listenGyro();
}
function listenGyro() {
  const rad = Math.PI / 180;
  let baseLean = null, roll = 0, lean = 0, first = true;
  window.addEventListener('deviceorientation', (e) => {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * rad, g = e.gamma * rad;
    // gravity in the device frame, then in the screen frame
    const gx = Math.cos(b) * Math.sin(g), gy = -Math.sin(b), gz = -Math.cos(b) * Math.cos(g);
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let sx = gx, sy = gy;
    if (angle === 90) { sx = -gy; sy = gx; } else if (angle === 270 || angle === -90) { sx = gy; sy = -gx; } else if (angle === 180) { sx = -gx; sy = -gy; }
    const r = Math.atan2(sx, -sy) / rad;
    const l = Math.atan2(-gz, -sy) / rad;
    if (!isFinite(r) || !isFinite(l)) return;
    if (first) { roll = r; lean = l; baseLean = l; first = false; }
    roll = lerp(roll, r, 0.18); lean = lerp(lean, l, 0.18);
    gyro.on = true;
    const rx = clamp(roll / 35, -1, 1), ry = clamp((lean - baseLean) / 30, -1, 1);
    look.tPanX = rx * maxPan[0];
    look.tPanY = ry * maxPan[1];
    look.tParX = rx * 0.012;
    look.tParY = ry * 0.01;
    gyro.rx = rx; gyro.ry = ry;
  }, true);
}
if (isTouch && !(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) {
  gyro.asked = true; if (window.DeviceOrientationEvent) listenGyro();
}

dots.forEach((d) => d.addEventListener('click', () => { jumpTo = STAGE_START[parseInt(d.dataset.s, 10)]; introStart = -1; }));

// the painting looks back: the camera finds the face, the light follows it
async function enableFace(quiet) {
  if (face.loading || face.on || !navigator.mediaDevices) return;
  face.loading = true; face.wanted = true;
  if (faceBtn) faceBtn.textContent = 'Un instant';
  try {
    if (!face.detector) {
      const mod = await import('/regard/regard.mjs');
      const files = await mod.FilesetResolver.forVisionTasks('/regard/wasm');
      face.detector = await mod.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/regard/visage.tflite', delegate: 'GPU' },
        runningMode: 'VIDEO', minDetectionConfidence: 0.5
      });
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    const video = document.createElement('video');
    video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = stream;
    await video.play();
    face.video = video; face.stream = stream; face.on = true; face.seen = -10;
    if (faceBtn) { faceBtn.textContent = 'Elle te voit'; faceBtn.setAttribute('aria-pressed', 'true'); }
    if (hint && !quiet) { hint.textContent = 'Elle te voit \u00b7 Approche, elle s\u2019ouvre'; hint.classList.add('show'); hintTimer = performance.now() / 1000 + 6; }
    faceLoop();
  } catch (e) {
    face.on = false; face.wanted = false;
    if (faceBtn) { faceBtn.textContent = 'Regarde-moi'; faceBtn.setAttribute('aria-pressed', 'false'); }
    if (hint && !quiet) { hint.textContent = 'Tant pis, elle t\u2019attendra'; hint.classList.add('show'); hintTimer = performance.now() / 1000 + 4; }
  } finally { face.loading = false; }
}
function disableFace(keepWanted) {
  face.on = false; if (!keepWanted) face.wanted = false;
  if (face.stream) { for (const t of face.stream.getTracks()) t.stop(); face.stream = null; }
  if (face.video) { face.video.srcObject = null; face.video = null; }
  if (faceBtn) { faceBtn.textContent = 'Regarde-moi'; faceBtn.setAttribute('aria-pressed', 'false'); }
}
function faceSleep(asleep) {
  if (asleep) { if (face.on) disableFace(true); }
  else if (face.wanted && !face.on) enableFace(true);
}
function faceLoop() {
  if (!face.on) return;
  const now = performance.now();
  if (now - face.lastDetect > 45 && face.video && face.video.readyState >= 2) {
    face.lastDetect = now;
    try {
      const res = face.detector.detectForVideo(face.video, now);
      const d = res && res.detections && res.detections[0];
      if (d && d.boundingBox) {
        const b = d.boundingBox, vw = face.video.videoWidth || 640, vh = face.video.videoHeight || 480;
        const fx = 1 - (b.originX + b.width / 2) / vw, fy = 1 - (b.originY + b.height / 2) / vh;
        face.x = lerp(face.x, fx, 0.5); face.y = lerp(face.y, fy, 0.5); face.size = lerp(face.size, b.width / vw, 0.3);
        face.seen = now / 1000;
        look.tParX = (face.x - 0.5) * 0.05; look.tParY = (face.y - 0.5) * 0.04;
        pointer.lastMove = now / 1000; section.classList.remove('quiet');
      }
    } catch (_) {}
  }
  requestAnimationFrame(faceLoop);
}
if (faceBtn) faceBtn.addEventListener('click', () => { if (face.on) disableFace(); else enableFace(); });
if (faceBtn && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext && !matchMedia('(prefers-reduced-motion: reduce)').matches) faceBtn.hidden = false;
if (soundBtn) soundBtn.addEventListener('click', () => toggleSound(!audioOn()));
function syncPause() {
  if (!pauseBtn) return;
  pauseBtn.dataset.paused = String(paused);
  const label = paused ? 'Reprends' : 'Un instant';
  pauseBtn.setAttribute('aria-label', label); pauseBtn.title = label;
}
if (pauseBtn) pauseBtn.addEventListener('click', () => { paused = !paused; syncPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { lastNow = 0; if (audio && audio.on) audio.ctx.suspend(); faceSleep(true); } else { if (audio && audio.on) audio.ctx.resume(); if (visible) faceSleep(false); } });
const closing = document.getElementById('closing');
if (closing && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { closing.classList.add('sliced-in'); io.disconnect(); } }, { threshold: 0.6 });
  io.observe(closing);
} else if (closing) closing.classList.add('sliced-in');
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) lastNow = 0; faceSleep(!visible || document.hidden); }, { threshold: 0.02 }).observe(section);
}
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });

/* ---------------------------------------------------------------- start */

async function start() {
  progs.paint = new Program(QUAD_VS, PAINT_FS);
  progs.points = new Program(POINTS_VS, POINTS_FS);
  progs.splat = new Program(QUAD_VS, SPLAT_FS);
  progs.force = new Program(QUAD_VS, FORCE_FS);
  progs.advect = new Program(QUAD_VS, ADVECT_FS);
  progs.div = new Program(QUAD_VS, DIV_FS);
  progs.curl = new Program(QUAD_VS, CURL_FS);
  progs.vort = new Program(QUAD_VS, VORT_FS);
  progs.pressure = new Program(QUAD_VS, PRESSURE_FS);
  progs.gradient = new Program(QUAD_VS, GRADIENT_FS);
  progs.scale = new Program(QUAD_VS, SCALE_FS);
  progs.bright = new Program(QUAD_VS, BRIGHT_FS);
  progs.blur = new Program(QUAD_VS, BLUR_FS);
  progs.post = new Program(QUAD_VS, POST_FS);
  progs.reveal = new Program(QUAD_VS, REVEAL_FS);
  progs.food = new Program(QUAD_VS, FOOD_FS);
  progs.agent = new Program(QUAD_VS, AGENT_FS);
  progs.deposit = new Program(DEPOSIT_VS, DEPOSIT_FS);
  progs.trail = new Program(QUAD_VS, TRAIL_FS);
  const [img, aux] = await Promise.all([loadImage(IMG), loadImage(AUX)]);
  paintTex = imageTexture(img, true);
  auxTex = imageTexture(aux, false);
  resize();
  lastT = T - 0.0001;
  started = true;
  canvas.classList.add('is-live');
  if (T < 1) showTitle(0.9);
  if (T >= 100.3 && T < 105) showFlood(0.3);
  if (pauseBtn) { pauseBtn.hidden = false; syncPause(); }
  if (hint) {
    hint.textContent = isTouch ? 'Cherche-la du pouce, elle n\u2019est que là où tu touches · Penche-toi, la lumière glisse' : 'Cherche-la, elle n\u2019est que là où tu regardes · Touche le vert, elle n\u2019appelle que toi';
    setTimeout(() => { hint.classList.add('show'); hintTimer = performance.now() / 1000 + 6; }, T < 1 ? 9500 : 2200);
  }
  pointer.lastMove = performance.now() / 1000;
}
start().catch(() => { fallback(); });
requestAnimationFrame(render);
})();
