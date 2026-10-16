import React from "react";
import { act } from "@testing-library/react";

import { actionDeleteSelected } from "../actions/actionDeleteSelected";
import { actionDistanceConversion } from "../actions/actionDistanceConversion";
import { actionDuplicateSelection } from "../actions/actionDuplicateSelection";
import { actionUnlockAllElements } from "../actions/actionElementLock";
import { Excalidraw } from "../index";
import { getPageParts, pageState } from "../vrijtrace/model";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import { render } from "./test-utils";

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
  customData: { isPdf: true, pdfCmPerPx: 5 },
});
const page = () => h.elements.find((e) => e.id === "pdf1") as any;
const active = () => pageState(h.elements, page())!.active;
const liveTrench = () =>
  h.elements.filter((e) => e.type === "trench" && !e.isDeleted);

describe("Vrij Tracé follows its page", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw vrijTraceEnabled={true} handleKeyboardGlobally={true} />,
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
