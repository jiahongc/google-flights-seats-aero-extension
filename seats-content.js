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

  function buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode) {
    const seat = SEAT_MAP[cabin] || 1;
    const airlines = airlineCode ? [airlineCode] : [];
    const nonstop = isDirectOnly();
    // buildGoogleFlightsTfsUrl is defined in protobuf.js (loaded before this script)
    return buildGoogleFlightsTfsUrl(origin, destination, date, seat, airlines, nonstop);
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

  function getOriginDestFromUrl() {
    // Fallback: extract from URL params
    const url = new URL(location.href);
    return {
      origin: url.searchParams.get('origins') || '',
      destination: url.searchParams.get('destinations') || '',
    };
  }

  // ─── Price Fetching ──────────────────────────────────────────

  function fetchPrice({ url, cacheKey, link, pointsCost, flightNumber, allFlightNumbers, viewType }) {
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
            // Program Summary: points may not correspond to the same flight as the
            // cash price, so show only the price as a reference — no CPP.
            link.textContent = `from $${price.toLocaleString()}`;
            link.title = `Lowest cash price on this route/date: $${price.toLocaleString()}`;
            link.classList.add('gf-price-only');
          } else {
            // Individual Flights: exact flight match, show price + CPP
            const cppVal = pointsCost > 0 ? (price * 100 / pointsCost) : 0;
            const cppStr = cppVal.toFixed(2);
            link.textContent = `$${price.toLocaleString()} · ${cppStr}cpp`;
            link.title = `Cash price: $${price.toLocaleString()} | ${cppStr} cents per point`;
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
    const table = findResultsTable();
    if (!table) return;

    const viewType = detectViewType(table);
    const cols = getColumnIndices(table);
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) return;

    const urlParams = getOriginDestFromUrl();
    const urlDate = new URL(location.href).searchParams.get('date') || '';

    for (const row of rows) {

      let origin, destination, date, airlineCode, flightNumber, allFlightNumbers = [], isConnection = false;

      if (viewType === 'individual') {
        origin = extractCellText(row, cols.origin) || urlParams.origin;
        destination = extractCellText(row, cols.destination) || urlParams.destination;
        // Extract actual departure date from Departs column (e.g., "11/06 10:55PM")
        const departsText = extractCellText(row, cols.departs);
        date = parseDepartureDate(departsText, urlDate);
        const flightsText = extractCellText(row, cols.flights);
        ({ airlineCode, flightNumber, allFlightNumbers, isConnection } = parseFlightInfo(flightsText));
      } else {
        // Program Summary: has Date column, origin/dest from Departs/Arrives or URL
        date = extractCellText(row, cols.date) || '';
        origin = extractCellText(row, cols.origin) || urlParams.origin;
        destination = extractCellText(row, cols.destination) || urlParams.destination;
        airlineCode = null; // Program Summary doesn't have a specific airline per row
      }

      if (!origin || !destination) continue;

      // Process each cabin column
      const cabins = ['economy', 'premium', 'business', 'first'];
      for (const cabin of cabins) {
        const colIndex = cols[cabin];
        if (colIndex === undefined) continue;

        const cells = row.querySelectorAll('td');
        if (colIndex >= cells.length) continue;
        const cell = cells[colIndex];
        const cellText = cell.textContent.trim();

        // Skip "Not Available" cells
        if (cellText.toLowerCase().includes('not available') || cellText === '' || cellText === '-') continue;

        // Skip if link already injected in this cell
        if (cell.querySelector('.' + LINK_CLASS)) continue;

        const url = buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode);
        const link = createGFLink(url);
        cell.appendChild(link);

        // Fetch price in background and update tooltip
        const pointsCost = parsePointsCost(cellText);
        const direct = isDirectOnly() ? 'nonstop' : 'any-stops';
        const cacheKey = `${origin}-${destination}-${date}-${cabin}-${airlineCode || 'any'}-${direct}`;
        // Connecting flights: show "from $X" (no CPP) since the exact
        // itinerary may differ between seats.aero and Google Flights.
        const effectiveViewType = isConnection ? 'summary' : viewType;
        fetchPrice({ url, cacheKey, link, pointsCost, flightNumber, allFlightNumbers, viewType: effectiveViewType });
      }
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
