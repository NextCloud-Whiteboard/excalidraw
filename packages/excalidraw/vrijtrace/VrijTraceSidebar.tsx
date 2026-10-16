import React from "react";

import {
  useExcalidrawAppState,
  useExcalidrawElements,
} from "../components/App";

import { checkTree } from "./geometry";
import {
  centreOf,
  displayLabels,
  isPdfPage,
  pageState,
  pxPerMetre,
  sceneToPage,
} from "./model";
import { COLORS } from "./render";
import { STR } from "./strings";

const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const yesNo = (v: boolean | null) =>
  v === null ? "—" : v ? STR.table.yes : STR.table.no;

/** tab content: activation state, scale and v8.2's tree check table */
export const VrijTraceSidebar = () => {
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
  const labels = displayLabels(s.parts.trees);
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
  return (
    <div className="vt-side">
      <div className="vt-status">
        <span
          data-testid="vt-zone-state"
          className={s.active ? "vt-pill vt-pill--on" : "vt-pill"}
        >
          {s.active && activation
            ? STR.activatedBy(activation.by.name, time)
            : STR.notActivated}
        </span>
        <span data-testid="vt-count">
          {STR.count(s.geometry.segments.length, s.geometry.nodes.length)}
        </span>
        <span>{STR.scale(pageName, fmt(pxPerMetre(s.frame)))}</span>
      </div>
      <h3 className="vt-h">{STR.table.title}</h3>
      <div className="vt-table-wrap">
        <table className="vt-table">
          <thead>
            <tr>
              <th>{STR.table.tree}</th>
              <th>{STR.table.inTrench}</th>
              <th>{STR.table.distance}</th>
              <th>{STR.table.min}</th>
              <th>{STR.table.verdict}</th>
              <th>{STR.table.red}</th>
              <th>{STR.table.work}</th>
            </tr>
          </thead>
          <tbody data-testid="vt-rows">
            {s.parts.trees.map((t) => {
              const r = checkTree(
                sceneToPage(s.frame, centreOf(t)),
                s.zones,
                s.active,
                s.settings.treeMinM,
              );
              return (
                <tr key={t.id}>
                  <td>
                    <b>{labels.get(t.id)}</b>
                  </td>
                  <td>{yesNo(r.inside)}</td>
                  <td>
                    {r.distanceM === null ? "—" : `${fmt(r.distanceM)} m`}
                  </td>
                  <td>{fmt(s.settings.treeMinM)} m</td>
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
                  <td>{yesNo(r.red)}</td>
                  <td>{yesNo(r.work)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="vt-legend">
        <span>
          <i
            style={{
              background: COLORS.fill,
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
