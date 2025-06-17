import React from "react";
import { register } from "./register";
import { CaptureUpdateAction } from "@excalidraw/element";
import type { AppClassProperties } from "../types";
import { ToolButton } from "../components/ToolButton";

// PDF icon component
const PdfIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4l-4-2z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </svg>
);

export const actionPdfImport = register({
  name: "pdfImport",
  label: "Import PDF",
  trackEvent: { category: "toolbar" },
  icon: PdfIcon,
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
        icon={<PdfIcon />}
        aria-label="Import PDF"
        title="Import PDF - Convert and insert PDF as image"
        onClick={() => {
          updateData(null);
        }}
        data-testid="toolbar-pdf-import"
      />
    );
  },
}); 