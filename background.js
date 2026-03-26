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
  return entry.value;
}

function setCache(key, value) {
  if (priceCache.size >= CACHE_MAX_SIZE) {
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
  const response = await fetch(url, {
    headers: { 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { price: null, error: `HTTP ${response.status}` };
  }

  const html = await response.text();
  const priceData = extractPrices(html);
  const result = {
    flightPrices: priceData?.flightPrices || {},
    price: priceData?.lowest || null,
    error: null,
  };

  if (cacheKey && priceData) {
    setCache(cacheKey, result);
  }

  return result;
}

function extractPrices(html) {
  // Google Flights embeds price data in <script class="ds:1">.
  // Each flight has ["AIRLINE","FLIGHTNUM",null,"Name"] followed by [[null,PRICE],"Cj...]
  const dsMatch = html.match(/<script[^>]*class=["']ds:1["'][^>]*>([\s\S]*?)<\/script>/);
  if (!dsMatch) return null;

  const content = dsMatch[1];

  // Extract per-flight prices: flight number → price
  const flightPrices = {};
  const flightRe = /\["([A-Z\d]{2})","(\d+)",null,"[^"]+"\]/g;
  let m;
  while ((m = flightRe.exec(content)) !== null) {
    const flightCode = m[1] + m[2];
    const afterFlight = content.substring(m.index, m.index + 800);
    const priceMatch = afterFlight.match(/\[\[null,(\d+)\],"Cj/);
    if (priceMatch) {
      const p = parseInt(priceMatch[1]);
      if (p > 0 && p < 50000) flightPrices[flightCode] = p;
    }
  }

  // Also extract overall lowest price as fallback
  let lowest = null;
  const priceRe = /\[null,(\d+)\],"Cj/g;
  while ((m = priceRe.exec(content)) !== null) {
    const p = parseInt(m[1]);
    if (p > 0 && p < 50000 && (lowest === null || p < lowest)) lowest = p;
  }

  return { flightPrices, lowest };
}
