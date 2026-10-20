// Ready-to-mesh fluid regions for a SimScale MRF run.
//
// SimScale imports a ZIP of STL files as one geometry: every file becomes a
// solid (body) and every `solid <name>` block inside a file becomes a named
// face. MRF rotating zones must be assigned to a volume, so we hand SimScale
// fluid volumes directly instead of the fan's metal. Two layouts:
//
// "overlap" (SimScale's documented rotating-zone layout, recommended):
//   flow_region.stl   = domain − stator − rotor
//     faces: inlet, outlet, duct_walls | farfield, stator_walls, rotor_walls
//   rotating_zone.stl = plain MRF cylinder overlapping flow_region
//     face:  rotating_zone
// "conformal" (two touching, non-overlapping fluid volumes, fallback):
//   flow_static.stl   = domain − stator − MRF cylinder
//     faces: inlet, outlet, duct_walls | farfield, stator_walls, mrf_interface
//   flow_rotating.stl = MRF cylinder − rotor
//     faces: mrf_interface, rotor_walls
//   Both share the exact same mrf_interface triangles.
import { toAsciiSTL } from './stl.js';
import { makeZip } from './zip.js';

export const DOMAIN_DEFAULTS = {
  // 'ducted': inlet and outlet pipes with the fan's own bore (the housing wall
  //           becomes the pipe wall) — the flanged duct-fan test, valid for a
  //           full fan curve.
  // 'free':   large cylinder around the whole fan — free delivery only, since
  //           at Δp > 0 air recirculates around the outside of the housing.
  mode: 'ducted',
  domainRadius: 900, // mm, 'free' mode only
  upstream: 1500, // mm from blade mid-plane to inlet face (−Z)
  downstream: 3000, // mm from blade mid-plane to outlet face (+Z)
};

export function buildFlowRegions(wasm, fan, opts = {}) {
  const o = { ...DOMAIN_DEFAULTS, ...opts };
  const { Manifold } = wasm;
  const { parts, params: p } = fan;
  const zone = parts.mrfZone.asOriginal();
  const rotor = parts.rotor.asOriginal();
  const ducted = o.mode === 'ducted';
  const radius = ducted ? fan.derived.ductR : o.domainRadius;
  const domain = Manifold.cylinder(o.upstream + o.downstream, radius, -1, p.circularSegments)
    .translate([0, 0, -o.upstream])
    .asOriginal();
  // In a ducted domain the housing wall is the domain wall; only the motor and
  // struts (which run 1 mm into the wall) remain as stationary obstacles.
  const stator = ducted ? parts.motor : parts.stator;
  return {
    options: o,
    sideName: ducted ? 'duct_walls' : 'farfield',
    zoneID: zone.originalID(),
    domainID: domain.originalID(),
    rotorID: rotor.originalID(),
    zone,
    flowRegion: domain.subtract(stator).subtract(rotor),
    flowStatic: domain.subtract(stator).subtract(zone),
    flowRotating: zone.subtract(rotor),
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

const domainFace = (nz, side) => (nz < -0.99 ? 'inlet' : nz > 0.99 ? 'outlet' : side);

export function overlapFaces(regions) {
  const { domainID, rotorID } = regions;
  const flowFaces = splitFaces(regions.flowRegion.getMesh(), (id, nz) => {
    if (id === domainID) return domainFace(nz, regions.sideName);
    return id === rotorID ? 'rotor_walls' : 'stator_walls';
  });
  return { flow_region: flowFaces, rotating_zone: [['rotating_zone', regions.zone.getMesh()]] };
}

export function conformalFaces(regions) {
  const { zoneID, domainID } = regions;
  const staticFaces = splitFaces(regions.flowStatic.getMesh(), (id, nz) => {
    if (id === zoneID) return 'mrf_interface';
    if (id === domainID) return domainFace(nz, regions.sideName);
    return 'stator_walls';
  });
  const rotatingFaces = splitFaces(regions.flowRotating.getMesh(), (id) =>
    (id === zoneID ? 'mrf_interface' : 'rotor_walls'));
  return { flow_static: staticFaces, flow_rotating: rotatingFaces };
}

// ZIP of ASCII multi-solid STL files, one per body, for SimScale upload.
export function simscaleZip(faces, { scale = 1, deflate } = {}) {
  const files = Object.entries(faces).map(([body, named]) => [`${body}.stl`, toAsciiSTL(named, { scale })]);
  // STL files only: any other file in the archive (e.g. a README) stops
  // SimScale from detecting the format on upload.
  return makeZip(files, { deflate });
}
