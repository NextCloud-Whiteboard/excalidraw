import { VRIJTRACE_SIDEBAR_TAB } from "@excalidraw/common";

import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTrenchElement,
} from "@excalidraw/element/types";

import { getClientColor } from "../clients";

import { SMOOTH_PX, simplify } from "./editing";
import {
  checkTree,
  computeZones,
  fingerprint,
  treeDistances,
} from "./geometry";
import {
  centreOf,
  getPageFrame,
  isPdfPage,
  isTreeRing,
  isTrenchLine,
  outlinePolygon,
  pageState,
  pageToScene,
  pxPerMetre,
  sceneToPage,
  treeRingM,
} from "./model";
import { planLabels } from "./labels";
import { STR } from "./strings";

import type { NetworkGeometry, Polygons, Pt, Zones } from "./geometry";
import type { PlanLabel } from "./labels";
import type { PageState } from "./model";
import type {
  InteractiveCanvasAppState,
  SocketId,
  StaticCanvasAppState,
} from "../types";

/** v8.2 colours */
export const COLORS = {
  edge: "#343a40",
  edgeOn: "#315d97",
  centre: "#737b83",
  centreOn: "#6689ae",
  red: "rgba(218,54,65,0.41)",
  work: "rgba(237,151,41,0.43)",
  overlap: "rgba(155,92,185,0.43)",
  overlapLine: "rgba(122,66,156,0.63)",
};

const stateFor = (
  network: ExcalidrawTrenchElement,
  elementsMap: ElementsMap,
) => {
  const page = elementsMap.get(network.customData?.pdfParentId);
  return isPdfPage(page) ? pageState([...elementsMap.values()], page) : null;
};

const tracePath = (
  ctx: CanvasRenderingContext2D,
  polys: Polygons,
  s: PageState,
) => {
  ctx.beginPath();
  for (const ring of polys) {
    ring.forEach((m, i) => {
      const p = pageToScene(s.frame, m);
      if (i) {
        ctx.lineTo(p.x, p.y);
      } else {
        ctx.moveTo(p.x, p.y);
      }
    });
    ctx.closePath();
  }
};

/** a tree's ring radius in scene px */
const ringPx = (ring: { width: number; height: number }) =>
  (ring.width + ring.height) / 4;

/** a tree in conflict: its ring traced in red (the tree draws itself) */
const drawTreeConflict = (
  ctx: CanvasRenderingContext2D,
  c: Pt,
  r: number,
  z: number,
) => {
  ctx.save();
  ctx.strokeStyle = "#c92a2a";
  ctx.lineWidth = 2.5 / z;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const MAX_HATCH_LINES = 1000;

type Box = { x0: number; y0: number; x1: number; y1: number };
type ViewState = Pick<
  StaticCanvasAppState,
  "scrollX" | "scrollY" | "width" | "height" | "zoom"
>;

/** the visible scene area, grown by `margin` screen px */
const screenBox = (appState: ViewState, margin = 0): Box => {
  const z = appState.zoom.value;
  return {
    x0: -appState.scrollX - margin / z,
    y0: -appState.scrollY - margin / z,
    x1: -appState.scrollX + (appState.width + margin) / z,
    y1: -appState.scrollY + (appState.height + margin) / z,
  };
};

/** parameters t0..t1 of the part of a→b inside box (Liang–Barsky), or null */
const clipLine = (a: Pt, b: Pt, box: Box): [number, number] | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, a.x - box.x0],
    [dx, box.x1 - a.x],
    [-dy, a.y - box.y0],
    [dy, box.y1 - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) {
        return null;
      }
    } else {
      const t = q / p;
      if (p < 0) {
        t0 = Math.max(t0, t);
      } else {
        t1 = Math.min(t1, t);
      }
    }
  }
  return t0 <= t1 ? [t0, t1] : null;
};

/**
 * Stroke a dashed a→b only where it is on screen, so the dash count follows
 * the screen size and not the (shared, untrusted) line length. The dash
 * offset keeps the pattern anchored at a while panning.
 */
const dashedLine = (
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  box: Box,
  period: number,
) => {
  const t = clipLine(a, b, box);
  if (!t) {
    return;
  }
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  ctx.lineDashOffset = (t[0] * len) % period;
  ctx.beginPath();
  ctx.moveTo(a.x + t[0] * (b.x - a.x), a.y + t[0] * (b.y - a.y));
  ctx.lineTo(a.x + t[1] * (b.x - a.x), a.y + t[1] * (b.y - a.y));
  ctx.stroke();
};

/** scene-space bounding box of the polygons, clipped to the viewport */
const visibleBox = (
  polys: Polygons,
  s: PageState,
  appState: StaticCanvasAppState,
) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of polys) {
    for (const m of ring) {
      const p = pageToScene(s.frame, m);
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  const view = screenBox(appState);
  x0 = Math.max(x0, view.x0);
  y0 = Math.max(y0, view.y0);
  x1 = Math.min(x1, view.x1);
  y1 = Math.min(y1, view.y1);
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
};

/** the page's trench, zones (only while activated) and trees, on the static canvas */
export const renderVrijTraceStatic = (
  ctx: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  network: ExcalidrawTrenchElement,
  elementsMap: ElementsMap,
) => {
  const s = stateFor(network, elementsMap);
  if (!s) {
    return;
  }
  const z = appState.zoom.value;
  ctx.save();
  try {
    drawPage(ctx, appState, s, z);
  } finally {
    ctx.restore();
  }
};

/** how strongly a concept's zones are drawn */
const CONCEPT_ALPHA = 0.38;

/** "CONCEPT · NIET GEACTIVEERD" at the page's top centre (the tool panel
 * covers its left corner), screen-sized */
const drawConceptLabel = (
  ctx: CanvasRenderingContext2D,
  s: PageState,
  z: number,
) => {
  const at = pageToScene(s.frame, {
    x: s.frame.width / pxPerMetre(s.frame) / 2,
    y: 0,
  });
  ctx.save();
  ctx.font = `600 ${11 / z}px sans-serif`;
  const w = ctx.measureText(STR.concept).width;
  const x = at.x - (w + 16 / z) / 2;
  const y = at.y + 10 / z;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#adb5bd";
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.rect(x, y, w + 16 / z, 22 / z);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#495057";
  ctx.textBaseline = "middle";
  ctx.fillText(STR.concept, x + 8 / z, y + 11 / z);
  ctx.restore();
};

const drawPage = (
  ctx: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  s: PageState,
  z: number,
) => {
  ctx.translate(appState.scrollX, appState.scrollY);
  if (s.active || s.stale) {
    // a concept (zones gone stale after a change) is faded and unhatched
    ctx.globalAlpha = s.active ? 1 : CONCEPT_ALPHA;
    tracePath(ctx, s.zones.work, s);
    ctx.fillStyle = COLORS.work;
    ctx.fill("evenodd");
    tracePath(ctx, s.zones.red, s);
    ctx.fillStyle = COLORS.red;
    ctx.fill("evenodd");
    tracePath(ctx, s.zones.overlap, s);
    ctx.fillStyle = COLORS.overlap;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;
  }
  if (s.active) {
    ctx.save();
    ctx.clip("evenodd");
    ctx.strokeStyle = COLORS.overlapLine;
    ctx.lineWidth = 3 / z;
    // hatch only where the overlap is on screen: the line count then
    // follows the screen size, not the (shared, untrusted) page size
    const box = visibleBox(s.zones.overlap, s, appState);
    if (box) {
      const step = 16 / z;
      const from = box.x0 + box.y0;
      const to = Math.min(box.x1 + box.y1, from + step * MAX_HATCH_LINES);
      ctx.beginPath();
      for (let c = from; c <= to; c += step) {
        ctx.moveTo(c - box.y0, box.y0);
        ctx.lineTo(c - box.y1, box.y1);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // only the outline: the plan stays readable through the trench
  tracePath(ctx, s.zones.trench, s);
  ctx.strokeStyle = s.active ? COLORS.edgeOn : COLORS.edge;
  ctx.lineWidth = 1.2 / z;
  ctx.stroke();
  if (s.stale) {
    drawConceptLabel(ctx, s, z);
  }
  // the centre (or edge) line is the trench line element itself
  for (const t of s.parts.trees) {
    const c = centreOf(t);
    const check = checkTree(
      sceneToPage(s.frame, c),
      treeRingM(t, s.frame),
      s.zones,
      s.active,
    );
    if (check.pass === false) {
      drawTreeConflict(ctx, c, ringPx(t), z);
    }
  }
};

const SVG_NS = "http://www.w3.org/2000/svg";

const pathD = (polys: Polygons, s: PageState, ox: number, oy: number) =>
  polys
    .map(
      (ring) =>
        `${ring
          .map((m, i) => {
            const p = pageToScene(s.frame, m);
            return `${i ? "L" : "M"}${p.x + ox} ${p.y + oy}`;
          })
          .join("")}Z`,
    )
    .join("");

/** the same drawing for SVG export; each part is tagged data-vrijtrace */
export const renderVrijTraceSvg = (
  svgRoot: SVGElement,
  network: ExcalidrawTrenchElement,
  elementsMap: ElementsMap,
  offsetX: number,
  offsetY: number,
) => {
  const s = stateFor(network, elementsMap);
  if (!s) {
    return;
  }
  const doc = svgRoot.ownerDocument!;
  const add = (
    kind: string,
    d: string,
    fill: string,
    stroke = "none",
    width = 0,
  ) => {
    const el = doc.createElementNS(SVG_NS, "path");
    el.setAttribute("data-vrijtrace", kind);
    el.setAttribute("d", d);
    el.setAttribute("fill", fill);
    el.setAttribute("fill-rule", "evenodd");
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", String(width));
    svgRoot.appendChild(el);
  };
  if (s.active) {
    add("work", pathD(s.zones.work, s, offsetX, offsetY), COLORS.work);
    add("red", pathD(s.zones.red, s, offsetX, offsetY), COLORS.red);
    add("overlap", pathD(s.zones.overlap, s, offsetX, offsetY), COLORS.overlap);
  }
  add(
    "trench",
    pathD(s.zones.trench, s, offsetX, offsetY),
    "none",
    s.active ? COLORS.edgeOn : COLORS.edge,
    1.2,
  );
};

/** editing layer: colleagues' holds, the stroke being drawn and the tree pointed at */
const previewCache = new Map<string, Zones>();

/**
 * While trench lines are selected on a page that shows no zones (never
 * activated, or switched off on purpose), their own zones faded like a
 * concept, so a change in the panel shows at once. A page whose zones are
 * shown (activated, or a concept) already draws every line's zones itself.
 */
const drawSelectedPreview = (
  ctx: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elementsMap: ElementsMap,
) => {
  const byPage = new Map<string, Set<string>>();
  for (const id of Object.keys(appState.selectedElementIds)) {
    const el = elementsMap.get(id);
    if (isTrenchLine(el)) {
      const pageId = el.customData.pdfParentId;
      byPage.set(pageId, (byPage.get(pageId) ?? new Set()).add(el.id));
    }
  }
  if (!byPage.size) {
    return;
  }
  const elements = [...elementsMap.values()];
  // node and segment ids are `${line.id}:${i}`
  const lineOf = (id: string) => id.slice(0, id.lastIndexOf(":"));
  for (const [pageId, lineIds] of byPage) {
    const page = elementsMap.get(pageId);
    const s = isPdfPage(page) ? pageState(elements, page) : null;
    if (!s || s.active || s.stale) {
      continue;
    }
    const geometry: NetworkGeometry = {
      nodes: s.geometry.nodes.filter((n) => lineIds.has(lineOf(n.id))),
      segments: s.geometry.segments.filter((g) => lineIds.has(lineOf(g.id))),
    };
    if (!geometry.segments.length) {
      continue;
    }
    const key = `${pageId}|${fingerprint(geometry, s.settings)}`;
    let zones = previewCache.get(key);
    if (!zones) {
      zones = computeZones(geometry, s.settings);
      previewCache.set(key, zones);
      if (previewCache.size > 32) {
        previewCache.delete(previewCache.keys().next().value!);
      }
    }
    ctx.save();
    ctx.globalAlpha = CONCEPT_ALPHA;
    for (const [polys, color] of [
      [zones.work, COLORS.work],
      [zones.red, COLORS.red],
      [zones.overlap, COLORS.overlap],
    ] as const) {
      tracePath(ctx, polys, s);
      ctx.fillStyle = color;
      ctx.fill("evenodd");
    }
    ctx.restore();
  }
};

/** trench lines this far beyond a selected tree's ring get a measuring line */
export const TREE_DISTANCE_MAX_M = 15;
const DISTANCE_OK = "#13283e";
const DISTANCE_BAD = "#b42318";

/** "8,50 m" */
const metres = (n: number) => `${n.toFixed(2).replace(".", ",")} m`;

/** a label of a fixed size on screen, its left middle at p */
const drawLabel = (
  ctx: CanvasRenderingContext2D,
  p: Pt,
  text: string,
  color: string,
  z: number,
) => {
  ctx.font = `500 ${12 / z}px sans-serif`;
  const w = ctx.measureText(text).width;
  const pad = 5 / z;
  const h = 18 / z;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.rect(p.x, p.y - h / 2, w + 2 * pad, h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, p.x + pad, p.y);
};

/**
 * Selected trees (and the one pointed at in the Boomcontrole table): a
 * measuring line from the ring to each trench line within 15 m, with the
 * distance; red below that line's own minimum. A tree the trench already reaches
 * is labelled instead. Drawn on the editing layer, so never exported.
 */
const drawTreeDistances = (
  ctx: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elementsMap: ElementsMap,
) => {
  const ids = new Set(Object.keys(appState.selectedElementIds));
  if (appState.vrijTrace.hotTreeId) {
    ids.add(appState.vrijTrace.hotTreeId);
  }
  const byPage = new Map<string, ExcalidrawElement[]>();
  for (const id of ids) {
    const el = elementsMap.get(id);
    if (el && isTreeRing(el)) {
      const pageId = el.customData!.pdfParentId;
      byPage.set(pageId, [...(byPage.get(pageId) ?? []), el]);
    }
  }
  if (!byPage.size) {
    return;
  }
  const z = appState.zoom.value;
  const elements = [...elementsMap.values()];
  for (const [pageId, trees] of byPage) {
    const page = elementsMap.get(pageId);
    const s = isPdfPage(page) ? pageState(elements, page) : null;
    if (!s) {
      continue;
    }
    for (const t of trees) {
      const c = centreOf(t);
      const p = sceneToPage(s.frame, c);
      const ringM = treeRingM(t, s.frame);
      const check = checkTree(p, ringM, s.zones, s.active);
      if (check.distanceM === null) {
        continue;
      }
      ctx.save();
      if (check.distanceM <= 0) {
        drawLabel(
          ctx,
          { x: c.x + ringPx(t) * 0.75, y: c.y - ringPx(t) * 0.75 },
          check.inside ? STR.treeInTrench : STR.treeInRing,
          DISTANCE_BAD,
          z,
        );
      }
      for (const d of treeDistances(
        p,
        ringM,
        s.geometry,
        TREE_DISTANCE_MAX_M,
      )) {
        const a = pageToScene(s.frame, d.from);
        const b = pageToScene(s.frame, d.to);
        // a line that reaches the ring is the in-ring label's, not a distance
        const color = DISTANCE_OK;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5 / z;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        for (const q of [a, b]) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, 3 / z, 0, Math.PI * 2);
          ctx.fill();
        }
        drawLabel(
          ctx,
          { x: (a.x + b.x) / 2 + 6 / z, y: (a.y + b.y) / 2 },
          metres(d.distanceM),
          color,
          z,
        );
      }
      ctx.restore();
    }
  }
};

export const LABEL_COLORS: Record<PlanLabel["kind"], string> = {
  line: "#315d97",
  tree: "#2f6b33",
  "tree-bad": "#c22b2b",
  element: "#5f5a6e",
};

/**
 * A label of a fixed size on screen, centred on its point: a sleuf a rounded
 * square, a tree round, another element square, each in its row's colour.
 */
const drawPlanLabel = (
  ctx: CanvasRenderingContext2D,
  label: PlanLabel,
  z: number,
) => {
  const text = String(label.n);
  ctx.font = `700 ${12 / z}px sans-serif`;
  const h = 20 / z;
  const w = Math.max(h, ctx.measureText(text).width + 10 / z);
  const r =
    label.kind === "line" ? 5 / z : label.kind === "element" ? 2 / z : h / 2;
  const x = label.x - w / 2;
  const y = label.y - h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = LABEL_COLORS[label.kind];
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2 / z;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, label.x, label.y + 0.5 / z);
};

/**
 * While Vrij Tracé is in use (its tab open, or its tool picked), the current
 * page's sleuven, trees and other elements carry their number from the
 * panel's lists. Drawn on the editing layer, so never exported.
 */
const drawPlanLabels = (
  ctx: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elementsMap: ElementsMap,
) => {
  const inUse =
    appState.openSidebar?.tab === VRIJTRACE_SIDEBAR_TAB ||
    (appState.activeTool.type === "custom" &&
      appState.activeTool.customType === "vrijtrace");
  const page = appState.vrijTrace.pageId
    ? elementsMap.get(appState.vrijTrace.pageId)
    : null;
  if (!inUse || !isPdfPage(page)) {
    return;
  }
  const z = appState.zoom.value;
  ctx.save();
  for (const label of planLabels([...elementsMap.values()], page)) {
    drawPlanLabel(ctx, label, z);
  }
  ctx.restore();
};

export const renderVrijTraceInteractive = (
  ctx: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elementsMap: ElementsMap,
) => {
  const z = appState.zoom.value;
  const now = Date.now();
  for (const [id, hold] of Object.entries(
    appState.vrijTraceRemoteHolds ?? {},
  )) {
    const el = elementsMap.get(id);
    if (!el || el.isDeleted || hold.expiresAt < now) {
      continue;
    }
    const c = centreOf(el);
    ctx.save();
    ctx.strokeStyle = getClientColor(hold.userId as SocketId, undefined);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3 / z;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 16 / z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `bold ${11.5 / z}px sans-serif`;
    ctx.fillText(STR.editing(hold.name), c.x + 20 / z, c.y - 14 / z);
    ctx.restore();
  }
  drawSelectedPreview(ctx, appState, elementsMap);
  drawTreeDistances(ctx, appState, elementsMap);
  drawPlanLabels(ctx, appState, elementsMap);
  const ui = appState.vrijTrace;
  // the tree whose row in the Boomcontrole table is pointed at
  const hot = ui.hotTreeId ? elementsMap.get(ui.hotTreeId) : null;
  if (hot && !hot.isDeleted) {
    const c = centreOf(hot);
    ctx.save();
    ctx.strokeStyle = COLORS.edgeOn;
    ctx.lineWidth = 3 / z;
    ctx.beginPath();
    ctx.arc(c.x, c.y, ringPx(hot) + 6 / z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (
    appState.activeTool.type !== "custom" ||
    appState.activeTool.customType !== "vrijtrace"
  ) {
    return;
  }
  const page = ui.pageId ? elementsMap.get(ui.pageId) : null;
  if (ui.stroke && ui.stroke.length > 1 && isPdfPage(page)) {
    // the stroke being drawn, outlined as wide as the trench it becomes
    // (smoothed like the line it turns into, so the outline doesn't jitter)
    const frame = getPageFrame(page);
    const drawn = simplify(ui.stroke, SMOOTH_PX / z);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLORS.edgeOn;
    if (frame.cmPerPx) {
      const ring = outlinePolygon(drawn, (ui.widthM * pxPerMetre(frame)) / 2);
      ctx.beginPath();
      ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.lineWidth = 1.2 / z;
      ctx.stroke();
    }
    ctx.beginPath();
    drawn.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.lineWidth = 1.5 / z;
    ctx.stroke();
    ctx.restore();
  }
};

/** "PDF verbergen": a dashed outline where this user's current page is */
export const renderHiddenPdf = (
  ctx: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  page: ExcalidrawImageElement,
) => {
  const z = appState.zoom.value;
  const c = { x: page.x + page.width / 2, y: page.y + page.height / 2 };
  const cos = Math.cos(page.angle);
  const sin = Math.sin(page.angle);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const dx = (sx * page.width) / 2;
    const dy = (sy * page.height) / 2;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
  ctx.save();
  ctx.translate(appState.scrollX, appState.scrollY);
  ctx.setLineDash([6 / z, 6 / z]);
  ctx.strokeStyle = "#868e96";
  ctx.lineWidth = 1.2 / z;
  const view = screenBox(appState, 20);
  corners.forEach((a, i) =>
    dashedLine(ctx, a, corners[(i + 1) % 4], view, 12 / z),
  );
  ctx.restore();
};
