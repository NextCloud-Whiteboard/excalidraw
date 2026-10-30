import { getSizeFromPoints } from "@excalidraw/common";
import { newLinearElement } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type { ExcalidrawLinearElement } from "@excalidraw/element/types";

import type { TrenchReference } from "./model";
import type { WNode, WSegment } from "./editing";
import type { Pt } from "./geometry";

/** v8.2 centreline grey: the line element itself draws the centre (or edge) */
export const TRENCH_LINE_COLOR = "#737b83";

/** the look of a trench line; the trench body and zones come from render.ts */
export const trenchLineStyle = (reference: TrenchReference) =>
  ({
    strokeColor: TRENCH_LINE_COLOR,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    // the centre is dashed, as in v8.2; an edge reference draws the edge
    strokeStyle: reference === "midden" ? "dashed" : "solid",
    roughness: 0,
    opacity: 100,
    roundness: null,
  } as const);

export const trenchLineData = (
  widthM: number,
  reference: TrenchReference,
  pdfParentId: string,
) => ({ tool: "trench", widthM, reference, pdfParentId });

/** a new trench line through scene points */
export const newTrenchLine = (opts: {
  id?: string;
  points: Pt[];
  widthM: number;
  reference?: TrenchReference;
  pdfParentId: string;
}): ExcalidrawLinearElement => {
  const reference = opts.reference ?? "midden";
  const [first] = opts.points;
  const points = opts.points.map((p) =>
    pointFrom<LocalPoint>(p.x - first.x, p.y - first.y),
  );
  const line = newLinearElement({
    type: "line",
    x: first.x,
    y: first.y,
    // sized like the whiteboard sizes the lines it draws
    ...getSizeFromPoints(points),
    points,
    ...trenchLineStyle(reference),
    locked: false,
    customData: trenchLineData(opts.widthM, reference, opts.pdfParentId),
  });
  return opts.id ? { ...line, id: opts.id } : line;
};

/**
 * Join segments into as few polylines as possible: a chain runs on through
 * nodes where exactly two segments of the same width meet. Deterministic
 * (segments in id order), so clients converting the same board agree.
 * Each chain is named after its first segment.
 */
export const chainSegments = (
  nodes: readonly WNode[],
  segments: readonly WSegment[],
) => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const valid = segments
    .filter((s) => s.a !== s.b && nodeById.has(s.a) && nodeById.has(s.b))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const atNode = new Map<string, WSegment[]>();
  for (const s of valid) {
    for (const n of [s.a, s.b]) {
      atNode.set(n, [...(atNode.get(n) ?? []), s]);
    }
  }
  const used = new Set<string>();
  /** node ids beyond `node`, following the chain away from `from` */
  const extend = (node: string, from: WSegment) => {
    const out: string[] = [];
    let cur = node;
    let prev = from;
    for (;;) {
      const here = atNode.get(cur) ?? [];
      const last = prev;
      const next = here.length === 2 ? here.find((s) => s !== last) : undefined;
      if (!next || used.has(next.id) || next.widthM !== prev.widthM) {
        return out;
      }
      used.add(next.id);
      cur = next.a === cur ? next.b : next.a;
      out.push(cur);
      prev = next;
    }
  };
  const chains: { id: string; points: Pt[]; widthM: number }[] = [];
  for (const s of valid) {
    if (used.has(s.id)) {
      continue;
    }
    used.add(s.id);
    const ids = [...extend(s.a, s).reverse(), s.a, s.b, ...extend(s.b, s)];
    chains.push({
      id: s.id,
      widthM: s.widthM,
      points: ids.map((id) => {
        const n = nodeById.get(id)!;
        return { x: n.x, y: n.y };
      }),
    });
  }
  return chains;
};
