import clsx from "clsx";
import { memo, useEffect, useRef, useState } from "react";

import { getCommonBounds } from "@excalidraw/element";

import { useLibraryItemSvg } from "../hooks/useLibraryItemSvg";

import { useDevice } from "./App";
import { CheckboxItem } from "./CheckboxItem";
import { PlusIcon } from "./icons";

import "./LibraryUnit.scss";

import type { LibraryItem } from "../types";
import type { SvgCache } from "../hooks/useLibraryItemSvg";

/** the size, in scene units, a tile's drawing is centred in */
export type LibraryUnitFrame = { width: number; height: number };

/**
 * Widen the exported svg's viewBox so the drawing sits centred in `frame`:
 * tiles with the same frame show their items at one scale.
 */
const fitToFrame = (
  svg: SVGSVGElement,
  elements: LibraryItem["elements"],
  frame: LibraryUnitFrame,
) => {
  const box = svg.getAttribute("viewBox")?.split(" ").map(Number);
  if (!box || box.length !== 4 || box.some((v) => !Number.isFinite(v))) {
    return;
  }
  const [x1, y1, x2, y2] = getCommonBounds(elements);
  const extraW = Math.max(0, frame.width - (x2 - x1));
  const extraH = Math.max(0, frame.height - (y2 - y1));
  const [x, y, w, h] = box;
  svg.setAttribute(
    "viewBox",
    `${x - extraW / 2} ${y - extraH / 2} ${w + extraW} ${h + extraH}`,
  );
  svg.setAttribute("width", `${w + extraW}`);
  svg.setAttribute("height", `${h + extraH}`);
};

export const LibraryUnit = memo(
  ({
    id,
    elements,
    isPending,
    onClick,
    selected,
    onToggle,
    onDrag,
    svgCache,
    frame,
    caption,
    revealed = false,
  }: {
    id: LibraryItem["id"] | /** for pending item */ null;
    elements?: LibraryItem["elements"];
    isPending?: boolean;
    onClick: (id: LibraryItem["id"] | null) => void;
    selected: boolean;
    onToggle: (id: string, event: React.MouseEvent) => void;
    onDrag: (id: string, event: React.DragEvent) => void;
    svgCache: SvgCache;
    frame?: LibraryUnitFrame;
    caption?: string;
    /** placed from this item, and selected on the canvas */
    revealed?: boolean;
  }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    // bring the tile of the item selected on the canvas into view
    useEffect(() => {
      if (revealed) {
        ref.current?.scrollIntoView?.({ block: "nearest" });
      }
    }, [revealed]);
    const svg = useLibraryItemSvg(id, elements, svgCache);

    useEffect(() => {
      const node = ref.current;

      if (!node) {
        return;
      }

      if (svg) {
        node.innerHTML = svg.outerHTML;
        const shown = node.querySelector("svg");
        if (shown && frame && elements) {
          fitToFrame(shown, elements, frame);
        }
      }

      return () => {
        node.innerHTML = "";
      };
    }, [svg, frame?.width, frame?.height, elements]); // eslint-disable-line react-hooks/exhaustive-deps

    const [isHovered, setIsHovered] = useState(false);
    const isMobile = useDevice().editor.isMobile;
    const adder = isPending && (
      <div className="library-unit__adder">{PlusIcon}</div>
    );

    const unit = (
      <div
        className={clsx("library-unit", {
          "library-unit__active": elements,
          "library-unit--hover": elements && isHovered,
          "library-unit--selected": selected,
          "library-unit--revealed": revealed,
          "library-unit--skeleton": !svg,
        })}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={clsx("library-unit__dragger", {
            "library-unit__pulse": !!isPending,
          })}
          ref={ref}
          draggable={!!elements}
          onClick={
            !!elements || !!isPending
              ? (event) => {
                  if (id && event.shiftKey) {
                    onToggle(id, event);
                  } else {
                    onClick(id);
                  }
                }
              : undefined
          }
          onDragStart={(event) => {
            if (!id) {
              event.preventDefault();
              return;
            }
            setIsHovered(false);
            onDrag(id, event);
          }}
        />
        {adder}
        {id && elements && (isHovered || isMobile || selected) && (
          <CheckboxItem
            checked={selected}
            onChange={(checked, event) => onToggle(id, event)}
            className="library-unit__checkbox"
          />
        )}
      </div>
    );
    // a library file can hold anything in this field, so only text counts
    return typeof caption === "string" && caption ? (
      <div className="library-unit-cell">
        {unit}
        <div className="library-unit__caption">{caption}</div>
      </div>
    ) : (
      unit
    );
  },
);

export const EmptyLibraryUnit = () => (
  <div className="library-unit library-unit--skeleton" />
);
