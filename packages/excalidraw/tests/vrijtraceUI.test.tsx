import React from "react";
import { act, fireEvent, queryByTestId } from "@testing-library/react";

import { KEYS } from "@excalidraw/common";
import { ShapeCache } from "@excalidraw/element";

import type { ExcalidrawImageElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { getPageParts, pageState } from "../vrijtrace/model";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
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
  /** the tool, picked with the PDF page selected (it is greyed out before) */
  const pickTool = () => {
    API.setSelectedElements([h.elements.find((e) => e.id === "pdf1")!]);
    fireEvent.click(byId("toolbar-vrijtrace"));
  };
  /** a trench drawn with the tool, as one stroke (the tool stays) */
  const drawLine = (from: [number, number], to: [number, number]) => {
    if (h.state.activeTool.type !== "custom") {
      pickTool();
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
  /** Tekenreferentie, a dropdown in the bar */
  const setRef = (ref: string) =>
    fireEvent.change(byId("vt-reference"), { target: { value: ref } });
  const reference = () => (byId("vt-reference") as HTMLSelectElement).value;
  const openOnPage = () => {
    pickTool();
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

  describe("only on a selected PDF page", () => {
    const SELECT = "Selecteer eerst een geïmporteerde PDF-pagina";
    const IMPORT = "Importeer eerst een PDF";
    const tool = () => h.state.activeTool;
    // the radio button's test id is on its input, the look on its label
    const icon = (id: string) => byId(id).closest(".ToolIcon")!;
    const greyed = (id: string) =>
      icon(id).classList.contains("ToolIcon--unavailable");

    it("greys out Vrij Tracé and Liniaal until a PDF page is selected", () => {
      expect(greyed("toolbar-vrijtrace")).toBe(true);
      expect(greyed("toolbar-ruler")).toBe(true);
      expect(icon("toolbar-vrijtrace").getAttribute("title")).toContain(SELECT);
      expect(icon("toolbar-ruler").getAttribute("title")).toContain(SELECT);
      fireEvent.click(byId("toolbar-vrijtrace"));
      expect(tool().type).toBe("selection");
      expect(h.state.toast?.message).toBe(SELECT);
      fireEvent.click(byId("toolbar-ruler"));
      expect(tool().type).toBe("selection");

      API.setSelectedElements([h.elements.find((e) => e.id === "pdf1")!]);
      expect(greyed("toolbar-vrijtrace")).toBe(false);
      expect(greyed("toolbar-ruler")).toBe(false);
      fireEvent.click(byId("toolbar-ruler"));
      expect(tool()).toMatchObject({ type: "custom", customType: "ruler" });
      fireEvent.click(byId("toolbar-vrijtrace"));
      expect(tool()).toMatchObject({ type: "custom", customType: "vrijtrace" });
    });

    it("asks for a PDF on a board without one", () => {
      API.setElements([]);
      expect(greyed("toolbar-vrijtrace")).toBe(true);
      expect(icon("toolbar-ruler").getAttribute("title")).toContain(IMPORT);
      fireEvent.click(byId("toolbar-ruler"));
      expect(h.state.toast?.message).toBe(IMPORT);
    });

    it("U does nothing but show the hint until a PDF page is selected", () => {
      Keyboard.keyPress(KEYS.U);
      expect(tool().type).toBe("selection");
      expect(h.state.toast?.message).toBe(SELECT);
      API.setSelectedElements([h.elements.find((e) => e.id === "pdf1")!]);
      Keyboard.keyPress(KEYS.U);
      expect(tool()).toMatchObject({ type: "custom", customType: "vrijtrace" });
    });

    it("stays available while working on the page, and greys out after", () => {
      drawLine([100, 100], [400, 100]);
      // the tool in use keeps both buttons, whatever is selected
      API.setSelectedElements([]);
      expect(greyed("toolbar-vrijtrace")).toBe(false);
      expect(greyed("toolbar-ruler")).toBe(false);
      act(() => h.app.setActiveTool({ type: "selection" }));
      // something on the page selected: still available
      API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
      expect(greyed("toolbar-vrijtrace")).toBe(false);
      // nothing on a page selected and another tool: greyed out again
      API.setSelectedElements([]);
      expect(greyed("toolbar-vrijtrace")).toBe(true);
      expect(greyed("toolbar-ruler")).toBe(true);
    });
  });

  it("shows the settings in a bar under the toolbar, the zones toggle at its end", () => {
    pickTool();
    const bar = container.querySelector(".vt-bar")!;
    for (const id of [
      "vt-snap-90",
      "vt-snap-45",
      "vt-snap-vrij",
      "vt-width-input",
      "vt-reference",
      "vt-line-width-input",
      "vt-red-side",
      "vt-work-width-input",
      "vt-work-side",
      "vt-activate",
    ]) {
      expect(queryByTestId(bar as HTMLElement, id)).not.toBeNull();
    }
    expect(bar.lastElementChild).toBe(byId("vt-activate"));
    expect(
      [...bar.querySelectorAll(".vt-cap")].map((c) => c.textContent),
    ).toEqual(["1 Uitlijnen", "2 Sleuf", "3 Schadepreventie", "4 Werkruimte"]);
    // no panel on the left, no row floating at the bottom, no tree minimum:
    // trees have a fixed size and are measured from their outer ring
    expect(container.querySelector(".vt-panel")).toBeNull();
    expect(container.querySelector(".vt-actions")).toBeNull();
    expect(byId("vt-tree-min")).toBeNull();
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

  const zones = () =>
    [...byId("vt-rows").querySelectorAll("li")].map((li) =>
      [...li.querySelectorAll(".vt-z")].map((z) =>
        z.getAttribute("aria-label"),
      ),
    );
  const rows = () =>
    [...byId("vt-rows").querySelectorAll("li")].map((li) =>
      [...li.querySelectorAll(".vt-c")].map((c) => c.textContent),
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
    // five columns, the last three small squares: nothing to scroll
    expect(rows()).toEqual([
      ["1", "C1 groot, zonder scherm", "1,50 m", "Voldoet", ""],
      ["2", "C3 klein, met scherm", "−0,50 m", "Conflict", ""],
    ]);
    // in sleuf, schadepreventie, werkruimte: zones off, so only "in sleuf"
    // is answered (no)
    expect(zones()).toEqual([
      ["in sleuf: nee", "schadepreventie: —", "werkruimte: —"],
      ["in sleuf: nee", "schadepreventie: —", "werkruimte: —"],
    ]);
    fireEvent.click(byId("vt-activate"));
    expect(zones()[1]).toEqual([
      "in sleuf: nee",
      "schadepreventie: ja",
      "werkruimte: ja",
    ]);
    // at a glance: two trees, one passes, one conflict
    expect(
      [...byId("vt-tiles").querySelectorAll("b")].map((b) => b.textContent),
    ).toEqual(["2", "1", "1"]);
  });

  it("passes a tree while its ring stays clear, whatever minimum a line saved", () => {
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    // a line from before, saved with a 2 m Minimale afstand
    API.updateScene({
      elements: [
        ...h.elements.map((e) =>
          e.id === line.id
            ? { ...e, customData: { ...e.customData, treeMinM: 2 } }
            : e,
        ),
        libraryTree("t1", 250, 200, 60),
      ],
    });
    expect(rows()[0].slice(2, 4)).toEqual(["1,50 m", "Voldoet"]);
  });

  it("pointing at a row outlines that tree", () => {
    drawLine([100, 100], [400, 100]);
    API.updateScene({
      elements: [...h.elements, libraryTree("t1", 250, 200, 60)],
    });
    const [row] = byId("vt-rows").querySelectorAll("li");
    fireEvent.pointerEnter(row);
    expect(h.state.vrijTrace.hotTreeId).toBe("t1");
    fireEvent.pointerLeave(row);
    expect(h.state.vrijTrace.hotTreeId).toBeNull();
    // a tap on a phone, which has no pointer to leave with
    fireEvent.click(row);
    expect(h.state.vrijTrace.hotTreeId).toBe("t1");
  });

  it("the Werkruimte slider follows the drag at once", () => {
    drawLine([100, 100], [400, 100]);
    const work = () => byId("vt-work-width") as HTMLInputElement;
    fireEvent.change(work(), { target: { value: "3" } });
    expect(work().value).toBe("3");
    expect((byId("vt-work-width-input") as HTMLInputElement).value).toBe(
      "3,00",
    );
  });

  it("drops a field's slider down while the field is in use, from its minimum to its maximum", () => {
    pickTool();
    const pop = (id: string) => byId(id).closest(".vt-pop") as HTMLElement;
    for (const id of ["vt-width", "vt-line-width", "vt-work-width"]) {
      expect(pop(id).hidden).toBe(true);
    }
    fireEvent.focus(byId("vt-width-input"));
    expect(pop("vt-width").hidden).toBe(false);
    expect(pop("vt-line-width").hidden).toBe(true);
    expect(pop("vt-width").textContent).toContain("0,30 m");
    expect(pop("vt-width").textContent).toContain("max. 10,00 m");
    // from the field to its slider: still open
    fireEvent.blur(byId("vt-width-input"), {
      relatedTarget: byId("vt-width"),
    });
    expect(pop("vt-width").hidden).toBe(false);
    // somewhere else: closed
    fireEvent.blur(byId("vt-width"), { relatedTarget: null });
    expect(pop("vt-width").hidden).toBe(true);
    expect(pop("vt-work-width").textContent).toContain("max. 4,00 m");
  });

  it("holds a typed Werkruimte and Lijndikte to their range", () => {
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([line]);
    const type = (id: string, value: string) => {
      fireEvent.change(byId(id), { target: { value } });
      fireEvent.keyDown(byId(id), { key: "Enter" });
    };
    const now = () => getPageParts(h.elements, "pdf1").lines[0];
    type("vt-work-width-input", "9");
    expect(now().customData?.workWidthM).toBe(4);
    type("vt-work-width-input", "2,5");
    expect(now().customData?.workWidthM).toBe(2.5);
    type("vt-line-width-input", "20");
    expect(now().strokeWidth).toBe(4);
  });

  it("a slider drag is one undo step", async () => {
    drawLine([100, 100], [400, 100]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([getPageParts(h.elements, "pdf1").lines[0]]);
    for (const id of ["vt-work-width", "vt-width", "vt-line-width"]) {
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
    pickTool();
    drawLine([100, 300], [400, 300]);
    expect(getPageParts(h.elements, "pdf1").lines).toHaveLength(2);
  });

  it("offers Bovenrand and Onderrand as drawing references", () => {
    pickTool();
    expect(
      [...(byId("vt-reference") as HTMLSelectElement).options].map((o) => [
        o.value,
        o.textContent,
      ]),
    ).toEqual([
      ["midden", "Middenlijn"],
      ["boven", "Bovenrand"],
      ["onder", "Onderrand"],
      ["links", "Linker rand"],
      ["rechts", "Rechter rand"],
    ]);
    setRef("boven");
    expect(reference()).toBe("boven");
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
    pickTool();
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

  it("an edge reference offers only the sides across that edge", () => {
    pickTool();
    const sides = (id: string) =>
      [...(byId(id) as HTMLSelectElement).options].map((o) => o.value);
    const expected = {
      midden: ["beide", "boven", "onder", "links", "rechts"],
      boven: ["beide", "boven", "onder"],
      onder: ["beide", "boven", "onder"],
      links: ["beide", "links", "rechts"],
      rechts: ["beide", "links", "rechts"],
    };
    for (const [ref, values] of Object.entries(expected)) {
      setRef(ref);
      expect(sides("vt-red-side")).toEqual(values);
      expect(sides("vt-work-side")).toEqual(values);
    }
  });

  it("an edge reference puts a side it does not offer back to both sides", () => {
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([line]);
    fireEvent.change(byId("vt-red-side"), { target: { value: "boven" } });
    fireEvent.change(byId("vt-work-side"), { target: { value: "rechts" } });
    setRef("links");
    expect(getPageParts(h.elements, "pdf1").lines[0].customData).toMatchObject({
      reference: "links",
      redSide: "beide",
      workSide: "rechts",
    });
    expect((byId("vt-red-side") as HTMLSelectElement).value).toBe("beide");
    expect((byId("vt-work-side") as HTMLSelectElement).value).toBe("rechts");
  });

  it("the next line's sides follow its reference too", () => {
    openOnPage();
    fireEvent.change(byId("vt-red-side"), { target: { value: "onder" } });
    setRef("rechts");
    expect((byId("vt-red-side") as HTMLSelectElement).value).toBe("beide");
    drawLine([100, 300], [400, 300]);
    expect(getPageParts(h.elements, "pdf1").lines[0].customData).toMatchObject({
      reference: "rechts",
      redSide: "beide",
    });
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
    setRef("boven");
    const el = (id: string) => h.elements.find((e) => e.id === id) as any;
    expect(el(first.id).customData.reference).toBe("boven");
    expect(el(first.id).strokeStyle).toBe("solid");
    expect(el(second.id).customData.reference).toBe("midden");
    expect(el(second.id).strokeStyle).toBe("dashed");
    expect(reference()).toBe("boven");
    API.setSelectedElements([second]);
    expect(reference()).toBe("midden");
  });

  it("Tekenreferentie of a selected line moves the line, not the trench", () => {
    drawLine([100, 100], [400, 100]);
    const [drawn] = getPageParts(h.elements, "pdf1").lines;
    const page = () =>
      h.elements.find((e) => e.id === "pdf1") as ExcalidrawImageElement;
    const trench = () => pageState(h.elements, page())!.geometry.nodes;
    const before = trench();
    const lineY = () =>
      (h.elements.find((e) => e.id === drawn.id) as any).y as number;
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements([drawn]);
    // a 1 m trench at 5 cm/px: its edges are 10 px from the centre
    const steps: [string, number][] = [
      ["boven", 90],
      ["onder", 110],
      ["links", 110], // a horizontal line keeps its fixed side: as Onderrand
      ["midden", 100],
    ];
    for (const [ref, y] of steps) {
      setRef(ref);
      expect(lineY()).toBeCloseTo(y, 6);
      trench().forEach((n, i) => {
        expect(n.x).toBeCloseTo(before[i].x, 6);
        expect(n.y).toBeCloseTo(before[i].y, 6);
      });
    }
  });

  it("a line drawn with an edge reference stays where it was drawn", () => {
    pickTool();
    setRef("boven");
    drawLine([100, 100], [400, 100]);
    const [line] = getPageParts(h.elements, "pdf1").lines;
    expect(line.y).toBeCloseTo(100, 6);
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

  it("puts the PDF uploader, Liniaal and Vrij Tracé first in the toolbar", () => {
    // room for every tool (a narrow one folds the last ones under Meer)
    act(() => h.setState({ width: 1440, openSidebar: null }));
    const ids = [
      ...container.querySelectorAll(".App-toolbar [data-testid^='toolbar-']"),
    ].map((el) => el.getAttribute("data-testid"));
    expect(ids.slice(0, 3)).toEqual([
      "toolbar-pdf-import",
      "toolbar-ruler",
      "toolbar-vrijtrace",
    ]);
    // then the whiteboard's own tools, in their usual order
    expect(ids.indexOf("toolbar-selection")).toBeGreaterThan(2);
    expect(ids.indexOf("toolbar-rectangle")).toBe(
      ids.indexOf("toolbar-selection") + 1,
    );
    expect(ids.indexOf("toolbar-laser")).toBeGreaterThan(
      ids.indexOf("toolbar-eraser"),
    );
  });
});
