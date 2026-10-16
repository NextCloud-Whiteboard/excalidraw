import { restoreElements } from "../data/restore";

const base = {
  x: 10,
  y: 20,
  width: 1,
  height: 1,
  angle: 0,
  strokeColor: "#000",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
};
const trench = (
  id: string,
  data: any,
  customData: any = { pdfParentId: "pdf1" },
) => ({ ...base, id, type: "trench", trench: data, customData } as any);

describe("restoring trench elements", () => {
  it("keeps valid parts and forces them locked", () => {
    const [n] = restoreElements([trench("n1", { kind: "node" })], null);
    expect(n).toMatchObject({
      id: "n1",
      type: "trench",
      locked: true,
      trench: { kind: "node" },
    });
  });

  it("clamps widths and normalises settings", () => {
    const out = restoreElements(
      [
        trench("s1", { kind: "segment", a: "n1", b: "n2", widthM: 9 }),
        trench("net", {
          kind: "network",
          redSide: "nope",
          workWidthM: 0.1,
          workSide: "links",
          treeMinM: 99,
          activation: null,
        }),
      ],
      null,
    );
    expect(out[0]).toMatchObject({
      trench: { kind: "segment", a: "n1", b: "n2", widthM: 2.3 },
    });
    expect(out[1]).toMatchObject({
      trench: {
        kind: "network",
        redSide: "beide",
        workWidthM: 0.5,
        workSide: "links",
        treeMinM: 15,
        activation: null,
      },
    });
  });

  it("drops parts without a page or with an unknown kind", () => {
    const out = restoreElements(
      [
        trench("x1", { kind: "node" }, {}),
        trench("x2", { kind: "lamppost" }),
        trench("x3", { kind: "segment", a: "n1" }),
      ],
      null,
    );
    expect(out).toEqual([]);
  });

  it("keeps a segment whose nodes are not in the same batch (partial collab update)", () => {
    const out = restoreElements(
      [
        trench("s9", {
          kind: "segment",
          a: "elsewhere1",
          b: "elsewhere2",
          widthM: 1,
        }),
      ],
      null,
    );
    expect(out.map((e) => e.id)).toEqual(["s9"]);
  });
});
