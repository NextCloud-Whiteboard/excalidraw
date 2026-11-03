import rough from "roughjs/bin/rough";

import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type {
  NormalizedZoomValue,
  StaticCanvasAppState,
} from "@excalidraw/excalidraw/types";
import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "@excalidraw/excalidraw/scene/types";

import { renderElement } from "../src/renderElement";

import type {
  NonDeletedExcalidrawElement,
  NonDeletedSceneElementsMap,
} from "../src/types";

type CanvasEvent = { type: string; props: Record<string, any> };

// a freehand stroke on a small PDF page: most pieces are shorter than a dash
const POINTS: [number, number][] = [
  [0, 0],
  [3.5, -1],
  [12, -4],
  [24, -6],
  [25.5, -6],
  [30.5, -5],
  [35, -3],
  [37.5, -2],
];

const line = (customData?: Record<string, unknown>, strokeStyle = "dashed") =>
  ({
    ...API.createElement({
      type: "line",
      strokeWidth: 0.1,
      strokeStyle: strokeStyle as "dashed" | "solid",
      roughness: 0,
      // trench lines have sharp corners (vrijtrace/lines.ts)
      roundness: null,
      points: POINTS.map(([x, y]) => pointFrom<LocalPoint>(x, y)),
    }),
    // API.createElement does not take customData
    customData,
  } as NonDeletedExcalidrawElement);

const TRENCH = { tool: "trench", widthM: 2.15, reference: "midden" };

/** what the renderer does on the canvas for one element at a zoom */
const draw = (element: NonDeletedExcalidrawElement, zoom: number) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const map = new Map([[element.id, element]]);
  const appState = {
    ...getDefaultAppState(),
    width: 800,
    height: 600,
    offsetLeft: 0,
    offsetTop: 0,
    zoom: { value: zoom as NormalizedZoomValue },
  } as unknown as StaticCanvasAppState;
  const renderConfig: StaticCanvasRenderConfig = {
    canvasBackgroundColor: "#ffffff",
    imageCache: new Map(),
    renderGrid: false,
    // draws straight onto this context instead of a cached element canvas
    isExporting: true,
    embedsValidationStatus: new Map(),
    elementsPendingErasure: new Set(),
    pendingFlowchartNodes: null,
  };
  renderElement(
    element,
    map as unknown as RenderableElementsMap,
    map as unknown as NonDeletedSceneElementsMap,
    rough.canvas(canvas),
    context,
    renderConfig,
    appState,
  );
  const events: CanvasEvent[] = (context as any).__getEvents();
  const of = (type: string) => events.filter((e) => e.type === type);
  return {
    lineWidths: of("lineWidth").map((e) => e.props.value),
    dashes: of("setLineDash").map((e) => e.props.segments),
    moves: of("moveTo").length,
    strokes: of("stroke").length,
  };
};

describe("trench centre line", () => {
  it("runs one dash pattern along the whole line", () => {
    const { moves, strokes } = draw(line(TRENCH), 9);
    expect(moves).toBe(1);
    expect(strokes).toBe(1);
  });

  it("keeps its dashes a fixed size on screen", () => {
    expect(draw(line(TRENCH), 9).dashes).toContainEqual([8 / 9, 5 / 9]);
    expect(draw(line(TRENCH), 20).dashes).toContainEqual([8 / 20, 5 / 20]);
  });

  it("is drawn exactly as thick as Lijndikte when that shows", () => {
    // 0,10 board px at 2000% = 2 screen px
    expect(draw(line(TRENCH), 20).lineWidths).toContain(0.1);
    expect(draw(line(TRENCH), 20).lineWidths).not.toContain(0.6);
  });

  it("is never thinner than one screen pixel", () => {
    expect(draw(line(TRENCH), 1).lineWidths).toContain(1);
    expect(draw(line(TRENCH), 4).lineWidths).toContain(1 / 4);
  });

  it("leaves other dashed lines as Excalidraw draws them", () => {
    const { lineWidths, moves } = draw(line(), 9);
    expect(lineWidths).toContain(0.6);
    expect(moves).toBeGreaterThan(1);
  });

  it("leaves a solid edge-reference trench line as it is", () => {
    const { lineWidths, dashes } = draw(
      line({ ...TRENCH, reference: "links" }, "solid"),
      9,
    );
    expect(lineWidths).toContain(0.1);
    expect(dashes.flat()).toEqual([]);
  });
});
