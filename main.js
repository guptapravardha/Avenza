gsap.registerPlugin(ScrollTrigger);

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

/* ---------------- Hero video scroll-scrub ---------------- */
const heroVideo = document.getElementById('heroVideo');

function initScrub(){
  ScrollTrigger.create({
    trigger: '#hero',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.6,
    onUpdate: (self) => {
      if (!heroVideo.duration) return;
      heroVideo.currentTime = self.progress * heroVideo.duration;
    }
  });

  // content pin-fade as the scrub finishes, hands off to next section
  gsap.to('.hero-content, .scroll-indicator', {
    opacity: 0, y: -40,
    scrollTrigger: { trigger: '#hero', start: '70% top', end: 'bottom top', scrub: true }
  });
  gsap.to('.hero-video', {
    scale: 1.12,
    scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom bottom', scrub: true }
  });
  gsap.to('.hero-overlay', {
    backgroundColor: 'rgba(11,11,10,.6)',
    scrollTrigger: { trigger: '#hero', start: '60% top', end: 'bottom bottom', scrub: true }
  });
}

if (heroVideo.readyState >= 1) initScrub();
else heroVideo.addEventListener('loadedmetadata', initScrub);

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
function openMenu(){
  menuOpen = true;
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  navToggle.setAttribute('aria-expanded', 'true');
  lenis.stop();
  gsap.fromTo(menu.querySelectorAll('.menu-link'),
    { yPercent: 110 },
    { yPercent: 0, duration: .9, ease: 'expo.out', stagger: .05 }
  );
}
function closeMenu(){
  menuOpen = false;
  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  navToggle.setAttribute('aria-expanded', 'false');
  menuBg.style.opacity = 0;
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
  link.addEventListener('click', () => closeMenu());
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

/* ---------------- Featured Properties: stacking reveal ---------------- */
const isCoarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

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
