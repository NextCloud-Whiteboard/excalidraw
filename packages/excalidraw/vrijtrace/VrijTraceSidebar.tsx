import React from "react";

import { DEFAULT_SIDEBAR, LIBRARY_SIDEBAR_TAB } from "@excalidraw/common";

import type { VrijTraceSide } from "@excalidraw/element/types";

import type { ExcalidrawLinearElement } from "@excalidraw/element/types";

import {
  useApp,
  useExcalidrawAppState,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "../components/App";
import { libraryItemsAtom } from "../data/library";
import { useAtomValue } from "../editor-jotai";
import { selectionTarget } from "../selectionSidebar";

import { elementZones, lineLengthM, pageElements } from "./elements";
import { checkTree } from "./geometry";
import {
  centreOf,
  isPdfPage,
  pageState,
  pxPerMetre,
  sceneToPage,
  settingsOf,
  sideForReference,
  trenchLineReference,
  trenchLineWidth,
  trenchLineZone,
  treeName,
  treeRingM,
} from "./model";
import { COLORS } from "./render";
import { STR } from "./strings";

import type { ElementZones } from "./elements";

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

/** one zone a tree or element reaches, as a small square: filled when it does */
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

const ZoneMarks = ({ z }: { z: ElementZones }) => (
  <>
    <ZoneMark kind="trench" on={z.inside} />
    <ZoneMark kind="red" on={z.red} />
    <ZoneMark kind="work" on={z.work} />
  </>
);

/** the zones as words, for a card: "werkruimte", or "geen" */
const zonesText = (z: ElementZones) =>
  [
    z.inside && STR.table.inTrench,
    z.red && STR.table.red,
    z.work && STR.table.work,
  ]
    .filter(Boolean)
    .join(", ") || STR.selectedElement.none;

/**
 * The number on a row, styled like its label on the plan: a sleuf blue, a
 * tree green or red by its check, another element grey.
 */
const Num = ({
  n,
  kind,
}: {
  n: number;
  kind: "line" | "tree" | "tree-bad" | "element";
}) => <b className={`vt-n vt-n--${kind}`}>{n}</b>;

/**
 * The tab beside the plan: everything about the current page at a glance.
 * Its activation and scale, how many trees pass, the settings the bar is
 * showing, and its sleuven, trees and other elements as lists numbered like
 * their labels on the plan. Rows are two short lines, so nothing needs
 * sideways scrolling or runs into its neighbour, also at a large text size.
 */
export const VrijTraceSidebar = () => {
  const app = useApp();
  const appState = useExcalidrawAppState();
  const setAppState = useExcalidrawSetAppState();
  const elements = useExcalidrawElements();
  const { libraryItems } = useAtomValue(libraryItemsAtom);
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
  const selectedLines = vt.selectedLines().length;
  const line = vt.shownLineSettings();
  const pageZone = settingsOf(s.parts.network);

  const lines = s.parts.lines.map((l) => {
    const reference = trenchLineReference(l);
    const zone = { ...pageZone, ...trenchLineZone(l) };
    return {
      l,
      widthM: trenchLineWidth(l),
      lengthM: lineLengthM(l as ExcalidrawLinearElement, s.frame),
      reference,
      redSide: sideForReference(zone.redSide, reference),
      workWidthM: zone.workWidthM,
      workSide: sideForReference(zone.workSide, reference),
    };
  });
  const totalM = lines.reduce((m, x) => m + x.lengthM, 0);
  const trees = s.parts.trees.map((t) => ({
    t,
    r: checkTree(
      sceneToPage(s.frame, centreOf(t)),
      treeRingM(t, s.frame),
      s.zones,
      s.active,
    ),
  }));
  const items = pageElements(elements, page.id, libraryItems).map((e) => {
    const item = libraryItems.find((i) => i.id === e.itemId);
    return {
      e,
      name:
        [item?.name, item?.caption].find((v) => typeof v === "string" && v) ??
        STR.lists.unnamed,
      group: typeof item?.group === "string" ? item.group : null,
      z: elementZones(e.elements, s.frame, s.zones, s.active),
    };
  });

  // what is selected on the plan: a card on top, its row highlighted
  const target = selectionTarget(elements, appState.selectedElementIds, {
    libraryItems,
  });
  const onThisPage = target && "pageId" in target && target.pageId === page.id;
  const treeIndex =
    onThisPage && target.kind === "tree"
      ? trees.findIndex(({ t }) => t.id === target.ringId)
      : -1;
  const lineIndex =
    onThisPage && target.kind === "line"
      ? lines.findIndex(({ l }) => l.id === target.lineId)
      : -1;
  const itemIndex =
    onThisPage && target.kind === "element"
      ? items.findIndex(({ e }) => e.key === target.key)
      : -1;
  const passing = trees.filter(({ r }) => r.pass === true).length;
  const failing = trees.filter(({ r }) => r.pass === false).length;

  /** a row selects its sleuf or element on the plan */
  const select = (ids: string[], groupId?: string) =>
    setAppState({
      selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])),
      selectedGroupIds: groupId ? { [groupId]: true } : {},
    });

  const selectedTree = treeIndex >= 0 ? trees[treeIndex] : null;
  const selectedLine = lineIndex >= 0 ? lines[lineIndex] : null;
  const selectedItem = itemIndex >= 0 ? items[itemIndex] : null;

  return (
    <div className="vt-side">
      {selectedTree && (
        <div className="vt-card" data-testid="vt-selected-tree">
          <div className="vt-card__head">
            <span className="vt-h">{STR.selectedTree.title}</span>
            <Num
              n={treeIndex + 1}
              kind={selectedTree.r.pass === false ? "tree-bad" : "tree"}
            />
          </div>
          <b className="vt-card__name">{treeName(selectedTree.t)}</b>
          <div className="vt-sets">
            <div className="vt-set">
              <span>{STR.selectedTree.distance}</span>
              <b className={selectedTree.r.pass === false ? "vt-bad" : ""}>
                {selectedTree.r.distanceM === null
                  ? "—"
                  : `${fmt(selectedTree.r.distanceM)} m`}
              </b>
            </div>
            <div className="vt-set">
              <span>{STR.table.verdict}</span>
              <b
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
              </b>
            </div>
            <div className="vt-set">
              <span>{STR.table.zones}</span>
              <b className="vt-zones">
                <ZoneMarks
                  z={{
                    inside: selectedTree.r.inside,
                    red: selectedTree.r.red,
                    work: selectedTree.r.work,
                  }}
                />
              </b>
            </div>
          </div>
        </div>
      )}
      {selectedLine && (
        <div className="vt-card" data-testid="vt-selected-line">
          <div className="vt-card__head">
            <span className="vt-h">{STR.selectedLine.title}</span>
            <Num n={lineIndex + 1} kind="line" />
          </div>
          <div className="vt-sets">
            <div className="vt-set">
              <span>{STR.labels.width}</span>
              <b>{fmt(selectedLine.widthM)} m</b>
            </div>
            <div className="vt-set">
              <span>{STR.selectedLine.length}</span>
              <b>{fmt(selectedLine.lengthM)} m</b>
            </div>
            <div className="vt-set">
              <span>{STR.labels.reference}</span>
              <b>{REFERENCE_TEXT[selectedLine.reference]}</b>
            </div>
            <div className="vt-set">
              <span>{STR.summary.red}</span>
              <b>{STR.summary.redValue(SIDE_TEXT[selectedLine.redSide])}</b>
            </div>
            <div className="vt-set">
              <span>{STR.summary.work}</span>
              <b>
                {STR.summary.workValue(
                  fmt(selectedLine.workWidthM),
                  SIDE_TEXT[selectedLine.workSide],
                )}
              </b>
            </div>
          </div>
        </div>
      )}
      {selectedItem && (
        <div className="vt-card" data-testid="vt-selected-element">
          <div className="vt-card__head">
            <span className="vt-h">{STR.selectedElement.title}</span>
            <Num n={itemIndex + 1} kind="element" />
          </div>
          <b className="vt-card__name">{selectedItem.name}</b>
          {selectedItem.group && (
            <span className="vt-card__sub">{selectedItem.group}</span>
          )}
          <div className="vt-sets">
            <div className="vt-set">
              <span>{STR.selectedElement.zones}</span>
              <b className="vt-zones">
                <ZoneMarks z={selectedItem.z} /> {zonesText(selectedItem.z)}
              </b>
            </div>
          </div>
          {selectedItem.e.itemId && (
            <button
              type="button"
              className="vt-link"
              data-testid="vt-show-in-library"
              onClick={() =>
                setAppState({
                  openSidebar: {
                    name: DEFAULT_SIDEBAR.name,
                    tab: LIBRARY_SIDEBAR_TAB,
                  },
                })
              }
            >
              {STR.selectedElement.showInLibrary}
            </button>
          )}
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
        {/* the file name on its own line, cut short when long; the scale and
            counts under it */}
        <span className="vt-fname" title={pageName}>
          {pageName}
        </span>
        <span>
          1 m = {fmt(pxPerMetre(s.frame))} px ·{" "}
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
        <div className="vt-block__head">
          <h3 className="vt-h">{STR.lists.lines}</h3>
          {lines.length > 0 && (
            <span>{STR.lists.linesTotal(lines.length, fmt(totalM))}</span>
          )}
        </div>
        {lines.length ? (
          <ul className="vt-list" data-testid="vt-lines">
            {lines.map((x, i) => (
              <li
                key={x.l.id}
                className={i === lineIndex ? "vt-li vt-selected" : "vt-li"}
                onClick={() => select([x.l.id])}
              >
                <span className="vt-c vt-c--n">
                  <Num n={i + 1} kind="line" />
                </span>
                <span className="vt-c vt-c--name">
                  {STR.lists.lineMain(fmt(x.widthM), fmt(x.lengthM))}
                </span>
                <span className="vt-c vt-c--sub">
                  {STR.lists.lineSub(
                    REFERENCE_TEXT[x.reference],
                    SIDE_TEXT[x.redSide],
                    fmt(x.workWidthM),
                    SIDE_TEXT[x.workSide],
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="vt-help">{STR.lists.noLines}</p>
        )}
      </div>

      <div className="vt-block">
        <div className="vt-block__head">
          <h3 className="vt-h">{STR.lists.trees}</h3>
          {trees.length > 0 && <span>{STR.lists.distance}</span>}
        </div>
        {trees.length ? (
          <ul className="vt-list" data-testid="vt-rows">
            {trees.map(({ t, r }, i) => {
              // point at a row (or tap it) to outline its tree on the plan
              const outline = () => app.vrijTrace.setHotTree(t.id);
              return (
                <li
                  key={t.id}
                  className={[
                    "vt-li vt-li--tree",
                    appState.vrijTrace.hotTreeId === t.id ? "vt-hot" : "",
                    i === treeIndex ? "vt-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onPointerEnter={outline}
                  onPointerLeave={() => app.vrijTrace.setHotTree(null)}
                  onClick={outline}
                >
                  <span className="vt-c vt-c--n">
                    <Num
                      n={i + 1}
                      kind={r.pass === false ? "tree-bad" : "tree"}
                    />
                  </span>
                  <span className="vt-c vt-c--name">{treeName(t)}</span>
                  <span
                    className={`vt-c vt-c--dist${
                      r.pass === false ? " vt-bad" : ""
                    }`}
                  >
                    {r.distanceM === null ? "—" : `${fmt(r.distanceM)} m`}
                  </span>
                  <span
                    className={`vt-c vt-c--verdict${
                      r.pass === null ? "" : r.pass ? " vt-ok" : " vt-bad"
                    }`}
                  >
                    {r.pass === null
                      ? "—"
                      : r.pass
                      ? STR.table.ok
                      : STR.table.conflict}
                  </span>
                  <span className="vt-c vt-c--zones vt-zones">
                    <ZoneMarks
                      z={{ inside: r.inside, red: r.red, work: r.work }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="vt-help">{STR.help.trees}</p>
        )}
      </div>

      {items.length > 0 && (
        <div className="vt-block">
          <div className="vt-block__head">
            <h3 className="vt-h">{STR.lists.elements}</h3>
            <span>{items.length}</span>
          </div>
          <ul className="vt-list" data-testid="vt-elements">
            {items.map((x, i) => (
              <li
                key={x.e.key}
                className={i === itemIndex ? "vt-li vt-selected" : "vt-li"}
                onClick={() =>
                  select(
                    x.e.ids,
                    x.e.key !== x.e.ids[0] || x.e.ids.length > 1
                      ? x.e.key
                      : undefined,
                  )
                }
              >
                <span className="vt-c vt-c--n">
                  <Num n={i + 1} kind="element" />
                </span>
                <span className="vt-c vt-c--name">{x.name}</span>
                {x.group && <span className="vt-c vt-c--sub">{x.group}</span>}
                <span className="vt-c vt-c--zones vt-zones">
                  <ZoneMarks z={x.z} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="vt-block">
        <div className="vt-block__head">
          <h3 className="vt-h">{STR.summary.settings}</h3>
        </div>
        <p className="vt-applies" data-testid="vt-applies">
          {selectedLines
            ? STR.applies.selected(selectedLines)
            : STR.applies.next}
        </p>
        <div className="vt-sets" data-testid="vt-settings">
          <div className="vt-set">
            <span>{STR.labels.width}</span>
            <b>{fmt(vt.shownWidth())} m</b>
          </div>
          <div className="vt-set">
            <span>{STR.labels.reference}</span>
            <b>{REFERENCE_TEXT[line.reference]}</b>
          </div>
          <div className="vt-set">
            <span>{STR.summary.red}</span>
            <b>{STR.summary.redValue(SIDE_TEXT[line.redSide])}</b>
          </div>
          <div className="vt-set">
            <span>{STR.summary.work}</span>
            <b>
              {STR.summary.workValue(
                fmt(line.workWidthM),
                SIDE_TEXT[line.workSide],
              )}
            </b>
          </div>
          <div className="vt-set">
            <span>{STR.summary.snap}</span>
            <b>
              {appState.vrijTrace.snap === "vrij"
                ? "Vrij"
                : `${appState.vrijTrace.snap}°`}
            </b>
          </div>
        </div>
      </div>

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
