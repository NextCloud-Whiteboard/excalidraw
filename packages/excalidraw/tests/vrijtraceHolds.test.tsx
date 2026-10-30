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
const tree = () => getPageParts(h.elements, "pdf1").trees[0];
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

describe("edit holds on trees", () => {
  const onEditing = vi.fn();

  beforeEach(async () => {
    await render(
      <Excalidraw vrijTraceEnabled={true} onVrijTraceEditing={onEditing} />,
    );
    API.setElements([pdfPage()]);
    act(() => h.app.setActiveTool({ type: "custom", customType: "vrijtrace" }));
    act(() => h.app.vrijTrace.setMode("boomToevoegen"));
    mouse.reset();
    mouse.clickAt(300, 300);
    act(() => h.app.vrijTrace.moveTree(tree().id));
    onEditing.mockClear();
  });

  it("announces the tree being moved, and its release", () => {
    const t = tree();
    dragBy(centreOf(t), 50);
    expect(onEditing.mock.calls.map((x) => x[0])).toEqual([[t.id], []]);
  });

  it("refuses a tree someone else holds", () => {
    const t = tree();
    const c = centreOf(t);
    holdBySanne(t.id, Date.now() + 8000);
    dragBy({ x: 500, y: 400 }, 50);
    expect(h.state.toast?.message).toBe("Sanne bewerkt dit punt");
    expect(centreOf(tree()).x).toBeCloseTo(c.x);
    expect(onEditing).not.toHaveBeenCalled();
  });

  it("ignores expired holds", () => {
    const t = tree();
    holdBySanne(t.id, Date.now() - 1);
    expect(h.app.vrijTrace.isHeldByOther(t.id)).toBeNull();
    dragBy({ x: 500, y: 400 }, 50);
    expect(centreOf(tree()).x).toBeCloseTo(550);
  });

  it("releases its hold when the tool is left", () => {
    mouse.reset();
    mouse.downAt(500, 400);
    expect(onEditing.mock.calls.at(-1)![0]).toEqual([tree().id]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    expect(onEditing.mock.calls.at(-1)![0]).toEqual([]);
  });
});
