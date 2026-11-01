import {
  DEFAULT_SIDEBAR,
  VRIJTRACE_SIDEBAR_TAB,
  randomId,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";
import { newTrenchElement } from "@excalidraw/element";

import type { Scene } from "@excalidraw/element";
import type {
  ExcalidrawImageElement,
  ExcalidrawLinearElement,
  ExcalidrawTrenchElement,
  VrijTraceNetworkData,
} from "@excalidraw/element/types";

import { exampleNetwork, simplify, snapToTrench, straighten } from "./editing";
import { chainSegments, newTrenchLine } from "./lines";
import {
  DEFAULT_SETTINGS,
  clampTrenchWidth,
  getPageFrame,
  getPageParts,
  isPdfPage,
  isTrenchLine,
  lineWidthOf,
  networkIdForPage,
  nextTreeLabel,
  pageState,
  trenchLinePoints,
  trenchLineWidth,
} from "./model";
import { STR } from "./strings";

import type {
  AppState,
  ExcalidrawProps,
  VrijTraceMode,
  VrijTraceUIState,
} from "../types";
import type { Pt } from "./geometry";

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
  /** switch to the Vrij Tracé tool (tree buttons work from a selection too) */
  activateTool: () => void;
}

// screen px, divided by zoom at use
const SNAP_PX = 13;
/** a hand's wobble: stroke points within this of a straight piece are dropped */
const SMOOTH_PX = 3;
/** pointer moves closer than this to the last stroke point are skipped */
const STEP_PX = 2;
/** shorter strokes are a click, not a trench */
const MIN_STROKE_PX = 8;

type Drag =
  | { type: "tree"; id: string }
  | { type: "stroke"; pageId: string }
  /** a stroke that cannot become a trench: says why once it is drawn */
  | { type: "refused"; begin: Pt; message: string; told: boolean };

type SettingsPatch = Partial<
  Pick<VrijTraceNetworkData, "redSide" | "workWidthM" | "workSide" | "treeMinM">
>;

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
      // the active tree belongs to the previous page
      this.setUI({ pageId: page.id, activeTreeId: null });
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

  private refuseHeld(id: string) {
    const name = this.isHeldByOther(id);
    if (name) {
      this.app.setToast({ message: STR.heldBy(name) });
    }
    return !!name;
  }

  /** tree placing takes the pointer; else the tool draws trenches */
  placesTrees() {
    const mode = this.ui.mode;
    return mode === "boom" || mode === "boomToevoegen";
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
    const network = this.ensureNetwork(page);
    this.app.scene.insertElement(
      newTrenchLine({
        points,
        widthM: this.ui.widthM,
        reference: this.ui.reference,
        pdfParentId: pageId,
        strokeWidth: lineWidthOf(network),
      }),
    );
    this.app.scheduleCapture();
  }

  pointerDown(p: Pt) {
    const mode = this.ui.mode;
    if (mode !== "boom" && mode !== "boomToevoegen") {
      this.startStroke(p);
      return;
    }
    const page = this.pageForCreate(p, STR.treesOnlyOnPdf);
    if (!page) {
      return;
    }
    let treeId = this.ui.activeTreeId;
    if (mode === "boomToevoegen") {
      const trees = getPageParts(
        this.app.scene.getNonDeletedElements(),
        page.id,
      ).trees;
      const network = this.ensureNetwork(page);
      const tree = newTrenchElement({
        trench: { kind: "tree", label: nextTreeLabel(trees) },
        pdfParentId: page.id,
        x: p.x - 0.5,
        y: p.y - 0.5,
      });
      this.app.scene.insertElementAtIndex(
        tree,
        this.app.scene.getElementIndex(network.id) + 1,
      );
      treeId = tree.id;
      this.setUI({ mode: "boom", activeTreeId: tree.id });
    }
    const tree = treeId ? this.app.scene.getElement(treeId) : null;
    if (
      !tree ||
      tree.isDeleted ||
      tree.customData?.pdfParentId !== page.id ||
      this.refuseHeld(tree.id)
    ) {
      return;
    }
    this.app.scene.mutateElement(tree, { x: p.x - 0.5, y: p.y - 0.5 });
    this.hold([tree.id]);
    this.beginDrag({ type: "tree", id: tree.id });
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
    if (d?.type === "refused") {
      if (
        !d.told &&
        Math.hypot(p.x - d.begin.x, p.y - d.begin.y) >=
          MIN_STROKE_PX / this.zoom
      ) {
        d.told = true;
        this.app.setToast({ message: d.message });
      }
      return;
    }
    const el = d ? this.app.scene.getElement(d.id) : null;
    if (el && !el.isDeleted) {
      this.app.scene.mutateElement(el, { x: p.x - 0.5, y: p.y - 0.5 });
    }
  }

  private dragEnd(p: Pt) {
    const d = this.drag;
    this.drag = null;
    if (d?.type === "stroke") {
      this.finishStroke(d.pageId, p);
    } else if (d?.type === "refused") {
      // nothing was drawn
    } else if (d) {
      this.app.scheduleCapture();
      this.hold([]);
    }
  }

  hover(p: Pt) {
    this.app.setCursor(
      this.app.getPdfPageAt(p.x, p.y) ? "crosshair" : "not-allowed",
    );
  }

  setMode(mode: VrijTraceMode) {
    this.setUI({ mode, activeTreeId: null });
    this.hold([]);
    if (mode !== "teken") {
      this.app.activateTool();
    }
  }

  moveTree(treeId: string) {
    this.setUI({ mode: "boom", activeTreeId: treeId });
    this.app.activateTool();
  }

  /** v8.2 Stop: done with trees, back to drawing */
  stop() {
    this.setMode("teken");
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
      this.setUI({ pageId, activeTreeId: null });
    }
  }

  /** Lijndikte: how thick this page's trench lines are drawn (all of them) */
  setLineWidth(px: number) {
    const page = this.page();
    if (!page) {
      return;
    }
    const network = this.ensureNetwork(page);
    if (network.trench.kind === "network") {
      this.app.scene.mutateElement(network, {
        trench: { ...network.trench, lineWidthPx: px },
      });
    }
    for (const line of getPageParts(
      this.app.scene.getNonDeletedElements(),
      page.id,
    ).lines) {
      this.app.scene.mutateElement(line, { strokeWidth: px });
    }
    this.app.scheduleCapture();
    // the panel shows the page setting: redraw it
    this.setUI({});
  }

  /** the width the slider shows */
  shownWidth() {
    const [line] = this.selectedLines();
    return line ? trenchLineWidth(line) : this.ui.widthM;
  }

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

  /** v8.2 Voorbeeld: replace this page's network and trees with the example */
  example() {
    const page = this.page();
    if (!page || !getPageFrame(page).cmPerPx) {
      return;
    }
    const { working, trees } = exampleNetwork(getPageFrame(page), randomId);
    const network = this.ensureNetwork(page);
    const old = getPageParts(this.app.scene.getNonDeletedElements(), page.id);
    for (const el of [...old.lines, ...old.trees]) {
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
    this.app.scene.insertElementsAtIndex(
      trees.map((t) =>
        newTrenchElement({
          trench: { kind: "tree", label: t.label },
          pdfParentId: page.id,
          x: t.x - 0.5,
          y: t.y - 0.5,
        }),
      ),
      this.app.scene.getElementIndex(network.id) + 1,
    );
    this.setUI({ activeTreeId: null });
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
    // Esc drops a stroke being drawn, or leaves tree placing
    if (this.ui.stroke) {
      this.drag = null;
      this.setUI({ stroke: null });
      return true;
    }
    if (this.placesTrees()) {
      this.stop();
      return true;
    }
    return false;
  }

  /** leaving the tool (or a pinch): drop strokes, drags and holds; show the PDF */
  reset() {
    this.drag = null;
    this.setUI({ activeTreeId: null, hidePdf: false, stroke: null });
    this.hold([]);
  }
}
