import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, LineSegments, Line, Points, Sprite,
  BufferGeometry, Float32BufferAttribute, IcosahedronGeometry, OctahedronGeometry, EdgesGeometry,
  MeshBasicMaterial, LineBasicMaterial, LineDashedMaterial, PointsMaterial, SpriteMaterial,
  CanvasTexture, Color, Vector3, SRGBColorSpace,
} from 'three';
import { NODES, LINKS, CAMERA, TILT, SPIN0, project, nearness } from './model';

// Loaded with import() after the page is interactive, so three.js never touches
// first paint. The page works without it: the labels are prerendered links.
//
// Budget rules: one draw loop, paused when the canvas is off screen or the tab is
// hidden; DPR capped at 2; no per-frame allocation; reduced motion renders single
// frames on demand (resize, theme) and never loops.

const SPIN = 0.055; // rad/s of idle rotation
const INTRO_MS = 1500;

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

// Deterministic PRNG so the dust field is identical on every load.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createOrbitScene({ canvas, container, labels, coreLabel, reducedMotion }) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 60);
  camera.position.set(0, 0, CAMERA.z);

  const world = new Group();
  scene.add(world);

  const disposables = [];
  const keep = (x) => { disposables.push(x); return x; };
  const glowTex = keep(radialTexture());
  const dotTex = keep(dotTexture());

  // ── Core: solid heart, crisp wireframe, slow counter-rotating shell, soft halo.
  const coreGeo = keep(new IcosahedronGeometry(0.6, 0));
  const coreFill = keep(new MeshBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false }));
  const coreWireMat = keep(new LineBasicMaterial({ transparent: true, opacity: 0.95 }));
  const core = new Group();
  core.add(new Mesh(coreGeo, coreFill));
  core.add(new LineSegments(keep(new EdgesGeometry(coreGeo)), coreWireMat));
  world.add(core);

  const shellMat = keep(new LineBasicMaterial({ transparent: true, opacity: 0.16 }));
  const shell = new LineSegments(keep(new EdgesGeometry(keep(new IcosahedronGeometry(1.0, 1)))), shellMat);
  world.add(shell);

  const haloMat = keep(new SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.32, depthWrite: false }));
  const halo = new Sprite(haloMat);
  halo.scale.setScalar(3.4);
  world.add(halo);

  // ── Subsystem nodes and the spokes that tie them to the core.
  const nodeGeo = keep(new OctahedronGeometry(0.105, 0));
  const nodeEdgeGeo = keep(new EdgesGeometry(keep(new OctahedronGeometry(0.17, 0))));
  const nodes = NODES.map((n) => {
    const fill = keep(new MeshBasicMaterial({ transparent: true, opacity: 1 }));
    const ringMat = keep(new LineBasicMaterial({ transparent: true, opacity: 0 }));
    const glowMat = keep(new SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false }));
    const g = new Group();
    g.position.set(...n.p);
    g.add(new Mesh(nodeGeo, fill));
    const ring = new LineSegments(nodeEdgeGeo, ringMat);
    g.add(ring);
    const glow = new Sprite(glowMat);
    glow.scale.setScalar(0.9);
    g.add(glow);
    world.add(g);

    const spokeGeo = keep(new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, ...n.p], 3)));
    const spokeMat = keep(new LineBasicMaterial({ transparent: true, opacity: 0.5 }));
    world.add(new Line(spokeGeo, spokeMat));
    return { g, fill, ring, ringMat, glowMat, spokeMat, h: 0 };
  });

  const linkMat = keep(new LineDashedMaterial({ transparent: true, opacity: 0.32, dashSize: 0.07, gapSize: 0.09 }));
  for (const [a, b] of LINKS) {
    const geo = keep(new BufferGeometry().setAttribute('position', new Float32BufferAttribute([...NODES[a].p, ...NODES[b].p], 3)));
    const line = new Line(geo, linkMat);
    line.computeLineDistances();
    world.add(line);
  }

  // ── Pulses: one request/response round trip per spoke, one courier per link.
  const routes = [
    ...NODES.map((n, i) => ({ a: [0, 0, 0], b: n.p, period: 2.6 + (i % 3) * 0.45, phase: i * 0.37, round: true })),
    ...LINKS.map(([a, b], i) => ({ a: NODES[a].p, b: NODES[b].p, period: 3.4 + i * 0.3, phase: i * 0.61, round: false })),
  ];
  const pulsePos = new Float32Array(routes.length * 3);
  const pulseGeo = keep(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pulsePos, 3)));
  const pulseMat = keep(new PointsMaterial({ size: 0.085, map: dotTex, transparent: true, alphaTest: 0.3, depthWrite: false }));
  world.add(new Points(pulseGeo, pulseMat));

  // ── Dust: faint context field around everything, drifting the other way.
  const rand = mulberry32(7);
  const DUST = 460;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    const r = 3.1 + rand() * 3.2;
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    dustPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    dustPos[i * 3 + 1] = r * Math.cos(ph) * 0.8;
    dustPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const dustMat = keep(new PointsMaterial({ size: 0.028, map: dotTex, transparent: true, alphaTest: 0.3, opacity: 0.55, depthWrite: false }));
  const dust = new Points(keep(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(dustPos, 3))), dustMat);
  scene.add(dust);

  // ── Theme: every colour comes from the site's CSS tokens, re-read on toggle.
  const ink = new Color(), accent = new Color(), line = new Color(), muted = new Color();
  function applyTheme() {
    ink.set(css('--text-h') || '#1B1B1E');
    accent.set(css('--bg-accent-strong') || '#E05A2B');
    line.set(css('--border-strong') || '#D0CFC8');
    muted.set(css('--text-muted') || '#66666E');
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    coreFill.color.copy(accent);
    coreWireMat.color.copy(accent);
    shellMat.color.copy(ink);
    shellMat.opacity = dark ? 0.2 : 0.14;
    haloMat.color.copy(accent);
    haloMat.opacity = dark ? 0.3 : 0.22;
    for (const n of nodes) {
      n.ringMat.color.copy(accent);
      n.glowMat.color.copy(accent);
    }
    linkMat.color.copy(muted);
    pulseMat.color.copy(accent);
    dustMat.color.copy(muted);
    dustMat.opacity = dark ? 0.6 : 0.45;
  }
  applyTheme();

  // ── Interaction state.
  let active = -1; // highlighted node index, -1 = none, -2 = core
  let size = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let spin = 0; // accumulated idle yaw
  let spinRate = 1; // eases to 0 while a label is hovered so it stays under the cursor
  let scrollYaw = 0;
  let t = 0;
  let introStart = -1;
  const tmp = new Vector3();

  // Label boxes are measured on resize (never per frame: reading layout right after
  // writing styles would force a reflow every frame). Positions are computed, not read.
  let boxes = [];
  let gap = 14;
  function measureLabels() {
    boxes = labels.map((el) => (el ? { w: el.offsetWidth, h: el.offsetHeight } : { w: 0, h: 0 }));
    if (coreLabel) boxes.core = { w: coreLabel.offsetWidth, h: coreLabel.offsetHeight };
    const fs = labels[0] ? parseFloat(getComputedStyle(labels[0]).fontSize) : 11.5;
    gap = fs * 1.2; // matches the label's translate(-50%, calc(-100% - 1.2em))
  }

  // Map-style declutter: walk labels nearest-first and fade any that would cover a
  // label already placed (or the Model pill). The hovered/focused label always wins.
  const order = NODES.map((_, i) => i);
  const placed = [];
  const occluded = new Array(NODES.length).fill(false);
  const pos = NODES.map(() => ({ x: 0, y: 0, near: 0 }));
  const overlaps = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

  function layoutLabels(rx, ry, s) {
    for (let i = 0; i < labels.length; i++) {
      const p = NODES[i].p;
      const pr = project([p[0] * s, p[1] * s, p[2] * s], rx, ry);
      pos[i].x = (pr.left / 100) * size;
      pos[i].y = (pr.top / 100) * size;
      pos[i].near = nearness(pr.depth);
      const el = labels[i];
      if (!el) continue;
      el.style.left = `${pr.left.toFixed(2)}%`;
      el.style.top = `${pr.top.toFixed(2)}%`;
      el.style.zIndex = String(10 + Math.round(pos[i].near * 50));
      el.style.setProperty('--near', pos[i].near.toFixed(3));
    }
    placed.length = 0;
    if (coreLabel) {
      const pr = project([0, -0.98 * s, 0], rx, ry);
      coreLabel.style.left = `${pr.left.toFixed(2)}%`;
      coreLabel.style.top = `${pr.top.toFixed(2)}%`;
      const c = boxes.core;
      if (c) {
        const x = (pr.left / 100) * size, y = (pr.top / 100) * size + gap * 0.72;
        placed.push({ l: x - c.w / 2 - 3, r: x + c.w / 2 + 3, t: y - 3, b: y + c.h + 3 });
      }
    }
    if (!boxes.length) return;
    order.sort((a, b) => (b === active) - (a === active) || pos[b].near - pos[a].near);
    for (const i of order) {
      const { w, h } = boxes[i];
      const { x, y } = pos[i];
      const box = { l: x - w / 2 - 3, r: x + w / 2 + 3, t: y - gap - h - 3, b: y - gap + 3 };
      const dot = { l: x - 6, r: x + 6, t: y - 6, b: y + 6 };
      let hidden = false;
      if (i !== active) for (const q of placed) if (overlaps(box, q)) { hidden = true; break; }
      if (!hidden) placed.push(box, dot);
      if (hidden !== occluded[i]) {
        occluded[i] = hidden;
        labels[i]?.classList.toggle('is-occluded', hidden);
      }
    }
  }

  function frame(dtMs) {
    const dt = Math.min(dtMs, 50) / 1000;
    t += dt;
    if (introStart < 0) introStart = t;
    const intro = reducedMotion ? 1 : easeOut(Math.min(1, ((t - introStart) * 1000) / INTRO_MS));

    spinRate += ((active === -1 ? 1 : 0) - spinRate) * Math.min(1, dt * 4);
    spin += SPIN * spinRate * dt;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);

    const ry = SPIN0 + (reducedMotion ? 0 : spin + scrollYaw) + pointer.x * 0.32;
    const rx = TILT + pointer.y * 0.16;
    const s = 0.82 + 0.18 * intro;
    world.rotation.set(rx, ry, 0);
    world.scale.setScalar(s);

    core.rotation.y = t * 0.25;
    core.rotation.x = t * 0.11;
    shell.rotation.y = -t * 0.07;
    shell.rotation.z = t * 0.03;
    dust.rotation.y = -t * 0.012 - ry * 0.25;
    const coreH = active === -2 ? 1 : 0;
    halo.scale.setScalar(3.4 + Math.sin(t * 1.6) * 0.12 + coreH * 0.5);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      // Pop in one by one during the intro.
      const pop = reducedMotion ? 1 : easeOut(Math.min(1, Math.max(0, intro * 1.6 - i * 0.08)));
      n.h += ((active === i ? 1 : 0) - n.h) * Math.min(1, dt * 10);
      n.g.scale.setScalar(pop * (1 + n.h * 0.55));
      n.fill.color.copy(ink).lerp(accent, n.h);
      n.ringMat.opacity = n.h;
      n.glowMat.opacity = n.h * 0.55;
      n.ring.rotation.y = t * 0.9;
      n.spokeMat.color.copy(line).lerp(accent, n.h);
      n.spokeMat.opacity = (0.55 + n.h * 0.45) * pop;
    }

    for (let i = 0; i < routes.length; i++) {
      const r = routes[i];
      let f = ((t + r.phase * r.period) % r.period) / r.period;
      if (r.round) f = f < 0.5 ? f * 2 : 2 - f * 2; // out to the node, then back
      f = f * f * (3 - 2 * f); // smoothstep: leave and arrive gently
      tmp.set(r.a[0] + (r.b[0] - r.a[0]) * f, r.a[1] + (r.b[1] - r.a[1]) * f, r.a[2] + (r.b[2] - r.a[2]) * f);
      pulsePos[i * 3] = tmp.x; pulsePos[i * 3 + 1] = tmp.y; pulsePos[i * 3 + 2] = tmp.z;
    }
    pulseGeo.attributes.position.needsUpdate = true;
    pulseMat.opacity = intro;

    layoutLabels(rx, ry, s);
    renderer.render(scene, camera);
  }

  // ── Sizing: the canvas is square, so CSS width is all we need.
  function resize() {
    const w = Math.round(container.clientWidth);
    if (!w || w === size) return;
    size = w;
    renderer.setSize(w, w, false);
    measureLabels();
    if (!running) frame(0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ── Loop control.
  let raf = 0, last = 0, running = false, onScreen = true;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    frame(last ? now - last : 16);
    last = now;
  };
  function sync() {
    const should = !reducedMotion && onScreen && !document.hidden;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(tick); }
    if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { rootMargin: '80px' });
  io.observe(container);
  document.addEventListener('visibilitychange', sync);

  const onPointer = (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onScroll = () => { scrollYaw = window.scrollY * 0.0016; };
  if (!reducedMotion) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  const themeObserver = new MutationObserver(() => { applyTheme(); if (!running) frame(0); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();
  measureLabels();
  document.fonts?.ready.then(() => { measureLabels(); if (!running) frame(0); });
  frame(0);
  sync();

  return {
    highlight(i) {
      active = i;
      if (reducedMotion) {
        // No loop: snap the highlight and draw once.
        nodes.forEach((n, k) => { n.h = k === i ? 1 : 0; });
        frame(0);
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      running = false;
      ro.disconnect();
      io.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('scroll', onScroll);
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
