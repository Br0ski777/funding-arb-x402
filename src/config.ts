import type { ApiConfig } from "./shared";

export const API_CONFIG: ApiConfig = {
  name: "funding-arb",
  slug: "funding-arb",
  description: "Cross-venue funding rate arbitrage scanner for perpetual exchanges.",
  version: "1.0.0",
  routes: [
    {
      method: "GET",
      path: "/api/scan",
      price: "$0.005",
      description: "Scan funding rate arbitrage opportunities across perpetual exchanges",
      toolName: "perp_scan_funding_arbitrage",
      toolDescription: "Use this when you need to find funding rate arbitrage opportunities across perpetual exchanges. Compares rates on Hyperliquid, Binance, Bybit, OKX for the same asset and returns spread, annualized arb yield, and direction. Do NOT use for single-venue rates — use perp_get_funding_rates. Do NOT use for spot prices — use dex_get_swap_quote.",
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
