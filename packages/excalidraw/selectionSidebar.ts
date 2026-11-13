import type { ExcalidrawElement } from "@excalidraw/element/types";

import { getPageFrame, isPdfPage, isTreeRing } from "./vrijtrace/model";

import type { AppState } from "./types";

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

/**
 * The target of the selection, when it is one thing: a single element, or
 * the elements of one group. Two placements, or anything else mixed in, point
 * nowhere, so the sidebar stays as it is.
 */
export const selectionTarget = (
  elements: readonly ExcalidrawElement[],
  selectedElementIds: AppState["selectedElementIds"],
  /** trees point at Vrij Tracé; without it they are library items like any */
  { trees = true }: { trees?: boolean } = {},
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
  const itemId = libraryItemIdOf(selected[0]);
  return itemId && selected.every((el) => libraryItemIdOf(el) === itemId)
    ? { kind: "library", itemId }
    : null;
};

/** the same target gives the same key, so a tab opens once per selection */
export const selectionTargetKey = (target: SelectionTarget) =>
  !target
    ? null
    : target.kind === "tree"
    ? `tree:${target.ringId}`
    : `library:${target.itemId}`;
