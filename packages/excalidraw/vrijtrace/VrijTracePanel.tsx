import React, { useState } from "react";

import type { VrijTraceSide } from "@excalidraw/element/types";

import { useApp, useExcalidrawElements } from "../components/App";

import {
  TRENCH_WIDTH_MAX_M,
  TRENCH_WIDTH_MIN_M,
  LINE_WIDTH_MAX_PX,
  LINE_WIDTH_MIN_PX,
  WORK_WIDTH_MAX_M,
  WORK_WIDTH_MIN_M,
  TREE_MIN_MAX_M,
} from "./model";
import { STR } from "./strings";

import "./vrijtrace.scss";

import type { UIAppState } from "../types";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

const SideSelect = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: VrijTraceSide;
  onChange: (side: VrijTraceSide) => void;
}) => (
  <select
    id={id}
    data-testid={id}
    className="vt-select"
    value={value}
    onChange={(e) => onChange(e.target.value as VrijTraceSide)}
  >
    <option value="beide">{STR.labels.both}</option>
    <option value="boven">{STR.labels.sideTop}</option>
    <option value="onder">{STR.labels.sideBottom}</option>
    <option value="links">{STR.labels.sideLeft}</option>
    <option value="rechts">{STR.labels.sideRight}</option>
  </select>
);

/** the trench width typed in metres (a comma or a dot); applied on Enter or leaving */
const WidthField = ({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (widthM: number) => void;
}) => {
  // the text being typed; null shows the current width
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null) {
      const v = Number(text.trim().replace(",", "."));
      if (text.trim() && Number.isFinite(v)) {
        onCommit(v);
      }
      setText(null);
    }
  };
  return (
    <span className="vt-num-wrap">
      <input
        id="vt-width-input"
        data-testid="vt-width-input"
        className="vt-num"
        type="text"
        inputMode="decimal"
        aria-label={STR.labels.width}
        value={text ?? fmt(value)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
          }
        }}
      />
      m
    </span>
  );
};

/**
 * v8.2's settings; replaces the shape actions while the tool is active or
 * trench lines are selected. Drawing itself is the whiteboard's line tool.
 */
export const VrijTracePanel = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  // the panel shows lines' settings: redraw when the elements change
  useExcalidrawElements();
  const ui = appState.vrijTrace;
  const vt = app.vrijTrace;
  // every setting is the selected line's, else the next line's
  const width = vt.shownWidth();
  const line = vt.shownLineSettings();
  const selected = vt.selectedLines().length;
  const opt = (
    pressed: boolean,
    testId: string,
    label: string,
    onClick: () => void,
  ) => (
    <button
      key={testId}
      type="button"
      className="vt-opt"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div className="vt-panel">
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.snap}</div>
        <div className="vt-grid3">
          {(["90", "45", "vrij"] as const).map((s) =>
            opt(
              ui.snap === s,
              `vt-snap-${s}`,
              s === "vrij" ? "Vrij" : `${s}°`,
              () => vt.setUI({ snap: s }),
            ),
          )}
        </div>
        <p className="vt-help">{STR.help.draw}</p>
      </div>
      <p className="vt-applies" data-testid="vt-applies">
        {selected ? STR.applies.selected(selected) : STR.applies.next}
      </p>
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.trench}</div>
        <div className="vt-lbl">
          <label htmlFor="vt-width">{STR.labels.width}</label>
          <WidthField value={width} onCommit={(v) => vt.setWidth(v, true)} />
        </div>
        <input
          id="vt-width"
          data-testid="vt-width"
          type="range"
          min={TRENCH_WIDTH_MIN_M}
          max={TRENCH_WIDTH_MAX_M}
          step="0.05"
          value={width}
          onChange={(e) => vt.setWidth(Number(e.target.value), false)}
          onPointerUp={(e) =>
            vt.setWidth(Number((e.target as HTMLInputElement).value), true)
          }
        />
        <p className="vt-help">{STR.help.width}</p>
        <div className="vt-lbl">{STR.labels.reference}</div>
        <div className="vt-grid2 vt-refs">
          {(
            [
              ["midden", STR.labels.middle],
              ["boven", STR.labels.top],
              ["onder", STR.labels.bottom],
              ["links", STR.labels.left],
              ["rechts", STR.labels.right],
            ] as const
          ).map(([ref, label]) =>
            opt(line.reference === ref, `vt-ref-${ref}`, label, () =>
              vt.setReference(ref),
            ),
          )}
        </div>
        <label className="vt-lbl" htmlFor="vt-line-width">
          <span>{STR.labels.lineWidth}</span>
          <span>{fmt(line.lineWidthPx)} px</span>
        </label>
        <input
          id="vt-line-width"
          data-testid="vt-line-width"
          type="range"
          min={LINE_WIDTH_MIN_PX}
          max={LINE_WIDTH_MAX_PX}
          step="0.05"
          value={line.lineWidthPx}
          onChange={(e) => vt.setLineWidth(Number(e.target.value), false)}
          onPointerUp={(e) =>
            vt.setLineWidth(Number((e.target as HTMLInputElement).value), true)
          }
        />
      </div>
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.red}</div>
        <div className="vt-lbl">
          <span>{STR.labels.redDistance}</span>
          <span>2,00 m</span>
        </div>
        <label className="vt-lbl" htmlFor="vt-red-side">
          {STR.labels.side}
        </label>
        <SideSelect
          id="vt-red-side"
          value={line.redSide}
          onChange={(redSide) => vt.setLineZone({ redSide }, true)}
        />
        <p className="vt-help">{STR.help.red}</p>
      </div>
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.work}</div>
        <label className="vt-lbl" htmlFor="vt-work-width">
          <span>{STR.labels.workWidth}</span>
          <span>{fmt(line.workWidthM)} m</span>
        </label>
        <input
          id="vt-work-width"
          data-testid="vt-work-width"
          type="range"
          min={WORK_WIDTH_MIN_M}
          max={WORK_WIDTH_MAX_M}
          step="0.1"
          value={line.workWidthM}
          onChange={(e) =>
            vt.setLineZone({ workWidthM: Number(e.target.value) }, false)
          }
          onPointerUp={() => vt.setLineZone({}, true)}
        />
        <label className="vt-lbl" htmlFor="vt-work-side">
          {STR.labels.side}
        </label>
        <SideSelect
          id="vt-work-side"
          value={line.workSide}
          onChange={(workSide) => vt.setLineZone({ workSide }, true)}
        />
      </div>
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.trees}</div>
        <label className="vt-lbl" htmlFor="vt-tree-min">
          <span>{STR.labels.treeMin}</span>
          <span>{fmt(line.treeMinM)} m</span>
        </label>
        <input
          id="vt-tree-min"
          data-testid="vt-tree-min"
          type="range"
          min="0"
          max={TREE_MIN_MAX_M}
          step="0.25"
          value={line.treeMinM}
          onChange={(e) => vt.setLineTreeMin(Number(e.target.value), false)}
          onPointerUp={() => vt.setLineTreeMin(line.treeMinM, true)}
        />
        <p className="vt-help">{STR.help.trees}</p>
      </div>
    </div>
  );
};
