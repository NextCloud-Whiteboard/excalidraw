import {
  addSegment,
  deleteSegment,
  diffWorking,
  dropNode,
  drawEndpoints,
} from "./editing";

import type { DrawOptions, Working } from "./editing";

let n = 0;
const opts = (over: Partial<DrawOptions> = {}): DrawOptions => ({
  snap: "90",
  reference: "midden",
  widthM: 1,
  pxPerMetre: 20,
  snapPx: 13,
  newId: () => `id${++n}`,
  ...over,
});
const empty = (): Working => ({ nodes: [], segments: [] });

describe("drawing (v8.2 rules)", () => {
  it("snaps to 90° by default", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 100, y: 3 }, opts());
    expect(w.nodes.map(({ x, y }) => [Math.round(x), Math.round(y)])).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect(w.segments).toHaveLength(1);
  });

  it("snaps to 45° and draws free", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 100, y: 90 }, opts({ snap: "45" }));
    const end = w.nodes[1];
    expect(end.x).toBeCloseTo(end.y, 6);
    const v = empty();
    addSegment(v, { x: 0, y: 0 }, { x: 100, y: 90 }, opts({ snap: "vrij" }));
    expect(v.nodes[1]).toMatchObject({ x: 100, y: 90 });
  });

  it("ends on a segment as a T-junction", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 200, y: 0 }, opts());
    addSegment(w, { x: 100, y: -100 }, { x: 100, y: 0 }, opts());
    expect(w.segments).toHaveLength(3);
    expect(w.nodes).toHaveLength(4);
  });

  it("splits both lines where it crosses", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 200, y: 0 }, opts());
    addSegment(w, { x: 100, y: -100 }, { x: 100, y: 100 }, opts());
    expect(w.segments).toHaveLength(4);
    expect(w.nodes).toHaveLength(5);
  });

  it("offsets a left-edge reference by half the width (v8.2: -½w·n)", () => {
    const line = drawEndpoints(
      empty(),
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      opts({ reference: "links" }),
    );
    expect(line!.a.y).toBeCloseTo(10, 6);
  });

  it("starts at an existing node within the snap distance", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 100, y: 0 }, opts());
    addSegment(w, { x: 105, y: 4 }, { x: 105, y: 100 }, opts());
    expect(w.nodes).toHaveLength(3);
  });
});

describe("moving and deleting", () => {
  it("merges a dropped node into a nearby one", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 100, y: 0 }, opts());
    addSegment(w, { x: 200, y: 0 }, { x: 200, y: 100 }, opts());
    const moved = w.nodes[1];
    Object.assign(moved, { x: 195, y: 2 });
    dropNode(w, moved.id, 12);
    expect(w.nodes).toHaveLength(3);
    expect(w.segments).toHaveLength(2);
  });

  it("survives dropping a node onto the other end of its own segment", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 100, y: 0 }, opts());
    addSegment(w, { x: 100, y: 0 }, { x: 100, y: 100 }, opts());
    const end = w.nodes.find((x) => x.x === 100 && x.y === 100)!;
    Object.assign(end, { x: 101, y: 1 });
    expect(() => dropNode(w, end.id, 12)).not.toThrow();
    expect(w.segments).toHaveLength(1);
  });

  it("prunes nodes left without segments", () => {
    const w = empty();
    addSegment(w, { x: 0, y: 0 }, { x: 100, y: 0 }, opts());
    deleteSegment(w, w.segments[0].id);
    expect(w).toEqual({ nodes: [], segments: [] });
  });

  it("draws nothing for a segment back onto its own start", () => {
    const w = empty();
    expect(addSegment(w, { x: 0, y: 0 }, { x: 2, y: 1 }, opts())).toBeNull();
    expect(w).toEqual({ nodes: [], segments: [] });
  });
});

describe("diffWorking", () => {
  it("reports what changed", () => {
    const before = empty();
    addSegment(before, { x: 0, y: 0 }, { x: 100, y: 0 }, opts());
    const after = JSON.parse(JSON.stringify(before)) as Working;
    after.nodes[1].x = 120;
    after.segments[0].widthM = 2;
    const d = diffWorking(before, after);
    expect(d.movedNodes.map((x) => x.id)).toEqual([after.nodes[1].id]);
    expect(d.changedSegments.map((x) => x.widthM)).toEqual([2]);
    expect(d.addedNodes).toEqual([]);
    expect(diffWorking(before, empty()).removedSegments).toHaveLength(1);
  });
});
