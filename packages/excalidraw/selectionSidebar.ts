import type { ExcalidrawElement } from "@excalidraw/element/types";

import { isFromLibrary, libraryItemIdOf, placedItemId } from "./libraryMatch";
import { elementKey } from "./vrijtrace/elements";
import {
  getPageFrame,
  isPdfPage,
  isTreeRing,
  isTrenchLine,
} from "./vrijtrace/model";

import type { AppState, LibraryItem } from "./types";

/**
 * What a selection on the canvas points the sidebar at. On a calibrated PDF
 * page, Vrij Tracé: a tree, a trench line, or another placed library item (an
 * element). Anywhere else, a placed library item's tile in the library.
 */
export type SelectionTarget =
  | { kind: "tree"; ringId: string; pageId: string }
  | { kind: "line"; lineId: string; pageId: string }
  | { kind: "element"; key: string; pageId: string; itemId: string | null }
  | { kind: "library"; itemId: string }
  | null;

/**
 * The target of the selection, when it is one thing: a single element, or
 * the elements of one group. Two placements, or anything else mixed in, point
 * nowhere, so the sidebar stays as it is.
 */
export const selectionTarget = (
  elements: readonly ExcalidrawElement[],
  selectedElementIds: AppState["selectedElementIds"],
  {
    vrijTrace = true,
    libraryItems = [],
  }: {
    /** placements on a calibrated page point at Vrij Tracé; without it they
     * are library items like any */
    vrijTrace?: boolean;
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
  if (vrijTrace) {
    // only a calibrated page has a check to show
    const calibrated = (id: unknown) => {
      const page = elements.find((el) => el.id === id);
      return typeof id === "string" &&
        isPdfPage(page) &&
        getPageFrame(page).cmPerPx
        ? id
        : null;
    };
    const rings = selected.filter(isTreeRing);
    if (rings.length === 1) {
      const pageId = calibrated(rings[0].customData?.pdfParentId);
      if (pageId) {
        return { kind: "tree", ringId: rings[0].id, pageId };
      }
    }
    if (selected.length === 1 && isTrenchLine(selected[0])) {
      const pageId = calibrated(selected[0].customData?.pdfParentId);
      if (pageId) {
        return { kind: "line", lineId: selected[0].id, pageId };
      }
    }
    const pageId = calibrated(selected[0].customData?.pdfParentId);
    if (
      pageId &&
      !rings.length &&
      selected.every(
        (el) =>
          el.customData?.pdfParentId === pageId &&
          (isFromLibrary(el) || libraryItemIdOf(el)),
      )
    ) {
      return {
        kind: "element",
        key: elementKey(selected[0]),
        pageId,
        itemId: placedItemId(selected, libraryItems),
      };
    }
  }
  const itemId = placedItemId(selected, libraryItems);
  return itemId ? { kind: "library", itemId } : null;
};

/** the same target gives the same key, so a tab opens once per selection */
export const selectionTargetKey = (target: SelectionTarget) =>
  !target
    ? null
    : target.kind === "tree"
    ? `tree:${target.ringId}`
    : target.kind === "line"
    ? `line:${target.lineId}`
    : target.kind === "element"
    ? `element:${target.key}`
    : `library:${target.itemId}`;
