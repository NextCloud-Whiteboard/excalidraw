import { pageToScene } from "./model";

import type { PageFrame } from "./model";
import type { Pt } from "./geometry";

/** a network as plain data, positions in scene px */
export type WNode = { id: string; x: number; y: number };
export type WSegment = { id: string; a: string; b: string; widthM: number };
export type Working = { nodes: WNode[]; segments: WSegment[] };
export type Snap = "90" | "45" | "vrij";

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const project = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
    : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { q, d: dist(p, q) };
};

/** v8.2 angle snap: b turned around a to the nearest 90° or 45° step */
export const constrain = (a: Pt, b: Pt, snap: Snap): Pt => {
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

/** Douglas–Peucker: drop points within `tol` of the line through their neighbours */
export const simplify = (pts: readonly Pt[], tol: number): Pt[] => {
  if (pts.length < 3) {
    return [...pts];
  }
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let worst = -1;
    let worstD = tol;
    for (let k = i + 1; k < j; k++) {
      const d = project(pts[k], pts[i], pts[j]).d;
      if (d > worstD) {
        worstD = d;
        worst = k;
      }
    }
    if (worst > 0) {
      keep[worst] = true;
      stack.push([i, worst], [worst, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
};

/**
 * 90°/45°: each piece turned to the nearest step (its length kept), joined
 * end to end from the first point; runs in one direction become one piece.
 */
export const straighten = (pts: readonly Pt[], snap: Snap): Pt[] => {
  if (snap === "vrij" || pts.length < 2) {
    return [...pts];
  }
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const from = out[out.length - 1];
    const q = constrain(
      from,
      {
        x: from.x + pts[i].x - pts[i - 1].x,
        y: from.y + pts[i].y - pts[i - 1].y,
      },
      snap,
    );
    const prev = out[out.length - 2];
    const sameWay =
      prev &&
      Math.abs(
        (from.x - prev.x) * (q.y - from.y) - (from.y - prev.y) * (q.x - from.x),
      ) < 1e-6 &&
      (from.x - prev.x) * (q.x - from.x) + (from.y - prev.y) * (q.y - from.y) >
        0;
    if (sameWay) {
      out[out.length - 1] = q;
    } else {
      out.push(q);
    }
  }
  return out;
};

/**
 * v8.2 node snap for trench lines: a point within `th` of another trench
 * line's point lands on it; else one within 10/13 of that (v8.2's segment
 * distance) lands on the line itself. Null when nothing is near.
 */
export const snapToTrench = (
  polylines: readonly Pt[][],
  p: Pt,
  th: number,
): Pt | null => {
  let best: Pt | null = null;
  let bestD = th;
  for (const line of polylines) {
    for (const q of line) {
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  }
  if (best) {
    return { x: best.x, y: best.y };
  }
  bestD = (th * 10) / 13;
  for (const line of polylines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const r = project(p, line[i], line[i + 1]);
      if (r.d < bestD) {
        bestD = r.d;
        best = r.q;
      }
    }
  }
  return best;
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
