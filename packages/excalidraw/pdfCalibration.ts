import { arrayToMap } from "@excalidraw/common";
import {
  deepCopyElement,
  getCommonBoundingBox,
  isBoundToContainer,
  resizeMultipleElements,
} from "@excalidraw/element";

import type { Scene } from "@excalidraw/element";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { getCalibrationScale, isValidCmPerPx } from "./data/library";

/** Resize elements together around the centre of their common bounds. */
export const resizeElementsAroundCentre = (
  elements: readonly NonDeletedExcalidrawElement[],
  scale: number,
  scene: Scene,
) => {
  const { width, height } = getCommonBoundingBox(elements);
  resizeMultipleElements(
    elements,
    scene.getNonDeletedElementsMap(),
    "se",
    scene,
    arrayToMap(elements.map((element) => deepCopyElement(element))),
    {
      shouldMaintainAspectRatio: true,
      shouldResizeFromCenter: true,
      nextWidth: width * scale,
      nextHeight: height * scale,
    },
  );
};

/**
 * Bring library items (elements with customData.libraryCmPerPx) to a new
 * cm-per-px scale. Each item — its outermost group, or a lone element — is
 * resized around its own centre so it keeps its real-world size and stays
 * where it was placed, then remembers the new scale.
 */
export const rescaleLibraryItems = (
  elements: readonly NonDeletedExcalidrawElement[],
  toCmPerPx: number,
  scene: Scene,
) => {
  const libraryElements = elements.filter((element) =>
    isValidCmPerPx(element.customData?.libraryCmPerPx),
  );

  const items = new Map<string, NonDeletedExcalidrawElement[]>();
  for (const element of libraryElements) {
    // bound text is resized along with its container
    if (isBoundToContainer(element)) {
      continue;
    }
    const key = element.groupIds[element.groupIds.length - 1] ?? element.id;
    items.set(key, [...(items.get(key) ?? []), element]);
  }
  for (const item of items.values()) {
    const scale = getCalibrationScale(
      item[0].customData?.libraryCmPerPx,
      toCmPerPx,
    );
    if (scale !== null) {
      resizeElementsAroundCentre(item, scale, scene);
    }
  }

  for (const element of libraryElements) {
    scene.mutateElement(element, {
      customData: { ...element.customData, libraryCmPerPx: toCmPerPx },
    });
  }
};
