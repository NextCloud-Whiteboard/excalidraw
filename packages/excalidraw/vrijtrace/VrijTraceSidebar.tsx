import React from "react";

import type { VrijTraceSide } from "@excalidraw/element/types";

import {
  useApp,
  useExcalidrawAppState,
  useExcalidrawElements,
} from "../components/App";

import { selectionTarget } from "../selectionSidebar";

import { checkTree } from "./geometry";
import {
  centreOf,
  isPdfPage,
  pageState,
  pxPerMetre,
  sceneToPage,
  treeName,
  treeRingM,
} from "./model";
import { COLORS } from "./render";
import { STR } from "./strings";

/** "1,50", and "−0,30" with a real minus once the trench reaches the ring */
const fmt = (n: number) => {
  const t = Math.abs(n).toFixed(2).replace(".", ",");
  return n < 0 && t !== "0,00" ? `−${t}` : t;
};

const SIDE_TEXT: Record<VrijTraceSide, string> = {
  beide: STR.labels.both.toLowerCase(),
  boven: STR.labels.sideTop.toLowerCase(),
  onder: STR.labels.sideBottom.toLowerCase(),
  links: STR.labels.sideLeft.toLowerCase(),
  rechts: STR.labels.sideRight.toLowerCase(),
};

const REFERENCE_TEXT = {
  midden: STR.labels.middle,
  boven: STR.labels.top,
  onder: STR.labels.bottom,
  links: STR.labels.left,
  rechts: STR.labels.right,
} as const;

/** one zone a tree's ring reaches, as a small square: filled when it does */
const ZoneMark = ({
  kind,
  on,
}: {
  kind: "trench" | "red" | "work";
  on: boolean | null;
}) => {
  const label = STR.table[kind === "trench" ? "inTrench" : kind];
  return (
    <i
      className={on ? `vt-z vt-z--${kind}` : "vt-z"}
      data-on={on ? "true" : "false"}
      title={`${label}: ${
        on === null ? "—" : on ? STR.table.yes : STR.table.no
      }`}
      aria-label={`${label}: ${
        on === null ? "—" : on ? STR.table.yes : STR.table.no
      }`}
      role="img"
    />
  );
};

/**
 * The tab beside the plan: everything about the current page at a glance.
 * Its activation and scale, how many trees pass, the settings the bar is
 * showing, and the tree check, narrow enough to need no sideways scrolling:
 * the zones a ring reaches are three small squares.
 */
export const VrijTraceSidebar = () => {
  const app = useApp();
  const appState = useExcalidrawAppState();
  const elements = useExcalidrawElements();
  const page = elements.find((e) => e.id === appState.vrijTrace.pageId);
  const s = isPdfPage(page) ? pageState(elements, page) : null;
  if (!page || !s) {
    return (
      <div className="vt-side">
        <p className="vt-help">{STR.noPage}</p>
      </div>
    );
  }
  const activation =
    s.parts.network?.trench.kind === "network"
      ? s.parts.network.trench.activation
      : null;
  const time = activation
    ? new Date(activation.at).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const pageName =
    typeof page.customData?.originalPdfName === "string"
      ? page.customData.originalPdfName
      : "PDF";
  const vt = app.vrijTrace;
  const selected = vt.selectedLines().length;
  const line = vt.shownLineSettings();
  const trees = s.parts.trees.map((t) => ({
    t,
    r: checkTree(
      sceneToPage(s.frame, centreOf(t)),
      treeRingM(t, s.frame),
      s.zones,
      s.active,
    ),
  }));
  // the tree selected on the plan: a card on top, its row highlighted
  const target = selectionTarget(elements, appState.selectedElementIds);
  const selectedIndex =
    target?.kind === "tree" && target.pageId === page.id
      ? trees.findIndex(({ t }) => t.id === target.ringId)
      : -1;
  const selectedTree = selectedIndex >= 0 ? trees[selectedIndex] : null;
  const passing = trees.filter(({ r }) => r.pass === true).length;
  const failing = trees.filter(({ r }) => r.pass === false).length;
  return (
    <div className="vt-side">
      {selectedTree && (
        <div className="vt-selected-tree" data-testid="vt-selected-tree">
          <div className="vt-selected-tree__head">
            <span className="vt-h">{STR.selectedTree.title}</span>
            <span>{STR.selectedTree.number(selectedIndex + 1)}</span>
          </div>
          <b className="vt-selected-tree__name">{treeName(selectedTree.t)}</b>
          <dl className="vt-dl">
            <dt>{STR.selectedTree.distance}</dt>
            <dd className={selectedTree.r.pass === false ? "vt-bad" : ""}>
              {selectedTree.r.distanceM === null
                ? "—"
                : `${fmt(selectedTree.r.distanceM)} m`}
            </dd>
            <dt>{STR.table.verdict}</dt>
            <dd
              className={
                selectedTree.r.pass === null
                  ? ""
                  : selectedTree.r.pass
                  ? "vt-ok"
                  : "vt-bad"
              }
            >
              {selectedTree.r.pass === null
                ? "—"
                : selectedTree.r.pass
                ? STR.table.ok
                : STR.table.conflict}
            </dd>
            <dt>{STR.table.zones}</dt>
            <dd className="vt-zones">
              <ZoneMark kind="trench" on={selectedTree.r.inside} />
              <ZoneMark kind="red" on={selectedTree.r.red} />
              <ZoneMark kind="work" on={selectedTree.r.work} />
            </dd>
          </dl>
        </div>
      )}
      <div className="vt-status">
        <span
          data-testid="vt-zone-state"
          className={s.active ? "vt-pill vt-pill--on" : "vt-pill"}
        >
          {s.active && activation
            ? STR.activatedBy(activation.by.name, time)
            : s.stale
            ? STR.conceptZones
            : STR.notActivated}
        </span>
        <span>
          {STR.scale(pageName, fmt(pxPerMetre(s.frame)))} ·{" "}
          <span data-testid="vt-count">
            {STR.count(s.geometry.segments.length, s.geometry.nodes.length)}
          </span>
        </span>
      </div>

      <div className="vt-tiles" data-testid="vt-tiles">
        <div className="vt-tile">
          <b>{trees.length}</b>
          <span>{STR.summary.trees}</span>
        </div>
        <div className="vt-tile vt-tile--ok">
          <b>{passing}</b>
          <span>{STR.summary.ok}</span>
        </div>
        <div className={failing ? "vt-tile vt-tile--bad" : "vt-tile"}>
          <b>{failing}</b>
          <span>{STR.summary.conflict}</span>
        </div>
      </div>

      <div className="vt-block">
        <h3 className="vt-h">{STR.summary.settings}</h3>
        <p className="vt-applies" data-testid="vt-applies">
          {selected ? STR.applies.selected(selected) : STR.applies.next}
        </p>
        <dl className="vt-dl" data-testid="vt-settings">
          <dt>{STR.labels.width}</dt>
          <dd>{fmt(vt.shownWidth())} m</dd>
          <dt>{STR.labels.reference}</dt>
          <dd>{REFERENCE_TEXT[line.reference]}</dd>
          <dt>{STR.summary.red}</dt>
          <dd>{STR.summary.redValue(SIDE_TEXT[line.redSide])}</dd>
          <dt>{STR.summary.work}</dt>
          <dd>
            {STR.summary.workValue(
              fmt(line.workWidthM),
              SIDE_TEXT[line.workSide],
            )}
          </dd>
          <dt>{STR.summary.snap}</dt>
          <dd>
            {appState.vrijTrace.snap === "vrij"
              ? "Vrij"
              : `${appState.vrijTrace.snap}°`}
          </dd>
        </dl>
      </div>

      <div className="vt-block">
        <h3 className="vt-h">{STR.table.title}</h3>
        {trees.length ? (
          <table className="vt-table">
            <colgroup>
              <col className="vt-col-n" />
              <col />
              <col className="vt-col-d" />
              <col className="vt-col-v" />
              <col className="vt-col-z" />
            </colgroup>
            <thead>
              <tr>
                <th>{STR.table.number}</th>
                <th>{STR.table.tree}</th>
                <th>{STR.table.distance}</th>
                <th>{STR.table.verdict}</th>
                <th>{STR.table.zones}</th>
              </tr>
            </thead>
            <tbody data-testid="vt-rows">
              {trees.map(({ t, r }, i) => {
                // point at a row (or tap it) to outline its tree on the plan
                const outline = () => app.vrijTrace.setHotTree(t.id);
                return (
                  <tr
                    key={t.id}
                    className={[
                      appState.vrijTrace.hotTreeId === t.id ? "vt-hot" : "",
                      i === selectedIndex ? "vt-selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onPointerEnter={outline}
                    onPointerLeave={() => app.vrijTrace.setHotTree(null)}
                    onClick={outline}
                  >
                    <td>
                      <b>{i + 1}</b>
                    </td>
                    <td className="vt-tree-name">{treeName(t)}</td>
                    <td className={r.pass === false ? "vt-bad" : ""}>
                      {r.distanceM === null ? "—" : `${fmt(r.distanceM)} m`}
                    </td>
                    <td
                      className={
                        r.pass === null ? "" : r.pass ? "vt-ok" : "vt-bad"
                      }
                    >
                      {r.pass === null
                        ? "—"
                        : r.pass
                        ? STR.table.ok
                        : STR.table.conflict}
                    </td>
                    <td className="vt-zones">
                      <ZoneMark kind="trench" on={r.inside} />
                      <ZoneMark kind="red" on={r.red} />
                      <ZoneMark kind="work" on={r.work} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="vt-help">{STR.help.trees}</p>
        )}
        <div className="vt-legend">
          <span>
            <i className="vt-z vt-z--trench" />
            {STR.table.inTrench}
          </span>
          <span>
            <i className="vt-z vt-z--red" />
            {STR.table.red}
          </span>
          <span>
            <i className="vt-z vt-z--work" />
            {STR.table.work}
          </span>
        </div>
      </div>

      <div className="vt-legend vt-legend--plan">
        <span>
          <i
            style={{
              background: "transparent",
              border: `2px solid ${COLORS.edge}`,
            }}
          />
          {STR.legend.trench}
        </span>
        <span>
          <i style={{ background: COLORS.red }} />
          {STR.legend.red}
        </span>
        <span>
          <i style={{ background: COLORS.work }} />
          {STR.legend.work}
        </span>
        <span>
          <i style={{ background: COLORS.overlap }} />
          {STR.legend.overlap}
        </span>
      </div>
      <p className="vt-help">{STR.disclaimer}</p>
    </div>
  );
};
