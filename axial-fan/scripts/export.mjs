// Builds the fan, validates every body and writes SimScale-ready STL files.
//   node scripts/export.mjs [--units mm|m] [--out export] [--param value ...]
// Any DEFAULTS / DOMAIN_DEFAULTS key can be overridden, e.g. --bladeCount 7 --domainRadius 1200
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import Module from 'manifold-3d';
import { DEFAULTS, buildFan } from '../src/fan.js';
import { DOMAIN_DEFAULTS, buildFlowRegions, conformalFaces, overlapFaces, simscaleZip } from '../src/simscale.js';
import { checkMesh, parseBinarySTL, toAsciiSTL, toBinarySTL } from '../src/stl.js';
import { makeZip } from '../src/zip.js';

const args = process.argv.slice(2);
const opts = { units: 'mm', out: 'export' };
const params = {};
const domain = {};
for (let i = 0; i < args.length; i += 2) {
  const key = args[i].replace(/^--/, '');
  const val = args[i + 1];
  if (key in opts) opts[key] = val;
  else if (key in DEFAULTS) params[key] = typeof DEFAULTS[key] === 'boolean' ? val === 'true' : Number(val);
  else if (key in DOMAIN_DEFAULTS) domain[key] = typeof DOMAIN_DEFAULTS[key] === 'string' ? val : Number(val);
  else throw new Error(`Unknown option --${key}`);
}
const scale = { mm: 1, m: 0.001 }[opts.units];
if (!scale) throw new Error('--units must be mm or m');

const wasm = await Module();
wasm.setup();
const fan = buildFan(wasm, params);
const { params: p, derived: d, parts } = fan;

const files = {
  rotor: 'fan_rotor',
  stator: 'fan_stator',
  assembly: 'fan_assembly',
  mrfZone: 'fan_mrf_zone',
};

mkdirSync(opts.out, { recursive: true });
const report = { units: opts.units, axis: 'Z', params: p, derived: d, bodies: {}, checks: {} };
const meshes = {};
let ok = true;

for (const [key, base] of Object.entries(files)) {
  const m = parts[key];
  const mesh = m.getMesh();
  meshes[key] = mesh;
  const check = checkMesh(mesh);
  const bb = m.boundingBox();
  const status = m.status();
  report.bodies[base] = {
    status,
    genus: m.genus(),
    volume_mm3: +m.volume().toFixed(1),
    area_mm2: +m.surfaceArea().toFixed(1),
    bbox_mm: { min: bb.min.map((x) => +x.toFixed(3)), max: bb.max.map((x) => +x.toFixed(3)) },
    ...check,
  };
  const bytes = toBinarySTL(mesh, { scale, name: base });
  writeFileSync(join(opts.out, `${base}.stl`), bytes);
  const fileCheck = checkMesh(parseBinarySTL(bytes));
  report.bodies[base].stlFileWatertight = fileCheck.watertight;
  ok &&= status === 'NoError' && check.watertight && fileCheck.watertight && m.volume() > 0;
}

// SimScale ZIP of the solid parts: one STL file (= one body) per part.
writeFileSync(join(opts.out, `simscale_parts_${opts.units}.zip`), makeZip(
  [['rotor', 'rotor'], ['stator', 'stator'], ['mrf_zone', 'mrfZone']]
    .map(([name, key]) => [`${name}.stl`, toAsciiSTL([[name, meshes[key]]], { scale })]),
  { deflate: deflateRawSync },
));

// SimScale ZIPs of fluid volumes with named faces: the documented
// overlapping-zone layout (recommended) and the conformal fallback.
const regions = buildFlowRegions(wasm, fan, domain);
const faces = { ...overlapFaces(regions), ...conformalFaces(regions) };
const zip = (name, bodies) => writeFileSync(join(opts.out, `${name}_${opts.units}.zip`), simscaleZip(
  fan, Object.fromEntries(bodies.map((b) => [b, faces[b]])), { scale, units: opts.units, deflate: deflateRawSync }));
zip('simscale_mrf', ['flow_region', 'rotating_zone']);
zip('simscale_mrf_conformal', ['flow_static', 'flow_rotating']);
report.domain = regions.options;
report.flowRegions = {};
for (const [name, m] of [['flow_region', regions.flowRegion], ['flow_static', regions.flowStatic], ['flow_rotating', regions.flowRotating]]) {
  const check = checkMesh(m.getMesh());
  // decompose() returns shells; cavities (the fan's walls) come back as
  // negative-volume shells, so only positive shells are separate volumes.
  const pieces = m.decompose().filter((x) => x.volume() > 0);
  report.flowRegions[name] = {
    status: m.status(),
    connectedVolumes: pieces.length,
    volume_mm3: +m.volume().toFixed(1),
    faces: Object.fromEntries(faces[name].map(([f, mesh]) => [f, mesh.triVerts.length / 3])),
    ...check,
  };
  ok &&= m.status() === 'NoError' && check.watertight && pieces.length === 1;
}
// The interface must be the identical triangle set seen from both regions.
const ifaceKey = (mesh) => {
  const { vertProperties: v, triVerts: t, numProp: n } = mesh;
  const tris = [];
  for (let i = 0; i < t.length; i += 3) {
    tris.push([t[i], t[i + 1], t[i + 2]].map((k) => [0, 1, 2].map((c) => v[k * n + c].toFixed(4)).join(',')).sort().join('|'));
  }
  return tris.sort().join('\n');
};
const iface = (name) => faces[name].find(([f]) => f === 'mrf_interface')[1];
report.checks_interface_conformal = ifaceKey(iface('flow_static')) === ifaceKey(iface('flow_rotating'));
ok &&= report.checks_interface_conformal;

// Geometric consistency checks between bodies.
const overlap = (a, b) => a.intersect(b).volume();
const rotorBB = parts.rotor.boundingBox();
const tipR = Math.max(...[0, 1].flatMap((i) => [Math.abs(rotorBB.min[i]), rotorBB.max[i]]));
report.checks = {
  rotor_stator_overlap_mm3: +overlap(parts.rotor, parts.stator).toFixed(6),
  mrfZone_stator_overlap_mm3: +overlap(parts.mrfZone, parts.stator).toFixed(6),
  rotor_outside_mrfZone_mm3: +parts.rotor.subtract(parts.mrfZone).volume().toFixed(6),
  // the overlapping layout needs the zone fully inside fluid + rotor
  mrfZone_outside_flow_mm3: +parts.mrfZone.subtract(regions.flowRegion.add(parts.rotor)).volume().toFixed(6),
  rotor_tip_radius_mm: +tipR.toFixed(3),
  tip_clearance_mm: +(d.ductR - tipR).toFixed(3),
};
ok &&= report.checks.rotor_stator_overlap_mm3 === 0
  && report.checks.mrfZone_stator_overlap_mm3 === 0
  && report.checks.rotor_outside_mrfZone_mm3 === 0
  && report.checks.mrfZone_outside_flow_mm3 === 0;

report.valid = ok;
writeFileSync(join(opts.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');

console.table(Object.fromEntries(Object.entries(report.bodies).map(([k, b]) => [k, {
  status: b.status, watertight: b.watertight, 'file watertight': b.stlFileWatertight, triangles: b.triangles, genus: b.genus, 'volume (mm³)': b.volume_mm3,
}])));
console.table(report.checks);
console.table(Object.fromEntries(Object.entries(report.flowRegions).map(([k, r]) => [k, {
  watertight: r.watertight, volumes: r.connectedVolumes, triangles: r.triangles, faces: Object.keys(r.faces).join(' '),
}])));
console.log('MRF interface conformal:', report.checks_interface_conformal);
console.log(ok ? `OK → ${opts.out}/ (units: ${opts.units})` : 'VALIDATION FAILED');
process.exit(ok ? 0 : 1);
