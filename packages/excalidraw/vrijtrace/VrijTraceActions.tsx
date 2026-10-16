import React from "react";

import { useApp, useExcalidrawActionManager } from "../components/App";

import { STR } from "./strings";

import type { UIAppState } from "../types";

/** v8.2's action row, floating over the canvas while the tool is active */
export const VrijTraceActions = ({ appState }: { appState: UIAppState }) => {
  const app = useApp();
  const actionManager = useExcalidrawActionManager();
  const vt = app.vrijTrace;
  const b = (
    id: string,
    label: string,
    onClick: () => void,
    primary = false,
  ) => (
    <button
      type="button"
      className={primary ? "vt-act vt-act--primary" : "vt-act"}
      data-testid={id}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div className="vt-actions Island">
      {b("vt-activate", STR.actions.activate, () => vt.activate(), true)}
      {b("vt-finish", STR.actions.finish, () => vt.finish())}
      {b("vt-undo", STR.actions.undo, () =>
        actionManager.executeAction(actionManager.actions.undo, "ui"),
      )}
      {b("vt-delete", STR.actions.delete, () => vt.deleteSelectedOrMode())}
      {b("vt-example", STR.actions.example, () => vt.example())}
      {b("vt-clear", STR.actions.clear, () => vt.clear())}
      {b(
        "vt-pdf",
        appState.vrijTrace.hidePdf ? STR.actions.showPdf : STR.actions.hidePdf,
        () => vt.toggleHidePdf(),
      )}
    </div>
  );
};
