import {
  TEXT_AUTOWRAP_THRESHOLD,
  getGridPoint,
  getFontString,
} from "@excalidraw/common";

import type {
  AppState,
  NormalizedZoomValue,
  NullableGridSize,
  PointerDownState,
} from "@excalidraw/excalidraw/types";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { updateBoundElements } from "./binding";
import { getCommonBounds } from "./bounds";
import { getPerfectElementSize } from "./sizeHelpers";
import { getBoundTextElement } from "./textElement";
import { getMinTextElementWidth } from "./textMeasurements";
import {
  isArrowElement,
  isElbowArrow,
  isFrameLikeElement,
  isImageElement,
  isTextElement,
  isLinearElement,
} from "./typeChecks";

import { pointFrom } from "@excalidraw/math";
import type { LocalPoint } from "@excalidraw/math";

import type { Scene } from "./Scene";

import type { Bounds } from "./bounds";
import type { ExcalidrawElement } from "./types";

const updateTextBubbleConnection = (
  bubbleElement: ExcalidrawElement,
  scene: Scene,
) => {
  // Only process if this is a text bubble
  if (!bubbleElement.customData?.isTextBubble) {
    return;
  }

  // Find the connection line for this bubble
  const connectionLine = scene.getNonDeletedElements().find(
    (element) =>
      element.customData?.isTextBubbleConnection &&
      element.customData?.bubbleId === bubbleElement.id
  );

  if (connectionLine && isLinearElement(connectionLine)) {
    const anchorPoint = connectionLine.customData?.anchorPoint;
    if (anchorPoint) {
      // Calculate new endpoint (center of the bubble)
      const bubbleCenterX = bubbleElement.x + bubbleElement.width / 2;
      const bubbleCenterY = bubbleElement.y + bubbleElement.height / 2;
      
      // Update the connection line points
      const newPoints = [
        pointFrom<LocalPoint>(0, 0), // Start at anchor point (relative to line origin)
        pointFrom<LocalPoint>(
          bubbleCenterX - anchorPoint.x,
          bubbleCenterY - anchorPoint.y
        ), // End at bubble center
      ];

      // Update the connection line
      scene.mutateElement(connectionLine, {
        x: anchorPoint.x,
        y: anchorPoint.y,
        width: bubbleCenterX - anchorPoint.x,
        height: bubbleCenterY - anchorPoint.y,
        points: newPoints,
      });
    }
  }
};

const updateTextBubbleConnectionAfterPdfMove = (
  connectionLine: ExcalidrawElement,
  scene: Scene,
) => {
  if (!connectionLine.customData?.isTextBubbleConnection) {
    return;
  }

  const pdfParentId = connectionLine.customData.pdfParentId;
  const relativeAnchor = connectionLine.customData.relativeAnchor;
  const bubbleId = connectionLine.customData.bubbleId;

  if (!pdfParentId || !relativeAnchor || !bubbleId) {
    return;
  }

  // Find the PDF parent and bubble
  const pdfElement = scene.getNonDeletedElementsMap().get(pdfParentId);
  const bubbleElement = scene.getNonDeletedElementsMap().get(bubbleId);

  if (!pdfElement || !bubbleElement || !isLinearElement(connectionLine)) {
    return;
  }

  // Calculate new absolute anchor position based on relative position
  const newAnchorX = pdfElement.x + (relativeAnchor.x * pdfElement.width);
  const newAnchorY = pdfElement.y + (relativeAnchor.y * pdfElement.height);

  // Calculate bubble center
  const bubbleCenterX = bubbleElement.x + bubbleElement.width / 2;
  const bubbleCenterY = bubbleElement.y + bubbleElement.height / 2;

  // Update the connection line points
  const newPoints = [
    pointFrom<LocalPoint>(0, 0), // Start at anchor point (relative to line origin)
    pointFrom<LocalPoint>(
      bubbleCenterX - newAnchorX,
      bubbleCenterY - newAnchorY
    ), // End at bubble center
  ];

  // Update the connection line with new anchor position
  scene.mutateElement(connectionLine, {
    x: newAnchorX,
    y: newAnchorY,
    width: bubbleCenterX - newAnchorX,
    height: bubbleCenterY - newAnchorY,
    points: newPoints,
    customData: {
      ...connectionLine.customData,
      anchorPoint: { x: newAnchorX, y: newAnchorY } // Update absolute anchor point
    }
  });
};

export const dragSelectedElements = (
  pointerDownState: PointerDownState,
  _selectedElements: NonDeletedExcalidrawElement[],
  offset: { x: number; y: number },
  scene: Scene,
  snapOffset: {
    x: number;
    y: number;
  },
  gridSize: NullableGridSize,
) => {
  if (
    _selectedElements.length === 1 &&
    isElbowArrow(_selectedElements[0]) &&
    (_selectedElements[0].startBinding || _selectedElements[0].endBinding)
  ) {
    return;
  }

  const selectedElements = _selectedElements.filter((element) => {
    if (isElbowArrow(element) && element.startBinding && element.endBinding) {
      const startElement = _selectedElements.find(
        (el) => el.id === element.startBinding?.elementId,
      );
      const endElement = _selectedElements.find(
        (el) => el.id === element.endBinding?.elementId,
      );

      return startElement && endElement;
    }

    return true;
  });

  // we do not want a frame and its elements to be selected at the same time
  // but when it happens (due to some bug), we want to avoid updating element
  // in the frame twice, hence the use of set
  const elementsToUpdate = new Set<NonDeletedExcalidrawElement>(
    selectedElements,
  );
  const frames = selectedElements
    .filter((e) => isFrameLikeElement(e))
    .map((f) => f.id);

  if (frames.length > 0) {
    for (const element of scene.getNonDeletedElements()) {
      if (element.frameId !== null && frames.includes(element.frameId)) {
        elementsToUpdate.add(element);
      }
    }
  }

  // Special handling for PDF elements: when dragging a PDF, move all its children
  const pdfParentIds = new Set<string>();
  for (const element of selectedElements) {
    if (isImageElement(element) && element.customData?.isPdf === true) {
      pdfParentIds.add(element.id);
    }
  }

  if (pdfParentIds.size > 0) {
    for (const element of scene.getNonDeletedElements()) {
      // Include all children of selected PDF elements, except text bubble connection lines
      if (element.customData?.pdfParentId && 
          pdfParentIds.has(element.customData.pdfParentId) &&
          !element.customData?.isTextBubbleConnection) {
        elementsToUpdate.add(element);
      }
    }
  }

  const origElements: ExcalidrawElement[] = [];

  for (const element of elementsToUpdate) {
    const origElement = pointerDownState.originalElements.get(element.id);
    // if original element is not set (e.g. when you duplicate during a drag
    // operation), exit to avoid undefined behavior
    if (!origElement) {
      return;
    }
    origElements.push(origElement);
  }

  const adjustedOffset = calculateOffset(
    getCommonBounds(origElements),
    offset,
    snapOffset,
    gridSize,
  );

  elementsToUpdate.forEach((element) => {
    updateElementCoords(pointerDownState, element, scene, adjustedOffset);
    if (!isArrowElement(element)) {
      // skip arrow labels since we calculate its position during render
      const textElement = getBoundTextElement(
        element,
        scene.getNonDeletedElementsMap(),
      );
      if (textElement) {
        updateElementCoords(
          pointerDownState,
          textElement,
          scene,
          adjustedOffset,
        );
      }
      updateBoundElements(element, scene, {
        simultaneouslyUpdated: Array.from(elementsToUpdate),
      });
    }
    
    // Update text bubble connections when a text bubble is moved
    if (element.customData?.isTextBubble) {
      updateTextBubbleConnection(element, scene);
    }
    
    // Also update if a text element bound to a text bubble is moved
    if (isTextElement(element) && element.containerId) {
      const container = scene.getNonDeletedElementsMap().get(element.containerId);
      if (container?.customData?.isTextBubble) {
        updateTextBubbleConnection(container, scene);
      }
    }
  });

  // Update text bubble connection lines when their parent PDF is moved
  if (pdfParentIds.size > 0) {
    for (const element of scene.getNonDeletedElements()) {
      if (element.customData?.isTextBubbleConnection && 
          element.customData?.pdfParentId && 
          pdfParentIds.has(element.customData.pdfParentId)) {
        updateTextBubbleConnectionAfterPdfMove(element, scene);
      }
    }
  }
};

const calculateOffset = (
  commonBounds: Bounds,
  dragOffset: { x: number; y: number },
  snapOffset: { x: number; y: number },
  gridSize: NullableGridSize,
): { x: number; y: number } => {
  const [x, y] = commonBounds;
  let nextX = x + dragOffset.x + snapOffset.x;
  let nextY = y + dragOffset.y + snapOffset.y;

  if (snapOffset.x === 0 || snapOffset.y === 0) {
    const [nextGridX, nextGridY] = getGridPoint(
      x + dragOffset.x,
      y + dragOffset.y,
      gridSize,
    );

    if (snapOffset.x === 0) {
      nextX = nextGridX;
    }

    if (snapOffset.y === 0) {
      nextY = nextGridY;
    }
  }
  return {
    x: nextX - x,
    y: nextY - y,
  };
};

const updateElementCoords = (
  pointerDownState: PointerDownState,
  element: NonDeletedExcalidrawElement,
  scene: Scene,
  dragOffset: { x: number; y: number },
) => {
  const originalElement =
    pointerDownState.originalElements.get(element.id) ?? element;

  const nextX = originalElement.x + dragOffset.x;
  const nextY = originalElement.y + dragOffset.y;

  scene.mutateElement(element, {
    x: nextX,
    y: nextY,
  });
};

export const getDragOffsetXY = (
  selectedElements: NonDeletedExcalidrawElement[],
  x: number,
  y: number,
): [number, number] => {
  const [x1, y1] = getCommonBounds(selectedElements);
  return [x - x1, y - y1];
};

export const dragNewElement = ({
  newElement,
  elementType,
  originX,
  originY,
  x,
  y,
  width,
  height,
  shouldMaintainAspectRatio,
  shouldResizeFromCenter,
  zoom,
  scene,
  widthAspectRatio = null,
  originOffset = null,
  informMutation = true,
}: {
  newElement: NonDeletedExcalidrawElement;
  elementType: AppState["activeTool"]["type"];
  originX: number;
  originY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shouldMaintainAspectRatio: boolean;
  shouldResizeFromCenter: boolean;
  zoom: NormalizedZoomValue;
  scene: Scene;
  /** whether to keep given aspect ratio when `isResizeWithSidesSameLength` is
      true */
  widthAspectRatio?: number | null;
  originOffset?: {
    x: number;
    y: number;
  } | null;
  informMutation?: boolean;
}) => {
  if (shouldMaintainAspectRatio && newElement.type !== "selection") {
    if (widthAspectRatio) {
      height = width / widthAspectRatio;
    } else {
      // Depending on where the cursor is at (x, y) relative to where the starting point is
      // (originX, originY), we use ONLY width or height to control size increase.
      // This allows the cursor to always "stick" to one of the sides of the bounding box.
      if (Math.abs(y - originY) > Math.abs(x - originX)) {
        ({ width, height } = getPerfectElementSize(
          elementType,
          height,
          x < originX ? -width : width,
        ));
      } else {
        ({ width, height } = getPerfectElementSize(
          elementType,
          width,
          y < originY ? -height : height,
        ));
      }

      if (height < 0) {
        height = -height;
      }
    }
  }

  let newX = x < originX ? originX - width : originX;
  let newY = y < originY ? originY - height : originY;

  if (shouldResizeFromCenter) {
    width += width;
    height += height;
    newX = originX - width / 2;
    newY = originY - height / 2;
  }

  let textAutoResize = null;

  if (isTextElement(newElement)) {
    height = newElement.height;
    const minWidth = getMinTextElementWidth(
      getFontString({
        fontSize: newElement.fontSize,
        fontFamily: newElement.fontFamily,
      }),
      newElement.lineHeight,
    );
    width = Math.max(width, minWidth);

    if (Math.abs(x - originX) > TEXT_AUTOWRAP_THRESHOLD / zoom) {
      textAutoResize = {
        autoResize: false,
      };
    }

    newY = originY;
    if (shouldResizeFromCenter) {
      newX = originX - width / 2;
    }
  }

  if (width !== 0 && height !== 0) {
    let imageInitialDimension = null;
    if (isImageElement(newElement)) {
      imageInitialDimension = {
        initialWidth: width,
        initialHeight: height,
      };
    }

    scene.mutateElement(
      newElement,
      {
        x: newX + (originOffset?.x ?? 0),
        y: newY + (originOffset?.y ?? 0),
        width,
        height,
        ...textAutoResize,
        ...imageInitialDimension,
      },
      { informMutation, isDragging: false },
    );
  }
};
