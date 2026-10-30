import { isImageElement, isTrenchElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawLinearElement,
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

export type TrenchReference = "midden" | "links" | "rechts";

/** a whiteboard line drawn with Vrij Tracé: one trench with its own width */
export const isTrenchLine = (
  el: ExcalidrawElement | null | undefined,
): el is ExcalidrawLinearElement & { customData: Record<string, any> } =>
  !!el &&
  el.type === "line" &&
  el.customData?.tool === "trench" &&
  !el.isDeleted;

export const trenchLineWidth = (line: ExcalidrawLinearElement) => {
  const w = line.customData?.widthM;
  return typeof w === "number" && Number.isFinite(w)
    ? Math.min(2.3, Math.max(0.3, w))
    : 1;
};

export const trenchLineReference = (
  line: ExcalidrawLinearElement,
): TrenchReference => {
  const r = line.customData?.reference;
  return r === "links" || r === "rechts" ? r : "midden";
};

export type PageParts = {
  network: ExcalidrawTrenchElement | null;
  /** legacy parts, from before trenches were lines (migrated on load) */
  nodes: ExcalidrawTrenchElement[];
  segments: ExcalidrawTrenchElement[];
  trees: ExcalidrawTrenchElement[];
  lines: ExcalidrawLinearElement[];
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
    lines: [],
  };
  for (const el of elements) {
    if (isTrenchLine(el) && el.customData?.pdfParentId === pdfId) {
      parts.lines.push(el);
      continue;
    }
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

/** a line's points in scene px, rotated like the whiteboard draws it */
export const trenchLinePoints = (line: ExcalidrawLinearElement): Pt[] => {
  const pts = line.points.map(([x, y]) => ({ x: line.x + x, y: line.y + y }));
  if (!line.angle) {
    return pts;
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const c = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  return pts.map((p) => rotate(p, c, line.angle));
};

/**
 * The polyline moved sideways by `d` along each segment's n = (uy, -ux)
 * (v8.2's drawing reference), joined with mitres; a mitre is capped at 4·|d|
 * so a near reversal cannot throw a corner far away.
 */
const offsetPolyline = (pts: Pt[], d: number): Pt[] => {
  const normals = pts.slice(1).map((b, i) => {
    const a = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  });
  return pts.map((p, i) => {
    const n1 = normals[Math.max(0, i - 1)];
    const n2 = normals[Math.min(normals.length - 1, i)];
    if (!n1 || !n2) {
      return p;
    }
    const k = 1 + n1.x * n2.x + n1.y * n2.y;
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    if (k < 1e-6) {
      mx = n1.x;
      my = n1.y;
    } else {
      mx /= k;
      my /= k;
      const len = Math.hypot(mx, my);
      if (len > 4) {
        mx = (mx / len) * 4;
        my = (my / len) * 4;
      }
    }
    return { x: p.x + mx * d, y: p.y + my * d };
  });
};

/** a trench line as nodes and segments in page metres (ids `line:i`) */
const lineGeometry = (
  line: ExcalidrawLinearElement,
  frame: PageFrame,
  out: NetworkGeometry,
) => {
  const scene = trenchLinePoints(line);
  const widthM = trenchLineWidth(line);
  const ref = trenchLineReference(line);
  const metres = scene.map((p) => sceneToPage(frame, p));
  const centre =
    ref === "midden"
      ? metres
      : offsetPolyline(metres, ref === "links" ? -widthM / 2 : widthM / 2);
  const used = new Set<number>();
  for (let i = 0; i + 1 < scene.length; i++) {
    const a = scene[i];
    const b = scene[i + 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_SEGMENT_PX) {
      continue;
    }
    out.segments.push({
      id: `${line.id}:${i}`,
      a: `${line.id}:${i}`,
      b: `${line.id}:${i + 1}`,
      widthM,
    });
    used.add(i);
    used.add(i + 1);
  }
  centre.forEach((m, i) => {
    if (used.has(i)) {
      out.nodes.push({ id: `${line.id}:${i}`, ...m });
    }
  });
};

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
  const geometry = { nodes, segments };
  for (const line of parts.lines) {
    lineGeometry(line, frame, geometry);
  }
  return geometry;
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

/** live trench parts and lines of the given pages (they travel with their page) */
export const trenchPartsOf = (
  elements: readonly ExcalidrawElement[],
  pageIds: ReadonlySet<string>,
) =>
  elements.filter(
    (el) =>
      (isTrenchElement(el) || isTrenchLine(el)) &&
      !el.isDeleted &&
      pageIds.has(el.customData?.pdfParentId),
  );

/**
 * The copies to select after duplicating: not trench parts, and not the
 * trench lines that came along with their copied page.
 */
export const selectableCopies = (duplicated: readonly ExcalidrawElement[]) => {
  const pages = new Set(duplicated.filter(isPdfPage).map((el) => el.id));
  return duplicated.filter(
    (el) =>
      !isTrenchElement(el) &&
      !(isTrenchLine(el) && pages.has(el.customData?.pdfParentId)),
  );
};

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
