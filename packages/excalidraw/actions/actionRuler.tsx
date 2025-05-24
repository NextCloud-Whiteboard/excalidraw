import React from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";
import type { AppClassProperties } from "../types";
import { ToolButton } from "../components/ToolButton";
import { RulerIcon } from "../components/icons";

export const actionRuler = register({
  name: "ruler",
  label: t("buttons.ruler"),
  trackEvent: { category: "toolbar" },
  icon: RulerIcon,
  perform: (elements, appState, value, app) => {
    // Activate the line tool for measuring distances
    app.setActiveTool({ type: "line" });
    
    return {
      elements,
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, app, updateData }) => {
    return (
      <ToolButton
        type="button"
        icon={RulerIcon}
        aria-label={t("buttons.ruler")}
        title={`${t("buttons.ruler")} — Draw lines to measure distances`}
        onClick={() => {
          updateData(null);
        }}
        data-testid="toolbar-ruler"
      />
    );
  },
}); 