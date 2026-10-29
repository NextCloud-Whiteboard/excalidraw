import {
  isBoardCalibrated,
  rulerLabel,
  rulerLengthPx,
  rulerScale,
} from "./calibration";

const page = (pdfCmPerPx?: number) => ({
  id: "pdf1",
  type: "image",
  customData: {
    isPdf: true,
    pdfDocId: "doc1",
    ...(pdfCmPerPx ? { pdfCmPerPx } : {}),
  },
});
const ruler = (onPdf: boolean) => ({
  id: "r1",
  type: "line",
  x: 0,
  y: 0,
  width: 300,
  height: 400,
  angle: 0,
  points: [
    [0, 0],
    [300, 400],
  ],
  customData: { tool: "ruler", ...(onPdf ? { pdfParentId: "pdf1" } : {}) },
});
const map = (...els: any[]) => new Map(els.map((e) => [e.id, e]));
const board = (over: any = {}) => ({
  cmPerPx: 1,
  cmPerPxCalibrated: false,
  selectedMetric: "cm",
  ...over,
});

describe("ruler scale", () => {
  it("uses the PDF's own calibration", () => {
    expect(rulerScale(ruler(true) as any, map(page(5)), board())).toBe(5);
  });

  it("has no scale on an uncalibrated PDF, even when the board has one", () => {
    expect(
      rulerScale(
        ruler(true) as any,
        map(page()),
        board({ cmPerPx: 2, cmPerPxCalibrated: true }),
      ),
    ).toBeNull();
  });

  it("has no scale off a PDF until the board is calibrated", () => {
    expect(rulerScale(ruler(false) as any, map(), board())).toBeNull();
    expect(
      rulerScale(
        ruler(false) as any,
        map(),
        board({ cmPerPx: 3, cmPerPxCalibrated: true }),
      ),
    ).toBe(3);
  });

  it("treats a board scale changed from the default as calibrated (older boards)", () => {
    expect(isBoardCalibrated(board({ cmPerPx: 2.5 }))).toBe(true);
    expect(isBoardCalibrated(board())).toBe(false);
  });

  it("measures the line and labels it, or shows ? without a scale", () => {
    expect(rulerLengthPx(ruler(true) as any)).toBe(500);
    expect(
      rulerLabel(
        ruler(true) as any,
        map(page(2)),
        board({ selectedMetric: "m" }),
      ),
    ).toBe("10 m");
    expect(rulerLabel(ruler(true) as any, map(page()), board())).toBe("?");
  });
});
