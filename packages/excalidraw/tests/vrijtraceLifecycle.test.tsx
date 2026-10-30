import React from "react";
import { act, waitFor } from "@testing-library/react";

import { KEYS } from "@excalidraw/common";
import { isTrenchElement } from "@excalidraw/element";

import { actionCopy } from "../actions/actionClipboard";
import { actionDeleteSelected } from "../actions/actionDeleteSelected";
import { actionDistanceConversion } from "../actions/actionDistanceConversion";
import { actionDuplicateSelection } from "../actions/actionDuplicateSelection";
import { actionUnlockAllElements } from "../actions/actionElementLock";
import { createPasteEvent } from "../clipboard";
import { Excalidraw } from "../index";
import { getPageParts, isTrenchLine, pageState } from "../vrijtrace/model";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { GlobalTestState, render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const pdfPage = () => ({
  ...API.createElement({
    type: "image",
    id: "pdf1",
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
  }),
  fileId: "pdfpage1" as any,
  status: "saved" as const,
  customData: { isPdf: true, pdfCmPerPx: 5 },
});
const page = () => h.elements.find((e) => e.id === "pdf1") as any;
const active = () => pageState(h.elements, page())!.active;
const pages = () =>
  h.elements.filter((e) => (e as any).customData?.isPdf && !e.isDeleted);
/** the page that is not pdf1 has its own copy of the network and trench line */
const expectCopiedNetwork = () => {
  const copy = pages().find((e) => e.id !== "pdf1")!;
  expect(copy).toBeDefined();
  const parts = getPageParts(h.elements, copy.id);
  expect(parts.network?.id).toBe(`vrijtrace-${copy.id}`);
  expect(parts.lines).toHaveLength(1);
  const original = getPageParts(h.elements, "pdf1");
  expect(original.network?.id).toBe("vrijtrace-pdf1");
  expect(original.lines).toHaveLength(1);
  expect(parts.lines[0].id).not.toBe(original.lines[0].id);
  return { copy, parts, original };
};
const liveTrench = () =>
  h.elements.filter(
    (e) => (e.type === "trench" || isTrenchLine(e)) && !e.isDeleted,
  );
const trenchLine = () => getPageParts(h.elements, "pdf1").lines[0];

describe("Vrij Tracé follows its page", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw
        vrijTraceEnabled={true}
        handleKeyboardGlobally={true}
        autoFocus={true}
      />,
    );
    API.setElements([pdfPage()]);
    act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
    mouse.reset();
    for (const x of [100, 400]) {
      mouse.moveTo(x, 100);
      mouse.clickAt(x, 100);
    }
    Keyboard.keyPress(KEYS.ESCAPE);
    act(() => h.app.vrijTrace.activate());
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([]);
  });

  it("keeps zones active when the page is moved or resized", () => {
    API.setSelectedElements([page()]);
    mouse.reset();
    mouse.downAt(900, 600);
    mouse.moveTo(1100, 700);
    mouse.upAt(1100, 700);
    expect(page().x).not.toBe(0);
    expect(active()).toBe(true);
    UI.resize(page(), "se", [370, 259]);
    expect(active()).toBe(true);
  });

  it("keeps the network on its page when resized or rotated with other elements", () => {
    const rect = API.createElement({
      type: "rectangle",
      x: 1100,
      y: 100,
      width: 100,
      height: 100,
    });
    API.setElements([...h.elements, rect]);
    const centreBefore = () => {
      const l = trenchLine();
      const p = page();
      // the line's start in page fractions, which a group transform must keep
      return [
        (l.x + l.points[0][0] - p.x) / p.width,
        (l.y + l.points[0][1] - p.y) / p.height,
      ];
    };
    const before = centreBefore();
    API.setSelectedElements([page(), rect]);
    UI.resize([page(), rect], "se", [240, 160]);
    expect(page().width).toBeGreaterThan(1000);
    expect(centreBefore()[0]).toBeCloseTo(before[0], 3);
    expect(centreBefore()[1]).toBeCloseTo(before[1], 3);
    expect(active()).toBe(true);
    API.setSelectedElements([page(), rect]);
    UI.rotate([page(), rect], [300, 50]);
    expect(page().angle).not.toBe(0);
    expect(active()).toBe(true);
  });

  it("zones switch off when a trench line is moved, like any edit", () => {
    expect(active()).toBe(true);
    API.setSelectedElements([trenchLine()]);
    mouse.reset();
    mouse.downAt(250, 100);
    mouse.moveTo(250, 180);
    mouse.upAt(250, 180);
    expect(trenchLine().y).toBeCloseTo(180);
    expect(active()).toBe(false);
  });

  it("deactivates zones when the page is recalibrated", () => {
    API.executeAction(actionDistanceConversion, {
      pdfCalibration: { pdfId: "pdf1", cmPerPx: 6 },
    });
    expect(active()).toBe(false);
  });

  it("deletes the whole network with the page", () => {
    API.setSelectedElements([page()]);
    API.executeAction(actionDeleteSelected);
    expect(liveTrench()).toHaveLength(0);
  });

  it("copies the network when the page is duplicated", () => {
    API.setSelectedElements([page()]);
    API.executeAction(actionDuplicateSelection);
    const { copy, parts } = expectCopiedNetwork();
    expect(parts.lines[0].customData?.pdfParentId).toBe(copy.id);
    // the copy is a new layout (new line ids): its zones wait for "Activeer"
    expect(pageState(h.elements, copy as any)!.active).toBe(false);
    expect(active()).toBe(true);
  });

  it("Ctrl+D selects the copied page, not its trench parts", () => {
    API.setSelectedElements([page()]);
    API.executeAction(actionDuplicateSelection);
    const selected = h.elements.filter((e) => h.state.selectedElementIds[e.id]);
    expect(selected).toHaveLength(1);
    expect(selected.some(isTrenchElement)).toBe(false);
    expect(selected.some(isTrenchLine)).toBe(false);
  });

  it("Ctrl+D on a trench line alone copies and selects that line", () => {
    API.setSelectedElements([trenchLine()]);
    API.executeAction(actionDuplicateSelection);
    const lines = getPageParts(h.elements, "pdf1").lines;
    expect(lines).toHaveLength(2);
    const copy = lines.find((l) => l.id !== trenchLine().id)!;
    expect(h.state.selectedElementIds[copy.id]).toBe(true);
  });

  it("copy and paste brings the page's network along", async () => {
    API.setSelectedElements([page()]);
    let text = "";
    const clipboardEvent = {
      clipboardData: {
        setData: (_type: string, data: string) => {
          text = data;
        },
        getData: () => text,
      },
    };
    API.executeAction(actionCopy, clipboardEvent);
    // paste only lands with the pointer over the canvas (as clipboard.test)
    Object.assign(document, { elementFromPoint: () => GlobalTestState.canvas });
    await waitFor(() => expect(text).not.toBe(""));
    document.dispatchEvent(createPasteEvent({ types: { "text/plain": text } }));
    await waitFor(() => expect(pages()).toHaveLength(2));
    expectCopiedNetwork();
  });

  it("alt-drag copies the page with its network, leaving the original in place", () => {
    const before = [trenchLine().x, trenchLine().y];
    API.setSelectedElements([page()]);
    mouse.reset();
    mouse.downAt(900, 600);
    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.moveTo(950, 650);
    });
    mouse.upAt(950, 650);
    const { copy, parts, original } = expectCopiedNetwork();
    expect([page().x, page().y]).toEqual([0, 0]);
    expect([original.lines[0].x, original.lines[0].y]).toEqual(before);
    // the copy's trench line moved with the copy
    expect(copy.x).not.toBe(0);
    expect(parts.lines[0].x).toBeCloseTo(before[0] + copy.x);
  });

  it("never unlocks trench parts", () => {
    API.executeAction(actionUnlockAllElements);
    expect(
      h.elements.filter((e) => e.type === "trench").every((e) => e.locked),
    ).toBe(true);
  });

  it("does not offer 'unlock all' for trench parts alone", () => {
    expect(actionUnlockAllElements.predicate!(h.elements, h.state as any)).toBe(
      false,
    );
  });
});
