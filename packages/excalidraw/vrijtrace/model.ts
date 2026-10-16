import { isImageElement, isTrenchElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTrenchElement,
} from "@excalidraw/element/types";

import { isValidCmPerPx } from "../data/library";

import { computeZones, fingerprint } from "./geometry";

import type { NetworkGeometry, Pt, ZoneSettings, Zones } from "./geometry";

export const networkIdForPage = (pdfId: string) => `vrijtrace-${pdfId}`;

export const isPdfPage = (
  el: ExcalidrawElement | null | undefined,
): el is ExcalidrawImageElement =>
  !!el && isImageElement(el) && el.customData?.isPdf === true && !el.isDeleted;

export type PageFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  /** null while the page has no ruler calibration */
  cmPerPx: number | null;
};

export const getPageFrame = (page: ExcalidrawImageElement): PageFrame => ({
  id: page.id,
  x: page.x,
  y: page.y,
  width: page.width,
  height: page.height,
  angle: page.angle,
  cmPerPx: isValidCmPerPx(page.customData?.pdfCmPerPx)
    ? page.customData!.pdfCmPerPx
    : null,
});

const rotate = (p: Pt, c: Pt, angle: number): Pt => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
};
const centre = (f: PageFrame): Pt => ({
  x: f.x + f.width / 2,
  y: f.y + f.height / 2,
});

export const pxPerMetre = (f: PageFrame) => 100 / f.cmPerPx!;

/** scene px → metres in the page's own unrotated frame, origin top-left */
export const sceneToPage = (f: PageFrame, p: Pt): Pt => {
  const q = rotate(p, centre(f), -f.angle);
  const k = f.cmPerPx! / 100;
  return { x: (q.x - f.x) * k, y: (q.y - f.y) * k };
};

export const pageToScene = (f: PageFrame, m: Pt): Pt => {
  const k = pxPerMetre(f);
  return rotate({ x: f.x + m.x * k, y: f.y + m.y * k }, centre(f), f.angle);
};

export const centreOf = (el: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Pt => ({
  x: el.x + el.width / 2,
  y: el.y + el.height / 2,
});

export type PageParts = {
  network: ExcalidrawTrenchElement | null;
  nodes: ExcalidrawTrenchElement[];
  segments: ExcalidrawTrenchElement[];
  trees: ExcalidrawTrenchElement[];
};

export const getPageParts = (
  elements: readonly ExcalidrawElement[],
  pdfId: string,
): PageParts => {
  const parts: PageParts = {
    network: null,
    nodes: [],
    segments: [],
    trees: [],
  };
  for (const el of elements) {
    if (
      !isTrenchElement(el) ||
      el.isDeleted ||
      el.customData?.pdfParentId !== pdfId
    ) {
      continue;
    }
    switch (el.trench.kind) {
      case "network":
        parts.network = el;
        break;
      case "node":
        parts.nodes.push(el);
        break;
      case "segment":
        parts.segments.push(el);
        break;
      case "tree":
        parts.trees.push(el);
        break;
    }
  }
  return parts;
};

export const DEFAULT_SETTINGS = {
  redSide: "beide",
  workWidthM: 1.5,
  workSide: "beide",
  treeMinM: 5,
} as const;

export const settingsOf = (
  network: ExcalidrawTrenchElement | null,
): ZoneSettings & { treeMinM: number } =>
  network && network.trench.kind === "network"
    ? {
        redSide: network.trench.redSide,
        workWidthM: network.trench.workWidthM,
        workSide: network.trench.workSide,
        treeMinM: network.trench.treeMinM,
      }
    : { ...DEFAULT_SETTINGS };

export const MIN_SEGMENT_PX = 3;

/** v8.2 req. 9: only visible, valid segments count; unused nodes are ignored. */
export const toGeometry = (
  parts: PageParts,
  frame: PageFrame,
): NetworkGeometry => {
  const nodeById = new Map(parts.nodes.map((n) => [n.id, n]));
  const segments: NetworkGeometry["segments"] = [];
  const used = new Set<string>();
  for (const s of parts.segments) {
    if (s.trench.kind !== "segment") {
      continue;
    }
    const { a, b, widthM } = s.trench;
    const na = nodeById.get(a);
    const nb = nodeById.get(b);
    if (!na || !nb || a === b) {
      continue;
    }
    const ca = centreOf(na);
    const cb = centreOf(nb);
    if (Math.hypot(ca.x - cb.x, ca.y - cb.y) < MIN_SEGMENT_PX) {
      continue;
    }
    segments.push({ id: s.id, a, b, widthM });
    used.add(a);
    used.add(b);
  }
  const nodes = parts.nodes
    .filter((n) => used.has(n.id))
    .map((n) => ({ id: n.id, ...sceneToPage(frame, centreOf(n)) }));
  return { nodes, segments };
};

const labelOf = (t: ExcalidrawTrenchElement) =>
  t.trench.kind === "tree" ? t.trench.label : "B?";

/** v8.2 labels; simultaneous duplicates show as "B4", "B4b" in id order */
export const displayLabels = (trees: ExcalidrawTrenchElement[]) => {
  const out = new Map<string, string>();
  const byLabel = new Map<string, ExcalidrawTrenchElement[]>();
  for (const t of trees) {
    byLabel.set(labelOf(t), [...(byLabel.get(labelOf(t)) ?? []), t]);
  }
  for (const [label, group] of byLabel) {
    group
      .sort((x, y) => (x.id < y.id ? -1 : 1))
      .forEach((t, i) => {
        out.set(t.id, i === 0 ? label : label + String.fromCharCode(97 + i));
      });
  }
  return out;
};

export const nextTreeLabel = (trees: ExcalidrawTrenchElement[]) => {
  const used = new Set(trees.map(labelOf));
  for (let i = 1; ; i++) {
    if (!used.has(`B${i}`)) {
      return `B${i}`;
    }
  }
};

const zoneCache = new Map<string, Zones>();

export type PageState = {
  frame: PageFrame;
  parts: PageParts;
  geometry: NetworkGeometry;
  settings: ZoneSettings & { treeMinM: number };
  zones: Zones;
  fingerprint: string;
  active: boolean;
};

/** Everything the renderer and the sidebar need for one page; null if uncalibrated. */
export const pageState = (
  elements: readonly ExcalidrawElement[],
  page: ExcalidrawImageElement,
): PageState | null => {
  const frame = getPageFrame(page);
  if (!frame.cmPerPx) {
    return null;
  }
  const parts = getPageParts(elements, page.id);
  const geometry = toGeometry(parts, frame);
  const settings = settingsOf(parts.network);
  const fp = fingerprint(geometry, settings);
  const key = `${page.id}|${fp}`;
  let zones = zoneCache.get(key);
  if (!zones) {
    zones = computeZones(geometry, settings);
    zoneCache.set(key, zones);
    if (zoneCache.size > 64) {
      zoneCache.delete(zoneCache.keys().next().value!);
    }
  }
  const activation =
    parts.network?.trench.kind === "network"
      ? parts.network.trench.activation
      : null;
  return {
    frame,
    parts,
    geometry,
    settings,
    zones,
    fingerprint: fp,
    active: activation?.fingerprint === fp,
  };
};

/** live trench parts of the given pages (they travel with their page) */
export const trenchPartsOf = (
  elements: readonly ExcalidrawElement[],
  pageIds: ReadonlySet<string>,
) =>
  elements.filter(
    (el): el is ExcalidrawTrenchElement =>
      isTrenchElement(el) &&
      !el.isDeleted &&
      pageIds.has(el.customData?.pdfParentId),
  );

/**
 * After pages were duplicated together with their trench parts: give each
 * copied network its page's fixed id and point copied segments at the copied
 * nodes. `pdfParentId` itself is remapped by duplication.
 */
export const remapTrenchIds = (
  duplicated: readonly ExcalidrawElement[],
  origIdToDuplicateId: ReadonlyMap<string, string>,
) => {
  for (const dup of duplicated) {
    if (!isTrenchElement(dup)) {
      continue;
    }
    const trench = dup.trench;
    if (trench.kind === "network") {
      Object.assign(dup, {
        id: networkIdForPage(dup.customData?.pdfParentId),
      });
    } else if (trench.kind === "segment") {
      Object.assign(dup, {
        trench: {
          ...trench,
          a: origIdToDuplicateId.get(trench.a) ?? trench.a,
          b: origIdToDuplicateId.get(trench.b) ?? trench.b,
        },
      });
    }
  }
};
