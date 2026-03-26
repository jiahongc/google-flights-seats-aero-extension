// Content script — injected into seats.aero pages.
// Adds Google Flights links next to award availability results.

(() => {
  'use strict';

  const PROCESSED_ATTR = 'data-gf-processed';
  const LINK_CLASS = 'gf-link';

  let minCpp = 0;

  // Load min CPP setting
  chrome.storage.sync.get({ minCpp: 0 }, (s) => { minCpp = s.minCpp || 0; });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.minCpp) {
      minCpp = changes.minCpp.newValue || 0;
      applyMinCppFilter();
    }
  });

  // Cabin name → protobuf seat enum
  const SEAT_MAP = { 'economy': 1, 'premium': 2, 'business': 3, 'first': 4 };

  function buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode) {
    const seat = SEAT_MAP[cabin] || 1;
    const airlines = airlineCode ? [airlineCode] : [];
    // buildGoogleFlightsTfsUrl is defined in protobuf.js (loaded before this script)
    return buildGoogleFlightsTfsUrl(origin, destination, date, seat, airlines);
  }

  function parseFlightInfo(flightsText) {
    if (!flightsText) return { airlineCode: null, flightNumber: null };
    const match = flightsText.match(/([A-Z]{2})(\d+)/);
    if (!match) return { airlineCode: null, flightNumber: null };
    return { airlineCode: match[1], flightNumber: match[1] + match[2] };
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

  function fetchPrice({ url, cacheKey, link, pointsCost, flightNumber }) {
    chrome.runtime.sendMessage(
      { action: 'fetchGoogleFlightsPrice', url, cacheKey },
      (response) => {
        if (chrome.runtime.lastError || !response) return;
        // Use per-flight price if available, otherwise fall back to lowest
        const price = (flightNumber && response.flightPrices?.[flightNumber]) || response.price;
        if (price !== null && price !== undefined) {
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
    const table = findResultsTable();
    if (!table) return;

    const viewType = detectViewType(table);
    const cols = getColumnIndices(table);
    const rows = table.querySelectorAll('tbody tr:not([' + PROCESSED_ATTR + '])');
    if (rows.length === 0) return;

    const urlParams = getOriginDestFromUrl();
    const urlDate = new URL(location.href).searchParams.get('date') || '';

    for (const row of rows) {
      row.setAttribute(PROCESSED_ATTR, 'true');

      let origin, destination, date, airlineCode, flightNumber;

      if (viewType === 'individual') {
        origin = extractCellText(row, cols.origin) || urlParams.origin;
        destination = extractCellText(row, cols.destination) || urlParams.destination;
        date = urlDate;
        const flightsText = extractCellText(row, cols.flights);
        ({ airlineCode, flightNumber } = parseFlightInfo(flightsText));
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
        const cacheKey = `${origin}-${destination}-${date}-${cabin}-${airlineCode || 'any'}`;
        fetchPrice({ url, cacheKey, link, pointsCost, flightNumber });
      }
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  function removeAllLinks() {
    document.querySelectorAll('.' + LINK_CLASS).forEach(el => el.remove());
    document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR));
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

  function checkUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
