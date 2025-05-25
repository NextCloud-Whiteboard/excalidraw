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
    // Activate custom ruler tool (behaves like line but tracked separately)
    app.setActiveTool({ type: "custom", customType: "ruler" });

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
        selected={
          appState.activeTool.type === "custom" &&
          appState.activeTool.customType === "ruler"
        }
        onClick={() => {
          updateData(null);
        }}
        data-testid="toolbar-ruler"
      />
    );
  },
}); 