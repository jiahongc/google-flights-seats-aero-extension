// Content script — injected into Google Flights pages.
// Detects search results, injects seats.aero buttons (global + per-flight),
// extracts flight parameters, and opens seats.aero in a new tab.

(() => {
  'use strict';

  const BUTTON_ID = 'seats-aero-btn';
  const FLIGHT_BTN_CLASS = 'seats-aero-flight-btn';
  const FLIGHT_BTN_CONTAINER_CLASS = 'seats-aero-flight-btn-container';
  const SEARCH_PATH = '/travel/flights/search';

  // Default settings — synced with popup.js
  let settings = {
    globalButton: true,
    perFlightButtons: true,
    flexibleDays: false,
  };

  // Load settings from storage
  function loadSettings() {
    chrome.storage.sync.get(settings, (saved) => {
      settings = { ...settings, ...saved };
      applySettingsToPage();
    });
  }

  // Listen for settings changes from popup
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue;
    }
    applySettingsToPage();
  });

  // Apply visibility classes based on settings
  function applySettingsToPage() {
    document.body.classList.toggle('seats-aero-hide-global', !settings.globalButton);
    document.body.classList.toggle('seats-aero-hide-per-flight', !settings.perFlightButtons);
  }

  // ─── Metro codes ─────────────────────────────────────────────────

  const METRO_CODES = {
    'new york': 'NYC', 'london': 'LON', 'chicago': 'CHI',
    'washington': 'WAS', 'tokyo': 'TYO', 'paris': 'PAR',
    'los angeles': 'LAX', 'san francisco': 'SFO', 'miami': 'MIA',
    'dallas': 'DFW', 'houston': 'IAH', 'toronto': 'YTO',
    'são paulo': 'SAO', 'sao paulo': 'SAO', 'buenos aires': 'BUE',
    'seoul': 'SEL', 'shanghai': 'SHA', 'beijing': 'BJS',
    'bangkok': 'BKK', 'singapore': 'SIN', 'hong kong': 'HKG',
    'dubai': 'DXB', 'istanbul': 'IST', 'milan': 'MIL', 'rome': 'ROM',
    'stockholm': 'STO', 'oslo': 'OSL', 'melbourne': 'MEL',
    'sydney': 'SYD', 'montreal': 'YMQ', 'detroit': 'DTT',
    'minneapolis': 'MSP', 'atlanta': 'ATL', 'denver': 'DEN',
    'seattle': 'SEA', 'boston': 'BOS', 'philadelphia': 'PHL',
    'phoenix': 'PHX', 'las vegas': 'LAS', 'orlando': 'MCO',
    'portland': 'PDX', 'honolulu': 'HNL', 'anchorage': 'ANC',
    'salt lake city': 'SLC', 'charlotte': 'CLT', 'nashville': 'BNA',
    'austin': 'AUS', 'san diego': 'SAN', 'tampa': 'TPA',
    'raleigh': 'RDU', 'columbus': 'CMH', 'indianapolis': 'IND',
    'kansas city': 'MCI', 'cleveland': 'CLE', 'cincinnati': 'CVG',
    'pittsburgh': 'PIT', 'st. louis': 'STL', 'baltimore': 'BWI',
    'mumbai': 'BOM', 'delhi': 'DEL', 'taipei': 'TPE',
    'osaka': 'OSA', 'frankfurt': 'FRA', 'munich': 'MUC',
    'amsterdam': 'AMS', 'madrid': 'MAD', 'barcelona': 'BCN',
    'lisbon': 'LIS', 'dublin': 'DUB', 'zurich': 'ZRH',
    'vienna': 'VIE', 'copenhagen': 'CPH', 'helsinki': 'HEL',
    'brussels': 'BRU', 'athens': 'ATH', 'prague': 'PRG',
    'warsaw': 'WAW', 'budapest': 'BUD',
    'mexico city': 'MEX', 'cancun': 'CUN', 'cancún': 'CUN',
    'bogota': 'BOG', 'bogotá': 'BOG',
    'lima': 'LIM', 'santiago': 'SCL',
    'johannesburg': 'JNB', 'cape town': 'CPT', 'cairo': 'CAI',
    'nairobi': 'NBO', 'lagos': 'LOS',
    'doha': 'DOH', 'abu dhabi': 'AUH', 'riyadh': 'RUH',
    'kuala lumpur': 'KUL', 'jakarta': 'CGK', 'manila': 'MNL',
    'ho chi minh city': 'SGN', 'hanoi': 'HAN',
    'auckland': 'AKL', 'perth': 'PER', 'brisbane': 'BNE',
    // Single-airport cities (not metro codes, but common Google Flights origins)
    'newark': 'EWR', 'laguardia': 'LGA',
    'oakland': 'OAK', 'san jose': 'SJC', 'burbank': 'BUR',
    'long beach': 'LGB', 'ontario': 'ONT', 'fort lauderdale': 'FLL',
    'midway': 'MDW', 'dulles': 'IAD', 'reagan': 'DCA',
    'ronald reagan': 'DCA', 'love field': 'DAL',
    'hobby': 'HOU', 'john wayne': 'SNA', 'santa ana': 'SNA',
    // Additional international cities
    'vancouver': 'YVR', 'calgary': 'YYC', 'edmonton': 'YEG', 'ottawa': 'YOW',
    'reykjavik': 'KEF', 'edinburgh': 'EDI', 'manchester': 'MAN', 'glasgow': 'GLA',
    'venice': 'VCE', 'florence': 'FLR', 'nice': 'NCE', 'lyon': 'LYS',
    'berlin': 'BER', 'hamburg': 'HAM', 'düsseldorf': 'DUS', 'dusseldorf': 'DUS',
    'porto': 'OPO', 'seville': 'SVQ', 'malaga': 'AGP',
    'krakow': 'KRK', 'bucharest': 'OTP', 'belgrade': 'BEG', 'zagreb': 'ZAG',
    'phuket': 'HKT', 'bali': 'DPS', 'denpasar': 'DPS',
    'chiang mai': 'CNX', 'cebu': 'CEB', 'colombo': 'CMB',
    'marrakech': 'RAK', 'casablanca': 'CMN', 'addis ababa': 'ADD',
    'dar es salaam': 'DAR', 'accra': 'ACC',
    'maldives': 'MLE', 'male': 'MLE', 'malé': 'MLE',
    'fiji': 'NAN', 'nadi': 'NAN', 'tahiti': 'PPT',
    'panama city': 'PTY', 'san juan': 'SJU', 'havana': 'HAV',
    'cartagena': 'CTG', 'medellin': 'MDE', 'medellín': 'MDE',
    'quito': 'UIO', 'guayaquil': 'GYE', 'montevideo': 'MVD',
    'tel aviv': 'TLV', 'amman': 'AMM', 'muscat': 'MCT', 'bahrain': 'BAH',
    'new delhi': 'DEL', 'bangalore': 'BLR', 'chennai': 'MAA', 'hyderabad': 'HYD',
    'kolkata': 'CCU', 'ahmedabad': 'AMD', 'pune': 'PNQ', 'goa': 'GOI',
    'guangzhou': 'CAN', 'shenzhen': 'SZX', 'chengdu': 'CTU', 'hangzhou': 'HGH',
    'kyoto': 'KIX', 'nagoya': 'NGO', 'sapporo': 'CTS', 'fukuoka': 'FUK',
    'busan': 'PUS', 'jeju': 'CJU',
  };

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
        let container = input.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          // Search all child text nodes and spans for a 3-letter IATA code
          const allChildren = container.querySelectorAll('span, div');
          for (const child of allChildren) {
            const childText = child.textContent.trim();
            // Look for standalone IATA codes (exactly 3 uppercase letters)
            if (/^[A-Z]{3}$/.test(childText)) {
              // Found an IATA code near the input — return "CityName CODE"
              return inputVal + ' ' + childText;
            }
          }
          // Also check the container's direct text for "CityName CODE" pattern
          const containerText = container.textContent.trim();
          const iataInContext = containerText.match(new RegExp(
            inputVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+([A-Z]{3})', 'i'
          ));
          if (iataInContext) {
            return inputVal + ' ' + iataInContext[1].toUpperCase();
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

    // Check for explicit IATA code (uppercase 3 letters)
    const iataMatch = text.match(/\b([A-Z]{3})\b/);
    if (iataMatch) return iataMatch[1];

    // Case-insensitive trailing code (e.g., "Seattle Sea")
    const iataMatchCI = text.match(/\b([A-Za-z]{3})\s*$/);
    if (iataMatchCI) {
      const code = iataMatchCI[1].toUpperCase();
      const preceding = text.slice(0, iataMatchCI.index).trim();
      if (preceding.length > 0) return code;
    }

    // Metro code lookup
    const cleanText = text
      .replace(/\s*\(.*?\)/g, '')
      .replace(/\s*[A-Z]{3}\s*$/g, '')
      .replace(/\s*(All airports|Metropolitan Area|area|,.*$)/gi, '')
      .trim().toLowerCase();
    if (METRO_CODES[cleanText]) return METRO_CODES[cleanText];

    // Partial metro match
    for (const [city, code] of Object.entries(METRO_CODES)) {
      if (cleanText.includes(city) || city.includes(cleanText)) return code;
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
    const allElements = document.querySelectorAll('span, div');
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (/^[A-Z]{3}\s*[–\-]\s*[A-Z]{3}$/.test(text)) {
        const match = text.match(/([A-Z]{3})\s*[–\-]\s*([A-Z]{3})/);
        if (match) codes.add(isOrigin ? match[1] : match[2]);
      }
    }
    if (codes.size === 0) {
      const flightRows = document.querySelectorAll('li');
      for (const row of flightRows) {
        const text = row.textContent || '';
        const routeMatches = text.matchAll(/\b([A-Z]{3})\s*[–\-]\s*([A-Z]{3})\b/g);
        for (const m of routeMatches) codes.add(isOrigin ? m[1] : m[2]);
      }
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
    if (new Date(year, monthIndex, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) year++;
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function getTripType() {
    const el = document.querySelector('[aria-label*="ticket type"], [aria-label*="Trip type"]');
    if (el) {
      const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
      if (text.includes('round trip')) return 'round-trip';
      if (text.includes('multi-city') || text.includes('multi city')) return 'multi-city';
      if (text.includes('one way')) return 'one-way';
    }
    const returnInput = findInput('Return');
    return returnInput ? 'round-trip' : 'one-way';
  }

  function getCabinClass() {
    const selectors = [
      '[aria-label*="seating class"]', '[aria-label*="cabin"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
        if (text.includes('first')) return 'first';
        if (text.includes('business')) return 'business';
        if (text.includes('premium')) return 'premium';
        if (text.includes('economy')) return 'economy';
      }
    }
    // Check combobox divs
    const comboboxes = document.querySelectorAll('div[role="combobox"]');
    for (const cb of comboboxes) {
      const text = (cb.textContent || '').toLowerCase();
      if (text.includes('economy') || text.includes('business') || text.includes('first') || text.includes('premium')) {
        if (text.includes('first')) return 'first';
        if (text.includes('business')) return 'business';
        if (text.includes('premium')) return 'premium';
        return 'economy';
      }
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
    // Look for the Airlines filter button
    const allBtns = document.querySelectorAll('button, [role="button"]');

    for (const btn of allBtns) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').trim();

      // Skip if not the Airlines filter
      if (!label.includes('airlines') && text !== 'Airlines') continue;

      // Check if the filter is in default state (no selection)
      if (label.includes('not selected') || text === 'Airlines') continue;

      // Filter is active — try to extract airline names from the button area
      // When airlines are selected, Google Flights may show them as text
      const codes = [];

      // Strategy 1: Check the button text for airline names
      if (typeof AIRLINE_CODES !== 'undefined') {
        for (const [name, code] of Object.entries(AIRLINE_CODES)) {
          if (text.includes(name) && !codes.includes(code)) {
            codes.push(code);
          }
        }
      }

      if (codes.length > 0) return codes;

      // Strategy 2: Look for a nearby container with airline filter chips
      const parent = btn.closest('[role="listbox"]') || btn.parentElement?.parentElement;
      if (parent) {
        const chips = parent.querySelectorAll('[aria-selected="true"], [aria-checked="true"]');
        for (const chip of chips) {
          const chipText = chip.textContent.trim();
          if (typeof AIRLINE_CODES !== 'undefined' && AIRLINE_CODES[chipText]) {
            const code = AIRLINE_CODES[chipText];
            if (!codes.includes(code)) codes.push(code);
          }
        }
        if (codes.length > 0) return codes;
      }

      // Strategy 3: If the filter shows "Only" for one airline, the button text
      // changes to just that airline name
      if (text.length > 0 && text !== 'Airlines') {
        // The text might be a single airline name like "United" or "Delta"
        if (typeof AIRLINE_CODES !== 'undefined' && AIRLINE_CODES[text]) {
          return [AIRLINE_CODES[text]];
        }
      }
    }

    return [];
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
    chrome.runtime.sendMessage({ action: 'openSeatsAero', urls }, (response) => {
      if (chrome.runtime.lastError) {
        urls.forEach(url => window.open(url, '_blank'));
      }
    });
  }

  // ─── Global button (extract all page-level params) ───────────────

  function extractGlobalParams() {
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

    if (!origins) return { urls: [], error: 'Could not determine origin airport' };
    if (!destinations) return { urls: [], error: 'Could not determine destination airport' };
    if (!departureDate) return { urls: [], error: 'Could not determine departure date' };

    const tripType = getTripType();
    const cabin = getCabinClass();
    const directOnly = isNonstopFilterActive();
    const passengers = getPassengerCount();
    const flexDays = settings.flexibleDays ? 3 : 0;

    const airlines = getSelectedAirlines();
    const baseParams = { cabin, directOnly, airlines, passengers, flexibleDays: flexDays };
    const urls = [];

    urls.push(buildSeatsAeroUrl({ origins, destinations, date: departureDate, ...baseParams }));

    if (tripType === 'round-trip' && returnDateText) {
      const returnDate = parseDate(returnDateText);
      if (returnDate) {
        urls.push(buildSeatsAeroUrl({ origins: destinations, destinations: origins, date: returnDate, ...baseParams }));
      }
    }

    return { urls, error: null };
  }

  function handleGlobalButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const btn = document.getElementById(BUTTON_ID);
    const { urls, error } = extractGlobalParams();
    if (error) {
      // Show visible error on the button
      btn.classList.add('seats-aero-error');
      const originalContent = btn.textContent;
      // Clear and set error text using DOM (no innerHTML for Trusted Types)
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
      return;
    }
    openSeatsAero(urls);
  }

  // ─── Per-flight buttons ──────────────────────────────────────────

  /**
   * Extract flight-specific data from a flight row (li.pIav2d).
   * Returns { origin, dest, airline, airlineCode } or null.
   */
  function extractFlightData(li) {
    const spans = li.querySelectorAll('span');
    let origin = '', dest = '';
    const airportCodes = [];

    // Get IATA codes from spans showing exactly 3 uppercase letters
    for (const span of spans) {
      const t = span.textContent.trim();
      if (/^[A-Z]{3}$/.test(t)) airportCodes.push(t);
    }

    // First two unique codes are typically origin and destination
    if (airportCodes.length >= 2) {
      origin = airportCodes[0];
      // Find first code that differs from origin
      for (let i = 1; i < airportCodes.length; i++) {
        if (airportCodes[i] !== origin) { dest = airportCodes[i]; break; }
      }
    }

    if (!origin || !dest) return null;

    // Extract airline name — look for known airline names in spans
    let airline = '';
    let airlineCode = '';
    for (const span of spans) {
      const t = span.textContent.trim();
      // Check against our airline lookup
      if (typeof AIRLINE_CODES !== 'undefined' && AIRLINE_CODES[t]) {
        airline = t;
        airlineCode = AIRLINE_CODES[t];
        break;
      }
      // Also handle codeshare format "Alaska · Hawaiian" — take the first airline
      if (t.includes('·')) {
        const firstAirline = t.split('·')[0].trim();
        if (typeof AIRLINE_CODES !== 'undefined' && AIRLINE_CODES[firstAirline]) {
          airline = firstAirline;
          airlineCode = AIRLINE_CODES[firstAirline];
          break;
        }
      }
    }

    // Fallback: try matching any known airline name in the full row text
    if (!airline && typeof AIRLINE_CODES !== 'undefined') {
      const rowText = li.textContent || '';
      for (const [name, code] of Object.entries(AIRLINE_CODES)) {
        if (rowText.includes(name)) {
          airline = name;
          airlineCode = code;
          break;
        }
      }
    }

    // Check if this flight is nonstop
    let isNonstop = false;
    for (const span of spans) {
      if (span.textContent.trim() === 'Nonstop') { isNonstop = true; break; }
    }

    return { origin, dest, airline, airlineCode, isNonstop };
  }

  /**
   * Create a per-flight seats.aero button for a specific flight row.
   */
  function createFlightButton(flightData) {
    const btn = document.createElement('button');
    btn.className = FLIGHT_BTN_CLASS;

    const airlineLabel = flightData.airline || '';
    const routeLabel = `${flightData.origin}→${flightData.dest}`;
    const nonstopLabel = flightData.isNonstop ? ' nonstop' : '';
    btn.title = `Search ${routeLabel}${airlineLabel ? ' (' + airlineLabel + ')' : ''}${nonstopLabel} on seats.aero`;
    btn.appendChild(createPlaneIcon(10));
    const label = document.createElement('span');
    label.textContent = 'Points';
    btn.appendChild(label);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleFlightButtonClick(flightData, btn);
    });

    return btn;
  }

  function handleFlightButtonClick(flightData, btn) {
    // Get shared params from the page
    const departureDateText = getFieldValue('Departure');
    const departureDate = parseDate(departureDateText);

    if (!departureDate) {
      btn.classList.add('seats-aero-error');
      setTimeout(() => btn.classList.remove('seats-aero-error'), 3000);
      return;
    }

    const cabin = getCabinClass();
    const passengers = getPassengerCount();
    const flexDays = settings.flexibleDays ? 3 : 0;

    const params = {
      origins: flightData.origin,
      destinations: flightData.dest,
      date: departureDate,
      cabin,
      directOnly: flightData.isNonstop,
      airlines: flightData.airlineCode ? [flightData.airlineCode] : [],
      passengers,
      flexibleDays: flexDays,
      showIndividual: true,
    };

    const url = buildSeatsAeroUrl(params);
    openSeatsAero([url]);
  }

  /**
   * Inject per-flight buttons into all visible flight result rows.
   */
  function injectPerFlightButtons() {
    const flightRows = document.querySelectorAll('li.pIav2d');

    for (const li of flightRows) {
      // Skip if already has a button
      if (li.querySelector('.' + FLIGHT_BTN_CLASS)) continue;

      const flightData = extractFlightData(li);
      if (!flightData) continue;

      const btn = createFlightButton(flightData);

      // Inject inside the chevron/expand container (vJccne class)
      // This area sits at the far right of each flight row
      const expandBtn = li.querySelector('button[aria-label*="Flight details"]');
      if (expandBtn) {
        const chevronContainer = expandBtn.closest('.vJccne') || expandBtn.parentElement?.parentElement;
        if (chevronContainer) {
          // Make it a flex column so the Points button stacks above the chevron
          chevronContainer.style.display = 'flex';
          chevronContainer.style.flexDirection = 'column';
          chevronContainer.style.alignItems = 'center';
          chevronContainer.style.justifyContent = 'center';
          chevronContainer.style.gap = '4px';
          chevronContainer.insertBefore(btn, chevronContainer.firstChild);
          continue;
        }
      }

      // Fallback: append to the first div child
      const mainDiv = li.querySelector(':scope > div');
      if (mainDiv) {
        mainDiv.appendChild(btn);
      }
    }
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

    // Strategy 1: Next to "All filters" button
    const allFiltersBtn = document.querySelector('[aria-label*="All filters"]');
    if (allFiltersBtn) {
      const filterBar = allFiltersBtn.parentElement;
      if (filterBar) {
        filterBar.appendChild(createGlobalButton());
        updateGlobalButtonState();
        return;
      }
    }

    // Strategy 2: Near filter buttons (Stops, Airlines, etc.)
    const allButtons = document.querySelectorAll('button');
    for (const fb of allButtons) {
      const text = fb.textContent.trim();
      if (text === 'Stops' || text === 'Airlines' || text === 'Duration') {
        const container = fb.parentElement;
        if (container && !container.querySelector(`#${BUTTON_ID}`)) {
          container.parentElement.appendChild(createGlobalButton());
          updateGlobalButtonState();
          return;
        }
      }
    }

    // Strategy 3: Above results heading
    const headings = document.querySelectorAll('h3');
    for (const h of headings) {
      if ((h.textContent || '').includes('flights')) {
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
    const tripType = getTripType();
    if (tripType === 'multi-city') {
      btn.disabled = true;
      btn.title = 'Multi-city searches are not supported on seats.aero';
    }
  }

  // ─── Main injection orchestrator ─────────────────────────────────

  function injectAll() {
    if (!isResultsPage()) return;
    injectGlobalButton();
    injectPerFlightButtons();
    applySettingsToPage();
  }

  function removeAll() {
    const globalBtn = document.getElementById(BUTTON_ID);
    if (globalBtn) globalBtn.remove();
    document.querySelectorAll('.' + FLIGHT_BTN_CLASS).forEach(el => el.remove());
  }

  // ─── Page detection & SPA navigation ─────────────────────────────

  function isResultsPage() {
    return location.href.includes(SEARCH_PATH);
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
    observer = new MutationObserver(() => {
      if (!isResultsPage()) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        // Re-inject global button if removed
        if (!document.getElementById(BUTTON_ID)) injectGlobalButton();
        // Inject per-flight buttons on any new flight rows
        injectPerFlightButtons();
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
    setInterval(checkForNavigation, 1000);
    setupMutationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
