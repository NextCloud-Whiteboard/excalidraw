import React from "react";
import { act } from "@testing-library/react";

import { Excalidraw } from "../index";
import { getPageParts } from "../vrijtrace/model";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { render } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const pdfPage = (over: any = {}) => ({
  ...API.createElement({
    type: "image",
    id: "pdf1",
    x: 0,
    y: 0,
    width: 1000,
    height: 700,
  }),
  customData: { isPdf: true, pdfCmPerPx: 5 },
  ...over,
});
const parts = () => getPageParts(h.elements, "pdf1");
const tool = () =>
  act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
const click = (x: number, y: number) => {
  mouse.reset();
  mouse.clickAt(x, y);
};

describe("Vrij Tracé tool", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        vrijTraceEnabled={true}
        vrijTraceUser={{ uid: "u1", name: "Jij" }}
      />,
    );
  });

  it("refuses to draw outside an imported PDF page", () => {
    API.setElements([pdfPage()]);
    tool();
    click(1200, 100);
    expect(h.state.toast?.message).toBe(
      "Sleuven teken je alleen op een geïmporteerde PDF-pagina",
    );
    expect(parts().nodes).toHaveLength(0);
  });

  it("asks for a calibration first", () => {
    API.setElements([pdfPage({ customData: { isPdf: true } })]);
    tool();
    click(100, 100);
    expect(h.state.toast?.message).toBe(
      "Kalibreer eerst de liniaal op deze pagina",
    );
  });

  it("draws a segment with two clicks, creating the page's network once", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    click(300, 104);
    const p = parts();
    expect(p.network?.id).toBe("vrijtrace-pdf1");
    expect(p.nodes).toHaveLength(2);
    expect(p.segments).toHaveLength(1);
    expect(p.nodes.every((n) => n.locked && n.width === 1)).toBe(true);
    expect(h.state.vrijTrace.pageId).toBe("pdf1");
  });

  it("makes one undo step per segment", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    click(300, 100);
    click(300, 300);
    expect(parts().segments).toHaveLength(2);
    Keyboard.undo();
    expect(parts().segments).toHaveLength(1);
  });

  it("drops a draft when its page disappears", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    API.setElements([]);
    click(300, 100);
    expect(h.elements.filter((e) => e.type === "trench")).toHaveLength(0);
    expect(h.state.vrijTrace.draft).toBeNull();
  });

  it("never creates two networks for one page", () => {
    API.setElements([pdfPage()]);
    tool();
    click(100, 100);
    click(300, 100);
    act(() => h.app.vrijTrace.updateSettings({ treeMinM: 4 }, true));
    expect(
      h.elements.filter(
        (e) => e.type === "trench" && (e as any).trench.kind === "network",
      ),
    ).toHaveLength(1);
  });
});
