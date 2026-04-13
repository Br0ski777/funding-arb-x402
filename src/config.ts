import type { ApiConfig } from "./shared";

export const API_CONFIG: ApiConfig = {
  name: "funding-arb",
  slug: "funding-arb",
  description: "Funding rate arbitrage scanner -- Hyperliquid, Binance, Bybit, OKX cross-venue spreads and annualized yields.",
  version: "1.0.0",
  routes: [
    {
      method: "GET",
      path: "/api/scan",
      price: "$0.005",
      description: "Scan funding rate arbitrage opportunities across perpetual exchanges",
      toolName: "perp_scan_funding_arbitrage",
      toolDescription: `Use this when you need to find funding rate arbitrage opportunities across perpetual exchanges. Returns cross-venue spreads in JSON.

1. opportunities: array of arb opportunities ranked by annualized yield
2. symbol: asset symbol (BTC, ETH, SOL, etc.)
3. longExchange: exchange where you go long (lower funding)
4. shortExchange: exchange where you go short (higher funding)
5. spread: funding rate difference between venues
6. annualizedYield: estimated annualized return from the arb
7. direction: suggested position direction per exchange

Example output: {"opportunities":[{"symbol":"ETH","longExchange":"Bybit","shortExchange":"OKX","spread":0.0045,"annualizedYield":16.4,"direction":"long Bybit / short OKX"}],"scannedAssets":25,"timestamp":"2026-04-13T12:00:00Z"}

Use this FOR systematic funding rate arbitrage and delta-neutral carry strategies. Scans all major perpetual venues simultaneously.

Do NOT use for single-venue rates -- use perp_get_funding_rates instead. Do NOT use for spot prices -- use dex_get_swap_quote instead. Do NOT use for DeFi yields -- use defi_find_best_yields instead.`,
      inputSchema: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Filter by asset symbol (e.g. BTC, ETH, SOL). Optional — scans all assets if omitted.",
          },
        },
        required: [],
      },
    },
  ],
};
