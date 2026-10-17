import React from "react";
import { act, fireEvent } from "@testing-library/react";

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
const tool = () =>
  act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
const click = (x: number, y: number) => {
  mouse.reset();
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
    expect(parts().nodes).toHaveLength(0);
  });

  it("asks for a calibration first", () => {
    API.setElements([pdfPage({ customData: { isPdf: true } })]);
    tool();
    click(100, 100);
    expect(h.state.toast?.message).toBe(
      "Kalibreer eerst de liniaal op deze pagina",
    );
  });

  it("draws a segment with two clicks, creating the page's network once", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    click(300, 104);
    const p = parts();
    expect(p.network?.id).toBe("vrijtrace-pdf1");
    expect(p.nodes).toHaveLength(2);
    expect(p.segments).toHaveLength(1);
    expect(p.nodes.every((n) => n.locked && n.width === 1)).toBe(true);
    expect(h.state.vrijTrace.pageId).toBe("pdf1");
  });

  it("makes one undo step per segment", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    click(300, 100);
    click(300, 300);
    expect(parts().segments).toHaveLength(2);
    Keyboard.undo();
    expect(parts().segments).toHaveLength(1);
  });

  it("drops a draft when its page disappears", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    API.setElements([]);
    click(300, 100);
    expect(h.elements.filter((e) => e.type === "trench")).toHaveLength(0);
    expect(h.state.vrijTrace.draft).toBeNull();
  });

  it("never creates two networks for one page", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    click(300, 100);
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
    expect(h.state.vrijTrace.draft).toBeNull();
    expect(parts().nodes).toHaveLength(0);
  });

  it("drops the draft when a second finger starts a pinch", () => {
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
    expect(h.state.vrijTrace.draft).not.toBeNull();
    fireEvent.pointerDown(canvas, touch(2, 300));
    fireEvent.pointerUp(canvas, touch(2, 320));
    fireEvent.pointerUp(canvas, touch(1, 80));
    expect(h.state.vrijTrace.draft).toBeNull();
    expect(parts().segments).toHaveLength(0);
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
