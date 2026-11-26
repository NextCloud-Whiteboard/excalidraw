import { act } from "@testing-library/react";
import React from "react";

import { t } from "../i18n";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { UI } from "./helpers/ui";
import { GlobalTestState, fireEvent, render, waitFor } from "./test-utils";

import type { LibraryItem } from "../types";

const { h } = window;

const item = (id: string, status: LibraryItem["status"]): LibraryItem => ({
  id,
  status,
  created: 1,
  name: id,
  elements: [API.createElement({ type: "rectangle", id: `${id}-el` })],
});

const openLibrary = async (props: { personalLibrary?: boolean }) => {
  const { container } = await render(<Excalidraw {...props} />);
  await act(() =>
    h.app.library.updateLibrary({
      // one item of the user's own, one from the bundled library
      libraryItems: [item("mine", "unpublished"), item("inzicht", "published")],
      merge: false,
    }),
  );
  fireEvent.click(container.querySelector(".sidebar-trigger")!);
  const lib = container.querySelector(".layer-ui__library") as HTMLElement;
  await waitFor(() =>
    expect(lib.textContent).toContain(t("labels.excalidrawLib")),
  );
  return lib;
};

const contextMenuOnSelectedRectangle = async (props: {
  personalLibrary?: boolean;
}) => {
  await render(<Excalidraw {...props} />);
  const rect = API.createElement({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  API.setElements([rect]);
  API.setSelectedElements([rect]);
  fireEvent.contextMenu(GlobalTestState.interactiveCanvas, {
    button: 2,
    clientX: 50,
    clientY: 50,
  });
  return UI.queryContextMenu();
};

describe("personal library switched off", () => {
  it("shows only the In Zicht library: no personal section, no ⋮ menu", async () => {
    const lib = await openLibrary({ personalLibrary: false });
    expect(lib.textContent).not.toContain(t("labels.personalLib"));
    expect(
      lib.querySelector(".library-menu-dropdown-container--in-heading"),
    ).toBeNull();
    expect(lib.querySelector('[data-item-id="mine"]')).toBeNull();
    expect(lib.querySelector('[data-item-id="inzicht"]')).not.toBeNull();
  });

  it("drops Add to library from the right-click menu", async () => {
    const menu = await contextMenuOnSelectedRectangle({
      personalLibrary: false,
    });
    expect(menu).not.toBeNull();
    expect(menu!.querySelector('li[data-testid="addToLibrary"]')).toBeNull();
    // the rest of the menu is still there
    expect(menu!.querySelector('li[data-testid="copy"]')).not.toBeNull();
  });
});

describe("personal library by default", () => {
  it("still shows the personal section and its ⋮ menu", async () => {
    const lib = await openLibrary({});
    expect(lib.textContent).toContain(t("labels.personalLib"));
    expect(
      lib.querySelector(".library-menu-dropdown-container--in-heading"),
    ).not.toBeNull();
    expect(lib.querySelector('[data-item-id="mine"]')).not.toBeNull();
  });

  it("still offers Add to library in the right-click menu", async () => {
    const menu = await contextMenuOnSelectedRectangle({});
    expect(
      menu!.querySelector('li[data-testid="addToLibrary"]'),
    ).not.toBeNull();
  });
});

describe("selecting a placed item with the personal library switched off", () => {
  const placed = (id: string, itemId: string) => ({
    ...API.createElement({ type: "rectangle", id, x: 0, y: 0 }),
    customData: { libraryItemId: itemId },
  });

  beforeEach(async () => {
    await render(<Excalidraw personalLibrary={false} />);
    h.app.device = {
      ...h.app.device,
      editor: { ...h.app.device.editor, canFitSidebar: true },
    };
    await act(() =>
      h.app.library.updateLibrary({
        libraryItems: [
          item("mine", "unpublished"),
          item("inzicht", "published"),
        ],
        merge: false,
      }),
    );
  });

  it("does not open the library for one of the user's own items: its tile is hidden", () => {
    API.setElements([placed("e1", "mine")]);
    API.setSelectedElements([h.elements.find((e) => e.id === "e1")!]);
    expect(h.state.openSidebar).toBeNull();
  });

  it("still opens the library on an item from the bundled library", () => {
    API.setElements([placed("e2", "inzicht")]);
    API.setSelectedElements([h.elements.find((e) => e.id === "e2")!]);
    expect(h.state.openSidebar).toEqual({ name: "default", tab: "library" });
  });
});
