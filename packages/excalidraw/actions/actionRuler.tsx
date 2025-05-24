import React from "react";

import { updateActiveTool } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";
import { setCursorForShape } from "../cursor";

import { ToolButton } from "../components/ToolButton";
import { PenModeIcon } from "../components/icons";

import { register } from "./register";

export const actionRulerAction = register({
  name: "rulerAction",
  label: t("buttons.ruler"),
  trackEvent: { category: "toolbar" },
  icon: PenModeIcon,
  perform: (elements, appState, value, app) => {
    const nextActiveTool = updateActiveTool(appState, {
      type: "line",
    });

    setCursorForShape(app.interactiveCanvas, {
      ...appState,
      activeTool: nextActiveTool,
    });

    return {
      elements,
      appState: {
        ...appState,
        activeTool: nextActiveTool,
        isRulerModeActive: true,
      },
      commitToHistory: false,
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
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
