import React from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";

export const actionDistanceConversion = register({
  name: "distanceConversion",
  trackEvent: false,
  label: t("labels.distanceConversion"),
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
  PanelComponent: ({ appState, updateData }) => {
    return (
      <fieldset>
        <legend>{t("labels.distanceConversion")}</legend>
        <label className="control-label" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          1&nbsp;px&nbsp;=
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
          &nbsp;cm
        </label>
      </fieldset>
    );
  },
}); 