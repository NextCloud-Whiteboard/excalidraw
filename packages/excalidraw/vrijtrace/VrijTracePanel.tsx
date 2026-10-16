import React from "react";

import { useApp, useExcalidrawElements } from "../components/App";

import { displayLabels, getPageParts, isPdfPage, settingsOf } from "./model";
import { STR } from "./strings";

import "./vrijtrace.scss";

import type { VrijTraceSide } from "@excalidraw/element/types";

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
    <option value="links">{STR.labels.sideLeft}</option>
    <option value="rechts">{STR.labels.sideRight}</option>
  </select>
);

/** v8.2's six settings sections; replaces the shape actions while the tool is active */
export const VrijTracePanel = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  const elements = useExcalidrawElements();
  const ui = appState.vrijTrace;
  const vt = app.vrijTrace;
  const page = ui.pageId ? elements.find((e) => e.id === ui.pageId) : null;
  const parts = isPdfPage(page) ? getPageParts(elements, page.id) : null;
  const settings = settingsOf(parts?.network ?? null);
  const labels = parts ? displayLabels(parts.trees) : new Map<string, string>();
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
        <div className="vt-h">{STR.sections.mode}</div>
        <div className="vt-grid2">
          {(["teken", "verplaats", "selecteer", "verwijder"] as const).map(
            (m) =>
              opt(ui.mode === m, `vt-mode-${m}`, STR.modes[m], () =>
                vt.setMode(m),
              ),
          )}
        </div>
        <p className="vt-help">{STR.help.mode}</p>
      </div>
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
      </div>
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.trench}</div>
        <label className="vt-lbl" htmlFor="vt-width">
          <span>{STR.labels.width}</span>
          <span>{fmt(ui.widthM)} m</span>
        </label>
        <input
          id="vt-width"
          data-testid="vt-width"
          type="range"
          min="0.3"
          max="2.3"
          step="0.05"
          value={ui.widthM}
          onChange={(e) => vt.setWidth(Number(e.target.value), false)}
          onPointerUp={(e) =>
            vt.setWidth(Number((e.target as HTMLInputElement).value), true)
          }
        />
        <p className="vt-help">{STR.help.width}</p>
        <div className="vt-lbl">{STR.labels.reference}</div>
        <div className="vt-grid3">
          {opt(
            ui.reference === "midden",
            "vt-ref-midden",
            STR.labels.middle,
            () => vt.setUI({ reference: "midden" }),
          )}
          {opt(ui.reference === "links", "vt-ref-links", STR.labels.left, () =>
            vt.setUI({ reference: "links" }),
          )}
          {opt(
            ui.reference === "rechts",
            "vt-ref-rechts",
            STR.labels.right,
            () => vt.setUI({ reference: "rechts" }),
          )}
        </div>
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
          value={settings.redSide}
          onChange={(redSide) => vt.updateSettings({ redSide }, true)}
        />
        <p className="vt-help">{STR.help.red}</p>
      </div>
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.work}</div>
        <label className="vt-lbl" htmlFor="vt-work-width">
          <span>{STR.labels.workWidth}</span>
          <span>{fmt(settings.workWidthM)} m</span>
        </label>
        <input
          id="vt-work-width"
          data-testid="vt-work-width"
          type="range"
          min="0.5"
          max="4"
          step="0.1"
          value={settings.workWidthM}
          onChange={(e) =>
            vt.updateSettings({ workWidthM: Number(e.target.value) }, false)
          }
          onPointerUp={() => vt.updateSettings({}, true)}
        />
        <label className="vt-lbl" htmlFor="vt-work-side">
          {STR.labels.side}
        </label>
        <SideSelect
          id="vt-work-side"
          value={settings.workSide}
          onChange={(workSide) => vt.updateSettings({ workSide }, true)}
        />
      </div>
      <div className="vt-sec">
        <div className="vt-h">{STR.sections.trees}</div>
        <label className="vt-lbl" htmlFor="vt-tree-min">
          <span>{STR.labels.treeMin}</span>
          <span>{fmt(settings.treeMinM)} m</span>
        </label>
        <input
          id="vt-tree-min"
          data-testid="vt-tree-min"
          type="range"
          min="0"
          max="15"
          step="0.25"
          value={settings.treeMinM}
          onChange={(e) =>
            vt.updateSettings({ treeMinM: Number(e.target.value) }, true)
          }
        />
        <div className="vt-grid2">
          {(parts?.trees ?? []).map((t) =>
            opt(
              ui.mode === "boom" && ui.activeTreeId === t.id,
              `vt-tree-${labels.get(t.id)}`,
              STR.labels.moveTree(labels.get(t.id) ?? ""),
              () => vt.moveTree(t.id),
            ),
          )}
          {opt(
            ui.mode === "boomToevoegen",
            "vt-tree-add",
            STR.labels.addTree,
            () => vt.setMode("boomToevoegen"),
          )}
          {opt(false, "vt-stop", STR.labels.stop, () => vt.stop())}
        </div>
        <p className="vt-help">{STR.help.trees}</p>
      </div>
    </div>
  );
};
