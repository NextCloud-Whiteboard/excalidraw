import { throttleRAF, getFontString } from "@excalidraw/common";

import { renderElement } from "@excalidraw/element";
import { LinearElementEditor } from "@excalidraw/element";
import { isLinearElement } from "@excalidraw/element";

import { rulerLabel } from "../ruler/calibration";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import type { NewElementSceneRenderConfig } from "../scene/types";

const _renderNewElementScene = ({
  canvas,
  rc,
  newElement,
  elementsMap,
  allElementsMap,
  scale,
  appState,
  renderConfig,
}: NewElementSceneRenderConfig) => {
  if (canvas) {
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

    if (newElement && newElement.type !== "selection") {
      renderElement(
        newElement,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
      );
      
      // Render real-time distance for ruler tool (only when magnifier is not showing)
      // When magnifier is visible, it already displays the distance
      if (
        isLinearElement(newElement) &&
        newElement.type === "line" &&
        newElement.customData?.tool === "ruler" &&
        newElement.points.length >= 2 &&
        !appState.magnifier?.position
      ) {
        renderRealTimeRulerDistance(context, newElement, appState, elementsMap);
      }
    } else {
      context.clearRect(0, 0, normalizedWidth, normalizedHeight);
    }
  }
};

const renderRealTimeRulerDistance = (
  context: CanvasRenderingContext2D,
  element: any,
  appState: any,
  elementsMap: any,
) => {
  const points = LinearElementEditor.getPointsGlobalCoordinates(
    element,
    elementsMap,
  );
  
  if (points.length >= 2) {
    // real length once its PDF (or the board) has a scale, else "?"
    const distanceText = rulerLabel(element, elementsMap, appState);
    
    // Center the distance box aligned with the ruler line direction
    const lastPoint = points[points.length - 1];
    let textX: number; let textY: number;
    let linkStartX: number; let linkStartY: number;
    
    const invZoom = 1 / appState.zoom.value;
    
    if (points.length === 2) {
      // For 2-point lines, position the box along the line direction from the end point
      const dx = points[1][0] - points[0][0];
      const dy = points[1][1] - points[0][1];
      
      // Normalize the line direction vector
      const lineLength = Math.sqrt(dx * dx + dy * dy);
      const normalizedDx = lineLength > 0 ? dx / lineLength : 0;
      const normalizedDy = lineLength > 0 ? dy / lineLength : 0;
      const offsetDistance = 50 * invZoom;
      
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
      const offsetDistance = 50 * invZoom;
      
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
    const baseFontSize = 14;
    context.font = getFontString({
      fontFamily: 1, // Default font family
      fontSize: baseFontSize * invZoom,
    });
    context.textAlign = "center";
    context.textBaseline = "middle";
    
    // Add background for better readability
    const textMetrics = context.measureText(distanceText);
    const padding = 3 * invZoom;
    const bgWidth = textMetrics.width + padding * 2;
    const bgHeight = 20 * invZoom;
    
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
      context.lineWidth = 1 * invZoom;
      context.setLineDash([2 * invZoom, 2 * invZoom]);
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
    context.lineWidth = 1 * invZoom;
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
};

export const renderNewElementSceneThrottled = throttleRAF(
  (config: NewElementSceneRenderConfig) => {
    _renderNewElementScene(config);
  },
  { trailing: true },
);

export const renderNewElementScene = (
  renderConfig: NewElementSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderNewElementSceneThrottled(renderConfig);
    return;
  }

  _renderNewElementScene(renderConfig);
};
