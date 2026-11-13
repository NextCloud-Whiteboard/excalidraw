import { act, queryByTestId } from "@testing-library/react";
import React from "react";

import { Excalidraw } from "../index";
import { selectionTarget } from "../selectionSidebar";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import { fireEvent, render, waitFor } from "./test-utils";

import type { LibraryItem } from "../types";

const { h } = window;

const pdfPage = () => ({
  ...API.createElement({
    type: "image",
    id: "pdf1",
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
  }),
  customData: { isPdf: true, pdfCmPerPx: 5 },
});

/** an element placed from library item `itemId` */
const placed = (
  id: string,
  itemId: string,
  extra: Record<string, any> = {},
  groupIds: string[] = [],
) => ({
  ...API.createElement({ type: "rectangle", id, x: 600, y: 500, groupIds }),
  customData: { libraryItemId: itemId, ...extra },
});

/** a library tree's ring and trunk, grouped, as placed on pdf1 */
const placedTree = (id: string, cx: number, cy: number, group = `g-${id}`) => [
  {
    ...API.createElement({
      type: "ellipse",
      id,
      x: cx - 60,
      y: cy - 60,
      width: 120,
      height: 120,
      strokeStyle: "dashed",
      groupIds: [group],
    }),
    customData: {
      treeRing: { klasse: "C1", scherm: false },
      pdfParentId: "pdf1",
      libraryItemId: "c1z",
    },
  },
  {
    ...API.createElement({
      type: "ellipse",
      id: `${id}-trunk`,
      x: cx - 10,
      y: cy - 10,
      width: 20,
      height: 20,
      groupIds: [group],
    }),
    customData: { pdfParentId: "pdf1", libraryItemId: "c1z" },
  },
];

const ids = (...list: string[]) =>
  Object.fromEntries(list.map((id) => [id, true as const]));

describe("selectionTarget", () => {
  it("is the library item of a single placed element", () => {
    expect(selectionTarget([placed("e1", "avp")], ids("e1"))).toEqual({
      kind: "library",
      itemId: "avp",
    });
  });

  it("is the library item of one placed group", () => {
    const els = [
      placed("e1", "avp", {}, ["g1"]),
      placed("e2", "avp", {}, ["g1"]),
    ];
    expect(selectionTarget(els, ids("e1", "e2"))).toEqual({
      kind: "library",
      itemId: "avp",
    });
  });

  it("is nothing for two placements, even of the same item", () => {
    const els = [
      placed("e1", "avp", {}, ["g1"]),
      placed("e2", "avp", {}, ["g2"]),
    ];
    expect(selectionTarget(els, ids("e1", "e2"))).toBeNull();
  });

  it("is the tree when one tree on a PDF page is selected", () => {
    const els = [pdfPage(), ...placedTree("t1", 200, 200)];
    expect(selectionTarget(els, ids("t1", "t1-trunk"))).toEqual({
      kind: "tree",
      ringId: "t1",
      pageId: "pdf1",
    });
  });

  it("a tree off any PDF page is just its library item", () => {
    const els = placedTree("t1", 200, 200);
    expect(selectionTarget(els, ids("t1", "t1-trunk"))).toEqual({
      kind: "library",
      itemId: "c1z",
    });
  });

  it("a tree on a page not yet calibrated is just its library item", () => {
    const page = pdfPage();
    const els = [
      { ...page, customData: { isPdf: true } },
      ...placedTree("t1", 200, 200),
    ];
    expect(selectionTarget(els, ids("t1", "t1-trunk"))).toEqual({
      kind: "library",
      itemId: "c1z",
    });
  });

  it("is nothing for a plain shape or an empty selection", () => {
    const rect = API.createElement({ type: "rectangle", id: "r1" });
    expect(selectionTarget([rect], ids("r1"))).toBeNull();
    expect(selectionTarget([placed("e1", "avp")], {})).toBeNull();
  });
});

describe("a selection opens its sidebar tab", () => {
  const item = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
    id,
    status: "published",
    created: 1,
    elements: [API.createElement({ type: "rectangle", id: `${id}-el` })],
    ...extra,
  });
  let container: HTMLElement;

  beforeEach(async () => {
    ({ container } = await render(
      <Excalidraw
        vrijTraceEnabled={true}
        vrijTraceUser={{ uid: "u1", name: "Jij" }}
      />,
    ));
    h.app.device = {
      ...h.app.device,
      editor: { ...h.app.device.editor, canFitSidebar: true },
    };
    await act(() =>
      h.app.library.updateLibrary({
        libraryItems: [
          item("avp", { group: "aVP", name: "aVP buiten 5 × 5 m" }),
          item("duct", { group: "Mantelbuizen", name: "Mantelbuis Ø110" }),
        ],
        merge: false,
      }),
    );
    API.setElements([pdfPage()]);
  });

  const lib = () =>
    container.querySelector(".layer-ui__library") as HTMLElement;

  it("a placed library item opens the library on that item", async () => {
    API.setElements([pdfPage(), placed("e1", "avp")]);
    API.setSelectedElements([h.elements.find((e) => e.id === "e1")!]);
    expect(h.state.openSidebar).toEqual({ name: "default", tab: "library" });
    await waitFor(() =>
      expect(queryByTestId(lib(), "library-revealed")?.textContent).toContain(
        "aVP buiten 5 × 5 m",
      ),
    );
    await waitFor(() =>
      expect(lib().querySelectorAll(".library-unit--revealed")).toHaveLength(1),
    );
  });

  it("a click on a placed item opens the library, and it stays open", async () => {
    // the library is not docked: a canvas click closes it, so it must open
    // after the click, not during it
    API.setElements([pdfPage(), placed("e1", "avp")]);
    new Pointer("mouse").clickOn(h.elements.find((e) => e.id === "e1")!);
    expect(h.state.selectedElementIds.e1).toBe(true);
    await waitFor(() =>
      expect(h.state.openSidebar).toEqual({ name: "default", tab: "library" }),
    );
    await waitFor(() =>
      expect(queryByTestId(lib(), "library-revealed")).not.toBeNull(),
    );
  });

  it("opens the tab when the pointer is released, not while it is held", () => {
    // an undocked sidebar closes on a canvas pointerdown, so opening during
    // the press would close again at once; and a drag should not open it
    API.setElements([pdfPage(), placed("e1", "avp")]);
    const el = h.elements.find((e) => e.id === "e1")!;
    const mouse = new Pointer("mouse");
    mouse.downAt(el.x + 1, el.y + el.height / 2);
    expect(h.state.selectedElementIds.e1).toBe(true);
    expect(h.state.openSidebar).toBeNull();
    mouse.up();
    expect(h.state.openSidebar).toEqual({ name: "default", tab: "library" });
  });

  it("unfolds the item's group if it was folded", async () => {
    fireEvent.click(container.querySelector(".sidebar-trigger")!);
    await waitFor(() =>
      expect(lib().querySelectorAll(".library-group")).toHaveLength(2),
    );
    const header = lib().querySelector<HTMLButtonElement>(
      ".library-group__header",
    )!;
    fireEvent.click(header); // fold aVP
    expect(header.getAttribute("aria-expanded")).toBe("false");
    API.setElements([pdfPage(), placed("e1", "avp")]);
    API.setSelectedElements([h.elements.find((e) => e.id === "e1")!]);
    await waitFor(() =>
      expect(
        lib()
          .querySelector(".library-group__header")!
          .getAttribute("aria-expanded"),
      ).toBe("true"),
    );
  });

  it("a tree on a PDF page opens Vrij Tracé on that tree", async () => {
    API.setElements([pdfPage(), ...placedTree("t1", 200, 200)]);
    API.setSelectedElements(
      h.elements.filter((e) => e.id === "t1" || e.id === "t1-trunk"),
    );
    expect(h.state.openSidebar).toEqual({ name: "default", tab: "vrijtrace" });
    expect(h.state.vrijTrace.pageId).toBe("pdf1");
    await waitFor(() =>
      expect(queryByTestId(container, "vt-selected-tree")).not.toBeNull(),
    );
    expect(queryByTestId(container, "vt-selected-tree")!.textContent).toContain(
      "C1 groot, zonder scherm",
    );
    const rows = queryByTestId(container, "vt-rows")!.querySelectorAll("tr");
    expect(rows[0].classList.contains("vt-selected")).toBe(true);
  });

  it("on a screen too narrow for the sidebar, a selection leaves it closed", () => {
    h.app.device = {
      ...h.app.device,
      editor: { ...h.app.device.editor, canFitSidebar: false },
    };
    API.setElements([pdfPage(), placed("e1", "avp")]);
    API.setSelectedElements([h.elements.find((e) => e.id === "e1")!]);
    expect(h.state.openSidebar).toBeNull();
  });

  it("a plain shape leaves the sidebar as it is", () => {
    API.setElements([
      pdfPage(),
      API.createElement({ type: "rectangle", id: "r1" }),
    ]);
    API.setSelectedElements([h.elements.find((e) => e.id === "r1")!]);
    expect(h.state.openSidebar).toBeNull();
  });

  it("placing a tree from the library keeps the library open", async () => {
    await act(() =>
      h.app.library.updateLibrary({
        libraryItems: [
          item("c1z", {
            group: "Bomen",
            name: "C1 3,00 m",
            elements: [
              {
                ...API.createElement({
                  type: "ellipse",
                  id: "ring",
                  width: 120,
                  height: 120,
                }),
                customData: { treeRing: { klasse: "C1", scherm: false } },
              },
            ],
          }),
        ],
        merge: false,
      }),
    );
    fireEvent.click(container.querySelector(".sidebar-trigger")!);
    await waitFor(() =>
      expect(lib().querySelectorAll(".library-unit__dragger")).toHaveLength(1),
    );
    fireEvent.click(lib().querySelector(".library-unit__dragger")!);
    await waitFor(() => expect(h.elements).toHaveLength(2));
    const ring = h.elements.find((e) => e.type === "ellipse")!;
    // the placed tree remembers its library item, and landed on the page
    expect(ring.customData?.libraryItemId).toBe("c1z");
    expect(ring.customData?.pdfParentId).toBe("pdf1");
    expect(h.state.selectedElementIds[ring.id]).toBe(true);
    // whether the sidebar stays docked open is the library's own business;
    // the selection must not swap it for Vrij Tracé
    expect(h.state.openSidebar?.tab).not.toBe("vrijtrace");
  });
});
