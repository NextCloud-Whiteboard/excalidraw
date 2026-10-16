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

/** a 2D context that records how often each method is called */
const countingContext = () => {
  const calls: Record<string, number> = {};
  const ctx = new Proxy(
    {},
    {
      get:
        (_, key: string) =>
        (...args: unknown[]) => {
          calls[key] = (calls[key] ?? 0) + 1;
          return key === "measureText" ? { width: 10 } : undefined;
        },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
};

describe("Vrij Tracé rendering cost", () => {
  it("hatching a huge shared page stays bounded by the screen", async () => {
    await render(<Excalidraw vrijTraceEnabled={true} />);
    API.setElements([
      {
        ...API.createElement({
          type: "image",
          id: "pdf1",
          x: 0,
          y: 0,
          width: 1_000_000,
          height: 700_000,
        }),
        customData: { isPdf: true, pdfCmPerPx: 5 },
      },
    ]);
    act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
    mouse.reset();
    mouse.clickAt(100, 100);
    mouse.clickAt(400, 100);
    act(() => h.app.vrijTrace.activate());
    const network = h.app.scene.getElement(networkIdForPage("pdf1")) as any;
    const { ctx, calls } = countingContext();
    renderVrijTraceStatic(
      ctx,
      h.state as any,
      network,
      h.app.scene.getNonDeletedElementsMap(),
    );
    expect(calls.fill).toBeGreaterThan(3); // zones were drawn
    expect(calls.stroke).toBeLessThan(2000);
  });
});
