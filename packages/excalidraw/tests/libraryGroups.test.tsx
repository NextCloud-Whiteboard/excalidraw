import { act, queryByTestId } from "@testing-library/react";
import React from "react";

import { groupLibraryItems } from "../components/libraryGroups";
import { t } from "../i18n";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { fireEvent, render, waitFor } from "./test-utils";

import type { LibraryItem } from "../types";

const { h } = window;

const item = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  status: "published",
  created: 1,
  elements: [API.createElement({ type: "rectangle", id: `${id}-el` })],
  ...extra,
});

describe("groupLibraryItems", () => {
  it("keeps groups in the order they first appear, ungrouped items last", () => {
    const groups = groupLibraryItems([
      item("loose"),
      item("a1", { group: "aVP" }),
      item("m1", { group: "Mantelbuizen" }),
      item("a2", { group: "aVP" }),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["aVP", "Mantelbuizen", null]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a1", "a2"]);
    expect(groups[2].items.map((i) => i.id)).toEqual(["loose"]);
  });

  it("returns no groups for an empty library", () => {
    expect(groupLibraryItems([])).toEqual([]);
  });

  it("filters on item name, case-insensitively, and drops empty groups", () => {
    const groups = groupLibraryItems(
      [
        item("b", { group: "Kruisingen", name: "Boring" }),
        item("z", { group: "Kruisingen", name: "Zinker" }),
        item("g", { group: "Gevelinvoer", name: "Gevelinvoer" }),
      ],
      "ZINK",
    );
    const zinker = expect.objectContaining({ id: "z" });
    expect(groups).toEqual([
      {
        title: "Kruisingen",
        items: [zinker],
        subgroups: [{ title: null, items: [zinker] }],
      },
    ]);
  });

  it("a matching group title keeps all of its items", () => {
    const groups = groupLibraryItems(
      [
        item("r", { group: "Mantelbuizen", name: "Rood klein" }),
        item("b", { group: "Mantelbuizen", name: "Blauw groot" }),
        item("t", { group: "Bomen", name: "Boom klasse I" }),
      ],
      "mantel",
    );
    expect(groups.map((g) => g.title)).toEqual(["Mantelbuizen"]);
    expect(groups[0].items).toHaveLength(2);
  });

  it("treats a group or name that is not text as missing", () => {
    // an imported library file can hold anything in these fields
    const odd = item("odd", {
      group: 42,
      name: { x: 1 },
      subgroup: ["x"],
    } as never);
    expect(groupLibraryItems([odd], "boom")).toEqual([]);
    expect(groupLibraryItems([odd])).toEqual([
      { title: null, items: [odd], subgroups: [{ title: null, items: [odd] }] },
    ]);
  });

  it("ignores surrounding spaces in the query", () => {
    const groups = groupLibraryItems(
      [item("t", { group: "Bomen", name: "Boom" })],
      "  ",
    );
    expect(groups).toHaveLength(1);
  });
});

describe("groupLibraryItems subgroups", () => {
  it("splits a group into its subgroups, in the order they first appear", () => {
    const [bomen] = groupLibraryItems([
      item("c1z", { group: "Bomen", subgroup: "Zonder" }),
      item("c1m", { group: "Bomen", subgroup: "Met" }),
      item("c2z", { group: "Bomen", subgroup: "Zonder" }),
    ]);
    expect(bomen.items.map((i) => i.id)).toEqual(["c1z", "c1m", "c2z"]);
    expect(
      bomen.subgroups.map((s) => [s.title, s.items.map((i) => i.id)]),
    ).toEqual([
      ["Zonder", ["c1z", "c2z"]],
      ["Met", ["c1m"]],
    ]);
  });

  it("puts a group's items without a subgroup first, under no heading", () => {
    const [g] = groupLibraryItems([
      item("s", { group: "G", subgroup: "Sub" }),
      item("loose", { group: "G" }),
    ]);
    expect(g.subgroups.map((s) => s.title)).toEqual([null, "Sub"]);
  });

  it("a matching subgroup title keeps all of its items", () => {
    const groups = groupLibraryItems(
      [
        item("z", {
          group: "Bomen",
          subgroup: "Zonder maatregelen",
          name: "C1",
        }),
        item("m", { group: "Bomen", subgroup: "Met maatregelen", name: "C1" }),
      ],
      "zonder",
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["z"]);
  });
});

describe("library sidebar subgroups", () => {
  // two trees, drawn 300 and 100 px across
  const tree = (id: string, size: number, subgroup: string, caption: string) =>
    item(id, {
      group: "Bomen",
      subgroup,
      caption,
      elements: [
        API.createElement({
          type: "ellipse",
          id: `${id}-el`,
          width: size,
          height: size,
        }),
      ],
    });
  const openLibrary = async () => {
    const { container } = await render(<Excalidraw />);
    await act(() =>
      h.app.library.updateLibrary({
        libraryItems: [
          tree("c1z", 300, "Zonder", "C1 3,00 m"),
          tree("c3z", 100, "Zonder", "C3 1,00 m"),
          tree("c1m", 175, "Met", "C1 1,75 m"),
        ],
        merge: false,
      }),
    );
    fireEvent.click(container.querySelector(".sidebar-trigger")!);
    return container.querySelector(".layer-ui__library") as HTMLElement;
  };

  it("shows a heading per subgroup inside the group, with its count", async () => {
    const lib = await openLibrary();
    await waitFor(() =>
      expect(
        [...lib.querySelectorAll(".library-subgroup__header")].map(
          (e) => e.textContent,
        ),
      ).toEqual(["Zonder2", "Met1"]),
    );
    expect(lib.querySelectorAll(".library-group")).toHaveLength(1);
  });

  it("shows each item's caption under its tile", async () => {
    const lib = await openLibrary();
    await waitFor(() =>
      expect(
        [...lib.querySelectorAll(".library-unit__caption")].map(
          (e) => e.textContent,
        ),
      ).toEqual(["C1 3,00 m", "C3 1,00 m", "C1 1,75 m"]),
    );
  });

  it("draws the tiles of a subgroup to one scale", async () => {
    const lib = await openLibrary();
    const viewBox = (i: number) =>
      lib
        .querySelectorAll(".library-unit__dragger")
        [i]?.querySelector("svg")
        ?.getAttribute("viewBox")
        ?.split(" ")
        .map(Number);
    await waitFor(() => expect(viewBox(1)).toBeDefined());
    // the small tree sits in a frame as large as the big one's
    expect(viewBox(1)![2]).toBeCloseTo(viewBox(0)![2], 3);
    expect(viewBox(1)![3]).toBeCloseTo(viewBox(0)![3], 3);
    // a subgroup of its own keeps its own scale
    await waitFor(() => expect(viewBox(2)).toBeDefined());
    expect(viewBox(2)![2]).toBeLessThan(viewBox(0)![2]);
  });
});

describe("library sidebar groups", () => {
  const openLibrary = async () => {
    const { container } = await render(<Excalidraw />);
    await act(() =>
      h.app.library.updateLibrary({
        libraryItems: [
          item("mine", { status: "unpublished" }),
          item("a1", { group: "aVP", name: "aVP rond" }),
          item("a2", { group: "aVP", name: "aVP kast" }),
          item("m1", { group: "Mantelbuizen", name: "Mantelbuis rood klein" }),
          item("z1", { group: "Boring / zinker", name: "Zinker" }),
        ],
        merge: false,
      }),
    );
    fireEvent.click(container.querySelector(".sidebar-trigger")!);
    const lib = container.querySelector(".layer-ui__library") as HTMLElement;
    await waitFor(() =>
      expect(lib.querySelectorAll(".library-group")).toHaveLength(3),
    );
    return lib;
  };

  const headers = (lib: HTMLElement) =>
    [...lib.querySelectorAll(".library-group__header")].map((b) =>
      b.textContent?.trim(),
    );
  const tilesIn = (lib: HTMLElement, title: string) => {
    const group = [...lib.querySelectorAll(".library-group")].find((g) =>
      g.querySelector(".library-group__header")?.textContent?.includes(title),
    )!;
    return group.querySelectorAll(".library-unit").length;
  };

  it("shows each group with its name and item count", async () => {
    const lib = await openLibrary();
    expect(headers(lib)).toEqual(["aVP2", "Mantelbuizen1", "Boring / zinker1"]);
    await waitFor(() => expect(tilesIn(lib, "aVP")).toBe(2));
    // the personal library is not grouped
    expect(
      lib.querySelector(".library-menu-items-container__header")?.textContent,
    ).toBe(t("labels.personalLib"));
  });

  it("folds a group when its header is clicked, and unfolds it again", async () => {
    const lib = await openLibrary();
    const header = lib.querySelector<HTMLButtonElement>(
      ".library-group__header",
    )!;
    expect(header.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(tilesIn(lib, "aVP")).toBe(0);
    fireEvent.click(header);
    await waitFor(() => expect(tilesIn(lib, "aVP")).toBe(2));
  });

  it("the search box narrows the groups to matching items", async () => {
    const lib = await openLibrary();
    const search = queryByTestId(lib, "library-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "zink" } });
    await waitFor(() => expect(headers(lib)).toEqual(["Boring / zinker1"]));
    fireEvent.change(search, { target: { value: "niets" } });
    await waitFor(() =>
      expect(lib.querySelector(".library-group__none")).not.toBeNull(),
    );
    fireEvent.change(search, { target: { value: "" } });
    await waitFor(() => expect(headers(lib)).toHaveLength(3));
  });

  it("typing in the search box does not trigger canvas shortcuts", async () => {
    const lib = await openLibrary();
    const search = queryByTestId(lib, "library-search") as HTMLInputElement;
    search.focus();
    // "r" is the rectangle tool's shortcut
    fireEvent.keyDown(search, { key: "r", code: "KeyR" });
    expect(h.state.activeTool.type).toBe("selection");
  });

  it("clicking a grouped item places it on the canvas", async () => {
    const lib = await openLibrary();
    await waitFor(() => expect(tilesIn(lib, "Mantelbuizen")).toBe(1));
    const group = [...lib.querySelectorAll(".library-group")][1];
    fireEvent.click(group.querySelector(".library-unit__dragger")!);
    await waitFor(() => expect(h.elements).toHaveLength(1));
  });
});
