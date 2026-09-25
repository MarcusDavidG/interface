import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ToastProvider, toast } from "./toast"

function Harness({ label = "app" }: { label?: string }) {
  return (
    <ToastProvider>
      <span>{label}</span>
    </ToastProvider>
  )
}

function activeToasts() {
  return Array.from(document.querySelectorAll("[data-slot='toast']"))
}

function queryStack() {
  return document.querySelector("[aria-live='polite'][aria-atomic='false']")
}

// jsdom lacks a stable requestAnimationFrame in fake-timer mode; the toast
// entrance uses rAF, so provide a deterministic shim for these tests.
function stubRaf() {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id))
}

describe("toast store — sole notification implementation (OB-091)", () => {
  beforeEach(() => {
    stubRaf()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("delivers every supported call to the single mounted provider", () => {
    render(<Harness />)
    let ids: Array<string> = []
    act(() => {
      ids = [
        toast.success("Saved"),
        toast.error("Failed"),
        toast.info("Note"),
        toast.warning("Careful"),
        toast.loading("Confirming…"),
      ]
    })
    expect(ids).toHaveLength(5)
    expect(screen.getByText("Saved")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Note")).toBeInTheDocument()
    expect(screen.getByText("Careful")).toBeInTheDocument()
    expect(screen.getByText("Confirming…")).toBeInTheDocument()
    // Exactly one stack container across routes (OB-091).
    expect(document.querySelectorAll("[aria-live='polite'][aria-atomic='false']")).toHaveLength(1)
    expect(queryStack()).toBeInTheDocument()
    act(() => {
      for (const id of ids) toast.dismiss(id)
    })
  })

  it("shares one singleton store across provider instances", () => {
    render(<Harness label="one" />)
    act(() => {
      toast.info("Shared message")
    })
    expect(screen.getByText("Shared message")).toBeInTheDocument()
    act(() => {
      toast.dismiss(toast.show({ message: "temp", variant: "info" }))
    })
  })

  it("upserts by id and dismisses by id (provider lifecycle)", () => {
    render(<Harness />)
    let id = ""
    act(() => {
      id = toast.show({ id: "tx-1", message: "Submitting…", variant: "transaction-progress", duration: 0, persistent: true })
    })
    expect(screen.getByText("Submitting…")).toBeInTheDocument()
    act(() => {
      toast.show({ id: "tx-1", message: "Confirmed", variant: "success" })
    })
    expect(screen.queryByText("Submitting…")).toBeNull()
    expect(screen.getByText("Confirmed")).toBeInTheDocument()
    act(() => {
      toast.dismiss(id)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText("Confirmed")).toBeNull()
  })
})

describe("toast motion — entrance, updates, stacking, exit (OB-092)", () => {
  beforeEach(() => {
    stubRaf()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("updates content in place without replaying the entrance", () => {
    render(<Harness />)
    let id = ""
    act(() => {
      id = toast.show({ id: "up-1", message: "Waiting…", variant: "transaction-progress", duration: 0, persistent: true })
    })
    const before = screen.getByText("Waiting…").closest("[data-slot='toast']")
    expect(before).not.toBeNull()
    act(() => {
      toast.show({ id: "up-1", message: "Confirmed", variant: "success" })
    })
    const after = screen.getByText("Confirmed").closest("[data-slot='toast']")
    expect(after).not.toBeNull()
    expect(after?.getAttribute("data-variant")).toBe("success")
    // Same row identity: stable key, no remount, no duplicate.
    expect(document.querySelectorAll("[data-slot='toast']")).toHaveLength(1)
    act(() => {
      toast.dismiss(id)
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
  })

  it("coalesces a burst of identical notifications onto one row", () => {
    render(<Harness />)
    act(() => {
      toast.success("Order submitted")
      toast.success("Order submitted")
      toast.success("Order submitted")
    })
    expect(screen.getAllByText("Order submitted")).toHaveLength(1)
    expect(activeToasts()).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
  })

  it("plays a symmetric exit that leaves no interactive leftovers", () => {
    render(<Harness />)
    let id = ""
    act(() => {
      id = toast.info("Goodbye", { duration: 0 })
    })
    expect(screen.getByText("Goodbye")).toBeInTheDocument()
    act(() => {
      toast.dismiss(id)
    })
    // Exit row is retained through the transition, inert and non-interactive.
    const exiting = document.querySelector("[data-slot='toast'][data-state='closed']")
    expect(exiting).not.toBeNull()
    expect(exiting).toHaveAttribute("aria-hidden", "true")
    expect(exiting).toHaveAttribute("inert")
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText("Goodbye")).toBeNull()
  })

  it("reverses an exit when the same toast returns (rapid reversal)", () => {
    render(<Harness />)
    act(() => {
      toast.show({ id: "flip-1", message: "Working…", variant: "transaction-progress", duration: 0, persistent: true })
    })
    expect(screen.getByText("Working…")).toBeInTheDocument()
    act(() => {
      toast.dismiss("flip-1")
    })
    act(() => {
      toast.show({ id: "flip-1", message: "Working…", variant: "transaction-progress", duration: 0, persistent: true })
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    // Exactly one row, open — not a duplicated or stuck-closed leftover.
    expect(screen.getAllByText("Working…")).toHaveLength(1)
    expect(document.querySelector("[data-slot='toast']")).toHaveAttribute("data-state", "open")
    act(() => {
      toast.dismiss("flip-1")
    })
    act(() => {
      vi.advanceTimersByTime(200)
    })
  })

  it("uses semantic token surfaces and interruptible motion classes", () => {
    render(<Harness />)
    act(() => {
      toast.error("Boom", { duration: 0 })
    })
    const node = screen.getByText("Boom").closest("[data-slot='toast']")
    expect(node?.className).toMatch("bg-danger-subtle")
    expect(node?.className).toMatch("transition-\\[opacity,transform\\]")
    expect(node?.className).toMatch("motion-reduce:transition-none")
    act(() => {
      vi.advanceTimersByTime(5000)
    })
  })
})
