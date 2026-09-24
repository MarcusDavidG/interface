---
"@levee/web": minor
---

**Performance: Reduce landing and trading JavaScript entry cost**

- Add lazy route loading for `/trade`, `/earn`, `/pools` routes to split heavy chart, wallet, and optional trading code at route boundaries
- Keep landing preview independent of full chart/execution modules
- Implement React Router's dynamic component imports with Suspense fallback

**Performance: Optimize fonts, images, and first-paint assets**

- Add DNS prefetch for indexer and RPC endpoints to reduce latency on first connection
- Preload critical Inter font weights (400, 600) with font-display: swap
- Configure responsive image sizing for hero/above-fold assets
- Defer below-fold decorative assets with lazy loading

**Performance: Isolate rendering of rapidly changing trading data**

- Add `useOptimizedQuery` hook to memoize query keys and prevent unnecessary subscriptions
- Create query selector utilities to prevent child re-renders when unrelated data changes
- Narrow TanStack Query subscriptions to specific data classes

**Performance: Add intent-based prefetching and remove request waterfalls**

- Implement `usePrefetch` hook for coordinated market data, orderbook, and account prefetching
- Parallelize independent initial reads to remove serial request waterfalls
- Constrain prefetch on navigation to prevent excessive network use on rapid browsing
- Add stale time configuration by data class (market: 30s, orderbook: 5s, trades: 2s, account: 60s)

These changes target p75 LCP ≤ 2.5s, INP ≤ 200ms, and CLS ≤ 0.1 on baseline device/network profiles.
