import React from "react";
import { register } from "./register";
import { t } from "../i18n";
import { CaptureUpdateAction } from "@excalidraw/element";
import type { AppClassProperties } from "../types";
import { ToolButton } from "../components/ToolButton";

// Upload icon component
const UploadIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 14v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    <path d="M10 3v8" />
    <path d="M6 7l4-4 4 4" />
  </svg>
);

export const actionPdfImport = register({
  name: "pdfImport",
  label: t("buttons.pdfImport"),
  trackEvent: { category: "toolbar" },
  icon: UploadIcon,
  perform: async (elements, appState, value, app) => {
    // Call the PDF import directly through app instance
    // We'll add this method to the App component
    (app as any).onPdfImportAction?.();

    return {
      elements,
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  PanelComponent: ({ appState, app, updateData }) => {
    return (
      <ToolButton
        type="button"
        icon={<UploadIcon />}
        aria-label={t("buttons.pdfImport")}
        title={`${t("buttons.pdfImport")}`}
        onClick={() => {
          updateData(null);
        }}
        data-testid="toolbar-pdf-import"
      />
    );
  },
}); 