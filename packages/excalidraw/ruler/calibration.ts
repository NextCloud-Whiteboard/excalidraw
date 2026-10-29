import { LinearElementEditor } from "@excalidraw/element";
import { pointDistance } from "@excalidraw/math";

import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawLinearElement,
} from "@excalidraw/element/types";

import type { AppState } from "../types";

export type MetricUnit = "mm" | "cm" | "m";

/** centimetres per unit */
export const CM_PER_UNIT: Record<MetricUnit, number> = {
  mm: 0.1,
  cm: 1,
  m: 100,
};

type ScaleState = Pick<AppState, "cmPerPx" | "cmPerPxCalibrated">;

export const isRulerLine = (
  el: ExcalidrawElement | null | undefined,
): el is ExcalidrawLinearElement =>
  !!el && el.type === "line" && el.customData?.tool === "ruler";

const isValidScale = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * The board-wide scale counts once someone set it. Older boards have no flag,
 * but a scale changed from the 1 cm/px default was set on purpose.
 */
export const isBoardCalibrated = (appState: ScaleState) =>
  !!appState.cmPerPxCalibrated ||
  (isValidScale(appState.cmPerPx) && appState.cmPerPx !== 1);

/** the PDF page a ruler line was drawn on, if any */
export const rulerPage = (
  line: ExcalidrawLinearElement,
  elementsMap: ElementsMap,
) => {
  const id = line.customData?.pdfParentId;
  const page = id ? elementsMap.get(id) : null;
  return page && !page.isDeleted && page.customData?.isPdf === true
    ? page
    : null;
};

/**
 * cm per px for a ruler line, or null when there is no real scale yet:
 * a line on a PDF uses only that PDF's calibration, any other line the
 * board's, never the 1 cm/px default.
 */
export const rulerScale = (
  line: ExcalidrawLinearElement,
  elementsMap: ElementsMap,
  appState: ScaleState,
): number | null => {
  if (line.customData?.pdfParentId) {
    const page = rulerPage(line, elementsMap);
    const scale = page?.customData?.pdfCmPerPx;
    return isValidScale(scale) ? scale : null;
  }
  return isBoardCalibrated(appState) ? appState.cmPerPx : null;
};

/**
 * Whether the scale side panel has anything real to show: a selected ruler
 * line with a scale, or (ruler tool, nothing selected) any scale on the board.
 */
export const showsScalePanel = (
  elements: readonly ExcalidrawElement[],
  selectedRulers: readonly ExcalidrawElement[],
  appState: ScaleState,
) => {
  const elementsMap = new Map(elements.map((el) => [el.id, el])) as ElementsMap;
  const rulers = selectedRulers.filter(isRulerLine);
  if (rulers.length) {
    return rulers.some((r) => rulerScale(r, elementsMap, appState) !== null);
  }
  return (
    isBoardCalibrated(appState) ||
    elements.some(
      (el) =>
        !el.isDeleted &&
        el.customData?.isPdf === true &&
        isValidScale(el.customData?.pdfCmPerPx),
    )
  );
};

/** total length of a ruler line in scene px (all its segments) */
export const rulerLengthPx = (
  line: ExcalidrawLinearElement,
  elementsMap?: ElementsMap,
) => {
  const points = elementsMap
    ? LinearElementEditor.getPointsGlobalCoordinates(line, elementsMap)
    : line.points;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += pointDistance(points[i - 1], points[i]);
  }
  return total;
};

export const formatLength = (cm: number, unit: MetricUnit) => {
  const value = cm / CM_PER_UNIT[unit];
  return `${parseFloat(value.toFixed(unit === "mm" ? 1 : 2))} ${unit}`;
};

/** the length a ruler line shows: real when calibrated, "?" otherwise */
export const rulerLabel = (
  line: ExcalidrawLinearElement,
  elementsMap: ElementsMap,
  appState: ScaleState & Pick<AppState, "selectedMetric">,
) => {
  const scale = rulerScale(line, elementsMap, appState);
  if (scale === null) {
    return "?";
  }
  return formatLength(
    rulerLengthPx(line, elementsMap) * scale,
    appState.selectedMetric || "cm",
  );
};

/** a typed length ("10", "2,5", " 3.25 ") as a positive number, else null */
export const parseLength = (text: string): number | null => {
  const value = Number(String(text).trim().replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
};
