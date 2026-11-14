import { act, queryByTestId } from "@testing-library/react";
import React from "react";

import { Excalidraw } from "../index";

import { fireEvent, render } from "./test-utils";

const { h } = window;

describe("the toolbar beside an open panel", () => {
  let container: HTMLElement;

  beforeEach(async () => {
    ({ container } = await render(
      <Excalidraw
        vrijTraceEnabled={true}
        vrijTraceUser={{ uid: "u1", name: "Jij" }}
      />,
    ));
  });

  /** a desktop editor `width` px wide, the panel open or not */
  const layout = (width: number, panel: boolean, canFitSidebar = false) => {
    h.app.device = {
      ...h.app.device,
      editor: { ...h.app.device.editor, isMobile: false, canFitSidebar },
    };
    act(() =>
      h.setState({
        width,
        openSidebar: panel ? { name: "default", tab: "vrijtrace" } : null,
      }),
    );
  };
  const wrapper = () =>
    container.querySelector<HTMLElement>(".layer-ui__wrapper")!;
  const byId = (id: string) => queryByTestId(container, id);

  it("takes only the space left of the panel, also where the panel cannot dock", () => {
    // (jsdom drops a width with var() in it, so the class stands for it)
    layout(1100, true);
    expect(
      wrapper().classList.contains("layer-ui__wrapper--beside-panel"),
    ).toBe(true);
    layout(1100, false);
    expect(
      wrapper().classList.contains("layer-ui__wrapper--beside-panel"),
    ).toBe(false);
  });

  it("puts the last tools under Meer when the space left is narrow", () => {
    layout(1100, true);
    expect(byId("toolbar-laser")).toBeNull();
    expect(byId("toolbar-more")).not.toBeNull();
    fireEvent.click(byId("toolbar-more")!);
    for (const id of [
      "toolbar-magnifier",
      "toolbar-text-bubble",
      "toolbar-laser",
      "toolbar-lasso",
    ]) {
      expect(byId(id)).not.toBeNull();
    }
    // a tool picked from Meer is the tool, as from the toolbar
    fireEvent.click(byId("toolbar-laser")!);
    expect(h.state.activeTool.type).toBe("laser");
  });

  it("takes a second row, at a set width, when even that is too wide", () => {
    layout(900, true);
    const toolbar = container.querySelector<HTMLElement>(".App-toolbar")!;
    expect(toolbar.classList.contains("App-toolbar--wrap")).toBe(true);
    // 900 - 302 for the panel - 112 for the buttons either side
    expect(toolbar.style.width).toBe("486px");
    layout(1100, true);
    expect(toolbar.classList.contains("App-toolbar--wrap")).toBe(false);
    expect(toolbar.style.width).toBe("");
  });

  it("shows every tool in the toolbar when there is room", () => {
    layout(1440, false);
    expect(byId("toolbar-more")).toBeNull();
    expect(byId("toolbar-laser")).not.toBeNull();
    expect(byId("toolbar-magnifier")).not.toBeNull();
  });
});
