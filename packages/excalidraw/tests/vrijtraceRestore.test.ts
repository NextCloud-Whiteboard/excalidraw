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

  it("drops parts with non-finite or unbounded geometry and strips links", () => {
    expect(
      restoreElements(
        [
          { ...trench("b1", { kind: "node" }), x: NaN },
          { ...trench("b2", { kind: "node" }), y: 1e12 },
        ],
        null,
      ),
    ).toEqual([]);
    const [n] = restoreElements(
      // a hostile link on an element nobody can see — must be stripped
      // eslint-disable-next-line no-script-url
      [{ ...trench("n2", { kind: "node" }), link: "javascript:alert(1)" }],
      null,
    );
    expect(n.link).toBeNull();
  });

  // network/tree data is read by every viewer's sidebar and renderer, so a
  // malformed value must never reach them (security review)
  it("rebuilds a malformed activation instead of trusting it", () => {
    const network = (activation: any) =>
      trench("net", {
        kind: "network",
        redSide: "beide",
        workWidthM: 1.5,
        workSide: "beide",
        treeMinM: 5,
        activation,
      });
    const [missingBy] = restoreElements(
      [network({ fingerprint: "abc" })],
      null,
    );
    expect((missingBy as any).trench.activation).toEqual({
      by: { uid: "", name: "" },
      at: 0,
      fingerprint: "abc",
    });
    const [hostile] = restoreElements(
      [
        network({
          by: { uid: 7, name: { toString: 1 } },
          at: "now",
          fingerprint: "x".repeat(500),
        }),
      ],
      null,
    );
    expect((hostile as any).trench.activation).toEqual({
      by: { uid: "", name: "" },
      at: 0,
      fingerprint: "x".repeat(64),
    });
  });

  it("bounds labels and ids, and drops non-finite angles", () => {
    const [tree] = restoreElements(
      [trench("t1", { kind: "tree", label: "B".repeat(200) })],
      null,
    );
    expect((tree as any).trench.label).toHaveLength(16);
    expect(
      restoreElements(
        [
          trench("s1", {
            kind: "segment",
            a: "n".repeat(500),
            b: "n2",
            widthM: 1,
          }),
          { ...trench("n3", { kind: "node" }), angle: NaN },
        ],
        null,
      ),
    ).toEqual([]);
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
