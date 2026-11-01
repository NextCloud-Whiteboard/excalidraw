import { newImageElement, newTrenchElement } from "@excalidraw/element";

import { restoreElements } from "../data/restore";

import { migrateLegacyTrench } from "./migrate";
import { getPageParts, pageState } from "./model";

const page = (id = "pdf1") =>
  ({
    ...newImageElement({
      type: "image",
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
      fileId: "f" as any,
    }),
    id,
    customData: { isPdf: true, pdfCmPerPx: 5 },
  } as any);
const node = (id: string, x: number, y: number, pdf = "pdf1") =>
  newTrenchElement({
    id,
    trench: { kind: "node" },
    pdfParentId: pdf,
    x: x - 0.5,
    y: y - 0.5,
  });
const seg = (id: string, a: string, b: string, widthM = 1, pdf = "pdf1") =>
  newTrenchElement({
    id,
    trench: { kind: "segment", a, b, widthM },
    pdfParentId: pdf,
    x: 0,
    y: 0,
  });
const network = (pdf = "pdf1") =>
  newTrenchElement({
    id: `vrijtrace-${pdf}`,
    trench: {
      kind: "network",
      redSide: "beide",
      workWidthM: 1.5,
      workSide: "beide",
      treeMinM: 5,
      activation: null,
    },
    pdfParentId: pdf,
    x: 0,
    y: 0,
  });

/** the scene after applying a migration result */
const applied = (els: any[]) => {
  const m = migrateLegacyTrench(els)!;
  const deleted = new Set(m.deleted.map((el) => el.id));
  const after = [
    ...els.map((el) =>
      deleted.has(el.id)
        ? { ...el, isDeleted: true }
        : m.activations.get(el.id)
        ? {
            ...el,
            trench: { ...el.trench, activation: m.activations.get(el.id) },
          }
        : el,
    ),
    ...m.created,
  ];
  return { m, after };
};

// an L with a branch: n1—n2—n3 (corner at n2), and n2—n4 (T at n2)
const board = () => [
  page(),
  network(),
  node("n1", 100, 100),
  node("n2", 300, 100),
  node("n3", 300, 300),
  node("n4", 500, 100),
  seg("s1", "n1", "n2"),
  seg("s2", "n2", "n3"),
  seg("s3", "n2", "n4", 1.5),
];

describe("migrating trenches of older boards", () => {
  it("does nothing without legacy parts", () => {
    expect(migrateLegacyTrench([page(), network()])).toBeNull();
  });

  it("turns nodes and segments into trench lines on the same page", () => {
    const { m, after } = applied(board());
    expect(m.deleted.map((el) => el.id).sort()).toEqual(
      ["n1", "n2", "n3", "n4", "s1", "s2", "s3"].sort(),
    );
    const parts = getPageParts(after, "pdf1");
    expect(parts.nodes).toHaveLength(0);
    expect(parts.segments).toHaveLength(0);
    expect(parts.lines.length).toBeGreaterThan(0);
    for (const line of parts.lines) {
      expect(line.customData).toMatchObject({
        tool: "trench",
        reference: "midden",
        pdfParentId: "pdf1",
      });
      expect(line.locked).toBe(false);
    }
    // same trench: three segments, same widths
    const g = pageState(after, after[0])!.geometry;
    expect(g.segments.map((s) => s.widthM).sort()).toEqual([1, 1, 1.5]);
  });

  it("joins segments of one width through corners into one line", () => {
    const { after } = applied([
      page(),
      network(),
      node("n1", 100, 100),
      node("n2", 300, 100),
      node("n3", 300, 300),
      seg("s1", "n1", "n2"),
      seg("s2", "n2", "n3"),
    ]);
    const [line] = getPageParts(after, "pdf1").lines;
    expect(getPageParts(after, "pdf1").lines).toHaveLength(1);
    expect(line.points).toHaveLength(3);
    expect([line.x, line.y]).toEqual([100, 100]);
  });

  it("names the lines after their segments, so clients agree", () => {
    const a = migrateLegacyTrench(board())!
      .created.map((l) => l.id)
      .sort();
    const b = migrateLegacyTrench(board())!
      .created.map((l) => l.id)
      .sort();
    expect(a).toEqual(b);
    expect(a.every((id) => !["s1", "s2", "s3"].includes(id))).toBe(true);
  });

  it("keeps activated zones activated", () => {
    const els = board();
    const before = pageState(els, els[0])!;
    const net = els[1] as any;
    net.trench = {
      ...net.trench,
      activation: {
        by: { uid: "u1", name: "Anna" },
        at: 1,
        fingerprint: before.fingerprint,
      },
    };
    expect(pageState(els, els[0])!.active).toBe(true);
    const { after } = applied(els);
    const state = pageState(after, after[0])!;
    expect(state.active).toBe(true);
    expect((after[1] as any).trench.activation.by.name).toBe("Anna");
  });

  it("leaves zones that were not active alone", () => {
    const { m } = applied(board());
    expect(m.activations.size).toBe(0);
  });

  it("never adds a line whose id is already on the board", () => {
    // e.g. a collaborator's converted line arrived before ours ran
    const first = migrateLegacyTrench(board())!;
    const again = migrateLegacyTrench([...board(), ...first.created])!;
    expect(again.created).toHaveLength(0);
    expect(again.deleted).toHaveLength(7);
  });

  it("leaves parts whose page is missing", () => {
    expect(
      migrateLegacyTrench([
        node("n1", 0, 0, "gone"),
        node("n2", 100, 0, "gone"),
        seg("s1", "n1", "n2", 1, "gone"),
      ]),
    ).toBeNull();
  });
});

describe("loading a page's trench line thickness", () => {
  const withWidth = (lineWidthPx: unknown) => {
    const net = network() as any;
    net.trench = { ...net.trench, lineWidthPx };
    return (restoreElements([page(), net] as any, null)[1] as any).trench
      .lineWidthPx;
  };
  it("keeps it, and falls back to thin for missing or broken values", () => {
    expect(withWidth(2)).toBe(2);
    expect(withWidth(undefined)).toBe(0.5);
    expect(withWidth("x")).toBe(0.5);
    expect(withWidth(99)).toBe(4);
    expect(withWidth(0.1)).toBe(0.1);
    expect(withWidth(0.01)).toBe(0.1);
  });
});
