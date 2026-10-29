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
  ExcalidrawTrenchElement,
  VrijTraceNetworkData,
} from "@excalidraw/element/types";

import {
  addSegment,
  cloneWorking,
  deleteSegment,
  diffWorking,
  drawEndpoints,
  dropNode,
  exampleNetwork,
  fromParts,
} from "./editing";
import {
  DEFAULT_SETTINGS,
  centreOf,
  getPageFrame,
  getPageParts,
  isPdfPage,
  networkIdForPage,
  nextTreeLabel,
  pageState,
  pxPerMetre,
} from "./model";
import { STR } from "./strings";

import type {
  AppState,
  ExcalidrawProps,
  VrijTraceMode,
  VrijTraceUIState,
} from "../types";
import type { Working } from "./editing";
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
}

// screen px, divided by zoom at use
const NODE_HIT = 9;
const SEGMENT_HIT = 11;
/** v8.2: a drag of more than 8 px draws on release */
const DRAG_START = 8;
const MERGE_PX = 12;
const SNAP_PX = 13;

type Drag =
  | { type: "draw"; begin: Pt; moved: boolean }
  | { type: "node"; id: string; pageId: string }
  | { type: "tree"; id: string };

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

  /** the page under p for creating things; toast + null when refused */
  private pageForCreate(p: Pt, refusal: string) {
    const page = this.app.getPdfPageAt(p.x, p.y);
    if (!page || !getPageFrame(page).cmPerPx) {
      this.app.setToast({ message: page ? STR.calibrateFirst : refusal });
      if (this.ui.draft) {
        this.setUI({ draft: null });
      }
      return null;
    }
    if (page.id !== this.ui.pageId) {
      // drafts, selections and the active tree belong to the previous page
      this.setUI({
        pageId: page.id,
        draft: null,
        selectedSegmentId: null,
        activeTreeId: null,
      });
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

  private working(page: ExcalidrawImageElement): Working {
    return fromParts(
      getPageParts(this.app.scene.getNonDeletedElements(), page.id),
    );
  }

  private drawOptions(page: ExcalidrawImageElement) {
    return {
      snap: this.ui.snap,
      reference: this.ui.reference,
      widthM: this.ui.widthM,
      pxPerMetre: pxPerMetre(getPageFrame(page)),
      snapPx: SNAP_PX / this.zoom,
      newId: randomId,
    };
  }

  /** write the difference between two working copies into the scene */
  private apply(page: ExcalidrawImageElement, before: Working, after: Working) {
    const d = diffWorking(before, after);
    const network = this.ensureNetwork(page);
    const map = this.app.scene.getElementsMapIncludingDeleted();
    const created = [
      ...d.addedNodes.map((n) =>
        newTrenchElement({
          id: n.id,
          trench: { kind: "node" },
          pdfParentId: page.id,
          x: n.x - 0.5,
          y: n.y - 0.5,
        }),
      ),
      ...d.addedSegments.map((s) => {
        const a = after.nodes.find((n) => n.id === s.a)!;
        return newTrenchElement({
          id: s.id,
          trench: { kind: "segment", a: s.a, b: s.b, widthM: s.widthM },
          pdfParentId: page.id,
          x: a.x - 0.5,
          y: a.y - 0.5,
        });
      }),
    ];
    if (created.length) {
      this.app.scene.insertElementsAtIndex(
        created,
        this.app.scene.getElementIndex(network.id) + 1,
      );
    }
    for (const n of d.movedNodes) {
      const el = map.get(n.id);
      if (el) {
        this.app.scene.mutateElement(el, { x: n.x - 0.5, y: n.y - 0.5 });
      }
    }
    for (const s of d.changedSegments) {
      const el = map.get(s.id) as ExcalidrawTrenchElement | undefined;
      if (el) {
        this.app.scene.mutateElement(el, {
          trench: { kind: "segment", a: s.a, b: s.b, widthM: s.widthM },
        });
      }
    }
    for (const id of [...d.removedNodes, ...d.removedSegments]) {
      const el = map.get(id);
      if (el) {
        this.app.scene.mutateElement(el, { isDeleted: true });
      }
    }
  }

  /** run one edit on a working copy and record it as one undo step */
  private edit(page: ExcalidrawImageElement, op: (w: Working) => void) {
    const before = this.working(page);
    const after = cloneWorking(before);
    op(after);
    this.apply(page, before, after);
    this.app.scheduleCapture();
  }

  private hitNode(page: ExcalidrawImageElement, p: Pt) {
    const parts = getPageParts(this.app.scene.getNonDeletedElements(), page.id);
    return (
      parts.nodes.find((n) => {
        const c = centreOf(n);
        return Math.hypot(c.x - p.x, c.y - p.y) <= NODE_HIT / this.zoom;
      }) ?? null
    );
  }

  private hitSegment(page: ExcalidrawImageElement, p: Pt) {
    const w = this.working(page);
    const ppm = pxPerMetre(getPageFrame(page));
    for (const s of w.segments) {
      const a = w.nodes.find((n) => n.id === s.a);
      const b = w.nodes.find((n) => n.id === s.b);
      if (!a || !b) {
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2
        ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2))
        : 0;
      const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      if (d <= Math.max(SEGMENT_HIT / this.zoom, (s.widthM * ppm) / 2)) {
        return s.id;
      }
    }
    return null;
  }

  private refuseHeld(id: string) {
    const name = this.isHeldByOther(id);
    if (name) {
      this.app.setToast({ message: STR.heldBy(name) });
    }
    return !!name;
  }

  private preview(page: ExcalidrawImageElement, start: Pt, cur: Pt) {
    const o = this.drawOptions(page);
    const line = drawEndpoints(this.working(page), start, cur, o);
    return line
      ? {
          ...line,
          lengthM:
            Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) / o.pxPerMetre,
        }
      : null;
  }

  private commitDraw(page: ExcalidrawImageElement, p: Pt) {
    const draft = this.ui.draft!;
    let endId: string | null = null;
    this.edit(page, (w) => {
      endId = addSegment(w, draft.start, p, this.drawOptions(page));
    });
    const end = endId
      ? this.working(page).nodes.find((n) => n.id === endId)
      : null;
    this.setUI({
      draft: end
        ? { start: { x: end.x, y: end.y }, cur: p, preview: null }
        : { ...draft, cur: p },
    });
  }

  pointerDown(p: Pt) {
    const mode = this.ui.mode;
    if (mode === "teken") {
      const page = this.pageForCreate(p, STR.onlyOnPdf);
      if (!page) {
        return;
      }
      if (!this.ui.draft) {
        const node = this.hitNode(page, p);
        this.setUI({
          draft: { start: node ? centreOf(node) : p, cur: p, preview: null },
        });
        this.beginDrag({ type: "draw", begin: p, moved: false });
      } else {
        this.commitDraw(page, p);
      }
      return;
    }
    if (mode === "boom" || mode === "boomToevoegen") {
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
      return;
    }
    const page = this.app.getPdfPageAt(p.x, p.y) ?? this.page();
    if (!page || !getPageFrame(page).cmPerPx) {
      return;
    }
    if (mode === "verplaats") {
      const node = this.hitNode(page, p);
      if (node && !this.refuseHeld(node.id)) {
        this.hold([node.id]);
        this.beginDrag({ type: "node", id: node.id, pageId: page.id });
      }
    } else if (mode === "selecteer") {
      const id = this.hitSegment(page, p);
      if (id && this.refuseHeld(id)) {
        return;
      }
      const seg = id
        ? (this.app.scene.getElement(id) as ExcalidrawTrenchElement | null)
        : null;
      this.setUI({
        pageId: page.id,
        selectedSegmentId: id,
        ...(seg?.trench.kind === "segment"
          ? { widthM: seg.trench.widthM }
          : {}),
      });
      this.hold(id ? [id] : []);
    } else if (mode === "verwijder") {
      const id = this.hitSegment(page, p);
      if (id && !this.refuseHeld(id)) {
        this.edit(page, (w) => deleteSegment(w, id));
      }
    }
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
    if (!d) {
      return;
    }
    if (d.type === "draw") {
      if (
        Math.hypot(p.x - d.begin.x, p.y - d.begin.y) >
        DRAG_START / this.zoom
      ) {
        d.moved = true;
      }
      this.hover(p);
    } else {
      const el = this.app.scene.getElement(d.id);
      if (el && !el.isDeleted) {
        this.app.scene.mutateElement(el, { x: p.x - 0.5, y: p.y - 0.5 });
      }
    }
  }

  private dragEnd(p: Pt) {
    const d = this.drag;
    this.drag = null;
    if (!d) {
      return;
    }
    if (d.type === "draw") {
      const page = this.page();
      if (!page) {
        this.setUI({ draft: null });
      } else if (d.moved && this.ui.draft) {
        this.commitDraw(page, p);
      }
    } else if (d.type === "node") {
      const page = this.page(d.pageId);
      if (page) {
        this.edit(page, (w) => dropNode(w, d.id, MERGE_PX / this.zoom));
      }
      this.hold([]);
    } else {
      this.app.scheduleCapture();
      this.hold([]);
    }
  }

  hover(p: Pt) {
    const mode = this.ui.mode;
    if (mode === "teken" || mode === "boom" || mode === "boomToevoegen") {
      this.app.setCursor(
        this.app.getPdfPageAt(p.x, p.y) ? "crosshair" : "not-allowed",
      );
    } else {
      this.app.setCursor("default");
    }
    const draft = this.ui.draft;
    if (!draft) {
      return;
    }
    const page = this.page();
    this.setUI({
      draft: page
        ? { ...draft, cur: p, preview: this.preview(page, draft.start, p) }
        : null,
    });
  }

  setMode(mode: VrijTraceMode) {
    this.setUI({
      mode,
      draft: null,
      activeTreeId: null,
      ...(mode === "selecteer" ? {} : { selectedSegmentId: null }),
    });
    this.hold([]);
  }

  moveTree(treeId: string) {
    this.setUI({ mode: "boom", activeTreeId: treeId, draft: null });
  }

  /** v8.2 Stop: back to segment selection */
  stop() {
    this.setMode("selecteer");
  }

  finish() {
    this.setUI({ draft: null });
  }

  setWidth(widthM: number, commit: boolean) {
    const v = Math.min(2.3, Math.max(0.3, widthM));
    const seg = this.ui.selectedSegmentId
      ? (this.app.scene.getElement(
          this.ui.selectedSegmentId,
        ) as ExcalidrawTrenchElement | null)
      : null;
    if (seg && !seg.isDeleted && seg.trench.kind === "segment") {
      this.app.scene.mutateElement(seg, {
        trench: { ...seg.trench, widthM: v },
      });
      if (commit) {
        this.app.scheduleCapture();
      }
    }
    this.setUI({ widthM: v });
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
    this.app.setToast({ message: STR.activated });
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
    this.app.setToast({ message: STR.deactivated });
  }

  deleteSelectedOrMode() {
    const page = this.page();
    const id = this.ui.selectedSegmentId;
    if (page && id && !this.refuseHeld(id)) {
      this.edit(page, (w) => deleteSegment(w, id));
      this.setUI({ selectedSegmentId: null });
      this.hold([]);
    } else if (!id) {
      this.setMode("verwijder");
    }
  }

  /** v8.2 Voorbeeld: replace this page's network and trees with the example */
  example() {
    const page = this.page();
    if (!page || !getPageFrame(page).cmPerPx) {
      return;
    }
    const { working, trees } = exampleNetwork(getPageFrame(page), randomId);
    this.apply(page, this.working(page), working);
    for (const t of getPageParts(
      this.app.scene.getNonDeletedElements(),
      page.id,
    ).trees) {
      this.app.scene.mutateElement(t, { isDeleted: true });
    }
    this.app.scene.insertElementsAtIndex(
      trees.map((t) =>
        newTrenchElement({
          trench: { kind: "tree", label: t.label },
          pdfParentId: page.id,
          x: t.x - 0.5,
          y: t.y - 0.5,
        }),
      ),
      this.app.scene.getElementIndex(networkIdForPage(page.id)) + 1,
    );
    this.setUI({ draft: null, selectedSegmentId: null, activeTreeId: null });
    this.app.scheduleCapture();
  }

  /** v8.2 Wis tracé: nodes and segments go, trees and settings stay */
  clear() {
    const page = this.page();
    if (page) {
      this.edit(page, (w) => {
        w.nodes = [];
        w.segments = [];
      });
      this.setUI({ draft: null, selectedSegmentId: null });
    }
  }

  toggleHidePdf() {
    this.setUI({ hidePdf: !this.ui.hidePdf });
  }

  /** returns true when the key was handled */
  onKeyDown(e: { key: string }) {
    if (e.key === "Escape") {
      // finishes the line being drawn (was "Voltooi"); else stops drawing
      if (this.ui.draft) {
        this.finish();
      } else {
        this.stop();
      }
      return true;
    }
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      this.ui.selectedSegmentId
    ) {
      this.deleteSelectedOrMode();
      return true;
    }
    return false;
  }

  /** leaving the tool: drop drafts, drags and holds; show the PDF again */
  reset() {
    this.drag = null;
    this.setUI({
      draft: null,
      activeTreeId: null,
      selectedSegmentId: null,
      hidePdf: false,
    });
    this.hold([]);
  }
}
