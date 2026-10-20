// Parametric axial duct fan (flange-mounted, external-rotor motor, sickle blades).
//
// Every part is built with manifold-3d, so every exported body is a closed,
// oriented 2-manifold (watertight, no self-intersections) — what SimScale needs
// for flow-volume extraction and meshing.
//
// Coordinate system (all lengths in mm):
//   - rotation axis = Z, origin = blade mid-plane on the axis
//   - positive rotation (right-hand rule about +Z) pushes air toward +Z
//     (inlet on -Z side, outlet on +Z side)

export const DEFAULTS = {
  // Housing (duct + two flanges)
  ductInnerDiameter: 500,
  ductWall: 2,
  housingLength: 180,
  flangeOuterDiameter: 600,
  flangeThickness: 3,
  boltHoles: 8,
  boltHoleDiameter: 10,
  boltCircleDiameter: 560,
  terminalBox: true,

  // Rotor (blades + rotating motor casing)
  bladeCount: 5,
  tipClearance: 5,
  hubDiameter: 144,
  hubLength: 90,
  hubBackZ: 40,
  rootChord: 95,
  tipChord: 185,
  rootPitchDeg: 40,
  tipPitchDeg: 20,
  sweepDeg: -15, // >0: tips lead in rotation direction, <0: tips trail (sickle)
  bladeThickness: 3,
  camber: 0.05, // max camber / chord

  // Stator (motor back part + struts)
  motorDiameter: 110,
  motorLength: 40,
  rotorStatorGap: 5,
  strutCount: 4,
  strutDiameter: 12,

  // Tessellation
  circularSegments: 160,
  bladeChordDivisions: 48,
  bladeSpanDivisions: 48,
};

const rad = (d) => (d * Math.PI) / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function derive(p) {
  const ductR = p.ductInnerDiameter / 2;
  const hubR = p.hubDiameter / 2;
  const tipR = ductR - p.tipClearance;
  const hubFrontZ = p.hubBackZ - p.hubLength;
  const statorFrontZ = p.hubBackZ + p.rotorStatorGap;
  const statorBackZ = statorFrontZ + p.motorLength;
  const housingZ0 = -p.housingLength / 2;
  const housingZ1 = p.housingLength / 2;
  return {
    ductR,
    hubR,
    tipR,
    hubFrontZ,
    statorFrontZ,
    statorBackZ,
    housingZ0,
    housingZ1,
    strutZ: (statorFrontZ + statorBackZ) / 2,
    // MRF (rotating) zone: halfway into the tip gap and the rotor/stator gap
    mrfR: (tipR + ductR) / 2,
    mrfZ0: Math.max(housingZ0 + 5, hubFrontZ - 20),
    mrfZ1: (p.hubBackZ + statorFrontZ) / 2,
  };
}

// Closed solid from a polygon in the (r, z) half-plane revolved about Z.
function revolve(wasm, profile, segments) {
  const { Manifold, CrossSection } = wasm;
  return Manifold.revolve(new CrossSection([profile]), segments);
}

// Quarter-circle points from angle a0 to a1 (radians) around (cx, cy).
function arc(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function housing(wasm, p, d) {
  const { Manifold } = wasm;
  const seg = p.circularSegments;
  const Ri = d.ductR;
  const Ro = d.ductR + p.ductWall;
  const Rf = p.flangeOuterDiameter / 2;
  const tf = p.flangeThickness;
  const z0 = d.housingZ0;
  const z1 = d.housingZ1;

  // Duct wall + both flanges as one revolved U-profile.
  let body = revolve(wasm, [
    [Ri, z0], [Rf, z0], [Rf, z0 + tf], [Ro, z0 + tf],
    [Ro, z1 - tf], [Rf, z1 - tf], [Rf, z1], [Ri, z1],
  ], seg);

  if (p.terminalBox) {
    // Box sits on the outside of the duct; its inner face is pushed below the
    // wall and trimmed by the bore below, so it merges without slivers.
    const depth = Math.min(45, Rf - Ro - 2);
    const box = Manifold.cube([depth + 8, 70, 90], true)
      .translate([Ro - 8 + (depth + 8) / 2, 0, (z0 + z1) / 2 + 10])
      .rotate([0, 0, 45]);
    body = body.add(box);
  }

  const holes = [];
  const pcr = p.boltCircleDiameter / 2;
  for (let i = 0; i < p.boltHoles; i++) {
    const a = (2 * Math.PI * (i + 0.5)) / p.boltHoles;
    holes.push(
      Manifold.cylinder(z1 - z0 + 2, p.boltHoleDiameter / 2, -1, 32)
        .translate([pcr * Math.cos(a), pcr * Math.sin(a), z0 - 1]),
    );
  }
  const bore = Manifold.cylinder(z1 - z0 + 2, Ri, -1, seg).translate([0, 0, z0 - 1]);
  return body.subtract(Manifold.union([...holes, bore]));
}

function statorMotor(wasm, p, d) {
  const r = p.motorDiameter / 2;
  const f = 6; // rear edge fillet
  return revolve(wasm, [
    [0, d.statorFrontZ],
    [r, d.statorFrontZ],
    ...arc(r - f, d.statorBackZ - f, f, 0, Math.PI / 2, 8),
    [0, d.statorBackZ],
  ], p.circularSegments);
}

function struts(wasm, p, d) {
  const { Manifold } = wasm;
  const r0 = p.motorDiameter / 4; // start well inside the motor body
  const r1 = d.ductR + p.ductWall / 2; // end inside the duct wall
  const out = [];
  for (let i = 0; i < p.strutCount; i++) {
    const a = 360 * (i / p.strutCount) + 180 / p.strutCount;
    out.push(
      Manifold.cylinder(r1 - r0, p.strutDiameter / 2, -1, 32)
        .rotate([0, 90, 0])
        .translate([r0, 0, d.strutZ])
        .rotate([0, 0, a]),
    );
  }
  return Manifold.union(out);
}

function hub(wasm, p, d) {
  const r = d.hubR;
  const f = 14; // front edge round
  const z0 = d.hubFrontZ;
  return revolve(wasm, [
    [0, z0],
    ...arc(r - f, z0 + f, f, -Math.PI / 2, 0, 12),
    [r, p.hubBackZ],
    [0, p.hubBackZ],
  ], p.circularSegments);
}

// One blade as a structured closed mesh: a cambered, twisted, swept plate
// wrapped onto cylinders r = const (so the tip is an exact cylinder face and
// the tip clearance is uniform).
export function bladeSection(p, d, r) {
  const x = clamp01((r - d.hubR) / (d.tipR - d.hubR));
  return {
    chord: p.rootChord + (p.tipChord - p.rootChord) * Math.pow(x, 0.85),
    pitch: rad(p.rootPitchDeg + (p.tipPitchDeg - p.rootPitchDeg) * x),
    sweep: rad(p.sweepDeg) * x * x,
    thickness: p.bladeThickness * (1 - 0.3 * x),
  };
}

function bladeMesh(wasm, p, d) {
  const { Manifold, Mesh } = wasm;
  const nC = p.bladeChordDivisions;
  const nS = p.bladeSpanDivisions;
  const rRoot = d.hubR - 8; // root buried in the hub so the union is solid
  const ring = 2 * (nC + 1); // points per span station

  const verts = new Float32Array(ring * (nS + 1) * 3);
  let k = 0;
  for (let j = 0; j <= nS; j++) {
    // cluster stations toward the tip, where the geometry changes fastest
    const s = 1 - Math.pow(1 - j / nS, 1.3);
    const r = rRoot + (d.tipR - rRoot) * s;
    const { chord, pitch, sweep, thickness } = bladeSection(p, d, r);
    const cb = Math.cos(pitch);
    const sb = Math.sin(pitch);
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i <= nC; i++) {
        // side 0: pressure side from TE (u=0) to LE (u=1); side 1 back.
        // Cosine spacing refines the leading and trailing edges.
        const ii = side === 0 ? i : nC - i;
        const u = 0.5 - 0.5 * Math.cos((Math.PI * ii) / nC);
        const half = 0.5 * thickness * (0.4 + 0.6 * Math.sqrt(Math.sin(Math.PI * u)));
        const xi = (u - 0.5) * chord; // along chord, + toward leading edge
        const zeta = -4 * p.camber * chord * u * (1 - u) + (side === 0 ? half : -half);
        const a = xi * cb + zeta * sb; // circumferential arc length
        const z = -xi * sb + zeta * cb;
        const phi = a / r + sweep;
        verts[k++] = r * Math.cos(phi);
        verts[k++] = r * Math.sin(phi);
        verts[k++] = z;
      }
    }
  }

  const tris = [];
  const id = (j, m) => j * ring + (m % ring);
  for (let j = 0; j < nS; j++) {
    for (let m = 0; m < ring; m++) {
      const a = id(j, m), b = id(j, m + 1), c = id(j + 1, m + 1), e = id(j + 1, m);
      tris.push(a, b, c, a, c, e);
    }
  }
  // Root and tip caps: pair point i of side 0 with its mirror on side 1.
  for (const j of [0, nS]) {
    for (let i = 0; i < nC; i++) {
      const p0 = id(j, i), p1 = id(j, i + 1);
      const q0 = id(j, ring - 1 - i), q1 = id(j, ring - 2 - i);
      if (j === 0) tris.push(p0, q0, q1, p0, q1, p1);
      else tris.push(p0, p1, q1, p0, q1, q0);
    }
  }

  let triVerts = new Uint32Array(tris);
  let m = Manifold.ofMesh(new Mesh({ numProp: 3, vertProperties: verts, triVerts }));
  if (m.volume() < 0 || m.status() !== 'NoError') {
    // Winding came out inside-out: flip and rebuild.
    for (let t = 0; t < triVerts.length; t += 3) {
      [triVerts[t + 1], triVerts[t + 2]] = [triVerts[t + 2], triVerts[t + 1]];
    }
    m = Manifold.ofMesh(new Mesh({ numProp: 3, vertProperties: verts, triVerts }));
  }
  return m;
}

function rotor(wasm, p, d) {
  const { Manifold } = wasm;
  const blade = bladeMesh(wasm, p, d);
  const parts = [hub(wasm, p, d)];
  for (let i = 0; i < p.bladeCount; i++) parts.push(blade.rotate([0, 0, (360 * i) / p.bladeCount]));
  return Manifold.union(parts);
}

function mrfZone(wasm, p, d) {
  return wasm.Manifold.cylinder(d.mrfZ1 - d.mrfZ0, d.mrfR, -1, p.circularSegments)
    .translate([0, 0, d.mrfZ0]);
}

// Returns every body as a Manifold. Caller owns them (call .delete() when done
// in long-running pages).
export function buildFan(wasm, params = {}) {
  const p = { ...DEFAULTS, ...params };
  const d = derive(p);
  const { Manifold } = wasm;

  const rot = rotor(wasm, p, d);
  const hous = housing(wasm, p, d);
  const motor = Manifold.union([statorMotor(wasm, p, d), struts(wasm, p, d)]);
  const stator = hous.add(motor);
  const zone = mrfZone(wasm, p, d);
  // The shaft only exists in the single-body assembly, tying rotor to stator.
  const shaft = Manifold.cylinder(p.rotorStatorGap + 10, 12, -1, 48)
    .translate([0, 0, p.hubBackZ - 5]);
  const assembly = Manifold.union([rot, stator, shaft]);

  return { params: p, derived: d, parts: { rotor: rot, housing: hous, motor, stator, assembly, mrfZone: zone } };
}
