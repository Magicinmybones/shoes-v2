import * as THREE from './three.module.min.js';
import { GLTFLoader } from './GLTFLoader.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const damp = (from, to, speed, dt) => THREE.MathUtils.lerp(from, to, 1 - Math.exp(-speed * dt));
const easeOutQuint = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 5);

function mount(canvas, options = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100);
  camera.position.set(0, 0.25, 8.8);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.HemisphereLight(0xfff4e7, 0x642000, 2.35);
  const key = new THREE.DirectionalLight(0xffffff, 3.8);
  key.position.set(4.8, 5.2, 6.5);
  const rim = new THREE.DirectionalLight(0xff7a2e, 2.35);
  rim.position.set(-5, 2, -4);
  scene.add(ambient, key, rim);

  const composition = new THREE.Group();
  scene.add(composition);

  let heroRig;
  let lowerRig;
  let upperRig;
  let ready = false;
  let destroyed = false;
  let active = true;
  let frame = 0;
  let introStart = 0;
  let lastTime = performance.now();
  let lastPointerMove = -Infinity;
  let pointerInside = false;
  let wasMoving = false;
  let settlePulse = 0;
  const pointerTarget = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const base = {
    hero: new THREE.Vector3(0.34, -0.08, 0),
    lower: new THREE.Vector3(-2.28, -0.68, -1.28),
    upper: new THREE.Vector3(2.18, 1.02, -1.9),
  };

  function prepareModel(source) {
    source.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      if (obj.material) {
        obj.material.envMapIntensity = 1.15;
        obj.material.needsUpdate = true;
      }
    });

    const bounds = new THREE.Box3().setFromObject(source);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    source.position.sub(center);
    const normalizer = 1 / Math.max(size.x, size.y, size.z);
    source.scale.setScalar(normalizer);
    source.updateMatrixWorld(true);
    return source;
  }

  function makeRig(source, scale, rotationY, rotationZ = 0) {
    const rig = new THREE.Group();
    const shoe = source.clone(true);
    shoe.scale.setScalar(scale);
    shoe.rotation.set(-0.05, rotationY, rotationZ);
    rig.add(shoe);
    composition.add(rig);
    return rig;
  }

  const loader = new GLTFLoader();
  loader.load(
    options.src,
    (gltf) => {
      if (destroyed) return;
      const source = prepareModel(gltf.scene);
      heroRig = makeRig(source, 3.92, 1.06, -0.055);
      lowerRig = makeRig(source, 1.98, 0.46, -0.12);
      upperRig = makeRig(source, 1.66, -1.10, 0.11);
      ready = true;
      introStart = performance.now();
      options.onReady?.();
    },
    undefined,
    (error) => {
      console.error('[Shoe3D] GLB failed to load', error);
      options.onError?.(error);
    },
  );

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointerTarget.x = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    pointerTarget.y = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
    pointerInside = true;
    lastPointerMove = performance.now();
  }
  function pointerEnter(event) {
    pointerInside = true;
    updatePointer(event);
  }
  function pointerLeave() {
    pointerInside = false;
    pointerTarget.set(0, 0);
  }
  canvas.addEventListener('pointerenter', pointerEnter);
  canvas.addEventListener('pointermove', updatePointer);
  canvas.addEventListener('pointerleave', pointerLeave);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(now) {
    if (destroyed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;

    if (ready) {
      const moving = pointerInside && now - lastPointerMove < 155;
      if (!moving && wasMoving) settlePulse = 1;
      wasMoving = moving;

      const idleX = reducedMotion ? 0 : Math.sin(now * 0.00038) * 0.16;
      const idleY = reducedMotion ? 0 : Math.cos(now * 0.00031) * 0.09;
      const targetX = moving ? pointerTarget.x : idleX;
      const targetY = moving ? pointerTarget.y : idleY;
      pointer.x = damp(pointer.x, targetX, moving ? 11 : 2.3, dt);
      pointer.y = damp(pointer.y, targetY, moving ? 11 : 2.3, dt);

      settlePulse = Math.max(0, settlePulse - dt * 1.75);
      const settle = Math.sin((1 - settlePulse) * Math.PI * 3.2) * settlePulse;
      const hoverFocus = pointerInside ? 1 : 0;
      const intro = easeOutQuint((now - introStart) / (reducedMotion ? 1 : 1180));
      const reveal = active ? intro : 0;

      const heroX = base.hero.x + pointer.x * 0.19;
      const heroY = base.hero.y - pointer.y * 0.13 + (reducedMotion ? 0 : Math.sin(now * 0.00105) * 0.035);
      heroRig.position.x = THREE.MathUtils.lerp(3.4, heroX, reveal);
      heroRig.position.y = THREE.MathUtils.lerp(-0.25, heroY, reveal);
      heroRig.position.z = 0;
      heroRig.rotation.x = damp(heroRig.rotation.x, pointer.y * 0.10, 7, dt);
      heroRig.rotation.y = damp(heroRig.rotation.y, pointer.x * 0.27, 7, dt);
      heroRig.rotation.z = damp(heroRig.rotation.z, -pointer.x * 0.035 + settle * 0.018, 6, dt);
      const heroScale = (0.82 + reveal * 0.18) * (1 + hoverFocus * 0.035 + settle * 0.018);
      heroRig.scale.setScalar(heroScale);

      const lowerX = base.lower.x - pointer.x * 0.34 - hoverFocus * 0.10;
      const lowerY = base.lower.y + pointer.y * 0.17 + (reducedMotion ? 0 : Math.sin(now * 0.00082 + 1.5) * 0.055);
      lowerRig.position.x = THREE.MathUtils.lerp(-4.25, lowerX, reveal);
      lowerRig.position.y = THREE.MathUtils.lerp(-1.35, lowerY, reveal);
      lowerRig.position.z = base.lower.z;
      lowerRig.rotation.x = damp(lowerRig.rotation.x, pointer.y * -0.055, 4.2, dt);
      lowerRig.rotation.y = damp(lowerRig.rotation.y, pointer.x * -0.17, 4.2, dt);
      lowerRig.rotation.z = damp(lowerRig.rotation.z, -0.035 - pointer.x * 0.025, 4.2, dt);
      lowerRig.scale.setScalar(0.78 + reveal * 0.22);

      const upperX = base.upper.x - pointer.x * 0.42 + hoverFocus * 0.12;
      const upperY = base.upper.y - pointer.y * 0.21 + (reducedMotion ? 0 : Math.cos(now * 0.00074) * 0.045);
      upperRig.position.x = THREE.MathUtils.lerp(4.1, upperX, reveal);
      upperRig.position.y = THREE.MathUtils.lerp(1.72, upperY, reveal);
      upperRig.position.z = base.upper.z;
      upperRig.rotation.x = damp(upperRig.rotation.x, pointer.y * 0.05, 3.7, dt);
      upperRig.rotation.y = damp(upperRig.rotation.y, pointer.x * -0.20, 3.7, dt);
      upperRig.rotation.z = damp(upperRig.rotation.z, 0.035 + pointer.x * 0.03, 3.7, dt);
      upperRig.scale.setScalar(0.7 + reveal * 0.3);

      composition.rotation.y = damp(composition.rotation.y, pointer.x * 0.035, 4, dt);
      composition.rotation.x = damp(composition.rotation.x, pointer.y * -0.018, 4, dt);
      key.position.x = 4.8 + pointer.x * 2.6;
      key.position.y = 5.2 - pointer.y * 1.4;
    }

    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(animate);

  return {
    setActive(value) {
      const next = Boolean(value);
      if (next && !active) introStart = performance.now();
      active = next;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerenter', pointerEnter);
      canvas.removeEventListener('pointermove', updatePointer);
      canvas.removeEventListener('pointerleave', pointerLeave);
      renderer.dispose();
    },
  };
}

window.Shoe3D = { mount };
window.dispatchEvent(new Event('shoe3d-ready-api'));
