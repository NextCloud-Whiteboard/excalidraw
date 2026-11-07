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
/** a library tree's ring (5 cm/px: 20 px = 1 m), as placed on pdf1 */
const libraryTree = (
  id: string,
  cx: number,
  cy: number,
  ringPx: number,
  treeRing: object = { klasse: "C1", scherm: false },
) => ({
  ...API.createElement({
    type: "ellipse",
    id,
    x: cx - ringPx,
    y: cy - ringPx,
    width: 2 * ringPx,
    height: 2 * ringPx,
    strokeStyle: "dashed",
  }),
  customData: { treeRing, pdfParentId: "pdf1" },
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
      // trees come from the library: no B-markers to add or move
      "vt-tree-add",
      "vt-stop",
      "vt-tree-B1",
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

  it("the example network has no trees", () => {
    openOnPage();
    act(() => h.app.vrijTrace.example());
    // eight segments, joined into lines where they run on
    const page = h.elements.find((e) => e.id === "pdf1") as any;
    expect(pageState(h.elements, page)!.geometry.segments).toHaveLength(8);
    expect(getPageParts(h.elements, "pdf1").lines.length).toBeLessThan(8);
    expect(getPageParts(h.elements, "pdf1").trees).toHaveLength(0);
    act(() => h.app.vrijTrace.clear());
    expect(getPageParts(h.elements, "pdf1").lines).toHaveLength(0);
  });

  const rows = () =>
    [...byId("vt-rows").querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("td")].map((td) => td.textContent),
    );

  it("lists the library trees on the page, numbered, measured from their ring", () => {
    drawLine([100, 100], [400, 100]);
    // centre 5 m from the trench centre line: 4,50 m from its edge;
    // a ring of 3 m leaves 1,50 m
    API.updateScene({
      elements: [
        ...h.elements,
        libraryTree("t1", 250, 200, 60),
        libraryTree("t2", 250, 120, 20, { klasse: "C3", scherm: true }),
      ],
    });
    // the verdict right after the name: a narrow sidebar scrolls the rest
    expect(rows()).toEqual([
      [
        "1",
        "C1 groot, zonder scherm",
        "1,50 m",
        "Voldoet",
        "0,00 m",
        "Nee",
        "—",
        "—",
      ],
      [
        "2",
        "C3 klein, met scherm",
        "−0,50 m",
        "Conflict",
        "0,00 m",
        "Nee",
        "—",
        "—",
      ],
    ]);
  });

  it("counts the minimum distance beyond the ring", () => {
    drawLine([100, 100], [400, 100]);
    API.updateScene({
      elements: [...h.elements, libraryTree("t1", 250, 200, 60)],
    });
    fireEvent.change(byId("vt-tree-min"), { target: { value: "2" } });
    expect(rows()[0].slice(2, 5)).toEqual(["1,50 m", "Conflict", "2,00 m"]);
    fireEvent.change(byId("vt-tree-min"), { target: { value: "1.5" } });
    expect(rows()[0].slice(2, 5)).toEqual(["1,50 m", "Voldoet", "1,50 m"]);
  });

  it("pointing at a row outlines that tree", () => {
    drawLine([100, 100], [400, 100]);
    API.updateScene({
      elements: [...h.elements, libraryTree("t1", 250, 200, 60)],
    });
    const [row] = byId("vt-rows").querySelectorAll("tr");
    fireEvent.pointerEnter(row);
    expect(h.state.vrijTrace.hotTreeId).toBe("t1");
    fireEvent.pointerLeave(row);
    expect(h.state.vrijTrace.hotTreeId).toBeNull();
    // a tap on a phone, which has no pointer to leave with
    fireEvent.click(row);
    expect(h.state.vrijTrace.hotTreeId).toBe("t1");
  });

  it("the Werkruimte and Minimale afstand sliders follow the drag at once", () => {
    drawLine([100, 100], [400, 100]);
    const work = () => byId("vt-work-width") as HTMLInputElement;
    const treeMin = () => byId("vt-tree-min") as HTMLInputElement;
    fireEvent.change(work(), { target: { value: "3" } });
    expect(work().value).toBe("3");
    expect(container.textContent).toContain("3,00 m");
    fireEvent.change(treeMin(), { target: { value: "7.5" } });
    expect(treeMin().value).toBe("7.5");
    expect(container.textContent).toContain("7,50 m");
  });

  it("a slider drag is one undo step", async () => {
    drawLine([100, 100], [400, 100]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
    for (const id of ["vt-work-width", "vt-tree-min"]) {
      const before = API.getUndoStack().length;
      for (const v of ["1", "2", "3", "4"]) {
        fireEvent.change(byId(id), { target: { value: v } });
        await act(() => new Promise((r) => setTimeout(r, 0)));
      }
      fireEvent.pointerUp(byId(id));
      await act(() => new Promise((r) => setTimeout(r, 0)));
      expect(API.getUndoStack().length).toBe(before + 1);
    }
  });

  it("says when the zones shown are a concept", () => {
    drawLine([100, 100], [400, 100]);
    fireEvent.click(byId("vt-activate"));
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
    fireEvent.change(byId("vt-work-width"), { target: { value: "3" } });
    expect(byId("vt-zone-state").textContent).toBe(
      "Zones niet geactiveerd · concept",
    );
    fireEvent.click(byId("vt-activate"));
    expect(byId("vt-zone-state").textContent).toMatch(/^Zones geactiveerd/);
    fireEvent.click(byId("vt-activate")); // off on purpose: no concept
    expect(byId("vt-zone-state").textContent).toBe("Zones niet geactiveerd");
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

  it("draws thin trench lines; Lijndikte restyles the selected line only", () => {
    drawLine([100, 100], [400, 100]);
    drawLine([100, 300], [400, 300]);
    const widths = () =>
      getPageParts(h.elements, "pdf1").lines.map((l) => l.strokeWidth);
    const slider = () => byId("vt-line-width") as HTMLInputElement;
    expect(widths()).toEqual([0.5, 0.5]);
    expect(slider().value).toBe("0.5");
    expect([slider().min, slider().max]).toEqual(["0.1", "4"]);
    act(() => h.app.vrijTrace.activate());
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
    fireEvent.change(slider(), { target: { value: "2" } });
    expect(widths()).toEqual([2, 0.5]);
    expect(slider().value).toBe("2");
    expect(container.textContent).toContain("2,00 px");
    // only the look changes: the zones stay on
    expect(h.app.vrijTrace.zonesActive()).toBe(true);
    // the slider shows the selected line's own width
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[1]]);
    expect(slider().value).toBe("0.5");
  });

  it("redraws a trench line when its Lijndikte changes", () => {
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([line]);
    ShapeCache.generateElementShape(line, null);
    expect(ShapeCache.get(line)).toBeDefined();
    fireEvent.change(byId("vt-line-width"), { target: { value: "3" } });
    // the cached drawing had the old width baked in
    expect(ShapeCache.get(line)).toBeUndefined();
  });

  it("offers the sides of the plan for both zones", () => {
    fireEvent.click(byId("toolbar-vrijtrace"));
    for (const id of ["vt-red-side", "vt-work-side"]) {
      const options = [...(byId(id) as HTMLSelectElement).options];
      expect(options.map((o) => [o.value, o.textContent])).toEqual([
        ["beide", "Beide zijden"],
        ["boven", "Boven"],
        ["onder", "Onder"],
        ["links", "Links"],
        ["rechts", "Rechts"],
      ]);
    }
  });

  it("Rode zone and Werkruimte change the selected line only", () => {
    drawLine([100, 100], [400, 100]);
    drawLine([100, 300], [400, 300]);
    const [first, second] = getPageParts(h.elements, "pdf1").lines;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([first]);
    fireEvent.change(byId("vt-work-width"), { target: { value: "3" } });
    fireEvent.change(byId("vt-red-side"), { target: { value: "boven" } });
    fireEvent.change(byId("vt-work-side"), { target: { value: "onder" } });
    const data = (id: string) =>
      (h.elements.find((e) => e.id === id) as any).customData;
    expect(data(first.id)).toMatchObject({
      workWidthM: 3,
      redSide: "boven",
      workSide: "onder",
    });
    expect(data(second.id)).toMatchObject({
      workWidthM: 1.5,
      redSide: "beide",
      workSide: "beide",
    });
    // the zones follow each line's own settings
    const state = pageState(h.elements, h.elements[0] as any)!;
    const bySeg = (id: string) =>
      state.geometry.segments.find((g) => g.id.startsWith(id))!;
    expect(bySeg(first.id).workWidthM).toBe(3);
    expect(bySeg(second.id).workWidthM).toBe(1.5);
    // the panel shows the selected line's settings
    expect((byId("vt-work-width") as HTMLInputElement).value).toBe("3");
    API.setSelectedElements([second]);
    expect((byId("vt-work-width") as HTMLInputElement).value).toBe("1.5");
    expect((byId("vt-red-side") as HTMLSelectElement).value).toBe("beide");
  });

  it("Tekenreferentie changes the selected line only", () => {
    drawLine([100, 100], [400, 100]);
    drawLine([100, 300], [400, 300]);
    const [first, second] = getPageParts(h.elements, "pdf1").lines;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([first]);
    fireEvent.click(byId("vt-ref-boven"));
    const el = (id: string) => h.elements.find((e) => e.id === id) as any;
    expect(el(first.id).customData.reference).toBe("boven");
    expect(el(first.id).strokeStyle).toBe("solid");
    expect(el(second.id).customData.reference).toBe("midden");
    expect(el(second.id).strokeStyle).toBe("dashed");
    expect(byId("vt-ref-boven").getAttribute("aria-pressed")).toBe("true");
    API.setSelectedElements([second]);
    expect(byId("vt-ref-midden").getAttribute("aria-pressed")).toBe("true");
  });

  it("with no line selected, the settings are for the next line", () => {
    drawLine([100, 100], [400, 100]);
    expect(container.textContent).toContain(
      "Geen sleuf geselecteerd: instellingen voor de volgende sleuf.",
    );
    fireEvent.change(byId("vt-work-width"), { target: { value: "3" } });
    fireEvent.change(byId("vt-line-width"), { target: { value: "2" } });
    fireEvent.change(byId("vt-red-side"), { target: { value: "rechts" } });
    const [first] = getPageParts(h.elements, "pdf1").lines;
    expect(first.strokeWidth).toBe(0.5);
    expect(first.customData).toMatchObject({
      workWidthM: 1.5,
      redSide: "beide",
    });
    drawLine([100, 300], [400, 300]);
    const second = getPageParts(h.elements, "pdf1").lines[1];
    expect(second.strokeWidth).toBe(2);
    expect(second.customData).toMatchObject({
      workWidthM: 3,
      redSide: "rechts",
      workSide: "beide",
    });
  });

  it("says that changes apply to the selected line", () => {
    drawLine([100, 100], [400, 100]);
    drawLine([100, 300], [400, 300]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    const lines = getPageParts(h.elements, "pdf1").lines;
    API.setSelectedElements([lines[0]]);
    expect(byId("vt-applies").textContent).toBe(
      "Wijzigingen gelden voor de geselecteerde sleuf.",
    );
    API.setSelectedElements(lines);
    expect(byId("vt-applies").textContent).toBe(
      "Wijzigingen gelden voor de 2 geselecteerde sleuven.",
    );
  });

  it("a line from before keeps its page's zone settings until it is changed", () => {
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    const network = getPageParts(h.elements, "pdf1").network!;
    act(() => {
      // as saved before lines had their own settings
      h.app.scene.mutateElement(line, {
        customData: { tool: "trench", widthM: 1, pdfParentId: "pdf1" },
      });
      h.app.scene.mutateElement(network, {
        trench: {
          ...(network.trench as any),
          workWidthM: 2.5,
          redSide: "links",
        },
      });
    });
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
    expect((byId("vt-work-width") as HTMLInputElement).value).toBe("2.5");
    fireEvent.change(byId("vt-work-side"), { target: { value: "rechts" } });
    expect(getPageParts(h.elements, "pdf1").lines[0].customData).toMatchObject({
      workWidthM: 2.5,
      redSide: "links",
      workSide: "rechts",
    });
  });

  it("keeps the usual shape actions for other selections", () => {
    API.setElements([
      pdfPage(),
      API.createElement({ type: "rectangle", x: 50, y: 50 }),
    ]);
    API.setSelectedElements([h.elements[1]]);
    expect(byId("vt-width")).toBeNull();
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
