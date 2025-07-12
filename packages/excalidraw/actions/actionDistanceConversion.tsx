import React, { useState } from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";
import { LinearElementEditor } from "@excalidraw/element";
import { pointDistance } from "@excalidraw/math";
import { isLinearElement } from "@excalidraw/element";

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

export const actionDistanceConversion = register({
  name: "distanceConversion",
  trackEvent: false,
  label: t("labels.setScale"),
  perform: (elements, appState, value) => {
    // value expected to be { cmPerPx: number }
    if (typeof value?.cmPerPx !== "number" || !isFinite(value.cmPerPx)) {
      return { elements, appState: { ...appState }, captureUpdate: CaptureUpdateAction.NEVER };
    }
    return {
      elements,
      appState: { ...appState, cmPerPx: value.cmPerPx },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, updateData, elements }) => {
    const [calibrationDistance, setCalibrationDistance] = useState("");
    
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
    
    // Calculate what the current scale shows for this ruler
    const currentShownDistance = rulerPixelDistance * appState.cmPerPx;
    
    // Update calibrationDistance when a new ruler is selected
    React.useEffect(() => {
      if (selectedRulerElement && currentShownDistance > 0) {
        setCalibrationDistance(parseFloat(currentShownDistance.toFixed(2)).toString());
      } else {
        setCalibrationDistance("");
      }
    }, [selectedRulerElement?.id, currentShownDistance]);
    
    const handleCalibration = () => {
      const desiredDistance = parseFloat(calibrationDistance);
      if (!isNaN(desiredDistance) && desiredDistance > 0 && rulerPixelDistance > 0) {
        // Calculate new cmPerPx: desired_cm = pixel_distance * cmPerPx
        // So: cmPerPx = desired_cm / pixel_distance
        const newCmPerPx = desiredDistance / rulerPixelDistance;
        updateData({ cmPerPx: newCmPerPx });
      }
    };

    return (
      <fieldset>
        <legend>{t("labels.setScale")}</legend>
        
        {/* Manual Scale Setting */}
        <label className="control-label" style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.75rem" }}>
          1&nbsp;cm&nbsp;=
          <input
            type="number"
            step="0.01"
            min="0"
            value={appState.cmPerPx}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!isNaN(value)) {
                updateData({ cmPerPx: value });
              }
            }}
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
          &nbsp;pixels
        </label>

        {/* Calibration Section */}
        <div style={{ 
          borderTop: "1px solid var(--input-border-color)", 
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
                {t("labels.calibrationCurrentDistance", { distance: parseFloat(currentShownDistance.toFixed(2)) })}
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flex: 1, minWidth: 0 }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={calibrationDistance}
                    onChange={(e) => setCalibrationDistance(e.target.value)}
                    style={{
                      width: "3rem",
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
                  &nbsp;cm
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