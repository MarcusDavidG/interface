import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

/**
 * Prefetch market data and related queries on navigation intent.
 * Coordinates router loaders and query options to parallelize independent reads.
 */
export function usePrefetch() {
  const queryClient = useQueryClient()

  const prefetchMarket = useCallback(
    async (marketId: string) => {
      // Prefetch in parallel to avoid waterfalls
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: ["market", marketId],
          staleTime: 30_000, // 30s for market data
        }),
        queryClient.prefetchQuery({
          queryKey: ["orderBook", marketId],
          staleTime: 5_000, // 5s for rapid updates
        }),
        queryClient.prefetchQuery({
          queryKey: ["trades", marketId],
          staleTime: 2_000, // 2s for recent trades
        }),
      ]).catch(() => {
        // Silently fail on constrained networks
      })
    },
    [queryClient]
  )

  const prefetchBeforeTrade = useCallback(
    async (marketId: string) => {
      await Promise.all([
        prefetchMarket(marketId),
        queryClient.prefetchQuery({
          queryKey: ["account"],
          staleTime: 60_000, // 60s for account data
        }),
        queryClient.prefetchQuery({
          queryKey: ["positions"],
          staleTime: 10_000, // 10s for positions
        }),
      ]).catch(() => {
        // Constrained network fallback
      })
    },
    [queryClient, prefetchMarket]
  )

  return {
    prefetchMarket,
    prefetchBeforeTrade,
  }
}
