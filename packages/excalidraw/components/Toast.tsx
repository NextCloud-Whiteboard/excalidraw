import { useCallback, useEffect, useRef } from "react";

import { CloseIcon } from "./icons";
import { ToolButton } from "./ToolButton";

import "./Toast.scss";

import type { CSSProperties } from "react";

const DEFAULT_TOAST_TIMEOUT = 5000;

// Loading spinner component
const LoadingSpinner = () => (
  <div className="Toast__spinner">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.416"
        strokeDashoffset="31.416"
      >
        <animate
          attributeName="stroke-dasharray"
          dur="2s"
          values="0 31.416;15.708 15.708;0 31.416"
          repeatCount="indefinite"
        />
        <animate
          attributeName="stroke-dashoffset"
          dur="2s"
          values="0;-15.708;-31.416"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  </div>
);

export const Toast = ({
  message,
  onClose,
  closable = false,
  loading = false,
  // To prevent autoclose, pass duration as Infinity
  duration = DEFAULT_TOAST_TIMEOUT,
  style,
}: {
  message: string;
  onClose: () => void;
  closable?: boolean;
  loading?: boolean;
  duration?: number;
  style?: CSSProperties;
}) => {
  const timerRef = useRef<number>(0);
  const shouldAutoClose = duration !== Infinity && !loading;
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
  return (
    <div
      className={`Toast ${loading ? "Toast--loading" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={style}
    >
      {loading && <LoadingSpinner />}
      <p className="Toast__message">{message}</p>
      {closable && !loading && (
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
