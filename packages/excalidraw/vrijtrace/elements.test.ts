import { API } from "../tests/helpers/api";

import {
  elementKey,
  elementZones,
  lineLengthM,
  pageElements,
} from "./elements";
import { getPageFrame } from "./model";

import type { Zones } from "./geometry";
import type { LibraryItem } from "../types";

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
};
/** 5 cm/px: 20 px = 1 m */
const frame = getPageFrame(page as any);

/** an element placed from library item `itemId` on pdf1 */
const placed = (
  id: string,
  itemId: string | null,
  box: [number, number, number, number],
  groupIds: string[] = [],
  extra: Record<string, any> = {},
) => ({
  ...API.createElement({
    type: "rectangle",
    id,
    x: box[0],
    y: box[1],
    width: box[2],
    height: box[3],
    groupIds,
  }),
  customData: {
    pdfParentId: "pdf1",
    libraryCmPerPx: 5,
    ...(itemId ? { libraryItemId: itemId } : {}),
    ...extra,
  },
});

describe("pageElements", () => {
  it("lists the placed library items on a page, one per placement, in drawing order", () => {
    const els = [
      page,
      placed("a1", "avp", [100, 100, 40, 40], ["gA"]),
      placed("d1", "duct", [300, 100, 60, 10]),
      placed("a2", "avp", [110, 110, 20, 20], ["gA"]),
    ];
    expect(
      pageElements(els, "pdf1").map((e) => [e.key, e.ids, e.itemId]),
    ).toEqual([
      ["gA", ["a1", "a2"], "avp"],
      ["d1", ["d1"], "duct"],
    ]);
  });

  it("leaves out trees, trench lines, other pages and the user's own shapes", () => {
    const tree = {
      ...placed("ring", "c1z", [500, 100, 100, 100], ["gT"], {
        treeRing: { klasse: "C1", scherm: false },
      }),
      type: "ellipse" as const,
    };
    const trunk = placed("trunk", "c1z", [540, 140, 20, 20], ["gT"]);
    const trench = {
      ...API.createElement({ type: "line", id: "l1" }),
      customData: { tool: "trench", pdfParentId: "pdf1" },
    };
    const elsewhere = { ...placed("o1", "avp", [0, 0, 10, 10]) };
    (elsewhere as any).customData = {
      ...elsewhere.customData,
      pdfParentId: "pdf2",
    };
    const own = {
      ...API.createElement({ type: "rectangle", id: "mine" }),
      customData: { pdfParentId: "pdf1" },
    };
    expect(
      pageElements([page, tree, trunk, trench, elsewhere, own], "pdf1"),
    ).toEqual([]);
  });

  it("names a placement from before items were tagged by its drawing", () => {
    const item: LibraryItem = {
      id: "gevel",
      status: "published",
      created: 1,
      elements: [
        {
          ...API.createElement({ type: "rectangle", width: 50, height: 25 }),
          customData: { librarySymbol: true },
        } as any,
      ],
    };
    const old = placed("g1", null, [10, 10, 100, 50], [], {
      libraryCmPerPx: undefined,
      librarySymbol: true,
    });
    expect(pageElements([page, old], "pdf1", [item])[0].itemId).toBe("gevel");
  });

  it("keys a placement by its outermost group, else by itself", () => {
    expect(elementKey(placed("x", null, [0, 0, 1, 1], ["in", "out"]))).toBe(
      "out",
    );
    expect(elementKey(placed("y", null, [0, 0, 1, 1]))).toBe("y");
  });
});

describe("elementZones", () => {
  // zones along y = 10 m (200 px), x 0..20 m: trench 1 m, red 2 m beyond it,
  // work a further 1,5 m
  const band = (half: number) => [
    [
      { x: 0, y: 10 - half },
      { x: 20, y: 10 - half },
      { x: 20, y: 10 + half },
      { x: 0, y: 10 + half },
    ],
  ];
  const zones: Zones = {
    trench: band(0.5),
    red: band(2.5),
    work: band(4),
    overlap: [],
  };
  const at = (y: number, h = 20) => [placed("e", null, [100, y, 40, h])];

  it("says which zones an element's footprint touches", () => {
    // 1 m box whose bottom edge is 3 m above the line: in the werkruimte only
    expect(elementZones(at(120), frame, zones, true)).toEqual({
      inside: false,
      red: false,
      work: true,
    });
    // straddling the trench
    expect(elementZones(at(190), frame, zones, true)).toEqual({
      inside: true,
      red: true,
      work: true,
    });
    // well clear
    expect(elementZones(at(20), frame, zones, true)).toEqual({
      inside: false,
      red: false,
      work: false,
    });
  });

  it("answers only 'in trench' while the zones are not activated", () => {
    expect(elementZones(at(190), frame, zones, false)).toEqual({
      inside: true,
      red: null,
      work: null,
    });
  });

  it("answers nothing without a trench", () => {
    expect(
      elementZones(
        at(190),
        frame,
        { trench: [], red: [], work: [], overlap: [] },
        true,
      ),
    ).toEqual({ inside: null, red: null, work: null });
  });
});

describe("lineLengthM", () => {
  it("measures a trench line along its points, in metres on the page", () => {
    const line = {
      ...API.createElement({ type: "line", x: 100, y: 100 }),
      points: [
        [0, 0],
        [300, 0],
        [300, 400],
      ],
    };
    // 300 + 400 px at 20 px/m
    expect(lineLengthM(line as any, frame)).toBeCloseTo(35, 6);
  });
});
