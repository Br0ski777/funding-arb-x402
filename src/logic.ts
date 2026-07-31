import type { Hono } from "hono";


// ATXP: requirePayment only fires inside an ATXP context (set by atxpHono middleware).
// For raw x402 requests, the existing @x402/hono middleware handles the gate.
// If neither protocol is active (ATXP_CONNECTION unset), tryRequirePayment is a no-op.
async function tryRequirePayment(price: number): Promise<void> {
  if (!process.env.ATXP_CONNECTION) return;
  try {
    const { requirePayment } = await import("@atxp/server");
    const BigNumber = (await import("bignumber.js")).default;
    await requirePayment({ price: BigNumber(price) });
  } catch (e: any) {
    if (e?.code === -30402) throw e;
  }
}

// In-memory cache with TTL
interface CacheEntry {
  data: any;
  timestamp: number;
}

const CACHE_TTL = 30 * 1000; // 30 seconds
const cache = new Map<string, CacheEntry>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data as T;
  }
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() });
}

interface VenueRate {
  venue: string;
  symbol: string;
  hourlyRate: number; // as percentage
}

interface ArbOpportunity {
  asset: string;
  longVenue: string;
  shortVenue: string;
  longRate: number;
  shortRate: number;
  spread: number;
  annualizedYield: number;
  direction: string;
  venueCount: number;
}

// Normalize symbol: strip suffixes like USDT, -PERP, etc.
function normalizeSymbol(raw: string): string {
  return raw
    .replace(/USDT$/i, "")
    .replace(/USD$/i, "")
    .replace(/-PERP$/i, "")
    .replace(/-SWAP$/i, "")
    .replace(/_PERP$/i, "")
    .toUpperCase();
}

async function fetchHyperliquid(): Promise<VenueRate[]> {
  try {
    const resp = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
    });
    if (!resp.ok) return [];

    const data: any = await resp.json();
    // data = [meta, assetCtxs[]]
    const meta = data?.[0];
    const ctxs = data?.[1];
    if (!meta?.universe || !Array.isArray(ctxs)) return [];

    const rates: VenueRate[] = [];
    for (let i = 0; i < meta.universe.length && i < ctxs.length; i++) {
      const symbol = normalizeSymbol(meta.universe[i].name || "");
      const funding = parseFloat(ctxs[i]?.funding || "0");
      if (symbol && !isNaN(funding)) {
        // Hyperliquid returns hourly funding rate as decimal
        rates.push({ venue: "Hyperliquid", symbol, hourlyRate: funding * 100 });
      }
    }
    return rates;
  } catch {
    return [];
  }
}

async function fetchBinance(): Promise<VenueRate[]> {
  try {
    const resp = await fetch("https://fapi.binance.com/fapi/v1/premiumIndex");
    if (!resp.ok) return [];

    const data: any[] = await resp.json();
    const rates: VenueRate[] = [];
    for (const item of data) {
      const symbol = normalizeSymbol(item.symbol || "");
      const rate = parseFloat(item.lastFundingRate || "0");
      if (symbol && !isNaN(rate)) {
        // Binance returns 8h funding rate, convert to hourly
        rates.push({ venue: "Binance", symbol, hourlyRate: (rate / 8) * 100 });
      }
    }
    return rates;
  } catch {
    return [];
  }
}

async function fetchBybit(): Promise<VenueRate[]> {
  try {
    const resp = await fetch("https://api.bybit.com/v5/market/tickers?category=linear");
    if (!resp.ok) return [];

    const data: any = await resp.json();
    const list: any[] = data?.result?.list || [];
    const rates: VenueRate[] = [];
    for (const item of list) {
      const symbol = normalizeSymbol(item.symbol || "");
      const rate = parseFloat(item.fundingRate || "0");
      if (symbol && !isNaN(rate)) {
        // Bybit returns 8h funding rate, convert to hourly
        rates.push({ venue: "Bybit", symbol, hourlyRate: (rate / 8) * 100 });
      }
    }
    return rates;
  } catch {
    return [];
  }
}

async function fetchOKX(): Promise<VenueRate[]> {
  // OKX funding rate endpoint is per-symbol, so we batch the top 20 assets
  const TOP_SYMBOLS = [
    "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "DOT", "LINK", "MATIC",
    "UNI", "NEAR", "APT", "ARB", "OP", "SUI", "SEI", "TIA", "JUP", "WIF",
  ];

  try {
    const rates: VenueRate[] = [];
    const results = await Promise.allSettled(
      TOP_SYMBOLS.map(async (sym) => {
        const resp = await fetch(
          `https://www.okx.com/api/v5/public/funding-rate?instId=${sym}-USDT-SWAP`
        );
        if (!resp.ok) return null;
        const data: any = await resp.json();
        const item = data?.data?.[0];
        if (!item) return null;
        const rate = parseFloat(item.fundingRate || "0");
        if (isNaN(rate)) return null;
        // OKX returns 8h funding rate, convert to hourly
        return { venue: "OKX", symbol: sym, hourlyRate: (rate / 8) * 100 };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        rates.push(r.value);
      }
    }
    return rates;
  } catch {
    return [];
  }
}

async function scanFundingArbitrage(symbolFilter?: string): Promise<{
  opportunities: ArbOpportunity[];
  venuesOnline: string[];
  totalAssetsScanned: number;
}> {
  const cacheKey = `funding_arb_${symbolFilter || "all"}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached;

  // Fetch all venues in parallel
  const [hlRates, binanceRates, bybitRates, okxRates] = await Promise.all([
    fetchHyperliquid(),
    fetchBinance(),
    fetchBybit(),
    fetchOKX(),
  ]);

  const venuesOnline: string[] = [];
  if (hlRates.length > 0) venuesOnline.push("Hyperliquid");
  if (binanceRates.length > 0) venuesOnline.push("Binance");
  if (bybitRates.length > 0) venuesOnline.push("Bybit");
  if (okxRates.length > 0) venuesOnline.push("OKX");

  // Group all rates by normalized symbol
  const symbolRates = new Map<string, VenueRate[]>();

  for (const rate of [...hlRates, ...binanceRates, ...bybitRates, ...okxRates]) {
    if (symbolFilter && rate.symbol !== symbolFilter.toUpperCase()) continue;

    if (!symbolRates.has(rate.symbol)) {
      symbolRates.set(rate.symbol, []);
    }
    symbolRates.get(rate.symbol)!.push(rate);
  }

  // Calculate arb opportunities for assets on 2+ venues
  const opportunities: ArbOpportunity[] = [];

  for (const [symbol, rates] of symbolRates) {
    // Deduplicate: take only one rate per venue per symbol
    const venueMap = new Map<string, VenueRate>();
    for (const r of rates) {
      if (!venueMap.has(r.venue)) {
        venueMap.set(r.venue, r);
      }
    }

    if (venueMap.size < 2) continue;

    const venueRates = Array.from(venueMap.values());
    venueRates.sort((a, b) => a.hourlyRate - b.hourlyRate);

    const lowest = venueRates[0];
    const highest = venueRates[venueRates.length - 1];

    const spread = highest.hourlyRate - lowest.hourlyRate;
    // Annualized yield: spread per hour * 3 funding periods/day (8h each) * 365 days
    // But since we already have hourly, it's spread * 24 * 365
    // The spec says: spread * 3 * 365 * 100, where spread is already in % terms
    // Actually the spec formula: annualized = spread * 3 * 365 * 100
    // Since spread is hourly rate difference in %, and funding is paid 3x/day (8h intervals)
    // annualized = spread_8h * 3 * 365 where spread_8h = spread_hourly * 8
    const spread8h = spread * 8;
    const annualizedYield = parseFloat((spread8h * 3 * 365).toFixed(2));

    if (spread <= 0) continue;

    opportunities.push({
      asset: symbol,
      longVenue: lowest.venue,
      shortVenue: highest.venue,
      longRate: parseFloat(lowest.hourlyRate.toFixed(6)),
      shortRate: parseFloat(highest.hourlyRate.toFixed(6)),
      spread: parseFloat(spread.toFixed(6)),
      annualizedYield,
      direction: `Long ${symbol} on ${lowest.venue}, Short ${symbol} on ${highest.venue}`,
      venueCount: venueMap.size,
    });
  }

  // Sort by annualized yield descending
  opportunities.sort((a, b) => b.annualizedYield - a.annualizedYield);

  // Return top 20
  const result = {
    opportunities: opportunities.slice(0, 20),
    venuesOnline,
    totalAssetsScanned: symbolRates.size,
  };

  setCache(cacheKey, result);
  return result;
}

export function registerRoutes(app: Hono) {
  app.get("/api/scan", async (c) => {
    await tryRequirePayment(0.002);
    const symbol = c.req.query("symbol") || undefined;

    try {
      const result = await scanFundingArbitrage(symbol);

      if (result.opportunities.length === 0) {
        return c.json({
          results: 0,
          venuesOnline: result.venuesOnline,
          totalAssetsScanned: result.totalAssetsScanned,
          symbolFilter: symbol?.toUpperCase() || "all",
          opportunities: [],
          message: symbol
            ? `No arbitrage opportunities found for ${symbol.toUpperCase()}. It may only be listed on one venue.`
            : "No significant funding rate spreads found across venues.",
        });
      }

      return c.json({
        results: result.opportunities.length,
        venuesOnline: result.venuesOnline,
        totalAssetsScanned: result.totalAssetsScanned,
        symbolFilter: symbol?.toUpperCase() || "all",
        bestOpportunity: {
          asset: result.opportunities[0].asset,
          annualizedYield: `${result.opportunities[0].annualizedYield}%`,
          direction: result.opportunities[0].direction,
        },
        cachedFor: "30s",
        timestamp: new Date().toISOString(),
        opportunities: result.opportunities,
      });
    } catch (err: any) {
      return c.json({ error: "Failed to scan funding rates", details: err.message }, 502);
    }
  });
}
