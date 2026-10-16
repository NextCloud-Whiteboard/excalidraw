import {
  checkTree,
  computeZones,
  distanceToPolygons,
  fingerprint,
  pointInPolygons,
} from "./geometry";

import type { NetworkGeometry, Polygons, ZoneSettings } from "./geometry";

const area = (polys: Polygons) =>
  Math.abs(
    polys.reduce(
      (sum, ring) =>
        sum +
        ring.reduce((s, p, i) => {
          const q = ring[(i + 1) % ring.length];
          return s + p.x * q.y - q.x * p.y;
        }, 0) /
          2,
      0,
    ),
  );

const line: NetworkGeometry = {
  nodes: [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
  ],
  segments: [{ id: "s", a: "a", b: "b", widthM: 1 }],
};
const both: ZoneSettings = {
  redSide: "beide",
  workWidthM: 1.5,
  workSide: "beide",
};

describe("computeZones", () => {
  it("returns no zones, without clipper-lib's alert, for out-of-range coordinates", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const far: NetworkGeometry = {
      ...line,
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 1e300, y: 0 },
      ],
    };
    const z = computeZones(far, both);
    expect(alert).not.toHaveBeenCalled();
    expect(z).toEqual({ trench: [], red: [], work: [], overlap: [] });
    alert.mockRestore();
  });

  it("buffers the trench with round ends", () => {
    expect(area(computeZones(line, both).trench)).toBeCloseTo(
      10 + Math.PI * 0.25,
      1,
    );
  });

  it("cuts the trench out of the red zone (2.00 m beyond the edge)", () => {
    const z = computeZones(line, both);
    const capsule = 10 * 5 + Math.PI * 2.5 * 2.5;
    expect(area(z.red)).toBeCloseTo(capsule - (10 + Math.PI * 0.25), 0);
    expect(pointInPolygons({ x: 5, y: 0 }, z.red)).toBe(false);
    expect(pointInPolygons({ x: 5, y: 2.4 }, z.red)).toBe(true);
    expect(pointInPolygons({ x: 5, y: 2.6 }, z.red)).toBe(false);
  });

  it("keeps one side only — left is n = (uy, -ux), i.e. negative y for a→b eastwards", () => {
    const z = computeZones(line, { ...both, redSide: "links" });
    expect(pointInPolygons({ x: 5, y: -1.5 }, z.red)).toBe(true);
    expect(pointInPolygons({ x: 5, y: 1.5 }, z.red)).toBe(false);
  });

  it("shows overlap without adding widths", () => {
    const z = computeZones(line, { ...both, workWidthM: 4 });
    expect(area(z.overlap)).toBeCloseTo(area(z.red), 0);
    expect(pointInPolygons({ x: 5, y: 3.5 }, z.red)).toBe(false);
    expect(pointInPolygons({ x: 5, y: 3.5 }, z.work)).toBe(true);
  });

  it("joins a T-junction into one outline", () => {
    const t: NetworkGeometry = {
      nodes: [...line.nodes, { id: "c", x: 5, y: 0 }, { id: "d", x: 5, y: 6 }],
      segments: [...line.segments, { id: "t", a: "c", b: "d", widthM: 1 }],
    };
    expect(computeZones(t, both).trench).toHaveLength(1);
  });
});

describe("checkTree", () => {
  const z = computeZones(line, both);
  it("measures to the trench edge from outside and inside", () => {
    expect(distanceToPolygons({ x: 5, y: 4 }, z.trench)).toBeCloseTo(3.5, 1);
    const inside = checkTree({ x: 5, y: 0.2 }, z, true, 5);
    expect(inside).toMatchObject({ inside: true, pass: false });
    expect(inside.distanceM).toBeCloseTo(0.3, 1);
  });
  it("changing the minimum changes only the verdict", () => {
    const a = checkTree({ x: 5, y: 4 }, z, true, 5);
    const b = checkTree({ x: 5, y: 4 }, z, true, 3);
    expect(a.distanceM).toBe(b.distanceM);
    expect([a.pass, b.pass]).toEqual([false, true]);
  });
  it("reports zones only while active", () => {
    expect(checkTree({ x: 5, y: 2 }, z, false, 5)).toMatchObject({
      red: null,
      work: null,
    });
    expect(checkTree({ x: 5, y: 2 }, z, true, 5)).toMatchObject({
      red: true,
      work: false,
    });
  });
  it("has no answer without a trench", () => {
    const empty = computeZones({ nodes: [], segments: [] }, both);
    expect(checkTree({ x: 1, y: 1 }, empty, true, 5)).toEqual({
      inside: false,
      distanceM: null,
      pass: null,
      red: null,
      work: null,
    });
  });
});

describe("fingerprint", () => {
  it("is stable for the same input and changes with geometry or settings", () => {
    const f = fingerprint(line, both);
    expect(fingerprint(JSON.parse(JSON.stringify(line)), both)).toBe(f);
    expect(
      fingerprint(
        { ...line, nodes: [line.nodes[0], { id: "b", x: 10.05, y: 0 }] },
        both,
      ),
    ).not.toBe(f);
    expect(fingerprint(line, { ...both, workSide: "rechts" })).not.toBe(f);
  });
  it("ignores segment and node order", () => {
    const shuffled = {
      nodes: [...line.nodes].reverse(),
      segments: line.segments,
    };
    expect(fingerprint(shuffled, both)).toBe(fingerprint(line, both));
  });
});
