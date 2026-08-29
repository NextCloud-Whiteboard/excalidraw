import { useEffect, useRef } from "react";

import type { NonDeletedSceneElementsMap } from "@excalidraw/element/types";

import { isRenderThrottlingEnabled } from "../../reactUtils";
import { renderNewElementScene } from "../../renderer/renderNewElementScene";

import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../../scene/types";
import type { AppState } from "../../types";
import type { RoughCanvas } from "roughjs/bin/canvas";

interface NewElementCanvasProps {
  appState: AppState;
  elementsMap: RenderableElementsMap;
  allElementsMap: NonDeletedSceneElementsMap;
  scale: number;
  rc: RoughCanvas;
  renderConfig: StaticCanvasRenderConfig;
  handleCanvasRef?: (canvas: HTMLCanvasElement | null) => void;
}

const NewElementCanvas = (props: NewElementCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { handleCanvasRef } = props;
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    renderNewElementScene(
      {
        canvas: canvasRef.current,
        scale: props.scale,
        newElement: props.appState.newElement,
        elementsMap: props.elementsMap,
        allElementsMap: props.allElementsMap,
        rc: props.rc,
        renderConfig: props.renderConfig,
        appState: props.appState,
      },
      isRenderThrottlingEnabled(),
    );
  });

  return (
    <canvas
      className="excalidraw__canvas"
      style={{
        width: props.appState.width,
        height: props.appState.height,
      }}
      width={props.appState.width * props.scale}
      height={props.appState.height * props.scale}
      ref={(canvas) => {
        canvasRef.current = canvas;
        handleCanvasRef?.(canvas);
      }}
    />
  );
};

export default NewElementCanvas;
