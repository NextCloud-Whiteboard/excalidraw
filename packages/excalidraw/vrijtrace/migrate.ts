import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
  VrijTraceActivation,
} from "@excalidraw/element/types";

import { chainSegments, newTrenchLine } from "./lines";
import { centreOf, getPageParts, isPdfPage, pageState } from "./model";

export type LegacyMigration = {
  created: ExcalidrawLinearElement[];
  /** node and segment elements to delete */
  deleted: ExcalidrawElement[];
  /** network id → activation re-pointed at the converted layout */
  activations: Map<string, VrijTraceActivation>;
};

/**
 * Boards from before trenches were lines keep their trench as node and
 * segment elements. Turn each page's into trench lines (joined through
 * corners), and keep zones that were activated activated. Null when there
 * is nothing to convert.
 */
export const migrateLegacyTrench = (
  elements: readonly ExcalidrawElement[],
): LegacyMigration | null => {
  const pageIds = new Set<string>();
  for (const el of elements) {
    if (
      el.type === "trench" &&
      !el.isDeleted &&
      (el.trench.kind === "node" || el.trench.kind === "segment")
    ) {
      pageIds.add(el.customData?.pdfParentId);
    }
  }
  const existing = new Set(elements.map((el) => el.id));
  const out: LegacyMigration = {
    created: [],
    deleted: [],
    activations: new Map(),
  };
  for (const pageId of pageIds) {
    const page = elements.find((el) => el.id === pageId);
    if (!isPdfPage(page)) {
      continue;
    }
    const parts = getPageParts(elements, pageId);
    const converted = chainSegments(
      parts.nodes.map((n) => ({ id: n.id, ...centreOf(n) })),
      parts.segments.flatMap((s) =>
        s.trench.kind === "segment"
          ? [
              {
                id: s.id,
                a: s.trench.a,
                b: s.trench.b,
                widthM: s.trench.widthM,
              },
            ]
          : [],
      ),
    ).map((c) =>
      newTrenchLine({
        id: `${c.id}-line`,
        points: c.points,
        widthM: c.widthM,
        pdfParentId: pageId,
      }),
    );
    // a line already on the board (converted elsewhere) is not added twice
    const lines = converted.filter((l) => !existing.has(l.id));
    const removed = [...parts.nodes, ...parts.segments];
    const before = pageState(elements, page);
    const activation =
      parts.network?.trench.kind === "network"
        ? parts.network.trench.activation
        : null;
    if (
      before?.active &&
      activation &&
      parts.network &&
      lines.length === converted.length
    ) {
      const gone = new Set(removed.map((el) => el.id));
      const after = pageState(
        [...elements.filter((el) => !gone.has(el.id)), ...lines],
        page,
      );
      if (after) {
        out.activations.set(parts.network.id, {
          ...activation,
          fingerprint: after.fingerprint,
        });
      }
    }
    out.created.push(...lines);
    out.deleted.push(...removed);
  }
  return out.deleted.length ? out : null;
};
