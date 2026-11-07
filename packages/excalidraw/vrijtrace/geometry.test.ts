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

  it("keeps one side of the plan only, whichever way the line was drawn", () => {
    const reversed: NetworkGeometry = {
      ...line,
      segments: [{ id: "s", a: "b", b: "a", widthM: 1 }],
    };
    for (const g of [line, reversed]) {
      const top = computeZones(g, { ...both, redSide: "boven" });
      expect(pointInPolygons({ x: 5, y: -1.5 }, top.red)).toBe(true);
      expect(pointInPolygons({ x: 5, y: 1.5 }, top.red)).toBe(false);
      const bottom = computeZones(g, { ...both, redSide: "onder" });
      expect(pointInPolygons({ x: 5, y: 1.5 }, bottom.red)).toBe(true);
      expect(pointInPolygons({ x: 5, y: -1.5 }, bottom.red)).toBe(false);
    }
    const down: NetworkGeometry = {
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 0, y: 10 },
      ],
      segments: [{ id: "s", a: "a", b: "b", widthM: 1 }],
    };
    const west = computeZones(down, { ...both, workSide: "links" });
    expect(pointInPolygons({ x: -1, y: 5 }, west.work)).toBe(true);
    expect(pointInPolygons({ x: 1, y: 5 }, west.work)).toBe(false);
    const east = computeZones(down, { ...both, workSide: "rechts" });
    expect(pointInPolygons({ x: 1, y: 5 }, east.work)).toBe(true);
    expect(pointInPolygons({ x: -1, y: 5 }, east.work)).toBe(false);
  });

  it("puts a side the line runs along on a fixed side, as the edges do", () => {
    // links = onder, rechts = boven, boven = rechts, onder = links
    const left = computeZones(line, { ...both, redSide: "links" });
    expect(pointInPolygons({ x: 5, y: 1.5 }, left.red)).toBe(true);
    expect(pointInPolygons({ x: 5, y: -1.5 }, left.red)).toBe(false);
    const right = computeZones(line, { ...both, redSide: "rechts" });
    expect(pointInPolygons({ x: 5, y: -1.5 }, right.red)).toBe(true);
  });

  it("keeps a bent line's zone on one side all along", () => {
    // east, then south: overall south-east, so its top side is its left
    const bent: NetworkGeometry = {
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 10, y: 0 },
        { id: "c", x: 10, y: 10 },
      ],
      segments: [
        { id: "s", a: "a", b: "b", widthM: 1, dir: { x: 10, y: 10 } },
        { id: "t", a: "b", b: "c", widthM: 1, dir: { x: 10, y: 10 } },
      ],
    };
    const z = computeZones(bent, { ...both, redSide: "boven" });
    expect(pointInPolygons({ x: 5, y: -1.5 }, z.red)).toBe(true);
    expect(pointInPolygons({ x: 11.5, y: 5 }, z.red)).toBe(true);
    expect(pointInPolygons({ x: 5, y: 1.5 }, z.red)).toBe(false);
    expect(pointInPolygons({ x: 8.5, y: 5 }, z.red)).toBe(false);
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

  it("gives each segment its own Werkruimte and sides", () => {
    const two: NetworkGeometry = {
      nodes: [
        ...line.nodes,
        { id: "c", x: 0, y: 20 },
        { id: "d", x: 10, y: 20 },
      ],
      segments: [
        {
          id: "s",
          a: "a",
          b: "b",
          widthM: 1,
          workWidthM: 4,
          redSide: "boven",
          workSide: "onder",
        },
        { id: "t", a: "c", b: "d", widthM: 1 },
      ],
    };
    const z = computeZones(two, both);
    // s: 4 m work zone below it (+y), red zone above it (-y) only
    expect(pointInPolygons({ x: 5, y: 3.5 }, z.work)).toBe(true);
    expect(pointInPolygons({ x: 5, y: -1 }, z.work)).toBe(false);
    expect(pointInPolygons({ x: 5, y: -1.5 }, z.red)).toBe(true);
    expect(pointInPolygons({ x: 5, y: 1.5 }, z.red)).toBe(false);
    // t keeps the page's: 1.5 m on both sides, red on both sides
    expect(pointInPolygons({ x: 5, y: 21.8 }, z.work)).toBe(true);
    expect(pointInPolygons({ x: 5, y: 22.2 }, z.work)).toBe(false);
    expect(pointInPolygons({ x: 5, y: 18.5 }, z.red)).toBe(true);
    expect(pointInPolygons({ x: 5, y: 21.5 }, z.red)).toBe(true);
  });
});

describe("checkTree", () => {
  // the trench runs along y = 0, 1 m wide: its edge is at y = 0.5; the red
  // zone reaches 2 m beyond the edge (y = 2.5), the work zone 1.5 m (y = 2)
  const z = computeZones(line, both);
  it("measures from the tree's ring to the trench edge", () => {
    expect(distanceToPolygons({ x: 5, y: 4 }, z.trench)).toBeCloseTo(3.5, 1);
    const r = checkTree({ x: 5, y: 4 }, 1, z, true, 0);
    expect(r).toMatchObject({ inside: false, pass: true });
    expect(r.distanceM).toBeCloseTo(2.5, 1);
  });
  it("is a conflict as soon as the trench reaches the ring", () => {
    const r = checkTree({ x: 5, y: 1.2 }, 1, z, true, 0);
    expect(r.inside).toBe(false);
    expect(r.distanceM).toBeCloseTo(-0.3, 1);
    expect(r.pass).toBe(false);
  });
  it("counts the minimum distance beyond the ring", () => {
    const a = checkTree({ x: 5, y: 4 }, 1, z, true, 2);
    const b = checkTree({ x: 5, y: 4 }, 1, z, true, 3);
    expect(a.distanceM).toBe(b.distanceM);
    expect([a.pass, b.pass]).toEqual([true, false]);
  });
  it("goes further below zero for a trunk inside the trench", () => {
    const r = checkTree({ x: 5, y: 0.2 }, 1, z, true, 0);
    expect(r.inside).toBe(true);
    expect(r.distanceM).toBeCloseTo(-1.3, 1);
    expect(r.pass).toBe(false);
  });
  it("reports a zone the ring reaches, only while the zones are active", () => {
    expect(checkTree({ x: 5, y: 4 }, 2, z, false, 0)).toMatchObject({
      red: null,
      work: null,
    });
    expect(checkTree({ x: 5, y: 4 }, 2, z, true, 0)).toMatchObject({
      red: true,
      work: true,
    });
    expect(checkTree({ x: 5, y: 4.3 }, 2, z, true, 0)).toMatchObject({
      red: true,
      work: false,
    });
    expect(checkTree({ x: 5, y: 8 }, 1, z, true, 0)).toMatchObject({
      red: false,
      work: false,
    });
  });
  it("has no answer without a trench", () => {
    const empty = computeZones({ nodes: [], segments: [] }, both);
    expect(checkTree({ x: 1, y: 1 }, 1, empty, true, 0)).toEqual({
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
  it("changes with a segment's own zone settings", () => {
    const own = (o: object) => ({
      ...line,
      segments: [{ ...line.segments[0], ...o }],
    });
    const f = fingerprint(line, both);
    expect(fingerprint(own({ workWidthM: 3 }), both)).not.toBe(f);
    expect(fingerprint(own({ redSide: "links" }), both)).not.toBe(f);
    expect(fingerprint(own({ workSide: "rechts" }), both)).not.toBe(f);
  });
  it("stays the same when a segment's own settings equal the page's", () => {
    // zones activated before lines had their own settings stay activated
    const own = {
      ...line,
      segments: [
        { ...line.segments[0], workWidthM: 1.5, redSide: "beide" as const },
      ],
    };
    expect(fingerprint(own, both)).toBe(fingerprint(line, both));
  });
  it("drops an activation made while Links and Rechts followed the drawing direction", () => {
    // how a segment with its own Links was fingerprinted before they were
    // sides of the plan: its zone may lie elsewhere now
    const djb2 = (text: string) => {
      let h = 5381;
      for (let i = 0; i < text.length; i++) {
        h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
      }
      return h.toString(36);
    };
    const own = {
      ...line,
      segments: [{ ...line.segments[0], redSide: "links" as const }],
    };
    const before = djb2(
      "a:0,0;b:1000,0|s:a-b:100:links/150/beide|beide|150|beide",
    );
    expect(fingerprint(own, both)).not.toBe(before);
  });
  it("ignores segment and node order", () => {
    const shuffled = {
      nodes: [...line.nodes].reverse(),
      segments: line.segments,
    };
    expect(fingerprint(shuffled, both)).toBe(fingerprint(line, both));
  });
});
