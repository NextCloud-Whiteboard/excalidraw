import React, { memo, useEffect, useState } from "react";

import type { ExcalidrawElement, NonDeleted } from "@excalidraw/element/types";

import { useTransition } from "../hooks/useTransition";

import { EmptyLibraryUnit, LibraryUnit } from "./LibraryUnit";

import type { LibraryUnitFrame } from "./LibraryUnit";

import type { SvgCache } from "../hooks/useLibraryItemSvg";
import type { LibraryItem } from "../types";
import type { ReactNode } from "react";

type LibraryOrPendingItem = (
  | LibraryItem
  | /* pending library item */ {
      id: null;
      elements: readonly NonDeleted<ExcalidrawElement>[];
    }
)[];

interface Props {
  items: LibraryOrPendingItem;
  onClick: (id: LibraryItem["id"] | null) => void;
  onItemSelectToggle: (id: LibraryItem["id"], event: React.MouseEvent) => void;
  onItemDrag: (id: LibraryItem["id"], event: React.DragEvent) => void;
  isItemSelected: (id: LibraryItem["id"] | null) => boolean;
  svgCache: SvgCache;
  itemsRenderedPerBatch: number;
  /** draw every tile to this size, so the items share one scale */
  frame?: LibraryUnitFrame;
  /** the item the canvas selection was placed from */
  revealedItemId?: LibraryItem["id"] | null;
}

export const LibraryMenuSectionGrid = ({
  children,
}: {
  children: ReactNode;
}) => {
  return <div className="library-menu-items-container__grid">{children}</div>;
};

export const LibraryMenuSection = memo(
  ({
    items,
    onItemSelectToggle,
    onItemDrag,
    isItemSelected,
    onClick,
    svgCache,
    itemsRenderedPerBatch,
    frame,
    revealedItemId = null,
  }: Props) => {
    const [, startTransition] = useTransition();
    const [index, setIndex] = useState(0);

    useEffect(() => {
      if (index < items.length) {
        startTransition(() => {
          setIndex(index + itemsRenderedPerBatch);
        });
      }
    }, [index, items.length, startTransition, itemsRenderedPerBatch]);

    return (
      <>
        {items.map((item, i) => {
          return i < index ? (
            <LibraryUnit
              elements={item?.elements}
              isPending={!item?.id && !!item?.elements}
              onClick={onClick}
              svgCache={svgCache}
              id={item?.id}
              selected={isItemSelected(item.id)}
              revealed={!!item?.id && item.id === revealedItemId}
              onToggle={onItemSelectToggle}
              onDrag={onItemDrag}
              frame={frame}
              caption={"caption" in item ? item.caption : undefined}
              key={item?.id ?? i}
            />
          ) : (
            <EmptyLibraryUnit key={i} />
          );
        })}
      </>
    );
  },
);
