// Background service worker — handles tab creation from content script messages.
// Using the background worker for chrome.tabs.create() avoids popup blocker issues,
// especially for round-trip searches that open 2 tabs.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSeatsAero') {
    const { urls } = message;
    if (!urls || urls.length === 0) {
      sendResponse({ success: false, error: 'No URLs provided' });
      return true;
    }
    urls.forEach((url, index) => {
      chrome.tabs.create({ url, active: index === 0 });
    });
    sendResponse({ success: true, tabsOpened: urls.length });
    return true;
  }

  if (message.action === 'fetchGoogleFlightsPrice') {
    handlePriceFetch(message.url, message.cacheKey).then(sendResponse);
    return true;
  }

  if (message.action === 'getExchangeRates') {
    getExchangeRates().then(sendResponse);
    return true;
  }
});

// ─── Google Flights Price Fetching ──────────────────────────────

// In-memory cache (with TTL) and in-flight request deduplication
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_SIZE = 500;
const priceCache = new Map();
const inflightRequests = new Map();

function getCached(key) {
  const entry = priceCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    priceCache.delete(key);
    return undefined;
  }
  // LRU: move to end (most recently used)
  priceCache.delete(key);
  priceCache.set(key, entry);
  return entry.value;
}

function setCache(key, value) {
  // LRU: if key exists, delete first so it moves to end
  if (priceCache.has(key)) priceCache.delete(key);
  if (priceCache.size >= CACHE_MAX_SIZE) {
    // Evict least recently used (first entry in Map)
    const oldest = priceCache.keys().next().value;
    priceCache.delete(oldest);
  }
  priceCache.set(key, { value, ts: Date.now() });
}

async function handlePriceFetch(url, cacheKey) {
  try {
    // Check cache
    const cached = cacheKey ? getCached(cacheKey) : undefined;
    if (cached !== undefined) {
      return cached;
    }

    // Deduplicate: if the same cacheKey is already being fetched, wait for it
    if (cacheKey && inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey);
    }

    const promise = doFetch(url, cacheKey);
    if (cacheKey) inflightRequests.set(cacheKey, promise);

    const result = await promise;
    if (cacheKey) inflightRequests.delete(cacheKey);
    return result;
  } catch (e) {
    if (cacheKey) inflightRequests.delete(cacheKey);
    return { price: null, error: e.message };
  }
}

async function doFetch(url, cacheKey) {
  const MAX_RETRIES = 1;
  const RETRY_DELAY = 2000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(10000),
      });

      // Retry on transient server errors
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        continue;
      }

      if (!response.ok) {
        return { price: null, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const priceData = extractPrices(html);
      const result = {
        flightPrices: priceData?.flightPrices || {},
        price: priceData?.price || null,
        error: null,
      };

      if (cacheKey && priceData) {
        setCache(cacheKey, result);
      }

      return result;
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY));
        continue;
      }
      return { price: null, error: e.message };
    }
  }
}

function extractPrices(html) {
  // Google Flights embeds price data in <script> tags with class "ds:N".
  // Primary: class="ds:1". Fallback: any script tag containing the price pattern.
  let content = null;

  // Strategy 1: exact class match
  const dsMatch = html.match(/<script[^>]*class=["']ds:1["'][^>]*>([\s\S]*?)<\/script>/);
  if (dsMatch) {
    content = dsMatch[1];
  }

  // Strategy 2: any ds:N script tag containing price patterns
  if (!content || !content.includes('"Cj')) {
    const dsAny = html.match(/<script[^>]*class=["']ds:\d+["'][^>]*>([\s\S]*?)<\/script>/g);
    if (dsAny) {
      for (const tag of dsAny) {
        if (tag.includes('"Cj')) {
          const inner = tag.match(/<script[^>]*>([\s\S]*?)<\/script>/);
          if (inner) { content = inner[1]; break; }
        }
      }
    }
  }

  if (!content) return null;

  // Extract per-flight prices: flight number → price
  const flightPrices = {};
  const flightRe = /\["([A-Z\d]{2})","(\d+)",null,"[^"]+"\]/g;
  let m;
  while ((m = flightRe.exec(content)) !== null) {
    const flightCode = m[1] + m[2];
    // 1500 chars covers multi-segment itineraries (2-3 segments + route
    // summary before the price). 800 was too short for connecting flights.
    const afterFlight = content.substring(m.index, m.index + 1500);
    const priceMatch = afterFlight.match(/\[\[null,(\d+)\],"Cj/);
    if (priceMatch) {
      const p = parseInt(priceMatch[1]);
      if (p > 0 && p < 50000) flightPrices[flightCode] = p;
    }
  }

  // Use the first price in the data as the "best" price — Google Flights
  // orders itineraries by its "Best" ranking, so the first price matches
  // the top result users see by default (not the absolute cheapest).
  let bestPrice = null;
  const priceRe = /\[\[?null,(\d+)\],"Cj/g;
  while ((m = priceRe.exec(content)) !== null) {
    const p = parseInt(m[1]);
    if (p > 0 && p < 50000) {
      if (bestPrice === null) bestPrice = p;
    }
  }

  return { flightPrices, price: bestPrice };
}

// ─── Exchange Rates (frankfurter.dev, ECB data) ──────────────────

const RATES_TTL = 6 * 60 * 60 * 1000; // 6 hours
let cachedRates = null;
let ratesFetchedAt = 0;
let ratesInflight = null;

// Fallback rates in case the API is unreachable
const FALLBACK_RATES = { EUR: 1.08, GBP: 1.27, CAD: 0.74, AUD: 0.66, JPY: 0.0067 };

async function getExchangeRates() {
  if (cachedRates && (Date.now() - ratesFetchedAt < RATES_TTL)) {
    return cachedRates;
  }
  if (ratesInflight) return ratesInflight;

  ratesInflight = fetchRates();
  try {
    const result = await ratesInflight;
    return result;
  } finally {
    ratesInflight = null;
  }
}

async function fetchRates() {
  try {
    const resp = await fetch(
      'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,CAD,AUD,JPY',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // API returns how many foreign units per 1 USD (e.g., EUR: 0.92).
    // We need the inverse: how many USD per 1 foreign unit.
    const rates = {};
    for (const [currency, perUsd] of Object.entries(data.rates)) {
      rates[currency] = perUsd > 0 ? 1 / perUsd : 0;
    }
    cachedRates = rates;
    ratesFetchedAt = Date.now();
    return rates;
  } catch (e) {
    // Use fallback if API fails; don't cache fallback so we retry next time
    if (cachedRates) return cachedRates;
    return FALLBACK_RATES;
  }
}
