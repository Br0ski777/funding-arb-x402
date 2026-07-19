# Funding Rate Arbitrage Scanner API

[![MCP Server](https://img.shields.io/badge/MCP-server-blue)](https://funding-arb.api.klymax402.com/mcp)
[![x402](https://img.shields.io/badge/payments-x402-6E56CF)](https://x402.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Funding rate arbitrage scanner -- Hyperliquid, Binance, Bybit, OKX cross-venue spreads and annualized yields. Pay-per-call via [x402](https://x402.org) (USDC on Base L2) -- no API key, no signup, no rate-limit wall.

Part of the [klymax402](https://klymax402.com) marketplace -- 100 x402 micropayment APIs for AI agents, one wallet, USDC on Base.

## Quickstart -- MCP

Add to your MCP client config (Claude Desktop, Cursor, ElizaOS, etc.):

```json
{
  "mcpServers": {
    "funding-arb": {
      "url": "https://funding-arb.api.klymax402.com/mcp"
    }
  }
}
```

## Quickstart -- HTTP (x402)

```bash
curl "https://funding-arb.api.klymax402.com/api/scan"
# -> 402 Payment Required, with an x402 payment challenge in the response body
```

Any x402-aware client ([`@x402/fetch`](https://www.npmjs.com/package/@x402/fetch), [`x402-agent-tools`](https://www.npmjs.com/package/x402-agent-tools), ATXP) handles the 402 -> sign -> retry cycle automatically.

## Tools

| Tool | Method | Path | Price | Description |
|---|---|---|---|---|
| `perp_scan_funding_arbitrage` | GET | `/api/scan` | $0.012 | Scan funding rate arbitrage opportunities across perpetual exchanges |

### `perp_scan_funding_arbitrage`

Use this when you need to find funding rate arbitrage opportunities across perpetual exchanges. Returns cross-venue spreads in JSON.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | no | Filter by asset symbol (e.g. BTC, ETH, SOL). Optional — scans all assets if omitted. |

**Returns**

- `opportunities` -- array of arb opportunities ranked by annualized yield
- `symbol` -- asset symbol (BTC, ETH, SOL, etc.)
- `longExchange` -- exchange where you go long (lower funding)
- `shortExchange` -- exchange where you go short (higher funding)
- `spread` -- funding rate difference between venues
- `annualizedYield` -- estimated annualized return from the arb
- `direction` -- suggested position direction per exchange

Example response:

```json
{"opportunities":[{"symbol":"ETH","longExchange":"Bybit","shortExchange":"OKX","spread":0.0045,"annualizedYield":16.4,"direction":"long Bybit / short OKX"}],"scannedAssets":25,"timestamp":"2026-04-13T12:00:00Z"}
```

**When to use**: systematic funding rate arbitrage and delta-neutral carry strategies. Scans all major perpetual venues simultaneously.

**Not for**: spot prices (use `dex_get_swap_quote`), DeFi yields (use `defi_find_best_yields`).

## Example agent prompts

- "Find funding rate arbitrage opportunities across perpetual exchanges"

## Payment

- Protocol: [x402](https://x402.org) -- HTTP-native pay-per-call, no signup, no API key
- Network: Base L2 (`eip155:8453`)
- Asset: USDC
- Facilitator: Coinbase CDP (primary), PayAI (fallback)
- Also reachable via [ATXP](https://atxp.ai) (OAuth-wrapped x402, RFC 9728 protected-resource metadata)

## Part of klymax402

100 x402 micropayment APIs for AI agents -- one wallet, USDC on Base, zero signup.

- Catalog: https://klymax402.com/llms.txt
- Full API reference: https://klymax402.com/llms-full.txt
- Live stats: https://klymax402.com/stats

## License

MIT
