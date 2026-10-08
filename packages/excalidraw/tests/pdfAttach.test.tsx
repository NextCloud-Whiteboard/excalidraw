import React from "react";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { render } from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

const createPdfPage = (
  id: string,
  x: number,
  customData: Record<string, unknown> = {},
) => ({
  ...API.createElement({
    type: "image",
    id,
    x,
    y: 0,
    width: 1000,
    height: 1000,
  }),
  customData: { isPdf: true, ...customData },
});

const createRectangle = (
  x: number,
  y: number,
  customData?: Record<string, unknown>,
) => ({
  ...API.createElement({
    type: "rectangle",
    id: "rect1",
    x,
    y,
    width: 200,
    height: 100,
    backgroundColor: "#ffffff",
    fillStyle: "solid",
  }),
  customData,
});

const getRectangle = () =>
  h.elements.find((element) => element.id === "rect1") as ExcalidrawElement;

// client == scene coordinates at the default scroll and zoom
const dragRectangleCentreTo = (x: number, y: number) => {
  const rectangle = getRectangle();
  API.setSelectedElements([rectangle]);
  mouse.reset();
  mouse.downAt(
    rectangle.x + rectangle.width / 2,
    rectangle.y + rectangle.height / 2,
  );
  mouse.moveTo(x, y);
  mouse.upAt(x, y);
};

describe("moving elements onto a PDF page", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    API.setAppState({ cmPerPx: 1 });
  });

  it("attaches a hand-drawn element without resizing it", () => {
    API.setElements([
      createPdfPage("pdf1", 0, { pdfCmPerPx: 2 }),
      createRectangle(-600, 0),
    ]);

    dragRectangleCentreTo(500, 500);

    const rectangle = getRectangle();
    expect(rectangle.width).toBe(200);
    expect(rectangle.height).toBe(100);
    expect(rectangle.customData?.pdfParentId).toBe("pdf1");
  });

  it("rescales a library item to the page's calibration", () => {
    API.setElements([
      createPdfPage("pdf1", 0, { pdfCmPerPx: 2 }),
      createRectangle(-600, 0, { libraryCmPerPx: 1 }),
    ]);

    dragRectangleCentreTo(500, 500);

    const rectangle = getRectangle();
    expect(rectangle.width).toBeCloseTo(100);
    expect(rectangle.height).toBeCloseTo(50);
    expect(rectangle.x + rectangle.width / 2).toBeCloseTo(500, 0);
    expect(rectangle.y + rectangle.height / 2).toBeCloseTo(500, 0);
    expect(rectangle.customData?.pdfParentId).toBe("pdf1");
    expect(rectangle.customData?.libraryCmPerPx).toBe(2);
  });

  it("rescales a library item moved from one page to another", () => {
    API.setElements([
      createPdfPage("pdfA", 0, { pdfCmPerPx: 2 }),
      createPdfPage("pdfB", 2000, { pdfCmPerPx: 0.5 }),
      createRectangle(400, 450, { libraryCmPerPx: 2, pdfParentId: "pdfA" }),
    ]);

    dragRectangleCentreTo(2500, 500);

    const rectangle = getRectangle();
    expect(rectangle.width).toBeCloseTo(800);
    expect(rectangle.height).toBeCloseTo(400);
    expect(rectangle.customData?.pdfParentId).toBe("pdfB");
    expect(rectangle.customData?.libraryCmPerPx).toBe(0.5);
  });

  it("leaves a library item alone when moved within its page", () => {
    API.setElements([
      createPdfPage("pdf1", 0, { pdfCmPerPx: 2 }),
      createRectangle(100, 100, { libraryCmPerPx: 2, pdfParentId: "pdf1" }),
    ]);

    dragRectangleCentreTo(600, 600);

    const rectangle = getRectangle();
    expect(rectangle.width).toBe(200);
    expect(rectangle.customData?.pdfParentId).toBe("pdf1");
  });

  it("attaches to an uncalibrated page without resizing", () => {
    API.setElements([
      createPdfPage("pdf1", 0),
      createRectangle(-600, 0, { libraryCmPerPx: 1 }),
    ]);

    dragRectangleCentreTo(500, 500);

    const rectangle = getRectangle();
    expect(rectangle.width).toBe(200);
    expect(rectangle.customData?.pdfParentId).toBe("pdf1");
    expect(rectangle.customData?.libraryCmPerPx).toBe(1);
  });

  it("leaves elements moved off any page alone", () => {
    API.setElements([
      createPdfPage("pdf1", 0, { pdfCmPerPx: 2 }),
      createRectangle(-600, 0, { libraryCmPerPx: 1 }),
    ]);

    dragRectangleCentreTo(-300, 500);

    const rectangle = getRectangle();
    expect(rectangle.width).toBe(200);
    expect(rectangle.customData?.pdfParentId).toBeUndefined();
  });

  it("undoes the move, resize and attachment in one step", () => {
    API.updateScene({
      elements: [
        createPdfPage("pdf1", 0, { pdfCmPerPx: 2 }),
        createRectangle(-600, 0, { libraryCmPerPx: 1 }),
      ],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    const undoStackBefore = API.getUndoStack().length;

    dragRectangleCentreTo(500, 500);
    expect(API.getUndoStack().length).toBe(undoStackBefore + 1);
    Keyboard.undo();

    const rectangle = getRectangle();
    expect(rectangle.x).toBe(-600);
    expect(rectangle.width).toBe(200);
    expect(rectangle.customData?.pdfParentId).toBeUndefined();
  });
});
