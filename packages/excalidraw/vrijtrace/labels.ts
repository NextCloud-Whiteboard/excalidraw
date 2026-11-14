import { getCommonBounds } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
} from "@excalidraw/element/types";

import { pageElements } from "./elements";
import { checkTree } from "./geometry";
import {
  centreOf,
  pageState,
  sceneToPage,
  trenchLinePoints,
  treeRingM,
} from "./model";

import type { Pt } from "./geometry";

/** a number on the plan, matching its row in the panel's lists */
export type PlanLabel = {
  kind: "line" | "tree" | "tree-bad" | "element";
  n: number;
  /** the label's centre, in scene px */
  x: number;
  y: number;
};

/** the point halfway along a polyline */
const halfway = (pts: Pt[]): Pt => {
  const legs = pts
    .slice(1)
    .map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let left = legs.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] && legs[i] > 0) {
      const t = left / legs[i];
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    left -= legs[i];
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
};

/**
 * The labels of a calibrated page: each sleuf halfway along it, each tree
 * at the top right of its ring (red once the trench reaches it), each other
 * element at its top right corner, numbered in the order the panel lists them.
 */
export const planLabels = (
  elements: readonly ExcalidrawElement[],
  page: ExcalidrawImageElement,
): PlanLabel[] => {
  const s = pageState(elements, page);
  if (!s) {
    return [];
  }
  const lines = s.parts.lines.map((l, i) => ({
    kind: "line" as const,
    n: i + 1,
    ...halfway(trenchLinePoints(l)),
  }));
  const trees = s.parts.trees.map((t, i) => {
    const c = centreOf(t);
    const r = (t.width + t.height) / 4;
    const check = checkTree(
      sceneToPage(s.frame, c),
      treeRingM(t, s.frame),
      s.zones,
      s.active,
    );
    return {
      kind: check.pass === false ? ("tree-bad" as const) : ("tree" as const),
      n: i + 1,
      x: c.x + r * Math.SQRT1_2,
      y: c.y - r * Math.SQRT1_2,
    };
  });
  const others = pageElements(elements, page.id).map((e, i) => {
    const [, y1, x2] = getCommonBounds(e.elements);
    return { kind: "element" as const, n: i + 1, x: x2, y: y1 };
  });
  return [...lines, ...trees, ...others];
};
