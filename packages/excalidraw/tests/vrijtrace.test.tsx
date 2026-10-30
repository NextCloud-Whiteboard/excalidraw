import React from "react";
import { act, fireEvent } from "@testing-library/react";

import { KEYS } from "@excalidraw/common";
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
/** a line tool click: the pointer moves there first, as a mouse does */
const point = (x: number, y: number) => {
  mouse.moveTo(x, y);
  mouse.clickAt(x, y);
};

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
    click(1200, 100);
    expect(h.state.toast?.message).toBe(
      "Sleuven teken je alleen op een geïmporteerde PDF-pagina",
    );
    expect(h.elements.filter((e) => e.type === "line")).toHaveLength(0);
  });

  it("asks for a calibration first", () => {
    API.setElements([pdfPage({ customData: { isPdf: true } })]);
    tool();
    click(100, 100);
    expect(h.state.toast?.message).toBe(
      "Kalibreer eerst de liniaal op deze pagina",
    );
    expect(h.elements.filter((e) => e.type === "line")).toHaveLength(0);
  });

  it("draws a trench as a whiteboard line, point by point, ended with Esc", () => {
    API.setElements([pdfPage()]);
    tool();
    point(100, 100);
    point(300, 100);
    point(300, 300);
    Keyboard.keyPress(KEYS.ESCAPE);
    const [line] = lines();
    expect(lines()).toHaveLength(1);
    expect(line.points).toHaveLength(3);
    expect(line.customData).toMatchObject({
      tool: "trench",
      widthM: 1,
      reference: "midden",
      pdfParentId: "pdf1",
    });
    expect(line.locked).toBe(false);
    expect(line.strokeStyle).toBe("dashed");
    // the page's network (zone settings) is created once, with the first line
    expect(parts().network?.id).toBe("vrijtrace-pdf1");
    expect(h.state.vrijTrace.pageId).toBe("pdf1");
    // like the line tool: back to selection, with the new line selected
    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.selectedElementIds[line.id]).toBe(true);
  });

  it("draws a straight trench line by dragging", () => {
    API.setElements([pdfPage()]);
    tool();
    mouse.reset();
    mouse.downAt(100, 100);
    mouse.moveTo(250, 160);
    mouse.upAt(300, 200);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].points).toHaveLength(2);
  });

  it("uses the chosen width and drawing reference", () => {
    API.setElements([pdfPage()]);
    tool();
    act(() => {
      h.app.vrijTrace.setWidth(1.5, true);
      h.app.vrijTrace.setUI({ reference: "links" });
    });
    point(100, 100);
    point(300, 100);
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(lines()[0].customData).toMatchObject({
      widthM: 1.5,
      reference: "links",
    });
    // an edge reference draws the edge itself: solid, not the dashed centre
    expect(lines()[0].strokeStyle).toBe("solid");
  });

  it("leaves lines drawn with the line tool ordinary", () => {
    API.setElements([pdfPage()]);
    act(() => h.app.setActiveTool({ type: "line" }));
    point(100, 100);
    point(300, 100);
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h.elements.filter((e) => e.type === "line")).toHaveLength(1);
    expect(lines()).toHaveLength(0);
  });

  it("undoes a trench line like any other line", () => {
    API.setElements([pdfPage()]);
    for (const y of [100, 300]) {
      tool();
      point(100, y);
      point(300, y);
      Keyboard.keyPress(KEYS.ESCAPE);
    }
    expect(lines()).toHaveLength(2);
    // the line tool's own steps: the selection, then the line
    Keyboard.undo();
    Keyboard.undo();
    expect(lines()).toHaveLength(1);
  });

  it("draws free by default and snaps to 90° when chosen", () => {
    API.setElements([pdfPage()]);
    expect(h.state.vrijTrace.snap).toBe("vrij");
    const end = () => {
      const l = lines()[lines().length - 1];
      return l.points[l.points.length - 1];
    };
    tool();
    point(100, 100);
    point(300, 130);
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(end()[0]).toBeCloseTo(200);
    expect(end()[1]).toBeCloseTo(30);
    act(() => h.app.vrijTrace.setUI({ snap: "90" }));
    tool();
    point(100, 400);
    point(300, 430);
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(end()[0]).toBeCloseTo(Math.hypot(200, 30));
    expect(end()[1]).toBeCloseTo(0);
  });

  it("starts a branch exactly on an existing trench line", () => {
    API.setElements([pdfPage()]);
    tool();
    point(100, 300);
    point(500, 300);
    Keyboard.keyPress(KEYS.ESCAPE);
    tool();
    point(300, 306);
    point(300, 500);
    Keyboard.keyPress(KEYS.ESCAPE);
    const branch = lines()[1];
    expect(branch.x).toBeCloseTo(300);
    expect(branch.y).toBeCloseTo(300);
  });

  it("never creates two networks for one page", () => {
    API.setElements([pdfPage()]);
    for (const y of [100, 300]) {
      tool();
      point(100, y);
      point(300, y);
      Keyboard.keyPress(KEYS.ESCAPE);
    }
    act(() => h.app.vrijTrace.updateSettings({ treeMinM: 4 }, true));
    expect(
      h.elements.filter(
        (e) => e.type === "trench" && (e as any).trench.kind === "network",
      ),
    ).toHaveLength(1);
  });

  it("never moves a tree onto another page", () => {
    API.setElements([pdfPage(), pdfPage({ id: "pdf2", x: 1200 })]);
    tool();
    act(() => h.app.vrijTrace.setMode("boomToevoegen"));
    click(300, 300);
    const tree = parts().trees[0];
    expect(tree).toBeDefined();
    // elements are mutated in place: keep the numbers, not the object
    const treeX = tree.x;
    // still in "Verplaats B1" mode: a click on the other page must not take B1 along
    click(1500, 300);
    const after = h.elements.find((e) => e.id === tree.id)!;
    expect(after.x).toBeCloseTo(treeX);
    expect(after.customData?.pdfParentId).toBe("pdf1");
    expect(h.state.vrijTrace.activeTreeId).toBeNull();
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

  it("draws no trench when a second finger starts a pinch", () => {
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
    fireEvent.pointerDown(canvas, touch(2, 300));
    fireEvent.pointerUp(canvas, touch(2, 320));
    fireEvent.pointerUp(canvas, touch(1, 80));
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
