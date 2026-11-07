import ClipperLib from "clipper-lib";

import type { VrijTraceSide } from "@excalidraw/element/types";

export type Pt = { x: number; y: number };
/** rings, even-odd (holes included) */
export type Polygons = Pt[][];
/** metres, in the PDF page's own frame */
export type GeoNode = { id: string; x: number; y: number };
export type ZoneSettings = {
  redSide: VrijTraceSide;
  workWidthM: number;
  workSide: VrijTraceSide;
};
/**
 * A segment's own zone settings win over the page's (lines carry them). `dir`
 * is its line's overall direction: one-sided zones keep to one side of the
 * whole line, as its edges do; without it the segment's own direction counts.
 */
export type GeoSegment = {
  id: string;
  a: string;
  b: string;
  widthM: number;
  dir?: Pt;
  /** its line's own Minimale afstand for trees; else the page's */
  treeMinM?: number;
} & Partial<ZoneSettings>;
export type NetworkGeometry = { nodes: GeoNode[]; segments: GeoSegment[] };
export type Zones = {
  trench: Polygons;
  red: Polygons;
  work: Polygons;
  overlap: Polygons;
};
export type TreeCheck = {
  inside: boolean;
  distanceM: number | null;
  /** the Minimale afstand of the line that decides */
  minM: number | null;
  pass: boolean | null;
  red: boolean | null;
  work: boolean | null;
};

/** a side of the plan */
export type PlanSide = Exclude<VrijTraceSide, "beide">;

/** the plan direction each side names (y down) */
const PLAN_DIRECTION: Record<PlanSide, Pt> = {
  boven: { x: 0, y: -1 },
  onder: { x: 0, y: 1 },
  links: { x: -1, y: 0 },
  rechts: { x: 1, y: 0 },
};

/** within 10° of parallel to a side's direction, a line has no such side */
const DEAD_ZONE = Math.sin((10 * Math.PI) / 180);

/** the fixed side such a line takes: links = onder, rechts = boven, boven = rechts, onder = links */
const FALLBACK: Record<PlanSide, PlanSide> = {
  links: "onder",
  rechts: "boven",
  boven: "rechts",
  onder: "links",
};

/**
 * Whether the left-hand side of a line running along `dir` (normal
 * n = (dy, -dx), y down) faces the given side of the plan, for any slope and
 * either drawing direction. A line (nearly) parallel to that side's direction
 * takes a fixed side, so neither the drawing direction nor a wobble picks it.
 */
export const leftFaces = (dir: Pt, side: PlanSide): boolean => {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const n = { x: dir.y / len, y: -dir.x / len };
  const facing = (s: PlanSide) =>
    n.x * PLAN_DIRECTION[s].x + n.y * PLAN_DIRECTION[s].y;
  return (
    facing(Math.abs(facing(side)) < DEAD_ZONE ? FALLBACK[side] : side) >= 0
  );
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

/** The side of a→b to keep: 1 is its left-hand side, +n with n = (uy, -ux) (y down). */
const sideStrip = (a: Pt, b: Pt, r: number, s: 1 | -1): CPath[] => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
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
  extraM: (s: GeoSegment) => number,
  sideOf: (s: GeoSegment) => VrijTraceSide,
): CPath[] => {
  const parts: CPath[] = [];
  for (const { s, a, b } of ends(g)) {
    const r = s.widthM / 2 + extraM(s);
    const side = sideOf(s);
    const cap = capsule(a, b, r);
    parts.push(
      ...(side === "beide"
        ? cap
        : clip(
            cap,
            sideStrip(
              a,
              b,
              r,
              leftFaces(s.dir ?? { x: b.x - a.x, y: b.y - a.y }, side) ? 1 : -1,
            ),
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
  const trench = buffered(
    g,
    () => 0,
    () => "beide",
  );
  const red = clip(
    buffered(
      g,
      () => RED_ZONE_M,
      (seg) => seg.redSide ?? s.redSide,
    ),
    trench,
    ClipperLib.ClipType.ctDifference,
  );
  const work = clip(
    buffered(
      g,
      (seg) => seg.workWidthM ?? s.workWidthM,
      (seg) => seg.workSide ?? s.workSide,
    ),
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

/** the ring around p (radius r) reaches polygons: overlaps or touches them */
const ringReaches = (p: Pt, r: number, polys: Polygons) =>
  pointInPolygons(p, polys) || distanceToPolygons(p, polys) <= r;

/** line ids: segments of a trench line are `${line.id}:${i}` */
const lineIdOf = (segmentId: string) => {
  const i = segmentId.lastIndexOf(":");
  return i < 0 ? segmentId : segmentId.slice(0, i);
};

/** per trench line: the ring's distance to its own edge and its own minimum */
const lineMargins = (
  p: Pt,
  ringM: number,
  g: NetworkGeometry,
  pageMinM: number,
) => {
  const byLine = new Map<string, { d: number; minM: number }>();
  for (const { s, a, b } of ends(g)) {
    const id = lineIdOf(s.id);
    const d = pointSegment(p, a, b) - s.widthM / 2 - ringM;
    const best = byLine.get(id);
    if (!best || d < best.d) {
      byLine.set(id, { d, minM: s.treeMinM ?? pageMinM });
    }
  }
  return [...byLine.values()];
};

/**
 * Tree check, measured from the tree's outer ring (its CINH toetsstraal,
 * ringM): the distance runs from the ring to the trench edge and is below
 * zero once the trench reaches the ring. The minimum counts beyond the ring
 * and never changes the measured distance; zones are reported only while
 * they are active.
 *
 * With the network's geometry, each trench line asks its own minimum (else
 * the page's treeMinM): the tree passes when it keeps every line's. A tree
 * that fails is reported against the line it fails worst; one that passes
 * against the nearest line.
 */
export const checkTree = (
  p: Pt,
  ringM: number,
  zones: Zones,
  active: boolean,
  treeMinM: number,
  g?: NetworkGeometry,
): TreeCheck => {
  if (!zones.trench.length) {
    return {
      inside: false,
      distanceM: null,
      minM: null,
      pass: null,
      red: null,
      work: null,
    };
  }
  const inside = pointInPolygons(p, zones.trench);
  const toEdge = distanceToPolygons(p, zones.trench);
  const nearestM = (inside ? -toEdge : toEdge) - ringM;
  const zoneCheck = {
    red: active ? ringReaches(p, ringM, zones.red) : null,
    work: active ? ringReaches(p, ringM, zones.work) : null,
  };
  const lines = g ? lineMargins(p, ringM, g, treeMinM) : [];
  if (!lines.length) {
    return {
      inside,
      distanceM: nearestM,
      minM: treeMinM,
      pass: nearestM + 1e-9 >= treeMinM && nearestM > 0,
      ...zoneCheck,
    };
  }
  const nearest = lines.reduce((x, y) => (y.d < x.d ? y : x));
  const worst = lines.reduce((x, y) => (y.d - y.minM < x.d - x.minM ? y : x));
  const pass = nearestM > 0 && worst.d + 1e-9 >= worst.minM;
  const deciding = pass || nearestM <= 0 ? nearest : worst;
  return {
    inside,
    distanceM: deciding === nearest ? nearestM : worst.d,
    minM: deciding.minM,
    pass,
    ...zoneCheck,
  };
};

export type TreeDistance = {
  /** the trench line measured to */
  lineId: string;
  /** ring to that line's trench edge, metres */
  distanceM: number;
  /** on the ring, page metres */
  from: Pt;
  /** on the trench edge, page metres */
  to: Pt;
  /** that line's own Minimale afstand, else the page's */
  minM: number;
};

const closestOnSegment = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
};

/**
 * A tree's distance from its ring to each trench line on the page, each to
 * that line's own edge (its own width), nearest first. Lines farther than
 * maxM are left out, as are lines that already reach the ring (the tree check
 * reports those) and edge points inside another line's trench, which are no
 * edge of the network (a branch's end inside the main trench).
 */
export const treeDistances = (
  p: Pt,
  ringM: number,
  g: NetworkGeometry,
  maxM: number,
  pageMinM = 0,
): TreeDistance[] => {
  const segs = ends(g).map(({ s, a, b }) => ({
    line: lineIdOf(s.id),
    a,
    b,
    half: s.widthM / 2,
    minM: s.treeMinM ?? pageMinM,
  }));
  const nearest = new Map<
    string,
    { q: Pt; d: number; half: number; minM: number }
  >();
  for (const seg of segs) {
    const q = closestOnSegment(p, seg.a, seg.b);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    const best = nearest.get(seg.line);
    if (!best || d - seg.half < best.d - best.half) {
      nearest.set(seg.line, { q, d, half: seg.half, minM: seg.minM });
    }
  }
  const out: TreeDistance[] = [];
  for (const [lineId, { q, d, half, minM }] of nearest) {
    const distanceM = d - half - ringM;
    if (!(distanceM > 0 && distanceM <= maxM)) {
      continue;
    }
    const ux = (p.x - q.x) / d;
    const uy = (p.y - q.y) / d;
    const to = { x: q.x + ux * half, y: q.y + uy * half };
    const covered = segs.some(
      (seg) =>
        seg.line !== lineId && pointSegment(to, seg.a, seg.b) < seg.half - 1e-6,
    );
    if (covered) {
      continue;
    }
    out.push({
      lineId,
      distanceM,
      from: { x: p.x - ux * ringM, y: p.y - uy * ringM },
      to,
      minM,
    });
  }
  return out.sort((x, y) => x.distanceM - y.distanceM);
};

const hash = (text: string) => {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
};

/**
 * Geometry + zone settings, in centimetres in the page frame. A segment's own
 * zone settings count only where they differ from the page's, so zones
 * activated before lines had their own settings stay activated.
 */
export const fingerprint = (g: NetworkGeometry, s: ZoneSettings): string => {
  const cm = (n: number) => Math.round(n * 100);
  const own = (x: GeoSegment) => {
    const red = x.redSide ?? s.redSide;
    const work = cm(x.workWidthM ?? s.workWidthM);
    const side = x.workSide ?? s.workSide;
    return red === s.redSide && work === cm(s.workWidthM) && side === s.workSide
      ? ""
      : // "plan": sides are sides of the plan, so an activation made while
        // Links and Rechts followed the drawing direction does not carry over
        `:${red}/${work}/${side}/plan`;
  };
  const byId = <T extends { id: string }>(x: T, y: T) =>
    x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  const nodes = [...g.nodes]
    .sort(byId)
    .map((n) => `${n.id}:${cm(n.x)},${cm(n.y)}`)
    .join(";");
  const segs = [...g.segments]
    .sort(byId)
    .map((x) => `${x.id}:${x.a}-${x.b}:${cm(x.widthM)}${own(x)}`)
    .join(";");
  return hash(
    `${nodes}|${segs}|${s.redSide}|${cm(s.workWidthM)}|${s.workSide}`,
  );
};
