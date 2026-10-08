import { act, queryByTestId } from "@testing-library/react";
import React from "react";
import { vi } from "vitest";

import { MIME_TYPES, ORIG_ID } from "@excalidraw/common";

import { getCommonBoundingBox } from "@excalidraw/element";

import type { ExcalidrawGenericElement } from "@excalidraw/element/types";

import { parseLibraryJSON } from "../data/blob";
import { serializeLibraryAsJSON } from "../data/json";
import { distributeLibraryItemsOnSquareGrid } from "../data/library";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { UI } from "./helpers/ui";
import { fireEvent, getCloneByOrigId, render, waitFor } from "./test-utils";

import type { LibraryItem, LibraryItems } from "../types";

const { h } = window;

const libraryJSONPromise = API.readFile(
  "./fixtures/fixture_library.excalidrawlib",
  "utf8",
);

const mockLibraryFilePromise = new Promise<Blob>(async (resolve, reject) => {
  try {
    resolve(
      new Blob([await libraryJSONPromise], { type: MIME_TYPES.excalidrawlib }),
    );
  } catch (error) {
    reject(error);
  }
});

vi.mock("../data/filesystem.ts", async (importOriginal) => {
  const module = await importOriginal();
  return {
    __esmodule: true,
    //@ts-ignore
    ...module,
    fileOpen: vi.fn(() => mockLibraryFilePromise),
  };
});

describe("library", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
    await act(() => {
      return h.app.library.resetLibrary();
    });
  });

  it("import library via drag&drop", async () => {
    expect(await h.app.library.getLatestLibrary()).toEqual([]);
    await API.drop(
      await API.loadFile("./fixtures/fixture_library.excalidrawlib"),
    );
    await waitFor(async () => {
      expect(await h.app.library.getLatestLibrary()).toEqual([
        {
          status: "unpublished",
          elements: [expect.objectContaining({ id: "A" })],
          id: "id0",
          created: expect.any(Number),
        },
      ]);
    });
  });

  // NOTE: mocked to test logic, not actual drag&drop via UI
  it("drop library item onto canvas", async () => {
    expect(h.elements).toEqual([]);
    const libraryItems = parseLibraryJSON(await libraryJSONPromise);
    await API.drop(
      new Blob([serializeLibraryAsJSON(libraryItems)], {
        type: MIME_TYPES.excalidrawlib,
      }),
    );
    await waitFor(() => {
      expect(h.elements).toEqual([expect.objectContaining({ [ORIG_ID]: "A" })]);
    });
  });

  describe("drop onto a calibrated PDF", () => {
    // client (0, 0) is scene (0, 0) at default scroll/zoom
    const createPdfPage = (customData: Record<string, unknown>) => ({
      ...API.createElement({
        type: "image",
        id: "pdf1",
        x: -500,
        y: -500,
        width: 1000,
        height: 1000,
      }),
      customData: { isPdf: true, ...customData },
    });

    const dropRectangle = async () => {
      const rectangle = API.createElement({
        id: "rect1",
        type: "rectangle",
        width: 200,
        height: 100,
      });
      await API.drop(
        new Blob(
          [
            serializeLibraryAsJSON([
              {
                id: "item1",
                status: "published",
                elements: [rectangle],
                created: 1,
              },
            ]),
          ],
          { type: MIME_TYPES.excalidrawlib },
        ),
        { clientX: 0, clientY: 0 },
      );
      await waitFor(() => {
        expect(getCloneByOrigId("rect1")).toBeTruthy();
      });
      return getCloneByOrigId("rect1");
    };

    it("scales the item from board scale to the PDF's calibration", async () => {
      API.setElements([createPdfPage({ pdfCmPerPx: 2 })]);
      API.setAppState({ cmPerPx: 1 });

      const dropped = await dropRectangle();

      expect(dropped.width).toBeCloseTo(100);
      expect(dropped.height).toBeCloseTo(50);
      // stays centred on the drop point
      expect(dropped.x + dropped.width / 2).toBeCloseTo(0, 0);
      expect(dropped.y + dropped.height / 2).toBeCloseTo(0, 0);
      expect(dropped.customData?.pdfParentId).toBe("pdf1");
      expect(dropped.customData?.libraryCmPerPx).toBe(2);
    });

    it("uses the board's own calibration as the item's scale", async () => {
      API.setElements([createPdfPage({ pdfCmPerPx: 2 })]);
      API.setAppState({ cmPerPx: 4 });

      const dropped = await dropRectangle();

      expect(dropped.width).toBeCloseTo(400);
      expect(dropped.height).toBeCloseTo(200);
    });

    it("attaches without resizing on an uncalibrated PDF", async () => {
      API.setElements([createPdfPage({})]);
      API.setAppState({ cmPerPx: 1 });

      const dropped = await dropRectangle();

      expect(dropped.width).toBe(200);
      expect(dropped.height).toBe(100);
      expect(dropped.customData?.pdfParentId).toBe("pdf1");
      expect(dropped.customData?.libraryCmPerPx).toBe(1);
    });

    it("leaves the item untouched off any PDF", async () => {
      API.setAppState({ cmPerPx: 1 });

      const dropped = await dropRectangle();

      expect(dropped.width).toBe(200);
      expect(dropped.height).toBe(100);
      expect(dropped.customData?.pdfParentId).toBeUndefined();
      // remembers the scale it is drawn at, for a later move onto a PDF
      expect(dropped.customData?.libraryCmPerPx).toBe(1);
    });

    it("scales an item inserted by click onto a calibrated PDF", async () => {
      // big enough to sit under the viewport centre
      API.setElements([
        {
          ...createPdfPage({ pdfCmPerPx: 2 }),
          x: -5000,
          y: -5000,
          width: 10000,
          height: 10000,
        },
      ]);
      API.setAppState({ cmPerPx: 1 });

      act(() => {
        h.app.onInsertElements(
          [
            API.createElement({
              id: "rect1",
              type: "rectangle",
              width: 200,
              height: 100,
            }),
          ],
          { fromLibrary: true },
        );
      });

      const inserted = getCloneByOrigId("rect1");
      expect(inserted.width).toBeCloseTo(100);
      expect(inserted.height).toBeCloseTo(50);
      expect(inserted.customData?.pdfParentId).toBe("pdf1");
      expect(inserted.customData?.libraryCmPerPx).toBe(2);
    });
  });

  it("should regenerate ids but retain bindings on library insert", async () => {
    const rectangle = API.createElement({
      id: "rectangle1",
      type: "rectangle",
      boundElements: [
        { type: "text", id: "text1" },
        { type: "arrow", id: "arrow1" },
      ],
    });
    const text = API.createElement({
      id: "text1",
      type: "text",
      text: "ola",
      containerId: "rectangle1",
    });
    const arrow = API.createElement({
      id: "arrow1",
      type: "arrow",
      endBinding: {
        elementId: "rectangle1",
        focus: -1,
        gap: 0,
        fixedPoint: [0.5, 1],
      },
    });

    await API.drop(
      new Blob(
        [
          serializeLibraryAsJSON([
            {
              id: "item1",
              status: "published",
              elements: [rectangle, text, arrow],
              created: 1,
            },
          ]),
        ],
        {
          type: MIME_TYPES.excalidrawlib,
        },
      ),
    );

    await waitFor(() => {
      expect(h.elements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            [ORIG_ID]: "rectangle1",
            boundElements: expect.arrayContaining([
              { type: "text", id: getCloneByOrigId("text1").id },
              { type: "arrow", id: getCloneByOrigId("arrow1").id },
            ]),
          }),
          expect.objectContaining({
            [ORIG_ID]: "text1",
            containerId: getCloneByOrigId("rectangle1").id,
          }),
          expect.objectContaining({
            [ORIG_ID]: "arrow1",
            endBinding: expect.objectContaining({
              elementId: getCloneByOrigId("rectangle1").id,
            }),
          }),
        ]),
      );
    });
  });

  it("should fix duplicate ids between items on insert", async () => {
    // note, we're not testing for duplicate group ids and such because
    // deduplication of that happens upstream in the library component
    // which would be very hard to orchestrate in this test

    const elem1 = API.createElement({
      id: "elem1",
      type: "rectangle",
    });
    const item1: LibraryItem = {
      id: "item1",
      status: "published",
      elements: [elem1],
      created: 1,
    };

    await API.drop(
      new Blob([serializeLibraryAsJSON([item1, item1])], {
        type: MIME_TYPES.excalidrawlib,
      }),
    );

    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({
          [ORIG_ID]: "elem1",
        }),
        expect.objectContaining({
          id: expect.not.stringMatching(/^elem1$/),
          [ORIG_ID]: expect.not.stringMatching(/^\w+$/),
        }),
      ]);
    });
  });

  it("inserting library item should revert to selection tool", async () => {
    UI.clickTool("rectangle");
    expect(h.elements).toEqual([]);
    const libraryItems = parseLibraryJSON(await libraryJSONPromise);
    await API.drop(
      new Blob([serializeLibraryAsJSON(libraryItems)], {
        type: MIME_TYPES.excalidrawlib,
      }),
    );
    await waitFor(() => {
      expect(h.elements).toEqual([expect.objectContaining({ [ORIG_ID]: "A" })]);
    });
    expect(h.state.activeTool.type).toBe("selection");
  });
});

describe("library menu", () => {
  it("should load library from file picker", async () => {
    const { container } = await render(<Excalidraw />);

    const latestLibrary = await h.app.library.getLatestLibrary();
    expect(latestLibrary.length).toBe(0);

    const libraryButton = container.querySelector(".sidebar-trigger");

    fireEvent.click(libraryButton!);
    fireEvent.click(
      queryByTestId(
        container.querySelector(".layer-ui__library")!,
        "dropdown-menu-button",
      )!,
    );
    fireEvent.click(queryByTestId(container, "lib-dropdown--load")!);

    const libraryItems = parseLibraryJSON(await libraryJSONPromise);

    await waitFor(async () => {
      const latestLibrary = await h.app.library.getLatestLibrary();
      expect(latestLibrary.length).toBeGreaterThan(0);
      expect(latestLibrary.length).toBe(libraryItems.length);
      const { versionNonce, ...strippedElement } = libraryItems[0]?.elements[0]; // stripped due to mutations
      expect(latestLibrary[0].elements).toEqual([
        expect.objectContaining(strippedElement),
      ]);
    });
  });
});

describe("distributeLibraryItemsOnSquareGrid()", () => {
  it("should distribute items on a grid", async () => {
    const createLibraryItem = (
      elements: ExcalidrawGenericElement[],
    ): LibraryItem => {
      return {
        id: `id-${Date.now()}`,
        elements,
        status: "unpublished",
        created: Date.now(),
      };
    };

    const PADDING = 50;

    const el1 = API.createElement({
      id: "id1",
      width: 100,
      height: 100,
      x: 0,
      y: 0,
    });

    const el2 = API.createElement({
      id: "id2",
      width: 100,
      height: 80,
      x: -100,
      y: -50,
    });

    const el3 = API.createElement({
      id: "id3",
      width: 40,
      height: 50,
      x: -100,
      y: -50,
    });

    const el4 = API.createElement({
      id: "id4",
      width: 50,
      height: 50,
      x: 0,
      y: 0,
    });

    const el5 = API.createElement({
      id: "id5",
      width: 70,
      height: 100,
      x: 40,
      y: 0,
    });

    const libraryItems: LibraryItems = [
      createLibraryItem([el1]),
      createLibraryItem([el2]),
      createLibraryItem([el3]),
      createLibraryItem([el4, el5]),
    ];

    const distributed = distributeLibraryItemsOnSquareGrid(libraryItems);
    // assert the returned library items are flattened to elements
    expect(distributed.length).toEqual(
      libraryItems.map((x) => x.elements).flat().length,
    );
    expect(distributed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: el1.id,
          x: 0,
          y: 0,
        }),
        expect.objectContaining({
          id: el2.id,
          x:
            el1.width +
            PADDING +
            (getCommonBoundingBox([el4, el5]).width - el2.width) / 2,
          y: Math.abs(el1.height - el2.height) / 2,
        }),
        expect.objectContaining({
          id: el3.id,
          x: Math.abs(el1.width - el3.width) / 2,
          y:
            Math.max(el1.height, el2.height) +
            PADDING +
            Math.abs(el3.height - Math.max(el4.height, el5.height)) / 2,
        }),
        expect.objectContaining({
          id: el4.id,
          x: Math.max(el1.width, el2.width) + PADDING,
          y: Math.max(el1.height, el2.height) + PADDING,
        }),
        expect.objectContaining({
          id: el5.id,
          x: Math.max(el1.width, el2.width) + PADDING + Math.abs(el5.x - el4.x),
          y:
            Math.max(el1.height, el2.height) +
            PADDING +
            Math.abs(el5.y - el4.y),
        }),
      ]),
    );
  });
});
