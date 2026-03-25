---
date: 2026-03-25
topic: google-flights-seats-aero-chrome-extension
---

# Google Flights → seats.aero Chrome Extension

## What We're Building

A Chrome extension that adds a "Search on seats.aero" button to Google Flights results pages. When clicked, it extracts flight search parameters (origin, destination, date, cabin class, stops, airlines) from the Google Flights page and opens seats.aero in a new tab with those filters pre-filled. No API key needed — just URL construction. Assumes user is logged into seats.aero Pro.

## Why This Approach

- Pure URL construction is the simplest approach — no API keys, no authentication, no background requests
- seats.aero's search URL accepts all key parameters as query strings and normalizes them automatically
- Google Flights exposes enough data in the DOM (via aria-labels and flight result rows) to extract the needed info
- Pro account assumed: all filters available, no 60-day search limit

## Filter Mapping (Google Flights → seats.aero)

### Mapped Filters
| Google Flights | seats.aero Parameter | Notes |
|---|---|---|
| Origin (city) | `origins=` | Use metro codes (NYC) or individual IATA codes (JFK,EWR,LGA) from flight rows |
| Destination (city) | `destinations=` | Extract IATA codes from flight rows |
| Departure date | `date=YYYY-MM-DD` | Parse from date input |
| Cabin class | `applicable_cabin=economy\|premium\|business\|first` | Direct mapping |
| Stops: Nonstop only | `direct_only=true` | Only "Nonstop only" maps; "1 stop or fewer" has no equivalent |
| Airlines (specific) | `op_carriers=UA,DL` | Map airline names to IATA codes |
| Passengers (adults) | `min_seats=N` | Map adult count |
| Trip type: Round-trip | Open 2 tabs (outbound + return) | seats.aero is one-way only |

### Skipped Filters (no seats.aero equivalent)
- Bags
- Price (cash-based, irrelevant for points)
- Times (departure/arrival windows)
- Emissions
- Connecting airports
- Duration

### Smart Defaults Added by Extension
- `additional_days=true&additional_days_num=3` — flexible dates since award availability is spotty
- `min_seats=1` — auto-added by seats.aero anyway

## Key Decisions

- **Global button first, per-flight buttons as stretch goal**: One button near the filter bar extracts page-level search params. Per-flight buttons (v2) would pass specific airport pairs and airlines per row.
- **Aria-label selectors preferred over CSS classes**: Google Flights obfuscates class names and changes them frequently. Aria-labels like `[aria-label="Where from?"]` are more stable.
- **Fallback: accessible link text**: Each flight row's `<a>` tag has a comprehensive text description that can be parsed as a fallback.
- **Metro codes supported**: seats.aero accepts `NYC`, `LON`, etc. — can use these when Google Flights shows city-level searches.
- **No API key in extension settings**: Originally planned API key storage, but not needed since we're just opening URLs.
- **Manifest V3**: Modern Chrome extension standard.

## URL Construction Examples

Economy, NYC to SEA:
```
https://seats.aero/search?origins=NYC&destinations=SEA&date=2026-04-03&applicable_cabin=economy
```

Business, nonstop, United only:
```
https://seats.aero/search?origins=EWR&destinations=SEA&date=2026-04-03&applicable_cabin=business&direct_only=true&op_carriers=UA
```

First class, flexible dates:
```
https://seats.aero/search?origins=JFK,EWR,LGA&destinations=NRT&date=2026-05-01&applicable_cabin=first&additional_days=true&additional_days_num=7
```

Round-trip (two tabs):
```
Tab 1: https://seats.aero/search?origins=NYC&destinations=SEA&date=2026-04-03&applicable_cabin=economy
Tab 2: https://seats.aero/search?origins=SEA&destinations=NYC&date=2026-04-10&applicable_cabin=economy
```

## Open Questions
- Should flexible dates be on by default, or match Google Flights' exact date?
- For per-flight buttons (v2), should we also pass the specific airline as `op_carriers`?
- City-to-airport-code mapping: use metro codes when available, or always extract individual IATA codes from flight rows?

## Next Steps
→ `/workflows:plan` for implementation details
