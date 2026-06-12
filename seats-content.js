// Content script — injected into seats.aero pages.
// Adds Google Flights links next to award availability results.

(() => {
  'use strict';

  const LINK_CLASS = 'gf-link';

  let contextValid = true;

  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
  }

  // Settings — synced with popup.js
  const settings = {
    minCpp: 0,          // hide links below this CPP (0 = show all)
    minCppHideRow: false, // hide the whole row when every cabin is below minCpp
    goodCpp: 2,         // green highlight threshold (USD cents per point)
    currency: 'USD',    // display currency for fetched prices
  };

  try {
    chrome.storage.sync.get(settings, (s) => {
      if (chrome.runtime.lastError) return;
      Object.assign(settings, s);
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (!isContextValid()) { contextValid = false; return; }
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in settings) settings[key] = newValue;
      }
      if (changes.minCpp || changes.minCppHideRow) applyMinCppFilter();
      if (changes.goodCpp) reapplyGoodHighlight();
      // currency changes apply to newly processed tables (existing links keep their currency)
    });
  } catch (e) { contextValid = false; }

  // Cabin name → protobuf seat enum
  const SEAT_MAP = { 'economy': 1, 'premium': 2, 'business': 3, 'first': 4 };

  function isDirectOnly() {
    try {
      return new URL(location.href).searchParams.get('direct_only') === 'true';
    } catch (e) { return false; }
  }

  function buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode, nonstop, passengers) {
    const seat = SEAT_MAP[cabin] || 1;
    const airlines = airlineCode ? [airlineCode] : [];
    // buildGoogleFlightsTfsUrl is defined in protobuf.js (loaded before this script)
    return buildGoogleFlightsTfsUrl(origin, destination, date, seat, airlines, nonstop, passengers, settings.currency);
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
    const monthNum = parseInt(match[1], 10);
    const month = match[1].padStart(2, '0');
    const day = match[2].padStart(2, '0');
    let year = fallbackDate ? parseInt(fallbackDate.substring(0, 4), 10) : new Date().getFullYear();
    // Year rollover: searching Dec 30 with flexible days can show 01/02 results
    // (and vice versa). A >6-month gap from the search date means adjacent year.
    const fallbackMonth = fallbackDate ? parseInt(fallbackDate.substring(5, 7), 10) : NaN;
    if (!Number.isNaN(fallbackMonth) && monthNum >= 1 && monthNum <= 12) {
      if (monthNum - fallbackMonth < -6) year++;
      else if (monthNum - fallbackMonth > 6) year--;
    }
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
      if (text === 'program' || text === 'source') indices.program = i;
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

  function fetchPrice({ url, cacheKey, link, pointsCost, fees, flightNumber, allFlightNumbers, viewType, isDirect, program }) {
    try {
      chrome.runtime.sendMessage(
        { action: 'fetchGoogleFlightsPrice', url, cacheKey, currency: settings.currency },
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

          // Fees converted into the display currency (USD is the pivot)
          const feesDisplay = usdToDisplayCurrency(fees?.amountUSD || 0);

          if (viewType === 'summary') {
            // Differentiate direct vs connecting prices for clarity
            if (isDirect) {
              link.textContent = `direct ${formatPrice(price)}+`;
              const adjustedPrice = Math.max(price - feesDisplay, 0);
              const cppApprox = pointsCost > 0 ? (adjustedPrice * 100 / pointsCost).toFixed(1) : null;
              const cppNote = cppApprox ? ` | ~${cppApprox}cpp` : '';
              link.title = `Nonstop cash price from ${formatPrice(price)}${cppNote}`;
              link.classList.add('gf-price-only', 'gf-direct');
            } else {
              // Connecting flights in Individual Flights view —
              // show price without CPP (exact itinerary may differ)
              link.textContent = `from ${formatPrice(price)}`;
              link.title = `Cash price from ${formatPrice(price)}`;
              link.classList.add('gf-price-only');
            }
          } else {
            // Individual Flights: exact flight match, show price + CPP
            // Subtract taxes/fees (converted to the display currency) from the
            // cash price before calculating CPP — fees are paid out of pocket.
            const adjustedPrice = Math.max(price - feesDisplay, 0);
            const cppVal = pointsCost > 0 ? (adjustedPrice * 100 / pointsCost) : 0;
            const cppStr = cppVal.toFixed(2);
            const feesNote = (fees?.amountUSD || 0) > 0
              ? ` (after ${formatFeeAmount(fees)} fees ≈ ${formatPrice(Math.round(feesDisplay))})`
              : '';

            // Highlight threshold: program-specific valuation when known,
            // otherwise the goodCpp setting. Both are USD cents per point,
            // converted into the display currency to match cppVal's unit.
            const baseline = programBaseline(program);
            const thresholdUSD = baseline ? baseline.cpp : (settings.goodCpp || 2);
            const threshold = usdToDisplayCurrency(thresholdUSD);
            const thresholdNote = baseline
              ? ` | good ≥ ${threshold.toFixed(1)}cpp (${program.trim()} valuation)`
              : ` | good ≥ ${threshold.toFixed(1)}cpp`;

            link.textContent = `${formatPrice(price)} · ${cppStr}cpp`;
            link.title = `Cash price: ${formatPrice(price)} | ${cppStr} cents per point${feesNote}${thresholdNote}`;
            link.dataset.cpp = cppStr;
            if (baseline) link.dataset.programBaseline = threshold.toFixed(4);
            if (cppVal >= threshold) {
              link.classList.add('gf-cpp-good');
            }
            applyMinCppFilter();
          }
        }
      );
    } catch (e) { /* Extension context invalidated — ignore */ }
  }

  function applyMinCppFilter() {
    const minCpp = settings.minCpp || 0;
    const rowsToCheck = new Set();
    document.querySelectorAll('.' + LINK_CLASS).forEach(link => {
      const cpp = parseFloat(link.dataset.cpp);
      if (Number.isNaN(cpp)) return; // price not loaded yet, or summary-style link
      link.style.display = (minCpp > 0 && cpp < minCpp) ? 'none' : '';
      const row = link.closest('tr');
      if (row) rowsToCheck.add(row);
    });
    // Optionally hide whole rows where every priced cabin is below the threshold
    for (const row of rowsToCheck) {
      let hasCpp = false;
      let allBelow = true;
      row.querySelectorAll('.' + LINK_CLASS).forEach(link => {
        const cpp = parseFloat(link.dataset.cpp);
        if (Number.isNaN(cpp)) return;
        hasCpp = true;
        if (!(minCpp > 0 && cpp < minCpp)) allBelow = false;
      });
      const hideRow = settings.minCppHideRow && minCpp > 0 && hasCpp && allBelow;
      row.style.display = hideRow ? 'none' : '';
    }
  }

  // Re-evaluate the green highlight after the goodCpp setting changes.
  // Links with a program-specific baseline keep it; others use the new setting.
  function reapplyGoodHighlight() {
    document.querySelectorAll('.' + LINK_CLASS).forEach(link => {
      const cpp = parseFloat(link.dataset.cpp);
      if (Number.isNaN(cpp)) return;
      const threshold = link.dataset.programBaseline
        ? parseFloat(link.dataset.programBaseline)
        : usdToDisplayCurrency(settings.goodCpp || 2);
      link.classList.toggle('gf-cpp-good', cpp >= threshold);
    });
  }

  function parsePointsCost(cellText) {
    // Extract number from "64,700 pts" or "279,000 pts"
    const match = cellText.match(/([\d,]+)\s*pts/i);
    if (!match) return 0;
    return parseInt(match[1].replace(/,/g, ''));
  }

  // Currency symbol → ISO code mapping
  const SYMBOL_TO_ISO = {
    '$': 'USD', 'US$': 'USD', '€': 'EUR', '£': 'GBP', 'C$': 'CAD', 'CA$': 'CAD',
    'A$': 'AUD', 'AU$': 'AUD', '¥': 'JPY', '₩': 'KRW', '₹': 'INR', '₺': 'TRY',
    '₱': 'PHP', '฿': 'THB', 'NZ$': 'NZD', 'HK$': 'HKD', 'S$': 'SGD', 'R$': 'BRL',
  };
  // Display symbols for the popup's currency setting
  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', JPY: '¥' };
  let exchangeRatesLoaded = false;
  // Start with approximate rates (USD per 1 unit); replaced with live rates from background
  let exchangeRates = { EUR: 1.08, GBP: 1.27, CAD: 0.74, AUD: 0.66, JPY: 0.0067 };

  function formatPrice(amount) {
    const sym = CURRENCY_SYMBOLS[settings.currency] || (settings.currency + ' ');
    return `${sym}${amount.toLocaleString()}`;
  }

  // Convert a USD amount into the display currency (rates are USD per 1 unit)
  function usdToDisplayCurrency(amountUSD) {
    if (settings.currency === 'USD') return amountUSD;
    const usdPerUnit = exchangeRates[settings.currency];
    if (!usdPerUnit || usdPerUnit <= 0) return amountUSD;
    return amountUSD / usdPerUnit;
  }

  // Approximate per-program point valuations in USD cents per point.
  // Used as the "good redemption" highlight threshold when the program is known;
  // falls back to the goodCpp setting otherwise. First match wins.
  const PROGRAM_BASELINES = [
    ['aeroplan', 1.5], ['air canada', 1.5],
    ['aadvantage', 1.6], ['american', 1.6],
    ['alaska', 1.6], ['mileage plan', 1.6],
    ['lifemiles', 1.5], ['avianca', 1.5],
    ['executive club', 1.4], ['british', 1.4],
    ['asia miles', 1.3], ['cathay', 1.3],
    ['skymiles', 1.2], ['delta', 1.2],
    ['skywards', 1.2], ['emirates', 1.2],
    ['etihad', 1.3],
    ['flying blue', 1.3], ['air france', 1.3], ['klm', 1.3],
    ['iberia', 1.4],
    ['mileage bank', 1.4], ['japan airlines', 1.4], ['jal', 1.4],
    ['skypass', 1.5], ['korean', 1.5],
    ['miles & more', 1.4], ['miles and more', 1.4], ['lufthansa', 1.4],
    ['qantas', 1.3],
    ['privilege club', 1.4], ['qatar', 1.4],
    ['krisflyer', 1.4], ['singapore', 1.4],
    ['miles&smiles', 1.4], ['miles & smiles', 1.4], ['turkish', 1.4],
    ['mileageplus', 1.3], ['united', 1.3],
    ['flying club', 1.4], ['virgin atlantic', 1.4],
    ['velocity', 1.3], ['virgin australia', 1.3],
    ['connectmiles', 1.4], ['copa', 1.4],
    ['aeromexico', 1.2], ['club premier', 1.2],
    ['alfursan', 1.2], ['saudia', 1.2],
    ['smiles', 1.1], ['gol', 1.1], ['azul', 1.1],
    ['trueblue', 1.3], ['jetblue', 1.3],
  ];

  function programBaseline(programText) {
    if (!programText) return null;
    const t = programText.toLowerCase();
    for (const [name, cpp] of PROGRAM_BASELINES) {
      if (t.includes(name)) return { name, cpp };
    }
    return null;
  }

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

  function getFeeSources(cell) {
    if (!cell || typeof cell === 'string') return [cell || ''];
    const attrs = ['title', 'aria-label', 'data-original-title', 'data-bs-original-title', 'data-tooltip', 'data-tippy-content'];
    const sources = [cell.textContent || ''];
    for (const el of [cell, ...cell.querySelectorAll('*')]) {
      for (const attr of attrs) {
        const value = el.getAttribute(attr);
        if (value) sources.push(value);
      }
    }
    return sources;
  }

  function feeAmountUSD(amount, currency, iso) {
    const currencyIso = iso || SYMBOL_TO_ISO[currency];
    if (currencyIso === 'USD') return amount;
    // Unknown currency or missing rate: skip the fee adjustment entirely.
    // Assuming 1:1 with USD (e.g., for KRW) would wreck the CPP calculation.
    if (!currencyIso) return 0;
    const rate = exchangeRates[currencyIso];
    if (!rate || rate <= 0) return 0;
    return amount * rate;
  }

  function formatFeeAmount(fees) {
    const amount = fees.amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return /^[A-Z]{3}$/.test(fees.currency) ? `${fees.currency} ${amount}` : `${fees.currency}${amount}`;
  }

  function parseFees(cell) {
    // Extract fees from visible text or tooltip attrs, e.g. "+ $92.75 USD", "+ €1,222.74", "+ USD 92.75".
    const symbolRe = /\+\s*(US\$|CA\$|AU\$|NZ\$|HK\$|S\$|R\$|C\$|A\$|[€£¥$₩₹₺₱฿])\s*([\d,]+(?:\.\d{1,2})?)\s*([A-Z]{3})?/i;
    const isoBeforeRe = /\+\s*([A-Z]{3})\s*([\d,]+(?:\.\d{1,2})?)/i;
    const amountBeforeIsoRe = /\+\s*([\d,]+(?:\.\d{1,2})?)\s*([A-Z]{3})\b/i;

    for (const source of getFeeSources(cell)) {
      let match = source.match(symbolRe);
      if (match) {
        const currency = match[1];
        const amount = parseFloat(match[2].replace(/,/g, ''));
        const iso = match[3]?.toUpperCase();
        return { amount, currency, iso, amountUSD: feeAmountUSD(amount, currency, iso) };
      }

      match = source.match(isoBeforeRe);
      if (match) {
        const currency = match[1].toUpperCase();
        const amount = parseFloat(match[2].replace(/,/g, ''));
        return { amount, currency, iso: currency, amountUSD: feeAmountUSD(amount, currency, currency) };
      }

      match = source.match(amountBeforeIsoRe);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const currency = match[2].toUpperCase();
        return { amount, currency, iso: currency, amountUSD: feeAmountUSD(amount, currency, currency) };
      }
    }

    return { amount: 0, currency: '$', iso: 'USD', amountUSD: 0 };
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
    // Carry the seat count into the Google Flights links the user opens.
    // Price fetching stays at 1 adult so the CPP stays per-person.
    const passengers = parseInt(parsedUrl.searchParams.get('min_seats') || '1', 10) || 1;

    for (const row of rows) {
      try {
      let origin, destination, date, airlineCode, flightNumber, allFlightNumbers = [], isConnection = false;
      const program = extractCellText(row, cols.program);

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

        // The link the user opens carries the seat count; the fetch URL stays
        // at 1 adult so the extracted price (and CPP) is per-person.
        const linkUrl = buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode, cellDirect, passengers);
        const fetchUrl = passengers > 1
          ? buildGoogleFlightsUrl(origin, destination, date, cabin, airlineCode, cellDirect, 1)
          : linkUrl;
        const link = createGFLink(linkUrl);
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
        const fees = parseFees(cell);
        const directLabel = cellDirect ? 'nonstop' : 'any-stops';
        const cacheKey = `${origin}-${destination}-${date}-${cabin}-${airlineCode || 'any'}-${directLabel}-${settings.currency}`;
        const cellIsConnection = !cellDirect || isConnection;
        const effectiveViewType = (notAvailable || cellIsConnection) ? 'summary' : viewType;
        fetchPrice({ url: fetchUrl, cacheKey, link, pointsCost, fees, flightNumber, allFlightNumbers, viewType: effectiveViewType, isDirect: cellDirect, program });
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

  // Expose pure helpers for unit tests (no-op in the browser extension)
  if (typeof globalThis.__SEATS_AERO_TEST__ === 'object') {
    Object.assign(globalThis.__SEATS_AERO_TEST__, {
      parseDepartureDate, parseFlightInfo, parsePointsCost, parseFees,
      feeAmountUSD, formatFeeAmount, programBaseline, settings,
    });
  }
})();
