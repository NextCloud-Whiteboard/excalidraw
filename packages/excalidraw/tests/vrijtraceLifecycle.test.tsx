import React from "react";
import { act, waitFor } from "@testing-library/react";

import { isTrenchElement } from "@excalidraw/element";

import { actionCopy } from "../actions/actionClipboard";
import { actionDeleteSelected } from "../actions/actionDeleteSelected";
import { actionDistanceConversion } from "../actions/actionDistanceConversion";
import { actionDuplicateSelection } from "../actions/actionDuplicateSelection";
import { actionUnlockAllElements } from "../actions/actionElementLock";
import { createPasteEvent } from "../clipboard";
import { Excalidraw } from "../index";
import { getPageParts, pageState } from "../vrijtrace/model";

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
/** the page that is not pdf1 has its own, consistent copy of the network */
const expectCopiedNetwork = () => {
  const copy = pages().find((e) => e.id !== "pdf1")!;
  expect(copy).toBeDefined();
  const parts = getPageParts(h.elements, copy.id);
  expect(parts.network?.id).toBe(`vrijtrace-${copy.id}`);
  expect(parts.segments).toHaveLength(1);
  expect(parts.nodes).toHaveLength(2);
  const nodeIds = new Set(parts.nodes.map((n) => n.id));
  for (const seg of parts.segments as any[]) {
    expect(nodeIds.has(seg.trench.a) && nodeIds.has(seg.trench.b)).toBe(true);
  }
  const original = getPageParts(h.elements, "pdf1");
  expect(original.network?.id).toBe("vrijtrace-pdf1");
  expect(original.segments).toHaveLength(1);
  expect(original.nodes).toHaveLength(2);
  return { copy, parts, original };
};
const liveTrench = () =>
  h.elements.filter((e) => e.type === "trench" && !e.isDeleted);

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
    mouse.clickAt(100, 100);
    mouse.clickAt(400, 100);
    act(() => h.app.vrijTrace.finish());
    act(() => h.app.vrijTrace.activate());
    act(() => h.app.setActiveTool({ type: "selection" }));
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

  it("copies the network when the page is duplicated, with remapped ids", () => {
    API.setSelectedElements([page()]);
    API.executeAction(actionDuplicateSelection);
    const copy = h.elements.find(
      (e) => (e as any).customData?.isPdf && e.id !== "pdf1" && !e.isDeleted,
    )!;
    const parts = getPageParts(h.elements, copy.id);
    expect(parts.network?.id).toBe(`vrijtrace-${copy.id}`);
    expect(parts.segments).toHaveLength(1);
    expect(parts.nodes).toHaveLength(2);
    const nodeIds = new Set(parts.nodes.map((n) => n.id));
    expect(
      parts.segments.every(
        (s: any) => nodeIds.has(s.trench.a) && nodeIds.has(s.trench.b),
      ),
    ).toBe(true);
    // the original page keeps its own network and parts
    const original = getPageParts(h.elements, "pdf1");
    expect(original.network?.id).toBe("vrijtrace-pdf1");
    expect(original.segments).toHaveLength(1);
    expect(original.nodes).toHaveLength(2);
    // the copy is a new layout (new part ids): its zones wait for "Activeer"
    expect(pageState(h.elements, copy as any)!.active).toBe(false);
    expect(active()).toBe(true);
  });

  it("Ctrl+D selects the copied page, not its trench parts", () => {
    API.setSelectedElements([page()]);
    API.executeAction(actionDuplicateSelection);
    const selected = h.elements.filter((e) => h.state.selectedElementIds[e.id]);
    expect(selected).toHaveLength(1);
    expect(selected.some(isTrenchElement)).toBe(false);
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
    const before = getPageParts(h.elements, "pdf1").nodes.map((n) => [
      n.x,
      n.y,
    ]);
    API.setSelectedElements([page()]);
    mouse.reset();
    mouse.downAt(900, 600);
    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.moveTo(950, 650);
    });
    mouse.upAt(950, 650);
    const { copy, parts, original } = expectCopiedNetwork();
    expect([page().x, page().y]).toEqual([0, 0]);
    expect(original.nodes.map((n) => [n.x, n.y])).toEqual(before);
    // the copy's parts moved with the copy
    const dx = copy.x;
    expect(dx).not.toBe(0);
    expect(parts.nodes.map((n) => n.x).sort()).toEqual(
      before.map(([x]) => x + dx).sort(),
    );
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
