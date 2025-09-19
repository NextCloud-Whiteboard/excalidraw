import clsx from "clsx";

import LibraryMenuBrowseButton from "./LibraryMenuBrowseButton";
import { ToolButton } from "./ToolButton";
import { LoadIcon } from "./icons";
import { t } from "../i18n";
import { useApp } from "./App";
import { fileOpen } from "../data/filesystem";
import { useExcalidrawSetAppState } from "./App";

import type { ExcalidrawProps, UIAppState } from "../types";

const LibraryOpenButton = () => {
  const { library } = useApp();
  const setAppState = useExcalidrawSetAppState();

  const onLibraryImport = async () => {
    try {
      await library.updateLibrary({
        libraryItems: fileOpen({
          description: "Excalidraw library files",
        }),
        merge: true,
        openLibraryMenu: true,
      });
    } catch (error: any) {
      if (error?.name === "AbortError") {
        console.warn(error);
        return;
      }
      setAppState({ errorMessage: t("errors.importLibraryError") });
    }
  };

  return (
    <ToolButton
      type="button"
      title={t("buttons.load")}
      aria-label={t("buttons.load")}
      showAriaLabel={true}
      icon={LoadIcon}
      onClick={onLibraryImport}
      data-testid="lib-empty--load"
      className="library-menu-open-button"
    />
  );
};

export const LibraryMenuControlButtons = ({
  libraryReturnUrl,
  theme,
  id,
  style,
  children,
  className,
  showOpenButton = false,
}: {
  libraryReturnUrl: ExcalidrawProps["libraryReturnUrl"];
  theme: UIAppState["theme"];
  id: string;
  style: React.CSSProperties;
  children?: React.ReactNode;
  className?: string;
  showOpenButton?: boolean;
}) => {
  return (
    <div
      className={clsx("library-menu-control-buttons", className)}
      style={style}
    >
      {showOpenButton ? (
        <LibraryOpenButton />
      ) : (
        <>
          {/* <LibraryMenuBrowseButton
            id={id}
            libraryReturnUrl={libraryReturnUrl}
            theme={theme}
          /> */}
          {children}
        </>
      )}
    </div>
  );
};
