import React, { useEffect, useRef, useState } from "react";

import { useApp, useExcalidrawElements } from "../components/App";
import { t } from "../i18n";

import { isRulerLine, parseLength, rulerPage, rulerScale } from "./calibration";

import "./RulerCalibrationPrompt.scss";

import type { AppState } from "../types";
import type { MetricUnit } from "./calibration";

const UNITS: MetricUnit[] = ["m", "cm", "mm"];
const WIDTH = 288;

/**
 * Asks for the real length of a ruler line drawn where there is no scale yet,
 * next to the end of that line. The answer calibrates its PDF (or the board).
 */
export const RulerCalibrationPrompt = ({
  appState,
}: {
  appState: AppState;
}) => {
  const app = useApp();
  const elements = useExcalidrawElements();
  const elementId = appState.rulerCalibration?.elementId ?? null;
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<MetricUnit>(appState.selectedMetric || "cm");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // a new line gets a fresh question
  useEffect(() => {
    setValue("");
    setInvalid(false);
    inputRef.current?.focus({ preventScroll: true });
  }, [elementId]);

  if (!elementId) {
    return null;
  }
  const elementsMap = new Map(elements.map((el) => [el.id, el]));
  const line = elementsMap.get(elementId);
  if (
    !isRulerLine(line) ||
    line.isDeleted ||
    rulerScale(line, elementsMap, appState) !== null
  ) {
    return null;
  }
  const page = rulerPage(line, elementsMap);
  const pageCount = page
    ? elements.filter(
        (el) =>
          !el.isDeleted &&
          el.customData?.isPdf === true &&
          el.customData?.pdfDocId === page.customData?.pdfDocId,
      ).length
    : 0;
  const scope = !page
    ? t("rulerCalibration.forBoard")
    : pageCount > 1
    ? t("rulerCalibration.forPdf", {
        count: pageCount,
        name: String(page.customData?.originalPdfName || "PDF"),
      })
    : t("rulerCalibration.forPdfOne", {
        name: String(page.customData?.originalPdfName || "PDF"),
      });

  // next to the line's end, kept inside the canvas
  const zoom = appState.zoom.value;
  const end = line.points[line.points.length - 1];
  const x = (line.x + end[0] + appState.scrollX) * zoom;
  const y = (line.y + end[1] + appState.scrollY) * zoom;
  const left = Math.max(8, Math.min(appState.width - WIDTH - 8, x - WIDTH / 2));
  const top = y + 200 < appState.height ? y + 16 : Math.max(8, y - 196);

  const submit = () => {
    const length = parseLength(value);
    if (length === null) {
      setInvalid(true);
      inputRef.current?.focus();
      return;
    }
    app.calibrateRuler(elementId, length, unit);
  };

  return (
    <div
      className="RulerCalibration"
      data-testid="ruler-calibration"
      role="dialog"
      aria-labelledby="ruler-calibration-title"
      style={{ left, top, width: WIDTH }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          submit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          app.dismissRulerCalibration();
        }
      }}
    >
      <h3 id="ruler-calibration-title" className="RulerCalibration__title">
        {t("rulerCalibration.title")}
      </h3>
      <p className="RulerCalibration__scope">{scope}</p>
      <div className="RulerCalibration__row">
        <input
          ref={inputRef}
          id="ruler-calibration-length"
          data-testid="ruler-calibration-length"
          className="RulerCalibration__input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={t("rulerCalibration.length")}
          placeholder={t("rulerCalibration.placeholder")}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
        />
        <select
          id="ruler-calibration-unit"
          data-testid="ruler-calibration-unit"
          className="RulerCalibration__unit"
          aria-label={t("rulerCalibration.unit")}
          value={unit}
          onChange={(event) => setUnit(event.target.value as MetricUnit)}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      {invalid && (
        <p
          className="RulerCalibration__error"
          data-testid="ruler-calibration-error"
        >
          {t("rulerCalibration.invalid")}
        </p>
      )}
      <div className="RulerCalibration__actions">
        <button
          type="button"
          data-testid="ruler-calibration-later"
          onClick={() => app.dismissRulerCalibration()}
        >
          {t("rulerCalibration.later")}
        </button>
        <button
          type="button"
          className="RulerCalibration__apply"
          data-testid="ruler-calibration-apply"
          onClick={submit}
        >
          {t("rulerCalibration.apply")}
        </button>
      </div>
    </div>
  );
};
