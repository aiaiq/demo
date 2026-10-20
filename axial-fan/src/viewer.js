import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';
import Module from 'manifold-3d';
import { DEFAULTS, buildFan } from './fan.js';
import { DOMAIN_DEFAULTS, buildFlowRegions, simscaleSTL } from './simscale.js';
import { checkMesh, toAsciiSTL, toBinarySTL } from './stl.js';

const wasm = await Module();
wasm.setup();

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(matchMedia('(prefers-color-scheme: dark)').matches ? 0x15191c : 0xe9edf0);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 1, 20000);
camera.up.set(0, 1, 0);
camera.position.set(-750, 420, -1250); // inlet side (-Z), like a catalogue photo
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(-1, -2, 3);
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x445566, 0.6));
const axes = new THREE.AxesHelper(150);
scene.add(axes);

const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // keeps y ≥ 0
const mat = (color, metalness, roughness, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, side: THREE.DoubleSide, ...extra });
const materials = {
  housing: mat(0x6f8a99, 0.55, 0.45),
  motor: mat(0x2b2e31, 0.4, 0.5),
  rotor: mat(0x151617, 0.3, 0.45),
  mrfZone: mat(0xff8a1f, 0, 1, { transparent: true, opacity: 0.18, depthWrite: false }),
};

const meshes = {};
const rotorGroup = new THREE.Group();
scene.add(rotorGroup);

// manifold → THREE geometry with normals split at sharp (> 40°) edges
function toGeometry(m) {
  const mesh = m.calculateNormals(0, 40).getMesh();
  const n = mesh.numProp;
  const pos = new Float32Array((mesh.vertProperties.length / n) * 3);
  const nor = new Float32Array(pos.length);
  for (let i = 0, j = 0; i < mesh.vertProperties.length; i += n, j += 3) {
    pos.set(mesh.vertProperties.subarray(i, i + 3), j);
    nor.set(mesh.vertProperties.subarray(i + 3, i + 6), j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  return g;
}

// ---------- state ----------
const params = { ...DEFAULTS };
const view = { housing: true, motor: true, rotor: true, mrfZone: false, section: false, spin: false, rpm: 30, wireframe: false };
const exportOpts = { units: 'mm', ...DOMAIN_DEFAULTS };
let fan = null;

const statsEl = document.getElementById('stats');
const busyEl = document.getElementById('busy');

function rebuild() {
  busyEl.style.display = 'grid';
  // let the overlay paint before the (synchronous) CSG work
  requestAnimationFrame(() => setTimeout(() => {
    try {
      const next = buildFan(wasm, params);
      if (fan) for (const m of Object.values(fan.parts)) m.delete();
      fan = next;
      for (const key of ['housing', 'motor', 'rotor', 'mrfZone']) {
        meshes[key]?.geometry.dispose();
        meshes[key]?.removeFromParent();
        const obj = new THREE.Mesh(toGeometry(fan.parts[key]), materials[key]);
        meshes[key] = obj;
        (key === 'rotor' ? rotorGroup : scene).add(obj);
      }
      applyView();
      showStats();
    } catch (err) {
      statsEl.innerHTML = `<span class="bad">Lỗi dựng hình: ${err.message}</span>`;
      console.error(err);
    } finally {
      busyEl.style.display = 'none';
    }
  }, 0));
}

function showStats() {
  const { derived: d, parts } = fan;
  const rows = ['rotor', 'stator', 'assembly', 'mrfZone'].map((k) => {
    const c = checkMesh(parts[k].getMesh());
    const good = c.watertight && parts[k].status() === 'NoError';
    return `<tr><td>${k}</td><td class="${good ? 'ok' : 'bad'}">${good ? '✔ kín nước' : '✘ lỗi'}</td><td>${c.triangles.toLocaleString()} tam giác</td></tr>`;
  });
  const overlap = parts.rotor.intersect(parts.stator);
  const clash = overlap.volume();
  overlap.delete();
  statsEl.innerHTML = `<table>${rows.join('')}</table>
    <div>Khe hở đầu cánh: <b>${(d.ductR - d.tipR).toFixed(1)} mm</b> · rotor ∩ stator:
    <b class="${clash === 0 ? 'ok' : 'bad'}">${clash.toFixed(2)} mm³</b></div>
    <div>Trục quay Z, ω &gt; 0 (quy tắc bàn tay phải) → gió thổi về +Z. MRF zone: R=${d.mrfR.toFixed(1)}, z∈[${d.mrfZ0.toFixed(1)}, ${d.mrfZ1.toFixed(1)}] mm.</div>`;
}

function applyView() {
  for (const key of ['housing', 'motor', 'rotor', 'mrfZone']) if (meshes[key]) meshes[key].visible = view[key];
  for (const m of Object.values(materials)) {
    m.clippingPlanes = view.section ? [clip] : [];
    m.wireframe = view.wireframe && m !== materials.mrfZone;
    m.needsUpdate = true;
  }
}

// ---------- export ----------
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const scale = () => (exportOpts.units === 'm' ? 0.001 : 1);
const exportBody = (key, base) => () =>
  download(toBinarySTL(fan.parts[key].getMesh(), { scale: scale(), name: base }), `${base}_${exportOpts.units}.stl`, 'model/stl');
function exportRegions(layout, base) {
  const { units, ...domain } = exportOpts;
  const regions = buildFlowRegions(wasm, fan, domain);
  download(simscaleSTL(regions, layout, { scale: scale() }), `${base}_${units}.stl`, 'model/stl');
  for (const key of ['zone', 'flowRegion', 'flowStatic', 'flowRotating']) regions[key].delete();
}
const exportActions = {
  rotor: exportBody('rotor', 'fan_rotor'),
  stator: exportBody('stator', 'fan_stator'),
  assembly: exportBody('assembly', 'fan_assembly'),
  mrfZone: exportBody('mrfZone', 'fan_mrf_zone'),
  // Fluid volumes, one closed solid block each — the SimScale MRF input.
  mrfPackage: () => exportRegions('overlap', 'simscale_mrf'),
  mrfConformal: () => exportRegions('conformal', 'simscale_mrf_conformal'),
  partsPackage() {
    const named = [['rotor', 'rotor'], ['stator', 'stator'], ['mrf_zone', 'mrfZone']]
      .map(([name, key]) => [name, fan.parts[key].getMesh()]);
    download(toAsciiSTL(named, { scale: scale() }), `simscale_parts_${exportOpts.units}.stl`, 'model/stl');
  },
  params() {
    download(JSON.stringify({ units: 'mm', params: fan.params, derived: fan.derived }, null, 2), 'fan_params.json', 'application/json');
  },
};

// ---------- GUI ----------
const gui = new GUI({ title: 'Quạt hướng trục' });
let debounce;
const onParam = () => { clearTimeout(debounce); debounce = setTimeout(rebuild, 250); };
const folder = (title, spec) => {
  const f = gui.addFolder(title);
  for (const [key, label, min, max, step] of spec) {
    (typeof params[key] === 'boolean' ? f.add(params, key) : f.add(params, key, min, max, step)).name(label).onChange(onParam);
  }
  f.close();
  return f;
};
folder('Vỏ (housing)', [
  ['ductInnerDiameter', 'Ø trong ống (mm)', 250, 1000, 5],
  ['ductWall', 'Dày vỏ (mm)', 1, 6, 0.5],
  ['housingLength', 'Dài vỏ (mm)', 120, 400, 5],
  ['flangeOuterDiameter', 'Ø ngoài bích (mm)', 300, 1200, 5],
  ['flangeThickness', 'Dày bích (mm)', 1.5, 10, 0.5],
  ['boltHoles', 'Số lỗ bulông', 0, 24, 1],
  ['boltHoleDiameter', 'Ø lỗ bulông (mm)', 6, 20, 1],
  ['boltCircleDiameter', 'Ø vòng lỗ (mm)', 280, 1150, 5],
  ['terminalBox', 'Hộp điện'],
]);
folder('Cánh (rotor)', [
  ['bladeCount', 'Số cánh', 2, 12, 1],
  ['tipClearance', 'Khe hở đầu cánh (mm)', 1, 20, 0.5],
  ['hubDiameter', 'Ø bầu (mm)', 60, 400, 2],
  ['hubLength', 'Dài bầu (mm)', 40, 200, 2],
  ['rootChord', 'Dây cung gốc (mm)', 30, 300, 1],
  ['tipChord', 'Dây cung đầu (mm)', 30, 400, 1],
  ['rootPitchDeg', 'Góc đặt gốc (°)', 10, 60, 0.5],
  ['tipPitchDeg', 'Góc đặt đầu (°)', 5, 50, 0.5],
  ['sweepDeg', 'Góc vuốt (°)', -40, 40, 1],
  ['bladeThickness', 'Dày cánh (mm)', 1, 8, 0.25],
  ['camber', 'Độ cong / dây cung', 0, 0.12, 0.005],
]);
folder('Motor & thanh giằng', [
  ['motorDiameter', 'Ø motor sau (mm)', 40, 300, 2],
  ['motorLength', 'Dài motor sau (mm)', 10, 150, 1],
  ['rotorStatorGap', 'Khe rotor–stator (mm)', 2, 20, 0.5],
  ['strutCount', 'Số thanh giằng', 3, 8, 1],
  ['strutDiameter', 'Ø thanh giằng (mm)', 6, 30, 1],
]);
folder('Độ mịn lưới STL', [
  ['circularSegments', 'Số đoạn tròn', 48, 360, 8],
  ['bladeChordDivisions', 'Chia dây cung', 12, 120, 2],
  ['bladeSpanDivisions', 'Chia sải cánh', 12, 120, 2],
]);

const fv = gui.addFolder('Hiển thị');
fv.add(view, 'housing').name('Vỏ').onChange(applyView);
fv.add(view, 'motor').name('Motor + giằng').onChange(applyView);
fv.add(view, 'rotor').name('Rotor').onChange(applyView);
fv.add(view, 'mrfZone').name('Vùng MRF').onChange(applyView);
fv.add(view, 'section').name('Mặt cắt Y=0').onChange(applyView);
fv.add(view, 'wireframe').name('Lưới tam giác').onChange(applyView);
fv.add(view, 'spin').name('Quay rotor');
fv.add(view, 'rpm', 1, 120, 1).name('Tốc độ xem (rpm)');

const fe = gui.addFolder('Xuất STL cho SimScale');
fe.add(exportOpts, 'units', ['mm', 'm']).name('Đơn vị');
fe.add(exportOpts, 'mode', { 'Ống gió (ducted)': 'ducted', 'Không gian tự do': 'free' }).name('Miền tính');
fe.add(exportOpts, 'domainRadius', 400, 3000, 10).name('Miền tính: bán kính (mm, tự do)');
fe.add(exportOpts, 'upstream', 300, 5000, 10).name('Miền tính: phía hút (mm)');
fe.add(exportOpts, 'downstream', 300, 10000, 10).name('Miền tính: phía đẩy (mm)');
fe.add(exportActions, 'mrfPackage').name('⬇ SimScale MRF (.stl)');
fe.add(exportActions, 'mrfConformal').name('⬇ SimScale MRF dự phòng (.stl)');
fe.add(exportActions, 'partsPackage').name('⬇ Chi tiết rắn (.stl)');
fe.add(exportActions, 'assembly').name('⬇ Cả quạt (1 khối)');
fe.add(exportActions, 'rotor').name('⬇ Rotor');
fe.add(exportActions, 'stator').name('⬇ Stator (vỏ+motor)');
fe.add(exportActions, 'mrfZone').name('⬇ Vùng MRF');
fe.add(exportActions, 'params').name('⬇ Thông số JSON');
gui.add({ reset() { Object.assign(params, DEFAULTS); gui.controllersRecursive().forEach((c) => c.updateDisplay()); rebuild(); } }, 'reset').name('Khôi phục mặc định');

// ---------- loop ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((t) => {
  timer.update(t);
  const dt = timer.getDelta();
  if (view.spin) rotorGroup.rotation.z += (view.rpm / 60) * 2 * Math.PI * dt;
  controls.update();
  renderer.render(scene, camera);
});

rebuild();
window.__fan = () => fan; // for debugging / automated checks
window.__viewer = { camera, controls, view, applyView };
