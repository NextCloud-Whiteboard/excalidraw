import { centreOf, pageToScene } from "./model";

import type { PageFrame, PageParts } from "./model";
import type { Pt } from "./geometry";

/** a network as plain data, positions in scene px (element centres) */
export type WNode = { id: string; x: number; y: number };
export type WSegment = { id: string; a: string; b: string; widthM: number };
export type Working = { nodes: WNode[]; segments: WSegment[] };
export type Snap = "90" | "45" | "vrij";
export type Reference = "midden" | "links" | "rechts";
export type DrawOptions = {
  snap: Snap;
  reference: Reference;
  widthM: number;
  pxPerMetre: number;
  /** v8.2's 13 board px, in scene px; the other thresholds derive from it */
  snapPx: number;
  newId: () => string;
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const nodeOf = (w: Working, id: string) => w.nodes.find((n) => n.id === id);

export const fromParts = (parts: PageParts): Working => ({
  nodes: parts.nodes.map((n) => ({ id: n.id, ...centreOf(n) })),
  segments: parts.segments.flatMap((s) =>
    s.trench.kind === "segment"
      ? [{ id: s.id, a: s.trench.a, b: s.trench.b, widthM: s.trench.widthM }]
      : [],
  ),
});

export const cloneWorking = (w: Working): Working => ({
  nodes: w.nodes.map((n) => ({ ...n })),
  segments: w.segments.map((s) => ({ ...s })),
});

export const nearNode = (
  w: Working,
  p: Pt,
  th: number,
  except?: string,
): WNode | null => {
  let best: WNode | null = null;
  let bestD = th;
  for (const n of w.nodes) {
    if (n.id === except) {
      continue;
    }
    const d = dist(n, p);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
};

const project = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, q, d: dist(p, q) };
};

const nearSegment = (w: Working, p: Pt, th: number) => {
  let best: { s: WSegment; q: Pt } | null = null;
  let bestD = th;
  for (const s of w.segments) {
    const a = nodeOf(w, s.a);
    const b = nodeOf(w, s.b);
    if (!a || !b) {
      continue;
    }
    const r = project(p, a, b);
    if (r.d < bestD && r.t > 0.025 && r.t < 0.975) {
      bestD = r.d;
      best = { s, q: r.q };
    }
  }
  return best;
};

const makeNode = (w: Working, p: Pt, o: DrawOptions) => {
  const id = o.newId();
  w.nodes.push({ id, x: p.x, y: p.y });
  return id;
};

const splitSegment = (w: Working, s: WSegment, p: Pt, o: DrawOptions) => {
  const existing = nearNode(w, p, (o.snapPx * 3) / 13);
  if (existing) {
    return existing.id;
  }
  const id = makeNode(w, p, o);
  const oldB = s.b;
  s.b = id;
  w.segments.push({ id: o.newId(), a: id, b: oldB, widthM: s.widthM });
  return id;
};

const nodeAt = (w: Working, p: Pt, o: DrawOptions) => {
  const close = nearNode(w, p, o.snapPx);
  if (close) {
    return close.id;
  }
  const hit = nearSegment(w, p, (o.snapPx * 10) / 13);
  return hit ? splitSegment(w, hit.s, hit.q, o) : makeNode(w, p, o);
};

const constrain = (a: Pt, b: Pt, snap: Snap): Pt => {
  if (snap === "vrij") {
    return b;
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) {
    return b;
  }
  const step = snap === "90" ? Math.PI / 2 : Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len };
};

/** v8.2 lineEndpoints: snap the angle, apply the drawing reference, snap to nodes */
export const drawEndpoints = (
  w: Working,
  start: Pt,
  raw: Pt,
  o: DrawOptions,
) => {
  const q = constrain(start, raw, o.snap);
  const dx = q.x - start.x;
  const dy = q.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 3) {
    return null;
  }
  const half = (o.widthM * o.pxPerMetre) / 2;
  const offset =
    o.reference === "links" ? -half : o.reference === "rechts" ? half : 0;
  const nx = dy / len;
  const ny = -dx / len;
  let a = { x: start.x + nx * offset, y: start.y + ny * offset };
  let b = { x: q.x + nx * offset, y: q.y + ny * offset };
  const na = nearNode(w, a, o.snapPx) || nearNode(w, start, o.snapPx);
  const nb = nearNode(w, b, o.snapPx) || nearNode(w, q, o.snapPx);
  if (na) {
    a = { x: na.x, y: na.y };
  }
  if (nb) {
    b = { x: nb.x, y: nb.y };
  }
  return { a, b };
};

const crossing = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const cross = (u: Pt, v: Pt) => u.x * v.y - u.y * v.x;
  const den = cross(r, s);
  if (Math.abs(den) < 1e-4) {
    return null;
  }
  const ca = { x: c.x - a.x, y: c.y - a.y };
  const t = cross(ca, s) / den;
  const u = cross(ca, r) / den;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999
    ? { p: { x: a.x + t * r.x, y: a.y + t * r.y }, t }
    : null;
};

/** drop invalid/duplicate segments and nodes without segments (v8.2 prune) */
export const prune = (w: Working) => {
  const seen = new Set<string>();
  const used = new Set<string>();
  w.segments = w.segments.filter((s) => {
    const a = nodeOf(w, s.a);
    const b = nodeOf(w, s.b);
    if (!a || !b || s.a === s.b || dist(a, b) < 3) {
      return false;
    }
    const key = [s.a, s.b].sort().join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    used.add(s.a);
    used.add(s.b);
    return true;
  });
  w.nodes = w.nodes.filter((n) => used.has(n.id));
};

/** v8.2 addSegment: snap, split at a T, split at crossings, chain the pieces. */
export const addSegment = (
  w: Working,
  start: Pt,
  raw: Pt,
  o: DrawOptions,
): string | null => {
  const line = drawEndpoints(w, start, raw, o);
  if (!line || dist(line.a, line.b) < (o.snapPx * 4) / 13) {
    return null;
  }
  const ia = nodeAt(w, line.a, o);
  const ib = nodeAt(w, line.b, o);
  if (ia === ib) {
    prune(w);
    return null;
  }
  const A = nodeOf(w, ia)!;
  const B = nodeOf(w, ib)!;
  const cuts = [
    { t: 0, id: ia },
    { t: 1, id: ib },
  ];
  for (const s of [...w.segments]) {
    const sa = nodeOf(w, s.a);
    const sb = nodeOf(w, s.b);
    // a segment whose node has not arrived (or was merged away) is kept as is
    const c = sa && sb ? crossing(A, B, sa, sb) : null;
    if (!c) {
      continue;
    }
    const id =
      nearNode(w, c.p, (o.snapPx * 2) / 13)?.id ?? splitSegment(w, s, c.p, o);
    cuts.push({ t: c.t, id });
  }
  cuts.sort((x, y) => x.t - y.t);
  const ids: string[] = [];
  for (const c of cuts) {
    if (!ids.includes(c.id)) {
      ids.push(c.id);
    }
  }
  for (let i = 1; i < ids.length; i++) {
    const a = ids[i - 1];
    const b = ids[i];
    if (
      !w.segments.some(
        (s) => (s.a === a && s.b === b) || (s.a === b && s.b === a),
      )
    ) {
      w.segments.push({ id: o.newId(), a, b, widthM: o.widthM });
    }
  }
  prune(w);
  return nodeOf(w, ib) ? ib : null;
};

/** v8.2: a dragged node dropped close to another merges into it */
export const dropNode = (w: Working, id: string, mergePx: number) => {
  const n = nodeOf(w, id);
  if (!n) {
    return;
  }
  const close = nearNode(w, n, mergePx, id);
  if (close) {
    for (const s of w.segments) {
      if (s.a === id) {
        s.a = close.id;
      }
      if (s.b === id) {
        s.b = close.id;
      }
    }
    w.nodes = w.nodes.filter((x) => x.id !== id);
  }
  prune(w);
};

export const deleteSegment = (w: Working, id: string) => {
  w.segments = w.segments.filter((s) => s.id !== id);
  prune(w);
};

export type Diff = {
  addedNodes: WNode[];
  movedNodes: WNode[];
  removedNodes: string[];
  addedSegments: WSegment[];
  changedSegments: WSegment[];
  removedSegments: string[];
};

export const diffWorking = (before: Working, after: Working): Diff => {
  const bn = new Map(before.nodes.map((n) => [n.id, n]));
  const bs = new Map(before.segments.map((s) => [s.id, s]));
  const an = new Set(after.nodes.map((n) => n.id));
  const as = new Set(after.segments.map((s) => s.id));
  return {
    addedNodes: after.nodes.filter((n) => !bn.has(n.id)),
    movedNodes: after.nodes.filter((n) => {
      const b = bn.get(n.id);
      return !!b && (b.x !== n.x || b.y !== n.y);
    }),
    removedNodes: before.nodes.filter((n) => !an.has(n.id)).map((n) => n.id),
    addedSegments: after.segments.filter((s) => !bs.has(s.id)),
    changedSegments: after.segments.filter((s) => {
      const b = bs.get(s.id);
      return !!b && (b.a !== s.a || b.b !== s.b || b.widthM !== s.widthM);
    }),
    removedSegments: before.segments
      .filter((s) => !as.has(s.id))
      .map((s) => s.id),
  };
};

// v8.2 example in v8.2 board px (1100×670, 20 px = 1 m), placed around the
// page centre and scaled by the page calibration.
const EXAMPLE_NODES: [number, number][] = [
  [235, 245],
  [420, 245],
  [615, 245],
  [615, 440],
  [420, 440],
  [790, 245],
  [860, 340],
  [310, 510],
];
const EXAMPLE_SEGMENTS: [number, number][] = [
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 2],
  [3, 6],
  [6, 7],
  [5, 8],
];
const EXAMPLE_TREES: [string, number, number][] = [
  ["B1", 427, 320],
  ["B2", 672, 289],
  ["B3", 900, 445],
];

export const exampleNetwork = (frame: PageFrame, newId: () => string) => {
  const cx = (frame.width * frame.cmPerPx!) / 200;
  const cy = (frame.height * frame.cmPerPx!) / 200;
  const at = (x: number, y: number) =>
    pageToScene(frame, { x: cx + (x - 550) / 20, y: cy + (y - 335) / 20 });
  const ids = EXAMPLE_NODES.map(() => newId());
  const working: Working = {
    nodes: EXAMPLE_NODES.map(([x, y], i) => ({ id: ids[i], ...at(x, y) })),
    segments: EXAMPLE_SEGMENTS.map(([a, b]) => ({
      id: newId(),
      a: ids[a - 1],
      b: ids[b - 1],
      widthM: 1,
    })),
  };
  return {
    working,
    trees: EXAMPLE_TREES.map(([label, x, y]) => ({ label, ...at(x, y) })),
  };
};
