import React from "react";
import {
  act,
  fireEvent,
  queryByTestId,
  queryByText,
} from "@testing-library/react";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const pdfPage = (id: string, x: number, calibrated?: number) => ({
  ...API.createElement({
    type: "image",
    id,
    x,
    y: 0,
    width: 1000,
    height: 700,
  }),
  customData: {
    isPdf: true,
    pdfDocId: "doc1",
    ...(calibrated ? { pdfCmPerPx: calibrated } : {}),
  },
});
const rulers = () =>
  h.elements.filter((e: any) => e.customData?.tool === "ruler" && !e.isDeleted);

describe("ruler: the first line asks for its real length", () => {
  let container: HTMLElement;
  const byId = (id: string) => queryByTestId(container, id);
  const drawRuler = (x1: number, y1: number, x2: number, y2: number) => {
    act(() => h.app.setActiveTool({ type: "custom", customType: "ruler" }));
    mouse.reset();
    mouse.downAt(x1, y1);
    mouse.moveTo(x2, y2);
    mouse.upAt(x2, y2);
  };
  const answer = (value: string, unit = "m") => {
    fireEvent.change(byId("ruler-calibration-length")!, { target: { value } });
    fireEvent.change(byId("ruler-calibration-unit")!, {
      target: { value: unit },
    });
    fireEvent.click(byId("ruler-calibration-apply")!);
  };

  beforeEach(async () => {
    ({ container } = await render(
      <Excalidraw handleKeyboardGlobally={true} />,
    ));
  });

  it("asks right after the first line on an uncalibrated PDF", () => {
    API.setElements([pdfPage("pdf1", 0), pdfPage("pdf2", 1100)]);
    drawRuler(100, 100, 400, 100);
    const line = rulers()[0];
    expect(line).toBeDefined();
    expect(h.state.rulerCalibration).toEqual({ elementId: line.id });
    expect(byId("ruler-calibration")).not.toBeNull();
  });

  it("calibrates every page of that PDF with the answer", () => {
    API.setElements([pdfPage("pdf1", 0), pdfPage("pdf2", 1100)]);
    drawRuler(100, 100, 400, 100);
    answer("15", "m");
    const pages = h.elements.filter((e: any) => e.customData?.isPdf);
    // 300 px = 15 m → 5 cm per px, on both pages of the document
    for (const p of pages) {
      expect(p.customData?.pdfCmPerPx).toBeCloseTo(5);
    }
    expect(h.state.selectedMetric).toBe("m");
    expect(h.state.rulerCalibration).toBeNull();
    expect(byId("ruler-calibration")).toBeNull();
  });

  it("refuses an empty or zero length and keeps asking", () => {
    API.setElements([pdfPage("pdf1", 0)]);
    drawRuler(100, 100, 400, 100);
    answer("0");
    expect(byId("ruler-calibration-error")).not.toBeNull();
    expect(h.elements[0].customData?.pdfCmPerPx).toBeUndefined();
    answer("2,5", "m");
    expect(h.elements[0].customData?.pdfCmPerPx).toBeCloseTo(250 / 300);
  });

  it("Not now closes the question and keeps the line without a scale", () => {
    API.setElements([pdfPage("pdf1", 0)]);
    drawRuler(100, 100, 400, 100);
    fireEvent.click(byId("ruler-calibration-later")!);
    expect(h.state.rulerCalibration).toBeNull();
    expect(rulers()).toHaveLength(1);
    expect(h.elements[0].customData?.pdfCmPerPx).toBeUndefined();
  });

  it("moves the question to a newer line drawn while it is open", () => {
    API.setElements([pdfPage("pdf1", 0)]);
    drawRuler(100, 100, 400, 100);
    drawRuler(100, 300, 200, 300);
    const [, second] = rulers();
    expect(h.state.rulerCalibration).toEqual({ elementId: second.id });
  });

  it("does not ask on a PDF that is already calibrated", () => {
    API.setElements([pdfPage("pdf1", 0, 5)]);
    drawRuler(100, 100, 400, 100);
    expect(h.state.rulerCalibration).toBeNull();
  });

  it("asks once for the board when the line is not on a PDF", () => {
    drawRuler(100, 100, 400, 100);
    expect(h.state.rulerCalibration).not.toBeNull();
    answer("3", "m");
    expect(h.state.cmPerPx).toBeCloseTo(1);
    expect(h.state.cmPerPxCalibrated).toBe(true);
    drawRuler(100, 300, 200, 300);
    expect(h.state.rulerCalibration).toBeNull();
  });

  it("opens the question when a line without a scale is selected", () => {
    API.setElements([pdfPage("pdf1", 0)]);
    drawRuler(100, 100, 400, 100);
    fireEvent.click(byId("ruler-calibration-later")!);
    const line = rulers()[0];
    act(() => h.app.setActiveTool({ type: "selection" }));
    // click away, then on the line
    API.setSelectedElements([]);
    API.setSelectedElements([line]);
    expect(h.state.rulerCalibration).toEqual({ elementId: line.id });
  });

  it("hides the Set scale panel until there is a scale", () => {
    API.setElements([pdfPage("pdf1", 0)]);
    drawRuler(100, 100, 400, 100);
    API.setSelectedElements([rulers()[0]]);
    expect(queryByText(container, "Set scale")).toBeNull();
    answer("15", "m");
    API.setSelectedElements([rulers()[0]]);
    expect(queryByText(container, "Set scale")).not.toBeNull();
  });
});
