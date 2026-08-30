import type { ExcalidrawElement, ExcalidrawTextBubbleElement } from "./types";

/**
 * The dashed "tail" of a text bubble is not part of the element shape: it is
 * a leader line from the anchor point to the bubble's AABB border, drawn by
 * the static scene renderer (and SVG export) underneath the bubble body.
 *
 * Ray from bubble centre toward the anchor, clipped to the (unrotated)
 * bounding-box border.
 */
export const getTextBubbleLeaderLine = (
  element: ExcalidrawTextBubbleElement,
): { start: { x: number; y: number }; end: { x: number; y: number } } => {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const dx = element.anchor.x - cx;
  const dy = element.anchor.y - cy;
  if (dx === 0 && dy === 0) {
    return {
      start: { x: element.anchor.x, y: element.anchor.y },
      end: { x: cx, y: cy },
    };
  }
  const tx = dx === 0 ? Infinity : element.width / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : element.height / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  return {
    start: { x: element.anchor.x, y: element.anchor.y },
    end: { x: cx + dx * t, y: cy + dy * t },
  };
};

/**
 * Where a PDF-attached bubble's geometry should sit for the PDF's current
 * rect, per the stored relative coordinates. Callers only consume `anchor`
 * (x/y follow the PDF through the regular drag/resize offsetting).
 */
export const getPdfRelativeGeometry = (
  element: ExcalidrawTextBubbleElement,
  pdf: ExcalidrawElement,
): { x: number; y: number; anchor: { x: number; y: number } } => {
  const x =
    element.relativePosition != null
      ? pdf.x + element.relativePosition.x * pdf.width
      : element.x;
  const y =
    element.relativePosition != null
      ? pdf.y + element.relativePosition.y * pdf.height
      : element.y;
  const anchor =
    element.relativeAnchor != null
      ? {
          x: pdf.x + element.relativeAnchor.x * pdf.width,
          y: pdf.y + element.relativeAnchor.y * pdf.height,
        }
      : element.anchor;
  return { x, y, anchor };
};

/** Hit test for the bubble's anchor handle (radius is threshold, scene px). */
export const hitTestTextBubbleAnchor = (
  element: ExcalidrawTextBubbleElement,
  point: { x: number; y: number },
  threshold: number,
): boolean => {
  const dx = point.x - element.anchor.x;
  const dy = point.y - element.anchor.y;
  return Math.hypot(dx, dy) <= threshold;
};
