// Safety net FIRST: if any CDN script fails to load or errors below,
// this still fires and unblocks the visitor — the loader can never hang forever.
setTimeout(() => {
  const l = document.getElementById('loader');
  if (l && l.style.display !== 'none') {
    l.style.transition = 'opacity .4s ease';
    l.style.opacity = '0';
    setTimeout(() => { l.style.display = 'none'; }, 420);
  }
}, 6000);

gsap.registerPlugin(ScrollTrigger);

const isCoarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


/* ---------------- Lenis smooth scroll, wired to ScrollTrigger ---------------- */
const lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 3) });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

/* ---------------- Loader sequence ---------------- */
const loader = document.getElementById('loader');
const loaderLine = document.getElementById('loaderLine');
const loaderPct = document.getElementById('loaderPct');
const skipBtn = document.getElementById('skipIntro');

let loaded = false;
function finishLoader(){
  if (loaded) return;
  loaded = true;
  gsap.to(loader, {
    yPercent: -100, duration: 1.1, ease: 'expo.inOut',
    onComplete: () => { loader.style.display = 'none'; playHeroIntro(); }
  });
}

// simulated progress (swap for real asset-load progress if desired)
const progressState = { v: 0 };
gsap.to(progressState, {
  v: 100, duration: 2.4, ease: 'power2.out',
  onUpdate: () => {
    const p = Math.round(progressState.v);
    loaderLine.style.width = p + '%';
    loaderPct.textContent = String(p).padStart(2, '0');
  },
  onComplete: finishLoader
});
gsap.to(skipBtn, { opacity: 1, duration: .6, delay: .8 });
skipBtn.addEventListener('click', finishLoader);

/* ---------------- Hero text setup (SplitType) ---------------- */
const titleSplit = new SplitType('#heroTitle', { types: 'words,chars' });
gsap.set(titleSplit.chars, { yPercent: 120 });

const subLines = document.querySelectorAll('#heroSub .line span');

function playHeroIntro(){
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.to('.hero-eyebrow', { opacity: 1, duration: .8 })
    .to(titleSplit.chars, { yPercent: 0, duration: 1.1, stagger: .018 }, '-=.4')
    .to(subLines, { y: '0%', duration: .9, stagger: .12 }, '-=.6')
    .to('.hero-cta', { opacity: 1, y: 0, duration: .8 }, '-=.5')
    .to('.scroll-indicator', { opacity: 1, duration: .6 }, '-=.4');
}

/* ---------------- Nav shrink on scroll ---------------- */
const nav = document.getElementById('siteNav');
ScrollTrigger.create({
  start: 60, end: 99999,
  onUpdate: (self) => nav.classList.toggle('shrink', self.scroll() > 60)
});

/* ---------------- Hero cinematic frame-sequence engine ---------------- */
/*
  Frames were extracted from the source hero video (assets/hero-frames/frame_0001.jpg … 0180.jpg)
  at ~3.6fps across the clip's 50s runtime — enough samples for a fluid scroll reveal without
  shipping 1,500 raw video frames. Playback position is driven entirely by scroll progress:
  no autoplay, no <video> element, just a canvas repainted from an image cache.
*/
(function heroFrameSequence(){
  const canvas = document.getElementById('heroCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const loader = document.getElementById('heroFrameLoader');
  const loaderFill = document.getElementById('heroFrameLoaderFill');

  const FRAME_COUNT = 180;
  const FRAME_PATH = (i) => `assets/hero-frames/frame_${String(i).padStart(4, '0')}.jpg`;

  const frames = new Array(FRAME_COUNT);
  let loadedCount = 0;
  let firstFrameReady = false;
  let currentFrame = 0;   // the frame actually painted
  let targetFrame = 0;    // the frame scroll position wants
  let rafId = null;

  function drawFrame(index){
    const img = frames[index];
    if (!img || !img.complete || !img.naturalWidth) return;

    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (cw - dw) / 2, dy = (ch - dh) / 2;

    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    drawFrame(currentFrame);
  }

  // Load frame 1 first (paints instantly), then stream the rest in the background.
  function loadFrame(i){
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { loadedCount++; resolve(); };
      img.onerror = () => { loadedCount++; resolve(); };
      img.src = FRAME_PATH(i + 1);
      frames[i] = img;
    });
  }

  async function preloadAll(){
    await loadFrame(0);
    firstFrameReady = true;
    canvas.classList.add('is-ready');
    resizeCanvas();
    drawFrame(0);

    // Stream the remaining frames in small concurrent batches so the main
    // thread stays responsive and early scroll frames are ready fast.
    const BATCH = 6;
    const remaining = Array.from({ length: FRAME_COUNT - 1 }, (_, k) => k + 1);

    for (let i = 0; i < remaining.length; i += BATCH) {
      const batch = remaining.slice(i, i + BATCH).map(loadFrame);
      await Promise.all(batch);
      const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
      if (loaderFill) loaderFill.style.width = pct + '%';
      if (pct >= 100 && loader) {
        loader.classList.add('is-done');
        ScrollTrigger.refresh(); // layout is now final for this section — re-measure everything below it
      }
    }
  }

  // Smoothly interpolate toward the scroll-driven target frame every animation
  // frame, so fast flicks/trackpad scrolls still read as continuous motion
  // rather than skipping between frames.
  function tick(){
    if (firstFrameReady) {
      const diff = targetFrame - currentFrame;
      if (Math.abs(diff) > 0.02) {
        currentFrame += diff * 0.22;
        drawFrame(Math.round(currentFrame));
      } else if (currentFrame !== targetFrame) {
        currentFrame = targetFrame;
        drawFrame(Math.round(currentFrame));
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  ScrollTrigger.create({
    trigger: '#hero',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      targetFrame = Math.min(FRAME_COUNT - 1, Math.max(0, self.progress * (FRAME_COUNT - 1)));
    }
  });

  // content pin-fade as the sequence finishes, hands off to next section
  gsap.to('.hero-content, .scroll-indicator', {
    opacity: 0, y: -40,
    scrollTrigger: { trigger: '#hero', start: '70% top', end: 'bottom top', scrub: true }
  });
  // slow camera-like push-in over the whole sequence
  gsap.to('.hero-canvas', {
    scale: 1.14,
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom bottom', scrub: true }
  });
  gsap.to('.hero-overlay', {
    backgroundColor: 'rgba(11,11,10,.62)',
    scrollTrigger: { trigger: '#hero', start: '60% top', end: 'bottom bottom', scrub: true }
  });
  // gold light sheen sweeps across the frame once, early in the scroll — a signature reveal beat.
  // Single timeline (not two separate scrubbed tweens) so opacity is never fought over by two
  // competing ScrollTriggers — see the note above sectionStage() for why that matters.
  const sheenTl = gsap.timeline({
    scrollTrigger: { trigger: '#hero', start: 'top top', end: '45% top', scrub: 0.8 }
  });
  sheenTl
    .to('.hero-gold-sheen', { opacity: 1, x: '130%', ease: 'power2.inOut', duration: 1 })
    .to('.hero-gold-sheen', { opacity: 0, duration: 1 });

  window.addEventListener('resize', resizeCanvas);
  preloadAll();
  tick();
})();

/* ---------------- Scroll-line fill inside hero ---------------- */
gsap.to('.scroll-line-fill', {
  width: '100%',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: '40% top', scrub: true }
});

/* ---------------- Fullscreen Menu ---------------- */
const menu = document.getElementById('siteMenu');
const menuBg = document.getElementById('menuBg');
const navToggle = document.getElementById('navToggle');
const menuClose = document.getElementById('menuClose');
const menuLinks = document.querySelectorAll('.menu-link');

// Swap these for real photography per section once assets exist.
const menuBgMap = {
  hero: 'linear-gradient(160deg,#1c1a17,#0b0b0a)',
  properties: 'linear-gradient(160deg,#20180f,#0b0b0a)',
  projects: 'linear-gradient(160deg,#171a17,#0b0b0a)',
  about: 'linear-gradient(160deg,#1a1712,#0b0b0a)',
  gallery: 'linear-gradient(160deg,#191614,#0b0b0a)',
  customize: 'linear-gradient(160deg,#171512,#0b0b0a)',
  testimonials: 'linear-gradient(160deg,#151513,#0b0b0a)',
  contact: 'linear-gradient(160deg,#141414,#0b0b0a)'
};

let menuOpen = false;
let menuTl = null;
function openMenu(){
  menuOpen = true;
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  navToggle.setAttribute('aria-expanded', 'true');
  lenis.stop();

  if (menuTl) menuTl.kill();
  gsap.set(menu.querySelectorAll('.menu-link-text'), { yPercent: 100 });
  gsap.set('.menu-top, .menu-footer', { opacity: 0, y: -8 });
  gsap.set('.menu-footer', { y: 8 });

  menuTl = gsap.timeline();
  menuTl
    .fromTo('.menu-bg', { opacity: 0 }, { opacity: 1, duration: .7, ease: 'sine.out' }, 0)
    .to('.menu-top', { opacity: 1, y: 0, duration: .5, ease: 'expo.out' }, .08)
    .to(menu.querySelectorAll('.menu-link-text'), {
      yPercent: 0, duration: .85, ease: 'expo.out', stagger: .045
    }, .12)
    .to('.menu-footer', { opacity: 1, y: 0, duration: .5, ease: 'expo.out' }, .4);
}
function closeMenu(){
  menuOpen = false;
  navToggle.setAttribute('aria-expanded', 'false');

  if (menuTl) menuTl.kill();
  menuTl = gsap.timeline({
    onComplete: () => {
      menu.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
    }
  });
  menuTl
    .to(menu.querySelectorAll('.menu-link-text'), {
      yPercent: -100, duration: .5, ease: 'expo.in', stagger: .025
    }, 0)
    .to('.menu-top, .menu-footer', { opacity: 0, duration: .3, ease: 'sine.in' }, 0)
    .to('.menu-bg', { opacity: 0, duration: .4, ease: 'sine.in' }, .05);

  lenis.start();
}
navToggle.addEventListener('click', () => menuOpen ? closeMenu() : openMenu());
menuClose.addEventListener('click', closeMenu);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });

menuLinks.forEach((link) => {
  link.addEventListener('mouseenter', () => {
    menuBg.style.backgroundImage = menuBgMap[link.dataset.bg] || '';
    menuBg.style.opacity = 1;
  });
});

/* ---------------- Cinematic in-page navigation ----------------
   Every internal "#section" link (main nav toggle isn't one, but the fullscreen
   menu, footer nav, and any hero/property CTA anchors are) now eases to its
   target via Lenis instead of the browser's instant/jump-cut anchor scroll —
   this is the "smoothly animate to the target section" requirement. */
const NAV_OFFSET = -84; // roughly matches the fixed nav bar height
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  const href = link.getAttribute('href');
  if (!href || href === '#') return;
  const target = document.querySelector(href);
  if (!target) return;

  link.addEventListener('click', (e) => {
    e.preventDefault();
    const isMenuLink = link.classList.contains('menu-link');

    const goTo = () => {
      lenis.scrollTo(target, {
        offset: NAV_OFFSET,
        duration: prefersReducedMotion ? 0.3 : 1.7,
        easing: (t) => 1 - Math.pow(1 - t, 4)
      });
    };

    if (isMenuLink && menuOpen){
      closeMenu();
      setTimeout(goTo, prefersReducedMotion ? 0 : 350); // let the menu close before the cinematic scroll starts
    } else {
      goTo();
    }
  });
});

/* ---------------- Trust stat counters ---------------- */
document.querySelectorAll('.stat-num').forEach((el) => {
  const target = parseFloat(el.dataset.target);
  const decimals = parseInt(el.dataset.decimal || '0', 10);
  const suffix = el.dataset.suffix || '';
  const prefix = el.dataset.prefix || '';
  const counter = { v: 0 };
  ScrollTrigger.create({
    trigger: el, start: 'top 85%', once: true,
    onEnter: () => gsap.to(counter, {
      v: target, duration: 1.8, ease: 'power2.out',
      onUpdate: () => { el.textContent = prefix + counter.v.toFixed(decimals) + suffix; }
    })
  });
});

gsap.utils.toArray('.stat').forEach((stat, i) => {
  gsap.from(stat, {
    y: 40, opacity: 0, duration: .9, ease: 'expo.out',
    scrollTrigger: { trigger: '.trust', start: 'top 75%' },
    delay: i * .08
  });
});

/* ---------------- Testimonials: moving vertical walls ---------------- */
document.querySelectorAll('.wall-col').forEach((col, i) => {
  const tracks = col.querySelectorAll('.wall-track');
  const distance = tracks[0].scrollHeight; // includes trailing padding, so track+duplicate tile seamlessly
  const direction = col.classList.contains('wall-up') ? -1 : 1;
  const duration = 22 + i * 6; // each column a different speed

  const tween = gsap.to(tracks, {
    y: direction * distance, duration, ease: 'none', repeat: -1,
    modifiers: { y: gsap.utils.unitize((y) => parseFloat(y) % distance) }
  });

  col.addEventListener('mouseenter', () => gsap.to(tween, { timeScale: 0, duration: .4 }));
  col.addEventListener('mouseleave', () => gsap.to(tween, { timeScale: 1, duration: .4 }));
});

/* ---------------- Contact: form + magnetic submit ---------------- */
const contactForm = document.getElementById('contactForm');
const formNote = document.getElementById('formNote');
if (contactForm){
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('.magnetic-submit');
    const label = btn?.querySelector('span');
    if (btn?.classList.contains('is-sending')) return;

    btn?.classList.add('is-sending');
    if (label) label.textContent = 'Sending…';

    // Brief, deliberate pause reads as "your inquiry is being handled personally" rather than an instant form-reset.
    setTimeout(() => {
      if (label) label.textContent = 'Request Received';
      gsap.fromTo(formNote, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: .6, ease: 'expo.out' });
      formNote.textContent = 'Thank you — a member of our team will be in touch shortly.';
      contactForm.reset();
      document.querySelectorAll('.field-fill').forEach((f) => gsap.set(f, { scaleX: 0 }));
      setTimeout(() => {
        btn?.classList.remove('is-sending');
        if (label) label.textContent = 'Book a Visit';
      }, 2200);
    }, 900);
  });
}

if (!isCoarsePointer){
  const submitBtn = document.querySelector('.magnetic-submit');
  if (submitBtn){
    submitBtn.addEventListener('mousemove', (e) => {
      const r = submitBtn.getBoundingClientRect();
      gsap.to(submitBtn, {
        x: (e.clientX - r.left - r.width / 2) * 0.3,
        y: (e.clientY - r.top - r.height / 2) * 0.4,
        duration: .4, ease: 'power2.out'
      });
    });
    submitBtn.addEventListener('mouseleave', () => gsap.to(submitBtn, { x: 0, y: 0, duration: .5, ease: 'elastic.out(1,.5)' }));
  }

  // Magnetic effect for the hero + property CTAs too, for consistency
  document.querySelectorAll('.hero-cta, .prop-cta').forEach((el) => {
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.15, y: (e.clientY - r.top - r.height / 2) * 0.25, duration: .4, ease: 'power2.out' });
    });
    el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: .5, ease: 'elastic.out(1,.5)' }));
  });
}

/* ---------------- Customize Your Property: procedural 3D villa ---------------- */
(function initVillaConfigurator(){
  const canvas = document.getElementById('villaCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const wrap = canvas.parentElement;
  const loadingEl = document.getElementById('custLoading');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, wrap.clientWidth / wrap.clientHeight, 0.1, 100);
  camera.position.set(6, 4.2, 7);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.6, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  const sun = new THREE.DirectionalLight(0xffe9c4, 1.6);
  sun.position.set(6, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const fillLight = new THREE.DirectionalLight(0xbcd7ff, 0.35);
  fillLight.position.set(-6, 4, -5);
  scene.add(fillLight);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.physicallyCorrectLights = true;

  // Ground / landscape
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x5c6b4a, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Real villa model (replaces the previous procedural box geometry) ----
  const villaGroup = new THREE.Group(); // wrapper we can scale/fade for the entrance animation
  scene.add(villaGroup);

  const facadeMeshes = [];
  const roofMeshes = [];
  let modelLoaded = false;

  const gltfLoader = new THREE.GLTFLoader();
  gltfLoader.load(
    'assets/models/villa1.glb',
    (gltf) => {
      const model = gltf.scene;

      // Auto-center + auto-scale so any villa export sits correctly, regardless of its native size
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const targetSpan = 4.6; // roughly matches the previous procedural villa's footprint
      const largestAxis = Math.max(size.x, size.y, size.z) || 1;
      const scale = targetSpan / largestAxis;
      model.scale.setScalar(scale);

      // Re-measure after scaling, then sit the model on the ground plane (y = 0) and center on X/Z
      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);
      model.position.x -= scaledCenter.x;
      model.position.z -= scaledCenter.z;
      model.position.y -= scaledBox.min.y;

      model.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        if (node.material) node.material = node.material.clone(); // avoid shared-material swatch bleed
        const n = (node.name || '').toLowerCase();
        if (n.includes('roof')) roofMeshes.push(node);
        else if (!n.includes('glass') && !n.includes('window') && !n.includes('pool') && !n.includes('water')) facadeMeshes.push(node);
      });

      villaGroup.add(model);

      // Frame the camera around the model's real bounding sphere so scale differences never break the view
      const sphere = new THREE.Sphere();
      scaledBox.getBoundingSphere(sphere);
      const dist = sphere.radius * 2.35;
      const targetPos = { x: dist * 0.68, y: sphere.radius * 0.72, z: dist * 0.78 };
      controls.target.set(scaledCenter.x - scaledCenter.x, sphere.radius * 0.35, 0);

      // Cinematic entrance: fade + scale up, plus a soft camera settle
      villaGroup.scale.setScalar(0.001);
      model.traverse((node) => { if (node.isMesh && node.material) { node.material.transparent = true; node.material.opacity = 0; } });
      gsap.to(villaGroup.scale, { x: 1, y: 1, z: 1, duration: 1.6, ease: 'power3.out' });
      model.traverse((node) => {
        if (node.isMesh && node.material) {
          gsap.to(node.material, { opacity: 1, duration: 1.3, delay: .15, ease: 'sine.out', onComplete: () => { node.material.transparent = false; } });
        }
      });
      gsap.fromTo(camera.position,
        { x: targetPos.x * 1.6, y: targetPos.y * 1.6, z: targetPos.z * 1.6 },
        { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1.8, ease: 'power2.out' }
      );

      modelLoaded = true;
      if (loadingEl) { loadingEl.style.opacity = '0'; setTimeout(() => loadingEl && (loadingEl.style.display = 'none'), 500); }
      ScrollTrigger.refresh(); // the model load doesn't change section height here, but this is cheap insurance
    },
    undefined,
    (err) => {
      console.error('Villa model failed to load:', err);
      if (loadingEl) loadingEl.textContent = 'Unable to load 3D model';
    }
  );

  // Subtle floating/parallax on the loaded villa for a premium showcase feel
  gsap.to(villaGroup.position, {
    y: '+=0.06', duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1
  });

  // Pool
  const poolMat = new THREE.MeshStandardMaterial({ color: 0x2e7c8c, roughness: 0.15, metalness: 0.2 });
  const pool = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 1.8), poolMat);
  pool.position.set(2.2, 0.05, 2.6);
  scene.add(pool);
  const poolDeck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 2.2), new THREE.MeshStandardMaterial({ color: 0xc9bfa0, roughness: 0.9 }));
  poolDeck.position.set(2.2, 0.02, 2.6);
  scene.add(poolDeck);

  // A few simple trees (cones) for the landscape group to visually respond to
  const treeGroup = new THREE.Group();
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3f5a34, roughness: 1 });
  [[-4, -3], [-4.5, 1.5], [3.8, -3.5]].forEach(([x, z]) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
    trunk.position.set(x, 0.3, z);
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 10), foliageMat);
    foliage.position.set(x, 1.05, z);
    treeGroup.add(trunk, foliage);
  });
  scene.add(treeGroup);

  function resize(){
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }
  window.addEventListener('resize', resize);

  let frameActive = true;
  function animate(){
    if (!frameActive) return;
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  // Pause auto-rotate while the user is actively dragging
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // Rotate arrows — nudge the camera around the target
  const step = Math.PI / 8;
  function rotateCamera(dir){
    const angle = Math.atan2(camera.position.z, camera.position.x) + dir * step;
    const radius = Math.hypot(camera.position.x, camera.position.z);
    gsap.to(camera.position, {
      x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
      duration: .7, ease: 'power2.inOut'
    });
  }
  document.getElementById('rotLeft')?.addEventListener('click', () => rotateCamera(1));
  document.getElementById('rotRight')?.addEventListener('click', () => rotateCamera(-1));

  // Material swatches — facade/roof now recolor the real villa's meshes (grouped by name during load),
  // pool/landscape/lighting keep recoloring the same primitives/light as before.
  function tintColorTargets(targets, value){
    const r = ((value >> 16) & 255) / 255, g = ((value >> 8) & 255) / 255, b = (value & 255) / 255;
    targets.forEach((t) => { if (t && t.color) gsap.to(t.color, { r, g, b, duration: .6 }); });
  }
  const singleTargetMap = { pool: poolMat, landscape: groundMat, lighting: sun };
  document.querySelectorAll('.cust-group').forEach((group) => {
    const key = group.dataset.group;
    group.querySelectorAll('.swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.swatch').forEach((s) => s.classList.remove('active'));
        btn.classList.add('active');
        const value = parseInt(btn.dataset.value, 16);
        if (key === 'facade') tintColorTargets(facadeMeshes, value);
        else if (key === 'roof') tintColorTargets(roofMeshes.length ? roofMeshes : facadeMeshes, value);
        else if (singleTargetMap[key]) tintColorTargets([singleTargetMap[key]], value);
      });
    });
  });

  // Stop rendering when scrolled far away — saves battery/GPU on long pages
  ScrollTrigger.create({
    trigger: '.customize', start: 'top bottom', end: 'bottom top',
    onEnter: () => frameActive = true,
    onLeave: () => frameActive = false,
    onEnterBack: () => { if (!frameActive) { frameActive = true; animate(); } },
    onLeaveBack: () => frameActive = false
  });
})();

/* ---------------- Gallery: 3D tilt + entrance reveal ---------------- */
gsap.from('.mason-item', {
  y: 50, opacity: 0, duration: .9, ease: 'expo.out', stagger: .08,
  scrollTrigger: { trigger: '.masonry', start: 'top 85%' }
});

if (!isCoarsePointer){
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    const strength = 10;
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(card, {
        rotateY: px * strength, rotateX: -py * strength,
        duration: .5, ease: 'power2.out'
      });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { rotateY: 0, rotateX: 0, duration: .6, ease: 'power3.out' });
    });
  });
}

/* ---------------- About: timeline fill + reveals ---------------- */
gsap.to('.timeline-fill', {
  height: '100%', ease: 'none',
  scrollTrigger: { trigger: '.timeline', start: 'top 60%', end: 'bottom 80%', scrub: true }
});
gsap.utils.toArray('.tl-item').forEach((item) => {
  gsap.from(item, {
    x: -24, opacity: 0, duration: .8, ease: 'expo.out',
    scrollTrigger: { trigger: item, start: 'top 82%' }
  });
});
gsap.from('.about-gallery img', {
  y: 40, opacity: 0, duration: .9, ease: 'expo.out', stagger: .12,
  scrollTrigger: { trigger: '.about-gallery', start: 'top 85%' }
});

/* ---------------- Projects: pinned chapter storytelling ---------------- */
const projSlides = gsap.utils.toArray('.proj-slide');
if (!isCoarsePointer && projSlides.length){
  projSlides.forEach((slide, i) => {
    if (i < projSlides.length - 1){
      gsap.to(slide.querySelector('img'), {
        scale: 1.15, ease: 'none',
        scrollTrigger: { trigger: slide, start: 'top top', end: 'bottom top', scrub: true }
      });
      gsap.to(slide, {
        opacity: 0, ease: 'none',
        scrollTrigger: { trigger: slide, start: 'bottom 60%', end: 'bottom top', scrub: true }
      });
    }
    gsap.from(slide.querySelectorAll('.proj-chapter, h3, p'), {
      y: 30, opacity: 0, duration: .9, ease: 'expo.out', stagger: .1,
      scrollTrigger: { trigger: slide, start: 'top 70%' }
    });
  });
} else {
  // Touch devices: simple fade-in per chapter, no pinned scrub (lighter + avoids sticky/scrub jank on mobile browsers)
  projSlides.forEach((slide) => {
    gsap.from(slide.querySelectorAll('.proj-chapter, h3, p'), {
      y: 24, opacity: 0, duration: .8, ease: 'power2.out', stagger: .08,
      scrollTrigger: { trigger: slide, start: 'top 80%' }
    });
  });
}

/* ---------------- Featured Properties: stacking reveal ---------------- */

gsap.utils.toArray('.prop-card').forEach((card, i) => {
  const media = card.querySelector('.prop-media img');
  const info = card.querySelector('.prop-info');

  // Each card scales down slightly as the next one covers it — the "stack".
  if (i < document.querySelectorAll('.prop-card').length - 1){
    gsap.to(card, {
      scale: 0.94, opacity: 0.5, ease: 'none',
      scrollTrigger: {
        trigger: card, start: 'top top',
        endTrigger: card.nextElementSibling, end: 'top top',
        scrub: true
      }
    });
  }

  gsap.fromTo(media, { scale: isCoarsePointer ? 1 : 1.25 }, {
    scale: 1, ease: 'none',
    scrollTrigger: { trigger: card, start: 'top bottom', end: 'top top', scrub: true }
  });

  gsap.from(info.children, {
    y: 36, opacity: 0, duration: .9, ease: 'expo.out', stagger: .08,
    scrollTrigger: { trigger: card, start: 'top 60%' }
  });
});

/* ---------------- Signature rail progress ---------------- */
gsap.to('.rail-fill', {
  height: '100%', ease: 'none',
  scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true }
});

/* ---------------- Site-wide section-header reveals ----------------
   Every section-eyebrow / section-title pair (Properties, Projects, About,
   Gallery, Customize, Testimonials, Contact) previously appeared with no
   scroll animation at all — this brings every section header in line with
   the same restrained fade+rise language used in the hero. */
document.querySelectorAll('.section-eyebrow').forEach((eyebrow) => {
  const title = eyebrow.nextElementSibling;
  const extras = [eyebrow, title].filter(Boolean);
  gsap.set(extras, { opacity: 0, y: 28 });
  gsap.to(extras, {
    opacity: 1, y: 0, duration: .9, ease: 'expo.out', stagger: .12,
    scrollTrigger: { trigger: eyebrow, start: 'top 85%' }
  });
});
gsap.utils.toArray('.trust-eyebrow, .cust-sub, .about-lead').forEach((el) => {
  gsap.from(el, {
    opacity: 0, y: 22, duration: .9, ease: 'expo.out',
    scrollTrigger: { trigger: el, start: 'top 88%' }
  });
});

/* ---------------- Elegant hover micro-interactions: nav-adjacent links ---------------- */
if (!isCoarsePointer){
  document.querySelectorAll('.footer-nav a, .footer-social a').forEach((link) => {
    link.style.position = 'relative';
    const underline = document.createElement('span');
    underline.style.cssText = 'position:absolute;left:0;right:100%;bottom:-2px;height:1px;background:var(--gold-soft);transition:right .4s cubic-bezier(.16,.8,.24,1);';
    link.appendChild(underline);
    link.addEventListener('mouseenter', () => { underline.style.right = '0'; });
    link.addEventListener('mouseleave', () => { underline.style.right = '100%'; });
  });
}

/* ---------------- Contact: refined reveal choreography ---------------- */
(function initContactReveal(){
  const section = document.querySelector('.contact');
  if (!section) return;

  gsap.from('.office-list .office', {
    y: 22, opacity: 0, duration: .8, ease: 'expo.out', stagger: .1,
    scrollTrigger: { trigger: '.office-list', start: 'top 88%' }
  });

  gsap.fromTo('.map-embed',
    { opacity: 0, scale: 0.97 },
    { opacity: 1, scale: 1, duration: 1, ease: 'expo.out',
      scrollTrigger: { trigger: '.map-embed', start: 'top 90%' } }
  );

  gsap.from('.contact-form .field, .contact-form .magnetic-submit', {
    y: 24, opacity: 0, duration: .8, ease: 'expo.out', stagger: .08,
    scrollTrigger: { trigger: '.contact-form', start: 'top 85%' }
  });
})();

/* ---------------- Contact: input underline fill + submit micro-interaction ---------------- */
document.querySelectorAll('.field input, .field textarea').forEach((el) => {
  const wrap = el.parentElement;
  wrap.style.position = 'relative';
  const fill = document.createElement('span');
  fill.className = 'field-fill';
  wrap.appendChild(fill);
  el.addEventListener('focus', () => gsap.to(fill, { scaleX: 1, duration: .5, ease: 'expo.out' }));
  el.addEventListener('blur', () => { if (!el.value) gsap.to(fill, { scaleX: 0, duration: .35, ease: 'power2.in' }); });
});

/* ===================================================================
   CINEMATIC SECTION TRANSITIONS
   Each major section gets a depth-based enter/exit treatment — it rises
   and sharpens into place as it takes over the viewport, and recedes
   (slightly smaller, slightly dimmer) as the next section arrives, so
   scrolling reads as a sequence of stage changes rather than a single
   flat scroll. Kept subtle on purpose: this rides underneath each
   section's own existing reveals (cards, masonry, etc.), it doesn't
   replace them.
   Skipped entirely for prefers-reduced-motion, and simplified (opacity
   only, no scale/parallax) on coarse-pointer/mobile to protect frame rate.
=================================================================== */
if (!prefersReducedMotion){

  // ROOT-CAUSE FIX: each section now gets exactly ONE ScrollTrigger and ONE timeline driving
  // opacity/scale/y. Previously enter and exit were two *separate* scrubbed tweens on the same
  // element/properties, each with its own ScrollTrigger. GSAP tweens that share a target+property
  // fight for control of it — when scrolling fast, especially upward, the two scrub tweens would
  // desync and could leave a section's opacity stuck near 0. Since the page background is solid
  // black, a stuck-transparent section reads as a full black screen. A single timeline per section
  // removes the conflict entirely: only one tween ever owns that property at a time, so it can
  // never be double-driven or left in a stale state regardless of scroll speed or direction.
  function sectionStage(selector, { enterFrom = {}, exitTo = null, parallaxEl = null, parallaxAmount = 40 } = {}){
    gsap.utils.toArray(selector).forEach((sec) => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: sec, start: 'top 92%', end: 'bottom 0%', scrub: true, invalidateOnRefresh: true }
      });

      // Arrival — settles to fully visible/true scale as the section reaches the upper viewport
      tl.fromTo(sec,
        { opacity: enterFrom.opacity ?? 1, scale: enterFrom.scale ?? 1, y: enterFrom.y ?? 0 },
        { opacity: 1, scale: 1, y: 0, ease: 'none', duration: 1 }
      );

      // Hold — stays fully settled through the middle of the section's scroll range
      tl.to({}, { duration: 6 });

      // Departure — recedes slightly as the next section takes over, only if requested
      if (exitTo){
        tl.to(sec, { opacity: exitTo.opacity ?? 1, scale: exitTo.scale ?? 1, ease: 'none', duration: 1 });
      }

      // Optional inner-layer parallax — a different element/property, independent of the timeline above
      if (parallaxEl && !isCoarsePointer){
        const layer = sec.querySelector(parallaxEl);
        if (layer){
          gsap.fromTo(layer, { y: -parallaxAmount }, {
            y: parallaxAmount, ease: 'none',
            scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true }
          });
        }
      }
    });
  }

  const mobile = isCoarsePointer; // simplified variant: opacity-only, no scale/parallax cost on touch

  // Trust: grows into place — a quiet confidence beat right after the hero
  sectionStage('.trust', {
    enterFrom: mobile ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 30 },
    exitTo: { opacity: .55 }
  });

  // Properties: opacity-only on the section frame — kept transform-free here since the
  // stacking property cards inside already run their own continuous scroll-scrub, and
  // adding scale/y to their ancestor risks feedback jitter in that measurement.
  sectionStage('.properties', {
    enterFrom: { opacity: 0 },
    exitTo: { opacity: .6 }
  });

  // Projects: opacity-only entrance for the same reason as Properties above — the pinned
  // chapter slides inside run their own continuous scroll-scrub keyed to viewport position.
  sectionStage('.projects', {
    enterFrom: { opacity: 0 },
    exitTo: { opacity: .6 }
  });

  // About: opacity-only — the timeline-fill bar inside runs its own continuous scroll-scrub.
  sectionStage('.about', {
    enterFrom: { opacity: 0 },
    exitTo: { opacity: .7 }
  });

  // Gallery: the whole masonry grid arrives with a touch more scale-punch, since it's a visual showcase
  sectionStage('.gallery', {
    enterFrom: mobile ? { opacity: 0 } : { opacity: 0, scale: 0.94 },
    exitTo: { opacity: .6, scale: mobile ? 1 : 0.98 }
  });

  // Customize: floats up rather than scaling, so it doesn't fight the 3D villa's own entrance animation
  sectionStage('.customize', {
    enterFrom: mobile ? { opacity: 0 } : { opacity: 0, y: 60 },
    exitTo: { opacity: .65 }
  });

  // Testimonials: pure cross-fade — keeps the marquee legible with no competing transforms
  sectionStage('.testimonials', {
    enterFrom: { opacity: 0 },
    exitTo: { opacity: .7 }
  });

  // Contact: settles in last, slightly slower — the "arrival" beat of the whole page
  // (no exitTo — nothing follows it but the footer)
  sectionStage('.contact', {
    enterFrom: mobile ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.985 }
  });

  // Footer: simple rise, no recession (nothing follows it) — single tween, no conflict risk
  gsap.utils.toArray('.site-footer').forEach((sec) => {
    gsap.fromTo(sec, { opacity: 0, y: 30 }, {
      opacity: 1, y: 0, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top 95%', end: 'top 60%', scrub: true, invalidateOnRefresh: true }
    });
  });
}

/* ---------------- Final safety net: re-measure every ScrollTrigger once the page has
   fully settled (fonts swapped in, images decoded, layout stable). Cheap, and prevents any
   stale start/end positions that could otherwise cause a section to appear stuck mid-fade. ---------------- */
window.addEventListener('load', () => ScrollTrigger.refresh());
