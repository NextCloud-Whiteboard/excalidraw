import type {
  ElementsMap,
  ExcalidrawImageElement,
  ExcalidrawTrenchElement,
} from "@excalidraw/element/types";

import { getClientColor } from "../clients";

import { checkTree } from "./geometry";
import {
  centreOf,
  displayLabels,
  isPdfPage,
  pageState,
  pageToScene,
  pxPerMetre,
  sceneToPage,
} from "./model";
import { STR } from "./strings";

import type { Polygons } from "./geometry";
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
  fill: "#ffffff",
  fillOn: "#c7defa",
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

const centreLines = (s: PageState) =>
  s.geometry.segments.map((seg) => {
    const a = s.geometry.nodes.find((n) => n.id === seg.a)!;
    const b = s.geometry.nodes.find((n) => n.id === seg.b)!;
    return [pageToScene(s.frame, a), pageToScene(s.frame, b)];
  });

const drawTree = (
  ctx: CanvasRenderingContext2D,
  c: { x: number; y: number },
  label: string,
  z: number,
  conflict: boolean,
) => {
  ctx.save();
  ctx.lineWidth = (conflict ? 2.5 : 1.5) / z;
  ctx.strokeStyle = conflict ? "#c92a2a" : "#343a40";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(c.x, c.y, 12 / z, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#343a40";
  ctx.lineWidth = 1.2 / z;
  ctx.fillStyle = "#e1e3e5";
  ctx.beginPath();
  ctx.arc(c.x, c.y, 7.4 / z, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `bold ${11 / z}px sans-serif`;
  const w = ctx.measureText(label).width + 10 / z;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#8a9197";
  ctx.lineWidth = 1 / z;
  ctx.beginPath();
  ctx.rect(c.x + 13 / z, c.y - 12 / z, w, 18 / z);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#252d36";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, c.x + 18 / z, c.y - 3 / z);
  ctx.restore();
};

const MAX_HATCH_LINES = 1000;

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
  const z = appState.zoom.value;
  x0 = Math.max(x0, -appState.scrollX);
  y0 = Math.max(y0, -appState.scrollY);
  x1 = Math.min(x1, -appState.scrollX + appState.width / z);
  y1 = Math.min(y1, -appState.scrollY + appState.height / z);
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
  ctx.translate(appState.scrollX, appState.scrollY);
  if (s.active) {
    tracePath(ctx, s.zones.work, s);
    ctx.fillStyle = COLORS.work;
    ctx.fill("evenodd");
    tracePath(ctx, s.zones.red, s);
    ctx.fillStyle = COLORS.red;
    ctx.fill("evenodd");
    tracePath(ctx, s.zones.overlap, s);
    ctx.fillStyle = COLORS.overlap;
    ctx.fill("evenodd");
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
  tracePath(ctx, s.zones.trench, s);
  ctx.fillStyle = s.active ? COLORS.fillOn : COLORS.fill;
  ctx.fill("evenodd");
  ctx.strokeStyle = s.active ? COLORS.edgeOn : COLORS.edge;
  ctx.lineWidth = 1.2 / z;
  ctx.stroke();
  ctx.setLineDash([7 / z, 5 / z]);
  ctx.strokeStyle = s.active ? COLORS.centreOn : COLORS.centre;
  ctx.lineWidth = 1.5 / z;
  for (const [a, b] of centreLines(s)) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const labels = displayLabels(s.parts.trees);
  for (const t of s.parts.trees) {
    const c = centreOf(t);
    const check = checkTree(
      sceneToPage(s.frame, c),
      s.zones,
      s.active,
      s.settings.treeMinM,
    );
    drawTree(ctx, c, labels.get(t.id)!, z, check.pass === false);
  }
  ctx.restore();
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
    s.active ? COLORS.fillOn : COLORS.fill,
    s.active ? COLORS.edgeOn : COLORS.edge,
    1.2,
  );
  const labels = displayLabels(s.parts.trees);
  for (const t of s.parts.trees) {
    const c = centreOf(t);
    const g = doc.createElementNS(SVG_NS, "g");
    g.setAttribute("data-vrijtrace", "tree");
    const circle = doc.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(c.x + offsetX));
    circle.setAttribute("cy", String(c.y + offsetY));
    circle.setAttribute("r", "12");
    circle.setAttribute("fill", "#ffffff");
    circle.setAttribute("stroke", COLORS.edge);
    circle.setAttribute("stroke-width", "1.5");
    const text = doc.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(c.x + offsetX + 16));
    text.setAttribute("y", String(c.y + offsetY + 4));
    text.setAttribute("font-size", "11");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("fill", "#252d36");
    // textContent, not innerHTML: labels come from shared board data
    text.textContent = labels.get(t.id) ?? "";
    g.appendChild(circle);
    g.appendChild(text);
    svgRoot.appendChild(g);
  }
};

/** editing layer: colleagues' holds, and for the current page nodes, selection, active tree and draft */
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
  if (
    appState.activeTool.type !== "custom" ||
    appState.activeTool.customType !== "vrijtrace"
  ) {
    return;
  }
  const ui = appState.vrijTrace;
  const page = ui.pageId ? elementsMap.get(ui.pageId) : null;
  if (!isPdfPage(page)) {
    return;
  }
  const s = pageState([...elementsMap.values()], page);
  if (!s) {
    return;
  }
  ctx.save();
  const r = (ui.mode === "verplaats" ? 8 : 5.3) / z;
  ctx.lineWidth = 2 / z;
  ctx.strokeStyle = COLORS.edge;
  ctx.fillStyle = "#ffffff";
  for (const n of s.geometry.nodes) {
    const p = pageToScene(s.frame, n);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const sel = s.geometry.segments.find((x) => x.id === ui.selectedSegmentId);
  if (sel) {
    const a = pageToScene(
      s.frame,
      s.geometry.nodes.find((n) => n.id === sel.a)!,
    );
    const b = pageToScene(
      s.frame,
      s.geometry.nodes.find((n) => n.id === sel.b)!,
    );
    ctx.save();
    ctx.setLineDash([5 / z, 5 / z]);
    ctx.strokeStyle = "#111111";
    ctx.globalAlpha = 0.75;
    ctx.lineCap = "round";
    ctx.lineWidth = sel.widthM * pxPerMetre(s.frame) + 6 / z;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }
  const tree = ui.activeTreeId ? elementsMap.get(ui.activeTreeId) : null;
  if (tree && !tree.isDeleted && ui.mode === "boom") {
    const c = centreOf(tree);
    ctx.save();
    ctx.setLineDash([3 / z, 2 / z]);
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 2.5 / z;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 15 / z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const pv = ui.draft?.preview;
  if (pv) {
    ctx.save();
    ctx.setLineDash([8 / z, 5 / z]);
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 2 / z;
    ctx.beginPath();
    ctx.moveTo(pv.a.x, pv.a.y);
    ctx.lineTo(pv.b.x, pv.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${12 / z}px sans-serif`;
    ctx.fillStyle = "#555555";
    ctx.fillText(
      `${pv.lengthM.toFixed(2).replace(".", ",")} m`,
      (pv.a.x + pv.b.x) / 2 + 8 / z,
      (pv.a.y + pv.b.y) / 2 - 8 / z,
    );
    ctx.restore();
  }
  ctx.restore();
};

/** "PDF verbergen": a dashed outline where this user's current page is */
export const renderHiddenPdf = (
  ctx: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  page: ExcalidrawImageElement,
) => {
  const z = appState.zoom.value;
  ctx.save();
  ctx.translate(
    appState.scrollX + page.x + page.width / 2,
    appState.scrollY + page.y + page.height / 2,
  );
  ctx.rotate(page.angle);
  ctx.setLineDash([6 / z, 6 / z]);
  ctx.strokeStyle = "#868e96";
  ctx.lineWidth = 1.2 / z;
  ctx.strokeRect(-page.width / 2, -page.height / 2, page.width, page.height);
  ctx.restore();
};
