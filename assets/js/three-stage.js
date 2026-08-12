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
  const camera = new THREE.PerspectiveCamera(29, 1, 0.1, 100);
  camera.position.set(0, 0.18, 8.8);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.HemisphereLight(0xfff4e7, 0x642000, 2.35);
  const key = new THREE.DirectionalLight(0xffffff, 3.8);
  key.position.set(4.8, 5.2, 6.5);
  const rim = new THREE.DirectionalLight(0xff7a2e, 2.35);
  rim.position.set(-5, 2, -4);
  scene.add(ambient, key, rim);

  let heroRig;
  let ready = false;
  let destroyed = false;
  let active = true;
  let frame = 0;
  let introStart = 0;
  let lastTime = performance.now();
  let lastPointerMove = -Infinity;
  let pointerInside = false;
  const pointerTarget = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const base = new THREE.Vector3(0.22, -0.03, 0);

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

  function makeRig(source) {
    const rig = new THREE.Group();
    source.scale.setScalar(4.85);
    source.rotation.set(-0.075, 1.04, -0.045);
    rig.add(source);
    scene.add(rig);
    return rig;
  }

  const loader = new GLTFLoader();
  loader.load(
    options.src,
    (gltf) => {
      if (destroyed) return;
      const source = prepareModel(gltf.scene);
      heroRig = makeRig(source);
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
      const idleX = reducedMotion ? 0 : Math.sin(now * 0.00028) * 0.055;
      const idleY = reducedMotion ? 0 : Math.cos(now * 0.00036) * 0.045;
      const targetX = moving ? pointerTarget.x : idleX;
      const targetY = moving ? pointerTarget.y : idleY;
      pointer.x = damp(pointer.x, targetX, moving ? 8.5 : 1.8, dt);
      pointer.y = damp(pointer.y, targetY, moving ? 8.5 : 1.8, dt);

      const hoverFocus = pointerInside ? 1 : 0;
      const intro = easeOutQuint((now - introStart) / (reducedMotion ? 1 : 1180));
      const reveal = active ? intro : 0;

      const idleFloat = reducedMotion ? 0 : Math.sin(now * 0.00072) * 0.045;
      const idleRoll = reducedMotion ? 0 : Math.sin(now * 0.00042) * 0.012;
      const heroX = base.x + pointer.x * 0.16;
      const heroY = base.y - pointer.y * 0.105 + idleFloat;
      heroRig.position.x = THREE.MathUtils.lerp(2.8, heroX, reveal);
      heroRig.position.y = THREE.MathUtils.lerp(0.1, heroY, reveal);
      heroRig.position.z = pointerInside ? pointer.y * -0.04 : 0;
      heroRig.rotation.x = damp(heroRig.rotation.x, pointer.y * 0.085, 5.8, dt);
      heroRig.rotation.y = damp(heroRig.rotation.y, pointer.x * 0.19, 5.8, dt);
      heroRig.rotation.z = damp(heroRig.rotation.z, -pointer.x * 0.025 + idleRoll, 4.5, dt);
      const heroScale = (0.86 + reveal * 0.14) * (1 + hoverFocus * 0.018);
      heroRig.scale.setScalar(heroScale);
      key.position.x = 4.8 + pointer.x * 1.5;
      key.position.y = 5.2 - pointer.y * 0.8;
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
