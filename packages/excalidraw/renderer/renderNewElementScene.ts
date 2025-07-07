import { throttleRAF, getFontString } from "@excalidraw/common";

import { renderElement } from "@excalidraw/element";
import { LinearElementEditor } from "@excalidraw/element";
import { isLinearElement } from "@excalidraw/element";
import { pointDistance } from "@excalidraw/math";

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
      
      // Render real-time distance for ruler tool
      if (
        isLinearElement(newElement) &&
        newElement.type === "line" &&
        newElement.customData?.tool === "ruler" &&
        newElement.points.length >= 2
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
    const distanceText = `${parseFloat(totalDistanceCm.toFixed(2))} cm`;
    
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
    
    // Semi-transparent white background with slight transparency for real-time display
    context.fillStyle = "rgba(255, 255, 255, 0.85)";
    context.fillRect(
      textX - bgWidth / 2,
      textY - bgHeight / 2,
      bgWidth,
      bgHeight
    );
    
    // Lighter border for real-time display
    context.strokeStyle = "rgba(0, 0, 0, 0.2)";
    context.lineWidth = 1;
    context.strokeRect(
      textX - bgWidth / 2,
      textY - bgHeight / 2,
      bgWidth,
      bgHeight
    );
    
    // Draw text in a semi-transparent color to indicate it's real-time
    context.fillStyle = "rgba(0, 0, 0, 0.8)";
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
