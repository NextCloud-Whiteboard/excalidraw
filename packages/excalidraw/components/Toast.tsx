import type { CSSProperties } from "react";
import React, { useCallback, useEffect, useRef } from "react";
import { ToolButton } from "./ToolButton";
import { CloseIcon } from "./icons";
import { t } from "../i18n";

import "./Toast.scss";

const DEFAULT_TOAST_TIMEOUT = 5000;

const LoadingSpinner = React.memo(() => (
  <div className="Toast__spinner">
    <svg
      className="Icon"
      width="20px"
      height="20px"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        opacity="0.2"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 19C15.866 19 19 15.866 19 12C19 8.13401 15.866 5 12 5C8.13401 5 5 8.13401 5 12C5 15.866 8.13401 19 12 19ZM12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
        fill="currentColor"
      />
      <path
        d="M2 12C2 6.47715 6.47715 2 12 2V5C8.13401 5 5 8.13401 5 12H2Z"
        fill="currentColor"
      />
    </svg>
  </div>
));

export const Toast = ({
  message,
  onClose,
  closable = false,
  loading = false,
  progress, // New progress prop (0-100)
  // To prevent autoclose, pass duration as Infinity
  duration = DEFAULT_TOAST_TIMEOUT,
  style,
}: {
  message: string;
  onClose: () => void;
  closable?: boolean;
  loading?: boolean;
  progress?: number; // Progress value from 0 to 100
  duration?: number;
  style?: CSSProperties;
}) => {
  const timerRef = useRef<number>(0);
  const shouldAutoClose = duration !== Infinity && !loading && progress === undefined;
  const scheduleTimeout = useCallback(() => {
    if (!shouldAutoClose) {
      return;
    }
    timerRef.current = window.setTimeout(() => onClose(), duration);
  }, [onClose, duration, shouldAutoClose]);

  useEffect(() => {
    if (!shouldAutoClose) {
      return;
    }
    scheduleTimeout();
    return () => clearTimeout(timerRef.current);
  }, [scheduleTimeout, message, duration, shouldAutoClose]);

  const onMouseEnter = shouldAutoClose
    ? () => clearTimeout(timerRef?.current)
    : undefined;
  const onMouseLeave = shouldAutoClose ? scheduleTimeout : undefined;
  
  const showProgress = progress !== undefined;
  const showSpinner = loading && !showProgress;
  
  return (
    <div
      className={`Toast ${showSpinner ? "Toast--loading" : ""} ${showProgress ? "Toast--progress" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
    >
      {showSpinner && <LoadingSpinner />}
      <p className="Toast__message">{message}</p>
      {showProgress && (
        <div className="Toast__progress-container">
          <div 
            className="Toast__progress-bar"
            style={{ 
              width: `${Math.max(0, Math.min(100, progress))}%`,
              minWidth: '2px' // Ensure it's always visible
            }}
          />
        </div>
      )}
      {closable && !loading && progress === undefined && (
        <ToolButton
          icon={CloseIcon}
          aria-label="close"
          type="icon"
          onClick={onClose}
          className="close"
        />
      )}
    </div>
  );
};
