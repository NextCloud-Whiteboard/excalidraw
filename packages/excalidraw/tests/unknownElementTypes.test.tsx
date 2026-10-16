import React from "react";
import { vi } from "vitest";

import { restoreElements } from "../data/restore";
import { exportToSvg } from "../scene/export";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { render } from "./test-utils";

const { h } = window;

const future = {
  id: "f1",
  type: "hologram",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  angle: 0,
  strokeColor: "#000",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: 1,
  version: 3,
  versionNonce: 1,
  isDeleted: false,
  boundElements: null,
  updated: 1,
  link: null,
  locked: false,
} as any;

describe("unknown element types", () => {
  it("are kept on restore, locked", () => {
    const [el] = restoreElements([future], null);
    expect(el).toMatchObject({ id: "f1", type: "hologram", locked: true });
    // restore bumps the version because it changed `locked`
    expect(el.version).toBeGreaterThanOrEqual(3);
  });

  it("do not break rendering, export or hit testing", async () => {
    const errors = vi.spyOn(console, "error");
    await render(<Excalidraw />);
    API.setElements(
      restoreElements(
        [
          future,
          API.createElement({ id: "r1", type: "rectangle", x: 200, y: 0 }),
        ],
        null,
      ),
    );
    const svg = await exportToSvg(
      h.elements,
      { ...h.state, exportBackground: false },
      {},
    );
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    expect((h.app as any).getElementAtPosition(50, 50)).toBeNull();
    const unimplemented = errors.mock.calls.filter((c) =>
      String(c[0]?.message ?? c[0]).includes("Unimplemented type"),
    );
    errors.mockRestore();
    expect(unimplemented).toEqual([]);
  });
});
