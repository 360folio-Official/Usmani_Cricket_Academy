/* Usmani Cricket Academy: page interactions + GSAP animation */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof window.gsap !== 'undefined';

  // Without GSAP (CDN blocked) show everything immediately.
  if (!hasGsap) root.classList.remove('js');

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- Header state ---------- */
  var header = document.querySelector('.site-header');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile nav ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  toggle.addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });

  /* ---------- "Join this batch" pre-selects the batch ---------- */
  var batchSelect = document.getElementById('f-batch');
  document.querySelectorAll('[data-batch]').forEach(function (link) {
    link.addEventListener('click', function () { batchSelect.value = link.dataset.batch; });
  });

  /* ---------- GSAP ---------- */
  if (hasGsap && !reduceMotion) {
    gsap.registerPlugin(ScrollTrigger);

    // Hero intro
    gsap.timeline({ defaults: { ease: 'power4.out' } })
      .from('.hero-word', { yPercent: 110, duration: 1.2, stagger: 0.12, delay: 0.15 })
      .from('.hero-anim', { y: 24, opacity: 0, duration: 0.9, stagger: 0.08 }, '-=0.8');

    // Hero text drifts up and fades as you scroll away
    gsap.to('.hero-content', {
      yPercent: -18, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });

    // Section reveals
    ScrollTrigger.batch('.reveal', {
      start: 'top 88%',
      once: true,
      onEnter: function (els) {
        gsap.to(els, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.1, overwrite: true });
      }
    });

    // Marquee speeds up / reverses with scroll velocity
    var track = document.querySelector('.marquee-track');
    var marqueeTween = gsap.to(track, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
    var speedTl;
    track.style.animation = 'none';
    ScrollTrigger.create({
      onUpdate: function (self) {
        var boost = gsap.utils.clamp(1, 6, 1 + Math.abs(self.getVelocity()) / 400);
        if (speedTl) speedTl.kill();
        speedTl = gsap.timeline()
          .to(marqueeTween, { timeScale: self.direction * boost, duration: 0.25 })
          .to(marqueeTween, { timeScale: self.direction, duration: 1.2 }, '+=0.2');
      }
    });

    // Stat counters
    document.querySelectorAll('.stat-num[data-count]').forEach(function (el) {
      var obj = { n: 0 };
      gsap.to(obj, {
        n: +el.dataset.count, duration: 1.6, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate: function () { el.textContent = Math.round(obj.n); }
      });
    });

    // Fee card tilt-in
    gsap.from('.fee-card', {
      rotate: -6, scale: 0.92, ease: 'power3.out',
      scrollTrigger: { trigger: '.fees', start: 'top 75%', end: 'center center', scrub: 1 }
    });
  } else {
    document.querySelectorAll('.stat-num[data-count]').forEach(function (el) { el.textContent = el.dataset.count; });
  }

  /* ---------- Registration form ---------- */
  var form = document.getElementById('reg-form');
  var status = form.querySelector('.form-status');
  var submitBtn = form.querySelector('button[type="submit"]');

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = 'form-status' + (type ? ' ' + type : '');
  }

  function validate() {
    var ok = true;
    form.querySelectorAll('[required]').forEach(function (f) {
      var bad = !f.value.trim();
      if (f.name === 'phone') bad = !/^[+\d][\d\s-]{9,18}$/.test(f.value.trim());
      if (f.name === 'age') bad = !(+f.value >= 4 && +f.value <= 60);
      f.classList.toggle('invalid', bad);
      if (bad) ok = false;
    });
    var email = form.elements.email;
    if (email.value && !email.checkValidity()) { email.classList.add('invalid'); ok = false; }
    else email.classList.remove('invalid');
    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) {
      setStatus('Please check the highlighted fields.', 'err');
      var first = form.querySelector('.invalid');
      if (first) first.focus();
      return;
    }
    submitBtn.disabled = true;
    setStatus('Sending…');

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json' }
    })
      .then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
      .then(function (res) {
        if (res.ok && res.data.ok) {
          form.reset();
          setStatus(res.data.message || 'Thank you! We will call you shortly to confirm your batch.', 'ok');
        } else {
          setStatus((res.data && res.data.message) || 'Something went wrong. Please call us instead.', 'err');
        }
      })
      .catch(function () {
        setStatus('Could not send right now. Please call +92 300 938 2539.', 'err');
      })
      .then(function () { submitBtn.disabled = false; });
  });

  // Non-JS fallback lands back here with ?registered=1
  if (/[?&]registered=1/.test(location.search)) {
    setStatus('Thank you! We will call you shortly to confirm your batch.', 'ok');
  }

  // ---------- Gallery: training video + photo lightbox ----------
  var video = document.querySelector('.g-video video');
  var soundBtn = document.querySelector('.g-sound');
  if (video) {
    // play only while on screen; with reduced motion the visitor starts it
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.controls = true;
    } else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) video.play().catch(function () {});
        else video.pause();
      }, { threshold: 0.25 }).observe(video);
    }
    soundBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      if (!video.muted) video.play().catch(function () {});
      soundBtn.setAttribute('aria-pressed', !video.muted);
      soundBtn.textContent = video.muted ? 'Sound off' : 'Sound on';
    });
  }

  var masonry = document.getElementById('masonry');
  var moreBtn = document.querySelector('.more-btn');
  if (masonry && moreBtn) {
    masonry.classList.add('collapsed');
    moreBtn.addEventListener('click', function () {
      var open = masonry.classList.toggle('collapsed') === false;
      moreBtn.setAttribute('aria-expanded', open);
      moreBtn.textContent = open ? 'Show fewer photos' : 'Show all photos';
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
  }

  var lightbox = document.getElementById('lightbox');
  if (lightbox && lightbox.showModal) {
    var lbImg = lightbox.querySelector('img');
    document.querySelectorAll('a.g-item, a.m-item').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var img = a.querySelector('img');
        lbImg.src = a.href;
        lbImg.alt = img.alt;
        lightbox.showModal();
      });
    });
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox || e.target.closest('.lightbox-close')) lightbox.close();
    });
  }
})();
