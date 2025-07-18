import {
  pointFrom,
  type GlobalPoint,
  type LocalPoint,
  type Radians,
  pointDistance,
} from "@excalidraw/math";
import oc from "open-color";

import {
  arrayToMap,
  DEFAULT_TRANSFORM_HANDLE_SPACING,
  FRAME_STYLE,
  invariant,
  THEME,
  throttleRAF,
  getFontString,
} from "@excalidraw/common";

import { FIXED_BINDING_DISTANCE, maxBindingGap } from "@excalidraw/element";
import { LinearElementEditor } from "@excalidraw/element";
import {
  getOmitSidesForDevice,
  getTransformHandles,
  getTransformHandlesFromCoords,
  shouldShowBoundingBox,
} from "@excalidraw/element";
import {
  isElbowArrow,
  isFrameLikeElement,
  isImageElement,
  isLinearElement,
  isTextElement,
} from "@excalidraw/element";

import { renderSelectionElement } from "@excalidraw/element";

import {
  getElementsInGroup,
  getSelectedGroupIds,
  isSelectedViaGroup,
  selectGroupsFromGivenElements,
} from "@excalidraw/element";

import { getCommonBounds, getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  SuggestedBinding,
  SuggestedPointBinding,
} from "@excalidraw/element";

import type {
  TransformHandles,
  TransformHandleType,
} from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawBindableElement,
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
  ExcalidrawImageElement,
  ExcalidrawLinearElement,
  ExcalidrawTextElement,
  GroupId,
  NonDeleted,
} from "@excalidraw/element/types";

import { renderSnaps } from "../renderer/renderSnaps";
import { roundRect } from "../renderer/roundRect";
import {
  getScrollBars,
  SCROLLBAR_COLOR,
  SCROLLBAR_WIDTH,
} from "../scene/scrollbars";
import { type InteractiveCanvasAppState } from "../types";

import { getClientColor, renderRemoteCursors } from "../clients";

import {
  bootstrapCanvas,
  drawHighlightForDiamondWithRotation,
  drawHighlightForRectWithRotation,
  fillCircle,
  getNormalizedCanvasDimensions,
  strokeEllipseWithRotation,
  strokeRectWithRotation,
} from "./helpers";

import type {
  InteractiveCanvasRenderConfig,
  InteractiveSceneRenderConfig,
  RenderableElementsMap,
} from "../scene/types";

const renderElbowArrowMidPointHighlight = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
) => {
  invariant(appState.selectedLinearElement, "selectedLinearElement is null");

  const { segmentMidPointHoveredCoords } = appState.selectedLinearElement;

  invariant(segmentMidPointHoveredCoords, "midPointCoords is null");

  context.save();
  context.translate(appState.scrollX, appState.scrollY);

  highlightPoint(segmentMidPointHoveredCoords, context, appState);

  context.restore();
};

const renderLinearElementPointHighlight = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elementsMap: ElementsMap,
) => {
  const { elementId, hoverPointIndex } = appState.selectedLinearElement!;
  if (
    appState.editingLinearElement?.selectedPointsIndices?.includes(
      hoverPointIndex,
    )
  ) {
    return;
  }
  const element = LinearElementEditor.getElement(elementId, elementsMap);

  if (!element) {
    return;
  }
  const point = LinearElementEditor.getPointAtIndexGlobalCoordinates(
    element,
    hoverPointIndex,
    elementsMap,
  );
  context.save();
  context.translate(appState.scrollX, appState.scrollY);

  highlightPoint(point, context, appState);
  context.restore();
};

const highlightPoint = <Point extends LocalPoint | GlobalPoint>(
  point: Point,
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
) => {
  context.fillStyle = "rgba(105, 101, 219, 0.4)";

  fillCircle(
    context,
    point[0],
    point[1],
    LinearElementEditor.POINT_HANDLE_SIZE / appState.zoom.value,
    false,
  );
};

const renderSingleLinearPoint = <Point extends GlobalPoint | LocalPoint>(
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  point: Point,
  radius: number,
  isSelected: boolean,
  isPhantomPoint = false,
) => {
  context.strokeStyle = "#5e5ad8";
  context.setLineDash([]);
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  if (isSelected) {
    context.fillStyle = "rgba(134, 131, 226, 0.9)";
  } else if (isPhantomPoint) {
    context.fillStyle = "rgba(177, 151, 252, 0.7)";
  }

  fillCircle(
    context,
    point[0],
    point[1],
    radius / appState.zoom.value,
    !isPhantomPoint,
  );
};

const renderBindingHighlightForBindableElement = (
  context: CanvasRenderingContext2D,
  element: ExcalidrawBindableElement,
  elementsMap: ElementsMap,
  zoom: InteractiveCanvasAppState["zoom"],
) => {
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
  const width = x2 - x1;
  const height = y2 - y1;

  context.strokeStyle = "rgba(0,0,0,.05)";
  context.fillStyle = "rgba(0,0,0,.05)";

  // To ensure the binding highlight doesn't overlap the element itself
  const padding = maxBindingGap(element, element.width, element.height, zoom);

  switch (element.type) {
    case "rectangle":
    case "text":
    case "image":
    case "iframe":
    case "embeddable":
    case "frame":
    case "magicframe":
      drawHighlightForRectWithRotation(context, element, padding);
      break;
    case "diamond":
      drawHighlightForDiamondWithRotation(context, padding, element);
      break;
    case "ellipse":
      context.lineWidth =
        maxBindingGap(element, element.width, element.height, zoom) -
        FIXED_BINDING_DISTANCE;

      strokeEllipseWithRotation(
        context,
        width + padding + FIXED_BINDING_DISTANCE,
        height + padding + FIXED_BINDING_DISTANCE,
        x1 + width / 2,
        y1 + height / 2,
        element.angle,
      );
      break;
  }
};

const renderBindingHighlightForSuggestedPointBinding = (
  context: CanvasRenderingContext2D,
  suggestedBinding: SuggestedPointBinding,
  elementsMap: ElementsMap,
  zoom: InteractiveCanvasAppState["zoom"],
) => {
  const [element, startOrEnd, bindableElement] = suggestedBinding;

  const threshold = maxBindingGap(
    bindableElement,
    bindableElement.width,
    bindableElement.height,
    zoom,
  );

  context.strokeStyle = "rgba(0,0,0,0)";
  context.fillStyle = "rgba(0,0,0,.05)";

  const pointIndices =
    startOrEnd === "both" ? [0, -1] : startOrEnd === "start" ? [0] : [-1];
  pointIndices.forEach((index) => {
    const [x, y] = LinearElementEditor.getPointAtIndexGlobalCoordinates(
      element,
      index,
      elementsMap,
    );
    fillCircle(context, x, y, threshold);
  });
};

type ElementSelectionBorder = {
  angle: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  selectionColors: string[];
  dashed?: boolean;
  cx: number;
  cy: number;
  activeEmbeddable: boolean;
  padding?: number;
};

const renderSelectionBorder = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elementProperties: ElementSelectionBorder,
) => {
  const {
    angle,
    x1,
    y1,
    x2,
    y2,
    selectionColors,
    cx,
    cy,
    dashed,
    activeEmbeddable,
  } = elementProperties;
  const elementWidth = x2 - x1;
  const elementHeight = y2 - y1;

  const padding =
    elementProperties.padding ?? DEFAULT_TRANSFORM_HANDLE_SPACING * 2;

  const linePadding = padding / appState.zoom.value;
  const lineWidth = 8 / appState.zoom.value;
  const spaceWidth = 4 / appState.zoom.value;

  context.save();
  context.translate(appState.scrollX, appState.scrollY);
  context.lineWidth = (activeEmbeddable ? 4 : 1) / appState.zoom.value;

  const count = selectionColors.length;
  for (let index = 0; index < count; ++index) {
    context.strokeStyle = selectionColors[index];
    if (dashed) {
      context.setLineDash([
        lineWidth,
        spaceWidth + (lineWidth + spaceWidth) * (count - 1),
      ]);
    }
    context.lineDashOffset = (lineWidth + spaceWidth) * index;
    strokeRectWithRotation(
      context,
      x1 - linePadding,
      y1 - linePadding,
      elementWidth + linePadding * 2,
      elementHeight + linePadding * 2,
      cx,
      cy,
      angle,
    );
  }
  context.restore();
};

const renderBindingHighlight = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  suggestedBinding: SuggestedBinding,
  elementsMap: ElementsMap,
) => {
  const renderHighlight = Array.isArray(suggestedBinding)
    ? renderBindingHighlightForSuggestedPointBinding
    : renderBindingHighlightForBindableElement;

  context.save();
  context.translate(appState.scrollX, appState.scrollY);
  renderHighlight(context, suggestedBinding as any, elementsMap, appState.zoom);

  context.restore();
};

const renderFrameHighlight = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  frame: NonDeleted<ExcalidrawFrameLikeElement>,
  elementsMap: ElementsMap,
) => {
  const [x1, y1, x2, y2] = getElementAbsoluteCoords(frame, elementsMap);
  const width = x2 - x1;
  const height = y2 - y1;

  context.strokeStyle = "rgb(0,118,255)";
  context.lineWidth = FRAME_STYLE.strokeWidth / appState.zoom.value;

  context.save();
  context.translate(appState.scrollX, appState.scrollY);
  strokeRectWithRotation(
    context,
    x1,
    y1,
    width,
    height,
    x1 + width / 2,
    y1 + height / 2,
    frame.angle,
    false,
    FRAME_STYLE.radius / appState.zoom.value,
  );
  context.restore();
};

const renderElementsBoxHighlight = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elements: NonDeleted<ExcalidrawElement>[],
) => {
  const individualElements = elements.filter(
    (element) => element.groupIds.length === 0,
  );

  const elementsInGroups = elements.filter(
    (element) => element.groupIds.length > 0,
  );

  const getSelectionFromElements = (elements: ExcalidrawElement[]) => {
    const [x1, y1, x2, y2] = getCommonBounds(elements);
    return {
      angle: 0,
      x1,
      x2,
      y1,
      y2,
      selectionColors: ["rgb(0,118,255)"],
      dashed: false,
      cx: x1 + (x2 - x1) / 2,
      cy: y1 + (y2 - y1) / 2,
      activeEmbeddable: false,
    };
  };

  const getSelectionForGroupId = (groupId: GroupId) => {
    const groupElements = getElementsInGroup(elements, groupId);
    return getSelectionFromElements(groupElements);
  };

  Object.entries(selectGroupsFromGivenElements(elementsInGroups, appState))
    .filter(([id, isSelected]) => isSelected)
    .map(([id, isSelected]) => id)
    .map((groupId) => getSelectionForGroupId(groupId))
    .concat(
      individualElements.map((element) => getSelectionFromElements([element])),
    )
    .forEach((selection) =>
      renderSelectionBorder(context, appState, selection),
    );
};

const renderLinearPointHandles = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  element: NonDeleted<ExcalidrawLinearElement>,
  elementsMap: RenderableElementsMap,
) => {
  if (!appState.selectedLinearElement) {
    return;
  }
  context.save();
  context.translate(appState.scrollX, appState.scrollY);
  context.lineWidth = 1 / appState.zoom.value;
  const points: GlobalPoint[] = LinearElementEditor.getPointsGlobalCoordinates(
    element,
    elementsMap,
  );

  const { POINT_HANDLE_SIZE } = LinearElementEditor;
  const radius = appState.editingLinearElement
    ? POINT_HANDLE_SIZE
    : POINT_HANDLE_SIZE / 2;
  points.forEach((point, idx) => {
    if (isElbowArrow(element) && idx !== 0 && idx !== points.length - 1) {
      return;
    }

    const isSelected =
      !!appState.editingLinearElement?.selectedPointsIndices?.includes(idx);

    renderSingleLinearPoint(context, appState, point, radius, isSelected);
  });

  // Rendering segment mid points
  if (isElbowArrow(element)) {
    const fixedSegments =
      element.fixedSegments?.map((segment) => segment.index) || [];
    points.slice(0, -1).forEach((p, idx) => {
      if (
        !LinearElementEditor.isSegmentTooShort(
          element,
          points[idx + 1],
          points[idx],
          idx,
          appState.zoom,
        )
      ) {
        renderSingleLinearPoint(
          context,
          appState,
          pointFrom<GlobalPoint>(
            (p[0] + points[idx + 1][0]) / 2,
            (p[1] + points[idx + 1][1]) / 2,
          ),
          POINT_HANDLE_SIZE / 2,
          false,
          !fixedSegments.includes(idx + 1),
        );
      }
    });
  } else {
    const midPoints = LinearElementEditor.getEditorMidPoints(
      element,
      elementsMap,
      appState,
    ).filter(
      (midPoint, idx, midPoints): midPoint is GlobalPoint =>
        midPoint !== null &&
        !(isElbowArrow(element) && (idx === 0 || idx === midPoints.length - 1)),
    );

    midPoints.forEach((segmentMidPoint) => {
      if (appState.editingLinearElement || points.length === 2) {
        renderSingleLinearPoint(
          context,
          appState,
          segmentMidPoint,
          POINT_HANDLE_SIZE / 2,
          false,
          true,
        );
      }
    });
  }

  context.restore();
};

const renderTransformHandles = (
  context: CanvasRenderingContext2D,
  renderConfig: InteractiveCanvasRenderConfig,
  appState: InteractiveCanvasAppState,
  transformHandles: TransformHandles,
  angle: number,
): void => {
  Object.keys(transformHandles).forEach((key) => {
    const transformHandle = transformHandles[key as TransformHandleType];
    if (transformHandle !== undefined) {
      const [x, y, width, height] = transformHandle;

      context.save();
      context.lineWidth = 1 / appState.zoom.value;
      if (renderConfig.selectionColor) {
        context.strokeStyle = renderConfig.selectionColor;
      }
      if (key === "rotation") {
        fillCircle(context, x + width / 2, y + height / 2, width / 2);
        // prefer round corners if roundRect API is available
      } else if (context.roundRect) {
        context.beginPath();
        context.roundRect(x, y, width, height, 2 / appState.zoom.value);
        context.fill();
        context.stroke();
      } else {
        strokeRectWithRotation(
          context,
          x,
          y,
          width,
          height,
          x + width / 2,
          y + height / 2,
          angle,
          true, // fill before stroke
        );
      }
      context.restore();
    }
  });
};

const renderCropHandles = (
  context: CanvasRenderingContext2D,
  renderConfig: InteractiveCanvasRenderConfig,
  appState: InteractiveCanvasAppState,
  croppingElement: ExcalidrawImageElement,
  elementsMap: ElementsMap,
): void => {
  const [x1, y1, , , cx, cy] = getElementAbsoluteCoords(
    croppingElement,
    elementsMap,
  );

  const LINE_WIDTH = 3;
  const LINE_LENGTH = 20;

  const ZOOMED_LINE_WIDTH = LINE_WIDTH / appState.zoom.value;
  const ZOOMED_HALF_LINE_WIDTH = ZOOMED_LINE_WIDTH / 2;

  const HALF_WIDTH = cx - x1 + ZOOMED_LINE_WIDTH;
  const HALF_HEIGHT = cy - y1 + ZOOMED_LINE_WIDTH;

  const HORIZONTAL_LINE_LENGTH = Math.min(
    LINE_LENGTH / appState.zoom.value,
    HALF_WIDTH,
  );
  const VERTICAL_LINE_LENGTH = Math.min(
    LINE_LENGTH / appState.zoom.value,
    HALF_HEIGHT,
  );

  context.save();
  context.fillStyle = renderConfig.selectionColor;
  context.strokeStyle = renderConfig.selectionColor;
  context.lineWidth = ZOOMED_LINE_WIDTH;

  const handles: Array<
    [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ]
  > = [
    [
      // x, y
      [-HALF_WIDTH, -HALF_HEIGHT],
      // horizontal line: first start and to
      [0, ZOOMED_HALF_LINE_WIDTH],
      [HORIZONTAL_LINE_LENGTH, ZOOMED_HALF_LINE_WIDTH],
      // vertical line: second  start and to
      [ZOOMED_HALF_LINE_WIDTH, 0],
      [ZOOMED_HALF_LINE_WIDTH, VERTICAL_LINE_LENGTH],
    ],
    [
      [HALF_WIDTH - ZOOMED_HALF_LINE_WIDTH, -HALF_HEIGHT],
      [ZOOMED_HALF_LINE_WIDTH, ZOOMED_HALF_LINE_WIDTH],
      [
        -HORIZONTAL_LINE_LENGTH + ZOOMED_HALF_LINE_WIDTH,
        ZOOMED_HALF_LINE_WIDTH,
      ],
      [0, 0],
      [0, VERTICAL_LINE_LENGTH],
    ],
    [
      [-HALF_WIDTH, HALF_HEIGHT],
      [0, -ZOOMED_HALF_LINE_WIDTH],
      [HORIZONTAL_LINE_LENGTH, -ZOOMED_HALF_LINE_WIDTH],
      [ZOOMED_HALF_LINE_WIDTH, 0],
      [ZOOMED_HALF_LINE_WIDTH, -VERTICAL_LINE_LENGTH],
    ],
    [
      [HALF_WIDTH - ZOOMED_HALF_LINE_WIDTH, HALF_HEIGHT],
      [ZOOMED_HALF_LINE_WIDTH, -ZOOMED_HALF_LINE_WIDTH],
      [
        -HORIZONTAL_LINE_LENGTH + ZOOMED_HALF_LINE_WIDTH,
        -ZOOMED_HALF_LINE_WIDTH,
      ],
      [0, 0],
      [0, -VERTICAL_LINE_LENGTH],
    ],
  ];

  handles.forEach((handle) => {
    const [[x, y], [x1s, y1s], [x1t, y1t], [x2s, y2s], [x2t, y2t]] = handle;

    context.save();
    context.translate(cx, cy);
    context.rotate(croppingElement.angle);

    context.beginPath();
    context.moveTo(x + x1s, y + y1s);
    context.lineTo(x + x1t, y + y1t);
    context.stroke();

    context.beginPath();
    context.moveTo(x + x2s, y + y2s);
    context.lineTo(x + x2t, y + y2t);
    context.stroke();
    context.restore();
  });

  context.restore();
};

const renderTextBox = (
  text: NonDeleted<ExcalidrawTextElement>,
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  selectionColor: InteractiveCanvasRenderConfig["selectionColor"],
) => {
  context.save();
  const padding = (DEFAULT_TRANSFORM_HANDLE_SPACING * 2) / appState.zoom.value;
  const width = text.width + padding * 2;
  const height = text.height + padding * 2;
  const cx = text.x + width / 2;
  const cy = text.y + height / 2;
  const shiftX = -(width / 2 + padding);
  const shiftY = -(height / 2 + padding);
  context.translate(cx + appState.scrollX, cy + appState.scrollY);
  context.rotate(text.angle);
  context.lineWidth = 1 / appState.zoom.value;
  context.strokeStyle = selectionColor;
  context.strokeRect(shiftX, shiftY, width, height);
  context.restore();
};

// Metric conversion constants (to centimeters)
const METRIC_CONVERSIONS = {
  mm: 0.1,    // 1 mm = 0.1 cm
  cm: 1,      // 1 cm = 1 cm
  m: 100,     // 1 m = 100 cm
} as const;

type MetricUnit = keyof typeof METRIC_CONVERSIONS;

// Convert from cm (internal storage) to any metric for display
const convertFromCm = (valueCm: number, metric: MetricUnit): number => {
  return valueCm / METRIC_CONVERSIONS[metric];
};

const renderRulerDistances = (
  context: CanvasRenderingContext2D,
  appState: InteractiveCanvasAppState,
  elementsMap: ElementsMap,
) => {
  const elements = Array.from(elementsMap.values());
  
  // Get selected metric from app state, default to cm
  const selectedMetric = (appState as any).selectedMetric || "cm";
  
  elements.forEach((element) => {
    // Show distance only for lines created by the ruler tool
    if (
      isLinearElement(element) &&
      element.points.length >= 2 &&
      element.type === "line" && // Only show for line elements, not arrows
      element.customData?.tool === "ruler" // Only show for ruler-created lines
    ) {
      const points = LinearElementEditor.getPointsGlobalCoordinates(
        element,
        elementsMap,
      );
      
      if (points.length >= 2) {
        // Calculate cumulative distance for multi-point lines
        let totalDistancePx = 0;
        const segmentDistances: number[] = [];
        
        for (let i = 0; i < points.length - 1; i++) {
          const segmentDistance = pointDistance(points[i], points[i + 1]);
          segmentDistances.push(segmentDistance);
          totalDistancePx += segmentDistance;
        }
        
        // Convert pixels to centimeters using the ratio from AppState
        const cmPerPx = appState.cmPerPx ?? 1;
        const totalDistanceCm = totalDistancePx * cmPerPx;
        
        // Convert to selected metric for display
        const totalDistanceInMetric = convertFromCm(totalDistanceCm, selectedMetric);
        const precision = selectedMetric === 'mm' ? 1 : 2;
        const distanceText = `${parseFloat(totalDistanceInMetric.toFixed(precision))} ${selectedMetric}`;
        
        // Center the distance box aligned with the ruler line direction
        const lastPoint = points[points.length - 1];
        let textX: number, textY: number;
        let linkStartX: number, linkStartY: number;
        
        if (points.length === 2) {
          // For 2-point lines, position the box along the line direction from the end point
          const dx = points[1][0] - points[0][0];
          const dy = points[1][1] - points[0][1];
          
          // Normalize the line direction vector
          const lineLength = Math.sqrt(dx * dx + dy * dy);
          const normalizedDx = lineLength > 0 ? dx / lineLength : 0;
          const normalizedDy = lineLength > 0 ? dy / lineLength : 0;
          const offsetDistance = 50;
          
          // Position the text box along the line direction beyond the end point
          textX = lastPoint[0] + normalizedDx * offsetDistance;
          textY = lastPoint[1] + normalizedDy * offsetDistance;
          
          // Link connects from the end point to the text box
          linkStartX = lastPoint[0];
          linkStartY = lastPoint[1];
        } else {
          // For multi-point lines, position the box along the last segment direction
          const secondLastPoint = points[points.length - 2];
          
          const dx = lastPoint[0] - secondLastPoint[0];
          const dy = lastPoint[1] - secondLastPoint[1];
          
          // Normalize the line direction vector
          const lineLength = Math.sqrt(dx * dx + dy * dy);
          const normalizedDx = lineLength > 0 ? dx / lineLength : 0;
          const normalizedDy = lineLength > 0 ? dy / lineLength : 0;
          const offsetDistance = 50;
          
          // Position the text box along the line direction beyond the last point
          textX = lastPoint[0] + normalizedDx * offsetDistance;
          textY = lastPoint[1] + normalizedDy * offsetDistance;
          
          // Link connects from the last point to the text box
          linkStartX = lastPoint[0];
          linkStartY = lastPoint[1];
        }
        
        context.save();
        context.translate(appState.scrollX, appState.scrollY);
        
        // Set text style
        context.font = getFontString({
          fontFamily: 1, // Default font family
          fontSize: 12,
        });
        context.textAlign = "center";
        context.textBaseline = "middle";
        
        // Add background for better readability
        const textMetrics = context.measureText(distanceText);
        const padding = 2;
        const bgWidth = textMetrics.width + padding * 2;
        const bgHeight = 16;
        
        // Calculate the intersection point on the box border
        const dx = textX - linkStartX;
        const dy = textY - linkStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const normalizedDx = dx / distance;
          const normalizedDy = dy / distance;
          
          // Calculate intersection with box border
          const halfWidth = bgWidth / 2;
          const halfHeight = bgHeight / 2;
          
          // Find which edge the line intersects
          const tx = Math.abs(normalizedDx) > 0 ? halfWidth / Math.abs(normalizedDx) : Infinity;
          const ty = Math.abs(normalizedDy) > 0 ? halfHeight / Math.abs(normalizedDy) : Infinity;
          const t = Math.min(tx, ty);
          
          // Calculate the intersection point on the box border
          const linkEndX = textX - normalizedDx * t;
          const linkEndY = textY - normalizedDy * t;
          
          // Draw connecting link from end point to box border
          context.strokeStyle = "rgba(0, 0, 0, 0.4)";
          context.lineWidth = 1;
          context.setLineDash([2, 2]);
          context.beginPath();
          context.moveTo(linkStartX, linkStartY);
          context.lineTo(linkEndX, linkEndY);
          context.stroke();
          context.setLineDash([]);
        }
        
        // Semi-transparent white background
        context.fillStyle = "rgba(255, 255, 255, 0.9)";
        context.fillRect(
          textX - bgWidth / 2,
          textY - bgHeight / 2,
          bgWidth,
          bgHeight
        );
        
        // Black border for better visibility
        context.strokeStyle = "rgba(0, 0, 0, 0.3)";
        context.lineWidth = 1;
        context.strokeRect(
          textX - bgWidth / 2,
          textY - bgHeight / 2,
          bgWidth,
          bgHeight
        );
        
        // Draw text in element color or black for better contrast
        context.fillStyle = "#000000";
        context.fillText(distanceText, textX, textY);
        
        context.restore();
      }
    }
  });
};

const _renderInteractiveScene = ({
  canvas,
  elementsMap,
  visibleElements,
  selectedElements,
  allElementsMap,
  scale,
  appState,
  renderConfig,
  device,
}: InteractiveSceneRenderConfig) => {
  if (canvas === null) {
    return { atLeastOneVisibleElement: false, elementsMap };
  }

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
  });

  // Apply zoom
  context.save();
  context.scale(appState.zoom.value, appState.zoom.value);

  let editingLinearElement: NonDeleted<ExcalidrawLinearElement> | undefined =
    undefined;

  visibleElements.forEach((element) => {
    // Getting the element using LinearElementEditor during collab mismatches version - being one head of visible elements due to
    // ShapeCache returns empty hence making sure that we get the
    // correct element from visible elements
    if (appState.editingLinearElement?.elementId === element.id) {
      if (element) {
        editingLinearElement = element as NonDeleted<ExcalidrawLinearElement>;
      }
    }
  });

  if (editingLinearElement) {
    renderLinearPointHandles(
      context,
      appState,
      editingLinearElement,
      elementsMap,
    );
  }

  // Paint selection element
  if (appState.selectionElement && !appState.isCropping) {
    try {
      renderSelectionElement(
        appState.selectionElement,
        context,
        appState,
        renderConfig.selectionColor,
      );
    } catch (error: any) {
      console.error(error);
    }
  }

  if (
    appState.editingTextElement &&
    isTextElement(appState.editingTextElement)
  ) {
    const textElement = allElementsMap.get(appState.editingTextElement.id) as
      | ExcalidrawTextElement
      | undefined;
    if (textElement && !textElement.autoResize) {
      renderTextBox(
        textElement,
        context,
        appState,
        renderConfig.selectionColor,
      );
    }
  }

  if (appState.isBindingEnabled) {
    appState.suggestedBindings
      .filter((binding) => binding != null)
      .forEach((suggestedBinding) => {
        renderBindingHighlight(
          context,
          appState,
          suggestedBinding!,
          elementsMap,
        );
      });
  }

  if (appState.frameToHighlight) {
    renderFrameHighlight(
      context,
      appState,
      appState.frameToHighlight,
      elementsMap,
    );
  }

  if (appState.elementsToHighlight) {
    renderElementsBoxHighlight(context, appState, appState.elementsToHighlight);
  }

  // Render ruler distances
  renderRulerDistances(context, appState, elementsMap);

  const isFrameSelected = selectedElements.some((element) =>
    isFrameLikeElement(element),
  );

  // Getting the element using LinearElementEditor during collab mismatches version - being one head of visible elements due to
  // ShapeCache returns empty hence making sure that we get the
  // correct element from visible elements
  if (
    selectedElements.length === 1 &&
    appState.editingLinearElement?.elementId === selectedElements[0].id
  ) {
    renderLinearPointHandles(
      context,
      appState,
      selectedElements[0] as NonDeleted<ExcalidrawLinearElement>,
      elementsMap,
    );
  }

  // Arrows have a different highlight behavior when
  // they are the only selected element
  if (appState.selectedLinearElement) {
    const editor = appState.selectedLinearElement;
    const firstSelectedLinear = selectedElements.find(
      (el) => el.id === editor.elementId, // Don't forget bound text elements!
    );

    if (editor.segmentMidPointHoveredCoords) {
      renderElbowArrowMidPointHighlight(context, appState);
    } else if (
      isElbowArrow(firstSelectedLinear)
        ? editor.hoverPointIndex === 0 ||
          editor.hoverPointIndex === firstSelectedLinear.points.length - 1
        : editor.hoverPointIndex >= 0
    ) {
      renderLinearElementPointHighlight(context, appState, elementsMap);
    }
  }

  // Paint selected elements
  if (!appState.multiElement && !appState.editingLinearElement) {
    const showBoundingBox = shouldShowBoundingBox(selectedElements, appState);

    const isSingleLinearElementSelected =
      selectedElements.length === 1 && isLinearElement(selectedElements[0]);
    // render selected linear element points
    if (
      isSingleLinearElementSelected &&
      appState.selectedLinearElement?.elementId === selectedElements[0].id &&
      !selectedElements[0].locked
    ) {
      renderLinearPointHandles(
        context,
        appState,
        selectedElements[0] as ExcalidrawLinearElement,
        elementsMap,
      );
    }
    const selectionColor = renderConfig.selectionColor || oc.black;

    if (showBoundingBox) {
      // Optimisation for finding quickly relevant element ids
      const locallySelectedIds = arrayToMap(selectedElements);

      const selections: ElementSelectionBorder[] = [];

      for (const element of elementsMap.values()) {
        const selectionColors = [];
        const remoteClients = renderConfig.remoteSelectedElementIds.get(
          element.id,
        );
        if (
          !(
            // Elbow arrow elements cannot be selected when bound on either end
            (
              isSingleLinearElementSelected &&
              isElbowArrow(element) &&
              (element.startBinding || element.endBinding)
            )
          )
        ) {
          // local user
          if (
            locallySelectedIds.has(element.id) &&
            !isSelectedViaGroup(appState, element)
          ) {
            selectionColors.push(selectionColor);
          }
          // remote users
          if (remoteClients) {
            selectionColors.push(
              ...remoteClients.map((socketId) => {
                const background = getClientColor(
                  socketId,
                  appState.collaborators.get(socketId),
                );
                return background;
              }),
            );
          }
        }

        if (selectionColors.length) {
          const [x1, y1, x2, y2, cx, cy] = getElementAbsoluteCoords(
            element,
            elementsMap,
            true,
          );
          selections.push({
            angle: element.angle,
            x1,
            y1,
            x2,
            y2,
            selectionColors,
            dashed: !!remoteClients,
            cx,
            cy,
            activeEmbeddable:
              appState.activeEmbeddable?.element === element &&
              appState.activeEmbeddable.state === "active",
            padding:
              element.id === appState.croppingElementId ||
              isImageElement(element)
                ? 0
                : undefined,
          });
        }
      }

      const addSelectionForGroupId = (groupId: GroupId) => {
        const groupElements = getElementsInGroup(elementsMap, groupId);
        const [x1, y1, x2, y2] = getCommonBounds(groupElements);
        selections.push({
          angle: 0,
          x1,
          x2,
          y1,
          y2,
          selectionColors: [oc.black],
          dashed: true,
          cx: x1 + (x2 - x1) / 2,
          cy: y1 + (y2 - y1) / 2,
          activeEmbeddable: false,
        });
      };

      for (const groupId of getSelectedGroupIds(appState)) {
        // TODO: support multiplayer selected group IDs
        addSelectionForGroupId(groupId);
      }

      if (appState.editingGroupId) {
        addSelectionForGroupId(appState.editingGroupId);
      }

      selections.forEach((selection) =>
        renderSelectionBorder(context, appState, selection),
      );
    }
    // Paint resize transformHandles
    context.save();
    context.translate(appState.scrollX, appState.scrollY);

    if (selectedElements.length === 1) {
      context.fillStyle = oc.white;
      const transformHandles = getTransformHandles(
        selectedElements[0],
        appState.zoom,
        elementsMap,
        "mouse", // when we render we don't know which pointer type so use mouse,
        getOmitSidesForDevice(device),
      );
      if (
        !appState.viewModeEnabled &&
        showBoundingBox &&
        // do not show transform handles when text is being edited
        !isTextElement(appState.editingTextElement) &&
        // do not show transform handles when image is being cropped
        !appState.croppingElementId
      ) {
        renderTransformHandles(
          context,
          renderConfig,
          appState,
          transformHandles,
          selectedElements[0].angle,
        );
      }

      if (appState.croppingElementId && !appState.isCropping) {
        const croppingElement = elementsMap.get(appState.croppingElementId);

        if (croppingElement && isImageElement(croppingElement)) {
          renderCropHandles(
            context,
            renderConfig,
            appState,
            croppingElement,
            elementsMap,
          );
        }
      }
    } else if (selectedElements.length > 1 && !appState.isRotating) {
      const dashedLinePadding =
        (DEFAULT_TRANSFORM_HANDLE_SPACING * 2) / appState.zoom.value;
      context.fillStyle = oc.white;
      const [x1, y1, x2, y2] = getCommonBounds(selectedElements, elementsMap);
      const initialLineDash = context.getLineDash();
      context.setLineDash([2 / appState.zoom.value]);
      const lineWidth = context.lineWidth;
      context.lineWidth = 1 / appState.zoom.value;
      context.strokeStyle = selectionColor;
      strokeRectWithRotation(
        context,
        x1 - dashedLinePadding,
        y1 - dashedLinePadding,
        x2 - x1 + dashedLinePadding * 2,
        y2 - y1 + dashedLinePadding * 2,
        (x1 + x2) / 2,
        (y1 + y2) / 2,
        0,
      );
      context.lineWidth = lineWidth;
      context.setLineDash(initialLineDash);
      const transformHandles = getTransformHandlesFromCoords(
        [x1, y1, x2, y2, (x1 + x2) / 2, (y1 + y2) / 2],
        0 as Radians,
        appState.zoom,
        "mouse",
        isFrameSelected
          ? { ...getOmitSidesForDevice(device), rotation: true }
          : getOmitSidesForDevice(device),
      );
      if (selectedElements.some((element) => !element.locked)) {
        renderTransformHandles(
          context,
          renderConfig,
          appState,
          transformHandles,
          0,
        );
      }
    }
    context.restore();
  }

  appState.searchMatches?.matches.forEach(({ id, focus, matchedLines }) => {
    const element = elementsMap.get(id);

    if (element) {
      const [elementX1, elementY1, , , cx, cy] = getElementAbsoluteCoords(
        element,
        elementsMap,
        true,
      );

      context.save();
      if (appState.theme === THEME.LIGHT) {
        if (focus) {
          context.fillStyle = "rgba(255, 124, 0, 0.4)";
        } else {
          context.fillStyle = "rgba(255, 226, 0, 0.4)";
        }
      } else if (focus) {
        context.fillStyle = "rgba(229, 82, 0, 0.4)";
      } else {
        context.fillStyle = "rgba(99, 52, 0, 0.4)";
      }

      const zoomFactor = isFrameLikeElement(element) ? appState.zoom.value : 1;

      context.translate(appState.scrollX, appState.scrollY);
      context.translate(cx, cy);
      context.rotate(element.angle);

      matchedLines.forEach((matchedLine) => {
        (matchedLine.showOnCanvas || focus) &&
          context.fillRect(
            elementX1 + matchedLine.offsetX / zoomFactor - cx,
            elementY1 + matchedLine.offsetY / zoomFactor - cy,
            matchedLine.width / zoomFactor,
            matchedLine.height / zoomFactor,
          );
      });

      context.restore();
    }
  });

  renderSnaps(context, appState);

  context.restore();

  renderRemoteCursors({
    context,
    renderConfig,
    appState,
    normalizedWidth,
    normalizedHeight,
  });

  // Paint scrollbars
  let scrollBars;
  if (renderConfig.renderScrollbars) {
    scrollBars = getScrollBars(
      elementsMap,
      normalizedWidth,
      normalizedHeight,
      appState,
    );

    context.save();
    context.fillStyle = SCROLLBAR_COLOR;
    context.strokeStyle = "rgba(255,255,255,0.8)";
    [scrollBars.horizontal, scrollBars.vertical].forEach((scrollBar) => {
      if (scrollBar) {
        roundRect(
          context,
          scrollBar.x,
          scrollBar.y,
          scrollBar.width,
          scrollBar.height,
          SCROLLBAR_WIDTH / 2,
        );
      }
    });
    context.restore();
  }

  return {
    scrollBars,
    atLeastOneVisibleElement: visibleElements.length > 0,
    elementsMap,
  };
};

/** throttled to animation framerate */
export const renderInteractiveSceneThrottled = throttleRAF(
  (config: InteractiveSceneRenderConfig) => {
    const ret = _renderInteractiveScene(config);
    config.callback?.(ret);
  },
  { trailing: true },
);

/**
 * Interactive scene is the ui-canvas where we render bounding boxes, selections
 * and other ui stuff.
 */
export const renderInteractiveScene = <
  U extends typeof _renderInteractiveScene,
  T extends boolean = false,
>(
  renderConfig: InteractiveSceneRenderConfig,
  throttle?: T,
): T extends true ? void : ReturnType<U> => {
  if (throttle) {
    renderInteractiveSceneThrottled(renderConfig);
    return undefined as T extends true ? void : ReturnType<U>;
  }
  const ret = _renderInteractiveScene(renderConfig);
  renderConfig.callback(ret);
  return ret as T extends true ? void : ReturnType<U>;
};
