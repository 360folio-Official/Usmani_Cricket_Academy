/* Usmani Cricket Academy v3: page interactions */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof window.gsap !== 'undefined';
  if (!hasGsap) root.classList.remove('js');

  document.getElementById('year').textContent = new Date().getFullYear();
  var d = new Date();
  document.getElementById('sheet-date').textContent =
    String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();

  /* ---------- Menu ---------- */
  var menuBtn = document.querySelector('.menu-btn');
  var menu = document.getElementById('menu');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.textContent = open ? 'Close' : 'Menu';
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn.addEventListener('click', function () { setMenu(!document.body.classList.contains('menu-open')); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Custom cursor ---------- */
  var cursor = document.querySelector('.cursor');
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var cx = 0, cy = 0, tx = 0, ty = 0;
    window.addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.25; cy += (ty - cy) * 0.25;
      cursor.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
      requestAnimationFrame(loop);
    })();
    document.addEventListener('pointerover', function (e) {
      cursor.classList.toggle('big', !!e.target.closest('a, button, label, .drill-list li, .ticket, .frame, .shot'));
    });
  }

  /* ---------- Intro chapters + over counter (driven by scroll) ---------- */
  var intro = document.getElementById('intro');
  var chapters = [].slice.call(document.querySelectorAll('.chapter'));
  var overNum = document.getElementById('over-num');
  var overBalls = [].slice.call(document.querySelectorAll('.over-balls i'));
  var hint = document.querySelector('.scroll-hint');

  function introProgress() {
    var r = intro.getBoundingClientRect();
    var total = r.height - window.innerHeight;
    return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
  }

  // The first part of the intro (data-hero) is the v1 ball hero; the rest is
  // the stadium. q = hero progress, p = stadium progress, both 0..1.
  var HERO = parseFloat(intro.dataset.hero) || 0;
  var heroCopy = document.querySelector('.hero-copy');
  var heroSky = document.querySelector('.hero-sky');

  function updateIntro() {
    var P = introProgress();
    var q = HERO ? Math.min(1, P / HERO) : 1;
    var p = Math.max(0, (P - HERO) / (1 - HERO));

    // hero text lifts away over the first third of the hero part
    var t = Math.min(1, Math.max(0, (q - 0.04) / 0.3));
    heroCopy.style.opacity = 1 - t;
    heroCopy.style.translate = '0 ' + (-t * 80) + 'px';
    heroCopy.classList.toggle('off', t >= 1);
    root.classList.toggle('in-hero', q < 1);
    // without WebGL there is no ball to close into: just fade the red sky
    if (root.classList.contains('no-webgl')) heroSky.style.opacity = 1 - Math.min(1, Math.max(0, (q - 0.2) / 0.6));

    chapters.forEach(function (ch) {
      var a = +ch.dataset.from, b = +ch.dataset.to, fade = 0.04;
      var o = Math.min(1, Math.max(0, Math.min((p - a) / fade + (a === 0 ? 1 : 0), (b - p) / fade)));
      ch.style.opacity = o;
      ch.style.transform = (ch.classList.contains('ch-4') ? 'translateY(50%) ' : '') + 'translateY(' + ((1 - o) * 30) + 'px)';
      ch.classList.toggle('on', o > 0.01);
    });
    // six balls in the over, one per sixth of the intro
    var balls = Math.min(6, Math.floor(p * 6 + 0.02));
    overNum.textContent = balls === 6 ? '1.0' : '0.' + balls;
    overBalls.forEach(function (b, i) { b.classList.toggle('on', i < balls); });
    hint.style.opacity = P > 0.01 ? 0 : 1;
  }
  window.addEventListener('scroll', updateIntro, { passive: true });
  window.addEventListener('resize', updateIntro);
  updateIntro();

  /* ---------- Manifesto: words light up as you read ---------- */
  var mtext = document.querySelector('[data-words]');
  mtext.innerHTML = mtext.textContent.trim().split(/\s+/).map(function (w) {
    return '<span class="w">' + w + '</span>';
  }).join(' ');
  var words = [].slice.call(mtext.querySelectorAll('.w'));
  function updateWords() {
    var r = mtext.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
    var lit = Math.round(p * words.length);
    words.forEach(function (w, i) { w.style.opacity = i < lit ? 1 : ''; });
  }
  if (!reduceMotion) {
    window.addEventListener('scroll', updateWords, { passive: true });
    updateWords();
  } else {
    words.forEach(function (w) { w.style.opacity = 1; });
  }

  /* ---------- Split-flap board ---------- */
  var FLAP_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
  var cells = [].slice.call(document.querySelectorAll('[data-flap]'));
  cells.forEach(function (cell) {
    var text = cell.dataset.flap;
    cell.setAttribute('aria-label', text);
    cell.innerHTML = text.split('').map(function (c) {
      return '<span class="flap' + (c === ' ' ? ' sp' : '') + '" aria-hidden="true">' + (c === ' ' ? '' : c) + '</span>';
    }).join('');
  });

  function runBoard() {
    cells.forEach(function (cell, ci) {
      var flaps = [].slice.call(cell.querySelectorAll('.flap:not(.sp)'));
      var finals = cell.dataset.flap.replace(/ /g, '').split('');
      flaps.forEach(function (f, i) {
        var target = finals[i];
        var steps = 8 + Math.floor(Math.random() * 14) + ci;
        var n = 0;
        var iv = setInterval(function () {
          n++;
          if (n >= steps) { f.textContent = target; clearInterval(iv); return; }
          f.textContent = FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)];
        }, 45);
      });
    });
  }
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var boardIO = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { runBoard(); boardIO.disconnect(); }
    }, { threshold: 0.35 });
    boardIO.observe(document.querySelector('.board'));
  }

  /* ---------- Ticket tilt ---------- */
  var ticket = document.getElementById('ticket-card');
  if (!reduceMotion) {
    ticket.addEventListener('pointermove', function (e) {
      var r = ticket.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      ticket.style.setProperty('--ry', (x * 18) + 'deg');
      ticket.style.setProperty('--rx', (-y * 14) + 'deg');
    });
    ticket.addEventListener('pointerleave', function () {
      ticket.style.setProperty('--ry', '0deg');
      ticket.style.setProperty('--rx', '0deg');
    });
  }

  /* ---------- Footer HOWZAT reveal follows the pointer ---------- */
  var giant = document.querySelector('.foot-giant');
  giant.addEventListener('pointermove', function (e) {
    var r = giant.getBoundingClientRect();
    giant.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    giant.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });

  /* ---------- Reel: vertical scroll drives the strip sideways ---------- */
  var reel = document.getElementById('reel');
  var track = reel.querySelector('.reel-track');
  var reelBar = reel.querySelector('.reel-bar span');
  if (reduceMotion) {
    reel.classList.add('static');
  } else {
    var updateReel = function () {
      var r = reel.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      var p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      var travel = Math.max(0, track.scrollWidth - window.innerWidth);
      track.style.transform = 'translate3d(' + (-p * travel) + 'px,0,0)';
      reelBar.style.transform = 'scaleX(' + p + ')';
    };
    window.addEventListener('scroll', updateReel, { passive: true });
    window.addEventListener('resize', updateReel);
    window.addEventListener('load', updateReel);
    updateReel();
  }

  var video = reel.querySelector('video');
  var soundBtn = reel.querySelector('.sound');
  if (reduceMotion) {
    video.controls = true;
  } else if ('IntersectionObserver' in window) {
    // play only while the reel is on screen
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) video.play().catch(function () {});
      else video.pause();
    }, { threshold: 0.2 }).observe(video);
  }
  soundBtn.addEventListener('click', function () {
    video.muted = !video.muted;
    if (!video.muted) video.play().catch(function () {});
    soundBtn.setAttribute('aria-pressed', !video.muted);
    soundBtn.textContent = video.muted ? 'Sound off' : 'Sound on';
  });

  var wall = document.getElementById('wall');
  var wallMore = document.querySelector('.wall-more');
  wall.classList.add('collapsed');
  wallMore.addEventListener('click', function () {
    var open = wall.classList.toggle('collapsed') === false;
    wallMore.setAttribute('aria-expanded', open);
    wallMore.innerHTML = open ? 'Show fewer photos &uarr;' : 'Show all photos &darr;';
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  });

  var lightbox = document.getElementById('lightbox');
  if (lightbox.showModal) {
    var lbImg = lightbox.querySelector('img');
    [].forEach.call(document.querySelectorAll('a.frame, a.shot'), function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        lbImg.src = a.href;
        lbImg.alt = a.querySelector('img').alt;
        lightbox.showModal();
      });
    });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox || e.target.closest('.lb-close')) lightbox.close();
    });
  }

  /* ---------- GSAP reveals ---------- */
  if (hasGsap && !reduceMotion) {
    gsap.registerPlugin(ScrollTrigger);

    // v1 hero entrance: words rise out of their lines, then the rest fades up
    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from('.hero-word', { yPercent: 110, duration: 1.2, stagger: 0.12, delay: 0.15 })
      .from('.hero-anim', { y: 24, opacity: 0, duration: 0.9, stagger: 0.08 }, '-=0.8');

    var rv = '.sec-head, .board, .week-grid, .ticket-wrap, .gate, .drill-list li, .polaroid, .partner-row, .sheet, .contact-grid > *';
    document.querySelectorAll(rv).forEach(function (el) { el.classList.add('rv'); });
    ScrollTrigger.batch('.rv', {
      start: 'top 88%', once: true,
      onEnter: function (els) {
        gsap.to(els, { opacity: 1, y: 0, duration: 1, ease: 'expo.out', stagger: 0.08, overwrite: true });
      }
    });

    // ticket drops in with a spin
    gsap.from('.ticket', {
      rotate: -14, y: 120, scale: 0.85, ease: 'none',
      scrollTrigger: { trigger: '.ticket-sec', start: 'top 85%', end: 'center 60%', scrub: 1 }
    });

    // week slots stack in
    gsap.from('.slot', {
      scaleY: 0, transformOrigin: 'top', duration: 0.6, ease: 'back.out(2)', stagger: 0.05,
      scrollTrigger: { trigger: '.week-grid', start: 'top 75%' }
    });

    // giant footer word slides up
    gsap.from('.foot-giant', {
      yPercent: 40, ease: 'none',
      scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true }
    });
  }

  /* ---------- Registration (team sheet) ---------- */
  var form = document.getElementById('reg-form');
  var status = form.querySelector('.form-status');
  var submit = form.querySelector('button[type=submit]');

  function setStatus(msg, type) { status.textContent = msg; status.className = 'form-status' + (type ? ' ' + type : ''); }
  function mark(el, bad) { el.closest('.line').classList.toggle('invalid', bad); return !bad; }

  function validate() {
    var f = form.elements, ok = true;
    ok = mark(f.name, !f.name.value.trim()) && ok;
    ok = mark(f.age, !(+f.age.value >= 4 && +f.age.value <= 60)) && ok;
    ok = mark(f.phone, !/^[+\d][\d\s-]{9,18}$/.test(f.phone.value.trim())) && ok;
    ok = mark(f.email, !!f.email.value && !f.email.checkValidity()) && ok;
    ok = mark(form.querySelector('.chips input'), !form.querySelector('.chips input:checked')) && ok;
    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) { setStatus('Check the lines marked in red.', 'err'); return; }
    submit.disabled = true;
    setStatus('Sending…');
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (res.ok && res.data.ok) { form.reset(); setStatus(res.data.message, 'ok'); }
        else setStatus((res.data && res.data.message) || 'Something went wrong. Please call us.', 'err');
      })
      .catch(function () { setStatus('Could not send. Call +92 300 938 2539.', 'err'); })
      .then(function () { submit.disabled = false; });
  });
  if (/[?&]registered=1/.test(location.search)) setStatus('You are on the sheet. We will call you shortly.', 'ok');
})();
