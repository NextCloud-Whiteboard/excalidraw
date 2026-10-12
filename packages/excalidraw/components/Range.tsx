import React, { useEffect } from "react";

import { t } from "../i18n";

import "./Range.scss";

import type { AppClassProperties } from "../types";

export type RangeProps = {
  updateData: (value: number) => void;
  app: AppClassProperties;
  testId?: string;
};

const THUMB_WIDTH = 15;

export const Range = ({ updateData, app, testId }: RangeProps) => {
  const rangeRef = React.useRef<HTMLInputElement>(null);
  const selectedElements = app.scene.getSelectedElements(app.state);
  let hasCommonOpacity = true;
  const firstElement = selectedElements.at(0);
  const leastCommonOpacity = selectedElements.reduce((acc, element) => {
    if (acc != null && acc !== element.opacity) {
      hasCommonOpacity = false;
    }
    if (acc == null || acc > element.opacity) {
      return element.opacity;
    }
    return acc;
  }, firstElement?.opacity ?? null);

  const value = leastCommonOpacity ?? app.state.currentItemOpacity;

  useEffect(() => {
    if (rangeRef.current) {
      const rangeElement = rangeRef.current;
      rangeElement.style.background = `linear-gradient(to right, var(--color-slider-track) 0%, var(--color-slider-track) ${value}%, var(--button-bg) ${value}%, var(--button-bg) 100%)`;
    }
  }, [value]);

  return (
    <label className="control-label">
      {t("labels.opacity")}
      <div className="range-wrapper">
        <input
          style={{
            ["--color-slider-track" as string]: hasCommonOpacity
              ? undefined
              : "var(--button-bg)",
          }}
          ref={rangeRef}
          type="range"
          min="0"
          max="100"
          step="10"
          onChange={(event) => {
            updateData(+event.target.value);
          }}
          value={value}
          className="range-input"
          data-testid={testId}
        />
        <div
          className="value-bubble"
          // relative to the slider's width, so it follows panel resizes
          // (a one-off px position overflowed once a scrollbar appeared)
          style={{
            left: `calc(${value / 100} * (100% - ${THUMB_WIDTH}px) + ${
              THUMB_WIDTH / 2
            }px)`,
          }}
        >
          {value !== 0 ? value : null}
        </div>
        <div className="zero-label">0</div>
      </div>
    </label>
  );
};
