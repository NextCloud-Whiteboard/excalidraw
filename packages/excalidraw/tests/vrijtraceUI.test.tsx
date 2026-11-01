import React from "react";
import { act, fireEvent, queryByTestId } from "@testing-library/react";

import { ShapeCache } from "@excalidraw/element";

import { Excalidraw } from "../index";
import { getPageParts, pageState } from "../vrijtrace/model";

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
  /** a trench drawn with the tool, as one stroke (the tool stays) */
  const drawLine = (from: [number, number], to: [number, number]) => {
    if (h.state.activeTool.type !== "custom") {
      fireEvent.click(byId("toolbar-vrijtrace"));
    }
    mouse.reset();
    mouse.downAt(...from);
    for (let i = 1; i <= 10; i++) {
      mouse.moveTo(
        from[0] + ((to[0] - from[0]) * i) / 10,
        from[1] + ((to[1] - from[1]) * i) / 10,
      );
    }
    mouse.upAt(...to);
  };
  const openOnPage = () => {
    fireEvent.click(byId("toolbar-vrijtrace"));
    mouse.reset();
    mouse.clickAt(100, 100); // makes pdf1 the current page
  };

  beforeEach(async () => {
    ({ container } = await render(
      <Excalidraw
        handleKeyboardGlobally={true}
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

  it("shows the settings without mode buttons, and only the zones toggle at the bottom", () => {
    fireEvent.click(byId("toolbar-vrijtrace"));
    for (const id of [
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
    ]) {
      expect(byId(id)).not.toBeNull();
    }
    expect(byId("vt-snap-vrij").getAttribute("aria-pressed")).toBe("true");
    // the whiteboard covers these: drawing, moving, selecting, deleting,
    // undo/redo and finishing a line
    for (const id of [
      "vt-mode-teken",
      "vt-mode-verplaats",
      "vt-mode-selecteer",
      "vt-mode-verwijder",
      "vt-finish",
      "vt-undo",
      "vt-delete",
      "vt-example",
      "vt-clear",
      "vt-pdf",
    ]) {
      expect(byId(id)).toBeNull();
    }
  });

  it("the toggle activates the zones and deactivates them again", () => {
    drawLine([100, 100], [400, 100]);
    expect(byId("vt-activate").textContent).toBe("Activeer zones");
    fireEvent.click(byId("vt-activate"));
    expect(byId("vt-zone-state").textContent).toMatch(/^Zones geactiveerd/);
    expect(byId("vt-activate").textContent).toBe("Deactiveer zones");
    // the button and the sidebar show the state; no pop-up message on top
    expect(h.state.toast).toBeNull();
    fireEvent.click(byId("vt-activate"));
    expect(byId("vt-zone-state").textContent).toBe("Zones niet geactiveerd");
    expect(h.state.toast).toBeNull();
    expect(byId("vt-activate").textContent).toBe("Activeer zones");
    const network = getPageParts(h.elements, "pdf1").network as any;
    expect(network.trench.activation).toBeNull();
    // the trench itself stays
    expect(getPageParts(h.elements, "pdf1").lines).toHaveLength(1);
  });

  it("Esc leaves tree placing, back to drawing", () => {
    openOnPage();
    fireEvent.click(byId("vt-tree-add"));
    expect(h.state.vrijTrace.mode).toBe("boomToevoegen");
    act(() => {
      h.app.vrijTrace.onKeyDown({ key: "Escape" });
    });
    expect(h.state.vrijTrace.mode).toBe("teken");
  });

  it("the example network has three trees, and clearing keeps the trees", () => {
    openOnPage();
    act(() => h.app.vrijTrace.example());
    // eight segments, joined into lines where they run on
    const page = h.elements.find((e) => e.id === "pdf1") as any;
    expect(pageState(h.elements, page)!.geometry.segments).toHaveLength(8);
    expect(getPageParts(h.elements, "pdf1").lines.length).toBeLessThan(8);
    expect(
      getPageParts(h.elements, "pdf1")
        .trees.map((t: any) => t.trench.label)
        .sort(),
    ).toEqual(["B1", "B2", "B3"]);
    expect(byId("vt-rows").querySelectorAll("tr")).toHaveLength(3);
    expect(byId("vt-tree-B2")).not.toBeNull();
    act(() => h.app.vrijTrace.clear());
    expect(getPageParts(h.elements, "pdf1").lines).toHaveLength(0);
    expect(getPageParts(h.elements, "pdf1").trees).toHaveLength(3);
  });

  it("changing the minimum distance changes only the verdict", () => {
    openOnPage();
    act(() => h.app.vrijTrace.example());
    const distances = (t: string | null) =>
      (t ?? "").match(/\d+,\d+ m/g)!.filter((_, i) => i % 2 === 0);
    const before = byId("vt-rows").textContent;
    fireEvent.change(byId("vt-tree-min"), { target: { value: "0" } });
    const after = byId("vt-rows").textContent;
    expect(distances(after)).toEqual(distances(before));
    expect(after).not.toEqual(before);
  });

  it("shows the activation state and who activated", () => {
    drawLine([100, 100], [400, 100]);
    expect(byId("vt-zone-state").textContent).toBe("Zones niet geactiveerd");
    fireEvent.click(byId("vt-activate"));
    expect(byId("vt-zone-state").textContent).toMatch(
      /^Zones geactiveerd · door Jij, \d\d:\d\d$/,
    );
  });

  it("a selected trench line shows the panel, and the slider widens that line only", () => {
    drawLine([100, 100], [400, 100]);
    drawLine([100, 300], [400, 300]);
    const [first, second] = getPageParts(h.elements, "pdf1").lines;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([first]);
    expect(byId("vt-width")).not.toBeNull();
    fireEvent.change(byId("vt-width"), { target: { value: "2" } });
    const width = (id: string) =>
      (h.elements.find((e) => e.id === id) as any).customData.widthM;
    expect(width(first.id)).toBe(2);
    expect(width(second.id)).toBe(1);
    // the panel shows the new width at once
    expect((byId("vt-width") as HTMLInputElement).value).toBe("2");
    expect((byId("vt-width-input") as HTMLInputElement).value).toBe("2,00");
    // the slider shows the selected line's width
    API.setSelectedElements([second]);
    expect((byId("vt-width") as HTMLInputElement).value).toBe("1");
  });

  it("keeps the zones toggle for a selected trench line with the selection tool", () => {
    drawLine([100, 100], [400, 100]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
    fireEvent.click(byId("vt-activate"));
    expect(byId("vt-zone-state").textContent).toMatch(/^Zones geactiveerd/);
    API.setSelectedElements([]);
    expect(byId("vt-activate")).toBeNull();
  });

  it("draws again after moving a trench with the selection tool", () => {
    drawLine([100, 100], [400, 100]);
    fireEvent.click(byId("toolbar-selection"));
    const line = getPageParts(h.elements, "pdf1").lines[0];
    API.setSelectedElements([line]);
    mouse.reset();
    mouse.downAt(250, 100);
    mouse.moveTo(250, 160);
    mouse.upAt(250, 160);
    expect(getPageParts(h.elements, "pdf1").lines[0].y).toBeCloseTo(160);
    fireEvent.click(byId("toolbar-vrijtrace"));
    drawLine([100, 300], [400, 300]);
    expect(getPageParts(h.elements, "pdf1").lines).toHaveLength(2);
  });

  it("offers Bovenrand and Onderrand as drawing references", () => {
    fireEvent.click(byId("toolbar-vrijtrace"));
    expect(byId("vt-ref-boven").textContent).toBe("Bovenrand");
    expect(byId("vt-ref-onder").textContent).toBe("Onderrand");
    fireEvent.click(byId("vt-ref-boven"));
    expect(byId("vt-ref-boven").getAttribute("aria-pressed")).toBe("true");
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    expect(line.customData?.reference).toBe("boven");
    expect(line.strokeStyle).toBe("solid");
  });

  it("sets widths from 0,30 to 10 m, by slider or typed", () => {
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([line]);
    expect(byId("vt-width").getAttribute("max")).toBe("10");
    const field = byId("vt-width-input") as HTMLInputElement;
    expect(field.value).toBe("1,00");
    const width = () =>
      (h.elements.find((e) => e.id === line.id) as any).customData.widthM;
    fireEvent.change(field, { target: { value: "7,5" } });
    fireEvent.blur(field);
    expect(width()).toBe(7.5);
    expect(field.value).toBe("7,50");
    fireEvent.change(field, { target: { value: "12" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(width()).toBe(10);
    expect(field.value).toBe("10,00");
    // nonsense leaves the width as it was
    fireEvent.change(field, { target: { value: "abc" } });
    fireEvent.blur(field);
    expect(width()).toBe(10);
    expect(field.value).toBe("10,00");
  });

  it("draws thin trench lines; the Lijndikte slider restyles a page's trench lines", () => {
    drawLine([100, 100], [400, 100]);
    const widths = () =>
      getPageParts(h.elements, "pdf1").lines.map((l) => l.strokeWidth);
    const slider = () => byId("vt-line-width") as HTMLInputElement;
    expect(widths()).toEqual([0.5]);
    expect(slider().value).toBe("0.5");
    expect([slider().min, slider().max]).toEqual(["0.1", "4"]);
    act(() => h.app.vrijTrace.activate());
    fireEvent.change(slider(), { target: { value: "2" } });
    expect(widths()).toEqual([2]);
    expect(slider().value).toBe("2");
    expect(container.textContent).toContain("2,00 px");
    // only the look changes: the zones stay on
    expect(h.app.vrijTrace.zonesActive()).toBe(true);
    drawLine([100, 300], [400, 300]);
    expect(widths()).toEqual([2, 2]);
    fireEvent.change(slider(), { target: { value: "0.1" } });
    expect(widths()).toEqual([0.1, 0.1]);
    expect(container.textContent).toContain("0,10 px");
  });

  it("redraws trench lines when Lijndikte changes", () => {
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    ShapeCache.generateElementShape(line, null);
    expect(ShapeCache.get(line)).toBeDefined();
    fireEvent.change(byId("vt-line-width"), { target: { value: "3" } });
    // the cached drawing had the old width baked in
    expect(ShapeCache.get(line)).toBeUndefined();
  });

  it("keeps the usual shape actions for other selections", () => {
    API.setElements([
      pdfPage(),
      API.createElement({ type: "rectangle", x: 50, y: 50 }),
    ]);
    API.setSelectedElements([h.elements[1]]);
    expect(byId("vt-width")).toBeNull();
  });

  it("the tree buttons switch to the tool from a selected trench line", () => {
    drawLine([100, 100], [400, 100]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
    expect(h.state.activeTool.type).toBe("selection");
    fireEvent.click(byId("vt-tree-add"));
    expect(h.state.activeTool).toMatchObject({
      type: "custom",
      customType: "vrijtrace",
    });
    expect(h.state.vrijTrace.mode).toBe("boomToevoegen");
    mouse.reset();
    mouse.clickAt(300, 300);
    expect(getPageParts(h.elements, "pdf1").trees).toHaveLength(1);
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
