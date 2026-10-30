import { constrain, snapToTrench } from "./editing";
import { chainSegments, newTrenchLine } from "./lines";

describe("angle steps (v8.2)", () => {
  it("turns to the nearest 90° or 45° step and keeps the length", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 30 };
    const q90 = constrain(a, b, "90");
    expect(q90.x).toBeCloseTo(Math.hypot(100, 30));
    expect(q90.y).toBeCloseTo(0);
    const q45 = constrain(a, { x: 100, y: 80 }, "45");
    expect(q45.x).toBeCloseTo(q45.y);
    expect(constrain(a, b, "vrij")).toEqual(b);
  });
});

describe("snapping onto trench lines", () => {
  const lines = [
    [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
    ],
  ];
  it("prefers a nearby point of a line", () => {
    expect(snapToTrench(lines, { x: 195, y: 8 }, 13)).toEqual({
      x: 200,
      y: 0,
    });
  });
  it("lands on the line itself within 10/13 of the distance", () => {
    expect(snapToTrench(lines, { x: 100, y: 9 }, 13)).toEqual({
      x: 100,
      y: 0,
    });
    expect(snapToTrench(lines, { x: 100, y: 11 }, 13)).toBeNull();
  });
});

describe("chaining segments into lines", () => {
  const n = (id: string, x: number, y: number) => ({ id, x, y });
  const s = (id: string, a: string, b: string, widthM = 1) => ({
    id,
    a,
    b,
    widthM,
  });
  it("runs on through corners, and stops at junctions and width changes", () => {
    const chains = chainSegments(
      [
        n("a", 0, 0),
        n("b", 10, 0),
        n("c", 10, 10),
        n("d", 20, 0),
        n("e", 30, 0),
      ],
      [
        s("s1", "a", "b"),
        s("s2", "b", "c"),
        s("s3", "b", "d"),
        s("s4", "d", "e", 2),
      ],
    );
    // b is a junction (3 segments), d a width change
    expect(chains.map((c) => c.points.length)).toEqual([2, 2, 2, 2]);
    const corner = chainSegments(
      [n("a", 0, 0), n("b", 10, 0), n("c", 10, 10)],
      [s("s2", "b", "c"), s("s1", "a", "b")],
    );
    expect(corner).toHaveLength(1);
    expect(corner[0].id).toBe("s1");
    expect(corner[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });
  it("closes a ring, and skips broken segments", () => {
    const ring = chainSegments(
      [n("a", 0, 0), n("b", 10, 0), n("c", 10, 10)],
      [
        s("s1", "a", "b"),
        s("s2", "b", "c"),
        s("s3", "c", "a"),
        s("x", "a", "gone"),
      ],
    );
    expect(ring).toHaveLength(1);
    expect(ring[0].points).toHaveLength(4);
    expect(ring[0].points[0]).toEqual(ring[0].points[3]);
  });
});

describe("new trench lines", () => {
  it("are sized to their points, like lines the whiteboard draws", () => {
    const line = newTrenchLine({
      points: [
        { x: 100, y: 100 },
        { x: 40, y: 160 },
        { x: 300, y: 130 },
      ],
      widthM: 1,
      pdfParentId: "pdf1",
    });
    expect([line.x, line.y]).toEqual([100, 100]);
    expect([line.width, line.height]).toEqual([260, 60]);
  });
});
