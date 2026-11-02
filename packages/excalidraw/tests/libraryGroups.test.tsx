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
    expect(groups).toEqual([
      { title: "Kruisingen", items: [expect.objectContaining({ id: "z" })] },
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
    const odd = item("odd", { group: 42, name: { x: 1 } } as never);
    expect(groupLibraryItems([odd], "boom")).toEqual([]);
    expect(groupLibraryItems([odd])).toEqual([{ title: null, items: [odd] }]);
  });

  it("ignores surrounding spaces in the query", () => {
    const groups = groupLibraryItems(
      [item("t", { group: "Bomen", name: "Boom" })],
      "  ",
    );
    expect(groups).toHaveLength(1);
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

  it("clicking a grouped item places it on the canvas", async () => {
    const lib = await openLibrary();
    await waitFor(() => expect(tilesIn(lib, "Mantelbuizen")).toBe(1));
    const group = [...lib.querySelectorAll(".library-group")][1];
    fireEvent.click(group.querySelector(".library-unit__dragger")!);
    await waitFor(() => expect(h.elements).toHaveLength(1));
  });
});
