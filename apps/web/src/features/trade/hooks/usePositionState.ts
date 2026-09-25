/**
 * apps/web/src/features/trade/hooks/usePositionState.ts
 *
 * Slowly changing position state (OB-085).
 *
 * This hook deliberately does **not** read token prices. Mark price, collateral
 * value, PnL, and distance to liquidation are price-derived; they are computed
 * in leaf cells that subscribe to the price feed themselves. Keeping the two
 * apart is what stops an oracle tick from re-rendering the whole trading
 * workspace, reordering rows, and moving row actions out from under the
 * pointer.
 *
 * What lives here changes on ledger time: size, entry, collateral amount,
 * funding, and the contract's liquidation price.
 */

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../lib/query-keys"
import { sortPositionRows } from "../lib/position-risk"
import { useAccountPositions } from "./useAccountPositions"
import type { PositionInfo } from "@/lib/contracts"
import { useWalletStore } from "@/features/wallet/store/wallet-store"
import { INDEXER_CONFIG } from "@/app/config/indexer"
import { syntheticsReaderClient } from "@/lib/contracts"
import { fromSorobanAmount } from "@/shared/lib/bignum"

const CHAIN_ID = "stellar-mainnet"
const USD_DECIMALS = 30
const TOKEN_DECIMALS = 7

/** Fresh, price-independent numbers read straight from the contracts. */
export type FreshPositionData = {
  pnlUsd: number
  fundingFeeUsd: number
  liquidationPriceUsd: number
  sizeInUsdRaw: bigint
}

export type PositionState = {
  key: string
  account: string
  marketAddress: string
  marketName: string
  indexToken: string
  collateralToken: string
  /** Collateral token units. */
  collateralAmount: number
  /** Position size in USD (authoritative). */
  sizeUsd: number
  /** Exact on-chain size, used to derive partial deltas without float loss. */
  sizeInUsdRaw: bigint
  entryPrice: number
  /** Contract-reported PnL, before funding. */
  pnlUsd: number
  /** Accrued funding fee in USD (claimable when > 0). */
  fundingFeeUsd: number
  /** Contract-reported liquidation price. */
  liquidationPriceUsd: number
  isLong: boolean
  /** True when contract reads have not caught up with the indexed row. */
  isRiskDataStale: boolean
}

export type UsePositionStateResult = {
  data: Array<PositionState>
  /** True only while the very first rows are loading. */
  isLoading: boolean
  /** True during a background refresh with rows already on screen. */
  isRefreshing: boolean
  isDisabled: boolean
  refetch: () => void
}

export function freshPositionKey(
  account: string,
  market: string,
  collateralToken: string,
  isLong: boolean,
): string {
  return `${account}-${market}-${collateralToken}-${isLong}`
}

/** Fetch fresh PnL, funding, liquidation, and raw size from the contracts. */
export async function fetchFreshPositionData(
  account: string,
): Promise<Map<string, FreshPositionData>> {
  const rawPositions = await syntheticsReaderClient.getAccountPositions(account)

  const freshDataMap = new Map<string, FreshPositionData>()
  for (const p of rawPositions) {
    const key = freshPositionKey(
      p.position.account,
      p.position.market,
      p.position.collateralToken,
      p.position.isLong,
    )
    freshDataMap.set(key, {
      pnlUsd: fromSorobanAmount(p.pnlUsd, USD_DECIMALS),
      fundingFeeUsd: fromSorobanAmount(p.fundingFeeUsd, USD_DECIMALS),
      liquidationPriceUsd: fromSorobanAmount(p.liquidationPrice, USD_DECIMALS),
      sizeInUsdRaw: p.position.sizeInUsd,
    })
  }

  return freshDataMap
}
