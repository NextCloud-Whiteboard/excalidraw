import ClipperLib from "clipper-lib";

import type { VrijTraceSide } from "@excalidraw/element/types";

export type Pt = { x: number; y: number };
/** rings, even-odd (holes included) */
export type Polygons = Pt[][];
/** metres, in the PDF page's own frame */
export type GeoNode = { id: string; x: number; y: number };
export type GeoSegment = { id: string; a: string; b: string; widthM: number };
export type NetworkGeometry = { nodes: GeoNode[]; segments: GeoSegment[] };
export type ZoneSettings = {
  redSide: VrijTraceSide;
  workWidthM: number;
  workSide: VrijTraceSide;
};
export type Zones = {
  trench: Polygons;
  red: Polygons;
  work: Polygons;
  overlap: Polygons;
};
export type TreeCheck = {
  inside: boolean;
  distanceM: number | null;
  pass: boolean | null;
  red: boolean | null;
  work: boolean | null;
};

/** v8.2: the damage-prevention zone is always 2.00 m beyond the trench edge */
export const RED_ZONE_M = 2;

// Clipper works on integers: 1 unit = 1 mm. Arc tolerance 1 cm.
const SCALE = 1000;
const ARC_TOLERANCE = 10;
/** metres; far beyond any real plan, far inside clipper-lib's integer range */
const MAX_COORD_M = 1e9;

// clipper-lib reports errors with window.alert, which on a shared board
// would block every viewer's tab on every frame — throw instead
(ClipperLib as unknown as { Error: (message: string) => void }).Error = (
  message,
) => {
  throw new Error(message);
};

const EMPTY_ZONES: Zones = { trench: [], red: [], work: [], overlap: [] };

type CPath = { X: number; Y: number }[];
const toC = (p: Pt) => ({
  X: Math.round(p.x * SCALE),
  Y: Math.round(p.y * SCALE),
});
const fromC = (paths: CPath[]): Polygons =>
  paths.map((path) => path.map((q) => ({ x: q.X / SCALE, y: q.Y / SCALE })));

const clip = (subject: CPath[], clipPaths: CPath[], type: number): CPath[] => {
  const c = new ClipperLib.Clipper();
  c.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  if (clipPaths.length) {
    c.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
  }
  const out: CPath[] = [];
  c.Execute(
    type,
    out,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );
  return out;
};
const union = (paths: CPath[]) => clip(paths, [], ClipperLib.ClipType.ctUnion);

const capsule = (a: Pt, b: Pt, r: number): CPath[] => {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE);
  co.AddPath(
    [toC(a), toC(b)],
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etOpenRound,
  );
  const out: CPath[] = [];
  co.Execute(out, r * SCALE);
  return out;
};

/** The side of a→b to keep: "links" is +n with n = (uy, -ux) (y-down frame). */
const sideStrip = (
  a: Pt,
  b: Pt,
  r: number,
  side: "links" | "rechts",
): CPath[] => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const s = side === "links" ? 1 : -1;
  const nx = uy * s;
  const ny = -ux * s;
  const e = 2 * r;
  const p1 = { x: a.x - ux * e, y: a.y - uy * e };
  const p2 = { x: b.x + ux * e, y: b.y + uy * e };
  return [
    [
      p1,
      p2,
      { x: p2.x + nx * e, y: p2.y + ny * e },
      { x: p1.x + nx * e, y: p1.y + ny * e },
    ].map(toC),
  ];
};

const ends = (g: NetworkGeometry) => {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return g.segments
    .map((s) => ({ s, a: byId.get(s.a), b: byId.get(s.b) }))
    .filter(
      (x): x is { s: GeoSegment; a: GeoNode; b: GeoNode } => !!x.a && !!x.b,
    );
};

const buffered = (
  g: NetworkGeometry,
  extraM: number,
  side: VrijTraceSide,
): CPath[] => {
  const parts: CPath[] = [];
  for (const { s, a, b } of ends(g)) {
    const r = s.widthM / 2 + extraM;
    const cap = capsule(a, b, r);
    parts.push(
      ...(side === "beide"
        ? cap
        : clip(
            cap,
            sideStrip(a, b, r, side),
            ClipperLib.ClipType.ctIntersection,
          )),
    );
  }
  return parts.length ? union(parts) : [];
};

/** zones of a network; none when its coordinates are unusable (shared data) */
export const computeZones = (g: NetworkGeometry, s: ZoneSettings): Zones => {
  const usable = g.nodes.every(
    (n) => Math.abs(n.x) <= MAX_COORD_M && Math.abs(n.y) <= MAX_COORD_M,
  );
  if (!usable) {
    return EMPTY_ZONES;
  }
  try {
    return zonesOf(g, s);
  } catch {
    return EMPTY_ZONES;
  }
};

const zonesOf = (g: NetworkGeometry, s: ZoneSettings): Zones => {
  const trench = buffered(g, 0, "beide");
  const red = clip(
    buffered(g, RED_ZONE_M, s.redSide),
    trench,
    ClipperLib.ClipType.ctDifference,
  );
  const work = clip(
    buffered(g, s.workWidthM, s.workSide),
    trench,
    ClipperLib.ClipType.ctDifference,
  );
  const overlap =
    red.length && work.length
      ? clip(red, work, ClipperLib.ClipType.ctIntersection)
      : [];
  return {
    trench: fromC(trench),
    red: fromC(red),
    work: fromC(work),
    overlap: fromC(overlap),
  };
};

export const pointInPolygons = (p: Pt, polys: Polygons): boolean => {
  let inside = false;
  for (const ring of polys) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      const aAbove = a.y > p.y;
      const bAbove = b.y > p.y;
      if (
        aAbove !== bAbove &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      ) {
        inside = !inside;
      }
    }
  }
  return inside;
};

const pointSegment = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** distance to the nearest polygon edge; Infinity without polygons */
export const distanceToPolygons = (p: Pt, polys: Polygons): number => {
  let best = Infinity;
  for (const ring of polys) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      best = Math.min(best, pointSegment(p, ring[j], ring[i]));
    }
  }
  return best;
};

/**
 * v8.2 tree check. The measured distance never depends on the minimum
 * (req. 11); zones are reported only while they are active.
 */
export const checkTree = (
  p: Pt,
  zones: Zones,
  active: boolean,
  treeMinM: number,
): TreeCheck => {
  if (!zones.trench.length) {
    return {
      inside: false,
      distanceM: null,
      pass: null,
      red: null,
      work: null,
    };
  }
  const inside = pointInPolygons(p, zones.trench);
  const distanceM = distanceToPolygons(p, zones.trench);
  return {
    inside,
    distanceM,
    pass: !inside && distanceM + 1e-9 >= treeMinM,
    red: active ? pointInPolygons(p, zones.red) : null,
    work: active ? pointInPolygons(p, zones.work) : null,
  };
};

const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
};

/** Geometry + zone settings, in centimetres in the page frame. */
export const fingerprint = (g: NetworkGeometry, s: ZoneSettings): string => {
  const cm = (n: number) => Math.round(n * 100);
  const byId = <T extends { id: string }>(x: T, y: T) =>
    x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  const nodes = [...g.nodes]
    .sort(byId)
    .map((n) => `${n.id}:${cm(n.x)},${cm(n.y)}`)
    .join(";");
  const segs = [...g.segments]
    .sort(byId)
    .map((x) => `${x.id}:${x.a}-${x.b}:${cm(x.widthM)}`)
    .join(";");
  return hash(
    `${nodes}|${segs}|${s.redSide}|${cm(s.workWidthM)}|${s.workSide}`,
  );
};
