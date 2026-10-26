import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react";

import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { render } from "./test-utils";

const { h } = window;

/** an XMLHttpRequest the test drives by hand */
class FakeXHR {
  static all: FakeXHR[] = [];
  static get last() {
    return FakeXHR.all[FakeXHR.all.length - 1];
  }
  upload: { onprogress: any; onload: any } = { onprogress: null, onload: null };
  onload: any = null;
  onerror: any = null;
  onabort: any = null;
  responseType = "";
  status = 0;
  statusText = "";
  response: any = null;
  method = "";
  url = "";
  aborted = false;
  private headers: Record<string, string> = {};
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send() {
    FakeXHR.all.push(this);
  }
  abort() {
    this.aborted = true;
    this.onabort?.(new Event("abort"));
  }
  getResponseHeader(name: string) {
    return this.headers[name.toLowerCase()] ?? null;
  }
  // test controls
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  uploaded() {
    this.upload.onload?.(new Event("load"));
  }
  respond(status: number, body: string, contentType: string, statusText = "") {
    this.status = status;
    this.statusText = statusText;
    this.headers["content-type"] = contentType;
    this.response = new Blob([body], { type: contentType });
    this.onload?.(new Event("load"));
  }
}

// a 1×1 PNG
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const pdf = () =>
  new File(["%PDF-1.4"], "situatietekening-west.pdf", {
    type: "application/pdf",
  });

describe("PDF import placeholder", () => {
  let container: HTMLElement;
  const placeholder = () =>
    container.querySelector(".PdfImportPlaceholder") as HTMLElement | null;
  const start = async () => {
    act(() => {
      void h.app.importPdf(pdf());
    });
    await waitFor(() => expect(FakeXHR.all.length).toBeGreaterThan(0));
  };

  beforeEach(async () => {
    FakeXHR.all = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    ({ container } = await render(<Excalidraw pdfApiUrl="http://pdf.test" />));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the file and the real upload percentage where the PDF will land", async () => {
    await start();
    expect(FakeXHR.last.url).toBe("http://pdf.test/convert");
    act(() => FakeXHR.last.progress(32, 64));
    expect(h.state.pdfImport).toMatchObject({ stage: "upload", percent: 50 });
    expect(placeholder()?.textContent).toContain("situatietekening-west.pdf");
    expect(placeholder()?.textContent).toContain("50%");
    expect(h.state.toast).toBeNull();
  });

  it("says the server is converting once the upload is done", async () => {
    await start();
    act(() => {
      FakeXHR.last.progress(64, 64);
      FakeXHR.last.uploaded();
    });
    expect(h.state.pdfImport?.stage).toBe("convert");
    expect(placeholder()?.textContent).toContain("Converting on the server");
  });

  it("shows a failed conversion in the placeholder, with retry", async () => {
    await start();
    act(() => FakeXHR.last.respond(502, "", "text/plain", "Bad Gateway"));
    await waitFor(() => expect(h.state.pdfImport?.stage).toBe("error"));
    expect(placeholder()?.textContent).toContain("Bad Gateway");
    expect(h.state.toast).toBeNull();
    fireEvent.click(container.querySelector(".PdfImportPlaceholder__retry")!);
    await waitFor(() => expect(FakeXHR.all).toHaveLength(2));
    expect(h.state.pdfImport?.stage).toBe("upload");
  });

  it("cancel stops the upload and removes the placeholder", async () => {
    await start();
    fireEvent.click(container.querySelector(".PdfImportPlaceholder__cancel")!);
    expect(FakeXHR.last.aborted).toBe(true);
    await waitFor(() => expect(h.state.pdfImport).toBeNull());
    expect(placeholder()).toBeNull();
    expect(h.state.toast).toBeNull();
  });

  it("places the pages where the placeholder was, then removes it", async () => {
    // image decoding does not run in jsdom: let inserted images keep a size
    vi.spyOn(h.app as any, "insertImageElement").mockImplementation(
      async (el: any) => {
        h.app.scene.insertElement(el);
        return el;
      },
    );
    vi.spyOn(
      h.app as any,
      "initializePdfImageDimensionsWithPosition",
    ).mockImplementation((el: any, x: any, y: any) =>
      h.app.scene.mutateElement(el, { x, y, width: 400, height: 283 }),
    );
    await start();
    const spot = { x: h.state.pdfImport!.x, y: h.state.pdfImport!.y };
    act(() =>
      FakeXHR.last.respond(
        200,
        JSON.stringify({
          files: [
            { content_type: "image/png", data: PNG },
            { content_type: "image/png", data: PNG },
          ],
        }),
        "application/json",
      ),
    );
    await waitFor(() => expect(h.state.pdfImport).toBeNull());
    const pages = h.elements.filter((e) => e.customData?.isPdf);
    expect(pages).toHaveLength(2);
    expect(pages[0].customData?.pageIndex).toBe(1);
    expect(pages[0].y).toBeCloseTo(spot.y);
    expect(pages[1].y).toBeGreaterThan(pages[0].y + pages[0].height);
    expect(placeholder()).toBeNull();
  });

  it("picking a file in the dialog starts the import", async () => {
    const click = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        Object.defineProperty(this, "files", { value: [pdf()] });
        this.onchange?.({ target: this } as any);
      });
    act(() => {
      void h.app.onPdfImportAction();
    });
    await waitFor(() => expect(FakeXHR.all).toHaveLength(1));
    expect(h.state.pdfImport?.name).toBe("situatietekening-west.pdf");
    click.mockRestore();
  });

  it("puts the placeholder in the middle of the screen", async () => {
    act(() => h.setState({ width: 1600, height: 1000 }));
    await start();
    const job = h.state.pdfImport!;
    const centre = viewportCoordsToSceneCoords(
      {
        clientX: h.state.width / 2 + h.state.offsetLeft,
        clientY: h.state.height / 2 + h.state.offsetTop,
      },
      h.state,
    );
    expect(job.y + job.height / 2).toBeCloseTo(centre.y);
    expect(job.x).toBeCloseTo(centre.x);
  });
});
