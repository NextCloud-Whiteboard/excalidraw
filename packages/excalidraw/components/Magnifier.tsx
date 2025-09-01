import React from "react";
import type { AppState } from "../types";

interface MagnifierProps {
  appState: AppState;
  canvas: HTMLCanvasElement | null;
  visibleElements: readonly any[];
  elementsMap: any;
}

export const Magnifier: React.FC<MagnifierProps> = ({ appState, canvas }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!canvasRef.current || !canvas || !appState.magnifier.position) {
      return;
    }

    const magnifierCanvas = canvasRef.current;
    const ctx = magnifierCanvas.getContext("2d");
    if (!ctx) return;

    const { position, zoom, size } = appState.magnifier;
    const pixelRatio = window.devicePixelRatio || 1;

    // Set canvas size
    magnifierCanvas.width = size * pixelRatio;
    magnifierCanvas.height = size * pixelRatio;
    magnifierCanvas.style.width = `${size}px`;
    magnifierCanvas.style.height = `${size}px`;

    // Clear canvas with background color
    ctx.fillStyle = appState.viewBackgroundColor;
    ctx.fillRect(0, 0, magnifierCanvas.width, magnifierCanvas.height);

    // Get the main canvas context
    const mainCtx = canvas.getContext("2d");
    if (!mainCtx) return;

    // Calculate source area on main canvas
    const sourceSize = size / zoom;
    const sourceX =
      (position.x - appState.offsetLeft) * pixelRatio -
      (sourceSize * pixelRatio) / 2;
    const sourceY =
      (position.y - appState.offsetTop) * pixelRatio -
      (sourceSize * pixelRatio) / 2;

    try {
      // Scale the context for the magnification
      ctx.scale(pixelRatio, pixelRatio);

      // Fill background
      ctx.fillStyle = appState.viewBackgroundColor;
      ctx.fillRect(0, 0, size, size);

      // Draw the magnified portion from the main canvas
      ctx.drawImage(
        canvas,
        Math.max(0, sourceX), // source x
        Math.max(0, sourceY), // source y
        sourceSize * pixelRatio, // source width
        sourceSize * pixelRatio, // source height
        0, // destination x
        0, // destination y
        size, // destination width
        size, // destination height
      );

      // Reset scale for masking
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      // Create circular mask
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
      ctx.fill();

      // Draw border
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, 2 * Math.PI);
      ctx.stroke();

      // Add inner highlight
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 3, 0, 2 * Math.PI);
      ctx.stroke();

      // Add direction line for ruler tool
      if (
        appState.activeTool.type === "custom" &&
        appState.activeTool.customType === "ruler" &&
        (appState.newElement || appState.multiElement)
      ) {
        const element = appState.newElement || appState.multiElement;

        // Calculate ruler line angle if we have points
        let angle = 0;
        if (element && "points" in element && element.points.length >= 2) {
          const points = element.points;
          const lastPoint = points[points.length - 1];
          const firstPoint = points[0];

          // Calculate angle from first point to last point (direction of drawing)
          const dx = lastPoint[0] - firstPoint[0];
          const dy = lastPoint[1] - firstPoint[1];
          angle = Math.atan2(dy, dx) + Math.PI; // Add PI to reverse direction
        }

        // Draw line from center to edge in ruler direction
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        const centerX = size / 2;
        const centerY = size / 2;
        const radius = size / 2 - 3; // Match the circle border (accounting for border width)

        // Line from center to edge
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
        );
        ctx.stroke();

        // Center dot
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    } catch (error) {
      console.warn("Failed to render magnifier content:", error);
      // Fallback: show a simple magnifier icon
      ctx.scale(pixelRatio, pixelRatio);
      ctx.fillStyle = "#f0f0f0";
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 10, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = "#666";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🔍", size / 2, size / 2 + 5);
    }
  }, [appState.magnifier, appState.viewBackgroundColor, canvas]);

  if (
    !appState.magnifier.position ||
    !(
      (appState.activeTool.type === "custom" &&
        appState.activeTool.customType === "magnifier") ||
      (appState.activeTool.type === "custom" &&
        appState.activeTool.customType === "ruler" &&
        (appState.newElement || appState.multiElement))
    )
  ) {
    return null;
  }

  const { position, size } = appState.magnifier;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        left: position.x - size / 2,
        top: position.y - size / 2,
        pointerEvents: "none",
        zIndex: 999,
        filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))",
      }}
    />
  );
};
