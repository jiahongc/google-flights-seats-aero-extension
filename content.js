// Content script — injected into Google Flights pages.
// Detects search results, injects seats.aero buttons (global + per-flight),
// extracts flight parameters, and opens seats.aero in a new tab.

(() => {
  'use strict';

  const BUTTON_ID = 'seats-aero-btn';
  const SEARCH_PATH = '/travel/flights/search';

  let contextValid = true;

  function isContextValid() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
  }

  // Default settings — synced with popup.js
  let settings = {
    globalButton: true,
    flexibleDaysNum: 0,
  };

  // Load settings from storage
  function loadSettings() {
    try {
      chrome.storage.sync.get(settings, (saved) => {
        if (chrome.runtime.lastError) return;
        settings = { ...settings, ...saved };
        applySettingsToPage();
      });
    } catch (e) { contextValid = false; }
  }

  // Listen for settings changes from popup
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (!isContextValid()) { contextValid = false; return; }
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in settings) settings[key] = newValue;
      }
      applySettingsToPage();
    });
  } catch (e) { contextValid = false; }

  // Apply visibility classes based on settings
  function applySettingsToPage() {
    document.body.classList.toggle('seats-aero-hide-global', !settings.globalButton);
  }

  // METRO_CODES is loaded from metros.js (injected before this script)

  // ─── SVG icon helper (DOM-based, avoids innerHTML for Trusted Types) ──

  const PLANE_PATH_D = 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z';

  function createPlaneIcon(size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', PLANE_PATH_D);
    svg.appendChild(path);
    return svg;
  }

  // ─── Input extraction helpers ────────────────────────────────────

  function findInput(ariaLabelSubstring) {
    let input = document.querySelector(`input[aria-label="${ariaLabelSubstring}"]`);
    if (input) return input;
    input = document.querySelector(`input[aria-label*="${ariaLabelSubstring}"]`);
    if (input) return input;
    const allInputs = document.querySelectorAll('input[aria-label]');
    for (const el of allInputs) {
      const label = el.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes(ariaLabelSubstring.toLowerCase())) return el;
    }
    return null;
  }

  function getFieldValue(ariaLabelSubstring) {
    const input = findInput(ariaLabelSubstring);
    if (input) {
      // Strategy 1: input.value (may be just city name like "Newark")
      const inputVal = (input.value || '').trim();

      // Strategy 2: Look for IATA codes near the input in the DOM
      // Google Flights shows "Newark EWR" visually, but input.value is just "Newark"
      // The "EWR" is in a separate child element nearby
      if (inputVal) {
        const iataContextRegex = new RegExp(
          inputVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+([A-Z]{3})', 'i'
        );
        let container = input.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          // Search direct children for standalone IATA codes (3 uppercase letters)
          for (const child of container.children) {
            const childText = child.textContent.trim();
            if (/^[A-Z]{3}$/.test(childText)) {
              return inputVal + ' ' + childText;
            }
          }
          // Check container text for "CityName CODE" pattern
          const containerText = container.textContent.trim();
          if (containerText.length < 60) {
            const iataInContext = containerText.match(iataContextRegex);
            if (iataInContext) {
              return inputVal + ' ' + iataInContext[1].toUpperCase();
            }
          }
          container = container.parentElement;
        }
        // No IATA code found nearby — return just the city name
        return inputVal;
      }

      // Strategy 3: data-value attributes (for date fields etc.)
      let container = input.parentElement;
      for (let i = 0; i < 6 && container; i++) {
        const candidates = container.querySelectorAll('[data-value]');
        for (const el of candidates) {
          const dataVal = el.getAttribute('data-value');
          if (dataVal && dataVal.trim()) return dataVal.trim();
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  function extractFromPageTitle() {
    const title = document.title || '';
    const match = title.match(/^(.+?)\s+to\s+(.+?)\s*[|\-–]/i);
    if (match) return { origin: match[1].trim(), destination: match[2].trim() };
    return null;
  }

  function resolveAirportCode(text, isOrigin) {
    if (!text) return null;

    // Check for explicit IATA code (uppercase 3 letters, not an airline name)
    const iataMatch = text.match(/\b([A-Z]{3})\b/);
    if (iataMatch && !AIRLINE_CODES[iataMatch[1]]) return iataMatch[1];

    // Case-insensitive trailing code (e.g., "Seattle Sea")
    const iataMatchCI = text.match(/\b([A-Za-z]{3})\s*$/);
    if (iataMatchCI) {
      const code = iataMatchCI[1].toUpperCase();
      const preceding = text.slice(0, iataMatchCI.index).trim();
      if (preceding.length > 0 && !AIRLINE_CODES[code]) return code;
    }

    // Metro code lookup
    const cleanText = text
      .replace(/\s*\(.*?\)/g, '')
      .replace(/\s*[A-Z]{3}\s*$/g, '')
      .replace(/\s*(All airports|Metropolitan Area|area|,.*$)/gi, '')
      .trim().toLowerCase();
    if (METRO_CODES[cleanText]) return METRO_CODES[cleanText];

    // Partial metro match — require word boundary alignment to avoid false matches
    // (e.g., "mobile" shouldn't match "automobile")
    for (const [city, code] of Object.entries(METRO_CODES)) {
      if (cleanText === city) return code;
      // Only match if search text starts with or ends with the city name at a word boundary
      if (cleanText.length >= 3 && city.length >= 3) {
        if (cleanText.startsWith(city + ' ') || cleanText.endsWith(' ' + city)) return code;
        if (city.startsWith(cleanText + ' ') || city.endsWith(' ' + cleanText)) return code;
      }
    }

    // Extract from flight result rows
    const codes = extractAirportCodesFromResults(isOrigin);
    if (codes.length > 0) return codes.join(',');

    // Last resort: extract from page title ("Newark to Dallas | Google Flights")
    const titleData = extractFromPageTitle();
    if (titleData) {
      const titleText = isOrigin ? titleData.origin : titleData.destination;
      if (titleText && titleText !== text) {
        const titleCode = resolveAirportCode(titleText, isOrigin);
        if (titleCode) return titleCode;
      }
    }

    return null;
  }

  function extractAirportCodesFromResults(isOrigin) {
    const codes = new Set();
    // Scope to flight result rows only, not the entire page
    const flightRows = document.querySelectorAll('li.pIav2d');
    for (const row of flightRows) {
      for (const span of row.querySelectorAll('span')) {
        const text = span.textContent.trim();
        if (/^[A-Z]{3}$/.test(text) && !AIRLINE_CODES[text]) {
          codes.add(text);
        }
      }
    }
    // Return only origin or destination codes based on position in route pairs
    if (codes.size >= 2) {
      // If we have multiple codes, try to identify origin vs destination from route patterns
      const routeCodes = new Set();
      for (const row of flightRows) {
        const text = row.textContent || '';
        const match = text.match(/\b([A-Z]{3})\s*[–\-]\s*([A-Z]{3})\b/);
        if (match) routeCodes.add(isOrigin ? match[1] : match[2]);
      }
      if (routeCodes.size > 0) return [...routeCodes];
    }
    return [...codes];
  }

  function parseDate(dateText) {
    if (!dateText) return null;
    const months = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
      'january': 0, 'february': 1, 'march': 2, 'april': 3, 'june': 5,
      'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11,
    };
    const match = dateText.match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (!match) return null;
    const monthIndex = months[match[1].toLowerCase()];
    if (monthIndex === undefined) return null;
    const day = parseInt(match[2], 10);
    const now = new Date();
    let year = now.getFullYear();
    // Use month/day comparison to avoid timezone issues with Date objects.
    // If the date appears to be in the past, assume it's next year.
    // Allow a 1-day buffer to handle timezone edge cases around midnight.
    const todayMonth = now.getMonth();
    const todayDay = now.getDate();
    if (monthIndex < todayMonth || (monthIndex === todayMonth && day < todayDay - 1)) year++;
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function getTripType() {
    // Check the trip type selector (dropdown at top of search form)
    const el = document.querySelector('[aria-label*="ticket type"], [aria-label*="Trip type"]');
    if (el) {
      const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
      // Check multi-city FIRST — it's the most specific and shouldn't fall through
      if (text.includes('multi-city') || text.includes('multi city')) return 'multi-city';
      if (text.includes('round trip')) return 'round-trip';
      if (text.includes('one way')) return 'one-way';
    }
    // Fallback: look for visible "Multi-city" text in the trip type area
    const allButtons = document.querySelectorAll('[role="button"], button');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text === 'multi-city' || text === 'multi city') return 'multi-city';
    }
    const returnInput = findInput('Return');
    return returnInput ? 'round-trip' : 'one-way';
  }

  function classifyCabin(text) {
    const t = text.toLowerCase();
    if (t.includes('first')) return 'first';
    if (t.includes('business')) return 'business';
    if (t.includes('premium')) return 'premium';
    if (t.includes('economy')) return 'economy';
    return null;
  }

  function getCabinClass() {
    const el = document.querySelector('[aria-label*="seating class"], [aria-label*="cabin"]');
    if (el) {
      const result = classifyCabin(el.textContent || el.getAttribute('aria-label') || '');
      if (result) return result;
    }
    const comboboxes = document.querySelectorAll('div[role="combobox"]');
    for (const cb of comboboxes) {
      const result = classifyCabin(cb.textContent || '');
      if (result) return result;
    }
    return 'economy';
  }

  function isNonstopFilterActive() {
    const btns = document.querySelectorAll('[aria-label*="Stops"], [aria-label*="stops"]');
    for (const btn of btns) {
      if ((btn.textContent || '').toLowerCase().includes('nonstop')) return true;
    }
    return false;
  }

  function getPassengerCount() {
    const btns = document.querySelectorAll('[aria-label*="passenger"]');
    for (const btn of btns) {
      const match = (btn.getAttribute('aria-label') || '').match(/(\d+)\s*passenger/i);
      if (match) return parseInt(match[1], 10);
    }
    return 1;
  }

  /**
   * Extract selected airlines from the Google Flights Airlines filter.
   *
   * Google Flights Airlines filter behavior:
   * - Default (no filter): button text is "Airlines" and aria-label is "Airlines, Not selected"
   * - With filter: aria-label changes to e.g. "Airlines, 1 of 16 selected" or similar
   *   and the dropdown shows checkboxes with airline names
   *
   * Strategy:
   * 1. Check if the Airlines filter is active (aria-label indicates selection)
   * 2. Open the dropdown programmatically is not feasible, so we look for
   *    airline names in the filter button's text or nearby elements
   * 3. Also check for airline chips/tags that appear when filtered
   */
  function getSelectedAirlines() {
    // Check if the Airlines filter is active
    const filterBar = document.querySelector('[aria-label*="All filters"]')?.parentElement?.parentElement;
    const btns = (filterBar || document).querySelectorAll('button, [role="button"]');

    let airlinesBtn = null;
    for (const btn of btns) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').trim();
      if (!label.includes('airlines') && text !== 'Airlines') continue;
      if (label.includes('not selected') || text === 'Airlines') continue;
      airlinesBtn = btn;
      break;
    }

    if (!airlinesBtn) return [];

    // Airlines filter is active — extract IATA codes from URL.
    // Google Flights encodes airline selections in the `tfs` URL parameter as
    // protobuf field 6 (tag byte 0x32), each a 2-byte IATA code: \x32\x02XX.
    return extractAirlinesFromUrl();
  }

  function extractAirlinesFromUrl() {
    const codes = [];
    try {
      const url = new URL(location.href);
      const tfs = url.searchParams.get('tfs');
      if (!tfs) return codes;

      // Decode base64url (Google uses URL-safe base64)
      const b64 = tfs.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(b64);

      // Google Flights encodes selected airlines in the `tfs` protobuf as field 6
      // (tag byte 0x32), wire type 2 (length-delimited), with 2-byte IATA codes.
      // Pattern: \x32\x02 followed by a 2-char IATA airline code.
      // Accept any valid 2-letter IATA code (uppercase letters or digits), not just
      // codes in our AIRLINE_CODES mapping, so airlines like IndiGo (6E) aren't dropped.
      for (let i = 0; i < binary.length - 3; i++) {
        if (binary.charCodeAt(i) === 0x32 && binary.charCodeAt(i + 1) === 0x02) {
          const code = binary[i + 2] + binary[i + 3];
          if (/^[A-Z0-9]{2}$/.test(code) && !codes.includes(code)) codes.push(code);
        }
      }
    } catch (e) {
      // Silently fail — airline filter just won't be passed to seats.aero
    }
    return codes;
  }

  // ─── URL construction ────────────────────────────────────────────

  function buildSeatsAeroUrl(params) {
    const url = new URL('https://seats.aero/search');
    url.searchParams.set('origins', params.origins);
    url.searchParams.set('destinations', params.destinations);
    url.searchParams.set('date', params.date);
    url.searchParams.set('applicable_cabin', params.cabin || 'economy');
    if (params.directOnly) url.searchParams.set('direct_only', 'true');
    if (params.airlines && params.airlines.length > 0) {
      url.searchParams.set('op_carriers', params.airlines.join(','));
    }
    if (params.passengers > 1) url.searchParams.set('min_seats', params.passengers.toString());
    if (params.flexibleDays) {
      url.searchParams.set('additional_days', 'true');
      url.searchParams.set('additional_days_num', String(params.flexibleDays));
    }
    // Per-flight searches show individual flights; global shows program summary
    if (params.showIndividual) {
      url.searchParams.set('show_individual', 'true');
    }
    return url.toString();
  }

  function openSeatsAero(urls) {
    try {
      chrome.runtime.sendMessage({ action: 'openSeatsAero', urls }, (response) => {
        if (chrome.runtime.lastError) {
          urls.forEach(url => window.open(url, '_blank'));
        }
      });
    } catch (e) {
      contextValid = false;
      urls.forEach(url => window.open(url, '_blank'));
    }
  }

  // ─── Global button (extract all page-level params) ───────────────

  function extractMultiCityLegs() {
    const legs = [];

    // Strategy 1: Use leg row containers (.PTNZsf) with sub-containers
    const legRows = document.querySelectorAll('.PTNZsf');
    if (legRows.length > 1) {
      for (const row of legRows) {
        const originInput = row.querySelector('.BGeFcf input[role="combobox"]')
          || row.querySelector('.BGeFcf input[aria-label*="Where from"]');
        const destInput = row.querySelector('.vxNK6d input[role="combobox"]')
          || row.querySelector('.vxNK6d input[aria-label*="Where to"]');
        const dateDataEl = row.querySelector('.icWGef [data-value]');
        const dateInput = row.querySelector('input[aria-label="Departure"]');

        const originText = (originInput?.value || '').trim();
        const destText = (destInput?.value || '').trim();
        const dateIso = dateDataEl?.getAttribute('data-value') || '';
        const dateText = (dateInput?.value || '').trim();

        if (!originText || !destText) continue;

        const origin = resolveAirportCode(originText, true);
        const dest = resolveAirportCode(destText, false);
        const date = dateIso || parseDate(dateText);
        if (origin && dest && date) {
          legs.push({ origin, destination: dest, date, originText, destText, dateText: dateText || dateIso });
        }
      }
      if (legs.length > 1) return legs;
    }

    // Strategy 2 (fallback): collect visible from/to/departure inputs by index
    const allInputs = document.querySelectorAll('input[aria-label]');
    const fromInputs = [];
    const toInputs = [];
    const departureInputs = [];
    for (const input of allInputs) {
      if (input.offsetParent === null) continue;
      const label = (input.getAttribute('aria-label') || '').toLowerCase().trim();
      if (label.startsWith('where from')) fromInputs.push(input);
      else if (label.startsWith('where to')) toInputs.push(input);
      else if (label === 'departure') departureInputs.push(input);
    }

    const legCount = Math.min(fromInputs.length, toInputs.length, departureInputs.length);
    if (legCount <= 1) return null;

    for (let i = 0; i < legCount; i++) {
      const originText = (fromInputs[i].value || '').trim();
      const destText = (toInputs[i].value || '').trim();
      const dateText = (departureInputs[i].value || '').trim();
      if (!originText || !destText || !dateText) continue;

      const origin = resolveAirportCode(originText, true);
      const dest = resolveAirportCode(destText, false);
      const date = parseDate(dateText);
      if (origin && dest && date) {
        legs.push({ origin, destination: dest, date, originText, destText, dateText });
      }
    }

    return legs.length > 1 ? legs : null;
  }

  function extractGlobalParams() {
    const tripType = getTripType();
    const cabin = getCabinClass();
    const directOnly = isNonstopFilterActive();
    const passengers = getPassengerCount();
    const flexDays = settings.flexibleDaysNum || 0;
    const airlines = getSelectedAirlines();
    const baseParams = { cabin, directOnly, airlines, passengers, flexibleDays: flexDays };

    // Multi-city: detect by multiple leg rows OR trip type label
    const multiLegs = (tripType === 'multi-city' || document.querySelectorAll('.PTNZsf').length > 1)
      ? extractMultiCityLegs() : null;
    if (multiLegs && multiLegs.length > 0) {
      const legs = multiLegs.map(leg => ({
        label: `${leg.origin} → ${leg.destination} · ${leg.dateText}`,
        url: buildSeatsAeroUrl({ origins: leg.origin, destinations: leg.destination, date: leg.date, ...baseParams }),
      }));
      return { legs, error: null };
    }

    // One-way and round-trip
    let originText = getFieldValue('Where from');
    let destText = getFieldValue('Where to');
    const departureDateText = getFieldValue('Departure');
    const returnDateText = getFieldValue('Return');

    if (!originText || !destText) {
      const titleData = extractFromPageTitle();
      if (titleData) {
        if (!originText) originText = titleData.origin;
        if (!destText) destText = titleData.destination;
      }
    }

    const origins = resolveAirportCode(originText, true);
    const destinations = resolveAirportCode(destText, false);
    const departureDate = parseDate(departureDateText);

    if (!origins) return { legs: [], error: 'Could not determine origin airport' };
    if (!destinations) return { legs: [], error: 'Could not determine destination airport' };
    if (!departureDate) return { legs: [], error: 'Could not determine departure date' };

    const legs = [{
      label: `${origins} → ${destinations} · ${departureDateText || departureDate}`,
      url: buildSeatsAeroUrl({ origins, destinations, date: departureDate, ...baseParams }),
    }];

    if (tripType === 'round-trip' && returnDateText) {
      const returnDate = parseDate(returnDateText);
      if (returnDate) {
        legs.push({
          label: `${destinations} → ${origins} · ${returnDateText || returnDate}`,
          url: buildSeatsAeroUrl({ origins: destinations, destinations: origins, date: returnDate, ...baseParams }),
        });
      }
    }

    return { legs, error: null };
  }

  function dismissDropdown() {
    const existing = document.querySelector('.seats-aero-dropdown');
    if (existing) existing.remove();
    document.removeEventListener('click', handleOutsideClick, true);
  }

  function handleOutsideClick(e) {
    const dropdown = document.querySelector('.seats-aero-dropdown');
    const btn = document.getElementById(BUTTON_ID);
    if (dropdown && !dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      dismissDropdown();
    }
  }

  function showLegDropdown(btn, legs) {
    dismissDropdown();

    const dropdown = document.createElement('div');
    dropdown.className = 'seats-aero-dropdown';

    // Individual leg options
    legs.forEach((leg) => {
      const item = document.createElement('button');
      item.className = 'seats-aero-dropdown-item';
      item.textContent = leg.label;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissDropdown();
        openSeatsAero([leg.url]);
      });
      dropdown.appendChild(item);
    });

    // "All legs" option with separator
    const allItem = document.createElement('button');
    allItem.className = 'seats-aero-dropdown-item seats-aero-dropdown-sep';
    const allLabel = legs.length === 2 ? 'Both legs' : `All ${legs.length} legs`;
    allItem.textContent = `${allLabel} (opens ${legs.length} tabs)`;
    allItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissDropdown();
      openSeatsAero(legs.map(l => l.url));
    });
    dropdown.appendChild(allItem);

    btn.appendChild(dropdown);

    // Dismiss on outside click (delayed to avoid catching the current click)
    setTimeout(() => document.addEventListener('click', handleOutsideClick, true), 0);
  }

  function showButtonError(btn, error) {
    btn.classList.add('seats-aero-error');
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(document.createTextNode('⚠ ' + error));
    btn.title = error;
    setTimeout(() => {
      btn.classList.remove('seats-aero-error');
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      btn.appendChild(createPlaneIcon(16));
      btn.appendChild(document.createTextNode(' Search on seats.aero'));
      btn.title = 'Search this route on seats.aero for award availability';
    }, 5000);
  }

  function handleGlobalButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const btn = document.getElementById(BUTTON_ID);

    // If dropdown is already open, dismiss it
    if (btn.querySelector('.seats-aero-dropdown')) {
      dismissDropdown();
      return;
    }

    const { legs, error } = extractGlobalParams();
    if (error) {
      showButtonError(btn, error);
      return;
    }

    // One-way: open directly, no dropdown
    if (legs.length === 1) {
      openSeatsAero([legs[0].url]);
      return;
    }

    // Round-trip / multi-city: show leg selector
    showLegDropdown(btn, legs);
  }

  // ─── Global button injection ─────────────────────────────────────

  function createGlobalButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'seats-aero-search-btn';
    btn.title = 'Search this route on seats.aero for award availability';
    btn.appendChild(createPlaneIcon(16));
    btn.appendChild(document.createTextNode(' Search on seats.aero'));
    btn.addEventListener('click', handleGlobalButtonClick);
    return btn;
  }

  function injectGlobalButton() {
    if (document.getElementById(BUTTON_ID)) return;

    // Strategy 1: Above the search form (role="search")
    // Stable, always visible, won't get clipped by the scrolling filter bar
    const searchForm = document.querySelector('[role="search"]');
    if (searchForm) {
      const btn = createGlobalButton();
      btn.style.margin = '0 0 8px auto';
      btn.style.display = 'flex';
      searchForm.parentElement.insertBefore(btn, searchForm);
      updateGlobalButtonState();
      return;
    }

    // Strategy 2: Above the first results heading
    const headings = document.querySelectorAll('h3');
    for (const h of headings) {
      if ((h.textContent || '').toLowerCase().includes('flights')) {
        const btn = createGlobalButton();
        btn.style.margin = '8px 24px';
        btn.style.display = 'flex';
        h.parentElement.insertBefore(btn, h);
        updateGlobalButtonState();
        return;
      }
    }
  }

  function updateGlobalButtonState() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    btn.disabled = false;
    btn.title = 'Search this route on seats.aero for award availability';
  }

  // ─── Main injection orchestrator ─────────────────────────────────

  function injectAll() {
    if (!contextValid && !isContextValid()) return;
    if (!isResultsPage()) return;
    injectGlobalButton();
    applySettingsToPage();
  }

  function removeAll() {
    dismissDropdown();
    const globalBtn = document.getElementById(BUTTON_ID);
    if (globalBtn) globalBtn.remove();
  }

  // ─── Page detection & SPA navigation ─────────────────────────────

  function isResultsPage() {
    if (location.href.includes(SEARCH_PATH)) return true;
    // Google Travel Explore navigates to /travel/flights?tfs=... (no /search)
    // which still shows flight results
    if (location.pathname === '/travel/flights' && new URL(location.href).searchParams.has('tfs')) return true;
    return false;
  }

  let lastUrl = location.href;
  let observer = null;

  function checkForNavigation() {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;

      if (isResultsPage()) {
        setTimeout(() => injectAll(), 800);
      } else {
        removeAll();
      }
    }
  }

  function setupMutationObserver() {
    if (observer) observer.disconnect();
    let debounceTimer = null;
    observer = new MutationObserver((mutations) => {
      if (!isResultsPage()) return;
      if (!contextValid && !isContextValid()) return;

      // Only react to mutations in relevant areas (flight results, filter bar)
      // Skip mutations from our own injected elements or irrelevant DOM regions
      let relevant = false;
      for (const mutation of mutations) {
        const target = mutation.target;
        if (target.closest?.('#' + BUTTON_ID)) continue;
        // Flight results list, filter bar, or input fields changed
        if (target.closest?.('li.pIav2d') ||
            target.closest?.('[role="main"]') ||
            target.closest?.('[role="combobox"]') ||
            target.querySelector?.('li.pIav2d') ||
            mutation.addedNodes.length > 0) {
          relevant = true;
          break;
        }
      }
      if (!relevant) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Only invalidate cache if inputs may have changed (not just new flight rows)
        const buttonsExist = document.getElementById(BUTTON_ID);
        if (!buttonsExist) {
    
          injectGlobalButton();
        }
        applySettingsToPage();
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Initialize ──────────────────────────────────────────────────

  function init() {
    loadSettings();
    if (isResultsPage()) {
      setTimeout(() => injectAll(), 1500);
    }
    const navIntervalId = setInterval(() => {
      if (!isContextValid()) { contextValid = false; clearInterval(navIntervalId); return; }
      checkForNavigation();
      // Retry injection if button is missing (e.g., h3 wasn't rendered on first attempt)
      if (isResultsPage() && !document.getElementById(BUTTON_ID)) {
        injectAll();
      }
    }, 1000);
    setupMutationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
