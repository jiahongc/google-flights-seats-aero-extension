// Content script — injected into seats.aero pages.
// Adds Google Flights links next to award availability results.

(() => {
  'use strict';

  const LINK_CLASS = 'gf-link';

  let minCpp = 0;
  let contextValid = true;

  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
  }

  // Load min CPP setting
  try {
    chrome.storage.sync.get({ minCpp: 0 }, (s) => { minCpp = s.minCpp || 0; });
    chrome.storage.onChanged.addListener((changes) => {
      if (!isContextValid()) { contextValid = false; return; }
      if (changes.minCpp) {
        minCpp = changes.minCpp.newValue || 0;
        applyMinCppFilter();
      }
    });
  } catch (e) { contextValid = false; }

  // Cabin name → protobuf seat enum
  const SEAT_MAP = { 'economy': 1, 'premium': 2, 'business': 3, 'first': 4 };

  function isDirectOnly() {
    try {
      return new URL(location.href).searchParams.get('direct_only') === 'true';
    } catch (e) { return false; }
  }

  function buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode, nonstop) {
    const seat = SEAT_MAP[cabin] || 1;
    const airlines = airlineCode ? [airlineCode] : [];
    // buildGoogleFlightsTfsUrl is defined in protobuf.js (loaded before this script)
    return buildGoogleFlightsTfsUrl(origin, destination, date, seat, airlines, nonstop);
  }

  /**
   * Detect whether a cell's badge indicates a direct (green) or connecting (blue) flight.
   * On seats.aero, green badges = direct/nonstop, blue badges = connecting.
   * Returns true if the badge is green (direct), false otherwise.
   */
  function isCellDirect(cell, globalDirect) {
    if (globalDirect) return true;
    // Look for the badge element (typically a span with background-color)
    const badges = cell.querySelectorAll('span, .badge, [class*="badge"]');
    for (const badge of badges) {
      const bg = getComputedStyle(badge).backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
      const rgb = bg.match(/\d+/g);
      if (!rgb || rgb.length < 3) continue;
      const [r, g, b] = rgb.map(Number);
      // Green badges: high green, lower red/blue → direct/nonstop
      if (g > 100 && g > r && g > b) return true;
      // Blue badges: high blue, lower red/green → connecting
      if (b > 100 && b > r && b > g) return false;
    }
    return globalDirect;
  }

  function parseDepartureDate(departsText, fallbackDate) {
    // Parse "11/06 10:55PM" or "03/28 6:43PM" → "YYYY-MM-DD"
    if (!departsText) return fallbackDate;
    const match = departsText.match(/(\d{1,2})\/(\d{1,2})/);
    if (!match) return fallbackDate;
    const month = match[1].padStart(2, '0');
    const day = match[2].padStart(2, '0');
    const year = fallbackDate ? fallbackDate.substring(0, 4) : new Date().getFullYear().toString();
    return `${year}-${month}-${day}`;
  }

  function parseFlightInfo(flightsText) {
    if (!flightsText) return { airlineCode: null, flightNumber: null, allFlightNumbers: [], isConnection: false };
    // Extract all flight numbers (e.g., "OZ223, OZ713" → ["OZ223", "OZ713"])
    const allFlights = flightsText.match(/[A-Z\d]{2}\d+/g) || [];
    const isConnection = allFlights.length > 1;
    const match = flightsText.match(/([A-Z\d]{2})(\d+)/);
    if (!match) return { airlineCode: null, flightNumber: null, allFlightNumbers: [], isConnection: false };
    return { airlineCode: match[1], flightNumber: match[1] + match[2], allFlightNumbers: allFlights, isConnection };
  }

  // ─── DOM Parsing ──────────────────────────────────────────────

  function findResultsTable() {
    // seats.aero uses DataTables — look for the results table
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headers = table.querySelectorAll('th');
      for (const th of headers) {
        const text = th.textContent.trim().toLowerCase();
        if (text === 'economy' || text === 'business' || text === 'departs' || text === 'arrives') {
          return table;
        }
      }
    }
    return null;
  }

  function detectViewType(table) {
    const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
    // Individual Flights has "Flights", "Duration", "From", "To" columns
    if (headers.includes('flights') || headers.includes('duration')) return 'individual';
    // Program Summary has "Date", "Last Seen", "Program" columns
    if (headers.includes('date') || headers.includes('last seen')) return 'summary';
    return 'unknown';
  }

  function getColumnIndices(table) {
    const headers = Array.from(table.querySelectorAll('th'));
    const indices = {};
    headers.forEach((th, i) => {
      const text = th.textContent.trim().toLowerCase();
      if (text === 'date') indices.date = i;
      if (text === 'from') indices.from = i;
      if (text === 'to') indices.to = i;
      if (text === 'departs') indices.departs = i;
      if (text === 'arrives') indices.arrives = i;
      if (text === 'program') indices.program = i;
      if (text === 'flights') indices.flights = i;
      if (text === 'economy') indices.economy = i;
      if (text === 'premium') indices.premium = i;
      if (text === 'business') indices.business = i;
      if (text === 'first') indices.first = i;
    });
    // Origin/destination: prefer "From"/"To" columns, fall back to "Departs"/"Arrives"
    indices.origin = indices.from ?? indices.departs;
    indices.destination = indices.to ?? indices.arrives;
    return indices;
  }

  function extractCellText(row, index) {
    const cells = row.querySelectorAll('td');
    if (index === undefined || index >= cells.length) return null;
    return cells[index]?.textContent?.trim() || null;
  }

  // getOriginDestFromUrl inlined into processTable to share a single URL parse

  // ─── Price Fetching ──────────────────────────────────────────

  function fetchPrice({ url, cacheKey, link, pointsCost, fees, flightNumber, allFlightNumbers, viewType, isDirect }) {
    try {
      chrome.runtime.sendMessage(
        { action: 'fetchGoogleFlightsPrice', url, cacheKey },
        (response) => {
          if (chrome.runtime.lastError || !response || response.error) {
            link.textContent = '✈';
            link.classList.add('gf-no-price');
            link.title = 'Price unavailable — click to view on Google Flights';
            return;
          }
          // Try matching per-flight price: first the primary flight number,
          // then any segment in a multi-segment itinerary.
          let price = flightNumber && response.flightPrices?.[flightNumber];
          if (!price && allFlightNumbers?.length > 1) {
            for (const fn of allFlightNumbers) {
              if (response.flightPrices?.[fn]) { price = response.flightPrices[fn]; break; }
            }
          }
          if (!price) price = response.price;
          if (price === null || price === undefined) {
            link.textContent = '✈';
            link.classList.add('gf-no-price');
            link.title = 'Price unavailable — click to view on Google Flights';
            return;
          }

          if (viewType === 'summary') {
            // Differentiate direct vs connecting prices for clarity
            if (isDirect) {
              link.textContent = `direct $${price.toLocaleString()}+`;
              const cppApprox = pointsCost > 0 ? (price * 100 / pointsCost).toFixed(1) : null;
              const cppNote = cppApprox ? ` | ~${cppApprox}cpp` : '';
              link.title = `Nonstop cash price from $${price.toLocaleString()}${cppNote}`;
              link.classList.add('gf-price-only', 'gf-direct');
            } else {
              // Connecting flights in Individual Flights view —
              // show price without CPP (exact itinerary may differ)
              link.textContent = `from $${price.toLocaleString()}`;
              link.title = `Cash price from $${price.toLocaleString()}`;
              link.classList.add('gf-price-only');
            }
          } else {
            // Individual Flights: exact flight match, show price + CPP
            // Subtract taxes/fees (converted to USD) from cash price before
            // calculating CPP — fees are paid out of pocket regardless.
            const feesUSD = fees?.amountUSD || 0;
            const adjustedPrice = Math.max(price - feesUSD, 0);
            const cppVal = pointsCost > 0 ? (adjustedPrice * 100 / pointsCost) : 0;
            const cppStr = cppVal.toFixed(2);
            const feesNote = feesUSD > 0
              ? ` (after ${fees.currency}${fees.amount.toLocaleString()} fees ≈ $${Math.round(feesUSD).toLocaleString()})`
              : '';
            link.textContent = `$${price.toLocaleString()} · ${cppStr}cpp`;
            link.title = `Cash price: $${price.toLocaleString()} | ${cppStr} cents per point${feesNote}`;
            link.dataset.cpp = cppStr;
            if (cppVal >= 2.0) {
              link.classList.add('gf-cpp-good');
            }
            if (minCpp > 0 && cppVal < minCpp) {
              link.style.display = 'none';
            }
          }
        }
      );
    } catch (e) { /* Extension context invalidated — ignore */ }
  }

  function applyMinCppFilter() {
    document.querySelectorAll('.' + LINK_CLASS).forEach(link => {
      const cpp = parseFloat(link.dataset.cpp);
      if (!cpp && cpp !== 0) return; // price not loaded yet
      link.style.display = (minCpp > 0 && cpp < minCpp) ? 'none' : '';
    });
  }

  function parsePointsCost(cellText) {
    // Extract number from "64,700 pts" or "279,000 pts"
    const match = cellText.match(/([\d,]+)\s*pts/i);
    if (!match) return 0;
    return parseInt(match[1].replace(/,/g, ''));
  }

  // Currency symbol → ISO code mapping
  const SYMBOL_TO_ISO = { '€': 'EUR', '£': 'GBP', 'C$': 'CAD', 'A$': 'AUD', '¥': 'JPY' };
  let exchangeRatesLoaded = false;
  // Start with approximate rates; replaced with live rates from background
  let exchangeRates = { EUR: 1.08, GBP: 1.27, CAD: 0.74, AUD: 0.66, JPY: 0.0067 };

  function loadExchangeRates() {
    try {
      chrome.runtime.sendMessage({ action: 'getExchangeRates' }, (rates) => {
        if (chrome.runtime.lastError || !rates) return;
        exchangeRates = rates;
        exchangeRatesLoaded = true;
      });
    } catch (e) { /* context invalidated */ }
  }

  // Fetch rates on load
  loadExchangeRates();

  function parseFees(cellText) {
    // Extract fees like "+ €1,222.74", "+ $500", "+ £300", "+ ¥15,000"
    const match = cellText.match(/\+\s*(C\$|A\$|[€£¥$])\s*([\d,]+(?:\.\d{1,2})?)/);
    if (!match) return { amount: 0, currency: '$', amountUSD: 0 };
    const currency = match[1];
    const amount = parseFloat(match[2].replace(/,/g, ''));
    if (currency === '$') return { amount, currency, amountUSD: amount };
    const iso = SYMBOL_TO_ISO[currency];
    const rate = (iso && exchangeRates[iso]) || 1;
    return { amount, currency, amountUSD: amount * rate };
  }

  // ─── Link Creation ────────────────────────────────────────────

  function createGFLink(url) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = LINK_CLASS;
    link.textContent = '✈';
    link.title = 'View on Google Flights';
    return link;
  }

  // ─── Injection ────────────────────────────────────────────────

  function processTable() {
    if (!contextValid && !isContextValid()) return;
    // Retry exchange rate fetch if the initial load failed (cold service worker)
    if (!exchangeRatesLoaded) loadExchangeRates();
    const table = findResultsTable();
    if (!table) { console.debug('[seats-gf] No results table found'); return; }

    const viewType = detectViewType(table);
    const cols = getColumnIndices(table);
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) return;

    // Parse URL once for all rows
    const parsedUrl = new URL(location.href);
    const urlParams = {
      origin: parsedUrl.searchParams.get('origins') || '',
      destination: parsedUrl.searchParams.get('destinations') || '',
    };
    const urlDate = parsedUrl.searchParams.get('date') || '';
    const globalDirect = parsedUrl.searchParams.get('direct_only') === 'true';

    for (const row of rows) {
      try {
      let origin, destination, date, airlineCode, flightNumber, allFlightNumbers = [], isConnection = false;

      if (viewType === 'individual') {
        origin = extractCellText(row, cols.origin) || urlParams.origin;
        destination = extractCellText(row, cols.destination) || urlParams.destination;
        const departsText = extractCellText(row, cols.departs);
        date = parseDepartureDate(departsText, urlDate);
        const flightsText = extractCellText(row, cols.flights);
        ({ airlineCode, flightNumber, allFlightNumbers, isConnection } = parseFlightInfo(flightsText));
      } else {
        date = extractCellText(row, cols.date) || '';
        origin = extractCellText(row, cols.origin) || urlParams.origin;
        destination = extractCellText(row, cols.destination) || urlParams.destination;
        airlineCode = null;
      }

      if (!origin || !destination) continue;

      const cabins = ['economy', 'premium', 'business', 'first'];
      const cells = row.querySelectorAll('td');
      for (const cabin of cabins) {
        const colIndex = cols[cabin];
        if (colIndex === undefined || colIndex >= cells.length) continue;
        const cell = cells[colIndex];
        const cellText = cell.textContent.trim();

        const notAvailable = cellText.toLowerCase().includes('not available') || cellText === '' || cellText === '-';
        if (notAvailable && viewType !== 'individual') continue;
        if (cell.querySelector('.' + LINK_CLASS)) continue;

        // Green badge = direct/nonstop, blue badge = connecting
        const cellDirect = isCellDirect(cell, globalDirect);

        const url = buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode, cellDirect);
        const link = createGFLink(url);
        cell.appendChild(link);

        // Non-direct in summary view: just show clickable link, no price fetch
        // (Google Flights has no "connecting only" filter, so price would be misleading)
        if (viewType === 'summary' && !cellDirect) {
          link.textContent = 'non-direct ✈';
          link.title = 'Click to view connecting flights on Google Flights';
          link.classList.add('gf-price-only');
          continue;
        }

        const pointsCost = parsePointsCost(cellText);
        const fees = parseFees(cellText);
        const directLabel = cellDirect ? 'nonstop' : 'any-stops';
        const cacheKey = `${origin}-${destination}-${date}-${cabin}-${airlineCode || 'any'}-${directLabel}`;
        const cellIsConnection = !cellDirect || isConnection;
        const effectiveViewType = (notAvailable || cellIsConnection) ? 'summary' : viewType;
        fetchPrice({ url, cacheKey, link, pointsCost, fees, flightNumber, allFlightNumbers, viewType: effectiveViewType, isDirect: cellDirect });
      }
      } catch (e) { console.warn('[seats-gf] Error processing row:', e); }
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  function removeAllLinks() {
    document.querySelectorAll('.' + LINK_CLASS).forEach(el => el.remove());
  }

  // ─── Observer ─────────────────────────────────────────────────

  let debounceTimer = null;

  function setupObserver() {
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => processTable(), 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── URL Change Detection ────────────────────────────────────

  let lastUrl = location.href;
  let lastDirectOnly = isDirectOnly();

  function checkUrlChange() {
    const currentDirectOnly = isDirectOnly();
    if (location.href !== lastUrl || currentDirectOnly !== lastDirectOnly) {
      lastUrl = location.href;
      lastDirectOnly = currentDirectOnly;
      removeAllLinks();
      setTimeout(() => processTable(), 500);
    }
  }

  // Intercept SPA navigation
  const origPushState = history.pushState;
  history.pushState = function(...args) {
    origPushState.apply(this, args);
    checkUrlChange();
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    origReplaceState.apply(this, args);
    checkUrlChange();
  };
  window.addEventListener('popstate', checkUrlChange);

  // ─── Initialize ───────────────────────────────────────────────

  function init() {
    // Only activate on search pages
    if (!location.pathname.includes('/search')) return;

    // Initial injection (with delay for SPA rendering)
    setTimeout(() => processTable(), 1000);
    setupObserver();

    // Periodic re-check for filter/sort/pagination/URL changes
    const intervalId = setInterval(() => {
      if (!isContextValid()) { contextValid = false; clearInterval(intervalId); return; }
      checkUrlChange();
      processTable();
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
