import { newImageElement, newTrenchElement } from "@excalidraw/element";

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
