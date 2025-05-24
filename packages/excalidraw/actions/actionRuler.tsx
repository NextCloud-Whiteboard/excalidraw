import React from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";
import type { AppClassProperties } from "../types";
import { ToolButton } from "../components/ToolButton";
import { PenModeIcon } from "../components/icons";

export const actionRuler = register({
  name: "ruler",
  label: t("buttons.ruler"),
  trackEvent: { category: "toolbar" },
  icon: PenModeIcon,
  perform: (elements, appState, value, app) => {
    alert("ruler");
    return {
      elements,
      appState,
      commitToHistory: false,
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, app, updateData }) => {
    return (
      <ToolButton
        type="button"
        icon={PenModeIcon}
        aria-label={t("buttons.ruler")}
        title={t("buttons.ruler")}
        onClick={() => {
          updateData(null);
        }}
      />
    );
  },
}); 