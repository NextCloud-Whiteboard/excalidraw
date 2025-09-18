import React from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";
import { STROKE_WIDTH, updateActiveTool, ROUGHNESS } from "@excalidraw/common";
import type { AppClassProperties } from "../types";
import { ToolButton } from "../components/ToolButton";
import { RulerIcon } from "../components/icons";

export const actionRuler = register({
  name: "ruler",
  label: t("buttons.ruler"),
  trackEvent: { category: "toolbar" },
  icon: RulerIcon,
  perform: (elements, appState, value, app) => {
    return {
      elements,
      appState: {
        ...appState,
        activeTool: updateActiveTool(appState, {
          type: "custom" as const,
          customType: "ruler",
        }),
        currentItemStrokeWidth: STROKE_WIDTH.thin, // Always use the smallest stroke width for ruler
        currentItemRoughness: ROUGHNESS.architect, // Always use the smoothest roughness for ruler
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, app, updateData }) => {
    return (
      <ToolButton
        type="button"
        icon={RulerIcon}
        aria-label={t("buttons.ruler")}
        title={`${t("buttons.ruler")}`}
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