import clsx from "clsx";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { t } from "../i18n";
import { useUIAppState } from "../context/ui-appState";

import { withInternalFallback } from "./hoc/withInternalFallback";
import { Sidebar } from "./Sidebar/Sidebar";
import Spinner from "./Spinner";

import "./TalkSidebar.scss";

import type { SidebarProps } from "./Sidebar/common";

export const TALK_SIDEBAR = {
  name: "talk",
  defaultTab: "talk",
  url: "",
} as const;

type TalkSidebarProps = Omit<SidebarProps, "name" | "children"> & {
  /**
   * Override for the talk iframe URL. Primarily useful for host apps.
   */
  callUrl?: string;
  status?: "idle" | "loading" | "ready" | "error";
  statusMessage?: string;
};

export const TalkSidebar = withInternalFallback(
  "TalkSidebar",
  ({
    className,
    callUrl,
    status = "idle",
    statusMessage,
    ...rest
  }: TalkSidebarProps) => {
    const lastKnownUrlRef = useRef<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const placeholderRef = useRef<HTMLDivElement | null>(null);
    const appState = useUIAppState();
    const isSidebarOpen = appState.openSidebar?.name === TALK_SIDEBAR.name;
    const [iframeStyle, setIframeStyle] = useState<React.CSSProperties>({});

    const [width, setWidth] = useState(420);
    const [isResizing, setIsResizing] = useState(false);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      setIsResizing(true);
      e.preventDefault();
    }, []);

    useEffect(() => {
      if (!isResizing) {
        return;
      }

      const handleMouseMove = (e: MouseEvent) => {
        const newWidth = window.innerWidth - e.clientX;
        const clampedWidth = Math.max(
          300,
          Math.min(newWidth, window.innerWidth - 50),
        );
        setWidth(clampedWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }, [isResizing]);

    useEffect(() => {
      if (callUrl) {
        lastKnownUrlRef.current = callUrl;
      }
    }, [callUrl]);

    const effectiveUrl =
      status === "error" ? null : callUrl ?? lastKnownUrlRef.current;

    // Position the iframe to overlay the placeholder
    useLayoutEffect(() => {
      if (!isSidebarOpen || !placeholderRef.current) {
        return;
      }

      const updatePosition = () => {
        const placeholder = placeholderRef.current;
        if (!placeholder) {
          return;
        }

        const rect = placeholder.getBoundingClientRect();
        setIframeStyle({
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        });
      };

      updatePosition();

      // Update position on resize or scroll
      const observer = new ResizeObserver(updatePosition);
      observer.observe(placeholderRef.current);
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);

      return () => {
        observer.disconnect();
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };
    }, [isSidebarOpen, effectiveUrl]);

    const placeholderMessage =
      status === "error"
        ? statusMessage || t("talkSidebar.error.generic")
        : statusMessage || t("talkSidebar.loading");

    return (
      <>
        {/* Keep iframe mounted but hidden when sidebar is closed */}
        {effectiveUrl && (
          <iframe
            ref={iframeRef}
            title={t("toolBar.talk")}
            src={effectiveUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            allowFullScreen
            loading="lazy"
            style={{
              ...iframeStyle,
              pointerEvents: isResizing ? "none" : undefined,
            }}
            className={clsx("talk-sidebar__persistent-iframe", {
              "talk-sidebar__persistent-iframe--visible": isSidebarOpen,
            })}
          />
        )}
        <Sidebar
          {...rest}
          name={TALK_SIDEBAR.name}
          className={clsx("talk-sidebar", className)}
          style={{ width }}
        >
          <div
            className="talk-sidebar__resize-handle"
            onMouseDown={handleMouseDown}
          />
          <Sidebar.Header>
            <div className="talk-sidebar__title">{t("toolBar.talk")}</div>
          </Sidebar.Header>
          <div className="talk-sidebar__content">
            {effectiveUrl ? (
              // Show a placeholder div that the iframe will overlay
              <div
                ref={placeholderRef}
                className="talk-sidebar__iframe-placeholder"
              />
            ) : (
              <div className="talk-sidebar__placeholder">
                {status === "loading" && (
                  <Spinner className="talk-sidebar__spinner" size="2.5rem" />
                )}
                <span>{placeholderMessage}</span>
              </div>
            )}
          </div>
        </Sidebar>
        <div
          className="talk-sidebar__resizer"
          onMouseDown={handleMouseDown}
          style={{ cursor: isResizing ? "ew-resize" : "default" }}
        />
      </>
    );
  },
);
