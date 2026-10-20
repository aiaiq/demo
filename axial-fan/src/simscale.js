// Ready-to-mesh fluid regions for a SimScale MRF run.
//
// SimScale imports a ZIP of STL files as one geometry: every file becomes a
// solid (body) and every `solid <name>` block inside a file becomes a named
// face. MRF rotating zones must be assigned to a volume, so we hand SimScale
// the two fluid volumes directly instead of the fan's metal:
//   flow_static.stl   = domain − stator − MRF cylinder
//     faces: inlet, outlet, farfield, stator_walls, mrf_interface
//   flow_rotating.stl = MRF cylinder − rotor
//     faces: mrf_interface, rotor_walls
// Both share the exact same mrf_interface triangles (conformal interface).
import { toAsciiSTL } from './stl.js';
import { makeZip } from './zip.js';

export const DOMAIN_DEFAULTS = {
  domainRadius: 900, // mm, free-air test chamber around the fan
  upstream: 1500, // mm from blade mid-plane to inlet face (−Z)
  downstream: 3000, // mm from blade mid-plane to outlet face (+Z)
};

export function buildFlowRegions(wasm, fan, opts = {}) {
  const o = { ...DOMAIN_DEFAULTS, ...opts };
  const { Manifold } = wasm;
  const { parts, params: p } = fan;
  const zone = parts.mrfZone.asOriginal();
  const domain = Manifold.cylinder(o.upstream + o.downstream, o.domainRadius, -1, p.circularSegments)
    .translate([0, 0, -o.upstream])
    .asOriginal();
  return {
    options: o,
    zoneID: zone.originalID(),
    domainID: domain.originalID(),
    flowStatic: domain.subtract(parts.stator).subtract(zone),
    flowRotating: zone.subtract(parts.rotor),
  };
}

// Split a mesh into named face groups by which input body each triangle came from.
function splitFaces(mesh, classify) {
  const groups = new Map();
  const { runIndex, runOriginalID, triVerts: t, vertProperties: v, numProp: n } = mesh;
  for (let r = 0; r < runOriginalID.length; r++) {
    for (let i = runIndex[r]; i < runIndex[r + 1]; i += 3) {
      const a = t[i] * n, b = t[i + 1] * n, c = t[i + 2] * n;
      // z-component of the face normal, for splitting the domain's caps
      const nz = (v[b] - v[a]) * (v[c + 1] - v[a + 1]) - (v[b + 1] - v[a + 1]) * (v[c] - v[a]);
      const len = Math.hypot(
        (v[b + 1] - v[a + 1]) * (v[c + 2] - v[a + 2]) - (v[b + 2] - v[a + 2]) * (v[c + 1] - v[a + 1]),
        (v[b + 2] - v[a + 2]) * (v[c] - v[a]) - (v[b] - v[a]) * (v[c + 2] - v[a + 2]),
        nz,
      ) || 1;
      const name = classify(runOriginalID[r], nz / len);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(t[i], t[i + 1], t[i + 2]);
    }
  }
  return [...groups].map(([name, tris]) => [name, { vertProperties: v, numProp: n, triVerts: new Uint32Array(tris) }]);
}

export function flowRegionFaces(regions) {
  const { zoneID, domainID } = regions;
  const staticFaces = splitFaces(regions.flowStatic.getMesh(), (id, nz) => {
    if (id === zoneID) return 'mrf_interface';
    if (id === domainID) return nz < -0.99 ? 'inlet' : nz > 0.99 ? 'outlet' : 'farfield';
    return 'stator_walls';
  });
  const rotatingFaces = splitFaces(regions.flowRotating.getMesh(), (id) =>
    (id === zoneID ? 'mrf_interface' : 'rotor_walls'));
  return { flow_static: staticFaces, flow_rotating: rotatingFaces };
}

// ZIP of ASCII multi-solid STL files, one per body, for SimScale upload.
export function simscaleZip(fan, faces, { scale = 1, units = 'mm', deflate } = {}) {
  const files = Object.entries(faces).map(([body, named]) => [`${body}.stl`, toAsciiSTL(named, { scale })]);
  const d = fan.derived;
  files.push(['README.txt', [
    `Units: ${units}. Rotation axis: Z through (0,0,0).`,
    'Positive omega about +Z (right-hand rule) blows air toward +Z (inlet at -Z).',
    `MRF zone: cylinder R=${d.mrfR} mm, z from ${d.mrfZ0} to ${d.mrfZ1} mm.`,
    'Bodies: flow_static (stationary fluid), flow_rotating (MRF fluid).',
    'Faces: inlet, outlet, farfield, stator_walls, rotor_walls, mrf_interface.',
    'Upload with "Facet split" OFF so each named solid stays one face.',
    '',
  ].join('\n')]);
  return makeZip(files, { deflate });
}
