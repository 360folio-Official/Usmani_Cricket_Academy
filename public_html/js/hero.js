/* Usmani Cricket Academy: Three.js hero
   A procedural cricket ball (leather, seam and stitching all in the
   fragment shader), floating dust particles and a soft glow.
   Loaded as a classic script so the page also works when index.html is
   opened straight from disk (file://), where module scripts are blocked. */
import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js').then(function (THREE) {
'use strict';

const canvas = document.getElementById('hero-canvas');
const hero = document.getElementById('hero');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
}

if (renderer) init();

function init() {
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
    uniforms: { uTime: ballUniforms.uTime },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float pulse = 0.85 + 0.15 * sin(uTime * 1.3);
        float g = smoothstep(1.0, 0.25, d) * 0.35 * pulse;
        // faint concentric "motion" rings
        float rings = smoothstep(0.03, 0.0, abs(fract(d * 3.0 - uTime * 0.25) - 0.5) - 0.47) * smoothstep(1.0, 0.45, d) * 0.12;
        gl_FragColor = vec4(vec3(1.0, 0.85, 0.6), g + rings);
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
      uScroll: { value: 0 }
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
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(1.0, 0.93, 0.85, a);
      }
    `
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* ---------------- Layout ---------------- */
  const base = { x: 0, y: 0, s: 1 };
  function layout() {
    const w = hero.clientWidth, h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // visible half-width at z=0
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    if (w > 900) {          // desktop: ball sits on the right
      base.x = halfW * 0.52; base.y = 0.1; base.s = Math.min(1.55, halfH * 0.48);
    } else if (w > 600) {   // tablet: top right, behind the headline
      base.x = halfW * 0.55; base.y = halfH * 0.42; base.s = Math.min(1.0, halfW * 0.3);
    } else {                // phone: above the headline (hero text sits at the bottom)
      base.x = halfW * 0.2; base.y = halfH * 0.45; base.s = Math.min(0.95, halfW * 0.42);
    }
    ballRig.position.set(base.x, base.y, 0);
    ballRig.scale.setScalar(base.s * intro.scale);
  }

  /* ---------------- Intro + scroll (GSAP if available) ---------------- */
  const intro = { scale: reduceMotion ? 1 : 0.001, drop: reduceMotion ? 0 : 4 };
  const scroll = { p: 0 };
  const gsap = window.gsap;

  if (gsap && !reduceMotion) {
    gsap.to(intro, { scale: 1, duration: 1.6, ease: 'elastic.out(1, 0.55)', delay: 0.35 });
    gsap.to(intro, { drop: 0, duration: 1.2, ease: 'power3.out', delay: 0.35 });
    if (window.ScrollTrigger) {
      gsap.to(scroll, {
        p: 1, ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6 }
      });
    }
  } else {
    intro.scale = 1; intro.drop = 0;
  }

  /* ---------------- Pointer parallax ---------------- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------------- Loop (paused when hero is off-screen) ---------------- */
  let visible = true;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(hero);

  const clock = new THREE.Clock();
  let spin = 0;

  function frame() {
    requestAnimationFrame(frame);
    if (!visible) { clock.getDelta(); return; }

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    ballUniforms.uTime.value = t;
    dustMat.uniforms.uScroll.value = scroll.p;

    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;

    // spins faster as you scroll down the hero
    if (!reduceMotion) spin += dt * (0.9 + scroll.p * 6.0);
    ballSpin.rotation.y = spin;

    ballTilt.rotation.x = pointer.y * 0.18;
    ballTilt.rotation.y = pointer.x * 0.22;

    const bob = reduceMotion ? 0 : Math.sin(t * 1.1) * 0.08;
    ballRig.position.set(
      base.x + pointer.x * 0.15 - scroll.p * base.x * 0.6,
      base.y + bob + intro.drop + scroll.p * 3.2,
      scroll.p * 1.5
    );
    ballRig.scale.setScalar(base.s * intro.scale);
    ballRig.lookAt(camera.position);   // same seam view wherever the ball sits on screen

    dust.rotation.y = pointer.x * 0.08;
    camera.position.x = pointer.x * 0.2;
    camera.position.y = -pointer.y * 0.15;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  layout();
  window.addEventListener('resize', layout);
  frame();
}

}).catch(function () {
  document.documentElement.classList.add('no-webgl');
});
