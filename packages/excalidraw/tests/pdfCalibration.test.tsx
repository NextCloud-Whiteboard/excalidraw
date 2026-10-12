import React from "react";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { actionDistanceConversion } from "../actions/actionDistanceConversion";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, UI } from "./helpers/ui";
import { render } from "./test-utils";

const { h } = window;

const createPdfPage = (
  id: string,
  customData: Record<string, unknown> = {},
) => ({
  ...API.createElement({
    type: "image",
    id,
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  }),
  customData: { isPdf: true, ...customData },
});

const createRectangle = (
  id: string,
  x: number,
  y: number,
  customData: Record<string, unknown>,
  groupIds: string[] = [],
) => ({
  ...API.createElement({
    type: "rectangle",
    id,
    x,
    y,
    width: 200,
    height: 100,
    groupIds,
  }),
  customData,
});

const getElement = (id: string) =>
  h.elements.find((element) => element.id === id) as ExcalidrawElement;

const recalibrate = (pdfCalibration: {
  pdfId?: string;
  pdfDocId?: string;
  cmPerPx: number;
}) => {
  API.executeAction(actionDistanceConversion, { pdfCalibration });
};

describe("recalibrating a PDF page", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("resizes library items on it around their own centre", () => {
    API.setElements([
      createPdfPage("pdf1", { pdfCmPerPx: 2 }),
      createRectangle("item1", 100, 100, {
        pdfParentId: "pdf1",
        libraryCmPerPx: 2,
      }),
    ]);

    recalibrate({ pdfId: "pdf1", cmPerPx: 4 });

    const item = getElement("item1");
    expect(item.width).toBeCloseTo(100);
    expect(item.height).toBeCloseTo(50);
    expect(item.x + item.width / 2).toBeCloseTo(200);
    expect(item.y + item.height / 2).toBeCloseTo(150);
    expect(item.customData?.libraryCmPerPx).toBe(4);
    expect(getElement("pdf1").customData?.pdfCmPerPx).toBe(4);
  });

  it("leaves hand-drawn elements on it alone", () => {
    API.setElements([
      createPdfPage("pdf1", { pdfCmPerPx: 2 }),
      createRectangle("drawn1", 100, 100, { pdfParentId: "pdf1" }),
    ]);

    recalibrate({ pdfId: "pdf1", cmPerPx: 4 });

    expect(getElement("drawn1").width).toBe(200);
  });

  it("resizes items calibrated for the first time from board scale", () => {
    API.setElements([
      createPdfPage("pdf1"),
      createRectangle("item1", 100, 100, {
        pdfParentId: "pdf1",
        libraryCmPerPx: 1,
      }),
    ]);

    recalibrate({ pdfId: "pdf1", cmPerPx: 2 });

    expect(getElement("item1").width).toBeCloseTo(100);
    expect(getElement("item1").customData?.libraryCmPerPx).toBe(2);
  });

  it("resizes items on sibling pages of the same document", () => {
    API.setElements([
      createPdfPage("pdf1", { pdfCmPerPx: 2, pdfDocId: "doc" }),
      { ...createPdfPage("pdf2", { pdfCmPerPx: 2, pdfDocId: "doc" }), x: 2000 },
      createRectangle("item2", 2100, 100, {
        pdfParentId: "pdf2",
        libraryCmPerPx: 2,
      }),
    ]);

    recalibrate({ pdfId: "pdf1", pdfDocId: "doc", cmPerPx: 4 });

    expect(getElement("pdf2").customData?.pdfCmPerPx).toBe(4);
    expect(getElement("item2").width).toBeCloseTo(100);
  });

  it("resizes a grouped item as one, around the group's centre", () => {
    const customData = { pdfParentId: "pdf1", libraryCmPerPx: 2 };
    API.setElements([
      createPdfPage("pdf1", { pdfCmPerPx: 2 }),
      createRectangle("left", 100, 100, customData, ["g1"]),
      createRectangle("right", 500, 100, customData, ["g1"]),
    ]);

    recalibrate({ pdfId: "pdf1", cmPerPx: 4 });

    // group spans x 100..700 (centre 400) -> halved: 250..550
    expect(getElement("left").x).toBeCloseTo(250);
    expect(getElement("left").width).toBeCloseTo(100);
    expect(getElement("right").x).toBeCloseTo(450);
    expect(getElement("right").width).toBeCloseTo(100);
  });

  it("undoes the calibration and the resize in one step", () => {
    API.updateScene({
      elements: [
        createPdfPage("pdf1", { pdfCmPerPx: 2 }),
        createRectangle("item1", 100, 100, {
          pdfParentId: "pdf1",
          libraryCmPerPx: 2,
        }),
      ],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    recalibrate({ pdfId: "pdf1", cmPerPx: 4 });
    Keyboard.undo();

    expect(getElement("item1").width).toBe(200);
    expect(getElement("pdf1").customData?.pdfCmPerPx).toBe(2);
  });
});

describe("resizing a PDF page", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  it("keeps its calibration and its library items' scale true", () => {
    API.setElements([
      createPdfPage("pdf1", { pdfCmPerPx: 2 }),
      createRectangle("item1", 100, 100, {
        pdfParentId: "pdf1",
        libraryCmPerPx: 2,
      }),
    ]);

    // double the page: every pixel is now worth half as many cm
    UI.resize(getElement("pdf1"), "se", [1000, 1000]);

    const pdf = getElement("pdf1");
    expect(pdf.width).toBeCloseTo(2000);
    expect(pdf.customData?.pdfCmPerPx).toBeCloseTo(1);
    const item = getElement("item1");
    expect(item.width).toBeCloseTo(400);
    expect(item.customData?.libraryCmPerPx).toBeCloseTo(1);
  });

  it("leaves an uncalibrated page uncalibrated", () => {
    API.setElements([createPdfPage("pdf1")]);

    UI.resize(getElement("pdf1"), "se", [1000, 1000]);

    expect(getElement("pdf1").customData?.pdfCmPerPx).toBeUndefined();
  });
});
