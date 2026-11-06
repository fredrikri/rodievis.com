/* The rest of the page, in the same dark: the photos exist only where the light finds them,
   the words change language under the hand, and a line of dust at the bottom keeps its own secret. */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const isMobile = isTouch && Math.min(innerWidth, innerHeight) < 900;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------------------------------------------------------- the hand, shared by everything below */
  const hand = { x: innerWidth / 2, y: innerHeight / 2, lastMove: -10, has: false, gyroX: 0, gyroY: 0, gyro: false };
  function moveHand(x, y) { hand.x = x; hand.y = y; hand.lastMove = performance.now() / 1000; hand.has = true; }
  window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') moveHand(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) moveHand(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) moveHand(t.clientX, t.clientY); }, { passive: true });
  if (isTouch && window.DeviceOrientationEvent) {
    const rad = Math.PI / 180;
    let roll = 0, lean = 0, base = null;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      const b = e.beta * rad, g = e.gamma * rad;
      const gx = Math.cos(b) * Math.sin(g), gy = -Math.sin(b), gz = -Math.cos(b) * Math.cos(g);
      const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let sx = gx, sy = gy;
      if (angle === 90) { sx = -gy; sy = gx; } else if (angle === 270 || angle === -90) { sx = gy; sy = -gx; } else if (angle === 180) { sx = -gx; sy = -gy; }
      const r = Math.atan2(sx, -sy) / rad, l = Math.atan2(-gz, -sy) / rad;
      if (!isFinite(r) || !isFinite(l)) return;
      if (base === null) { roll = r; lean = l; base = l; }
      roll = lerp(roll, r, 0.18); lean = lerp(lean, l, 0.18);
      hand.gyro = true; hand.gyroX = clamp(roll / 35, -1, 1); hand.gyroY = clamp((lean - base) / 30, -1, 1);
    }, true);
  }

  /* ---------------------------------------------------------------- the words: French, and English where the hand is */
  const flips = [];
  for (const el of document.querySelectorAll('[data-en]')) {
    const fr = el.textContent, en = el.dataset.en;
    if (!en || en === fr) continue;
    flips.push({ el, fr, en, state: 'fr', from: fr, to: fr, t0: 0, dur: 0, rect: null, lastSet: fr, seed: Math.random() * 1000 });
  }
  for (const el of document.querySelectorAll('[data-alt]')) {
    const wordEls = Array.from(el.querySelectorAll('.title-word'));
    const alt = el.dataset.alt.split(' ');
    if (!wordEls.length || alt.length !== wordEls.length) continue;
    const words = wordEls.map((w, i) => {
      const bands = Array.from(w.querySelectorAll('.band')).map((b) => {
        const iEl = b.querySelector('i');
        let textNode = Array.from(b.childNodes).find((n) => n.nodeType === 3);
        if (!textNode) { textNode = document.createTextNode(''); b.insertBefore(textNode, b.firstChild); }
        return { textNode, iEl };
      });
      const b0 = bands[0];
      const from = b0 ? (b0.textNode.data + (b0.iEl ? b0.iEl.textContent : '')).trim() : w.textContent.trim();
      return { from, to: alt[i], bands, last: from, seed: Math.random() * 1000 };
    });
    const fr = words.map((w) => w.from).join(' '), en = words.map((w) => w.to).join(' ');
    flips.push({ el, fr, en, state: 'fr', from: fr, to: fr, t0: 0, dur: 0, rect: null, lastSet: fr, seed: Math.random() * 1000, words, noLang: true });
  }
  const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÉÀ', LOWER = 'abcdefghijklmnopqrstuvwxyzéèàùç', OTHER = '.,;:-·';
  const reachR = isTouch ? 56 : 72;
  const range = document.createRange();
  let flipRectsAt = -1;
  function flipRects(now) {
    if (now - flipRectsAt < 0.12) return;
    flipRectsAt = now;
    for (const f of flips) { range.selectNodeContents(f.el); f.rect = Array.from(range.getClientRects()); }
  }
  function flipTargets(now) {
    if (!hand.has) return;
    for (const f of flips) {
      if (!f.rect || !f.rect.length) continue;
      let d = 1e9;
      for (const r of f.rect) {
        if (r.width === 0 && r.height === 0) continue;
        const dx = Math.max(r.left - hand.x, 0, hand.x - r.right), dy = Math.max(r.top - hand.y, 0, hand.y - r.bottom);
        d = Math.min(d, Math.hypot(dx, dy));
      }
      const want = d < reachR ? 'en' : d > reachR * 1.6 ? 'fr' : f.state;
      if (want !== f.state) {
        f.state = want; f.from = f.lastSet; f.to = want === 'en' ? f.en : f.fr;
        f.t0 = now; f.dur = clamp(0.35 + Math.max(f.from.length, f.to.length) * 0.012, 0.45, 1.1);
        if (!f.noLang) f.el.setAttribute('lang', want);
      }
    }
  }
  function scramble(f, now) { return scrambleStr(f.from, f.to, clamp((now - f.t0) / f.dur, 0, 1), f.seed, now); }
  function scrambleStr(from, to, p, seed, now) {
    if (p >= 1) return to;
    const L = Math.max(from.length, to.length);
    const tick = Math.floor(now * 24);
    let out = '';
    for (let i = 0; i < L; i++) {
      const settle = i / L;                          // the letters settle from left to right
      const q = (p * 1.35 - settle) * 3.0;           // local progress for this letter
      const target = to[i] || '';
      if (q >= 1) { out += target; continue; }
      if (q <= 0) { out += from[i] || (target ? ' ' : ''); continue; }
      if (!target && q > 0.5) continue;
      if (target === ' ' || from[i] === ' ') { out += ' '; continue; }
      const h = Math.sin((i + 1) * 12.9898 + tick * 78.233 + seed) * 43758.5453;
      const ref = target || from[i] || 'a';
      const set = /[A-ZÀ-Ý]/.test(ref) ? UPPER : /[a-zà-ÿ]/.test(ref) ? LOWER : OTHER;
      out += set[Math.floor((h - Math.floor(h)) * set.length)];
    }
    return out;
  }
  function flipFrame(now) {
    if (!flips.length) return;
    flipRects(now);
    flipTargets(now);
    for (const f of flips) {
      if (f.lastSet === f.to && now - f.t0 > f.dur) continue;
      if (f.words) {
        const p = clamp((now - f.t0) / f.dur, 0, 1), toEn = f.state === 'en';
        const parts = [];
        for (const w of f.words) {
          const s = scrambleStr(toEn ? w.from : w.to, toEn ? w.to : w.from, p, w.seed, now);
          parts.push(s);
          if (s === w.last) continue;
          w.last = s;
          for (const b of w.bands) {
            if (b.iEl) { b.textNode.data = s.slice(0, -1); b.iEl.textContent = s.slice(-1); }
            else b.textNode.data = s;
          }
        }
        f.lastSet = parts.join(' ');
        continue;
      }
      const s = scramble(f, now);
      if (s !== f.lastSet) { f.el.textContent = s; f.lastSet = s; }
    }
  }

  /* ---------------------------------------------------------------- the cut letters never hold still */
  const life = [];
  const sn = (t, s) => (Math.sin(t * 1.0 + s) * 0.5 + Math.sin(t * 2.3 + s * 1.7) * 0.3 + Math.sin(t * 0.37 + s * 0.3) * 0.2);
  function collectWords() {
    for (const w of document.querySelectorAll('.title-word')) {
      if (w.__life) continue;
      const bands = ['.band-top', '.band-mid', '.band-base'].map((c) => w.querySelector(c));
      if (bands.some((b) => !b)) continue;
      const iEl = w.querySelector('i');
      const L = { w, bands, iEl, seed: Math.random() * 100, x: [0, 0, 0], v: [0, 0, 0], cutV: [0, 0], cutK: [0, 0], spread: 0, nextKnock: performance.now() / 1000 + 2 + Math.random() * 5, turn: null, nextTurn: performance.now() / 1000 + 8 + Math.random() * 14, flip: w.closest('[data-alt]') };
      w.__life = L;
      life.push(L);
      for (const b of bands) b.addEventListener('animationend', (e) => { if (/-in$/.test(e.animationName)) b.classList.add('alive'); });
      if (iEl) iEl.addEventListener('animationend', (e) => { if (e.animationName === 'turn-round') iEl.classList.add('alive'); });
    }
  }
  function wordsSleep(root) {
    for (const L of life) {
      if (!root.contains(L.w)) continue;
      for (const b of L.bands) { b.classList.remove('alive'); b.style.transform = ''; b.style.clipPath = ''; }
      if (L.iEl) { L.iEl.classList.remove('alive'); L.iEl.style.transform = ''; }
      L.x = [0, 0, 0]; L.v = [0, 0, 0]; L.cutV = [0, 0]; L.cutK = [0, 0]; L.turn = null;
    }
  }
  function lifeFrame(now, dt) {
    for (const L of life) {
      if (!L.bands[0].classList.contains('alive')) continue;
      const r = L.w.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
      const near = L.flip ? flips.find((f) => f.el === L.flip) : null;
      L.spread = lerp(L.spread, near && near.state === 'en' ? 1 : 0, 1 - Math.exp(-dt / 0.5));
      const t = now, s = L.seed, sp = 1 + 2.2 * L.spread;
      // now and then one slice gets knocked, and springs back
      if (now > L.nextKnock) {
        L.nextKnock = now + 2.5 + Math.random() * 6;
        const which = Math.floor(Math.random() * 3);
        if (Math.random() < 0.72) L.v[which] += (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.9);
        else L.cutV[Math.floor(Math.random() * 2)] += (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 40);
      }
      for (let i = 0; i < 3; i++) { L.v[i] += (-L.x[i] * 110 - L.v[i] * 10) * dt; L.x[i] += L.v[i] * dt; }
      for (let i = 0; i < 2; i++) { L.cutV[i] += (-L.cutK[i] * 110 - L.cutV[i] * 10) * dt; L.cutK[i] += L.cutV[i] * dt; }
      const c1 = clamp(40 + 5 * sp * sn(t * 0.11, s) + L.cutK[0], 22, 56);
      const c2 = clamp(66 + 5 * sp * sn(t * 0.09, s + 7) + L.cutK[1], c1 + 10, 86);
      const xs = [
        0.035 * sp * sn(t * 0.17, s + 1) - 0.045 * L.spread + L.x[0],
        0.06 + 0.05 * sp * sn(t * 0.13, s + 2) + L.x[1],
        0.03 * sp * sn(t * 0.15, s + 3) + 0.045 * L.spread + L.x[2]
      ];
      const clips = [`inset(0 0 ${(100 - c1 + 1).toFixed(2)}% 0)`, `inset(${(c1 + 1).toFixed(2)}% 0 ${(100 - c2 + 1).toFixed(2)}% 0)`, `inset(${(c2 + 1).toFixed(2)}% 0 0 0)`];
      for (let i = 0; i < 3; i++) { L.bands[i].style.transform = `translateX(${xs[i].toFixed(4)}em)`; L.bands[i].style.clipPath = clips[i]; }
      // the last letter turns round, looks at you, and turns back
      if (L.iEl && L.iEl.classList.contains('alive')) {
        if (!L.turn && now > L.nextTurn) { L.turn = { t0: now }; L.nextTurn = now + 10 + Math.random() * 16; }
        if (L.turn) {
          const a = now - L.turn.t0;
          let sx;
          if (a < 0.7) sx = Math.cos(a / 0.7 * Math.PI) * -1;           // -1 -> 1
          else if (a < 2.1) sx = 1;
          else if (a < 2.8) sx = Math.cos((a - 2.1) / 0.7 * Math.PI);    // 1 -> -1
          else { sx = -1; L.turn = null; }
          L.iEl.style.transform = `scaleX(${(Math.abs(sx) < 0.04 ? 0.04 * Math.sign(sx || 1) : sx).toFixed(3)})`;
        }
      }
    }
  }
  collectWords();
  if ('MutationObserver' in window) {
    new MutationObserver((muts) => { for (const m of muts) { if (m.target.classList && m.target.classList.contains('leave')) wordsSleep(m.target); } }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  /* ---------------------------------------------------------------- the photos, as dust in the dark */
  const section = document.querySelector('.archive');
  const links = section ? Array.from(section.querySelectorAll('.photo-link')) : [];
  const photos = links.map((link) => ({ link, img: link.querySelector('img'), src: link.querySelector('img').currentSrc || link.querySelector('img').src, tex: null, ready: false, lift: 0, liftT: 0, hover: 0, rect: null, seed: Math.random() * 100 }));
  let gl = null, canvas = null, archiveOn = false, near = false, inView = false;
  let progs = {}, reveal = null, blackTex = null, idxVao = null, maxPoints = 0, dpr = 1;
  const pool = { x: 0.5, y: 0.5, r: 0.2 };

  const NOISE = `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
    vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
    vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
    vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0); m=m*m; m=m*m;
    vec3 x=2.0*fract(p*C.www)-1.0; vec3 h=abs(x)-0.5; vec3 ox=floor(x+0.5); vec3 a0=x-ox;
    m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
    vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw; return 130.0*dot(m,g);
  }
  float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }`;

  const QUAD_VS = `#version 300 es
  layout(location = 0) in vec2 aPos; out vec2 vUv;
  void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const REVEAL_FS = `#version 300 es
  precision highp float; in vec2 vUv; out vec4 o;
  uniform sampler2D uPrev; uniform vec3 uPool; uniform float uDecay, uUp, uAspect, uTime;
  ${NOISE}
  void main(){
    float prev = texture(uPrev, vUv).r;
    vec2 d = (vUv - uPool.xy) * vec2(uAspect, 1.0);
    float wob = snoise(vec2(vUv.x * uAspect * 5.0 + uTime * 0.13, vUv.y * 5.0 - uTime * 0.1));
    float r0 = uPool.z * (1.0 + 0.16 * wob);
    float target = 1.0 - smoothstep(r0 * 0.2, r0, length(d));
    float r = target > prev ? prev + (target - prev) * uUp : prev * uDecay;
    o = vec4(clamp(r, 0.0, 1.0), 0.0, 0.0, 1.0);
  }`;

  const DUST_VS = `#version 300 es
  precision highp float;
  layout(location = 0) in float aIdx;
  uniform sampler2D uTex, uReveal;
  uniform vec2 uGrid, uRect, uRectSize, uView, uHand;
  uniform float uTime, uLift, uHover, uSeed, uSize, uDpr;
  out vec3 vCol; out float vAlpha; out float vRound;
  ${NOISE}
  void main(){
    vec2 g = vec2(mod(aIdx, uGrid.x), floor(aIdx / uGrid.x));
    vec2 uv = (g + 0.5) / uGrid;
    vec3 col = texture(uTex, vec2(uv.x, uv.y)).rgb;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec2 home = uRect + uv * uRectSize;              // css px, y down
    float rnd = hash12(g + uSeed);
    float rnd2 = hash12(g * 1.7 + uSeed + 3.1);
    // the rise: the photo lets go of its points, the light ones first, and they fall upward
    float s = clamp(uLift * 1.6 - rnd * 0.6 - (1.0 - lum) * 0.25, 0.0, 1.0);
    s = s * s * (3.0 - 2.0 * s);
    float t = uTime * 0.6 + uSeed;
    vec2 drift = vec2(snoise(vec2(uv.x * 3.0 + t, uv.y * 3.0 + uSeed)), snoise(vec2(uv.x * 3.0 + 9.0, uv.y * 3.0 - t)));
    vec2 p = home;
    p.y -= s * (40.0 + 90.0 * rnd2) * (1.0 + 0.6 * uLift);
    p += drift * s * (14.0 + 30.0 * rnd) + vec2(0.0, -1.0) * uHover * (3.0 + 5.0 * rnd) * sin(t * 2.0 + rnd * 6.28);
    // the hand pushes the dust aside
    vec2 toHand = p - uHand;
    float dh = length(toHand);
    float push = exp(-dh * dh / (55.0 * 55.0)) * (0.5 + 0.5 * uHover);
    p += (dh > 0.001 ? toHand / dh : vec2(0.0)) * push * 9.0 * (0.4 + rnd);
    vec2 ndc = vec2(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0);
    gl_Position = vec4(ndc, 0.0, 1.0);
    float R = texture(uReveal, vec2(p.x / uView.x, 1.0 - p.y / uView.y)).r;
    float light = pow(smoothstep(0.0, 1.0, R), 1.3);
    light = max(light, s * 0.85);                    // what flies, you see
    float tw = snoise(vec2(uv.x * 60.0 + uTime * 0.5, uv.y * 60.0 - uTime * 0.4)) * 0.5 + 0.5;
    float glitter = 0.08 * lum * lum * (0.3 + 0.7 * tw * tw);
    vec3 lit = col * (0.022 + light) + col * glitter * (1.0 - light);
    lit += vec3(0.10, 0.06, 0.025) * light * (1.0 - light) * 1.6 * (0.3 + lum);
    vCol = lit;
    vRound = s;
    vAlpha = 1.0 - s * 0.55;
    gl_PointSize = mix(uSize * uDpr + 1.0, uSize * uDpr * 2.6, s);
  }`;

  const DUST_FS = `#version 300 es
  precision highp float; in vec3 vCol; in float vAlpha; in float vRound; out vec4 o;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (vRound > 0.03 && d > 0.25) discard;
    float a = vAlpha * (1.0 - smoothstep(0.12, 0.25, d) * 0.5 * vRound);
    o = vec4(vCol * a, a);
  }`;

  function compile(type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  class Program {
    constructor(vs, fs) {
      this.p = gl.createProgram();
      gl.attachShader(this.p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(this.p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(this.p);
      if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.p));
      this.u = {};
      const n = gl.getProgramParameter(this.p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(this.p, i); this.u[info.name] = { loc: gl.getUniformLocation(this.p, info.name), type: info.type }; }
    }
    use() { gl.useProgram(this.p); return this; }
    set(vals) {
      for (const k in vals) {
        const u = this.u[k]; if (!u) continue; const v = vals[k];
        switch (u.type) {
          case gl.FLOAT: gl.uniform1f(u.loc, v); break;
          case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
          case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
          case gl.INT: case gl.SAMPLER_2D: gl.uniform1i(u.loc, v); break;
        }
      }
      return this;
    }
  }
  let quadVao = null;
  function drawQuad(target) {
    if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.viewport(0, 0, target.width, target.height); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null);
  }
  function createFBO(w, h) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, fbo, width: w, height: h, ok, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; }, dispose() { gl.deleteTexture(texture); gl.deleteFramebuffer(fbo); } };
  }
  function createDoubleFBO(w, h) {
    let a = createFBO(w, h), b = createFBO(w, h);
    return { get read() { return a; }, get write() { return b; }, swap() { const t = a; a = b; b = t; }, ok: a.ok && b.ok, width: w, height: h, aspect: w / h, dispose() { a.dispose(); b.dispose(); } };
  }
  function clearReveal() {
    if (!reveal) return;
    for (const f of [reveal.read, reveal.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function loadTexture(photo) {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => {
      if (!gl) return;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      photo.tex = tex; photo.ready = true;
    };
    im.src = photo.src;
  }
  function resizeArchive() {
    if (!gl) return;
    dpr = Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2);
    const w = Math.max(2, Math.round(innerWidth * dpr)), h = Math.max(2, Math.round(innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      if (reveal) reveal.dispose();
      reveal = createDoubleFBO(Math.round(w / 2), Math.round(h / 2));
      clearReveal();
    }
  }
  function startArchive() {
    if (archiveOn || !section || !photos.length) return;
    canvas = document.createElement('canvas');
    canvas.className = 'archive-live';
    canvas.setAttribute('aria-hidden', 'true');
    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) { gl = null; return; }
    try {
      progs.reveal = new Program(QUAD_VS, REVEAL_FS);
      progs.dust = new Program(DUST_VS, DUST_FS);
    } catch (e) { gl = null; return; }
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    maxPoints = isMobile ? 160 * 120 : 240 * 180;
    const idx = new Float32Array(maxPoints); for (let i = 0; i < maxPoints; i++) idx[i] = i;
    const idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    idxVao = gl.createVertexArray(); gl.bindVertexArray(idxVao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 4, 0); gl.bindVertexArray(null);
    blackTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, blackTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); archiveOn = false; section.classList.remove('live'); canvas.remove(); gl = null; }, false);
    document.body.appendChild(canvas);
    resizeArchive();
    for (const p of photos) loadTexture(p);
    section.classList.add('live');
    archiveOn = true;
    // the hand over a photo: it floats; a touch, and it lets go
    for (const p of photos) {
      p.link.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { p.hoverT = 1; p.liftT = Math.max(p.liftT, 0.34); } });
      p.link.addEventListener('pointerleave', () => { p.hoverT = 0; });
      p.link.addEventListener('pointerdown', () => { p.liftT = 1; p.liftAt = performance.now() / 1000; });
    }
  }
  let lastNow = 0;
  function archiveFrame(now, dt) {
    if (!archiveOn || !gl) return;
    if (!inView) { if (canvas.style.visibility !== 'hidden') { canvas.style.visibility = 'hidden'; } return; }
    if (canvas.style.visibility !== 'visible') canvas.style.visibility = 'visible';
    resizeArchive();
    // where the light is
    let tx, ty;
    const W = innerWidth, H = innerHeight;
    if (now - hand.lastMove < 6 && hand.has) { tx = hand.x / W; ty = 1 - hand.y / H; }
    else if (hand.gyro) { tx = 0.5 + hand.gyroX * 0.38; ty = 0.5 + hand.gyroY * 0.3; }
    else { tx = 0.5 + 0.34 * Math.sin(now * 0.1) + 0.08 * Math.sin(now * 0.29); ty = 0.5 + 0.3 * Math.sin(now * 0.067 + 1.3); }
    let tr = (isMobile ? 0.17 : 0.2) * (1 + 0.07 * Math.sin(now * 0.6));
    if (W < H) tr *= 1.35 * W / H;
    pool.x = lerp(pool.x, tx, 0.14); pool.y = lerp(pool.y, ty, 0.14); pool.r = lerp(pool.r, tr, 0.05);
    progs.reveal.use().set({ uPrev: reveal.read.attach(0), uPool: [pool.x, pool.y, pool.r], uDecay: Math.exp(-dt / 2.4), uUp: 1 - Math.exp(-dt / 0.4), uAspect: reveal.aspect, uTime: now });
    drawQuad(reveal.write); reveal.swap();
    // the photos
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const prog = progs.dust.use();
    gl.bindVertexArray(idxVao);
    for (const p of photos) {
      // the rise comes and goes on its own time
      if (p.liftT > 0) { p.liftT = Math.max(0, p.liftT - dt / (p.hoverT ? 6 : 3.2)); }
      const want = Math.max(p.liftT, p.hoverT ? 0.22 : 0);
      p.lift = lerp(p.lift, want, want > p.lift ? 1 - Math.exp(-dt / 0.35) : 1 - Math.exp(-dt / 1.2));
      p.hover = lerp(p.hover, p.hoverT || 0, 1 - Math.exp(-dt / 0.4));
      if (!p.ready) continue;
      const r = p.img.getBoundingClientRect();
      if (r.bottom < -160 || r.top > H + 60 || r.width < 2) continue;
      let cols = Math.round(clamp(r.width * (isMobile ? 0.9 : 1.0), 48, isMobile ? 160 : 240));
      let rows = Math.round(cols * r.height / r.width);
      if (cols * rows > maxPoints) { rows = Math.floor(maxPoints / cols); }
      prog.set({
        uTex: (gl.activeTexture(gl.TEXTURE0), gl.bindTexture(gl.TEXTURE_2D, p.tex), 0), uReveal: reveal.read.attach(1),
        uGrid: [cols, rows], uRect: [r.left, r.top], uRectSize: [r.width, r.height], uView: [W, H], uHand: [hand.x, hand.y],
        uTime: now, uLift: p.lift, uHover: p.hover, uSeed: p.seed, uSize: r.width / cols, uDpr: dpr
      });
      gl.drawArrays(gl.POINTS, 0, cols * rows);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  /* ---------------------------------------------------------------- the line at the bottom: dust that writes, forgets, and remembers */
  const foot = document.getElementById('footnote-live');
  let footCtx = null, footPts = null, footN = 0, footW = 0, footH = 0, footDpr = 1, footText = null, footReady = false, footSeen = false;
  const LINE = 'OR BE FOR EVER FALL’N', LINE_B = 'LONG IS THE WAY AND HARD';
  function footSetup() {
    if (!foot) return;
    footCtx = foot.getContext('2d');
    if (!footCtx) return;
    footDpr = Math.min(devicePixelRatio || 1, 3);
    const cssW = Math.min(320, Math.max(220, Math.round(innerWidth * 0.6)));
    footW = cssW; footH = 60;
    foot.style.width = cssW + 'px'; foot.style.height = footH + 'px';
    foot.width = Math.round(cssW * footDpr); foot.height = Math.round(footH * footDpr);
    footN = isMobile ? 2000 : 3200;
    footPts = { x: new Float32Array(footN), y: new Float32Array(footN), px: new Float32Array(footN), py: new Float32Array(footN), vx: new Float32Array(footN), vy: new Float32Array(footN), tx: new Float32Array(footN), ty: new Float32Array(footN), ux: new Float32Array(footN), uy: new Float32Array(footN), w: new Float32Array(footN), ax: new Float32Array(footN), ay: new Float32Array(footN), az: new Float32Array(footN), d: new Float32Array(footN), k: new Float32Array(footN) };
    const P = footPts;
    for (let i = 0; i < footN; i++) {
      P.ax[i] = (Math.random() - 0.5) * 20; P.ay[i] = (Math.random() - 0.5) * 20; P.az[i] = 10 + Math.random() * 30;
      P.k[i] = 0.5 + Math.random();
    }
    const ready = document.fonts && document.fonts.load ? document.fonts.load('600 100px "Jost"') : Promise.resolve();
    ready.catch(() => {}).then(() => { footRaster(); footReady = true; });
  }
  function rasterLine(line, S, fontPx) {
    const off = document.createElement('canvas');
    const octx = off.getContext('2d');
    const font = `600 ${fontPx}px "Jost", Helvetica, Arial, sans-serif`;
    octx.font = font;
    const chars = Array.from(line);
    const track = 0.3 * fontPx;
    const widths = chars.map((c) => octx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
    off.width = Math.ceil(total) + S * 4; off.height = Math.ceil(fontPx * 1.4);
    octx.font = font; octx.fillStyle = '#fff'; octx.textBaseline = 'alphabetic';
    let x = S * 2; const baseline = Math.round(fontPx * 1.05);
    chars.forEach((c, i) => { octx.fillText(c, x, baseline); x += widths[i] + track; });
    const data = octx.getImageData(0, 0, off.width, off.height).data;
    const px = [];
    for (let yy = 0; yy < off.height; yy++) for (let xx = 0; xx < off.width; xx++) if (data[(yy * off.width + xx) * 4 + 3] > 110) px.push(xx, yy);
    return { px, n: px.length / 2, total, baseline };
  }
  function footRaster() {
    const S = 6, fontPx = 11.5 * S;
    const A = rasterLine(LINE, S, fontPx), B = rasterLine(LINE_B, S, fontPx);
    const scale = Math.min(1, (footW - 10) / (Math.max(A.total, B.total) / S));
    const P = footPts;
    const place = (R, X, Y) => {
      const x0 = (footW - R.total / S * scale) / 2, y0 = footH - 12 - (R.baseline / S) * scale;
      for (let i = 0; i < footN; i++) {
        const j = Math.floor(Math.random() * R.n);
        X[i] = x0 + (R.px[j * 2] + Math.random()) / S * scale;
        Y[i] = y0 + (R.px[j * 2 + 1] + Math.random()) / S * scale;
      }
      return { x0, w: R.total / S * scale };
    };
    const a = place(A, P.tx, P.ty);
    place(B, P.ux, P.uy);
    for (let i = 0; i < footN; i++) { P.x[i] = 0; P.y[i] = 0; P.w[i] = 0; P.d[i] = (P.tx[i] - a.x0) / Math.max(1, a.w); }
    footText = a;
  }
  let footPhaseT = 0, footMorph = 0, footAngle = 0, footMix = 0;
  function footFrame(now, dt) {
    if (!footCtx || !footReady || !footSeen) return;
    const P = footPts, ctx = footCtx;
    // the cycle: the line holds, lets go into the storm, and finds itself again
    footPhaseT += dt;
    const CYCLE = 21, HOLD = 6.5, DISSOLVE = 3.2, STORM = 8.3;
    const tc = footPhaseT % CYCLE;
    let m;
    if (tc < HOLD) m = 0; else if (tc < HOLD + DISSOLVE) m = (tc - HOLD) / DISSOLVE; else if (tc < HOLD + DISSOLVE + STORM) m = 1; else m = 1 - (tc - HOLD - DISSOLVE - STORM) / (CYCLE - HOLD - DISSOLVE - STORM);
    footMorph = m;
    footAngle += dt * 0.07;
    const ca = Math.cos(footAngle), sa = Math.sin(footAngle);
    const hx = hand.x, hy = hand.y;
    const fr = foot.getBoundingClientRect();
    const handIn = hand.has && hx > fr.left - 30 && hx < fr.right + 30 && hy > fr.top + 8 && hy < fr.bottom + 24;
    const kick = handIn && now - hand.lastMove < 0.2;
    const lx = hx - fr.left, ly = hy - fr.top;
    const sdt = Math.min(dt, 0.033);
    footMix = lerp(footMix, handIn ? 1 : 0, 1 - Math.exp(-dt / 0.35));
    const W = footW, H = footH;
    for (let i = 0; i < footN; i++) {
      // the storm, a weather that never repeats, seen edge on
      let X = P.ax[i], Y = P.ay[i], Z = P.az[i];
      const ddt = sdt * 0.3;
      const dX = 10 * (Y - X), dY = X * (28 - Z) - Y, dZ = X * Y - (8 / 3) * Z;
      X += dX * ddt; Y += dY * ddt; Z += dZ * ddt;
      P.ax[i] = X; P.ay[i] = Y; P.az[i] = Z;
      const rx = X * ca + Y * sa;
      const sx = (rx + 24) / 48 * W;
      const sy = H - 7 - ((Z - 2) / 46) * 34;
      // which line the grain writes: the hand turns one into the other, left to right
      const wi0 = clamp(footMix * 1.5 - P.d[i] * 0.5 - (P.k[i] - 0.5) * 0.15, 0, 1);
      const wi = wi0 * wi0 * (3 - 2 * wi0);
      const ltx = P.tx[i] + (P.ux[i] - P.tx[i]) * wi, lty = P.ty[i] + (P.uy[i] - P.ty[i]) * wi;
      // this grain's own moment to let go, left to right, with a little chance in it
      const mi = clamp((m * 1.5 - P.d[i] * 0.5 - (P.k[i] - 0.5) * 0.2) / 1.0, 0, 1);
      const e = mi * mi * (3 - 2 * mi);
      const gx = ltx + (sx - ltx) * e, gy = lty + (sy - lty) * e;
      // the grain sits where it belongs; a hand knocks it off, and a spring brings it back
      const k = 9 + 10 * P.k[i], damp = Math.exp(-sdt * 2.2);
      P.vx[i] = (P.vx[i] - P.x[i] * k * sdt) * damp;
      P.vy[i] = (P.vy[i] - P.y[i] * k * sdt) * damp;
      if (kick) {
        const px = gx + P.x[i], py = gy + P.y[i];
        const ddx = px - lx, ddy = py - ly, dd = ddx * ddx + ddy * ddy;
        if (dd < 900) { const f = (1 - dd / 900); P.vy[i] -= f * (120 + 140 * P.k[i]) * sdt * 8; P.vx[i] += ddx * f * sdt * 30; }
      }
      P.x[i] += P.vx[i] * sdt; P.y[i] += P.vy[i] * sdt;
      P.px[i] = gx + P.x[i]; P.py[i] = gy + P.y[i];
    }
    ctx.setTransform(footDpr, 0, 0, footDpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const size = 1.3 / footDpr;
    const a = footDpr >= 2 ? 0.3 : 0.22;
    ctx.fillStyle = `rgba(255, 250, 232, ${m > 0.02 ? a * 0.85 : a})`;
    for (let i = 0; i < footN; i++) ctx.fillRect(P.px[i], P.py[i], size, size);
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- the loop and the watchers */
  function frame(now) {
    requestAnimationFrame(frame);
    const t = now / 1000;
    const dt = lastNow ? clamp(t - lastNow, 0.001, 0.05) : 0.016;
    lastNow = t;
    if (document.hidden) return;
    flipFrame(t);
    lifeFrame(t, dt);
    archiveFrame(t, dt);
    footFrame(t, dt);
  }
  if (section && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { near = en.isIntersecting; if (near) startArchive(); }, { rootMargin: '150% 0px' }).observe(section);
    new IntersectionObserver(([en]) => { inView = en.isIntersecting; if (inView && reveal) clearReveal(); }, { threshold: 0 }).observe(section);
  } else if (section) { near = true; inView = true; startArchive(); }
  if (foot) {
    footSetup();
    if ('IntersectionObserver' in window) new IntersectionObserver(([en]) => { footSeen = en.isIntersecting; }, { threshold: 0 }).observe(foot);
    else footSeen = true;
  }
  window.addEventListener('resize', () => { flipRectsAt = -1; if (foot && footCtx) { footSetup(); } }, { passive: true });
  document.addEventListener('visibilitychange', () => { lastNow = 0; });
  requestAnimationFrame(frame);
})();
