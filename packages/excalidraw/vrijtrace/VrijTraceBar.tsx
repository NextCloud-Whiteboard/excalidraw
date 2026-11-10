import React, {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";

import type { VrijTraceSide } from "@excalidraw/element/types";

import { useApp, useExcalidrawContainer } from "../components/App";
import { Island } from "../components/Island";

import {
  LINE_WIDTH_MAX_PX,
  LINE_WIDTH_MIN_PX,
  TRENCH_WIDTH_MAX_M,
  TRENCH_WIDTH_MIN_M,
  WORK_WIDTH_MAX_M,
  WORK_WIDTH_MIN_M,
  isPdfPage,
  pageState,
  sidesForReference,
} from "./model";
import { STR } from "./strings";

import "./vrijtrace.scss";

import type { TrenchReference } from "./model";
import type { UIAppState } from "../types";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

const SIDE_LABELS: Record<VrijTraceSide, string> = {
  beide: STR.labels.both,
  boven: STR.labels.sideTop,
  onder: STR.labels.sideBottom,
  links: STR.labels.sideLeft,
  rechts: STR.labels.sideRight,
};

const REFERENCES: readonly (readonly [TrenchReference, string])[] = [
  ["midden", STR.labels.middle],
  ["boven", STR.labels.top],
  ["onder", STR.labels.bottom],
  ["links", STR.labels.left],
  ["rechts", STR.labels.right],
];

/** the Zijde choices the line's Tekenreferentie offers */
const SideSelect = ({
  id,
  label,
  value,
  reference,
  onChange,
}: {
  id: string;
  label: string;
  value: VrijTraceSide;
  reference: TrenchReference;
  onChange: (side: VrijTraceSide) => void;
}) => (
  <select
    id={id}
    data-testid={id}
    className="vt-select"
    aria-label={label}
    value={value}
    onChange={(e) => onChange(e.target.value as VrijTraceSide)}
  >
    {sidesForReference(reference).map((side) => (
      <option key={side} value={side}>
        {SIDE_LABELS[side]}
      </option>
    ))}
  </select>
);

/**
 * A value typed in a small field, with its slider dropping down underneath
 * while the field is in use: the bar stays one row, and the slider shows the
 * range from its minimum to its maximum. A typed value applies on Enter or on
 * leaving and is held to that range; a slider drag follows at once and is one
 * undo step when let go.
 */
const RangeField = ({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number, commit: boolean) => void;
}) => {
  // the text being typed; null shows the current value
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const commitText = () => {
    if (text !== null) {
      const v = Number(text.trim().replace(",", "."));
      if (text.trim() && Number.isFinite(v)) {
        onChange(Math.min(max, Math.max(min, v)), true);
      }
      setText(null);
    }
  };
  const fromSlider = (e: React.SyntheticEvent<HTMLInputElement>) =>
    Number(e.currentTarget.value);
  return (
    <div
      className="vt-range"
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // moving between the field and its slider keeps it open
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          commitText();
          setOpen(false);
        }
      }}
    >
      <label className="vt-field">
        <input
          id={`${id}-input`}
          data-testid={`${id}-input`}
          className="vt-num"
          type="text"
          inputMode="decimal"
          aria-label={label}
          title={`${label}: ${fmt(min)} tot ${fmt(max)} ${unit}`}
          value={text ?? fmt(value)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitText();
            }
          }}
        />
        <span>{unit}</span>
      </label>
      <div className="vt-pop Island" hidden={!open}>
        <div className="vt-lbl">
          <span>{label}</span>
          <b>
            {fmt(value)} {unit}
          </b>
        </div>
        <input
          id={id}
          data-testid={id}
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(fromSlider(e), false)}
          onPointerUp={(e) => onChange(fromSlider(e), true)}
          onKeyUp={(e) => onChange(fromSlider(e), true)}
        />
        <div className="vt-pop__ends">
          <span>
            {fmt(min)} {unit}
          </span>
          <span>
            {STR.bar.max} {fmt(max)} {unit}
          </span>
        </div>
      </div>
    </div>
  );
};

const Group = ({
  caption,
  title,
  children,
}: {
  caption: string;
  title?: string;
  children: React.ReactNode;
}) => (
  <div className="vt-group" role="group" aria-label={caption}>
    <span className="vt-cap" title={title}>
      {caption}
    </span>
    <div className="vt-row">{children}</div>
  </div>
);

/**
 * Vrij Tracé's settings as a second bar right under the toolbar, while the
 * tool is active or trench lines are selected: Uitlijnen, the trench, its two
 * zones, and the zones toggle at the end. Every setting is the selected
 * line's, else the next line's. Drawing itself is the whiteboard's line tool.
 */
export const VrijTraceBar = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  // the settings and the toggle follow the lines and zones, which change in
  // the scene, not in app state: redraw on every scene update
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = app.scene.onUpdate(rerender);
    return () => {
      // a destroyed scene has already dropped its listeners
      try {
        unsubscribe();
      } catch {}
    };
  }, [app.scene]);
  const { container } = useExcalidrawContainer();
  const rowRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  // right under the toolbar, which may wrap onto more rows when narrow
  useLayoutEffect(() => {
    const row = rowRef.current;
    const toolbar = container?.querySelector<HTMLElement>(".App-toolbar");
    const parent = row?.offsetParent;
    if (!row || !toolbar || !parent) {
      return;
    }
    const update = () =>
      setTop(
        Math.round(
          toolbar.getBoundingClientRect().bottom -
            parent.getBoundingClientRect().top +
            8,
        ),
      );
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(toolbar);
    return () => observer?.disconnect();
  }, [container]);

  const ui = appState.vrijTrace;
  const vt = app.vrijTrace;
  const width = vt.shownWidth();
  const line = vt.shownLineSettings();
  const elements = app.scene.getNonDeletedElements();
  const page = elements.find((el) => el.id === ui.pageId);
  const active = isPdfPage(page) && !!pageState(elements, page)?.active;

  return (
    <div
      className="vt-bar-row"
      ref={rowRef}
      style={top === null ? undefined : { top }}
    >
      <Island className="vt-bar" padding={1}>
        <Group caption={STR.bar.snap} title={STR.help.draw}>
          <div className="vt-seg">
            {(["90", "45", "vrij"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className="vt-opt"
                aria-pressed={ui.snap === s}
                data-testid={`vt-snap-${s}`}
                onClick={() => vt.setUI({ snap: s })}
              >
                {s === "vrij" ? "Vrij" : `${s}°`}
              </button>
            ))}
          </div>
        </Group>
        <span className="vt-sep" />
        <Group caption={STR.bar.trench}>
          <RangeField
            id="vt-width"
            label={STR.labels.width}
            value={width}
            min={TRENCH_WIDTH_MIN_M}
            max={TRENCH_WIDTH_MAX_M}
            step={0.05}
            unit="m"
            onChange={(v, commit) => vt.setWidth(v, commit)}
          />
          <select
            id="vt-reference"
            data-testid="vt-reference"
            className="vt-select"
            aria-label={STR.labels.reference}
            title={STR.labels.reference}
            value={line.reference}
            onChange={(e) => vt.setReference(e.target.value as TrenchReference)}
          >
            {REFERENCES.map(([ref, label]) => (
              <option key={ref} value={ref}>
                {label}
              </option>
            ))}
          </select>
          <RangeField
            id="vt-line-width"
            label={STR.labels.lineWidth}
            value={line.lineWidthPx}
            min={LINE_WIDTH_MIN_PX}
            max={LINE_WIDTH_MAX_PX}
            step={0.05}
            unit="px"
            onChange={(v, commit) => vt.setLineWidth(v, commit)}
          />
        </Group>
        <span className="vt-sep" />
        <Group caption={STR.bar.red} title={STR.help.red}>
          <span className="vt-ro" title={STR.labels.redDistance}>
            2,00 m
          </span>
          <SideSelect
            id="vt-red-side"
            label={`${STR.labels.side} ${STR.legend.red.toLowerCase()}`}
            value={line.redSide}
            reference={line.reference}
            onChange={(redSide) => vt.setLineZone({ redSide }, true)}
          />
        </Group>
        <span className="vt-sep" />
        <Group caption={STR.bar.work}>
          <RangeField
            id="vt-work-width"
            label={STR.labels.workWidth}
            value={line.workWidthM}
            min={WORK_WIDTH_MIN_M}
            max={WORK_WIDTH_MAX_M}
            step={0.1}
            unit="m"
            onChange={(workWidthM, commit) =>
              vt.setLineZone({ workWidthM }, commit)
            }
          />
          <SideSelect
            id="vt-work-side"
            label={`${STR.labels.side} ${STR.legend.work.toLowerCase()}`}
            value={line.workSide}
            reference={line.reference}
            onChange={(workSide) => vt.setLineZone({ workSide }, true)}
          />
        </Group>
        <span className="vt-sep" />
        <button
          type="button"
          className={
            active ? "vt-act vt-act--toggle-on" : "vt-act vt-act--primary"
          }
          data-testid="vt-activate"
          aria-pressed={active}
          disabled={!isPdfPage(page)}
          onClick={() => (active ? vt.deactivate() : vt.activate())}
        >
          {active ? STR.actions.deactivate : STR.actions.activate}
        </button>
      </Island>
    </div>
  );
};
