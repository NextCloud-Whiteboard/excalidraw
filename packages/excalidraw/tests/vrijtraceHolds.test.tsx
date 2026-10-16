import React from "react";
import { act } from "@testing-library/react";

import { Excalidraw } from "../index";
import { centreOf, getPageParts } from "../vrijtrace/model";

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
const firstNode = () => getPageParts(h.elements, "pdf1").nodes[0];
const holdBySanne = (id: string, expiresAt: number) =>
  act(() =>
    h.setState({
      vrijTraceRemoteHolds: {
        [id]: { userId: "u2", name: "Sanne", expiresAt },
      },
    }),
  );
const dragBy = (c: { x: number; y: number }, dx: number) => {
  mouse.reset();
  mouse.downAt(c.x, c.y);
  mouse.moveTo(c.x + dx, c.y);
  mouse.upAt(c.x + dx, c.y);
};

describe("edit holds", () => {
  const onEditing = vi.fn();

  beforeEach(async () => {
    await render(
      <Excalidraw vrijTraceEnabled={true} onVrijTraceEditing={onEditing} />,
    );
    API.setElements([pdfPage()]);
    act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
    mouse.reset();
    mouse.clickAt(100, 100);
    mouse.clickAt(400, 100);
    act(() => h.app.vrijTrace.setMode("verplaats"));
    onEditing.mockClear();
  });

  it("announces the node being dragged, and its release", () => {
    const node = firstNode();
    dragBy(centreOf(node), 50);
    expect(onEditing.mock.calls.map((x) => x[0])).toEqual([[node.id], []]);
  });

  it("refuses a part someone else holds", () => {
    const node = firstNode();
    holdBySanne(node.id, Date.now() + 8000);
    const c = centreOf(node);
    dragBy(c, 50);
    expect(h.state.toast?.message).toBe("Sanne bewerkt dit punt");
    const after = getPageParts(h.elements, "pdf1").nodes.find(
      (n) => n.id === node.id,
    )!;
    expect(centreOf(after).x).toBeCloseTo(c.x);
    expect(onEditing).not.toHaveBeenCalled();
  });

  it("ignores expired holds", () => {
    const node = firstNode();
    holdBySanne(node.id, Date.now() - 1);
    expect(h.app.vrijTrace.isHeldByOther(node.id)).toBeNull();
    const c = centreOf(node);
    dragBy(c, 50);
    const after = getPageParts(h.elements, "pdf1").nodes.find(
      (n) => n.id === node.id,
    )!;
    expect(centreOf(after).x).toBeCloseTo(c.x + 50);
  });

  it("refuses deleting a segment someone else holds", () => {
    const seg = getPageParts(h.elements, "pdf1").segments[0];
    holdBySanne(seg.id, Date.now() + 8000);
    act(() => h.app.vrijTrace.setMode("verwijder"));
    mouse.reset();
    mouse.clickAt(250, 100);
    expect(h.state.toast?.message).toBe("Sanne bewerkt dit punt");
    expect(getPageParts(h.elements, "pdf1").segments).toHaveLength(1);
  });

  it("releases its hold when the tool is left", () => {
    act(() => h.app.vrijTrace.setMode("selecteer"));
    mouse.reset();
    mouse.clickAt(250, 100);
    const seg = getPageParts(h.elements, "pdf1").segments[0];
    expect(onEditing.mock.calls.at(-1)![0]).toEqual([seg.id]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    expect(onEditing.mock.calls.at(-1)![0]).toEqual([]);
  });
});
