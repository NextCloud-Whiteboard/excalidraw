import React from "react";
import { act, fireEvent, queryByTestId } from "@testing-library/react";

import { Excalidraw } from "../index";
import { getPageParts } from "../vrijtrace/model";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
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

describe("Vrij Tracé UI", () => {
  let container: HTMLElement;
  const byId = (id: string) => queryByTestId(container, id)!;
  const openOnPage = () => {
    fireEvent.click(byId("toolbar-vrijtrace"));
    mouse.reset();
    mouse.clickAt(100, 100); // makes pdf1 the current page
    act(() => h.app.vrijTrace.finish());
  };

  beforeEach(async () => {
    ({ container } = await render(
      <Excalidraw
        vrijTraceEnabled={true}
        vrijTraceUser={{ uid: "u1", name: "Jij" }}
      />,
    ));
    // tests skip breakpoint detection; act as a desktop that can dock the
    // sidebar (an undocked one closes on every canvas click)
    h.app.device = {
      ...h.app.device,
      editor: { ...h.app.device.editor, canFitSidebar: true },
    };
    API.setElements([pdfPage()]);
  });

  it("hides the tool when disabled", async () => {
    const other = await render(<Excalidraw />);
    expect(queryByTestId(other.container, "toolbar-vrijtrace")).toBeNull();
  });

  it("shows v8.2's six sections and the action row", () => {
    fireEvent.click(byId("toolbar-vrijtrace"));
    for (const id of [
      "vt-mode-teken",
      "vt-mode-verplaats",
      "vt-mode-selecteer",
      "vt-mode-verwijder",
      "vt-snap-90",
      "vt-snap-45",
      "vt-snap-vrij",
      "vt-width",
      "vt-ref-links",
      "vt-red-side",
      "vt-work-width",
      "vt-work-side",
      "vt-tree-min",
      "vt-tree-add",
      "vt-stop",
      "vt-activate",
      "vt-finish",
      "vt-undo",
      "vt-delete",
      "vt-example",
      "vt-clear",
      "vt-pdf",
    ]) {
      expect(byId(id)).not.toBeNull();
    }
  });

  it("Voorbeeld loads the v8.2 example with three trees, Wis tracé keeps the trees", () => {
    openOnPage();
    fireEvent.click(byId("vt-example"));
    expect(getPageParts(h.elements, "pdf1").segments).toHaveLength(8);
    expect(
      getPageParts(h.elements, "pdf1")
        .trees.map((t: any) => t.trench.label)
        .sort(),
    ).toEqual(["B1", "B2", "B3"]);
    expect(byId("vt-rows").querySelectorAll("tr")).toHaveLength(3);
    expect(byId("vt-tree-B2")).not.toBeNull();
    fireEvent.click(byId("vt-clear"));
    expect(getPageParts(h.elements, "pdf1").segments).toHaveLength(0);
    expect(getPageParts(h.elements, "pdf1").trees).toHaveLength(3);
  });

  it("changing the minimum distance changes only the verdict", () => {
    openOnPage();
    fireEvent.click(byId("vt-example"));
    const distances = (t: string | null) =>
      (t ?? "").match(/\d+,\d+ m/g)!.filter((_, i) => i % 2 === 0);
    const before = byId("vt-rows").textContent;
    fireEvent.change(byId("vt-tree-min"), { target: { value: "0" } });
    const after = byId("vt-rows").textContent;
    expect(distances(after)).toEqual(distances(before));
    expect(after).not.toEqual(before);
  });

  it("shows the activation state and who activated", () => {
    fireEvent.click(byId("toolbar-vrijtrace"));
    mouse.reset();
    mouse.clickAt(100, 100);
    mouse.clickAt(400, 100);
    expect(byId("vt-zone-state").textContent).toBe("Zones niet geactiveerd");
    fireEvent.click(byId("vt-activate"));
    expect(byId("vt-zone-state").textContent).toMatch(
      /^Zones geactiveerd · door Jij, \d\d:\d\d$/,
    );
  });

  it("selecting a segment and moving the width slider widens that segment", () => {
    openOnPage();
    fireEvent.click(byId("vt-example"));
    fireEvent.click(byId("vt-mode-selecteer"));
    const seg = getPageParts(h.elements, "pdf1").segments[0] as any;
    const a = h.elements.find((e) => e.id === seg.trench.a)!;
    const b = h.elements.find((e) => e.id === seg.trench.b)!;
    mouse.reset();
    mouse.clickAt((a.x + b.x) / 2 + 0.5, (a.y + b.y) / 2 + 0.5);
    fireEvent.change(byId("vt-width"), { target: { value: "2" } });
    const after = h.elements.find((e) => e.id === seg.id) as any;
    expect(after.trench.widthM).toBe(2);
  });

  it("lifts toasts above the action row while the tool is open", () => {
    const editor = container.querySelector(".excalidraw") as HTMLElement;
    const offset = () => editor.style.getPropertyValue("--vt-actions-offset");
    expect(offset()).toBe("");
    fireEvent.click(byId("toolbar-vrijtrace"));
    expect(offset()).toMatch(/^\d+px$/);
    act(() => h.app.setActiveTool({ type: "selection" }));
    expect(offset()).toBe("");
  });
});
