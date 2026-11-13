import { getCommonBounds } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { isValidCmPerPx } from "./data/library";
import { getPageFrame, isPdfPage, isTreeRing } from "./vrijtrace/model";

import type { AppState, LibraryItem } from "./types";

/**
 * What a selection on the canvas points the sidebar at: one tree on a
 * calibrated PDF page (its Vrij Tracé check), or one placed library item (its
 * tile).
 */
export type SelectionTarget =
  | { kind: "tree"; ringId: string; pageId: string }
  | { kind: "library"; itemId: string }
  | null;

/** the library item an element was placed from, if any */
export const libraryItemIdOf = (el: ExcalidrawElement) =>
  typeof el.customData?.libraryItemId === "string"
    ? (el.customData.libraryItemId as string)
    : null;

/** placed from the library: every insert leaves one of these scale marks */
const isFromLibrary = (el: ExcalidrawElement) =>
  el.customData?.libraryCmPerPx !== undefined ||
  el.customData?.librarySymbol === true;

const isLinear = (el: ExcalidrawElement) =>
  el.type === "line" || el.type === "arrow";

/** what an element looks like, apart from where it is and how big */
const lookOf = (el: ExcalidrawElement) =>
  JSON.stringify([
    el.type,
    el.strokeColor,
    el.backgroundColor,
    el.strokeStyle,
    "startArrowhead" in el ? el.startArrowhead : null,
    "endArrowhead" in el ? el.endArrowhead : null,
    el.type === "text" ? el.text : null,
  ]);

/** a drawing's tree data, if it has any (older placed trees have none) */
const treeDataOf = (els: readonly ExcalidrawElement[]) =>
  JSON.stringify(els.find(isTreeRing)?.customData?.treeRing ?? null);

type Drawing = { look: string; box: number[] }[];

/** each element's look and box, in a drawing scaled to a size of 1 */
const drawingOf = (els: readonly ExcalidrawElement[]): Drawing => {
  const [x1, y1, x2, y2] = getCommonBounds(els);
  const size = Math.max(x2 - x1, y2 - y1) || 1;
  const key = (d: Drawing[number]) =>
    `${d.look}|${d.box.map((v) => v.toFixed(3)).join()}`;
  return els
    .map((el) => ({
      look: lookOf(el),
      box: [
        (el.x - x1) / size,
        (el.y - y1) / size,
        el.width / size,
        el.height / size,
      ],
    }))
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
};

const TOLERANCE = 0.02;

/**
 * A real-size item's size in cm (its larger side), from the scale it is drawn
 * at; null for a symbol, which has no real size.
 */
const realSizeOf = (els: readonly ExcalidrawElement[]) => {
  const cmPerPx = els[0]?.customData?.libraryCmPerPx;
  if (
    els[0]?.customData?.librarySymbol === true ||
    !isValidCmPerPx(cmPerPx) ||
    !els.every((el) => el.customData?.libraryCmPerPx === cmPerPx)
  ) {
    return null;
  }
  const [x1, y1, x2, y2] = getCommonBounds(els);
  return Math.max(x2 - x1, y2 - y1) * cmPerPx;
};

/** the same real size, or either has none to compare */
const sameRealSize = (a: number | null, b: number | null) =>
  a === null || b === null || Math.abs(a - b) <= TOLERANCE * Math.max(a, b);

const sameDrawing = (a: Drawing, b: Drawing) =>
  a.length === b.length &&
  a.every(
    (d, i) =>
      d.look === b[i].look &&
      d.box.every((v, j) => Math.abs(v - b[i].box[j]) <= TOLERANCE),
  );

const drawings = new WeakMap<LibraryItem["elements"], Drawing>();

/**
 * The library item a placement from before items were tagged was made from:
 * the one drawn alike, at whatever scale it was placed. A lone line or arrow
 * (a boring) matches on its look alone, as it is often stretched to fit.
 * Real-size items must also be as large in reality (trees are one drawing at
 * several sizes); of those drawn alike, the one with the same tree data wins.
 */
const matchLibraryItem = (
  selected: readonly ExcalidrawElement[],
  libraryItems: readonly LibraryItem[],
) => {
  if (!selected.every(isFromLibrary)) {
    return null;
  }
  const lone = selected.length === 1 && isLinear(selected[0]);
  const drawing = drawingOf(selected);
  const treeData = treeDataOf(selected);
  const realSize = realSizeOf(selected);
  let first: LibraryItem["id"] | null = null;
  for (const item of libraryItems) {
    const els = item.elements.filter((el) => !el.isDeleted);
    if (els.length !== selected.length) {
      continue;
    }
    if (lone) {
      if (isLinear(els[0]) && lookOf(els[0]) === lookOf(selected[0])) {
        return item.id;
      }
      continue;
    }
    let itemDrawing = drawings.get(item.elements);
    if (!itemDrawing) {
      itemDrawing = drawingOf(els);
      drawings.set(item.elements, itemDrawing);
    }
    if (
      sameDrawing(drawing, itemDrawing) &&
      sameRealSize(realSize, realSizeOf(els))
    ) {
      if (treeDataOf(els) === treeData) {
        return item.id;
      }
      first ??= item.id;
    }
  }
  return first;
};

/**
 * The target of the selection, when it is one thing: a single element, or
 * the elements of one group. Two placements, or anything else mixed in, point
 * nowhere, so the sidebar stays as it is.
 */
export const selectionTarget = (
  elements: readonly ExcalidrawElement[],
  selectedElementIds: AppState["selectedElementIds"],
  {
    trees = true,
    libraryItems = [],
  }: {
    /** trees point at Vrij Tracé; without it they are library items like any */
    trees?: boolean;
    /** to recognise placements from before items were tagged */
    libraryItems?: readonly LibraryItem[];
  } = {},
): SelectionTarget => {
  const selected = elements.filter(
    (el) => selectedElementIds[el.id] && !el.isDeleted,
  );
  if (!selected.length) {
    return null;
  }
  // one thing: a lone element, or everything in the same outermost group
  const outer = (el: ExcalidrawElement) => el.groupIds[el.groupIds.length - 1];
  if (
    selected.length > 1 &&
    !(
      outer(selected[0]) &&
      selected.every((el) => outer(el) === outer(selected[0]))
    )
  ) {
    return null;
  }
  const rings = selected.filter(isTreeRing);
  if (trees && rings.length === 1) {
    const pageId = rings[0].customData?.pdfParentId;
    const page = elements.find((el) => el.id === pageId);
    // only a calibrated page has a tree check to show
    if (
      typeof pageId === "string" &&
      isPdfPage(page) &&
      getPageFrame(page).cmPerPx
    ) {
      return { kind: "tree", ringId: rings[0].id, pageId };
    }
  }
  const tagged = libraryItemIdOf(selected[0]);
  const itemId =
    tagged && selected.every((el) => libraryItemIdOf(el) === tagged)
      ? tagged
      : !selected.some(libraryItemIdOf)
      ? matchLibraryItem(selected, libraryItems)
      : null;
  return itemId ? { kind: "library", itemId } : null;
};

/** the same target gives the same key, so a tab opens once per selection */
export const selectionTargetKey = (target: SelectionTarget) =>
  !target
    ? null
    : target.kind === "tree"
    ? `tree:${target.ringId}`
    : `library:${target.itemId}`;
