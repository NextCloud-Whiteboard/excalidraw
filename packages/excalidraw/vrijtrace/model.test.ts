import {
  newImageElement,
  newLinearElement,
  newTrenchElement,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import {
  displayLabels,
  getPageFrame,
  getPageParts,
  nextTreeLabel,
  pageState,
  pageToScene,
  sceneToPage,
  toGeometry,
} from "./model";

const page = (over: any = {}) =>
  ({
    ...newImageElement({
      type: "image",
      x: 100,
      y: 50,
      width: 1000,
      height: 700,
      fileId: "f" as any,
    }),
    id: "pdf1",
    customData: { isPdf: true, pdfCmPerPx: 5 },
    ...over,
  } as any);
const node = (id: string, x: number, y: number) =>
  newTrenchElement({
    id,
    trench: { kind: "node" },
    pdfParentId: "pdf1",
    x: x - 0.5,
    y: y - 0.5,
  });
const seg = (id: string, a: string, b: string) =>
  newTrenchElement({
    id,
    trench: { kind: "segment", a, b, widthM: 1 },
    pdfParentId: "pdf1",
    x: 0,
    y: 0,
  });
const line = (
  id: string,
  x: number,
  y: number,
  pts: [number, number][],
  customData: any = { tool: "trench", widthM: 1, pdfParentId: "pdf1" },
  over: any = {},
) => ({
  ...newLinearElement({
    type: "line",
    x,
    y,
    points: pts.map(([px, py]) => pointFrom<LocalPoint>(px, py)),
    customData,
  }),
  id,
  ...over,
});
const tree = (id: string, label: string) =>
  newTrenchElement({
    id,
    trench: { kind: "tree", label },
    pdfParentId: "pdf1",
    x: 0,
    y: 0,
  });

describe("page frame", () => {
  it("round-trips scene ⇄ metres, also when rotated", () => {
    const f = getPageFrame(page({ angle: 0.4 }));
    const p = { x: 420.5, y: 333.25 };
    const back = pageToScene(f, sceneToPage(f, p));
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
    // 20 px at 5 cm/px = 1 m
    const m = sceneToPage(getPageFrame(page()), { x: 120, y: 50 });
    expect(m.x).toBeCloseTo(1, 9);
    expect(m.y).toBeCloseTo(0, 9);
  });
});

describe("valid geometry", () => {
  it("keeps only segments with two existing, distinct, separated nodes", () => {
    const els = [
      page(),
      node("n1", 200, 200),
      node("n2", 400, 200),
      node("n3", 401, 220),
      seg("s1", "n1", "n2"),
      seg("s2", "n2", "n3"),
      seg("s3", "n1", "gone"),
      seg("s4", "n1", "n1"),
    ];
    const g = toGeometry(getPageParts(els, "pdf1"), getPageFrame(els[0]));
    expect(g.segments.map((s) => s.id)).toEqual(["s1", "s2"]);
    const els2 = [
      page(),
      node("n1", 200, 200),
      node("n2", 201, 201),
      seg("s1", "n1", "n2"),
    ];
    expect(
      toGeometry(getPageParts(els2, "pdf1"), getPageFrame(els2[0])).segments,
    ).toEqual([]);
  });
});

describe("fingerprint follows the page", () => {
  const build = (p: any, nodes: [number, number][]) => [
    p,
    ...nodes.map(([x, y], i) => node(`n${i}`, x, y)),
    seg("s1", "n0", "n1"),
    seg("s2", "n1", "n2"),
  ];
  const pts: [number, number][] = [
    [300, 200],
    [600, 200],
    [600, 500],
  ];
  const fp = (els: any[]) => pageState(els, els[0])!.fingerprint;

  it("is unchanged when the page moves", () => {
    expect(
      fp(
        build(
          page({ x: 600, y: 350 }),
          pts.map(([x, y]) => [x + 500, y + 300]),
        ),
      ),
    ).toBe(fp(build(page(), pts)));
  });
  it("is unchanged when the page is resized (calibration rescaled)", () => {
    const k = 1.37;
    const resized = page({
      width: 1000 * k,
      height: 700 * k,
      customData: { isPdf: true, pdfCmPerPx: 5 / k },
    });
    expect(
      fp(
        build(
          resized,
          pts.map(([x, y]) => [100 + (x - 100) * k, 50 + (y - 50) * k]),
        ),
      ),
    ).toBe(fp(build(page(), pts)));
  });
  it("is unchanged when the page is rotated", () => {
    const rotated = page({ angle: 0.4 });
    const f = getPageFrame(rotated);
    const straight = getPageFrame(page());
    const moved = pts.map(([x, y]) => {
      const s = pageToScene(f, sceneToPage(straight, { x, y }));
      return [s.x, s.y] as [number, number];
    });
    expect(fp(build(rotated, moved))).toBe(fp(build(page(), pts)));
  });
  it("changes when the page is recalibrated", () => {
    expect(
      fp(build(page({ customData: { isPdf: true, pdfCmPerPx: 5.5 } }), pts)),
    ).not.toBe(fp(build(page(), pts)));
  });
  it("is null for an uncalibrated page", () => {
    const p = page({ customData: { isPdf: true } });
    expect(pageState([p], p)).toBeNull();
  });
});

describe("tree labels", () => {
  it("fills the lowest free number and marks duplicates", () => {
    expect(nextTreeLabel([tree("t1", "B1"), tree("t3", "B3")])).toBe("B2");
    const labels = displayLabels([
      tree("b", "B4"),
      tree("a", "B4"),
      tree("c", "B1"),
    ]);
    expect([labels.get("a"), labels.get("b"), labels.get("c")]).toEqual([
      "B4",
      "B4b",
      "B1",
    ]);
  });
});

describe("trench lines", () => {
  const geometry = (els: any[]) =>
    toGeometry(getPageParts(els, "pdf1"), getPageFrame(els[0]));
  const near = (p: { x: number; y: number }, x: number, y: number) => {
    expect(p.x).toBeCloseTo(x, 6);
    expect(p.y).toBeCloseTo(y, 6);
  };

  it("turns each pair of points into a segment with the line's width", () => {
    const els = [
      page(),
      line(
        "L1",
        200,
        200,
        [
          [0, 0],
          [200, 0],
          [200, 100],
        ],
        { tool: "trench", widthM: 0.8, pdfParentId: "pdf1" },
      ),
    ];
    expect(getPageParts(els, "pdf1").lines.map((l) => l.id)).toEqual(["L1"]);
    const g = geometry(els);
    expect(g.segments).toEqual([
      { id: "L1:0", a: "L1:0", b: "L1:1", widthM: 0.8 },
      { id: "L1:1", a: "L1:1", b: "L1:2", widthM: 0.8 },
    ]);
    // page at (100, 50), 5 cm/px
    near(g.nodes[0], 5, 7.5);
    near(g.nodes[2], 15, 12.5);
  });

  it("ignores ordinary, ruler, deleted and other pages' lines", () => {
    const pts: [number, number][] = [
      [0, 0],
      [200, 0],
    ];
    const els = [
      page(),
      line("plain", 200, 200, pts, { pdfParentId: "pdf1" }),
      line("ruler", 200, 200, pts, { tool: "ruler", pdfParentId: "pdf1" }),
      line("gone", 200, 200, pts, undefined, { isDeleted: true }),
      line("other", 200, 200, pts, { tool: "trench", pdfParentId: "pdf2" }),
    ];
    expect(getPageParts(els, "pdf1").lines).toEqual([]);
    expect(geometry(els).segments).toEqual([]);
  });

  it("follows a rotated line", () => {
    const els = [
      page(),
      line(
        "L1",
        200,
        200,
        [
          [0, 0],
          [200, 0],
        ],
        undefined,
        { angle: Math.PI / 2 },
      ),
    ];
    const g = geometry(els);
    near(g.nodes[0], 10, 2.5);
    near(g.nodes[1], 10, 12.5);
  });

  const edge = (reference: string, pts: [number, number][], widthM = 1) =>
    geometry([
      page(),
      line("L1", 300, 300, pts, {
        tool: "trench",
        widthM,
        reference,
        pdfParentId: "pdf1",
      }),
    ]).nodes;
  // page at (100, 50), 5 cm/px: the line at (300, 300) is at (10 m, 12.5 m)
  const east: [number, number][] = [
    [0, 0],
    [200, 0],
  ];
  const west: [number, number][] = [
    [200, 0],
    [0, 0],
  ];
  const south: [number, number][] = [
    [0, 0],
    [0, 200],
  ];
  const north: [number, number][] = [
    [0, 200],
    [0, 0],
  ];

  it("Bovenrand: the line is the top edge, the trench lies below it, either way drawn", () => {
    for (const pts of [east, west]) {
      for (const n of edge("boven", pts)) {
        expect(n.y).toBeCloseTo(13, 6);
      }
    }
  });

  it("Onderrand: the line is the bottom edge, the trench lies above it", () => {
    for (const pts of [east, west]) {
      for (const n of edge("onder", pts, 2)) {
        expect(n.y).toBeCloseTo(11.5, 6);
      }
    }
  });

  it("Linker rand: the line is the left edge, the trench lies to its right on the plan", () => {
    for (const pts of [south, north]) {
      for (const n of edge("links", pts)) {
        expect(n.x).toBeCloseTo(10.5, 6);
      }
    }
  });

  it("Rechter rand: the line is the right edge, the trench lies to its left", () => {
    for (const pts of [south, north]) {
      for (const n of edge("rechts", pts)) {
        expect(n.x).toBeCloseTo(9.5, 6);
      }
    }
  });

  it("keeps an edge's side along a whole line, mitred at corners", () => {
    // east, then south: overall it runs down to the right; the trench lies
    // below the top edge, so the corner moves down-left by ½ m
    const [a, b, c] = edge("boven", [
      [0, 0],
      [200, 0],
      [200, 200],
    ]);
    near(a, 10, 13);
    near(b, 19.5, 13);
    near(c, 19.5, 22.5);
  });

  it("allows trench widths up to 10 m", () => {
    const g = (widthM: number) =>
      geometry([
        page(),
        line("L1", 300, 300, east, {
          tool: "trench",
          widthM,
          pdfParentId: "pdf1",
        }),
      ]).segments[0].widthM;
    expect(g(10)).toBe(10);
    expect(g(25)).toBe(10);
    expect(g(0.1)).toBe(0.3);
  });

  it("keeps the fingerprint when the page moves with its trench lines", () => {
    const pts: [number, number][] = [
      [0, 0],
      [300, 0],
      [300, 200],
    ];
    const fp = (els: any[]) => pageState(els, els[0])!.fingerprint;
    const moved = [page({ x: 600, y: 350 }), line("L1", 700, 500, pts)];
    expect(pageState(moved, moved[0])!.geometry.segments).toHaveLength(2);
    expect(fp(moved)).toBe(fp([page(), line("L1", 200, 200, pts)]));
  });
});
