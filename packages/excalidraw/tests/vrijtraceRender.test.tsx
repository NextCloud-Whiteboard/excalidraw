import React from "react";
import { act } from "@testing-library/react";

import { exportToSvg } from "../scene/export";
import { Excalidraw } from "../index";
import { networkIdForPage } from "../vrijtrace/model";
import {
  renderVrijTraceInteractive,
  renderVrijTraceStatic,
} from "../vrijtrace/render";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const pdfPage = () => ({
  ...API.createElement({
    type: "image",
    id: "pdf1",
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
  }),
  customData: { isPdf: true, pdfCmPerPx: 5 },
});
/** a trench line from (100,100) to (400,100), drawn with the tool */
const drawLine = () => {
  act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
  mouse.reset();
  mouse.downAt(100, 100);
  for (let x = 110; x <= 400; x += 10) {
    mouse.moveTo(x, 100);
  }
  mouse.upAt(400, 100);
};
const svgOf = () =>
  exportToSvg(h.elements, { ...h.state, exportBackground: false }, {});

describe("Vrij Tracé rendering", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw handleKeyboardGlobally={true} vrijTraceEnabled={true} />,
    );
    API.setElements([pdfPage()]);
    drawLine();
  });

  it("exports the trench, and zones only once activated", async () => {
    const before = await svgOf();
    expect(before.querySelector("[data-vrijtrace='trench']")).not.toBeNull();
    expect(h.app.vrijTrace.zonesActive()).toBe(false);
    expect(before.querySelector("[data-vrijtrace='red']")).toBeNull();
    act(() => h.app.vrijTrace.activate());
    const after = await svgOf();
    expect(after.querySelector("[data-vrijtrace='red']")).not.toBeNull();
  });

  it("hides zones again after any edit", async () => {
    act(() => h.app.vrijTrace.activate());
    act(() => h.app.vrijTrace.updateSettings({ workWidthM: 3 }, true));
    const svg = await svgOf();
    expect(svg.querySelector("[data-vrijtrace='red']")).toBeNull();
  });

  it("exports the trench body see-through, with zones off and on", async () => {
    const trenchFill = async () =>
      (await svgOf())
        .querySelector("[data-vrijtrace='trench']")!
        .getAttribute("fill");
    expect(await trenchFill()).toBe("none");
    act(() => h.app.vrijTrace.activate());
    expect(await trenchFill()).toBe("none");
  });

  it("renders the canvases without throwing", () => {
    act(() => h.app.vrijTrace.toggleHidePdf());
    act(() => h.app.vrijTrace.activate());
    expect(() => act(() => h.app.refresh())).not.toThrow();
  });
});

/** a 2D context that records calls, and the points of dashed paths */
const countingContext = () => {
  const calls: Record<string, number> = {};
  const dashedPoints: number[][] = [];
  const lineWidths: number[] = [];
  const alphas: number[] = [];
  const texts: string[] = [];
  const arcs: { x: number; y: number; r: number; stroke: string }[] = [];
  let stroke = "";
  let dashed = false;
  const ctx = new Proxy(
    {},
    {
      get:
        (_, key: string) =>
        (...args: any[]) => {
          calls[key] = (calls[key] ?? 0) + 1;
          if (key === "setLineDash") {
            dashed = args[0].length > 0;
          }
          if (key === "fillText") {
            texts.push(args[0]);
          }
          if (key === "arc") {
            arcs.push({ x: args[0], y: args[1], r: args[2], stroke });
          }
          if (dashed && (key === "moveTo" || key === "lineTo")) {
            dashedPoints.push(args);
          }
          return key === "measureText" ? { width: 10 } : undefined;
        },
      set: (_, key: string, value) => {
        if (key === "lineWidth") {
          lineWidths.push(value);
        }
        if (key === "globalAlpha") {
          alphas.push(value);
        }
        if (key === "strokeStyle") {
          stroke = value;
        }
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, dashedPoints, lineWidths, alphas, texts, arcs };
};

/** a calibrated page with one activated segment from (100,100) to (400,100) */
const drawOnPage = async (width: number, height: number, activate = true) => {
  await render(
    <Excalidraw handleKeyboardGlobally={true} vrijTraceEnabled={true} />,
  );
  // jsdom lays the canvas out at 0×0; give it a real screen
  act(() => h.setState({ width: 1200, height: 800 }));
  API.setElements([
    {
      ...API.createElement({
        type: "image",
        id: "pdf1",
        x: 0,
        y: 0,
        width,
        height,
      }),
      customData: { isPdf: true, pdfCmPerPx: 5 },
    },
  ]);
  drawLine();
  if (activate) {
    act(() => h.app.vrijTrace.activate());
  }
  return h.app.scene.getElement(networkIdForPage("pdf1")) as any;
};

const renderStatic = (network: any) => {
  const recorded = countingContext();
  renderVrijTraceStatic(
    recorded.ctx,
    h.state as any,
    network,
    h.app.scene.getNonDeletedElementsMap(),
  );
  return recorded;
};

describe("Vrij Tracé see-through trenches", () => {
  it("paints no trench body on the canvas, only its outline", async () => {
    const network = await drawOnPage(1000, 700, false);
    const { calls } = renderStatic(network);
    expect(calls.fill ?? 0).toBe(0);
    expect(calls.stroke).toBeGreaterThan(0);
  });

  it("previews a stroke as a thin outline, not a wide band", async () => {
    await drawOnPage(1000, 700, false);
    act(() =>
      h.setState({
        activeTool: {
          ...h.state.activeTool,
          type: "custom",
          customType: "vrijtrace",
        },
        vrijTrace: {
          ...h.state.vrijTrace,
          pageId: "pdf1",
          widthM: 2,
          stroke: [
            { x: 100, y: 300 },
            { x: 200, y: 310 },
            { x: 300, y: 300 },
          ],
        },
      }),
    );
    const recorded = countingContext();
    renderVrijTraceInteractive(
      recorded.ctx,
      h.state as any,
      h.app.scene.getNonDeletedElementsMap(),
    );
    expect(recorded.calls.stroke).toBeGreaterThan(0);
    // 2 m at 5 cm/px would be a 40 px band; only hairlines are drawn
    expect(Math.max(...recorded.lineWidths)).toBeLessThan(5);
    expect(recorded.calls.closePath).toBeGreaterThan(0);
  });
});

/** a library tree's ring of r px around (cx, cy) on pdf1 */
const libraryTree = (id: string, cx: number, cy: number, r: number) => ({
  ...API.createElement({
    type: "ellipse",
    id,
    x: cx - r,
    y: cy - r,
    width: 2 * r,
    height: 2 * r,
  }),
  customData: {
    treeRing: { klasse: "C3", scherm: false },
    pdfParentId: "pdf1",
  },
});

describe("Vrij Tracé trees", () => {
  const addTrees = () =>
    API.updateScene({
      elements: [
        ...h.elements,
        // the trench (y = 100, 1 m = 20 px wide) reaches this ring
        libraryTree("near", 250, 120, 20),
        libraryTree("far", 250, 300, 20),
      ],
    });

  it("traces the ring in red of a tree the trench reaches", async () => {
    const network = await drawOnPage(1000, 700, false);
    addTrees();
    const { arcs } = renderStatic(network);
    expect(arcs).toEqual([{ x: 250, y: 120, r: 20, stroke: "#c92a2a" }]);
  });

  it("outlines the tree whose table row is pointed at, with any tool", async () => {
    await drawOnPage(1000, 700, false);
    addTrees();
    act(() => h.app.setActiveTool({ type: "selection" }));
    act(() => h.app.vrijTrace.setHotTree("far"));
    const recorded = countingContext();
    renderVrijTraceInteractive(
      recorded.ctx,
      h.state as any,
      h.app.scene.getNonDeletedElementsMap(),
    );
    const z = h.state.zoom.value;
    expect(recorded.arcs).toEqual([
      { x: 250, y: 300, r: 20 + 6 / z, stroke: "#315d97" },
    ]);
  });
});

describe("Vrij Tracé concept zones", () => {
  it("shows zones that went stale after a change as a faded concept", async () => {
    const network = await drawOnPage(1000, 700);
    act(() => h.app.vrijTrace.updateSettings({ workWidthM: 3 }, true));
    expect(h.app.vrijTrace.zonesActive()).toBe(false);
    const { calls, alphas, texts } = renderStatic(
      h.app.scene.getElement(network.id),
    );
    expect(calls.fill).toBeGreaterThanOrEqual(3); // the zones, faded
    expect(alphas.some((a) => a > 0 && a < 1)).toBe(true);
    expect(texts).toContain("CONCEPT · NIET GEACTIVEERD");
    // no overlap hatching on a concept
    expect(calls.clip ?? 0).toBe(0);
  });

  it("shows no concept on a never-activated page", async () => {
    const network = await drawOnPage(1000, 700, false);
    const { calls, texts } = renderStatic(network);
    expect(calls.fill ?? 0).toBe(0);
    expect(texts).not.toContain("CONCEPT · NIET GEACTIVEERD");
  });

  it("shows no concept once the zones are switched off on purpose", async () => {
    const network = await drawOnPage(1000, 700);
    act(() => h.app.vrijTrace.updateSettings({ workWidthM: 3 }, true));
    act(() => h.app.vrijTrace.deactivate());
    const { calls, texts } = renderStatic(h.app.scene.getElement(network.id));
    expect(calls.fill ?? 0).toBe(0);
    expect(texts).not.toContain("CONCEPT · NIET GEACTIVEERD");
  });

  it("draws activated zones at full strength with their hatching", async () => {
    const network = await drawOnPage(1000, 700);
    const { alphas, texts, calls } = renderStatic(network);
    expect(alphas.filter((a) => a < 1)).toEqual([]);
    expect(texts).not.toContain("CONCEPT · NIET GEACTIVEERD");
    expect(calls.clip).toBeGreaterThan(0);
  });

  it("leaves a concept out of the export", async () => {
    await drawOnPage(1000, 700);
    act(() => h.app.vrijTrace.updateSettings({ workWidthM: 3 }, true));
    const svg = await svgOf();
    expect(svg.querySelector("[data-vrijtrace='work']")).toBeNull();
    expect(svg.querySelector("[data-vrijtrace='trench']")).not.toBeNull();
  });
});

describe("Vrij Tracé rendering cost", () => {
  it("hatching a huge shared page stays bounded by the screen", async () => {
    const network = await drawOnPage(1_000_000, 700_000);
    const { calls } = renderStatic(network);
    expect(calls.fill).toBeGreaterThanOrEqual(3); // zones were drawn
    expect(calls.stroke).toBeLessThan(2000);
  });

  it("a shared page with an absurd calibration does not break the scene", async () => {
    const network = await drawOnPage(1000, 700);
    const page = h.app.scene.getElement("pdf1")!;
    // clipper-lib reports out-of-range coordinates with window.alert, and
    // the scene repaints (and caches zones) as soon as the page changes
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    act(() =>
      h.app.scene.mutateElement(page, {
        customData: { isPdf: true, pdfCmPerPx: 1e300 },
      }),
    );
    expect(() => renderStatic(network)).not.toThrow();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
