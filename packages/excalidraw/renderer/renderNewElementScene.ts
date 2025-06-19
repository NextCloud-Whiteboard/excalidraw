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
    
    // For multi-point lines, show total distance at the end point
    // For 2-point lines, show at the midpoint
    let textX: number, textY: number;
    
    if (points.length === 2) {
      // Calculate midpoint for 2-point lines
      textX = (points[0][0] + points[1][0]) / 2;
      textY = (points[0][1] + points[1][1]) / 2;
      
      // Calculate line direction vector for offset
      const dx = points[1][0] - points[0][0];
      const dy = points[1][1] - points[0][1];
      
      // Calculate perpendicular vector (rotated 90 degrees)
      let perpX = -dy;
      let perpY = dx;
      
      // Ensure the perpendicular vector points "upward" (negative Y direction)
      if (perpY > 0) {
        perpX = -perpX;
        perpY = -perpY;
      }
      
      // Normalize and apply offset
      const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
      const normalizedPerpX = perpLength > 0 ? perpX / perpLength : 0;
      const normalizedPerpY = perpLength > 0 ? perpY / perpLength : 0;
      const offsetDistance = 15;
      
      textX += normalizedPerpX * offsetDistance;
      textY += normalizedPerpY * offsetDistance;
    } else {
      // For multi-point lines, position near the last point
      const lastPoint = points[points.length - 1];
      const secondLastPoint = points[points.length - 2];
      
      // Calculate direction from second-to-last to last point
      const dx = lastPoint[0] - secondLastPoint[0];
      const dy = lastPoint[1] - secondLastPoint[1];
      
      // Normalize direction
      const length = Math.sqrt(dx * dx + dy * dy);
      const normalizedDx = length > 0 ? dx / length : 0;
      const normalizedDy = length > 0 ? dy / length : 0;
      
      // Position text slightly beyond the last point
      const offsetDistance = 20;
      textX = lastPoint[0] + normalizedDx * offsetDistance;
      textY = lastPoint[1] + normalizedDy * offsetDistance;
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
    
    // Show individual segment distances for multi-point lines (lighter)
    if (points.length > 2) {
      for (let i = 0; i < points.length - 1; i++) {
        const segmentDistanceCm = segmentDistances[i] * cmPerPx;
        const segmentText = `${parseFloat(segmentDistanceCm.toFixed(1))}`;
        
        // Calculate midpoint of segment
        const segMidX = (points[i][0] + points[i + 1][0]) / 2;
        const segMidY = (points[i][1] + points[i + 1][1]) / 2;
        
        // Calculate perpendicular offset for segment label
        const segDx = points[i + 1][0] - points[i][0];
        const segDy = points[i + 1][1] - points[i][1];
        let segPerpX = -segDy;
        let segPerpY = segDx;
        
        if (segPerpY > 0) {
          segPerpX = -segPerpX;
          segPerpY = -segPerpY;
        }
        
        const segPerpLength = Math.sqrt(segPerpX * segPerpX + segPerpY * segPerpY);
        const segNormalizedPerpX = segPerpLength > 0 ? segPerpX / segPerpLength : 0;
        const segNormalizedPerpY = segPerpLength > 0 ? segPerpY / segPerpLength : 0;
        
        const segTextX = segMidX + segNormalizedPerpX * 12;
        const segTextY = segMidY + segNormalizedPerpY * 12;
        
        // Set smaller font for segment distances
        context.font = getFontString({
          fontFamily: 1,
          fontSize: 10,
        });
        context.fillStyle = "rgba(0, 0, 0, 0.5)";
        context.fillText(segmentText, segTextX, segTextY);
      }
    }
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
