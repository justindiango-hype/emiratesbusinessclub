// Emirates Business Club: page behaviour: loader, smooth scroll, scroll story, reveals.

import { createScene } from './scene.js';
import { initJoin } from './form.js';

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;
const EASE = 'power4.out';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

if (!reduced) document.documentElement.classList.add('js');

// ---------- smooth scroll ----------
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
    else target.scrollIntoView();
  });
});

// ---------- join questionnaire ----------
initJoin({
  onOpen: () => { lenis && lenis.stop(); setTimeout(() => scene && document.body.classList.contains('is-locked') && scene.pause(true), 320); },
  onClose: () => { lenis && lenis.start(); scene && scene.pause(false); },
});

// ---------- loader ----------
const loaderBar = $('#loaderBar');
const load = { p: 0 };
function setLoad(v, dur = 0.6) {
  return gsap.to(load, {
    p: v, duration: dur, ease: 'power2.out',
    onUpdate: () => { loaderBar.style.transform = `scaleX(${load.p})`; },
  });
}
setLoad(0.7, 2.2);

// ---------- scroll story ----------
let scene = null;
const story = $('#story');
const chapters = $$('.chapter', story);
const hud = $('#hud'), hudLabel = $('#hudLabel'), hudRail = $('#hudRail'), hudCoord = $('#hudCoord'), hudStat = $('#hudStat');
const nav = $('#nav');
let marks = [], storyEnd = 0, vh = innerHeight;

function measure() {
  vh = innerHeight;
  marks = chapters.map((c) => c.offsetTop + story.offsetTop);
  storyEnd = story.offsetTop + story.offsetHeight;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Scroll position -> which shape the particles hold. Each shape rests while its text is on screen.
function stageAt(y) {
  let s = 0;
  for (let i = 1; i < marks.length; i++) s += smooth(marks[i] - vh * 0.78, marks[i] - vh * 0.08, y);
  s += smooth(storyEnd - vh * 1.25, storyEnd - vh * 0.55, y);
  return s;
}

let lastChapter = -1, lastY = 0;
function onScroll() {
  const y = window.scrollY;
  const s = stageAt(y);
  if (scene) {
    scene.setStage(s);
    // Past the story the dust fades back so the content is easy to read.
    scene.setDim(1 - 0.35 * smooth(storyEnd - vh * 0.5, storyEnd + vh * 0.6, y));
  }
  const idx = Math.min(chapters.length - 1, Math.round(s));
  if (idx !== lastChapter) {
    lastChapter = idx;
    const c = chapters[idx];
    hudLabel.textContent = c.dataset.label;
    hudCoord.textContent = c.dataset.coord;
    hudStat.textContent = c.dataset.stat;
  }
  hudRail.style.transform = `scaleY(${Math.min(1, y / Math.max(1, storyEnd - vh))})`;
  const inStory = y < storyEnd - vh * 0.9;
  hud.classList.toggle('is-off', !inStory);
  document.body.classList.toggle('in-story', inStory);
  // After the story, the header steps aside while reading and returns on scroll up.
  nav.classList.toggle('is-hidden', !inStory && y > lastY && y > vh);
  lastY = y;
}

// ---------- text reveals ----------
function splitLines(el) {
  return SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'line' });
}

function setupReveals() {
  // Hero is revealed by the intro timeline; other chapters as they arrive.
  chapters.slice(1).forEach((c) => {
    const title = $('.split', c);
    const rest = $$('.chapter__copy > *:not(.split)', c);
    const tl = gsap.timeline({ paused: true });
    if (title) {
      const sp = splitLines(title);
      gsap.set(title, { visibility: 'visible' });
      tl.from(sp.lines, { yPercent: 110, duration: 1.1, ease: EASE, stagger: 0.09 }, 0);
    }
    tl.fromTo(rest, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: EASE, stagger: 0.08 }, title ? 0.15 : 0);
    ScrollTrigger.create({
      trigger: c, start: 'top 55%', end: 'bottom 70%',
      onEnter: () => tl.timeScale(1).play(), onEnterBack: () => tl.timeScale(1).play(),
      onLeave: () => tl.timeScale(2.2).reverse(), onLeaveBack: () => tl.timeScale(2.2).reverse(),
    });
  });

  // Manifesto: words light up as you read down the page.
  const man = $('#manifesto');
  const words = SplitText.create(man, { type: 'words', wordsClass: 'word' }).words;
  gsap.to(words, {
    opacity: 1, ease: 'none', stagger: 0.5,
    scrollTrigger: { trigger: man, start: 'top 78%', end: 'bottom 45%', scrub: 0.6 },
  });

  // Section headings and blocks: one soft rise, once.
  $$('.section-head, .benefits__head, .finale').forEach((block) => {
    gsap.from(block.children, {
      autoAlpha: 0, y: 22, duration: 1, ease: EASE, stagger: 0.08,
      scrollTrigger: { trigger: block, start: 'top 80%', once: true },
    });
  });
  gsap.from('.compare__row', {
    autoAlpha: 0, y: 18, duration: 0.9, ease: EASE, stagger: 0.06,
    scrollTrigger: { trigger: '#compare', start: 'top 78%', once: true },
  });
  gsap.from('.compare__glow', { autoAlpha: 0, scaleY: 0.86, transformOrigin: '50% 0%', duration: 1.4, ease: EASE, scrollTrigger: { trigger: '#compare', start: 'top 78%', once: true } });
  gsap.from('.founding__num', { autoAlpha: 0, x: -40, duration: 1.3, ease: EASE, scrollTrigger: { trigger: '#founding', start: 'top 80%', once: true } });
  ScrollTrigger.create({
    trigger: '#founding', start: 'top 75%', once: true,
    onEnter: () => { $('#founding').classList.add('is-in'); },
  });
  gsap.from('#founding', { autoAlpha: 0, y: 28, duration: 1, ease: EASE, scrollTrigger: { trigger: '#founding', start: 'top 85%', once: true } });

  // President: a staged entrance. Portrait, then the quote, then her name and figures.
  const frame = $('#presidentFrame');
  const quote = splitLines($('#presidentQuote'));
  const copy = $('.president__copy');
  gsap.timeline({ scrollTrigger: { trigger: '#president', start: 'top 62%', once: true }, onComplete: () => frame.classList.add('is-lit') })
    .from('#presidentGhost', { autoAlpha: 0, duration: 1.6, ease: 'power2.out' }, 0)
    .fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'power4.inOut' }, 0.1)
    .fromTo($('img', frame), { scale: 1.3 }, { scale: 1.04, duration: 2.2, ease: EASE }, 0.1)
    .fromTo('.president__glow', { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 2.2, ease: EASE }, 0.5)
    .fromTo('.president__shine', { xPercent: -160 }, { xPercent: 260, duration: 1.5, ease: 'power2.inOut' }, 1.2)
    .from($('.eyebrow', copy), { autoAlpha: 0, y: 14, duration: 0.8, ease: EASE }, 0.7)
    .from('.president__mark', { autoAlpha: 0, scale: 0.6, transformOrigin: '0% 100%', duration: 0.9, ease: EASE }, 0.85)
    .from(quote.lines, { yPercent: 115, duration: 1.2, ease: EASE, stagger: 0.12 }, 0.95)
    .from('.president__rule', { scaleX: 0, transformOrigin: '0% 50%', duration: 0.9, ease: EASE }, 1.5)
    .from('.president__sign > div', { autoAlpha: 0, x: -14, duration: 0.9, ease: EASE }, 1.6)
    .from('.president__stats > div', { autoAlpha: 0, y: 22, duration: 0.9, ease: EASE, stagger: 0.12 }, 1.8)
    .from($$('.lede', copy), { autoAlpha: 0, y: 16, duration: 0.9, ease: EASE, stagger: 0.1 }, 2.0);
  // Her name drifts slowly behind the section.
  gsap.fromTo('#presidentGhost', { xPercent: 6 }, { xPercent: -22, ease: 'none', scrollTrigger: { trigger: '#president', start: 'top bottom', end: 'bottom top', scrub: 0.8 } });

  // Benefits: the section holds still while each card slides up over the last one.
  // Beside the cards, the gold dust gathers into an icon for whichever card is on top.
  const sec = $('#benefits'), cards = $$('.card', sec);
  if (desktop) {
    sec.classList.add('is-pinned');
    const steps = cards.length - 1;
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.benefits__pin', start: 'top top', end: () => '+=' + innerHeight * 0.75 * (steps + 0.8), pin: true, scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: () => scene && scene.setIcon(Math.min(steps, Math.round(tl.time()))),
        onEnter: () => scene && scene.setIcon(0), onEnterBack: () => scene && scene.setIcon(steps),
        onLeave: () => scene && scene.setIcon(-1), onLeaveBack: () => scene && scene.setIcon(-1),
      },
    });
    cards.forEach((card, i) => {
      if (i === 0) return;
      tl.fromTo(card, { y: () => innerHeight }, { y: 0, duration: 1, ease: 'power2.out' }, i - 1);
      // the cards underneath step back a little
      cards.slice(0, i).forEach((under, k) => {
        tl.to(under, { scale: 1 - (i - k) * 0.04, y: -(i - k) * 16, opacity: k === i - 1 ? 0.5 : 0.22, duration: 1, ease: 'power2.out' }, i - 1);
      });
    });
    // the last card rests on screen for a moment before the page moves on
    tl.to({}, { duration: 0.8 });
  }

  // Photo reels drift in opposite directions with the scroll.
  $$('.reel__row').forEach((row) => {
    const dir = Number(row.dataset.reel);
    const travel = () => Math.max(0, row.scrollWidth - innerWidth);
    gsap.fromTo(row, { x: () => (dir < 0 ? 0 : -travel()) }, {
      x: () => (dir < 0 ? -travel() : 0), ease: 'none',
      scrollTrigger: { trigger: '.reel', start: 'top bottom', end: 'bottom top', scrub: 0.8, invalidateOnRefresh: true },
    });
  });
}

function intro() {
  const hero = chapters[0];
  const title = $('.split', hero);
  const tl = gsap.timeline({ onComplete: () => { document.body.classList.remove('is-loading'); lenis && lenis.start(); } });
  tl.to('#loader', { autoAlpha: 0, duration: 0.9, ease: 'power2.inOut' }, 0);
  if (scene && !reduced) tl.to(scene.state, { intro: 1, duration: 3, ease: 'power2.inOut' }, 0.1);
  if (reduced) return tl;
  const sp = splitLines(title);
  gsap.set(title, { visibility: 'visible' });
  tl.from(sp.lines, { yPercent: 110, duration: 1.3, ease: EASE, stagger: 0.1 }, 1.0);
  tl.fromTo($$('.reveal', hero), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 1, ease: EASE, stagger: 0.09 }, 1.25);
  tl.fromTo(nav, { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: 1, ease: EASE, clearProps: 'all' }, 1.2);
  tl.fromTo(hud, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, clearProps: 'all' }, 1.8);
  // let people scroll before every last particle has landed
  tl.call(() => { document.body.classList.remove('is-loading'); lenis && lenis.start(); }, null, 1.6);
  return tl;
}

async function start() {
  const fonts = document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  try {
    scene = await createScene($('#scene'), { reducedMotion: reduced });
  } catch (err) {
    console.warn('[EBC] 3D scene unavailable, showing the page without it.', err);
    $('#scene').style.display = 'none';
  }
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);

  measure();
  if (!reduced) setupReveals();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { measure(); onScroll(); });
  ScrollTrigger.addEventListener('refresh', () => { measure(); onScroll(); });
  ScrollTrigger.refresh();
  onScroll();
  if (scene) scene.jump(stageAt(window.scrollY));

  await setLoad(1, 0.5);
  intro();
  window.__ebc = { scene, lenis, sync: () => scene && scene.jump(stageAt(window.scrollY)) };
}

start();
