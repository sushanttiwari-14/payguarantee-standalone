import { useEffect, useRef, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import type { AgentKind, ProviderKind } from "../../shared/types";

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const agentName: Record<AgentKind, string> = {
  seeded: "Seeded agent",
  corrected: "Corrected agent",
  codex: "Codex · ChatGPT plan",
  imported: "Your agent",
};
export const providerName: Record<ProviderKind, string> = {
  simulator: "Simulator",
  paypal: "PayPal Sandbox",
};
export const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : data?.message ||
          `Request failed (${response.status}). Please try again.`,
    );
  return data as T;
}
export function Status({
  value,
  children,
}: {
  value: string;
  children?: ReactNode;
}) {
  const positive = [
    "pass",
    "passed",
    "COMPLETED",
    "CAPTURED",
    "connected",
    "approved",
  ].includes(value);
  const negative = ["fail", "failed", "FAILED"].includes(value);
  return (
    <span
      className={`status ${positive ? "positive" : negative ? "negative" : "neutral"}`}
    >
      <span className="status-dot" />
      {children || value.toLowerCase()}
    </span>
  );
}
export function BusyIcon({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return busy ? <LoaderCircle size={16} className="spin" /> : children;
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <div className="empty-copy">{children}</div>
    </div>
  );
}

export function useModalFocus(open: boolean, close: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const selector =
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
    const visible = () =>
      [...(ref.current?.querySelectorAll<HTMLElement>(selector) || [])].filter(
        (element) =>
          element.getClientRects().length > 0 && !element.closest("[inert]"),
      );
    const first =
      visible().find((element) =>
        ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName),
      ) || visible()[0];
    (first || ref.current)?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = visible();
      const start = focusable[0];
      const end = focusable[focusable.length - 1];
      if (!start) {
        event.preventDefault();
        ref.current?.focus();
      } else if (!ref.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? end : start)?.focus();
      } else if (event.shiftKey && (document.activeElement === start || document.activeElement === ref.current)) {
        event.preventDefault();
        end?.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [open]);
  return ref;
}
