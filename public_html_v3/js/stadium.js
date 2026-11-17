/* Usmani Cricket Academy v3: the v1 ball hero flies into the v2 stadium.

   The intro is split in two by data-hero on #intro (0.22 = first 22% of it):
     hero part, q 0..1    the v1 cartoon ball on a red sky (second canvas, #ball)
       0.12-0.55          the red sky closes into the ball, revealing the stadium
       0.55-1.00          the ball drops away into the ground and lands at the
                          bowler's end, where the stadium ball takes over
     stadium part, P 0..1 as in v2 below; the ball waits on the pitch until
                          0.5, is picked up and bowled
   Everything is a pure function of scroll, so scrubbing back replays it all.

     0.00  aerial view of the ground
     0.22  sweep down past the floodlights
     0.42  behind the bowler's stumps
     0.60  ball is released ...
     0.86  ... and hits the stumps; bails fly
     1.00  close-up at the batter's end
*/
import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js').then(function (THREE) {
'use strict';

const canvas = document.getElementById('stadium');
const intro = document.getElementById('intro');
const ballCanvas = document.getElementById('ball');
const redSky = document.querySelector('.hero-sky');
const HERO = parseFloat(intro.dataset.hero) || 0;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
}
if (renderer) init();

function init() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x050706, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050706, 0.004);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 1200);

  const clock = new THREE.Clock();
  const uTime = { value: 0 };

  /* ---------- floodlights (shared by every shader) ---------- */
  const TOWER_R = 82, TOWER_H = 50;
  const towerPos = [45, 135, 225, 315].map((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    return new THREE.Vector3(Math.cos(a) * TOWER_R, TOWER_H, Math.sin(a) * TOWER_R);
  });

  const LIGHTING = /* glsl */`
    uniform vec3 uLights[4];
    uniform float uTime;
    // how brightly the floodlights hit a point on the ground (about 1.0 mid-field)
    float flood(vec3 wp) {
      float l = 0.0;
      for (int i = 0; i < 4; i++) {
        vec3 aim = uLights[i] * vec3(-0.2, 0.0, -0.2);   // each tower lights the far side
        float d = length(wp.xz - aim.xz);
        l += exp(-d * d / 2600.0);
      }
      return l * 0.3;
    }
    vec3 applyFog(vec3 col, vec3 wp) {
      float d = length(wp - cameraPosition);
      float f = 1.0 - exp(-d * d * 0.000016);
      return mix(col, vec3(0.02, 0.03, 0.028), clamp(f, 0.0, 1.0));
    }
    float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
    }
  `;
  const lightUniforms = { uLights: { value: towerPos }, uTime };

  const worldVert = /* glsl */`
    varying vec3 vWorld;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  /* ---------- outfield ---------- */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(74, 128).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: lightUniforms,
      vertexShader: worldVert,
      fragmentShader: /* glsl */`
        ${LIGHTING}
        varying vec3 vWorld;
        void main() {
          vec2 p = vWorld.xz;
          float r = length(p);
          // mowing: straight stripes on the square, rings further out
          float m = r < 30.0 ? fract(p.x / 5.0) : fract(r / 5.5);
          float stripe = step(0.5, m);
          vec3 g = mix(vec3(0.06, 0.15, 0.065), vec3(0.08, 0.19, 0.085), stripe);
          g *= 0.85 + 0.3 * vnoise(p * 0.6) + 0.08 * vnoise(p * 9.0);

          // 30-yard circle (dashes) and boundary rope
          float ang = atan(p.y, p.x);
          float circle = step(abs(r - 27.4), 0.12) * step(fract(ang * 36.0 / 3.14159), 0.35);
          float rope = smoothstep(0.35, 0.1, abs(r - 64.0));
          vec3 col = mix(g, vec3(0.92), circle * 0.8);
          col = mix(col, vec3(0.95, 0.95, 0.9), rope);
          col = mix(col, vec3(0.03, 0.06, 0.04), smoothstep(65.0, 67.0, r));   // apron

          float L = flood(vWorld);
          col *= 0.25 + 1.25 * L;
          col += vec3(0.9, 1.0, 0.85) * pow(L, 3.0) * 0.04;                   // sheen
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }
      `
    })
  );
  scene.add(ground);

  /* ---------- pitch + creases ---------- */
  const PITCH_W = 3.05, PITCH_L = 22.4;
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(PITCH_W, PITCH_L).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: lightUniforms,
      vertexShader: worldVert,
      fragmentShader: /* glsl */`
        ${LIGHTING}
        varying vec3 vWorld;
        varying vec2 vUv;
        float line(float d) { return smoothstep(0.035, 0.015, d); }
        void main() {
          float x = (vUv.x - 0.5) * ${PITCH_W.toFixed(2)};
          float z = (0.5 - vUv.y) * ${PITCH_L.toFixed(2)};
          float az = abs(z), ax = abs(x);

          vec3 col = vec3(0.62, 0.55, 0.38);
          col *= 0.82 + 0.25 * vnoise(vec2(x, z) * 3.0) + 0.1 * vnoise(vec2(x, z) * 25.0);
          // worn patches where bowlers land and batters stand
          col = mix(col, vec3(0.46, 0.38, 0.25), smoothstep(2.6, 0.0, length(vec2(x * 1.6, az - 8.0))) * 0.6);
          col = mix(col, vec3(0.46, 0.38, 0.25), smoothstep(1.2, 0.0, length(vec2(x * 2.0, az - 9.4))) * 0.5);
          // soft green edge
          col = mix(col, vec3(0.1, 0.22, 0.1), smoothstep(1.2, 1.52, ax));

          float c = 0.0;
          c += line(abs(az - 10.06)) * step(ax, 1.32);                    // bowling crease
          c += line(abs(az - 8.84)) * step(ax, 1.52);                     // popping crease
          c += line(abs(ax - 1.32)) * step(8.84, az) * step(az, 11.1);    // return creases
          col = mix(col, vec3(0.98), clamp(c, 0.0, 1.0));

          col *= 0.35 + 1.15 * flood(vWorld);
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }
      `
    })
  );
  pitch.position.y = 0.01;
  scene.add(pitch);

  /* ---------- stands: lathe bowl with seat rows + crowd ---------- */
  const bowlProfile = [
    [70, -0.5], [70, 1.4], [72, 1.4], [92, 16], [93, 16], [93, 21], [108, 34], [108, 40]
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const stands = new THREE.Mesh(
    new THREE.LatheGeometry(bowlProfile, 160),
    new THREE.ShaderMaterial({
      uniforms: lightUniforms,
      side: THREE.DoubleSide,
      vertexShader: worldVert,
      fragmentShader: /* glsl */`
        ${LIGHTING}
        varying vec3 vWorld;
        void main() {
          float h = vWorld.y;
          float ang = atan(vWorld.z, vWorld.x);
          float row = fract(h * 1.4);
          vec3 col = mix(vec3(0.05, 0.055, 0.06), vec3(0.09, 0.09, 0.1), step(0.5, row));
          // crowd: one speck per seat, some seats empty
          vec2 seat = vec2(floor(ang * 420.0), floor(h * 1.4));
          float occ = step(0.45, hash21(seat));
          vec3 shirt = 0.5 + 0.5 * cos(6.2831 * (hash21(seat + 7.0) + vec3(0.0, 0.33, 0.67)));
          float speck = occ * step(0.25, row) * step(row, 0.75);
          // far away a seat is smaller than a pixel: blend to the average instead of shimmering
          float detail = clamp(1.6 - max(fwidth(ang * 420.0), fwidth(h * 1.4)) * 2.0, 0.0, 1.0);
          speck = mix(0.27, speck, detail);
          shirt = mix(vec3(0.5), shirt, detail);
          col = mix(col, shirt * 0.45, speck * step(h, 34.0));
          // camera flashes
          float flash = step(0.99985, hash21(seat + floor(uTime * 4.0))) * step(0.35, row) * step(row, 0.65) * detail;
          col += vec3(1.0) * flash * step(1.0, h);
          // concourse band + ad boards at the base
          col = mix(col, vec3(0.01), step(16.0, h) * step(h, 21.0));
          float board = step(h, 1.4) * step(0.0, h);
          col = mix(col, mix(vec3(0.84, 1.0, 0.23), vec3(0.95), step(0.5, fract(ang * 12.0))), board * 0.85);
          col *= 0.5 + 0.9 * clamp(1.0 - h / 60.0, 0.0, 1.0);
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }
      `
    })
  );
  scene.add(stands);

  /* ---------- sky ---------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          float y = vDir.y;
          vec3 col = mix(vec3(0.09, 0.11, 0.1), vec3(0.008, 0.01, 0.014), smoothstep(-0.02, 0.45, y));  // light-polluted haze
          vec3 cell = floor(vDir * 260.0);
          float star = step(0.9965, h3(cell)) * smoothstep(0.08, 0.4, y);
          col += vec3(0.8, 0.85, 1.0) * star * (0.4 + 0.6 * h3(cell + 3.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
  scene.add(sky);

  /* ---------- lights for the few standard materials ---------- */
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0a1a0c, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.copy(towerPos[3]);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff2d8, 1.0);
  fill.position.copy(towerPos[1]);
  scene.add(fill);

  /* ---------- floodlight towers + beams ---------- */
  const glowTex = makeGlowTexture();
  const steel = new THREE.MeshStandardMaterial({ color: 0x1a1d1f, roughness: 0.8, metalness: 0.4 });
  const panelMat = new THREE.ShaderMaterial({
    fog: false,
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vec2 g = fract(vUv * vec2(10.0, 5.0)) - 0.5;
        float lamp = smoothstep(0.42, 0.3, length(g));
        gl_FragColor = vec4(mix(vec3(0.04), vec3(1.0, 0.98, 0.9), lamp), 1.0);
      }
    `
  });
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        float along = vUv.y;                       // 1 at the lamp, 0 at the far end
        float a = pow(along, 2.2) * pow(vFacing, 2.0) * 0.16;
        a *= 0.85 + 0.15 * sin(vUv.x * 40.0 + uTime * 0.7);   // faint drifting haze
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * a, 1.0);
      }
    `
  });

  const moths = [];
  towerPos.forEach((p) => {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, TOWER_H, 8), steel);
    mast.position.set(p.x, TOWER_H / 2, p.z);
    scene.add(mast);

    const head = new THREE.Group();
    head.position.copy(p);
    head.lookAt(0, 0, 0);
    scene.add(head);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.6), [steel, steel, steel, steel, panelMat, steel]);
    head.add(panel);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff6e0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    glow.scale.setScalar(46);
    glow.position.z = 1.5;
    head.add(glow);

    const beamGeo = new THREE.ConeGeometry(34, 95, 40, 1, true);
    beamGeo.translate(0, -47.5, 0);      // apex at the lamp
    beamGeo.rotateX(-Math.PI / 2);       // point down +z, toward what the head looks at
    head.add(new THREE.Mesh(beamGeo, beamMat));

    // moths / dust caught in the light
    const n = 70, mp = new Float32Array(n * 3), ms = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      mp[i * 3] = (Math.random() - 0.5) * 16;
      mp[i * 3 + 1] = (Math.random() - 0.5) * 10;
      mp[i * 3 + 2] = 3 + Math.random() * 14;
      ms[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
    const pts = new THREE.Points(g, mothMat());
    head.add(pts);
    moths.push(pts);
  });

  function mothMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime, uPR: { value: renderer.getPixelRatio() } },
      vertexShader: /* glsl */`
        uniform float uTime; uniform float uPR;
        attribute float aSeed;
        varying float vA;
        void main() {
          vec3 p = position;
          float t = uTime * (0.6 + aSeed);
          p += vec3(sin(t + aSeed * 40.0), cos(t * 1.3 + aSeed * 17.0), sin(t * 0.7)) * 1.4;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + aSeed * 3.0) * uPR * (60.0 / -mv.z);
          vA = 0.4 + 0.6 * aSeed;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.95, 0.8), smoothstep(0.5, 0.0, d) * vA); }
      `
    });
  }

  /* ---------- stumps + bails ---------- */
  const STUMP_Z = 10.06, STUMP_H = 0.71, STUMP_GAP = 0.114;
  const wood = new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.45 });
  const stumpGeo = new THREE.CylinderGeometry(0.018, 0.018, STUMP_H, 12).translate(0, STUMP_H / 2, 0);
  const bailGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.11, 8).rotateZ(Math.PI / 2);

  function wicket(z) {
    const set = { stumps: [], bails: [] };
    for (let i = -1; i <= 1; i++) {
      const s = new THREE.Mesh(stumpGeo, wood);
      s.position.set(i * STUMP_GAP, 0, z);
      scene.add(s);
      set.stumps.push(s);
    }
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(bailGeo, wood);
      b.userData.home = new THREE.Vector3((i - 0.5) * STUMP_GAP, STUMP_H + 0.01, z);
      b.position.copy(b.userData.home);
      scene.add(b);
      set.bails.push(b);
    }
    return set;
  }
  wicket(-STUMP_Z);                 // bowler's end
  const target = wicket(STUMP_Z);   // batter's end, the one that gets hit

  /* ---------- ball + trail ---------- */
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.25, emissive: 0x3a0503 })
  );
  scene.add(ball);
  const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff6040, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  ballGlow.scale.setScalar(0.7);
  ball.add(ballGlow);

  // v3: while the camera is far away the real ball is sub-pixel, so a small
  // flat ball marker (constant size on screen) shows where the hero ball landed
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeBallMarker(), transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false
  }));
  marker.renderOrder = 10;
  ball.add(marker);

  const TRAIL = 40;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailCol = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  trail.frustumCulled = false;
  scene.add(trail);

  const RELEASE = new THREE.Vector3(0.35, 2.25, -STUMP_Z + 0.4);
  const BOUNCE = new THREE.Vector3(0.12, 0.06, 4.0);
  const HIT = new THREE.Vector3(0.0, 0.42, STUMP_Z - 0.03);
  const REST = new THREE.Vector3(0.3, 0.06, -STUMP_Z + 1.6);   // where the hero ball lands

  // s: 0..1 along the delivery. Returns position in `out`.
  function deliveryAt(s, out) {
    const BOUNCE_AT = 0.68;
    if (s <= BOUNCE_AT) {
      const u = s / BOUNCE_AT;
      out.lerpVectors(RELEASE, BOUNCE, u);
      out.y = THREE.MathUtils.lerp(RELEASE.y, BOUNCE.y, u * u * 0.6 + u * 0.4) + Math.sin(u * Math.PI) * 0.25;
    } else {
      const u = (s - BOUNCE_AT) / (1 - BOUNCE_AT);
      out.lerpVectors(BOUNCE, HIT, u);
      out.y = THREE.MathUtils.lerp(BOUNCE.y, HIT.y, u) + Math.sin(u * Math.PI) * 0.22;
    }
    return out;
  }

  // after the hit, h in "seconds"
  const bailFly = [
    { v: new THREE.Vector3(-1.1, 2.6, 2.4), w: new THREE.Vector3(9, 4, 13) },
    { v: new THREE.Vector3(0.9, 3.1, 1.9), w: new THREE.Vector3(-7, 11, -5) }
  ];
  const G = -9.8;

  /* ---------- camera rail ---------- */
  const keys = [
    // P,     camera position,                      look at
    [0.00, [0, 135, 105],     [0, 0, 0]],
    [0.22, [62, 34, 58],      [0, 2, 0]],
    [0.42, [12, 3.4, -27],    [0, 0.6, 0]],
    [0.60, [0.8, 2.1, -15.5], [0, 0.6, 6]],
    [0.74, [2.4, 1.5, -2],    [0, 0.5, 9]],
    [0.86, [2.6, 1.05, 6.6],  [0, 0.45, 10.06]],
    [1.00, [1.7, 0.75, 8.2],  [0, 0.55, 10.6]]
  ];
  const camCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[1])), false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[2])), false, 'centripetal');
  function railU(P) {
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i][0], b = keys[i + 1][0];
      if (P <= b) return (i + (P - a) / (b - a)) / (keys.length - 1);
    }
    return 1;
  }

  /* ---------- scroll progress ---------- */
  function rawProgress() {
    const r = intro.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    return total > 0 ? THREE.MathUtils.clamp(-r.top / total, 0, 1) : 0;
  }
  const split = (raw) => ({ q: HERO ? Math.min(1, raw / HERO) : 1, P: Math.max(0, (raw - HERO) / (1 - HERO)) });
  let RAW = rawProgress();
  const LAND = 0.99;   // hero ball hands over to the stadium ball here
  let landed = split(RAW).q >= LAND;

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* =====================================================================
     Hero ball (from v1): its own scene + renderer on the #ball canvas,
     drawn over the red sky. Shader, glow and dust are v1's.
     ===================================================================== */
  const hero = createHero();

  function createHero() {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: ballCanvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    /* ---------------- Ball ---------------- */
    const ballUniforms = {
      uTime: { value: 0 }
    };

    const ballMat = new THREE.ShaderMaterial({
      uniforms: ballUniforms,
      vertexShader: /* glsl */`
        varying vec3 vObj;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vObj = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        // Cartoon-style ball: flat colour bands + gloss in view space (so the
        // shading stays put while the ball spins), seam + stitches in object space.
        uniform float uTime;
        varying vec3 vObj;
        varying vec3 vNormal;
        varying vec3 vView;

        // anti-aliased fill for a signed distance (negative = inside)
        float fill(float d) { float w = fwidth(d) * 0.75; return smoothstep(w, -w, d); }

        // rotated ellipse, approximate signed distance
        float ellipse(vec2 p, vec2 c, vec2 r, float rot) {
          p -= c;
          float cs = cos(rot), sn = sin(rot);
          p = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y);
          return (length(p / r) - 1.0) * min(r.x, r.y);
        }

        const float TAU = 6.28318530718;
        const float STITCHES = 50.0;                 // stitches per row around the ball

        // distance to the nearest stitch in one row at seam offset v0
        float stitchRow(float u, float v, float v0, float stagger, float tilt) {
          float cell = TAU / STITCHES;
          float x = (fract(u / cell + stagger) - 0.5) * cell;
          return ellipse(vec2(x, v - v0), vec2(0.0), vec2(0.044, 0.0145), tilt);
        }

        void main() {
          vec3 n = normalize(vNormal);
          vec2 q = n.xy;                               // screen-facing disc coords, -1..1

          /* ---- colour bands (match the reference ball) ---- */
          vec3 cBase   = vec3(0.886, 0.184, 0.153);    // #e22f27
          vec3 cLight  = vec3(0.933, 0.306, 0.259);    // #ee4e42
          vec3 cShadow = vec3(0.706, 0.106, 0.078);    // #b41b14
          vec3 cGloss  = vec3(1.000, 0.612, 0.576);    // #ff9c93

          vec3 col = cBase;
          // big lighter area over the upper-left
          col = mix(col, cLight, fill(length(q - vec2(-0.30, 0.28)) - 0.78));
          // dark crescent along the lower-right rim
          col = mix(col, cShadow, fill(0.93 - length(q - vec2(-0.10, 0.08))));

          /* ---- seam ---- */
          vec3 p = normalize(vObj);
          float u = atan(p.z, p.x);
          float v = p.y;                               // signed distance from the seam
          float side = sign(v);

          float d = 1e3;
          for (int k = 0; k < 3; k++) {
            float fk = float(k);
            float v0 = side * (0.040 + fk * 0.060);
            d = min(d, stitchRow(u, v, v0, fk * 0.5, side * 0.32));
          }
          float stitch = fill(d);
          float groove = fill(abs(v) - 0.006);

          // thread: cream, a touch darker where the ball is in shadow
          vec3 thread = mix(vec3(0.992, 0.925, 0.733), vec3(0.85, 0.72, 0.52), smoothstep(0.85, 1.0, length(q - vec2(-0.1, 0.08))));
          vec3 threadEdge = mix(col, vec3(0.55, 0.12, 0.08), 0.6);
          col = mix(col, threadEdge, fill(d - 0.004));  // thin outline around each stitch
          col = mix(col, thread, stitch);
          col = mix(col, vec3(0.16, 0.03, 0.03), groove);

          /* ---- gloss highlights (on top of everything) ---- */
          float g1 = fill(ellipse(q, vec2(-0.30, 0.56), vec2(0.27, 0.13), 0.42));
          float g2 = fill(ellipse(q, vec2(-0.66, 0.18), vec2(0.075, 0.12), -0.35));
          col = mix(col, cGloss, max(g1, g2) * 0.92);

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), ballMat);

    const ballSpin = new THREE.Group();   // spins along the seam
    const ballAim = new THREE.Group();    // seam angle: arcs down the right side of the ball
    const ballTilt = new THREE.Group();   // mouse parallax
    const ballRig = new THREE.Group();    // position/scale (scroll + layout)
    ballSpin.add(ball);
    ballAim.add(ballSpin);
    ballTilt.add(ballAim);
    ballRig.add(ballTilt);
    // Seam plane normal, relative to the camera (the rig faces the camera every
    // frame): mostly sideways so the seam arcs down the right of the ball.
    ballAim.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-0.9, 0.22, 0.38).normalize()
    );
    scene.add(ballRig);

    /* ---------------- Glow behind the ball ---------------- */
    const glowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: ballUniforms.uTime, uFade: { value: 1 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uFade;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float pulse = 0.85 + 0.15 * sin(uTime * 1.3);
          float g = smoothstep(1.0, 0.25, d) * 0.35 * pulse;
          // faint concentric "motion" rings
          float rings = smoothstep(0.03, 0.0, abs(fract(d * 3.0 - uTime * 0.25) - 0.5) - 0.47) * smoothstep(1.0, 0.45, d) * 0.12;
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.6), (g + rings) * uFade);
        }
      `
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), glowMat);
    glow.position.z = -1.2;
    ballRig.add(glow);

    /* ---------------- Dust particles ---------------- */
    const COUNT = window.innerWidth < 700 ? 220 : 480;
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
      seed[i] = Math.random();
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: ballUniforms.uTime,
        uPixelRatio: { value: renderer.getPixelRatio() },
        uScroll: { value: 0 },
        uFade: { value: 1 }
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uPixelRatio;
        uniform float uScroll;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.15 + aSeed * 0.35) + uScroll * 3.0 + 5.0, 10.0) - 5.0;
          p.x += sin(uTime * 0.4 + aSeed * 30.0) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + aSeed * 5.0) * uPixelRatio * (6.0 / -mv.z);
          vAlpha = 0.25 + 0.55 * aSeed;
          vAlpha *= smoothstep(5.0, 3.5, abs(p.y));
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uFade;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha * uFade;
          gl_FragColor = vec4(1.0, 0.93, 0.85, a);
        }
      `
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    scene.add(dust);

    /* ---------------- Layout (v1 positions) ---------------- */
    const base = { x: 0, y: 0, s: 1 };
    let halfW = 1, halfH = 1, W = 1, H = 1;
    function resize() {
      W = ballCanvas.clientWidth; H = ballCanvas.clientHeight;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      halfW = halfH * camera.aspect;
      if (W > 900) {          // desktop: ball on the right
        base.x = halfW * 0.52; base.y = 0.1; base.s = Math.min(1.55, halfH * 0.48);
      } else if (W > 600) {   // tablet: top right, behind the headline
        base.x = halfW * 0.55; base.y = halfH * 0.42; base.s = Math.min(1.0, halfW * 0.3);
      } else {                // phone: above the headline
        base.x = halfW * 0.2; base.y = halfH * 0.36; base.s = Math.min(0.95, halfW * 0.42);
      }
    }

    // pop-in on load (v1's elastic entrance)
    const entry = { scale: reduceMotion ? 1 : 0.001, drop: reduceMotion ? 0 : 4 };
    if (window.gsap && !reduceMotion) {
      window.gsap.to(entry, { scale: 1, duration: 1.6, ease: 'elastic.out(1, 0.55)', delay: 0.35 });
      window.gsap.to(entry, { drop: 0, duration: 1.2, ease: 'power3.out', delay: 0.35 });
    } else { entry.scale = 1; entry.drop = 0; }

    let spin = 0;
    const tmpV = new THREE.Vector3();

    // q: hero progress 0..1; target: landing spot in NDC (-1..1).
    // Returns how far the sky has opened (0 = stadium fully hidden).
    // endPx: radius the ball should have when it lands (= the stadium's ball marker)
    function update(q, t, dt, pointer, target, endPx) {
      const c = THREE.MathUtils.smoothstep(q, 0.12, 0.55);   // sky closing in
      const d = THREE.MathUtils.smoothstep(q, 0.55, LAND);   // ball falling away
      const startPx = base.s * entry.scale / halfH * (H / 2);
      const SHRINK = THREE.MathUtils.clamp(endPx / startPx, 0.001, 0.5);
      const k = (1 - Math.pow(SHRINK, d)) / (1 - SHRINK);    // perspective: offset shrinks with size

      ballUniforms.uTime.value = t;
      dustMat.uniforms.uScroll.value = q;
      dustMat.uniforms.uFade.value = 1 - c;
      glowMat.uniforms.uFade.value = 1 - c;

      if (!reduceMotion) spin += dt * (0.9 + c * 5 + d * 10);
      ballSpin.rotation.y = spin;
      const calm = 1 - c;                                    // parallax fades out so the landing lines up
      ballTilt.rotation.x = pointer.y * 0.18 * calm;
      ballTilt.rotation.y = pointer.x * 0.22 * calm;

      const bob = reduceMotion ? 0 : Math.sin(t * 1.1) * 0.08 * calm;
      const sx = base.x + pointer.x * 0.15 * calm, sy = base.y + bob + entry.drop;
      ballRig.position.set(
        THREE.MathUtils.lerp(sx, target.x * halfW, k),
        THREE.MathUtils.lerp(sy, target.y * halfH, k),
        0
      );
      const scale = base.s * entry.scale * Math.pow(SHRINK, d);
      ballRig.scale.setScalar(scale);

      dust.rotation.y = pointer.x * 0.08 * calm;
      camera.position.set(pointer.x * 0.2 * calm, -pointer.y * 0.15 * calm, 9);
      camera.lookAt(0, 0, 0);
      ballRig.lookAt(camera.position);   // same seam view wherever the ball sits

      // red sky: a circle that closes in on the ball, then rides along under it
      tmpV.copy(ballRig.position).project(camera);
      const bx = (tmpV.x * 0.5 + 0.5) * W, by = (-tmpV.y * 0.5 + 0.5) * H;
      const ballPx = scale / halfH * (H / 2) * 0.97;
      const cover = Math.hypot(Math.max(bx, W - bx), Math.max(by, H - by)) + 40;
      const e = c * c * (3 - 2 * c);
      const radius = cover + (ballPx - cover) * e;
      redSky.style.clipPath = 'circle(' + radius.toFixed(1) + 'px at ' + bx.toFixed(1) + 'px ' + by.toFixed(1) + 'px)';
      redSky.style.visibility = q >= LAND ? 'hidden' : '';

      ballCanvas.style.visibility = q >= LAND ? 'hidden' : '';
      if (q < LAND) renderer.render(scene, camera);
      return c;
    }

    return { resize, update };
  }

  /* ---------- resize ---------- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 62 : camera.aspect < 1.2 ? 52 : 42;
    camera.updateProjectionMatrix();
    if (hero) hero.resize();
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------- loop (only while the intro is on screen) ---------- */
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(intro);

  const tmp = new THREE.Vector3(), camPos = new THREE.Vector3(), look = new THREE.Vector3();

  function update(P, t) {
    // camera
    const u = railU(P);
    camCurve.getPoint(u, camPos);
    lookCurve.getPoint(u, look);
    const idle = (1 - THREE.MathUtils.smoothstep(P, 0, 0.15)) * (reduceMotion ? 0 : 1);
    camPos.x += Math.sin(t * 0.12) * 18 * idle;
    camPos.x += pointer.x * (0.4 + 6 * idle);
    camPos.y += -pointer.y * (0.2 + 4 * idle);
    camera.position.copy(camPos);
    camera.lookAt(look);

    // delivery
    const s = THREE.MathUtils.clamp((P - 0.6) / 0.26, 0, 1);
    const h = Math.max(0, (P - 0.86) / 0.14) * 1.1;   // pseudo-seconds after impact

    if (h > 0) {
      // ball deflects off the stumps
      ball.position.set(HIT.x + 0.5 * h, Math.max(0.06, HIT.y + 1.2 * h + 0.5 * G * h * h), HIT.z + 1.6 * h);
    } else if (P < 0.6) {
      // waiting on the pitch, picked up by the bowler just before release
      const k = THREE.MathUtils.smoothstep(P, 0.5, 0.6);
      ball.position.lerpVectors(REST, RELEASE, k);
      ball.position.y += Math.sin(k * Math.PI) * 0.5;
    } else {
      deliveryAt(s, ball.position);
    }
    ball.visible = landed;
    // a beacon while it waits, so the ball can be followed down from the sky
    const dist = camera.position.distanceTo(ball.position);
    const far = 1 - THREE.MathUtils.smoothstep(P, 0.3, 0.45);
    ballGlow.scale.setScalar(Math.max(0.7, dist * 0.03 * far));
    ballGlow.material.depthTest = far < 0.5;   // seen from the sky the grass would hide half of it
    marker.visible = far > 0.01;
    marker.material.opacity = far;
    marker.scale.setScalar(0.022 * (1 + 0.12 * Math.sin(t * 4)));
    ballGlow.material.opacity = s > 0 && s < 1 ? 0.8 : P < 0.6 ? 0.9 : 0.3;

    // trail: sample the path just behind the ball
    for (let i = 0; i < TRAIL; i++) {
      const k = i / (TRAIL - 1);
      deliveryAt(Math.max(0, s - (1 - k) * 0.12), tmp);
      trailPos.set([tmp.x, tmp.y, tmp.z], i * 3);
      const fade = s > 0 ? k * k * (h > 0 ? Math.max(0, 1 - h * 1.5) : 1) : 0;
      trailCol.set([0.84 * fade, 1.0 * fade, 0.23 * fade], i * 3);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;

    // stumps + bails
    const [off, mid, leg] = target.stumps;
    mid.rotation.x = Math.min(h * 1.4, 0.65);
    off.rotation.z = -Math.min(h * 0.5, 0.18);
    leg.rotation.x = Math.min(h * 0.6, 0.22);
    target.bails.forEach((b, i) => {
      const f = bailFly[i];
      b.position.set(
        b.userData.home.x + f.v.x * h,
        Math.max(0.01, b.userData.home.y + f.v.y * h + 0.5 * G * h * h),
        b.userData.home.z + f.v.z * h
      );
      b.rotation.set(f.w.x * h, f.w.y * h, Math.PI / 2 + f.w.z * h);
    });
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) { clock.getDelta(); return; }
    const t = clock.getElapsedTime();
    uTime.value = t;

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    const dt = Math.min(t - lastT, 0.05); lastT = t;
    RAW += (rawProgress() - RAW) * (reduceMotion ? 1 : 0.09);
    const { q, P } = split(RAW);
    landed = q >= LAND;

    update(P, t);
    let opened = 1;
    if (hero) {
      // where the stadium ball sits on screen right now = where the hero ball lands
      landing.copy(REST).project(camera);
      const markerPx = 0.5 * 0.022 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (canvas.clientHeight / 2) * 0.75;
      opened = hero.update(q, t, dt, pointer, landing, markerPx);
    } else {
      redSky.style.visibility = 'hidden';
    }
    // the stadium is hidden behind the red sky until it starts to open
    if (opened > 0) renderer.render(scene, camera);
  }
  let lastT = 0;
  const landing = new THREE.Vector3();
  frame();
}

// flat cartoon ball (v1 colours) for the far-away marker
function makeBallMarker() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath(); g.arc(32, 34, 27, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e22f27';
  g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ee4e42';
  g.beginPath(); g.arc(27, 27, 16, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#fdecbb'; g.lineWidth = 3; g.setLineDash([3, 3]);
  g.beginPath(); g.arc(14, 32, 26, -0.75, 0.75); g.stroke();
  g.fillStyle = '#ff9c93';
  g.beginPath(); g.ellipse(25, 19, 7, 3.5, -0.4, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,250,235,.8)');
  grd.addColorStop(0.4, 'rgba(255,240,210,.18)');
  grd.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

}).catch(function () {
  document.documentElement.classList.add('no-webgl');
});
