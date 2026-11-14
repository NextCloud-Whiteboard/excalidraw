import { getCommonBounds, isTrenchElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
} from "@excalidraw/element/types";

import { isFromLibrary, libraryItemIdOf, placedItemId } from "../libraryMatch";

import { polygonTouches } from "./geometry";
import {
  isPdfPage,
  isTreeRing,
  isTrenchLine,
  sceneToPage,
  trenchLinePoints,
} from "./model";

import type { Zones } from "./geometry";
import type { PageFrame } from "./model";
import type { LibraryItem } from "../types";

/** a placement is its outermost group, or the lone element */
export const elementKey = (el: ExcalidrawElement) =>
  el.groupIds[el.groupIds.length - 1] ?? el.id;

/** a library item placed on a page that is not a tree: an AVP, a duct… */
export type PageElement = {
  key: string;
  ids: string[];
  elements: ExcalidrawElement[];
  /** the library item it was placed from, if known */
  itemId: string | null;
};

/**
 * The library items placed on a page other than trees and trench lines, one
 * per placement, in drawing order (the order the Elementen list numbers
 * them). The user's own shapes carry no library mark and are left out.
 */
export const pageElements = (
  elements: readonly ExcalidrawElement[],
  pageId: string,
  libraryItems: readonly LibraryItem[] = [],
): PageElement[] => {
  const onPage = (el: ExcalidrawElement) =>
    !el.isDeleted &&
    el.customData?.pdfParentId === pageId &&
    !isTrenchLine(el) &&
    !isTrenchElement(el) &&
    !isPdfPage(el) &&
    (isFromLibrary(el) || !!libraryItemIdOf(el));
  const keys: string[] = [];
  for (const el of elements) {
    if (onPage(el) && !keys.includes(elementKey(el))) {
      keys.push(elementKey(el));
    }
  }
  // the whole placement, also any part that lies off the page
  const byKey = new Map(keys.map((k) => [k, [] as ExcalidrawElement[]]));
  for (const el of elements) {
    if (!el.isDeleted) {
      byKey.get(elementKey(el))?.push(el);
    }
  }
  return keys
    .map((key) => ({ key, elements: byKey.get(key)! }))
    .filter(({ elements: els }) => !els.some(isTreeRing))
    .map(({ key, elements: els }) => ({
      key,
      ids: els.map((el) => el.id),
      elements: els,
      itemId: placedItemId(els, libraryItems),
    }));
};

export type ElementZones = {
  inside: boolean | null;
  red: boolean | null;
  work: boolean | null;
};

/**
 * The zones an element's footprint (its box on the page) touches, answered
 * like a tree's: nothing without a trench, the trench only while the zones
 * are not activated.
 */
export const elementZones = (
  els: readonly ExcalidrawElement[],
  frame: PageFrame,
  zones: Zones,
  active: boolean,
): ElementZones => {
  if (!zones.trench.length) {
    return { inside: null, red: null, work: null };
  }
  const [x1, y1, x2, y2] = getCommonBounds(els);
  const footprint = [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ].map((p) => sceneToPage(frame, p));
  return {
    inside: polygonTouches(footprint, zones.trench),
    red: active ? polygonTouches(footprint, zones.red) : null,
    work: active ? polygonTouches(footprint, zones.work) : null,
  };
};

/** a trench line's length along its points, in metres on its page */
export const lineLengthM = (
  line: ExcalidrawLinearElement,
  frame: PageFrame,
) => {
  const pts = trenchLinePoints(line).map((p) => sceneToPage(frame, p));
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    m += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return m;
};
