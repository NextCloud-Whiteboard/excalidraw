import {
  DEFAULT_SIDEBAR,
  VRIJTRACE_SIDEBAR_TAB,
  randomId,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import { ShapeCache, newTrenchElement } from "@excalidraw/element";

import type { Scene } from "@excalidraw/element";
import type {
  ExcalidrawImageElement,
  ExcalidrawLinearElement,
  ExcalidrawTrenchElement,
  VrijTraceNetworkData,
} from "@excalidraw/element/types";

import {
  SMOOTH_PX,
  exampleNetwork,
  simplify,
  snapToTrench,
  straighten,
} from "./editing";
import { chainSegments, newTrenchLine, trenchLineStyle } from "./lines";
import {
  DEFAULT_SETTINGS,
  clampTrenchWidth,
  getPageFrame,
  getPageParts,
  isPdfPage,
  LINE_WIDTH_MAX_PX,
  LINE_WIDTH_MIN_PX,
  isTrenchLine,
  lineWidthOf,
  networkIdForPage,
  pageState,
  settingsOf,
  trenchLinePoints,
  TREE_MIN_MAX_M,
  trenchLineReference,
  trenchLineTreeMin,
  trenchLineWidth,
  trenchLineZone,
} from "./model";
import { STR } from "./strings";

import type { AppState, ExcalidrawProps, VrijTraceUIState } from "../types";
import type { Pt, ZoneSettings } from "./geometry";
import type { TrenchReference } from "./model";

/** the slice of App the controller needs (kept small for testing) */
export interface VrijTraceHost {
  readonly scene: Scene;
  readonly state: AppState;
  readonly props: ExcalidrawProps;
  setState: (patch: Partial<AppState>) => void;
  setToast: (toast: { message: string; duration?: number } | null) => void;
  getPdfPageAt: (x: number, y: number) => ExcalidrawImageElement | null;
  scheduleCapture: () => void;
  setCursor: (cursor: string) => void;
  /** switch to the Vrij Tracé tool */
  activateTool: () => void;
}

// screen px, divided by zoom at use
const SNAP_PX = 13;
/** pointer moves closer than this to the last stroke point are skipped */
const STEP_PX = 2;
/** shorter strokes are a click, not a trench */
const MIN_STROKE_PX = 8;

type Drag =
  | { type: "stroke"; pageId: string }
  /** a stroke that cannot become a trench: says why once it is drawn */
  | { type: "refused"; begin: Pt; message: string; told: boolean };

type SettingsPatch = Partial<Pick<VrijTraceNetworkData, "treeMinM">>;

/** what each trench line has of its own, besides its width */
export type LineSettings = ZoneSettings & {
  lineWidthPx: number;
  reference: TrenchReference;
  /** Minimale afstand for trees, from this line */
  treeMinM: number;
};

export class VrijTraceController {
  private drag: Drag | null = null;
  private held: string[] = [];
  /**
   * React applies setState later, so several updates within one pointer
   * event would overwrite each other. Keep our own latest value until the
   * app state catches up, and adopt the app's value when someone else
   * changed it (e.g. a scene reset).
   */
  private local: VrijTraceUIState | null = null;
  private pendingFrom: VrijTraceUIState | null = null;

  constructor(private app: VrijTraceHost) {}

  private get ui(): VrijTraceUIState {
    const s = this.app.state.vrijTrace;
    if (this.local && (s === this.local || s === this.pendingFrom)) {
      return this.local;
    }
    this.local = null;
    return s;
  }

  private get zoom() {
    return this.app.state.zoom.value;
  }

  setUI(patch: Partial<VrijTraceUIState>) {
    const prev = this.ui;
    const next = { ...prev, ...patch };
    this.pendingFrom = this.app.state.vrijTrace;
    this.local = next;
    // the first page picked opens the tree-check tab
    const opening = !prev.pageId && !!next.pageId;
    this.app.setState({
      vrijTrace: next,
      ...(opening
        ? {
            openSidebar: {
              name: DEFAULT_SIDEBAR.name,
              tab: VRIJTRACE_SIDEBAR_TAB,
            },
          }
        : {}),
    });
  }

  private hold(ids: string[]) {
    if (ids.join() !== this.held.join()) {
      this.held = ids;
      this.app.props.onVrijTraceEditing?.(ids);
    }
  }

  /** name of whoever else holds this part right now, else null */
  isHeldByOther(elementId: string): string | null {
    const h = this.app.state.vrijTraceRemoteHolds[elementId];
    return h && h.expiresAt > Date.now() ? h.name : null;
  }

  private page(id: string | null = this.ui.pageId) {
    const el = id ? this.app.scene.getNonDeletedElementsMap().get(id) : null;
    return isPdfPage(el) ? el : null;
  }

  /** why nothing can be created at p (null: it can) */
  private refusalAt(p: Pt, refusal: string) {
    const page = this.app.getPdfPageAt(p.x, p.y);
    return !page
      ? refusal
      : getPageFrame(page).cmPerPx
      ? null
      : STR.calibrateFirst;
  }

  /** the page under p for creating things; toast + null when refused */
  private pageForCreate(p: Pt, refusal: string) {
    const page = this.app.getPdfPageAt(p.x, p.y);
    const message = this.refusalAt(p, refusal);
    if (!page || message) {
      this.app.setToast({ message: message ?? refusal });
      return null;
    }
    if (page.id !== this.ui.pageId) {
      this.setUI({ pageId: page.id, hotTreeId: null });
    }
    return page;
  }

  private ensureNetwork(page: ExcalidrawImageElement): ExcalidrawTrenchElement {
    const id = networkIdForPage(page.id);
    const existing = this.app.scene.getElement(
      id,
    ) as ExcalidrawTrenchElement | null;
    if (existing) {
      if (existing.isDeleted) {
        this.app.scene.mutateElement(existing, { isDeleted: false });
      }
      return existing;
    }
    const network = newTrenchElement({
      id,
      pdfParentId: page.id,
      trench: { kind: "network", ...DEFAULT_SETTINGS, activation: null },
      x: page.x,
      y: page.y,
      width: page.width,
      height: page.height,
      angle: page.angle,
    });
    this.app.scene.insertElementAtIndex(
      network,
      this.app.scene.getElementIndex(page.id) + 1,
    );
    return network;
  }

  /** trench lines of a page, in scene px, for snapping (all but `except`) */
  private polylines(pageId: string | null, except: string | null) {
    return pageId
      ? getPageParts(this.app.scene.getNonDeletedElements(), pageId)
          .lines.filter((l) => l.id !== except)
          .map(trenchLinePoints)
      : [];
  }

  /** selected trench lines (the width slider changes these) */
  selectedLines(): ExcalidrawLinearElement[] {
    return this.app.scene
      .getSelectedElements(this.app.state)
      .filter(isTrenchLine);
  }

  /** a stroke point near another trench line of the page lands on it */
  private snapToLines(pageId: string, p: Pt): Pt {
    return (
      snapToTrench(this.polylines(pageId, null), p, SNAP_PX / this.zoom) ?? p
    );
  }

  /** v8.2 Teken, freehand: press on a calibrated page and draw */
  private startStroke(p: Pt) {
    // a plain click off a calibrated page says nothing; a stroke there does
    const message = this.refusalAt(p, STR.onlyOnPdf);
    if (message) {
      this.beginDrag({ type: "refused", begin: p, message, told: false });
      return;
    }
    const page = this.pageForCreate(p, STR.onlyOnPdf);
    if (!page) {
      return;
    }
    this.setUI({ stroke: [this.snapToLines(page.id, p)] });
    this.beginDrag({ type: "stroke", pageId: page.id });
  }

  private extendStroke(p: Pt) {
    const stroke = this.ui.stroke;
    const last = stroke?.[stroke.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) >= STEP_PX / this.zoom) {
      this.setUI({ stroke: [...stroke!, p] });
    }
  }

  /** release: the stroke, smoothed (and straightened), becomes a trench line */
  private finishStroke(pageId: string, p: Pt) {
    const stroke = this.ui.stroke;
    this.setUI({ stroke: null });
    const page = this.page(pageId);
    if (!stroke || !page) {
      return;
    }
    const drawn = simplify([...stroke, p], SMOOTH_PX / this.zoom);
    const length = drawn
      .slice(1)
      .reduce(
        (n, q, i) => n + Math.hypot(q.x - drawn[i].x, q.y - drawn[i].y),
        0,
      );
    if (length < MIN_STROKE_PX / this.zoom) {
      return;
    }
    const points = straighten(drawn, this.ui.snap);
    points[points.length - 1] = this.snapToLines(
      pageId,
      points[points.length - 1],
    );
    this.ensureNetwork(page);
    const { lineWidthPx, reference, treeMinM, ...zone } =
      this.nextLineSettings(pageId);
    this.app.scene.insertElement(
      newTrenchLine({
        points,
        widthM: this.ui.widthM,
        reference,
        pdfParentId: pageId,
        strokeWidth: lineWidthPx,
        zone,
        treeMinM,
      }),
    );
    this.app.scheduleCapture();
  }

  pointerDown(p: Pt) {
    this.startStroke(p);
  }

  private beginDrag(drag: Drag) {
    this.drag = drag;
    const toScene = (e: PointerEvent) =>
      viewportCoordsToSceneCoords(e, this.app.state);
    const move = (e: PointerEvent) => this.dragMove(toScene(e));
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      this.dragEnd(toScene(e));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  private dragMove(p: Pt) {
    const d = this.drag;
    if (d?.type === "stroke") {
      this.extendStroke(p);
      return;
    }
    if (
      d?.type === "refused" &&
      !d.told &&
      Math.hypot(p.x - d.begin.x, p.y - d.begin.y) >= MIN_STROKE_PX / this.zoom
    ) {
      d.told = true;
      this.app.setToast({ message: d.message });
    }
  }

  private dragEnd(p: Pt) {
    const d = this.drag;
    this.drag = null;
    if (d?.type === "stroke") {
      this.finishStroke(d.pageId, p);
    }
    // a refused stroke drew nothing
  }

  hover(p: Pt) {
    this.app.setCursor(
      this.app.getPdfPageAt(p.x, p.y) ? "crosshair" : "not-allowed",
    );
  }

  /** outline a tree while its table row is pointed at (null: none) */
  setHotTree(treeId: string | null) {
    if (treeId !== this.ui.hotTreeId) {
      this.setUI({ hotTreeId: treeId });
    }
  }

  /** the width of the selected trench lines, else of the next one drawn */
  setWidth(widthM: number, commit: boolean) {
    const v = clampTrenchWidth(widthM);
    const lines = this.selectedLines();
    for (const line of lines) {
      this.app.scene.mutateElement(line, {
        customData: { ...line.customData, widthM: v },
      });
    }
    if (lines.length && commit) {
      this.app.scheduleCapture();
    }
    // also the width of the next line; and it redraws the panel
    this.setUI({ widthM: v });
  }

  /** selected trench lines of one page make that page the panel's page */
  followSelection() {
    const lines = this.selectedLines();
    const pageId = lines[0]?.customData?.pdfParentId;
    if (
      pageId &&
      pageId !== this.ui.pageId &&
      lines.every((l) => l.customData?.pdfParentId === pageId) &&
      this.page(pageId)
    ) {
      this.setUI({ pageId, hotTreeId: null });
    }
  }

  /** a page's zone settings: what lines without their own follow */
  private pageZone(
    pageId: string | null,
  ): ZoneSettings & { lineWidthPx: number; treeMinM: number } {
    const network = pageId
      ? getPageParts(this.app.scene.getNonDeletedElements(), pageId).network
      : null;
    const { redSide, workWidthM, workSide, treeMinM } = settingsOf(network);
    return {
      redSide,
      workWidthM,
      workSide,
      treeMinM,
      lineWidthPx: lineWidthOf(network),
    };
  }

  /** what the next line drawn on a page gets */
  nextLineSettings(pageId: string | null = this.ui.pageId): LineSettings {
    const page = this.pageZone(pageId);
    return {
      lineWidthPx: this.ui.lineWidthPx ?? page.lineWidthPx,
      redSide: this.ui.redSide ?? page.redSide,
      workWidthM: this.ui.workWidthM ?? page.workWidthM,
      workSide: this.ui.workSide ?? page.workSide,
      treeMinM: this.ui.treeMinM ?? page.treeMinM,
      reference: this.ui.reference,
    };
  }

  /** a line's own settings, completed with its page's where it has none */
  private lineSettings(line: ExcalidrawLinearElement): LineSettings {
    const { lineWidthPx, ...page } = this.pageZone(
      line.customData?.pdfParentId ?? null,
    );
    return {
      ...page,
      ...trenchLineZone(line),
      treeMinM: trenchLineTreeMin(line) ?? page.treeMinM,
      lineWidthPx: line.strokeWidth,
      reference: trenchLineReference(line),
    };
  }

  /** what the panel shows: the selected line's settings, else the next line's */
  shownLineSettings(): LineSettings {
    const [line] = this.selectedLines();
    return line ? this.lineSettings(line) : this.nextLineSettings();
  }

  /**
   * Lijndikte of the selected trench lines, and of the next one drawn.
   * `commit` ends a slider drag as one undo step.
   */
  setLineWidth(px: number, commit: boolean) {
    const v = Math.min(LINE_WIDTH_MAX_PX, Math.max(LINE_WIDTH_MIN_PX, px));
    const lines = this.selectedLines();
    for (const line of lines) {
      if (line.strokeWidth !== v) {
        this.app.scene.mutateElement(line, { strokeWidth: v });
        // the cached drawing has the old width baked in
        ShapeCache.delete(line);
      }
    }
    if (lines.length && commit) {
      this.app.scheduleCapture();
    }
    // also the next line's; and it redraws the panel
    this.setUI({ lineWidthPx: v });
  }

  /**
   * Rode zone and Werkruimte of the selected trench lines, and of the next
   * one drawn. A line from before lines had their own settings takes its
   * page's for the rest, so only what was changed changes.
   */
  setLineZone(patch: Partial<ZoneSettings>, commit: boolean) {
    const lines = this.selectedLines();
    for (const line of lines) {
      // Minimale afstand keeps following the page until it is changed itself
      const { lineWidthPx, reference, treeMinM, ...zone } =
        this.lineSettings(line);
      this.app.scene.mutateElement(line, {
        customData: { ...line.customData, ...zone, ...patch },
      });
    }
    if (lines.length && commit) {
      this.app.scheduleCapture();
    }
    // also the next line's; and it redraws the panel, or a dragged slider
    // snaps back to the old value until something else repaints
    this.setUI(patch);
  }

  /**
   * Minimale afstand (for trees, beyond their ring) of the selected trench
   * lines, and of the next one drawn. `commit` ends a slider drag as one
   * undo step.
   */
  setLineTreeMin(treeMinM: number, commit: boolean) {
    const v = Math.min(TREE_MIN_MAX_M, Math.max(0, treeMinM));
    const lines = this.selectedLines();
    for (const line of lines) {
      if (line.customData?.treeMinM !== v) {
        this.app.scene.mutateElement(line, {
          customData: { ...line.customData, treeMinM: v },
        });
      }
    }
    if (lines.length && commit) {
      this.app.scheduleCapture();
    }
    // also the next line's; and it redraws the panel
    this.setUI({ treeMinM: v });
  }

  /** Tekenreferentie of the selected trench lines, and of the next one drawn */
  setReference(reference: TrenchReference) {
    const lines = this.selectedLines();
    for (const line of lines) {
      this.app.scene.mutateElement(line, {
        customData: { ...line.customData, reference },
        // the centre is dashed, an edge solid
        strokeStyle: trenchLineStyle(reference).strokeStyle,
      });
      ShapeCache.delete(line);
    }
    if (lines.length) {
      this.app.scheduleCapture();
    }
    this.setUI({ reference });
  }

  /** the width the slider shows */
  shownWidth() {
    const [line] = this.selectedLines();
    return line ? trenchLineWidth(line) : this.ui.widthM;
  }

  /** the page's Minimale afstand: what lines from before without their own follow */
  updateSettings(patch: SettingsPatch, commit: boolean) {
    const page = this.page();
    if (!page) {
      return;
    }
    const network = this.ensureNetwork(page);
    if (network.trench.kind === "network") {
      this.app.scene.mutateElement(network, {
        trench: { ...network.trench, ...patch },
      });
    }
    if (commit) {
      this.app.scheduleCapture();
    }
    // the slider shows the page setting: redraw it, or a dragged slider
    // snaps back to the old value until something else repaints
    this.setUI({});
  }

  activate() {
    const page = this.page();
    const state =
      page && pageState(this.app.scene.getNonDeletedElements(), page);
    if (!page || !state) {
      return;
    }
    const network = this.ensureNetwork(page);
    if (network.trench.kind !== "network") {
      return;
    }
    const by = this.app.props.vrijTraceUser ?? {
      uid: "",
      name: STR.unknownUser,
    };
    this.app.scene.mutateElement(network, {
      trench: {
        ...network.trench,
        activation: { by, at: Date.now(), fingerprint: state.fingerprint },
      },
    });
    this.app.scheduleCapture();
  }

  /** zones of the current page are shown (activated for its current layout) */
  zonesActive() {
    const page = this.page();
    return !!(
      page && pageState(this.app.scene.getNonDeletedElements(), page)?.active
    );
  }

  /** hide the zones again for everyone; the trench and trees stay */
  deactivate() {
    const page = this.page();
    const network = page
      ? (this.app.scene.getElement(
          networkIdForPage(page.id),
        ) as ExcalidrawTrenchElement | null)
      : null;
    if (
      !network ||
      network.isDeleted ||
      network.trench.kind !== "network" ||
      !network.trench.activation
    ) {
      return;
    }
    this.app.scene.mutateElement(network, {
      trench: { ...network.trench, activation: null },
    });
    this.app.scheduleCapture();
  }

  /** v8.2 Voorbeeld: replace this page's trench with the example */
  example() {
    const page = this.page();
    if (!page || !getPageFrame(page).cmPerPx) {
      return;
    }
    const { working } = exampleNetwork(getPageFrame(page), randomId);
    this.ensureNetwork(page);
    const old = getPageParts(this.app.scene.getNonDeletedElements(), page.id);
    for (const el of old.lines) {
      this.app.scene.mutateElement(el, { isDeleted: true });
    }
    this.app.scene.insertElements(
      chainSegments(working.nodes, working.segments).map((c) =>
        newTrenchLine({
          points: c.points,
          widthM: c.widthM,
          pdfParentId: page.id,
        }),
      ),
    );
    this.app.scheduleCapture();
  }

  /** v8.2 Wis tracé: the trench lines go, trees and settings stay */
  clear() {
    const page = this.page();
    if (page) {
      for (const line of getPageParts(
        this.app.scene.getNonDeletedElements(),
        page.id,
      ).lines) {
        this.app.scene.mutateElement(line, { isDeleted: true });
      }
      this.app.scheduleCapture();
    }
  }

  toggleHidePdf() {
    this.setUI({ hidePdf: !this.ui.hidePdf });
  }

  /** returns true when the key was handled */
  onKeyDown(e: { key: string }) {
    if (e.key !== "Escape") {
      return false;
    }
    // Esc drops a stroke being drawn
    if (this.ui.stroke) {
      this.drag = null;
      this.setUI({ stroke: null });
      return true;
    }
    return false;
  }

  /** leaving the tool (or a pinch): drop strokes, drags and holds; show the PDF */
  reset() {
    this.drag = null;
    this.setUI({ hotTreeId: null, hidePdf: false, stroke: null });
    this.hold([]);
  }
}
