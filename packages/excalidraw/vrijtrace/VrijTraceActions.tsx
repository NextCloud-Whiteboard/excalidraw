import React, { useEffect, useLayoutEffect, useReducer, useRef } from "react";

import { useApp, useExcalidrawContainer } from "../components/App";

import { isPdfPage, pageState } from "./model";
import { STR } from "./strings";

import type { UIAppState } from "../types";

/**
 * The action bar floating over the canvas while the tool is active: one
 * toggle that shows or hides the zones of the current page. Undo, delete
 * and finishing a line are the whiteboard's own (Ctrl+Z, Delete, Esc).
 */
export const VrijTraceActions = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  const vt = app.vrijTrace;
  // the label follows the zones, which change in the scene, not in app state
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = app.scene.onUpdate(rerender);
    return () => {
      // a destroyed scene has already dropped its listeners
      try {
        unsubscribe();
      } catch {}
    };
  }, [app.scene]);
  const { container } = useExcalidrawContainer();
  const rowRef = useRef<HTMLDivElement>(null);

  // toasts share the bottom centre: keep them above this row (Toast.scss)
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !container) {
      return;
    }
    const update = () =>
      container.style.setProperty(
        "--vt-actions-offset",
        `${Math.round(row.offsetHeight) + 16}px`,
      );
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(row);
    return () => {
      observer?.disconnect();
      container.style.removeProperty("--vt-actions-offset");
    };
  }, [container]);

  const elements = app.scene.getNonDeletedElements();
  const page = elements.find((el) => el.id === appState.vrijTrace.pageId);
  const active = isPdfPage(page) && !!pageState(elements, page)?.active;

  return (
    <div className="vt-actions Island" ref={rowRef}>
      <button
        type="button"
        className={
          active ? "vt-act vt-act--toggle-on" : "vt-act vt-act--primary"
        }
        data-testid="vt-activate"
        aria-pressed={active}
        disabled={!isPdfPage(page)}
        onClick={() => (active ? vt.deactivate() : vt.activate())}
      >
        {active ? STR.actions.deactivate : STR.actions.activate}
      </button>
    </div>
  );
};
