import clsx from "clsx";
import React from "react";

import { t } from "../i18n";

import { useApp } from "./App";

import "./PdfImportPlaceholder.scss";

import type { AppState } from "../types";

/**
 * A dashed page where an importing PDF will land, carrying its status:
 * upload percentage, conversion, page placement, or the error.
 */
export const PdfImportPlaceholder = ({ appState }: { appState: AppState }) => {
  const app = useApp();
  const job = appState.pdfImport;
  if (!job) {
    return null;
  }
  const zoom = appState.zoom.value;
  const isError = job.stage === "error";
  const status =
    job.stage === "upload"
      ? t("pdfImport.uploading", { percent: job.percent })
      : job.stage === "convert"
      ? t("pdfImport.convertingOnServer")
      : job.stage === "place"
      ? t("pdfImport.placingPage", {
          current: job.placed + 1,
          total: job.total,
        })
      : job.error;
  const barWidth =
    job.stage === "upload"
      ? job.percent
      : job.stage === "place"
      ? (job.placed / Math.max(1, job.total)) * 100
      : null;
  return (
    <div
      className={clsx("PdfImportPlaceholder", {
        "PdfImportPlaceholder--error": isError,
      })}
      style={{
        left: (job.x - job.width / 2 + appState.scrollX) * zoom,
        top: (job.y + appState.scrollY) * zoom,
        width: job.width * zoom,
        height: job.height * zoom,
      }}
      role="status"
      aria-live="polite"
    >
      {(job.stage === "upload" || job.stage === "convert" || isError) && (
        <button
          type="button"
          className="PdfImportPlaceholder__cancel"
          aria-label={isError ? t("pdfImport.close") : t("pdfImport.cancel")}
          title={isError ? t("pdfImport.close") : t("pdfImport.cancel")}
          onClick={() => app.cancelPdfImport()}
        >
          ×
        </button>
      )}
      <div className="PdfImportPlaceholder__body">
        <div className="PdfImportPlaceholder__name">{job.name}</div>
        <div className="PdfImportPlaceholder__state">{status}</div>
        {!isError && (
          <div
            className={clsx("PdfImportPlaceholder__bar", {
              "PdfImportPlaceholder__bar--open": barWidth === null,
            })}
          >
            <i
              style={barWidth === null ? undefined : { width: `${barWidth}%` }}
            />
          </div>
        )}
        {isError && (
          <button
            type="button"
            className="PdfImportPlaceholder__retry"
            onClick={() => app.retryPdfImport()}
          >
            {t("pdfImport.retry")}
          </button>
        )}
      </div>
    </div>
  );
};
