import { useState } from "react"
import { RecentTradesTape } from "./RecentTradesTape"

type Props = {
  symbol: string | undefined
}

export function OrderBookPanel({ symbol }: Props) {
  const [activeTab, setActiveTab] = useState<"book" | "trades">("trades")

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* ── Panel Header Tabs ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("book")}
            className={`rounded px-2 py-1 font-mono text-xs font-semibold transition-colors ${
              activeTab === "book"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-selected={activeTab === "book"}
            role="tab"
          >
            Order Book
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("trades")}
            className={`rounded px-2 py-1 font-mono text-xs font-semibold transition-colors ${
              activeTab === "trades"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            aria-selected={activeTab === "trades"}
            role="tab"
          >
            Trades
          </button>
        </div>
        <span className="text-xs text-muted-foreground">Reference Data</span>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1">
        {activeTab === "book" ? (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground h-full">
            Executable order-book depth is unavailable until a verified matching source is connected.
          </div>
        ) : (
          <RecentTradesTape symbol={symbol} />
        )}
      </div>
    </div>
  )
}
