// OB-117: live updates must be safe across account and network switches —
// a delayed response for an old account/network must never touch the
// currently visible cache, and switching account or network must reset the
// subscription (fresh cursor, no stale invalidation).

import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { useOrderEventPolling } from "./useOrderEventPolling"
import { useWalletStore } from "@/features/wallet/store/wallet-store"

vi.mock("@/lib/soroban/client", () => ({
  sorobanRpc: { getEvents: vi.fn() },
}))

vi.mock("@/app/config/contracts", () => ({
  CONTRACTS: { exchangeRouter: "CONTRACT_ID" },
}))

import { sorobanRpc } from "@/lib/soroban/client"

const ACCOUNT_A = "GACCOUNTA00000000000000000000000000000000000000000000000000"
const ACCOUNT_B = "GACCOUNTB00000000000000000000000000000000000000000000000000"

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function orderEvent(account: string) {
  return {
    data: { event_name: "OrderExecuted", account },
    paging_token: "1",
  }
}

describe("useOrderEventPolling (OB-117)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useWalletStore.setState({ address: null, network: "mainnet", status: "disconnected" })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("discards an in-flight response for an account that has since been switched away from", async () => {
    let resolveFirstPoll!: (value: unknown) => void
    const getEvents = vi.mocked(sorobanRpc.getEvents)
    getEvents.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirstPoll = resolve }),
    )
    getEvents.mockResolvedValue({ records: [] })

    useWalletStore.setState({ address: ACCOUNT_A, network: "mainnet", status: "connected" })
    const { rerender } = renderHook(() => useOrderEventPolling(), { wrapper })

    // Switch accounts while the first poll for ACCOUNT_A is still pending.
    act(() => {
      useWalletStore.setState({ address: ACCOUNT_B, network: "mainnet", status: "connected" })
    })
    rerender()

    // The delayed ACCOUNT_A response now arrives.
    await act(async () => {
      resolveFirstPoll({ records: [orderEvent(ACCOUNT_A)] })
      await Promise.resolve()
      await Promise.resolve()
    })

    // It must not have been able to schedule a follow-up poll under the
    // stale generation.
    expect(getEvents).toHaveBeenCalledTimes(2) // ACCOUNT_A's first call + ACCOUNT_B's first call
  });

  it("resets the polling cursor when the network changes, even with the same account", async () => {
    const getEvents = vi.mocked(sorobanRpc.getEvents)
    getEvents.mockResolvedValue({ records: [{ ...orderEvent(ACCOUNT_A), paging_token: "cursor-1" }] })

    useWalletStore.setState({ address: ACCOUNT_A, network: "mainnet", status: "connected" })
    const { rerender } = renderHook(() => useOrderEventPolling(), { wrapper })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    getEvents.mockClear()

    act(() => {
      useWalletStore.setState({ address: ACCOUNT_A, network: "testnet", status: "connected" })
    })
    rerender()

    await act(async () => {
      await Promise.resolve()
    })

    // A fresh subscription for the new network must not carry over the
    // previous network's cursor.
    const callParams = getEvents.mock.calls[0]?.[0] as Record<string, unknown> | undefined
    expect(callParams?.cursor).toBeUndefined()
  })

  it("stops polling entirely once the account disconnects", async () => {
    const getEvents = vi.mocked(sorobanRpc.getEvents)
    getEvents.mockResolvedValue({ records: [] })

    useWalletStore.setState({ address: ACCOUNT_A, network: "mainnet", status: "connected" })
    const { rerender } = renderHook(() => useOrderEventPolling(), { wrapper })

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      useWalletStore.setState({ address: null, network: "mainnet", status: "disconnected" })
    })
    rerender()

    getEvents.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(getEvents).not.toHaveBeenCalled()
  })
})
