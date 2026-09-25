/**
 * apps/web/src/lib/graphql/query-keys.ts
 *
 * Query key factory for indexer queries.
 * Ensures consistent cache isolation by network and account.
 *
 * Usage:
 *   import { indexerQueryKeys } from "@/lib/graphql/query-keys"
 *
 *   useQuery({
 *     queryKey: indexerQueryKeys.positions.byAccount(address),
 *     queryFn: ...
 *   })
 */

import { INDEXER_CONFIG } from "@/app/config/indexer"

// ─────────────────────────────────────────────────────────────────────────────
// Query Key Factory
// ─────────────────────────────────────────────────────────────────────────────

export const indexerQueryKeys = {
  /** Base key for all indexer queries (includes network) */
  all: () => ["indexer", INDEXER_CONFIG.network] as const,

  /** Position queries */
  positions: {
    all: () => [...indexerQueryKeys.all(), "positions"] as const,
    byAccount: (account: string) => [...indexerQueryKeys.positions.all(), account] as const,
  },

  /** Order queries */
  orders: {
    all: () => [...indexerQueryKeys.all(), "orders"] as const,
    byAccount: (account: string) => [...indexerQueryKeys.orders.all(), account] as const,
    /**
     * Prefix covering every filter variant of the paged history, so targeted
     * invalidation can refresh the view without touching the whole namespace.
     */
    historyAll: (account: string) =>
      [...indexerQueryKeys.orders.all(), "history", account] as const,
    /**
     * Paged order lifecycle history (OB-087). Every filter that changes the
     * rendered result is part of the key, so two filter selections never share
     * a cache entry (TanStack Query: query keys are a dependency of the data).
     */
    history: (
      account: string,
      filters: { marketKey: string | null; stage: string; range: string },
    ) =>
      [
        ...indexerQueryKeys.orders.historyAll(account),
        filters.marketKey,
        filters.stage,
        filters.range,
      ] as const,
  },

  /** Market queries */
  markets: {
    all: () => [...indexerQueryKeys.all(), "markets"] as const,
    byKey: (key: string) => [...indexerQueryKeys.markets.all(), key] as const,
  },

  /** Pool queries */
  pools: {
    all: () => [...indexerQueryKeys.all(), "pools"] as const,
    snapshots: (marketKey: string) => [...indexerQueryKeys.pools.all(), "snapshots", marketKey] as const,
  },

  /** Deposit queries */
  deposits: {
    all: () => [...indexerQueryKeys.all(), "deposits"] as const,
    byAccount: (account: string) => [...indexerQueryKeys.deposits.all(), account] as const,
  },

  /** Withdrawal queries */
  withdrawals: {
    all: () => [...indexerQueryKeys.all(), "withdrawals"] as const,
    byAccount: (account: string) => [...indexerQueryKeys.withdrawals.all(), account] as const,
  },

  /** Trade history queries */
  tradeHistory: {
    all: () => [...indexerQueryKeys.all(), "tradeHistory"] as const,
    byAccount: (account: string) => [...indexerQueryKeys.tradeHistory.all(), account] as const,
    /** Prefix covering every filter variant of the paged fills view. */
    pagesAll: (account: string) =>
      [...indexerQueryKeys.tradeHistory.all(), "pages", account] as const,
    /**
     * Paged executed fills (OB-087). Separate from `byAccount` because that key
     * backs the unbounded aggregation read, while this one is the paginated
     * Trades view. Carries every filter that changes the rendered result.
     */
    pages: (
      account: string,
      filters: { marketKey: string | null; side: string; range: string },
    ) =>
      [
        ...indexerQueryKeys.tradeHistory.pagesAll(account),
        filters.marketKey,
        filters.side,
        filters.range,
      ] as const,
  },

  /** Referral queries */
  referrals: {
    all: () => [...indexerQueryKeys.all(), "referrals"] as const,
    traderReferral: (trader: string) => [...indexerQueryKeys.referrals.all(), "trader", trader] as const,
    affiliateTraders: (owner: string) => [...indexerQueryKeys.referrals.all(), "affiliate", owner] as const,
  },

  /** Fee queries */
  fees: {
    all: () => [...indexerQueryKeys.all(), "fees"] as const,
    byAccount: (account: string) => [...indexerQueryKeys.fees.all(), account] as const,
  },
}
