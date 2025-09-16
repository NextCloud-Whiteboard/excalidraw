import React from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";
import { updateActiveTool } from "@excalidraw/common";
import type { AppClassProperties } from "../types";
import { ToolButton } from "../components/ToolButton";
import { MagnifierIcon } from "../components/icons";

export const actionMagnifier = register({
  name: "magnifier",
  label: t("buttons.magnifier"),
  trackEvent: { category: "toolbar" },
  icon: MagnifierIcon,
  keyTest: (event) =>
    event.key === "M" &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey,
  perform: (elements, appState, value, app) => {
    return {
      elements,
      appState: {
        ...appState,
        activeTool: updateActiveTool(appState, {
          type: "custom" as const,
          customType: "magnifier",
        }),
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, app, updateData }) => {
    return (
      <ToolButton
        type="button"
        icon={MagnifierIcon}
        aria-label={t("buttons.magnifier")}
        title={`${t("buttons.magnifier")} — ${t("toolHints.magnifier")}`}
        selected={
          appState.activeTool.type === "custom" &&
          appState.activeTool.customType === "magnifier"
        }
        onClick={() => {
          updateData(null);
        }}
        data-testid="toolbar-magnifier"
      />
    );
  },
});
