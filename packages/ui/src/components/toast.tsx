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

/** Toasts rendered in the stack before the rest collapse behind an overflow control. */
export const MAX_VISIBLE_TOASTS = 3
/** Toasts kept in memory; beyond this the oldest settled ones are dropped first. */
export const MAX_RETAINED_TOASTS = 12
/** Terminal outcomes remembered per id, so late duplicates can be recognised. */
const MAX_SETTLED_OUTCOMES = 100

const PROGRESS_VARIANT: ToastVariant = "transaction-progress"

type ToastListener = () => void
const listeners = new Set<ToastListener>()
/** Retained toasts, oldest first. */
let toasts: Array<ToastItem> = []
/**
 * Unresolved progress entries that left the stack (dismissed or evicted). They
 * stay trackable here so the action is still discoverable and its terminal
 * update still lands, exactly once.
 */
let tracked: Array<ToastItem> = []
/** id -> signature of its last terminal outcome. */
const settled = new Map<string, string>()
/** Bumped per update so a refreshed toast restarts its dismiss timer. */
const revisions = new Map<string, number>()

type ToastSnapshot = {
  toasts: Array<ToastItem>
  tracked: Array<ToastItem>
}
let snapshot: ToastSnapshot = { toasts, tracked }

function emit() {
  snapshot = { toasts, tracked }
  listeners.forEach(l => l())
}

function outcomeSignature(item: Pick<ToastItem, "variant" | "message">) {
  return `${item.variant}\u0000${item.message}`
}

function rememberOutcome(id: string, signature: string) {
  settled.delete(id)
  settled.set(id, signature)
  if (settled.size > MAX_SETTLED_OUTCOMES) {
    const oldest = settled.keys().next().value
    if (oldest !== undefined) settled.delete(oldest)
  }
}

function track(item: ToastItem) {
  tracked = [...tracked.filter(t => t.id !== item.id), item]
}

function enforceRetention() {
  while (toasts.length > MAX_RETAINED_TOASTS) {
    // Settled toasts go first; unresolved progress is only evicted when the
    // whole stack is unresolved, and then it moves to `tracked` rather than
    // being forgotten.
    const settledIdx = toasts.findIndex(t => t.variant !== PROGRESS_VARIANT)
    const idx = settledIdx >= 0 ? settledIdx : 0
    const [evicted] = toasts.splice(idx, 1)
    if (evicted.variant === PROGRESS_VARIANT) track(evicted)
    revisions.delete(evicted.id)
  }
}

type ShowInput = Omit<ToastItem, "id" | "duration"> & { id?: string, duration?: number }

export const toast = {
  show: (item: ShowInput) => {
    // Without an explicit identity, an identical toast already on screen is
    // the same event repeating (e.g. a background read failing on every
    // refetch): refresh it instead of stacking another copy.
    const id =
      item.id ||
      toasts.find(
        t => t.variant !== PROGRESS_VARIANT && outcomeSignature(t) === outcomeSignature(item),
      )?.id ||
      nextId()
    const duration = item.duration ?? 4000
    const newItem: ToastItem = { ...item, id, duration }
    const existingIdx = toasts.findIndex(t => t.id === id)

    if (item.variant === PROGRESS_VARIANT) {
      // A new progress stage re-opens the lifecycle for this id.
      settled.delete(id)
      if (existingIdx < 0 && tracked.some(t => t.id === id)) {
        // The user dismissed this progress toast: keep tracking it without
        // pushing it back on screen.
        track(newItem)
        emit()
        return id
      }
    } else {
      const signature = outcomeSignature(item)
      if (settled.get(id) === signature) {
        // Duplicate terminal outcome (e.g. a burst of confirmations for the
        // same transaction): one terminal update per stage.
        return id
      }
      if (item.id) rememberOutcome(id, signature)
      if (tracked.some(t => t.id === id)) {
        tracked = tracked.filter(t => t.id !== id)
      }
    }

    revisions.set(id, (revisions.get(id) ?? 0) + 1)
    if (existingIdx >= 0) {
      toasts = toasts.map((t, i) => (i === existingIdx ? newItem : t))
    } else {
      toasts = [...toasts, newItem]
      enforceRetention()
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
    const item = toasts.find(t => t.id === id)
    if (!item) return
    toasts = toasts.filter(t => t.id !== id)
    revisions.delete(id)
    // Dismissing hides unresolved progress; it does not stop tracking it.
    if (item.variant === PROGRESS_VARIANT) track(item)
    emit()
  },
  /** Puts dismissed or evicted in-progress toasts back on the stack. */
  restoreTracked: () => {
    if (tracked.length === 0) return
    const restoring = tracked.filter(t => !toasts.some(existing => existing.id === t.id))
    tracked = []
    toasts = [...toasts, ...restoring]
    enforceRetention()
    emit()
  },
}

/** Unresolved progress, whether on screen, hidden by overflow, or dismissed. */
export function getInFlightToasts(): Array<ToastItem> {
  return [...toasts.filter(t => t.variant === PROGRESS_VARIANT), ...tracked]
}

/** Clears all toast state. Intended for test isolation. */
export function resetToastStore() {
  toasts = []
  tracked = []
  settled.clear()
  revisions.clear()
  emit()
}

function subscribe(listener: ToastListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return snapshot
}

export function useToast() {
  const current = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const inFlight = React.useMemo(
    () => [...current.toasts.filter(t => t.variant === PROGRESS_VARIANT), ...current.tracked],
    [current],
  )

  return { toasts: current.toasts, tracked: current.tracked, inFlight, toast, dismiss: toast.dismiss }
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "bg-green-900/90 text-green-100 border-green-700/50",
  error: "bg-red-900/90 text-red-100 border-red-700/50",
  warning: "bg-yellow-900/90 text-yellow-100 border-yellow-700/50",
  info: "bg-slate-800/90 text-slate-100 border-slate-700/50",
  "transaction-progress": "bg-blue-900/90 text-blue-100 border-blue-700/50",
}

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <Icon icon={Tick02Icon} size="md" tone="success" className="text-green-400" />,
  error: <Icon icon={Cancel01Icon} size="md" tone="error" className="text-red-400" />,
  warning: <Icon icon={Alert01Icon} size="md" tone="warning" className="text-yellow-400" />,
  info: <Icon icon={InformationCircleIcon} size="md" tone="info" className="text-blue-400" />,
  "transaction-progress": <Icon icon={ReloadIcon} size="md" tone="info" className="text-blue-400 animate-spin" />,
}

const VARIANT_LABEL: Record<ToastVariant, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
  "transaction-progress": "Transaction in progress",
}

function Toast({
  item,
  revision,
  onDismiss,
}: {
  item: ToastItem
  revision: number
  onDismiss: (id: string) => void
}) {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isHovered, setIsHovered] = React.useState(false)

  React.useEffect(() => {
    if (item.persistent || item.duration <= 0 || isHovered) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    timerRef.current = setTimeout(() => onDismiss(item.id), item.duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [item.id, item.duration, item.persistent, isHovered, onDismiss, revision])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${VARIANT_LABEL[item.variant]}: ${item.message}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4 text-sm shadow-lg pointer-events-auto transition-all w-80",
        VARIANT_CLASSES[item.variant],
      )}
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="shrink-0 mt-0.5">{VARIANT_ICONS[item.variant]}</div>
          <div className="flex flex-col gap-1">
            <span className="font-medium leading-none">{item.message}</span>
            {item.description && (
              <div className="text-xs opacity-90 mt-1">{item.description}</div>
            )}
          </div>
        </div>
        <button
          aria-label="Dismiss"
          onClick={() => onDismiss(item.id)}
          className="shrink-0 opacity-70 hover:opacity-100 focus:opacity-100 outline-none"
        >
          <Icon icon={Cancel01Icon} size="sm" />
        </button>
      </div>
      {item.action && (
        <div className="mt-2 pl-8">
          <button
            onClick={() => {
              item.action?.onClick()
              onDismiss(item.id)
            }}
            className="text-xs font-medium underline underline-offset-2 opacity-80 hover:opacity-100 focus:opacity-100 outline-none"
          >
            {item.action.label}
          </button>
        </div>
      )}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts: activeToasts, tracked: trackedToasts, inFlight, dismiss } = useToast()
  const [expanded, setExpanded] = React.useState(false)

  const visible = expanded ? activeToasts : activeToasts.slice(-MAX_VISIBLE_TOASTS)
  const hidden = activeToasts.length - visible.length + trackedToasts.length
  const visibleIds = new Set(visible.map(t => t.id))
  const hiddenInFlight = inFlight.filter(t => !visibleIds.has(t.id)).length
  const canCollapse = expanded && activeToasts.length > MAX_VISIBLE_TOASTS

  React.useEffect(() => {
    if (expanded && activeToasts.length <= MAX_VISIBLE_TOASTS) setExpanded(false)
  }, [expanded, activeToasts.length])

  let overflowLabel: string | null = null
  if (hidden > 0) {
    overflowLabel = `Show ${hidden} more`
    if (hiddenInFlight > 0) overflowLabel += ` (${hiddenInFlight} in progress)`
  } else if (canCollapse) {
    overflowLabel = "Show fewer"
  }

  return (
    <>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed bottom-4 right-4 z-50 flex max-h-screen flex-col gap-2 overflow-y-auto pointer-events-none"
      >
        {overflowLabel && (
          <button
            type="button"
            data-slot="toast-overflow"
            aria-expanded={expanded}
            onClick={() => {
              if (hidden === 0) {
                setExpanded(false)
                return
              }
              toast.restoreTracked()
              setExpanded(true)
            }}
            className="self-end rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground shadow-lg pointer-events-auto hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {overflowLabel}
          </button>
        )}
        {visible.map((t) => (
          <Toast key={t.id} item={t} revision={revisions.get(t.id) ?? 0} onDismiss={dismiss} />
        ))}
      </div>
    </>
  )
}
