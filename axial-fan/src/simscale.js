// Ready-to-mesh fluid regions for a SimScale MRF run.
//
// SimScale imports every `solid <name>` block of an STL file as a separate
// part, so each body below is exactly one closed solid block — that is what
// makes it a volume SimScale can assign materials and rotating zones to.
// Boundary faces (inlet, outlet, walls) come from SimScale's "Facet split"
// on import: the pipe end caps meet the pipe wall at 90° and split off.
//
// "overlap" (SimScale's documented rotating-zone layout, recommended):
//   flow_region   = domain − stator − rotor
//   rotating_zone = plain MRF cylinder overlapping flow_region
// "conformal" (two touching, non-overlapping fluid volumes, fallback):
//   flow_static   = domain − stator − MRF cylinder
//   flow_rotating = MRF cylinder − rotor
//   Both carry the exact same interface triangles.
import { toAsciiSTL } from './stl.js';

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
  const ducted = o.mode === 'ducted';
  const radius = ducted ? fan.derived.ductR : o.domainRadius;
  const domain = Manifold.cylinder(o.upstream + o.downstream, radius, -1, p.circularSegments)
    .translate([0, 0, -o.upstream]);
  // In a ducted domain the housing wall is the domain wall; only the motor and
  // struts (which run 1 mm into the wall) remain as stationary obstacles.
  const stator = ducted ? parts.motor : parts.stator;
  return {
    options: o,
    zoneID: zone.originalID(),
    zone,
    flowRegion: domain.subtract(stator).subtract(parts.rotor),
    flowStatic: domain.subtract(stator).subtract(zone),
    flowRotating: zone.subtract(parts.rotor),
  };
}

export const LAYOUTS = {
  overlap: [['flow_region', 'flowRegion'], ['rotating_zone', 'zone']],
  conformal: [['flow_static', 'flowStatic'], ['flow_rotating', 'flowRotating']],
};

// One ASCII STL file, one closed solid block per body.
export function simscaleSTL(regions, layout, { scale = 1 } = {}) {
  return toAsciiSTL(LAYOUTS[layout].map(([name, key]) => [name, regions[key].getMesh()]), { scale });
}

// Triangles of a mesh that came from the MRF cylinder, as sorted position keys
// (used to verify that the conformal interface is identical on both sides).
export function interfaceKey(regions, key) {
  const { runIndex, runOriginalID, triVerts: t, vertProperties: v, numProp: n } = regions[key].getMesh();
  const tris = [];
  for (let r = 0; r < runOriginalID.length; r++) {
    if (runOriginalID[r] !== regions.zoneID) continue;
    for (let i = runIndex[r]; i < runIndex[r + 1]; i += 3) {
      tris.push([t[i], t[i + 1], t[i + 2]]
        .map((k) => [0, 1, 2].map((c) => v[k * n + c].toFixed(4)).join(',')).sort().join('|'));
    }
  }
  return tris.sort().join('\n');
}
