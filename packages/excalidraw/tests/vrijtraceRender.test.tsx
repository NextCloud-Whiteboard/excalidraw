import React from "react";
import { act } from "@testing-library/react";

import { exportToSvg } from "../scene/export";
import { Excalidraw } from "../index";
import { networkIdForPage } from "../vrijtrace/model";
import { renderVrijTraceStatic } from "../vrijtrace/render";

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
const svgOf = () =>
  exportToSvg(h.elements, { ...h.state, exportBackground: false }, {});

describe("Vrij Tracé rendering", () => {
  beforeEach(async () => {
    await render(<Excalidraw vrijTraceEnabled={true} />);
    API.setElements([pdfPage()]);
    act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
    mouse.reset();
    mouse.clickAt(100, 100);
    mouse.clickAt(400, 100);
  });

  it("exports the trench, and zones only once activated", async () => {
    const before = await svgOf();
    expect(before.querySelector("[data-vrijtrace='trench']")).not.toBeNull();
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
          if (dashed && (key === "moveTo" || key === "lineTo")) {
            dashedPoints.push(args);
          }
          return key === "measureText" ? { width: 10 } : undefined;
        },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, dashedPoints };
};

/** a calibrated page with one activated segment from (100,100) to (400,100) */
const drawOnPage = async (width: number, height: number) => {
  await render(<Excalidraw vrijTraceEnabled={true} />);
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
  act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
  mouse.reset();
  mouse.clickAt(100, 100);
  mouse.clickAt(400, 100);
  act(() => h.app.vrijTrace.activate());
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

describe("Vrij Tracé rendering cost", () => {
  it("hatching a huge shared page stays bounded by the screen", async () => {
    const network = await drawOnPage(1_000_000, 700_000);
    const { calls } = renderStatic(network);
    expect(calls.fill).toBeGreaterThan(3); // zones were drawn
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

  it("dashed centrelines are clipped to the screen", async () => {
    const network = await drawOnPage(1_000_000, 700);
    const seg = h.elements.find(
      (e: any) => e.type === "trench" && e.trench.kind === "segment",
    ) as any;
    const b = h.app.scene.getElement(seg.trench.b)!;
    act(() => h.app.scene.mutateElement(b, { x: 900_000 }));
    const { dashedPoints } = renderStatic(network);
    expect(dashedPoints.length).toBeGreaterThan(0);
    const maxX = Math.max(...dashedPoints.map(([x]) => x));
    expect(maxX).toBeLessThanOrEqual(
      -h.state.scrollX + h.state.width / h.state.zoom.value + 100,
    );
  });
});
