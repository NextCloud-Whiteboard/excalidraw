import type { UIAppState } from "@excalidraw/excalidraw/types";

import { getSelectedElements } from "./selection";

import type { NonDeletedExcalidrawElement } from "./types";

export const showSelectedShapeActions = (
  appState: UIAppState,
  elements: readonly NonDeletedExcalidrawElement[],
) =>
  Boolean(
    !appState.viewModeEnabled &&
      appState.openDialog?.name !== "elementLinkSelector" &&
      ((appState.activeTool.type !== "custom" &&
        (appState.editingTextElement ||
          (appState.activeTool.type !== "selection" &&
            appState.activeTool.type !== "lasso" &&
            appState.activeTool.type !== "eraser" &&
            appState.activeTool.type !== "hand" &&
            appState.activeTool.type !== "laser"))) ||
        // Ruler is a custom tool but should show the properties panel while
        // active so the scale/unit can be set before drawing.
        (appState.activeTool.type === "custom" &&
          appState.activeTool.customType === "ruler") ||
        getSelectedElements(elements, appState).length),
  );
