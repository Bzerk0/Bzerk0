// The 3D experience: sets up Three.js, draws every frame, and reacts to input.
// It moves through a few states:
//   'waiting'  still loading (the page is black)
//   'outside'  looking at the lone cabinet from across the dark room
//   'menu'     zoomed into its screen, choosing a project
//   'busy'     a transition is playing (input is ignored)
import * as THREE from 'three';
import gsap from 'gsap';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COLORS } from '../constants.js';
import { menuIsOpen } from '../ui/nav.js';
import { createCabinetScene } from './cabinetScene.js';
import { zoomTransition, openTransition } from './transitions.js';

const $ = (id) => document.getElementById(id);
const FOV = 50;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

export async function createArcade({ canvas, projects }) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;

  // ---- Renderer, scene, camera ----
  const renderer = new THREE.WebGLRenderer({ canvas, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2)); // cap sharpness so phones stay smooth
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.045); // the room fades into the dark
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 120);

  const room = await createCabinetScene({ blink: !reduced });
  scene.add(room.group);

  // ---- Bloom: makes anything brighter than white glow (the screen). HTML text is never affected. ----
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.55, 0.6)); // strength, radius, threshold
  composer.addPass(new OutputPass());
  let useBloom = true;

  // ---- Camera rig: where the camera stands and what it looks at ----
  const rig = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let aspect = 1;
  // The landing view: across the room, the cabinet small in the middle of the dark.
  const outsidePose = () => ({ pos: { x: 0, y: 1.5, z: 8 }, look: { x: 0, y: 1.05, z: 0 } });
  // Straight in front of the screen, close enough that it fills the window. `push` < 1 goes closer still.
  const screenPose = (push = 1) => {
    const { center, normal, width, height } = room.screen;
    const distance = Math.min(height / 2 / TAN, width / 2 / (TAN * aspect)) * 0.97 * push;
    const pos = center.clone().addScaledVector(normal, distance);
    return { pos: { x: pos.x, y: pos.y, z: pos.z }, look: { x: center.x, y: center.y, z: center.z } };
  };
  const setPose = (pose) => {
    rig.pos.copy(pose.pos);
    rig.look.copy(pose.look);
  };

  let state = 'waiting';
  // Also written to <body data-state="..."> so CSS and the test script can see it.
  const setState = (next) => (document.body.dataset.state = state = next);
  let index = 0; // which project is selected in the menu
  let power = 0; // the screen: 0 = off, 1 = on
  let time = 0;

  function resize() {
    aspect = innerWidth / innerHeight;
    renderer.setSize(innerWidth, innerHeight, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (state === 'menu') setPose(screenPose());
    else if (state !== 'busy') setPose(outsidePose());
  }
  addEventListener('resize', resize);
  resize();

  // ---- Draw loop ----
  const timer = new THREE.Timer();
  let frames = 0;
  let slowFrames = 0;
  function frame() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    time += dt;
    camera.position.copy(rig.pos);
    if (state === 'outside' && !reduced) {
      // idle sway: a slow drift so the room feels alive
      camera.position.x += Math.sin(time * 0.3) * 0.15;
      camera.position.y += Math.sin(time * 0.23) * 0.05;
    }
    camera.lookAt(rig.look);
    room.update(time, power, camera, renderer);

    if (useBloom) composer.render(dt);
    else renderer.render(scene, camera);

    // Phones: if the first couple of seconds run below ~30 frames a second, turn the bloom off.
    if (mobile && useBloom && state !== 'waiting' && frames < 90) {
      frames++;
      if (dt > 1 / 30) slowFrames++;
      if (frames === 90 && slowFrames > 45) useBloom = false;
    }
  }
  // Warm up: compile the shaders now so the first frame is smooth.
  await renderer.compileAsync(scene, camera);
  renderer.setAnimationLoop(frame);
  // Stop drawing while the tab is in the background.
  document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : frame));

  // ---- On-screen text (plain HTML on top of the canvas) ----
  const flash = $('flash');
  const hud = { prompt: $('prompt'), skip: $('skip'), menu: $('menu'), list: $('menu-list') };

  // The menu: one link per project, built from projects.json.
  const items = projects.map((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<a class="menu__item" href="/projects/${p.slug}/"><span class="menu__name"></span><span class="menu__tagline"></span></a>`;
    const a = li.firstElementChild;
    a.style.setProperty('--accent', p.accent);
    a.querySelector('.menu__name').textContent = p.name;
    a.querySelector('.menu__tagline').textContent = p.tagline;
    a.addEventListener('pointerenter', () => state === 'menu' && select(i));
    a.addEventListener('focus', () => select(i, false));
    a.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return; // open-in-new-tab still works normally
      e.preventDefault();
      open(i);
    });
    hud.list.append(li);
    return a;
  });

  function select(i, moveFocus = true) {
    index = THREE.MathUtils.clamp(i, 0, projects.length - 1);
    items.forEach((a, n) => a.classList.toggle('is-selected', n === index));
    if (moveFocus && document.activeElement !== items[index]) items[index].focus({ preventScroll: true });
    history.replaceState(null, '', `#${projects[index].slug}`); // so Back / reload returns to this project
  }

  function showMenu() {
    hud.prompt.hidden = hud.skip.hidden = true;
    hud.menu.hidden = false;
    select(index);
    setState('menu');
  }

  // ---- Actions ----
  function enter() {
    if (state !== 'outside') return;
    setState('busy');
    hud.prompt.hidden = true;
    zoomTransition({ rig, flash, reduced, to: screenPose(), done: showMenu });
  }

  function leave() {
    if (state !== 'menu') return;
    setState('busy');
    hud.menu.hidden = true;
    history.replaceState(null, '', location.pathname);
    zoomTransition({
      rig,
      flash,
      reduced,
      to: outsidePose(),
      done: () => {
        hud.prompt.hidden = hud.skip.hidden = false;
        setState('outside');
      },
    });
  }

  function open(i) {
    if (state !== 'menu') return;
    select(i);
    setState('busy');
    hud.menu.hidden = true;
    const p = projects[index];
    openTransition({ rig, flash, reduced, screen: screenPose(0.35), accent: p.accent, done: () => (location.href = `/projects/${p.slug}/`) });
  }

  // ---- Input ----
  addEventListener('keydown', (e) => {
    if (menuIsOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    const onControl = e.target.closest?.('a, button, input, textarea, select'); // let links and buttons handle their own keys
    const press = e.key === 'Enter' || e.key === ' ';
    if (state === 'outside' && press && !onControl) {
      e.preventDefault();
      enter();
    } else if (state === 'menu') {
      const key = e.key.toLowerCase();
      if (key === 'arrowdown' || key === 's') select(index + 1);
      else if (key === 'arrowup' || key === 'w') select(index - 1);
      else if (key === 'escape') leave();
      else if (e.key === 'Enter' && !onControl) open(index);
      else return;
      e.preventDefault();
    }
  });

  // Scroll wheel: on the landing it zooms in; in the menu, one project per scroll gesture.
  let lastWheel = 0;
  addEventListener(
    'wheel',
    (e) => {
      if (menuIsOpen()) return;
      if (state === 'outside') {
        lastWheel = e.timeStamp;
        enter();
      } else if (state === 'menu' && Math.abs(e.deltaY) > 4 && e.timeStamp - lastWheel > 400) {
        lastWheel = e.timeStamp;
        select(index + Math.sign(e.deltaY));
      }
    },
    { passive: true },
  );

  canvas.addEventListener('click', () => state === 'outside' && enter());
  canvas.addEventListener('pointermove', () => (canvas.style.cursor = state === 'outside' ? 'pointer' : ''));

  // Touch: any swipe in the room zooms in. In the menu, links are tapped normally.
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => (touchStart = e.changedTouches[0]), { passive: true });
  canvas.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - touchStart.clientX;
      const dy = e.changedTouches[0].clientY - touchStart.clientY;
      if (state === 'outside' && Math.hypot(dx, dy) > 30) enter();
    },
    { passive: true },
  );

  // Coming back with the browser's Back button can restore this page mid-zoom. Put it back on the menu.
  addEventListener('pageshow', (e) => {
    if (!e.persisted || state !== 'busy') return;
    gsap.set(flash, { opacity: 0 });
    setPose(screenPose());
    showMenu();
  });

  // ---- Start. Called by main.js once everything has loaded. ----
  // With a project slug (coming back from a project page) we go straight to the menu, on that project.
  function begin(slug) {
    document.body.classList.add('is-outside');
    const startIndex = projects.findIndex((p) => p.slug === slug);
    if (startIndex >= 0) {
      index = startIndex;
      power = 1;
      setPose(screenPose());
      showMenu();
      return;
    }
    hud.prompt.hidden = false;
    setPose(outsidePose());
    setState('busy');
    // The screen warms up: a quick stutter, then steady. Input unlocks once it is lit.
    const warm = { value: 0 };
    const tl = gsap.timeline({ onUpdate: () => (power = warm.value), onComplete: () => setState('outside') });
    if (reduced) tl.set(warm, { value: 1 }).to({}, { duration: 0.4 });
    else tl.to(warm, { value: 1, duration: 0.06 }, 0.3).to(warm, { value: 0.2, duration: 0.06 }, 0.45).to(warm, { value: 1, duration: 0.5, ease: 'power2.out' }, 0.62);
  }

  return { begin };
}
