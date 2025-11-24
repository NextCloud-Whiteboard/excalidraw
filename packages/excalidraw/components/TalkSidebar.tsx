import clsx from "clsx";

import React, { useEffect, useRef, useLayoutEffect, useState } from "react";

import { withInternalFallback } from "./hoc/withInternalFallback";
import { Sidebar } from "./Sidebar/Sidebar";
import type { SidebarProps } from "./Sidebar/common";
import { t } from "../i18n";
import { useUIAppState } from "../context/ui-appState";

import "./TalkSidebar.scss";
import Spinner from "./Spinner";

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

    useEffect(() => {
      if (callUrl) {
        lastKnownUrlRef.current = callUrl;
      } else if (status === "loading" || status === "error") {
        lastKnownUrlRef.current = null;
      }
    }, [status, callUrl]);

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
    }, [isSidebarOpen]);

    const effectiveUrl =
      status === "error" ? null : callUrl ?? lastKnownUrlRef.current;

    //log the effective url
    console.log("effectiveUrl", effectiveUrl);

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
            style={iframeStyle}
            className={clsx("talk-sidebar__persistent-iframe", {
              "talk-sidebar__persistent-iframe--visible": isSidebarOpen,
            })}
          />
        )}
        <Sidebar
          {...rest}
          name={TALK_SIDEBAR.name}
          className={clsx("talk-sidebar", className)}
        >
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
      </>
    );
  },
);
