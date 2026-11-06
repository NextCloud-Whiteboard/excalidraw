import React from "react";
import { act, fireEvent } from "@testing-library/react";

import { CaptureUpdateAction, newTrenchElement } from "@excalidraw/element";

import { Excalidraw } from "../index";
import { getPageParts } from "../vrijtrace/model";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { GlobalTestState, render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const pdfPage = (over: any = {}) => ({
  ...API.createElement({
    type: "image",
    id: "pdf1",
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
  }),
  customData: { isPdf: true, pdfCmPerPx: 5 },
  ...over,
});
const parts = () => getPageParts(h.elements, "pdf1");
const lines = () => parts().lines;
const tool = () =>
  act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
const click = (x: number, y: number) => {
  mouse.reset();
  mouse.clickAt(x, y);
};
/** a pencil stroke through the points */
const stroke = (pts: [number, number][]) => {
  mouse.reset();
  mouse.downAt(...pts[0]);
  for (const p of pts.slice(1)) {
    mouse.moveTo(...p);
  }
  mouse.upAt(...pts[pts.length - 1]);
};
/** points every 10 px from a to b */
const line_ = (a: [number, number], b: [number, number]) => {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 10));
  return Array.from({ length: n + 1 }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / n,
    a[1] + ((b[1] - a[1]) * i) / n,
  ]) as [number, number][];
};
/** a hand-drawn curve from a to b */
const wiggle = (a: [number, number], b: [number, number]) =>
  line_(a, b).map(
    ([x, y], i) => [x + 15 * Math.sin(i / 3), y] as [number, number],
  );

describe("Vrij Tracé tool", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        vrijTraceEnabled={true}
        vrijTraceUser={{ uid: "u1", name: "Jij" }}
      />,
    );
  });

  it("refuses to draw outside an imported PDF page", () => {
    API.setElements([pdfPage()]);
    tool();
    stroke([
      [1200, 100],
      [1300, 100],
    ]);
    expect(h.state.toast?.message).toBe(
      "Sleuven teken je alleen op een geïmporteerde PDF-pagina",
    );
    expect(h.elements.filter((e) => e.type === "line")).toHaveLength(0);
  });

  it("says nothing for a plain click outside a page", () => {
    API.setElements([pdfPage()]);
    tool();
    click(1200, 100);
    expect(h.state.toast).toBeNull();
  });

  it("says nothing for a plain click on an uncalibrated page", () => {
    API.setElements([pdfPage({ customData: { isPdf: true } })]);
    tool();
    click(100, 100);
    expect(h.state.toast).toBeNull();
  });

  it("asks for a calibration first", () => {
    API.setElements([pdfPage({ customData: { isPdf: true } })]);
    tool();
    stroke([
      [100, 100],
      [300, 100],
    ]);
    expect(h.state.toast?.message).toBe(
      "Kalibreer eerst de liniaal op deze pagina",
    );
    expect(h.elements.filter((e) => e.type === "line")).toHaveLength(0);
  });

  it("draws a trench freehand: one stroke is one trench line, and the tool stays", () => {
    API.setElements([pdfPage()]);
    tool();
    stroke(wiggle([100, 100], [400, 300]));
    const [line] = lines();
    expect(lines()).toHaveLength(1);
    expect(line.customData).toMatchObject({
      tool: "trench",
      widthM: 1,
      reference: "midden",
      pdfParentId: "pdf1",
    });
    expect(line.locked).toBe(false);
    expect(line.strokeStyle).toBe("dashed");
    expect(line.x).toBeCloseTo(100, 0);
    expect(line.y).toBeCloseTo(100, 0);
    // the page's network (zone settings) is created once, with the first line
    expect(parts().network?.id).toBe("vrijtrace-pdf1");
    expect(h.state.vrijTrace.pageId).toBe("pdf1");
    // like the pencil: the tool stays for the next stroke
    expect(h.state.activeTool).toMatchObject({ customType: "vrijtrace" });
    expect(h.state.vrijTrace.stroke).toBeNull();
  });

  it("smooths a shaky hand: a wobbly straight stroke becomes one segment", () => {
    API.setElements([pdfPage()]);
    tool();
    const pts: [number, number][] = [];
    for (let x = 100; x <= 400; x += 10) {
      pts.push([x, 100 + ((x / 10) % 2 ? 1 : -1)]);
    }
    stroke(pts);
    expect(lines()[0].points).toHaveLength(2);
  });

  it("keeps the drawn shape with Vrij", () => {
    API.setElements([pdfPage()]);
    expect(h.state.vrijTrace.snap).toBe("vrij");
    tool();
    stroke([
      ...line_([100, 100], [300, 120]),
      ...line_([300, 120], [330, 300]),
    ]);
    const pts = lines()[0].points;
    expect(pts).toHaveLength(3);
    expect(pts[1][0]).toBeCloseTo(200, -1);
    expect(pts[1][1]).toBeCloseTo(20, -1);
  });

  it("straightens the stroke to 90° steps when chosen", () => {
    API.setElements([pdfPage()]);
    act(() => h.app.vrijTrace.setUI({ snap: "90" }));
    tool();
    stroke([
      ...line_([100, 100], [300, 120]),
      ...line_([300, 120], [330, 300]),
    ]);
    const pts = lines()[0].points;
    expect(pts).toHaveLength(3);
    for (let i = 1; i < pts.length; i++) {
      const dx = Math.abs(pts[i][0] - pts[i - 1][0]);
      const dy = Math.abs(pts[i][1] - pts[i - 1][1]);
      expect(Math.min(dx, dy)).toBeLessThan(0.01);
    }
  });

  it("uses the chosen width and drawing reference", () => {
    API.setElements([pdfPage()]);
    tool();
    act(() => {
      h.app.vrijTrace.setWidth(1.5, true);
      h.app.vrijTrace.setUI({ reference: "links" });
    });
    stroke(line_([100, 100], [300, 100]));
    expect(lines()[0].customData).toMatchObject({
      widthM: 1.5,
      reference: "links",
    });
    // an edge reference draws the edge itself: solid, not the dashed centre
    expect(lines()[0].strokeStyle).toBe("solid");
  });

  it("leaves the pencil's and line tool's drawings ordinary", () => {
    API.setElements([pdfPage()]);
    act(() => h.app.setActiveTool({ type: "freedraw" }));
    stroke(line_([100, 100], [300, 200]));
    expect(h.elements.filter((e) => e.type === "freedraw")).toHaveLength(1);
    expect(lines()).toHaveLength(0);
  });

  it("makes one undo step per stroke", () => {
    API.setElements([pdfPage()]);
    tool();
    stroke(line_([100, 100], [300, 100]));
    stroke(line_([100, 300], [300, 300]));
    expect(lines()).toHaveLength(2);
    Keyboard.undo();
    expect(lines()).toHaveLength(1);
  });

  it("draws nothing for a click", () => {
    API.setElements([pdfPage()]);
    tool();
    click(200, 200);
    expect(lines()).toHaveLength(0);
  });

  it("starts and ends a branch exactly on existing trench lines", () => {
    API.setElements([pdfPage()]);
    tool();
    stroke(line_([100, 300], [500, 300]));
    stroke(line_([100, 500], [500, 500]));
    stroke(line_([300, 306], [300, 494]));
    const branch = lines()[2];
    expect(branch.x).toBeCloseTo(300);
    expect(branch.y).toBeCloseTo(300);
    const end = branch.points[branch.points.length - 1];
    expect(branch.y + end[1]).toBeCloseTo(500);
  });

  it("never creates two networks for one page", () => {
    API.setElements([pdfPage()]);
    tool();
    stroke(line_([100, 100], [300, 100]));
    stroke(line_([100, 300], [300, 300]));
    act(() => h.app.vrijTrace.updateSettings({ treeMinM: 4 }, true));
    expect(
      h.elements.filter(
        (e) => e.type === "trench" && (e as any).trench.kind === "network",
      ),
    ).toHaveLength(1);
  });

  it("shows the PDF again when the tool is left", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    act(() => h.app.vrijTrace.toggleHidePdf());
    expect(h.state.vrijTrace.hidePdf).toBe(true);
    act(() => h.app.setActiveTool({ type: "selection" }));
    expect(h.state.vrijTrace.hidePdf).toBe(false);
  });

  it("still pans with the middle mouse button", () => {
    API.setElements([pdfPage()]);
    tool();
    // events go to the canvas and bubble to document and window, as in a browser
    const canvas = GlobalTestState.interactiveCanvas;
    const scrollX = h.state.scrollX;
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 300, button: 1 });
    fireEvent.pointerMove(canvas, { clientX: 500, clientY: 300, button: 1 });
    fireEvent.pointerUp(canvas, { clientX: 500, clientY: 300, button: 1 });
    expect(h.state.scrollX).not.toBe(scrollX);
    expect(h.elements.filter((e) => e.type === "line")).toHaveLength(0);
  });

  it("drops the stroke when a second finger starts a pinch", () => {
    API.setElements([pdfPage()]);
    tool();
    const canvas = GlobalTestState.interactiveCanvas;
    const touch = (pointerId: number, clientX: number) => ({
      pointerId,
      pointerType: "touch",
      clientX,
      clientY: 100,
      button: 0,
    });
    fireEvent.pointerDown(canvas, touch(1, 100));
    fireEvent.pointerMove(canvas, touch(1, 150));
    expect(h.state.vrijTrace.stroke).not.toBeNull();
    fireEvent.pointerDown(canvas, touch(2, 300));
    fireEvent.pointerUp(canvas, touch(2, 320));
    fireEvent.pointerUp(canvas, touch(1, 200));
    expect(h.state.vrijTrace.stroke).toBeNull();
    expect(lines()).toHaveLength(0);
  });
});

describe("Vrij Tracé on boards from before trench lines", () => {
  it("converts their trench into lines when they load, without an undo step", async () => {
    await render(<Excalidraw vrijTraceEnabled={true} />);
    const node = (id: string, x: number) =>
      newTrenchElement({
        id,
        trench: { kind: "node" },
        pdfParentId: "pdf1",
        x: x - 0.5,
        y: 99.5,
      });
    act(() =>
      h.app.updateScene({
        elements: [
          pdfPage(),
          node("n1", 100),
          node("n2", 300),
          newTrenchElement({
            id: "s1",
            trench: { kind: "segment", a: "n1", b: "n2", widthM: 1.2 },
            pdfParentId: "pdf1",
            x: 0,
            y: 0,
          }),
        ],
        captureUpdate: CaptureUpdateAction.NEVER,
      }),
    );
    expect(parts().segments).toHaveLength(0);
    expect(parts().nodes).toHaveLength(0);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].customData?.widthM).toBe(1.2);
    expect(h.history.isUndoStackEmpty).toBe(true);
  });
});

describe("Vrij Tracé and collaboration", () => {
  it("keeps broadcasting the cursor while the tool is active", async () => {
    const onPointerUpdate = vi.fn();
    await render(
      <Excalidraw vrijTraceEnabled={true} onPointerUpdate={onPointerUpdate} />,
    );
    API.setElements([pdfPage()]);
    tool();
    onPointerUpdate.mockClear();
    mouse.reset();
    mouse.moveTo(200, 200);
    expect(onPointerUpdate).toHaveBeenCalled();
  });
});
