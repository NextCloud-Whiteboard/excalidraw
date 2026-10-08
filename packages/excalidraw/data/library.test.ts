import { getLibraryDropScale, validateLibraryUrl } from "./library";

describe("validateLibraryUrl", () => {
  it("should validate hostname & pathname", () => {
    // valid hostnames
    // -------------------------------------------------------------------------
    expect(
      validateLibraryUrl("https://www.excalidraw.com", ["excalidraw.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com", ["excalidraw.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://library.excalidraw.com", ["excalidraw.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://library.excalidraw.com", [
        "library.excalidraw.com",
      ]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com/", ["excalidraw.com/"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com", ["excalidraw.com/"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com/", ["excalidraw.com"]),
    ).toBe(true);

    // valid pathnames
    // -------------------------------------------------------------------------
    expect(
      validateLibraryUrl("https://excalidraw.com/path", ["excalidraw.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com/path/", ["excalidraw.com"]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com/specific/path", [
        "excalidraw.com/specific/path",
      ]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com/specific/path/", [
        "excalidraw.com/specific/path",
      ]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com/specific/path", [
        "excalidraw.com/specific/path/",
      ]),
    ).toBe(true);
    expect(
      validateLibraryUrl("https://excalidraw.com/specific/path/other", [
        "excalidraw.com/specific/path",
      ]),
    ).toBe(true);

    // invalid hostnames
    // -------------------------------------------------------------------------
    expect(() =>
      validateLibraryUrl("https://xexcalidraw.com", ["excalidraw.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://x-excalidraw.com", ["excalidraw.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://excalidraw.comx", ["excalidraw.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://excalidraw.comx", ["excalidraw.com"]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://excalidraw.com.mx", ["excalidraw.com"]),
    ).toThrow();
    // protocol must be https
    expect(() =>
      validateLibraryUrl("http://excalidraw.com.mx", ["excalidraw.com"]),
    ).toThrow();

    // invalid pathnames
    // -------------------------------------------------------------------------
    expect(() =>
      validateLibraryUrl("https://excalidraw.com/specific/other/path", [
        "excalidraw.com/specific/path",
      ]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://excalidraw.com/specific/paths", [
        "excalidraw.com/specific/path",
      ]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://excalidraw.com/specific/path-s", [
        "excalidraw.com/specific/path",
      ]),
    ).toThrow();
    expect(() =>
      validateLibraryUrl("https://excalidraw.com/some/specific/path", [
        "excalidraw.com/specific/path",
      ]),
    ).toThrow();
  });
});

describe("getLibraryDropScale", () => {
  it("converts board-scale pixels to the PDF's calibration", () => {
    // board 1 px = 1 cm, PDF 1 px = 2 cm -> item shrinks by half
    expect(getLibraryDropScale(1, 2)).toBe(0.5);
    // board 1 px = 1 cm, PDF 1 px = 0.5 cm -> item doubles
    expect(getLibraryDropScale(1, 0.5)).toBe(2);
    expect(getLibraryDropScale(3, 1.5)).toBe(2);
  });

  it("returns null when either scale is unusable", () => {
    expect(getLibraryDropScale(1, undefined)).toBe(null);
    expect(getLibraryDropScale(undefined, 2)).toBe(null);
    expect(getLibraryDropScale(1, 0)).toBe(null);
    expect(getLibraryDropScale(0, 2)).toBe(null);
    expect(getLibraryDropScale(1, -2)).toBe(null);
    expect(getLibraryDropScale(1, NaN)).toBe(null);
    expect(getLibraryDropScale(1, Infinity)).toBe(null);
    expect(getLibraryDropScale(1, "2")).toBe(null);
  });

  it("returns null when no resize is needed", () => {
    expect(getLibraryDropScale(2, 2)).toBe(null);
  });
});
