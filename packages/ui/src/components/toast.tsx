"use client"

import * as React from "react"
import { Alert01Icon, Cancel01Icon, InformationCircleIcon, ReloadIcon, Tick02Icon } from "@hugeicons/core-free-icons"
import { cn } from "@workspace/ui/lib/utils"
import { Icon } from "./icon"

export type ToastVariant = "info" | "success" | "warning" | "error" | "transaction-progress"

export type ToastAction = {
  label: string
  onClick: () => void
}

export type ToastItem = {
  id: string
  message: string
  description?: React.ReactNode
  variant: ToastVariant
  duration: number
  action?: ToastAction
  persistent?: boolean
}

let _counter = 0
function nextId() {
  return `toast-${++_counter}`
}

type ToastListener = (toasts: Array<ToastItem>) => void
const listeners = new Set<ToastListener>()
let toasts: Array<ToastItem> = []

function emit() {
  listeners.forEach(l => l([...toasts]))
}

function isSameContent(a: ToastItem, b: { message: string; variant: ToastVariant }) {
  return a.message === b.message && a.variant === b.variant
}

export const toast = {
  show: (item: Omit<ToastItem, "id" | "duration"> & { id?: string, duration?: number }) => {
    const id = item.id || nextId()
    const duration = item.duration ?? 4000
    const newItem = { ...item, id, duration }
    const existingIdx = toasts.findIndex(t => t.id === id)
    if (existingIdx >= 0) {
      // Content update in place: same DOM node, no entrance replay (OB-092).
      toasts[existingIdx] = newItem
    } else {
      // Coalesce a burst of identical notifications onto one row (OB-092):
      // refresh the existing row instead of stacking duplicates.
      const duplicateIdx = toasts.findIndex(t => isSameContent(t, newItem))
      if (duplicateIdx >= 0) {
        toasts[duplicateIdx] = { ...newItem, id: toasts[duplicateIdx].id }
        emit()
        return toasts[duplicateIdx].id
      }
      toasts = [...toasts, newItem]
    }
    emit()
    return id
  },
  success: (message: string, opts?: Omit<Partial<ToastItem>, "message" | "variant">) => {
    return toast.show({ message, variant: "success", ...opts })
  },
  error: (message: string, opts?: Omit<Partial<ToastItem>, "message" | "variant">) => {
    return toast.show({ message, variant: "error", ...opts })
  },
  info: (message: string, opts?: Omit<Partial<ToastItem>, "message" | "variant">) => {
    return toast.show({ message, variant: "info", ...opts })
  },
  warning: (message: string, opts?: Omit<Partial<ToastItem>, "message" | "variant">) => {
    return toast.show({ message, variant: "warning", ...opts })
  },
  loading: (message: string, opts?: Omit<Partial<ToastItem>, "message" | "variant">) => {
    return toast.show({ message, variant: "transaction-progress", duration: 0, persistent: true, ...opts })
  },
  dismiss: (id: string) => {
    toasts = toasts.filter(t => t.id !== id)
    emit()
  },
}

export function useToast() {
  const [currentToasts, setCurrentToasts] = React.useState<Array<ToastItem>>(toasts)

  React.useEffect(() => {
    const listener = (newToasts: Array<ToastItem>) => setCurrentToasts(newToasts)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return { toasts: currentToasts, toast, dismiss: toast.dismiss }
}

// Semantic token surfaces (OB-092): no raw variant colors. Pairs mirror
// `status-badge` subtle fills so a success toast reads as the same green as
// a success badge in either theme.
const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-success-border bg-success-subtle text-success-foreground",
  error: "border-danger-border bg-danger-subtle text-danger-foreground",
  warning: "border-warning-border bg-warning-subtle text-warning-foreground",
  info: "border-info-border bg-info-subtle text-info-foreground",
  "transaction-progress": "border-info-border bg-info-subtle text-info-foreground",
}

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <Icon icon={Tick02Icon} size="md" tone="success" />,
  error: <Icon icon={Cancel01Icon} size="md" tone="error" />,
  warning: <Icon icon={Alert01Icon} size="md" tone="warning" />,
  info: <Icon icon={InformationCircleIcon} size="md" tone="info" />,
  "transaction-progress": <Icon icon={ReloadIcon} size="md" tone="info" className="animate-spin motion-reduce:animate-none" />,
}

const VARIANT_LABEL: Record<ToastVariant, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
  "transaction-progress": "Transaction in progress",
}

/** Exit duration matches `--duration-base` (motion spec: toast 150ms ease-out/in). */
export const TOAST_EXIT_MS = 150

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return reduced
}

function Toast({
  item,
  onDismiss,
  present = true,
}: {
  item: ToastItem
  onDismiss: (id: string) => void
  present?: boolean
}) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isHovered, setIsHovered] = React.useState(false)
  // Entrance runs once on mount; content updates reuse the same node (OB-092).
  const [entered, setEntered] = React.useState(false)
  const [closing, setClosing] = React.useState(false)
  const reducedMotion = usePrefersReducedMotion()

  React.useEffect(() => {
    if (reducedMotion) {
      setEntered(true)
      return
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [reducedMotion])

  // A content update for the same id cancels a pending exit (rapid reversal).
  // Guarded by a content snapshot so starting an exit does not immediately
  // cancel itself: only a changed message/description/variant reverses it.
  const lastContent = React.useRef({ message: item.message, description: item.description, variant: item.variant })
  React.useEffect(() => {
    const prev = lastContent.current
    const changed =
      prev.message !== item.message || prev.description !== item.description || prev.variant !== item.variant
    lastContent.current = { message: item.message, description: item.description, variant: item.variant }
    if (changed && closing && present) {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
      setClosing(false)
    }
  }, [item.message, item.description, item.variant, closing, present])

  const requestDismiss = React.useCallback(() => {
    if (reducedMotion) {
      onDismiss(item.id)
      return
    }
    setClosing(true)
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    exitTimerRef.current = setTimeout(() => onDismiss(item.id), TOAST_EXIT_MS)
  }, [item.id, onDismiss, reducedMotion])

  React.useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    if (!present) {
      // Provider-driven exit (store already removed the row): play the
      // symmetric exit path, then let the provider unmount us.
      if (reducedMotion) return
      setClosing(true)
      return
    }
    if (item.persistent || item.duration <= 0 || isHovered) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    timerRef.current = setTimeout(() => requestDismiss(), item.duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [item.id, item.duration, item.persistent, isHovered, onDismiss, present, reducedMotion, requestDismiss])

  const visible = entered && !closing && present

  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="toast"
      data-variant={item.variant}
      data-state={visible ? "open" : "closed"}
      aria-hidden={!visible || undefined}
      inert={!visible ? true : undefined}
      aria-label={`${VARIANT_LABEL[item.variant]}: ${item.message}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      className={cn(
        "pointer-events-auto flex w-80 flex-col gap-2 rounded-lg border p-4 text-sm shadow-lg",
        "transition-[opacity,transform] duration-[var(--duration-base)] motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100 ease-[var(--ease-out)]" : "-translate-y-2 opacity-0 ease-[var(--ease-in)]",
        !visible && "pointer-events-none",
        VARIANT_CLASSES[item.variant],
      )}
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 items-start gap-3">
          <div className="mt-0.5 shrink-0">{VARIANT_ICONS[item.variant]}</div>
          <div className="flex flex-col gap-1">
            <span className="font-medium leading-none">{item.message}</span>
            {item.description && (
              <div className="mt-1 text-xs opacity-90">{item.description}</div>
            )}
          </div>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => requestDismiss()}
          className="shrink-0 opacity-70 outline-none hover:opacity-100 focus:opacity-100"
        >
          <Icon icon={Cancel01Icon} size="sm" />
        </button>
      </div>
      {item.action && (
        <div className="mt-2 pl-8">
          <button
            onClick={() => {
              item.action?.onClick()
              requestDismiss()
            }}
            className="text-xs font-medium underline underline-offset-2 opacity-80 outline-none hover:opacity-100 focus:opacity-100"
          >
            {item.action.label}
          </button>
        </div>
      )}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts: activeToasts, dismiss } = useToast()
  const [exiting, setExiting] = React.useState<Array<ToastItem>>([])
  const exitTimers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const snapshot = React.useRef(new Map<string, ToastItem>())

  for (const t of activeToasts) snapshot.current.set(t.id, t)

  // Retain removed rows through the exit transition so arrival, dismissal,
  // and bursts never teleport, replay, or shift page content (OB-092).
  // A re-added id cancels its exit (rapid reversal → symmetric return).
  React.useEffect(() => {
    const activeIds = new Set(activeToasts.map(t => t.id))

    for (const item of activeToasts) {
      const timer = exitTimers.current.get(item.id)
      if (timer) {
        clearTimeout(timer)
        exitTimers.current.delete(item.id)
        setExiting(prev => prev.filter(t => t.id !== item.id))
      }
    }

    const disappeared: Array<ToastItem> = []
    snapshot.current.forEach((item, id) => {
      if (!activeIds.has(id) && !exitTimers.current.has(id) && !exiting.some(e => e.id === id)) {
        disappeared.push(item)
      }
    })
    if (disappeared.length === 0) return

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches

    setExiting(prev => [...prev, ...disappeared])
    for (const item of disappeared) {
      const timer = setTimeout(() => {
        exitTimers.current.delete(item.id)
        snapshot.current.delete(item.id)
        setExiting(prev => prev.filter(t => t.id !== item.id))
      }, reduced ? 0 : TOAST_EXIT_MS)
      exitTimers.current.set(item.id, timer)
    }
  }, [activeToasts, exiting])

  React.useEffect(() => {
    const timers = exitTimers.current
    return () => {
      timers.forEach(timer => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  return (
    <>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2"
      >
        {activeToasts.map((t) => (
          <Toast key={t.id} item={t} onDismiss={dismiss} present />
        ))}
        {exiting
          .filter(t => !activeToasts.some(a => a.id === t.id))
          .map((t) => (
            <Toast key={`exiting-${t.id}`} item={t} onDismiss={dismiss} present={false} />
          ))}
      </div>
    </>
  )
}
