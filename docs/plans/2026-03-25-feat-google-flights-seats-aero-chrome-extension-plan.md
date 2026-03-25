---
title: "feat: Google Flights to seats.aero Chrome Extension"
type: feat
date: 2026-03-25
---

# Google Flights → seats.aero Chrome Extension

## Overview

A Chrome extension (Manifest V3) that injects a "Search on seats.aero" button into Google Flights search results pages. Clicking the button extracts flight search parameters from the page and opens seats.aero in a new tab with those filters pre-filled. No API key required — pure URL construction. Assumes user is logged into seats.aero (Pro recommended).

## Problem Statement / Motivation

Points/miles travelers frequently search flights on Google Flights, then manually re-enter the same search criteria on seats.aero to check award availability. This is tedious and error-prone — especially with multiple airports, specific dates, and cabin classes. A one-click bridge between the two sites saves time and reduces friction.

## Proposed Solution

### Architecture

```
┌─────────────────────────────────────┐
│  Google Flights Results Page        │
│                                     │
│  ┌──────────────────────────────┐   │
│  │ Content Script (content.js)  │   │
│  │                              │   │
│  │ 1. Detect results page       │   │
│  │ 2. Inject button into DOM    │   │
│  │ 3. On click: extract params  │   │
│  │ 4. Send message to bg worker │   │
│  └──────────┬───────────────────┘   │
│             │ chrome.runtime        │
│             │ .sendMessage()        │
└─────────────┼───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  Background Service Worker (bg.js)  │
│                                     │
│  1. Receive params                  │
│  2. Construct seats.aero URL(s)     │
│  3. chrome.tabs.create() new tab(s) │
│    (bypasses popup blocker)         │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│  seats.aero (new tab)              │
│  Pre-filled search results          │
└─────────────────────────────────────┘
```

### Why content script → background service worker?

Opening tabs from a content script via `window.open()` triggers the browser's popup blocker (especially for round-trip which opens 2 tabs). Using `chrome.runtime.sendMessage` to delegate tab creation to the background service worker bypasses this reliably.

## Technical Approach

### Phase 1: Project Setup & Manifest

**Files to create:**

- `manifest.json` — Extension manifest (Manifest V3)
- `content.js` — Content script injected into Google Flights
- `background.js` — Service worker for tab creation
- `styles.css` — Button styling
- `icons/` — Extension icons (16, 48, 128px)
- `airlines.js` — Airline name → IATA code lookup table

**manifest.json spec:**

```json
{
  "manifest_version": 3,
  "name": "Seats.aero for Google Flights",
  "version": "1.0.0",
  "description": "Search award flight availability on seats.aero directly from Google Flights",
  "permissions": ["activeTab"],
  "host_permissions": [
    "*://www.google.com/travel/flights/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["*://www.google.com/travel/flights/*"],
      "js": ["airlines.js", "content.js"],
      "css": ["styles.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Permissions rationale:**
- `activeTab` — needed for content script to interact with the page
- Host permissions scoped to `google.com/travel/flights/*` only — minimal footprint
- No `tabs` permission needed — `chrome.tabs.create()` from background worker only needs the URL

### Phase 2: Page Detection & SPA Navigation

Google Flights is a Single Page Application — the page doesn't reload when the user changes search parameters or navigates between home/results/explore views.

**Strategy: URL polling + MutationObserver**

```
content.js:
1. On initial load, check if on results page (URL contains /travel/flights/search)
2. Start a setInterval (every 1 second) watching location.href for changes
3. When URL changes to a results page → inject button (if not already present)
4. When URL changes away from results → remove button
5. Use MutationObserver on the results container to detect DOM re-renders that
   remove the button → re-inject
```

**Page detection logic:**
- Results page: `location.href` includes `/travel/flights/search`
- Home page: `/travel/flights` without `/search` — do NOT inject
- Explore page: `/travel/flights/explore` — do NOT inject
- Multi-city: detect via trip-type dropdown text — show disabled button with tooltip

**Duplicate prevention:**
- Before injecting, check for existing button by ID: `document.getElementById('seats-aero-btn')`

### Phase 3: DOM Extraction

Extract flight parameters using aria-label selectors (most stable) with fallbacks.

#### Extraction Map

| Parameter | Primary Selector | Fallback | Output |
|---|---|---|---|
| **Origin** | `input[aria-label="Where from?"]` value | Parse from flight row airport codes (`.QylvBf` first child) | IATA code(s) or metro code |
| **Destination** | `input[aria-label="Where to?"]` value (may include IATA, e.g., "Seattle SEA") | Parse from flight row airport codes | IATA code(s) or metro code |
| **Departure date** | `input[aria-label="Departure"]` value (e.g., "Fri, Apr 3") | Parse from page title or URL | `YYYY-MM-DD` |
| **Return date** | `input[aria-label="Return"]` value | Only present for round-trip | `YYYY-MM-DD` |
| **Trip type** | Element with `aria-label` containing "Change ticket type" — read text content | Check for presence of return date field | `one-way` / `round-trip` / `multi-city` |
| **Cabin class** | Element with `aria-label` containing "Change seating class" — read text content | Default to `economy` | `economy` / `premium` / `business` / `first` |
| **Stops filter** | Check if "Nonstop" text appears in the Stops filter button | Default to not set | `direct_only=true` or omit |
| **Airline filter** | Check Airlines filter for selected airlines | Default to not set | `op_carriers=UA,DL` or omit |
| **Passenger count** | Button with aria-label matching "passenger" — extract number | Default to 1 | Integer |

#### City/Airport Resolution

When the origin/destination field shows a city name (e.g., "New York"), we need to resolve it to airport codes.

**Strategy (ordered):**

1. **Check if field contains IATA code** — e.g., "Seattle SEA" → extract `SEA`
2. **Check metro code lookup** — e.g., "New York" → `NYC`, "London" → `LON`, "Chicago" → `CHI`, "Washington" → `WAS`, "Tokyo" → `TYO`, "Paris" → `PAR`
3. **Extract from flight result rows** — collect unique origin airport codes from all visible flight results (e.g., EWR, JFK, LGA) and pass as comma-separated list
4. **Last resort** — use the city name text and let seats.aero handle it (it won't, so this effectively fails gracefully)

**Metro code lookup table** (bundled in `content.js`):

```javascript
const METRO_CODES = {
  'New York': 'NYC', 'London': 'LON', 'Chicago': 'CHI',
  'Washington': 'WAS', 'Tokyo': 'TYO', 'Paris': 'PAR',
  'Los Angeles': 'LAX', 'San Francisco': 'SFO', 'Miami': 'MIA',
  'Dallas': 'DFW', 'Houston': 'IAH', 'Toronto': 'YTO',
  'São Paulo': 'SAO', 'Buenos Aires': 'BUE', 'Seoul': 'SEL',
  'Shanghai': 'SHA', 'Beijing': 'BJS', 'Bangkok': 'BKK',
  'Singapore': 'SIN', 'Hong Kong': 'HKG', 'Dubai': 'DXB',
  'Istanbul': 'IST', 'Milan': 'MIL', 'Rome': 'ROM',
  'Stockholm': 'STO', 'Oslo': 'OSL', 'Melbourne': 'MEL',
  'Sydney': 'SYD', 'Montreal': 'YMQ', 'Detroit': 'DTT',
  'Minneapolis': 'MSP', 'Atlanta': 'ATL', 'Denver': 'DEN',
  'Seattle': 'SEA', 'Boston': 'BOS', 'Philadelphia': 'PHL',
  // ... extend as needed
};
```

#### Date Parsing

Google Flights date field shows: `"Fri, Apr 3"` (no year).

**Parsing logic:**
1. Extract month and day from the text (e.g., "Apr 3")
2. Determine year: if the month/day is in the past relative to today, assume next year; otherwise current year
3. Format as `YYYY-MM-DD`

#### Cabin Class Mapping

| Google Flights Text | seats.aero Value |
|---|---|
| "Economy (include Basic)" or "Economy" | `economy` |
| "Premium economy" | `premium` |
| "Business" | `business` |
| "First" | `first` |

#### Airline Name → IATA Code Mapping

Bundled in `airlines.js` — top ~100 airlines:

```javascript
const AIRLINE_CODES = {
  'United': 'UA', 'United Airlines': 'UA',
  'Delta': 'DL', 'Delta Air Lines': 'DL',
  'American': 'AA', 'American Airlines': 'AA',
  'Alaska': 'AS', 'Alaska Airlines': 'AS',
  'Southwest': 'WN', 'Southwest Airlines': 'WN',
  'JetBlue': 'B6', 'JetBlue Airways': 'B6',
  'Hawaiian': 'HA', 'Hawaiian Airlines': 'HA',
  'Spirit': 'NK', 'Spirit Airlines': 'NK',
  'Frontier': 'F9', 'Frontier Airlines': 'F9',
  'British Airways': 'BA',
  'Lufthansa': 'LH',
  'Air France': 'AF',
  'KLM': 'KL',
  'Emirates': 'EK',
  'Qatar Airways': 'QR',
  'Singapore Airlines': 'SQ',
  'Cathay Pacific': 'CX',
  'ANA': 'NH', 'All Nippon Airways': 'NH',
  'JAL': 'JL', 'Japan Airlines': 'JL',
  'Korean Air': 'KE',
  'Turkish Airlines': 'TK',
  'Etihad': 'EY', 'Etihad Airways': 'EY',
  'Qantas': 'QF',
  'Air Canada': 'AC',
  'LATAM': 'LA', 'LATAM Airlines': 'LA',
  'Avianca': 'AV',
  'Copa Airlines': 'CM',
  'Aer Lingus': 'EI',
  'Iberia': 'IB',
  'Finnair': 'AY',
  'SAS': 'SK', 'Scandinavian Airlines': 'SK',
  'Swiss': 'LX', 'SWISS': 'LX',
  'Austrian': 'OS', 'Austrian Airlines': 'OS',
  'TAP Portugal': 'TP', 'TAP Air Portugal': 'TP',
  'Virgin Atlantic': 'VS',
  'Air New Zealand': 'NZ',
  'South African Airways': 'SA',
  'Ethiopian Airlines': 'ET',
  'Royal Air Maroc': 'AT',
  'Saudia': 'SV',
  'Gulf Air': 'GF',
  'WestJet': 'WS',
  'Condor': 'DE',
  'Sun Country': 'SY', 'Sun Country Airlines': 'SY',
  'Volaris': 'Y4',
  // ... extend as needed
};
```

If an airline name is not found in the lookup, omit `op_carriers` for that airline (graceful degradation).

### Phase 4: URL Construction

```javascript
function buildSeatsAeroUrl(params) {
  const url = new URL('https://seats.aero/search');

  // Required params
  url.searchParams.set('origins', params.origins);        // e.g., "NYC" or "JFK,EWR,LGA"
  url.searchParams.set('destinations', params.destinations); // e.g., "SEA"
  url.searchParams.set('date', params.date);               // e.g., "2026-04-03"

  // Cabin class (default: any)
  if (params.cabin && params.cabin !== 'any') {
    url.searchParams.set('applicable_cabin', params.cabin);
  }

  // Nonstop only
  if (params.directOnly) {
    url.searchParams.set('direct_only', 'true');
  }

  // Airline filter
  if (params.airlines && params.airlines.length > 0) {
    url.searchParams.set('op_carriers', params.airlines.join(','));
  }

  // Passenger count
  if (params.passengers > 1) {
    url.searchParams.set('min_seats', params.passengers.toString());
  }

  // Smart defaults: flexible dates ±3 days
  url.searchParams.set('additional_days', 'true');
  url.searchParams.set('additional_days_num', '3');

  return url.toString();
}
```

### Phase 5: Button Injection & Styling

**Injection point:** After the filter bar, before the results. Look for the filter bar container and append the button as a sibling or within the last filter element.

**Strategy for finding injection point:**
1. Look for the "All filters" button by aria-label
2. Navigate to its parent container
3. Append the seats.aero button at the end of that container

**Button HTML:**

```html
<button id="seats-aero-btn" class="seats-aero-search-btn" title="Search this route on seats.aero for award availability">
  <svg><!-- small airplane or external link icon --></svg>
  Search on seats.aero
</button>
```

**Button CSS (`styles.css`):**

```css
.seats-aero-search-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin-left: 8px;
  border: none;
  border-radius: 20px;
  background-color: #1a73e8;  /* Google's blue, blends with the page */
  color: white;
  font-family: 'Google Sans', Roboto, Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.seats-aero-search-btn:hover {
  background-color: #1557b0;
}

.seats-aero-search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.seats-aero-search-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}
```

### Phase 6: Background Service Worker

```javascript
// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openSeatsAero') {
    const { urls } = message;
    urls.forEach(url => {
      chrome.tabs.create({ url, active: false });
    });
    // Activate the first tab
    if (urls.length > 0) {
      chrome.tabs.create({ url: urls[0], active: true });
    }
    sendResponse({ success: true });
  }
  return true; // async response
});
```

*Note: For round-trip, `urls` will contain 2 URLs (outbound + return). Both tabs open without popup blocker issues since they originate from the extension's background worker.*

### Phase 7: Error Handling

| Scenario | Behavior |
|---|---|
| Required field (origin/dest/date) extraction fails | Button shows error state (red outline), tooltip explains: "Could not extract flight info. Try refreshing the page." |
| Optional field (cabin/airlines/stops) extraction fails | Omit from URL, proceed with seats.aero defaults |
| Multi-city trip type detected | Button disabled with tooltip: "Multi-city searches are not supported" |
| No flight results on page (home/explore) | Button not injected |
| Button removed by DOM re-render | MutationObserver re-injects it |

## File Structure

```
google-flight-seats-aero-extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── content.js             # Content script: detection, extraction, button injection
├── background.js          # Service worker: tab creation
├── airlines.js            # Airline name → IATA code lookup
├── styles.css             # Button styling
├── icons/
│   ├── icon16.png         # Toolbar icon
│   ├── icon48.png         # Extensions page icon
│   └── icon128.png        # Chrome Web Store icon
└── docs/
    ├── brainstorms/       # Brainstorm documents
    └── plans/             # This plan
```

## Acceptance Criteria

### Functional Requirements

- [ ] Extension activates only on Google Flights results pages (`/travel/flights/search`)
- [ ] Button appears near the filter bar on results pages
- [ ] Button does NOT appear on home page, explore page, or non-results pages
- [ ] Clicking the button opens seats.aero in a new tab with correct filters
- [ ] Origin extracted correctly (metro code or individual IATA codes)
- [ ] Destination extracted correctly
- [ ] Date extracted and formatted as YYYY-MM-DD
- [ ] Cabin class mapped correctly (economy/premium/business/first)
- [ ] Nonstop filter mapped to `direct_only=true` when active
- [ ] Airline filter mapped to `op_carriers` with IATA codes when active
- [ ] Passenger count mapped to `min_seats` when > 1
- [ ] Round-trip opens 2 tabs (outbound + return) without popup blocker
- [ ] Flexible dates default: `additional_days=true&additional_days_num=3`
- [ ] Button persists across SPA navigation and DOM re-renders
- [ ] No duplicate buttons injected
- [ ] Multi-city searches show disabled button with tooltip

### Non-Functional Requirements

- [ ] Uses Manifest V3 (required for new Chrome extensions)
- [ ] Minimal permissions (only `activeTab` + Google Flights host)
- [ ] No external API calls or network requests from the extension
- [ ] Works on google.com (English locale, v1 scope)
- [ ] Button styling blends with Google Flights UI

### Quality Gates

- [ ] Manual test: one-way economy search (NYC → SEA)
- [ ] Manual test: round-trip business search (JFK → LHR)
- [ ] Manual test: nonstop + airline filter active
- [ ] Manual test: navigate from home → results → modify search (SPA test)
- [ ] Manual test: passenger count > 1

## Known Limitations (v1)

- English locale only (`google.com`)
- Multi-city not supported
- Alliance-level airline filters not mapped (only individual airlines)
- Google Flights CSS classes may change — aria-label selectors are more stable but not guaranteed
- `additional_days` always on (user can adjust on seats.aero)
- No extension options/settings page
- Children/infants counted toward `min_seats` (may over-count needed award seats)

## Future Considerations (v2)

- Per-flight "Search on seats.aero" button on each flight result row
- Extension popup/options page for user preferences
- Support for non-English locales
- Support for multi-city (open N tabs)
- City-to-metro-code mapping expansion
- Integration with seats.aero API for inline availability preview

## References & Research

- [Brainstorm document](../brainstorms/2026-03-25-google-flights-seats-aero-extension-brainstorm.md)
- seats.aero search URL format: `https://seats.aero/search?origins=X&destinations=Y&date=YYYY-MM-DD&applicable_cabin=Z`
- seats.aero URL parameters: `origins`, `destinations`, `date`, `applicable_cabin`, `direct_only`, `op_carriers`, `min_seats`, `additional_days`, `additional_days_num`, `max_fees`, `show_individual`, `sources`
- Google Flights DOM: aria-label selectors preferred over obfuscated CSS classes
- Google Flights is a SPA — requires URL polling + MutationObserver for page detection
