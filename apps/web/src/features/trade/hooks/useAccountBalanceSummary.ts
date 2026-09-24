import { useMemo } from "react"
import { useTokenPrices } from "./useTokenPrices"
import { useTokenBalances } from "@/features/wallet/hooks/useTokenBalances"
import { useAccountOrders } from "./useAccountOrders"
import { useAccountPositions } from "./useAccountPositions"
import { useWalletStore } from "@/features/wallet/store/wallet-store"
import { CONTRACTS } from "@/app/config/contracts"

export type AccountBalanceSummary = {
  walletBalance: number        // Native wallet balance in USD
  depositedCollateral: number  // Collateral deposited to contracts
  reservedFunds: number        // Funds reserved for pending/accepted orders
  availableToTrade: number     // Available to trade = wallet + deposited - reserved
  totalAccountValue: number    // wallet + deposited
}

export function useAccountBalanceSummary(): AccountBalanceSummary | null {
  const account = useWalletStore((s) => s.address)
  const { getMidPrice } = useTokenPrices()
  const { data: balances, isLoading: balancesLoading } = useTokenBalances()
  const { data: orders } = useAccountOrders()
  const { data: positions } = useAccountPositions()

  return useMemo(() => {
    if (!balances || !orders || !positions || !account) return null

    // Wallet balance in USD (all collateral tokens)
    const stableCollaterals = [CONTRACTS.tokens.tusdc]
    let walletBalance = 0
    for (const [symbol, balance] of Object.entries(balances)) {
      // For now, assume all collateral is stablecoin (1:1 with USD)
      // TODO: use real price feeds for other collaterals
      if (stableCollaterals.includes(symbol) || symbol === "USDC") {
        walletBalance += balance * 1 // 1:1 for stablecoin
      }
    }

    // Calculate reserved funds from pending orders + positions
    // Orders reserve collateral, positions have collateral already deployed
    let reservedFunds = 0
    if (orders && Array.isArray(orders)) {
      for (const order of orders) {
        // Reserve the collateral amount for each pending order
        const collateralUsd = (order.collateralAmount || 0) * getMidPrice(order.collateralToken || "")
        reservedFunds += collateralUsd
      }
    }

    // For positions, the collateral is already part of the position
    // but we should track it separately
    let depositedCollateral = 0
    if (positions && Array.isArray(positions)) {
      for (const position of positions) {
        // Add collateral locked in active positions
        const collateralUsd = (position.collateralUsd || 0)
        depositedCollateral += collateralUsd
      }
    }

    // Reserved funds already include collateral amounts, so we count them here
    reservedFunds += depositedCollateral

    const totalAccountValue = walletBalance + depositedCollateral
    const availableToTrade = walletBalance - (reservedFunds - depositedCollateral)

    return {
      walletBalance,
      depositedCollateral,
      reservedFunds,
      availableToTrade: Math.max(availableToTrade, 0),
      totalAccountValue,
    }
  }, [balances, orders, positions, account, getMidPrice])
}
