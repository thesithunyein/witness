import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function startPrism(gl, fx) {
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, alpha: true });
  renderer.setClearColor(0x151517, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
  camera.position.set(0.15, 0.12, 4.4);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const shape = new THREE.Shape();
  shape.moveTo(0, 1.08);
  shape.lineTo(0.94, -0.56);
  shape.lineTo(-0.94, -0.56);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.46,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.028,
    bevelSegments: 4,
  });
  geo.center();

  const glass = new THREE.MeshPhysicalMaterial({
    transmission: 1,
    thickness: 1.35,
    roughness: 0.035,
    ior: 1.52,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    attenuationColor: new THREE.Color('#fff4e2'),
    attenuationDistance: 1.6,
    envMapIntensity: 1.25,
  });
  const prism = new THREE.Mesh(geo, glass);
  prism.position.set(1.25, -0.02, 0);
  scene.add(prism);

  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const key = new THREE.DirectionalLight(0xd5e4ff, 2.4);
  key.position.set(5, 2.2, 3);
  scene.add(key);

  const ctx = fx.getContext('2d');
  const aim = { x: 0.7, y: 0.46, tx: 0.7, ty: 0.46 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let running = true;
  let idle = 0;

  const stage = gl.parentElement;

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const dpr = Math.min(devicePixelRatio || 1, w < 820 ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    fx.width = Math.floor(w * dpr);
    fx.height = Math.floor(h * dpr);
  }

  function drawLight() {
    const w = fx.width;
    const h = fx.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w * (w < 900 ? 0.5 : 0.66);
    const cy = h * 0.5;
    const yIn = cy + (aim.y - 0.5) * h * 0.42;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = Math.max(10, w * 0.012);
    ctx.beginPath();
    ctx.moveTo(w * 1.02, yIn);
    ctx.lineTo(cx + w * 0.02, cy);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = Math.max(2, w * 0.003);
    ctx.stroke();

    const colors = ['#8b7cff', '#67c8ff', '#7ef0c2', '#ffe08a', '#ff9b78'];
    const fan = 0.42 + aim.y * 0.28;
    colors.forEach((hex, i) => {
      const t = (i / (colors.length - 1) - 0.5) * fan;
      const x1 = cx - w * 0.5;
      const y1 = cy + t * h * 0.72;
      const g = ctx.createLinearGradient(cx, cy, x1, y1);
      g.addColorStop(0, hex);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(14, w * 0.018);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.02, cy + t * h * 0.05);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    if (!running) return;
    idle += 1;
    if (!reduced && idle > 360) {
      const a = t * 0.00035;
      aim.tx = 0.62 + Math.cos(a) * 0.12;
      aim.ty = 0.5 + Math.sin(a * 0.8) * 0.12;
    }
    aim.x += (aim.tx - aim.x) * 0.08;
    aim.y += (aim.ty - aim.y) * 0.08;
    prism.rotation.y = (aim.x - 0.5) * 0.55;
    prism.rotation.x = (aim.y - 0.5) * 0.32;
    camera.position.x = (aim.x - 0.5) * 0.4;
    camera.position.y = (0.5 - aim.y) * 0.28 + 0.08;
    camera.lookAt(1.05, 0, 0);
    drawLight();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    aim.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    aim.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    idle = 0;
  };

  stage.addEventListener('pointermove', onMove);
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return () => {
    running = false;
    stage.removeEventListener('pointermove', onMove);
    window.removeEventListener('resize', resize);
    geo.dispose();
    glass.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
}
