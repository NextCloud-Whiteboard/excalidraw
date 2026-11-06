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

/**
 * Which part of the trench the drawn line is: its centre, or one of its
 * edges. Edges are directions on the plan, whichever way the line was drawn:
 * "links" is the left edge (the trench lies to its right), "boven" the top
 * edge (the trench lies below it), and so on.
 */
export type TrenchReference = "midden" | "links" | "rechts" | "boven" | "onder";

export const TRENCH_WIDTH_MIN_M = 0.3;
export const TRENCH_WIDTH_MAX_M = 10;

export const clampTrenchWidth = (widthM: number) =>
  Math.min(TRENCH_WIDTH_MAX_M, Math.max(TRENCH_WIDTH_MIN_M, widthM));

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
  return typeof w === "number" && Number.isFinite(w) ? clampTrenchWidth(w) : 1;
};

export const trenchLineReference = (
  line: ExcalidrawLinearElement,
): TrenchReference => {
  const r = line.customData?.reference;
  return r === "links" || r === "rechts" || r === "boven" || r === "onder"
    ? r
    : "midden";
};

/**
 * A library tree is its whole drawing; its dashed outer ring (the CINH
 * toetsstraal) carries customData.treeRing and stands for the tree.
 */
export const isTreeRing = (el: ExcalidrawElement | null | undefined) =>
  !!el &&
  el.type === "ellipse" &&
  !el.isDeleted &&
  typeof el.customData?.treeRing === "object" &&
  el.customData.treeRing !== null;

/** a tree's ring radius in metres, as drawn on its page */
export const treeRingM = (ring: ExcalidrawElement, frame: PageFrame) =>
  ((ring.width + ring.height) / 4) * (frame.cmPerPx! / 100);

const TREE_CLASS: Record<string, string> = {
  C1: "C1 groot",
  C2: "C2 middel",
  C3: "C3 klein",
};

/** "C1 groot, zonder scherm": the tree's class and root screen */
export const treeName = (ring: ExcalidrawElement) => {
  const { klasse, scherm } = ring.customData?.treeRing ?? {};
  const cls = TREE_CLASS[klasse];
  return cls ? `${cls}, ${scherm ? "met" : "zonder"} scherm` : "Boom";
};

export type PageParts = {
  network: ExcalidrawTrenchElement | null;
  /** legacy parts, from before trenches were lines (migrated on load) */
  nodes: ExcalidrawTrenchElement[];
  segments: ExcalidrawTrenchElement[];
  /** the rings of the library trees on the page, in drawing order */
  trees: ExcalidrawElement[];
  /** old B-markers, from before trees came from the library (removed on load) */
  legacyTrees: ExcalidrawTrenchElement[];
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
    legacyTrees: [],
    lines: [],
  };
  for (const el of elements) {
    if (isTrenchLine(el) && el.customData?.pdfParentId === pdfId) {
      parts.lines.push(el);
      continue;
    }
    if (isTreeRing(el) && el.customData?.pdfParentId === pdfId) {
      parts.trees.push(el);
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
        parts.legacyTrees.push(el);
        break;
    }
  }
  return parts;
};

export const DEFAULT_SETTINGS = {
  redSide: "beide",
  workWidthM: 1.5,
  workSide: "beide",
  treeMinM: 0,
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

/** trench lines are drawn thin unless the page says otherwise */
export const DEFAULT_LINE_WIDTH_PX = 0.5;
/** the Lijndikte slider's range (restore clamps loaded values to it) */
export const LINE_WIDTH_MIN_PX = 0.1;
export const LINE_WIDTH_MAX_PX = 4;

/** the stroke width a page's trench lines are drawn with */
export const lineWidthOf = (network: ExcalidrawTrenchElement | null) =>
  network?.trench.kind === "network" && network.trench.lineWidthPx
    ? network.trench.lineWidthPx
    : DEFAULT_LINE_WIDTH_PX;

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

/** the closed band `half` either side of a polyline, mitred like the trench */
export const outlinePolygon = (pts: Pt[], half: number): Pt[] => [
  ...offsetPolyline(pts, half),
  ...offsetPolyline(pts, -half).reverse(),
];

/** the plan direction each edge reference puts the trench towards (y down) */
const EDGE_TOWARDS: Record<Exclude<TrenchReference, "midden">, Pt> = {
  boven: { x: 0, y: 1 }, // the top edge: the trench lies below
  onder: { x: 0, y: -1 }, // the bottom edge: the trench lies above
  links: { x: 1, y: 0 }, // the left edge: the trench lies to the right
  rechts: { x: -1, y: 0 }, // the right edge: the trench lies to the left
};

/** a line within this angle of an edge's own direction keeps a fixed side */
const EDGE_DEAD_ZONE = Math.sin((10 * Math.PI) / 180);

/** the fixed side there: links = onder, rechts = boven, boven = rechts, onder = links */
const EDGE_FALLBACK: Record<Exclude<TrenchReference, "midden">, Pt> = {
  links: EDGE_TOWARDS.onder,
  rechts: EDGE_TOWARDS.boven,
  boven: EDGE_TOWARDS.rechts,
  onder: EDGE_TOWARDS.links,
};

/**
 * The sideways shift (along n = (uy, -ux) of the line's overall direction,
 * see offsetPolyline) that puts the centre half a width from the drawn edge,
 * on the side of the line that faces the direction the reference names, for
 * any slope and either drawing direction. A line (nearly) parallel to that
 * direction has no such side and takes a fixed one, so neither the drawing
 * direction nor a slight wobble picks it.
 */
const edgeOffset = (
  metres: Pt[],
  ref: Exclude<TrenchReference, "midden">,
  widthM: number,
) => {
  const first = metres[0];
  const last = metres[metres.length - 1];
  const len = Math.hypot(last.x - first.x, last.y - first.y) || 1;
  const n = { x: (last.y - first.y) / len, y: -(last.x - first.x) / len };
  const facing = (t: Pt) => n.x * t.x + n.y * t.y;
  const towards =
    Math.abs(facing(EDGE_TOWARDS[ref])) < EDGE_DEAD_ZONE
      ? EDGE_FALLBACK[ref]
      : EDGE_TOWARDS[ref];
  return facing(towards) >= 0 ? widthM / 2 : -widthM / 2;
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
      : offsetPolyline(metres, edgeOffset(metres, ref, widthM));
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

const zoneCache = new Map<string, Zones>();

export type PageState = {
  frame: PageFrame;
  parts: PageParts;
  geometry: NetworkGeometry;
  settings: ZoneSettings & { treeMinM: number };
  zones: Zones;
  fingerprint: string;
  active: boolean;
  /** activated once, but the layout or zone settings changed since: the
   * zones are shown as a concept until someone activates them again */
  stale: boolean;
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
    stale: !!activation && activation.fingerprint !== fp,
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
