import { API } from "../tests/helpers/api";

import { planLabels } from "./labels";

const page = {
  ...API.createElement({
    type: "image",
    id: "pdf1",
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
  }),
  customData: { isPdf: true, pdfCmPerPx: 5 },
} as any;

const line = (id: string, x: number, y: number, points: number[][]) => ({
  ...API.createElement({ type: "line", id, x, y }),
  points,
  customData: { tool: "trench", pdfParentId: "pdf1", widthM: 1 },
});

const tree = (id: string, cx: number, cy: number, r: number) => ({
  ...API.createElement({
    type: "ellipse",
    id,
    x: cx - r,
    y: cy - r,
    width: 2 * r,
    height: 2 * r,
  }),
  customData: {
    treeRing: { klasse: "C1", scherm: false },
    pdfParentId: "pdf1",
    libraryCmPerPx: 5,
  },
});

const avp = {
  ...API.createElement({
    type: "rectangle",
    id: "a1",
    x: 700,
    y: 400,
    width: 50,
    height: 50,
  }),
  customData: {
    pdfParentId: "pdf1",
    libraryCmPerPx: 5,
    libraryItemId: "avp",
  },
};

describe("planLabels", () => {
  it("numbers the sleuven, trees and other elements of a page like the panel's lists", () => {
    const labels = planLabels(
      [
        page,
        line("l1", 100, 300, [
          [0, 0],
          [400, 0],
        ]),
        line("l2", 500, 300, [
          [0, 0],
          [0, -200],
        ]),
        tree("t1", 200, 150, 40),
        avp,
      ],
      page,
    );
    expect(labels.map((l) => [l.kind, l.n])).toEqual([
      ["line", 1],
      ["line", 2],
      ["tree", 1],
      ["element", 1],
    ]);
  });

  it("puts a sleuf's label halfway along it, a tree's by its ring, an element's at its corner", () => {
    const labels = planLabels(
      [
        page,
        line("l1", 100, 300, [
          [0, 0],
          [400, 0],
          [400, -200],
        ]),
        tree("t1", 200, 150, 40),
        avp,
      ],
      page,
    );
    // 600 px long: halfway is 300 px along, still on the first leg
    expect(labels[0]).toMatchObject({ x: 400, y: 300 });
    // top right of the ring
    expect(labels[1].x).toBeCloseTo(200 + 40 * Math.SQRT1_2, 5);
    expect(labels[1].y).toBeCloseTo(150 - 40 * Math.SQRT1_2, 5);
    // top right corner of the AVP
    expect(labels[2]).toMatchObject({ kind: "element", x: 750, y: 400 });
  });

  it("marks a tree the trench reaches", () => {
    const labels = planLabels(
      [
        page,
        line("l1", 100, 150, [
          [0, 0],
          [400, 0],
        ]),
        tree("t1", 200, 160, 40),
      ],
      page,
    );
    expect(labels.find((l) => l.kind.startsWith("tree"))!.kind).toBe(
      "tree-bad",
    );
  });

  it("has nothing for a page not yet calibrated", () => {
    const raw = { ...page, customData: { isPdf: true } };
    expect(planLabels([raw, avp], raw)).toEqual([]);
  });
});
