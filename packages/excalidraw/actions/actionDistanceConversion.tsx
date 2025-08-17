import React, { useState } from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";
import { LinearElementEditor } from "@excalidraw/element";
import { pointDistance } from "@excalidraw/math";
import { isLinearElement } from "@excalidraw/element";

// Metric conversion constants (to centimeters)
const METRIC_CONVERSIONS = {
  mm: 0.1,    // 1 mm = 0.1 cm
  cm: 1,      // 1 cm = 1 cm
  m: 100,     // 1 m = 100 cm
} as const;

type MetricUnit = keyof typeof METRIC_CONVERSIONS;

// Helper function to calculate pixel distance of a ruler element
const calculateRulerPixelDistance = (element: any, elementsMap: any) => {
  if (!isLinearElement(element) || 
      element.type !== "line" || 
      element.customData?.tool !== "ruler" ||
      element.points.length < 2) {
    return 0;
  }

  const points = LinearElementEditor.getPointsGlobalCoordinates(element, elementsMap);
  
  if (points.length < 2) return 0;

  // Calculate cumulative distance for multi-point lines
  let totalDistancePx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segmentDistance = pointDistance(points[i], points[i + 1]);
    totalDistancePx += segmentDistance;
  }
  
  return totalDistancePx;
};

// Convert from any metric to cm (for internal storage)
const convertToCm = (value: number, metric: MetricUnit): number => {
  return value * METRIC_CONVERSIONS[metric];
};

// Convert from cm (internal storage) to any metric for display
const convertFromCm = (valueCm: number, metric: MetricUnit): number => {
  return valueCm / METRIC_CONVERSIONS[metric];
};

export const actionDistanceConversion = register({
  name: "distanceConversion",
  trackEvent: false,
  label: t("labels.setScale"),
  perform: (elements, appState, value) => {
    // value expected to be { cmPerPx?: number, selectedMetric?: MetricUnit, pdfCalibration?: { pdfId: string, cmPerPx: number } }
    const updates: any = {};
    let nextElements = elements;
    
    // Handle per-PDF calibration if provided
    if (
      value?.pdfCalibration &&
      typeof value.pdfCalibration.cmPerPx === "number" &&
      isFinite(value.pdfCalibration.cmPerPx) &&
      typeof value.pdfCalibration.pdfId === "string"
    ) {
      const { pdfId, cmPerPx } = value.pdfCalibration;
      nextElements = elements.map((el: any) => {
        if (el.id === pdfId) {
          return {
            ...el,
            customData: {
              ...(el.customData || {}),
              pdfCmPerPx: cmPerPx,
            },
          };
        }
        return el;
      });
    }

    // Fallback/global scale update
    if (typeof value?.cmPerPx === "number" && isFinite(value.cmPerPx)) {
      updates.cmPerPx = value.cmPerPx;
    }
    
    if (value?.selectedMetric && ["mm", "cm", "m"].includes(value.selectedMetric)) {
      updates.selectedMetric = value.selectedMetric;
    }
    
    if (Object.keys(updates).length === 0 && nextElements === elements) {
      return { elements, appState: { ...appState }, captureUpdate: CaptureUpdateAction.NEVER };
    }
    
    return {
      elements: nextElements,
      appState: { ...appState, ...updates },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, updateData, elements }) => {
    const [calibrationDistance, setCalibrationDistance] = useState("");
    
    // Use selectedMetric from app state instead of local state
    const selectedMetric = appState.selectedMetric || "cm";
    
    // Find selected ruler elements
    const selectedRulerElements = elements.filter((element: any) => 
      element.type === "line" && 
      element.customData?.tool === "ruler" &&
      appState.selectedElementIds[element.id]
    );
    
    // Get the first selected ruler element for calibration
    const selectedRulerElement = selectedRulerElements[0];
    
    // Calculate pixel distance of selected ruler
    const elementsMap = new Map(elements.map((el: any) => [el.id, el]));
    const rulerPixelDistance = selectedRulerElement ? 
      calculateRulerPixelDistance(selectedRulerElement, elementsMap) : 0;
    
    // Determine the effective cmPerPx: prefer PDF-specific scale if the ruler is tied to a PDF
    const pdfParentId: string | undefined = selectedRulerElement?.customData?.pdfParentId;
    const pdfElement = pdfParentId ? (elementsMap.get(pdfParentId) as any) : null;
    const effectiveCmPerPx: number = (pdfElement?.customData?.pdfCmPerPx ?? appState.cmPerPx) ?? 1;
    
    // Calculate what the current scale shows for this ruler in the selected metric
    const currentShownDistanceCm = rulerPixelDistance * effectiveCmPerPx;
    const currentShownDistance = convertFromCm(currentShownDistanceCm, selectedMetric);
    
    // Update calibrationDistance when a new ruler is selected or metric changes
    React.useEffect(() => {
      if (selectedRulerElement && currentShownDistance > 0) {
        setCalibrationDistance(parseFloat(currentShownDistance.toFixed(selectedMetric === 'mm' ? 1 : 2)).toString());
      } else {
        setCalibrationDistance("");
      }
    }, [selectedRulerElement?.id, currentShownDistance, selectedMetric]);
    
    const handleCalibration = () => {
      const desiredDistance = parseFloat(calibrationDistance);
      if (!isNaN(desiredDistance) && desiredDistance > 0 && rulerPixelDistance > 0) {
        // Convert desired distance to cm, then calculate new cmPerPx
        const desiredDistanceCm = convertToCm(desiredDistance, selectedMetric);
        const newCmPerPx = desiredDistanceCm / rulerPixelDistance;
        
        // If ruler belongs to a PDF, update that PDF's calibration; otherwise update global
        if (pdfParentId) {
          updateData({ pdfCalibration: { pdfId: pdfParentId, cmPerPx: newCmPerPx } });
        } else {
          updateData({ cmPerPx: newCmPerPx });
        }
      }
    };

    // Calculate scale value in selected metric for manual scale setting (global only / UI disabled)
    const scaleInSelectedMetric = convertFromCm(appState.cmPerPx, selectedMetric);

    const handleManualScaleChange = (value: number) => {
      if (!isNaN(value)) {
        // Convert from selected metric to cm for storage
        const cmPerPx = convertToCm(value, selectedMetric);
        updateData({ cmPerPx });
      }
    };

    const handleMetricChange = (newMetric: MetricUnit) => {
      updateData({ selectedMetric: newMetric });
    };

    return (
      <fieldset>
        <legend>{t("labels.setScale")}</legend>
        
        {/* Metric Selection */}
        <div style={{ marginBottom: "1rem", paddingBottom: "0.75rem", }}>
          <div style={{ 
            fontSize: "0.75rem", 
            marginBottom: "0.5rem", 
            fontWeight: "600",
            color: "var(--text-primary-color)"
          }}>
            Measurement Unit
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            {(Object.keys(METRIC_CONVERSIONS) as MetricUnit[]).map((metric) => (
              <label key={metric} style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "0.25rem", 
                cursor: "pointer",
                fontSize: "0.875rem"
              }}>
                <input
                  type="radio"
                  name="metric"
                  value={metric}
                  checked={selectedMetric === metric}
                  onChange={(e) => handleMetricChange(e.target.value as MetricUnit)}
                  style={{ margin: "0" }}
                />
                {metric}
              </label>
            ))}
          </div>
        </div>
        
        {/* Calibration Section */}
        <div style={{ 
          paddingTop: "0.75rem",
          marginTop: "0.5rem"
        }}>
          <div style={{ 
            fontSize: "0.75rem", 
            marginBottom: "0.5rem", 
            fontWeight: "600",
            color: "var(--text-primary-color)"
          }}>
            {t("labels.calibration")}
          </div>
          
          {/* Calibration Description */}
          <div style={{ 
            fontSize: "0.75rem", 
            marginBottom: "0.75rem",
            color: "var(--text-secondary-color)",
            lineHeight: "1.4",
            padding: "0.5rem",
            backgroundColor: "var(--input-bg-color)",
            border: "1px solid var(--input-border-color)",
            borderRadius: "0.25rem"
          }}>
            {t("labels.calibrationDescription")}
          </div>
          
          {selectedRulerElement ? (
            <>
              <div style={{ 
                fontSize: "0.75rem", 
                marginBottom: "0.5rem",
                color: "var(--text-secondary-color)"
              }}>
                Selected ruler measures {parseFloat(currentShownDistance.toFixed(selectedMetric === 'mm' ? 1 : 2))} {selectedMetric}
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flex: 1, minWidth: 0 }}>
                  <input
                    type="number"
                    step={selectedMetric === 'mm' ? "0.1" : "0.01"}
                    min="0"
                    value={calibrationDistance}
                    onChange={(e) => setCalibrationDistance(e.target.value)}
                    style={{
                      width: "4rem",
                      height: "1.5rem",
                      padding: "0.25rem 0.5rem",
                      fontSize: "0.875rem",
                      fontFamily: "inherit",
                      color: "var(--text-primary-color)",
                      backgroundColor: "var(--input-bg-color)",
                      border: "1px solid var(--input-border-color)",
                      borderRadius: "0.25rem",
                      outline: "none",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--color-brand-hover)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--input-border-color)";
                    }}
                  />
                  &nbsp;{selectedMetric}
                </div>
                
                <button
                  onClick={handleCalibration}
                  disabled={!calibrationDistance || parseFloat(calibrationDistance) <= 0}
                  style={{
                    padding: "0.25rem 0.75rem",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                    color: calibrationDistance && parseFloat(calibrationDistance) > 0 ? "var(--color-primary-contrast)" : "var(--text-secondary-color)",
                    backgroundColor: calibrationDistance && parseFloat(calibrationDistance) > 0 ? "var(--color-primary)" : "var(--input-bg-color)",
                    border: "1px solid var(--input-border-color)",
                    borderRadius: "0.25rem",
                    cursor: calibrationDistance && parseFloat(calibrationDistance) > 0 ? "pointer" : "not-allowed",
                    outline: "none",
                    height: "1.5rem",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (calibrationDistance && parseFloat(calibrationDistance) > 0) {
                      e.currentTarget.style.backgroundColor = "var(--color-primary-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (calibrationDistance && parseFloat(calibrationDistance) > 0) {
                      e.currentTarget.style.backgroundColor = "var(--color-primary)";
                    }
                  }}
                >
                  {t("labels.calibrationSetScale")}
                </button>
              </div>
            </>
          ) : (
            <div style={{ 
              fontSize: "0.75rem", 
              color: "var(--text-secondary-color)",
              fontStyle: "italic"
            }}>
              {t("labels.calibrationSelectRuler")}
            </div>
          )}
        </div>
      </fieldset>
    );
  },
}); 